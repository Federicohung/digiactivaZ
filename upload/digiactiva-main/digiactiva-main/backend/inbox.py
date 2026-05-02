"""
ACTIVA — Unified Inbox (omnichannel).

Centraliza WhatsApp + Instagram DM + Messenger (+ web_chat) en una sola bandeja.
Maneja `crm_conversations` (1 doc por contacto+canal) y reusa `crm_messages`.

Realtime: emite eventos SSE en `realtime.publish(workspace_id, event, data)`.

Endpoints (todos prefijo /api/inbox):
  GET    /events                              SSE stream (auth via ?token=)
  GET    /conversations                       lista filtrable
  GET    /conversations/{id}/messages         mensajes paginados
  POST   /conversations/{id}/send             envía outbound
  POST   /conversations/{id}/read             marca leído
  PATCH  /conversations/{id}                  actualiza status/asignado/tags
  GET    /summary                             totales por canal/estado
"""
from __future__ import annotations

import os
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient

from auth import get_current_user, decode_token
from realtime import event_stream, publish

logger = logging.getLogger(__name__)
inbox_router = APIRouter(prefix="/api/inbox", tags=["Inbox"])

VALID_CHANNELS = ("whatsapp", "instagram", "messenger", "web_chat")
VALID_STATUSES = ("open", "pending", "closed")


def _get_db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


async def _get_active_workspace(user: dict) -> dict:
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


def _plan_allows(ws: dict) -> bool:
    return (ws.get("plan") or "essential") in ("premium", "elite", "founder_full")


