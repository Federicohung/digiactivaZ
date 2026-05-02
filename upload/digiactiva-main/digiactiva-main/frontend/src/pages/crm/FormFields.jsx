export const FormField = ({ label, value, onChange, disabled, type = "text" }) => (
  <div>
    <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-orange-500 outline-none disabled:bg-slate-50 disabled:text-slate-500"
    />
  </div>
);

export const FormSelect = ({ label, value, onChange, options, disabled }) => (
  <div>
    <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:border-orange-500 outline-none disabled:bg-slate-50 disabled:text-slate-500"
    >
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>{opt.label}</option>
      ))}
    </select>
  </div>
);
