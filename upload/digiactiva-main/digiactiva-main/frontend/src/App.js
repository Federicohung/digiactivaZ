import { useEffect, useState, lazy, Suspense } from "react";
import "@/App.css";
import axios from "axios";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ChatWidget from "./components/ChatWidget";

// Lazy-loaded routes to keep landing bundle small
const AdminPanel = lazy(() => import("./AdminPanel"));
const SofiaPage = lazy(() => import("./SofiaPage"));
const CRMPage = lazy(() => import("./CRMPage"));
const PrivacyPage = lazy(() => import("./pages/LegalPages").then(m => ({ default: m.PrivacyPage })));
const CookiesPage = lazy(() => import("./pages/LegalPages").then(m => ({ default: m.CookiesPage })));
const TermsPage = lazy(() => import("./pages/LegalPages").then(m => ({ default: m.TermsPage })));
const EmbedChat = lazy(() => import("./pages/EmbedChat"));
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger } from
"@/components/ui/accordion";
import {
  Building2,
  Globe,
  Calculator,
  Rocket,
  Check,
  MessageCircle,
  ArrowRight,
  Menu,
  X,
  ChevronRight,
  Users,
  BarChart3,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Headphones,
  Target,
  Settings,
  PieChart,
  Mail,
  Image,
  UtensilsCrossed,
  Calendar,
  Code,
  Server,
  Globe2,
  FormInput,
  Sparkles,
  Shield,
  Clock,
  Heart,
  Zap,
  MapPin,
  Phone,
  Send,
  Loader2,
  Mic,
  Bot,
  PhoneCall,
  Key,
  Volume2 } from
"lucide-react";

