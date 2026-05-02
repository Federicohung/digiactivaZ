# DIGIACTIVA — Multi-Tenant SaaS Platform PRD

## Original Problem Statement
Plataforma SaaS multi-tenant para DigiActiva: un único producto que gestiona múltiples clientes (workspaces), cada uno con sus propios datos, integraciones, agentes IA y módulos activables por plan. Producto comercial principal: "Agente WhatsApp + CRM" vendible en planes essential/premium/elite.

## URLs
- `/` Landing pública DigiActiva con chat IA (workspace default = DigiActiva)
- `/sofia` SOFIA voice agent
- `/admin` Legacy admin (deprecated)
- `/crm` ACTIVA Founder OS (multi-tenant) ← producto principal

## Architecture
```
/app/backend/
├── server.py        # FastAPI app + landing leads + admin legacy + startup seed
├── auth.py          # JWT bcrypt + users + roles + workspace context
├── workspaces.py    # Workspaces + plans + modules (feature flags) + integrations + agent prompts
├── crm.py           # CRM endpoints (todos filtran por workspace_id)
├── chat.py          # Chat público + admin chat-sessions
├── messaging.py     # Core unified messages (record_message + upsert_contact_from_signal)
├── whatsapp.py      # WhatsApp Cloud API webhooks + send + mock-receive
└── tests/
    ├── test_crm.py
    ├── test_auth_multitenant.py  (28 cases passing)
    └── test_sprint_b0_messaging.py (14 cases)

/app/frontend/src/
├── App.js           # Landing + ChatWidget
├── components/ChatWidget.jsx
├── SofiaPage.js
├── CRMPage.js       # Slim 355 LOC: auth + routing entre secciones
├── pages/crm/       # ← Refactor April 2026 (de 2499 → 355 LOC + 16 archivos)
│   ├── constants.js              (API, STAGES, SOURCES, INTEREST_STYLES, formatCurrency, getGreeting)
│   ├── FormFields.jsx            (FormField + FormSelect)
│   ├── Sidebar.jsx
│   ├── HoySection.jsx            (+ ActivityChip, MetricCard, AlertItem)
│   ├── PipelineSection.jsx
│   ├── ContactsSection.jsx
│   ├── WhatsAppComposer.jsx
│   ├── AISummaryBlock.jsx
│   ├── ContactDetailModal.jsx    (450 LOC, el más grande)
│   ├── NewLeadModal.jsx
│   ├── AgentConfigSection.jsx    (+ ConfigCard, ListEditor)
│   ├── ConversationsSection.jsx
│   ├── WorkspacesSection.jsx
│   ├── WhatsAppMockTester.jsx
│   ├── IntegrationsSection.jsx
│   └── SettingsSection.jsx
└── AdminPanel.js    # Legacy
```

## Core Concepts

### Roles
- `founder_admin`: ve y gestiona TODOS los workspaces (puede crear, cambiar plan, switch entre ws)
- `workspace_admin`: solo ve su workspace asignado

### Plans → modules
- `founder_full`: ALL (crm_simple, crm_advanced, whatsapp_agent, agenda, follow_up_ai, email_ai, reports, integrations, sofia_voice)
- `essential`: crm_simple, whatsapp_agent, agenda
- `premium`: crm_simple, crm_advanced, whatsapp_agent, agenda, follow_up_ai, email_ai
- `elite`: ALL

### Multi-tenant data isolation
TODA colección incluye `workspace_id`:
- `crm_contacts`, `crm_timeline`, `crm_chat_sessions`, `crm_ai_logs`, `leads`
- Backend filtra por `workspace_id` derivado del JWT en todos los endpoints CRM
- Public chat acepta `?workspace=<slug>` (default `digiactiva`)

### Integrations (per workspace, per module)
Las credenciales se guardan en `workspaces.integrations` y respetan el plan:
- `whatsapp` (requiere módulo `whatsapp_agent`): WABA ID, Phone Number ID, Access Token, Verify Token, App Secret, Webhook URL
- `resend` (requiere módulo `email_ai`): API Key, From Email, Domain, DKIM/SPF/DMARC status
- `sofia` (requiere módulo `sofia_voice`): Agent ID, API Key

