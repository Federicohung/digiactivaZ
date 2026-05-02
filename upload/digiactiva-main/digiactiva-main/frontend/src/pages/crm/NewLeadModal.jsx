import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { SOURCES } from "./constants";
import { FormField, FormSelect } from "./FormFields";

export const NewLeadModal = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({
    empresa: "",
    nombre: "",
    telefono: "",
    email: "",
    nicho: "",
    fuente: "formulario",
    valor_mensual: 0,
    setup_fee: 0,
    notas: "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error("Error creating lead:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Nuevo Lead</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Empresa *"
              value={formData.empresa}
              onChange={(v) => setFormData({ ...formData, empresa: v })}
            />
            <FormField
              label="Nombre *"
              value={formData.nombre}
              onChange={(v) => setFormData({ ...formData, nombre: v })}
            />
            <FormField
              label="Teléfono *"
              value={formData.telefono}
              onChange={(v) => setFormData({ ...formData, telefono: v })}
            />
            <FormField
              label="Email"
              value={formData.email}
              onChange={(v) => setFormData({ ...formData, email: v })}
            />
            <FormField
              label="Nicho"
              value={formData.nicho}
              onChange={(v) => setFormData({ ...formData, nicho: v })}
            />
            <FormSelect
              label="Fuente"
              value={formData.fuente}
              onChange={(v) => setFormData({ ...formData, fuente: v })}
              options={SOURCES}
            />
            <FormField
              label="Valor Mensual"
              value={formData.valor_mensual}
              onChange={(v) => setFormData({ ...formData, valor_mensual: parseInt(v) || 0 })}
              type="number"
            />
            <FormField
              label="Setup Fee"
              value={formData.setup_fee}
              onChange={(v) => setFormData({ ...formData, setup_fee: parseInt(v) || 0 })}
              type="number"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Notas</label>
            <textarea
              value={formData.notas}
              onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-orange-500 outline-none"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading || !formData.empresa || !formData.nombre || !formData.telefono}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500 text-white font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              Crear Lead
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 rounded-xl bg-slate-100 text-slate-700 font-medium hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