const WHATSAPP_URL = "https://wa.me/56951107102";
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Header Component
const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <header
      data-testid="header"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      isScrolled ?
      "bg-white/85 backdrop-blur-2xl border-b border-slate-200/40" :
      "bg-white/60 backdrop-blur-xl"}`
      }>

      <div className="container-custom">
        <div className="flex items-center justify-between h-14">
          <a
            href="/"
            data-testid="logo"
            className="text-lg font-semibold tracking-tight text-slate-900"
            style={{ fontFamily: "Outfit, sans-serif" }}>

            DIGIACTIVA
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-7">
            <button
              onClick={() => scrollToSection("solucion")}
              className="text-xs text-slate-700 hover:text-slate-900 transition-colors font-normal"
              data-testid="nav-servicios">

              Solución
            </button>
            <button
              onClick={() => scrollToSection("planes")}
              className="text-xs text-slate-700 hover:text-slate-900 transition-colors font-normal"
              data-testid="nav-planes">

              Planes
            </button>
            <button
              onClick={() => scrollToSection("casos-de-uso")}
              className="text-xs text-slate-700 hover:text-slate-900 transition-colors font-normal"
              data-testid="nav-casos">

              Casos
            </button>
            <button
              onClick={() => scrollToSection("faq")}
              className="text-xs text-slate-700 hover:text-slate-900 transition-colors font-normal"
              data-testid="nav-faq">

              FAQ
            </button>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="nav-cta"
              style={{ background: "#0066FF" }}
              className="inline-flex items-center justify-center py-1.5 px-4 rounded-full text-xs text-white hover:opacity-90 transition-all">

              Solicitar demo
            </a>
          </nav>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2"
            data-testid="mobile-menu-toggle">

            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen &&
        <div
          className="md:hidden absolute top-20 left-0 right-0 bg-white/95 backdrop-blur-xl border-b border-slate-200/50 p-6"
          data-testid="mobile-menu">

            <nav className="flex flex-col gap-4">
              <button
              onClick={() => scrollToSection("solucion")}
              className="text-left py-2 text-slate-700 font-medium">

                Solución
              </button>
              <button
              onClick={() => scrollToSection("planes")}
              className="text-left py-2 text-slate-700 font-medium">

                Planes
              </button>
              <button
              onClick={() => scrollToSection("casos-de-uso")}
              className="text-left py-2 text-slate-700 font-medium">

                Casos
              </button>
              <button
              onClick={() => scrollToSection("faq")}
              className="text-left py-2 text-slate-700 font-medium">

                FAQ
              </button>
              <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: "#0066FF" }}
              className="inline-flex items-center justify-center gap-2 py-3 px-5 rounded-full font-semibold text-sm text-white shadow-lg shadow-[#0066FF]/30 mt-2">

                <MessageCircle size={16} />
                Solicitar demo
              </a>
            </nav>
          </div>
        }
      </div>
    </header>);

};

// Hero Section
// How It Works Section — 3 pasos
const HowItWorksSection = () => {
  const steps = [
  {
    n: "1",
    title: "Capturamos o conectamos tus canales",
    desc: "Instalamos el chat IA en tu web y conectamos tu WhatsApp Business. Todo funciona en menos de 72 horas sin que toques código."
  },
  {
    n: "2",
    title: "El agente IA atiende y califica",
    desc: "Responde 24/7, pregunta lo necesario, filtra leads y deja cada oportunidad registrada con temperatura y plan recomendado."
  },
  {
    n: "3",
    title: "El panel ordena leads, estados y seguimiento",
    desc: "Ves todo en el CRM: pipeline kanban, ficha del cliente, historial unificado y próxima acción sugerida por el copiloto IA."
  }];


  return (
    <section
      id="como-funciona"
      data-testid="how-it-works-section"
      className="py-24 md:py-32 bg-white">

      <div className="container-custom">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <h2
            className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.03em] text-slate-900 mb-6 leading-[1.05]"
            style={{ fontFamily: "Outfit, sans-serif" }}>

            Cómo funciona{" "}
            <span className="text-slate-500">en 3 pasos simples.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-4 max-w-6xl mx-auto">
          {steps.map((s, i) =>
          <div
            key={s.n}
            data-testid={`howitworks-step-${i}`}
            className="rounded-3xl p-9 flex flex-col"
            style={{ background: "#f5f5f7" }}>

              <span
              className="text-5xl font-semibold mb-5 leading-none"
              style={{ color: "#0066FF", fontFamily: "Outfit, sans-serif" }}>

                {s.n}
              </span>
              <h3
              className="text-xl font-semibold text-slate-900 mb-3 tracking-[-0.01em]"
              style={{ fontFamily: "Outfit, sans-serif" }}>

                {s.title}
              </h3>
              <p className="text-base text-slate-600 leading-relaxed font-light">{s.desc}</p>
            </div>
          )}
        </div>
      </div>
    </section>);

};

// Benefits Section
const BenefitsSection = () => {
  const benefits = [
  { icon: Clock, title: "Atención 24/7", desc: "Tu agente IA responde incluso de madrugada y en fin de semana." },
  { icon: Zap, title: "Más velocidad de respuesta", desc: "Contacta al lead en segundos, no en horas." },
  { icon: Target, title: "Menos leads perdidos", desc: "Ningún mensaje queda sin responder ni sin registrar." },
  { icon: LayoutDashboard, title: "Mejor seguimiento", desc: "Sabes en qué etapa está cada cliente y qué toca hacer." },
  { icon: BarChart3, title: "Mayor control comercial", desc: "Métricas claras: leads, temperatura, revenue potencial, cierres." },
  { icon: Sparkles, title: "Sin equipo TI grande", desc: "Automatización lista sin contratar desarrolladores ni ops." }];


  return (
    <section
      id="beneficios"
      data-testid="benefits-section"
      className="py-24 md:py-32"
      style={{ background: "#f5f5f7" }}>

      <div className="container-custom">
        <div className="max-w-4xl mx-auto text-center mb-14">
          <h2
            className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.03em] text-slate-900 mb-6 leading-[1.05]"
            style={{ fontFamily: "Outfit, sans-serif" }}>

            Beneficios concretos{" "}
            <span className="text-slate-500">que notas desde el día 1.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
          {benefits.map((b, i) =>
          <div
            key={b.title}
            data-testid={`benefit-${i}`}
            className="bg-white rounded-2xl p-7 flex flex-col">

              <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
              style={{ background: "rgba(0, 102, 255, 0.08)" }}>

                <b.icon size={22} style={{ color: "#0066FF" }} />
              </div>
              <h3
              className="text-lg font-semibold text-slate-900 mb-2 tracking-[-0.01em]"
              style={{ fontFamily: "Outfit, sans-serif" }}>

                {b.title}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed font-light">{b.desc}</p>
            </div>
          )}
        </div>
      </div>
    </section>);

};

const HeroSection = () => {
  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section
      data-testid="hero-section"
      className="relative min-h-screen flex items-center justify-center pt-14 bg-white">

      <div className="container-custom relative z-10">
        <div className="max-w-5xl mx-auto text-center py-16 md:py-24">
          <h1
            className="text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-[-0.04em] text-slate-900 mb-6 leading-[1.05]"
            style={{ fontFamily: "Outfit, sans-serif" }}
            data-testid="hero-headline">

            Agentes IA, WhatsApp y CRM{" "}
            <span style={{ color: "#0066FF" }}>para negocios locales</span>{" "}
            <span className="text-slate-500">en Chile y España.</span>
          </h1>

          <p
            className="text-lg sm:text-xl text-slate-600 leading-snug mb-10 max-w-3xl mx-auto font-light tracking-tight"
            data-testid="hero-subheadline">

            Automatiza la atención, captura leads, organiza tus clientes y mejora tus ventas desde una solución simple, moderna y conectada a WhatsApp.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center items-center mb-6">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="hero-cta-primary"
              onClick={() => { try { window.dataLayer?.push({ event: 'cta_primary_click', location: 'hero' }); } catch(e){} }}
              style={{ background: "#0066FF" }}
              className="inline-flex items-center justify-center gap-2 py-3.5 px-8 rounded-full font-medium text-base text-white hover:opacity-90 transition-all">

              Solicitar diagnóstico gratuito
            </a>
            <a
              href="#solucion"
              data-testid="hero-cta-secondary"
              onClick={() => { try { window.dataLayer?.push({ event: 'cta_secondary_click', location: 'hero' }); } catch(e){} }}
              className="inline-flex items-center gap-1 font-medium text-base hover:underline transition-all"
              style={{ color: "#0066FF" }}>

              Ver cómo funciona <ArrowRight size={16} />
            </a>
          </div>

          <p className="text-sm text-slate-500 mt-8 max-w-2xl mx-auto">
            Ideal para restaurantes, clínicas, comercios, servicios profesionales, inmobiliarias y pymes en Chile y España. Sin equipo técnico · Funcionando en 72 horas.
          </p>
        </div>
      </div>
    </section>);

};

// Problem Section — Tus clientes escriben pero se pierden
const ProblemSection = () => {
  const bullets = [
  "Leads sin respuesta",
  "Conversaciones desordenadas",
  "Seguimientos olvidados",
  "Clientes calientes que se enfrían",
  "Falta de control comercial"];


  return (
    <section
      id="problema"
      data-testid="problem-section"
      className="py-24 md:py-32"
      style={{ background: "#f5f5f7" }}>

      <div className="container-custom">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <h2
            className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.03em] text-slate-900 mb-8 leading-[1.05]"
            style={{ fontFamily: "Outfit, sans-serif" }}>

            Tus clientes escriben,{" "}
            <span className="text-slate-500">pero muchos se pierden antes de comprar.</span>
          </h2>
          <p className="text-lg sm:text-xl text-slate-600 leading-relaxed max-w-3xl mx-auto font-light">
            Los negocios pierden oportunidades porque los mensajes quedan dispersos en WhatsApp, formularios, chats y conversaciones sin seguimiento. <span className="text-slate-900 font-medium">DigiActiva centraliza esas oportunidades</span> y usa IA para detectar qué leads tienen más intención de compra.
          </p>
        </div>

        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {bullets.map((b, i) =>
          <div
            key={i}
            data-testid={`problem-bullet-${i}`}
            className="flex items-center gap-2.5 bg-white rounded-2xl px-5 py-4 shadow-sm">

              <X size={16} className="text-red-400 flex-shrink-0" />
              <span className="text-sm text-slate-700 font-medium">{b}</span>
            </div>
          )}
        </div>
      </div>
    </section>);

};

// Solution Section — Un agente IA conectado a tu CRM comercial
const SolutionSection = () => {
  const cards = [
  { icon: MessageCircle, title: "Chat IA en tu web", desc: "Agente IA que conversa, califica leads y captura datos 24/7." },
  { icon: Phone, title: "WhatsApp Business conectado", desc: "Recibe y responde desde el CRM. Cero mensajes perdidos." },
  { icon: LayoutDashboard, title: "CRM comercial", desc: "Pipeline kanban con 6 etapas, ficha de contacto y métricas." },
  { icon: FileText, title: "Conversaciones unificadas", desc: "Web + WhatsApp en un solo historial por contacto." },
  { icon: Sparkles, title: "IA Copiloto", desc: "Resume el lead, mide su temperatura y te dice la próxima acción." },
  { icon: Mic, title: "Sofía Voz para llamadas", desc: "Agente de voz IA que atiende llamadas telefónicas 24/7.", href: "/sofia", ctaLabel: "Probar SOFIA" }];


  return (
    <section
      id="solucion"
      data-testid="solution-section"
      className="py-24 md:py-32 bg-white">

      <div className="container-custom">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <h2
            className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.03em] text-slate-900 mb-8 leading-[1.05]"
            style={{ fontFamily: "Outfit, sans-serif" }}>

            Un agente IA conectado{" "}
            <span className="text-slate-500">a tu CRM comercial.</span>
          </h2>
          <p className="text-lg sm:text-xl text-slate-600 leading-relaxed font-light max-w-3xl mx-auto">
            El agente conversa, captura datos, responde preguntas y deja cada oportunidad registrada. Luego el CRM muestra el historial, la temperatura del lead, el plan recomendado y la próxima acción sugerida.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
          {cards.map((c, i) =>
          <div
            key={i}
            data-testid={`solution-card-${i}`}
            className="rounded-3xl p-9 hover:scale-[1.01] transition-all flex flex-col min-h-[280px]"
            style={{ background: "#f5f5f7" }}>

              <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6"
              style={{ background: "rgba(255, 77, 0, 0.08)" }}>

                <c.icon size={26} style={{ color: "#0066FF" }} />
              </div>
              <h3
              className="text-2xl font-semibold text-slate-900 mb-3 tracking-[-0.02em]"
              style={{ fontFamily: "Outfit, sans-serif" }}>

                {c.title}
              </h3>
              <p className="text-base text-slate-600 leading-relaxed flex-grow font-light">{c.desc}</p>

              {c.href && (
                <a
                  href={c.href}
                  data-testid={`solution-card-cta-${i}`}
                  className="inline-flex items-center gap-1 mt-6 font-medium text-base hover:underline transition-all"
                  style={{ color: "#0066FF" }}>

                  {c.ctaLabel} <ArrowRight size={14} />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </section>);

};

// Differential Section — No es solo un chatbot. Es un sistema comercial.
const DifferentialSection = () => {
  const before = [
  "WhatsApp manual",
  "Leads sin seguimiento",
  "Conversaciones perdidas",
  "Sin prioridad comercial"];

  const after = [
  "Chat IA capta leads",
  "WhatsApp responde",
  "CRM ordena cada conversación",
  "IA prioriza qué leads están calientes",
  "Tú decides qué cerrar"];


  return (
    <section
      id="diferencial"
      data-testid="differential-section"
      className="py-24 md:py-32 bg-black text-white">

      <div className="container-custom">
        <div className="max-w-4xl mx-auto text-center mb-14">
          <h2
            className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.03em] mb-4 leading-[1.05]"
            style={{ fontFamily: "Outfit, sans-serif" }}>

            No es solo un chatbot.{" "}
            <span style={{ color: "#4D9FFF" }}>Es un sistema comercial.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-5 max-w-5xl mx-auto">
          {/* Antes */}
          <div className="rounded-3xl p-9" style={{ background: "#1d1d1f" }} data-testid="differential-before">
            <p className="text-xs uppercase tracking-[0.18em] font-semibold text-slate-500 mb-6">Antes</p>
            <ul className="space-y-4">
              {before.map((b, i) =>
              <li key={i} className="flex items-start gap-3 text-slate-400">
                  <X size={18} className="text-red-400/70 flex-shrink-0 mt-0.5" />
                  <span className="line-through text-base">{b}</span>
                </li>
              )}
            </ul>
          </div>

          {/* Con DigiActiva */}
          <div
            className="rounded-3xl p-9"
            style={{ background: "linear-gradient(135deg, rgba(255,77,0,0.15), rgba(255,77,0,0.05))", border: "1px solid rgba(255,77,0,0.3)" }}
            data-testid="differential-after">

            <p className="text-xs uppercase tracking-[0.18em] font-semibold mb-6" style={{ color: "#4D9FFF" }}>Con DigiActiva</p>
            <ul className="space-y-4">
              {after.map((a, i) =>
              <li key={i} className="flex items-start gap-3 text-white">
                  <Check size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span className="text-base">{a}</span>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </section>);

};

// Use Cases Section — Diseñado para negocios que viven de responder rápido
const UseCasesSection = () => {
  const cases = [
  { icon: Heart, title: "Clínicas estéticas", desc: "Capta consultas, agenda y filtra por tratamiento." },
  { icon: Shield, title: "Abogados de extranjería", desc: "Califica casos y prioriza los urgentes." },
  { icon: UtensilsCrossed, title: "Restaurantes", desc: "Reservas, delivery y pedidos por WhatsApp." },
  { icon: Building2, title: "Inmobiliarias", desc: "Califica compradores y arrendadores antes de visita." },
  { icon: Users, title: "Academias", desc: "Capta alumnos y responde dudas de programas." },
  { icon: Calculator, title: "Servicios profesionales", desc: "Filtra leads, agenda llamadas y cotiza rápido." },
  { icon: MapPin, title: "Negocios locales", desc: "Convierte cada mensaje en una oportunidad medible." }];


  return (
    <section
      id="casos-de-uso"
      data-testid="use-cases-section"
      className="py-24 md:py-32"
      style={{ background: "#f5f5f7" }}>

      <div className="container-custom">
        <div className="max-w-4xl mx-auto text-center mb-14">
          <h2
            className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.03em] text-slate-900 mb-4 leading-[1.05]"
            style={{ fontFamily: "Outfit, sans-serif" }}>

            Diseñado para negocios{" "}
            <span className="text-slate-500">que viven de responder rápido.</span>
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-w-6xl mx-auto">
          {cases.map((c, i) =>
          <div
            key={i}
            data-testid={`use-case-${i}`}
            className="bg-white hover:scale-[1.02] rounded-2xl p-6 transition-all flex flex-col">

              <div
              className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
              style={{ background: "rgba(255, 77, 0, 0.08)" }}>

                <c.icon size={20} style={{ color: "#0066FF" }} />
              </div>
              <h3
              className="font-semibold text-slate-900 mb-1.5 text-base tracking-[-0.01em]"
              style={{ fontFamily: "Outfit, sans-serif" }}>

                {c.title}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed font-light">{c.desc}</p>
            </div>
          )}
        </div>
      </div>
    </section>);

};

// Trust Strip Section
const TrustStrip = () => {
  const items = [
  { icon: <Sparkles size={18} />, text: "Soluciones simples para negocios reales" },
  { icon: <Shield size={18} />, text: "Sin complicaciones técnicas" },
  { icon: <Target size={18} />, text: "Enfocado en resultados" },
  { icon: <Zap size={18} />, text: "Todo en un solo lugar" }];


  return (
    <section
      data-testid="trust-strip"
      className="py-8 bg-white border-y border-slate-100">

      <div className="container-custom">
        <div className="flex flex-wrap justify-center gap-8 md:gap-16">
          {items.map((item, index) =>
          <div
            key={index}
            className="trust-item"
            data-testid={`trust-item-${index}`}>

              <span className="text-blue-500">{item.icon}</span>
              <span>{item.text}</span>
            </div>
          )}
        </div>
      </div>
    </section>);

};

// Services Overview Section
const ServicesSection = () => {
  const services = [
  {
    icon: <Building2 size={24} />,
    title: "Formalización",
    description:
    "Creamos tu empresa, gestionamos inicio de actividades y te dejamos listo para operar legalmente en Chile.",
    cta: "Formalizar mi negocio"
  },
  {
    icon: <Globe size={24} />,
    title: "Presencia Digital",
    description:
    "Página web profesional, WhatsApp Business configurado y presencia online que genera confianza.",
    cta: "Crear mi presencia"
  },
  {
    icon: <Calculator size={24} />,
    title: "Gestión Mensual",
    description:
    "Contabilidad básica, declaraciones, boletas y todo el orden que necesitas mes a mes.",
    cta: "Ordenar mi negocio"
  },
  {
    icon: <Rocket size={24} />,
    title: "Crecimiento",
    description:
    "Publicidad digital, automatizaciones y estrategias para escalar tus ventas.",
    cta: "Hacer crecer mi negocio"
  }];


  return (
    <section
      id="servicios"
      data-testid="services-section"
      className="section-padding bg-slate-50/50">

      <div className="container-custom">
        <div className="text-center mb-16">
          <span className="inline-block text-sm uppercase tracking-[0.2em] font-medium text-blue-600 mb-4">
            Nuestros servicios
          </span>
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight text-slate-900"
            style={{ fontFamily: "Outfit, sans-serif" }}>

            Todo lo que necesitas para tu negocio
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {services.map((service, index) =>
          <div
            key={index}
            className="service-card glass-card glass-card-hover rounded-3xl p-8 cursor-pointer group"
            data-testid={`service-card-${index}`}>

              <div className="service-icon-container mb-6 text-blue-600">
                {service.icon}
              </div>
              <h3
              className="text-xl font-medium text-slate-900 mb-3"
              style={{ fontFamily: "Outfit, sans-serif" }}>

                {service.title}
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed mb-6">
                {service.description}
              </p>
              <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-600 font-medium text-sm group-hover:gap-3 transition-all">

                {service.cta}
                <ChevronRight size={16} />
              </a>
            </div>
          )}
        </div>
      </div>
    </section>);

};

// Pricing Section
const PricingSection = () => {
  const [country, setCountry] = useState("CL"); // "CL" | "ES"
  const isCL = country === "CL";

  const plans = [
  {
    badge: "PLAN 01",
    name: "Esencial",
    accent: "emerald",
    subtitle: "Captación IA + WhatsApp + CRM básico",
    headline: "Para de perder leads. Tu web capta y tu WhatsApp responde.",
    priceCL: "$99.000",
    priceES: "€147",
    period: "/ mes",
    isPopular: false,
    cta: "Empezar ahora",
    sections: [
    {
      title: "Chat IA en tu web",
      items: [
      ["yes", "Agente IA que califica leads 24/7"],
      ["yes", "Captura datos del visitante al CRM"],
      ["yes", "Prompt configurado para tu negocio"]]

    },
    {
      title: "CRM básico — lista de contactos",
      items: [
      ["yes", "Lista de contactos con estado simple"],
      ["yes", "Ficha básica por contacto"],
      ["yes", "Historial de mensajes por contacto"],
      ["no", "Pipeline kanban visual"],
      ["no", "Alertas y prioridades IA"]]

    },
    {
      title: "WhatsApp Business",
      items: [
      ["key", "Recibe y responde desde el CRM"],
      ["info", "Requiere cuenta Meta Business"]]

    },
    {
      title: "Soporte y onboarding",
      items: [
      ["yes", "Guía de configuración paso a paso"],
      ["yes", "Soporte por email — respuesta 48h"],
      ["no", "Setup asistido por el equipo"]]

    }]

  },
  {
    badge: "PLAN 02",
    name: "Premium",
    accent: "orange",
    subtitle: "CRM comercial completo + IA Copiloto",
    headline: "Gestiona, prioriza y cierra. El CRM que trabaja contigo.",
    priceCL: "$199.000",
    priceES: "€297",
    period: "/ mes",
    isPopular: true,
    cta: "Quiero el Premium",
    sections: [
    {
      title: "Todo lo del plan Esencial",
      items: [
      ["yes", "Chat IA en web + WhatsApp + CRM básico"]]

    },
    {
      title: "CRM comercial — pipeline visual",
      items: [
      ["yes", "Pipeline kanban con 6 etapas"],
      ["yes", "Conversaciones unificadas web + WhatsApp"],
      ["yes", "Alertas: leads sin tocar +3 días"],
      ["yes", "Dashboard con métricas y hot leads"]]

    },
    {
      title: "IA Copiloto — actúa por ti",
      items: [
      ["yes", "Resumen IA automático del lead"],
      ["yes", "Temperatura: frío / tibio / caliente"],
      ["yes", "Genera email y mensaje WhatsApp listos"],
      ["yes", "Score de probabilidad de cierre"],
      ["yes", "Próxima acción sugerida por IA"]]

    },
    {
      title: "Agentes IA por canal",
      items: [
      ["yes", "Prompts personalizados por canal"],
      ["yes", "Editable desde el CRM en tiempo real"]]

    },
    {
      title: "Soporte y onboarding",
      items: [
      ["yes", "Setup asistido — 1 sesión de configuración"],
      ["yes", "Soporte WhatsApp en horario laboral"],
      ["no", "Asesoría mensual de negocio"],
      ["no", "Sofía Voz"],
      ["no", "Integraciones externas"]]

    }]

  },
  {
    badge: "PLAN 03",
    name: "Élite",
    accent: "amber",
    subtitle: "Sistema completo + Voz + Integraciones + Asesoría",
    headline: "Atiende por texto, web y teléfono. Sin contratar a nadie.",
    priceCL: "$349.000",
    priceES: "€497",
    period: "/ mes",
    isPopular: false,
    cta: "Agenda una llamada",
    sections: [
    {
      title: "Todo lo del plan Premium",
      items: [
      ["yes", "Chat IA, CRM completo, WhatsApp, Copiloto IA"]]

    },
    {
      title: "Sofía — Agente de Voz IA",
      items: [
      ["key", "Atiende llamadas telefónicas 24/7"],
      ["key", "Voz natural configurable para tu nicho"],
      ["info", "Política de uso razonable — 300 min/mes"],
      ["info", "Min. adicionales según consumo real"],
      ["info", "Requiere cuenta ElevenLabs del cliente"]]

    },
    {
      title: "Integraciones externas",
      items: [
      ["yes", "Pasarela de pago (Stripe / Webpay / MercadoPago)"],
      ["yes", "Logística y fulfillment"],
      ["yes", "Cualquier sistema externo vía API"],
      ["info", "Incluye 1 integración en el setup"]]

    },
    {
      title: "Asesoría comercial y de negocio",
      items: [
      ["yes", "Sesión mensual de estrategia 1:1 (60 min)"],
      ["yes", "Revisión de métricas y conversión"],
      ["yes", "Ajustes de agentes y prompts incluidos"]]

    },
    {
      title: "Soporte y onboarding",
      items: [
      ["yes", "Setup completo de todos los canales"],
      ["yes", "Soporte WhatsApp prioritario — respuesta 4h"],
      ["yes", "Seguimiento activo primer mes"]]

    }]

  }];


  const accentMap = {
    emerald: { border: "border-emerald-500", shadow: "shadow-emerald-500/20", badge: "text-emerald-700 bg-emerald-50", divider: "bg-emerald-200/70" },
    orange: { border: "border-[#0066FF]", shadow: "shadow-[#0066FF]/30", badge: "text-[#0066FF] bg-blue-50", divider: "bg-orange-200/70" },
    amber: { border: "border-amber-500", shadow: "shadow-amber-500/20", badge: "text-amber-700 bg-amber-50", divider: "bg-amber-200/70" }
  };

  const renderIcon = (type) => {
    if (type === "yes") return <Check size={16} className="text-emerald-500 flex-shrink-0 mt-0.5" />;
    if (type === "no") return <X size={16} className="text-slate-300 flex-shrink-0 mt-0.5" />;
    if (type === "key") return <Key size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />;
    if (type === "info") return <span className="text-slate-400 flex-shrink-0 mt-0.5 text-base leading-none w-4 text-center">·</span>;
    return null;
  };

  const itemTextClass = (type) => {
    if (type === "no") return "text-slate-400 line-through";
    if (type === "info") return "text-slate-500 italic";
    return "text-slate-700";
  };

  return (
    <section
      id="planes"
      data-testid="pricing-section"
      className="py-24 md:py-32"
      style={{ background: "#f5f5f7" }}>

      <div className="container-custom">
        <div className="text-center mb-14 max-w-4xl mx-auto">
          <h2
            className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.03em] text-slate-900 mb-6 leading-[1.05]"
            style={{ fontFamily: "Outfit, sans-serif" }}>

            Elige el plan{" "}
            <span className="text-slate-500">perfecto para ti.</span>
          </h2>
          <p className="text-lg sm:text-xl text-slate-600 leading-relaxed font-light max-w-3xl mx-auto mb-10">
            CRM + Chat IA + WhatsApp Business unificados. Sin equipo técnico. Funcionando en 72 horas.
          </p>

          {/* Country toggle */}
          <div
            className="inline-flex items-center bg-white border border-slate-200 rounded-full p-1 shadow-sm"
            data-testid="country-toggle">

            <button
              onClick={() => setCountry("CL")}
              data-testid="country-cl-btn"
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
              isCL ?
              "bg-slate-900 text-white shadow" :
              "text-slate-500 hover:text-slate-700"}`
              }>

              🇨🇱 Chile
            </button>
            <button
              onClick={() => setCountry("ES")}
              data-testid="country-es-btn"
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
              !isCL ?
              "bg-slate-900 text-white shadow" :
              "text-slate-500 hover:text-slate-700"}`
              }>

              🇪🇸 España
            </button>
          </div>
        </div>

        {/* Main 3 plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {plans.map((plan, index) => {
          const acc = accentMap[plan.accent] || accentMap.orange;
          return (
            <div
              key={index}
              className={`relative rounded-3xl p-8 flex flex-col bg-white ${
              plan.isPopular ?
              `border-2 ${acc.border} md:scale-[1.02]` :
              ""}`
              }
              data-testid={`pricing-card-${index}`}>

              {plan.isPopular &&
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider text-white whitespace-nowrap shadow-lg"
                style={{ background: "#0066FF" }}
                data-testid="popular-badge">
                  ⭐ Más elegido
                </div>
              }

              {/* Header */}
              <div className="mb-5 pt-2">
                <span className={`inline-block text-[10px] uppercase tracking-[0.18em] font-semibold mb-2 px-2 py-0.5 rounded ${acc.badge}`}>
                  {plan.badge}
                </span>
                <h3
                  className="text-3xl font-semibold text-slate-900 mb-1"
                  style={{ fontFamily: "Outfit, sans-serif" }}>

                  Activa {plan.name}
                </h3>
                <p className="text-xs text-slate-500 mb-4">{plan.subtitle}</p>
                <p
                  className="text-base text-slate-700 leading-snug mb-5 font-medium"
                  style={{ fontFamily: "Outfit, sans-serif" }}>

                  {plan.headline}
                </p>

                <div className="flex items-baseline gap-1 mb-1">
                  <span
                    className="text-4xl font-bold text-slate-900"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                    data-testid={`pricing-price-${index}`}>

                    {isCL ? plan.priceCL : plan.priceES}
                  </span>
                  <span className="text-slate-500 text-sm">{plan.period}</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {isCL ? "Precio en CLP + IVA · Chile" : "Precio en EUR + IVA · España"}
                </p>
              </div>

              <div className={`h-px ${acc.divider} mb-5`} />

              {/* Sections with categories */}
              <div className="space-y-5 mb-6 flex-grow">
                {plan.sections.map((section, sIdx) =>
                <div key={sIdx}>
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
                      {section.title}
                    </p>
                    <ul className="space-y-2">
                      {section.items.map(([type, text], iIdx) =>
                  <li key={iIdx} className="flex items-start gap-2.5 text-sm">
                          {renderIcon(type)}
                          <span className={`leading-snug ${itemTextClass(type)}`}>{text}</span>
                        </li>
                  )}
                    </ul>
                  </div>
                )}
              </div>

              {/* Legend (only first card) */}
              {index === 0 &&
              <div className="text-[10px] text-slate-400 leading-relaxed border-t border-slate-100 pt-3 mb-4">
                  <span className="inline-flex items-center gap-1 mr-3"><Check size={10} className="text-emerald-500" /> Incluido</span>
                  <span className="inline-flex items-center gap-1 mr-3"><Key size={10} className="text-amber-500" /> Req. cuenta cliente</span>
                  <span className="inline-flex items-center gap-1">· Condición</span>
                </div>
              }

              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={plan.isPopular ? { background: "#0066FF" } : undefined}
                className={`w-full inline-flex items-center justify-center gap-2 py-3.5 px-4 rounded-full font-semibold text-sm transition-all mt-auto ${
                plan.isPopular ?
                "text-white hover:opacity-90 shadow-lg shadow-[#0066FF]/30" :
                "bg-slate-900 text-white hover:bg-slate-800"}`
                }
                data-testid={`pricing-cta-${index}`}>

                {plan.cta}
                <ArrowRight size={16} />
              </a>
            </div>
          );
          })}
        </div>

        {/* Plan 04 — Enterprise wide card */}
        <div
          className="mt-8 max-w-6xl mx-auto"
          data-testid="pricing-enterprise">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 md:p-10 text-white border border-slate-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex-1">
                <span className="inline-block text-[10px] uppercase tracking-[0.18em] font-semibold text-blue-300 mb-2">
                  Plan 04 · Enterprise
                </span>
                <h3
                  className="text-2xl md:text-3xl font-semibold mb-2"
                  style={{ fontFamily: "Outfit, sans-serif" }}>

                  Activa Escala
                </h3>
                <p className="text-slate-300 text-sm mb-3">
                  Múltiples agentes · Workspaces separados · Infraestructura dedicada · SLA personalizado
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="text-xs text-slate-400">Desde</span>
                  <span
                    className="text-3xl font-bold text-white"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                    data-testid="pricing-enterprise-price">

                    {isCL ? "$590.000" : "€800"}
                  </span>
                  <span className="text-slate-400 text-sm">/ mes</span>
                  <span className="ml-3 text-xs text-slate-400">→ Bajo consulta</span>
                </div>
              </div>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="pricing-enterprise-cta"
                className="inline-flex items-center justify-center gap-2 py-3.5 px-7 rounded-full font-semibold text-sm bg-white text-slate-900 hover:bg-slate-100 transition-all whitespace-nowrap">

                Hablar con ventas
                <ArrowRight size={16} />
              </a>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-8 max-w-2xl mx-auto">
          Sin contratos · Sin equipo técnico · Funcionando en 72 horas · Soporte en español
        </p>
      </div>
    </section>);

};

// Add-Ons Section
const AddOnsSection = () => {
  const [country, setCountry] = useState("CL");
  const isCL = country === "CL";

  const groups = [
  {
    title: "Canales digitales",
    items: [
    {
      icon: Globe,
      name: "Landing page comercial",
      desc: "Página de captura conectada al chat IA. Diseñada para convertir.",
      priceCL: "$199.000",
      priceES: "€297",
      period: "único"
    },
    {
      icon: LayoutDashboard,
      name: "Página web completa",
      desc: "Web profesional multi-sección con chat IA y WhatsApp integrados.",
      priceCL: "$397.000",
      priceES: "€597",
      period: "único"
    }]

  },
  {
    title: "Agente de voz",
    items: [
    {
      icon: Mic,
      name: "Sofía Voz",
      badge: "Uso razonable",
      desc: "Agente IA que atiende llamadas 24/7. 200 min/mes incluidos. Min. adicionales según consumo.",
      priceCL: "$69.000",
      priceES: "€99",
      period: "/ mes"
    },
    {
      icon: PhoneCall,
      name: "Línea telefónica dedicada",
      desc: "Número para tu agente Sofía. Activación en 24h. Chile o España.",
      priceCL: "$19.000",
      priceES: "€19",
      period: "/ mes"
    }]

  },
  {
    title: "Integraciones",
    items: [
    {
      icon: Calculator,
      name: "Pasarela de pago",
      desc: "Stripe, Webpay o MercadoPago. Tu agente confirma y cobra solo.",
      priceCL: "$129.000",
      priceES: "€197",
      period: "setup"
    },
    {
      icon: Rocket,
      name: "Logística y fulfillment",
      desc: "Conecta con tu operador logístico para tracking y notificaciones.",
      priceCL: "$129.000",
      priceES: "€197",
      period: "setup"
    },
    {
      icon: Settings,
      name: "Integración personalizada",
      desc: "Cualquier sistema externo vía API o webhook. Cotización según complejidad.",
      priceCL: "Desde $199.000",
      priceES: "Desde €297",
      period: ""
    }]

  },
  {
    title: "Asesoría",
    items: [
    {
      icon: Users,
      name: "Consultoría comercial",
      desc: "Sesión de 60 min para definir estrategia de ventas, nichos y mensajes.",
      priceCL: "$99.000",
      priceES: "€150",
      period: "/ sesión"
    },
    {
      icon: Sparkles,
      name: "Consultoría de negocio",
      desc: "Análisis de tu proceso actual y rediseño con IA. Entregable incluido.",
      priceCL: "$169.000",
      priceES: "€250",
      period: "/ sesión"
    },
    {
      icon: Target,
      name: "Auditoría de agentes IA",
      desc: "Revisión y optimización de prompts, flujos y tasas de conversión.",
      priceCL: "$129.000",
      priceES: "€197",
      period: "único"
    }]

  }];


  const roadmap = [
  { icon: Mail, name: "Emails automáticos", desc: "Secuencias de seguimiento enviadas desde el CRM sin intervención." },
  { icon: BarChart3, name: "Reportes ejecutivos", desc: "Dashboard de conversión, MRR y actividad de agentes exportable." },
  { icon: Users, name: "Multi-usuario con roles", desc: "Vendedores con acceso propio y métricas individuales." }];


  return (
    <section
      id="addons"
      data-testid="addons-section"
      className="py-24 md:py-32 bg-white">

      <div className="container-custom">
        <div className="text-center mb-14 max-w-4xl mx-auto">
          <h2
            className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.03em] text-slate-900 mb-6 leading-[1.05]"
            style={{ fontFamily: "Outfit, sans-serif" }}>

            Potencia tu plan{" "}
            <span className="text-slate-500">con add-ons.</span>
          </h2>
          <p className="text-lg sm:text-xl text-slate-600 leading-relaxed font-light max-w-3xl mx-auto mb-10">
            Añade exactamente lo que necesitas. Sin paquetes forzados.
          </p>

          {/* Country toggle */}
          <div
            className="inline-flex items-center bg-white border border-slate-200 rounded-full p-1 shadow-sm"
            data-testid="addons-country-toggle">

            <button
              onClick={() => setCountry("CL")}
              data-testid="addons-cl-btn"
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
              isCL ? "bg-slate-900 text-white shadow" : "text-slate-500 hover:text-slate-700"}`
              }>

              🇨🇱 Chile
            </button>
            <button
              onClick={() => setCountry("ES")}
              data-testid="addons-es-btn"
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
              !isCL ? "bg-slate-900 text-white shadow" : "text-slate-500 hover:text-slate-700"}`
              }>

              🇪🇸 España
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto space-y-10">
          {groups.map((group, gIdx) =>
          <div key={gIdx}>
              <h3
              className="text-sm uppercase tracking-[0.18em] font-semibold text-slate-500 mb-4"
              data-testid={`addon-group-${gIdx}`}>

                {group.title}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.items.map((item, iIdx) =>
              <div
                key={iIdx}
                className="rounded-2xl p-7 hover:scale-[1.01] transition-all flex flex-col"
                style={{ background: "#f5f5f7" }}
                data-testid={`addon-card-${gIdx}-${iIdx}`}>

                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                        <item.icon size={20} className="text-[#0066FF]" />
                      </div>
                      {item.badge &&
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          {item.badge}
                        </span>
                  }
                    </div>
                    <h4
                  className="font-semibold text-slate-900 mb-1.5"
                  style={{ fontFamily: "Outfit, sans-serif" }}>

                      {item.name}
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed mb-4 flex-grow">
                      {item.desc}
                    </p>
                    <div className="flex items-baseline gap-1 pt-3 border-t border-slate-100">
                      <span
                    className="text-xl font-bold text-slate-900"
                    style={{ fontFamily: "Outfit, sans-serif" }}>

                        {isCL ? item.priceCL : item.priceES}
                      </span>
                      {item.period &&
                  <span className="text-xs text-slate-500">{item.period}</span>
                  }
                    </div>
                  </div>
              )}
              </div>
            </div>
          )}

          {/* Roadmap */}
          <div>
            <h3 className="text-sm uppercase tracking-[0.18em] font-semibold text-slate-500 mb-4">
              Próximamente
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {roadmap.map((item, idx) =>
              <div
                key={idx}
                data-testid={`roadmap-card-${idx}`}
                className="bg-white/60 rounded-2xl border border-dashed border-slate-300 p-6 flex flex-col">

                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                      <item.icon size={20} className="text-slate-400" />
                    </div>
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      Roadmap
                    </span>
                  </div>
                  <h4
                  className="font-semibold text-slate-700 mb-1.5"
                  style={{ fontFamily: "Outfit, sans-serif" }}>

                    {item.name}
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="text-center mt-12">
          <p className="text-sm text-slate-600 mb-5">
            Sin contratos · Sin equipo técnico · Funcionando en 72 horas
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="addons-cta-demo"
              className="inline-flex items-center justify-center gap-2 py-3.5 px-7 rounded-full font-semibold text-sm bg-slate-900 text-white hover:bg-slate-800 transition-all">

              Solicitar demo
              <ArrowRight size={16} />
            </a>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="addons-cta-whatsapp"
              style={{ background: "#0066FF" }}
              className="inline-flex items-center justify-center gap-2 py-3.5 px-7 rounded-full font-semibold text-sm text-white hover:opacity-90 transition-all shadow-lg shadow-[#0066FF]/30">

              <MessageCircle size={16} />
              Automatizar mi WhatsApp
            </a>
          </div>
        </div>
      </div>
    </section>);

};

// Problem/Solution Section
const ProblemSolutionSection = () => {
  const comparisons = [
  {
    problem: "No tienes empresa formalizada",
    solution: "Te ayudamos a formalizarte rápidamente"
  },
  {
    problem: "Tu negocio se ve improvisado",
    solution: "Lo profesionalizamos con presencia digital"
  },
  {
    problem: "No tienes página web",
    solution: "Captas más clientes con tu sitio propio"
  },
  {
    problem: "Trabajas desordenado",
    solution: "Organizamos tu operación mes a mes"
  },
  {
    problem: "Quieres crecer pero no sabes cómo",
    solution: "Activamos publicidad y estrategia"
  }];


  return (
    <section
      data-testid="problem-solution-section"
      className="section-padding bg-slate-900">

      <div className="container-custom">
        <div className="text-center mb-16">
          <span className="inline-block text-sm uppercase tracking-[0.2em] font-medium text-blue-400 mb-4">
            Tu situación actual
          </span>
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight text-white"
            style={{ fontFamily: "Outfit, sans-serif" }}>

            Del caos al orden en tu negocio
          </h2>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 md:gap-16">
            {/* Problems */}
            <div>
              <h3
                className="text-lg font-medium text-red-400 mb-6 flex items-center gap-2"
                style={{ fontFamily: "Outfit, sans-serif" }}>

                <span className="w-3 h-3 bg-red-400 rounded-full"></span>
                Si esto te suena familiar...
              </h3>
              <ul className="space-y-4">
                {comparisons.map((item, index) =>
                <li
                  key={index}
                  className="problem-item text-slate-400"
                  data-testid={`problem-${index}`}>

                    {item.problem}
                  </li>
                )}
              </ul>
            </div>

            {/* Solutions */}
            <div>
              <h3
                className="text-lg font-medium text-emerald-400 mb-6 flex items-center gap-2"
                style={{ fontFamily: "Outfit, sans-serif" }}>

                <span className="w-3 h-3 bg-emerald-400 rounded-full"></span>
                Así lo solucionamos
              </h3>
              <ul className="space-y-4">
                {comparisons.map((item, index) =>
                <li
                  key={index}
                  className="solution-item text-slate-300"
                  data-testid={`solution-${index}`}>

                    {item.solution}
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div className="text-center mt-12">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-whatsapp"
              data-testid="problem-solution-cta">

              <MessageCircle size={20} />
              Quiero ordenar mi negocio
            </a>
          </div>
        </div>
      </div>
    </section>);

};

// Digital Solutions Section
const DigitalSolutionsSection = () => {
  const solutions = [
  { icon: <Users size={20} />, name: "Gestión de clientes" },
  { icon: <BarChart3 size={20} />, name: "Control de ventas" },
  { icon: <ClipboardList size={20} />, name: "Seguimiento de pedidos" },
  { icon: <FileText size={20} />, name: "Formularios digitales" },
  { icon: <LayoutDashboard size={20} />, name: "Dashboard de métricas" }];


  return (
    <section
      data-testid="digital-solutions-section"
      className="section-padding bg-gradient-to-b from-slate-50 to-white">

      <div className="container-custom">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-block text-sm uppercase tracking-[0.2em] font-medium text-blue-600 mb-4">
              Soluciones digitales
            </span>
            <h2
              className="text-3xl sm:text-4xl font-medium tracking-tight text-slate-900 mb-6"
              style={{ fontFamily: "Outfit, sans-serif" }}>

              Sistema digital para tu negocio
            </h2>
            <p className="text-slate-600 leading-relaxed mb-8">
              Creamos herramientas simples para ordenar procesos y visualizar tus
              números. Todo adaptado a las necesidades reales de tu negocio.
            </p>

            <div className="grid grid-cols-2 gap-4 mb-8">
              {solutions.map((solution, index) =>
              <div
                key={index}
                className="flex items-center gap-3 p-3 rounded-xl bg-white shadow-sm border border-slate-100"
                data-testid={`digital-solution-${index}`}>

                  <span className="text-blue-500">{solution.icon}</span>
                  <span className="text-sm font-medium text-slate-700">
                    {solution.name}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-6">
              <div>
                <span className="text-sm text-slate-500">Desde</span>
                <p
                  className="text-2xl font-bold text-slate-900"
                  style={{ fontFamily: "Outfit, sans-serif" }}>

                  $190.000 + IVA
                </p>
              </div>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
                data-testid="digital-solutions-cta">

                Consultar
                <ArrowRight size={18} />
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="glass-card rounded-3xl p-8 shadow-2xl">
              <img
                src="https://images.unsplash.com/photo-1608222351212-18fe0ec7b13b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzR8MHwxfHNlYXJjaHwxfHxidXNpbmVzcyUyMGRhc2hib2FyZCUyMGFuYWx5dGljcyUyMHRlY2hub2xvZ3l8ZW58MHx8fHwxNzc1ODYxODcxfDA&ixlib=rb-4.1.0&q=85"
                alt="Dashboard de analytics y métricas de negocio"
                className="w-full h-64 object-cover rounded-2xl" />

            </div>
            <div className="glow-blue -bottom-20 -right-20 w-64 h-64 opacity-30" />
          </div>
        </div>
      </div>
    </section>);

};

// Advisory Section
const AdvisorySection = () => {
  const topics = [
  { icon: <Settings size={18} />, name: "Procesos de negocio" },
  { icon: <Zap size={18} />, name: "Digitalización" },
  { icon: <PieChart size={18} />, name: "Métricas y KPIs" },
  { icon: <LayoutDashboard size={18} />, name: "Dashboards" }];


  return (
    <section data-testid="advisory-section" className="section-padding">
      <div className="container-custom">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="order-2 lg:order-1 relative">
            <div className="glass-card rounded-3xl p-8 shadow-2xl">
              <img
                src="https://images.unsplash.com/photo-1758691737060-3814f16d5aba?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzJ8MHwxfHNlYXJjaHwxfHxzdGFydHVwJTIwdGVhbSUyMHdvcmtpbmclMjBsYXB0b3BzJTIwbW9kZXJuJTIwb2ZmaWNlfGVufDB8fHx8MTc3NTg2MTg3MXww&ixlib=rb-4.1.0&q=85"
                alt="Equipo startup trabajando en oficina moderna"
                className="w-full h-64 object-cover rounded-2xl" />

            </div>
            <div className="glow-green -bottom-20 -left-20 w-64 h-64 opacity-30" />
          </div>

          <div className="order-1 lg:order-2">
            <span className="inline-block text-sm uppercase tracking-[0.2em] font-medium text-blue-600 mb-4">
              Asesoría experta
            </span>
            <h2
              className="text-3xl sm:text-4xl font-medium tracking-tight text-slate-900 mb-6"
              style={{ fontFamily: "Outfit, sans-serif" }}>

              Asesoría con experto
            </h2>
            <p className="text-slate-600 leading-relaxed mb-8">
              Sesiones personalizadas para resolver dudas específicas, optimizar
              procesos y tomar mejores decisiones para tu negocio.
            </p>

            <div className="flex flex-wrap gap-3 mb-8">
              {topics.map((topic, index) =>
              <div
                key={index}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-sm"
                data-testid={`advisory-topic-${index}`}>

                  <span className="text-blue-500">{topic.icon}</span>
                  <span className="text-slate-700">{topic.name}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-6">
              <div>
                <span className="text-sm text-slate-500">Desde</span>
                <p
                  className="text-2xl font-bold text-slate-900"
                  style={{ fontFamily: "Outfit, sans-serif" }}>

                  $25.000 + IVA / hora
                </p>
              </div>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
                data-testid="advisory-cta">

                Agendar
                <ArrowRight size={18} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>);

};

// SOFIA AI Voice Agent Section
const SofiaSection = () => {
  const features = [
    { icon: <PhoneCall size={18} />, text: "Atiende llamadas 24/7" },
    { icon: <Bot size={18} />, text: "Respuestas inteligentes con IA" },
    { icon: <Volume2 size={18} />, text: "Voz natural y fluida" },
    { icon: <Zap size={18} />, text: "Integración rápida" },
  ];

  return (
    <section
      id="sofia"
      data-testid="sofia-section"
      className="section-padding relative overflow-hidden"
      style={{ background: "linear-gradient(180deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)" }}
    >
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-purple-500/10 rounded-full blur-[100px]" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px]" />
      
      <div className="container-custom relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div>
            <span className="inline-flex items-center gap-2 text-sm uppercase tracking-[0.2em] font-medium text-purple-400 mb-4">
              <Sparkles size={16} />
              Nuevo producto
            </span>
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight text-white mb-6"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Conoce a{" "}
              <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                SOFIA
              </span>
            </h2>
            <p className="text-slate-400 text-lg leading-relaxed mb-8">
              Tu agente de voz con inteligencia artificial que atiende a tus clientes 
              <span className="text-white font-medium"> 24 horas al día, 7 días a la semana</span>. 
              Responde preguntas, agenda citas y nunca descansa.
            </p>

            <div className="grid grid-cols-2 gap-4 mb-8">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
                  data-testid={`sofia-feature-${index}`}
                >
                  <span className="text-purple-400">{feature.icon}</span>
                  <span className="text-sm text-slate-300">{feature.text}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href="/sofia"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold hover:from-purple-600 hover:to-blue-600 transition-all shadow-lg shadow-purple-500/25"
                data-testid="sofia-cta"
              >
                <Mic size={20} />
                Probar SOFIA
              </a>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-white/10 border border-white/20 text-white font-medium hover:bg-white/20 transition-all"
                data-testid="sofia-cta-secondary"
              >
                Solicitar demo
                <ArrowRight size={18} />
              </a>
            </div>
          </div>

          {/* iPhone Mockup */}
          <div className="flex justify-center lg:justify-end">
            <div className="relative">
              {/* Glow effect behind phone */}
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/30 to-blue-500/30 blur-[60px] scale-75" />
              
              {/* iPhone Frame */}
              <div 
                className="relative w-[280px] rounded-[3rem] p-3"
                style={{
                  background: "linear-gradient(160deg, #2a2a2e 0%, #1a1a1e 40%, #111114 100%)",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.1), 0 25px 50px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)"
                }}
              >
                {/* Screen */}
                <div 
                  className="rounded-[2.5rem] overflow-hidden"
                  style={{ background: "linear-gradient(180deg, #1a1a1e 0%, #0d0d0f 100%)" }}
                >
                  {/* Dynamic Island */}
                  <div className="flex justify-center pt-3">
                    <div className="w-24 h-7 bg-black rounded-full" style={{ boxShadow: "inset 0 0 4px rgba(0,0,0,0.8)" }} />
                  </div>

                  {/* Content */}
                  <div className="px-6 py-8 flex flex-col items-center min-h-[380px]">
                    {/* Avatar */}
                    <div className="relative mb-4">
                      <div className="absolute inset-[-12px] rounded-full bg-green-400/20 animate-ping" style={{ animationDuration: "2s" }} />
                      <div 
                        className="relative w-20 h-20 rounded-full flex items-center justify-center"
                        style={{
                          background: "linear-gradient(145deg, #1a3a2a 0%, #0d2818 50%, #1a2f1a 100%)",
                          boxShadow: "0 0 30px -8px rgba(52,199,89,0.4), inset 0 1px 0 rgba(255,255,255,0.1)"
                        }}
                      >
                        <span className="text-4xl">🤖</span>
                      </div>
                    </div>

                    <h3 className="text-2xl font-semibold text-white tracking-tight" style={{ fontFamily: "system-ui" }}>
                      SOFIA
                    </h3>
                    <p className="text-green-400 text-sm mt-1 font-medium">
                      Conectada y lista ✓
                    </p>

                    {/* Wave visualizer */}
                    <div className="flex items-center justify-center gap-1 h-8 mt-4">
                      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <div
                          key={i}
                          className="w-1 rounded-full bg-gradient-to-t from-green-500 to-green-400"
                          style={{
                            height: `${12 + Math.sin(i * 0.8) * 12}px`,
                            animation: `pulse 1.${i}s ease-in-out infinite`,
                            animationDelay: `${i * 0.1}s`
                          }}
                        />
                      ))}
                    </div>

                    <p className="text-white/40 text-xs mt-4 text-center">
                      "Hola, soy SOFIA. ¿En qué puedo ayudarte hoy?"
                    </p>

                    {/* Call buttons */}
                    <div className="flex gap-6 mt-6">
                      <div className="flex flex-col items-center gap-2">
                        <div 
                          className="w-14 h-14 rounded-full flex items-center justify-center"
                          style={{
                            background: "linear-gradient(145deg, #40d970, #34c759)",
                            boxShadow: "0 4px 14px -2px rgba(52,199,89,0.5)"
                          }}
                        >
                          <Phone className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-[10px] text-white/40">Llamar</span>
                      </div>
                    </div>
                  </div>

                  {/* Home indicator */}
                  <div className="flex justify-center pb-2">
                    <div className="w-32 h-1 rounded-full bg-white/20" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom tagline */}
        <div className="text-center mt-16">
          <p className="text-slate-500 text-sm">
            Powered by{" "}
            <span className="text-slate-400">ElevenLabs</span>
            {" "}· Conversational AI · WebRTC
          </p>
        </div>
      </div>
    </section>
  );
};

// Digital Advertising Section
const DigitalAdvertisingSection = () => {
  const adPlans = [
    {
      name: "Plan Publicidad Básica",
      price: "$89.000",
      period: "+ IVA / mes",
      isPopular: false,
      description: "Para empezar a generar visibilidad y captar clientes.",
      features: [
        "Configuración de campaña (Meta Ads o TikTok Ads)",
        "Segmentación inicial",
        "Carga de anuncios",
        "Ajustes básicos",
        "Reporte mensual de resultados",
        "Asesoría y seguimiento"
      ]
    },
    {
      name: "Plan Publicidad Gestión",
      price: "$109.000",
      period: "+ IVA / mes",
      isPopular: true,
      description: "Para mejorar resultados y optimizar campañas.",
      features: [
        "Todo lo del plan básico",
        "Optimización mensual de campañas",
        "Ajustes de segmentación",
        "Mejora de rendimiento",
        "Recomendaciones estratégicas"
      ]
    },
    {
      name: "Plan Publicidad Avanzada",
      price: "$149.000",
      period: "+ IVA / mes",
      isPopular: false,
      description: "Para negocios que quieren escalar campañas.",
      features: [
        "Todo lo anterior",
        "Estrategia publicitaria mensual",
        "Análisis de resultados",
        "Ajustes continuos",
        "Revisión de rendimiento por campaña",
        "Acompañamiento más cercano"
      ]
    }
  ];

  return (
    <section
      id="publicidad"
      data-testid="advertising-section"
      className="section-padding bg-slate-50">

      <div className="container-custom">
        <div className="text-center mb-12">
          <span className="inline-block text-sm uppercase tracking-[0.2em] font-medium text-blue-600 mb-4">
            Publicidad digital
          </span>
          <h2
            className="text-3xl sm:text-4xl font-medium tracking-tight text-slate-900 mb-4"
            style={{ fontFamily: "Outfit, sans-serif" }}>
            Haz crecer tu negocio con publicidad digital
          </h2>
          <p className="text-slate-600 max-w-2xl mx-auto">
            Creamos, optimizamos y acompañamos tus campañas para que realmente generen resultados.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {adPlans.map((plan, index) =>
          <div
            key={index}
            className={`relative glass-card rounded-3xl p-6 flex flex-col ${
              plan.isPopular ? "border-2 border-blue-500 shadow-xl shadow-blue-500/10" : ""
            }`}
            data-testid={`ad-plan-${index}`}>
            
            {plan.isPopular &&
              <div className="badge-popular" data-testid="ad-popular-badge">
                Recomendado
              </div>
            }

            <div className="mb-4 pt-2">
              <h3
                className="text-lg font-medium text-slate-900 mb-2"
                style={{ fontFamily: "Outfit, sans-serif" }}>
                {plan.name}
              </h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span
                  className="text-2xl font-bold text-slate-900"
                  style={{ fontFamily: "Outfit, sans-serif" }}>
                  {plan.price}
                </span>
                <span className="text-slate-500 text-xs">{plan.period}</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                {plan.description}
              </p>
            </div>

            <ul className="space-y-2 mb-4 flex-grow">
              {plan.features.map((feature, fIndex) =>
                <li key={fIndex} className="flex items-start gap-2 text-xs">
                  <Check
                    size={14}
                    className="text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-600">{feature}</span>
                </li>
              )}
            </ul>

            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-full font-medium text-sm transition-all mt-auto ${
                plan.isPopular
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "bg-slate-100 text-slate-900 hover:bg-slate-200"
              }`}
              data-testid={`ad-plan-cta-${index}`}>
              <MessageCircle size={16} />
              Consultar
            </a>
          </div>
          )}
        </div>

        <div className="text-center">
          <p className="text-sm text-slate-500 bg-white/60 backdrop-blur-sm inline-block px-6 py-3 rounded-full border border-slate-200">
            ⚠️ La inversión publicitaria se paga por separado directamente a la plataforma (Meta, Google o TikTok)
          </p>
        </div>
      </div>
    </section>);

};

