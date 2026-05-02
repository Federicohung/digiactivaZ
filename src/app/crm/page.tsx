'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Home, LayoutGrid, Users, MessageCircle, Inbox, Bot, Building2,
  Puzzle, Settings, LogOut, Menu, X, ChevronDown, ChevronRight,
  Plus, Search, Filter, MoreVertical, Phone, Mail, Calendar,
  TrendingUp, DollarSign, Target, Flame, ArrowRight, Send,
  Sparkles, FileText, Clock, Bot as BotIcon, RefreshCw, Eye,
  Edit2, Trash2, MessageSquare, ExternalLink, Loader2, Check,
  AlertCircle, Star, Hash, Globe, Mic, ChevronLeft
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCorners
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
  nuevo: 'bg-blue-100 text-blue-700 border-blue-200',
  contactado: 'bg-amber-100 text-amber-700 border-amber-200',
  calificado: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  propuesta: 'bg-purple-100 text-purple-700 border-purple-200',
  negociacion: 'bg-orange-100 text-orange-700 border-orange-200',
  cerrado: 'bg-green-100 text-green-700 border-green-200',
}

const ETAPA_DOT_COLORS: Record<string, string> = {
  nuevo: 'bg-blue-500',
  contactado: 'bg-amber-500',
  calificado: 'bg-emerald-500',
  propuesta: 'bg-purple-500',
  negociacion: 'bg-orange-500',
  cerrado: 'bg-green-500',
}

