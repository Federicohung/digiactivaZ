import {
  Users,
  Plus,
  Calendar,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Target,
  Sparkles,
  RefreshCw,
  Loader2,
  Bot,
  Phone,
  MessageCircle,
  Play,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { formatCurrency, getGreeting } from "./constants";

// Cliente status bar — visible para workspace_admin para responder de un vistazo
// "¿está todo activo?" (agente / WhatsApp / Bandeja / Leads).
const ClientStatusBar = ({ workspace, metrics, summaryUnread, onProbarAgente }) => {
  const integrations = workspace?.integrations || {};
  const wa = integrations.whatsapp || {};
  const wp = integrations.whatsapp_provider || "cloud_api";
  const composioWa = (integrations.composio || {}).whatsapp_composio || {};
  const sofia = integrations.sofia || {};
  const waConnected = wp === "composio"
    ? composioWa.status === "connected"
    : (wa.status === "connected" || (wa.access_token && wa.phone_number_id));
  const sofiaConnected = sofia.status === "connected" || !!sofia.agent_id;
  const Pill = ({ ok, label, icon: Icon, testid }) => (
    <div data-testid={testid} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
      ok ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200"
    }`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${ok ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}>
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold leading-none">{label}</p>
        <p className={`text-xs font-bold mt-0.5 ${ok ? "text-green-700" : "text-slate-500"}`}>
          {ok ? "Activo" : "Pendiente"}
        </p>
      </div>
      {ok ? <CheckCircle2 size={14} className="text-green-600 shrink-0" /> : <XCircle size={14} className="text-slate-300 shrink-0" />}
    </div>
  );
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4" data-testid="client-status-bar">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">Estado de tu cuenta</h3>
          <p className="text-xs text-slate-500 mt-0.5">Resumen rápido de los canales y actividad reciente.</p>
        </div>
        <button
          onClick={onProbarAgente}
          data-testid="hoy-probar-agente"
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow"
        >
          <Play size={12} /> Probar agente
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Pill ok={true} label="Agente IA" icon={Bot} testid="status-agent" />
        <Pill ok={waConnected} label="WhatsApp" icon={Phone} testid="status-whatsapp" />
        <Pill ok={sofiaConnected} label="SOFIA voz" icon={MessageCircle} testid="status-sofia" />
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50" data-testid="status-leads">
          <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
            <Users size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold leading-none">Leads activos</p>
            <p className="text-xs font-bold text-blue-700 mt-0.5">
              {metrics?.prospectos_activos || 0}
              {summaryUnread > 0 && <span className="ml-2 text-amber-600">· {summaryUnread} sin leer</span>}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const ActivityChip = ({ label, value, icon: Icon }) => (
  <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3">
    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
      <Icon size={16} className="text-slate-500" />
    </div>
    <div>
      <p className="text-xs text-slate-400 leading-none">{label}</p>
      <p className="text-base font-bold text-slate-900 mt-0.5">{value}</p>
    </div>
  </div>
);

const MetricCard = ({ label, value, icon: Icon, color, subtitle, progress }) => {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
  };
  const progressColors = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    purple: "bg-purple-500",
    orange: "bg-orange-500",
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl ${colors[color]} flex items-center justify-center`}>
          <Icon size={20} />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
        {value}
      </p>
      <p className="text-sm text-slate-500 mt-1">{label}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      {typeof progress === "number" && (
        <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full ${progressColors[color]} transition-all`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
};

const AlertItem = ({ label, count, color }) => {
  const colors = {
    red: "bg-red-100 text-red-600",
    amber: "bg-amber-100 text-amber-600",
    purple: "bg-purple-100 text-purple-600",
    blue: "bg-blue-100 text-blue-600",
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors[color]}`}>
        {count}
      </span>
    </div>
  );
};

