"""
ACTIVA — Composio triggers admin (founder + workspace_admin).

Usa el **SDK Python oficial `composio`** para descubrir, inspeccionar, crear y
eliminar triggers. NO usa `subscribe()` ni `wait_forever()`: los eventos
inbound siguen llegando al webhook público `/api/composio/webhook`.

Endpoints expuestos:
  GET    /api/composio/triggers/types                → trigger types disponibles (filtrable por toolkit)
  GET    /api/composio/triggers/types/{slug}         → config schema (campos requeridos)
  POST   /api/composio/triggers/setup                → setup de los 3 canales (founder)
  POST   /api/composio/triggers/setup-mine           → setup para el workspace activo
  GET    /api/composio/triggers/status               → triggers configurados
  DELETE /api/composio/triggers/{trigger_id}         → desactiva/elimina un trigger
  GET    /api/composio/webhook-events                → últimos eventos (debug)

Sobre la sincronía: el SDK es síncrono. Cada llamada se envuelve en
`asyncio.to_thread` para no bloquear el loop de FastAPI.
"""
from __future__ import annotations

import os
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient

from auth import require_founder, get_current_user
from composio import Composio

logger = logging.getLogger(__name__)
triggers_router = APIRouter(prefix="/api/composio/triggers", tags=["ComposioTriggers"])
events_router = APIRouter(prefix="/api/composio", tags=["ComposioEvents"])


def _get_db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


# Toolkits soportados en el inbox.
# Composio nombra "facebook" al toolkit que cubre Messenger.
PUBLIC_CHANNEL_TO_TOOLKIT = {
    "whatsapp": "whatsapp",
    "instagram": "instagram",
    "messenger": "facebook",
}
PUBLIC_CHANNELS = list(PUBLIC_CHANNEL_TO_TOOLKIT.keys())

# Heurística para detectar el trigger de "mensaje recibido" en cada toolkit.
_INBOUND_KEYWORDS = (
    "message_received", "messagereceived", "received_message",
    "new_message", "newmessage", "incoming_message", "incomingmessage",
    "inbound_message", "inboundmessage", "receive_message",
    "message_create", "messagecreate",
)


def _looks_like_inbound_message_trigger(slug: str, name: str = "") -> bool:
    s = (slug or "").lower()
    n = (name or "").lower()
    text = f"{s} {n}"
    has_message = "message" in text or "dm " in text or "dm_" in text
    has_inbound = (
        any(k in s for k in _INBOUND_KEYWORDS)
        or "received" in text
        or "inbound" in text
        or "incoming" in text
        or "new message" in text
    )
    return has_message and has_inbound


async def _get_active_workspace_id(actor: dict) -> str:
    ws_id = actor.get("active_workspace_id") or (actor.get("workspace_ids") or [None])[0]
    if not ws_id:
        raise HTTPException(status_code=400, detail="Sin workspace activo")
    if actor.get("role") != "founder_admin" and ws_id not in (actor.get("workspace_ids") or []):
        raise HTTPException(status_code=403, detail="Sin acceso al workspace")
    return ws_id


async def _public_webhook_url() -> str:
    from global_settings import get_effective_public_url
    base = (await get_effective_public_url()).rstrip("/")
    if not base:
        raise HTTPException(
            status_code=503,
            detail="BACKEND_PUBLIC_URL no configurada. Configúrala en /crm → Integraciones → Configuración global.",
        )
    return f"{base}/api/composio/webhook"


async def _composio_client() -> Composio:
    """Crea un cliente Composio con la API key actual (DB > env)."""
    from global_settings import get_composio_api_key
    key = await get_composio_api_key()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="COMPOSIO_API_KEY no configurada. Configúrala en /crm → Integraciones → Configuración global Composio.",
        )
    return Composio(api_key=key)


def _to_dict(obj: Any) -> Dict[str, Any]:
    """Helper: el SDK retorna pydantic models; convertir a dict de forma robusta."""
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    for fn in ("model_dump", "dict", "to_dict"):
        if hasattr(obj, fn):
            try:
                return getattr(obj, fn)()
            except Exception:
                continue
    try:
        return dict(obj)
    except Exception:
        return {"_repr": repr(obj)[:200]}


