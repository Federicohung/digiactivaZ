'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Home, LayoutGrid, Users, MessageCircle, Inbox, Bot, Building2,
  Puzzle, Settings, LogOut, Menu, ChevronDown, ChevronRight,
  Plus, Search, MoreVertical, Phone, Mail, Calendar,
  TrendingUp, DollarSign, Target, Flame, ArrowRight, Send,
  Sparkles, FileText, Clock, Bot as BotIcon, RefreshCw, Eye,
  Edit2, Trash2, MessageSquare, ExternalLink, Loader2, Check,
  AlertCircle, Star, Hash, Globe, Mic, ChevronLeft, ArrowUpRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCorners,
  useDroppable
} from '@dnd-kit/core'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts'

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  activeWorkspaceId?: string
}

interface Contact {
  id: string
  workspaceId: string
  nombre: string
  empresa: string | null
  email: string | null
  telefono: string | null
  nicho: string | null
  fuente: string
  etapa: string
  valorMensual: number
  probabilidadCierre: number
  scoreIa: number
  aiSummary: string | null
  notas: string | null
  createdAt: string
  updatedAt: string
  timeline?: TimelineEvent[]
}

interface TimelineEvent {
  id: string
  tipo: string
  descripcion: string
  metadata: string
  createdAt: string
}

interface Message {
  id: string
  direction: string
  content: string
  channel: string
  createdAt: string
  status: string
}

interface ChatSession {
  id: string
  contactId: string | null
  source: string
  status: string
  messages: Array<{ role: string; content: string; timestamp: string }>
  leadData: Record<string, unknown>
  contact?: { id: string; nombre: string; email: string | null; telefono: string | null; empresa: string | null; etapa: string }
  createdAt: string
  updatedAt: string
}

interface Conversation {
  id: string
  contactId: string
  channel: string
  provider: string
  status: string
  unreadCount: number
  lastMessagePreview: string | null
  lastMessageAt: string
  tags: string[]
  contact: { id: string; nombre: string; email: string | null; empresa: string | null; etapa?: string; nicho?: string; telefono?: string | null }
  createdAt: string
}

interface Workspace {
  id: string
  name: string
  slug: string
  plan: string
  role: string
  onboardingCompleted: boolean
  createdAt: string
}

interface Metrics {
  totalContacts: number
  byEtapa: Record<string, number>
  totalValorMensual: number
  avgProbabilidadCierre: number
  recentContacts: number
  hotLeads: Contact[]
}

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */

const ETAPAS = ['nuevo', 'contactado', 'calificado', 'propuesta', 'negociacion', 'cerrado'] as const

const ETAPA_LABELS: Record<string, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  calificado: 'Calificado',
  propuesta: 'Propuesta',
  negociacion: 'Negociación',
  cerrado: 'Cerrado',
}

const ETAPA_COLORS: Record<string, string> = {
  nuevo: 'bg-sky-50 text-sky-700 border-sky-200',
  contactado: 'bg-amber-50 text-amber-700 border-amber-200',
  calificado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  propuesta: 'bg-violet-50 text-violet-700 border-violet-200',
  negociacion: 'bg-orange-50 text-orange-700 border-orange-200',
  cerrado: 'bg-green-50 text-green-700 border-green-200',
}

const ETAPA_DOT_COLORS: Record<string, string> = {
  nuevo: 'bg-sky-400',
  contactado: 'bg-amber-400',
  calificado: 'bg-emerald-400',
  propuesta: 'bg-violet-400',
  negociacion: 'bg-orange-400',
  cerrado: 'bg-green-400',
}

const ETAPA_BAR_COLORS: Record<string, string> = {
  nuevo: '#38bdf8',
  contactado: '#f59e0b',
  calificado: '#10b981',
  propuesta: '#8b5cf6',
  negociacion: '#f97316',
  cerrado: '#22c55e',
}

const FUENTE_LABELS: Record<string, string> = {
  web_chat: 'Web Chat',
  whatsapp: 'WhatsApp',
  manual: 'Manual',
  messenger: 'Messenger',
  instagram: 'Instagram',
  external: 'Externo',
}

const FUENTE_COLORS: Record<string, string> = {
  web_chat: 'text-gray-500',
  whatsapp: 'text-emerald-500',
  manual: 'text-gray-400',
  messenger: 'text-blue-500',
  instagram: 'text-pink-500',
  external: 'text-orange-500',
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  web_chat: <Globe className="w-3 h-3" />,
  whatsapp: <MessageSquare className="w-3 h-3" />,
  messenger: <MessageCircle className="w-3 h-3" />,
  instagram: <Hash className="w-3 h-3" />,
  external: <ExternalLink className="w-3 h-3" />,
  manual: <Plus className="w-3 h-3" />,
}

type Section = 'hoy' | 'pipeline' | 'contactos' | 'conversaciones' | 'bandeja' | 'agente' | 'workspaces' | 'integraciones' | 'ajustes'

const NAV_ITEMS: { key: Section; label: string; icon: React.ElementType }[] = [
  { key: 'hoy', label: 'Hoy', icon: Home },
  { key: 'pipeline', label: 'Pipeline', icon: LayoutGrid },
  { key: 'contactos', label: 'Contactos', icon: Users },
  { key: 'conversaciones', label: 'Conversaciones', icon: MessageCircle },
  { key: 'bandeja', label: 'Bandeja', icon: Inbox },
  { key: 'agente', label: 'Agente', icon: Bot },
  { key: 'workspaces', label: 'Workspaces', icon: Building2 },
  { key: 'integraciones', label: 'Integraciones', icon: Puzzle },
  { key: 'ajustes', label: 'Ajustes', icon: Settings },
]

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

function apiFetch(path: string, token: string, options?: RequestInit) {
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  if (diff < 60000) return 'ahora'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  return `${Math.floor(diff / 86400000)}d`
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-amber-600'
  return 'text-red-500'
}

function getScoreBg(score: number): string {
  if (score >= 80) return 'bg-green-50 border-green-200'
  if (score >= 60) return 'bg-amber-50 border-amber-200'
  return 'bg-red-50 border-red-200'
}

function getFuenteIcon(fuente: string) {
  return CHANNEL_ICONS[fuente] || <Globe className="w-3 h-3" />
}

/* ═══════════════════════════════════════════════════════════════
   DROPPABLE COLUMN (for Pipeline)
   ═══════════════════════════════════════════════════════════════ */