// Additional Services Section
const AdditionalServicesSection = () => {
  const services = [
  { icon: <Code size={20} />, name: "Diseño web", price: "desde $170.000 + IVA" },
  {
    icon: <Server size={20} />,
    name: "Plataforma y mantención",
    price: "$150.000 + IVA / año"
  },
  { icon: <Globe2 size={20} />, name: "Dominio", price: "$35.000 + IVA / año" },
  { icon: <FormInput size={20} />, name: "Formularios", price: "$35.000 + IVA" },
  { icon: <Mail size={20} />, name: "Correos corporativos", price: "$10.000 + IVA / mes" },
  { icon: <Image size={20} />, name: "Imágenes profesionales", price: "desde $29.900 + IVA" },
  { icon: <UtensilsCrossed size={20} />, name: "Menú digital", price: "desde $49.000 + IVA" },
  { icon: <Calendar size={20} />, name: "Renta anual", price: "$250.000 + IVA" }];


  return (
    <section data-testid="additional-services-section" className="section-padding">
      <div className="container-custom">
        <div className="text-center mb-12">
          <span className="inline-block text-sm uppercase tracking-[0.2em] font-medium text-blue-600 mb-4">
            Servicios adicionales
          </span>
          <h2
            className="text-3xl sm:text-4xl font-medium tracking-tight text-slate-900"
            style={{ fontFamily: "Outfit, sans-serif" }}>

            Complementa tu solución
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {services.map((service, index) =>
          <div
            key={index}
            className="additional-service-item text-center"
            data-testid={`additional-service-${index}`}>

              <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-blue-50 to-emerald-50 flex items-center justify-center text-blue-600">
                {service.icon}
              </div>
              <h3
              className="font-medium text-slate-900 mb-2 text-sm"
              style={{ fontFamily: "Outfit, sans-serif" }}>

                {service.name}
              </h3>
              <p className="text-xs text-slate-500">{service.price}</p>
            </div>
          )}
        </div>

        <div className="text-center mt-10">
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            data-testid="additional-services-cta">

            <MessageCircle size={18} />
            Consultar servicios
          </a>
        </div>
      </div>
    </section>);

};

