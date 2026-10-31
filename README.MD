# LocalAI Desktop

A lightweight Linux desktop app for chatting with local LLMs served by **Ollama** and **Docker Model Runner**. Built with Tauri v2 (Rust) + React/TypeScript.

- Model picker for both backends, with live online/offline status
- Streaming responses, Markdown, syntax-highlighted code with copy buttons
- Stop generation mid-response
- Chat history stored locally in SQLite (`~/.local/share/dev.localai.desktop/data.db`)
- No telemetry; only talks to the URLs you configure

## Install

Download from the release bundles:

| Format | Use on | Install |
| :--- | :--- | :--- |
| `.AppImage` | Most distros (Ubuntu, Fedora, Arch, …) | `chmod +x LocalAI*.AppImage && ./LocalAI*.AppImage` |
| `.deb` | Debian / Ubuntu / Mint | `sudo apt install ./localai-desktop*.deb` |

## Backend setup

The app does not run models itself; start at least one backend.

**Ollama** (default `http://localhost:11434`)
```bash
ollama serve          # often already running as a systemd service
ollama pull llama3.2
```

**Docker Model Runner** (default `http://localhost:12434/engines/v1`)
```bash
docker model pull ai/smollm2
docker model status   # should say "Docker Model Runner is running"
```
On Docker Desktop, host TCP access may need enabling: `docker desktop enable model-runner --tcp 12434`.

URLs, system prompt, temperature and top-p are editable in **Settings**.

## Local helper commands

* `docker model list` – list models available to Docker Model Runner
* `ollama list` – list models available to Ollama

## Development

Prerequisites (Debian/Ubuntu):
```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
rustup update stable   # Node 20+ also required
```

```bash
npm install
npm run tauri dev                       # run with hot reload
(cd src-tauri && cargo test)            # backend unit tests
npm run tauri build                     # → src-tauri/target/release/bundle/{deb,appimage}/
```

## Project layout

```
src/                 React UI (App.tsx, store.ts = Zustand state, api.ts = typed IPC calls)
src-tauri/src/
  lib.rs             Tauri commands + app state
  providers.rs       Ollama & OpenAI-compatible (Docker) clients, stream parsing
  db.rs              SQLite schema + queries
  models.rs          Shared types
docs: requirements.md, design.md, plan.md
```
