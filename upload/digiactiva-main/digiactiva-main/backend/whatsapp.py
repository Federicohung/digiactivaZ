"""
ACTIVA - WhatsApp Business Cloud API integration (multi-tenant).
- Public webhook: GET /api/whatsapp/webhook (Meta verification) + POST (receive messages)
- Admin: POST /api/whatsapp/send (outbound, uses workspace credentials)
- Admin: POST /api/whatsapp/mock-receive (simulate inbound for testing without Meta)

Credentials live in workspace.integrations.whatsapp.
NEVER hardcode tokens; NEVER log them in full.
"""
from fastapi import APIRouter, HTTPException, Depends, Request, Query
from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from auth import get_current_workspace_id
from messaging import record_message, upsert_contact_from_signal
import os
import uuid
import json
import logging
import httpx

logger = logging.getLogger(__name__)
wa_router = APIRouter(prefix="/api/whatsapp", tags=["WhatsApp"])

WHATSAPP_GRAPH_BASE = "https://graph.facebook.com/v20.0"

def get_db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]

def _redact(token: Optional[str]) -> str:
    if not token:
        return "(empty)"
    return f"{token[:6]}…{token[-4:]}" if len(token) > 12 else "(short)"


# =================== WEBHOOK VERIFICATION (GET) ===================
@wa_router.get("/webhook")
async def whatsapp_verify_webhook(
    ws: Optional[str] = Query(None),
    request: Request = None,
):
    """Meta sends GET with hub.verify_token + hub.challenge. Match against the workspace's verify_token."""
    qp = dict(request.query_params)
    mode = qp.get("hub.mode")
    token = qp.get("hub.verify_token")
    challenge = qp.get("hub.challenge")

    db = get_db()
    workspace = await db.workspaces.find_one({"id": ws} if ws else {"slug": "digiactiva"}, {"_id": 0})
    if not workspace:
        logger.warning(f"Webhook verify: workspace not found ws={ws}")
        raise HTTPException(status_code=404, detail="Workspace not found")

    expected = (workspace.get("integrations") or {}).get("whatsapp", {}).get("verify_token")
    if mode == "subscribe" and token and expected and token == expected:
        logger.info(f"Webhook verified for workspace={workspace.get('slug')}")
        # Update integration status to connected
        await db.workspaces.update_one(
            {"id": workspace["id"]},
            {"$set": {"integrations.whatsapp.status": "connected",
                      "integrations.whatsapp.last_error": None}}
        )
        # Meta requires returning challenge as plain text
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(content=challenge or "", status_code=200)
    logger.warning(f"Webhook verify failed for workspace={workspace.get('slug')}: mode={mode} match={token == expected}")
    raise HTTPException(status_code=403, detail="Verification failed")


# =================== WEBHOOK RECEIVER (POST) ===================
async def _process_inbound(db, workspace_id: str, phone: str, profile_name: Optional[str], text: str, raw_payload: dict):
    """Auto-upsert contact + record inbound message + timeline event."""
    cid = await upsert_contact_from_signal(
        db, workspace_id,
        phone=phone, name=profile_name, source="whatsapp",
    )
    await record_message(
        db, workspace_id,
        channel="whatsapp", direction="inbound",
        content=text, contact_id=cid,
        session_id=None,
        metadata={"phone": phone, "profile_name": profile_name, "raw": raw_payload},
    )
    # Mark summary stale so the next CRM open re-analyzes
    if cid:
        await db.crm_contacts.update_one(
            {"id": cid, "workspace_id": workspace_id},
            {"$set": {"ai_summary_stale": True, "ultimo_contacto": datetime.now(timezone.utc).isoformat()}}
        )
    return cid