def _items_from(obj: Any) -> List[Any]:
    if obj is None:
        return []
    if isinstance(obj, list):
        return obj
    for attr in ("items", "data", "trigger_types", "results"):
        if hasattr(obj, attr):
            v = getattr(obj, attr)
            if v is not None:
                return list(v)
    if isinstance(obj, dict):
        for k in ("items", "data", "trigger_types", "results"):
            if k in obj:
                return list(obj[k] or [])
    return []


# ---------- Discovery ----------
@triggers_router.get("/types")
async def list_trigger_types(
    actor: dict = Depends(require_founder),
    toolkit: Optional[str] = Query(None, description="filtrar por toolkit (whatsapp|instagram|facebook)"),
):
    """Lista trigger types disponibles, marcando los candidatos a 'inbound message'."""
    client = await _composio_client()
    toolkits = [toolkit] if toolkit else list(PUBLIC_CHANNEL_TO_TOOLKIT.values())

    out: List[Dict[str, Any]] = []
    errors: Dict[str, str] = {}
    for tk in toolkits:
        try:
            resp = await asyncio.to_thread(client.triggers.list, toolkit_slugs=[tk], limit=100)
        except Exception as e:
            errors[tk] = str(e)[:200]
            continue
        for it in _items_from(resp):
            d = _to_dict(it)
            slug = d.get("slug") or d.get("name") or d.get("trigger_slug") or ""
            name = d.get("display_name") or d.get("displayName") or d.get("name") or ""
            out.append({
                "slug": slug,
                "name": name,
                "toolkit": tk,
                "description": d.get("description") or d.get("desc"),
                "is_inbound_message_candidate": _looks_like_inbound_message_trigger(slug, name),
            })
    return {
        "items": out,
        "count": len(out),
        "candidates": [t for t in out if t["is_inbound_message_candidate"]],
        "errors": errors or None,
    }


@triggers_router.get("/types/{slug}")
async def get_trigger_type(slug: str, actor: dict = Depends(get_current_user)):
    """Devuelve el config schema del trigger (lo que `trigger_config` debe contener)."""
    client = await _composio_client()
    try:
        tt = await asyncio.to_thread(client.triggers.get_type, slug)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Composio get_type({slug}): {str(e)[:200]}")
    d = _to_dict(tt)
    config_schema = d.get("config") or d.get("config_schema") or {}
    if hasattr(config_schema, "model_dump"):
        config_schema = config_schema.model_dump()
    properties = (config_schema or {}).get("properties") or {}
    required = (config_schema or {}).get("required") or []
    fields = []
    for key, meta in properties.items():
        meta = meta if isinstance(meta, dict) else _to_dict(meta)
        fields.append({
            "key": key,
            "type": meta.get("type") or "string",
            "title": meta.get("title") or key,
            "description": meta.get("description"),
            "default": meta.get("default"),
            "required": key in required,
            "enum": meta.get("enum"),
        })
    return {
        "slug": slug,
        "name": d.get("display_name") or d.get("name"),
        "description": d.get("description"),
        "toolkit": d.get("toolkit") or d.get("toolkit_slug"),
        "fields": fields,
        "required": required,
        "raw_config": config_schema,
    }


async def _resolve_inbound_slug(client: Composio, toolkit: str) -> Optional[str]:
    try:
        resp = await asyncio.to_thread(client.triggers.list, toolkit_slugs=[toolkit], limit=50)
    except Exception as e:
        logger.info(f"[triggers.list] {toolkit} → {e}")
        return None
    for it in _items_from(resp):
        d = _to_dict(it)
        s = d.get("slug") or d.get("name") or ""
        n = d.get("display_name") or d.get("name") or ""
        if _looks_like_inbound_message_trigger(s, n):
            return s
    return None


async def _config_required_fields(client: Composio, slug: str) -> List[str]:
    """Lista de campos required del trigger_config schema (vacío si no requiere nada)."""
    try:
        tt = await asyncio.to_thread(client.triggers.get_type, slug)
    except Exception as e:
        logger.info(f"[triggers.get_type] {slug} → {e}")
        return []
    d = _to_dict(tt)
    cfg = d.get("config") or d.get("config_schema") or {}
    if hasattr(cfg, "model_dump"):
        cfg = cfg.model_dump()
    return list((cfg or {}).get("required") or [])