# ---------- Conversation upsert (called from webhook handlers) ----------
async def upsert_conversation_and_message(
    db,
    *,
    workspace_id: str,
    contact_id: Optional[str],
    channel: str,
    direction: Literal["inbound", "outbound"],
    body: str,
    provider: str = "composio",
    external_sender_id: Optional[str] = None,
    external_message_id: Optional[str] = None,
    message_type: str = "text",
    media_url: Optional[str] = None,
    raw_payload: Optional[dict] = None,
) -> Dict[str, Any]:
    """Find or create the conversation, persist the message, update preview/unread,
    and emit a realtime event. Returns {conversation, message}.
    """
    if channel not in VALID_CHANNELS:
        raise ValueError(f"channel inválido: {channel}")

    now_iso = datetime.now(timezone.utc).isoformat()
    preview = (body or "")[:200]

    # Find conversation by (workspace_id, contact_id, channel) — fallback by external_sender_id
    query: Dict[str, Any] = {"workspace_id": workspace_id, "channel": channel}
    if contact_id:
        query["contact_id"] = contact_id
    elif external_sender_id:
        query["external_sender_id"] = external_sender_id
    else:
        # Sin identificador no podemos correlacionar — abortamos.
        return {}

    conv = await db.crm_conversations.find_one(query, {"_id": 0})
    is_new = False
    if not conv:
        conv = {
            "id": str(uuid.uuid4()),
            "workspace_id": workspace_id,
            "contact_id": contact_id,
            "channel": channel,
            "provider": provider,
            "external_sender_id": external_sender_id,
            "external_conversation_id": None,
            "status": "open",
            "assigned_to_user_id": None,
            "last_message_preview": preview,
            "last_message_at": now_iso,
            "last_direction": direction,
            "unread_count": 1 if direction == "inbound" else 0,
            "tags": [],
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        await db.crm_conversations.insert_one(conv.copy())
        is_new = True
    else:
        update = {
            "$set": {
                "last_message_preview": preview,
                "last_message_at": now_iso,
                "last_direction": direction,
                "updated_at": now_iso,
            }
        }
        if contact_id and not conv.get("contact_id"):
            update["$set"]["contact_id"] = contact_id
        if direction == "inbound":
            update["$inc"] = {"unread_count": 1}
            # If closed and a new inbound arrives, reopen as 'pending'
            if conv.get("status") == "closed":
                update["$set"]["status"] = "pending"
        await db.crm_conversations.update_one({"id": conv["id"]}, update)
        # Re-read fresh state
        conv = await db.crm_conversations.find_one({"id": conv["id"]}, {"_id": 0})

    # Persist message
    msg = {
        "id": str(uuid.uuid4()),
        "workspace_id": workspace_id,
        "conversation_id": conv["id"],
        "contact_id": contact_id,
        "channel": channel,
        "direction": direction,
        "body": body,
        "content": body,  # legacy compatibility with /api/crm/messages
        "message_type": message_type,
        "media_url": media_url,
        "external_message_id": external_message_id,
        "status": "sent" if direction == "outbound" else "received",
        "metadata": {
            "provider": provider,
            "external_sender_id": external_sender_id,
            "channel_label": channel,
        },
        "raw_payload": raw_payload,
        "created_at": now_iso,
    }
    await db.crm_messages.insert_one(msg.copy())

    # Emit realtime
    await publish(workspace_id, "inbox.message.created", {
        "conversation_id": conv["id"],
        "message": {k: v for k, v in msg.items() if k != "raw_payload"},
        "conversation": conv,
        "is_new_conversation": is_new,
    })
    if is_new:
        await publish(workspace_id, "inbox.conversation.updated", {"conversation": conv})

    return {"conversation": conv, "message": msg}


# ---------- SSE ----------
@inbox_router.get("/events")
async def inbox_events(token: str = Query(..., description="JWT access token")):
    """SSE stream. Auth via query string porque EventSource no permite headers."""
    try:
        import jwt as pyjwt
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token inválido")
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesión expirada")
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")

    db = _get_db()
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    ws_id = payload.get("active_workspace_id") or (user.get("workspace_ids") or [None])[0]
    if not ws_id:
        raise HTTPException(status_code=400, detail="Sin workspace activo")
    if user.get("role") != "founder_admin" and ws_id not in (user.get("workspace_ids") or []):
        raise HTTPException(status_code=403, detail="Sin acceso")

    headers = {
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    }
    return StreamingResponse(event_stream(ws_id), media_type="text/event-stream", headers=headers)


# ---------- Conversations list ----------
@inbox_router.get("/conversations")
async def list_conversations(
    user: dict = Depends(get_current_user),
    channel: Optional[str] = None,
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    search: Optional[str] = None,
    unread_only: bool = False,
    limit: int = Query(50, ge=1, le=200),
    cursor: Optional[str] = None,
):
    ws = await _get_active_workspace(user)
    db = _get_db()

    q: Dict[str, Any] = {"workspace_id": ws["id"]}
    if channel and channel in VALID_CHANNELS:
        q["channel"] = channel
    if status and status in VALID_STATUSES:
        q["status"] = status
    if assigned_to:
        q["assigned_to_user_id"] = assigned_to
    if unread_only:
        q["unread_count"] = {"$gt": 0}
    if cursor:
        q["last_message_at"] = {"$lt": cursor}

    convos = await db.crm_conversations.find(q, {"_id": 0}).sort("last_message_at", -1).limit(limit).to_list(limit)

    # Enrich with contact preview
    contact_ids = [c.get("contact_id") for c in convos if c.get("contact_id")]
    contacts_map = {}
    if contact_ids:
        cs = await db.crm_contacts.find(
            {"workspace_id": ws["id"], "id": {"$in": contact_ids}},
            {"_id": 0, "id": 1, "nombre": 1, "empresa": 1, "telefono": 1, "email": 1, "instagram_id": 1, "messenger_id": 1, "fuente": 1},
        ).to_list(len(contact_ids))
        contacts_map = {c["id"]: c for c in cs}

    # In-memory text search (small N, simple)
    if search:
        s = search.lower().strip()
        def match(c):
            preview = (c.get("last_message_preview") or "").lower()
            ct = contacts_map.get(c.get("contact_id"), {})
            haystack = " ".join([
                preview,
                (ct.get("nombre") or ""), (ct.get("empresa") or ""),
                (ct.get("telefono") or ""), (ct.get("email") or "") or "",
                (ct.get("instagram_id") or ""), (ct.get("messenger_id") or ""),
                (c.get("external_sender_id") or ""),
            ]).lower()
            return s in haystack
        convos = [c for c in convos if match(c)]

    items = []
    for c in convos:
        ct = contacts_map.get(c.get("contact_id")) or {}
        items.append({**c, "contact": ct})

    next_cursor = items[-1]["last_message_at"] if len(items) == limit else None
    return {"items": items, "next_cursor": next_cursor}


@inbox_router.get("/summary")
async def inbox_summary(user: dict = Depends(get_current_user)):
    ws = await _get_active_workspace(user)
    db = _get_db()
    ws_id = ws["id"]
    pipeline = [
        {"$match": {"workspace_id": ws_id}},
        {"$group": {
            "_id": {"channel": "$channel", "status": "$status"},
            "count": {"$sum": 1},
            "unread": {"$sum": "$unread_count"},
        }},
    ]
    cursor = db.crm_conversations.aggregate(pipeline)
    rows = await cursor.to_list(200)
    by_channel: Dict[str, Dict[str, int]] = {}
    total = {"open": 0, "pending": 0, "closed": 0, "unread": 0, "total": 0}
    for r in rows:
        ch = r["_id"]["channel"]
        st = r["_id"]["status"]
        by_channel.setdefault(ch, {"open": 0, "pending": 0, "closed": 0, "unread": 0, "total": 0})
        by_channel[ch][st] = r["count"]
        by_channel[ch]["unread"] += r["unread"] or 0
        by_channel[ch]["total"] += r["count"]
        if st in total:
            total[st] += r["count"]
        total["unread"] += r["unread"] or 0
        total["total"] += r["count"]
    return {
        "workspace_id": ws_id,
        "plan_allows": _plan_allows(ws),
        "total": total,
        "by_channel": by_channel,
    }


# ---------- Single conversation: messages ----------
@inbox_router.get("/conversations/{conv_id}/messages")
async def get_messages(
    conv_id: str,
    user: dict = Depends(get_current_user),
    limit: int = Query(100, ge=1, le=500),
    cursor: Optional[str] = None,
):
    ws = await _get_active_workspace(user)
    db = _get_db()
    conv = await db.crm_conversations.find_one(
        {"id": conv_id, "workspace_id": ws["id"]}, {"_id": 0}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")

    q: Dict[str, Any] = {
        "workspace_id": ws["id"],
        "$or": [
            {"conversation_id": conv_id},
            # Mensajes legacy guardados solo con contact_id+channel
            {"contact_id": conv.get("contact_id"), "channel": conv["channel"]},
        ],
    }
    if cursor:
        q["created_at"] = {"$lt": cursor}

    msgs = await db.crm_messages.find(q, {"_id": 0, "raw_payload": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    msgs.reverse()  # ascendente para el render
    return {"conversation": conv, "messages": msgs, "next_cursor": (msgs[0]["created_at"] if len(msgs) == limit else None)}


# ---------- Send outbound ----------
class SendBody(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)


@inbox_router.post("/conversations/{conv_id}/send")
async def send_message(conv_id: str, payload: SendBody, user: dict = Depends(get_current_user)):
    ws = await _get_active_workspace(user)
    db = _get_db()
    conv = await db.crm_conversations.find_one(
        {"id": conv_id, "workspace_id": ws["id"]}, {"_id": 0}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")

    channel = conv["channel"]
    provider = conv.get("provider") or "composio"
    contact = await db.crm_contacts.find_one(
        {"workspace_id": ws["id"], "id": conv.get("contact_id")}, {"_id": 0}
    ) if conv.get("contact_id") else None

    # Determine recipient
    recipient = None
    if channel == "whatsapp":
        recipient = (contact or {}).get("telefono") or conv.get("external_sender_id")
    elif channel == "instagram":
        recipient = (contact or {}).get("instagram_id") or conv.get("external_sender_id")
    elif channel == "messenger":
        recipient = (contact or {}).get("messenger_id") or conv.get("external_sender_id")
    elif channel == "web_chat":
        # No outbound real para web_chat (el bot responde en el flujo público)
        raise HTTPException(status_code=409, detail="Envío manual no soportado en web_chat")

    if not recipient:
        raise HTTPException(status_code=409, detail="Falta identificador del destinatario")

    # Provider routing
    send_result: Dict[str, Any] = {"ok": False, "skipped": True}
    try:
        if channel == "whatsapp" and provider == "cloud_api":
            # Reuse existing WhatsApp Cloud API send helper if available
            try:
                from whatsapp import send_whatsapp_message  # type: ignore
                send_result = await send_whatsapp_message(db, ws["id"], recipient, payload.message)
            except Exception as e:
                logger.warning(f"WhatsApp cloud send failed: {e}")
                send_result = {"ok": False, "error": str(e)}
        else:
            # Composio path
            from composio_channels import composio_send, SendRequest
            req = SendRequest(channel=channel if channel != "whatsapp" else "whatsapp", to=recipient, message=payload.message, contact_id=conv.get("contact_id"))
            send_result = await composio_send(req, user)
    except HTTPException as he:
        # Convert provider HTTP errors (eg. canal no conectado, API key faltante) into a
        # structured failure so el outbound queda registrado igualmente con status='failed'.
        send_result = {"ok": False, "error": he.detail, "status_code": he.status_code}
    except Exception as e:
        logger.error(f"Send failed: {e}")
        send_result = {"ok": False, "error": str(e)}

    # Persist outbound regardless (so user sees it, marked failed if needed)
    record = await upsert_conversation_and_message(
        db,
        workspace_id=ws["id"],
        contact_id=conv.get("contact_id"),
        channel=channel,
        direction="outbound",
        body=payload.message,
        provider=provider,
        external_sender_id=conv.get("external_sender_id"),
        external_message_id=None,
        message_type="text",
    )
    msg = record.get("message") or {}
    if not send_result.get("ok", False):
        # mark message as failed
        await db.crm_messages.update_one({"id": msg.get("id")}, {"$set": {"status": "failed", "metadata.last_error": str(send_result.get("error") or send_result)}})
        msg["status"] = "failed"

    return {"ok": True, "send_result": send_result, "message": msg, "conversation": record.get("conversation")}


# ---------- Mark as read ----------
@inbox_router.post("/conversations/{conv_id}/read")
async def mark_read(conv_id: str, user: dict = Depends(get_current_user)):
    ws = await _get_active_workspace(user)
    db = _get_db()
    res = await db.crm_conversations.update_one(
        {"id": conv_id, "workspace_id": ws["id"]},
        {"$set": {"unread_count": 0, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")
    await publish(ws["id"], "inbox.conversation.read", {"conversation_id": conv_id})
    return {"ok": True}


# ---------- Patch conversation ----------
class ConversationPatch(BaseModel):
    status: Optional[Literal["open", "pending", "closed"]] = None
    assigned_to_user_id: Optional[str] = None
    tags: Optional[List[str]] = None


@inbox_router.patch("/conversations/{conv_id}")
async def patch_conversation(conv_id: str, payload: ConversationPatch, user: dict = Depends(get_current_user)):
    ws = await _get_active_workspace(user)
    db = _get_db()
    update: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if payload.status is not None:
        update["status"] = payload.status
    if payload.assigned_to_user_id is not None:
        update["assigned_to_user_id"] = payload.assigned_to_user_id
    if payload.tags is not None:
        update["tags"] = list({(t or "").strip() for t in payload.tags if (t or "").strip()})
    if len(update) == 1:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    res = await db.crm_conversations.update_one({"id": conv_id, "workspace_id": ws["id"]}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")
    fresh = await db.crm_conversations.find_one({"id": conv_id, "workspace_id": ws["id"]}, {"_id": 0})
    await publish(ws["id"], "inbox.conversation.updated", {"conversation": fresh})
    return fresh


# ---------- Indexes (called from server.startup) ----------
async def ensure_inbox_indexes(db):
    await db.crm_conversations.create_index([("workspace_id", 1), ("last_message_at", -1)])
    await db.crm_conversations.create_index([("workspace_id", 1), ("contact_id", 1), ("channel", 1)])
    await db.crm_conversations.create_index([("workspace_id", 1), ("channel", 1), ("external_sender_id", 1)])
    await db.crm_conversations.create_index([("workspace_id", 1), ("status", 1)])
    await db.crm_messages.create_index([("workspace_id", 1), ("conversation_id", 1), ("created_at", 1)])


async def backfill_conversations(db):
    """One-shot: para mensajes sin conversation_id, crea/encuentra una conversación
    por (workspace_id, contact_id, channel). Sirve para que el inbox muestre el histórico."""
    cursor = db.crm_messages.find(
        {"conversation_id": {"$in": [None, ""]}, "contact_id": {"$ne": None}},
        {"_id": 0, "id": 1, "workspace_id": 1, "contact_id": 1, "channel": 1, "content": 1, "direction": 1, "created_at": 1},
    )
    seen: Dict[str, str] = {}
    updated = 0
    async for m in cursor:
        key = f"{m['workspace_id']}|{m['contact_id']}|{m['channel']}"
        cid = seen.get(key)
        if not cid:
            existing = await db.crm_conversations.find_one(
                {"workspace_id": m["workspace_id"], "contact_id": m["contact_id"], "channel": m["channel"]},
                {"_id": 0, "id": 1},
            )
            if existing:
                cid = existing["id"]
            else:
                cid = str(uuid.uuid4())
                doc = {
                    "id": cid,
                    "workspace_id": m["workspace_id"],
                    "contact_id": m["contact_id"],
                    "channel": m["channel"],
                    "provider": "composio" if m["channel"] in ("instagram", "messenger") else "cloud_api",
                    "external_sender_id": None,
                    "external_conversation_id": None,
                    "status": "open",
                    "assigned_to_user_id": None,
                    "last_message_preview": (m.get("content") or "")[:200],
                    "last_message_at": m.get("created_at"),
                    "last_direction": m.get("direction") or "inbound",
                    "unread_count": 0,
                    "tags": [],
                    "created_at": m.get("created_at") or datetime.now(timezone.utc).isoformat(),
                    "updated_at": m.get("created_at") or datetime.now(timezone.utc).isoformat(),
                }
                await db.crm_conversations.insert_one(doc)
            seen[key] = cid
        await db.crm_messages.update_one({"id": m["id"]}, {"$set": {"conversation_id": cid}})
        updated += 1
    if updated:
        logger.info(f"Inbox backfill: linked {updated} legacy messages → conversations")
