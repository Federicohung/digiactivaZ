import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { MessageCircle, X, Send, Minus, Loader2, Sparkles } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SESSION_KEY = "digiactiva_chat_session";

function getOrCreateSession() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = (window.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function detectWorkspace() {
  // Priority: ?workspace=slug → window.DIGIACTIVA_WORKSPACE → undefined (default 'digiactiva')
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("workspace");
    if (fromUrl) return fromUrl;
  } catch (e) { /* ignore */ }
  if (typeof window !== "undefined" && window.DIGIACTIVA_WORKSPACE) {
    return window.DIGIACTIVA_WORKSPACE;
  }
  return undefined;
}

export default function ChatWidget({ workspace: workspaceProp, startOpen = false }) {
  const workspace = workspaceProp || detectWorkspace();
  const [open, setOpen] = useState(startOpen);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [greeting, setGreeting] = useState(
    "Hola 👋 ¿En qué puedo ayudarte hoy?"
  );
  const [unread, setUnread] = useState(false);
  const [leadCaptured, setLeadCaptured] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("DIGIACTIVA");
  const sessionId = useRef(getOrCreateSession());
  const scrollRef = useRef(null);

  // Fetch greeting on mount (uses workspace param if present)
  useEffect(() => {
    const url = workspace
      ? `${API}/chat/greeting?workspace=${encodeURIComponent(workspace)}`
      : `${API}/chat/greeting`;
    axios.get(url).then((r) => {
      if (r.data?.greeting) setGreeting(r.data.greeting);
      if (r.data?.workspace_name) setWorkspaceName(r.data.workspace_name);
    }).catch(() => {});
  }, [workspace]);

  // Auto-open after 12s on first visit (one-time)
  useEffect(() => {
    if (localStorage.getItem("digiactiva_chat_seen")) return;
    const t = setTimeout(() => {
      setOpen(true);
      setUnread(true);
      localStorage.setItem("digiactiva_chat_seen", "1");
    }, 12000);
    return () => clearTimeout(t);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, open, minimized]);

  // Inject greeting as first message when opened
  useEffect(() => {
    if (open && !minimized && messages.length === 0) {
      setMessages([{ role: "assistant", content: greeting }]);
    }
  }, [open, minimized, greeting, messages.length]);

  const handleOpen = () => {
    setOpen(true);
    setMinimized(false);
    setUnread(false);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await axios.post(`${API}/chat/message`, {
        session_id: sessionId.current,
        message: text,
        workspace: workspace || undefined,
        visitor_meta: { url: window.location.href, referrer: document.referrer },
      });
      setMessages((m) => [...m, { role: "assistant", content: res.data.message }]);
      if (res.data.lead_captured) setLeadCaptured(true);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: "Lo siento, tuve un problema. ¿Puedes repetir?" }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Floating bubble (closed)
  if (!open) {
    return (
      <button
        onClick={handleOpen}
        data-testid="chat-bubble-open"
        aria-label="Abrir chat con asesor IA"
        className="fixed bottom-6 right-6 z-[60] group"
      >
        <span className="absolute inset-0 rounded-full bg-blue-600 animate-ping opacity-30" />
        <span className="relative flex items-center gap-2 bg-gradient-to-br from-blue-600 to-blue-700 text-white pl-4 pr-5 py-3 rounded-full shadow-2xl shadow-blue-600/40 hover:shadow-blue-600/60 hover:scale-105 transition-all">
          <MessageCircle size={22} />
          <span className="text-sm font-semibold hidden sm:inline">Hablar con un asesor IA</span>
          {unread && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white" />
          )}
        </span>
      </button>
    );
  }

  // Minimized
  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        data-testid="chat-restore"
        className="fixed bottom-6 right-6 z-[60] flex items-center gap-3 bg-white shadow-2xl rounded-full pl-4 pr-5 py-3 border border-slate-200 hover:shadow-2xl transition-all"
      >
        <span className="relative flex">
          <span className="w-3 h-3 rounded-full bg-green-500" />
          <span className="absolute inset-0 w-3 h-3 rounded-full bg-green-500 animate-ping opacity-50" />
        </span>
        <span className="text-sm font-medium text-slate-700">Asesor IA · {workspaceName}</span>
      </button>
    );
  }

  // Open chat panel
  return (
    <div
      data-testid="chat-panel"
      className="fixed bottom-6 right-6 z-[60] w-[calc(100vw-3rem)] sm:w-[380px] h-[560px] max-h-[calc(100vh-3rem)] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-slide-up"
      style={{ animation: "slideUp 0.25s ease-out" }}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-5 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
          <Sparkles size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm leading-tight truncate">Asesor IA · {workspaceName}</p>
          <p className="text-xs opacity-90 flex items-center gap-1.5">
            <span className="w-2 h-2 bg-green-400 rounded-full" />
            En línea ahora
          </p>
        </div>
        <button
          onClick={() => setMinimized(true)}
          aria-label="Minimizar"
          className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
          data-testid="chat-minimize"
        >
          <Minus size={18} />
        </button>
        <button
          onClick={() => setOpen(false)}
          aria-label="Cerrar"
          className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
          data-testid="chat-close"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-blue-600 text-white rounded-br-sm"
                  : "bg-white text-slate-800 border border-slate-100 shadow-sm rounded-bl-sm"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-100 shadow-sm rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "120ms" }} />
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "240ms" }} />
              </div>
            </div>
          </div>
        )}
        {leadCaptured && (
          <div className="flex justify-center">
            <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full">
              ✓ Tus datos se registraron
            </span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-slate-100 px-3 py-3 bg-white">
        <div className="flex items-end gap-2 bg-slate-50 rounded-2xl px-3 py-2 focus-within:ring-2 focus-within:ring-blue-300 transition-all">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Escribe tu mensaje..."
            rows={1}
            disabled={loading}
            data-testid="chat-input"
            className="flex-1 bg-transparent outline-none text-sm resize-none max-h-24 leading-relaxed"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            data-testid="chat-send"
            aria-label="Enviar"
            className="w-9 h-9 rounded-full bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <p className="text-[10px] text-slate-400 text-center mt-2">
          Asistido por IA · Powered by DIGIACTIVA
        </p>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
