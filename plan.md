# Implementation Plan: LocalAI Desktop UI

A step-by-step roadmap to build, test, and package the lightweight Tauri v2 desktop application for Ollama and Docker Model Runner on Linux.

---

## Task Breakdown & Milestones

### Milestone 1: Project Scaffolding & Environment Setup
- [x] **Task 1.1:** Initialize the Tauri v2 project structure (`src-tauri` with Rust + `src` with Vite/React/TypeScript/Tailwind CSS).
- [x] **Task 1.2:** Configure `tauri.conf.json` with app metadata, security permissions, bundle targets (`deb`, `appimage`), and window dimensions.
- [x] **Task 1.3:** Set up frontend dependencies (Tailwind CSS, Lucide React icons, Zustand, `react-markdown`, `remark-gfm`).
- [x] **Task 1.4:** Verify baseline build (`npm run tauri dev` or `cargo build`) compiles cleanly in the Linux environment.

---

### Milestone 2: Rust Backend Engine (Core Services & IPC)
- [x] **Task 2.1: Data Models & Error Handling**
  - Define Rust structs for `ModelInfo`, `ChatMessage`, `ChatCompletionRequest`, `StreamChunk`, and `HealthStatus`.
  - Implement unified error types (`AppError`) serializable to frontend.
- [x] **Task 2.2: Local SQLite Database**
  - Set up embedded SQLite database via `rusqlite` in `~/.local/share/localai-ui/data.db`.
  - Create migrations for `sessions` and `messages` tables.
  - Implement CRUD Tauri commands: `list_sessions`, `create_session`, `delete_session`, `rename_session`, `get_session_messages`, `save_message`.
- [x] **Task 2.3: Provider Adapters**
  - **Ollama Adapter:** Query `/api/tags` to list models, stream tokens from `/api/chat` using `reqwest` and Tauri IPC `Channel<StreamChunk>`.
  - **Docker Model Runner / OpenAI Adapter:** Query `/v1/models` and stream tokens from `/v1/chat/completions`.
  - Implement cancellation/abort mechanism so users can stop generation mid-stream.
- [x] **Task 2.4: Health & Connectivity Checks**
  - Expose `check_backend_status` command to report live availability of Ollama (`:11434`) and Docker Model Runner endpoints.

---

### Milestone 3: Modern Desktop Frontend
- [x] **Task 3.1: Layout & Navigation Shell**
  - Left Sidebar: Session history list, "New Chat" button, live backend status indicators (Ollama 🟢/🔴, Docker 🟢/🔴), and Settings trigger.
  - Header: Active model selector dropdown (grouped by Ollama vs. Docker Model Runner), clear chat button.
- [x] **Task 3.2: Chat Interface & Streaming**
  - Auto-scrolling message list with distinct user & assistant bubbles.
  - Markdown rendering with code syntax highlighting, copy code button, and generation latency/token stats.
  - Multi-line input area with auto-resize, Enter to send, Shift+Enter for newline.
  - Dynamic **"Stop Generating"** button during streaming.
- [x] **Task 3.3: Settings & Configuration Modal**
  - Configure Ollama base URL (default `http://localhost:11434`).
  - Configure Docker Model Runner base URL (default `http://localhost:12434` or custom port).
  - Adjust default model parameters: Temperature, Top-P, and System Prompt.

---

### Milestone 4: Integration, End-to-End Testing & Validation
- [x] **Task 4.1:** Test model discovery with Ollama and Docker endpoints.
- [x] **Task 4.2:** Test real-time token streaming, cancellation mid-response, and chat persistence across app restarts.
- [ ] **Task 4.3:** Verify error handling when local runtimes are stopped or unreachable.

---

### Milestone 5: Linux Packaging & Portability
- [ ] **Task 5.1:** Configure Tauri packaging for `.AppImage` and `.deb` in `tauri.conf.json`.
- [ ] **Task 5.2:** Run `npm run tauri build` to generate the portable Linux binaries in `src-tauri/target/release/bundle/`.
- [ ] **Task 5.3:** Document installation and execution instructions in `README.md`.

