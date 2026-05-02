import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Plus, Copy, Check, KeyRound, Users, X, Sparkles, AlertCircle } from "lucide-react";
import { API } from "./constants";

const PLAN_OPTIONS = ["essential", "premium", "elite", "founder_full"];
const planColors = {
  essential: "bg-slate-100 text-slate-700",
  premium: "bg-blue-100 text-blue-700",
  elite: "bg-purple-100 text-purple-700",
  founder_full: "bg-orange-100 text-orange-700",
};

// ─── Credentials display modal (shown once after creation) ───
const CredentialsModal = ({ data, onClose }) => {
  const [copied, setCopied] = useState("");
  const copy = (key, value) => {
    navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  };
  const block = `Workspace: ${data.workspace.name}\nLogin URL: ${data.credentials.login_url}\nEmail: ${data.credentials.email}\nPassword: ${data.credentials.password}`;
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl" data-testid="credentials-modal">
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Cliente creado</h3>
            <p className="text-xs text-slate-500 mt-0.5">Comparte estas credenciales una sola vez.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded-lg flex gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{data.message}</span>
          </div>
          {[
            { key: "email", label: "Email", value: data.credentials.email },
            { key: "password", label: "Password", value: data.credentials.password, mono: true },
            { key: "login_url", label: "Login URL", value: data.credentials.login_url },
          ].map(f => (
            <div key={f.key}>
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{f.label}</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  readOnly
                  value={f.value}
                  data-testid={`cred-${f.key}`}
                  className={`flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 ${f.mono ? "font-mono" : ""}`}
                />
                <button
                  onClick={() => copy(f.key, f.value)}
                  className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                  data-testid={`cred-copy-${f.key}`}
                >
                  {copied === f.key ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={() => copy("all", block)}
            data-testid="cred-copy-all"
            className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
          >
            {copied === "all" ? "✓ Copiado" : "Copiar todo"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Create-with-admin form modal ───
const CreateClientModal = ({ onClose, onCreated, authHeaders }) => {
  const [step, setStep] = useState("form"); // form | submitting
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState("premium");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    axios.get(`${API}/workspaces/_meta/templates`, authHeaders())
      .then(r => setTemplates(r.data.templates || []))
      .catch(() => {});
  }, [authHeaders]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setStep("submitting");
    try {
      const res = await axios.post(`${API}/workspaces/create-with-admin`, {
        workspace: { name: name.trim(), slug: slug.trim(), plan },
        admin: { email: adminEmail.trim(), full_name: adminFullName.trim() || null, password: adminPassword.trim() || null },
        template_id: templateId || null,
      }, authHeaders());
      onCreated(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Error creando cliente");
      setStep("form");
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto" data-testid="create-client-modal">
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Crear cliente</h3>
            <p className="text-xs text-slate-500 mt-0.5">Workspace + plan + usuario admin en un solo flujo.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg" data-testid="create-error">
              {error}
            </div>
          )}

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">1 · Workspace</h4>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-400 font-semibold">Nombre del cliente</label>
                <input
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                  }}
                  placeholder="Estudio Lex"
                  data-testid="cw-name"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-semibold">Slug (URL-friendly)</label>
                <input
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                  placeholder="estudio-lex"
                  data-testid="cw-slug"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:border-blue-500 outline-none"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-[10px] text-slate-400 font-semibold">Plan</label>
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {PLAN_OPTIONS.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlan(p)}
                    data-testid={`cw-plan-${p}`}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition ${
                      plan === p
                        ? "bg-slate-900 text-white"
                        : `${planColors[p]} hover:opacity-80`
                    }`}
                  >{p.replace("_", " ")}</button>
                ))}
              </div>
            </div>
            {templates.length > 0 && (
              <div className="mt-3">
                <label className="text-[10px] text-slate-400 font-semibold">Plantilla de nicho (opcional)</label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  data-testid="cw-template"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-500 outline-none"
                >
                  <option value="">— Sin plantilla —</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">2 · Usuario admin del cliente</h4>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-400 font-semibold">Email</label>
                <input
                  required
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@cliente.cl"
                  data-testid="cw-admin-email"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-semibold">Nombre completo</label>
                <input
                  value={adminFullName}
                  onChange={(e) => setAdminFullName(e.target.value)}
                  placeholder="Ej: Carla Soto"
                  data-testid="cw-admin-name"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-500 outline-none"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-[10px] text-slate-400 font-semibold">Password (opcional, autogenero si vacío)</label>
              <input
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Dejar vacío para autogenerar"
                data-testid="cw-admin-password"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:border-blue-500 outline-none"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={step === "submitting"}
            data-testid="cw-submit"
            className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Sparkles size={14} />
            {step === "submitting" ? "Creando…" : "Crear cliente"}
          </button>
        </div>
      </form>
    </div>
  );
};

// ─── Reset password mini-flow ───
const ResetPasswordButton = ({ workspaceId, userId, email, authHeaders }) => {
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(null);
  const handle = async () => {
    if (!window.confirm(`¿Resetear password de ${email}?`)) return;
    setBusy(true);
    try {
      const res = await axios.post(`${API}/workspaces/${workspaceId}/users/${userId}/reset-password`, {}, authHeaders());
      setShown(res.data.new_password);
    } catch (e) {
      alert(e.response?.data?.detail || "Error");
    } finally {
      setBusy(false);
    }
  };
  if (shown) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <code className="bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1 rounded font-mono">{shown}</code>
        <button onClick={() => { navigator.clipboard.writeText(shown); }} className="text-blue-600 hover:underline">copiar</button>
        <button onClick={() => setShown(null)} className="text-slate-400">✕</button>
      </span>
    );
  }
  return (
    <button onClick={handle} disabled={busy} data-testid={`reset-pw-${userId}`} className="text-xs text-slate-500 hover:text-blue-600 inline-flex items-center gap-1">
      <KeyRound size={11} /> {busy ? "…" : "Reset password"}
    </button>
  );
};

// ─── Workspace card (founder view) ───
const WorkspaceCard = ({ ws, authHeaders, onRefresh }) => {
  const [editingPlan, setEditingPlan] = useState(false);
  const [planValue, setPlanValue] = useState(ws.plan);
  const [users, setUsers] = useState([]);
  const [showUsers, setShowUsers] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/workspaces/${ws.id}/users`, authHeaders());
      setUsers(r.data.users || []);
    } catch (_) { /* ignore */ }
  }, [ws.id, authHeaders]);

  useEffect(() => { if (showUsers) loadUsers(); }, [showUsers, loadUsers]);

  const changePlan = async () => {
    try {
      await axios.put(`${API}/workspaces/${ws.id}`, { plan: planValue }, authHeaders());
      setEditingPlan(false);
      onRefresh();
    } catch (e) { alert(e.response?.data?.detail || "Error"); }
  };

  const toggleModule = async (key, enabled) => {
    try {
      await axios.put(`${API}/workspaces/${ws.id}/modules/${key}`, { enabled }, authHeaders());
      onRefresh();
    } catch (e) { alert(e.response?.data?.detail || "Error"); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3" data-testid={`ws-card-${ws.slug}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900">{ws.name}</h3>
            <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded font-mono">/{ws.slug}</span>
          </div>
          {editingPlan ? (
            <div className="flex items-center gap-2 mt-2">
              <select value={planValue} onChange={(e) => setPlanValue(e.target.value)} className="text-xs px-2 py-1 rounded border border-slate-200">
                {PLAN_OPTIONS.map(p => <option key={p}>{p}</option>)}
              </select>
              <button onClick={changePlan} className="text-xs px-2 py-1 rounded bg-blue-600 text-white">OK</button>
              <button onClick={() => setEditingPlan(false)} className="text-xs px-2 py-1 text-slate-400">x</button>
            </div>
          ) : (
            <button
              onClick={() => { setEditingPlan(true); setPlanValue(ws.plan); }}
              className={`mt-2 inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${planColors[ws.plan] || "bg-slate-100"}`}
              data-testid={`ws-plan-${ws.slug}`}
            >
              {ws.plan}
            </button>
          )}
        </div>
        <button
          onClick={() => setShowUsers(s => !s)}
          className="text-xs text-slate-500 hover:text-blue-600 flex items-center gap-1"
          data-testid={`ws-users-${ws.slug}`}
        >
          <Users size={12} /> Usuarios
        </button>
      </div>

      {showUsers && (
        <div className="border-t border-slate-100 pt-3 space-y-1.5">
          {users.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Sin usuarios.</p>
          ) : users.map(u => (
            <div key={u.id} className="flex items-center justify-between gap-2 text-sm">
              <div>
                <p className="text-slate-800 font-medium text-xs">{u.email}</p>
                <p className="text-[10px] text-slate-400">{u.role} · {u.full_name}</p>
              </div>
              <ResetPasswordButton workspaceId={ws.id} userId={u.id} email={u.email} authHeaders={authHeaders} />
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Módulos</p>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(ws.modules || {}).map(([k, v]) => (
            <label key={k} className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${v.enabled ? "bg-green-50 text-green-700" : "bg-slate-50 text-slate-400"}`}>
              <input
                type="checkbox"
                checked={!!v.enabled}
                onChange={(e) => toggleModule(k, e.target.checked)}
                data-testid={`ws-${ws.id}-module-${k}`}
                className="accent-blue-500"
              />
              <span className="truncate">{k}</span>
              {v.status === "pending_credentials" && <span className="text-amber-500" title="Pendiente de credenciales">⚠</span>}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Main ───
export const WorkspacesSection = ({ workspaces, currentUser, onRefresh, authHeaders }) => {
  const [creating, setCreating] = useState(false);
  const [credentialsData, setCredentialsData] = useState(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>Workspaces</h2>
          <p className="text-slate-500 mt-1">Plataforma multi-tenant · {workspaces.length} clientes</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          data-testid="ws-create-toggle"
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-sm font-semibold shadow-lg shadow-blue-500/25"
        >
          <Plus size={18} /> Crear cliente
        </button>
      </div>

      {creating && (
        <CreateClientModal
          authHeaders={authHeaders}
          onClose={() => setCreating(false)}
          onCreated={(data) => { setCreating(false); setCredentialsData(data); onRefresh(); }}
        />
      )}

      {credentialsData && (
        <CredentialsModal data={credentialsData} onClose={() => setCredentialsData(null)} />
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {workspaces.map(ws => (
          <WorkspaceCard key={ws.id} ws={ws} authHeaders={authHeaders} onRefresh={onRefresh} />
        ))}
      </div>
    </div>
  );
};
