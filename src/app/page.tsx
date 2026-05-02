'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Menu,
  X,
  MessageCircle,
  Phone,
  LayoutDashboard,
  FileText,
  Sparkles,
  Mic,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ChevronDown,
  Send,
  Bot,
  User,
  Loader2,
  Zap,
  Clock,
  TrendingUp,
  BarChart3,
  Shield,
  Users,
  Globe,
  Star,
  MessageSquare,
  Rocket,
  Target,
  Heart,
  Scale,
  UtensilsCrossed,
  Home as HomeIcon,
  GraduationCap,
  Briefcase,
  Store,
} from 'lucide-react'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'

const WHATSAPP_URL = 'https://wa.me/56951107102'

/* ─────────────── Pricing Data ─────────────── */
interface PlanFeature {
  text: string
  type: 'yes' | 'no' | 'key' | 'info'
}

interface Plan {
  name: string
  priceCLP: string
  priceEUR: string
  periodCLP: string
  periodEUR: string
  popular: boolean
  features: PlanFeature[]
}

const plans: Plan[] = [
  {
    name: 'Esencial',
    priceCLP: '$99.000',
    priceEUR: '€147',
    periodCLP: 'CLP/mes',
    periodEUR: 'EUR/mes',
    popular: false,
    features: [
      { text: 'Chat IA en tu web', type: 'yes' },
      { text: 'CRM básico con contactos', type: 'yes' },
      { text: 'WhatsApp Business conectado', type: 'yes' },
      { text: 'Soporte básico', type: 'yes' },
      { text: 'IA Copiloto', type: 'no' },
      { text: 'Agentes IA avanzados', type: 'no' },
      { text: 'Sofía Voz para llamadas', type: 'no' },
    ],
  },
  {
    name: 'Premium',
    priceCLP: '$199.000',
    priceEUR: '€297',
    periodCLP: 'CLP/mes',
    periodEUR: 'EUR/mes',
    popular: true,
    features: [
      { text: 'Chat IA en tu web', type: 'yes' },
      { text: 'CRM pipeline completo', type: 'yes' },
      { text: 'WhatsApp Business conectado', type: 'yes' },
      { text: 'IA Copiloto', type: 'yes' },
      { text: 'Agentes IA avanzados', type: 'yes' },
      { text: 'Setup asistido', type: 'yes' },
      { text: 'Sofía Voz para llamadas', type: 'no' },
    ],
  },
  {
    name: 'Élite',
    priceCLP: '$349.000',
    priceEUR: '€497',
    periodCLP: 'CLP/mes',
    periodEUR: 'EUR/mes',
    popular: false,
    features: [
      { text: 'Todo lo de Premium', type: 'yes' },
      { text: 'Sofía Voz para llamadas', type: 'key' },
      { text: 'Integraciones personalizadas', type: 'key' },
      { text: 'Asesoría comercial dedicada', type: 'key' },
      { text: 'Soporte prioritario', type: 'info' },
      { text: 'Onboarding completo', type: 'info' },
    ],
  },
]

