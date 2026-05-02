import {
  LayoutDashboard,
  Kanban,
  Users,
  Settings,
  MessageCircle,
  Bot,
  ArrowLeft,
  LogOut,
  Building,
  Inbox,
} from "lucide-react";

export const Sidebar = ({ activeSection, setActiveSection, onLogout, currentUser, workspaces, activeWorkspaceId, onSwitchWorkspace }) => {
  const isFounder = currentUser?.role === "founder_admin";
  const activeWs = workspaces.find(w => w.id === activeWorkspaceId);
  const enabledModules = activeWs?.modules || {};
  const isModuleEnabled = (key) => enabledModules[key]?.enabled !== false;

  // Build menu items dynamically by enabled modules
  const baseItems = [
    { id: "hoy", label: "Hoy", icon: LayoutDashboard, requires: null },
    { id: "bandeja", label: "Bandeja", icon: Inbox, requires: "crm_simple" },
    { id: "pipeline", label: "Pipeline", icon: Kanban, requires: "crm_simple" },
    { id: "contactos", label: "Contactos", icon: Users, requires: "crm_simple" },
    { id: "conversaciones", label: "Conversaciones", icon: MessageCircle, requires: "crm_simple" },
    { id: "agente", label: "Agentes IA", icon: Bot, requires: null },
    { id: "integraciones", label: "Integraciones", icon: Settings, requires: "integrations" },
    { id: "ajustes", label: "Ajustes", icon: Settings, requires: null },
  ];
  if (isFounder) baseItems.unshift({ id: "workspaces", label: "Workspaces", icon: Building, requires: null });
  const menuItems = baseItems.filter(i => !i.requires || isModuleEnabled(i.requires));

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen fixed left-0 top-0 z-40">
      <div className="p-5 border-b border-slate-100">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
          ACTIVA
        </h1>
        <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider">
          {isFounder ? "Founder OS" : (activeWs?.name || "Workspace")}
        </p>
      </div>

      {/* Workspace selector */}
      {activeWs && (
        <div className="px-3 py-3 border-b border-slate-100">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider px-2 mb-1.5">Workspace</p>
          {isFounder && workspaces.length > 1 ? (
            <select
              value={activeWorkspaceId || ""}
              onChange={(e) => onSwitchWorkspace(e.target.value)}
              data-testid="workspace-selector"
              className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm font-medium text-slate-700 focus:outline-none focus:border-orange-500"
            >
              {workspaces.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          ) : (
            <div className="px-3 py-2 rounded-lg bg-orange-50 border border-orange-100">
              <p className="text-sm font-semibold text-slate-800">{activeWs.name}</p>
              <p className="text-[10px] text-orange-600 uppercase tracking-wider mt-0.5">{activeWs.plan}</p>
            </div>
          )}
        </div>
      )}

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveSection(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeSection === item.id
                ? "bg-orange-50 text-orange-600"
                : "text-slate-600 hover:bg-slate-50"
            }`}
            data-testid={`nav-${item.id}`}
          >
            <item.icon size={18} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-100">
        {currentUser && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-slate-700 truncate">{currentUser.name}</p>
            <p className="text-[10px] text-slate-400 truncate">{currentUser.email}</p>
            <span className="inline-block text-[9px] uppercase tracking-wider mt-0.5 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
              {currentUser.role === "founder_admin" ? "Founder" : "Admin Workspace"}
            </span>
          </div>
        )}
        <a
          href="/"
          className="flex items-center gap-2 text-slate-400 hover:text-slate-600 text-xs mb-2"
        >
          <ArrowLeft size={14} />
          Volver a Digiactiva
        </a>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 text-slate-400 hover:text-red-500 text-xs"
          data-testid="crm-logout"
        >
          <LogOut size={14} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
};
