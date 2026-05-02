"""
ACTIVA - Auth (JWT email/password) + multi-tenant context.
Roles: founder_admin (sees all workspaces) | workspace_admin (one workspace).
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
import logging
import bcrypt
import jwt as pyjwt

logger = logging.getLogger(__name__)

auth_router = APIRouter(prefix="/api/auth", tags=["Auth"])

JWT_ALGORITHM = "HS256"
ACCESS_TTL_MIN = 60 * 12  # 12h (founder operativo)

def get_db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

# ---------- Password helpers ----------
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

# ---------- JWT helpers ----------
def create_access_token(user_id: str, email: str, role: str, active_workspace_id: Optional[str]) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "active_workspace_id": active_workspace_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MIN),
        "type": "access",
    }
    return pyjwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    return pyjwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])

# ---------- Models ----------
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    password_hash: str
    name: str
    role: str  # 'founder_admin' | 'workspace_admin'
    workspace_ids: List[str] = []
    active_workspace_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_login: Optional[datetime] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class SwitchWorkspaceRequest(BaseModel):
    workspace_id: str

# ---------- Dependency ----------
async def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:] if auth_header.startswith("Bearer ") else None
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token inválido")
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesión expirada")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

    db = get_db()
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    user["active_workspace_id"] = payload.get("active_workspace_id")
    return user

async def require_founder(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "founder_admin":
        raise HTTPException(status_code=403, detail="Solo founder_admin")
    return user

async def get_current_workspace_id(user: dict = Depends(get_current_user)) -> str:
    ws = user.get("active_workspace_id")
    if not ws:
        raise HTTPException(status_code=400, detail="Selecciona un workspace")
    # workspace_admin must only access its own workspaces
    if user.get("role") == "workspace_admin" and ws not in (user.get("workspace_ids") or []):
        raise HTTPException(status_code=403, detail="Sin acceso a este workspace")
    return ws

# ---------- Endpoints ----------
@auth_router.post("/login")
async def login(payload: LoginRequest):
    db = get_db()
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")

    # Pick default active workspace
    role = user.get("role")
    workspace_ids = user.get("workspace_ids") or []
    if role == "founder_admin":
        # founder sees all; pick first existing or DigiActiva
        any_ws = await db.workspaces.find_one({"slug": "digiactiva"}, {"_id": 0, "id": 1})
        active = any_ws["id"] if any_ws else (workspace_ids[0] if workspace_ids else None)
    else:
        active = workspace_ids[0] if workspace_ids else None

    token = create_access_token(user["id"], email, role, active)

    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}}
    )

    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": email,
            "name": user.get("name"),
            "role": role,
            "workspace_ids": workspace_ids,
            "active_workspace_id": active,
        },
    }

@auth_router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@auth_router.post("/switch-workspace")
async def switch_workspace(payload: SwitchWorkspaceRequest, user: dict = Depends(get_current_user)):
    db = get_db()
    target = await db.workspaces.find_one({"id": payload.workspace_id}, {"_id": 0, "id": 1, "name": 1, "slug": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Workspace no existe")
    role = user.get("role")
    if role != "founder_admin" and payload.workspace_id not in (user.get("workspace_ids") or []):
        raise HTTPException(status_code=403, detail="Sin acceso a este workspace")
    token = create_access_token(user["id"], user["email"], role, payload.workspace_id)
    return {"token": token, "active_workspace_id": payload.workspace_id, "workspace": target}

# ---------- Seed ----------
async def seed_admin_users(db):
    """Create founder_admin and pasta workspace_admin if missing."""
    founder_email = os.environ.get("FOUNDER_EMAIL", "founder@digiactiva.com").lower()
    founder_pwd = os.environ.get("FOUNDER_PASSWORD", "digiactiva2025")
    pasta_email = os.environ.get("PASTA_ADMIN_EMAIL", "admin@pastaalvuelo.com").lower()
    pasta_pwd = os.environ.get("PASTA_ADMIN_PASSWORD", "pastaalvuelo2025")

    existing = await db.users.find_one({"email": founder_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": founder_email,
            "password_hash": hash_password(founder_pwd),
            "name": "Founder DigiActiva",
            "role": "founder_admin",
            "workspace_ids": [],  # founder accesses all dynamically
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded founder_admin: {founder_email}")
    elif not verify_password(founder_pwd, existing.get("password_hash", "")):
        await db.users.update_one(
            {"email": founder_email},
            {"$set": {"password_hash": hash_password(founder_pwd)}}
        )

    pasta_existing = await db.users.find_one({"email": pasta_email})
    pasta_ws = await db.workspaces.find_one({"slug": "pasta-al-vuelo"}, {"_id": 0, "id": 1})
    pasta_ws_id = pasta_ws["id"] if pasta_ws else None
    if not pasta_existing and pasta_ws_id:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": pasta_email,
            "password_hash": hash_password(pasta_pwd),
            "name": "Admin Pasta al Vuelo",
            "role": "workspace_admin",
            "workspace_ids": [pasta_ws_id],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded workspace_admin: {pasta_email}")
    elif pasta_existing and pasta_ws_id and pasta_ws_id not in (pasta_existing.get("workspace_ids") or []):
        await db.users.update_one(
            {"email": pasta_email},
            {"$set": {"workspace_ids": [pasta_ws_id]}}
        )

async def ensure_indexes(db):
    await db.users.create_index("email", unique=True)
    await db.workspaces.create_index("slug", unique=True)
    # Multi-tenant indexes
    for col in ["crm_contacts", "crm_timeline", "crm_chat_sessions", "crm_ai_logs", "crm_messages", "crm_tasks", "leads"]:
        await db[col].create_index("workspace_id")
