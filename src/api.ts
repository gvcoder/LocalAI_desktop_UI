import { Channel, invoke } from "@tauri-apps/api/core";

export type ProviderKind = "ollama" | "docker";

export interface ModelInfo {
  id: string;
  provider: ProviderKind;
  sizeBytes?: number | null;
  details?: string | null;
}

export interface HealthStatus {
  provider: ProviderKind;
  online: boolean;
  url: string;
  message?: string | null;
}

export interface Settings {
  ollamaUrl: string;
  dockerUrl: string;
  systemPrompt: string;
  temperature: number;
  topP: number;
}

export interface Session {
  id: string;
  title: string;
  modelId?: string | null;
  provider?: ProviderKind | null;
  createdAt: number;
  updatedAt: number;
}

export interface StoredMessage {
  id: number;
  sessionId: string;
  role: "system" | "user" | "assistant";
  content: string;
  tokens?: number | null;
  createdAt: number;
}

export type StreamChunk =
  | { type: "token"; content: string }
  | { type: "done"; tokens?: number | null; tokensPerSec?: number | null; cancelled: boolean }
  | { type: "error"; message: string };

export interface ChatRequest {
  requestId: string;
  provider: ProviderKind;
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  topP?: number;
}

export const api = {
  getSettings: () => invoke<Settings>("get_settings"),
  updateSettings: (settings: Settings) => invoke<void>("update_settings", { settings }),
  listModels: () => invoke<ModelInfo[]>("list_models"),
  checkStatus: () => invoke<HealthStatus[]>("check_backend_status"),
  stopGeneration: (requestId: string) => invoke<void>("stop_generation", { requestId }),
  chatStream: (request: ChatRequest, onChunk: (c: StreamChunk) => void) => {
    const onEvent = new Channel<StreamChunk>();
    onEvent.onmessage = onChunk;
    return invoke<void>("chat_stream", { request, onEvent });
  },
  listSessions: () => invoke<Session[]>("list_sessions"),
  createSession: (title: string, modelId?: string, provider?: string) =>
    invoke<Session>("create_session", { title, modelId, provider }),
  renameSession: (id: string, title: string) => invoke<void>("rename_session", { id, title }),
  setSessionModel: (id: string, modelId: string, provider: string) =>
    invoke<void>("set_session_model", { id, modelId, provider }),
  deleteSession: (id: string) => invoke<void>("delete_session", { id }),
  clearMessages: (sessionId: string) => invoke<void>("clear_session_messages", { sessionId }),
  getMessages: (sessionId: string) => invoke<StoredMessage[]>("get_session_messages", { sessionId }),
  saveMessage: (sessionId: string, role: string, content: string, tokens?: number | null) =>
    invoke<StoredMessage>("save_message", { sessionId, role, content, tokens }),
};

