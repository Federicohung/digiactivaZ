"""
ACTIVA — Composio multi-channel social messaging integration.

Centralized DigiActiva account: una API key, todos los workspaces conectan vía
nuestra cuenta de Composio. Cada workspace mantiene su propio
`connected_account_id` por canal (Messenger / Instagram / WhatsApp).

Endpoints expuestos:
  POST   /api/composio/connect/{channel}      → inicia OAuth, devuelve redirect_url
  GET    /api/composio/callback               → Composio redirige aquí; persiste connected_account_id
  DELETE /api/composio/{channel}/disconnect   → elimina conexión
  POST   /api/composio/webhook                → recibe mensajes (HMAC verify)
  POST   /api/composio/send                   → envía mensaje saliente
  GET    /api/composio/status                 → estado de los 3 canales del workspace activo

Plan gating: requiere módulo `social_channels` (Premium / Elite / Founder Full).
"""
import os
import hmac
import hashlib
import logging
import time
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import RedirectResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from auth import get_current_user
from messaging import record_message, upsert_contact_from_signal

logger = logging.getLogger(__name__)
composio_router = APIRouter(prefix="/api/composio", tags=["Composio"])

COMPOSIO_BASE = "https://backend.composio.dev"
CHANNELS = ("messenger", "instagram", "whatsapp_composio")
PUBLIC_CHANNEL_KEYS = ("messenger", "instagram", "whatsapp")  # nombres aceptados desde frontend

CHANNEL_TO_AUTH_CONFIG_ENV = {
    "messenger": "COMPOSIO_AUTH_CONFIG_MESSENGER",
    "instagram": "COMPOSIO_AUTH_CONFIG_INSTAGRAM",
    "whatsapp_composio": "COMPOSIO_AUTH_CONFIG_WHATSAPP",
}

CHANNEL_TO_TOOLKIT_SLUG = {
    "messenger": "MESSENGER",
    "instagram": "INSTAGRAM",
    "whatsapp_composio": "WHATSAPP",
}

# Tool slugs probables — Composio nombra acciones con prefijo del toolkit.
SEND_TOOL_SLUG = {
    "messenger": "MESSENGER_SEND_MESSAGE",
    "instagram": "INSTAGRAM_SEND_DIRECT_MESSAGE",
    "whatsapp_composio": "WHATSAPP_SEND_MESSAGE",
}


def _normalize_channel(ch: str) -> str:
    """Map public channel name to internal storage key."""
    ch = (ch or "").strip().lower()
    if ch == "whatsapp":
        return "whatsapp_composio"
    if ch in CHANNELS:
        return ch
    raise HTTPException(status_code=400, detail=f"Canal desconocido: {ch}")


def _public_channel_label(internal: str) -> str:
    return "whatsapp" if internal == "whatsapp_composio" else internal


def _get_db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


def _api_key() -> str:
    """Compatibility sync helper. Solo lee env. Para leer DB usar `_api_key_async`."""
    key = (os.environ.get("COMPOSIO_API_KEY") or "").strip()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="COMPOSIO_API_KEY no configurada en el servidor. Configúrala en Workspaces → Configuración Global Composio.",
        )
    return key


async def _api_key_async() -> str:
    """DB first (panel founder), env fallback (deploy)."""
    from global_settings import get_composio_api_key
    key = await get_composio_api_key()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="COMPOSIO_API_KEY no configurada. Configúrala en Workspaces → Configuración Global Composio.",
        )
    return key


def _auth_config_id(channel: str) -> str:
    env_var = CHANNEL_TO_AUTH_CONFIG_ENV[channel]
    cfg = (os.environ.get(env_var) or "").strip()
    if not cfg:
        raise HTTPException(status_code=503, detail=f"{env_var} no configurada")
    return cfg


async def _ensure_plan_allows(ws: dict):
    """Premium / Elite / Founder Full habilitan canales sociales."""
    plan = ws.get("plan") or "essential"
    if plan not in ("premium", "elite", "founder_full"):
        raise HTTPException(
            status_code=403,
            detail=f"Canales sociales (Composio) no incluidos en el plan '{plan}'. Disponibles desde Premium.",
        )


