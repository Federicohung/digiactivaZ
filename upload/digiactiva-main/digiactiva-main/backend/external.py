"""
DIGIACTIVA - External ingestion router (multi-tenant)

Endpoint público que recibe "mirror" events desde otros backends / bots / Twilio /
sistemas propios de cada cliente. NO reemplaza el webhook de WhatsApp Cloud API;
es un canal adicional de ingestión de eventos.

Seguridad:
- Header `x-api-key` obligatorio, una key por workspace (se guarda solo hash sha256).
- Plaintext se muestra una única vez al generar (o regenerar).
- Rate limit in-memory 60 req/min por key.

Uso típico:
POST /api/external/whatsapp-event
{
  "workspace_slug": "digiactiva",
  "phone": "+56912345678",
  "name": "Ana",
  "message": "Hola, quiero información",
  "event_type": "message_received",
  "timestamp": "2026-04-28T10:30:00Z",
  "external_conversation_id": "abc123",
  "external_source": "external_whatsapp",
  "raw_payload": {}
}
"""
import os
import time
import uuid
import hashlib
import secrets
import logging
from collections import deque
from typing import Optional, Dict, Any
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient

from auth import get_current_user, require_founder
from messaging import record_message, upsert_contact_from_signal

logger = logging.getLogger(__name__)
external_router = APIRouter(prefix="/api/external", tags=["External ingestion"])
admin_external_router = APIRouter(prefix="/api/workspaces", tags=["External admin"])

# ---------- DB ----------
def get_db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]

# ---------- API key hashing ----------
KEY_PREFIX = "dgx_"

def _hash_key(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode()).hexdigest()

def _mask_key(plaintext: str) -> str:
    """Return e.g. dgx_abcd…wxyz for safe display / logs."""
    if not plaintext or len(plaintext) < 10:
        return "***"
    return f"{plaintext[:8]}…{plaintext[-4:]}"

def _generate_key() -> str:
    return f"{KEY_PREFIX}{secrets.token_hex(24)}"

# ---------- Rate limit (in-memory, 60 req/min per key_hash) ----------
_rate_buckets: Dict[str, deque] = {}
_RATE_WINDOW_SECONDS = 60
_RATE_MAX_REQUESTS = 60

def _check_rate_limit(key_hash: str) -> bool:
    now = time.time()
    bucket = _rate_buckets.setdefault(key_hash, deque())
    while bucket and now - bucket[0] > _RATE_WINDOW_SECONDS:
        bucket.popleft()
    if len(bucket) >= _RATE_MAX_REQUESTS:
        return False
    bucket.append(now)
    return True

# ---------- Request schema ----------
class ExternalEvent(BaseModel):
    workspace_slug: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    message: str = Field(..., min_length=1, max_length=4000)
    event_type: str = Field(default="message_received")
    timestamp: Optional[str] = None
    external_conversation_id: Optional[str] = None
    external_order_id: Optional[str] = None
    external_source: Optional[str] = "external_whatsapp"
    raw_payload: Optional[Dict[str, Any]] = None

# ---------- Dependency: resolve workspace by API key ----------
async def _get_ws_by_api_key(request: Request):
    api_key = (request.headers.get("x-api-key") or "").strip()
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing x-api-key header")
    key_hash = _hash_key(api_key)
    db = get_db()
    ws = await db.workspaces.find_one(
        {"integrations.external.api_key_hash": key_hash},
        {"_id": 0}
    )
    if not ws:
        logger.warning("external_api_key_invalid key_prefix=%s", api_key[:8] if len(api_key) >= 8 else "short")
        raise HTTPException(status_code=403, detail="Invalid API key")
    if not _check_rate_limit(key_hash):
        raise HTTPException(status_code=429, detail="Rate limit exceeded (60 req/min)")
    return ws