Estado auto-calculado: `not_connected` (campos vacíos) → `pending` (todos llenos) → `connected`/`error` (cuando se prueba conexión real, futuro).

### Agent prompts per channel
`workspaces.agent_prompts` separado por canal:
- `web_chat` (alimenta el chat de la landing)
- `whatsapp` (alimentará el agente WhatsApp)
- `voice` (alimentará SOFIA)

## Implemented Sprint A (April 2026) ✅
- JWT auth bcrypt con email/password
- Users seeded: founder + Pasta admin
- Workspaces seeded: DigiActiva (founder_full) + Pasta al Vuelo (premium)
- Migration automática de datos legacy → DigiActiva en startup
- Aislamiento total verificado (founder@Pasta ve 0 contactos)
- Workspace selector en sidebar (founder), workspace fijo (admin)
- Workspaces section: lista, crear, cambiar plan, toggle módulos
- Integraciones section: WhatsApp/Resend/SOFIA con plan enforcement
- Agentes IA section: 3 tabs por canal con prompts independientes
- 28/28 tests pytest pasando + frontend E2E validado

## Backlog Sprint B (próximo)
- WhatsApp Business webhook real (recepción + envío) → CRM
- Agenda básica (calendario interno + tareas)
- Reglas simples de seguimiento (worker APScheduler)
- Resend email envío real

## Implemented Sprint B0 (April 2026) ✅
- Source `landing_chat` → `web_chat` (con migración data legacy)
- Módulo `messaging.py` reusable (record_message + upsert_contact_from_signal) — listo para WhatsApp
- Nueva colección `crm_messages` con channel + direction (inbound/outbound) + metadata
- Endpoint `GET /api/crm/messages/{contact_id}` historial unificado por contacto
- Tab "Mensajes" en ContactDetailModal del CRM (burbujas alineadas, chips de canales, timestamps)
- ChatWidget acepta workspace via prop, `?workspace=` URL, o `window.DIGIACTIVA_WORKSPACE`
- Header del chat muestra `workspace_name` dinámico
- Backfill: mensajes anteriores se asocian al contacto al capturarlo
- 14/14 tests Sprint B0 + frontend E2E

## Known Backend Notes
- `BACKEND_PUBLIC_URL` no seteado → `webhook_url` se genera relativo. Configurar para producción.
- Sin rate limiting en `/api/auth/login` y `/api/chat/message` (P1).
- `get_db()` crea cliente Mongo por request — refactor a singleton (P2).

## Test Reports
- `iteration_5.json` Chat IA + Conversaciones (37/37)
- `iteration_6.json` Sprint A multi-tenant (28/28)
- `iteration_7.json` Sprint B0 messaging refactor (14/14)
- `iteration_8.json` Sprint B1 WhatsApp Cloud API + mock tester (verified)
- `iteration_9.json` Refactor CRMPage.js → /pages/crm/ (100% regression OK, 0 errors)
- `iteration_10.json` Niche templates + Agent Config redesign + Embed Chat (Backend 7/7, Frontend 100%)
- `iteration_11.json` Composio multi-channel (Messenger / Instagram / WhatsApp alt) — Backend 17/17, Frontend 100%
- `iteration_12.json` Inbox unificado omnichannel — Backend 26/26 (tras fix), Frontend 100%
- `iteration_13.json` Onboarding (workspace+admin atómico) + role enforcement — Backend 20/20, Frontend 100% tras 2 fixes

## Onboarding & Role Enforcement (May 1, 2026) ✅
- Backend `/app/backend/workspaces.py`:
   - `POST /api/workspaces/create-with-admin` (founder-only) — crea workspace + plan + módulos + usuario `workspace_admin` con password autogenerado de 12 chars en una sola request. Acepta `template_id` opcional para aplicar plantilla de nicho. Devuelve credenciales una sola vez.
   - `GET /api/workspaces/{id}/users` — founder ve todos los founders + miembros del workspace; workspace_admin solo su propio workspace.
   - `POST /api/workspaces/{id}/users/{user_id}/reset-password` (founder-only) — autogenera nueva password si no se envía.
   - **Hardening**: `PUT /workspaces/{id}/modules/{key}` ahora `require_founder` (antes permitía workspace_admin).
   - `update_workspace` con cambio de plan ya rechazaba non-founder; verificado.