# ---------- Diagnostic: raw trigger types per channel ----------
# Slugs probables que Composio puede usar para cada canal.
# Probamos todas las variantes para no asumir.
DIAG_TOOLKIT_VARIANTS = {
    "instagram": ["instagram", "instagram_business", "instagram_business_account", "instagram_basic", "ig"],
    "messenger": ["facebook", "messenger", "facebook_pages", "facebook_messenger", "fb_messenger", "facebook_page"],
    "whatsapp": ["whatsapp", "whatsapp_business", "whatsapp_business_account", "whatsapp_cloud"],
}


def _why_not_inbound(slug: str, name: str) -> str:
    """Para cada trigger NO-inbound, explica por qué fue descartado.
    Útil para entender por qué la heurística no matchea.
    """
    s = (slug or "").lower()
    n = (name or "").lower()
    text = f"{s} {n}"
    has_message = "message" in text or "dm " in text or "dm_" in text
    has_inbound = (
        any(k in s for k in _INBOUND_KEYWORDS)
        or "received" in text
        or "inbound" in text
        or "incoming" in text
        or "new message" in text
    )
    if has_message and has_inbound:
        return "MATCH: parece inbound message"
    reasons = []
    if not has_message:
        reasons.append("no contiene 'message'/'dm'")
    if not has_inbound:
        reasons.append("no contiene 'received'/'inbound'/'incoming'/'new_message'")
    return "; ".join(reasons) or "no match heurística"


@triggers_router.get("/raw-types")
async def raw_trigger_types(
    actor: dict = Depends(get_current_user),
    channel: str = Query(..., description="canal a diagnosticar: instagram | messenger | whatsapp"),
):
    """**Diagnóstico**: devuelve TODOS los trigger types crudos para todas las variantes
    de toolkit slug del canal, sin filtrar por inbound. Útil para descubrir el slug real.

    No requiere ser founder — un workspace_admin también puede diagnosticar.
    """
    ch = (channel or "").strip().lower()
    if ch not in DIAG_TOOLKIT_VARIANTS:
        raise HTTPException(status_code=400, detail=f"channel inválido. Usa: {list(DIAG_TOOLKIT_VARIANTS.keys())}")

    client = await _composio_client()
    variants = DIAG_TOOLKIT_VARIANTS[ch]
    summary: Dict[str, Dict[str, Any]] = {}
    all_items: List[Dict[str, Any]] = []

    for tk in variants:
        toolkit_summary: Dict[str, Any] = {"toolkit": tk, "count": 0, "error": None, "slugs": []}
        try:
            resp = await asyncio.to_thread(client.triggers.list, toolkit_slugs=[tk], limit=100)
        except Exception as e:
            toolkit_summary["error"] = str(e)[:300]
            logger.warning(f"[raw-types] {ch}/{tk} → {e}")
            summary[tk] = toolkit_summary
            continue

        items = _items_from(resp)
        toolkit_summary["count"] = len(items)
        logger.info(f"[raw-types] {ch}/{tk} → {len(items)} triggers")

        for it in items:
            d = _to_dict(it)
            # Conservar TODO el dict crudo, no solo los campos heurísticos
            slug = d.get("slug") or d.get("name") or d.get("trigger_slug") or ""
            name = d.get("display_name") or d.get("displayName") or d.get("name") or ""
            description = d.get("description") or d.get("desc")
            config_schema = d.get("config") or d.get("config_schema") or {}
            if hasattr(config_schema, "model_dump"):
                config_schema = config_schema.model_dump()
            is_match = _looks_like_inbound_message_trigger(slug, name)
            reason = _why_not_inbound(slug, name)
            entry = {
                "toolkit": tk,
                "slug": slug,
                "name": name,
                "description": description,
                "is_inbound_message_candidate": is_match,
                "discard_reason": None if is_match else reason,
                "config_schema": config_schema,
                "raw_keys": sorted([k for k in d.keys() if not k.startswith("_")]),
            }
            all_items.append(entry)
            toolkit_summary["slugs"].append(slug)
            logger.info(f"[raw-types] {ch}/{tk} slug={slug!r} match={is_match} reason={reason}")

        summary[tk] = toolkit_summary

    candidates = [e for e in all_items if e["is_inbound_message_candidate"]]

    return {
        "channel": ch,
        "variants_tried": variants,
        "summary_per_toolkit": summary,
        "total_triggers": len(all_items),
        "inbound_candidates_count": len(candidates),
        "inbound_candidates": candidates,
        "all_items": all_items,
        "note": (
            "Cada item incluye el config_schema crudo y la razón de descarte si no es inbound. "
            "Si total_triggers=0 para un toolkit pero error=null, ese slug no existe en Composio. "
            "Si todos los toolkits del canal devuelven 0 triggers, Composio NO expone triggers "
            "para ese canal en tu cuenta — sería necesario contactar a Composio o usar Meta directo."
        ),
    }