const ETAPA_BAR_COLORS: Record<string, string> = {
  nuevo: '#3b82f6',
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

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  web_chat: <Globe className="w-3.5 h-3.5" />,
  whatsapp: <MessageSquare className="w-3.5 h-3.5" />,
  messenger: <MessageCircle className="w-3.5 h-3.5" />,
  instagram: <Hash className="w-3.5 h-3.5" />,
  external: <ExternalLink className="w-3.5 h-3.5" />,
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
  const [activeSection, setActiveSection] = useState<Section>('hoy')
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
        <Loader2 className="w-8 h-8 animate-spin text-[#0066FF]" />
      </div>
    )
  }

  if (!token || !user) {
    return <LoginScreen onLogin={handleLogin} />
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-white border-r border-gray-200 fixed inset-y-0 z-30">
        <SidebarContent
          activeSection={activeSection}
          onSectionChange={(s) => { setActiveSection(s); setSidebarOpen(false) }}
          user={user}
          onLogout={handleLogout}
        />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="p-0 w-64">
          <SidebarContent
            activeSection={activeSection}
            onSectionChange={(s) => { setActiveSection(s); setSidebarOpen(false) }}
            user={user}
            onLogout={handleLogout}
          />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 lg:ml-64">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 lg:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-semibold text-gray-900">
              {NAV_ITEMS.find(n => n.key === activeSection)?.label}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 hidden sm:block">{user.email}</span>
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-[#0066FF] text-white text-xs">
                {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Section Content */}
        <main className="p-4 lg:p-6">
          {activeSection === 'hoy' && <HoySection token={token} onNavigate={setActiveSection} />}
          {activeSection === 'pipeline' && <PipelineSection token={token} />}
          {activeSection === 'contactos' && <ContactosSection token={token} />}
          {activeSection === 'conversaciones' && <ConversacionesSection token={token} />}
          {activeSection === 'bandeja' && <BandejaSection token={token} />}
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
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex items-center justify-center">
            <div className="w-12 h-12 rounded-xl bg-[#0066FF] flex items-center justify-center">
              <BotIcon className="w-7 h-7 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">DigiActiva</CardTitle>
          <p className="text-sm text-gray-500 mt-1">Inicia sesión en tu CRM</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <Button type="submit" className="w-full bg-[#0066FF] hover:bg-[#0052CC]" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Iniciar sesión
            </Button>
          </form>
          <div className="mt-6 text-center">
            <a href="/" className="text-sm text-[#0066FF] hover:underline">
              ← Volver al inicio
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   SIDEBAR
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
      <div className="px-4 h-14 flex items-center border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0066FF] flex items-center justify-center">
            <BotIcon className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg text-gray-900">DigiActiva</span>
        </div>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(item => (
          <button
            key={item.key}
            onClick={() => onSectionChange(item.key)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeSection === item.key
                ? 'bg-[#0066FF]/10 text-[#0066FF]'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <item.icon className="w-5 h-5 shrink-0" />
            {item.label}
          </button>
        ))}
      </nav>

      {/* User Section */}
      <div className="p-3 border-t border-gray-200 shrink-0">
        <div className="flex items-center gap-3 px-3 py-2">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-[#0066FF] text-white text-xs">
              {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-500" onClick={onLogout}>
                  <LogOut className="w-4 h-4" />
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

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#0066FF]" /></div>

  if (!metrics) return <div className="text-center py-12 text-gray-500">No se pudieron cargar las métricas</div>

  const chartData = ETAPAS.map(e => ({
    name: ETAPA_LABELS[e],
    cantidad: metrics.byEtapa[e] || 0,
    fill: ETAPA_BAR_COLORS[e],
  }))

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total contactos</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.totalContacts}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">En pipeline</p>
                <p className="text-2xl font-bold text-gray-900">
                  {Object.values(metrics.byEtapa).reduce((a, b) => a + b, 0) - (metrics.byEtapa.cerrado || 0)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                <LayoutGrid className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Valor mensual</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(metrics.totalValorMensual)}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Leads calientes</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.hotLeads.length}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                <Flame className="w-5 h-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Distribución del pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <RechartsTooltip />
                  <Bar dataKey="cantidad" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Acciones rápidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-start gap-2 bg-[#0066FF] hover:bg-[#0052CC]" onClick={() => onNavigate('pipeline')}>
              <Plus className="w-4 h-4" /> Nuevo lead
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => onNavigate('pipeline')}>
              <LayoutGrid className="w-4 h-4" /> Ver pipeline
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => onNavigate('contactos')}>
              <Users className="w-4 h-4" /> Ver contactos
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => onNavigate('bandeja')}>
              <Inbox className="w-4 h-4" /> Bandeja de entrada
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Hot Leads */}
      {metrics.hotLeads.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" /> Leads calientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {metrics.hotLeads.slice(0, 5).map(lead => (
                <div key={lead.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-gray-200 text-gray-600 text-xs">
                        {lead.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{lead.nombre}</p>
                      <p className="text-xs text-gray-500">{lead.empresa || 'Sin empresa'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={ETAPA_COLORS[lead.etapa] || 'bg-gray-100 text-gray-700'}>
                      {ETAPA_LABELS[lead.etapa] || lead.etapa}
                    </Badge>
                    <span className={`text-sm font-semibold ${getScoreColor(lead.scoreIa)}`}>
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
   2. PIPELINE SECTION (Kanban)
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
    const targetEtapa = over.id as string

    // Find the contact
    let contact: Contact | null = null
    for (const etapa of ETAPAS) {
      const found = pipeline[etapa]?.find(c => c.id === contactId)
      if (found) { contact = found; break }
    }
    if (!contact || contact.etapa === targetEtapa) return

    // Optimistic update
    setPipeline(prev => {
      const next = { ...prev }
      for (const e of ETAPAS) {
        next[e] = next[e].filter(c => c.id !== contactId)
      }
      next[targetEtapa] = [...(next[targetEtapa] || []), { ...contact, etapa: targetEtapa }]
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

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#0066FF]" /></div>

  const activeContact = activeId
    ? ETAPAS.flatMap(e => pipeline[e] || []).find(c => c.id === activeId)
    : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Pipeline de ventas</h2>
        <Button className="gap-2 bg-[#0066FF] hover:bg-[#0052CC]" onClick={() => setShowNewLead(true)}>
          <Plus className="w-4 h-4" /> Nuevo lead
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '70vh' }}>
          {ETAPAS.map(etapa => (
            <div
              key={etapa}
              id={etapa}
              className="flex-shrink-0 w-72 bg-gray-100 rounded-xl p-3"
            >
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className={`w-2.5 h-2.5 rounded-full ${ETAPA_DOT_COLORS[etapa]}`} />
                <h3 className="text-sm font-semibold text-gray-700">{ETAPA_LABELS[etapa]}</h3>
                <Badge variant="secondary" className="ml-auto text-xs">{pipeline[etapa]?.length || 0}</Badge>
              </div>
              <div className="space-y-2 min-h-[200px]">
                {pipeline[etapa]?.map(contact => (
                  <div
                    key={contact.id}
                    className="bg-white rounded-lg p-3 shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                    onClick={() => setSelectedContact(contact)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-sm font-medium text-gray-900">{contact.nombre}</p>
                      {contact.scoreIa > 0 && (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${getScoreBg(contact.scoreIa)} ${getScoreColor(contact.scoreIa)}`}>
                          {contact.scoreIa}
                        </span>
                      )}
                    </div>
                    {contact.empresa && (
                      <p className="text-xs text-gray-500 mb-2">{contact.empresa}</p>
                    )}
                    <div className="flex items-center justify-between">
                      {contact.valorMensual > 0 && (
                        <span className="text-xs font-medium text-emerald-600">{formatCurrency(contact.valorMensual)}</span>
                      )}
                      <span className="text-xs text-gray-400">{FUENTE_LABELS[contact.fuente] || contact.fuente}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <DragOverlay>
          {activeContact ? (
            <div className="bg-white rounded-lg p-3 shadow-lg border border-gray-200 w-72 rotate-2">
              <p className="text-sm font-medium text-gray-900">{activeContact.nombre}</p>
              {activeContact.empresa && <p className="text-xs text-gray-500">{activeContact.empresa}</p>}
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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg">{contact.nombre}</DialogTitle>
            <Badge className={ETAPA_COLORS[contact.etapa]}>{ETAPA_LABELS[contact.etapa]}</Badge>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="shrink-0">
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="conversations">Conversaciones</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="flex-1 overflow-y-auto mt-4 space-y-4">
            {/* Contact Info */}
            {editing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Nombre</Label><Input value={editData.nombre || ''} onChange={e => setEditData(p => ({ ...p, nombre: e.target.value }))} /></div>
                  <div><Label className="text-xs">Empresa</Label><Input value={editData.empresa || ''} onChange={e => setEditData(p => ({ ...p, empresa: e.target.value }))} /></div>
                  <div><Label className="text-xs">Email</Label><Input value={editData.email || ''} onChange={e => setEditData(p => ({ ...p, email: e.target.value }))} /></div>
                  <div><Label className="text-xs">Teléfono</Label><Input value={editData.telefono || ''} onChange={e => setEditData(p => ({ ...p, telefono: e.target.value }))} /></div>
                </div>
                <div><Label className="text-xs">Notas</Label><Textarea value={editData.notas || ''} onChange={e => setEditData(p => ({ ...p, notas: e.target.value }))} rows={3} /></div>
                <div className="flex gap-2">
                  <Button size="sm" className="bg-[#0066FF] hover:bg-[#0052CC]" onClick={saveEdit}>Guardar</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500">Empresa:</span> <span className="font-medium">{contact.empresa || '—'}</span></div>
                  <div><span className="text-gray-500">Email:</span> <span className="font-medium">{contact.email || '—'}</span></div>
                  <div><span className="text-gray-500">Teléfono:</span> <span className="font-medium">{contact.telefono || '—'}</span></div>
                  <div><span className="text-gray-500">Fuente:</span> <span className="font-medium">{FUENTE_LABELS[contact.fuente]}</span></div>
                  <div><span className="text-gray-500">Valor:</span> <span className="font-medium text-emerald-600">{formatCurrency(contact.valorMensual)}</span></div>
                  <div><span className="text-gray-500">Score IA:</span> <span className={`font-bold ${getScoreColor(contact.scoreIa)}`}>{contact.scoreIa}</span></div>
                </div>
                {contact.notas && (
                  <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-700">{contact.notas}</div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Edit2 className="w-3 h-3 mr-1" /> Editar</Button>
                  <Button size="sm" variant="outline" onClick={generateSummary} disabled={summaryLoading}>
                    {summaryLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />} Resumen IA
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => generateContent('email')}><Mail className="w-3 h-3 mr-1" /> Email</Button>
                  <Button size="sm" variant="outline" onClick={() => generateContent('whatsapp_message')}><MessageSquare className="w-3 h-3 mr-1" /> WhatsApp</Button>
                </div>
              </div>
            )}

            {/* AI Summary */}
            {aiSummary && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">Resumen IA</span>
                </div>
                <p className="text-sm text-blue-800 whitespace-pre-wrap">{aiSummary}</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="timeline" className="flex-1 overflow-y-auto mt-4">
            {timeline.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">Sin eventos de timeline</p>
            ) : (
              <div className="space-y-3">
                {timeline.map(event => (
                  <div key={event.id} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                      {event.tipo === 'nota' && <FileText className="w-4 h-4 text-gray-500" />}
                      {event.tipo === 'mensaje' && <MessageCircle className="w-4 h-4 text-blue-500" />}
                      {event.tipo === 'etapa_cambiada' && <TrendingUp className="w-4 h-4 text-purple-500" />}
                      {event.tipo === 'ai_summary' && <Sparkles className="w-4 h-4 text-amber-500" />}
                      {!['nota', 'mensaje', 'etapa_cambiada', 'ai_summary'].includes(event.tipo) && <Clock className="w-4 h-4 text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{event.descripcion}</p>
                      <p className="text-xs text-gray-400 mt-1">{formatDate(event.createdAt)} {formatTime(event.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="conversations" className="flex-1 overflow-y-auto mt-4">
            {messages.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">Sin mensajes</p>
            ) : (
              <div className="space-y-2">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[80%] rounded-lg p-3 text-sm ${
                      msg.direction === 'inbound'
                        ? 'bg-gray-100 text-gray-900'
                        : 'bg-[#0066FF] text-white'
                    }`}>
                      <p>{msg.content}</p>
                      <p className={`text-xs mt-1 ${msg.direction === 'inbound' ? 'text-gray-400' : 'text-blue-200'}`}>
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo lead</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><Label>Nombre *</Label><Input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Empresa</Label><Input value={form.empresa} onChange={e => setForm(p => ({ ...p, empresa: e.target.value }))} /></div>
            <div><Label>Valor mensual</Label><Input type="number" value={form.valorMensual} onChange={e => setForm(p => ({ ...p, valorMensual: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div><Label>Teléfono</Label><Input value={form.telefono} onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))} /></div>
          </div>
          <div>
            <Label>Etapa</Label>
            <Select value={form.etapa} onValueChange={v => setForm(p => ({ ...p, etapa: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ETAPAS.map(e => (
                  <SelectItem key={e} value={e}>{ETAPA_LABELS[e]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="submit" className="bg-[#0066FF] hover:bg-[#0052CC]">Crear lead</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════════════════════════════════════════════════════
   3. CONTACTOS SECTION
   ═══════════════════════════════════════════════════════════════ */

function ContactosSection({ token }: { token: string }) {
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

  return (
    <div className="space-y-4">
      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar contactos..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
              className="pl-9"
            />
          </div>
          <Select value={filterEtapa} onValueChange={v => { setFilterEtapa(v); setPage(0) }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Etapa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {ETAPAS.map(e => <SelectItem key={e} value={e}>{ETAPA_LABELS[e]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterFuente} onValueChange={v => { setFilterFuente(v); setPage(0) }}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Fuente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Object.entries(FUENTE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button className="gap-2 bg-[#0066FF] hover:bg-[#0052CC] shrink-0" onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4" /> Nuevo contacto
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#0066FF]" /></div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No se encontraron contactos</div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Nombre</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Empresa</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 hidden lg:table-cell">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 hidden lg:table-cell">Teléfono</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Etapa</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Valor</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Score</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 hidden xl:table-cell">Fecha</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(c => (
                    <tr
                      key={c.id}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setSelectedContact(c)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="w-7 h-7">
                            <AvatarFallback className="bg-gray-100 text-gray-600 text-xs">
                              {c.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-gray-900">{c.nombre}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{c.empresa || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{c.email || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{c.telefono || '—'}</td>
                      <td className="px-4 py-3"><Badge className={ETAPA_COLORS[c.etapa]}>{ETAPA_LABELS[c.etapa]}</Badge></td>
                      <td className="px-4 py-3 text-right text-gray-600 hidden md:table-cell">{c.valorMensual > 0 ? formatCurrency(c.valorMensual) : '—'}</td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        <span className={`text-xs font-bold ${getScoreColor(c.scoreIa)}`}>{c.scoreIa || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 hidden xl:table-cell">{formatDate(c.createdAt)}</td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-3.5 h-3.5" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={e => { e.stopPropagation(); setSelectedContact(c) }}><Eye className="w-3.5 h-3.5 mr-2" /> Ver detalle</DropdownMenuItem>
                            <DropdownMenuItem onClick={e => { e.stopPropagation(); handleDelete(c.id) }} className="text-red-600"><Trash2 className="w-3.5 h-3.5 mr-2" /> Eliminar</DropdownMenuItem>
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
              <span className="text-sm text-gray-500">{contacts.length} contactos</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-gray-600">{page + 1} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
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

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#0066FF]" /></div>

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Sesiones de chat</h2>

      {sessions.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No hay sesiones de chat</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Session List */}
          <div className="lg:col-span-1 space-y-2">
            {sessions.map(session => (
              <div
                key={session.id}
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  selectedSession?.id === session.id ? 'border-[#0066FF] bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
                onClick={() => setSelectedSession(session)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    {session.contact?.nombre || 'Visitante anónimo'}
                  </span>
                  <Badge variant={session.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                    {session.status === 'active' ? 'Activo' : 'Cerrado'}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500">
                  {session.source === 'web_chat' ? '🌐 Web' : '💬 WhatsApp'} · {formatRelativeTime(session.updatedAt)}
                </p>
                {session.messages.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1 truncate">
                    {session.messages[session.messages.length - 1]?.content}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Message Detail */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 min-h-[500px] flex flex-col">
            {selectedSession ? (
              <>
                <div className="p-4 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-gray-200 text-gray-600 text-xs">
                        {(selectedSession.contact?.nombre || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{selectedSession.contact?.nombre || 'Visitante anónimo'}</p>
                      <p className="text-xs text-gray-500">{selectedSession.source === 'web_chat' ? 'Web Chat' : 'WhatsApp'}</p>
                    </div>
                  </div>
                </div>
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-3">
                    {selectedSession.messages.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[80%] rounded-lg p-3 text-sm ${
                          msg.role === 'user' ? 'bg-gray-100 text-gray-900' : 'bg-[#0066FF] text-white'
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <p>Selecciona una sesión</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   5. BANDEJA SECTION (Inbox)
   ═══════════════════════════════════════════════════════════════ */

function BandejaSection({ token }: { token: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [sendText, setSendText] = useState('')
  const [loading, setLoading] = useState(true)
  const [convRefresh, setConvRefresh] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fetchConversations = useCallback(() => setConvRefresh(k => k + 1), [])

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/inbox/conversations', token)
      .then(r => r.json())
      .then(data => { if (!cancelled && data.conversations) setConversations(data.conversations) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token, convRefresh])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    apiFetch(`/api/inbox/conversations/${selectedId}/messages`, token)
      .then(r => r.json())
      .then(data => { if (!cancelled && data.messages) setMessages(data.messages) })
      .catch(() => {})

    // Mark as read
    apiFetch(`/api/inbox/conversations/${selectedId}/read`, token, { method: 'POST' })
      .then(() => fetchConversations())
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedId, token, convRefresh])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!sendText.trim() || !selectedId) return
    const text = sendText.trim()
    setSendText('')
    try {
      await apiFetch(`/api/inbox/conversations/${selectedId}/send`, token, {
        method: 'POST',
        body: JSON.stringify({ content: text }),
      })
      // Re-fetch messages
      const res = await apiFetch(`/api/inbox/conversations/${selectedId}/messages`, token)
      const data = await res.json()
      if (data.messages) setMessages(data.messages)
      fetchConversations()
    } catch {
      toast.error('Error al enviar mensaje')
    }
  }

  const selectedConvo = conversations.find(c => c.id === selectedId)

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#0066FF]" /></div>

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 bg-white rounded-xl border border-gray-200 overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
      {/* Conversation List */}
      <div className="lg:col-span-4 border-r border-gray-200 overflow-y-auto">
        <div className="p-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Conversaciones</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {conversations.length === 0 ? (
            <p className="text-center py-8 text-sm text-gray-500">Sin conversaciones</p>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`p-3 cursor-pointer transition-colors ${
                  selectedId === conv.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
                onClick={() => setSelectedId(conv.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="w-9 h-9">
                      <AvatarFallback className="bg-gray-200 text-gray-600 text-xs">
                        {conv.contact.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#0066FF] text-white text-[10px] flex items-center justify-center font-bold">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900 truncate">{conv.contact.nombre}</span>
                      <span className="text-xs text-gray-400">{formatRelativeTime(conv.lastMessageAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">{CHANNEL_ICONS[conv.channel]}</span>
                      <p className="text-xs text-gray-500 truncate">{conv.lastMessagePreview || 'Sin mensajes'}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="lg:col-span-5 flex flex-col">
        {selectedId ? (
          <>
            <div className="p-3 border-b border-gray-100 flex items-center gap-3">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-gray-200 text-gray-600 text-xs">
                  {selectedConvo?.contact.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium text-gray-900">{selectedConvo?.contact.nombre}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  {CHANNEL_ICONS[selectedConvo?.channel || 'web_chat']}
                  {selectedConvo?.channel === 'whatsapp' ? 'WhatsApp' : selectedConvo?.channel === 'messenger' ? 'Messenger' : 'Web Chat'}
                </p>
              </div>
            </div>
            <ScrollArea className="flex-1 p-4">
              {messages.length === 0 && selectedId ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#0066FF]" /></div>
              ) : (
                <div className="space-y-3">
                  {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[80%] rounded-lg p-3 text-sm ${
                        msg.direction === 'inbound' ? 'bg-gray-100 text-gray-900' : 'bg-[#0066FF] text-white'
                      }`}>
                        <p>{msg.content}</p>
                        <p className={`text-xs mt-1 ${msg.direction === 'inbound' ? 'text-gray-400' : 'text-blue-200'}`}>
                          {formatTime(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>
            <div className="p-3 border-t border-gray-100">
              <div className="flex gap-2">
                <Input
                  placeholder="Escribe un mensaje..."
                  value={sendText}
                  onChange={e => setSendText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                />
                <Button size="icon" className="bg-[#0066FF] hover:bg-[#0052CC] shrink-0" onClick={sendMessage}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <p>Selecciona una conversación</p>
          </div>
        )}
      </div>

      {/* Contact Detail Sidebar */}
      <div className="lg:col-span-3 border-l border-gray-200 p-4 overflow-y-auto hidden lg:block">
        {selectedConvo ? (
          <div className="space-y-4">
            <div className="text-center">
              <Avatar className="w-16 h-16 mx-auto">
                <AvatarFallback className="bg-gray-200 text-gray-600 text-lg">
                  {selectedConvo.contact.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <h3 className="mt-2 text-sm font-semibold text-gray-900">{selectedConvo.contact.nombre}</h3>
              <p className="text-xs text-gray-500">{selectedConvo.contact.empresa || 'Sin empresa'}</p>
            </div>
            <Separator />
            <div className="space-y-3 text-sm">
              {selectedConvo.contact.email && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Mail className="w-4 h-4 text-gray-400" /> {selectedConvo.contact.email}
                </div>
              )}
              {selectedConvo.contact.telefono && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone className="w-4 h-4 text-gray-400" /> {selectedConvo.contact.telefono}
                </div>
              )}
              {selectedConvo.contact.etapa && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-xs">Etapa:</span>
                  <Badge className={ETAPA_COLORS[selectedConvo.contact.etapa]}>{ETAPA_LABELS[selectedConvo.contact.etapa]}</Badge>
                </div>
              )}
            </div>
            <Separator />
            <div className="space-y-2 text-xs text-gray-500">
              <p>Canal: <span className="text-gray-700">{selectedConvo.channel}</span></p>
              <p>Estado: <span className="text-gray-700">{selectedConvo.status === 'open' ? 'Abierta' : 'Cerrada'}</span></p>
              <p>Creada: <span className="text-gray-700">{formatDate(selectedConvo.createdAt)}</span></p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            <p>Sin detalle</p>
          </div>
        )}
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

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#0066FF]" /></div>

  const channelPrompts = config[activeChannel] || {}

  const promptFields = [
    { key: 'greeting', label: 'Saludo', icon: <MessageCircle className="w-4 h-4" /> },
    { key: 'qualification', label: 'Calificación', icon: <Target className="w-4 h-4" /> },
    { key: 'scheduling', label: 'Agendamiento', icon: <Calendar className="w-4 h-4" /> },
    { key: 'fallback', label: 'Fallback', icon: <AlertCircle className="w-4 h-4" /> },
    { key: 'closing', label: 'Cierre', icon: <Check className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Configuración del Agente IA</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReset}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Restaurar</Button>
          <Button size="sm" className="bg-[#0066FF] hover:bg-[#0052CC]" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />} Guardar
          </Button>
        </div>
      </div>

      <Tabs value={activeChannel} onValueChange={setActiveChannel}>
        <TabsList>
          <TabsTrigger value="web_chat" className="gap-2"><Globe className="w-4 h-4" /> Web Chat</TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-2"><MessageSquare className="w-4 h-4" /> WhatsApp</TabsTrigger>
          <TabsTrigger value="voice" className="gap-2"><Mic className="w-4 h-4" /> Voz</TabsTrigger>
        </TabsList>

        {['web_chat', 'whatsapp', 'voice'].map(channel => (
          <TabsContent key={channel} value={channel} className="space-y-4 mt-4">
            {promptFields.map(field => (
              <Card key={field.key}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-gray-400">{field.icon}</span>
                    <Label className="text-sm font-medium">{field.label}</Label>
                  </div>
                  <Textarea
                    value={channelPrompts[field.key] || ''}
                    onChange={e => updatePrompt(field.key, e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                </CardContent>
              </Card>
            ))}

            <Card>
              <CardContent className="p-4">
                <Label className="text-sm font-medium mb-2 block">Prompt estructurado (avanzado)</Label>
                <Textarea
                  value={channelPrompts.estructurado || ''}
                  onChange={e => updatePrompt('estructurado', e.target.value)}
                  rows={6}
                  placeholder="Prompt personalizado completo para el agente..."
                  className="font-mono text-xs"
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
        // Refresh list
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

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#0066FF]" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Workspaces</h2>
        {user.role === 'founder_admin' && (
          <Button className="gap-2 bg-[#0066FF] hover:bg-[#0052CC]" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> Crear workspace
          </Button>
        )}
      </div>

      {workspaces.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No hay workspaces</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map(ws => (
            <Card key={ws.id} className={ws.id === user.activeWorkspaceId ? 'border-[#0066FF] border-2' : ''}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{ws.name}</h3>
                    <p className="text-xs text-gray-500">{ws.slug}</p>
                  </div>
                  {ws.id === user.activeWorkspaceId && (
                    <Badge className="bg-[#0066FF] text-white">Activo</Badge>
                  )}
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center justify-between">
                    <span>Plan:</span>
                    <Badge variant="outline" className="capitalize">{ws.plan.replace('_', ' ')}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Rol:</span>
                    <span className="capitalize">{ws.role}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Creado:</span>
                    <span>{formatDate(ws.createdAt)}</span>
                  </div>
                </div>
                {ws.id !== user.activeWorkspaceId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-4"
                    onClick={() => switchWorkspace(ws.id)}
                    disabled={switching === ws.id}
                  >
                    {switching === ws.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
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
        <DialogContent>
          <DialogHeader><DialogTitle>Crear workspace</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nombre</Label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Mi negocio" /></div>
            <div>
              <Label>Plan</Label>
              <Select value={newPlan} onValueChange={setNewPlan}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button className="bg-[#0066FF] hover:bg-[#0052CC]" onClick={createWorkspace}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   8. INTEGRACIONES SECTION
   ═══════════════════════════════════════════════════════════════ */

function IntegracionesSection({ token }: { token: string }) {
  const [fbStatus, setFbStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading')
  const [igStatus, setIgStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading')
  const [connecting, setConnecting] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<{ channel: string; newMessages: number } | null>(null)

  // Check connection status for Facebook and Instagram
  const checkStatus = useCallback(() => {
    apiFetch('/api/composio/status?toolkit=facebook', token)
      .then(r => r.json())
      .then(data => setFbStatus(data.connected ? 'connected' : 'disconnected'))
      .catch(() => setFbStatus('disconnected'))

    apiFetch('/api/composio/status?toolkit=instagram', token)
      .then(r => r.json())
      .then(data => setIgStatus(data.connected ? 'connected' : 'disconnected'))
      .catch(() => setIgStatus('disconnected'))
  }, [token])

  // Check status on mount and check URL params for callback results
  useEffect(() => {
    checkStatus()

    // Check if redirected back from OAuth callback
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('connected')
    const error = params.get('error')
    if (connected) {
      toast.success(`${connected === 'facebook' ? 'Facebook' : 'Instagram'} conectado exitosamente`)
      // Clean URL
      window.history.replaceState({}, '', '/crm')
      // Re-check status after a short delay
      setTimeout(checkStatus, 2000)
    }
    if (error) {
      toast.error(`Error al conectar: ${error}`)
      window.history.replaceState({}, '', '/crm')
    }
  }, [checkStatus])

  const handleConnect = async (toolkit: 'facebook' | 'instagram') => {
    setConnecting(toolkit)
    try {
      const res = await apiFetch('/api/composio/connect', token, {
        method: 'POST',
        body: JSON.stringify({ toolkit }),
      })
      const data = await res.json()

      if (data.authUrl) {
        // Open OAuth URL in a new tab/window
        window.open(data.authUrl, '_blank')
        toast.info(`Autoriza tu cuenta de ${toolkit === 'facebook' ? 'Facebook' : 'Instagram'} en la ventana que se abrió`)
        // Start polling for connection status
        let attempts = 0
        const poll = setInterval(() => {
          attempts++
          apiFetch(`/api/composio/status?toolkit=${toolkit}`, token)
            .then(r => r.json())
            .then(statusData => {
              if (statusData.connected) {
                clearInterval(poll)
                if (toolkit === 'facebook') setFbStatus('connected')
                else setIgStatus('connected')
                toast.success(`${toolkit === 'facebook' ? 'Facebook' : 'Instagram'} conectado`)
                setConnecting(null)
              }
            })
            .catch(() => {})
          if (attempts >= 30) {
            clearInterval(poll)
            setConnecting(null)
            toast.info('Tiempo de espera agotado. Verifica el estado manualmente.')
          }
        }, 3000)
      } else {
        toast.error(data.error || 'No se pudo generar la URL de conexión')
        setConnecting(null)
      }
    } catch {
      toast.error('Error al iniciar conexión')
      setConnecting(null)
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
      if (data.newMessages !== undefined) {
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
      description: 'Conecta tu Página de Facebook para recibir y enviar mensajes de Messenger directamente desde el CRM.',
      icon: <MessageCircle className="w-6 h-6" />,
      color: 'bg-blue-50 text-blue-600',
      status: fbStatus,
      toolkit: 'facebook' as const,
      channel: 'messenger' as const,
    },
    {
      id: 'instagram',
      name: 'Instagram DM',
      description: 'Conecta tu cuenta de Instagram para gestionar mensajes directos desde el CRM.',
      icon: <Hash className="w-6 h-6" />,
      color: 'bg-pink-50 text-pink-600',
      status: igStatus,
      toolkit: 'instagram' as const,
      channel: 'instagram' as const,
    },
  ]

  const otherIntegrations = [
    {
      id: 'whatsapp',
      name: 'WhatsApp Business',
      description: 'Conecta tu WhatsApp Business API para gestionar conversaciones desde el CRM.',
      icon: <MessageSquare className="w-6 h-6" />,
      color: 'bg-green-50 text-green-600',
      comingSoon: true,
    },
    {
      id: 'resend',
      name: 'Email (Resend)',
      description: 'Envía emails transaccionales y campañas desde tu CRM.',
      icon: <Mail className="w-6 h-6" />,
      color: 'bg-sky-50 text-sky-600',
      comingSoon: true,
    },
    {
      id: 'elevenlabs',
      name: 'Sofía Voice (ElevenLabs)',
      description: 'Agente de voz IA para atención telefónica automatizada.',
      icon: <Mic className="w-6 h-6" />,
      color: 'bg-violet-50 text-violet-600',
      comingSoon: true,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Integraciones</h2>
        <Button variant="outline" size="sm" className="gap-2" onClick={checkStatus}>
          <RefreshCw className="w-3.5 h-3.5" /> Verificar estado
        </Button>
      </div>

      {/* Composio-powered integrations (Facebook & Instagram) */}
      <div>
        <h3 className="text-sm font-medium text-gray-500 mb-3">Mensajería vía Composio</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {composioIntegrations.map(int => (
            <Card key={int.id}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${int.color} flex items-center justify-center`}>
                      {int.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{int.name}</h3>
                      {int.status === 'loading' ? (
                        <Badge variant="outline" className="text-xs"><Loader2 className="w-3 h-3 animate-spin mr-1" />Verificando...</Badge>
                      ) : int.status === 'connected' ? (
                        <Badge className="text-xs bg-green-100 text-green-700 border-green-200"><Check className="w-3 h-3 mr-1" />Conectado</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-gray-500">Desconectado</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mb-4">{int.description}</p>
                <div className="space-y-2">
                  {int.status === 'connected' ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => handleSync(int.channel)}
                        disabled={!!syncing}
                      >
                        {syncing === int.channel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Sincronizar mensajes
                      </Button>
                      {syncResult && syncResult.channel === int.channel && (
                        <p className="text-xs text-center text-gray-500">
                          {syncResult.newMessages > 0
                            ? `${syncResult.newMessages} mensajes nuevos sincronizados`
                            : 'No hay mensajes nuevos'}
                        </p>
                      )}
                    </>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full bg-[#0066FF] hover:bg-[#0052CC] gap-2"
                      onClick={() => handleConnect(int.toolkit)}
                      disabled={!!connecting}
                    >
                      {connecting === int.toolkit ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Conectando... Autoriza en la ventana emergente
                        </>
                      ) : (
                        <>
                          <ExternalLink className="w-3.5 h-3.5" />
                          Conectar {int.name}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Coming soon integrations */}
      <div>
        <h3 className="text-sm font-medium text-gray-500 mb-3">Próximamente</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {otherIntegrations.map(int => (
            <Card key={int.id} className="opacity-70">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl ${int.color} flex items-center justify-center`}>
                    {int.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{int.name}</h3>
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-200">Próximamente</Badge>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mb-4">{int.description}</p>
                <Button size="sm" variant="outline" className="w-full" disabled>
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

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#0066FF]" /></div>

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900">Ajustes</h2>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Workspace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Nombre:</span><span className="font-medium">{settings.name || '—'}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Plan:</span><Badge variant="outline" className="capitalize">{(settings.plan || '').replace('_', ' ')}</Badge></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Meta mensual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Meta (CLP)</Label>
            <Input
              type="number"
              value={meta}
              onChange={e => setMeta(e.target.value)}
              placeholder="5000000"
            />
          </div>
          <div>
            <Label>Período</Label>
            <Input
              type="month"
              value={periodo}
              onChange={e => setPeriodo(e.target.value)}
            />
          </div>
          <Button className="bg-[#0066FF] hover:bg-[#0052CC]" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
            Guardar ajustes
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-red-600">Zona de peligro</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-3">Cerrar sesión en todas partes</p>
          <Button
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50"
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
