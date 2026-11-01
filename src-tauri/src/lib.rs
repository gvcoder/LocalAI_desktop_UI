mod db;
mod models;
mod providers;

use models::*;
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{ipc::Channel, Manager, State};
use tokio_util::sync::CancellationToken;

pub struct AppState {
    db: Mutex<Connection>,
    client: reqwest::Client,
    active: Mutex<HashMap<String, CancellationToken>>,
}

impl AppState {
    fn settings(&self) -> AppResult<Settings> {
        db::load_settings(&self.db.lock().unwrap())
    }
    fn base_url(&self, kind: ProviderKind) -> AppResult<String> {
        let s = self.settings()?;
        Ok(match kind {
            ProviderKind::Ollama => s.ollama_url,
            ProviderKind::Docker => s.docker_url,
        })
    }
}

// ---------- Settings ----------
#[tauri::command]
fn get_settings(state: State<AppState>) -> AppResult<Settings> {
    state.settings()
}

#[tauri::command]
fn update_settings(state: State<AppState>, settings: Settings) -> AppResult<()> {
    db::save_settings(&state.db.lock().unwrap(), &settings)
}

// ---------- Providers ----------
#[tauri::command]
async fn list_models(state: State<'_, AppState>) -> AppResult<Vec<ModelInfo>> {
    let mut all = Vec::new();
    for kind in [ProviderKind::Ollama, ProviderKind::Docker] {
        let base = state.base_url(kind)?;
        // An offline provider shouldn't hide the other's models.
        if let Ok(mut m) = providers::list_models(&state.client, kind, &base).await {
            all.append(&mut m);
        }
    }
    Ok(all)
}

#[tauri::command]
async fn check_backend_status(state: State<'_, AppState>) -> AppResult<Vec<HealthStatus>> {
    let o = state.base_url(ProviderKind::Ollama)?;
    let d = state.base_url(ProviderKind::Docker)?;
    let (a, b) = tokio::join!(
        providers::check_health(&state.client, ProviderKind::Ollama, &o),
        providers::check_health(&state.client, ProviderKind::Docker, &d),
    );
    Ok(vec![a, b])
}

#[tauri::command]
async fn chat_stream(state: State<'_, AppState>, request: ChatRequest, on_event: Channel<StreamChunk>) -> AppResult<()> {
    let base = state.base_url(request.provider)?;
    let token = CancellationToken::new();
    state.active.lock().unwrap().insert(request.request_id.clone(), token.clone());

    let result = providers::stream_chat(&state.client, &base, &request, &on_event, token).await;
    state.active.lock().unwrap().remove(&request.request_id);

    if let Err(e) = &result {
        let _ = on_event.send(StreamChunk::Error { message: e.to_string() });
    }
    result
}

#[tauri::command]
fn stop_generation(state: State<AppState>, request_id: String) {
    if let Some(t) = state.active.lock().unwrap().get(&request_id) {
        t.cancel();
    }
}

// ---------- Sessions ----------
#[tauri::command]
fn list_sessions(state: State<AppState>) -> AppResult<Vec<Session>> {
    db::list_sessions(&state.db.lock().unwrap())
}

#[tauri::command]
fn create_session(state: State<AppState>, title: String, model_id: Option<String>, provider: Option<String>) -> AppResult<Session> {
    db::create_session(&state.db.lock().unwrap(), &title, model_id.as_deref(), provider.as_deref())
}

#[tauri::command]
fn rename_session(state: State<AppState>, id: String, title: String) -> AppResult<()> {
    db::rename_session(&state.db.lock().unwrap(), &id, &title)
}

#[tauri::command]
fn set_session_model(state: State<AppState>, id: String, model_id: String, provider: String) -> AppResult<()> {
    db::set_session_model(&state.db.lock().unwrap(), &id, &model_id, &provider)
}

#[tauri::command]
fn delete_session(state: State<AppState>, id: String) -> AppResult<()> {
    db::delete_session(&state.db.lock().unwrap(), &id)
}

#[tauri::command]
fn clear_session_messages(state: State<AppState>, session_id: String) -> AppResult<()> {
    db::clear_messages(&state.db.lock().unwrap(), &session_id)
}

#[tauri::command]
fn get_session_messages(state: State<AppState>, session_id: String) -> AppResult<Vec<StoredMessage>> {
    db::get_messages(&state.db.lock().unwrap(), &session_id)
}

#[tauri::command]
fn save_message(state: State<AppState>, session_id: String, role: String, content: String, tokens: Option<i64>) -> AppResult<StoredMessage> {
    db::save_message(&state.db.lock().unwrap(), &session_id, &role, &content, tokens)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // ~/.local/share/dev.localai.desktop/data.db
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join("data.db")).map_err(|e| e.to_string())?;
            let client = reqwest::Client::builder()
                .connect_timeout(std::time::Duration::from_secs(5))
                .build()?;
            app.manage(AppState { db: Mutex::new(conn), client, active: Mutex::new(HashMap::new()) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings, update_settings,
            list_models, check_backend_status, chat_stream, stop_generation,
            list_sessions, create_session, rename_session, set_session_model,
            delete_session, clear_session_messages, get_session_messages, save_message
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