# ---------- Setup ----------
class TriggerSetupPayload(BaseModel):
    workspace_id: Optional[str] = None
    # Slug overrides — útil cuando ya conoces el slug exacto.
    whatsapp_slug: Optional[str] = None
    instagram_slug: Optional[str] = None
    messenger_slug: Optional[str] = None
    # Configuración por canal (mapea a `trigger_config`). Si vienen campos required vacíos
    # devolvemos status='needs_config' con la lista de faltantes para que la UI los pida.
    whatsapp_config: Optional[Dict[str, Any]] = None
    instagram_config: Optional[Dict[str, Any]] = None
    messenger_config: Optional[Dict[str, Any]] = None


async def _setup_triggers_for_workspace(
    *,
    workspace_id: str,
    actor_email: str,
    overrides: Optional[Dict[str, Optional[str]]] = None,
    configs: Optional[Dict[str, Optional[Dict[str, Any]]]] = None,
) -> Dict[str, Any]:
    db = _get_db()
    ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace no encontrado")

    composio_int = (ws.get("integrations") or {}).get("composio") or {}
    overrides = overrides or {}
    configs = configs or {}

    cid_map = {
        "whatsapp": (composio_int.get("whatsapp_composio") or {}).get("connected_account_id"),
        "instagram": (composio_int.get("instagram") or {}).get("connected_account_id"),
        "messenger": (composio_int.get("messenger") or {}).get("connected_account_id"),
    }

    # Lazy: solo creamos el SDK client si al menos un canal está conectado.
    client: Optional[Composio] = None
    if any(cid_map.values()):
        client = await _composio_client()

    results: Dict[str, Dict[str, Any]] = {}
    for channel, toolkit in PUBLIC_CHANNEL_TO_TOOLKIT.items():
        cid = cid_map.get(channel)
        result: Dict[str, Any] = {"channel": channel, "toolkit": toolkit, "connected_account_id": cid}

        if not cid:
            result["status"] = "skipped"
            result["reason"] = "Canal no conectado todavía (sin connected_account_id)"
            results[channel] = result
            continue

        # 1) Resolver slug
        slug: Optional[str] = overrides.get(channel)
        if not slug:
            try:
                slug = await _resolve_inbound_slug(client, toolkit)
            except Exception as e:
                result["status"] = "error"
                result["error"] = f"resolve_slug: {str(e)[:200]}"
                results[channel] = result
                continue
        result["slug_resolved"] = slug
        if not slug:
            result["status"] = "skipped"
            result["reason"] = f"No se encontró un trigger inbound message en toolkit '{toolkit}'"
            results[channel] = result
            continue

        # 2) Inspeccionar config requerida
        try:
            required_fields = await _config_required_fields(client, slug)
        except Exception:
            required_fields = []
        provided_config = configs.get(channel) or {}
        missing = [k for k in required_fields if not provided_config.get(k)]
        if missing:
            result["status"] = "needs_config"
            result["required_fields"] = required_fields
            result["missing_fields"] = missing
            result["slug"] = slug
            results[channel] = result
            continue

        # 3) Crear trigger instance
        try:
            created = await asyncio.to_thread(
                client.triggers.create,
                slug=slug,
                user_id=workspace_id,
                connected_account_id=cid,
                trigger_config=provided_config or {},
            )
        except Exception as e:
            result["status"] = "error"
            result["error"] = f"create: {str(e)[:300]}"
            results[channel] = result
            continue

        d = _to_dict(created)
        trigger_id = (
            d.get("trigger_id")
            or d.get("id")
            or d.get("nano_id")
            or (d.get("trigger") or {}).get("id")
        )
        result["status"] = "created" if trigger_id else "ok"
        result["trigger_id"] = trigger_id
        result["trigger_config"] = provided_config or {}

        await db.composio_triggers.update_one(
            {"workspace_id": workspace_id, "channel": channel},
            {"$set": {
                "workspace_id": workspace_id,
                "channel": channel,
                "toolkit": toolkit,
                "slug": slug,
                "trigger_id": trigger_id,
                "connected_account_id": cid,
                "trigger_config": provided_config or {},
                "status": "active",
                "last_synced_at": datetime.now(timezone.utc).isoformat(),
                "created_by": actor_email,
            }},
            upsert=True,
        )
        results[channel] = result

    return {
        "workspace_id": workspace_id,
        "results": results,
        "webhook_url": await _public_webhook_url(),
        "note": "Si algún canal está skipped, conecta el OAuth en /crm → Integraciones primero. Si está needs_config, completa los campos requeridos y reintenta.",
    }


