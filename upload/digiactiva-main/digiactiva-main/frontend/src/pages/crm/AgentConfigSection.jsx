import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  MessageCircle,
  Phone,
  Bot,
  Plus,
  Check,
  Trash2,
  Loader2,
  ChevronDown,
  Sparkles,
  Play,
  Copy,
  Heart,
  UtensilsCrossed,
  Shield,
  Building2,
  Building,
  Wrench,
  Briefcase,
  Code2,
  Mic,
} from "lucide-react";
import { API } from "./constants";

const ICONS = {
  Heart, UtensilsCrossed, Shield, Building2, Building, Wrench, Briefcase,
};

const CHANNEL_INFO = {
  web_chat: { label: "Chat Web", icon: MessageCircle, color: "text-blue-600" },
  whatsapp: { label: "WhatsApp Business", icon: Phone, color: "text-green-600" },
  voice: { label: "Voz (SOFIA)", icon: Bot, color: "text-purple-600" },
};

// ----- Sub-components -----
const Section = ({ title, desc, right, children }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="font-semibold text-slate-900">{title}</h3>
        {desc && <p className="text-xs text-slate-500 mt-0.5">{desc}</p>}
      </div>
      {right}
    </div>
    {children}
  </div>
);

const ListEditor = ({ items, onAdd, onRemove, onUpdate, placeholder, testid }) => (
  <div className="space-y-2">
    {items.map((item, i) => (
      <div key={i} className="flex items-start gap-2">
        <textarea
          value={item}
          onChange={(e) => onUpdate(i, e.target.value)}
          rows={1}
          placeholder={placeholder}
          data-testid={testid ? `${testid}-item-${i}` : undefined}
          className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-500 outline-none resize-y min-h-[40px]"
        />
        <button
          onClick={() => onRemove(i)}
          className="p-2 rounded-lg hover:bg-red-50 text-red-500"
          aria-label="Eliminar"
        >
          <Trash2 size={14} />
        </button>
      </div>
    ))}
    {items.length === 0 && (
      <p className="text-slate-400 text-xs italic">Sin elementos. Haz click en Agregar.</p>
    )}
    <button
      onClick={onAdd}
      data-testid={testid ? `${testid}-add` : undefined}
      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-medium"
    >
      <Plus size={14} /> Agregar
    </button>
  </div>
);

