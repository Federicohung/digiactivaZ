import { useState } from "react";
import { Plus, Clock, GripVertical, Loader2 } from "lucide-react";
import { STAGES, formatCurrency } from "./constants";

export const PipelineSection = ({ pipeline, totals, onMoveContact, onSelectContact, onNewLead, loading }) => {
  const [draggedContact, setDraggedContact] = useState(null);
  const [hoverStage, setHoverStage] = useState(null);

  const handleDragStart = (e, contact) => {
    setDraggedContact(contact);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", contact.id); } catch (err) {}
  };

  const handleDragOver = (e, stage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (hoverStage !== stage) setHoverStage(stage);
  };

  const handleDragLeave = () => setHoverStage(null);

  const handleDrop = (e, newStage) => {
    e.preventDefault();
    if (draggedContact && draggedContact.etapa !== newStage) {
      onMoveContact(draggedContact.id, newStage);
    }
    setDraggedContact(null);
    setHoverStage(null);
  };

  const totalPipelineValue = Object.entries(totals || {})
    .filter(([s]) => ["nuevo", "trabajando", "propuesta", "cierre"].includes(s))
    .reduce((acc, [, v]) => acc + (v?.value || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
            Pipeline
          </h2>
          <p className="text-slate-500 mt-1">
            Pipeline activo · <span className="font-semibold text-slate-700">{formatCurrency(totalPipelineValue)}</span>
          </p>
        </div>
        <button
          onClick={onNewLead}
          className="flex items-center gap-2 px-6 py-2 rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-colors text-sm font-medium shadow-lg shadow-orange-500/25"
          data-testid="new-lead-btn-pipeline"
        >
          <Plus size={18} />
          Nuevo Lead
        </button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const isHover = hoverStage === stage.id;
          const stageContacts = pipeline?.[stage.id] || [];
          const stageTotal = totals?.[stage.id] || { count: stageContacts.length, value: 0 };
          return (
            <div
              key={stage.id}
              className="flex-shrink-0 w-72"
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.id)}
              data-testid={`pipeline-col-${stage.id}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                <h3 className="font-semibold text-slate-700 text-sm">{stage.label}</h3>
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {stageTotal.count}
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-2 ml-4">
                {formatCurrency(stageTotal.value || 0)}
              </p>

              <div className={`space-y-3 min-h-[400px] rounded-2xl p-3 transition-all ${
                isHover ? "bg-orange-50 ring-2 ring-orange-300" : "bg-slate-50"
              }`}>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="animate-spin text-slate-400" size={20} />
                  </div>
                ) : stageContacts.length > 0 ? (
                  stageContacts.map((contact) => (
                    <div
                      key={contact.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, contact)}
                      onClick={() => onSelectContact(contact)}
                      className={`bg-white rounded-xl p-4 border border-slate-200 hover:border-orange-300 hover:shadow-md transition-all cursor-pointer group ${
                        draggedContact?.id === contact.id ? "opacity-40" : ""
                      }`}
                      data-testid={`pipeline-card-${contact.id}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold text-slate-900 text-sm truncate flex-1">{contact.empresa}</h4>
                        <GripVertical size={16} className="text-slate-300 group-hover:text-slate-400 flex-shrink-0" />
                      </div>
                      <p className="text-xs text-slate-500 mb-3 truncate">{contact.nombre}</p>

                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-green-600">
                          {formatCurrency(contact.valor_mensual)}
                        </span>
                        {contact.probabilidad_cierre > 0 && (
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            {contact.probabilidad_cierre}%
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-2 text-xs">
                        <span className="text-slate-400 capitalize">{contact.fuente}</span>
                        {contact.dias_en_etapa > 3 && (
                          <span className="flex items-center gap-1 text-amber-600 ml-auto">
                            <Clock size={11} />
                            {contact.dias_en_etapa}d
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-300 text-xs text-center py-8">Suelta aquí</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