// How It Works Section
// Removed legacy HowItWorksSection (duplicate)
const HowItWorksSection_LEGACY = () => null;

// Why Digiactiva Section
const WhyDigiactivaSection = () => {
  const benefits = [
  {
    icon: <Zap size={24} />,
    title: "Todo en un solo lugar",
    description: "Formalización, web, contabilidad y marketing integrados."
  },
  {
    icon: <Settings size={24} />,
    title: "Tecnología simple",
    description: "Herramientas fáciles de usar, sin complicaciones técnicas."
  },
  {
    icon: <Target size={24} />,
    title: "Enfoque práctico",
    description: "Soluciones que realmente resuelven problemas reales."
  },
  {
    icon: <BarChart3 size={24} />,
    title: "Resultados reales",
    description: "Métricas claras para ver tu progreso mes a mes."
  },
  {
    icon: <Headphones size={24} />,
    title: "Acompañamiento continuo",
    description: "Soporte permanente para que nunca te quedes solo."
  }];


  return (
    <section data-testid="why-digiactiva-section" className="section-padding">
      <div className="container-custom">
        <div className="text-center mb-16">
          <span className="inline-block text-sm uppercase tracking-[0.2em] font-medium text-blue-600 mb-4">
            ¿Por qué elegirnos?
          </span>
          <h2
            className="text-3xl sm:text-4xl font-medium tracking-tight text-slate-900"
            style={{ fontFamily: "Outfit, sans-serif" }}>

            Por qué Digiactiva
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {benefits.map((benefit, index) =>
          <div
            key={index}
            className="flex gap-4 p-6 rounded-2xl hover:bg-slate-50 transition-colors"
            data-testid={`benefit-${index}`}>

              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
                {benefit.icon}
              </div>
              <div>
                <h3
                className="font-medium text-slate-900 mb-1"
                style={{ fontFamily: "Outfit, sans-serif" }}>

                  {benefit.title}
                </h3>
                <p className="text-sm text-slate-600">{benefit.description}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>);

};

// FAQ Section
const FAQSection = () => {
  const faqs = [
  {
    question: "¿Qué es DigiActiva?",
    answer:
    "DigiActiva es una plataforma que instala agentes IA en tu web y WhatsApp, conectados a un CRM inteligente. Capta leads, guarda conversaciones, prioriza oportunidades y te dice qué hacer para vender más — sin contratar más personal."
  },
  {
    question: "¿Necesito conocimientos técnicos para usarlo?",
    answer:
    "No. Nosotros instalamos y configuramos todo: el chat IA en tu web, el WhatsApp Business y el CRM. Tú solo recibes el sistema funcionando en 72 horas. El día a día se gestiona desde un panel simple en español."
  },
  {
    question: "¿Cómo funciona el agente IA en WhatsApp?",
    answer:
    "Configuramos un agente IA con la personalidad, planes, promociones y objeciones de tu negocio. Responde a tus clientes 24/7, califica leads, los registra en el CRM y te avisa cuándo intervenir tú. Tú mantienes el control y puedes editar el agente cuando quieras."
  },
  {
    question: "¿El CRM se integra con mi WhatsApp actual?",
    answer:
    "Sí. Conectamos tu WhatsApp Business Cloud API (cuenta Meta Business). Cada mensaje entrante crea o actualiza un contacto en el CRM, queda registrado y el copiloto IA genera un resumen automático del lead."
  },
  {
    question: "¿Qué hace el Copiloto IA exactamente?",
    answer:
    "Lee la conversación con el cliente y extrae: necesidad detectada, nivel de interés (frío/tibio/caliente), plan recomendado y próxima acción sugerida. Además puede generar el siguiente mensaje listo para enviar — tú solo aprueba y envía."
  },
  {
    question: "¿Qué es Sofía Voz?",
    answer:
    "Es un agente de voz IA (incluido en el plan Élite) que atiende llamadas telefónicas las 24 horas. Habla con voz natural configurable y puede agendar, calificar leads y registrar todo en el CRM. Política de uso razonable: 300 minutos/mes incluidos."
  },
  {
    question: "¿Hay permanencia o contrato largo?",
    answer:
    "No. Pagas mes a mes y cancelas cuando quieras. Sin contratos forzosos."
  },
  {
    question: "¿En cuánto tiempo está funcionando?",
    answer:
    "En 72 horas tu sistema está activo: chat IA en tu web, WhatsApp conectado, CRM configurado y agente entrenado con la información de tu negocio."
  }];


  return (
    <section
      id="faq"
      data-testid="faq-section"
      className="py-24 md:py-32 bg-white">

      <div className="container-custom">
        <div className="text-center mb-14 max-w-4xl mx-auto">
          <h2
            className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.03em] text-slate-900 leading-[1.05]"
            style={{ fontFamily: "Outfit, sans-serif" }}>

            Preguntas frecuentes.
          </h2>
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq, index) =>
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="rounded-2xl px-7 border-0"
              style={{ background: "#f5f5f7" }}
              data-testid={`faq-item-${index}`}>

                <AccordionTrigger
                className="text-left font-semibold text-slate-900 hover:no-underline py-6 text-base tracking-[-0.01em]"
                style={{ fontFamily: "Outfit, sans-serif" }}>

                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 pb-6 text-base leading-relaxed font-light">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        </div>
      </div>
    </section>);

};

