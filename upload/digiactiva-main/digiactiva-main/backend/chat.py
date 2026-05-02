"""
ACTIVA - Multi-tenant chat agent.
- Public endpoints: /api/chat/message, /api/chat/greeting (per workspace via slug or query)
- Admin endpoints: /api/crm/chat-sessions, /api/crm/agent-config (per active workspace)
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from openai import AsyncOpenAI
from auth import get_current_user, get_current_workspace_id
from messaging import record_message, upsert_contact_from_signal
import os
import uuid
import json
import logging

logger = logging.getLogger(__name__)

chat_router = APIRouter(prefix="/api", tags=["Chat"])

def get_db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]

# ---------- Helpers ----------
async def get_workspace_for_chat(db, workspace_param: Optional[str]) -> dict:
    """Resolve workspace by slug or id. Defaults to 'digiactiva'."""
    slug_or_id = workspace_param or "digiactiva"
    ws = await db.workspaces.find_one(
        {"$or": [{"slug": slug_or_id}, {"id": slug_or_id}]}, {"_id": 0}
    )
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace no encontrado")
    return ws

def build_system_prompt(cfg: dict) -> str:
    # If a structured prompt is provided, use it as the primary system prompt.
    estructurado = (cfg.get("prompt_estructurado") or "").strip()
    if estructurado:
        saludo = (cfg.get("saludo_inicial") or "").strip()
        cta = (cfg.get("cta_final") or "").strip()
        extras = []
        if saludo:
            extras.append(f"SALUDO INICIAL SUGERIDO: {saludo}")
        if cta:
            extras.append(f"CTA FINAL: {cta}")
        suffix = ("\n\n" + "\n".join(extras)) if extras else ""
        return (
            "Responde SIEMPRE en español. Mensajes cortos (máx 4 líneas), "
            "1 pregunta por mensaje, sin inventar precios ni promociones.\n\n"
            f"{estructurado}{suffix}"
        )
    objs = "\n".join(f"- {o}" for o in (cfg.get("objeciones") or []))
    nichos = ", ".join(cfg.get("nichos_prioritarios") or [])
    quals = "\n".join(f"- {q}" for q in (cfg.get("preguntas_calificacion") or []))
    return f"""Eres el asistente comercial oficial. Responde SIEMPRE en español.

PERSONALIDAD: {cfg.get('personalidad','')}
TONO: {cfg.get('tono','')}

PLANES VIGENTES:
{cfg.get('planes_vigentes','')}

PROMOCIONES ACTUALES:
{cfg.get('promociones','')}

NICHOS PRIORITARIOS: {nichos}

PREGUNTAS DE CALIFICACIÓN (haz 1 por mensaje, no todas):
{quals}

OBJECIONES FRECUENTES Y RESPUESTAS:
{objs}

OBJETIVO COMERCIAL:
1. Saluda con calidez, no abrumes con info en el primer mensaje.
2. Califica al lead haciendo 1 pregunta a la vez.
3. Recomienda el plan que mejor se ajuste.
4. Si muestra interés, pide nombre, email, teléfono y rubro de forma natural.
5. CTA FINAL: {cfg.get('cta_final','')}