- Backend `auth.py`: NO hay endpoint público de registro. Solo founder crea usuarios via `create-with-admin`.
- Frontend `WorkspacesSection.jsx` reescrito:
   - Botón "Crear cliente" abre modal con 2 secciones: Workspace (nombre/slug auto/plan chips/plantilla) + Usuario admin (email/full_name/password opcional).
   - Tras submit aparece `CredentialsModal` con email + password + login_url y botones de copia (incluido "Copiar todo").
   - Cada workspace card tiene botón "Usuarios" que expande lista; cada user tiene botón "Reset password" inline.
- Frontend `HoySection.jsx`: nuevo `ClientStatusBar` (visible solo para non-founder) con 4 pills (Agente IA / WhatsApp / SOFIA voz / Leads activos) y botón "Probar agente".
- Frontend `Sidebar.jsx`: la entrada "Workspaces" sigue siendo founder-only (verificado).
- Aislamiento cross-workspace verificado: workspace_admin nuevo solo ve sus datos; intentos de toggle module / cambio de plan → 403 con mensaje claro.
- Composio hardening (May 1, 2026): HMAC obligatorio en `ENVIRONMENT=production` (sin secret → 401, sin firma → 401, con firma válida → 200); dev bypass solo si `ENVIRONMENT=development`. Nuevo `GET /api/composio/connections` que llama a Composio (`/api/v3/connected_accounts` con fallback v1), filtra por nuestros `auth_config_id`, mapea por canal y persiste estado real (connected | expired | error | pending). Frontend agrega botón "Sincronizar con Composio".
- `tests/test_crm.py` + `tests/test_auth_multitenant.py` + `tests/test_sprint_b0_messaging.py` + `tests/test_composio.py` + `tests/test_inbox.py`

## Composio Triggers Programáticos (May 1, 2026) ✅
**Refactor v2 al SDK Python oficial `composio` (May 1, 2026)** ✅
- Migración: `composio_triggers.py` ahora usa el SDK oficial `composio==0.12.0` (instalado vía `pip install composio`).
- Reemplazo de `httpx` directo a `/api/v3.1/*` por:
   - `composio.triggers.list(toolkit_slugs=[...])` — descubrimiento.
   - `composio.triggers.get_type(slug)` — inspección del config schema (devuelve `properties`/`required`).
   - `composio.triggers.create(slug, user_id, connected_account_id, trigger_config)` — creación.
   - `composio.triggers.delete(trigger_id)` con fallback a `disable(trigger_id)`.
- SDK síncrono envuelto en `asyncio.to_thread` para no bloquear FastAPI.
- **Lazy init del cliente Composio**: solo se instancia si al menos un canal tiene `connected_account_id`. `/setup-mine` retorna 200 con `skipped` cuando no hay canales conectados, sin requerir API key.
- Nuevo endpoint `GET /api/composio/triggers/types/{slug}` → devuelve campos requeridos del trigger_config (form dinámico en UI).
- Nuevo estado `needs_config` en results del setup: cuando el trigger requiere campos que no se enviaron, devuelve `status="needs_config"` + `missing_fields[]` para que la UI los pida.
- `/setup` y `/setup-mine` ahora aceptan `whatsapp_config`/`instagram_config`/`messenger_config` (dicts) en el body.
- Frontend `ComposioSection.jsx`: `<TriggersPanel>` renderiza `<NeedsConfigSection>` con form dinámico (un input por campo required) y botón "Reintentar con configuración".
- Tests: 20/20 PASS en `/app/backend/tests/test_composio_triggers_sprint.py`. Ver `/app/test_reports/iteration_15.json`.
- **NO se usa `subscribe()` ni `wait_forever()`**: los eventos siguen llegando vía `/api/composio/webhook`.
- **No se tocó `composio_channels.py`** (OAuth, callback, send, connections siguen idénticos).

