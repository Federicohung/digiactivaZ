import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Facebook,
  Instagram,
  MessageCircle,
  Loader2,
  Check,
  Unlink,
  AlertCircle,
  Lock,
  ArrowRight,
  RefreshCw,
  Zap,
  Activity,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { API } from "./constants";

const STATUS_META = {
  not_connected: { label: "No conectado", color: "bg-slate-100 text-slate-500" },
  pending: { label: "Pendiente OAuth", color: "bg-amber-100 text-amber-700" },
  connected: { label: "Conectado", color: "bg-green-100 text-green-700" },
  error: { label: "Error", color: "bg-red-100 text-red-700" },
};

const CHANNELS_META = {
  messenger: {
    label: "Facebook Messenger",
    Icon: Facebook,
    color: "text-[#0084FF]",
    bg: "bg-blue-50",
    description: "Recibe y responde DMs de tu página de Facebook desde el CRM.",
  },
  instagram: {
    label: "Instagram DM",
    Icon: Instagram,
    color: "text-pink-500",
    bg: "bg-pink-50",
    description: "Centraliza los DMs de tu cuenta business de Instagram.",
  },
  whatsapp: {
    label: "WhatsApp (vía Composio)",
    Icon: MessageCircle,
    color: "text-green-600",
    bg: "bg-green-50",
    description: "Alternativa rápida a la Cloud API: conecta tu WhatsApp en 1 click.",
  },
};

