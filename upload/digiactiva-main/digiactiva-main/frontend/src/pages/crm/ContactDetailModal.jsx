import { useState, useEffect } from "react";
import axios from "axios";
import {
  Phone,
  Mail,
  MessageCircle,
  ArrowRight,
  X,
  Check,
  Sparkles,
  Edit2,
  Trash2,
  Copy,
  FileText,
  Plus,
  Target,
  Calendar,
  Loader2,
} from "lucide-react";
import { API, STAGES, SOURCES } from "./constants";
import { FormField, FormSelect } from "./FormFields";
import { AISummaryBlock } from "./AISummaryBlock";
import { WhatsAppComposer } from "./WhatsAppComposer";

const TIMELINE_TYPES = [
  { id: "nota", label: "Nota", icon: FileText, color: "text-purple-500", bg: "bg-purple-50" },
  { id: "llamada", label: "Llamada", icon: Phone, color: "text-green-600", bg: "bg-green-50" },
  { id: "reunion", label: "Reunión", icon: Calendar, color: "text-amber-600", bg: "bg-amber-50" },
  { id: "email", label: "Email", icon: Mail, color: "text-blue-600", bg: "bg-blue-50" },
  { id: "propuesta", label: "Propuesta", icon: FileText, color: "text-orange-600", bg: "bg-orange-50" },
];

