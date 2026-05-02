# DigiActiva — Agentes IA, WhatsApp y CRM para negocios locales

Plataforma SaaS multi-tenant que combina agentes IA, WhatsApp Business, CRM y voz IA en un solo sistema comercial.

## 🚀 Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Database**: Prisma ORM + SQLite
- **UI**: Tailwind CSS 4 + shadcn/ui
- **Auth**: JWT (jose + bcryptjs)
- **AI**: z-ai-web-dev-sdk

## 📋 Funcionalidades

- 🤖 Chat IA público que atiende visitantes y califica leads
- 📱 WhatsApp Business conectado al CRM
- 📊 Pipeline Kanban con 6 etapas (drag & drop)
- 📥 Bandeja unificada (web + WhatsApp + messenger)
- 🧠 IA Copiloto (resumen, score, acciones sugeridas)
- 🎙️ Agente de voz IA (Sofía)
- 🏢 Multi-tenancy con workspaces y planes
- ⚙️ Agentes IA configurables por canal

## 🔐 Credenciales de demo

- **Email**: founder@digiactiva.com
- **Password**: digiactiva2025

## 🛠️ Desarrollo local

```bash
# Instalar dependencias
bun install

# Configurar base de datos
bun run db:push

# Seed con datos de demo
bun run src/lib/seed.ts

# Iniciar servidor
bun run dev
```

## 🌐 Despliegue en Vercel

1. Conecta este repositorio en [vercel.com](https://vercel.com)
2. Configura las variables de entorno necesarias
3. Click "Deploy" — ¡listo!

## 📁 Estructura

```
src/
├── app/
│   ├── page.tsx          # Landing page
│   ├── crm/page.tsx      # CRM Dashboard
│   ├── layout.tsx        # Root layout
│   └── api/              # API routes
│       ├── auth/         # Login, register, me
│       ├── crm/          # Contacts, pipeline, AI, settings
│       ├── chat/         # Public AI chat
│       ├── inbox/        # Unified inbox
│       └── workspaces/   # Multi-tenant
├── components/ui/        # shadcn/ui components
├── lib/
│   ├── auth.ts           # JWT + bcrypt helpers
│   ├── db.ts             # Prisma client
│   └── utils.ts          # Utilities
└── hooks/                # Custom hooks
```

## 📄 Licencia

Privado — DigiActiva © 2025