const StatusPill = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.not_connected;
  return (
    <span
      data-testid={`composio-status-${status}`}
      className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${m.color}`}
    >
      {m.label}
    </span>
  );
};

const WabaIdEditor = ({ currentValue, onSave }) => {
  const [value, setValue] = useState(currentValue || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setValue(currentValue || ""); }, [currentValue]);
  const changed = value.trim() !== (currentValue || "").trim();
  const doSave = async () => {
    setSaving(true);
    try {
      await onSave(value.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1.5">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
        WhatsApp Business Account ID (WABA)
      </p>
      <div className="flex gap-1.5">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ej: 123456789012345"
          data-testid="composio-waba-id-input"
          className="flex-1 px-2 py-1.5 rounded border border-slate-200 text-xs font-mono focus:border-blue-500 outline-none bg-white"
        />
        <button
          onClick={doSave}
          disabled={saving || !changed}
          data-testid="composio-waba-id-save"
          className="px-3 py-1.5 rounded bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-40 flex items-center gap-1"
        >
          {saving ? <Loader2 size={10} className="animate-spin" /> : saved ? <Check size={10} /> : null}
          {saved ? "OK" : "Guardar"}
        </button>
      </div>
      <p className="text-[10px] text-slate-400">
        Lo obtienes en Meta Business Suite → WhatsApp → Configuración. Requerido antes de Conectar.
      </p>
    </div>
  );
};

const ChannelCard = ({ channelKey, info, onConnect, onDisconnect, onSaveWabaId, busy }) => {
  const meta = CHANNELS_META[channelKey];
  const { Icon } = meta;
  const isConnected = info.status === "connected";
  const isPending = info.status === "pending";
  const hasError = info.status === "error";

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3" data-testid={`composio-card-${channelKey}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl ${meta.bg}`}>
            <Icon className={meta.color} size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold text-slate-900">{meta.label}</h4>
              <StatusPill status={info.status || "not_connected"} />
            </div>
            <p className="text-xs text-slate-500 mt-1">{meta.description}</p>
          </div>
        </div>
      </div>

      {info.connected_account_id && (
        <div className="text-[11px] text-slate-400 font-mono break-all bg-slate-50 px-3 py-2 rounded-lg">
          ID: {info.connected_account_id}
        </div>
      )}

      {hasError && info.last_error && (
        <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span className="break-words">{info.last_error}</span>
        </div>
      )}

      {channelKey === "whatsapp" && (
        <WabaIdEditor currentValue={info.waba_id} onSave={onSaveWabaId} />
      )}

      <div className="flex items-center gap-2 pt-1">
        {!isConnected && (
          <button
            onClick={() => onConnect(channelKey)}
            disabled={busy}
            data-testid={`composio-connect-${channelKey}`}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
            {isPending ? "Reintentar conexión" : "Conectar"}
          </button>
        )}
        {isConnected && (
          <button
            onClick={() => onDisconnect(channelKey)}
            disabled={busy}
            data-testid={`composio-disconnect-${channelKey}`}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium disabled:opacity-50"
          >
            <Unlink size={14} />
            Desconectar
          </button>
        )}
        {isConnected && <Check size={16} className="text-green-600" />}
      </div>
    </div>
  );
};

export const ComposioSection = ({ workspace, authHeaders, onRefresh }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyChannel, setBusyChannel] = useState(null);
  const [providerSaving, setProviderSaving] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/composio/status`, authHeaders());
      setData(res.data);
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.error(e);
      setData({ plan_allows: false, channels: {}, api_key_configured: false });
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  const syncWithComposio = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/composio/connections`, authHeaders());
      // /connections returns the same channels shape; merge into the local view
      setData((prev) => ({
        ...(prev || {}),
        channels: res.data.channels,
        // keep plan_allows/api_key/provider from /status if already loaded
      }));
    } catch (e) {
      const msg = e.response?.data?.detail || "No se pudo sincronizar con Composio";
      alert(msg);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Handle redirect-back from OAuth (?composio_status=connected&channel=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cs = params.get("composio_status");
    if (cs) {
      // refresh after the redirect lands
      fetchStatus();
      // clean URL params so they don't persist
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, [fetchStatus]);

  const handleConnect = async (channel) => {
    setBusyChannel(channel);
    try {
      const res = await axios.post(`${API}/composio/connect/${channel}`, null, authHeaders());
      const url = res.data.redirect_url;
      if (url) {
        // Open in new tab so the CRM stays as-is
        window.open(url, "_blank", "noopener");
      }
      // Optimistically refresh after a moment
      setTimeout(fetchStatus, 1500);
    } catch (e) {
      const msg = e.response?.data?.detail || "Error al iniciar conexión";
      alert(msg);
    } finally {
      setBusyChannel(null);
    }
  };

  const handleDisconnect = async (channel) => {
    if (!window.confirm(`¿Desconectar ${CHANNELS_META[channel].label}?`)) return;
    setBusyChannel(channel);
    try {
      await axios.delete(`${API}/composio/${channel}/disconnect`, authHeaders());
      await fetchStatus();
      if (onRefresh) onRefresh();
    } catch (e) {
      alert(e.response?.data?.detail || "Error al desconectar");
    } finally {
      setBusyChannel(null);
    }
  };

  const handleProvider = async (provider) => {
    setProviderSaving(true);
    try {
      await axios.put(`${API}/composio/whatsapp-provider`, { provider }, authHeaders());
      await fetchStatus();
      if (onRefresh) onRefresh();
    } catch (e) {
      alert(e.response?.data?.detail || "Error");
    } finally {
      setProviderSaving(false);
    }
  };

  const handleSaveWabaId = async (wabaId) => {
    try {
      await axios.put(`${API}/composio/whatsapp-waba-id`, { waba_id: wabaId }, authHeaders());
      await fetchStatus();
    } catch (e) {
      alert(e.response?.data?.detail || "No se pudo guardar el WABA ID");
      throw e;
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex items-center gap-3 text-slate-500">
        <Loader2 className="animate-spin" size={18} /> Cargando canales sociales…
      </div>
    );
  }

  const planAllows = data?.plan_allows;
  const channels = data?.channels || {};
  const provider = data?.whatsapp_provider || "cloud_api";

  return (
    <div className="space-y-4" data-testid="composio-section">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Canales Sociales (Composio)</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">
            Centraliza WhatsApp, Instagram y Messenger en un solo CRM. Conecta cada canal con un click — la
            autenticación se hace vía Composio, sin manejar tokens manualmente.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={syncWithComposio}
            disabled={!data?.api_key_configured}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="composio-sync"
            title={data?.api_key_configured ? "Trae el estado real desde Composio" : "Configura COMPOSIO_API_KEY primero"}
          >
            <RefreshCw size={12} /> Sincronizar con Composio
          </button>
          <button
            onClick={fetchStatus}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800"
            data-testid="composio-refresh"
          >
            <RefreshCw size={12} /> Refrescar
          </button>
        </div>
      </div>

      {!planAllows && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex items-start gap-3">
          <Lock size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Disponible desde plan Premium</p>
            <p className="text-amber-800/80 mt-0.5">
              Tu plan actual ({data?.plan || "—"}) no incluye Canales Sociales. Actualiza a Premium o Elite
              para conectar Instagram, Messenger y WhatsApp vía Composio.
            </p>
          </div>
        </div>
      )}

      {planAllows && !data?.api_key_configured && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-xl p-4 flex items-start gap-3" data-testid="composio-no-api-key">
          <AlertCircle size={18} className="text-blue-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Falta configurar la API key central de Composio</p>
            <p className="text-blue-800/80 mt-0.5">
              Pídele al equipo DigiActiva configurar <code className="bg-white px-1 rounded">COMPOSIO_API_KEY</code> en
              el servidor. Una vez configurada podrás conectar los canales aquí.
            </p>
          </div>
        </div>
      )}

      {/* WhatsApp provider toggle */}
      {planAllows && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="font-semibold text-slate-900 text-sm">Proveedor de WhatsApp activo</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Solo un proveedor a la vez puede recibir mensajes. Si cambias, los mensajes entrantes
                pasarán por el nuevo canal.
              </p>
            </div>
            <div className="flex gap-2 bg-slate-100 rounded-xl p-1" data-testid="whatsapp-provider-toggle">
              <button
                onClick={() => handleProvider("cloud_api")}
                disabled={providerSaving}
                data-testid="provider-cloud-api"
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition ${
                  provider === "cloud_api" ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Cloud API (Meta directo)
              </button>
              <button
                onClick={() => handleProvider("composio")}
                disabled={providerSaving}
                data-testid="provider-composio"
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition ${
                  provider === "composio" ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Composio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Channel cards */}
      {planAllows && (
        <div className="grid md:grid-cols-3 gap-4">
          {["messenger", "instagram", "whatsapp"].map((ch) => (
            <ChannelCard
              key={ch}
              channelKey={ch}
              info={channels[ch] || { status: "not_connected" }}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onSaveWabaId={handleSaveWabaId}
              busy={busyChannel === ch}
            />
          ))}
        </div>
      )}

      {/* Triggers + Webhook events panel */}
      {planAllows && data?.api_key_configured && (
        <TriggersPanel authHeaders={authHeaders} />
      )}

      <p className="text-[11px] text-slate-400 italic">
        Los mensajes entrantes se reciben en{" "}
        <code className="bg-slate-100 px-1 rounded">/api/composio/webhook</code> (verificado HMAC) y se
        unifican con tus contactos por phone / instagram_id / messenger_id.
      </p>
    </div>
  );
};


// ===================== Triggers Panel =====================
const STATUS_COLOR = {
  active: "bg-green-100 text-green-700",
  disabled: "bg-slate-100 text-slate-500",
  error: "bg-red-100 text-red-700",
  created: "bg-green-100 text-green-700",
  ok: "bg-green-100 text-green-700",
  skipped: "bg-amber-100 text-amber-700",
};

const TriggersPanel = ({ authHeaders }) => {
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupResult, setSetupResult] = useState(null);
  const [triggers, setTriggers] = useState([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState(null);

  const loadStatus = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/composio/triggers/status`, authHeaders());
      setTriggers(r.data.items || []);
      setWebhookUrl(r.data.webhook_url || "");
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.error(e);
    }
  }, [authHeaders]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const r = await axios.get(`${API}/composio/webhook-events?limit=20`, authHeaders());
      setEvents(r.data.items || []);
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.error(e);
    } finally {
      setEventsLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { loadStatus(); loadEvents(); }, [loadStatus, loadEvents]);

  const handleSetup = async (configs) => {
    setSetupBusy(true);
    setSetupResult(null);
    try {
      const body = configs ? {
        whatsapp_config: configs.whatsapp || undefined,
        instagram_config: configs.instagram || undefined,
        messenger_config: configs.messenger || undefined,
      } : {};
      const r = await axios.post(`${API}/composio/triggers/setup-mine`, body, authHeaders());
      setSetupResult(r.data);
      await loadStatus();
    } catch (e) {
      const msg = e.response?.data?.detail || "Error configurando triggers";
      setSetupResult({ error: msg });
    } finally {
      setSetupBusy(false);
    }
  };

  const handleSetupWithConfigs = (configs) => handleSetup(configs);

  // Diagnóstico: muestra TODOS los trigger types crudos para un canal
  const [diagChannel, setDiagChannel] = useState(null);
  const [diagData, setDiagData] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const fetchDiag = async (channel) => {
    setDiagLoading(true);
    setDiagChannel(channel);
    setDiagData(null);
    try {
      const r = await axios.get(`${API}/composio/triggers/raw-types?channel=${channel}`, authHeaders());
      setDiagData(r.data);
    } catch (e) {
      setDiagData({ error: e.response?.data?.detail || "Error consultando Composio" });
    } finally {
      setDiagLoading(false);
    }
  };
  const closeDiag = () => { setDiagChannel(null); setDiagData(null); };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4" data-testid="composio-triggers-panel">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h4 className="font-semibold text-slate-900 flex items-center gap-2">
            <Zap size={16} className="text-amber-500" /> Triggers automáticos
          </h4>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Registra los disparadores en Composio para que cada mensaje entrante (WhatsApp, Instagram,
            Messenger) se entregue automáticamente al webhook del CRM. No requiere proceso local.
          </p>
        </div>
        <button
          onClick={handleSetup}
          disabled={setupBusy}
          data-testid="composio-triggers-setup"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium shadow disabled:opacity-50"
        >
          {setupBusy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          Configurar triggers automáticamente
        </button>
      </div>

      {/* Diagnóstico — botones por canal */}
      <div className="flex flex-wrap gap-2 items-center text-xs">
        <span className="text-slate-500">Diagnóstico Composio:</span>
        {["instagram", "messenger"].map((ch) => (
          <button
            key={ch}
            onClick={() => fetchDiag(ch)}
            disabled={diagLoading}
            data-testid={`composio-diag-${ch}`}
            className="px-3 py-1 rounded-full border border-slate-300 hover:border-slate-500 text-slate-700 disabled:opacity-50"
          >
            Ver eventos disponibles ({ch})
          </button>
        ))}
      </div>

      {/* Modal-like inline panel con dump crudo */}
      {diagChannel && (
        <DiagPanel
          channel={diagChannel}
          data={diagData}
          loading={diagLoading}
          onClose={closeDiag}
        />
      )}


      {webhookUrl && (
        <div className="text-[11px] text-slate-500 bg-slate-50 px-3 py-2 rounded-lg break-all">
          <span className="text-slate-400">Webhook URL: </span>
          <code className="text-slate-700">{webhookUrl}</code>
        </div>
      )}

      {setupResult && !setupResult.error && (
        <NeedsConfigSection
          result={setupResult}
          onResubmit={handleSetupWithConfigs}
          busy={setupBusy}
        />
      )}

      {setupResult?.error && (
        <div className="text-xs p-3 rounded-lg border bg-red-50 border-red-200 text-red-700" data-testid="composio-triggers-setup-error">
          {setupResult.error}
        </div>
      )}

      {/* Triggers table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold grid grid-cols-12 gap-2">
          <div className="col-span-2">Canal</div>
          <div className="col-span-5">Slug</div>
          <div className="col-span-3">Trigger ID</div>
          <div className="col-span-2 text-right">Estado</div>
        </div>
        {triggers.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-slate-400" data-testid="composio-triggers-empty">
            Aún no hay triggers configurados. Pulsa "Configurar triggers automáticamente".
          </div>
        ) : (
          triggers.map((t) => (
            <div
              key={`${t.workspace_id}-${t.channel}`}
              className="px-3 py-2 text-xs grid grid-cols-12 gap-2 items-center border-t border-slate-100"
              data-testid={`composio-trigger-row-${t.channel}`}
            >
              <div className="col-span-2 font-medium text-slate-700 capitalize">{t.channel}</div>
              <div className="col-span-5 font-mono text-[11px] text-slate-500 truncate" title={t.slug}>
                {t.slug || "—"}
              </div>
              <div className="col-span-3 font-mono text-[11px] text-slate-400 truncate" title={t.trigger_id}>
                {t.trigger_id || "—"}
              </div>
              <div className="col-span-2 text-right">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLOR[t.status] || "bg-slate-100 text-slate-500"}`}>
                  {t.status || "—"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Webhook events viewer */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-3 py-2 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-2">
            <Activity size={12} /> Últimos webhooks recibidos
          </p>
          <button
            onClick={loadEvents}
            disabled={eventsLoading}
            data-testid="composio-events-refresh"
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-800"
          >
            <RefreshCw size={10} className={eventsLoading ? "animate-spin" : ""} /> Refrescar
          </button>
        </div>
        {events.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-slate-400" data-testid="composio-events-empty">
            Sin webhooks aún. Cuando llegue un mensaje real aparecerá aquí.
          </div>
        ) : (
          events.map((ev, idx) => {
            const key = `${ev.received_at}-${idx}`;
            const expanded = expandedEvent === key;
            const okPill = ev.parsed_ok ? "bg-green-100 text-green-700" : ev.hmac_ok === false ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";
            return (
              <div key={key} className="border-t border-slate-100" data-testid={`composio-event-row-${idx}`}>
                <button
                  onClick={() => setExpandedEvent(expanded ? null : key)}
                  className="w-full px-3 py-2 text-xs grid grid-cols-12 gap-2 items-center hover:bg-slate-50 text-left"
                >
                  <div className="col-span-1 text-slate-400">
                    {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </div>
                  <div className="col-span-3 font-mono text-[11px] text-slate-500">
                    {(ev.received_at || "").slice(11, 19)} UTC
                  </div>
                  <div className="col-span-2 capitalize">{ev.channel || "—"}</div>
                  <div className="col-span-4 font-mono text-[11px] text-slate-500 truncate" title={ev.trigger_slug}>
                    {ev.trigger_slug || "—"}
                  </div>
                  <div className="col-span-2 text-right">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${okPill}`}>
                      {ev.parsed_ok ? "parsed" : ev.hmac_ok === false ? "hmac fail" : "ignored"}
                    </span>
                  </div>
                </button>
                {expanded && (
                  <pre className="bg-slate-900 text-slate-100 text-[10px] p-3 overflow-x-auto max-h-64">
                    {JSON.stringify(ev.payload, null, 2)}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};



// ===================== Needs Config Section =====================
const STATUS_LABEL = {
  created: { color: "text-green-700 bg-green-50 border-green-200", label: "Creado" },
  ok: { color: "text-green-700 bg-green-50 border-green-200", label: "OK" },
  skipped: { color: "text-slate-600 bg-slate-50 border-slate-200", label: "Saltado" },
  needs_config: { color: "text-amber-800 bg-amber-50 border-amber-300", label: "Requiere configuración" },
  error: { color: "text-red-700 bg-red-50 border-red-200", label: "Error" },
};

const NeedsConfigSection = ({ result, onResubmit, busy }) => {
  // Estado por canal: { whatsapp: {field1: ""...}, ... }
  const [configs, setConfigs] = useState({});
  const entries = Object.entries(result.results || {});
  const needsConfigChannels = entries.filter(([, r]) => r.status === "needs_config");

  const setField = (ch, key, value) => {
    setConfigs((prev) => ({ ...prev, [ch]: { ...(prev[ch] || {}), [key]: value } }));
  };

  const canSubmit = needsConfigChannels.every(([ch, r]) =>
    (r.missing_fields || []).every((k) => !!(configs[ch] || {})[k])
  );

  return (
    <div className="space-y-3" data-testid="composio-triggers-setup-result">
      <p className="text-xs font-semibold text-slate-700">Resultado del setup:</p>
      <div className="space-y-2">
        {entries.map(([ch, r]) => {
          const meta = STATUS_LABEL[r.status] || { color: "text-slate-600 bg-slate-50 border-slate-200", label: r.status };
          return (
            <div
              key={ch}
              className={`p-3 rounded-lg border text-xs ${meta.color}`}
              data-testid={`trigger-result-${ch}`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="font-semibold capitalize">{ch}</p>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/50 font-semibold">
                  {meta.label}
                </span>
              </div>
              {r.slug_resolved && (
                <p className="font-mono text-[10px] mt-1 opacity-70">{r.slug_resolved}</p>
              )}
              {r.reason && <p className="mt-1 opacity-80">{r.reason}</p>}
              {r.error && <p className="mt-1 opacity-80">{String(r.error).slice(0, 200)}</p>}
              {r.trigger_id && <p className="font-mono text-[10px] mt-1 opacity-70">id: {r.trigger_id}</p>}

              {/* Form dinámico para campos requeridos */}
              {r.status === "needs_config" && (
                <div className="mt-2 space-y-1.5 bg-white/60 p-2 rounded">
                  <p className="text-[10px] uppercase tracking-wider opacity-60">
                    Campos requeridos para este trigger:
                  </p>
                  {(r.missing_fields || []).map((field) => (
                    <div key={field}>
                      <label className="block text-[11px] font-medium mb-0.5">{field}</label>
                      <input
                        type="text"
                        value={(configs[ch] || {})[field] || ""}
                        onChange={(e) => setField(ch, field, e.target.value)}
                        placeholder={`Ingresa ${field}`}
                        data-testid={`trigger-config-${ch}-${field}`}
                        className="w-full px-2 py-1.5 rounded border border-amber-300 text-xs font-mono bg-white outline-none focus:border-amber-500"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {needsConfigChannels.length > 0 && (
        <button
          onClick={() => onResubmit(configs)}
          disabled={!canSubmit || busy}
          data-testid="composio-triggers-resubmit"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium shadow disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          Reintentar con configuración
        </button>
      )}
    </div>
  );
};


// ===================== Diagnostic Panel =====================
const DiagPanel = ({ channel, data, loading, onClose }) => {
  const [expandedItem, setExpandedItem] = useState(null);

  return (
    <div
      className="bg-slate-900 text-slate-100 rounded-xl p-4 space-y-3 border border-slate-700"
      data-testid={`composio-diag-panel-${channel}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold capitalize">
            Diagnóstico Composio · {channel}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Lista TODOS los trigger types crudos para identificar el slug real.
          </p>
        </div>
        <button
          onClick={onClose}
          data-testid={`composio-diag-close-${channel}`}
          className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600"
        >
          Cerrar
        </button>
      </div>

      {loading && (
        <div className="text-xs text-slate-300 flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" /> Consultando Composio…
        </div>
      )}

      {data?.error && (
        <div className="text-xs text-red-300 bg-red-900/40 p-2 rounded">{data.error}</div>
      )}

      {data && !data.error && (
        <>
          {/* Resumen por toolkit */}
          <div className="space-y-1 text-[11px]">
            <p className="text-slate-400 uppercase tracking-wider font-semibold">
              Resumen por toolkit (variantes probadas):
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
              {Object.entries(data.summary_per_toolkit || {}).map(([tk, s]) => (
                <div
                  key={tk}
                  className={`p-2 rounded border ${
                    s.error
                      ? "border-red-800 bg-red-900/30"
                      : s.count > 0
                        ? "border-green-800 bg-green-900/30"
                        : "border-slate-700 bg-slate-800/40"
                  }`}
                  data-testid={`composio-diag-toolkit-${channel}-${tk}`}
                >
                  <p className="font-mono text-[11px] text-slate-200">{tk}</p>
                  <p className="text-[10px] text-slate-400">
                    {s.error ? `error: ${s.error.slice(0, 80)}` : `${s.count} triggers`}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-300 mt-2">
              Total: <strong>{data.total_triggers}</strong> triggers ·{" "}
              Inbound candidatos: <strong>{data.inbound_candidates_count}</strong>
            </p>
          </div>

          {/* Lista de triggers */}
          {data.total_triggers === 0 ? (
            <div className="bg-amber-900/40 border border-amber-700 text-amber-200 p-3 rounded text-xs">
              ⚠️ Composio NO devolvió ningún trigger para las variantes probadas. Esto sugiere que
              tu cuenta de Composio no tiene triggers expuestos para <strong>{channel}</strong>, o
              que el toolkit usa un slug distinto. Revisa{" "}
              <a
                href="https://platform.composio.dev/triggers"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                el dashboard Composio → Triggers
              </a>{" "}
              para ver el catálogo real de tu proyecto.
            </div>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto" data-testid={`composio-diag-items-${channel}`}>
              {(data.all_items || []).map((item, idx) => {
                const expanded = expandedItem === idx;
                return (
                  <div
                    key={idx}
                    className={`border rounded p-2 ${
                      item.is_inbound_message_candidate
                        ? "border-green-700 bg-green-900/30"
                        : "border-slate-700 bg-slate-800/40"
                    }`}
                  >
                    <button
                      onClick={() => setExpandedItem(expanded ? null : idx)}
                      className="w-full text-left flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-mono text-[11px] text-slate-200 break-all">
                            {item.slug || "(sin slug)"}
                          </p>
                          {item.is_inbound_message_candidate && (
                            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-700 text-white">
                              MATCH
                            </span>
                          )}
                          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                            {item.toolkit}
                          </span>
                        </div>
                        {item.name && (
                          <p className="text-[11px] text-slate-300 mt-0.5">{item.name}</p>
                        )}
                        {item.description && (
                          <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">
                            {item.description}
                          </p>
                        )}
                        {!item.is_inbound_message_candidate && item.discard_reason && (
                          <p className="text-[10px] text-amber-300/80 mt-0.5 italic">
                            descartado: {item.discard_reason}
                          </p>
                        )}
                      </div>
                      <span className="text-slate-500 text-xs shrink-0">
                        {expanded ? "▼" : "▶"}
                      </span>
                    </button>
                    {expanded && (
                      <div className="mt-2 space-y-1 border-t border-slate-700 pt-2">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                          Config schema:
                        </p>
                        <pre className="bg-slate-950 p-2 rounded text-[10px] overflow-x-auto">
                          {JSON.stringify(item.config_schema || {}, null, 2)}
                        </pre>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-2">
                          Raw keys disponibles:
                        </p>
                        <p className="font-mono text-[10px] text-slate-300">
                          {(item.raw_keys || []).join(", ") || "—"}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

