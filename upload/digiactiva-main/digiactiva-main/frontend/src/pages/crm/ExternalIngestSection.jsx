import { useState, useEffect } from "react";
import axios from "axios";
import { RefreshCw, Copy, AlertTriangle, Check, Loader2, Webhook, Eye, EyeOff } from "lucide-react";
import { API } from "./constants";

export const ExternalIngestSection = ({ workspaceId, authHeaders, onRefresh }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState(null); // plaintext shown ONCE after generation
  const [regenerating, setRegenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showKey, setShowKey] = useState(true);
  const [copiedField, setCopiedField] = useState(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/workspaces/${workspaceId}/external/status`, authHeaders());
      setStatus(res.data);
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); /* eslint-disable-next-line */ }, [workspaceId]);

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const res = await axios.post(`${API}/workspaces/${workspaceId}/external/regenerate-api-key`, null, authHeaders());
      setNewKey(res.data.api_key);
      setConfirming(false);
      await fetchStatus();
      if (onRefresh) onRefresh();
    } catch (e) {
      alert(e.response?.data?.detail || "Error al regenerar API key");
    } finally {
      setRegenerating(false);
    }
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (loading && !status) {
    return <div className="bg-white rounded-2xl border border-slate-200 p-6"><Loader2 className="animate-spin text-slate-400 mx-auto" size={20} /></div>;
  }

  const statusColors = {
    active: "bg-green-100 text-green-700",
    not_configured: "bg-slate-100 text-slate-500",
    error: "bg-red-100 text-red-700",
  };
  const statusLabels = {
    active: "Activo",
    not_configured: "No configurado",
    error: "Error",
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4" data-testid="external-ingest-section">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Webhook className="text-indigo-600" size={20} />
          <h3 className="font-semibold text-slate-900">Webhook externo · Sistemas externos</h3>
          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${statusColors[status?.status] || statusColors.not_configured}`}>
            {statusLabels[status?.status] || "No configurado"}
          </span>
        </div>
        <button
          onClick={fetchStatus}
          className="text-slate-400 hover:text-slate-700"
          title="Refrescar"
          data-testid="external-refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <p className="text-sm text-slate-600">
        Canal adicional de ingestión para recibir eventos desde <strong>otros backends, Twilio, bots externos, formularios o WhatsApps que ya operan en otro sistema</strong>. No reemplaza el webhook oficial de WhatsApp Cloud API — es un "mirror" para que los eventos lleguen igualmente al CRM.
      </p>

      {/* New key just generated — visible ONCE */}
      {newKey && (
        <div className="rounded-xl p-4 border-2 border-orange-300 bg-orange-50" data-testid="new-api-key-box">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="text-orange-600" size={16} />
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wider">Guarda esta API key — solo se muestra una vez</p>
            <button onClick={() => setShowKey(v => !v)} className="ml-auto text-orange-600 hover:text-orange-800">
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white px-3 py-2 rounded-lg border border-orange-200 text-slate-800 break-all font-mono">
              {showKey ? newKey : "•".repeat(newKey.length)}
            </code>
            <button
              onClick={() => copyToClipboard(newKey, "newkey")}
              data-testid="copy-new-api-key"
              className="px-3 py-2 rounded-lg bg-orange-600 text-white text-xs font-semibold hover:bg-orange-700 whitespace-nowrap"
            >
              {copiedField === "newkey" ? <Check size={14} /> : <Copy size={14} />}
              {copiedField === "newkey" ? " Copiado" : " Copiar"}
            </button>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="text-[11px] text-orange-700 hover:underline mt-2"
          >
            Ya la copié, ocultar
          </button>
        </div>
      )}

      {/* Existing config */}
      {status?.has_api_key ? (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">API key (enmascarada)</p>
              <code className="text-xs bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 font-mono block">{status.api_key_masked}</code>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Eventos recibidos</p>
              <p className="text-lg font-bold text-slate-900">{status.events_count?.toLocaleString() || 0}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Último evento</p>
              <p className="text-xs text-slate-700">
                {status.last_event_at ? new Date(status.last_event_at).toLocaleString("es-CL", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"}) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Rotada</p>
              <p className="text-xs text-slate-700">
                {status.rotated_at ? new Date(status.rotated_at).toLocaleString("es-CL", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"}) : "—"}
              </p>
            </div>
          </div>

          {status.last_error && (
            <div className="text-xs bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg">
              ⚠ Último error: {status.last_error}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-slate-400 italic">Aún no hay API key generada para este workspace. Genera una para habilitar la ingestión externa.</p>
      )}

      {/* Endpoint URL */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Endpoint público (POST)</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-slate-800 break-all font-mono">
            {status?.endpoint_url}
          </code>
          <button
            onClick={() => copyToClipboard(status?.endpoint_url, "endpoint")}
            data-testid="copy-external-endpoint"
            className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 whitespace-nowrap"
          >
            {copiedField === "endpoint" ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      {/* Example payload */}
      <details className="border border-slate-200 rounded-xl">
        <summary className="px-4 py-2.5 text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-50">
          📋 Ver ejemplo de payload + curl
        </summary>
        <div className="p-4 border-t border-slate-200 space-y-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">JSON payload</p>
            <pre className="text-[11px] bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto font-mono leading-relaxed">
{JSON.stringify(status?.example_payload, null, 2)}
            </pre>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ejemplo curl</p>
              <button
                onClick={() => copyToClipboard(status?.example_curl, "curl")}
                className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-1"
              >
                {copiedField === "curl" ? <Check size={12} /> : <Copy size={12} />}
                {copiedField === "curl" ? "Copiado" : "Copiar"}
              </button>
            </div>
            <pre className="text-[11px] bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto font-mono leading-relaxed">
{status?.example_curl}
            </pre>
          </div>
          <p className="text-[11px] text-slate-500 italic">
            Headers obligatorios: <code className="bg-slate-100 px-1 rounded">Content-Type: application/json</code> y <code className="bg-slate-100 px-1 rounded">x-api-key: TU_API_KEY</code>. Rate limit: 60 req/min por key.
          </p>
        </div>
      </details>

      {/* Regenerate */}
      <div className="border-t border-slate-100 pt-4">
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            data-testid="external-regenerate-btn"
            className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-2"
          >
            <RefreshCw size={14} />
            {status?.has_api_key ? "Regenerar API key" : "Generar API key"}
          </button>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-xs text-red-700 font-semibold mb-2">
              {status?.has_api_key
                ? "⚠ Al regenerar, la API key actual dejará de funcionar inmediatamente. Todos los sistemas externos deberán actualizar su key."
                : "Se generará una nueva API key para este workspace."}
            </p>
            <div className="flex gap-2">
              <button
                onClick={regenerate}
                disabled={regenerating}
                data-testid="external-regenerate-confirm"
                className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
              >
                {regenerating ? <Loader2 size={12} className="animate-spin" /> : null}
                Sí, {status?.has_api_key ? "regenerar" : "generar"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs hover:bg-slate-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