# ---------- Public endpoint: ingest external event ----------
@external_router.post("/whatsapp-event")
async def external_whatsapp_event(payload: ExternalEvent, request: Request):
    ws = await _get_ws_by_api_key(request)
    workspace_id = ws["id"]

    # Extra defense: if workspace_slug provided, it must match
    if payload.workspace_slug and payload.workspace_slug != ws.get("slug"):
        raise HTTPException(status_code=403, detail="workspace_slug does not match API key")

    if not (payload.phone or payload.email):
        raise HTTPException(status_code=400, detail="phone or email required")

    db = get_db()
    source = payload.external_source or "external_whatsapp"

    # 1) Upsert contact (creates if new, updates last activity if exists)
    contact_id = await upsert_contact_from_signal(
        db,
        workspace_id,
        phone=payload.phone,
        email=payload.email,
        name=payload.name,
        source=source,
    )
    if not contact_id:
        raise HTTPException(status_code=400, detail="Could not upsert contact")

    # 2) Record message in crm_messages
    message_id = await record_message(
        db,
        workspace_id=workspace_id,
        channel="whatsapp",
        direction="inbound",
        content=payload.message,
        contact_id=contact_id,
        metadata={
            "event_type": payload.event_type,
            "timestamp": payload.timestamp,
            "external_conversation_id": payload.external_conversation_id,
            "external_order_id": payload.external_order_id,
            "external_source": source,
            "ingestion": "external_api",
            "raw_payload": payload.raw_payload or {},
        },
    )

    # 3) Timeline event
    await db.crm_timeline.insert_one({
        "id": str(uuid.uuid4()),
        "workspace_id": workspace_id,
        "contact_id": contact_id,
        "tipo": "whatsapp",
        "descripcion": f"[{source}] {payload.message[:140]}",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # 4) Update counters on workspace (atomic $inc + last_event fields)
    await db.workspaces.update_one(
        {"id": workspace_id},
        {"$inc": {"integrations.external.events_count": 1},
         "$set": {
             "integrations.external.last_event_at": datetime.now(timezone.utc).isoformat(),
             "integrations.external.last_error": None,
             "integrations.external.status": "active",
         }}
    )

    return {
        "success": True,
        "workspace_id": workspace_id,
        "contact_id": contact_id,
        "message_id": message_id,
    }

# ---------- Admin endpoints ----------
@admin_external_router.post("/{workspace_id}/external/regenerate-api-key")
async def regenerate_external_api_key(workspace_id: str, user: dict = Depends(get_current_user)):
    """Generate a new API key for this workspace. Returns plaintext ONCE.
    Only founder admins or users with access to the workspace can do this."""
    if user.get("role") != "founder_admin" and workspace_id not in (user.get("workspace_ids") or []):
        raise HTTPException(status_code=403, detail="Sin acceso a este workspace")
    db = get_db()
    ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0, "id": 1, "slug": 1})
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace no encontrado")
    plaintext = _generate_key()
    key_hash = _hash_key(plaintext)
    backend = os.environ.get("BACKEND_PUBLIC_URL", "").rstrip("/")
    endpoint = f"{backend}/api/external/whatsapp-event" if backend else "/api/external/whatsapp-event"
    await db.workspaces.update_one(
        {"id": workspace_id},
        {"$set": {
            "integrations.external.api_key_hash": key_hash,
            "integrations.external.api_key_masked": _mask_key(plaintext),
            "integrations.external.endpoint_url": endpoint,
            "integrations.external.status": "active",
            "integrations.external.rotated_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    logger.info("external_api_key_rotated workspace=%s masked=%s", ws.get("slug"), _mask_key(plaintext))
    return {
        "api_key": plaintext,  # Plaintext returned ONCE — UI must warn user to copy now
        "api_key_masked": _mask_key(plaintext),
        "endpoint_url": endpoint,
        "note": "Guarda esta API key. No se volverá a mostrar. Si la pierdes, debes regenerarla.",
    }

@admin_external_router.get("/{workspace_id}/external/status")
async def get_external_status(workspace_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "founder_admin" and workspace_id not in (user.get("workspace_ids") or []):
        raise HTTPException(status_code=403, detail="Sin acceso a este workspace")
    db = get_db()
    ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace no encontrado")
    ext = (ws.get("integrations") or {}).get("external") or {}
    backend = os.environ.get("BACKEND_PUBLIC_URL", "").rstrip("/")
    endpoint = ext.get("endpoint_url") or (
        f"{backend}/api/external/whatsapp-event" if backend else "/api/external/whatsapp-event"
    )
    has_key = bool(ext.get("api_key_hash"))
    return {
        "status": ext.get("status") or ("not_configured" if not has_key else "active"),
        "has_api_key": has_key,
        "api_key_masked": ext.get("api_key_masked"),
        "endpoint_url": endpoint,
        "last_event_at": ext.get("last_event_at"),
        "last_error": ext.get("last_error"),
        "events_count": ext.get("events_count", 0),
        "rotated_at": ext.get("rotated_at"),
        "workspace_slug": ws.get("slug"),
        "example_payload": {
            "workspace_slug": ws.get("slug"),
            "phone": "+56912345678",
            "name": "Ana",
            "message": "Hola, quiero información",
            "event_type": "message_received",
            "timestamp": "2026-04-28T10:30:00Z",
            "external_conversation_id": "abc123",
            "external_source": "external_whatsapp",
            "raw_payload": {}
        },
        "example_curl": (
            f"curl -X POST {endpoint} \\\n"
            f"  -H 'Content-Type: application/json' \\\n"
            f"  -H 'x-api-key: TU_API_KEY_AQUI' \\\n"
            f"  -d '{{\"phone\":\"+56912345678\",\"message\":\"Hola\"}}'"
        ),
    }
