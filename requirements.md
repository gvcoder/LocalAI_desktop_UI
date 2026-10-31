# Requirements Specification: LocalAI Desktop UI

A lightweight, secure desktop application built with **Tauri v2 (Rust + Modern Web Frontend)** to manage and chat with local LLMs running via **Ollama** and **Docker Model Runner**.

---

## 1. Executive Summary & Objective

- **Target Audience:** Developers and Linux desktop users who run local models (Ollama / Docker Model Runner) and prefer a clean, native-feeling desktop UI over the command line.
- **Core Goal:** Unified desktop dashboard for:
  - Discovering and inspecting installed models from both Ollama and Docker.
  - Interactive multi-turn chat with streaming responses, markdown, and code syntax highlighting.
  - Portability across Linux systems (distributed as AppImage and `.deb`).

---

## 2. Architecture & Technology Stack

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **Desktop Shell** | Tauri v2 (Rust) | Minimal RAM footprint (~30–50MB vs 200MB+ for Electron), high security, fast startup, native system integration. |
| **Frontend UI** | React + TypeScript + Tailwind CSS | Fast responsive UI, strong ecosystem for chat/markdown rendering and state management. |
| **Local LLM Providers** | Ollama API (`http://localhost:11434`) & Docker Engine / Model Runner API / CLI | Local-first; no external data leaks or cloud dependencies required. |
| **Packaging / Dist** | Tauri Bundler (`.deb`, `.AppImage`) | Works out of the box on Ubuntu/Debian, Fedora, Arch, and portable Linux setups. |

---

## 3. Key Functional Requirements

### 3.1. Model Discovery & Status Dashboard
- **Ollama Detection:**
  - Auto-check Ollama health at `http://localhost:11434/api/tags`.
  - List available downloaded models with tags, parameter size, and quantization info.
  - Option to check running models (`/api/ps`).
- **Docker Model Runner Detection:**
  - Query local Docker daemon / container endpoints or run background checks for running model containers.
  - List container names, mapped ports, and status (running/stopped).
- **Endpoint Configuration:**
  - Configurable endpoints in settings (default `localhost:11434` for Ollama, configurable port/URL for Docker models or OpenAI-compatible local APIs).

### 3.2. Chat Interface
- **Streaming Responses:** Real-time token streaming using server-sent events (SSE) / chunked JSON.
- **Rich Formatting:**
  - Full Markdown rendering (tables, lists, blockquotes, math).
  - Syntax-highlighted code blocks with 1-click **Copy Code** button.
- **Conversation Management:**
  - Create new chats, rename sessions, delete conversations.
  - Persistent chat history stored locally (SQLite or encrypted JSON via Tauri store).
  - Adjustable model generation parameters per chat: Temperature, System Prompt / Persona, Context Length.

### 3.3. Performance & System Monitoring
- **Lightweight System Footprint:** Application shell should consume minimal idle memory.
- **Status Indicator:** Live ping/pill indicating whether Ollama / Docker backend is active or unreachable, with troubleshooting hints.

---

## 4. Non-Functional Requirements

- **Portability & Packaging:**
  - Generates standalone `.AppImage` (runs on almost any modern Linux distribution without installation).
  - Generates standard `.deb` package for Ubuntu/Debian/Mint users.
- **Security & Privacy:**
  - Local-only by default: No telemetry, no third-party cloud data transmission.
  - Tauri security capabilities configured strictly for localhost / local socket communications.
- **Offline Capable:** Works 100% offline once models are downloaded locally.

---

## 5. Scope & Phased Roadmap

- **Phase 1 (MVP):**
  - Project setup with Tauri v2 + React/TypeScript.
  - Ollama API connection & model list dropdown.
  - Streaming conversational chat with markdown & code copy.
  - Basic settings screen (Ollama endpoint URL, system prompt).
- **Phase 2 (Docker Integration & Enhancements):**
  - Docker Model Runner / OpenAI-compatible container endpoint detection.
  - Local SQLite conversation storage and chat session history sidebar.
  - Model parameter tuning (temperature, top_p, max tokens).
- **Phase 3 (Packaging & Polishing):**
  - Linux packaging workflow (`.deb`, `.AppImage`).
  - Dark/Light desktop theme adaptation.

