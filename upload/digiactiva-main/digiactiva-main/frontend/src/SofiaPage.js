import { useState, useEffect, useRef, useCallback } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
  Send,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowLeft,
  Check,
  Clock,
  Users,
  Zap,
  Shield,
  Headphones,
  Building2,
  ShoppingCart,
  Calendar,
  MessageCircle,
  Bot,
  Mic,
} from "lucide-react";
import "@/SofiaPage.css";

const WHATSAPP_URL = "https://wa.me/56951107102";
const AGENT_ID = "agent_1901kpt5d5mwf8fazgwsmftxzxq2";

// SOFIA Voice Widget Component
function SofiaVoiceWidget() {
  const [logs, setLogs] = useState([]);
  const [volume, setVolume] = useState(75);
  const [isMuted, setIsMuted] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const scrollRef = useRef(null);
  const logIdRef = useRef(0);
  const timerRef = useRef(null);

  const addLog = useCallback((type, text) => {
    setLogs((prev) => [
      ...prev.slice(-50),
      { id: String(++logIdRef.current), timestamp: new Date(), type, text },
    ]);
  }, []);

  const conversation = useConversation({
    onConnect: () => {
      addLog("info", "Conectado a SOFIA");
      setCallDuration(0);
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    },
    onDisconnect: () => {
      addLog("info", "Sesión terminada");
      if (timerRef.current) clearInterval(timerRef.current);
    },
    onMessage: (message) => {
      const s = JSON.stringify(message);
      addLog("message", s.length > 120 ? s.slice(0, 120) + "..." : s);
    },
    onError: (error) => addLog("error", error.message || String(error)),
    onModeChange: (mode) => addLog("mode", JSON.stringify(mode)),
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCall = async () => {
    try {
      addLog("info", "Solicitando micrófono...");
      await navigator.mediaDevices.getUserMedia({ audio: true });
      addLog("info", "Iniciando sesión WebRTC...");
      await conversation.startSession({ agentId: AGENT_ID });
    } catch (err) {
      addLog("error", err instanceof Error ? err.message : String(err));
    }
  };

  const stopCall = async () => {
    try {
      await conversation.endSession();
      if (timerRef.current) clearInterval(timerRef.current);
    } catch (err) {
      addLog("error", err instanceof Error ? err.message : String(err));
    }
  };

  const sendText = async () => {
    if (!textInput.trim()) return;
    try {
      addLog("message", `Tú: ${textInput}`);
      await conversation.sendUserMessage(textInput);
      setTextInput("");
    } catch (err) {
      addLog("error", err instanceof Error ? err.message : String(err));
    }
  };

  const handleFeedback = async (positive) => {
    try {
      await conversation.sendFeedback(positive);
      addLog("info", positive ? "👍 Feedback positivo" : "👎 Feedback negativo");
    } catch (err) {
      addLog("error", err instanceof Error ? err.message : String(err));
    }
  };

  const isConnected = conversation.status === "connected";
  const isConnecting = conversation.status === "connecting";
  const minutes = String(Math.floor(callDuration / 60)).padStart(2, "0");
  const seconds = String(callDuration % 60).padStart(2, "0");

  return (
    <div className="w-full max-w-[320px] mx-auto sofia-animate-fade-in">
      <div className="sofia-iphone">
        <div className="sofia-screen">
          <div className="px-5 pt-2 pb-1 flex flex-col items-center min-h-[380px] relative z-10">
            {/* Dynamic Island */}
            <div className="flex justify-center pt-1 pb-2">
              <div
                className="w-[90px] h-[26px] bg-black rounded-full"
                style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.05), inset 0 0 4px rgba(0,0,0,0.8)" }}
              />
            </div>

            {/* Status Bar */}
            <div className="w-full flex items-center justify-between px-1 pb-2 text-[10px] text-white/40 font-semibold">
              <span>9:41</span>
              <div className="flex items-center gap-1">
                <div className="flex gap-[2px] items-end">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="w-[2.5px] rounded-sm bg-white/40"
                      style={{ height: `${5 + i * 2}px` }}
                    />
                  ))}
                </div>
                <svg className="w-6 h-3 ml-0.5" viewBox="0 0 25 12">
                  <rect x="0" y="0" width="21" height="12" rx="2" stroke="currentColor" fill="none" strokeWidth="1" className="text-white/40" />
                  <rect x="22" y="3.5" width="2" height="5" rx="1" className="fill-white/40" />
                  <rect x="1.5" y="1.5" width="16" height="9" rx="1" className="fill-green-500" />
                </svg>
              </div>
            </div>

            {/* Avatar + Name */}
            <div className="flex-1 flex flex-col items-center justify-center w-full -mt-1">
              <motion.div
                animate={isConnected ? { y: [0, -4, 0] } : {}}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="relative mb-3"
              >
                {isConnected && (
                  <div className="absolute inset-[-12px] rounded-full bg-green-400/15 sofia-animate-ripple" />
                )}
                {isConnected && (
                  <div className="absolute inset-[-6px] rounded-full bg-green-400/8 sofia-animate-pulse" />
                )}
                <div
                  className="relative w-[68px] h-[68px] rounded-full flex items-center justify-center"
                  style={{
                    background: isConnected
                      ? "linear-gradient(145deg, #1a3a2a 0%, #0d2818 50%, #1a2f1a 100%)"
                      : "linear-gradient(145deg, #2a2a2e 0%, #1a1a1e 50%, #222226 100%)",
                    boxShadow: isConnected
                      ? "0 0 30px -8px rgba(52,199,89,0.25), 0 2px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)"
                      : "0 8px 30px -8px rgba(0,0,0,0.5), 0 2px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
                  }}
                >
                  <span className="text-3xl">{isConnected ? "😊" : "🤖"}</span>
                </div>
              </motion.div>

              <h2
                className="text-2xl font-semibold text-white/90 tracking-tight"
                style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
              >
                SOFIA
              </h2>

              <AnimatePresence mode="wait">
                <motion.p
                  key={conversation.status + (conversation.isSpeaking ? "-s" : "")}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.3 }}
                  className={`text-sm mt-1 font-medium ${
                    isConnecting
                      ? "text-amber-400/80"
                      : isConnected
                      ? "text-green-400/80"
                      : "text-white/30"
                  }`}
                >
                  {isConnecting
                    ? "Llamando... ⏳"
                    : isConnected
                    ? conversation.isSpeaking
                      ? "Hablando... 🗣️"
                      : "Estoy lista 😊"
                    : "Toca para llamar"}
                </motion.p>
              </AnimatePresence>

              {isConnected && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-white/20 font-mono mt-0.5 tracking-wider"
                >
                  {minutes}:{seconds}
                </motion.p>
              )}

              {/* Wave Visualizer */}
              <div className="flex items-center justify-center gap-[3px] h-5 mt-1.5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className={`sofia-wave-bar ${isConnected ? "sofia-active" : ""}`} />
                ))}
              </div>
            </div>

            {/* Controls */}
            <div className="w-full pb-3 space-y-3">
              <div className="flex items-center justify-center gap-12">
                <AnimatePresence>
                  {(isConnected || isConnecting) && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="flex flex-col items-center gap-1"
                    >
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={stopCall}
                        className="w-[50px] h-[50px] rounded-full sofia-btn-red flex items-center justify-center"
                        data-testid="sofia-hangup-btn"
                      >
                        <PhoneOff className="w-5 h-5 text-white" strokeWidth={2} />
                      </motion.button>
                      <span className="text-[10px] text-white/30 font-medium">Colgar</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {!isConnected && !isConnecting ? (
                  <div className="flex flex-col items-center gap-1">
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={startCall}
                      className="w-[54px] h-[54px] rounded-full sofia-btn-green flex items-center justify-center sofia-animate-breathe"
                      data-testid="sofia-call-btn"
                    >
                      <Phone className="w-5 h-5 text-white" strokeWidth={2} />
                    </motion.button>
                    <span className="text-[10px] text-white/30 font-medium">Llamar</span>
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-1"
                  >
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => {
                        const m = !isMuted;
                        setIsMuted(m);
                        try {
                          conversation.setVolume({ volume: m ? 0 : volume / 100 });
                        } catch {
                          /* noop */
                        }
                      }}
                      className="w-[50px] h-[50px] rounded-full sofia-btn-glass hover:bg-white/10 flex items-center justify-center transition-colors"
                      data-testid="sofia-mute-btn"
                    >
                      {isMuted ? (
                        <VolumeX className="w-5 h-5 text-white/40" strokeWidth={2} />
                      ) : (
                        <Volume2 className="w-5 h-5 text-white/60" strokeWidth={2} />
                      )}
                    </motion.button>
                    <span className="text-[10px] text-white/30 font-medium">
                      {isMuted ? "Activar" : "Silenciar"}
                    </span>
                  </motion.div>
                )}
              </div>

              {/* Extended controls */}
              <AnimatePresence>
                {isConnected && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden space-y-2.5"
                  >
                    <div className="flex items-center gap-2.5 px-2">
                      <Volume2 className="w-3.5 h-3.5 text-white/30 shrink-0" />
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setVolume(val);
                          setIsMuted(val === 0);
                          try {
                            conversation.setVolume({ volume: val / 100 });
                          } catch {
                            /* noop */
                          }
                        }}
                        className="flex-1 h-1 accent-green-500 cursor-pointer"
                      />
                      <span className="text-[10px] text-white/25 font-mono w-6 text-right">
                        {isMuted ? "0" : volume}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <input
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendText()}
                        placeholder="Escribe un mensaje..."
                        className="flex-1 h-8 rounded-full sofia-input-dark text-white/80 text-[12px] placeholder:text-white/20 px-4 outline-none focus:ring-1 focus:ring-green-500/30"
                        data-testid="sofia-text-input"
                      />
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={sendText}
                        className="w-8 h-8 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center shadow-sm transition-colors shrink-0"
                        data-testid="sofia-send-btn"
                      >
                        <Send className="w-3 h-3 text-white" />
                      </motion.button>
                    </div>

                    <div className="flex items-center justify-center gap-2">
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => handleFeedback(true)}
                        className="w-7 h-7 rounded-full sofia-btn-glass hover:bg-white/10 transition-colors flex items-center justify-center"
                      >
                        <ThumbsUp className="w-3 h-3 text-white/30" />
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => handleFeedback(false)}
                        className="w-7 h-7 rounded-full sofia-btn-glass hover:bg-white/10 transition-colors flex items-center justify-center"
                      >
                        <ThumbsDown className="w-3 h-3 text-white/30" />
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Event Log */}
          <div className="border-t border-white/6">
            <button
              onClick={() => setShowLog(!showLog)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-white/20 hover:text-white/40 transition-colors relative z-10"
            >
              {showLog ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
              Eventos ({logs.length})
            </button>
            <AnimatePresence>
              {showLog && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: 120 }}
                  exit={{ height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div
                    ref={scrollRef}
                    className="h-28 overflow-y-auto px-4 pb-3 font-mono text-[9px] leading-relaxed space-y-0.5 bg-black/30 sofia-scroll relative z-10"
                  >
                    {logs.length === 0 && (
                      <p className="text-white/15 text-center py-6">Sin eventos aún</p>
                    )}
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className={
                          log.type === "error"
                            ? "text-red-400/70"
                            : log.type === "message"
                            ? "text-green-400/60"
                            : log.type === "mode"
                            ? "text-amber-400/60"
                            : "text-white/25"
                        }
                      >
                        <span className="text-white/15 mr-1.5">
                          {log.timestamp.toLocaleTimeString("es-ES", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                        {log.text}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex justify-center py-1.5 relative z-10">
            <div className="w-28 h-1 rounded-full bg-white/15" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Main SOFIA Landing Page
export default function SofiaPage() {
  const useCases = [
    {
      icon: <Headphones size={24} />,
      title: "Atención al cliente",
      description: "Responde consultas frecuentes, resuelve dudas y brinda soporte instantáneo.",
    },
    {
      icon: <Calendar size={24} />,
      title: "Agendamiento de citas",
      description: "Programa reuniones, reservas y citas automáticamente según disponibilidad.",
    },
    {
      icon: <ShoppingCart size={24} />,
      title: "Ventas y cotizaciones",
      description: "Presenta productos, genera cotizaciones y captura leads calificados.",
    },
    {
      icon: <Building2 size={24} />,
      title: "Recepción virtual",
      description: "Primera línea de contacto profesional para tu empresa 24/7.",
    },
  ];

  const benefits = [
    { icon: <Clock size={20} />, text: "Disponible 24/7 sin descanso" },
    { icon: <Zap size={20} />, text: "Respuestas instantáneas" },
    { icon: <Users size={20} />, text: "Atiende múltiples llamadas" },
    { icon: <Shield size={20} />, text: "Conversaciones seguras" },
    { icon: <Sparkles size={20} />, text: "IA que aprende y mejora" },
    { icon: <MessageSquare size={20} />, text: "Voz natural y fluida" },
  ];

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, rgba(139, 92, 246, 0.15) 0%, transparent 50%), linear-gradient(180deg, #0a0a0e 0%, #0d0d12 50%, #0a0a0e 100%)",
      }}
    >
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/20 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <a
              href="/"
              className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
            >
              <ArrowLeft size={18} />
              <span className="text-sm font-medium">Volver a Digiactiva</span>
            </a>
            <div className="flex items-center gap-2">
              <Bot className="text-purple-400" size={20} />
              <span
                className="text-lg font-bold text-white"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                SOFIA
              </span>
            </div>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors"
            >
              <MessageCircle size={16} />
              Contactar
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Content */}
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-medium mb-6">
                <Sparkles size={16} />
                Agente de voz con IA
              </span>

              <h1
                className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                Conoce a{" "}
                <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
                  SOFIA
                </span>
              </h1>

              <p className="text-xl text-slate-400 leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0">
                Tu agente de voz con inteligencia artificial que atiende a tus clientes{" "}
                <span className="text-white font-semibold">24 horas al día, 7 días a la semana</span>.
                Responde preguntas, agenda citas y nunca descansa.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-8">
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold text-lg hover:from-purple-600 hover:to-blue-600 transition-all shadow-lg shadow-purple-500/25"
                  data-testid="sofia-hero-cta"
                >
                  <Mic size={20} />
                  Solicitar demo
                </a>
                <a
                  href="#demo"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-white/10 border border-white/20 text-white font-medium text-lg hover:bg-white/20 transition-all"
                >
                  Probar ahora
                  <Phone size={18} />
                </a>
              </div>

              <p className="text-slate-500 text-sm">
                Powered by <span className="text-slate-400">ElevenLabs</span> · Conversational AI
              </p>
            </div>

            {/* Widget */}
            <div id="demo" className="flex justify-center">
              <ConversationProvider>
                <SofiaVoiceWidget />
              </ConversationProvider>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Strip */}
      <section className="py-12 border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {benefits.map((benefit, index) => (
              <div
                key={index}
                className="flex items-center gap-3 justify-center"
                data-testid={`sofia-benefit-${index}`}
              >
                <span className="text-purple-400">{benefit.icon}</span>
                <span className="text-sm text-slate-400">{benefit.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block text-sm uppercase tracking-[0.2em] font-medium text-purple-400 mb-4">
              Casos de uso
            </span>
            <h2
              className="text-3xl sm:text-4xl font-bold text-white mb-4"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              ¿Qué puede hacer SOFIA por tu negocio?
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              SOFIA se adapta a las necesidades de tu empresa, automatizando conversaciones y
              liberando tiempo para lo que realmente importa.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {useCases.map((useCase, index) => (
              <div
                key={index}
                className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-purple-500/30 transition-colors group"
                data-testid={`sofia-usecase-${index}`}
              >
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 mb-4 group-hover:bg-purple-500/20 transition-colors">
                  {useCase.icon}
                </div>
                <h3
                  className="text-lg font-semibold text-white mb-2"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  {useCase.title}
                </h3>
                <p className="text-slate-400 text-sm">{useCase.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block text-sm uppercase tracking-[0.2em] font-medium text-purple-400 mb-4">
              Proceso simple
            </span>
            <h2
              className="text-3xl sm:text-4xl font-bold text-white"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              ¿Cómo funciona?
            </h2>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: "01", title: "Conversamos", desc: "Entendemos tu negocio y necesidades" },
              { step: "02", title: "Configuramos", desc: "Personalizamos SOFIA para ti" },
              { step: "03", title: "Integramos", desc: "Conectamos con tu sistema" },
              { step: "04", title: "Activamos", desc: "SOFIA comienza a atender 24/7" },
            ].map((item, index) => (
              <div key={index} className="text-center relative">
                <div
                  className="text-5xl font-light text-purple-500/20 mb-4"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  {item.step}
                </div>
                <h3
                  className="text-lg font-semibold text-white mb-2"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  {item.title}
                </h3>
                <p className="text-slate-400 text-sm">{item.desc}</p>
                {index < 3 && (
                  <div className="hidden md:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-purple-500/30 to-transparent" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 px-4 bg-white/[0.02]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-block text-sm uppercase tracking-[0.2em] font-medium text-purple-400 mb-4">
              Inversión
            </span>
            <h2
              className="text-3xl sm:text-4xl font-bold text-white mb-4"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Un precio simple y transparente
            </h2>
            <p className="text-slate-400">
              Todo lo que necesitas para automatizar la atención de tu negocio
            </p>
          </div>

          <div className="relative">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-blue-500/20 blur-[60px] scale-90" />
            
            {/* Pricing Card */}
            <div 
              className="relative rounded-3xl p-8 md:p-12 border border-purple-500/30"
              style={{ background: "linear-gradient(145deg, rgba(139,92,246,0.1) 0%, rgba(59,130,246,0.05) 100%)" }}
              data-testid="sofia-pricing-card"
            >
              <div className="grid md:grid-cols-2 gap-8 items-center">
                {/* Left - Price */}
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 text-purple-400 text-xs font-medium mb-4">
                    <Sparkles size={14} />
                    SOFIA VOZ
                  </div>
                  
                  <div className="flex items-baseline gap-2 mb-2">
                    <span 
                      className="text-5xl md:text-6xl font-bold text-white"
                      style={{ fontFamily: "Outfit, sans-serif" }}
                    >
                      $450.000
                    </span>
                    <span className="text-slate-400 text-lg">+ IVA / mes</span>
                  </div>
                  
                  <p className="text-slate-500 mb-6">
                    Activación única: <span className="text-white font-medium">$150.000 + IVA</span>
                  </p>

                  <a
                    href={WHATSAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold hover:from-purple-600 hover:to-blue-600 transition-all shadow-lg shadow-purple-500/25"
                    data-testid="sofia-pricing-cta"
                  >
                    <MessageCircle size={20} />
                    Activar SOFIA
                  </a>
                </div>

                {/* Right - Features */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white mb-4" style={{ fontFamily: "Outfit, sans-serif" }}>
                    Incluye:
                  </h3>
                  
                  {[
                    "2.000 minutos de llamada mensuales",
                    "Atención 24/7 sin interrupciones",
                    "Voz natural con IA de ElevenLabs",
                    "Configuración personalizada",
                    "Integración con tu negocio",
                    "Soporte técnico incluido",
                    "Dashboard de métricas",
                    "Grabación de llamadas",
                  ].map((feature, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                        <Check size={12} className="text-purple-400" />
                      </div>
                      <span className="text-slate-300 text-sm">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom note */}
              <div className="mt-8 pt-6 border-t border-white/10 text-center">
                <p className="text-slate-500 text-sm">
                  ¿Necesitas más minutos? <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">Contáctanos</a> para un plan personalizado.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            ¿Listo para tener tu{" "}
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              agente IA
            </span>
            ?
          </h2>
          <p className="text-xl text-slate-400 mb-10">
            Agenda una demo personalizada y descubre cómo SOFIA puede transformar la atención de tu
            negocio.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-10 py-5 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold text-lg hover:from-purple-600 hover:to-blue-600 transition-all shadow-lg shadow-purple-500/25"
              data-testid="sofia-final-cta"
            >
              <MessageCircle size={22} />
              Solicitar demo por WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-slate-500 text-sm">
            © 2025 SOFIA by{" "}
            <a href="/" className="text-slate-400 hover:text-white transition-colors">
              Digiactiva
            </a>
            . Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
