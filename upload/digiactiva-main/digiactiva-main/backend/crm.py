"""
ACTIVA FOUNDER OS - CRM Backend
Módulo de gestión de leads y pipeline para Digiactiva
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from openai import AsyncOpenAI
from auth import get_current_workspace_id
import os
import uuid
import json
import logging

logger = logging.getLogger(__name__)

# Router para CRM
crm_router = APIRouter(prefix="/api/crm", tags=["CRM"])

# Get database connection
def get_db():
    mongo_url = os.environ.get('MONGO_URL')
    client = AsyncIOMotorClient(mongo_url)
    return client[os.environ.get('DB_NAME')]

# ============== MODELS ==============

# Pipeline stages
PIPELINE_STAGES = ["nuevo", "trabajando", "propuesta", "cierre", "ganado", "perdido"]

# Lead sources
LEAD_SOURCES = ["whatsapp", "instagram", "referido", "formulario", "email", "llamada", "web", "landing_chat", "web_chat"]

class ContactBase(BaseModel):
    """Base contact/lead model"""
    empresa: str = Field(..., min_length=1, max_length=200)
    nombre: str = Field(..., min_length=1, max_length=200)
    telefono: Optional[str] = Field(default="", max_length=30)
    email: Optional[EmailStr] = None
    nicho: Optional[str] = None
    fuente: str = "formulario"  # whatsapp|instagram|referido|formulario|email|llamada|web|landing_chat|web_chat|external_whatsapp|... (libre para nuevas fuentes)
    instagram_id: Optional[str] = None
    messenger_id: Optional[str] = None

class ContactCreate(ContactBase):
    """Create contact request"""
    valor_mensual: Optional[int] = 0
    setup_fee: Optional[int] = 0
    notas: Optional[str] = None

class ContactUpdate(BaseModel):
    """Update contact request"""
    empresa: Optional[str] = None
    nombre: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[EmailStr] = None
    nicho: Optional[str] = None
    fuente: Optional[str] = None
    valor_mensual: Optional[int] = None
    setup_fee: Optional[int] = None
    etapa: Optional[str] = None
    probabilidad_cierre: Optional[int] = None
    fecha_cierre_estimada: Optional[str] = None
    proxima_accion: Optional[str] = None
    proxima_accion_fecha: Optional[str] = None
    notas: Optional[str] = None

class Contact(ContactBase):
    """Full contact model"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    valor_mensual: int = 0
    setup_fee: int = 0
    etapa: str = "nuevo"
    probabilidad_cierre: int = 0
    fecha_cierre_estimada: Optional[str] = None
    proxima_accion: Optional[str] = None
    proxima_accion_fecha: Optional[str] = None
    notas: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ultimo_contacto: Optional[datetime] = None
    dias_en_etapa: int = 0
    score_ia: int = 0

class TimelineEvent(BaseModel):
    """Timeline event for contact history"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    contact_id: str
    tipo: Literal["creado", "email", "llamada", "nota", "propuesta", "etapa", "whatsapp", "reunion", "ia"]
    descripcion: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Optional[dict] = None

class TimelineEventCreate(BaseModel):
    """Create timeline event"""
    contact_id: str
    tipo: str
    descripcion: str
    metadata: Optional[dict] = None

class AIRequest(BaseModel):
    """AI generation request"""
    contact_id: str
    tipo: Literal["email", "whatsapp", "followup", "propuesta", "prioridades", "score"]
    contexto: Optional[str] = None

class Settings(BaseModel):
    """CRM Settings"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = "settings"
    meta_mensual: int = 0
    mrr_actual: int = 0
    plantillas_email: List[dict] = []
    plantillas_whatsapp: List[dict] = []
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ============== CONTACTS ENDPOINTS ==============

