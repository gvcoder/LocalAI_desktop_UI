import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
  Bot, Check, ChevronDown, Copy, Eraser, MessageSquare, Pencil, Plus, RefreshCw, Send, Settings as Cog, Square, Trash2, User, X,
} from "lucide-react";
import { useStore } from "./store";
import type { ModelInfo, Settings } from "./api";

export default function App() {
  const init = useStore((s) => s.init);
  const refresh = useStore((s) => s.refreshBackends);
  const settingsOpen = useStore((s) => s.settingsOpen);

  useEffect(() => {
    init().catch(console.error);
    const t = setInterval(() => refresh().catch(console.error), 10_000);
    return () => clearInterval(t);
  }, [init, refresh]);

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Header />
        <ChatView />
        <Composer />
      </main>
      {settingsOpen && <SettingsModal />}
    </div>
  );
}

/* ---------------- Sidebar ---------------- */
function Sidebar() {
  const { sessions, activeId, selectSession, newChat, deleteSession, renameSession, status, refreshBackends, setSettingsOpen } =
    useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
      <div className="p-3">
        <button
          onClick={newChat}
          className="flex w-full items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
        >
          <Plus size={16} /> New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {sessions.length === 0 && <p className="px-2 py-4 text-xs text-zinc-500">No conversations yet.</p>}
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => selectSession(s.id)}
            className={`group mb-0.5 flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm ${
              activeId === s.id ? "bg-zinc-800" : "hover:bg-zinc-800/60"
            }`}
          >
            <MessageSquare size={14} className="shrink-0 text-zinc-500" />
            {editing === s.id ? (
              <input
                autoFocus
                value={draft}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => setEditing(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && draft.trim()) { renameSession(s.id, draft.trim()); setEditing(null); }
                  if (e.key === "Escape") setEditing(null);
                }}
                className="min-w-0 flex-1 rounded bg-zinc-950 px-1 outline-none ring-1 ring-indigo-500"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate">{s.title}</span>
            )}
            <div className="hidden gap-1 group-hover:flex">
              <button title="Rename" onClick={(e) => { e.stopPropagation(); setDraft(s.title); setEditing(s.id); }}>
                <Pencil size={13} className="text-zinc-400 hover:text-zinc-100" />
              </button>
              <button
                title="Delete"
                onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${s.title}"?`)) deleteSession(s.id); }}
              >
                <Trash2 size={13} className="text-zinc-400 hover:text-red-400" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 border-t border-zinc-800 p-3 text-xs">
        <div className="flex items-center justify-between text-zinc-500">
          <span>Backends</span>
          <button title="Refresh" onClick={() => refreshBackends()} className="hover:text-zinc-200">
            <RefreshCw size={12} />
          </button>
        </div>
        {(["ollama", "docker"] as const).map((p) => {
          const st = status.find((s) => s.provider === p);
          return (
            <div key={p} className="flex items-center gap-2" title={st ? `${st.url}\n${st.message ?? ""}` : "Checking…"}>
              <span className={`h-2 w-2 rounded-full ${!st ? "bg-zinc-600" : st.online ? "bg-emerald-500" : "bg-red-500"}`} />
              <span>{p === "ollama" ? "Ollama" : "Docker Model Runner"}</span>
              <span className="ml-auto text-zinc-500">{!st ? "…" : st.online ? st.message : "offline"}</span>
            </div>
          );
        })}
        <button
          onClick={() => setSettingsOpen(true)}
          className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          <Cog size={14} /> Settings
        </button>
      </div>
    </aside>
  );
}