// Final CTA Section
const FinalCTASection = () => {
  return (
    <section
      id="contacto"
      data-testid="final-cta-section"
      className="py-24 md:py-32 bg-black">

      <div className="container-custom">
        <div className="text-center max-w-4xl mx-auto">
          <h2
            className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.03em] text-white mb-6 leading-[1.05]"
            style={{ fontFamily: "Outfit, sans-serif" }}>

            ¿Quieres saber si tu negocio puede{" "}
            <span style={{ color: "#4D9FFF" }}>automatizar ventas con IA?</span>
          </h2>
          <p className="text-lg sm:text-xl text-slate-400 mb-12 max-w-2xl mx-auto font-light leading-relaxed">
            Te damos un diagnóstico gratuito en menos de 30 minutos. Sin compromiso, sin presión de venta. Te decimos qué automatizar primero y qué plan te conviene.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center items-center">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="final-cta-demo"
              onClick={() => { try { window.dataLayer?.push({ event: 'cta_final_diagnostic_click' }); } catch(e){} }}
              style={{ background: "#0066FF" }}
              className="inline-flex items-center justify-center gap-2 py-3.5 px-8 rounded-full font-medium text-base text-white hover:opacity-90 transition-all">

              Pedir diagnóstico gratuito
            </a>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="final-cta-whatsapp"
              onClick={() => { try { window.dataLayer?.push({ event: 'cta_whatsapp_click', location: 'final' }); } catch(e){} }}
              className="inline-flex items-center gap-1 font-medium text-base hover:underline transition-all"
              style={{ color: "#4D9FFF" }}>

              Hablar por WhatsApp <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </div>
    </section>);

};