## Composio Triggers Programáticos (mayo 1, 2026, v1) ✅
- Backend nuevo: `/app/backend/composio_triggers.py` (prefix `/api/composio/triggers` y `/api/composio/webhook-events`)
   - `GET /triggers/types` (founder): descubre slugs reales en Composio v3.1 (`/api/v3.1/triggers_types?toolkit_slugs=…`) para WA / IG / Facebook; marca candidatos inbound message.
   - `POST /triggers/setup` (founder): crea trigger instances en Composio para los 3 canales del workspace dado, vía `POST /api/v3.1/trigger_instances/{slug}/upsert`.
   - `POST /triggers/setup-mine`: misma lógica para el workspace activo del usuario actual.
   - `GET /triggers/status`: lista triggers configurados (founder ve todos / admin solo su ws).
   - `DELETE /triggers/{trigger_id}` (founder): best-effort, llama Composio v3.1 manage path y v3 fallback.
   - `GET/POST /triggers/webhook-subscription` (founder): registra el webhook URL del proyecto en Composio (`/api/v3.1/webhook_subscriptions`).
   - `GET /webhook-events`: últimos eventos crudos persistidos (debug, scoping por rol).
- Persistencia de webhook events en colección `composio_webhook_events`:
   - Cada POST a `/api/composio/webhook` se guarda con `parsed_ok`, `hmac_ok`, `headers safe` (filtra signatures/auth/cookies), `payload`, `channel`, `contact_id`.
   - Eventos rechazados por HMAC también se loguean (debug visibility).
- Auto-setup post-OAuth: `composio_channels.composio_callback` invoca `auto_setup_trigger_for_channel(...)` (best-effort, no bloquea redirect).
- Fix: `_composio_delete` ahora es totalmente no-raising — retorna `{ok:false, error}` si falta api key (antes propagaba 503 y rompía el cleanup local en `disable_trigger`).
- Frontend `/app/frontend/src/pages/crm/ComposioSection.jsx`:
   - Nuevo `<TriggersPanel>` debajo de las cards de canales (visible solo si plan_allows + api_key_configured).
   - Botón "Configurar triggers automáticamente" (POST /triggers/setup-mine) con feedback inline por canal (created/skipped/error + slug + reason).
   - Tabla de status (canal / slug / trigger_id / estado).
   - Visor de últimos 20 webhook events (timestamp UTC, canal, slug, parsed/hmac fail/ignored) con expand a JSON crudo.
- Tests: `/app/backend/tests/test_composio_triggers_sprint.py` — 18 cases, 18/18 PASS tras el fix de `_composio_delete`.
- Test report: `/app/test_reports/iteration_14.json`.

## Inbox Unificado Omnichannel (May 1, 2026) ✅
- Backend `/app/backend/inbox.py`: prefix `/api/inbox`
   - `GET /events` (SSE realtime, auth via ?token JWT, heartbeat 15s)
   - `GET /summary` (totales por canal/estado + plan_allows)
   - `GET /conversations` (filtros channel/status/assigned_to/search/unread_only + paginación cursor)
   - `GET /conversations/{id}/messages`
   - `POST /conversations/{id}/send` (rutea por provider; cuando falla persiste outbound con status='failed' y devuelve 200 con send_result.ok=false)
   - `POST /conversations/{id}/read` (unread_count=0 + emite evento)
   - `PATCH /conversations/{id}` (status/assigned_to/tags)
- Realtime `/app/backend/realtime.py`: pub/sub in-memory por workspace_id; eventos `inbox.message.created`, `inbox.conversation.updated`, `inbox.conversation.read`.
- Webhook Composio ahora llama `upsert_conversation_and_message()` → crea/actualiza conversation + persiste message + emite SSE.
- Backfill on startup: vincula mensajes legacy a conversaciones (corrió 1 vez, 64 mensajes → 20 conversaciones).
- Modelo `crm_conversations`: workspace_id, contact_id, channel, provider, external_sender_id, status (open/pending/closed), assigned_to_user_id, last_message_preview, last_message_at, unread_count, tags, last_direction.
- Aislamiento cross-workspace verificado: 404 para conv ajeno.
- Frontend `/app/frontend/src/pages/crm/InboxSection.jsx`: 3 columnas (lista | chat | contact panel)
   - Filtros chips: canal (Todos/WA/IG/MSG) + estado (Abiertas/Pendientes/Cerradas/Todo) + No leídos toggle
   - Búsqueda por nombre/teléfono/IG/MSG/preview
   - Composer multiline (Enter envía, Shift+Enter nueva línea)
   - Status pill "En vivo" (Wifi verde) cuando SSE conectado
   - Chips de canal en cada item: WA verde, IG rosa, MSG azul, WEB orange
   - Mobile responsive: lista colapsa cuando hay conv abierta, botón ChevronLeft para volver
   - Burbujas outbound azules; cuando `status='failed'` se renderizan rojas con texto "· Falló"
   - Plan-locked screen si `plan_allows=false`