export const HoySection = ({ metrics, priorities, hotLeads, aiLogs, onNewLead, onRefresh, onSelectContact, loading, currentUser, activeWorkspace, summaryUnread, onProbarAgente }) => {
  const today = new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
  const isFounder = currentUser?.role === "founder_admin";
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
            {getGreeting()}
          </h2>
          <p className="text-slate-500 mt-1 capitalize">{today}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-sm font-medium"
            data-testid="hoy-refresh-btn"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
          <button
            onClick={onNewLead}
            className="flex items-center gap-2 px-6 py-2 rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-colors text-sm font-medium shadow-lg shadow-orange-500/25"
            data-testid="new-lead-btn"
          >
            <Plus size={18} />
            Nuevo Lead
          </button>
        </div>
      </div>

      {/* Status bar visible para clients (workspace_admin); también útil al founder */}
      {!isFounder && (
        <ClientStatusBar
          workspace={activeWorkspace}
          metrics={metrics}
          summaryUnread={summaryUnread}
          onProbarAgente={onProbarAgente}
        />
      )}

      {/* Today Activity Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ActivityChip label="Leads hoy" value={metrics?.actividad_hoy?.leads_nuevos || 0} icon={Users} />
        <ActivityChip label="Acciones hoy" value={metrics?.actividad_hoy?.eventos || 0} icon={Calendar} />
        <ActivityChip label="IA usada hoy" value={metrics?.actividad_hoy?.ai_calls || 0} icon={Sparkles} />
        <ActivityChip label="Tasa conversión" value={`${metrics?.tasa_conversion || 0}%`} icon={Target} />
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Prospectos Activos"
          value={metrics?.prospectos_activos || 0}
          icon={Users}
          color="blue"
        />
        <MetricCard
          label="Revenue Potencial"
          value={formatCurrency(metrics?.revenue_potencial || 0)}
          icon={DollarSign}
          color="green"
          subtitle={`Ponderado: ${formatCurrency(metrics?.revenue_ponderado || 0)}`}
        />
        <MetricCard
          label="MRR Actual"
          value={formatCurrency(metrics?.mrr_actual || 0)}
          icon={TrendingUp}
          color="purple"
          subtitle={`${metrics?.cierres_mes || 0} cierres este mes`}
        />
        <MetricCard
          label="Meta Mensual"
          value={`${metrics?.porcentaje_meta || 0}%`}
          icon={Target}
          color="orange"
          subtitle={formatCurrency(metrics?.meta_mensual || 0)}
          progress={metrics?.porcentaje_meta || 0}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Prioridades del día */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="text-blue-500" size={20} />
            <h3 className="font-semibold text-slate-900">Prioridades del Día</h3>
            <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">IA</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-slate-400" size={24} />
            </div>
          ) : priorities?.length > 0 ? (
            <ul className="space-y-3">
              {priorities.map((priority, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {index + 1}
                  </span>
                  <span className="text-sm text-slate-700">{priority}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-400 text-sm py-4">No hay prioridades generadas aún. Agrega leads para ver recomendaciones.</p>
          )}
          {aiLogs?.stats?.total_calls > 0 && (
            <p className="text-xs text-slate-400 mt-4 pt-4 border-t border-slate-100">
              {aiLogs.stats.total_calls} llamadas IA · {aiLogs.stats.total_tokens?.toLocaleString()} tokens · ~${aiLogs.stats.estimated_cost_usd} USD ({aiLogs.stats.model})
            </p>
          )}
        </div>

        {/* Alertas */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="text-amber-500" size={20} />
            <h3 className="font-semibold text-slate-900">Alertas</h3>
          </div>

          <div className="space-y-3">
            {metrics?.alertas?.sin_tocar_3_dias > 0 && (
              <AlertItem
                label="Sin tocar +3 días"
                count={metrics.alertas.sin_tocar_3_dias}
                color="red"
              />
            )}
            {metrics?.alertas?.total_propuesta > 0 && (
              <AlertItem
                label="Propuestas pendientes"
                count={metrics.alertas.total_propuesta}
                color="purple"
              />
            )}
            {metrics?.alertas?.total_cierre > 0 && (
              <AlertItem
                label="Por cerrar"
                count={metrics.alertas.total_cierre}
                color="amber"
              />
            )}
            {metrics?.alertas?.total_nuevo > 0 && (
              <AlertItem
                label="Leads nuevos"
                count={metrics.alertas.total_nuevo}
                color="blue"
              />
            )}
            {!metrics?.alertas?.sin_tocar_3_dias && !metrics?.alertas?.total_propuesta && !metrics?.alertas?.total_cierre && !metrics?.alertas?.total_nuevo && (
              <p className="text-slate-400 text-sm">Todo en orden 🎉</p>
            )}
          </div>
        </div>
      </div>

      {/* Negocios Calientes */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="text-green-500" size={20} />
            <h3 className="font-semibold text-slate-900">Negocios más Calientes</h3>
          </div>
        </div>

        {hotLeads?.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {hotLeads.map((lead) => (
              <button
                key={lead.id}
                onClick={() => onSelectContact && onSelectContact(lead)}
                className="text-left p-4 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 hover:border-green-300 hover:shadow-md transition-all"
                data-testid={`hot-lead-${lead.id}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-semibold text-slate-900">{lead.empresa}</h4>
                  <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                    {lead.probabilidad_cierre}%
                  </span>
                </div>
                <p className="text-sm text-slate-500 mb-2">{lead.nombre}</p>
                <p className="text-lg font-bold text-green-600">
                  {formatCurrency(lead.valor_mensual)}/mes
                </p>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-slate-400 text-sm">No hay leads calientes aún.</p>
        )}
      </div>
    </div>
  );
};