REGLAS ESTRICTAS:
- Mensajes cortos (máx 4 líneas).
- 1 pregunta por mensaje.
- NUNCA inventes precios o promociones que no estén arriba.
- Si te preguntan algo fuera del ámbito, redirige amablemente."""

EXTRACTION_PROMPT = """Analiza la conversación entre visitante y asistente.
Extrae los datos del visitante (NO del asistente). Devuelve SOLO JSON:
{
  "name": null o string,
  "email": null o string (email válido),
  "phone": null o string (incluye +56 si es chileno),
  "business": null o string (nombre empresa),
  "niche": null o string (rubro),
  "score": entero 0-100 (interés comercial),
  "plan_recomendado": null o string,
  "proxima_accion": null o string,
  "resumen": string (1 línea)
}
Solo incluye campos cuando estén explícitos. NO inventes."""

async def extract_lead_data(messages: list, api_key: str) -> dict:
    try:
        client = AsyncOpenAI(api_key=api_key)
        convo = "\n".join([f"{m['role']}: {m['content']}" for m in messages])
        completion = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": EXTRACTION_PROMPT},
                {"role": "user", "content": f"CONVERSACIÓN:\n{convo}"}
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
        return json.loads(completion.choices[0].message.content)
    except Exception as e:
        logger.error(f"Lead extraction failed: {e}")
        return {}

async def upsert_lead_from_chat(db, workspace_id: str, session_id: str, lead_data: dict, source: str = "web_chat") -> Optional[str]:
    """Wrapper around messaging.upsert_contact_from_signal — keeps backward compatibility."""
    return await upsert_contact_from_signal(
        db,
        workspace_id,
        phone=lead_data.get("phone"),
        email=lead_data.get("email"),
        name=lead_data.get("name"),
        business=lead_data.get("business"),
        niche=lead_data.get("niche"),
        source=source,
        score=int(lead_data.get("score") or 0),
        proxima_accion=lead_data.get("proxima_accion"),
        notas=lead_data.get("resumen"),
    )

# ---------- PUBLIC ----------
class ChatMessage(BaseModel):
    session_id: str
    message: str
    visitor_meta: Optional[Dict[str, Any]] = None
    workspace: Optional[str] = None  # slug or id; default 'digiactiva'

@chat_router.post("/chat/message")
async def chat_message(payload: ChatMessage):
    db = get_db()
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY missing")

    ws = await get_workspace_for_chat(db, payload.workspace)
    workspace_id = ws["id"]
    cfg = (ws.get("agent_prompts") or {}).get("web_chat", {})
    if not cfg:
        raise HTTPException(status_code=500, detail="Workspace sin prompt web_chat configurado")

    session = await db.crm_chat_sessions.find_one({"id": payload.session_id}, {"_id": 0})
    now_iso = datetime.now(timezone.utc).isoformat()
    if not session:
        session = {
            "id": payload.session_id, "workspace_id": workspace_id,
            "messages": [], "contact_id": None, "lead_data": {},
            "source": "web_chat", "channel": "web_chat",
            "visitor_meta": payload.visitor_meta or {},
            "created_at": now_iso, "updated_at": now_iso,
        }
        await db.crm_chat_sessions.insert_one(session)
    elif session.get("workspace_id") != workspace_id:
        # Existing session was for another workspace; isolate by ignoring or rejecting
        raise HTTPException(status_code=403, detail="Sesión pertenece a otro workspace")

    history = session.get("messages", [])[-20:]
    user_msg = {"role": "user", "content": payload.message, "ts": now_iso}
    history_for_api = [{"role": m["role"], "content": m["content"]} for m in history]
    history_for_api.append({"role": "user", "content": payload.message})

    ai_text = ""
    usage = None
    try:
        client = AsyncOpenAI(api_key=api_key)
        completion = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": build_system_prompt(cfg)}, *history_for_api],
            temperature=0.7,
        )
        ai_text = completion.choices[0].message.content.strip()
        usage = completion.usage
    except Exception as e:
        logger.error(f"Chat LLM error: {e}")
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")

    assistant_msg = {"role": "assistant", "content": ai_text, "ts": datetime.now(timezone.utc).isoformat()}
    new_messages = session.get("messages", []) + [user_msg, assistant_msg]
    await db.crm_chat_sessions.update_one(
        {"id": payload.session_id},
        {"$set": {"messages": new_messages, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    await db.crm_ai_logs.insert_one({
        "id": str(uuid.uuid4()), "workspace_id": workspace_id,
        "tipo": "chat", "contact_id": session.get("contact_id"), "empresa": None,
        "model": "gpt-4o-mini",
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0,
        "total_tokens": usage.total_tokens if usage else 0,
        "contenido": ai_text, "session_id": payload.session_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    lead_captured = False
    contact_id = session.get("contact_id")
    visitor_msgs = [m for m in new_messages if m["role"] == "user"]
    if len(visitor_msgs) >= 2 and len(visitor_msgs) % 2 == 0:
        lead_data = await extract_lead_data(new_messages, api_key)
        if lead_data:
            new_cid = await upsert_lead_from_chat(db, workspace_id, payload.session_id, lead_data, "web_chat")
            if new_cid:
                contact_id = new_cid
                lead_captured = True
                await db.crm_chat_sessions.update_one(
                    {"id": payload.session_id},
                    {"$set": {"contact_id": new_cid, "lead_data": lead_data}}
                )
                # Backfill all session messages into crm_messages bound to contact
                await db.crm_messages.update_many(
                    {"session_id": payload.session_id, "contact_id": None},
                    {"$set": {"contact_id": new_cid}}
                )
                # Mark contact as needing fresh AI summary (background-ish — fire & forget)
                await db.crm_contacts.update_one(
                    {"id": new_cid, "workspace_id": workspace_id},
                    {"$set": {"ai_summary_stale": True}}
                )

    # Persist current pair of messages in crm_messages (unified schema for web+whatsapp+...)
    await record_message(
        db, workspace_id, channel="web_chat", direction="inbound",
        content=payload.message, contact_id=contact_id,
        session_id=payload.session_id,
        metadata={"source": "web_chat"},
    )
    await record_message(
        db, workspace_id, channel="web_chat", direction="outbound",
        content=ai_text, contact_id=contact_id,
        session_id=payload.session_id,
        metadata={"source": "web_chat", "model": "gpt-4o-mini",
                  "tokens": usage.total_tokens if usage else 0},
    )

    return {
        "session_id": payload.session_id,
        "message": ai_text,
        "lead_captured": lead_captured,
        "contact_id": contact_id,
        "workspace": ws.get("slug"),
    }

@chat_router.get("/chat/greeting")
async def chat_greeting(workspace: Optional[str] = Query(None)):
    db = get_db()
    ws = await get_workspace_for_chat(db, workspace)
    cfg = (ws.get("agent_prompts") or {}).get("web_chat", {})
    return {
        "greeting": cfg.get("saludo_inicial", "Hola 👋 ¿En qué te ayudo?"),
        "workspace": ws.get("slug"),
        "workspace_name": ws.get("name"),
    }

# ---------- ADMIN: Agent config (legacy wrapper → workspace.agent_prompts.web_chat) ----------
@chat_router.get("/crm/agent-config")
async def get_agent_config(workspace_id: str = Depends(get_current_workspace_id)):
    db = get_db()
    ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace no encontrado")
    return (ws.get("agent_prompts") or {}).get("web_chat", {})

@chat_router.put("/crm/agent-config")
async def update_agent_config(config: dict, workspace_id: str = Depends(get_current_workspace_id)):
    db = get_db()
    config.pop("id", None)
    await db.workspaces.update_one(
        {"id": workspace_id},
        {"$set": {"agent_prompts.web_chat": config, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return config

@chat_router.post("/crm/agent-config/reset")
async def reset_agent_config(workspace_id: str = Depends(get_current_workspace_id)):
    """Reset to current workspace defaults"""
    from workspaces import default_agent_prompts
    db = get_db()
    defaults = default_agent_prompts()["web_chat"]
    await db.workspaces.update_one(
        {"id": workspace_id},
        {"$set": {"agent_prompts.web_chat": defaults, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return defaults

# ---------- ADMIN: Chat sessions ----------
@chat_router.get("/crm/chat-sessions")
async def list_chat_sessions(workspace_id: str = Depends(get_current_workspace_id), limit: int = 50):
    db = get_db()
    sessions = await db.crm_chat_sessions.find(
        {"workspace_id": workspace_id}, {"_id": 0}
    ).sort("updated_at", -1).to_list(limit)
    summary = []
    for s in sessions:
        msgs = s.get("messages", [])
        last_user = next((m for m in reversed(msgs) if m["role"] == "user"), None)
        summary.append({
            "id": s["id"],
            "contact_id": s.get("contact_id"),
            "lead_data": s.get("lead_data") or {},
            "messages_count": len(msgs),
            "last_message_preview": (last_user["content"][:120] if last_user else ""),
            "created_at": s.get("created_at"),
            "updated_at": s.get("updated_at"),
            "channel": s.get("channel", "web_chat"),
        })
    return {"sessions": summary, "total": len(summary)}

@chat_router.get("/crm/messages/{contact_id}")
async def get_messages_by_contact(contact_id: str, workspace_id: str = Depends(get_current_workspace_id), limit: int = 200):
    """Unified message history per contact (any channel)."""
    db = get_db()
    msgs = await db.crm_messages.find(
        {"contact_id": contact_id, "workspace_id": workspace_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(limit)
    return {"messages": msgs, "total": len(msgs)}

@chat_router.get("/crm/chat-sessions/{session_id}")
async def get_chat_session(session_id: str, workspace_id: str = Depends(get_current_workspace_id)):
    db = get_db()
    s = await db.crm_chat_sessions.find_one({"id": session_id, "workspace_id": workspace_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return s