@triggers_router.post("/setup")
async def setup_triggers(payload: TriggerSetupPayload, actor: dict = Depends(require_founder)):
    """Founder: crea trigger instances para los 3 canales de un workspace específico."""
    workspace_id = payload.workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="workspace_id requerido")
    return await _setup_triggers_for_workspace(
        workspace_id=workspace_id,
        actor_email=actor["email"],
        overrides={
            "whatsapp": payload.whatsapp_slug,
            "instagram": payload.instagram_slug,
            "messenger": payload.messenger_slug,
        },
        configs={
            "whatsapp": payload.whatsapp_config,
            "instagram": payload.instagram_config,
            "messenger": payload.messenger_config,
        },
    )


@triggers_router.post("/setup-mine")
async def setup_triggers_for_active_workspace(
    payload: Optional[TriggerSetupPayload] = None,
    actor: dict = Depends(get_current_user),
):
    """Workspace_admin / founder: crea triggers para SU workspace activo.
    Acepta el mismo body que /setup (excepto workspace_id, que se ignora).
    """
    ws_id = await _get_active_workspace_id(actor)
    p = payload or TriggerSetupPayload()
    return await _setup_triggers_for_workspace(
        workspace_id=ws_id,
        actor_email=actor["email"],
        overrides={
            "whatsapp": p.whatsapp_slug,
            "instagram": p.instagram_slug,
            "messenger": p.messenger_slug,
        },
        configs={
            "whatsapp": p.whatsapp_config,
            "instagram": p.instagram_config,
            "messenger": p.messenger_config,
        },
    )


# ---------- Status ----------
@triggers_router.get("/status")
async def trigger_status(
    actor: dict = Depends(get_current_user),
    workspace_id: Optional[str] = None,
):
    """Lista los triggers persistidos. Founder ve todos; admin solo los suyos."""
    db = _get_db()
    q: Dict[str, Any] = {}
    if actor.get("role") == "founder_admin":
        if workspace_id:
            q["workspace_id"] = workspace_id
    else:
        q["workspace_id"] = await _get_active_workspace_id(actor)

    items = await db.composio_triggers.find(q, {"_id": 0}).sort("last_synced_at", -1).limit(200).to_list(200)
    return {"items": items, "count": len(items), "webhook_url": await _public_webhook_url()}


