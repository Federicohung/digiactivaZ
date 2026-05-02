import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import {
  Inbox as InboxIcon,
  Search,
  Send,
  RefreshCw,
  Phone,
  Instagram,
  Facebook,
  MessageCircle,
  CheckCheck,
  Loader2,
  X,
  Lock,
  Wifi,
  WifiOff,
  ChevronLeft,
  Tag,
  UserCircle,
  Briefcase,
  Mail,
  Hash,
  AlertCircle,
} from "lucide-react";
import { API } from "./constants";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const CHANNELS = {
  whatsapp: { label: "WhatsApp", short: "WA", Icon: Phone, color: "bg-green-100 text-green-700", dot: "bg-green-500" },
  instagram: { label: "Instagram", short: "IG", Icon: Instagram, color: "bg-pink-100 text-pink-700", dot: "bg-pink-500" },
  messenger: { label: "Messenger", short: "MSG", Icon: Facebook, color: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  web_chat: { label: "Web Chat", short: "WEB", Icon: MessageCircle, color: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
};

const STATUS_META = {
  open: { label: "Abierta", color: "bg-blue-50 text-blue-700" },
  pending: { label: "Pendiente", color: "bg-amber-50 text-amber-700" },
  closed: { label: "Cerrada", color: "bg-slate-100 text-slate-500" },
};

function timeAgo(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

const ChannelChip = ({ channel }) => {
  const c = CHANNELS[channel] || CHANNELS.web_chat;
  const { Icon } = c;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${c.color}`}>
      <Icon size={10} />
      {c.short}
    </span>
  );
};

// ───────── Conversation list item ─────────
const ConversationItem = ({ conv, active, onClick }) => {
  const ct = conv.contact || {};
  const name = ct.nombre || ct.empresa || "Visitante";
  const channel = CHANNELS[conv.channel] || CHANNELS.web_chat;
  const isUnread = (conv.unread_count || 0) > 0;
  return (
    <button
      onClick={onClick}
      data-testid={`inbox-conv-${conv.id}`}
      className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition flex gap-3 ${
        active ? "bg-blue-50/60" : ""
      }`}
    >
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold uppercase">
          {(name[0] || "?").toUpperCase()}
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${channel.dot}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate text-sm ${isUnread ? "font-bold text-slate-900" : "font-medium text-slate-800"}`}>
            {name}
          </p>
          <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(conv.last_message_at)}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <ChannelChip channel={conv.channel} />
          {conv.status !== "open" && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_META[conv.status]?.color || ""}`}>
              {STATUS_META[conv.status]?.label}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-1">
          <p className={`truncate text-xs ${isUnread ? "text-slate-700" : "text-slate-500"}`}>
            {conv.last_direction === "outbound" ? "Tú: " : ""}
            {conv.last_message_preview || "(sin mensajes)"}
          </p>
          {isUnread && (
            <span data-testid="inbox-unread-badge" className="shrink-0 bg-blue-600 text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center">
              {conv.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

// ───────── Message bubble ─────────
const MessageBubble = ({ m }) => {
  const isOut = m.direction === "outbound";
  const failed = m.status === "failed";
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap shadow-sm ${
        isOut ? (failed ? "bg-red-100 text-red-900 border border-red-300" : "bg-blue-600 text-white") : "bg-white border border-slate-200 text-slate-800"
      }`}>
        {m.body || m.content}
        <div className={`text-[10px] mt-1 flex items-center gap-1 ${isOut ? "text-blue-100" : "text-slate-400"}`}>
          {new Date(m.created_at).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          {failed && <span className="text-red-700 ml-1">· Falló</span>}
          {isOut && !failed && <CheckCheck size={11} />}
        </div>
      </div>
    </div>
  );
};

// ───────── Composer ─────────
const Composer = ({ onSend, sending, disabled, channel }) => {
  const [text, setText] = useState("");
  const taRef = useRef(null);
  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  };
  const doSend = async () => {
    if (!text.trim() || sending) return;
    const v = text;
    setText("");
    const ok = await onSend(v);
    if (!ok) setText(v); // restore on error
  };
  return (
    <div className="border-t border-slate-200 bg-white p-3">
      {disabled ? (
        <p className="text-xs text-slate-400 italic text-center py-2">
          Envío manual no soportado para este canal.
        </p>
      ) : (
        <div className="flex items-end gap-2">
          <textarea
            ref={taRef}
            data-testid="inbox-composer"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            rows={2}
            placeholder={`Escribe un mensaje (${CHANNELS[channel]?.label || channel})… Enter envía, Shift+Enter nueva línea`}
            className="flex-1 resize-none px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-sm"
          />
          <button
            onClick={doSend}
            disabled={sending || !text.trim()}
            data-testid="inbox-send-btn"
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 h-fit"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Enviar
          </button>
        </div>
      )}
    </div>
  );
};

// ───────── Right panel: contact card ─────────
const ContactPanel = ({ conv, onClose }) => {
  const ct = conv.contact || {};
  return (
    <div className="bg-white border-l border-slate-200 w-80 shrink-0 overflow-y-auto" data-testid="inbox-contact-panel">
      <div className="p-5 border-b border-slate-100 flex items-start justify-between">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Contacto</p>
          <h3 className="text-lg font-bold text-slate-900 mt-1">{ct.nombre || ct.empresa || "Visitante"}</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-400" aria-label="Cerrar panel">
          <X size={16} />
        </button>
      </div>

      <div className="p-5 space-y-3 text-sm">
        {ct.empresa && (
          <div className="flex items-center gap-2 text-slate-700"><Briefcase size={14} className="text-slate-400" />{ct.empresa}</div>
        )}
        {ct.telefono && (
          <div className="flex items-center gap-2 text-slate-700"><Phone size={14} className="text-slate-400" />{ct.telefono}</div>
        )}
        {ct.email && (
          <div className="flex items-center gap-2 text-slate-700"><Mail size={14} className="text-slate-400" />{ct.email}</div>
        )}
        {ct.instagram_id && (
          <div className="flex items-center gap-2 text-slate-700"><Instagram size={14} className="text-pink-500" /><span className="font-mono text-xs">{ct.instagram_id}</span></div>
        )}
        {ct.messenger_id && (
          <div className="flex items-center gap-2 text-slate-700"><Facebook size={14} className="text-blue-500" /><span className="font-mono text-xs">{ct.messenger_id}</span></div>
        )}
        {ct.fuente && (
          <div className="flex items-center gap-2 text-slate-500 text-xs"><Hash size={12} />Fuente: {ct.fuente}</div>
        )}
        {!ct.id && (
          <p className="text-slate-400 italic text-xs">Sin contacto vinculado.</p>
        )}
      </div>

      <div className="p-5 border-t border-slate-100">
        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Tags</p>
        {(conv.tags || []).length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {(conv.tags || []).map(t => (
              <span key={t} className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                <Tag size={10} />{t}
              </span>
            ))}
          </div>
        ) : <p className="text-xs text-slate-400 italic">Sin tags</p>}
      </div>

      <div className="p-5 border-t border-slate-100 space-y-2 text-xs text-slate-500">
        <p>Conversación: <span className="font-mono text-[10px] text-slate-400">{conv.id?.slice(0, 8)}</span></p>
        <p>Provider: {conv.provider}</p>
        {conv.last_message_at && <p>Última actividad: {new Date(conv.last_message_at).toLocaleString("es-CL")}</p>}
      </div>
    </div>
  );
};

// ───────── Conversation pane (chat view) ─────────
const ConversationPane = ({ conv, onBack, onConvUpdated, authHeaders, refresh }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showContact, setShowContact] = useState(true);
  const scrollRef = useRef(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/inbox/conversations/${conv.id}/messages`, authHeaders());
      setMessages(res.data.messages || []);
      // mark as read
      if ((conv.unread_count || 0) > 0) {
        await axios.post(`${API}/inbox/conversations/${conv.id}/read`, null, authHeaders());
        onConvUpdated({ ...conv, unread_count: 0 });
      }
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.error(e);
    } finally {
      setLoading(false);
    }
  }, [conv, authHeaders, onConvUpdated]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Append realtime message if it's for this conversation
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.conversation_id === conv.id && e.detail?.message) {
        setMessages(prev => [...prev, e.detail.message]);
        if (e.detail.message.direction === "inbound") {
          // auto-mark read when viewing
          axios.post(`${API}/inbox/conversations/${conv.id}/read`, null, authHeaders()).catch(() => {});
        }
      }
    };
    window.addEventListener("inbox-message", handler);
    return () => window.removeEventListener("inbox-message", handler);
  }, [conv.id, authHeaders]);

  const handleSend = async (text) => {
    setSending(true);
    try {
      const res = await axios.post(`${API}/inbox/conversations/${conv.id}/send`, { message: text }, authHeaders());
      const msg = res.data?.message;
      if (msg) setMessages(prev => [...prev, msg]);
      if (!res.data?.send_result?.ok) {
        alert("El mensaje se guardó pero no pudo enviarse al destinatario. Revisa la configuración del canal.");
      }
      return true;
    } catch (e) {
      const msg = e.response?.data?.detail || "Error al enviar";
      alert(msg);
      return false;
    } finally {
      setSending(false);
    }
  };

  const setStatus = async (status) => {
    try {
      const res = await axios.patch(`${API}/inbox/conversations/${conv.id}`, { status }, authHeaders());
      onConvUpdated(res.data);
    } catch (e) {
      alert(e.response?.data?.detail || "Error");
    }
  };

  const ct = conv.contact || {};
  const channel = CHANNELS[conv.channel] || CHANNELS.web_chat;
  const composerDisabled = conv.channel === "web_chat";

  return (
    <div className="flex-1 flex min-w-0" data-testid="inbox-conversation-pane">
      <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="md:hidden p-1.5 rounded hover:bg-slate-100 text-slate-500" aria-label="Volver" data-testid="inbox-back">
            <ChevronLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 truncate">{ct.nombre || ct.empresa || "Visitante"}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <ChannelChip channel={conv.channel} />
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_META[conv.status]?.color}`}>
                {STATUS_META[conv.status]?.label}
              </span>
              <span className="text-[11px] text-slate-400">
                {ct.telefono || ct.instagram_id || ct.messenger_id || ""}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {conv.status !== "closed" ? (
              <button onClick={() => setStatus("closed")} data-testid="inbox-close-btn" className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700">
                Cerrar
              </button>
            ) : (
              <button onClick={() => setStatus("open")} data-testid="inbox-reopen-btn" className="text-xs px-3 py-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700">
                Reabrir
              </button>
            )}
            <button onClick={() => setShowContact(s => !s)} className="hidden md:inline-flex text-slate-400 hover:text-slate-700 p-1.5 rounded hover:bg-slate-100" aria-label="Toggle contact" data-testid="inbox-toggle-contact">
              <UserCircle size={18} />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2" data-testid="inbox-messages">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" size={20} /></div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              <div className="w-14 h-14 rounded-full bg-slate-100 mx-auto mb-3 flex items-center justify-center">
                <channel.Icon size={20} />
              </div>
              Sin mensajes en esta conversación todavía.
            </div>
          ) : (
            messages.map(m => <MessageBubble key={m.id || m.created_at} m={m} />)
          )}
        </div>

        <Composer onSend={handleSend} sending={sending} disabled={composerDisabled} channel={conv.channel} />
      </div>

      {showContact && (
        <div className="hidden md:block">
          <ContactPanel conv={conv} onClose={() => setShowContact(false)} />
        </div>
      )}
    </div>
  );
};

// ───────── Empty state ─────────
const EmptyConversation = () => (
  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50">
    <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mb-4">
      <InboxIcon className="text-blue-600" size={28} />
    </div>
    <h3 className="font-bold text-slate-900 text-lg">Bandeja Unificada</h3>
    <p className="text-slate-500 mt-1 text-sm max-w-md">
      Selecciona una conversación a la izquierda para ver y responder mensajes de WhatsApp, Instagram y Messenger.
    </p>
  </div>
);

// ───────── Plan locked screen ─────────
const PlanLocked = ({ plan }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center max-w-2xl mx-auto" data-testid="inbox-plan-locked">
    <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
      <Lock className="text-amber-600" size={28} />
    </div>
    <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
      Bandeja omnicanal — disponible desde Premium
    </h2>
    <p className="text-slate-500 mt-3 max-w-md mx-auto">
      Centraliza WhatsApp, Instagram y Messenger en una sola bandeja, responde desde el CRM y unifica
      automáticamente los contactos por sus identificadores sociales.
    </p>
    <p className="text-xs text-slate-400 mt-4">Tu plan actual: <code className="bg-slate-100 px-1.5 py-0.5 rounded">{plan || "—"}</code></p>
  </div>
);

// ───────── Main ─────────
export const InboxSection = ({ authHeaders, currentUser }) => {
  const [conversations, setConversations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filterChannel, setFilterChannel] = useState("all");
  const [filterStatus, setFilterStatus] = useState("open");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterChannel !== "all") params.append("channel", filterChannel);
      if (filterStatus !== "all") params.append("status", filterStatus);
      if (unreadOnly) params.append("unread_only", "true");
      if (search.trim()) params.append("search", search.trim());
      params.append("limit", "100");
      const res = await axios.get(`${API}/inbox/conversations?${params.toString()}`, authHeaders());
      setConversations(res.data.items || []);
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.error(e);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, filterChannel, filterStatus, unreadOnly, search]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/inbox/summary`, authHeaders());
      setSummary(res.data);
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.error(e);
    }
  }, [authHeaders]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);
  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  // SSE realtime — open EventSource once token is known
  useEffect(() => {
    const token = localStorage.getItem("digiactiva_token");
    if (!token) return;
    const url = `${BACKEND_URL}/api/inbox/events?token=${encodeURIComponent(token)}`;
    let es;
    try {
      es = new EventSource(url);
      es.onopen = () => setSseConnected(true);
      es.onerror = () => setSseConnected(false);
      es.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          if (payload.event === "inbox.message.created") {
            // dispatch to active conversation pane
            window.dispatchEvent(new CustomEvent("inbox-message", { detail: payload.data }));
            // refresh list to bump preview/unread
            fetchConversations();
            fetchSummary();
          } else if (payload.event === "inbox.conversation.updated" || payload.event === "inbox.conversation.read") {
            fetchConversations();
            fetchSummary();
          }
        } catch (_) { /* ignore */ }
      };
    } catch (_) {
      setSseConnected(false);
    }
    return () => { try { es?.close(); } catch (_) {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (summary && !summary.plan_allows) {
    return <PlanLocked plan={summary.plan} />;
  }

  const total = summary?.total || {};

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] bg-white rounded-2xl border border-slate-200 overflow-hidden" data-testid="inbox-section">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>Bandeja</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {total.total || 0} conversaciones · {total.unread || 0} sin leer
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[11px] text-slate-500" data-testid="inbox-sse-status">
            {sseConnected ? <><Wifi size={12} className="text-green-500" /> En vivo</> : <><WifiOff size={12} className="text-slate-400" /> Conectando…</>}
          </span>
          <button onClick={() => { fetchConversations(); fetchSummary(); }} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800" data-testid="inbox-refresh">
            <RefreshCw size={12} /> Refrescar
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Left column: list */}
        <div className={`w-full md:w-96 border-r border-slate-200 flex flex-col bg-white ${selected ? "hidden md:flex" : "flex"}`}>
          {/* Filters */}
          <div className="p-3 border-b border-slate-100 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar nombre, teléfono, mensaje…"
                data-testid="inbox-search"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-500 outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {[
                { id: "all", label: "Todos" },
                { id: "whatsapp", label: "WhatsApp" },
                { id: "instagram", label: "Instagram" },
                { id: "messenger", label: "Messenger" },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilterChannel(f.id)}
                  data-testid={`inbox-filter-${f.id}`}
                  className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition ${
                    filterChannel === f.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >{f.label}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {[
                { id: "open", label: "Abiertas" },
                { id: "pending", label: "Pendientes" },
                { id: "closed", label: "Cerradas" },
                { id: "all", label: "Todo estado" },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilterStatus(f.id)}
                  data-testid={`inbox-status-${f.id}`}
                  className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition ${
                    filterStatus === f.id ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >{f.label}</button>
              ))}
              <button
                onClick={() => setUnreadOnly(v => !v)}
                data-testid="inbox-filter-unread"
                className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${
                  unreadOnly ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >No leídos</button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto" data-testid="inbox-list">
            {loading ? (
              <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={20} /></div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-12 px-6 text-slate-400 text-sm" data-testid="inbox-empty">
                <InboxIcon className="mx-auto mb-3 text-slate-300" size={28} />
                Sin conversaciones que coincidan con tus filtros.
              </div>
            ) : (
              conversations.map(c => (
                <ConversationItem
                  key={c.id}
                  conv={c}
                  active={selected?.id === c.id}
                  onClick={() => setSelected(c)}
                />
              ))
            )}
          </div>
        </div>

        {/* Center + right */}
        <div className={`flex-1 flex min-w-0 ${selected ? "flex" : "hidden md:flex"}`}>
          {selected ? (
            <ConversationPane
              key={selected.id}
              conv={selected}
              onBack={() => setSelected(null)}
              onConvUpdated={(c) => {
                setSelected(c);
                setConversations(prev => prev.map(x => x.id === c.id ? { ...x, ...c } : x));
              }}
              authHeaders={authHeaders}
              refresh={() => { fetchConversations(); fetchSummary(); }}
            />
          ) : <EmptyConversation />}
        </div>
      </div>
    </div>
  );
};