async def _get_active_workspace(user: dict) -> dict:
    """Workspace activo del usuario, o el único que tiene si es admin de uno."""
    db = _get_db()
    ws_id = user.get("active_workspace_id") or (user.get("workspace_ids") or [None])[0]
    if not ws_id:
        raise HTTPException(status_code=403, detail="Sin workspace activo")
    ws = await db.workspaces.find_one({"id": ws_id}, {"_id": 0})
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace no encontrado")
    if user.get("role") != "founder_admin" and ws_id not in (user.get("workspace_ids") or []):
        raise HTTPException(status_code=403, detail="Sin acceso al workspace")
    return ws


def _public_callback_url() -> str:
    """Sync helper para casos legacy. Retorna URL desde env."""
    base = (os.environ.get("BACKEND_PUBLIC_URL") or "").rstrip("/")
    return f"{base}/api/composio/callback" if base else "/api/composio/callback"


async def _public_callback_url_async() -> str:
    """DB-aware. Si el founder configuró un public_url override en global_settings, úsalo."""
    from global_settings import get_effective_public_url
    base = (await get_effective_public_url()).rstrip("/")
    return f"{base}/api/composio/callback" if base else "/api/composio/callback"


# ---------- Composio HTTP client ----------
async def _composio_post(path: str, payload: dict) -> dict:
    """POST helper to Composio REST API. Returns parsed JSON or raises HTTPException."""
    url = f"{COMPOSIO_BASE}{path}"
    api_key = await _api_key_async()
    headers = {
        "x-api-key": api_key,
        "Authorization": f"Bearer {api_key}",  # algunos endpoints aceptan ambos
        "Content-Type": "application/json",
    }
    logger.debug(f"[Composio] POST {url}")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(url, json=payload, headers=headers)
        if r.status_code >= 400:
            logger.error(f"Composio POST {path} → {r.status_code}: {r.text[:500]}")
            raise HTTPException(
                status_code=502,
                detail=f"Composio error {r.status_code}: {r.text[:300]}",
            )
        return r.json()
    except httpx.HTTPError as e:
        logger.error(f"Composio HTTP error: {e}")
        raise HTTPException(status_code=502, detail=f"Composio HTTP error: {e}")


async def _composio_delete(path: str) -> dict:
    url = f"{COMPOSIO_BASE}{path}"
    try:
        api_key = await _api_key_async()
    except HTTPException as e:
        # Best-effort: si no hay api key, no podemos llamar a Composio pero no
        # debemos romper el flujo del caller (p. ej. cleanup local sigue siendo válido).
        logger.info(f"Composio DELETE skipped (no api key): {path}")
        return {"ok": False, "error": e.detail}
    headers = {"x-api-key": api_key, "Authorization": f"Bearer {api_key}"}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.delete(url, headers=headers)
        if r.status_code >= 400 and r.status_code != 404:
            logger.warning(f"Composio DELETE {path} → {r.status_code}: {r.text[:300]}")
        return {"ok": r.status_code < 400, "status": r.status_code}
    except httpx.HTTPError as e:
        logger.error(f"Composio DELETE error: {e}")
        return {"ok": False, "error": str(e)}


async def _composio_get(path: str, params: Optional[dict] = None) -> dict:
    """GET helper with same auth headers."""
    url = f"{COMPOSIO_BASE}{path}"
    api_key = await _api_key_async()
    headers = {"x-api-key": api_key, "Authorization": f"Bearer {api_key}"}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, headers=headers, params=params or {})
        if r.status_code >= 400:
            logger.error(f"Composio GET {path} → {r.status_code}: {r.text[:500]}")
            raise HTTPException(status_code=502, detail=f"Composio error {r.status_code}: {r.text[:300]}")
        return r.json()
    except httpx.HTTPError as e:
        logger.error(f"Composio GET HTTP error: {e}")
        raise HTTPException(status_code=502, detail=f"Composio HTTP error: {e}")