- Sidebar: nueva entrada "Bandeja" con icono Inbox.

## Composio Multi-Channel (May 1, 2026) ✅
- Backend `/app/backend/composio_channels.py`: prefix `/api/composio`
   - `GET /status` (estado 3 canales + plan_allows + whatsapp_provider + api_key_configured)
   - `POST /connect/{channel}` (inicia OAuth, devuelve redirect_url; persiste status=pending)
   - `GET /callback` (Composio redirige aquí; persiste connected_account_id; redirige a /crm)
   - `DELETE /{channel}/disconnect` (best-effort + reset local)
   - `PUT /whatsapp-provider` (toggle cloud_api ⇄ composio)
   - `POST /webhook` (HMAC verify; en dev sin secret es permisivo; parsea V3 + legacy)
   - `POST /send` (saliente; tool slug por canal)
- Plan gating: módulo nuevo `social_channels` en ALL_MODULES; habilitado en Premium / Elite / Founder Full.
- Centralizado: una sola COMPOSIO_API_KEY en `.env` para toda DigiActiva. Auth Config IDs por canal en env.
- Webhook URL pública: `https://www.digiactiva.com/api/composio/webhook` (controlado por BACKEND_PUBLIC_URL).
- Unificación de contactos: `messaging.upsert_contact_from_signal` ahora soporta `instagram_id` y `messenger_id` además de phone/email; `Contact` response model expone esos campos.
- Frontend: nueva sección "Canales Sociales (Composio)" en Integraciones — 3 cards (Messenger / Instagram / WhatsApp Composio) con estado, botón Conectar/Desconectar, toggle WhatsApp provider, banner cuando falta API key.
- Frontend: chips de canal en `ContactDetailModal.jsx` ahora incluyen IG (rosa) / MSG (azul) / WA (verde).

## Niche Templates + Agent Config UX (April 28, 2026) ✅
- Backend: `/app/backend/niche_templates.py` con 6 plantillas (clínica estética, restaurante, abogado extranjería, inmobiliaria, hotel, taller mecánico). Cada plantilla incluye `prompt_estructurado` para los 3 canales.
- Backend: `GET /api/workspaces/_meta/templates` y `POST /api/workspaces/{id}/apply-template/{template_id}`.
- Backend: `chat.py::build_system_prompt` ahora usa `prompt_estructurado` cuando está presente; fallback a campos legacy.
- Frontend: `AgentConfigSection.jsx` reescrito (566 LOC, sub-componentes Section/ListEditor/TemplatePicker/CodeBlock).
   - Chips de plantillas por nicho
   - Tabs de canal (Chat Web / WhatsApp / Voz)
   - Textarea grande "Prompt estructurado" como campo principal
   - Saludo + CTA siempre visibles (grid 2 columnas)
   - Acordeón "Configuración avanzada" con personalidad, tono, planes, promociones, nichos, preguntas, objeciones
   - Botones Probar (abre `/?workspace=<slug>`) y Guardar
   - Bloques de instalación: snippet iframe `/embed/chat?workspace=<slug>` para Chat Web, ElevenLabs `<elevenlabs-convai>` para Sofia. Solo identificadores públicos, JAMÁS API keys.
- Frontend: nueva ruta `/embed/chat` (`EmbedChat.jsx`) que monta `ChatWidget` con `startOpen` y fondo transparente.
- Tests: 100% Backend + Frontend (iteration_10).

## Refactor CRMPage.js (April 2026) ✅
- Antes: 2499 LOC en un solo archivo
- Después: 355 LOC en CRMPage.js (auth + routing) + 16 componentes en /pages/crm/
- Sin cambios funcionales, sin cambios visuales, sin cambios de lógica de negocio
- Validado por testing_agent_v3_fork (iteration_9): 100% flujos OK, 0 console errors

## Test Credentials
Ver `/app/memory/test_credentials.md`