/* ─────────────── FAQ Data ─────────────── */
const faqItems = [
  {
    q: '¿Qué es DigiActiva y para quién es?',
    a: 'DigiActiva es una plataforma SaaS que integra agentes de IA, WhatsApp Business y un CRM comercial. Está diseñada para negocios locales en Chile y España: clínicas, restaurantes, abogados, inmobiliarias, academias y más.',
  },
  {
    q: '¿Necesito conocimientos técnicos para usarlo?',
    a: 'No. DigiActiva está pensado para que cualquier persona pueda configurarlo sin equipo de TI. Nuestro equipo te asiste en el setup y la plataforma es intuitiva y visual.',
  },
  {
    q: '¿Cómo funciona el agente IA?',
    a: 'El agente IA atiende automáticamente a los visitantes de tu web y los contactos de WhatsApp, califica leads, responde preguntas frecuentes y captura datos de contacto. Todo se registra en tu CRM.',
  },
  {
    q: '¿Puedo conectar mi WhatsApp Business?',
    a: 'Sí. Integramos con WhatsApp Business API para que puedas gestionar todas las conversaciones desde un solo lugar, con respuesta automática de IA o manual.',
  },
  {
    q: '¿Qué es Sofía Voz?',
    a: 'Sofía Voz es un agente de voz con IA que puede realizar y recibir llamadas telefónicas. Ideal para confirmar citas, seguir up con leads y atender consultas por teléfono sin intervención humana.',
  },
  {
    q: '¿Cuánto tarda la implementación?',
    a: 'El plan Esencial lo puedes configurar en minutos. Los planes Premium y Élite incluyen setup asistido por nuestro equipo, que suele completarse en 24-48 horas.',
  },
  {
    q: '¿Puedo cancelar en cualquier momento?',
    a: 'Sí, no hay contratos de permanencia. Puedes cancelar tu suscripción en cualquier momento desde el panel de configuración.',
  },
  {
    q: '¿Mis datos están seguros?',
    a: 'Absolutamente. Usamos encriptación de punta a punta, servidores seguros y cumplimos con la normativa de protección de datos vigente en Chile y la UE (RGPD).',
  },
]

