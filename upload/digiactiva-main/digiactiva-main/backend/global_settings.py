"""
ACTIVA — Global platform settings (founder-only).

Persiste configuración global DigiActiva en MongoDB en la colección `global_settings`.
A día de hoy: credenciales centralizadas de Composio (API key + Webhook secret).

Ventaja sobre `.env`: el founder puede actualizarlas desde el panel sin reiniciar el server,
y se versionan con un audit trail mínimo (updated_at + updated_by).

Endpoints:
  GET  /api/admin/settings/composio        → estado masked (founder-only)
  PUT  /api/admin/settings/composio        → actualiza api_key / webhook_secret (founder-only)
  POST /api/admin/settings/composio/test   → ping a Composio con la key actual
"""
from __future__ import annotations

import os
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient

from auth import require_founder

logger = logging.getLogger(__name__)
admin_router = APIRouter(prefix="/api/admin/settings", tags=["AdminSettings"])

GLOBAL_DOC_ID = "platform"  # único doc en global_settings


def _get_db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


def _mask(value: str) -> Optional[str]:
    if not value:
        return None
    v = value.strip()
    if len(v) <= 8:
        return "•" * len(v)
    return v[:4] + "•" * (len(v) - 8) + v[-4:]


# ---------- Public helpers (used by composio_channels) ----------
async def get_global_settings() -> dict:
    """Return raw global settings from DB (or {})."""
    db = _get_db()
    doc = await db.global_settings.find_one({"_id": GLOBAL_DOC_ID}, {"_id": 0}) or {}
    return doc


async def get_composio_api_key() -> str:
    """DB first, env fallback."""
    settings = await get_global_settings()
    composio = (settings.get("composio") or {})
    return (composio.get("api_key") or os.environ.get("COMPOSIO_API_KEY") or "").strip()


async def get_composio_webhook_secret() -> str:
    settings = await get_global_settings()
    composio = (settings.get("composio") or {})
    return (composio.get("webhook_secret") or os.environ.get("COMPOSIO_WEBHOOK_SECRET") or "").strip()


async def get_effective_public_url() -> str:
    """Public URL para callbacks/webhooks. DB override > BACKEND_PUBLIC_URL env."""
    settings = await get_global_settings()
    override = ((settings.get("platform") or {}).get("public_url") or "").strip()
    if override:
        return override.rstrip("/")
    return (os.environ.get("BACKEND_PUBLIC_URL") or "").rstrip("/")


# ---------- Endpoints ----------
class ComposioSettingsUpdate(BaseModel):
    api_key: Optional[str] = None       # vacío = no cambiar; "" string explícito + clear_api_key=true para borrar
    webhook_secret: Optional[str] = None
    public_url: Optional[str] = None    # override del dominio público (sobrescribe BACKEND_PUBLIC_URL)
    clear_api_key: bool = False
    clear_webhook_secret: bool = False
    clear_public_url: bool = False


@admin_router.get("/composio")
async def get_composio_settings(actor: dict = Depends(require_founder)):
    """Devuelve el estado de las credenciales (masked) sin exponer los valores."""
    settings = await get_global_settings()
    composio = (settings.get("composio") or {})
    api_key = composio.get("api_key") or os.environ.get("COMPOSIO_API_KEY") or ""
    secret = composio.get("webhook_secret") or os.environ.get("COMPOSIO_WEBHOOK_SECRET") or ""
    public_override = ((settings.get("platform") or {}).get("public_url") or "").strip()
    effective_public = await get_effective_public_url()
    webhook_url = f"{effective_public}/api/composio/webhook" if effective_public else "/api/composio/webhook"
    is_preview = "preview.emergentagent.com" in (effective_public or "")
    return {
        "api_key_set": bool(api_key.strip()),
        "api_key_preview": _mask(api_key) if api_key.strip() else None,
        "api_key_source": "db" if composio.get("api_key") else ("env" if os.environ.get("COMPOSIO_API_KEY") else None),
        "webhook_secret_set": bool(secret.strip()),
        "webhook_secret_preview": _mask(secret) if secret.strip() else None,
        "webhook_secret_source": "db" if composio.get("webhook_secret") else ("env" if os.environ.get("COMPOSIO_WEBHOOK_SECRET") else None),
        "auth_configs": {
            "messenger": os.environ.get("COMPOSIO_AUTH_CONFIG_MESSENGER", ""),
            "instagram": os.environ.get("COMPOSIO_AUTH_CONFIG_INSTAGRAM", ""),
            "whatsapp": os.environ.get("COMPOSIO_AUTH_CONFIG_WHATSAPP", ""),
        },
        "environment": os.environ.get("ENVIRONMENT", "production"),
        "public_url": effective_public or None,
        "public_url_override": public_override or None,
        "public_url_source": "db" if public_override else ("env" if os.environ.get("BACKEND_PUBLIC_URL") else None),
        "is_preview_domain": is_preview,
        "webhook_url_hint": webhook_url,
        "callback_url_hint": f"{effective_public}/api/composio/callback" if effective_public else None,
        "updated_at": composio.get("updated_at"),
        "updated_by": composio.get("updated_by"),
    }


