import { create } from "zustand";
import { api, HealthStatus, ModelInfo, Session, Settings, StoredMessage } from "./api";

export interface UiMessage extends Omit<StoredMessage, "id" | "sessionId"> {
  id: number | string;
  stats?: string;
  error?: boolean;
}

interface State {
  settings: Settings | null;
  models: ModelInfo[];
  status: HealthStatus[];
  sessions: Session[];
  activeId: string | null;
  messages: UiMessage[];
  selectedModel: ModelInfo | null;
  streaming: string | null; // active requestId
  settingsOpen: boolean;

  init: () => Promise<void>;
  refreshBackends: () => Promise<void>;
  selectSession: (id: string | null) => Promise<void>;
  newChat: () => void;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  clearChat: () => Promise<void>;
  selectModel: (m: ModelInfo) => void;
  send: (text: string) => Promise<void>;
  stop: () => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  setSettingsOpen: (o: boolean) => void;
}

export const useStore = create<State>((set, get) => ({
  settings: null,
  models: [],
  status: [],
  sessions: [],
  activeId: null,
  messages: [],
  selectedModel: null,
  streaming: null,
  settingsOpen: false,

  init: async () => {
    const [settings, sessions] = await Promise.all([api.getSettings(), api.listSessions()]);
    set({ settings, sessions });
    await get().refreshBackends();
  },

  refreshBackends: async () => {
    const [status, models] = await Promise.all([api.checkStatus(), api.listModels()]);
    const sel = get().selectedModel;
    const stillThere = sel && models.find((m) => m.id === sel.id && m.provider === sel.provider);
    set({ status, models, selectedModel: stillThere ?? sel ?? models[0] ?? null });
  },

  selectSession: async (id) => {
    if (get().streaming) return;
    if (!id) return set({ activeId: null, messages: [] });
    const msgs = await api.getMessages(id);
    const s = get().sessions.find((x) => x.id === id);
    const model = s?.modelId
      ? get().models.find((m) => m.id === s.modelId && m.provider === s.provider) ??
        { id: s.modelId, provider: s.provider ?? "ollama" }
      : get().selectedModel;
    set({ activeId: id, messages: msgs, selectedModel: model });
  },

  newChat: () => {
    if (!get().streaming) set({ activeId: null, messages: [] });
  },

  deleteSession: async (id) => {
    await api.deleteSession(id);
    const sessions = await api.listSessions();
    set({ sessions });
    if (get().activeId === id) set({ activeId: null, messages: [] });
  },

  renameSession: async (id, title) => {
    await api.renameSession(id, title);
    set({ sessions: await api.listSessions() });
  },

  clearChat: async () => {
    const id = get().activeId;
    if (!id || get().streaming) return;
    await api.clearMessages(id);
    set({ messages: [], sessions: await api.listSessions() });
  },

  selectModel: (m) => {
    set({ selectedModel: m });
    const id = get().activeId;
    if (id) api.setSessionModel(id, m.id, m.provider).then(async () => set({ sessions: await api.listSessions() }));
  },

  send: async (text) => {
    const { selectedModel: model, settings } = get();
    if (!model || !settings || get().streaming) return;

    let sessionId = get().activeId;
    if (!sessionId) {
      const title = text.length > 40 ? text.slice(0, 40) + "…" : text;
      const s = await api.createSession(title, model.id, model.provider);
      sessionId = s.id;
      set({ activeId: s.id });
    }

    const userMsg = await api.saveMessage(sessionId, "user", text);
    const requestId = crypto.randomUUID();
    const assistantKey = `pending-${requestId}`;
    set((st) => ({
      messages: [...st.messages, userMsg, { id: assistantKey, role: "assistant", content: "", createdAt: Date.now() }],
      streaming: requestId,
      sessions: st.sessions,
    }));

    const history = get()
      .messages.filter((m) => m.id !== assistantKey && !m.error)
      .map((m) => ({ role: m.role, content: m.content }));
    if (settings.systemPrompt.trim()) history.unshift({ role: "system", content: settings.systemPrompt });

    let content = "";
    let tokens: number | null = null;
    let stats = "";
    let failed = false;
    const patch = (p: Partial<UiMessage>) =>
      set((st) => ({ messages: st.messages.map((m) => (m.id === assistantKey ? { ...m, ...p } : m)) }));

    try {
      await api.chatStream(
        { requestId, provider: model.provider, model: model.id, messages: history, temperature: settings.temperature, topP: settings.topP },
        (c) => {
          if (c.type === "token") {
            content += c.content;
            patch({ content });
          } else if (c.type === "done") {
            tokens = c.tokens ?? null;
            stats = [
              tokens != null ? `${tokens} tokens` : null,
              c.tokensPerSec ? `${c.tokensPerSec.toFixed(1)} t/s` : null,
              c.cancelled ? "stopped" : null,
            ].filter(Boolean).join(" · ");
          } else if (c.type === "error") {
            failed = true;
          }
        },
      );
    } catch (e) {
      failed = true;
      patch({ content: content || `⚠️ ${String(e)}`, error: !content });
    }

    if (content) {
      const saved = await api.saveMessage(sessionId, "assistant", content, tokens);
      set((st) => ({ messages: st.messages.map((m) => (m.id === assistantKey ? { ...saved, stats } : m)) }));
    } else if (!failed) {
      patch({ content: "_(empty response)_", error: true });
    }
    set({ streaming: null, sessions: await api.listSessions() });
  },

  stop: async () => {
    const id = get().streaming;
    if (id) await api.stopGeneration(id);
  },

  saveSettings: async (s) => {
    await api.updateSettings(s);
    set({ settings: s, settingsOpen: false });
    await get().refreshBackends();
  },

  setSettingsOpen: (o) => set({ settingsOpen: o }),
}));