@crm_router.post("/contacts", response_model=Contact)
async def create_contact(contact_input: ContactCreate, workspace_id: str = Depends(get_current_workspace_id)):
    """Create a new contact/lead"""
    db = get_db()
    try:
        contact = Contact(
            **contact_input.model_dump(),
            ultimo_contacto=datetime.now(timezone.utc)
        )
        doc = contact.model_dump()
        doc['workspace_id'] = workspace_id
        doc['created_at'] = doc['created_at'].isoformat()
        doc['updated_at'] = doc['updated_at'].isoformat()
        doc['ultimo_contacto'] = doc['ultimo_contacto'].isoformat() if doc['ultimo_contacto'] else None
        
        await db.crm_contacts.insert_one(doc)
        
        # Create timeline event
        event = TimelineEvent(
            contact_id=contact.id,
            tipo="creado",
            descripcion=f"Lead creado desde {contact.fuente}"
        )
        event_doc = event.model_dump()
        event_doc['workspace_id'] = workspace_id
        event_doc['created_at'] = event_doc['created_at'].isoformat()
        await db.crm_timeline.insert_one(event_doc)
        
        logger.info(f"Contact created: {contact.empresa} (ws={workspace_id})")
        return contact
    except Exception as e:
        logger.error(f"Error creating contact: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@crm_router.get("/contacts", response_model=List[Contact])
async def get_contacts(
    workspace_id: str = Depends(get_current_workspace_id),
    etapa: Optional[str] = None,
    fuente: Optional[str] = None,
    search: Optional[str] = None,
    calientes: Optional[bool] = None,
    sin_seguimiento: Optional[bool] = None
):
    """Get all contacts with optional filters"""
    db = get_db()
    try:
        query = {"workspace_id": workspace_id}
        
        if etapa:
            query['etapa'] = etapa
        if fuente:
            query['fuente'] = fuente
        if calientes:
            query['probabilidad_cierre'] = {"$gte": 60}
        if search:
            query['$or'] = [
                {'empresa': {'$regex': search, '$options': 'i'}},
                {'nombre': {'$regex': search, '$options': 'i'}},
                {'email': {'$regex': search, '$options': 'i'}}
            ]
        
        contacts = await db.crm_contacts.find(query, {"_id": 0}).sort("updated_at", -1).to_list(1000)
        
        # Calculate dias_en_etapa for each contact
        now = datetime.now(timezone.utc)
        for c in contacts:
            if isinstance(c.get('updated_at'), str):
                c['updated_at'] = datetime.fromisoformat(c['updated_at'].replace('Z', '+00:00'))
            if isinstance(c.get('created_at'), str):
                c['created_at'] = datetime.fromisoformat(c['created_at'].replace('Z', '+00:00'))
            if isinstance(c.get('ultimo_contacto'), str):
                c['ultimo_contacto'] = datetime.fromisoformat(c['ultimo_contacto'].replace('Z', '+00:00'))
            
            # Calculate days in current stage
            updated = c.get('updated_at', now)
            if isinstance(updated, datetime):
                c['dias_en_etapa'] = (now - updated).days
        
        # Filter sin_seguimiento (no contact in 3+ days)
        if sin_seguimiento:
            three_days_ago = now.replace(tzinfo=None) - timedelta(days=3)
            contacts = [c for c in contacts if c.get('ultimo_contacto') and 
                       (c['ultimo_contacto'].replace(tzinfo=None) if isinstance(c['ultimo_contacto'], datetime) else datetime.fromisoformat(c['ultimo_contacto'].replace('Z', ''))) < three_days_ago]
        
        return contacts
    except Exception as e:
        logger.error(f"Error getting contacts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@crm_router.get("/contacts/{contact_id}", response_model=Contact)
async def get_contact(contact_id: str, workspace_id: str = Depends(get_current_workspace_id)):
    """Get a single contact by ID"""
    db = get_db()
    try:
        contact = await db.crm_contacts.find_one({"id": contact_id, "workspace_id": workspace_id}, {"_id": 0})
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        # Parse dates
        if isinstance(contact.get('updated_at'), str):
            contact['updated_at'] = datetime.fromisoformat(contact['updated_at'].replace('Z', '+00:00'))
        if isinstance(contact.get('created_at'), str):
            contact['created_at'] = datetime.fromisoformat(contact['created_at'].replace('Z', '+00:00'))
        if isinstance(contact.get('ultimo_contacto'), str):
            contact['ultimo_contacto'] = datetime.fromisoformat(contact['ultimo_contacto'].replace('Z', '+00:00'))
        
        return contact
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting contact: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@crm_router.put("/contacts/{contact_id}", response_model=Contact)
async def update_contact(contact_id: str, update: ContactUpdate, workspace_id: str = Depends(get_current_workspace_id)):
    """Update a contact"""
    db = get_db()
    try:
        # Get current contact
        current = await db.crm_contacts.find_one({"id": contact_id, "workspace_id": workspace_id}, {"_id": 0})
        if not current:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        # Build update dict
        update_data = {k: v for k, v in update.model_dump().items() if v is not None}
        update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
        
        # Track stage change for timeline
        old_etapa = current.get('etapa')
        new_etapa = update_data.get('etapa')
        
        await db.crm_contacts.update_one(
            {"id": contact_id, "workspace_id": workspace_id},
            {"$set": update_data}
        )
        
        # If stage changed, add timeline event
        if new_etapa and new_etapa != old_etapa:
            event = TimelineEvent(
                contact_id=contact_id,
                tipo="etapa",
                descripcion=f"Etapa cambiada de '{old_etapa}' a '{new_etapa}'"
            )
            event_doc = event.model_dump()
            event_doc['workspace_id'] = workspace_id
            event_doc['created_at'] = event_doc['created_at'].isoformat()
            await db.crm_timeline.insert_one(event_doc)
        
        # Get updated contact
        updated = await db.crm_contacts.find_one({"id": contact_id, "workspace_id": workspace_id}, {"_id": 0})
        if isinstance(updated.get('updated_at'), str):
            updated['updated_at'] = datetime.fromisoformat(updated['updated_at'].replace('Z', '+00:00'))
        if isinstance(updated.get('created_at'), str):
            updated['created_at'] = datetime.fromisoformat(updated['created_at'].replace('Z', '+00:00'))
        
        return updated
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating contact: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@crm_router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, workspace_id: str = Depends(get_current_workspace_id)):
    """Delete a contact"""
    db = get_db()
    try:
        result = await db.crm_contacts.delete_one({"id": contact_id, "workspace_id": workspace_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        # Also delete timeline events
        await db.crm_timeline.delete_many({"contact_id": contact_id, "workspace_id": workspace_id})
        
        return {"message": "Contact deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting contact: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== PIPELINE ENDPOINTS ==============

@crm_router.get("/pipeline")
async def get_pipeline(workspace_id: str = Depends(get_current_workspace_id)):
    """Get contacts grouped by pipeline stage with totals"""
    db = get_db()
    try:
        pipeline = {}
        totals = {}
        for stage in PIPELINE_STAGES:
            contacts = await db.crm_contacts.find(
                {"etapa": stage, "workspace_id": workspace_id}, 
                {"_id": 0}
            ).sort("probabilidad_cierre", -1).to_list(100)
            
            # Parse dates and calculate days
            now = datetime.now(timezone.utc)
            stage_value = 0
            for c in contacts:
                if isinstance(c.get('updated_at'), str):
                    c['updated_at'] = datetime.fromisoformat(c['updated_at'].replace('Z', '+00:00'))
                if isinstance(c.get('created_at'), str):
                    c['created_at'] = datetime.fromisoformat(c['created_at'].replace('Z', '+00:00'))
                updated = c.get('updated_at', now)
                if isinstance(updated, datetime):
                    c['dias_en_etapa'] = (now - updated).days
                stage_value += c.get('valor_mensual', 0)
            
            pipeline[stage] = contacts
            totals[stage] = {
                "count": len(contacts),
                "value": stage_value
            }
        
        return {"pipeline": pipeline, "totals": totals}
    except Exception as e:
        logger.error(f"Error getting pipeline: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@crm_router.put("/pipeline/move/{contact_id}")
async def move_in_pipeline(contact_id: str, new_stage: str, workspace_id: str = Depends(get_current_workspace_id)):
    """Move a contact to a new pipeline stage"""
    db = get_db()
    try:
        if new_stage not in PIPELINE_STAGES:
            raise HTTPException(status_code=400, detail=f"Invalid stage. Must be one of: {PIPELINE_STAGES}")
        
        current = await db.crm_contacts.find_one({"id": contact_id, "workspace_id": workspace_id}, {"_id": 0})
        if not current:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        old_stage = current.get('etapa')
        
        await db.crm_contacts.update_one(
            {"id": contact_id, "workspace_id": workspace_id},
            {"$set": {
                "etapa": new_stage,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        # Add timeline event
        event = TimelineEvent(
            contact_id=contact_id,
            tipo="etapa",
            descripcion=f"Movido de '{old_stage}' a '{new_stage}'"
        )
        event_doc = event.model_dump()
        event_doc['workspace_id'] = workspace_id
        event_doc['created_at'] = event_doc['created_at'].isoformat()
        await db.crm_timeline.insert_one(event_doc)
        
        return {"message": f"Contact moved to {new_stage}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error moving contact: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== TIMELINE ENDPOINTS ==============

@crm_router.get("/timeline/{contact_id}", response_model=List[TimelineEvent])
async def get_timeline(contact_id: str, workspace_id: str = Depends(get_current_workspace_id)):
    """Get timeline events for a contact"""
    db = get_db()
    try:
        events = await db.crm_timeline.find(
            {"contact_id": contact_id, "workspace_id": workspace_id},
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)
        
        for e in events:
            if isinstance(e.get('created_at'), str):
                e['created_at'] = datetime.fromisoformat(e['created_at'].replace('Z', '+00:00'))
        
        return events
    except Exception as e:
        logger.error(f"Error getting timeline: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@crm_router.post("/timeline", response_model=TimelineEvent)
async def add_timeline_event(event_input: TimelineEventCreate, workspace_id: str = Depends(get_current_workspace_id)):
    """Add a timeline event"""
    db = get_db()
    try:
        event = TimelineEvent(**event_input.model_dump())
        doc = event.model_dump()
        doc['workspace_id'] = workspace_id
        doc['created_at'] = doc['created_at'].isoformat()
        
        await db.crm_timeline.insert_one(doc)
        
        # Update ultimo_contacto on contact
        await db.crm_contacts.update_one(
            {"id": event_input.contact_id, "workspace_id": workspace_id},
            {"$set": {"ultimo_contacto": datetime.now(timezone.utc).isoformat()}}
        )
        
        return event
    except Exception as e:
        logger.error(f"Error adding timeline event: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== METRICS ENDPOINTS ==============

@crm_router.get("/metrics")
async def get_metrics(workspace_id: str = Depends(get_current_workspace_id)):
    """Get dashboard metrics"""
    db = get_db()
    try:
        # Count by stage
        nuevo = await db.crm_contacts.count_documents({"etapa": "nuevo", "workspace_id": workspace_id})
        trabajando = await db.crm_contacts.count_documents({"etapa": "trabajando", "workspace_id": workspace_id})
        propuesta = await db.crm_contacts.count_documents({"etapa": "propuesta", "workspace_id": workspace_id})
        cierre = await db.crm_contacts.count_documents({"etapa": "cierre", "workspace_id": workspace_id})
        ganado = await db.crm_contacts.count_documents({"etapa": "ganado", "workspace_id": workspace_id})
        perdido = await db.crm_contacts.count_documents({"etapa": "perdido", "workspace_id": workspace_id})
        
        # Revenue calculations
        active_stages = ["nuevo", "trabajando", "propuesta", "cierre"]
        pipeline_contacts = await db.crm_contacts.find(
            {"etapa": {"$in": active_stages}, "workspace_id": workspace_id},
            {"_id": 0, "valor_mensual": 1, "setup_fee": 1, "probabilidad_cierre": 1}
        ).to_list(1000)
        
        revenue_potencial = sum(c.get('valor_mensual', 0) for c in pipeline_contacts)
        revenue_ponderado = sum(
            c.get('valor_mensual', 0) * (c.get('probabilidad_cierre', 0) / 100)
            for c in pipeline_contacts
        )
        
        # Won deals this month
        now = datetime.now(timezone.utc)
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        ganado_contacts = await db.crm_contacts.find(
            {"etapa": "ganado", "workspace_id": workspace_id},
            {"_id": 0, "valor_mensual": 1, "updated_at": 1}
        ).to_list(1000)
        
        mrr_actual = sum(c.get('valor_mensual', 0) for c in ganado_contacts)
        cierres_mes = 0
        revenue_mes = 0
        for c in ganado_contacts:
            updated = c.get('updated_at')
            if isinstance(updated, str):
                updated = datetime.fromisoformat(updated.replace('Z', '+00:00'))
            if updated and updated >= start_of_month:
                cierres_mes += 1
                revenue_mes += c.get('valor_mensual', 0)
        
        # Alerts
        three_days_ago = now - timedelta(days=3)
        sin_tocar = await db.crm_contacts.count_documents({
            "etapa": {"$in": active_stages},
            "workspace_id": workspace_id,
            "ultimo_contacto": {"$lt": three_days_ago.isoformat()}
        })
        
        # Conversion rate
        total_finalizados = ganado + perdido
        tasa_conversion = round((ganado / total_finalizados * 100), 1) if total_finalizados > 0 else 0
        
        # Today's activity
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        creados_hoy = await db.crm_contacts.count_documents({
            "workspace_id": workspace_id,
            "created_at": {"$gte": start_of_day.isoformat()}
        })
        eventos_hoy = await db.crm_timeline.count_documents({
            "workspace_id": workspace_id,
            "created_at": {"$gte": start_of_day.isoformat()}
        })
        ai_calls_hoy = await db.crm_ai_logs.count_documents({
            "workspace_id": workspace_id,
            "created_at": {"$gte": start_of_day.isoformat()}
        })
        
        # Get workspace meta_mensual
        ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0, "meta_mensual": 1})
        meta_mensual = (ws or {}).get('meta_mensual', 0)
        porcentaje_meta = (revenue_mes / meta_mensual * 100) if meta_mensual > 0 else 0
        
        return {
            "prospectos_activos": nuevo + trabajando + propuesta + cierre,
            "deals_abiertos": trabajando + propuesta + cierre,
            "revenue_potencial": revenue_potencial,
            "revenue_ponderado": int(revenue_ponderado),
            "mrr_actual": mrr_actual,
            "cierres_mes": cierres_mes,
            "revenue_mes": revenue_mes,
            "meta_mensual": meta_mensual,
            "porcentaje_meta": round(porcentaje_meta, 1),
            "tasa_conversion": tasa_conversion,
            "actividad_hoy": {
                "leads_nuevos": creados_hoy,
                "eventos": eventos_hoy,
                "ai_calls": ai_calls_hoy,
            },
            "alertas": {
                "sin_tocar_3_dias": sin_tocar,
                "total_nuevo": nuevo,
                "total_propuesta": propuesta,
                "total_cierre": cierre
            },
            "por_etapa": {
                "nuevo": nuevo,
                "trabajando": trabajando,
                "propuesta": propuesta,
                "cierre": cierre,
                "ganado": ganado,
                "perdido": perdido
            }
        }
    except Exception as e:
        logger.error(f"Error getting metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== AI COPILOT ENDPOINTS ==============

@crm_router.post("/ai/generate")
async def ai_generate(request: AIRequest, workspace_id: str = Depends(get_current_workspace_id)):
    """Generate AI content for sales using OpenAI GPT-4o-mini"""
    db = get_db()
    try:
        # Get contact info
        contact = await db.crm_contacts.find_one({"id": request.contact_id, "workspace_id": workspace_id}, {"_id": 0})
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        # Get OpenAI API key
        api_key = os.environ.get('OPENAI_API_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="OpenAI API key not configured")
        
        # Build context
        contact_context = f"""
        Empresa: {contact.get('empresa')}
        Contacto: {contact.get('nombre')}
        Nicho: {contact.get('nicho', 'No especificado')}
        Etapa: {contact.get('etapa')}
        Valor mensual: ${contact.get('valor_mensual', 0):,} CLP
        Probabilidad cierre: {contact.get('probabilidad_cierre', 0)}%
        Notas: {contact.get('notas', 'Sin notas')}
        """
        
        # Define prompts by type
        prompts = {
            "email": f"""Eres un experto en ventas B2B en Chile. Genera un email de seguimiento profesional y personalizado.
            
            Contexto del lead:
            {contact_context}
            
            Contexto adicional: {request.contexto or 'Seguimiento general'}
            
            Escribe un email corto, profesional y orientado a cerrar la venta. En español chileno pero profesional.
            Solo el cuerpo del email, sin asunto.""",
            
            "whatsapp": f"""Eres un experto en ventas por WhatsApp en Chile. Genera un mensaje corto y efectivo.
            
            Contexto del lead:
            {contact_context}
            
            Contexto adicional: {request.contexto or 'Seguimiento general'}
            
            Escribe un mensaje de WhatsApp corto (máximo 3 líneas), cercano pero profesional. En español chileno.""",
            
            "followup": f"""Eres un consultor de ventas. Sugiere la mejor estrategia de seguimiento.
            
            Contexto del lead:
            {contact_context}
            
            Responde en formato:
            1. Acción recomendada (1 línea)
            2. Mensaje sugerido (2-3 líneas)
            3. Mejor momento para contactar""",
            
            "score": f"""Eres un analista de ventas. Evalúa la probabilidad de cierre de este lead.
            
            Contexto del lead:
            {contact_context}
            
            Responde en formato JSON:
            {{"score": número del 0 al 100, "razon": "explicación breve", "accion": "próxima acción recomendada"}}"""
        }
        
        prompt = prompts.get(request.tipo, prompts["followup"])
        
        # Call OpenAI directly
        client = AsyncOpenAI(api_key=api_key)
        completion = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Eres un asistente de ventas experto para empresas en Chile. Responde siempre en español."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
        )
        response = completion.choices[0].message.content
        
        # Log AI action
        usage = completion.usage
        log_doc = {
            "id": str(uuid.uuid4()),
            "workspace_id": workspace_id,
            "tipo": request.tipo,
            "contact_id": request.contact_id,
            "empresa": contact.get('empresa'),
            "model": "gpt-4o-mini",
            "prompt_tokens": usage.prompt_tokens if usage else 0,
            "completion_tokens": usage.completion_tokens if usage else 0,
            "total_tokens": usage.total_tokens if usage else 0,
            "contenido": response,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.crm_ai_logs.insert_one(log_doc)
        
        # Add timeline event for AI generation
        await db.crm_timeline.insert_one({
            "id": str(uuid.uuid4()),
            "workspace_id": workspace_id,
            "contact_id": request.contact_id,
            "tipo": "ia",
            "descripcion": f"IA generó contenido tipo '{request.tipo}' ({usage.total_tokens if usage else 0} tokens)",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "metadata": {"tipo": request.tipo, "tokens": usage.total_tokens if usage else 0},
        })
        
        return {
            "tipo": request.tipo,
            "contenido": response,
            "contact_id": request.contact_id,
            "tokens": usage.total_tokens if usage else 0,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating AI content: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@crm_router.get("/ai/priorities")
async def ai_priorities(workspace_id: str = Depends(get_current_workspace_id)):
    """Get AI-suggested daily priorities using OpenAI GPT-4o-mini"""
    db = get_db()
    try:
        api_key = os.environ.get('OPENAI_API_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="OpenAI API key not configured")
        
        # Get hot leads
        hot_leads = await db.crm_contacts.find(
            {"etapa": {"$in": ["trabajando", "propuesta", "cierre"]}, "workspace_id": workspace_id},
            {"_id": 0}
        ).sort("probabilidad_cierre", -1).to_list(20)
        
        if not hot_leads:
            return {"prioridades": [], "hot_leads": [], "mensaje": "No hay leads activos"}
        
        # Build context
        leads_text = "\n".join([
            f"- {lead.get('empresa')} ({lead.get('nombre')}): ${lead.get('valor_mensual', 0):,}/mes, {lead.get('probabilidad_cierre', 0)}% cierre, etapa: {lead.get('etapa')}"
            for lead in hot_leads[:10]
        ])
        
        prompt = f"""Eres un director comercial. Analiza estos leads y sugiere las 5 acciones prioritarias para hoy.

Leads activos:
{leads_text}

Responde con exactamente 5 acciones en formato:
1. [Acción] - [Empresa] - [Razón breve]

Prioriza por: probabilidad de cierre, valor, y urgencia."""
        
        client = AsyncOpenAI(api_key=api_key)
        completion = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Eres un director comercial experto. Responde en español, conciso y accionable."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
        )
        response = completion.choices[0].message.content
        
        # Log AI action
        usage = completion.usage
        await db.crm_ai_logs.insert_one({
            "id": str(uuid.uuid4()),
            "workspace_id": workspace_id,
            "tipo": "prioridades",
            "contact_id": None,
            "empresa": None,
            "model": "gpt-4o-mini",
            "prompt_tokens": usage.prompt_tokens if usage else 0,
            "completion_tokens": usage.completion_tokens if usage else 0,
            "total_tokens": usage.total_tokens if usage else 0,
            "contenido": response,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        
        # Parse response into list
        lines = [l.strip() for l in response.split('\n') if l.strip() and l[0].isdigit()]
        
        return {
            "prioridades": lines[:5],
            "hot_leads": [
                {
                    "id": lead.get('id'),
                    "empresa": lead.get('empresa'),
                    "nombre": lead.get('nombre'),
                    "valor_mensual": lead.get('valor_mensual', 0),
                    "probabilidad_cierre": lead.get('probabilidad_cierre', 0),
                    "etapa": lead.get('etapa')
                }
                for lead in hot_leads[:5]
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AI priorities: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@crm_router.get("/ai/logs")
async def get_ai_logs(workspace_id: str = Depends(get_current_workspace_id), limit: int = 50):
    """Get last N AI generation logs"""
    db = get_db()
    try:
        logs = await db.crm_ai_logs.find(
            {"workspace_id": workspace_id}, {"_id": 0}
        ).sort("created_at", -1).to_list(limit)
        
        # Aggregate stats
        total_calls = await db.crm_ai_logs.count_documents({"workspace_id": workspace_id})
        total_tokens_doc = await db.crm_ai_logs.aggregate([
            {"$match": {"workspace_id": workspace_id}},
            {"$group": {"_id": None, "total": {"$sum": "$total_tokens"}}}
        ]).to_list(1)
        total_tokens = total_tokens_doc[0]["total"] if total_tokens_doc else 0
        
        # Estimated cost for gpt-4o-mini: $0.15/1M input, $0.60/1M output (rough avg $0.40/1M)
        estimated_cost_usd = round((total_tokens / 1_000_000) * 0.40, 4)
        
        return {
            "logs": logs,
            "stats": {
                "total_calls": total_calls,
                "total_tokens": total_tokens,
                "estimated_cost_usd": estimated_cost_usd,
                "model": "gpt-4o-mini"
            }
        }
    except Exception as e:
        logger.error(f"Error getting AI logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@crm_router.post("/ai/summary/{contact_id}")
async def ai_summary(contact_id: str, workspace_id: str = Depends(get_current_workspace_id)):
    """Generate a structured AI summary of the contact + conversation history."""
    db = get_db()
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    contact = await db.crm_contacts.find_one({"id": contact_id, "workspace_id": workspace_id}, {"_id": 0})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    messages = await db.crm_messages.find(
        {"contact_id": contact_id, "workspace_id": workspace_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)

    convo_text = "\n".join([f"{m.get('direction','?')}: {m.get('content','')}" for m in messages]) or "(sin mensajes registrados)"
    contact_data = {
        "empresa": contact.get("empresa"),
        "nombre": contact.get("nombre"),
        "telefono": contact.get("telefono"),
        "email": contact.get("email"),
        "nicho": contact.get("nicho"),
        "valor_mensual": contact.get("valor_mensual"),
        "etapa": contact.get("etapa"),
        "fuente": contact.get("fuente"),
        "score_ia": contact.get("score_ia"),
        "notas": contact.get("notas"),
    }

    summary_prompt = f"""Eres un analista comercial. Analiza el siguiente lead y su historial de conversación.

DATOS DEL CONTACTO:
{json.dumps(contact_data, ensure_ascii=False, indent=2)}

HISTORIAL DE MENSAJES (inbound = visitante, outbound = asistente):
{convo_text}

Devuelve SOLO un JSON con esta estructura exacta (en español):
{{
  "necesidad_detectada": "descripción concreta de qué busca o necesita el cliente (1-2 líneas)",
  "nivel_interes": "frio" | "tibio" | "caliente" | "muy_caliente",
  "nivel_interes_score": integer 0-100,
  "plan_recomendado": "nombre del plan más adecuado o null si no hay info suficiente",
  "razon_plan": "por qué ese plan en 1 línea",
  "proxima_accion": "acción comercial concreta que el founder debe ejecutar HOY (1 línea, accionable)",
  "datos_faltantes": ["lista de datos que aún faltan para cerrar la venta, ej: 'presupuesto mensual', 'fecha tentativa de inicio'"]
}}

Reglas:
- nivel_interes: 'frio' si solo curiosidad, 'tibio' si pregunta y compara, 'caliente' si pide datos/cotización, 'muy_caliente' si pidió contacto/agendar/comprar.
- Si no hay conversación, usa solo los datos del contacto.
- NO inventes información. Si falta dato, va en datos_faltantes."""

    try:
        client = AsyncOpenAI(api_key=api_key)
        completion = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Eres un analista comercial experto en B2B Chile. Devuelve SOLO JSON válido."},
                {"role": "user", "content": summary_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        raw = completion.choices[0].message.content
        summary = json.loads(raw)
        usage = completion.usage
    except Exception as e:
        logger.error(f"AI summary failed: {e}")
        raise HTTPException(status_code=500, detail=f"Error generando resumen: {str(e)}")

    # Cache in contact + log
    now_iso = datetime.now(timezone.utc).isoformat()
    summary_doc = {
        "summary": summary,
        "generated_at": now_iso,
        "messages_count": len(messages),
        "tokens": usage.total_tokens if usage else 0,
    }
    await db.crm_contacts.update_one(
        {"id": contact_id, "workspace_id": workspace_id},
        {"$set": {"ai_summary": summary_doc, "updated_at": now_iso}}
    )
    await db.crm_ai_logs.insert_one({
        "id": str(uuid.uuid4()),
        "workspace_id": workspace_id,
        "tipo": "resumen",
        "contact_id": contact_id,
        "empresa": contact.get("empresa"),
        "model": "gpt-4o-mini",
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0,
        "total_tokens": usage.total_tokens if usage else 0,
        "contenido": raw,
        "created_at": now_iso,
    })

    return summary_doc

# ============== SETTINGS ENDPOINTS ==============

@crm_router.get("/settings", response_model=Settings)
async def get_settings(workspace_id: str = Depends(get_current_workspace_id)):
    """Get CRM settings (per-workspace, lives in workspaces.meta_mensual + crm_settings as legacy)"""
    db = get_db()
    try:
        ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0})
        return {
            "id": "settings",
            "meta_mensual": (ws or {}).get("meta_mensual", 0),
            "mrr_actual": 0,
            "plantillas_email": [],
            "plantillas_whatsapp": [],
            "updated_at": (ws or {}).get("updated_at", datetime.now(timezone.utc).isoformat()),
        }
    except Exception as e:
        logger.error(f"Error getting settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@crm_router.put("/settings")
async def update_settings(settings_update: dict, workspace_id: str = Depends(get_current_workspace_id)):
    """Update CRM settings (writes to workspace.meta_mensual)"""
    db = get_db()
    try:
        update = {"updated_at": datetime.now(timezone.utc).isoformat()}
        if "meta_mensual" in settings_update:
            update["meta_mensual"] = int(settings_update["meta_mensual"])
        await db.workspaces.update_one({"id": workspace_id}, {"$set": update})
        return {"message": "Settings updated"}
    except Exception as e:
        logger.error(f"Error updating settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))
