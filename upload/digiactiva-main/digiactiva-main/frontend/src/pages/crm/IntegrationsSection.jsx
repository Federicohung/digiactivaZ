import { useState, useEffect } from "react";
import axios from "axios";
import {
  Phone,
  Mail,
  Bot,
  Eye,
  EyeOff,
} from "lucide-react";
import { API } from "./constants";
import { WhatsAppMockTester } from "./WhatsAppMockTester";
import { ExternalIngestSection } from "./ExternalIngestSection";
import { ComposioSection } from "./ComposioSection";
import { ComposioGlobalSettings } from "./ComposioGlobalSettings";

const StatusBadge = ({ status }) => {
  const map = {
    not_connected: { label: "No conectado", color: "bg-slate-100 text-slate-500" },
    pending: { label: "Pendiente", color: "bg-amber-100 text-amber-700" },
    pending_credentials: { label: "Pendiente credenciales", color: "bg-amber-100 text-amber-700" },
    webhook_ready: { label: "Webhook listo", color: "bg-blue-100 text-blue-700" },
    connected: { label: "Conectado", color: "bg-green-100 text-green-700" },
    error: { label: "Error", color: "bg-red-100 text-red-700" },
  };
  const s = map[status] || map.not_connected;
  return <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${s.color}`}>{s.label}</span>;
};

export const IntegrationsSection = ({ workspace, authHeaders, onRefresh, currentUser }) => {
  const [whatsapp, setWhatsapp] = useState({ waba_id: "", phone_number_id: "", access_token: "", verify_token: "", app_secret: "", webhook_url: "", webhook_url_override: "" });
  const [resend, setResend] = useState({ api_key: "", from_email: "", from_domain: "" });
  const [sofia, setSofia] = useState({ agent_id: "", api_key: "" });
  const [showSecrets, setShowSecrets] = useState(false);
  const [savedKey, setSavedKey] = useState(null);

  useEffect(() => {
    if (workspace) {
      const i = workspace.integrations || {};
      setWhatsapp({ ...whatsapp, ...(i.whatsapp || {}) });
      setResend({ ...resend, ...(i.resend || {}) });
      setSofia({ ...sofia, ...(i.sofia || {}) });
    }
    /* eslint-disable-next-line */
  }, [workspace]);

  if (!workspace) return <div className="py-20 text-center text-slate-400">Selecciona un workspace</div>;

  const saveIntegration = async (key, payload) => {
    try {
      await axios.put(`${API}/workspaces/${workspace.id}/integrations/${key}`, payload, authHeaders());
      setSavedKey(key);
      setTimeout(() => setSavedKey(null), 3000);
      onRefresh();
    } catch (e) { alert(e.response?.data?.detail || "Error"); }
  };

  // Field is defined inside render to access showSecrets — kept identical to original
  const Field = ({ label, value, onChange, secret = false, placeholder }) => (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input
        type={secret && !showSecrets ? "password" : "text"}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-orange-500 font-mono"
      />
    </div>
  );

  const integrations = workspace.integrations || {};
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>Integraciones</h2>
          <p className="text-slate-500 mt-1">Workspace: <span className="font-semibold text-slate-700">{workspace.name}</span></p>
        </div>
        <button onClick={() => setShowSecrets(!showSecrets)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium">
          {showSecrets ? <EyeOff size={14} /> : <Eye size={14} />}
          {showSecrets ? "Ocultar" : "Mostrar"} secretos
        </button>
      </div>

      {/* WhatsApp Business */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="text-green-600" size={20} />
            <h3 className="font-semibold text-slate-900">WhatsApp Business (Meta)</h3>
            <StatusBadge status={integrations.whatsapp?.status} />
          </div>
          {savedKey === "whatsapp" && <span className="text-xs text-green-600">✓ Guardado</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="WhatsApp Business Account ID" value={whatsapp.waba_id} onChange={(v) => setWhatsapp({ ...whatsapp, waba_id: v })} placeholder="ej: 123456789" />
          <Field label="Phone Number ID" value={whatsapp.phone_number_id} onChange={(v) => setWhatsapp({ ...whatsapp, phone_number_id: v })} placeholder="ej: 987654321" />
          <Field label="Access Token (permanent)" value={whatsapp.access_token} onChange={(v) => setWhatsapp({ ...whatsapp, access_token: v })} secret placeholder="EAA..." />
          <Field label="Verify Token" value={whatsapp.verify_token} onChange={(v) => setWhatsapp({ ...whatsapp, verify_token: v })} placeholder="cualquier string secreto" />
          <Field label="App Secret" value={whatsapp.app_secret} onChange={(v) => setWhatsapp({ ...whatsapp, app_secret: v })} secret placeholder="del Meta App Dashboard" />
          <Field
            label="Dominio público del webhook"
            value={whatsapp.webhook_url_override}
            onChange={(v) => setWhatsapp({ ...whatsapp, webhook_url_override: v })}
            placeholder="https://www.tudominio.com (vacío = usa el por defecto)"
          />
        </div>

        {/* Webhook URL final — resaltada, lista para copiar a Meta */}
        {integrations.whatsapp?.webhook_url && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mt-2" data-testid="webhook-url-box">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 mb-1">📋 Copia esta URL en Meta → Configuration → Webhooks → Callback URL</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white px-3 py-2 rounded-lg border border-blue-200 text-slate-800 break-all font-mono">
                {integrations.whatsapp.webhook_url}
              </code>
              <button
                onClick={() => { navigator.clipboard.writeText(integrations.whatsapp.webhook_url); }}
                data-testid="copy-webhook-url"
                className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 whitespace-nowrap"
              >
                Copiar
              </button>
            </div>
            <p className="text-[10px] text-blue-700 mt-1.5">En el campo "Verify token" de Meta pega el mismo valor que pusiste arriba.</p>
          </div>
        )}
        <div className="flex justify-end pt-2">
          <button
            onClick={() => saveIntegration("whatsapp", whatsapp)}
            data-testid="save-whatsapp"
            className="px-6 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600"
          >Guardar credenciales WhatsApp</button>
        </div>
        {integrations.whatsapp?.last_error && (
          <p className="text-xs text-red-500 italic break-all">⚠ {integrations.whatsapp.last_error}</p>
        )}
        <p className="text-xs text-slate-400 italic">Mientras no tengas todos los campos, el módulo queda como "no conectado". Una vez completos, el sistema marca "webhook listo" hasta que Meta verifique el webhook con el verify_token. Si dejas vacío el "Dominio público del webhook", se usa <code className="text-slate-500">{integrations.whatsapp?.webhook_url?.split("/api/")[0] || "el dominio por defecto"}</code>.</p>

        {/* Mock test (to validate inbound flow without Meta) */}
        <div className="border-t border-slate-100 pt-3 mt-2">
          <p className="text-xs font-semibold text-slate-600 mb-2">🧪 Probar sin Meta real</p>
          <WhatsAppMockTester workspaceId={workspace.id} authHeaders={authHeaders} />
        </div>
      </div>

      {/* Resend */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="text-blue-600" size={20} />
            <h3 className="font-semibold text-slate-900">Resend (Email)</h3>
            <StatusBadge status={integrations.resend?.status} />
          </div>
          {savedKey === "resend" && <span className="text-xs text-green-600">✓ Guardado</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="API Key" value={resend.api_key} onChange={(v) => setResend({ ...resend, api_key: v })} secret placeholder="re_..." />
          <Field label="Email remitente" value={resend.from_email} onChange={(v) => setResend({ ...resend, from_email: v })} placeholder="ventas@digiactiva.com" />
          <Field label="Dominio de envío" value={resend.from_domain} onChange={(v) => setResend({ ...resend, from_domain: v })} placeholder="digiactiva.com" />
          <div className="flex flex-col gap-1 text-xs">
            <span className="text-slate-500">Estado DKIM/SPF/DMARC:</span>
            <div className="flex gap-2">
              <span className={`px-2 py-0.5 rounded ${integrations.resend?.dkim_status === "ok" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>DKIM: {integrations.resend?.dkim_status || "—"}</span>
              <span className={`px-2 py-0.5 rounded ${integrations.resend?.spf_status === "ok" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>SPF: {integrations.resend?.spf_status || "—"}</span>
              <span className={`px-2 py-0.5 rounded ${integrations.resend?.dmarc_status === "ok" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>DMARC: {integrations.resend?.dmarc_status || "—"}</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={() => saveIntegration("resend", resend)} data-testid="save-resend" className="px-6 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600">Guardar credenciales Resend</button>
        </div>
      </div>

      {/* SOFIA */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="text-purple-600" size={20} />
            <h3 className="font-semibold text-slate-900">SOFIA Voice (ElevenLabs)</h3>
            <StatusBadge status={integrations.sofia?.status} />
          </div>
          {savedKey === "sofia" && <span className="text-xs text-green-600">✓ Guardado</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Agent ID" value={sofia.agent_id} onChange={(v) => setSofia({ ...sofia, agent_id: v })} placeholder="agent_..." />
          <Field label="API Key" value={sofia.api_key} onChange={(v) => setSofia({ ...sofia, api_key: v })} secret placeholder="xi-..." />
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={() => saveIntegration("sofia", sofia)} data-testid="save-sofia" className="px-6 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600">Guardar credenciales SOFIA</button>
        </div>
      </div>

      {/* Configuración Global Composio (founder-only) — encima de los canales sociales */}
      {currentUser?.role === "founder_admin" && (
        <ComposioGlobalSettings authHeaders={authHeaders} />
      )}

      {/* Canales Sociales (Composio) — Messenger / Instagram / WhatsApp alt */}
      <ComposioSection workspace={workspace} authHeaders={authHeaders} onRefresh={onRefresh} />

      {/* External ingestion (mirror webhook for other backends / Twilio / bots) */}
      <ExternalIngestSection workspaceId={workspace.id} authHeaders={authHeaders} onRefresh={onRefresh} />
    </div>
  );
};