/* ─────────────── Chat Message Type ─────────────── */
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ══════════════════════════════════════════════════════════════════════ */
export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [country, setCountry] = useState<'CL' | 'ES'>('CL')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatSessionId, setChatSessionId] = useState<string | null>(null)
  const chatMessagesEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)

  /* Scroll detection for sticky header */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* Auto-scroll chat to bottom */
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  /* Focus chat input when opened */
  useEffect(() => {
    if (chatOpen) {
      setTimeout(() => chatInputRef.current?.focus(), 300)
    }
  }, [chatOpen])

  /* Smooth scroll helper */
  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
    setMobileMenuOpen(false)
  }, [])

  /* Send chat message */
  const sendChatMessage = useCallback(async () => {
    const msg = chatInput.trim()
    if (!msg || chatLoading) return

    setChatInput('')
    setChatMessages((prev) => [...prev, { role: 'user', content: msg }])
    setChatLoading(true)

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          sessionId: chatSessionId,
          workspaceSlug: 'demo',
        }),
      })
      const data = await res.json()
      if (data.reply) {
        setChatMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.reply },
        ])
      }
      if (data.sessionId) {
        setChatSessionId(data.sessionId)
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'Lo siento, hubo un error de conexión. Por favor intenta de nuevo.',
        },
      ])
    } finally {
      setChatLoading(false)
    }
  }, [chatInput, chatLoading, chatSessionId])

  const handleChatKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendChatMessage()
      }
    },
    [sendChatMessage]
  )

  /* ──────── Nav links ──────── */
  const navLinks = [
    { label: 'Solución', href: 'solucion' },
    { label: 'Planes', href: 'planes' },
    { label: 'Casos', href: 'casos-de-uso' },
    { label: 'FAQ', href: 'faq' },
  ]

  /* ══════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]" data-testid="landing-page">
      {/* ─────────────── 1. HEADER ─────────────── */}
      <header
        data-testid="header"
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-white/70 backdrop-blur-xl shadow-sm'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16 md:h-18">
          {/* Logo */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="font-[var(--font-outfit)] text-xl font-bold tracking-tight text-[#0F172A]"
            data-testid="logo"
          >
            DIGIACTIVA
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8" data-testid="desktop-nav">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => scrollTo(link.href)}
                className="text-sm font-medium text-[#64748B] hover:text-[#0F172A] transition-colors"
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* CTA + mobile toggle */}
          <div className="flex items-center gap-3">
            <a
              href="/crm"
              className="hidden md:inline-flex items-center gap-2 bg-[#0066FF] hover:bg-[#0052CC] text-white text-sm font-semibold px-6 py-2.5 rounded-full transition-colors"
              data-testid="header-cta"
            >
              Acceder al CRM
            </a>
            <button
              className="md:hidden p-2 text-[#0F172A]"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              data-testid="mobile-menu-toggle"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div
            className="md:hidden bg-white/95 backdrop-blur-xl border-t border-gray-100"
            data-testid="mobile-menu"
          >
            <div className="px-4 py-4 space-y-1">
              {navLinks.map((link) => (
                <button
                  key={link.href}
                  onClick={() => scrollTo(link.href)}
                  className="block w-full text-left px-4 py-3 text-[#0F172A] font-medium rounded-xl hover:bg-gray-50 transition-colors"
                >
                  {link.label}
                </button>
              ))}
              <a
                href="/crm"
                className="block text-center bg-[#0066FF] hover:bg-[#0052CC] text-white font-semibold px-6 py-3 rounded-full transition-colors mt-3"
              >
                Acceder al CRM
              </a>
            </div>
          </div>
        )}
      </header>

      {/* ─────────────── 2. HERO ─────────────── */}
      <section
        className="min-h-screen flex items-center justify-center pt-20 pb-16 px-4 sm:px-6"
        data-testid="hero"
      >
        <div className="max-w-4xl mx-auto text-center">
          <h1
            className="font-[var(--font-outfit)] text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-[#0F172A] leading-[1.08] mb-6"
            data-testid="hero-heading"
          >
            Agentes IA, WhatsApp y CRM{' '}
            <span className="text-[#0066FF]">para negocios locales</span>{' '}
            <span className="text-slate-500">en Chile y España.</span>
          </h1>
          <p className="text-lg md:text-xl text-[#64748B] max-w-2xl mx-auto mb-10 leading-relaxed">
            Automatiza la atención, captura leads y cierra ventas sin complicaciones técnicas. Un sistema comercial completo impulsado por IA.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#0066FF] hover:bg-[#0052CC] text-white font-semibold px-8 py-4 rounded-full text-base transition-colors shadow-lg shadow-[#0066FF]/20"
              data-testid="hero-cta-primary"
            >
              Solicitar diagnóstico gratuito
              <ArrowRight size={18} />
            </a>
            <button
              onClick={() => scrollTo('solucion')}
              className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-[#0F172A] font-semibold px-8 py-4 rounded-full text-base transition-colors border border-gray-200"
              data-testid="hero-cta-secondary"
            >
              Ver cómo funciona
              <ChevronDown size={18} />
            </button>
          </div>
          <p className="text-sm text-[#64748B]">
            Ideal para restaurantes, clínicas, abogados, inmobiliarias y más.
          </p>
        </div>
      </section>

      {/* ─────────────── 3. TRUST STRIP ─────────────── */}
      <section className="py-12 border-y border-gray-100 bg-white" data-testid="trust-strip">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 text-center">
            {[
              { icon: Zap, label: 'Soluciones simples' },
              { icon: Shield, label: 'Sin complicaciones técnicas' },
              { icon: Target, label: 'Enfocado en resultados' },
              { icon: Globe, label: 'Todo en un solo lugar' },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-[#0066FF]/10 flex items-center justify-center">
                  <item.icon size={20} className="text-[#0066FF]" />
                </div>
                <span className="text-sm font-medium text-[#0F172A]">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── 4. PROBLEM ─────────────── */}
      <section
        id="problema"
        className="py-24 md:py-32 bg-[#f5f5f7]"
        data-testid="problem-section"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center mb-14">
            <h2
              className="font-[var(--font-outfit)] text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[#0F172A] mb-4"
              data-testid="problem-heading"
            >
              Tus clientes escriben, pero muchos se pierden antes de comprar.
            </h2>
          </div>
          <div className="max-w-3xl mx-auto space-y-4">
            {[
              'Leads sin respuesta a tiempo',
              'Conversaciones desordenadas',
              'Seguimientos olvidados',
              'Clientes calientes que se enfrían',
              'Falta de control comercial',
            ].map((text) => (
              <div
                key={text}
                className="flex items-center gap-4 bg-white rounded-2xl p-5 shadow-sm"
                data-testid={`problem-item-${text.slice(0, 10)}`}
              >
                <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                  <XCircle size={18} className="text-red-500" />
                </div>
                <span className="text-[#0F172A] font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── 5. SOLUTION ─────────────── */}
      <section
        id="solucion"
        className="py-24 md:py-32 bg-white"
        data-testid="solution-section"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center mb-14">
            <h2
              className="font-[var(--font-outfit)] text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[#0F172A] mb-4"
              data-testid="solution-heading"
            >
              Un agente IA conectado a tu CRM comercial.
            </h2>
            <p className="text-lg text-[#64748B]">
              Todo lo que necesitas para automatizar, organizar y crecer.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: MessageCircle,
                title: 'Chat IA en tu web',
                desc: 'Un agente virtual que atiende visitantes 24/7, responde dudas y captura leads automáticamente.',
              },
              {
                icon: Phone,
                title: 'WhatsApp Business conectado',
                desc: 'Gestiona todas las conversaciones de WhatsApp desde un solo lugar con respuestas automáticas.',
              },
              {
                icon: LayoutDashboard,
                title: 'CRM comercial',
                desc: 'Organiza contactos, pipeline de ventas y seguimiento en un panel visual e intuitivo.',
              },
              {
                icon: FileText,
                title: 'Conversaciones unificadas',
                desc: 'Web, WhatsApp, email: todo en una sola bandeja. Sin perder contexto ni datos.',
              },
              {
                icon: Sparkles,
                title: 'IA Copiloto',
                desc: 'Sugerencias inteligentes para responder más rápido y cerrar más oportunidades.',
              },
              {
                icon: Mic,
                title: 'Sofía Voz para llamadas',
                desc: 'Agente de voz IA que realiza y recibe llamadas para confirmar citas y seguir leads.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-3xl p-9 bg-[#f5f5f7] hover:bg-[#ededf0] transition-colors group"
                data-testid={`solution-card-${item.title.slice(0, 10)}`}
              >
                <div className="w-12 h-12 rounded-2xl bg-[#0066FF]/10 flex items-center justify-center mb-5 group-hover:bg-[#0066FF]/15 transition-colors">
                  <item.icon size={24} className="text-[#0066FF]" />
                </div>
                <h3 className="font-[var(--font-outfit)] text-lg font-semibold text-[#0F172A] mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-[#64748B] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── 6. HOW IT WORKS ─────────────── */}
      <section
        id="como-funciona"
        className="py-24 md:py-32 bg-[#F8FAFC]"
        data-testid="how-it-works"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center mb-14">
            <h2 className="font-[var(--font-outfit)] text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[#0F172A]">
              ¿Cómo funciona?
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                num: '1',
                title: 'Capturamos o conectamos tus canales',
                desc: 'Integramos tu web, WhatsApp y otros canales en minutos. Sin complicaciones.',
              },
              {
                num: '2',
                title: 'El agente IA atiende y califica',
                desc: 'La IA responde automáticamente, hace preguntas calificativas y captura datos de contacto.',
              },
              {
                num: '3',
                title: 'El panel ordena leads, estados y seguimiento',
                desc: 'Todo queda organizado en tu CRM con pipeline, notas y tareas de seguimiento.',
              },
            ].map((step) => (
              <div
                key={step.num}
                className="text-center md:text-left"
                data-testid={`step-${step.num}`}
              >
                <div className="font-[var(--font-outfit)] text-6xl font-bold text-[#0066FF]/15 mb-4">
                  {step.num}
                </div>
                <h3 className="font-[var(--font-outfit)] text-lg font-semibold text-[#0F172A] mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-[#64748B] leading-relaxed">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── 7. DIFFERENTIAL ─────────────── */}
      <section
        id="diferencial"
        className="py-24 md:py-32 bg-black text-white"
        data-testid="differential"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center mb-14">
            <h2 className="font-[var(--font-outfit)] text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              No es solo un chatbot. Es un sistema comercial.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {/* Antes */}
            <div className="rounded-3xl bg-white/5 border border-white/10 p-8 md:p-10">
              <h3 className="font-[var(--font-outfit)] text-xl font-semibold mb-6 text-white/80">
                Antes
              </h3>
              <ul className="space-y-4">
                {[
                  'Chatbots rígidos que frustran',
                  'Leads que se pierden sin seguimiento',
                  'WhatsApp desordenado',
                  'Sin visibilidad del pipeline',
                  'Respuestas lentas fuera de horario',
                ].map((text) => (
                  <li key={text} className="flex items-start gap-3">
                    <XCircle
                      size={20}
                      className="text-red-400 shrink-0 mt-0.5"
                    />
                    <span className="text-white/70 text-sm leading-relaxed">
                      {text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {/* Con DigiActiva */}
            <div className="rounded-3xl bg-gradient-to-br from-[#0066FF] to-[#0044BB] p-8 md:p-10">
              <h3 className="font-[var(--font-outfit)] text-xl font-semibold mb-6">
                Con DigiActiva
              </h3>
              <ul className="space-y-4">
                {[
                  'Agente IA que entiende y califica',
                  'Cada lead con seguimiento automático',
                  'WhatsApp + web unificados',
                  'Pipeline visual y control total',
                  'Atención 24/7 sin interrupciones',
                ].map((text) => (
                  <li key={text} className="flex items-start gap-3">
                    <CheckCircle2
                      size={20}
                      className="text-[#10B981] shrink-0 mt-0.5"
                    />
                    <span className="text-white text-sm leading-relaxed">
                      {text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────── 8. USE CASES ─────────────── */}
      <section
        id="casos-de-uso"
        className="py-24 md:py-32 bg-white"
        data-testid="use-cases"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center mb-14">
            <h2 className="font-[var(--font-outfit)] text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[#0F172A] mb-4">
              Casos de uso
            </h2>
            <p className="text-lg text-[#64748B]">
              DigiActiva se adapta a todo tipo de negocios locales.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              {
                icon: Heart,
                title: 'Clínicas estéticas',
                desc: 'Agenda citas y resuelve dudas automáticamente',
              },
              {
                icon: Scale,
                title: 'Abogados',
                desc: 'Captura consultas y califica casos',
              },
              {
                icon: UtensilsCrossed,
                title: 'Restaurantes',
                desc: 'Reservas, menús y delivery por WhatsApp',
              },
              {
                icon: HomeIcon,
                title: 'Inmobiliarias',
                desc: 'Gestiona visitas y califica compradores',
              },
              {
                icon: GraduationCap,
                title: 'Academias',
                desc: 'Inscripciones, horarios y seguimiento',
              },
              {
                icon: Briefcase,
                title: 'Servicios profesionales',
                desc: 'Atención y agendamiento 24/7',
              },
              {
                icon: Store,
                title: 'Negocios locales',
                desc: 'Venta, consultas y fidelización',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-3xl p-6 bg-[#f5f5f7] hover:bg-[#ededf0] transition-colors group"
                data-testid={`usecase-${item.title.slice(0, 10)}`}
              >
                <div className="w-10 h-10 rounded-xl bg-[#0066FF]/10 flex items-center justify-center mb-4 group-hover:bg-[#0066FF]/15 transition-colors">
                  <item.icon size={20} className="text-[#0066FF]" />
                </div>
                <h3 className="font-[var(--font-outfit)] text-sm font-semibold text-[#0F172A] mb-1">
                  {item.title}
                </h3>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── 9. BENEFITS ─────────────── */}
      <section
        id="beneficios"
        className="py-24 md:py-32 bg-[#F8FAFC]"
        data-testid="benefits"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center mb-14">
            <h2 className="font-[var(--font-outfit)] text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[#0F172A] mb-4">
              Beneficios reales
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Clock,
                title: 'Atención 24/7',
                desc: 'Tu negocio nunca duerme. La IA atiende en cualquier momento.',
              },
              {
                icon: Zap,
                title: 'Más velocidad',
                desc: 'Respuestas instantáneas que aumentan la conversión.',
              },
              {
                icon: TrendingUp,
                title: 'Menos leads perdidos',
                desc: 'Cada oportunidad es capturada y seguida automáticamente.',
              },
              {
                icon: BarChart3,
                title: 'Mejor seguimiento',
                desc: 'Pipeline visual con estados claros y tareas pendientes.',
              },
              {
                icon: Users,
                title: 'Mayor control comercial',
                desc: 'Visibilidad total de tu proceso de ventas.',
              },
              {
                icon: Rocket,
                title: 'Sin equipo TI grande',
                desc: 'Setup sencillo sin necesidad de personal técnico.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-3xl p-8 bg-white border border-gray-100 hover:border-gray-200 transition-colors"
                data-testid={`benefit-${item.title.slice(0, 10)}`}
              >
                <div className="w-10 h-10 rounded-xl bg-[#10B981]/10 flex items-center justify-center mb-4">
                  <item.icon size={20} className="text-[#10B981]" />
                </div>
                <h3 className="font-[var(--font-outfit)] text-lg font-semibold text-[#0F172A] mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-[#64748B] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── 10. PRICING ─────────────── */}
      <section
        id="planes"
        className="py-24 md:py-32 bg-white"
        data-testid="pricing"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center mb-10">
            <h2 className="font-[var(--font-outfit)] text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[#0F172A] mb-4">
              Planes y precios
            </h2>
            <p className="text-lg text-[#64748B] mb-8">
              Elige el plan que mejor se adapte a tu negocio.
            </p>
            {/* Country toggle */}
            <div
              className="inline-flex items-center bg-[#f5f5f7] rounded-full p-1"
              data-testid="country-toggle"
            >
              <button
                onClick={() => setCountry('CL')}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                  country === 'CL'
                    ? 'bg-white text-[#0F172A] shadow-sm'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
                data-testid="toggle-cl"
              >
                Chile 🇨🇱
              </button>
              <button
                onClick={() => setCountry('ES')}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                  country === 'ES'
                    ? 'bg-white text-[#0F172A] shadow-sm'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
                data-testid="toggle-es"
              >
                España 🇪🇸
              </button>
            </div>
          </div>

          {/* Plans grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-8">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-3xl p-8 bg-white transition-all ${
                  plan.popular
                    ? 'border-2 border-[#0066FF] shadow-lg shadow-[#0066FF]/10'
                    : 'border border-gray-200'
                }`}
                data-testid={`plan-${plan.name.toLowerCase()}`}
              >
                {plan.popular && (
                  <div
                    className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#0066FF] text-white text-xs font-bold px-4 py-1.5 rounded-full flex items-center gap-1"
                    data-testid="popular-badge"
                  >
                    <Star size={12} />
                    Más elegido
                  </div>
                )}
                <h3 className="font-[var(--font-outfit)] text-xl font-bold text-[#0F172A] mb-1">
                  {plan.name}
                </h3>
                <div className="mb-6 mt-4">
                  <span className="font-[var(--font-outfit)] text-4xl font-bold text-[#0F172A]">
                    {country === 'CL' ? plan.priceCLP : plan.priceEUR}
                  </span>
                  <span className="text-sm text-[#64748B] ml-1">
                    {country === 'CL' ? plan.periodCLP : plan.periodEUR}
                  </span>
                </div>
                <div className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <div
                      key={f.text}
                      className="flex items-start gap-3"
                    >
                      {f.type === 'yes' && (
                        <CheckCircle2
                          size={18}
                          className="text-[#10B981] shrink-0 mt-0.5"
                        />
                      )}
                      {f.type === 'no' && (
                        <XCircle
                          size={18}
                          className="text-gray-300 shrink-0 mt-0.5"
                        />
                      )}
                      {f.type === 'key' && (
                        <Star
                          size={18}
                          className="text-[#0066FF] shrink-0 mt-0.5"
                        />
                      )}
                      {f.type === 'info' && (
                        <Sparkles
                          size={18}
                          className="text-[#0066FF]/60 shrink-0 mt-0.5"
                        />
                      )}
                      <span
                        className={`text-sm leading-relaxed ${
                          f.type === 'no'
                            ? 'text-gray-400 line-through'
                            : 'text-[#0F172A]'
                        }`}
                      >
                        {f.text}
                      </span>
                    </div>
                  ))}
                </div>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block text-center font-semibold py-3 rounded-full transition-colors text-sm ${
                    plan.popular
                      ? 'bg-[#0066FF] hover:bg-[#0052CC] text-white'
                      : 'bg-[#f5f5f7] hover:bg-[#ededf0] text-[#0F172A]'
                  }`}
                  data-testid={`plan-cta-${plan.name.toLowerCase()}`}
                >
                  Empezar ahora
                </a>
              </div>
            ))}
          </div>

          {/* Enterprise card */}
          <div
            className="max-w-5xl mx-auto rounded-3xl bg-gradient-to-r from-slate-900 to-slate-800 p-8 md:p-10 text-white text-center"
            data-testid="plan-enterprise"
          >
            <h3 className="font-[var(--font-outfit)] text-2xl font-bold mb-2">
              Enterprise
            </h3>
            <p className="text-white/70 mb-4 max-w-lg mx-auto text-sm">
              Para empresas que necesitan personalización total, integraciones
              avanzadas y soporte dedicado.
            </p>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white hover:bg-gray-100 text-slate-900 font-semibold px-8 py-3 rounded-full text-sm transition-colors"
              data-testid="plan-cta-enterprise"
            >
              Contactar ventas
              <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>

      {/* ─────────────── 11. FAQ ─────────────── */}
      <section
        id="faq"
        className="py-24 md:py-32 bg-[#F8FAFC]"
        data-testid="faq"
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="font-[var(--font-outfit)] text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[#0F172A]">
              Preguntas frecuentes
            </h2>
          </div>
          <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden">
            <Accordion type="single" collapsible className="px-6">
              {faqItems.map((item, idx) => (
                <AccordionItem key={idx} value={`faq-${idx}`}>
                  <AccordionTrigger className="text-left text-[#0F172A] font-medium hover:no-underline text-sm md:text-base">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-[#64748B] text-sm leading-relaxed">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* ─────────────── 12. FINAL CTA ─────────────── */}
      <section
        className="py-24 md:py-32 bg-slate-900 text-white"
        data-testid="final-cta"
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="font-[var(--font-outfit)] text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6">
            ¿Listo para crecer?
          </h2>
          <p className="text-lg text-white/70 mb-10 max-w-lg mx-auto">
            Empieza hoy con un diagnóstico gratuito y descubre cómo DigiActiva puede transformar tu negocio.
          </p>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#0066FF] hover:bg-[#0052CC] text-white font-semibold px-10 py-4 rounded-full text-lg transition-colors shadow-lg shadow-[#0066FF]/30"
            data-testid="final-cta-button"
          >
            Hablar con un asesor
            <ArrowRight size={20} />
          </a>
        </div>
      </section>

      {/* ─────────────── 13. FOOTER ─────────────── */}
      <footer
        className="py-10 bg-[#0F172A] text-white/60 mt-auto"
        data-testid="footer"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <span className="font-[var(--font-outfit)] text-lg font-bold text-white tracking-tight">
              DIGIACTIVA
            </span>
            <div className="flex items-center gap-6 text-sm">
              <button
                onClick={() => scrollTo('solucion')}
                className="hover:text-white transition-colors"
              >
                Solución
              </button>
              <button
                onClick={() => scrollTo('planes')}
                className="hover:text-white transition-colors"
              >
                Planes
              </button>
              <button
                onClick={() => scrollTo('casos-de-uso')}
                className="hover:text-white transition-colors"
              >
                Casos
              </button>
              <button
                onClick={() => scrollTo('faq')}
                className="hover:text-white transition-colors"
              >
                FAQ
              </button>
            </div>
            <p className="text-xs text-white/40">
              © {new Date().getFullYear()} DigiActiva. Todos los derechos
              reservados.
            </p>
          </div>
        </div>
      </footer>

      {/* ─────────────── 14. FLOATING WHATSAPP ─────────────── */}
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[#25D366] hover:bg-[#20BD5A] rounded-full flex items-center justify-center shadow-lg shadow-[#25D366]/30 transition-all hover:scale-105"
        aria-label="Contactar por WhatsApp"
        data-testid="floating-whatsapp"
      >
        <svg
          viewBox="0 0 24 24"
          className="w-7 h-7 text-white"
          fill="currentColor"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </a>

      {/* ─────────────── 15. CHAT WIDGET ─────────────── */}
      <div
        className="fixed bottom-24 right-6 z-50"
        data-testid="chat-widget"
      >
        {/* Chat window */}
        {chatOpen && (
          <div className="w-80 sm:w-96 mb-4 bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col">
            {/* Chat header */}
            <div className="bg-[#0066FF] text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Bot size={16} />
                </div>
                <div>
                  <p className="font-semibold text-sm">DigiActiva IA</p>
                  <p className="text-xs text-white/70">En línea</p>
                </div>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="text-white/70 hover:text-white transition-colors"
                aria-label="Cerrar chat"
              >
                <X size={18} />
              </button>
            </div>

            {/* Messages area */}
            <div className="flex-1 max-h-80 overflow-y-auto p-4 space-y-3" data-testid="chat-messages">
              {chatMessages.length === 0 && (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-full bg-[#0066FF]/10 flex items-center justify-center mx-auto mb-3">
                    <MessageSquare size={20} className="text-[#0066FF]" />
                  </div>
                  <p className="text-sm text-[#64748B]">
                    ¡Hola! 👋 Cuéntame, ¿en qué puedo ayudarte?
                  </p>
                </div>
              )}
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`flex items-end gap-2 max-w-[85%] ${
                      msg.role === 'user' ? 'flex-row-reverse' : ''
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                        msg.role === 'assistant'
                          ? 'bg-[#0066FF]/10'
                          : 'bg-gray-100'
                      }`}
                    >
                      {msg.role === 'assistant' ? (
                        <Bot size={12} className="text-[#0066FF]" />
                      ) : (
                        <User size={12} className="text-gray-500" />
                      )}
                    </div>
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-[#0066FF] text-white rounded-br-md'
                          : 'bg-[#f5f5f7] text-[#0F172A] rounded-bl-md'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="flex items-end gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#0066FF]/10 flex items-center justify-center shrink-0">
                      <Bot size={12} className="text-[#0066FF]" />
                    </div>
                    <div className="bg-[#f5f5f7] rounded-2xl rounded-bl-md px-4 py-3">
                      <Loader2
                        size={16}
                        className="text-[#64748B] animate-spin"
                      />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatMessagesEndRef} />
            </div>

            {/* Input area */}
            <div className="border-t border-gray-100 px-4 py-3 flex items-center gap-2">
              <input
                ref={chatInputRef}
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Escribe tu mensaje..."
                className="flex-1 text-sm bg-[#f5f5f7] rounded-full px-4 py-2.5 outline-none focus:ring-2 focus:ring-[#0066FF]/20 transition-all text-[#0F172A] placeholder:text-[#64748B]"
                disabled={chatLoading}
                data-testid="chat-input"
              />
              <button
                onClick={sendChatMessage}
                disabled={!chatInput.trim() || chatLoading}
                className="w-10 h-10 rounded-full bg-[#0066FF] hover:bg-[#0052CC] disabled:bg-gray-200 text-white disabled:text-gray-400 flex items-center justify-center transition-colors shrink-0"
                aria-label="Enviar mensaje"
                data-testid="chat-send"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Chat bubble trigger */}
        {!chatOpen && (
          <button
            onClick={() => setChatOpen(true)}
            className="w-14 h-14 bg-[#0066FF] hover:bg-[#0052CC] rounded-full flex items-center justify-center shadow-lg shadow-[#0066FF]/30 transition-all hover:scale-105 ml-auto"
            aria-label="Abrir chat"
            data-testid="chat-bubble"
          >
            <MessageSquare size={24} className="text-white" />
          </button>
        )}
      </div>
    </div>
  )
}
