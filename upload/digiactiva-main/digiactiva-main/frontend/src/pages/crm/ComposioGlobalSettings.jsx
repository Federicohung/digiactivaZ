import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  KeyRound,
  Loader2,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Plug,
  Trash2,
  AlertTriangle,
  Globe,
  Save,
} from "lucide-react";
import { API } from "./constants";

const SourceBadge = ({ source }) => {
  if (!source) return null;
  const meta = source === "db"
    ? { label: "Guardado en DB", color: "bg-green-100 text-green-700" }
    : { label: ".env (deploy)", color: "bg-blue-100 text-blue-700" };
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${meta.color}`}>
      {meta.label}
    </span>
  );
};

const SecretField = ({ label, value, onChange, currentSet, currentPreview, source, placeholder, testid }) => {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold text-slate-700">{label}</label>
        <SourceBadge source={source} />
      </div>
      {currentSet && (
        <p className="text-[11px] text-slate-400 mb-2 font-mono" data-testid={`${testid}-preview`}>
          Actual: <span className="text-slate-600">{currentPreview}</span>
        </p>
      )}
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          data-testid={testid}
          className="w-full px-3 py-2 pr-10 rounded-lg border border-slate-200 text-sm font-mono focus:border-blue-500 outline-none"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
          aria-label={show ? "Ocultar" : "Mostrar"}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
};

export const ComposioGlobalSettings = ({ authHeaders }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingUrl, setSavingUrl] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [savedAt, setSavedAt] = useState(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/admin/settings/composio`, authHeaders());
      setData(res.data);
      setPublicUrl(res.data.public_url_override || res.data.public_url || "");
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.error(e);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    if (!apiKey.trim() && !webhookSecret.trim()) {
      alert("Pega al menos uno de los dos campos.");
      return;
    }
    setSaving(true);
    setTestResult(null);
    try {
      const body = {};
      if (apiKey.trim()) body.api_key = apiKey.trim();
      if (webhookSecret.trim()) body.webhook_secret = webhookSecret.trim();
      const res = await axios.put(`${API}/admin/settings/composio`, body, authHeaders());
      setData(res.data);
      setApiKey("");
      setWebhookSecret("");
      setSavedAt(new Date());
    } catch (e) {
      alert(e.response?.data?.detail || "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const handleSavePublicUrl = async () => {
    setSavingUrl(true);
    try {
      const trimmed = publicUrl.trim();
      const body = trimmed ? { public_url: trimmed } : { clear_public_url: true };
      const res = await axios.put(`${API}/admin/settings/composio`, body, authHeaders());
      setData(res.data);
      setPublicUrl(res.data.public_url_override || res.data.public_url || "");
      setSavedAt(new Date());
    } catch (e) {
      alert(e.response?.data?.detail || "Error guardando URL");
    } finally {
      setSavingUrl(false);
    }
  };

  const handleClear = async (which) => {
    if (!window.confirm(`¿Borrar ${which === "api_key" ? "la API key" : "el webhook secret"}?`)) return;
    try {
      const body = {};
      body[`clear_${which}`] = true;
      const res = await axios.put(`${API}/admin/settings/composio`, body, authHeaders());
      setData(res.data);
    } catch (e) {
      alert(e.response?.data?.detail || "Error");
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await axios.post(`${API}/admin/settings/composio/test`, null, authHeaders());
      setTestResult(res.data);
    } catch (e) {
      setTestResult({ ok: false, error: e.response?.data?.detail || "Error" });
    } finally {
      setTesting(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex items-center gap-3 text-slate-500">
        <Loader2 className="animate-spin" size={18} /> Cargando configuración Composio…
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5" data-testid="composio-global-settings">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-50">
              <KeyRound className="text-blue-600" size={18} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Configuración Global Composio</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Credenciales centralizadas para toda la plataforma. Solo el founder puede modificarlas. Las claves
            se guardan encriptadas en MongoDB y no se loguean en consola.
          </p>
        </div>
        <button
          onClick={fetchSettings}
          className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1.5"
          data-testid="composio-settings-refresh"
        >
          <RefreshCw size={12} /> Refrescar
        </button>
      </div>

      {/* Public URL editable + warning si es preview */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3" data-testid="composio-public-url-block">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-slate-500" />
          <p className="text-sm font-semibold text-slate-700">Dominio público del backend</p>
          {data.public_url_source && (
            <SourceBadge source={data.public_url_source} />
          )}
        </div>
        <p className="text-[11px] text-slate-500 -mt-1">
          De aquí derivamos el webhook URL y el callback OAuth. Si tu deploy quedó con un dominio incorrecto
          (ej: preview), sobreescribe aquí sin tocar el `.env` del servidor.
        </p>

        <div className="flex flex-col md:flex-row md:items-end gap-2">
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              BACKEND_PUBLIC_URL
            </label>
            <input
              value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)}
              placeholder="https://www.digiactiva.com"
              data-testid="composio-public-url-input"
              className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:border-blue-500 outline-none"
            />
          </div>
          <button
            onClick={handleSavePublicUrl}
            disabled={savingUrl}
            data-testid="composio-public-url-save"
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2 h-fit"
          >
            {savingUrl ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar URL
          </button>
        </div>

        {data.is_preview_domain && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-xs" data-testid="composio-preview-warning">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="text-amber-900">
              <p className="font-semibold">⚠ Estás usando un dominio de preview</p>
              <p className="mt-1 text-amber-800">
                Meta (Facebook/Instagram/WhatsApp) requiere dominios verificados para OAuth. El flujo
                "Conectar" probablemente fallará desde un dominio <code className="bg-white px-1 rounded">preview.emergentagent.com</code>.
                Cambia este valor a <code className="bg-white px-1 rounded">https://www.digiactiva.com</code> y guarda.
              </p>
            </div>
          </div>
        )}

        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
            Webhook URL para Composio Dashboard
          </p>
          <code className="block bg-white px-3 py-2 rounded border border-slate-200 text-slate-800 text-xs break-all" data-testid="composio-webhook-url-display">
            {data.webhook_url_hint}
          </code>
          <p className="text-[10px] text-slate-400 mt-1.5">
            Pégala en Composio Dashboard → Triggers → Create Webhook. Cuando lo crees, te darán el
            <code className="bg-white px-1 mx-1 rounded">webhook secret</code> — pégalo abajo.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <SecretField
          label="COMPOSIO_API_KEY"
          value={apiKey}
          onChange={setApiKey}
          currentSet={data.api_key_set}
          currentPreview={data.api_key_preview}
          source={data.api_key_source}
          placeholder={data.api_key_set ? "Pega para reemplazar…" : "co_xxxxxxxxxxxxxxxxxxxxxxxx"}
          testid="composio-api-key-input"
        />
        <SecretField
          label="COMPOSIO_WEBHOOK_SECRET"
          value={webhookSecret}
          onChange={setWebhookSecret}
          currentSet={data.webhook_secret_set}
          currentPreview={data.webhook_secret_preview}
          source={data.webhook_secret_source}
          placeholder={data.webhook_secret_set ? "Pega para reemplazar…" : "whsec_xxxxxxxxxxxx"}
          testid="composio-webhook-secret-input"
        />
      </div>

      {/* Auth configs (read-only, from env) */}
      <div>
        <p className="text-xs font-semibold text-slate-700 mb-2">Auth Configs (Composio Dashboard)</p>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(data.auth_configs || {}).map(([ch, id]) => (
            <div key={ch} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{ch}</p>
              <p className="text-xs font-mono text-slate-700 mt-1 truncate" title={id}>{id || "—"}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5 italic">
          Estos IDs vienen de las Auth Configs creadas en Composio. Se configuran vía variables de entorno
          (no se cambian a menudo).
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving || (!apiKey.trim() && !webhookSecret.trim())}
            data-testid="composio-settings-save"
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 shadow"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Guardar
          </button>
          <button
            onClick={handleTest}
            disabled={testing || !data.api_key_set}
            data-testid="composio-settings-test"
            title={data.api_key_set ? "Hace un GET a Composio con la key actual" : "Guarda primero una API key"}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 disabled:opacity-50"
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
            Probar conexión
          </button>
          {data.api_key_set && data.api_key_source === "db" && (
            <button
              onClick={() => handleClear("api_key")}
              data-testid="composio-clear-api-key"
              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
            >
              <Trash2 size={11} /> Borrar API key
            </button>
          )}
          {data.webhook_secret_set && data.webhook_secret_source === "db" && (
            <button
              onClick={() => handleClear("webhook_secret")}
              data-testid="composio-clear-webhook-secret"
              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
            >
              <Trash2 size={11} /> Borrar webhook secret
            </button>
          )}
        </div>
        {data.updated_at && (
          <p className="text-[11px] text-slate-400">
            Actualizado: {new Date(data.updated_at).toLocaleString("es-CL")} por {data.updated_by || "—"}
          </p>
        )}
      </div>

      {savedAt && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-xl flex items-center gap-2">
          <Check size={14} /> Guardado a las {savedAt.toLocaleTimeString("es-CL")}
        </div>
      )}

      {testResult && (
        <div
          data-testid="composio-test-result"
          className={`rounded-xl p-3 text-xs flex items-start gap-2 ${
            testResult.ok ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {testResult.ok ? <Check size={14} className="mt-0.5" /> : <AlertCircle size={14} className="mt-0.5" />}
          <div className="break-all">
            <p className="font-semibold">
              {testResult.ok ? `✓ Conexión OK (HTTP ${testResult.status_code})` : `✗ Error (HTTP ${testResult.status_code || "—"})`}
            </p>
            {testResult.body_preview && <p className="mt-1 font-mono opacity-80">{testResult.body_preview}</p>}
            {testResult.error && <p className="mt-1 font-mono opacity-80">{testResult.error}</p>}
          </div>
        </div>
      )}
    </div>
  );
};
