import { useState } from "react";
import {
  Users,
  Plus,
  Search,
  Building2,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { STAGES, formatCurrency } from "./constants";

export const ContactsSection = ({ contacts, onSelectContact, onNewLead, loading, searchTerm, setSearchTerm }) => {
  const [filter, setFilter] = useState("");

  const filteredContacts = contacts?.filter((c) => {
    if (filter && c.etapa !== filter) return false;
    return true;
  }) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
            Contactos
          </h2>
          <p className="text-slate-500 mt-1">{contacts?.length || 0} contactos totales</p>
        </div>
        <button
          onClick={onNewLead}
          className="flex items-center gap-2 px-6 py-2 rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-colors text-sm font-medium shadow-lg shadow-orange-500/25"
          data-testid="new-lead-btn-contacts"
        >
          <Plus size={18} />
          Nuevo Lead
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por empresa, nombre o email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-sm"
            data-testid="contacts-search"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:border-orange-500 outline-none"
        >
          <option value="">Todas las etapas</option>
          {STAGES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Contacts Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-slate-400" size={24} />
          </div>
        ) : filteredContacts.length > 0 ? (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Empresa</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Contacto</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Etapa</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Valor</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Score</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredContacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => onSelectContact(contact)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                        <Building2 size={18} className="text-slate-400" />
                      </div>
                      <span className="font-medium text-slate-900">{contact.empresa}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-slate-900">{contact.nombre}</p>
                    <p className="text-xs text-slate-500">{contact.email || contact.telefono}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                      STAGES.find(s => s.id === contact.etapa)?.color || "bg-slate-500"
                    } text-white`}>
                      {STAGES.find(s => s.id === contact.etapa)?.label || contact.etapa}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-semibold text-green-600">
                      {formatCurrency(contact.valor_mensual)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {contact.probabilidad_cierre > 0 && (
                      <span className="text-sm font-medium text-slate-600">
                        {contact.probabilidad_cierre}%
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                      <ChevronRight size={18} className="text-slate-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-12 text-center">
            <Users className="mx-auto text-slate-300 mb-4" size={48} />
            <p className="text-slate-500">No hay contactos</p>
          </div>
        )}
      </div>
    </div>
  );
};