function DroppableColumn({ etapa, children, className }: { etapa: string; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa })
  return (
    <div
      ref={setNodeRef}
      className={`${className || ''} ${isOver ? 'ring-2 ring-sky-300/50 bg-sky-50/30' : ''} transition-colors duration-150`}
    >
      {children}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

function useInitAuth() {
  const savedToken = typeof window !== 'undefined' ? localStorage.getItem('digiactiva_token') : null
  const [token, setToken] = useState<string | null>(savedToken)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(!!savedToken)

  useEffect(() => {
    if (!token) return
    apiFetch('/api/auth/me', token)
      .then(r => r.json())
      .then(data => {
        if (data.user) {
          setUser(data.user)
        } else {
          localStorage.removeItem('digiactiva_token')
          setToken(null)
        }
      })
      .catch(() => {
        localStorage.removeItem('digiactiva_token')
        setToken(null)
      })
      .finally(() => setLoading(false))
  }, [])

  return { token, setToken, user, setUser, loading }
}

export default function CRMPage() {
  const { token, setToken, user, setUser, loading } = useInitAuth()
  const [activeSection, setActiveSection] = useState<Section>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab')
      if (tab && ['hoy', 'pipeline', 'contactos', 'conversaciones', 'bandeja', 'agente', 'workspaces', 'integraciones', 'ajustes'].includes(tab)) {
        return tab as Section
      }
    }
    return 'hoy'
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogin = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (data.token) {
      localStorage.setItem('digiactiva_token', data.token)
      setToken(data.token)
      setUser(data.user)
      toast.success('Sesión iniciada correctamente')
    } else {
      toast.error(data.error || 'Error al iniciar sesión')
    }
  }, [setToken, setUser])

  const handleLogout = useCallback(() => {
    localStorage.removeItem('digiactiva_token')
    setToken(null)
    setUser(null)
    toast.success('Sesión cerrada')
  }, [setToken, setUser])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-[#0066FF]" />
      </div>
    )
  }

  if (!token || !user) {
    return <LoginScreen onLogin={handleLogin} />
  }

  return (
    <div className="min-h-screen flex bg-gray-50/80">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-56 bg-white border-r border-gray-100 fixed inset-y-0 z-30">
        <SidebarContent
          activeSection={activeSection}
          onSectionChange={(s) => { setActiveSection(s); setSidebarOpen(false) }}
          user={user}
          onLogout={handleLogout}
        />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="p-0 w-56">
          <SidebarContent
            activeSection={activeSection}
            onSectionChange={(s) => { setActiveSection(s); setSidebarOpen(false) }}
            user={user}
            onLogout={handleLogout}
          />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 lg:ml-56 flex flex-col h-screen">
        {/* Top Bar */}
        <header className="shrink-0 z-20 bg-white border-b border-gray-100 px-3 lg:px-5 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-4 h-4" />
            </Button>
            <h1 className="text-sm font-semibold text-gray-800">
              {NAV_ITEMS.find(n => n.key === activeSection)?.label}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 hidden sm:block">{user.email}</span>
            <Avatar className="w-7 h-7">
              <AvatarFallback className="bg-[#0066FF] text-white text-[10px]">
                {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Section Content */}
        <main className={`flex-1 min-h-0 overflow-hidden ${activeSection === 'bandeja' ? 'p-0' : 'p-3 lg:p-5'}`}>
          {activeSection === 'hoy' && <HoySection token={token} onNavigate={setActiveSection} />}
          {activeSection === 'pipeline' && <PipelineSection token={token} />}
          {activeSection === 'contactos' && <ContactosSection token={token} onNavigate={setActiveSection} />}
          {activeSection === 'conversaciones' && <ConversacionesSection token={token} />}
          {activeSection === 'bandeja' && <BandejaSection token={token} onNavigate={setActiveSection} />}
          {activeSection === 'agente' && <AgenteSection token={token} />}
          {activeSection === 'workspaces' && <WorkspacesSection token={token} user={user} onUserUpdate={setUser} />}
          {activeSection === 'integraciones' && <IntegracionesSection token={token} />}
          {activeSection === 'ajustes' && <AjustesSection token={token} />}
        </main>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   LOGIN SCREEN
   ═══════════════════════════════════════════════════════════════ */

function LoginScreen({ onLogin }: { onLogin: (email: string, password: string) => void }) {
  const [email, setEmail] = useState('founder@digiactiva.com')
  const [password, setPassword] = useState('digiactiva2025')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await onLogin(email, password)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 flex items-center justify-center">
            <div className="w-10 h-10 rounded-xl bg-[#0066FF] flex items-center justify-center">
              <BotIcon className="w-6 h-6 text-white" />
            </div>
          </div>
          <CardTitle className="text-xl font-bold">DigiActiva</CardTitle>
          <p className="text-xs text-gray-400 mt-1">Inicia sesión en tu CRM</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" required className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">Contraseña</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required className="h-9 text-sm" />
            </div>
            <Button type="submit" className="w-full bg-[#0066FF] hover:bg-[#0052CC] h-9 text-sm" disabled={loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              Iniciar sesión
            </Button>
          </form>
          <div className="mt-4 text-center">
            <a href="/" className="text-xs text-[#0066FF] hover:underline">← Volver al inicio</a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   SIDEBAR (Compact)
   ═══════════════════════════════════════════════════════════════ */

function SidebarContent({
  activeSection,
  onSectionChange,
  user,
  onLogout,
}: {
  activeSection: Section
  onSectionChange: (s: Section) => void
  user: AuthUser
  onLogout: () => void
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-3 h-12 flex items-center border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#0066FF] flex items-center justify-center">
            <BotIcon className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-base text-gray-900">DigiActiva</span>
        </div>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => (
          <button
            key={item.key}
            onClick={() => onSectionChange(item.key)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeSection === item.key
                ? 'bg-[#0066FF]/8 text-[#0066FF]'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {item.label}
          </button>
        ))}
      </nav>

      {/* User Section */}
      <div className="p-2 border-t border-gray-100 shrink-0">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Avatar className="w-7 h-7">
            <AvatarFallback className="bg-[#0066FF] text-white text-[10px]">
              {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-800 truncate">{user.name}</p>
            <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-300 hover:text-red-500" onClick={onLogout}>
                  <LogOut className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cerrar sesión</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   1. HOY SECTION (Dashboard)
   ═══════════════════════════════════════════════════════════════ */

function useFetch<T>(url: string, token: string): { data: T | null; loading: boolean; refetch: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [counter, setCounter] = useState(0)

  const refetch = useCallback(() => setCounter(c => c + 1), [])

  useEffect(() => {
    let cancelled = false
    apiFetch(url, token)
      .then(r => r.json())
      .then(result => { if (!cancelled && !result.error) setData(result) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [url, token, counter])

  return { data, loading, refetch }
}

function HoySection({ token, onNavigate }: { token: string; onNavigate: (s: Section) => void }) {
  const { data: metrics, loading } = useFetch<Metrics>('/api/crm/metrics', token)

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#0066FF]" /></div>

  if (!metrics) return <div className="text-center py-8 text-gray-400 text-sm">No se pudieron cargar las métricas</div>

  const chartData = ETAPAS.map(e => ({
    name: ETAPA_LABELS[e],
    cantidad: metrics.byEtapa[e] || 0,
    fill: ETAPA_BAR_COLORS[e],
  }))

  return (
    <div className="space-y-4">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total contactos', value: metrics.totalContacts, icon: Users, color: 'text-sky-500 bg-sky-50' },
          { label: 'En pipeline', value: Object.values(metrics.byEtapa).reduce((a, b) => a + b, 0) - (metrics.byEtapa.cerrado || 0), icon: LayoutGrid, color: 'text-violet-500 bg-violet-50' },
          { label: 'Valor mensual', value: formatCurrency(metrics.totalValorMensual), icon: DollarSign, color: 'text-emerald-500 bg-emerald-50' },
          { label: 'Leads calientes', value: metrics.hotLeads.length, icon: Flame, color: 'text-orange-500 bg-orange-50' },
        ].map(m => (
          <Card key={m.label} className="shadow-none border-gray-100">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-gray-400">{m.label}</p>
                  <p className="text-xl font-bold text-gray-900">{m.value}</p>
                </div>
                <div className={`w-9 h-9 rounded-xl ${m.color} flex items-center justify-center`}>
                  <m.icon className="w-4 h-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 shadow-none border-gray-100">
          <CardHeader className="pb-1 px-4 pt-4">
            <CardTitle className="text-sm">Distribución del pipeline</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <RechartsTooltip />
                  <Bar dataKey="cantidad" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none border-gray-100">
          <CardHeader className="pb-1 px-4 pt-4">
            <CardTitle className="text-sm">Acciones rápidas</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            <Button className="w-full justify-start gap-2 bg-[#0066FF] hover:bg-[#0052CC] h-8 text-xs" onClick={() => onNavigate('pipeline')}>
              <Plus className="w-3.5 h-3.5" /> Nuevo lead
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2 h-8 text-xs" onClick={() => onNavigate('pipeline')}>
              <LayoutGrid className="w-3.5 h-3.5" /> Ver pipeline
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2 h-8 text-xs" onClick={() => onNavigate('contactos')}>
              <Users className="w-3.5 h-3.5" /> Ver contactos
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2 h-8 text-xs" onClick={() => onNavigate('bandeja')}>
              <Inbox className="w-3.5 h-3.5" /> Bandeja de entrada
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Hot Leads */}
      {metrics.hotLeads.length > 0 && (
        <Card className="shadow-none border-gray-100">
          <CardHeader className="pb-1 px-4 pt-4">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-orange-400" /> Leads calientes
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-1.5">
              {metrics.hotLeads.slice(0, 5).map(lead => (
                <div key={lead.id} className="flex items-center justify-between p-2.5 bg-gray-50/80 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Avatar className="w-7 h-7">
                      <AvatarFallback className="bg-gray-100 text-gray-500 text-[10px]">
                        {lead.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-xs font-medium text-gray-800">{lead.nombre}</p>
                      <p className="text-[10px] text-gray-400">{lead.empresa || 'Sin empresa'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`${ETAPA_COLORS[lead.etapa] || 'bg-gray-100 text-gray-600'} text-[10px] px-1.5 py-0`}>
                      {ETAPA_LABELS[lead.etapa] || lead.etapa}
                    </Badge>
                    <span className={`text-xs font-semibold ${getScoreColor(lead.scoreIa)}`}>
                      {lead.scoreIa}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   2. PIPELINE SECTION (Kanban) — FIXED with useDroppable
   ═══════════════════════════════════════════════════════════════ */

function PipelineSection({ token }: { token: string }) {
  const [pipeline, setPipeline] = useState<Record<string, Contact[]>>({})
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [showNewLead, setShowNewLead] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const fetchPipeline = useCallback(() => setRefreshKey(k => k + 1), [])

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/crm/pipeline', token)
      .then(r => r.json())
      .then(data => {
        if (!cancelled && !data.error) {
          const p: Record<string, Contact[]> = {}
          ETAPAS.forEach(e => { p[e] = data[e] || [] })
          setPipeline(p)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token, refreshKey])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const contactId = active.id as string
    // over.id now correctly returns the etapa name from the DroppableColumn
    const targetEtapa = over.id as string

    // Find the contact
    let contact: Contact | null = null
    for (const etapa of ETAPAS) {
      const found = pipeline[etapa]?.find(c => c.id === contactId)
      if (found) { contact = found; break }
    }
    if (!contact || contact.etapa === targetEtapa) return

    // Verify targetEtapa is a valid etapa
    if (!ETAPAS.includes(targetEtapa as typeof ETAPAS[number])) return

    // Optimistic update
    setPipeline(prev => {
      const next = { ...prev }
      for (const e of ETAPAS) {
        next[e] = next[e].filter(c => c.id !== contactId)
      }
      next[targetEtapa] = [...(next[targetEtapa] || []), { ...contact!, etapa: targetEtapa }]
      return next
    })

    try {
      await apiFetch(`/api/crm/pipeline/move/${contactId}`, token, {
        method: 'PUT',
        body: JSON.stringify({ etapa: targetEtapa }),
      })
      toast.success(`${contact.nombre} movido a ${ETAPA_LABELS[targetEtapa]}`)
    } catch {
      toast.error('Error al mover contacto')
      fetchPipeline()
    }
  }

  const handleNewLead = async (data: { nombre: string; empresa: string; email: string; telefono: string; valorMensual: string; etapa: string }) => {
    try {
      await apiFetch('/api/crm/contacts', token, {
        method: 'POST',
        body: JSON.stringify({
          nombre: data.nombre,
          empresa: data.empresa || null,
          email: data.email || null,
          telefono: data.telefono || null,
          valorMensual: parseFloat(data.valorMensual) || 0,
          etapa: data.etapa || 'nuevo',
          fuente: 'manual',
        }),
      })
      toast.success('Lead creado correctamente')
      setShowNewLead(false)
      fetchPipeline()
    } catch {
      toast.error('Error al crear lead')
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#0066FF]" /></div>

  const activeContact = activeId
    ? ETAPAS.flatMap(e => pipeline[e] || []).find(c => c.id === activeId)
    : null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Pipeline de ventas</h2>
        <Button className="gap-1.5 bg-[#0066FF] hover:bg-[#0052CC] h-8 text-xs" onClick={() => setShowNewLead(true)}>
          <Plus className="w-3.5 h-3.5" /> Nuevo lead
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: '65vh' }}>
          {ETAPAS.map(etapa => (
            <DroppableColumn
              key={etapa}
              etapa={etapa}
              className="flex-shrink-0 w-64 bg-gray-50/80 rounded-xl p-2.5"
            >
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <div className={`w-2 h-2 rounded-full ${ETAPA_DOT_COLORS[etapa]}`} />
                <h3 className="text-xs font-semibold text-gray-600">{ETAPA_LABELS[etapa]}</h3>
                <span className="ml-auto text-[10px] text-gray-400 bg-white rounded-full px-1.5 py-0.5 border border-gray-100">{pipeline[etapa]?.length || 0}</span>
              </div>
              <div className="space-y-1.5 min-h-[150px]">
                {pipeline[etapa]?.map(contact => (
                  <div
                    key={contact.id}
                    className="bg-white rounded-lg p-2.5 border border-gray-100 cursor-grab active:cursor-grabbing hover:border-gray-200 transition-colors"
                    onClick={() => setSelectedContact(contact)}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium text-gray-800">{contact.nombre}</p>
                        <span className={`${FUENTE_COLORS[contact.fuente] || 'text-gray-400'}`}>
                          {getFuenteIcon(contact.fuente)}
                        </span>
                      </div>
                      {contact.scoreIa > 0 && (
                        <span className={`text-[10px] font-bold px-1 py-0 rounded border ${getScoreBg(contact.scoreIa)} ${getScoreColor(contact.scoreIa)}`}>
                          {contact.scoreIa}
                        </span>
                      )}
                    </div>
                    {contact.empresa && (
                      <p className="text-[10px] text-gray-400 mb-1">{contact.empresa}</p>
                    )}
                    <div className="flex items-center justify-between">
                      {contact.valorMensual > 0 && (
                        <span className="text-[10px] font-medium text-emerald-600">{formatCurrency(contact.valorMensual)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </DroppableColumn>
          ))}
        </div>
        <DragOverlay>
          {activeContact ? (
            <div className="bg-white rounded-lg p-2.5 shadow-md border border-gray-200 w-64 rotate-1">
              <p className="text-xs font-medium text-gray-800">{activeContact.nombre}</p>
              {activeContact.empresa && <p className="text-[10px] text-gray-400">{activeContact.empresa}</p>}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Contact Detail Modal */}
      <ContactDetailModal contact={selectedContact} token={token} onClose={() => setSelectedContact(null)} onUpdate={fetchPipeline} />

      {/* New Lead Dialog */}
      <NewLeadDialog open={showNewLead} onClose={() => setShowNewLead(false)} onSubmit={handleNewLead} />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   CONTACT DETAIL MODAL
   ═══════════════════════════════════════════════════════════════ */

function ContactDetailModal({
  contact,
  token,
  onClose,
  onUpdate,
}: {
  contact: Contact | null
  token: string
  onClose: () => void
  onUpdate: () => void
}) {
  const [tab, setTab] = useState<'info' | 'timeline' | 'conversations'>('info')
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [aiSummary, setAiSummary] = useState<string | null>(contact?.aiSummary || null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Partial<Contact>>({})

  useEffect(() => {
    if (contact) {
      setAiSummary(contact.aiSummary)
      setEditData({
        nombre: contact.nombre,
        empresa: contact.empresa || '',
        email: contact.email || '',
        telefono: contact.telefono || '',
        notas: contact.notas || '',
      })
    }
  }, [contact])

  useEffect(() => {
    if (contact && tab === 'timeline') {
      apiFetch(`/api/crm/timeline/${contact.id}`, token)
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setTimeline(data) })
        .catch(() => {})
    }
    if (contact && tab === 'conversations') {
      apiFetch(`/api/crm/messages/${contact.id}`, token)
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setMessages(data) })
        .catch(() => {})
    }
  }, [contact, tab, token])

  if (!contact) return null

  const generateSummary = async () => {
    setSummaryLoading(true)
    try {
      const res = await apiFetch(`/api/crm/ai/summary/${contact.id}`, token, { method: 'POST' })
      const data = await res.json()
      if (data.summary) {
        setAiSummary(data.summary)
        toast.success('Resumen IA generado')
      }
    } catch {
      toast.error('Error al generar resumen')
    } finally {
      setSummaryLoading(false)
    }
  }

  const generateContent = async (tipo: 'email' | 'whatsapp_message') => {
    try {
      const res = await apiFetch('/api/crm/ai/generate', token, {
        method: 'POST',
        body: JSON.stringify({ tipo, contactId: contact.id }),
      })
      const data = await res.json()
      if (data.content) {
        navigator.clipboard.writeText(data.content)
        toast.success(tipo === 'email' ? 'Email generado y copiado' : 'WhatsApp generado y copiado')
      }
    } catch {
      toast.error('Error al generar contenido')
    }
  }

  const saveEdit = async () => {
    try {
      await apiFetch(`/api/crm/contacts/${contact.id}`, token, {
        method: 'PUT',
        body: JSON.stringify(editData),
      })
      toast.success('Contacto actualizado')
      setEditing(false)
      onUpdate()
    } catch {
      toast.error('Error al actualizar')
    }
  }

  return (
    <Dialog open={!!contact} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm">{contact.nombre}</DialogTitle>
            <div className="flex items-center gap-1.5">
              <span className={`${FUENTE_COLORS[contact.fuente]}`}>{getFuenteIcon(contact.fuente)}</span>
              <Badge className={`${ETAPA_COLORS[contact.etapa]} text-[10px]`}>{ETAPA_LABELS[contact.etapa]}</Badge>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="shrink-0 h-8">
            <TabsTrigger value="info" className="text-xs">Info</TabsTrigger>
            <TabsTrigger value="timeline" className="text-xs">Timeline</TabsTrigger>
            <TabsTrigger value="conversations" className="text-xs">Conversaciones</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="flex-1 overflow-y-auto mt-3 space-y-3">
            {editing ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-[10px]">Nombre</Label><Input className="h-8 text-xs" value={editData.nombre || ''} onChange={e => setEditData(p => ({ ...p, nombre: e.target.value }))} /></div>
                  <div><Label className="text-[10px]">Empresa</Label><Input className="h-8 text-xs" value={editData.empresa || ''} onChange={e => setEditData(p => ({ ...p, empresa: e.target.value }))} /></div>
                  <div><Label className="text-[10px]">Email</Label><Input className="h-8 text-xs" value={editData.email || ''} onChange={e => setEditData(p => ({ ...p, email: e.target.value }))} /></div>
                  <div><Label className="text-[10px]">Teléfono</Label><Input className="h-8 text-xs" value={editData.telefono || ''} onChange={e => setEditData(p => ({ ...p, telefono: e.target.value }))} /></div>
                </div>
                <div><Label className="text-[10px]">Notas</Label><Textarea className="text-xs" value={editData.notas || ''} onChange={e => setEditData(p => ({ ...p, notas: e.target.value }))} rows={3} /></div>
                <div className="flex gap-2">
                  <Button size="sm" className="bg-[#0066FF] hover:bg-[#0052CC] h-7 text-xs" onClick={saveEdit}>Guardar</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(false)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-gray-400">Empresa:</span> <span className="font-medium">{contact.empresa || '—'}</span></div>
                  <div><span className="text-gray-400">Email:</span> <span className="font-medium">{contact.email || '—'}</span></div>
                  <div><span className="text-gray-400">Teléfono:</span> <span className="font-medium">{contact.telefono || '—'}</span></div>
                  <div className="flex items-center gap-1"><span className="text-gray-400">Fuente:</span> <span className={`font-medium flex items-center gap-1 ${FUENTE_COLORS[contact.fuente]}`}>{getFuenteIcon(contact.fuente)} {FUENTE_LABELS[contact.fuente]}</span></div>
                  <div><span className="text-gray-400">Valor:</span> <span className="font-medium text-emerald-600">{formatCurrency(contact.valorMensual)}</span></div>
                  <div><span className="text-gray-400">Score IA:</span> <span className={`font-bold ${getScoreColor(contact.scoreIa)}`}>{contact.scoreIa}</span></div>
                </div>
                {contact.notas && (
                  <div className="bg-gray-50 p-2.5 rounded-lg text-xs text-gray-600">{contact.notas}</div>
                )}
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => setEditing(true)}><Edit2 className="w-3 h-3" /> Editar</Button>
                  <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={generateSummary} disabled={summaryLoading}>
                    {summaryLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Resumen IA
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => generateContent('email')}><Mail className="w-3 h-3" /> Email</Button>
                  <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => generateContent('whatsapp_message')}><MessageSquare className="w-3 h-3" /> WhatsApp</Button>
                </div>
              </div>
            )}

            {aiSummary && (
              <div className="bg-sky-50 border border-sky-100 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                  <span className="text-xs font-medium text-sky-800">Resumen IA</span>
                </div>
                <p className="text-xs text-sky-700 whitespace-pre-wrap">{aiSummary}</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="timeline" className="flex-1 overflow-y-auto mt-3">
            {timeline.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">Sin eventos de timeline</p>
            ) : (
              <div className="space-y-2">
                {timeline.map(event => (
                  <div key={event.id} className="flex gap-2 p-2 bg-gray-50 rounded-lg">
                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                      {event.tipo === 'nota' && <FileText className="w-3 h-3 text-gray-500" />}
                      {event.tipo === 'mensaje' && <MessageCircle className="w-3 h-3 text-sky-500" />}
                      {event.tipo === 'etapa_cambiada' && <TrendingUp className="w-3 h-3 text-violet-500" />}
                      {event.tipo === 'ai_summary' && <Sparkles className="w-3 h-3 text-amber-500" />}
                      {!['nota', 'mensaje', 'etapa_cambiada', 'ai_summary'].includes(event.tipo) && <Clock className="w-3 h-3 text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-800">{event.descripcion}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(event.createdAt)} {formatTime(event.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="conversations" className="flex-1 overflow-y-auto mt-3">
            {messages.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">Sin mensajes</p>
            ) : (
              <div className="space-y-1.5">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[80%] rounded-lg p-2.5 text-xs ${
                      msg.direction === 'inbound'
                        ? 'bg-gray-100 text-gray-800'
                        : 'bg-[#0066FF] text-white'
                    }`}>
                      <p>{msg.content}</p>
                      <p className={`text-[10px] mt-0.5 ${msg.direction === 'inbound' ? 'text-gray-400' : 'text-blue-200'}`}>
                        {formatTime(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════════════════════════════════════════════════════
   NEW LEAD DIALOG
   ═══════════════════════════════════════════════════════════════ */

function NewLeadDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: { nombre: string; empresa: string; email: string; telefono: string; valorMensual: string; etapa: string }) => void
}) {
  const [form, setForm] = useState({ nombre: '', empresa: '', email: '', telefono: '', valorMensual: '', etapa: 'nuevo' })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nombre.trim()) {
      toast.error('El nombre es requerido')
      return
    }
    onSubmit(form)
    setForm({ nombre: '', empresa: '', email: '', telefono: '', valorMensual: '', etapa: 'nuevo' })
  }

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Nuevo lead</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div><Label className="text-xs">Nombre *</Label><Input className="h-8 text-xs" value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} required /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Empresa</Label><Input className="h-8 text-xs" value={form.empresa} onChange={e => setForm(p => ({ ...p, empresa: e.target.value }))} /></div>
            <div><Label className="text-xs">Valor mensual</Label><Input className="h-8 text-xs" type="number" value={form.valorMensual} onChange={e => setForm(p => ({ ...p, valorMensual: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Email</Label><Input className="h-8 text-xs" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div><Label className="text-xs">Teléfono</Label><Input className="h-8 text-xs" value={form.telefono} onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))} /></div>
          </div>
          <div>
            <Label className="text-xs">Etapa</Label>
            <Select value={form.etapa} onValueChange={v => setForm(p => ({ ...p, etapa: v }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ETAPAS.map(e => (
                  <SelectItem key={e} value={e}>{ETAPA_LABELS[e]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" className="h-8 text-xs">Cancelar</Button></DialogClose>
            <Button type="submit" className="bg-[#0066FF] hover:bg-[#0052CC] h-8 text-xs">Crear lead</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════════════════════════════════════════════════════
   3. CONTACTOS SECTION (Improved with source icons + etapa dropdown)
   ═══════════════════════════════════════════════════════════════ */

function ContactosSection({ token, onNavigate }: { token: string; onNavigate?: (s: Section) => void }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterEtapa, setFilterEtapa] = useState('all')
  const [filterFuente, setFilterFuente] = useState('all')
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [page, setPage] = useState(0)
  const pageSize = 15
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchContacts = useCallback(() => setRefreshKey(k => k + 1), [])

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (filterEtapa !== 'all') params.set('etapa', filterEtapa)
    if (filterFuente !== 'all') params.set('fuente', filterFuente)

    apiFetch(`/api/crm/contacts?${params.toString()}`, token)
      .then(r => r.json())
      .then(data => { if (!cancelled && Array.isArray(data)) setContacts(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token, search, filterEtapa, filterFuente, refreshKey])

  const paginated = contacts.slice(page * pageSize, (page + 1) * pageSize)
  const totalPages = Math.ceil(contacts.length / pageSize)

  const handleNewContact = async (data: { nombre: string; empresa: string; email: string; telefono: string; valorMensual: string; etapa: string }) => {
    try {
      await apiFetch('/api/crm/contacts', token, {
        method: 'POST',
        body: JSON.stringify({
          nombre: data.nombre,
          empresa: data.empresa || null,
          email: data.email || null,
          telefono: data.telefono || null,
          valorMensual: parseFloat(data.valorMensual) || 0,
          etapa: data.etapa || 'nuevo',
          fuente: 'manual',
        }),
      })
      toast.success('Contacto creado')
      setShowNew(false)
      fetchContacts()
    } catch {
      toast.error('Error al crear contacto')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este contacto?')) return
    try {
      await apiFetch(`/api/crm/contacts/${id}`, token, { method: 'DELETE' })
      toast.success('Contacto eliminado')
      fetchContacts()
    } catch {
      toast.error('Error al eliminar')
    }
  }

  const handleEtapaChange = async (contactId: string, newEtapa: string) => {
    try {
      await apiFetch(`/api/crm/pipeline/move/${contactId}`, token, {
        method: 'PUT',
        body: JSON.stringify({ etapa: newEtapa }),
      })
      toast.success(`Etapa cambiada a ${ETAPA_LABELS[newEtapa]}`)
      fetchContacts()
    } catch {
      toast.error('Error al cambiar etapa')
    }
  }

  return (
    <div className="space-y-3">
      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input
              placeholder="Buscar contactos..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Select value={filterEtapa} onValueChange={v => { setFilterEtapa(v); setPage(0) }}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Etapa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {ETAPAS.map(e => <SelectItem key={e} value={e}>{ETAPA_LABELS[e]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterFuente} onValueChange={v => { setFilterFuente(v); setPage(0) }}>
            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Fuente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Object.entries(FUENTE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button className="gap-1.5 bg-[#0066FF] hover:bg-[#0052CC] shrink-0 h-8 text-xs" onClick={() => setShowNew(true)}>
          <Plus className="w-3.5 h-3.5" /> Nuevo contacto
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#0066FF]" /></div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-xs">No se encontraron contactos</div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50/50">
                    <th className="text-left px-3 py-2 font-medium text-gray-400">Nombre</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-400 hidden md:table-cell">Empresa</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-400 hidden lg:table-cell">Email</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-400">Fuente</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-400">Etapa</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-400 hidden md:table-cell">Valor</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-400 hidden sm:table-cell">Score</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(c => (
                    <tr
                      key={c.id}
                      className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedContact(c)}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="bg-gray-100 text-gray-500 text-[9px]">
                              {c.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-gray-800">{c.nombre}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 hidden md:table-cell">{c.empresa || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-500 hidden lg:table-cell">{c.email || '—'}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 ${FUENTE_COLORS[c.fuente] || 'text-gray-400'}`}>
                          {getFuenteIcon(c.fuente)}
                          <span className="hidden xl:inline">{FUENTE_LABELS[c.fuente]}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                            <button className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${ETAPA_COLORS[c.etapa]} hover:opacity-80`}>
                              {ETAPA_LABELS[c.etapa]}
                              <ChevronDown className="w-2.5 h-2.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent onClick={e => e.stopPropagation()}>
                            <DropdownMenuLabel className="text-[10px]">Cambiar etapa</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {ETAPAS.map(e => (
                              <DropdownMenuItem
                                key={e}
                                onClick={(ev) => { ev.stopPropagation(); handleEtapaChange(c.id, e) }}
                                className={c.etapa === e ? 'bg-gray-50' : ''}
                              >
                                <div className={`w-2 h-2 rounded-full ${ETAPA_DOT_COLORS[e]} mr-1.5`} />
                                <span className="text-xs">{ETAPA_LABELS[e]}</span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-500 hidden md:table-cell">{c.valorMensual > 0 ? formatCurrency(c.valorMensual) : '—'}</td>
                      <td className="px-3 py-2.5 text-center hidden sm:table-cell">
                        <span className={`text-[10px] font-bold ${getScoreColor(c.scoreIa)}`}>{c.scoreIa || '—'}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-6 w-6"><MoreVertical className="w-3 h-3" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={e => { e.stopPropagation(); setSelectedContact(c) }}><Eye className="w-3 h-3 mr-1.5" /> Ver detalle</DropdownMenuItem>
                            {onNavigate && (c.fuente === 'messenger' || c.fuente === 'instagram') && (
                              <DropdownMenuItem onClick={e => { e.stopPropagation(); onNavigate('bandeja') }}>
                                <Inbox className="w-3 h-3 mr-1.5" /> Ver en Bandeja
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={e => { e.stopPropagation(); handleDelete(c.id) }} className="text-red-600"><Trash2 className="w-3 h-3 mr-1.5" /> Eliminar</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400">{contacts.length} contactos</span>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-3 h-3" />
                </Button>
                <span className="text-[10px] text-gray-500">{page + 1} / {totalPages}</span>
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ContactDetailModal contact={selectedContact} token={token} onClose={() => setSelectedContact(null)} onUpdate={fetchContacts} />
      <NewLeadDialog open={showNew} onClose={() => setShowNew(false)} onSubmit={handleNewContact} />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   4. CONVERSACIONES SECTION
   ═══════════════════════════════════════════════════════════════ */

function ConversacionesSection({ token }: { token: string }) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/crm/chat-sessions', token)
      .then(r => r.json())
      .then(data => { if (!cancelled && Array.isArray(data)) setSessions(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#0066FF]" /></div>

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-800">Sesiones de chat</h2>

      {sessions.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-xs">No hay sesiones de chat</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Session List */}
          <div className="lg:col-span-1 space-y-1.5">
            {sessions.map(session => (
              <div
                key={session.id}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedSession?.id === session.id ? 'border-[#0066FF]/30 bg-sky-50/50' : 'border-gray-100 bg-white hover:bg-gray-50'
                }`}
                onClick={() => setSelectedSession(session)}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-medium text-gray-800">
                    {session.contact?.nombre || 'Visitante anónimo'}
                  </span>
                  <Badge variant={session.status === 'active' ? 'default' : 'secondary'} className="text-[10px] h-4">
                    {session.status === 'active' ? 'Activo' : 'Cerrado'}
                  </Badge>
                </div>
                <p className="text-[10px] text-gray-400">
                  {session.source === 'web_chat' ? '🌐 Web' : '💬 WhatsApp'} · {formatRelativeTime(session.updatedAt)}
                </p>
                {session.messages.length > 0 && (
                  <p className="text-[10px] text-gray-300 mt-0.5 truncate">
                    {session.messages[session.messages.length - 1]?.content}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Message Detail */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 min-h-[400px] flex flex-col">
            {selectedSession ? (
              <>
                <div className="p-3 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <Avatar className="w-7 h-7">
                      <AvatarFallback className="bg-gray-100 text-gray-500 text-[10px]">
                        {(selectedSession.contact?.nombre || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-xs font-medium text-gray-800">{selectedSession.contact?.nombre || 'Visitante anónimo'}</p>
                      <p className="text-[10px] text-gray-400">{selectedSession.source === 'web_chat' ? 'Web Chat' : 'WhatsApp'}</p>
                    </div>
                  </div>
                </div>
                <ScrollArea className="flex-1 p-3">
                  <div className="space-y-2">
                    {selectedSession.messages.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[80%] rounded-lg p-2.5 text-xs ${
                          msg.role === 'user' ? 'bg-gray-100 text-gray-800' : 'bg-[#0066FF] text-white'
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-300">
                <p className="text-xs">Selecciona una sesión</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   5. BANDEJA SECTION (Inbox) — FIXED loop + added lead buttons
   ═══════════════════════════════════════════════════════════════ */

function BandejaSection({ token, onNavigate }: { token: string; onNavigate?: (s: Section) => void }) {
  /* ── Channel config ── */
  const CHANNEL_COLORS: Record<string, { bg: string; text: string; border: string; dot: string; badge: string }> = {
    messenger: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', dot: 'bg-blue-500', badge: 'bg-blue-500 text-white' },
    instagram: { bg: 'bg-pink-50', text: 'text-pink-600', border: 'border-pink-200', dot: 'bg-pink-500', badge: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' },
    web_chat: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', dot: 'bg-gray-400', badge: 'bg-gray-500 text-white' },
    whatsapp: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', dot: 'bg-emerald-500', badge: 'bg-emerald-500 text-white' },
    external: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200', dot: 'bg-orange-500', badge: 'bg-orange-500 text-white' },
  }

  const CHANNEL_LABELS: Record<string, string> = {
    messenger: 'Messenger',
    instagram: 'Instagram',
    web_chat: 'Web Chat',
    whatsapp: 'WhatsApp',
    external: 'Externo',
  }

  const FILTER_TABS = ['all', 'messenger', 'instagram', 'web_chat'] as const
  type FilterTab = typeof FILTER_TABS[number]

  /* ── State ── */
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [sendText, setSendText] = useState('')
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [syncing, setSyncing] = useState(false)
  const [msgLoading, setMsgLoading] = useState(false)
  const [connectedProfiles, setConnectedProfiles] = useState<Array<{ toolkit: string; connected: boolean; accountName: string | null; pageName: string | null }>>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const hasAutoSynced = useRef(false)
  const isMounted = useRef(true)
  const activeFilterRef = useRef<FilterTab>(activeFilter)
  const tokenRef = useRef(token)
  const refreshCounter = useRef(0)

  // Keep refs in sync
  useEffect(() => { activeFilterRef.current = activeFilter }, [activeFilter])
  useEffect(() => { tokenRef.current = token }, [token])

  /* ── Load connected profiles (only once) ── */
  useEffect(() => {
    apiFetch('/api/composio/connections', token)
      .then(r => r.json())
      .then(data => {
        if (isMounted.current && data.connections) {
          setConnectedProfiles(data.connections)
        }
      })
      .catch(() => {})
    return () => { isMounted.current = false }
  }, [token])

  /* ── Stable fetch function using refs ── */
  const loadConversationsStable = useCallback(async () => {
    const currentFilter = activeFilterRef.current
    const currentToken = tokenRef.current
    const params = new URLSearchParams()
    if (currentFilter !== 'all') params.set('channel', currentFilter)
    const qs = params.toString() ? `?${params.toString()}` : ''
    try {
      const res = await apiFetch(`/api/inbox/conversations${qs}`, currentToken)
      const data = await res.json()
      if (isMounted.current && data.conversations) {
        setConversations(data.conversations)
      }
    } catch {
      // silent
    }
  }, [])

  /* ── Initial load + auto-sync (runs only when token/filter change) ── */
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      setLoading(true)
      // Load conversations
      const params = new URLSearchParams()
      if (activeFilter !== 'all') params.set('channel', activeFilter)
      const qs = params.toString() ? `?${params.toString()}` : ''
      try {
        const res = await apiFetch(`/api/inbox/conversations${qs}`, token)
        const data = await res.json()
        if (!cancelled && data.conversations) setConversations(data.conversations)
      } catch { /* silent */ }
      setLoading(false)

      // Auto-sync from Composio on first load only (only once ever)
      if (!hasAutoSynced.current) {
        hasAutoSynced.current = true
        try {
          const syncRes = await apiFetch('/api/inbox/sync', token, { method: 'POST', body: JSON.stringify({}) })
          const syncData = await syncRes.json()
          if (!cancelled && syncData.ok && syncData.totalSynced > 0) {
            const res2 = await apiFetch(`/api/inbox/conversations${qs}`, token)
            const data2 = await res2.json()
            if (!cancelled && data2.conversations) setConversations(data2.conversations)
            const connRes = await apiFetch('/api/composio/connections', token)
            const connData = await connRes.json()
            if (!cancelled && connData.connections) setConnectedProfiles(connData.connections)
          }
        } catch { /* silent */ }
      }
    }
    init()
    return () => { cancelled = true }
  }, [token, activeFilter])

  /* ── Fetch messages when selecting a conversation ── */
  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    setMsgLoading(true)
    apiFetch(`/api/inbox/conversations/${selectedId}/messages`, token)
      .then(r => r.json())
      .then(data => { if (!cancelled && data.messages) setMessages(data.messages) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setMsgLoading(false) })

    // Mark as read
    apiFetch(`/api/inbox/conversations/${selectedId}/read`, token, { method: 'POST' })
      .then(() => {
        if (!cancelled) {
          setConversations(prev => prev.map(c =>
            c.id === selectedId ? { ...c, unreadCount: 0 } : c
          ))
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedId, token])

  /* ── Auto-scroll ── */
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [messages])

  /* ── Send message ── */
  const sendMessage = async () => {
    if (!sendText.trim() || !selectedId) return
    const text = sendText.trim()
    setSendText('')
    try {
      await apiFetch(`/api/inbox/conversations/${selectedId}/send`, token, {
        method: 'POST',
        body: JSON.stringify({ content: text }),
      })
      const res = await apiFetch(`/api/inbox/conversations/${selectedId}/messages`, token)
      const data = await res.json()
      if (data.messages) setMessages(data.messages)
      loadConversationsStable()
    } catch {
      toast.error('Error al enviar mensaje')
    }
  }

  /* ── Manual Sync (with refresh button) ── */
  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await apiFetch('/api/inbox/sync', token, { method: 'POST', body: JSON.stringify({}) })
      const data = await res.json()
      if (data.ok) {
        toast.success(`Sincronización completa — ${data.totalSynced ?? 0} mensajes nuevos`)
        loadConversationsStable()
        if (selectedId) {
          const msgRes = await apiFetch(`/api/inbox/conversations/${selectedId}/messages`, token)
          const msgData = await msgRes.json()
          if (msgData.messages) setMessages(msgData.messages)
        }
        const connRes = await apiFetch('/api/composio/connections', token)
        const connData = await connRes.json()
        if (connData.connections) setConnectedProfiles(connData.connections)
      } else {
        toast.error(data.error || 'Error en sincronización')
      }
    } catch {
      toast.error('Error al sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  /* ── Derived ── */
  const filtered = useMemo(() => conversations.filter(c => {
    if (activeFilter !== 'all' && c.channel !== activeFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return c.contact.nombre.toLowerCase().includes(q) || (c.lastMessagePreview || '').toLowerCase().includes(q)
    }
    return true
  }), [conversations, activeFilter, searchQuery])

  const selectedConvo = conversations.find(c => c.id === selectedId)

  const unreadByChannel = useCallback((channel: string) =>
    channel === 'all'
      ? conversations.reduce((s, c) => s + c.unreadCount, 0)
      : conversations.filter(c => c.channel === channel).reduce((s, c) => s + c.unreadCount, 0)
  , [conversations])

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  const fbProfile = connectedProfiles.find(p => p.toolkit === 'facebook')
  const igProfile = connectedProfiles.find(p => p.toolkit === 'instagram')
  const hasAnyConnection = connectedProfiles.some(p => p.connected)

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-[#0066FF]" />
          <p className="text-[10px] text-gray-400">Cargando bandeja…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ═══ Header ═══ */}
      <div className="shrink-0 bg-white border-b border-gray-100">
        {/* Connected profiles bar */}
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider mr-0.5">Conectado</span>
            {fbProfile?.connected ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-medium border border-blue-100">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                <MessageCircle className="w-2.5 h-2.5" />
                {fbProfile.pageName || fbProfile.accountName || 'Facebook'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-50 text-gray-300 text-[10px] font-medium border border-gray-100">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                <MessageCircle className="w-2.5 h-2.5" />
                Facebook
              </span>
            )}
            {igProfile?.connected ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 text-[10px] font-medium border border-pink-100">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" />
                <Hash className="w-2.5 h-2.5" />
                {igProfile.pageName || igProfile.accountName || 'Instagram'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-50 text-gray-300 text-[10px] font-medium border border-gray-100">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                <Hash className="w-2.5 h-2.5" />
                Instagram
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-[10px] h-6 text-gray-400 hover:text-[#0066FF] px-1.5"
                    onClick={handleSync}
                    disabled={syncing}
                  >
                    {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    {syncing ? 'Sincronizando…' : 'Sincronizar'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sincronizar mensajes</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-0.5 px-3 pb-1.5">
          {FILTER_TABS.map(tab => {
            const label = tab === 'all' ? 'Todos' : CHANNEL_LABELS[tab] || tab
            const ch = tab === 'all' ? 'messenger' : tab
            const unread = unreadByChannel(tab)
            return (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                className={`relative flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all duration-200 ${
                  activeFilter === tab
                    ? `${CHANNEL_COLORS[ch]?.bg || 'bg-blue-50'} ${CHANNEL_COLORS[ch]?.text || 'text-blue-600'} shadow-sm`
                    : 'text-gray-300 hover:bg-gray-50 hover:text-gray-500'
                }`}
              >
                {tab !== 'all' && CHANNEL_ICONS[tab]}
                {label}
                {unread > 0 && (
                  <span className={`ml-0.5 px-1 py-0 rounded-full text-[9px] font-bold leading-none ${
                    activeFilter === tab ? 'bg-white/80 text-gray-600' : 'bg-gray-200 text-gray-400'
                  }`}>
                    {unread}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ═══ No connections warning ═══ */}
      {!hasAnyConnection && (
        <div className="shrink-0 px-3 py-2 bg-amber-50/80 border-b border-amber-100/50 flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
          <p className="text-[10px] text-amber-600">No hay cuentas conectadas. Ve a <button onClick={() => onNavigate?.('integraciones')} className="font-semibold underline hover:text-amber-700">Integraciones</button> para conectar.</p>
        </div>
      )}

      {/* ═══ 3-column body ═══ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Column 1: Conversation list ── */}
        <div className="w-72 shrink-0 border-r border-gray-100 flex flex-col bg-gray-50/30">
          {/* Search */}
          <div className="shrink-0 p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <Input
                placeholder="Buscar conversación…"
                className="pl-7 h-7 text-[10px] bg-white border-gray-100"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-track]:transparent">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-3 text-center">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-2">
                  <Inbox className="w-5 h-5 text-gray-200" />
                </div>
                <p className="text-[10px] font-medium text-gray-400">Sin conversaciones</p>
                <p className="text-[10px] text-gray-300 mt-0.5">
                  {searchQuery ? 'Intenta con otra búsqueda' : hasAnyConnection ? 'Sincroniza para cargar' : 'Conecta una cuenta'}
                </p>
                {hasAnyConnection && (
                  <Button variant="outline" size="sm" className="mt-2 gap-1 text-[10px] h-6" onClick={handleSync} disabled={syncing}>
                    {syncing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
                    Sincronizar
                  </Button>
                )}
              </div>
            ) : (
              <div className="px-1.5 pb-1.5 space-y-0.5">
                {filtered.map(conv => {
                  const isActive = selectedId === conv.id
                  const ch = CHANNEL_COLORS[conv.channel] || CHANNEL_COLORS.web_chat
                  return (
                    <button
                      key={conv.id}
                      className={`w-full text-left rounded-lg p-2.5 transition-all duration-150 group relative ${
                        isActive ? 'bg-white shadow-sm ring-1 ring-gray-100' : 'hover:bg-white/50'
                      }`}
                      onClick={() => setSelectedId(conv.id)}
                    >
                      {isActive && <div className={`absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full ${ch.dot}`} />}
                      <div className="flex items-start gap-2">
                        <div className="relative shrink-0">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="bg-gray-100 text-gray-500 text-[10px]">
                              {getInitials(conv.contact.nombre)}
                            </AvatarFallback>
                          </Avatar>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white flex items-center justify-center ${ch.dot}`}>
                            <span className="text-[4px] text-white">{conv.channel === 'messenger' ? 'M' : conv.channel === 'instagram' ? 'I' : ''}</span>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className={`text-[11px] truncate ${conv.unreadCount > 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-600'}`}>
                              {conv.contact.nombre}
                            </span>
                            <span className={`text-[9px] shrink-0 ${conv.unreadCount > 0 ? 'text-[#0066FF] font-medium' : 'text-gray-300'}`}>
                              {formatRelativeTime(conv.lastMessageAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`shrink-0 ${ch.text}`}>{CHANNEL_ICONS[conv.channel]}</span>
                            <p className={`text-[10px] truncate ${conv.unreadCount > 0 ? 'text-gray-500 font-medium' : 'text-gray-300'}`}>
                              {conv.lastMessagePreview || 'Sin mensajes'}
                            </p>
                          </div>
                        </div>
                        {conv.unreadCount > 0 && (
                          <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-[#0066FF] text-white text-[8px] font-bold flex items-center justify-center">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Column 2: Chat area ── */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          {selectedConvo ? (
            <>
              {/* Chat header */}
              <div className="shrink-0 px-4 py-2 border-b border-gray-100 flex items-center justify-between bg-white">
                <div className="flex items-center gap-2">
                  <Avatar className="w-7 h-7">
                    <AvatarFallback className="bg-gray-100 text-gray-500 text-[10px]">
                      {getInitials(selectedConvo.contact.nombre)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs font-semibold text-gray-800">{selectedConvo.contact.nombre}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className={`inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-medium ${
                        (CHANNEL_COLORS[selectedConvo.channel] || CHANNEL_COLORS.web_chat).badge
                      }`}>
                        {CHANNEL_ICONS[selectedConvo.channel]}
                        {CHANNEL_LABELS[selectedConvo.channel] || selectedConvo.channel}
                      </span>
                    </div>
                  </div>
                </div>
                {selectedConvo.status === 'closed' && (
                  <Badge variant="secondary" className="text-[10px] h-4">Cerrada</Badge>
                )}
              </div>

              {/* Messages */}
              <div
                ref={chatScrollRef}
                className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-track]:transparent"
              >
                {msgLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-[#0066FF]" /></div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-300">
                    <MessageSquare className="w-6 h-6 mb-1" />
                    <p className="text-[10px]">Sin mensajes aún</p>
                  </div>
                ) : (
                  messages.map(msg => {
                    const isInbound = msg.direction === 'inbound'
                    return (
                      <div key={msg.id} className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}>
                        <div
                          className={`max-w-[75%] px-3 py-2 text-xs leading-relaxed ${
                            isInbound
                              ? 'bg-gray-100 text-gray-800 rounded-xl rounded-bl-sm'
                              : 'bg-[#0066FF] text-white rounded-xl rounded-br-sm'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          <p className={`text-[9px] mt-0.5 ${isInbound ? 'text-gray-400' : 'text-blue-200'}`}>
                            {formatTime(msg.createdAt)}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="shrink-0 px-3 py-2 border-t border-gray-100 bg-gray-50/30">
                <div className="flex items-center gap-1.5">
                  <Input
                    placeholder="Escribe un mensaje…"
                    className="flex-1 h-8 text-xs bg-white border-gray-100"
                    value={sendText}
                    onChange={e => setSendText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage()
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    className="h-8 w-8 rounded-lg bg-[#0066FF] hover:bg-[#0052CC] shrink-0"
                    onClick={sendMessage}
                    disabled={!sendText.trim()}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-50/20">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                <MessageCircle className="w-6 h-6 text-gray-200" />
              </div>
              <p className="text-xs font-medium text-gray-400">Tu bandeja de entrada</p>
              <p className="text-[10px] text-gray-300 mt-0.5">Selecciona una conversación</p>
            </div>
          )}
        </div>

        {/* ── Column 3: Contact sidebar ── */}
        <div className="w-64 shrink-0 border-l border-gray-100 bg-gray-50/30 flex-col hidden lg:flex">
          {selectedConvo ? (
            <div className="flex-1 overflow-y-auto min-h-0 p-4 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-track]:transparent">
              {/* Avatar */}
              <div className="flex flex-col items-center text-center mb-4">
                <Avatar className="w-14 h-14 mb-2">
                  <AvatarFallback className="bg-gray-100 text-gray-600 text-base font-semibold">
                    {getInitials(selectedConvo.contact.nombre)}
                  </AvatarFallback>
                </Avatar>
                <h3 className="text-xs font-semibold text-gray-800">{selectedConvo.contact.nombre}</h3>
                {selectedConvo.contact.empresa && (
                  <p className="text-[10px] text-gray-400 mt-0.5">{selectedConvo.contact.empresa}</p>
                )}
                {selectedConvo.contact.etapa && (
                  <Badge className={`mt-1.5 text-[9px] ${ETAPA_COLORS[selectedConvo.contact.etapa] || 'bg-gray-100 text-gray-600'}`}>
                    {ETAPA_LABELS[selectedConvo.contact.etapa] || selectedConvo.contact.etapa}
                  </Badge>
                )}
              </div>

              <Separator className="mb-4" />

              {/* Contact details */}
              <div className="space-y-2">
                {selectedConvo.contact.email && (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-white border border-gray-100 flex items-center justify-center shrink-0">
                      <Mail className="w-3 h-3 text-gray-400" />
                    </div>
                    <span className="text-[10px] text-gray-500 truncate">{selectedConvo.contact.email}</span>
                  </div>
                )}
                {selectedConvo.contact.telefono && (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-white border border-gray-100 flex items-center justify-center shrink-0">
                      <Phone className="w-3 h-3 text-gray-400" />
                    </div>
                    <span className="text-[10px] text-gray-500">{selectedConvo.contact.telefono}</span>
                  </div>
                )}
              </div>

              <Separator className="my-4" />

              {/* Channel info */}
              <div className="space-y-2">
                <p className="text-[9px] font-semibold text-gray-300 uppercase tracking-wider">Canal</p>
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium ${
                    (CHANNEL_COLORS[selectedConvo.channel] || CHANNEL_COLORS.web_chat).badge
                  }`}>
                    {CHANNEL_ICONS[selectedConvo.channel]}
                    {CHANNEL_LABELS[selectedConvo.channel] || selectedConvo.channel}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${selectedConvo.status === 'open' ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                  {selectedConvo.status === 'open' ? 'Abierta' : 'Cerrada'}
                </div>
                <p className="text-[10px] text-gray-300">Creada: {formatDate(selectedConvo.createdAt)}</p>
              </div>

              <Separator className="my-4" />

              {/* Action buttons */}
              <div className="space-y-1.5">
                {onNavigate && (
                  <>
                    <Button
                      variant="outline"
                      className="w-full gap-1.5 text-[10px] h-7"
                      onClick={() => onNavigate('pipeline')}
                    >
                      <LayoutGrid className="w-3 h-3" />
                      Ver en Pipeline
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full gap-1.5 text-[10px] h-7"
                      onClick={() => onNavigate('contactos')}
                    >
                      <Users className="w-3 h-3" />
                      Ver en CRM
                    </Button>
                    {(selectedConvo.channel === 'messenger' || selectedConvo.channel === 'instagram') && (
                      <Button
                        className="w-full gap-1.5 text-[10px] h-7 bg-[#0066FF] hover:bg-[#0052CC]"
                        onClick={() => onNavigate('pipeline')}
                      >
                        <ArrowUpRight className="w-3 h-3" />
                        Crear Lead
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center px-3 text-center">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mb-1.5">
                <Users className="w-4 h-4 text-gray-200" />
              </div>
              <p className="text-[10px] text-gray-300">Selecciona una conversación</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   6. AGENTE SECTION (Agent Config)
   ═══════════════════════════════════════════════════════════════ */

function AgenteSection({ token }: { token: string }) {
  const [config, setConfig] = useState<Record<string, Record<string, string>>>({})
  const [loading, setLoading] = useState(true)
  const [activeChannel, setActiveChannel] = useState('web_chat')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiFetch('/api/crm/agent-config', token)
      .then(r => r.json())
      .then(data => {
        if (data.agentPrompts) {
          setConfig(data.agentPrompts)
        }
      })
      .catch(() => toast.error('Error al cargar config'))
      .finally(() => setLoading(false))
  }, [token])

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/crm/agent-config', token, {
        method: 'PUT',
        body: JSON.stringify({ channel: activeChannel, prompts: config[activeChannel] }),
      })
      toast.success('Configuración guardada')
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    try {
      const res = await apiFetch('/api/crm/agent-config', token, {
        method: 'POST',
        body: JSON.stringify({ action: 'reset', channel: activeChannel }),
      })
      const data = await res.json()
      if (data.agentPrompts) {
        setConfig(data.agentPrompts)
      }
      toast.success('Prompts restaurados')
    } catch {
      toast.error('Error al restaurar')
    }
  }

  const updatePrompt = (key: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      [activeChannel]: { ...prev[activeChannel], [key]: value },
    }))
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#0066FF]" /></div>

  const channelPrompts = config[activeChannel] || {}

  const promptFields = [
    { key: 'greeting', label: 'Saludo', icon: <MessageCircle className="w-3.5 h-3.5" /> },
    { key: 'qualification', label: 'Calificación', icon: <Target className="w-3.5 h-3.5" /> },
    { key: 'scheduling', label: 'Agendamiento', icon: <Calendar className="w-3.5 h-3.5" /> },
    { key: 'fallback', label: 'Fallback', icon: <AlertCircle className="w-3.5 h-3.5" /> },
    { key: 'closing', label: 'Cierre', icon: <Check className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Configuración del Agente IA</h2>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={handleReset}><RefreshCw className="w-3 h-3" /> Restaurar</Button>
          <Button size="sm" className="bg-[#0066FF] hover:bg-[#0052CC] h-7 text-[10px] gap-1" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Guardar
          </Button>
        </div>
      </div>

      <Tabs value={activeChannel} onValueChange={setActiveChannel}>
        <TabsList className="h-8">
          <TabsTrigger value="web_chat" className="gap-1 text-xs"><Globe className="w-3 h-3" /> Web Chat</TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-1 text-xs"><MessageSquare className="w-3 h-3" /> WhatsApp</TabsTrigger>
          <TabsTrigger value="voice" className="gap-1 text-xs"><Mic className="w-3 h-3" /> Voz</TabsTrigger>
        </TabsList>

        {['web_chat', 'whatsapp', 'voice'].map(channel => (
          <TabsContent key={channel} value={channel} className="space-y-3 mt-3">
            {promptFields.map(field => (
              <Card key={field.key} className="shadow-none border-gray-100">
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-gray-400">{field.icon}</span>
                    <Label className="text-xs font-medium">{field.label}</Label>
                  </div>
                  <Textarea
                    value={channelPrompts[field.key] || ''}
                    onChange={e => updatePrompt(field.key, e.target.value)}
                    rows={2}
                    className="resize-none text-xs"
                  />
                </CardContent>
              </Card>
            ))}

            <Card className="shadow-none border-gray-100">
              <CardContent className="p-3">
                <Label className="text-xs font-medium mb-1.5 block">Prompt estructurado (avanzado)</Label>
                <Textarea
                  value={channelPrompts.estructurado || ''}
                  onChange={e => updatePrompt('estructurado', e.target.value)}
                  rows={4}
                  placeholder="Prompt personalizado completo..."
                  className="font-mono text-[10px]"
                />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   7. WORKSPACES SECTION
   ═══════════════════════════════════════════════════════════════ */

function WorkspacesSection({ token, user, onUserUpdate }: { token: string; user: AuthUser; onUserUpdate: (u: AuthUser) => void }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPlan, setNewPlan] = useState('essential')
  const [switching, setSwitching] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/workspaces', token)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setWorkspaces(data) })
      .catch(() => toast.error('Error al cargar workspaces'))
      .finally(() => setLoading(false))
  }, [token])

  const switchWorkspace = async (workspaceId: string) => {
    setSwitching(workspaceId)
    try {
      const res = await apiFetch('/api/auth/switch-workspace', token, {
        method: 'POST',
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json()
      if (data.token) {
        localStorage.setItem('digiactiva_token', data.token)
        onUserUpdate(data.user)
        toast.success(`Workspace cambiado a ${data.workspace?.name}`)
      }
    } catch {
      toast.error('Error al cambiar workspace')
    } finally {
      setSwitching(null)
    }
  }

  const createWorkspace = async () => {
    if (!newName.trim()) { toast.error('Nombre es requerido'); return }
    try {
      const res = await apiFetch('/api/workspaces', token, {
        method: 'POST',
        body: JSON.stringify({ name: newName, plan: newPlan }),
      })
      if (res.ok) {
        toast.success('Workspace creado')
        setShowCreate(false)
        setNewName('')
        const data = await (apiFetch('/api/workspaces', token)).then(r => r.json())
        if (Array.isArray(data)) setWorkspaces(data)
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al crear')
      }
    } catch {
      toast.error('Error al crear workspace')
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#0066FF]" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Workspaces</h2>
        {user.role === 'founder_admin' && (
          <Button className="gap-1.5 bg-[#0066FF] hover:bg-[#0052CC] h-8 text-xs" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5" /> Crear workspace
          </Button>
        )}
      </div>

      {workspaces.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-xs">No hay workspaces</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {workspaces.map(ws => (
            <Card key={ws.id} className={`shadow-none ${ws.id === user.activeWorkspaceId ? 'border-[#0066FF]/30 border-2' : 'border-gray-100'}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">{ws.name}</h3>
                    <p className="text-[10px] text-gray-400">{ws.slug}</p>
                  </div>
                  {ws.id === user.activeWorkspaceId && (
                    <Badge className="bg-[#0066FF] text-white text-[10px] h-4">Activo</Badge>
                  )}
                </div>
                <div className="space-y-1.5 text-xs text-gray-500">
                  <div className="flex items-center justify-between">
                    <span>Plan:</span>
                    <Badge variant="outline" className="capitalize text-[10px] h-4">{ws.plan.replace('_', ' ')}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Rol:</span>
                    <span className="capitalize">{ws.role}</span>
                  </div>
                </div>
                {ws.id !== user.activeWorkspaceId && (
                  <Button variant="outline" size="sm" className="w-full mt-3 h-7 text-[10px]" onClick={() => switchWorkspace(ws.id)} disabled={switching === ws.id}>
                    {switching === ws.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    Cambiar a este workspace
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Workspace Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Crear workspace</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Nombre</Label><Input className="h-8 text-xs" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Mi negocio" /></div>
            <div>
              <Label className="text-xs">Plan</Label>
              <Select value={newPlan} onValueChange={setNewPlan}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="essential">Essential</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="elite">Elite</SelectItem>
                  <SelectItem value="founder_full">Founder Full</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" className="h-8 text-xs">Cancelar</Button></DialogClose>
            <Button className="bg-[#0066FF] hover:bg-[#0052CC] h-8 text-xs" onClick={createWorkspace}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   8. INTEGRACIONES SECTION (with Verificar button + better FB)
   ═══════════════════════════════════════════════════════════════ */

function IntegracionesSection({ token }: { token: string }) {
  const [fbStatus, setFbStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading')
  const [igStatus, setIgStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading')
  const [fbAccountName, setFbAccountName] = useState<string | null>(null)
  const [igAccountName, setIgAccountName] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<{ channel: string; newMessages: number } | null>(null)
  const [verifying, setVerifying] = useState<string | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Check connection status
  const checkStatus = useCallback(() => {
    setFbStatus('loading')
    setIgStatus('loading')
    apiFetch('/api/composio/status?toolkit=facebook', token)
      .then(r => r.json())
      .then(data => {
        setFbStatus(data.connected ? 'connected' : 'disconnected')
        setFbAccountName(data.accountName || null)
      })
      .catch(() => setFbStatus('disconnected'))

    apiFetch('/api/composio/status?toolkit=instagram', token)
      .then(r => r.json())
      .then(data => {
        setIgStatus(data.connected ? 'connected' : 'disconnected')
        setIgAccountName(data.accountName || null)
      })
      .catch(() => setIgStatus('disconnected'))
  }, [token])

  // Check status on mount + handle OAuth callback
  useEffect(() => {
    checkStatus()

    const params = new URLSearchParams(window.location.search)
    const integracionesConectado = params.get('integraciones_conectado')
    const integracionesError = params.get('integraciones_error')
    const integracionesStatus = params.get('integraciones_status')
    const connected = params.get('connected')

    if (integracionesConectado) {
      const name = integracionesConectado === 'facebook' ? 'Facebook' : 'Instagram'
      toast.success(`${name} conectado exitosamente`)
      window.history.replaceState({}, '', '/crm')
      setTimeout(checkStatus, 1500)
      setTimeout(checkStatus, 5000)
    } else if (integracionesError) {
      toast.error(`Error al conectar: ${integracionesError}`)
      window.history.replaceState({}, '', '/crm')
    } else if (integracionesStatus === 'callback_unknown') {
      toast.info('Conexión recibida. Verificando estado...')
      window.history.replaceState({}, '', '/crm')
      setTimeout(checkStatus, 2000)
      setTimeout(checkStatus, 6000)
    } else if (connected) {
      toast.success(`${connected === 'facebook' ? 'Facebook' : 'Instagram'} conectado exitosamente`)
      window.history.replaceState({}, '', '/crm')
      setTimeout(checkStatus, 2000)
    }

    const error = params.get('error')
    if (error && !integracionesError) {
      toast.error(`Error al conectar: ${error}`)
      window.history.replaceState({}, '', '/crm')
    }
  }, [checkStatus])

  // Cleanup
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [])

  const handleConnect = async (toolkit: 'facebook' | 'instagram') => {
    setConnecting(toolkit)
    try {
      const res = await apiFetch('/api/composio/connect', token, {
        method: 'POST',
        body: JSON.stringify({ toolkit }),
      })
      const data = await res.json()

      if (data.error) {
        toast.error(data.error)
        setConnecting(null)
        return
      }

      if (data.authUrl) {
        const newWindow = window.open(data.authUrl, '_blank')
        if (!newWindow) {
          toast.info('Se abrirá la autorización en esta ventana. Vuelve después de autorizar.')
          setTimeout(() => { window.location.href = data.authUrl }, 1000)
          return
        }
        toast.info(`Autoriza tu cuenta de ${toolkit === 'facebook' ? 'Facebook' : 'Instagram'} en la ventana que se abrió`)

        // Poll for connection
        let attempts = 0
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = setInterval(() => {
          attempts++
          apiFetch(`/api/composio/status?toolkit=${toolkit}`, token)
            .then(r => r.json())
            .then(statusData => {
              if (statusData.connected) {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
                pollIntervalRef.current = null
                if (toolkit === 'facebook') { setFbStatus('connected'); setFbAccountName(statusData.accountName || null) }
                else { setIgStatus('connected'); setIgAccountName(statusData.accountName || null) }
                toast.success(`${toolkit === 'facebook' ? 'Facebook' : 'Instagram'} conectado exitosamente`)
                setConnecting(null)
              }
            })
            .catch(() => {})
          if (attempts >= 40) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
            setConnecting(null)
            toast.info('Tiempo de espera agotado. Haz clic en "Verificar" para comprobar manualmente.')
          }
        }, 3000)
      } else {
        toast.error('No se pudo generar la URL de conexión')
        setConnecting(null)
      }
    } catch {
      toast.error('Error al iniciar conexión. Inténtalo de nuevo.')
      setConnecting(null)
    }
  }

  // Explicit verify (calls the status API and tries to fetch page name)
  const handleVerify = async (toolkit: 'facebook' | 'instagram') => {
    setVerifying(toolkit)
    try {
      const res = await apiFetch(`/api/composio/status?toolkit=${toolkit}`, token)
      const data = await res.json()
      if (data.connected) {
        if (toolkit === 'facebook') { setFbStatus('connected'); setFbAccountName(data.accountName || null) }
        else { setIgStatus('connected'); setIgAccountName(data.accountName || null) }
        toast.success(`${toolkit === 'facebook' ? 'Facebook' : 'Instagram'} está conectado${data.accountName ? ` (${data.accountName})` : ''}`)

        // Also try to sync immediately after detecting connection
        try {
          await apiFetch('/api/composio/messages', token, {
            method: 'POST',
            body: JSON.stringify({ channel: toolkit === 'facebook' ? 'messenger' : 'instagram', action: 'sync' }),
          })
        } catch { /* silent */ }
      } else {
        if (toolkit === 'facebook') { setFbStatus('disconnected'); setFbAccountName(null) }
        else { setIgStatus('disconnected'); setIgAccountName(null) }
        toast.info(`${toolkit === 'facebook' ? 'Facebook' : 'Instagram'} no está conectado`)
      }
    } catch {
      toast.error('Error al verificar estado')
    } finally {
      setVerifying(null)
    }
  }

  const handleSync = async (channel: 'messenger' | 'instagram') => {
    setSyncing(channel)
    setSyncResult(null)
    try {
      const res = await apiFetch('/api/composio/messages', token, {
        method: 'POST',
        body: JSON.stringify({ channel, action: 'sync' }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
      } else if (data.newMessages !== undefined) {
        setSyncResult({ channel, newMessages: data.newMessages })
        toast.success(`${data.newMessages} mensajes nuevos sincronizados de ${channel === 'messenger' ? 'Facebook' : 'Instagram'}`)
      } else {
        toast.info(data.message || 'Sincronización completada')
      }
    } catch {
      toast.error('Error al sincronizar mensajes')
    } finally {
      setSyncing(null)
    }
  }

  const composioIntegrations = [
    {
      id: 'facebook',
      name: 'Facebook Messenger',
      description: 'Conecta tu Página de Facebook para recibir y enviar mensajes.',
      icon: <MessageCircle className="w-5 h-5" />,
      color: 'bg-blue-50 text-blue-500',
      status: fbStatus,
      accountName: fbAccountName,
      toolkit: 'facebook' as const,
      channel: 'messenger' as const,
    },
    {
      id: 'instagram',
      name: 'Instagram DM',
      description: 'Conecta tu cuenta de Instagram para gestionar DMs.',
      icon: <Hash className="w-5 h-5" />,
      color: 'bg-pink-50 text-pink-500',
      status: igStatus,
      accountName: igAccountName,
      toolkit: 'instagram' as const,
      channel: 'instagram' as const,
    },
  ]

  const otherIntegrations = [
    { id: 'whatsapp', name: 'WhatsApp Business', description: 'Conecta tu WhatsApp Business API.', icon: <MessageSquare className="w-5 h-5" />, color: 'bg-green-50 text-green-500' },
    { id: 'resend', name: 'Email (Resend)', description: 'Envía emails transaccionales y campañas.', icon: <Mail className="w-5 h-5" />, color: 'bg-sky-50 text-sky-500' },
    { id: 'elevenlabs', name: 'Sofía Voice (ElevenLabs)', description: 'Agente de voz IA para atención telefónica.', icon: <Mic className="w-5 h-5" />, color: 'bg-violet-50 text-violet-500' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Integraciones</h2>
        <Button variant="outline" size="sm" className="gap-1 h-7 text-[10px]" onClick={checkStatus} disabled={fbStatus === 'loading' && igStatus === 'loading'}>
          <RefreshCw className={`w-3 h-3 ${fbStatus === 'loading' || igStatus === 'loading' ? 'animate-spin' : ''}`} /> Verificar estado
        </Button>
      </div>

      {/* Composio-powered integrations */}
      <div>
        <h3 className="text-[10px] font-medium text-gray-400 mb-2 uppercase tracking-wider">Mensajería vía Composio</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {composioIntegrations.map(int => (
            <Card key={int.id} className="shadow-none border-gray-100">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-9 h-9 rounded-xl ${int.color} flex items-center justify-center`}>
                      {int.icon}
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-gray-800">{int.name}</h3>
                      {int.status === 'loading' ? (
                        <Badge variant="outline" className="text-[9px] h-4"><Loader2 className="w-2.5 h-2.5 animate-spin mr-0.5" />Verificando...</Badge>
                      ) : int.status === 'connected' ? (
                        <Badge className="text-[9px] h-4 bg-green-50 text-green-600 border-green-200"><Check className="w-2.5 h-2.5 mr-0.5" />Conectado</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] h-4 text-gray-400">Desconectado</Badge>
                      )}
                    </div>
                  </div>
                  {/* Verificar button */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-gray-300 hover:text-[#0066FF]"
                          onClick={() => handleVerify(int.toolkit)}
                          disabled={!!verifying}
                        >
                          {verifying === int.toolkit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Verificar conexión</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {int.accountName && int.status === 'connected' && (
                  <p className="text-[10px] text-gray-400 mb-2">Cuenta: {int.accountName}</p>
                )}
                <p className="text-[10px] text-gray-400 mb-3">{int.description}</p>
                <div className="space-y-1.5">
                  {int.status === 'connected' ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-1.5 h-7 text-[10px]"
                        onClick={() => handleSync(int.channel)}
                        disabled={!!syncing}
                      >
                        {syncing === int.channel ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Sincronizar mensajes
                      </Button>
                      {syncResult && syncResult.channel === int.channel && (
                        <p className="text-[10px] text-center text-gray-400">
                          {syncResult.newMessages > 0
                            ? `${syncResult.newMessages} mensajes nuevos`
                            : 'No hay mensajes nuevos'}
                        </p>
                      )}
                    </>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full bg-[#0066FF] hover:bg-[#0052CC] gap-1.5 h-7 text-[10px]"
                      onClick={() => handleConnect(int.toolkit)}
                      disabled={!!connecting}
                    >
                      {connecting === int.toolkit ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> Conectando...</>
                      ) : (
                        <><ExternalLink className="w-3 h-3" /> Conectar {int.name}</>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Coming soon */}
      <div>
        <h3 className="text-[10px] font-medium text-gray-400 mb-2 uppercase tracking-wider">Próximamente</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {otherIntegrations.map(int => (
            <Card key={int.id} className="opacity-60 shadow-none border-gray-100">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-9 h-9 rounded-xl ${int.color} flex items-center justify-center`}>
                    {int.icon}
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-gray-700">{int.name}</h3>
                    <Badge variant="outline" className="text-[9px] h-4 text-amber-500 border-amber-200">Próximamente</Badge>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mb-3">{int.description}</p>
                <Button size="sm" variant="outline" className="w-full h-7 text-[10px]" disabled>
                  No disponible aún
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   9. AJUSTES SECTION (Settings)
   ═══════════════════════════════════════════════════════════════ */

function AjustesSection({ token }: { token: string }) {
  const [settings, setSettings] = useState<{
    workspaceId?: string
    name?: string
    plan?: string
    metaMensual?: { meta: number; periodo: string }
  }>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [meta, setMeta] = useState('0')
  const [periodo, setPeriodo] = useState('')

  useEffect(() => {
    apiFetch('/api/crm/settings', token)
      .then(r => r.json())
      .then(data => {
        setSettings(data)
        setMeta(String(data.metaMensual?.meta || 0))
        setPeriodo(data.metaMensual?.periodo || '')
      })
      .catch(() => toast.error('Error al cargar ajustes'))
      .finally(() => setLoading(false))
  }, [token])

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/crm/settings', token, {
        method: 'PUT',
        body: JSON.stringify({
          metaMensual: { meta: parseFloat(meta) || 0, periodo },
        }),
      })
      toast.success('Ajustes guardados')
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#0066FF]" /></div>

  return (
    <div className="space-y-4 max-w-xl">
      <h2 className="text-sm font-semibold text-gray-800">Ajustes</h2>

      <Card className="shadow-none border-gray-100">
        <CardHeader className="pb-1 px-4 pt-4">
          <CardTitle className="text-xs">Workspace</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2 text-xs">
          <div className="flex justify-between"><span className="text-gray-400">Nombre:</span><span className="font-medium">{settings.name || '—'}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Plan:</span><Badge variant="outline" className="capitalize text-[10px] h-4">{(settings.plan || '').replace('_', ' ')}</Badge></div>
        </CardContent>
      </Card>

      <Card className="shadow-none border-gray-100">
        <CardHeader className="pb-1 px-4 pt-4">
          <CardTitle className="text-xs">Meta mensual</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div>
            <Label className="text-[10px]">Meta (CLP)</Label>
            <Input type="number" className="h-8 text-xs" value={meta} onChange={e => setMeta(e.target.value)} placeholder="5000000" />
          </div>
          <div>
            <Label className="text-[10px]">Período</Label>
            <Input type="month" className="h-8 text-xs" value={periodo} onChange={e => setPeriodo(e.target.value)} />
          </div>
          <Button className="bg-[#0066FF] hover:bg-[#0052CC] h-8 text-xs" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 mr-1" />}
            Guardar ajustes
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-none border-gray-100">
        <CardHeader className="pb-1 px-4 pt-4">
          <CardTitle className="text-xs text-red-500">Zona de peligro</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-[10px] text-gray-400 mb-2">Cerrar sesión en todas partes</p>
          <Button
            variant="outline"
            className="text-red-500 border-red-100 hover:bg-red-50 h-7 text-[10px]"
            onClick={() => {
              localStorage.removeItem('digiactiva_token')
              window.location.reload()
            }}
          >
            Cerrar sesión
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