def _normalize_remote_status(raw: str) -> str:
    """Map Composio account status to our 4 states."""
    s = (raw or "").strip().upper()
    if s in ("ACTIVE", "INITIATED", "CONNECTED"):
        return "connected"
    if s in ("EXPIRED", "REVOKED"):
        return "expired"
    if s in ("FAILED", "INACTIVE"):
        return "error"
    if s in ("INITIALIZING", "PENDING"):
        return "pending"
    return "not_connected"


# ---------- Endpoints ----------
class ConnectResponse(BaseModel):
    channel: str
    redirect_url: str
    workspace_id: str


@composio_router.get("/status")
async def composio_status(user: dict = Depends(get_current_user)):
    """Estado de los 3 canales para el workspace activo."""
    ws = await _get_active_workspace(user)
    composio = (ws.get("integrations") or {}).get("composio") or {}
    out = {}
    for ch in CHANNELS:
        c = composio.get(ch) or {}
        item = {
            "connected_account_id": c.get("connected_account_id"),
            "auth_config_id": c.get("auth_config_id") or os.environ.get(CHANNEL_TO_AUTH_CONFIG_ENV[ch], ""),
            "status": c.get("status") or "not_connected",
            "last_sync_at": c.get("last_sync_at"),
            "last_error": c.get("last_error"),
        }
        if ch == "whatsapp_composio":
            item["waba_id"] = c.get("waba_id")
        out[_public_channel_label(ch)] = item
    return {
        "workspace_id": ws["id"],
        "workspace_slug": ws.get("slug"),
        "plan": ws.get("plan"),
        "plan_allows": ws.get("plan") in ("premium", "elite", "founder_full"),
        "whatsapp_provider": (ws.get("integrations") or {}).get("whatsapp_provider", "cloud_api"),
        "channels": out,
        "api_key_configured": bool((os.environ.get("COMPOSIO_API_KEY") or "").strip()),
    }


@composio_router.get("/connections")
async def composio_connections(user: dict = Depends(get_current_user)):
    """Sincroniza estado real desde Composio para el workspace activo.

    Llama a Composio y filtra por nuestros auth_config_ids; mapea el connected_account
    al canal correspondiente y persiste el estado normalizado (connected | expired | error | pending).
    Retorna el status actualizado tal como `/status`.
    """
    ws = await _get_active_workspace(user)
    db = _get_db()

    # Validar API key explícitamente para no enmascarar el error
    await _api_key_async()

    # Map auth_config_id → internal channel
    cfg_to_channel = {}
    for ch in CHANNELS:
        cfg = (os.environ.get(CHANNEL_TO_AUTH_CONFIG_ENV[ch]) or "").strip()
        if cfg:
            cfg_to_channel[cfg] = ch

    # Fetch connected accounts for this workspace's user_id (entity) — v3 only
    items = []
    try:
        logger.info(f"[Composio v3] GET /api/v3/connected_accounts ws={ws['id']}")
        data = await _composio_get(
            "/api/v3/connected_accounts",
            params={"user_id": ws["id"], "limit": 200},
        )
        items = data.get("items") or data.get("connected_accounts") or data.get("data") or []
    except HTTPException as e:
        logger.warning(f"[Composio v3] GET /api/v3/connected_accounts failed: {e.detail}")
        items = []

    # Build per-channel map of latest connection
    by_channel: Dict[str, dict] = {}
    for it in items:
        cfg_id = (
            (it.get("auth_config") or {}).get("id")
            or it.get("auth_config_id")
            or it.get("authConfigId")
        )
        if not cfg_id or cfg_id not in cfg_to_channel:
            continue
        ch = cfg_to_channel[cfg_id]
        # Prefer the most recent / active one
        prev = by_channel.get(ch)
        if not prev or (it.get("status") == "ACTIVE" and prev.get("status") != "ACTIVE"):
            by_channel[ch] = it

    # Persist normalized state per channel
    now_iso = datetime.now(timezone.utc).isoformat()
    composio_local = (ws.get("integrations") or {}).get("composio") or {}
    sync_summary = {}
    for ch in CHANNELS:
        local = composio_local.get(ch) or {}
        remote = by_channel.get(ch)
        if remote:
            normalized = _normalize_remote_status(remote.get("status"))
            update = {
                f"integrations.composio.{ch}.connected_account_id": remote.get("id") or remote.get("nano_id"),
                f"integrations.composio.{ch}.auth_config_id": (
                    (remote.get("auth_config") or {}).get("id")
                    or remote.get("auth_config_id")
                    or local.get("auth_config_id")
                ),
                f"integrations.composio.{ch}.status": normalized,
                f"integrations.composio.{ch}.last_sync_at": now_iso,
                f"integrations.composio.{ch}.last_error": None if normalized in ("connected", "pending") else (remote.get("error") or remote.get("last_error")),
            }
            await db.workspaces.update_one({"id": ws["id"]}, {"$set": update})
            sync_summary[_public_channel_label(ch)] = {"status": normalized, "remote_status": remote.get("status")}
        else:
            # No remote → si teníamos algo conectado lo marcamos expirado
            if local.get("status") == "connected" and local.get("connected_account_id"):
                await db.workspaces.update_one(
                    {"id": ws["id"]},
                    {"$set": {
                        f"integrations.composio.{ch}.status": "expired",
                        f"integrations.composio.{ch}.last_sync_at": now_iso,
                    }},
                )
                sync_summary[_public_channel_label(ch)] = {"status": "expired", "remote_status": None}
            else:
                sync_summary[_public_channel_label(ch)] = {"status": local.get("status") or "not_connected", "remote_status": None}

    # Return fresh status
    fresh_ws = await db.workspaces.find_one({"id": ws["id"]}, {"_id": 0})
    composio = (fresh_ws.get("integrations") or {}).get("composio") or {}
    out = {}
    for ch in CHANNELS:
        c = composio.get(ch) or {}
        out[_public_channel_label(ch)] = {
            "connected_account_id": c.get("connected_account_id"),
            "auth_config_id": c.get("auth_config_id") or os.environ.get(CHANNEL_TO_AUTH_CONFIG_ENV[ch], ""),
            "status": c.get("status") or "not_connected",
            "last_sync_at": c.get("last_sync_at"),
            "last_error": c.get("last_error"),
        }
    return {
        "workspace_id": ws["id"],
        "synced_at": now_iso,
        "remote_count": len(items),
        "matched_per_channel": sync_summary,
        "channels": out,
    }


