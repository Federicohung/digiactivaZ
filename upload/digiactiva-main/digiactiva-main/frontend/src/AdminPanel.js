import { useState, useEffect } from "react";
import axios from "axios";
import {
  Users,
  Mail,
  Phone,
  MessageSquare,
  Calendar,
  RefreshCw,
  ArrowLeft,
  Search,
  Filter,
  Download,
  Trash2,
  Eye,
  Lock,
  LogOut,
  BarChart3,
  TrendingUp,
  Clock,
  Loader2,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminPanel = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterService, setFilterService] = useState("");
  const [selectedLead, setSelectedLead] = useState(null);

  // Check if already authenticated (session storage with token)
  useEffect(() => {
    const token = sessionStorage.getItem("digiactiva_admin_token");
    if (token) {
      // Verify token is still valid
      axios.post(`${API}/admin/verify?token=${token}`)
        .then(() => setIsAuthenticated(true))
        .catch(() => {
          sessionStorage.removeItem("digiactiva_admin_token");
          setIsAuthenticated(false);
        });
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setPasswordError("");
    
    try {
      const response = await axios.post(`${API}/admin/login`, { password });
      const { token } = response.data;
      sessionStorage.setItem("digiactiva_admin_token", token);
      setIsAuthenticated(true);
      setPassword("");
    } catch (error) {
      if (error.response?.status === 401) {
        setPasswordError("Contraseña incorrecta");
      } else {
        setPasswordError("Error al conectar con el servidor");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    const token = sessionStorage.getItem("digiactiva_admin_token");
    if (token) {
      try {
        await axios.post(`${API}/admin/logout?token=${token}`);
      } catch (error) {
        console.error("Logout error:", error);
      }
    }
    sessionStorage.removeItem("digiactiva_admin_token");
    setIsAuthenticated(false);
  };

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/leads`);
      setLeads(response.data);
    } catch (error) {
      console.error("Error fetching leads:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchLeads();
    }
  }, [isAuthenticated]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getServiceLabel = (service) => {
    const services = {
      formalizacion: "Formalización",
      digitalizate: "Plan Digitalízate",
      gestion: "Plan Gestión",
      impulso: "Plan Impulso",
      full: "Plan Full Negocio",
      publicidad: "Publicidad Digital",
      asesoria: "Asesoría",
      otro: "Otro",
    };
    return services[service] || service || "No especificado";
  };

  const getServiceColor = (service) => {
    const colors = {
      formalizacion: "bg-purple-100 text-purple-700",
      digitalizate: "bg-blue-100 text-blue-700",
      gestion: "bg-emerald-100 text-emerald-700",
      impulso: "bg-orange-100 text-orange-700",
      full: "bg-red-100 text-red-700",
      publicidad: "bg-pink-100 text-pink-700",
      asesoria: "bg-cyan-100 text-cyan-700",
      otro: "bg-slate-100 text-slate-700",
    };
    return colors[service] || "bg-slate-100 text-slate-700";
  };

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.telefono.includes(searchTerm);
    const matchesFilter = !filterService || lead.servicio_interes === filterService;
    return matchesSearch && matchesFilter;
  });

  const exportToCSV = () => {
    const headers = ["Nombre", "Email", "Teléfono", "Servicio", "Mensaje", "Fecha"];
    const csvData = filteredLeads.map((lead) => [
      lead.nombre,
      lead.email,
      lead.telefono,
      getServiceLabel(lead.servicio_interes),
      lead.mensaje || "",
      formatDate(lead.created_at),
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers, ...csvData].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `leads_digiactiva_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Stats
  const stats = {
    total: leads.length,
    today: leads.filter((l) => {
      const today = new Date().toDateString();
      return new Date(l.created_at).toDateString() === today;
    }).length,
    thisWeek: leads.filter((l) => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return new Date(l.created_at) >= weekAgo;
    }).length,
  };

  // Login Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-xl p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Lock className="text-white" size={28} />
              </div>
              <h1
                className="text-2xl font-bold text-slate-900"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                Admin Digiactiva
              </h1>
              <p className="text-slate-500 text-sm mt-2">
                Ingresa la contraseña para acceder
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contraseña"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-900"
                  data-testid="admin-password-input"
                />
                {passwordError && (
                  <p className="text-red-500 text-sm mt-2">{passwordError}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-slate-900 text-white py-3 rounded-xl font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                data-testid="admin-login-btn"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Ingresando...
                  </>
                ) : (
                  "Ingresar"
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <a
                href="/"
                className="text-slate-500 text-sm hover:text-blue-600 transition-colors inline-flex items-center gap-2"
              >
                <ArrowLeft size={16} />
                Volver al sitio
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Admin Dashboard
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <h1
                className="text-xl font-bold text-slate-900"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                DIGIACTIVA
              </h1>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                Admin
              </span>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="/"
                className="text-slate-500 hover:text-slate-700 text-sm flex items-center gap-2"
              >
                <ArrowLeft size={16} />
                Ver sitio
              </a>
              <button
                onClick={handleLogout}
                className="text-slate-500 hover:text-red-600 flex items-center gap-2 text-sm"
                data-testid="admin-logout-btn"
              >
                <LogOut size={16} />
                Salir
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                <Users className="text-blue-600" size={24} />
              </div>
              <div>
                <p className="text-slate-500 text-sm">Total Leads</p>
                <p
                  className="text-3xl font-bold text-slate-900"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                  data-testid="stats-total"
                >
                  {stats.total}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                <TrendingUp className="text-emerald-600" size={24} />
              </div>
              <div>
                <p className="text-slate-500 text-sm">Hoy</p>
                <p
                  className="text-3xl font-bold text-slate-900"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                  data-testid="stats-today"
                >
                  {stats.today}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center">
                <Clock className="text-purple-600" size={24} />
              </div>
              <div>
                <p className="text-slate-500 text-sm">Esta semana</p>
                <p
                  className="text-3xl font-bold text-slate-900"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                  data-testid="stats-week"
                >
                  {stats.thisWeek}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
              {/* Search */}
              <div className="relative flex-1 md:w-64">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <input
                  type="text"
                  placeholder="Buscar leads..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none text-sm"
                  data-testid="search-input"
                />
              </div>

              {/* Filter */}
              <div className="relative">
                <Filter
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <select
                  value={filterService}
                  onChange={(e) => setFilterService(e.target.value)}
                  className="pl-10 pr-8 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none text-sm bg-white appearance-none cursor-pointer"
                  data-testid="filter-select"
                >
                  <option value="">Todos los servicios</option>
                  <option value="formalizacion">Formalización</option>
                  <option value="digitalizate">Plan Digitalízate</option>
                  <option value="gestion">Plan Gestión</option>
                  <option value="impulso">Plan Impulso</option>
                  <option value="full">Plan Full Negocio</option>
                  <option value="publicidad">Publicidad Digital</option>
                  <option value="asesoria">Asesoría</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={fetchLeads}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors text-sm font-medium"
                data-testid="refresh-btn"
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                Actualizar
              </button>
              <button
                onClick={exportToCSV}
                disabled={filteredLeads.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50"
                data-testid="export-btn"
              >
                <Download size={16} />
                Exportar CSV
              </button>
            </div>
          </div>
        </div>

        {/* Leads Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw className="animate-spin mx-auto text-slate-400 mb-4" size={32} />
              <p className="text-slate-500">Cargando leads...</p>
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="text-slate-500">No hay leads para mostrar</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="leads-table">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Contacto
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Servicio
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Mensaje
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLeads.map((lead, index) => (
                    <tr
                      key={lead.id}
                      className="hover:bg-slate-50 transition-colors"
                      data-testid={`lead-row-${index}`}
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-slate-900">{lead.nombre}</p>
                          <div className="flex items-center gap-4 mt-1">
                            <span className="text-slate-500 text-sm flex items-center gap-1">
                              <Mail size={14} />
                              {lead.email}
                            </span>
                            <span className="text-slate-500 text-sm flex items-center gap-1">
                              <Phone size={14} />
                              {lead.telefono}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getServiceColor(
                            lead.servicio_interes
                          )}`}
                        >
                          {getServiceLabel(lead.servicio_interes)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-slate-600 text-sm max-w-xs truncate">
                          {lead.mensaje || "-"}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-slate-500 text-sm">{formatDate(lead.created_at)}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedLead(lead)}
                          className="text-blue-600 hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50 transition-colors"
                          data-testid={`view-lead-${index}`}
                        >
                          <Eye size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Results count */}
        {!loading && filteredLeads.length > 0 && (
          <p className="text-slate-500 text-sm mt-4 text-center">
            Mostrando {filteredLeads.length} de {leads.length} leads
          </p>
        )}
      </main>

      {/* Lead Detail Modal */}
      {selectedLead && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedLead(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            data-testid="lead-modal"
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3
                  className="text-xl font-bold text-slate-900"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  {selectedLead.nombre}
                </h3>
                <span
                  className={`inline-flex px-3 py-1 rounded-full text-xs font-medium mt-2 ${getServiceColor(
                    selectedLead.servicio_interes
                  )}`}
                >
                  {getServiceLabel(selectedLead.servicio_interes)}
                </span>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <Mail className="text-slate-400" size={20} />
                <div>
                  <p className="text-xs text-slate-500">Email</p>
                  <a
                    href={`mailto:${selectedLead.email}`}
                    className="text-slate-900 hover:text-blue-600"
                  >
                    {selectedLead.email}
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <Phone className="text-slate-400" size={20} />
                <div>
                  <p className="text-xs text-slate-500">Teléfono</p>
                  <a
                    href={`tel:${selectedLead.telefono}`}
                    className="text-slate-900 hover:text-blue-600"
                  >
                    {selectedLead.telefono}
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <Calendar className="text-slate-400" size={20} />
                <div>
                  <p className="text-xs text-slate-500">Fecha de registro</p>
                  <p className="text-slate-900">{formatDate(selectedLead.created_at)}</p>
                </div>
              </div>

              {selectedLead.mensaje && (
                <div className="p-3 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="text-slate-400" size={20} />
                    <p className="text-xs text-slate-500">Mensaje</p>
                  </div>
                  <p className="text-slate-900 text-sm leading-relaxed">
                    {selectedLead.mensaje}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <a
                href={`https://wa.me/${selectedLead.telefono.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-emerald-500 text-white py-3 rounded-xl font-medium text-center hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
              >
                <MessageSquare size={18} />
                WhatsApp
              </a>
              <a
                href={`mailto:${selectedLead.email}`}
                className="flex-1 bg-slate-100 text-slate-900 py-3 rounded-xl font-medium text-center hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
              >
                <Mail size={18} />
                Email
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
