import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Loader2 } from "lucide-react";
import "@/CRMPage.css";

import { API } from "./pages/crm/constants";
import { Sidebar } from "./pages/crm/Sidebar";
import { HoySection } from "./pages/crm/HoySection";
import { PipelineSection } from "./pages/crm/PipelineSection";
import { ContactsSection } from "./pages/crm/ContactsSection";
import { ContactDetailModal } from "./pages/crm/ContactDetailModal";
import { NewLeadModal } from "./pages/crm/NewLeadModal";
import { AgentConfigSection } from "./pages/crm/AgentConfigSection";
import { ConversationsSection } from "./pages/crm/ConversationsSection";
import { InboxSection } from "./pages/crm/InboxSection";
import { WorkspacesSection } from "./pages/crm/WorkspacesSection";
import { IntegrationsSection } from "./pages/crm/IntegrationsSection";
import { SettingsSection } from "./pages/crm/SettingsSection";

// ============== MAIN CRM PAGE ==============
export default function CRMPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);

  const [activeSection, setActiveSection] = useState("hoy");
  const [metrics, setMetrics] = useState(null);
  const [priorities, setPriorities] = useState([]);
  const [hotLeads, setHotLeads] = useState([]);
  const [pipeline, setPipeline] = useState({});
  const [pipelineTotals, setPipelineTotals] = useState({});
  const [contacts, setContacts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [aiLogs, setAiLogs] = useState({ logs: [], stats: {} });
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [selectedContact, setSelectedContact] = useState(null);
  const [showNewLeadModal, setShowNewLeadModal] = useState(false);

  // Helper: build axios config with Bearer token
  const authHeaders = () => {
    const token = localStorage.getItem("digiactiva_token");
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  };

  // Auth check on mount: try /me with stored token
  useEffect(() => {
    const token = localStorage.getItem("digiactiva_token");
    if (!token) {
      setAuthChecking(false);
      return;
    }
    axios.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        setCurrentUser(res.data);
        setActiveWorkspaceId(res.data.active_workspace_id);
        setIsAuthenticated(true);
      })
      .catch(() => {
        localStorage.removeItem("digiactiva_token");
        setIsAuthenticated(false);
      })
      .finally(() => setAuthChecking(false));
  }, []);

  // Fetch workspaces list (for selector)
  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/workspaces`, authHeaders());
      setWorkspaces(res.data.workspaces || []);
    } catch (e) { console.error(e); }
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [metricsRes, pipelineRes, contactsRes, settingsRes, aiLogsRes] = await Promise.all([
        axios.get(`${API}/crm/metrics`, authHeaders()),
        axios.get(`${API}/crm/pipeline`, authHeaders()),
        axios.get(`${API}/crm/contacts${searchTerm ? `?search=${searchTerm}` : ""}`, authHeaders()),
        axios.get(`${API}/crm/settings`, authHeaders()),
        axios.get(`${API}/crm/ai/logs?limit=10`, authHeaders()),
      ]);

      setMetrics(metricsRes.data);
      setPipeline(pipelineRes.data.pipeline || pipelineRes.data);
      setPipelineTotals(pipelineRes.data.totals || {});
      setContacts(contactsRes.data);
      setSettings(settingsRes.data);
      setAiLogs(aiLogsRes.data);
    } catch (error) {
      if (error.response?.status === 401) {
        localStorage.removeItem("digiactiva_token");
        setIsAuthenticated(false);
      }
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  const fetchPriorities = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/crm/ai/priorities`, authHeaders());
      setPriorities(res.data.prioridades || []);
      setHotLeads(res.data.hot_leads || []);
    } catch (error) {
      console.error("Error fetching priorities:", error);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchWorkspaces();
      fetchData();
      fetchPriorities();
    }
  }, [isAuthenticated, activeWorkspaceId, fetchWorkspaces, fetchData, fetchPriorities]);

  // Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");
    try {
      const response = await axios.post(`${API}/auth/login`, { email, password });
      localStorage.setItem("digiactiva_token", response.data.token);
      setCurrentUser(response.data.user);
      setActiveWorkspaceId(response.data.user.active_workspace_id);
      setIsAuthenticated(true);
      setActiveSection("hoy");
      setPassword("");
    } catch (error) {
      setLoginError(error.response?.data?.detail || "Email o contraseña incorrectos");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("digiactiva_token");
    setIsAuthenticated(false);
    setCurrentUser(null);
    setActiveSection("hoy");
  };

  const handleSwitchWorkspace = async (workspaceId) => {
    try {
      const res = await axios.post(`${API}/auth/switch-workspace`, { workspace_id: workspaceId }, authHeaders());
      localStorage.setItem("digiactiva_token", res.data.token);
      setActiveWorkspaceId(workspaceId);
    } catch (e) { console.error(e); }
  };

  // CRUD operations
  const createContact = async (data) => {
    await axios.post(`${API}/crm/contacts`, data, authHeaders());
    fetchData();
  };

  const updateContact = async (id, data) => {
    await axios.put(`${API}/crm/contacts/${id}`, data, authHeaders());
    fetchData();
    if (selectedContact?.id === id) {
      const res = await axios.get(`${API}/crm/contacts/${id}`, authHeaders());
      setSelectedContact(res.data);
    }
  };

  const deleteContact = async (id) => {
    if (window.confirm("¿Eliminar este contacto?")) {
      await axios.delete(`${API}/crm/contacts/${id}`, authHeaders());
      setSelectedContact(null);
      fetchData();
    }
  };

  const moveContact = async (id, newStage) => {
    await axios.put(`${API}/crm/pipeline/move/${id}?new_stage=${newStage}`, null, authHeaders());
    fetchData();
  };

  const updateSettings = async (data) => {
    await axios.put(`${API}/crm/settings`, data, authHeaders());
    setSettings(data);
  };

  // Loading auth
  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-orange-500" size={32} />
      </div>
    );
  }

  // Login Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-xl p-8">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                ACTIVA
              </h1>
              <p className="text-slate-500 text-sm mt-1">Founder OS — Multi-Workspace</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-orange-500 outline-none"
                data-testid="crm-email-input"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-orange-500 outline-none"
                data-testid="crm-password-input"
              />
              {loginError && <p className="text-red-500 text-sm">{loginError}</p>}
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-3 rounded-xl bg-orange-500 text-white font-medium hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
                data-testid="crm-login-btn"
              >
                {isLoggingIn ? <Loader2 size={18} className="animate-spin" /> : null}
                Ingresar
              </button>
            </form>

            <div className="mt-6 text-center">
              <a href="/" className="text-slate-400 text-sm hover:text-slate-600">
                ← Volver a Digiactiva
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        onLogout={handleLogout}
        currentUser={currentUser}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSwitchWorkspace={handleSwitchWorkspace}
      />

      <main className="ml-64 p-8">
        {activeSection === "hoy" && (
          <HoySection
            metrics={metrics}
            priorities={priorities}
            hotLeads={hotLeads}
            aiLogs={aiLogs}
            onNewLead={() => setShowNewLeadModal(true)}
            onRefresh={() => { fetchData(); fetchPriorities(); }}
            onSelectContact={setSelectedContact}
            loading={loading}
            currentUser={currentUser}
            activeWorkspace={workspaces.find(w => w.id === activeWorkspaceId)}
            summaryUnread={0}
            onProbarAgente={() => {
              const ws = workspaces.find(w => w.id === activeWorkspaceId);
              const slug = ws?.slug || "digiactiva";
              window.open(`/?workspace=${encodeURIComponent(slug)}#chat`, "_blank", "noopener");
            }}
          />
        )}

        {activeSection === "pipeline" && (
          <PipelineSection
            pipeline={pipeline}
            totals={pipelineTotals}
            onMoveContact={moveContact}
            onSelectContact={setSelectedContact}
            onNewLead={() => setShowNewLeadModal(true)}
            loading={loading}
          />
        )}

        {activeSection === "contactos" && (
          <ContactsSection
            contacts={contacts}
            onSelectContact={setSelectedContact}
            onNewLead={() => setShowNewLeadModal(true)}
            loading={loading}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
          />
        )}

        {activeSection === "ajustes" && (
          <SettingsSection
            settings={settings}
            onUpdateSettings={updateSettings}
          />
        )}

        {activeSection === "conversaciones" && <ConversationsSection authHeaders={authHeaders} />}
        {activeSection === "bandeja" && <InboxSection authHeaders={authHeaders} currentUser={currentUser} />}

        {activeSection === "agente" && <AgentConfigSection authHeaders={authHeaders} />}

        {activeSection === "workspaces" && (
          <WorkspacesSection
            workspaces={workspaces}
            currentUser={currentUser}
            onRefresh={fetchWorkspaces}
            authHeaders={authHeaders}
          />
        )}

        {activeSection === "integraciones" && (
          <IntegrationsSection
            workspace={workspaces.find(w => w.id === activeWorkspaceId)}
            authHeaders={authHeaders}
            onRefresh={fetchWorkspaces}
            currentUser={currentUser}
          />
        )}
      </main>

      {/* Modals */}
      {selectedContact && (
        <ContactDetailModal
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onUpdate={updateContact}
          onDelete={deleteContact}
          authHeaders={authHeaders}
        />
      )}

      {showNewLeadModal && (
        <NewLeadModal
          onClose={() => setShowNewLeadModal(false)}
          onSave={createContact}
        />
      )}
    </div>
  );
}