const TemplatePicker = ({ templates, applied, onApply, applying }) => (
  <Section
    title="Plantillas por nicho"
    desc="Aplica un preset listo para tu industria. Reemplaza prompts en los 3 canales (puedes ajustar luego)."
  >
    <div className="flex flex-wrap gap-2">
      {templates.map((t) => {
        const Icon = ICONS[t.icon] || Briefcase;
        const isActive = applied === t.id;
        return (
          <button
            key={t.id}
            disabled={applying}
            onClick={() => onApply(t.id, t.label)}
            data-testid={`template-${t.id}`}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all disabled:opacity-50 ${
              isActive
                ? "bg-blue-600 text-white border-blue-600 shadow"
                : "bg-white text-slate-700 border-slate-200 hover:border-blue-400 hover:bg-blue-50"
            }`}
          >
            <Icon size={14} />
            {t.label}
            {isActive && <Check size={14} />}
          </button>
        );
      })}
    </div>
  </Section>
);

const CodeBlock = ({ code, testid }) => {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) { /* ignore */ }
  };
  return (
    <div className="relative">
      <pre
        className="bg-slate-900 text-slate-100 text-xs p-4 rounded-xl overflow-x-auto whitespace-pre-wrap break-all"
        data-testid={testid}
      >
        <code>{code}</code>
      </pre>
      <button
        onClick={onCopy}
        data-testid={testid ? `${testid}-copy` : undefined}
        className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
};

// ----- Main -----
export const AgentConfigSection = ({ authHeaders }) => {
  const [activeChannel, setActiveChannel] = useState("web_chat");
  const [config, setConfig] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [appliedTemplate, setAppliedTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fetchWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const meRes = await axios.get(`${API}/auth/me`, authHeaders());
      const wsRes = await axios.get(`${API}/workspaces`, authHeaders());
      const ws = (wsRes.data.workspaces || []).find(
        (w) => w.id === meRes.data.active_workspace_id
      );
      setWorkspace(ws);
      setAppliedTemplate(ws?.applied_template || null);
      const prompts = ws?.agent_prompts || {};
      setConfig(prompts[activeChannel] || {});
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.error(e);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, activeChannel]);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/workspaces/_meta/templates`, authHeaders());
      setTemplates(res.data.templates || []);
    } catch (e) { /* ignore */ }
  }, [authHeaders]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);
  useEffect(() => { fetchWorkspace(); }, [fetchWorkspace]);

  const handleSave = async () => {
    if (!workspace) return;
    setSaving(true);
    try {
      await axios.put(
        `${API}/workspaces/${workspace.id}/agent-prompts/${activeChannel}`,
        config,
        authHeaders()
      );
      setSavedAt(new Date());
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleApplyTemplate = async (templateId, label) => {
    if (!workspace) return;
    if (!window.confirm(`¿Aplicar plantilla "${label}"? Reemplazará los prompts actuales en los 3 canales.`)) return;
    setApplying(true);
    try {
      const res = await axios.post(
        `${API}/workspaces/${workspace.id}/apply-template/${templateId}`,
        null,
        authHeaders()
      );
      const newPrompts = res.data.agent_prompts || {};
      setConfig(newPrompts[activeChannel] || {});
      setAppliedTemplate(templateId);
      setSavedAt(new Date());
      setWorkspace((w) => (w ? { ...w, agent_prompts: newPrompts, applied_template: templateId } : w));
    } catch (e) {
      alert("No se pudo aplicar la plantilla.");
    } finally {
      setApplying(false);
    }
  };

  const handleTest = () => {
    if (!workspace) return;
    const url = `/?workspace=${encodeURIComponent(workspace.slug)}#chat`;
    window.open(url, "_blank", "noopener");
  };

  const updateField = (k, v) => setConfig((c) => ({ ...c, [k]: v }));
  const updateList = (k, idx, v) => {
    const arr = [...(config[k] || [])];
    arr[idx] = v;
    updateField(k, arr);
  };
  const addItem = (k) => updateField(k, [...(config[k] || []), ""]);
  const removeItem = (k, idx) => {
    const arr = [...(config[k] || [])];
    arr.splice(idx, 1);
    updateField(k, arr);
  };

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  // Embed snippets — solo identificadores públicos, JAMÁS API keys.
  const slug = workspace?.slug || "digiactiva";
  const origin = (typeof window !== "undefined") ? window.location.origin : "";
  const sofiaAgentId = workspace?.integrations?.sofia?.agent_id || "TU_AGENT_ID_DE_ELEVENLABS";

  const webEmbedScript = `<!-- ACTIVA Chat Widget — workspace: ${slug} -->
<script>
(function(){
  var d=document,s=d.createElement('iframe');
  s.src='${origin}/embed/chat?workspace=${slug}';
  s.title='Chat de atención';
  s.style.cssText='position:fixed;bottom:20px;right:20px;width:400px;height:600px;max-width:95vw;max-height:90vh;border:0;z-index:99999;border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,0.18);background:transparent;';
  s.allow='clipboard-write';
  d.body.appendChild(s);
})();
</script>`;

  const webEmbedScriptTag = `<!-- ACTIVA Chat Widget — workspace: ${slug} -->
<script>window.DIGIACTIVA_WORKSPACE='${slug}';</script>
<script src="${origin}/static/js/main.js" defer></script>`;

  const sofiaEmbed = `<!-- SOFIA — agente de voz para tu sitio -->
<elevenlabs-convai agent-id="${sofiaAgentId}"></elevenlabs-convai>
<script src="https://elevenlabs.io/convai-widget/index.js" async type="text/javascript"></script>`;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
          Agentes IA
        </h2>
        <p className="text-slate-500 mt-1 text-sm">
          Workspace: <span className="font-semibold text-slate-700">{workspace?.name}</span>
          {" · "}Configura el prompt de cada canal y obtén el código para instalarlo.
        </p>
      </div>

      {/* Templates */}
      <TemplatePicker
        templates={templates}
        applied={appliedTemplate}
        applying={applying}
        onApply={handleApplyTemplate}
      />

      {/* Channel tabs */}
      <div className="flex gap-2 bg-white rounded-xl border border-slate-200 p-1.5 w-fit">
        {Object.entries(CHANNEL_INFO).map(([k, v]) => (
          <button
            key={k}
            onClick={() => setActiveChannel(k)}
            data-testid={`agent-tab-${k}`}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeChannel === k
                ? "bg-blue-600 text-white shadow"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <v.icon size={14} />
            {v.label}
          </button>
        ))}
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500 flex items-center gap-2">
          <Sparkles size={14} className="text-blue-500" />
          Editando canal{" "}
          <span className="font-semibold text-slate-700">
            {CHANNEL_INFO[activeChannel].label}
          </span>
        </div>
        <div className="flex gap-2">
          {activeChannel === "web_chat" && (
            <button
              onClick={handleTest}
              data-testid="agent-test-btn"
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium"
            >
              <Play size={14} />
              Probar
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            data-testid="agent-save-btn"
            className="flex items-center gap-2 px-6 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium shadow disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Guardar
          </button>
        </div>
      </div>

      {savedAt && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-xl">
          ✓ Guardado a las {savedAt.toLocaleTimeString("es-CL")}
        </div>
      )}

      {/* Prompt Estructurado — campo principal */}
      <Section
        title="Prompt estructurado"
        desc="Es el cerebro del agente para este canal. Indica QUÉ hacer, CÓMO hablar y QUÉ datos capturar."
      >
        <textarea
          value={config.prompt_estructurado || ""}
          onChange={(e) => updateField("prompt_estructurado", e.target.value)}
          rows={16}
          placeholder={`Ej: Eres el asistente comercial de... \n\nPERSONALIDAD: ...\nQUÉ HACER:\n- ...\nDATOS A CAPTURAR:\n- ...\nCTA FINAL: ...`}
          data-testid="agent-prompt-estructurado"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-sm font-mono leading-relaxed"
        />
        <p className="text-xs text-slate-400">
          Tip: aplica una plantilla de nicho arriba para empezar con un prompt completo y luego ajusta detalles.
        </p>
      </Section>

      {/* Saludo + CTA — siempre visibles, son los más usados */}
      <div className="grid md:grid-cols-2 gap-6">
        <Section title="Saludo inicial" desc="Primer mensaje del agente">
          <textarea
            value={config.saludo_inicial || ""}
            onChange={(e) => updateField("saludo_inicial", e.target.value)}
            rows={3}
            data-testid="agent-saludo"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-sm"
          />
        </Section>
        <Section title="CTA final" desc="Llamado a la acción que el agente cerrará">
          <textarea
            value={config.cta_final || ""}
            onChange={(e) => updateField("cta_final", e.target.value)}
            rows={3}
            data-testid="agent-cta"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-sm"
          />
        </Section>
      </div>

      {/* Advanced config accordion */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          data-testid="agent-advanced-toggle"
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition"
        >
          <div className="text-left">
            <h3 className="font-semibold text-slate-900">Configuración avanzada</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Personalidad, tono, planes, promociones, listas de preguntas y objeciones.
            </p>
          </div>
          <ChevronDown
            size={20}
            className={`text-slate-500 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
          />
        </button>

        {showAdvanced && (
          <div className="border-t border-slate-100 p-6 space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Personalidad
                </label>
                <textarea
                  value={config.personalidad || ""}
                  onChange={(e) => updateField("personalidad", e.target.value)}
                  rows={3}
                  data-testid="agent-personalidad"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Tono
                </label>
                <textarea
                  value={config.tono || ""}
                  onChange={(e) => updateField("tono", e.target.value)}
                  rows={3}
                  data-testid="agent-tono"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Planes vigentes
              </label>
              <textarea
                value={config.planes_vigentes || ""}
                onChange={(e) => updateField("planes_vigentes", e.target.value)}
                rows={5}
                data-testid="agent-planes"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Promociones
              </label>
              <textarea
                value={config.promociones || ""}
                onChange={(e) => updateField("promociones", e.target.value)}
                rows={3}
                data-testid="agent-promos"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <h4 className="font-semibold text-slate-900 text-sm">Nichos prioritarios</h4>
              <p className="text-xs text-slate-500 mt-0.5 mb-2">Tipos de negocios prioritarios.</p>
              <ListEditor
                items={config.nichos_prioritarios || []}
                onAdd={() => addItem("nichos_prioritarios")}
                onRemove={(i) => removeItem("nichos_prioritarios", i)}
                onUpdate={(i, v) => updateList("nichos_prioritarios", i, v)}
                placeholder="Ej: Restaurantes y delivery"
                testid="agent-nichos"
              />
            </div>

            <div>
              <h4 className="font-semibold text-slate-900 text-sm">Preguntas de calificación</h4>
              <p className="text-xs text-slate-500 mt-0.5 mb-2">El agente hará 1 por mensaje.</p>
              <ListEditor
                items={config.preguntas_calificacion || []}
                onAdd={() => addItem("preguntas_calificacion")}
                onRemove={(i) => removeItem("preguntas_calificacion", i)}
                onUpdate={(i, v) => updateList("preguntas_calificacion", i, v)}
                placeholder="Ej: ¿Cuál es tu rubro?"
                testid="agent-preguntas"
              />
            </div>

            <div>
              <h4 className="font-semibold text-slate-900 text-sm">Objeciones y respuestas</h4>
              <p className="text-xs text-slate-500 mt-0.5 mb-2">Formato: 'Objeción → Respuesta'.</p>
              <ListEditor
                items={config.objeciones || []}
                onAdd={() => addItem("objeciones")}
                onRemove={(i) => removeItem("objeciones", i)}
                onUpdate={(i, v) => updateList("objeciones", i, v)}
                placeholder="Ej: 'Es muy caro' → Demuestra ROI..."
                testid="agent-objeciones"
              />
            </div>
          </div>
        )}
      </div>

      {/* Install / Embed code blocks */}
      {activeChannel === "web_chat" && (
        <Section
          title="Instalar agente web"
          desc="Pega este snippet antes del </body> de tu sitio. Solo usa identificadores públicos (slug del workspace). Tus API keys están protegidas en el servidor."
          right={<Code2 size={18} className="text-blue-600" />}
        >
          <CodeBlock code={webEmbedScript} testid="embed-web-script" />
          <p className="text-xs text-slate-500 mt-2">
            Workspace slug: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{slug}</code>
            {" · "}URL embed:{" "}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{origin}/embed/chat?workspace={slug}</code>
          </p>
        </Section>
      )}

      {activeChannel === "voice" && (
        <Section
          title="Cómo usar SOFIA en tu sitio"
          desc="Botón de voz embebible. Configura el Agent ID de ElevenLabs en Integraciones → SOFIA. La API key permanece solo en backend."
          right={<Mic size={18} className="text-purple-600" />}
        >
          <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1 mb-4">
            <li>Ve a <span className="font-medium text-slate-800">Integraciones → SOFIA</span> y guarda tu Agent ID.</li>
            <li>Pega este snippet en tu sitio donde quieras el botón.</li>
            <li>Tu API key de ElevenLabs no se expone: la usamos solo del lado servidor.</li>
          </ol>
          <CodeBlock code={sofiaEmbed} testid="embed-sofia" />
          <p className="text-xs text-slate-500 mt-2">
            Agent ID actual:{" "}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
              {workspace?.integrations?.sofia?.agent_id || "(sin configurar)"}
            </code>
          </p>
        </Section>
      )}

      {activeChannel === "whatsapp" && (
        <Section
          title="WhatsApp Business — instalación"
          desc="WhatsApp se conecta vía webhook, no requiere snippet en tu sitio."
          right={<Phone size={18} className="text-green-600" />}
        >
          <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1">
            <li>Ve a <span className="font-medium text-slate-800">Integraciones → WhatsApp</span>.</li>
            <li>Configura WABA ID, Phone Number ID, Access Token y Verify Token.</li>
            <li>Copia la Webhook URL y pégala en Meta Developers.</li>
            <li>Verifica el webhook desde Meta. Listo: los mensajes entran al CRM.</li>
          </ol>
        </Section>
      )}
    </div>
  );
};