/* ---------------- Header / model picker ---------------- */
function Header() {
  const { models, selectedModel, selectModel, streaming, activeId, messages, clearChat } = useStore();
  const [open, setOpen] = useState(false);
  const groups: [string, ModelInfo[]][] = [
    ["Ollama", models.filter((m) => m.provider === "ollama")],
    ["Docker Model Runner", models.filter((m) => m.provider === "docker")],
  ];

  return (
    <header className="flex h-12 items-center border-b border-zinc-800 px-4">
      <div className="relative">
        <button
          disabled={!!streaming}
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-zinc-800 disabled:opacity-50"
        >
          {selectedModel ? (
            <>
              <span className="font-medium">{selectedModel.id}</span>
              <ProviderBadge p={selectedModel.provider} />
            </>
          ) : (
            <span className="text-zinc-500">No models found</span>
          )}
          <ChevronDown size={14} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute z-20 mt-1 max-h-96 w-80 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
              {groups.map(([label, list]) => (
                <div key={label}>
                  <div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
                  {list.length === 0 && <div className="px-2 py-1 text-xs text-zinc-600">None available</div>}
                  {list.map((m) => (
                    <button
                      key={m.provider + m.id}
                      onClick={() => { selectModel(m); setOpen(false); }}
                      className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-800"
                    >
                      <span className="truncate">{m.id}</span>
                      <span className="ml-2 shrink-0 text-xs text-zinc-500">
                        {m.details ?? (m.sizeBytes ? fmtBytes(m.sizeBytes) : "")}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <button
        onClick={() => { if (confirm("Clear all messages in this chat?")) clearChat(); }}
        disabled={!activeId || messages.length === 0 || !!streaming}
        title="Clear chat"
        className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-30"
      >
        <Eraser size={14} /> Clear
      </button>
    </header>
  );
}

function ProviderBadge({ p }: { p: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] ${p === "ollama" ? "bg-indigo-500/20 text-indigo-300" : "bg-sky-500/20 text-sky-300"}`}>
      {p === "ollama" ? "Ollama" : "Docker"}
    </span>
  );
}

const fmtBytes = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(0)} MB`);

/* ---------------- Chat ---------------- */
function ChatView() {
  const { messages, streaming, models, status } = useStore();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [messages]);

  if (messages.length === 0) {
    const anyOnline = status.some((s) => s.online);
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-zinc-500">
        <Bot size={40} className="text-zinc-700" />
        <p className="text-lg text-zinc-300">Chat with your local models</p>
        {status.length > 0 && !anyOnline && (
          <p className="max-w-md text-sm">
            No backend reachable. Start <code className="text-zinc-300">ollama serve</code> or enable Docker Model Runner
            TCP access (<code className="text-zinc-300">docker desktop enable model-runner --tcp 12434</code>), then check
            URLs in Settings.
          </p>
        )}
        {anyOnline && models.length === 0 && <p className="text-sm">Backend online but no models pulled yet.</p>}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {messages.map((m) => (
          <div key={m.id} className="flex gap-3">
            <div className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${m.role === "user" ? "bg-zinc-700" : "bg-indigo-600"}`}>
              {m.role === "user" ? <User size={14} /> : <Bot size={14} />}
            </div>
            <div className="min-w-0 flex-1">
              {m.role === "user" ? (
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              ) : (
                <div className={`prose-chat ${m.error ? "text-red-400" : ""}`}>
                  {m.content ? <Markdown text={m.content} /> : streaming && <span className="animate-pulse text-zinc-500">▍</span>}
                </div>
              )}
              {m.role === "assistant" && m.content && !String(m.id).startsWith("pending") && (
                <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                  <CopyButton text={m.content} label="Copy" />
                  {m.stats && <span>{m.stats}</span>}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
      components={{
        pre: ({ children }) => {
          const raw = extractText(children);
          const lang = /language-(\w+)/.exec(JSON.stringify((children as any)?.props?.className ?? ""))?.[1];
          return (
            <div className="my-3 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1 text-xs text-zinc-500">
                <span>{lang ?? "code"}</span>
                <CopyButton text={raw} label="Copy code" />
              </div>
              <pre className="overflow-x-auto p-3 text-sm">{children}</pre>
            </div>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function extractText(node: any): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  return extractText(node.props?.children);
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}
      className="flex items-center gap-1 hover:text-zinc-200"
    >
      {done ? <Check size={12} /> : <Copy size={12} />} {done ? "Copied" : label}
    </button>
  );
}

/* ---------------- Composer ---------------- */
function Composer() {
  const { send, stop, streaming, selectedModel } = useStore();
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 200) + "px"; }
  }, [text]);

  const submit = () => {
    const t = text.trim();
    if (!t || streaming || !selectedModel) return;
    setText("");
    send(t);
  };

  return (
    <div className="border-t border-zinc-800 p-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-zinc-700 bg-zinc-900 p-2 focus-within:border-indigo-500">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={selectedModel ? `Message ${selectedModel.id}…  (Shift+Enter for newline)` : "Select a model first"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 outline-none placeholder:text-zinc-600"
        />
        {streaming ? (
          <button onClick={stop} title="Stop generating" className="rounded-lg bg-zinc-700 p-2 hover:bg-zinc-600">
            <Square size={16} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!text.trim() || !selectedModel}
            title="Send"
            className="rounded-lg bg-indigo-600 p-2 hover:bg-indigo-500 disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- Settings ---------------- */
function SettingsModal() {
  const { settings, saveSettings, setSettingsOpen } = useStore();
  const [s, setS] = useState<Settings>(settings!);
  const field = "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500";

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60" onClick={() => setSettingsOpen(false)}>
      <div className="w-[480px] rounded-xl border border-zinc-700 bg-zinc-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={() => setSettingsOpen(false)}><X size={18} /></button>
        </div>
        <div className="space-y-4 text-sm">
          <label className="block">
            <span className="mb-1 block text-zinc-400">Ollama URL</span>
            <input className={field} value={s.ollamaUrl} onChange={(e) => setS({ ...s, ollamaUrl: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-zinc-400">Docker Model Runner URL (OpenAI-compatible base)</span>
            <input className={field} value={s.dockerUrl} onChange={(e) => setS({ ...s, dockerUrl: e.target.value })} />
            <span className="mt-1 block text-xs text-zinc-500">App calls <code>{"{url}"}/models</code> and <code>{"{url}"}/chat/completions</code>.</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-zinc-400">System prompt</span>
            <textarea rows={3} className={field} value={s.systemPrompt} onChange={(e) => setS({ ...s, systemPrompt: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-zinc-400">Temperature: {s.temperature.toFixed(2)}</span>
              <input type="range" min={0} max={2} step={0.05} value={s.temperature} className="w-full"
                onChange={(e) => setS({ ...s, temperature: +e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-zinc-400">Top-P: {s.topP.toFixed(2)}</span>
              <input type="range" min={0} max={1} step={0.05} value={s.topP} className="w-full"
                onChange={(e) => setS({ ...s, topP: +e.target.value })} />
            </label>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setSettingsOpen(false)} className="rounded-md px-3 py-1.5 text-sm hover:bg-zinc-800">Cancel</button>
          <button onClick={() => saveSettings(s)} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm hover:bg-indigo-500">Save</button>
        </div>
      </div>
    </div>
  );
}

