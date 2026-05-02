import { useState, useEffect } from "react";
import axios from "axios";
import { RefreshCw, Loader2 } from "lucide-react";
import { API } from "./constants";

export const ConversationsSection = ({ authHeaders }) => {
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/crm/chat-sessions?limit=100`, authHeaders());
      setSessions(res.data.sessions || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchSessions(); /* eslint-disable-next-line */ }, []);

  const openSession = async (sid) => {
    setSelected(sid);
    setDetail(null);
    try {
      const res = await axios.get(`${API}/crm/chat-sessions/${sid}`, authHeaders());
      setDetail(res.data);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
            Conversaciones
          </h2>
          <p className="text-slate-500 mt-1">{sessions.length} sesiones de chat</p>
        </div>
        <button onClick={fetchSessions} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 text-sm font-medium">
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 overflow-hidden max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={20} /></div>
          ) : sessions.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">Aún no hay conversaciones</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => openSession(s.id)}
                    className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${selected === s.id ? "bg-orange-50" : ""}`}
                    data-testid={`session-${s.id}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {s.lead_data?.name || s.lead_data?.business || "Visitante anónimo"}
                      </span>
                      {s.contact_id && (
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">CRM</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{s.last_message_preview || "—"}</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {s.messages_count} mensajes · {new Date(s.updated_at).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 max-h-[70vh] flex flex-col">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
              Selecciona una conversación
            </div>
          ) : !detail ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" size={20} /></div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-900">
                  {detail.lead_data?.name || "Visitante anónimo"}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {detail.lead_data?.email && <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full text-slate-600">{detail.lead_data.email}</span>}
                  {detail.lead_data?.phone && <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full text-slate-600">{detail.lead_data.phone}</span>}
                  {detail.lead_data?.niche && <span className="text-[10px] bg-purple-100 px-2 py-0.5 rounded-full text-purple-700">{detail.lead_data.niche}</span>}
                  {typeof detail.lead_data?.score === "number" && <span className="text-[10px] bg-orange-100 px-2 py-0.5 rounded-full text-orange-700 font-semibold">Score IA: {detail.lead_data.score}</span>}
                  {detail.lead_data?.plan_recomendado && <span className="text-[10px] bg-green-100 px-2 py-0.5 rounded-full text-green-700">Plan: {detail.lead_data.plan_recomendado}</span>}
                </div>
                {detail.lead_data?.proxima_accion && (
                  <p className="text-xs text-slate-600 mt-2"><b>Próxima acción IA:</b> {detail.lead_data.proxima_accion}</p>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50">
                {detail.messages?.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                      m.role === "user" ? "bg-orange-500 text-white" : "bg-white border border-slate-200 text-slate-800"
                    }`}>
                      {m.content}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