@composio_router.post("/connect/{channel}", response_model=ConnectResponse)
async def composio_connect(channel: str, user: dict = Depends(get_current_user)):
    """Inicia OAuth en Composio v3. Devuelve redirect_url para abrir en una pestaña nueva."""
    internal = _normalize_channel(channel)
    ws = await _get_active_workspace(user)
    await _ensure_plan_allows(ws)
    auth_config_id = _auth_config_id(internal)

    callback = await _public_callback_url_async()
    callback_with_state = f"{callback}?ws={ws['id']}&channel={_public_channel_label(internal)}"

    # Composio v3: POST /api/v3/connected_accounts con shape nested (auth_config + connection)
    connection_block: Dict[str, Any] = {
        "user_id": ws["id"],
        "callback_url": callback_with_state,
    }
    # Para WhatsApp Business vía Composio, el WABA ID se pasa como initiation data
    if internal == "whatsapp_composio":
        ws_composio = (ws.get("integrations") or {}).get("composio") or {}
        waba_id = ((ws_composio.get("whatsapp_composio") or {}).get("waba_id") or "").strip()
        if not waba_id:
            raise HTTPException(
                status_code=400,
                detail="Falta WABA ID. Pega el WhatsApp Business Account ID del workspace antes de conectar.",
            )
        connection_block["data"] = {"business_account_id": waba_id}
    payload = {
        "auth_config": {"id": auth_config_id},
        "connection": connection_block,
    }
    logger.info(
        f"[Composio v3] POST /api/v3/connected_accounts ws={ws['id']} channel={internal} "
        f"callback={callback_with_state}"
    )
    data = await _composio_post("/api/v3/connected_accounts", payload)
    redirect_url = (
        data.get("redirect_url")
        or data.get("redirectUrl")
        or (data.get("connectionData") or {}).get("redirectUrl")
        or (data.get("connection_data") or {}).get("redirect_url")
        or (data.get("connection") or {}).get("redirect_url")
        or (data.get("connection") or {}).get("redirectUrl")
    )
    connection_id = (
        data.get("id")
        or data.get("nano_id")
        or data.get("connection_id")
        or data.get("connected_account_id")
        or data.get("connectedAccountId")
        or (data.get("connection") or {}).get("id")
    )
    logger.info(
        f"[Composio v3] connect/{internal} response: redirect_url={redirect_url} "
        f"connection_id={connection_id}"
    )

    if not redirect_url:
        logger.error(f"[Composio v3] Sin redirect_url en respuesta: {data}")
        raise HTTPException(status_code=502, detail="Composio no devolvió redirect_url")

    # Persist pending connection in workspace
    db = _get_db()
    update = {
        f"integrations.composio.{internal}": {
            "auth_config_id": auth_config_id,
            "connected_account_id": connection_id,  # placeholder hasta callback
            "status": "pending",
            "last_sync_at": None,
            "last_error": None,
        },
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.workspaces.update_one({"id": ws["id"]}, {"$set": update})
    return ConnectResponse(channel=_public_channel_label(internal), redirect_url=redirect_url, workspace_id=ws["id"])


@composio_router.get("/callback")
async def composio_callback(
    request: Request,
    ws: str = Query(..., description="workspace_id"),
    channel: str = Query(..., description="public channel name"),
):
    """Composio redirige aquí tras completar OAuth. Persiste el connected_account_id y redirige al CRM."""
    internal = _normalize_channel(channel)
    db = _get_db()
    workspace = await db.workspaces.find_one({"id": ws}, {"_id": 0})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace no encontrado")

    qp = dict(request.query_params)
    connected_account_id = (
        qp.get("connectedAccountId")
        or qp.get("connected_account_id")
        or qp.get("connection_id")
        or qp.get("id")
    )
    error_msg = qp.get("error") or qp.get("error_description")

    frontend_origin = (os.environ.get("BACKEND_PUBLIC_URL") or "").rstrip("/") or ""
    if error_msg:
        await db.workspaces.update_one(
            {"id": ws},
            {"$set": {
                f"integrations.composio.{internal}.status": "error",
                f"integrations.composio.{internal}.last_error": error_msg[:500],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        return RedirectResponse(url=f"{frontend_origin}/crm?composio_status=error&channel={_public_channel_label(internal)}")

    if not connected_account_id:
        return RedirectResponse(url=f"{frontend_origin}/crm?composio_status=missing&channel={_public_channel_label(internal)}")

    await db.workspaces.update_one(
        {"id": ws},
        {"$set": {
            f"integrations.composio.{internal}.connected_account_id": connected_account_id,
            f"integrations.composio.{internal}.status": "connected",
            f"integrations.composio.{internal}.last_sync_at": datetime.now(timezone.utc).isoformat(),
            f"integrations.composio.{internal}.last_error": None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    logger.info(f"Composio connected: ws={ws} channel={internal} cid={connected_account_id}")

    # Auto-setup triggers for this channel post-OAuth (best-effort, no blocking)
    try:
        from composio_triggers import auto_setup_trigger_for_channel
        await auto_setup_trigger_for_channel(workspace_id=ws, channel=_public_channel_label(internal))
    except Exception as e:
        logger.warning(f"Auto trigger setup failed for {ws}/{internal}: {e}")

    return RedirectResponse(url=f"{frontend_origin}/crm?composio_status=connected&channel={_public_channel_label(internal)}")


@composio_router.delete("/{channel}/disconnect")
async def composio_disconnect(channel: str, user: dict = Depends(get_current_user)):
    internal = _normalize_channel(channel)
    ws = await _get_active_workspace(user)
    db = _get_db()
    composio = (ws.get("integrations") or {}).get("composio") or {}
    ch_data = composio.get(internal) or {}
    cid = ch_data.get("connected_account_id")
    if cid:
        # Soft delete on Composio side (best-effort)
        await _composio_delete(f"/api/v3/connected_accounts/{cid}")

    await db.workspaces.update_one(
        {"id": ws["id"]},
        {"$set": {
            f"integrations.composio.{internal}": {
                "auth_config_id": _auth_config_id(internal),
                "connected_account_id": None,
                "status": "not_connected",
                "last_sync_at": None,
                "last_error": None,
            },
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True, "channel": _public_channel_label(internal)}


# ---------- WhatsApp provider toggle ----------
class WhatsAppProviderUpdate(BaseModel):
    provider: Literal["cloud_api", "composio"]


@composio_router.put("/whatsapp-provider")
async def set_whatsapp_provider(payload: WhatsAppProviderUpdate, user: dict = Depends(get_current_user)):
    """Elige qué proveedor de WhatsApp usa el workspace activo (uno solo a la vez)."""
    ws = await _get_active_workspace(user)
    db = _get_db()
    await db.workspaces.update_one(
        {"id": ws["id"]},
        {"$set": {
            "integrations.whatsapp_provider": payload.provider,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True, "whatsapp_provider": payload.provider}


# ---------- WhatsApp WABA ID (por workspace) ----------
class WhatsAppWabaIdUpdate(BaseModel):
    waba_id: str


@composio_router.put("/whatsapp-waba-id")
async def set_whatsapp_waba_id(payload: WhatsAppWabaIdUpdate, user: dict = Depends(get_current_user)):
    """Guarda el WhatsApp Business Account ID del workspace (requerido para algunas acciones de Composio)."""
    ws = await _get_active_workspace(user)
    waba_id = (payload.waba_id or "").strip()
    # Acepta vacío para limpiar; si viene valor, validación mínima (numérico o alfanumérico)
    if waba_id and len(waba_id) < 5:
        raise HTTPException(status_code=400, detail="WABA ID parece inválido (muy corto)")
    db = _get_db()
    await db.workspaces.update_one(
        {"id": ws["id"]},
        {"$set": {
            "integrations.composio.whatsapp_composio.waba_id": waba_id or None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True, "waba_id": waba_id or None}


# ---------- Webhook: HMAC verify + parse incoming message ----------
async def _verify_hmac(raw_body: bytes, headers: Dict[str, str]) -> bool:
    """Verify Composio webhook signature.

    Reglas:
    - En `ENVIRONMENT=production` (default): firma OBLIGATORIA. Sin secret configurado → False.
    - En `ENVIRONMENT=development`: si falta el secret se permite el bypass (logueado como warning).

    Lee el secret de DB (panel founder) primero, fallback a env.
    """
    env = (os.environ.get("ENVIRONMENT") or "production").strip().lower()
    from global_settings import get_composio_webhook_secret
    secret = await get_composio_webhook_secret()

    if not secret:
        if env == "development":
            logger.warning("COMPOSIO_WEBHOOK_SECRET vacío y ENVIRONMENT=development → HMAC bypass")
            return True
        logger.error("COMPOSIO_WEBHOOK_SECRET no configurado en producción: rechazando webhook")
        return False

    sig_header = (
        headers.get("webhook-signature")
        or headers.get("x-composio-signature")
        or headers.get("x-signature")
        or ""
    ).strip()
    wh_id = (headers.get("webhook-id") or headers.get("x-webhook-id") or "").strip()
    wh_ts = (headers.get("webhook-timestamp") or headers.get("x-webhook-timestamp") or "").strip()

    if not sig_header:
        return False

    try:
        body_str = raw_body.decode("utf-8", errors="ignore")
        candidates = []
        # Formato standard webhooks (recomendado)
        if wh_id and wh_ts:
            candidates.append(f"{wh_id}.{wh_ts}.{body_str}")
            # tolerancia 5 min
            try:
                if abs(int(time.time()) - int(wh_ts)) > 600:
                    return False
            except ValueError:
                return False
        # Formato simple: HMAC del body directo
        candidates.append(body_str)

        for content in candidates:
            digest = hmac.new(secret.encode("utf-8"), content.encode("utf-8"), hashlib.sha256).hexdigest()
            # Acepta firmas plain hex o con prefijo "v1=..." / "sha256=..."
            for sig in (sig_header, sig_header.split(",")[-1]):
                clean = sig.split("=", 1)[-1].strip()
                if hmac.compare_digest(clean, digest):
                    return True
        return False
    except Exception as e:
        logger.error(f"HMAC verify error: {e}")
        return False


def _extract_inbound(payload: dict) -> Optional[dict]:
    """Parse Composio inbound webhook → {channel, sender_id, message, message_id, contact_phone, contact_name, user_id}.

    Soporta el formato V3 ({type, metadata, data}) y formatos legacy.
    """
    metadata = payload.get("metadata") or payload.get("meta") or {}
    data = payload.get("data") or payload.get("payload") or payload

    # Trigger / channel detection
    slug = (metadata.get("trigger_slug") or metadata.get("triggerName") or payload.get("trigger") or "").lower()
    user_id = metadata.get("user_id") or metadata.get("entity_id") or payload.get("user_id")
    cid_in_meta = metadata.get("connected_account_id") or metadata.get("connectedAccountId")

    if "instagram" in slug:
        channel = "instagram"
    elif "messenger" in slug or "facebook" in slug:
        channel = "messenger"
    elif "whatsapp" in slug:
        channel = "whatsapp_composio"
    else:
        return None  # ignorar eventos no-mensaje

    sender_id = (
        data.get("sender_id")
        or data.get("from")
        or data.get("sender", {}).get("id")
        or data.get("phone_number")
        or data.get("from_number")
    )
    message_text = (
        data.get("message")
        or data.get("text")
        or (data.get("message_data") or {}).get("text")
        or data.get("content")
    )
    message_id = data.get("message_id") or data.get("mid") or data.get("id")
    contact_name = data.get("sender_username") or data.get("contact_name") or data.get("from_name")
    phone = data.get("from") if channel == "whatsapp_composio" else None

    if not sender_id and not phone:
        return None
    if not message_text:
        return None

    return {
        "channel": channel,
        "sender_id": str(sender_id or phone or ""),
        "message": str(message_text),
        "message_id": str(message_id or ""),
        "contact_name": contact_name,
        "phone": phone,
        "user_id": user_id,
        "connected_account_id": cid_in_meta,
    }


@composio_router.post("/webhook")
async def composio_webhook(request: Request, ws: Optional[str] = Query(None)):
    """Recibe eventos de Composio (mensajes entrantes). Verifica HMAC y persiste."""
    raw = await request.body()
    headers = {k.lower(): v for k, v in request.headers.items()}

    hmac_ok = await _verify_hmac(raw, headers)
    if not hmac_ok:
        logger.warning(
            f"[Composio webhook] HMAC verification failed. "
            f"headers_keys={list(headers.keys())[:8]}, body_len={len(raw)}"
        )
        # Log even rejected webhooks for debug visibility
        try:
            from composio_triggers import log_webhook_event
            try:
                payload_for_log = await request.json()
            except Exception:
                payload_for_log = {"_raw_preview": raw[:500].decode("utf-8", errors="ignore")}
            await log_webhook_event(
                workspace_id=ws, channel=None, parsed_ok=False,
                payload=payload_for_log, headers=headers, hmac_ok=False,
                error="HMAC verification failed",
            )
        except Exception:
            pass
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    parsed = _extract_inbound(payload)
    logger.info(
        f"[Composio webhook] received hmac_ok=True parsed={bool(parsed)} "
        f"trigger={(payload.get('metadata') or {}).get('trigger_slug')} ws_query={ws}"
    )

    if not parsed:
        # Eventos no-mensaje (connection.created, etc.) → ack + log
        try:
            from composio_triggers import log_webhook_event
            await log_webhook_event(
                workspace_id=ws, channel=None, parsed_ok=False,
                payload=payload, headers=headers, hmac_ok=True,
                error="not an inbound message event",
            )
        except Exception:
            pass
        return {"ok": True, "ignored": True}

    db = _get_db()
    # Resolver workspace: por ws query → metadata.user_id → connected_account_id
    workspace_id = ws or parsed.get("user_id")
    if not workspace_id and parsed.get("connected_account_id"):
        wsd = await db.workspaces.find_one(
            {f"integrations.composio.{parsed['channel']}.connected_account_id": parsed["connected_account_id"]},
            {"_id": 0, "id": 1},
        )
        if wsd:
            workspace_id = wsd["id"]

    if not workspace_id:
        logger.warning("Composio webhook: cannot resolve workspace from payload")
        try:
            from composio_triggers import log_webhook_event
            await log_webhook_event(
                workspace_id=None, channel=parsed.get("channel"), parsed_ok=False,
                payload=payload, headers=headers, hmac_ok=True,
                error="cannot resolve workspace_id",
            )
        except Exception:
            pass
        return {"ok": True, "unresolved": True}

    # Identificadores por canal para unificación
    channel = parsed["channel"]
    public_channel = _public_channel_label(channel)
    sender_id = parsed["sender_id"]
    phone = parsed.get("phone") if channel == "whatsapp_composio" else None
    instagram_id = sender_id if channel == "instagram" else None
    messenger_id = sender_id if channel == "messenger" else None

    contact_id = await upsert_contact_from_signal(
        db,
        workspace_id,
        phone=phone,
        name=parsed.get("contact_name"),
        source=f"composio_{public_channel}",
        instagram_id=instagram_id,
        messenger_id=messenger_id,
    )

    # Map composio internal channel → messaging.VALID_CHANNELS
    messaging_channel = "whatsapp" if channel == "whatsapp_composio" else channel
    # Persist message + upsert conversation (inbox) — emite SSE realtime
    from inbox import upsert_conversation_and_message
    await upsert_conversation_and_message(
        db,
        workspace_id=workspace_id,
        contact_id=contact_id,
        channel=messaging_channel,
        direction="inbound",
        body=parsed["message"],
        provider="composio",
        external_sender_id=sender_id,
        external_message_id=parsed.get("message_id"),
        message_type="text",
        raw_payload=payload,
    )

    # Debug log
    try:
        from composio_triggers import log_webhook_event
        await log_webhook_event(
            workspace_id=workspace_id, channel=public_channel, parsed_ok=True,
            payload=payload, headers=headers, hmac_ok=True, contact_id=contact_id,
        )
    except Exception:
        pass

    return {"ok": True, "channel": public_channel, "contact_id": contact_id}


# ---------- Outbound send ----------
class SendRequest(BaseModel):
    channel: str  # messenger | instagram | whatsapp
    to: str = Field(..., description="recipient_id (FB/IG) o teléfono E.164 (WA)")
    message: str = Field(..., min_length=1, max_length=4000)
    contact_id: Optional[str] = None


@composio_router.post("/send")
async def composio_send(payload: SendRequest, user: dict = Depends(get_current_user)):
    internal = _normalize_channel(payload.channel)
    ws = await _get_active_workspace(user)
    await _ensure_plan_allows(ws)
    composio = (ws.get("integrations") or {}).get("composio") or {}
    ch_data = composio.get(internal) or {}
    cid = ch_data.get("connected_account_id")
    if not cid or ch_data.get("status") != "connected":
        raise HTTPException(status_code=409, detail=f"Canal {_public_channel_label(internal)} no conectado")

    tool_slug = SEND_TOOL_SLUG[internal]
    if internal == "whatsapp_composio":
        args = {"phone_number": payload.to, "message": payload.message}
        waba_id = ((ch_data or {}).get("waba_id") or "").strip()
        if waba_id:
            args["business_account_id"] = waba_id
    else:
        args = {"recipient_id": payload.to, "message": payload.message}

    # Composio v3: POST /api/v3/actions/execute
    body = {
        "action": tool_slug,
        "connected_account_id": cid,
        "user_id": ws["id"],
        "input": args,
    }
    logger.info(f"[Composio v3] POST /api/v3/actions/execute action={tool_slug} ws={ws['id']}")
    result = await _composio_post("/api/v3/actions/execute", body)

    db = _get_db()
    public_channel = _public_channel_label(internal)
    messaging_channel = "whatsapp" if internal == "whatsapp_composio" else internal
    await record_message(
        db,
        ws["id"],
        channel=messaging_channel,
        direction="outbound",
        content=payload.message,
        contact_id=payload.contact_id,
        metadata={
            "provider": "composio",
            "tool": tool_slug,
            "to": payload.to,
            "channel_label": public_channel,
            "result": (result if isinstance(result, dict) else {})
        },
    )
    return {"ok": True, "channel": public_channel, "result": result}
