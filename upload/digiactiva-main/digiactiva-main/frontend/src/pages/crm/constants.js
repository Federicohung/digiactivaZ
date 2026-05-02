// Shared constants and helpers for CRM page

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Pipeline stages
export const STAGES = [
  { id: "nuevo", label: "Nuevo", color: "bg-slate-500" },
  { id: "trabajando", label: "Trabajando", color: "bg-blue-500" },
  { id: "propuesta", label: "Propuesta", color: "bg-purple-500" },
  { id: "cierre", label: "Cierre", color: "bg-amber-500" },
  { id: "ganado", label: "Ganado", color: "bg-green-500" },
  { id: "perdido", label: "Perdido", color: "bg-red-500" },
];

export const SOURCES = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
  { id: "referido", label: "Referido" },
  { id: "formulario", label: "Formulario" },
  { id: "email", label: "Email" },
  { id: "llamada", label: "Llamada" },
  { id: "web", label: "Web" },
  { id: "landing_chat", label: "Chat IA" },
];

export const INTEREST_STYLES = {
  frio: { label: "Frío", bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
  tibio: { label: "Tibio", bg: "bg-blue-100", text: "text-blue-700", dot: "bg-blue-500" },
  caliente: { label: "Caliente", bg: "bg-orange-100", text: "text-orange-700", dot: "bg-orange-500" },
  muy_caliente: { label: "Muy caliente", bg: "bg-red-100", text: "text-red-700", dot: "bg-red-500" },
};

// Format currency
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(amount);
};

export const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
};