// Contact Form Section
const ContactFormSection = () => {
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    telefono: '',
    mensaje: '',
    servicio_interes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      await axios.post(`${API}/leads`, formData);
      setSubmitStatus('success');
      setFormData({
        nombre: '',
        email: '',
        telefono: '',
        mensaje: '',
        servicio_interes: ''
      });
    } catch (error) {
      console.error('Error submitting form:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      id="contacto"
      data-testid="contact-section"
      className="section-padding bg-gradient-to-b from-slate-50 to-white">
      <div className="container-custom">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Info Column */}
          <div>
            <span className="inline-block text-sm uppercase tracking-[0.2em] font-medium text-blue-600 mb-4">
              Contáctanos
            </span>
            <h2
              className="text-3xl sm:text-4xl font-medium tracking-tight text-slate-900 mb-6"
              style={{ fontFamily: "Outfit, sans-serif" }}>
              ¿Listo para empezar?
            </h2>
            <p className="text-slate-600 leading-relaxed mb-8">
              Déjanos tus datos y te contactaremos para ayudarte a digitalizar tu negocio. 
              También puedes escribirnos directamente por WhatsApp.
            </p>

            <div className="space-y-4 mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <MapPin size={20} />
                </div>
                <div>
                  <p className="font-medium text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                    Oficina
                  </p>
                  <p className="text-slate-600 text-sm">
                    Merced 838-A, Oficina 117, Santiago
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <Phone size={20} />
                </div>
                <div>
                  <p className="font-medium text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                    WhatsApp
                  </p>
                  <a 
                    href={WHATSAPP_URL} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-slate-600 text-sm hover:text-blue-600 transition-colors"
                  >
                    +56 9 5110 7102
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                  <Mail size={20} />
                </div>
                <div>
                  <p className="font-medium text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                    Email
                  </p>
                  <p className="text-slate-600 text-sm">
                    contacto@digiactiva.com
                  </p>
                </div>
              </div>
            </div>

            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-whatsapp"
              data-testid="contact-whatsapp-cta">
              <MessageCircle size={18} />
              Escribir por WhatsApp
            </a>
          </div>

          {/* Form Column */}
          <div className="glass-card rounded-3xl p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Nombre *
                </label>
                <input
                  type="text"
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-900"
                  placeholder="Tu nombre"
                  data-testid="contact-nombre"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-900"
                  placeholder="tu@email.com"
                  data-testid="contact-email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Teléfono *
                </label>
                <input
                  type="tel"
                  name="telefono"
                  value={formData.telefono}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-900"
                  placeholder="+56 9 1234 5678"
                  data-testid="contact-telefono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  ¿Qué servicio te interesa?
                </label>
                <select
                  name="servicio_interes"
                  value={formData.servicio_interes}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-900 bg-white"
                  data-testid="contact-servicio"
                >
                  <option value="">Selecciona una opción</option>
                  <option value="formalizacion">Formalización de empresa</option>
                  <option value="digitalizate">Plan Digitalízate</option>
                  <option value="gestion">Plan Gestión</option>
                  <option value="impulso">Plan Impulso</option>
                  <option value="full">Plan Full Negocio</option>
                  <option value="publicidad">Publicidad Digital</option>
                  <option value="asesoria">Asesoría</option>
                  <option value="otro">Otro</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Mensaje
                </label>
                <textarea
                  name="mensaje"
                  value={formData.mensaje}
                  onChange={handleChange}
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-900 resize-none"
                  placeholder="Cuéntanos sobre tu negocio..."
                  data-testid="contact-mensaje"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full btn-primary justify-center py-4 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="contact-submit"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send size={20} />
                    Enviar mensaje
                  </>
                )}
              </button>

              {submitStatus === 'success' && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm text-center" data-testid="contact-success">
                  ¡Mensaje enviado! Te contactaremos pronto.
                </div>
              )}

              {submitStatus === 'error' && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center" data-testid="contact-error">
                  Error al enviar. Intenta de nuevo o escríbenos por WhatsApp.
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </section>
  );
};

