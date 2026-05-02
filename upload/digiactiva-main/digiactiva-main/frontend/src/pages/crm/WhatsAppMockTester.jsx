import { useState } from "react";
import axios from "axios";
import { Loader2 } from "lucide-react";
import { API } from "./constants";

export const WhatsAppMockTester = ({ workspaceId, authHeaders }) => {
  const [phone, setPhone] = useState("+56987654321");
  const [text, setText] = useState("Hola, me interesa el plan de WhatsApp");
  const [profileName, setProfileName] = useState("Cliente Mock");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const runMock = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await axios.post(`${API}/whatsapp/mock-receive`, {
        phone, text, profile_name: profileName,
      }, authHeaders ? authHeaders() : {});
      setResult({ ok: true, ...res.data });
    } catch (e) {
      setResult({ ok: false, error: e.response?.data?.detail || "Error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-50 rounded-xl p-3 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+56..." className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-green-500" data-testid="mock-phone" />
        <input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Nombre perfil" className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-green-500" data-testid="mock-profile" />
        <button
          onClick={runMock}
          disabled={loading || !phone.trim() || !text.trim()}
          data-testid="mock-run"
          className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : "Simular entrante"}
        </button>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Texto del mensaje" data-testid="mock-text" className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-green-500" />
      {result && (
        <div className={`text-xs p-2 rounded-lg ${result.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
          {result.ok ? (
            <>✓ Procesado — contact_id <code className="text-[10px] bg-white px-1 rounded">{result.contact_id?.slice(0,8)}…</code> · Ve a <strong>Contactos</strong> y abre el lead para ver el mensaje en el tab Mensajes.</>
          ) : `✗ ${result.error}`}
        </div>
      )}
    </div>
  );
};