@wa_router.post("/webhook")
async def whatsapp_receive_webhook(request: Request, ws: Optional[str] = Query(None)):
    """Meta sends WhatsApp events here. Route by Phone Number ID (or fallback to ws query)."""
    db = get_db()
    body = await request.json()
    # Persist raw event for debugging (with workspace_id resolved later)
    try:
        for entry in body.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value") or {}
                meta_phone_number_id = value.get("metadata", {}).get("phone_number_id")
                # Resolve workspace by Phone Number ID first; fallback to ws query
                workspace = None
                if meta_phone_number_id:
                    workspace = await db.workspaces.find_one(
                        {"integrations.whatsapp.phone_number_id": meta_phone_number_id},
                        {"_id": 0}
                    )
                if not workspace and ws:
                    workspace = await db.workspaces.find_one({"id": ws}, {"_id": 0})
                if not workspace:
                    logger.warning(f"WA webhook: workspace not resolved (phone_number_id={meta_phone_number_id}, ws={ws})")
                    continue
                workspace_id = workspace["id"]

                # Process incoming messages
                for msg in value.get("messages", []) or []:
                    phone = msg.get("from")
                    msg_type = msg.get("type")
                    text = ""
                    if msg_type == "text":
                        text = msg.get("text", {}).get("body", "")
                    elif msg_type == "button":
                        text = msg.get("button", {}).get("text", "")
                    elif msg_type == "interactive":
                        ir = msg.get("interactive", {})
                        text = (ir.get("button_reply", {}) or ir.get("list_reply", {})).get("title", "")
                    elif msg_type == "image":
                        text = "[imagen]" + (": " + (msg.get("image", {}).get("caption") or ""))
                    elif msg_type == "audio":
                        text = "[audio]"
                    elif msg_type == "document":
                        text = "[documento] " + (msg.get("document", {}).get("filename") or "")
                    else:
                        text = f"[{msg_type}]"
                    profile = None
                    contacts = value.get("contacts") or []
                    if contacts:
                        profile = contacts[0].get("profile", {}).get("name")
                    if phone and text:
                        await _process_inbound(db, workspace_id, phone, profile, text, msg)
                # Process status updates (delivered, read, sent)
                for st in value.get("statuses", []) or []:
                    msg_id = st.get("id")
                    status = st.get("status")
                    if msg_id and status:
                        await db.crm_messages.update_one(
                            {"workspace_id": workspace_id, "metadata.wa_message_id": msg_id},
                            {"$set": {"status": status}}
                        )
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"WhatsApp webhook error: {e}")
        # Always return 200 to Meta to prevent retries; do NOT echo internals
        return {"status": "ok"}


# =================== MOCK RECEIVER (for testing without Meta) ===================
class MockInbound(BaseModel):
    phone: str
    text: str
    profile_name: Optional[str] = "Visitante WhatsApp"


@wa_router.post("/mock-receive")
async def mock_receive(payload: MockInbound, workspace_id: str = Depends(get_current_workspace_id)):
    """Simulate an inbound WhatsApp message. Auth required, runs against active workspace."""
    db = get_db()
    cid = await _process_inbound(
        db, workspace_id, payload.phone, payload.profile_name, payload.text,
        {"mock": True, "timestamp": datetime.now(timezone.utc).isoformat()}
    )
    return {
        "status": "ok",
        "contact_id": cid,
        "workspace_id": workspace_id,
        "message": "Mock inbound procesado. Verifica /api/crm/contacts y /api/crm/messages/{contact_id}.",
    }


# =================== OUTBOUND (send message) ===================
class SendMessage(BaseModel):
    contact_id: Optional[str] = None
    phone: Optional[str] = None
    text: str


