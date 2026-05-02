import { useState } from "react";
import axios from "axios";
import { Phone, Send, Loader2 } from "lucide-react";
import { API } from "./constants";

export const WhatsAppComposer = ({ contact, authHeaders, onSent }) => {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const handleSend = async () => {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    setError(null);
    try {
      await axios.post(`${API}/whatsapp/send`, {
        contact_id: contact.id,
        text: t,
      }, authHeaders ? authHeaders() : {});
      setText("");
      onSent && onSent();
    } catch (e) {
      const detail = e.response?.data?.detail || "Error al enviar";
      setError(detail.startsWith("WhatsApp pending_credentials") ? "WhatsApp aún no conectado. Configura credenciales en Integraciones." : detail);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-t border-slate-100 pt-3" data-testid="whatsapp-composer">
      <div className="flex items-center gap-2 mb-2">
        <Phone className="text-green-600" size={14} />
        <span className="text-xs font-semibold text-slate-600">Enviar WhatsApp a {contact.telefono}</span>
      </div>
      <div className="flex items-end gap-2 bg-slate-50 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-green-300">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Escribe el mensaje WhatsApp..."
          disabled={sending}
          data-testid="whatsapp-composer-input"
          className="flex-1 bg-transparent outline-none text-sm resize-none"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          data-testid="whatsapp-composer-send"
          className="px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Enviar
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  );
};
