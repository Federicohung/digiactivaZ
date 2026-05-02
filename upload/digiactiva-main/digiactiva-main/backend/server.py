from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# Lead/Contact Models
class LeadCreate(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    telefono: str = Field(..., min_length=8, max_length=20)
    mensaje: Optional[str] = Field(None, max_length=1000)
    servicio_interes: Optional[str] = None

class Lead(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nombre: str
    email: str
    telefono: str
    mensaje: Optional[str] = None
    servicio_interes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "nuevo"

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    # Exclude MongoDB's _id field from the query results
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks

# Lead/Contact endpoints
@api_router.post("/leads", response_model=Lead)
async def create_lead(lead_input: LeadCreate):
    """Create a new lead from contact form (and mirror into CRM, default workspace=DigiActiva)"""
    try:
        lead_obj = Lead(**lead_input.model_dump())
        # Resolve default workspace (DigiActiva)
        digiactiva = await db.workspaces.find_one({"slug": "digiactiva"}, {"_id": 0, "id": 1})
        ws_id = digiactiva["id"] if digiactiva else None

        doc = lead_obj.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        if ws_id:
            doc['workspace_id'] = ws_id
        await db.leads.insert_one(doc)
        logger.info(f"New lead created: {lead_obj.email}")
        
        # Mirror into CRM as a new contact in "nuevo" stage
        if ws_id:
            try:
                now_iso = datetime.now(timezone.utc).isoformat()
                crm_doc = {
                    "id": str(uuid.uuid4()),
                    "workspace_id": ws_id,
                    "empresa": lead_obj.nombre,
                    "nombre": lead_obj.nombre,
                    "telefono": lead_obj.telefono,
                    "email": lead_obj.email,
                    "nicho": lead_obj.servicio_interes,
                    "fuente": "formulario",
                    "valor_mensual": 0,
                    "setup_fee": 0,
                    "etapa": "nuevo",
                    "probabilidad_cierre": 0,
                    "fecha_cierre_estimada": None,
                    "proxima_accion": None,
                    "proxima_accion_fecha": None,
                    "notas": lead_obj.mensaje,
                    "created_at": now_iso,
                    "updated_at": now_iso,
                    "ultimo_contacto": now_iso,
                    "dias_en_etapa": 0,
                    "score_ia": 0,
                }
                await db.crm_contacts.insert_one(crm_doc)
                await db.crm_timeline.insert_one({
                    "id": str(uuid.uuid4()),
                    "workspace_id": ws_id,
                    "contact_id": crm_doc["id"],
                    "tipo": "creado",
                    "descripcion": f"Lead creado desde formulario web (servicio: {lead_obj.servicio_interes or 'no especificado'})",
                    "created_at": now_iso,
                    "metadata": {"source_lead_id": lead_obj.id},
                })
                logger.info(f"Lead mirrored into CRM: {crm_doc['id']}")
            except Exception as crm_err:
                logger.error(f"Failed to mirror lead into CRM: {crm_err}")
        
        return lead_obj
    except Exception as e:
        logger.error(f"Error creating lead: {e}")
        raise HTTPException(status_code=500, detail="Error al enviar el mensaje")

@api_router.get("/leads", response_model=List[Lead])
async def get_leads():
    """Get all leads (for admin purposes)"""
    leads = await db.leads.find(
        {}, 
        {"_id": 0, "id": 1, "nombre": 1, "email": 1, "telefono": 1, "servicio_interes": 1, "mensaje": 1, "created_at": 1, "status": 1}
    ).sort("created_at", -1).to_list(1000)
    
    for lead in leads:
        if isinstance(lead.get('created_at'), str):
            lead['created_at'] = datetime.fromisoformat(lead['created_at'])
    
    return leads

# Admin Authentication
class AdminLogin(BaseModel):
    password: str

class AdminToken(BaseModel):
    token: str
    expires_at: datetime

import hashlib
import secrets

# Store active tokens in memory (for simple implementation)
active_admin_tokens = {}

def get_admin_password_hash():
    """Get admin password from environment or use default for dev"""
    password = os.environ.get('ADMIN_PASSWORD', 'digiactiva2025')
    return hashlib.sha256(password.encode()).hexdigest()

@api_router.post("/admin/login", response_model=AdminToken)
async def admin_login(login: AdminLogin):
    """Admin login endpoint - validates password and returns token"""
    password_hash = hashlib.sha256(login.password.encode()).hexdigest()
    
    if password_hash != get_admin_password_hash():
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")
    
    # Generate secure token
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(hours=24)
    
    # Store token
    active_admin_tokens[token] = expires_at
    
    # Clean expired tokens
    current_time = datetime.now(timezone.utc)
    expired = [t for t, exp in active_admin_tokens.items() if exp < current_time]
    for t in expired:
        del active_admin_tokens[t]
    
    logger.info("Admin login successful")
    return AdminToken(token=token, expires_at=expires_at)

@api_router.post("/admin/verify")
async def verify_admin_token(token: str):
    """Verify if admin token is valid"""
    if token not in active_admin_tokens:
        raise HTTPException(status_code=401, detail="Token inválido")
    
    if active_admin_tokens[token] < datetime.now(timezone.utc):
        del active_admin_tokens[token]
        raise HTTPException(status_code=401, detail="Token expirado")
    
    return {"valid": True}

@api_router.post("/admin/logout")
async def admin_logout(token: str):
    """Logout admin - invalidate token"""
    if token in active_admin_tokens:
        del active_admin_tokens[token]
    return {"message": "Sesión cerrada"}

# Include the router in the main app
app.include_router(api_router)

# Include CRM router
from crm import crm_router
app.include_router(crm_router)

# Include Chat router (public + admin endpoints)
from chat import chat_router
app.include_router(chat_router)

# Include Auth + Workspaces (multi-tenant)
from auth import auth_router, seed_admin_users, ensure_indexes
from workspaces import ws_router, seed_workspaces, migrate_existing_data_to_digiactiva
from whatsapp import wa_router
from external import external_router, admin_external_router
from composio_channels import composio_router
from inbox import inbox_router, ensure_inbox_indexes, backfill_conversations
from global_settings import admin_router as global_admin_router, public_health_router
from composio_triggers import triggers_router as composio_triggers_router, events_router as composio_events_router, ensure_webhook_events_indexes
app.include_router(auth_router)
app.include_router(ws_router)
app.include_router(wa_router)
app.include_router(external_router)
app.include_router(admin_external_router)
app.include_router(composio_router)
app.include_router(composio_triggers_router)
app.include_router(composio_events_router)
app.include_router(inbox_router)
app.include_router(global_admin_router)
app.include_router(public_health_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

@app.on_event("startup")
async def startup_seed():
    """Bootstrap multi-tenant: ensure indexes, seed workspaces and admin users, migrate existing data."""
    try:
        await ensure_indexes(db)
        await seed_workspaces(db)
        await migrate_existing_data_to_digiactiva(db)
        await seed_admin_users(db)
        # Sprint B0: rename source landing_chat → web_chat
        from messaging import migrate_landing_chat_to_web_chat
        await migrate_landing_chat_to_web_chat(db)
        # Index for messages lookup
        await db.crm_messages.create_index([("workspace_id", 1), ("contact_id", 1), ("created_at", 1)])
        await db.crm_messages.create_index("session_id")
        # Inbox: indexes + backfill legacy messages → conversations
        await ensure_inbox_indexes(db)
        await backfill_conversations(db)
        # Composio webhook events: indexes
        await ensure_webhook_events_indexes(db)
        logger.info("Multi-tenant bootstrap complete")
    except Exception as e:
        logger.error(f"Bootstrap error: {e}")