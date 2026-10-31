//! Provider adapters for Ollama (native API) and Docker Model Runner
//! (OpenAI-compatible API). Both stream tokens into a Tauri IPC Channel.

use crate::models::*;
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;

fn trim(url: &str) -> &str {
    url.trim_end_matches('/')
}

pub async fn list_models(client: &reqwest::Client, kind: ProviderKind, base: &str) -> AppResult<Vec<ModelInfo>> {
    match kind {
        ProviderKind::Ollama => {
            let v: Value = client.get(format!("{}/api/tags", trim(base))).send().await?.error_for_status()?.json().await?;
            Ok(parse_ollama_tags(&v))
        }
        ProviderKind::Docker => {
            let v: Value = client.get(format!("{}/models", trim(base))).send().await?.error_for_status()?.json().await?;
            Ok(parse_openai_models(&v))
        }
    }
}

pub fn parse_ollama_tags(v: &Value) -> Vec<ModelInfo> {
    v["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| {
                    let id = m["name"].as_str()?.to_string();
                    let d = &m["details"];
                    let details = [d["parameter_size"].as_str(), d["quantization_level"].as_str()]
                        .into_iter()
                        .flatten()
                        .collect::<Vec<_>>()
                        .join(" · ");
                    Some(ModelInfo {
                        id,
                        provider: ProviderKind::Ollama,
                        size_bytes: m["size"].as_u64(),
                        details: (!details.is_empty()).then_some(details),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn parse_openai_models(v: &Value) -> Vec<ModelInfo> {
    v["data"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| {
                    // Docker Model Runner adds a non-standard "dmr" object with metadata.
                    let d = &m["dmr"];
                    let details = [d["parameters"].as_str(), d["quantization"].as_str(), d["size"].as_str()]
                        .into_iter()
                        .flatten()
                        .collect::<Vec<_>>()
                        .join(" · ");
                    Some(ModelInfo {
                        id: m["id"].as_str()?.to_string(),
                        provider: ProviderKind::Docker,
                        size_bytes: None,
                        details: (!details.is_empty()).then_some(details),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

pub async fn check_health(client: &reqwest::Client, kind: ProviderKind, base: &str) -> HealthStatus {
    let res = tokio::time::timeout(Duration::from_secs(3), list_models(client, kind, base)).await;
    let (online, message) = match res {
        Ok(Ok(models)) => (true, Some(format!("{} model(s)", models.len()))),
        Ok(Err(e)) => (false, Some(e.to_string())),
        Err(_) => (false, Some("Timed out".into())),
    };
    HealthStatus { provider: kind, online, url: base.to_string(), message }
}

/// Parsed result of one line of a streaming response.
#[derive(Debug, PartialEq)]
pub enum LineEvent {
    Token(String),
    Done { tokens: Option<u64>, tokens_per_sec: Option<f64> },
    Skip,
}

pub fn parse_ollama_line(line: &str) -> LineEvent {
    let Ok(v) = serde_json::from_str::<Value>(line) else { return LineEvent::Skip };
    if v["done"].as_bool() == Some(true) {
        let tokens = v["eval_count"].as_u64();
        let tps = match (tokens, v["eval_duration"].as_u64()) {
            (Some(t), Some(ns)) if ns > 0 => Some(t as f64 / (ns as f64 / 1e9)),
            _ => None,
        };
        return LineEvent::Done { tokens, tokens_per_sec: tps };
    }
    match v["message"]["content"].as_str() {
        Some(s) if !s.is_empty() => LineEvent::Token(s.to_string()),
        _ => LineEvent::Skip,
    }
}

pub fn parse_sse_line(line: &str) -> LineEvent {
    let Some(data) = line.strip_prefix("data:").map(str::trim) else { return LineEvent::Skip };
    if data == "[DONE]" {
        return LineEvent::Done { tokens: None, tokens_per_sec: None };
    }
    let Ok(v) = serde_json::from_str::<Value>(data) else { return LineEvent::Skip };
    match v["choices"][0]["delta"]["content"].as_str() {
        Some(s) if !s.is_empty() => LineEvent::Token(s.to_string()),
        _ => LineEvent::Skip,
    }
}

pub async fn stream_chat(
    client: &reqwest::Client,
    base: &str,
    req: &ChatRequest,
    channel: &Channel<StreamChunk>,
    cancel: CancellationToken,
) -> AppResult<()> {
    let (url, body) = match req.provider {
        ProviderKind::Ollama => {
            let mut options = serde_json::Map::new();
            if let Some(t) = req.temperature { options.insert("temperature".into(), json!(t)); }
            if let Some(p) = req.top_p { options.insert("top_p".into(), json!(p)); }
            (
                format!("{}/api/chat", trim(base)),
                json!({ "model": req.model, "messages": req.messages, "stream": true, "options": options }),
            )
        }
        ProviderKind::Docker => (
            format!("{}/chat/completions", trim(base)),
            json!({
                "model": req.model, "messages": req.messages, "stream": true,
                "temperature": req.temperature, "top_p": req.top_p
            }),
        ),
    };

    let resp = client.post(url).json(&body).send().await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Other(format!("{status}: {text}")));
    }

    let started = Instant::now();
    let mut count: u64 = 0;
    let mut buf = String::new();
    let mut stream = resp.bytes_stream();
    let send = |c: StreamChunk| channel.send(c).map_err(|e| AppError::Other(e.to_string()));

    loop {
        let next = tokio::select! {
            _ = cancel.cancelled() => {
                // Dropping the stream closes the HTTP connection, which stops generation server-side.
                send(StreamChunk::Done { tokens: Some(count), tokens_per_sec: None, cancelled: true })?;
                return Ok(());
            }
            n = stream.next() => n,
        };
        let Some(bytes) = next else { break };
        buf.push_str(&String::from_utf8_lossy(&bytes?));

        while let Some(pos) = buf.find('\n') {
            let line: String = buf.drain(..=pos).collect();
            let line = line.trim();
            if line.is_empty() { continue; }
            let ev = match req.provider {
                ProviderKind::Ollama => parse_ollama_line(line),
                ProviderKind::Docker => parse_sse_line(line),
            };
            match ev {
                LineEvent::Token(t) => {
                    count += 1;
                    send(StreamChunk::Token { content: t })?;
                }
                LineEvent::Done { tokens, tokens_per_sec } => {
                    let tokens = tokens.or(Some(count));
                    let tps = tokens_per_sec.or_else(|| {
                        let secs = started.elapsed().as_secs_f64();
                        (secs > 0.0).then(|| count as f64 / secs)
                    });
                    send(StreamChunk::Done { tokens, tokens_per_sec: tps, cancelled: false })?;
                    return Ok(());
                }
                LineEvent::Skip => {}
            }
        }
    }
    // Stream ended without explicit done marker.
    send(StreamChunk::Done { tokens: Some(count), tokens_per_sec: None, cancelled: false })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ollama_lines() {
        assert_eq!(
            parse_ollama_line(r#"{"message":{"role":"assistant","content":"Hi"},"done":false}"#),
            LineEvent::Token("Hi".into())
        );
        assert_eq!(
            parse_ollama_line(r#"{"done":true,"eval_count":10,"eval_duration":2000000000}"#),
            LineEvent::Done { tokens: Some(10), tokens_per_sec: Some(5.0) }
        );
    }

    #[test]
    fn sse_lines() {
        assert_eq!(
            parse_sse_line(r#"data: {"choices":[{"delta":{"content":"Yo"}}]}"#),
            LineEvent::Token("Yo".into())
        );
        assert_eq!(parse_sse_line("data: [DONE]"), LineEvent::Done { tokens: None, tokens_per_sec: None });
        assert_eq!(parse_sse_line(": keepalive"), LineEvent::Skip);
    }

    #[test]
    fn model_lists() {
        let v: Value = serde_json::from_str(
            r#"{"models":[{"name":"llama3:8b","size":4700000000,"details":{"parameter_size":"8B","quantization_level":"Q4_0"}}]}"#,
        ).unwrap();
        let m = parse_ollama_tags(&v);
        assert_eq!(m[0].id, "llama3:8b");
        assert_eq!(m[0].details.as_deref(), Some("8B · Q4_0"));

        let v: Value = serde_json::from_str(r#"{"object":"list","data":[{"id":"ai/smollm2"}]}"#).unwrap();
        assert_eq!(parse_openai_models(&v)[0].id, "ai/smollm2");
    }
}