// Footer
const Footer = () => {
  return (
    <footer data-testid="footer" className="py-16" style={{ background: "#f5f5f7" }}>
      <div className="container-custom">
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {/* Brand */}
          <div>
            <a
              href="/"
              className="text-xl font-semibold tracking-tight text-slate-900 inline-block mb-4"
              style={{ fontFamily: "Outfit, sans-serif" }}>
              DigiActiva
            </a>
            <p className="text-slate-500 text-sm leading-relaxed">
              DigiActiva desarrolla soluciones digitales, automatización con IA, WhatsApp y sistemas de gestión comercial para pymes, negocios locales y profesionales en Chile y España.
            </p>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-slate-900 mb-4 text-sm" style={{ fontFamily: "Outfit, sans-serif" }}>
              Contacto
            </h4>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-slate-600 text-sm">
                <MapPin size={14} className="text-slate-400" />
                <span>Merced 838-A, Of. 117, Santiago</span>
              </div>
              <a 
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-slate-600 text-sm hover:text-slate-900 transition-colors"
              >
                <Phone size={14} className="text-slate-400" />
                <span>+56 9 5110 7102</span>
              </a>
              <div className="flex items-center gap-3 text-slate-600 text-sm">
                <Mail size={14} className="text-slate-400" />
                <span>contacto@digiactiva.com</span>
              </div>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold text-slate-900 mb-4 text-sm" style={{ fontFamily: "Outfit, sans-serif" }}>
              Enlaces
            </h4>
            <div className="space-y-3">
              <button 
                onClick={() => document.getElementById('solucion')?.scrollIntoView({ behavior: 'smooth' })}
                className="block text-slate-600 text-sm hover:text-slate-900 hover:underline transition-colors"
              >
                Solución
              </button>
              <button 
                onClick={() => document.getElementById('planes')?.scrollIntoView({ behavior: 'smooth' })}
                className="block text-slate-600 text-sm hover:text-slate-900 hover:underline transition-colors"
              >
                Planes
              </button>
              <button 
                onClick={() => document.getElementById('casos-de-uso')?.scrollIntoView({ behavior: 'smooth' })}
                className="block text-slate-600 text-sm hover:text-slate-900 hover:underline transition-colors"
              >
                Casos de uso
              </button>
              <a
                href="/sofia"
                data-testid="footer-sofia-link"
                className="block text-slate-600 text-sm hover:text-slate-900 hover:underline transition-colors"
              >
                Probar SOFIA Voz
              </a>
              <button 
                onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })}
                className="block text-slate-600 text-sm hover:text-slate-900 hover:underline transition-colors"
              >
                Preguntas frecuentes
              </button>
              <button 
                onClick={() => document.getElementById('contacto')?.scrollIntoView({ behavior: 'smooth' })}
                className="block text-slate-600 text-sm hover:text-slate-900 hover:underline transition-colors"
              >
                Contacto
              </button>
              <div className="pt-2 mt-2 border-t border-slate-200 space-y-2.5">
                <a href="/privacidad" className="block text-slate-500 text-xs hover:text-slate-900 hover:underline transition-colors" data-testid="footer-privacy-link">
                  Política de privacidad
                </a>
                <a href="/cookies" className="block text-slate-500 text-xs hover:text-slate-900 hover:underline transition-colors" data-testid="footer-cookies-link">
                  Política de cookies
                </a>
                <a href="/terminos" className="block text-slate-500 text-xs hover:text-slate-900 hover:underline transition-colors" data-testid="footer-terms-link">
                  Términos y condiciones
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-slate-500 text-xs">
            © 2025 DigiActiva. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-4">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-slate-500 hover:text-slate-900 transition-all"
              aria-label="WhatsApp">
              <MessageCircle size={16} />
            </a>
          </div>
        </div>
      </div>
    </footer>);

};