# ---------- Disable / delete ----------
@triggers_router.delete("/{trigger_id}")
async def disable_trigger(trigger_id: str, actor: dict = Depends(require_founder)):
    """Best-effort: pide a Composio que elimine/desactive y limpia el registro local."""
    db = _get_db()
    sdk_result: Dict[str, Any] = {}
    try:
        client = await _composio_client()
        try:
            resp = await asyncio.to_thread(client.triggers.delete, trigger_id)
            sdk_result = {"ok": True, "delete": _to_dict(resp)}
        except Exception as e_del:
            # Si delete no existe, intentamos disable
            try:
                resp = await asyncio.to_thread(client.triggers.disable, trigger_id)
                sdk_result = {"ok": True, "disable": _to_dict(resp)}
            except Exception as e_dis:
                sdk_result = {"ok": False, "delete_error": str(e_del)[:200], "disable_error": str(e_dis)[:200]}
    except HTTPException as e:
        # Sin api key → seguimos con cleanup local
        sdk_result = {"ok": False, "error": e.detail}

    await db.composio_triggers.update_one(
        {"trigger_id": trigger_id},
        {"$set": {"status": "disabled", "disabled_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "trigger_id": trigger_id, "composio": sdk_result}


# ---------- Auto-setup helper (called by OAuth callback) ----------
async def auto_setup_trigger_for_channel(*, workspace_id: str, channel: str) -> Dict[str, Any]:
    """Best-effort: tras OAuth, descubre slug y crea trigger. NO levanta excepciones."""
    try:
        result = await _setup_triggers_for_workspace(
            workspace_id=workspace_id, actor_email="auto:oauth-callback",
        )
        ch_result = (result.get("results") or {}).get(channel) or {"status": "skipped"}
        logger.info(f"[auto_setup_trigger] ws={workspace_id} ch={channel} → {ch_result.get('status')}")
        return ch_result
    except Exception as e:
        logger.warning(f"[auto_setup_trigger] failed ws={workspace_id} ch={channel}: {e}")
        return {"status": "error", "error": str(e)}


# ---------- Webhook events (debug) ----------
@events_router.get("/webhook-events")
async def list_webhook_events(
    actor: dict = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=200),
    workspace_id: Optional[str] = None,
):
    db = _get_db()
    q: Dict[str, Any] = {}
    if actor.get("role") == "founder_admin":
        if workspace_id:
            q["workspace_id"] = workspace_id
    else:
        q["workspace_id"] = await _get_active_workspace_id(actor)

    events = await db.composio_webhook_events.find(q, {"_id": 0}).sort("received_at", -1).limit(limit).to_list(limit)
    return {"items": events, "count": len(events)}


_PAYLOAD_MAX_BYTES = 65536  # 64KB cap para evitar abuso


def _truncate_payload(p: Any) -> Any:
    """Recorta el payload guardado en DB para evitar Mongo doc oversize."""
    try:
        import json
        s = json.dumps(p, default=str)
        if len(s) <= _PAYLOAD_MAX_BYTES:
            return p
        return {"_truncated": True, "_size_bytes": len(s), "_preview": s[:_PAYLOAD_MAX_BYTES]}
    except Exception:
        return {"_repr": repr(p)[:_PAYLOAD_MAX_BYTES]}


async def log_webhook_event(
    *,
    workspace_id: Optional[str],
    channel: Optional[str],
    parsed_ok: bool,
    payload: dict,
    headers: Dict[str, str],
    hmac_ok: bool,
    contact_id: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    """Persiste cada webhook recibido para debug."""
    db = _get_db()
    safe_headers = {
        k: v for k, v in headers.items()
        if k.lower() not in ("authorization", "cookie", "webhook-signature", "x-composio-signature", "x-signature")
    }
    doc = {
        "received_at": datetime.now(timezone.utc).isoformat(),
        "workspace_id": workspace_id,
        "channel": channel,
        "parsed_ok": parsed_ok,
        "hmac_ok": hmac_ok,
        "trigger_slug": (payload.get("metadata") or {}).get("trigger_slug") or payload.get("trigger") or payload.get("type"),
        "headers": safe_headers,
        "payload": _truncate_payload(payload),
        "contact_id": contact_id,
        "error": error,
    }
    try:
        await db.composio_webhook_events.insert_one(doc)
    except Exception as e:
        logger.warning(f"No se pudo loguear webhook event: {e}")


async def ensure_webhook_events_indexes(db):
    await db.composio_webhook_events.create_index([("received_at", -1)])
    await db.composio_webhook_events.create_index([("workspace_id", 1), ("received_at", -1)])
    try:
        await db.composio_triggers.create_index(
            [("workspace_id", 1), ("channel", 1)], unique=True
        )
    except Exception:
        pass