const TimelineComposer = ({ contactId, authHeaders, onAdded }) => {
  const [tipo, setTipo] = useState("nota");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    const t = text.trim();
    if (!t) return;
    setSaving(true);
    setError(null);
    try {
      await axios.post(`${API}/crm/timeline`, {
        contact_id: contactId,
        tipo,
        descripcion: t,
      }, authHeaders ? authHeaders() : {});
      setText("");
      setTipo("nota");
      onAdded && onAdded();
    } catch (e) {
      setError(e.response?.data?.detail || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100" data-testid="timeline-composer">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {TIMELINE_TYPES.map(t => (
          <button
            key={t.id}
            onClick={() => setTipo(t.id)}
            data-testid={`timeline-type-${t.id}`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tipo === t.id
                ? `${t.bg} ${t.color} ring-2 ring-offset-1 ring-current`
                : "bg-white text-slate-500 hover:text-slate-700"
            }`}
          >
            <t.icon size={13} />
            {t.label}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={`Escribe el seguimiento (${TIMELINE_TYPES.find(t => t.id === tipo)?.label.toLowerCase()})...`}
        disabled={saving}
        data-testid="timeline-composer-input"
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-orange-500 resize-y bg-white"
      />
      <div className="flex items-center justify-between mt-2">
        <p className="text-[11px] text-slate-400">
          {text.length > 0 ? `${text.length} caracteres` : "Quedará registrado en el historial del cliente"}
        </p>
        <button
          onClick={handleSave}
          disabled={!text.trim() || saving}
          data-testid="timeline-composer-save"
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          {saving ? "Guardando..." : "Agregar al historial"}
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  );
};

export const ContactDetailModal = ({ contact, onClose, onUpdate, onDelete, authHeaders }) => {
  const [activeTab, setActiveTab] = useState("datos");
  const [timeline, setTimeline] = useState([]);
  const [messages, setMessages] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState(contact);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiContent, setAiContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState(contact.ai_summary || null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    fetchTimeline();
    fetchMessages();
    setAiSummary(contact.ai_summary || null);
    // Auto-generate summary if there are messages and no cached summary OR stale
    const shouldAutoGen = (contact.ai_summary_stale || (!contact.ai_summary && (contact.fuente === "web_chat" || contact.fuente === "whatsapp")));
    if (shouldAutoGen) {
      generateSummary();
    }
    /* eslint-disable-next-line */
  }, [contact.id]);

  const fetchTimeline = async () => {
    try {
      const res = await axios.get(`${API}/crm/timeline/${contact.id}`, authHeaders ? authHeaders() : {});
      setTimeline(res.data);
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error("Error fetching timeline:", error);
    }
  };

  const fetchMessages = async () => {
    try {
      const res = await axios.get(`${API}/crm/messages/${contact.id}`, authHeaders ? authHeaders() : {});
      setMessages(res.data.messages || []);
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error("Error fetching messages:", error);
    }
  };

  const generateSummary = async () => {
    setSummaryLoading(true);
    try {
      const res = await axios.post(`${API}/crm/ai/summary/${contact.id}`, null, authHeaders ? authHeaders() : {});
      setAiSummary(res.data);
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error("Error generating summary:", error);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await onUpdate(contact.id, formData);
      setEditMode(false);
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error("Error saving:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAI = async (tipo) => {
    setAiLoading(true);
    try {
      const res = await axios.post(`${API}/crm/ai/generate`, {
        contact_id: contact.id,
        tipo,
      }, authHeaders ? authHeaders() : {});
      setAiContent(res.data);
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error("Error generating AI content:", error);
    } finally {
      setAiLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-end z-50" onClick={onClose}>
      <div
        className="w-full max-w-2xl h-full bg-white shadow-2xl overflow-y-auto animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{contact.empresa}</h2>
              <p className="text-slate-500 text-sm">{contact.nombre}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditMode(!editMode)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <Edit2 size={18} className="text-slate-500" />
              </button>
              <button
                onClick={() => onDelete(contact.id)}
                className="p-2 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={18} className="text-red-500" />
              </button>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-4 flex-wrap">
            {["datos", "timeline", "mensajes", "ia"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                data-testid={`detail-tab-${tab}`}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab
                    ? "bg-orange-100 text-orange-600"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {tab === "datos" ? "Datos" : tab === "timeline" ? "Timeline" : tab === "mensajes" ? "Mensajes" : "IA Copilot"}
              </button>
            ))}
          </div>
        </div>

        {/* AI Summary block — visible across all tabs */}
        {(aiSummary || summaryLoading) && (
          <AISummaryBlock summary={aiSummary?.summary} generatedAt={aiSummary?.generated_at} loading={summaryLoading} onRefresh={generateSummary} />
        )}
        {!aiSummary && !summaryLoading && (
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-3 flex items-center justify-between">
            <p className="text-xs text-slate-500">Sin resumen IA aún. Genera uno para ver necesidad, interés, plan recomendado y próxima acción.</p>
            <button
              onClick={generateSummary}
              data-testid="ai-summary-generate"
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 font-medium"
            >
              <Sparkles size={12} /> Generar resumen IA
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {activeTab === "datos" && (
            <div className="space-y-6">
              {/* Quick Actions */}
              <div className="flex gap-2">
                <a
                  href={`https://wa.me/${contact.telefono?.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500 text-white text-sm font-medium hover:bg-green-600 transition-colors"
                >
                  <MessageCircle size={16} />
                  WhatsApp
                </a>
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
                  >
                    <Mail size={16} />
                    Email
                  </a>
                )}
                <a
                  href={`tel:${contact.telefono}`}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
                >
                  <Phone size={16} />
                  Llamar
                </a>
              </div>

              {/* Form */}
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Empresa" value={formData.empresa} onChange={(v) => setFormData({ ...formData, empresa: v })} disabled={!editMode} />
                <FormField label="Nombre" value={formData.nombre} onChange={(v) => setFormData({ ...formData, nombre: v })} disabled={!editMode} />
                <FormField label="Teléfono" value={formData.telefono} onChange={(v) => setFormData({ ...formData, telefono: v })} disabled={!editMode} />
                <FormField label="Email" value={formData.email || ""} onChange={(v) => setFormData({ ...formData, email: v })} disabled={!editMode} />
                <FormField label="Nicho" value={formData.nicho || ""} onChange={(v) => setFormData({ ...formData, nicho: v })} disabled={!editMode} />
                <FormSelect
                  label="Fuente"
                  value={formData.fuente}
                  onChange={(v) => setFormData({ ...formData, fuente: v })}
                  options={SOURCES}
                  disabled={!editMode}
                />
              </div>

              {/* Opportunity */}
              <div className="bg-slate-50 rounded-xl p-4">
                <h3 className="font-semibold text-slate-900 mb-4">Oportunidad</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    label="Valor Mensual"
                    value={formData.valor_mensual}
                    onChange={(v) => setFormData({ ...formData, valor_mensual: parseInt(v) || 0 })}
                    type="number"
                    disabled={!editMode}
                  />
                  <FormField
                    label="Setup Fee"
                    value={formData.setup_fee}
                    onChange={(v) => setFormData({ ...formData, setup_fee: parseInt(v) || 0 })}
                    type="number"
                    disabled={!editMode}
                  />
                  <FormField
                    label="Probabilidad Cierre (%)"
                    value={formData.probabilidad_cierre}
                    onChange={(v) => setFormData({ ...formData, probabilidad_cierre: parseInt(v) || 0 })}
                    type="number"
                    disabled={!editMode}
                  />
                  <FormSelect
                    label="Etapa"
                    value={formData.etapa}
                    onChange={(v) => setFormData({ ...formData, etapa: v })}
                    options={STAGES}
                    disabled={!editMode}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Notas</label>
                <textarea
                  value={formData.notas || ""}
                  onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                  disabled={!editMode}
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-orange-500 outline-none text-sm disabled:bg-slate-50"
                />
              </div>

              {editMode && (
                <div className="flex gap-3">
                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500 text-white font-medium hover:bg-orange-600 transition-colors"
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                    Guardar cambios
                  </button>
                  <button
                    onClick={() => {
                      setFormData(contact);
                      setEditMode(false);
                    }}
                    className="px-6 py-3 rounded-xl bg-slate-100 text-slate-700 font-medium hover:bg-slate-200 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === "timeline" && (
            <div className="space-y-4">
              {/* Composer — agregar nota/llamada/reunión */}
              <TimelineComposer contactId={contact.id} authHeaders={authHeaders} onAdded={fetchTimeline} />

              {timeline.length > 0 ? (
                timeline.map((event) => (
                  <div key={event.id} className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      {event.tipo === "creado" && <Plus size={14} className="text-slate-500" />}
                      {event.tipo === "email" && <Mail size={14} className="text-blue-500" />}
                      {event.tipo === "llamada" && <Phone size={14} className="text-green-500" />}
                      {event.tipo === "nota" && <FileText size={14} className="text-purple-500" />}
                      {event.tipo === "reunion" && <Calendar size={14} className="text-amber-500" />}
                      {event.tipo === "propuesta" && <FileText size={14} className="text-orange-500" />}
                      {event.tipo === "etapa" && <ArrowRight size={14} className="text-orange-500" />}
                      {event.tipo === "whatsapp" && <MessageCircle size={14} className="text-green-500" />}
                      {event.tipo === "ia" && <Sparkles size={14} className="text-blue-500" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-900 whitespace-pre-wrap">{event.descripcion}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        <span className="capitalize mr-2 inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">{event.tipo}</span>
                        {new Date(event.created_at).toLocaleDateString("es-CL", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-slate-400 text-sm text-center py-8">Sin eventos registrados aún. Agrega el primero arriba.</p>
              )}
            </div>
          )}

          {activeTab === "mensajes" && (
            <div className="space-y-3">
              {messages.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">Sin mensajes registrados aún</p>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                    <span>{messages.length} mensajes</span>
                    <div className="flex gap-1">
                      {[...new Set(messages.map(m => m.channel))].map(ch => (
                        <span key={ch} data-testid={`channel-chip-${ch}`} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                          ch === "whatsapp" ? "bg-green-100 text-green-700" :
                          ch === "email" ? "bg-blue-100 text-blue-700" :
                          ch === "instagram" ? "bg-pink-100 text-pink-700" :
                          ch === "messenger" ? "bg-[#0084FF]/10 text-[#0084FF]" :
                          "bg-orange-100 text-orange-700"
                        }`}>{ch === "messenger" ? "MSG" : ch === "instagram" ? "IG" : ch === "whatsapp" ? "WA" : ch}</span>
                      ))}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 space-y-2 max-h-[45vh] overflow-y-auto">
                    {messages.map((m) => (
                      <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap shadow-sm ${
                          m.direction === "outbound"
                            ? "bg-orange-500 text-white"
                            : "bg-white border border-slate-200 text-slate-800"
                        }`}>
                          <div className="flex items-center gap-1.5 mb-1 opacity-70 text-[10px] uppercase tracking-wider">
                            <span>{m.channel}</span>
                            <span>·</span>
                            <span>{new Date(m.created_at).toLocaleString("es-CL", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"})}</span>
                            {m.status && <span>· {m.status}</span>}
                          </div>
                          {m.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* WhatsApp composer (only if contact has phone) */}
              {contact.telefono && (
                <WhatsAppComposer contact={contact} authHeaders={authHeaders} onSent={() => fetchMessages()} />
              )}
            </div>
          )}

          {activeTab === "ia" && (
            <div className="space-y-6">
              <p className="text-slate-500 text-sm">
                Genera contenido con IA para este contacto
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleAI("email")}
                  disabled={aiLoading}
                  data-testid="ai-generate-email"
                  className="flex items-center gap-2 p-4 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-sm font-medium"
                >
                  <Mail size={18} />
                  Generar Email
                </button>
                <button
                  onClick={() => handleAI("whatsapp")}
                  disabled={aiLoading}
                  data-testid="ai-generate-whatsapp"
                  className="flex items-center gap-2 p-4 rounded-xl bg-green-50 text-green-700 hover:bg-green-100 transition-colors text-sm font-medium"
                >
                  <MessageCircle size={18} />
                  Mensaje WhatsApp
                </button>
                <button
                  onClick={() => handleAI("followup")}
                  disabled={aiLoading}
                  data-testid="ai-generate-followup"
                  className="flex items-center gap-2 p-4 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors text-sm font-medium"
                >
                  <Sparkles size={18} />
                  Sugerir Follow-up
                </button>
                <button
                  onClick={() => handleAI("score")}
                  disabled={aiLoading}
                  data-testid="ai-generate-score"
                  className="flex items-center gap-2 p-4 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors text-sm font-medium"
                >
                  <Target size={18} />
                  Calcular Score
                </button>
              </div>

              {aiLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="animate-spin text-orange-500" size={24} />
                  <span className="ml-2 text-slate-500">Generando...</span>
                </div>
              )}

              {aiContent && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-slate-500 uppercase">{aiContent.tipo}</span>
                    <button
                      onClick={() => copyToClipboard(aiContent.contenido)}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                    >
                      <Copy size={14} />
                      Copiar
                    </button>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{aiContent.contenido}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
