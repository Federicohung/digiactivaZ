"""
ACTIVA - Workspaces (multi-tenant): plans, modules (feature flags), integrations, agent prompts per channel.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
import logging
from auth import get_current_user, require_founder, hash_password

logger = logging.getLogger(__name__)
ws_router = APIRouter(prefix="/api/workspaces", tags=["Workspaces"])

def get_db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]

def _refresh_webhook_url(ws: dict) -> dict:
    """Recompute whatsapp.webhook_url at read-time using current BACKEND_PUBLIC_URL
    unless the workspace has a custom override. Keeps the URL always correct
    even if deployment domain changes."""
    integrations = ws.get("integrations") or {}
    wa = integrations.get("whatsapp") or {}
    workspace_id = ws.get("id")
    if not workspace_id:
        return ws
    override = (wa.get("webhook_url_override") or "").strip().rstrip("/")
    if override:
        base = override
    else:
        base = os.environ.get("BACKEND_PUBLIC_URL", "").rstrip("/")
    wa["webhook_url"] = f"{base}/api/whatsapp/webhook?ws={workspace_id}" if base else f"/api/whatsapp/webhook?ws={workspace_id}"
    integrations["whatsapp"] = wa
    ws["integrations"] = integrations
    return ws

# ---------- Plans → modules ----------
ALL_MODULES = [
    "crm_simple", "crm_advanced", "whatsapp_agent", "agenda",
    "follow_up_ai", "email_ai", "reports", "integrations", "sofia_voice",
    "social_channels",
]

PLAN_MODULES = {
    "founder_full": ALL_MODULES,
    "essential": ["crm_simple", "whatsapp_agent", "agenda", "integrations"],
    "premium": ["crm_simple", "crm_advanced", "whatsapp_agent", "agenda", "follow_up_ai", "email_ai", "integrations", "social_channels"],
    "elite": ALL_MODULES,
}

DEFAULT_MODULE_STATUS = {
    "crm_simple": "active",
    "crm_advanced": "active",
    "agenda": "active",
    "follow_up_ai": "active",
    "reports": "active",
    "integrations": "active",
    "whatsapp_agent": "pending_credentials",
    "email_ai": "pending_credentials",
    "sofia_voice": "pending_credentials",
    "social_channels": "pending_credentials",
}

def build_modules_for_plan(plan: str) -> Dict[str, dict]:
    enabled_keys = set(PLAN_MODULES.get(plan, []))
    out = {}
    for k in ALL_MODULES:
        out[k] = {
            "enabled": k in enabled_keys,
            "status": DEFAULT_MODULE_STATUS.get(k, "disabled") if k in enabled_keys else "disabled",
            "settings": {},
        }
    return out

# ---------- Default integrations ----------
def default_integrations() -> Dict[str, dict]:
    return {
        "whatsapp": {
            "waba_id": "", "phone_number_id": "", "access_token": "",
            "verify_token": "", "app_secret": "", "webhook_url": "",
            "status": "not_connected",  # not_connected | pending | connected | error
            "last_error": None,
        },
        "resend": {
            "api_key": "", "from_email": "", "from_domain": "",
            "dkim_status": "unknown", "spf_status": "unknown", "dmarc_status": "unknown",
            "status": "not_connected",
        },
        "sofia": {
            "agent_id": "", "api_key": "",
            "status": "not_connected",
        },
        "composio": {
            "messenger": {"connected_account_id": None, "auth_config_id": "", "status": "not_connected", "last_sync_at": None, "last_error": None},
            "instagram": {"connected_account_id": None, "auth_config_id": "", "status": "not_connected", "last_sync_at": None, "last_error": None},
            "whatsapp_composio": {"connected_account_id": None, "auth_config_id": "", "status": "not_connected", "last_sync_at": None, "last_error": None},
        },
        "whatsapp_provider": "cloud_api",  # cloud_api | composio
    }

# ---------- Default agent prompts (per channel) ----------
DEFAULT_WEB_CHAT_PROMPT = {
    "personalidad": "Asesor comercial empático, directo y profesional. Habla en español chileno cercano (no formal en exceso).",
    "tono": "Cercano, consultivo, frases cortas. Emojis con moderación (1-2 máx).",
    "objeciones": [
        "'Es muy caro' → Demostrar ROI: 1 cliente nuevo paga el plan.",
        "'No tengo tiempo' → Justamente por eso nosotros nos encargamos.",
        "'Voy a pensarlo' → Ofrecer llamada de 15 min sin compromiso.",
    ],
    "planes_vigentes": "Configurar planes vigentes del workspace.",
    "promociones": "Primera asesoría gratis. Sin permanencia.",
    "nichos_prioritarios": ["Restaurantes", "Peluquerías", "Profesionales independientes"],
    "preguntas_calificacion": [
        "¿Cuál es tu rubro?",
        "¿Tienes empresa formalizada o estás iniciando?",
        "¿Cuál es tu mayor desafío hoy?",
    ],
    "cta_final": "Agendemos una llamada de 15 min gratis. ¿Te parece?",
    "saludo_inicial": "Hola 👋 ¿En qué puedo ayudarte hoy?",
    "prompt_estructurado": "",
}

DEFAULT_WHATSAPP_PROMPT = {
    "personalidad": "Asistente comercial por WhatsApp. Respuestas cortas, naturales, como mensaje de texto.",
    "tono": "Cercano, directo, casual chileno. Sin frases largas. Sin formato markdown.",
    "objeciones": [
        "'Es caro' → Demuestra valor con 1 ejemplo concreto.",
        "'No tengo tiempo' → Propón hora específica para llamar.",
    ],
    "planes_vigentes": "Configurar planes vigentes del workspace.",
    "promociones": "Configurar promo activa.",
    "nichos_prioritarios": [],
    "preguntas_calificacion": [
        "¿Para qué tipo de negocio?",
        "¿Cuándo te gustaría empezar?",
    ],
    "cta_final": "¿Te llamo ahora o prefieres más tarde?",
    "saludo_inicial": "Hola! 👋 Recibí tu mensaje. ¿En qué te ayudo?",
    "prompt_estructurado": "",
}

DEFAULT_VOICE_PROMPT = {
    "personalidad": "Asesor de voz amable. Habla pausado y claro.",
    "tono": "Profesional cálido. Frases simples para audio.",
    "objeciones": [],
    "planes_vigentes": "Configurar planes vigentes.",
    "promociones": "",
    "nichos_prioritarios": [],
    "preguntas_calificacion": [],
    "cta_final": "Te conecto con un asesor humano. ¿Te parece?",
    "saludo_inicial": "Hola, soy SOFIA, asistente de voz. ¿En qué te ayudo?",
    "prompt_estructurado": "",
}

def default_agent_prompts() -> Dict[str, dict]:
    return {
        "web_chat": DEFAULT_WEB_CHAT_PROMPT.copy(),
        "whatsapp": DEFAULT_WHATSAPP_PROMPT.copy(),
        "voice": DEFAULT_VOICE_PROMPT.copy(),
    }

# ---------- Models ----------
class Workspace(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    slug: str
    plan: str = "essential"  # founder_full | essential | premium | elite
    modules: Dict[str, Any] = Field(default_factory=lambda: build_modules_for_plan("essential"))
    integrations: Dict[str, Any] = Field(default_factory=default_integrations)
    agent_prompts: Dict[str, Any] = Field(default_factory=default_agent_prompts)
    meta_mensual: int = 0
    branding: Dict[str, Any] = Field(default_factory=lambda: {"primary_color": "#FF4D00", "logo_url": ""})
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class WorkspaceCreate(BaseModel):
    name: str
    slug: str
    plan: str = "essential"

class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    plan: Optional[str] = None
    meta_mensual: Optional[int] = None
    branding: Optional[Dict[str, Any]] = None

# ---------- Endpoints ----------
@ws_router.get("")
async def list_workspaces(user: dict = Depends(get_current_user)):
    db = get_db()
    if user.get("role") == "founder_admin":
        items = await db.workspaces.find({}, {"_id": 0}).sort("created_at", 1).to_list(100)
    else:
        ids = user.get("workspace_ids") or []
        items = await db.workspaces.find({"id": {"$in": ids}}, {"_id": 0}).to_list(100)
    items = [_refresh_webhook_url(ws) for ws in items]
    return {"workspaces": items, "active_workspace_id": user.get("active_workspace_id")}

@ws_router.post("")
async def create_workspace(payload: WorkspaceCreate, user: dict = Depends(require_founder)):
    db = get_db()
    if await db.workspaces.find_one({"slug": payload.slug}):
        raise HTTPException(status_code=409, detail="Slug ya existe")
    ws = Workspace(name=payload.name, slug=payload.slug, plan=payload.plan,
                   modules=build_modules_for_plan(payload.plan))
    doc = ws.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()
    await db.workspaces.insert_one(doc)
    doc.pop("_id", None)
    return doc

@ws_router.get("/{workspace_id}")
async def get_workspace(workspace_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace no encontrado")
    if user.get("role") != "founder_admin" and workspace_id not in (user.get("workspace_ids") or []):
        raise HTTPException(status_code=403, detail="Sin acceso")
    return _refresh_webhook_url(ws)

@ws_router.put("/{workspace_id}")
async def update_workspace(workspace_id: str, payload: WorkspaceUpdate, user: dict = Depends(get_current_user)):
    db = get_db()
    ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace no encontrado")
    if user.get("role") != "founder_admin" and workspace_id not in (user.get("workspace_ids") or []):
        raise HTTPException(status_code=403, detail="Sin acceso")
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    # If plan changes (founder only), recompute modules baseline (preserve enabled overrides)
    if "plan" in update:
        if user.get("role") != "founder_admin":
            raise HTTPException(status_code=403, detail="Solo founder puede cambiar plan")
        new_modules = build_modules_for_plan(update["plan"])
        # Keep custom settings
        for k, v in (ws.get("modules") or {}).items():
            if k in new_modules and v.get("settings"):
                new_modules[k]["settings"] = v["settings"]
        update["modules"] = new_modules
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.workspaces.update_one({"id": workspace_id}, {"$set": update})
    fresh = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    return fresh

@ws_router.put("/{workspace_id}/modules/{module_key}")
async def toggle_module(workspace_id: str, module_key: str, payload: dict, user: dict = Depends(require_founder)):
    """Solo founder_admin puede activar/desactivar módulos. El workspace_admin solo
    puede VER lo que su plan habilita; no puede saltarse el plan."""
    db = get_db()
    if module_key not in ALL_MODULES:
        raise HTTPException(status_code=400, detail="Módulo desconocido")
    ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace no encontrado")
    enabled_in_plan = module_key in PLAN_MODULES.get(ws.get("plan", "essential"), [])
    if not enabled_in_plan:
        raise HTTPException(status_code=403, detail=f"Módulo no incluido en plan {ws.get('plan')}")
    cur = (ws.get("modules") or {}).get(module_key, {"settings": {}})
    cur["enabled"] = bool(payload.get("enabled", cur.get("enabled", True)))
    if "status" in payload:
        cur["status"] = payload["status"]
    if "settings" in payload:
        cur["settings"] = payload["settings"]
    await db.workspaces.update_one(
        {"id": workspace_id},
        {"$set": {f"modules.{module_key}": cur, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return cur

@ws_router.put("/{workspace_id}/integrations/{integration_key}")
async def update_integration(workspace_id: str, integration_key: str, payload: dict, user: dict = Depends(get_current_user)):
    db = get_db()
    if integration_key not in ["whatsapp", "resend", "sofia"]:
        raise HTTPException(status_code=400, detail="Integración desconocida")
    ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace no encontrado")
    if user.get("role") != "founder_admin" and workspace_id not in (user.get("workspace_ids") or []):
        raise HTTPException(status_code=403, detail="Sin acceso")
    # Enforce plan: each integration depends on its feature module
    INTEGRATION_TO_MODULE = {
        "whatsapp": "whatsapp_agent",
        "resend": "email_ai",
        "sofia": "sofia_voice",
    }
    required_module = INTEGRATION_TO_MODULE.get(integration_key)
    mods = (ws.get("modules") or {})
    if required_module and not mods.get(required_module, {}).get("enabled"):
        raise HTTPException(status_code=403, detail=f"Módulo '{required_module}' no incluido en el plan actual")
    cur = (ws.get("integrations") or {}).get(integration_key, {})
    cur.update({k: v for k, v in payload.items() if k != "status"})
    # Auto-status: if all required keys filled → pending; else not_connected
    required_keys = {
        "whatsapp": ["waba_id", "phone_number_id", "access_token", "verify_token"],
        "resend": ["api_key", "from_email"],
        "sofia": ["agent_id", "api_key"],
    }
    if all((cur.get(k) or "").strip() for k in required_keys[integration_key]):
        cur["status"] = "pending"  # ready to test connection
    else:
        cur["status"] = "not_connected"
    if integration_key == "whatsapp":
        # Build webhook URL: respect user-provided override, else derive from BACKEND_PUBLIC_URL
        override = (cur.get("webhook_url_override") or "").strip().rstrip("/")
        if override:
            cur["webhook_url"] = f"{override}/api/whatsapp/webhook?ws={workspace_id}"
        else:
            backend = os.environ.get("BACKEND_PUBLIC_URL", "").rstrip("/")
            cur["webhook_url"] = f"{backend}/api/whatsapp/webhook?ws={workspace_id}" if backend else f"/api/whatsapp/webhook?ws={workspace_id}"
        # Status: pending if all required + verify_token set; webhook listo if verified previously kept; else not_connected
        if all((cur.get(k) or "").strip() for k in ["waba_id", "phone_number_id", "access_token", "verify_token"]):
            # If previously verified, keep 'connected'; otherwise mark webhook_ready (alias = pending)
            prev_status = (ws.get("integrations") or {}).get("whatsapp", {}).get("status")
            cur["status"] = "connected" if prev_status == "connected" else "webhook_ready"
        else:
            cur["status"] = "not_connected"
    await db.workspaces.update_one(
        {"id": workspace_id},
        {"$set": {f"integrations.{integration_key}": cur, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return cur

@ws_router.put("/{workspace_id}/agent-prompts/{channel}")
async def update_agent_prompt(workspace_id: str, channel: str, payload: dict, user: dict = Depends(get_current_user)):
    db = get_db()
    if channel not in ["web_chat", "whatsapp", "voice"]:
        raise HTTPException(status_code=400, detail="Canal desconocido")
    ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace no encontrado")
    if user.get("role") != "founder_admin" and workspace_id not in (user.get("workspace_ids") or []):
        raise HTTPException(status_code=403, detail="Sin acceso")
    cur_prompts = ws.get("agent_prompts") or default_agent_prompts()
    cur_prompts[channel] = payload
    await db.workspaces.update_one(
        {"id": workspace_id},
        {"$set": {f"agent_prompts.{channel}": payload, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return cur_prompts[channel]

@ws_router.get("/_meta/plans")
async def get_plans():
    """Public-ish: list available plans + their modules."""
    return {"plans": PLAN_MODULES, "all_modules": ALL_MODULES}

@ws_router.get("/_meta/templates")
async def get_niche_templates(user: dict = Depends(get_current_user)):
    """List available niche templates (id, label, icon)."""
    from niche_templates import list_templates
    return {"templates": list_templates()}

@ws_router.post("/{workspace_id}/apply-template/{template_id}")
async def apply_niche_template(
    workspace_id: str,
    template_id: str,
    user: dict = Depends(get_current_user),
):
    """Replace agent_prompts of all 3 channels with a niche template preset."""
    from niche_templates import get_template
    db = get_db()
    ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace no encontrado")
    if user.get("role") != "founder_admin" and workspace_id not in (user.get("workspace_ids") or []):
        raise HTTPException(status_code=403, detail="Sin acceso")
    tpl = get_template(template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    # Merge template prompts on top of defaults so all keys exist
    new_prompts = default_agent_prompts()
    for ch, preset in (tpl.get("prompts") or {}).items():
        if ch in new_prompts:
            merged = {**new_prompts[ch], **preset}
            new_prompts[ch] = merged
    await db.workspaces.update_one(
        {"id": workspace_id},
        {"$set": {
            "agent_prompts": new_prompts,
            "applied_template": template_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True, "template_id": template_id, "agent_prompts": new_prompts}

# ---------- Seed ----------
async def seed_workspaces(db):
    """Create DigiActiva (founder_full) + Pasta al Vuelo (premium) if missing."""
    existing_da = await db.workspaces.find_one({"slug": "digiactiva"})
    if not existing_da:
        ws = Workspace(name="DigiActiva", slug="digiactiva", plan="founder_full",
                       modules=build_modules_for_plan("founder_full"))
        # Seed DigiActiva web_chat prompt with real Digiactiva data
        ws.agent_prompts["web_chat"] = {
            "personalidad": "Asesor comercial empático, directo y profesional. Habla en español chileno cercano (no formal en exceso).",
            "tono": "Cercano, consultivo, orientado a resolver. Frases cortas. Emojis con moderación (1-2 por mensaje máximo).",
            "objeciones": [
                "'Es muy caro' → Demostrar ROI: 1 cliente nuevo paga el plan.",
                "'No tengo tiempo' → Justamente por eso: nosotros nos encargamos de todo.",
                "'Ya tengo Instagram' → Instagram solo no convierte. Necesitas un sistema completo.",
                "'Voy a pensarlo' → Ofrecer llamada de 15 min sin compromiso.",
            ],
            "planes_vigentes": (
                "Pack Formalización $59.900 único - Inicio rápido de empresa.\n"
                "Plan Digitalízate $99.000/mes - Web + WhatsApp Business + presencia online.\n"
                "Plan Gestión $129.000/mes (RECOMENDADO) - Lo anterior + gestión + soporte.\n"
                "Plan Impulso $179.000/mes - Gestión + 50% dcto en renta anual.\n"
                "Plan Full $219.000/mes - Todo + renta anual sin costo."
            ),
            "promociones": "Primera asesoría 100% gratis. Sin permanencia. Cancelas cuando quieras.",
            "nichos_prioritarios": [
                "Restaurantes y delivery", "Peluquerías y estética",
                "Tiendas físicas que quieren vender online",
                "Profesionales independientes (psicólogos, abogados, contadores)",
                "Talleres y servicios técnicos",
            ],
            "preguntas_calificacion": [
                "¿Cuál es el rubro de tu negocio?",
                "¿Cuántos años llevas operando?",
                "¿Tienes empresa formalizada o estás iniciando?",
                "¿Cuál es tu mayor desafío hoy: captar clientes, organizar el negocio o vender más?",
                "¿Cuál es tu presupuesto mensual aproximado para crecer?",
            ],
            "cta_final": "Agendemos una llamada de 15 minutos gratis para mostrarte cómo lo haríamos en tu caso. ¿Te parece?",
            "saludo_inicial": "Hola 👋 Soy el asistente comercial de DIGIACTIVA. Puedo ayudarte a automatizar ventas, WhatsApp y captación de clientes. ¿Cuéntame, en qué andas?",
        }
        doc = ws.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        doc["updated_at"] = doc["updated_at"].isoformat()
        await db.workspaces.insert_one(doc)
        logger.info(f"Seeded workspace: digiactiva ({doc['id']})")

    existing_pv = await db.workspaces.find_one({"slug": "pasta-al-vuelo"})
    if not existing_pv:
        ws = Workspace(name="Pasta al Vuelo", slug="pasta-al-vuelo", plan="premium",
                       modules=build_modules_for_plan("premium"))
        ws.agent_prompts["web_chat"]["saludo_inicial"] = "Hola 👋 Soy el asistente de Pasta al Vuelo. ¿Te ayudo con tu pedido?"
        ws.agent_prompts["whatsapp"]["saludo_inicial"] = "Hola! 🍝 Recibí tu mensaje. ¿En qué te ayudo?"
        doc = ws.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        doc["updated_at"] = doc["updated_at"].isoformat()
        await db.workspaces.insert_one(doc)
        logger.info(f"Seeded workspace: pasta-al-vuelo ({doc['id']})")

async def migrate_existing_data_to_digiactiva(db):
    """Assign workspace_id=DigiActiva to all existing CRM data without one."""
    digiactiva = await db.workspaces.find_one({"slug": "digiactiva"}, {"_id": 0, "id": 1})
    if not digiactiva:
        return
    da_id = digiactiva["id"]
    collections = ["crm_contacts", "crm_timeline", "crm_chat_sessions", "crm_ai_logs", "leads"]
    for col in collections:
        result = await db[col].update_many(
            {"workspace_id": {"$exists": False}},
            {"$set": {"workspace_id": da_id}}
        )
        if result.modified_count > 0:
            logger.info(f"Migrated {result.modified_count} docs in {col} → workspace {da_id}")


# ---------- Onboarding: create workspace + admin user atomically ----------
class AdminCreatePayload(BaseModel):
    email: str
    password: Optional[str] = None  # si no viene, se autogenera
    full_name: Optional[str] = None


class WorkspaceWithAdminPayload(BaseModel):
    workspace: WorkspaceCreate
    admin: AdminCreatePayload
    template_id: Optional[str] = None  # opcional: aplicar plantilla de nicho


def _generate_password(length: int = 12) -> str:
    """Genera password fácil de leer (sin caracteres ambiguos)."""
    import secrets
    alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


@ws_router.post("/create-with-admin")
async def create_workspace_with_admin(
    payload: WorkspaceWithAdminPayload,
    user: dict = Depends(require_founder),
):
    """Founder crea cliente completo en un solo flujo:
    workspace + plan + módulos + usuario workspace_admin con credenciales.

    Devuelve las credenciales generadas — el founder debe entregárselas al cliente.
    """
    db = get_db()

    # Validaciones
    email = (payload.admin.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Email inválido")
    if await db.workspaces.find_one({"slug": payload.workspace.slug}):
        raise HTTPException(status_code=409, detail="Slug ya existe")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese email")

    # 1. Crear workspace
    ws = Workspace(
        name=payload.workspace.name,
        slug=payload.workspace.slug,
        plan=payload.workspace.plan,
        modules=build_modules_for_plan(payload.workspace.plan),
    )
    ws_doc = ws.model_dump()
    ws_doc["created_at"] = ws_doc["created_at"].isoformat()
    ws_doc["updated_at"] = ws_doc["updated_at"].isoformat()
    await db.workspaces.insert_one(ws_doc)
    ws_doc.pop("_id", None)

    # 2. Plantilla opcional
    if payload.template_id:
        from niche_templates import get_template
        tpl = get_template(payload.template_id)
        if tpl:
            new_prompts = default_agent_prompts()
            for ch, preset in (tpl.get("prompts") or {}).items():
                if ch in new_prompts:
                    new_prompts[ch] = {**new_prompts[ch], **preset}
            await db.workspaces.update_one(
                {"id": ws_doc["id"]},
                {"$set": {"agent_prompts": new_prompts, "applied_template": payload.template_id}},
            )
            ws_doc["agent_prompts"] = new_prompts
            ws_doc["applied_template"] = payload.template_id

    # 3. Crear usuario workspace_admin
    raw_password = (payload.admin.password or "").strip() or _generate_password()
    if len(raw_password) < 8:
        raise HTTPException(status_code=400, detail="Password debe tener al menos 8 caracteres")
    user_doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": hash_password(raw_password),
        "full_name": (payload.admin.full_name or payload.workspace.name).strip(),
        "role": "workspace_admin",
        "workspace_ids": [ws_doc["id"]],
        "active_workspace_id": ws_doc["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    logger.info(f"Workspace+admin creados: ws={ws_doc['slug']} email={email}")

    # 4. Devolver credenciales (única vez)
    public_user = {k: v for k, v in user_doc.items() if k not in ("_id", "password_hash")}
    # login_url: prefiere FRONTEND_PUBLIC_URL (donde vive el CRM tenant) y cae a BACKEND_PUBLIC_URL.
    base = (os.environ.get("FRONTEND_PUBLIC_URL") or os.environ.get("BACKEND_PUBLIC_URL") or "").rstrip("/")
    return {
        "ok": True,
        "workspace": ws_doc,
        "user": public_user,
        "credentials": {
            "email": email,
            "password": raw_password,
            "login_url": f"{base}/crm" if base else "/crm",
        },
        "message": "Cliente creado. Comparte estas credenciales una sola vez — no se mostrarán de nuevo.",
    }


@ws_router.get("/{workspace_id}/users")
async def list_workspace_users(workspace_id: str, user: dict = Depends(get_current_user)):
    """Lista usuarios del workspace. Founder ve todos; workspace_admin solo el suyo.

    Si el solicitante es founder_admin también incluye a TODOS los founders en la
    respuesta (rol global), para que siempre aparezca él mismo en cualquier workspace.
    """
    db = get_db()
    if user.get("role") != "founder_admin" and workspace_id not in (user.get("workspace_ids") or []):
        raise HTTPException(status_code=403, detail="Sin acceso")
    or_clauses = [{"workspace_ids": workspace_id}]
    if user.get("role") == "founder_admin":
        or_clauses.append({"role": "founder_admin"})
    users = await db.users.find(
        {"$or": or_clauses},
        {"_id": 0, "password_hash": 0},
    ).to_list(50)
    return {"users": users}


class ResetPasswordPayload(BaseModel):
    new_password: Optional[str] = None  # autogenera si vacío


@ws_router.post("/{workspace_id}/users/{user_id}/reset-password")
async def reset_user_password(
    workspace_id: str,
    user_id: str,
    payload: ResetPasswordPayload,
    actor: dict = Depends(require_founder),
):
    """Founder resetea password de un usuario del workspace. Devuelve la nueva password."""
    db = get_db()
    target = await db.users.find_one({"id": user_id, "workspace_ids": workspace_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado en ese workspace")
    new_pw = (payload.new_password or "").strip() or _generate_password()
    if len(new_pw) < 8:
        raise HTTPException(status_code=400, detail="Password debe tener al menos 8 caracteres")
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"password_hash": hash_password(new_pw), "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    logger.info(f"Password reseteada: user={target['email']} por founder={actor['email']}")
    return {"ok": True, "email": target["email"], "new_password": new_pw}