@wa_router.post("/send")
async def whatsapp_send(payload: SendMessage, workspace_id: str = Depends(get_current_workspace_id)):
    """Send a WhatsApp message via the workspace's WhatsApp Business credentials."""
    db = get_db()
    workspace = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace no encontrado")
    wa = (workspace.get("integrations") or {}).get("whatsapp", {})
    phone_number_id = (wa.get("phone_number_id") or "").strip()
    access_token = (wa.get("access_token") or "").strip()
    if not phone_number_id or not access_token:
        raise HTTPException(status_code=400, detail="WhatsApp pending_credentials: falta phone_number_id o access_token")

    # Resolve target phone
    phone = (payload.phone or "").strip()
    contact_id = payload.contact_id
    if not phone and contact_id:
        contact = await db.crm_contacts.find_one({"id": contact_id, "workspace_id": workspace_id}, {"_id": 0, "telefono": 1})
        if contact:
            phone = (contact.get("telefono") or "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Falta phone o contact_id válido con teléfono")

    # Normalize: WhatsApp Cloud expects E.164 without +
    to = phone.replace("+", "").replace(" ", "").replace("-", "")

    url = f"{WHATSAPP_GRAPH_BASE}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    body = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": payload.text},
    }

    wa_message_id = None
    error = None
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, headers=headers, json=body)
        if resp.status_code >= 200 and resp.status_code < 300:
            data = resp.json()
            wa_message_id = (data.get("messages") or [{}])[0].get("id")
            await db.workspaces.update_one(
                {"id": workspace_id},
                {"$set": {"integrations.whatsapp.status": "connected", "integrations.whatsapp.last_error": None}}
            )
        else:
            error = f"Meta API {resp.status_code}: {resp.text[:200]}"
            await db.workspaces.update_one(
                {"id": workspace_id},
                {"$set": {"integrations.whatsapp.status": "error", "integrations.whatsapp.last_error": error}}
            )
            raise HTTPException(status_code=502, detail=error)
    except httpx.RequestError as e:
        error = f"Network error: {str(e)[:200]}"
        await db.workspaces.update_one(
            {"id": workspace_id},
            {"$set": {"integrations.whatsapp.status": "error", "integrations.whatsapp.last_error": error}}
        )
        raise HTTPException(status_code=502, detail=error)

    # Resolve / create contact for the message record
    if not contact_id:
        contact_id = await upsert_contact_from_signal(
            db, workspace_id, phone=phone, source="whatsapp"
        )

    msg_id = await record_message(
        db, workspace_id, channel="whatsapp", direction="outbound",
        content=payload.text, contact_id=contact_id,
        session_id=None,
        metadata={"phone": phone, "wa_message_id": wa_message_id, "status": "sent"},
    )
    # Timeline
    await db.crm_timeline.insert_one({
        "id": str(uuid.uuid4()),
        "workspace_id": workspace_id,
        "contact_id": contact_id,
        "tipo": "whatsapp",
        "descripcion": f"Mensaje WhatsApp enviado a {phone}",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "metadata": {"wa_message_id": wa_message_id, "phone": phone},
    })
    return {
        "status": "sent",
        "wa_message_id": wa_message_id,
        "message_id": msg_id,
        "contact_id": contact_id,
    }


# =================== STATUS / DIAG ===================
@wa_router.get("/status")
async def whatsapp_status(workspace_id: str = Depends(get_current_workspace_id)):
    db = get_db()
    workspace = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace no encontrado")
    wa = (workspace.get("integrations") or {}).get("whatsapp", {})
    # Build webhook url freshly: respect override, else env
    override = (wa.get("webhook_url_override") or "").strip().rstrip("/")
    if override:
        webhook_url = f"{override}/api/whatsapp/webhook?ws={workspace_id}"
    else:
        backend = os.environ.get("BACKEND_PUBLIC_URL", "").rstrip("/")
        webhook_url = f"{backend}/api/whatsapp/webhook?ws={workspace_id}" if backend else f"/api/whatsapp/webhook?ws={workspace_id}"
    return {
        "status": wa.get("status", "not_connected"),
        "webhook_url": webhook_url,
        "has_waba_id": bool((wa.get("waba_id") or "").strip()),
        "has_phone_number_id": bool((wa.get("phone_number_id") or "").strip()),
        "has_access_token": bool((wa.get("access_token") or "").strip()),
        "has_verify_token": bool((wa.get("verify_token") or "").strip()),
        "has_app_secret": bool((wa.get("app_secret") or "").strip()),
        "access_token_redacted": _redact(wa.get("access_token")),
        "last_error": wa.get("last_error"),
    }
