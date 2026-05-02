"""
ACTIVA - Unified messaging module.
Reusable across channels: web_chat (now), whatsapp (Sprint B), email (Sprint C).
Single source of truth for: contact upsert by phone/email + message record + timeline event.
"""
from datetime import datetime, timezone
from typing import Optional, Dict, Any
import uuid
import logging

logger = logging.getLogger(__name__)

VALID_CHANNELS = ("web_chat", "whatsapp", "email", "voice", "instagram", "messenger")
VALID_DIRECTIONS = ("inbound", "outbound")

async def record_message(
    db,
    workspace_id: str,
    channel: str,
    direction: str,
    content: str,
    contact_id: Optional[str] = None,
    session_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> str:
    """Persist a single message and return its id. Caller owns timeline/contact upserts."""
    if channel not in VALID_CHANNELS:
        raise ValueError(f"Invalid channel: {channel}")
    if direction not in VALID_DIRECTIONS:
        raise ValueError(f"Invalid direction: {direction}")
    msg_id = str(uuid.uuid4())
    doc = {
        "id": msg_id,
        "workspace_id": workspace_id,
        "channel": channel,
        "direction": direction,
        "content": content,
        "contact_id": contact_id,
        "session_id": session_id,
        "metadata": metadata or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.crm_messages.insert_one(doc)
    return msg_id


async def upsert_contact_from_signal(
    db,
    workspace_id: str,
    *,
    phone: Optional[str] = None,
    email: Optional[str] = None,
    name: Optional[str] = None,
    business: Optional[str] = None,
    niche: Optional[str] = None,
    source: str = "web_chat",
    score: Optional[int] = None,
    proxima_accion: Optional[str] = None,
    notas: Optional[str] = None,
    instagram_id: Optional[str] = None,
    messenger_id: Optional[str] = None,
) -> Optional[str]:
    """Find or create a contact by phone/email/instagram_id/messenger_id within a workspace.
    Returns contact_id, or None if no identifier supplied.
    Also generates a timeline 'creado'/'ia' event."""
    phone = (phone or "").strip() or None
    email = (email or "").strip().lower() or None
    name = (name or "").strip() or None
    instagram_id = (instagram_id or "").strip() or None
    messenger_id = (messenger_id or "").strip() or None
    if not (phone or email or instagram_id or messenger_id):
        return None

    now_iso = datetime.now(timezone.utc).isoformat()
    or_clauses = []
    if email:
        or_clauses.append({"email": email})
    if phone:
        or_clauses.append({"telefono": phone})
    if instagram_id:
        or_clauses.append({"instagram_id": instagram_id})
    if messenger_id:
        or_clauses.append({"messenger_id": messenger_id})

    existing = await db.crm_contacts.find_one(
        {"workspace_id": workspace_id, "$or": or_clauses}, {"_id": 0}
    ) if or_clauses else None

    if existing:
        cid = existing["id"]
        update = {"updated_at": now_iso, "ultimo_contacto": now_iso}
        if score is not None:
            update["score_ia"] = int(score)
        if name and not existing.get("nombre"):
            update["nombre"] = name
        if email and not existing.get("email"):
            update["email"] = email
        if phone and not existing.get("telefono"):
            update["telefono"] = phone
        if niche and not existing.get("nicho"):
            update["nicho"] = niche
        if instagram_id and not existing.get("instagram_id"):
            update["instagram_id"] = instagram_id
        if messenger_id and not existing.get("messenger_id"):
            update["messenger_id"] = messenger_id
        if proxima_accion:
            update["proxima_accion"] = proxima_accion
        if notas and not existing.get("notas"):
            update["notas"] = notas
        await db.crm_contacts.update_one(
            {"id": cid, "workspace_id": workspace_id}, {"$set": update}
        )
        await db.crm_timeline.insert_one({
            "id": str(uuid.uuid4()),
            "workspace_id": workspace_id,
            "contact_id": cid,
            "tipo": "ia",
            "descripcion": f"Datos actualizados desde {source}" + (f" (score IA: {score})" if score is not None else ""),
            "created_at": now_iso,
            "metadata": {"source": source},
        })
        return cid

    cid = str(uuid.uuid4())
    doc = {
        "id": cid,
        "workspace_id": workspace_id,
        "empresa": business or name or "Lead web",
        "nombre": name or business or "Visitante",
        "telefono": phone or "",
        "email": email,
        "nicho": niche,
        "fuente": source,
        "valor_mensual": 0,
        "setup_fee": 0,
        "etapa": "nuevo",
        "probabilidad_cierre": min(int(score or 0), 100),
        "fecha_cierre_estimada": None,
        "proxima_accion": proxima_accion,
        "proxima_accion_fecha": None,
        "notas": notas,
        "created_at": now_iso,
        "updated_at": now_iso,
        "ultimo_contacto": now_iso,
        "dias_en_etapa": 0,
        "score_ia": int(score or 0),
        "instagram_id": instagram_id,
        "messenger_id": messenger_id,
    }
    await db.crm_contacts.insert_one(doc)
    await db.crm_timeline.insert_one({
        "id": str(uuid.uuid4()),
        "workspace_id": workspace_id,
        "contact_id": cid,
        "tipo": "creado",
        "descripcion": f"Lead capturado desde {source}" + (f" (score IA: {score})" if score is not None else ""),
        "created_at": now_iso,
        "metadata": {"source": source},
    })
    return cid


async def migrate_landing_chat_to_web_chat(db):
    """One-shot migration: rename source 'landing_chat' → 'web_chat'."""
    res1 = await db.crm_contacts.update_many(
        {"fuente": "landing_chat"}, {"$set": {"fuente": "web_chat"}}
    )
    res2 = await db.crm_chat_sessions.update_many(
        {"source": "landing_chat"}, {"$set": {"source": "web_chat"}}
    )
    if res1.modified_count or res2.modified_count:
        logger.info(f"Migrated source: contacts={res1.modified_count}, sessions={res2.modified_count}")
