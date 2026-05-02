import { Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { INTEREST_STYLES } from "./constants";

export const AISummaryBlock = ({ summary, generatedAt, loading, onRefresh }) => {
  const interest = summary?.nivel_interes ? INTEREST_STYLES[summary.nivel_interes] || INTEREST_STYLES.tibio : null;
  return (
    <div data-testid="ai-summary-block" className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-orange-50/40 px-6 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="text-orange-500" size={16} />
          <h4 className="text-sm font-semibold text-slate-800">Resumen IA</h4>
          {generatedAt && (
            <span className="text-[10px] text-slate-400">
              {new Date(generatedAt).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          data-testid="ai-summary-refresh"
          className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {loading ? "Generando..." : "Actualizar"}
        </button>
      </div>

      {loading && !summary ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-3">
          <Loader2 size={14} className="animate-spin" />
          Analizando conversación...
        </div>
      ) : summary ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {/* Necesidad */}
          <div className="bg-white rounded-xl border border-slate-100 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Necesidad detectada</p>
            <p className="text-sm text-slate-800" data-testid="summary-necesidad">{summary.necesidad_detectada || "—"}</p>
          </div>

          {/* Nivel interés */}
          <div className="bg-white rounded-xl border border-slate-100 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Nivel de interés</p>
            <div className="flex items-center gap-2" data-testid="summary-interes">
              {interest && (
                <>
                  <span className={`w-2 h-2 rounded-full ${interest.dot}`} />
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${interest.bg} ${interest.text}`}>
                    {interest.label}
                  </span>
                </>
              )}
              {typeof summary.nivel_interes_score === "number" && (
                <span className="text-sm text-slate-700 font-semibold">{summary.nivel_interes_score}/100</span>
              )}
            </div>
          </div>

          {/* Plan recomendado */}
          <div className="bg-white rounded-xl border border-slate-100 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Plan recomendado</p>
            <p className="text-sm text-slate-800 font-semibold" data-testid="summary-plan">{summary.plan_recomendado || "Sin recomendación aún"}</p>
            {summary.razon_plan && <p className="text-[11px] text-slate-500 mt-0.5">{summary.razon_plan}</p>}
          </div>

          {/* Próxima acción */}
          <div className="bg-white rounded-xl border border-orange-200 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-600 mb-1">⚡ Próxima acción</p>
            <p className="text-sm text-slate-800 font-medium" data-testid="summary-accion">{summary.proxima_accion || "—"}</p>
          </div>

          {/* Datos faltantes (full row) */}
          {Array.isArray(summary.datos_faltantes) && summary.datos_faltantes.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200 p-3 sm:col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 mb-1.5">⚠ Datos faltantes</p>
              <div className="flex flex-wrap gap-1.5" data-testid="summary-faltantes">
                {summary.datos_faltantes.map((d, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