@admin_router.put("/composio")
async def update_composio_settings(payload: ComposioSettingsUpdate, actor: dict = Depends(require_founder)):
    """Actualiza api_key y/o webhook_secret. Solo guarda los campos que vienen no-None.
    Para limpiar un campo, enviar `clear_api_key=true` o `clear_webhook_secret=true`.
    """
    db = _get_db()
    update: dict = {}
    if payload.clear_api_key:
        update["composio.api_key"] = None
    elif payload.api_key is not None:
        new = payload.api_key.strip()
        if new and len(new) < 10:
            raise HTTPException(status_code=400, detail="api_key parece inválida (muy corta)")
        update["composio.api_key"] = new or None

    if payload.clear_webhook_secret:
        update["composio.webhook_secret"] = None
    elif payload.webhook_secret is not None:
        new = payload.webhook_secret.strip()
        if new and len(new) < 8:
            raise HTTPException(status_code=400, detail="webhook_secret parece inválido (muy corto)")
        update["composio.webhook_secret"] = new or None

    # public_url: dominio donde vive este backend (para callbacks/webhooks)
    if payload.clear_public_url:
        update["platform.public_url"] = None
    elif payload.public_url is not None:
        new = payload.public_url.strip().rstrip("/")
        if new:
            if not (new.startswith("https://") or new.startswith("http://")):
                raise HTTPException(status_code=400, detail="public_url debe empezar con https:// o http://")
            if len(new) < 10:
                raise HTTPException(status_code=400, detail="public_url parece inválida")
        update["platform.public_url"] = new or None

    if not update:
        raise HTTPException(status_code=400, detail="Nada que actualizar")

    update["composio.updated_at"] = datetime.now(timezone.utc).isoformat()
    update["composio.updated_by"] = actor["email"]
    await db.global_settings.update_one(
        {"_id": GLOBAL_DOC_ID},
        {"$set": update},
        upsert=True,
    )
    logger.info(f"Composio global settings updated by {actor['email']}: {list(update.keys())}")
    # Return fresh masked status
    return await get_composio_settings(actor=actor)


@admin_router.post("/composio/test")
async def test_composio_connection(actor: dict = Depends(require_founder)):
    """Ping mínimo a Composio API con la key actual: GET /api/v3/connected_accounts?limit=1"""
    api_key = await get_composio_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="API key no configurada")
    headers = {"x-api-key": api_key, "Authorization": f"Bearer {api_key}"}
    url = "https://backend.composio.dev/api/v3/connected_accounts"
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(url, headers=headers, params={"limit": 1})
        return {
            "ok": r.status_code < 400,
            "status_code": r.status_code,
            "body_preview": (r.text or "")[:300],
        }
    except httpx.HTTPError as e:
        return {"ok": False, "error": str(e)}


# ---------- Public health endpoint para debug de URLs ----------
public_health_router = APIRouter(prefix="/api/health", tags=["Health"])


@public_health_router.get("/public-url")
async def health_public_url():
    """Devuelve qué dominio está usando el backend para callbacks/webhooks. SIN auth (debug).

    Prefiere override en DB (panel founder) sobre BACKEND_PUBLIC_URL env.
    """
    backend = await get_effective_public_url()
    backend_env = (os.environ.get("BACKEND_PUBLIC_URL") or "").rstrip("/")
    frontend = (os.environ.get("FRONTEND_PUBLIC_URL") or "").rstrip("/")
    return {
        "backend_public_url": backend or None,
        "backend_public_url_env": backend_env or None,
        "frontend_public_url": frontend or None,
        "composio_webhook_url": f"{backend}/api/composio/webhook" if backend else None,
        "composio_callback_url": f"{backend}/api/composio/callback" if backend else None,
        "is_preview_domain": "preview.emergentagent.com" in (backend or ""),
        "environment": os.environ.get("ENVIRONMENT", "production"),
    }