// Floating WhatsApp Button
const FloatingWhatsApp = () => {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="whatsapp-float animate-pulse-glow"
      aria-label="Contactar por WhatsApp"
      data-testid="floating-whatsapp">

      <MessageCircle size={28} className="text-white" />
    </a>);

};

// Landing Page Component
const LandingPage = () => {
  useEffect(() => {
    // SEO: Update document title and meta description (Chile + España)
    document.title = "Agentes IA, WhatsApp y CRM para pymes en Chile y España | DigiActiva";
    const ensureMeta = (name, content, isProperty = false) => {
      const attr = isProperty ? "property" : "name";
      let tag = document.querySelector(`meta[${attr}="${name}"]`);
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute(attr, name);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };
    ensureMeta(
      "description",
      "DigiActiva ayuda a pymes, negocios locales y profesionales en Chile y España a vender más, ordenar sus clientes y automatizar la atención con agentes IA, WhatsApp y CRM."
    );
    ensureMeta(
      "keywords",
      "agentes IA para WhatsApp, CRM para pymes, chat IA para empresas, automatización de ventas, WhatsApp Business con CRM, CRM inteligente para negocios locales, agentes IA Chile, agentes IA España, CRM Chile, CRM España"
    );
    // Canonical
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", "https://www.digiactiva.com/");
  }, []);

  return (
    <div data-testid="digiactiva-landing">
      <Header />
      <main>
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <HowItWorksSection />
        <PricingSection />
        <AddOnsSection />
        <DifferentialSection />
        <SofiaSection />
        <UseCasesSection />
        <BenefitsSection />
        <FAQSection />
        <FinalCTASection />
      </main>
      <Footer />
      <ChatWidget />
      {/* Mobile sticky CTA */}
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="mobile-sticky-cta"
        onClick={() => { try { window.dataLayer?.push({ event: 'cta_sticky_mobile_click' }); } catch(e){} }}
        style={{ background: "#0066FF" }}
        className="md:hidden fixed bottom-4 left-4 right-4 z-40 inline-flex items-center justify-center gap-2 py-3 rounded-full font-medium text-sm text-white shadow-lg shadow-[#0066FF]/40"
      >
        Solicitar diagnóstico gratuito
      </a>
    </div>
  );
};

// Main App Component with Router
function App() {
  return (
    <div className="App" data-testid="digiactiva-app">
      <BrowserRouter>
        <Suspense fallback={
          <div className="min-h-screen flex items-center justify-center bg-white">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        }>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/sofia" element={<SofiaPage />} />
            <Route path="/crm" element={<CRMPage />} />
            <Route path="/privacidad" element={<PrivacyPage />} />
            <Route path="/cookies" element={<CookiesPage />} />
            <Route path="/terminos" element={<TermsPage />} />
            <Route path="/embed/chat" element={<EmbedChat />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </div>
  );
}

export default App;