import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { FormField } from "./FormFields";

export const SettingsSection = ({ settings, onUpdateSettings }) => {
  const [formData, setFormData] = useState(settings || { meta_mensual: 0 });
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await onUpdateSettings(formData);
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error("Error saving settings:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
          Ajustes
        </h2>
        <p className="text-slate-500 mt-1">Configura tu CRM</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
        <div>
          <h3 className="font-semibold text-slate-900 mb-4">Objetivos</h3>
          <FormField
            label="Meta Mensual (CLP)"
            value={formData.meta_mensual}
            onChange={(v) => setFormData({ ...formData, meta_mensual: parseInt(v) || 0 })}
            type="number"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-orange-500 text-white font-medium hover:bg-orange-600 transition-colors"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
          Guardar ajustes
        </button>
      </div>
    </div>
  );
};
