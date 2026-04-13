from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, UploadFile, File, Form
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
import bcrypt
import jwt
import base64
import secrets
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ─── Auth Helpers ───────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def get_jwt_secret():
    return os.environ["JWT_SECRET"]

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(hours=24), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Tipo de token invalido")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalido")

async def require_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acceso denegado: se requiere rol de admin")
    return user

async def require_active(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("status") != "active":
        raise HTTPException(status_code=403, detail="Tu cuenta aun no ha sido aprobada")
    return user

def serialize_doc(doc):
    if doc is None:
        return None
    doc["_id"] = str(doc["_id"])
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            doc[k] = str(v)
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc

def serialize_list(docs):
    return [serialize_doc(d) for d in docs]

# ─── Pydantic Models ──────────────────────────────────────────

class RegisterInput(BaseModel):
    email: str
    password: str
    name: str
    cedula: str = ""
    phone: str = ""

class LoginInput(BaseModel):
    email: str
    password: str

class RoleChange(BaseModel):
    role: str

class ResetPasswordInput(BaseModel):
    new_password: str

class LoanInput(BaseModel):
    amount: float
    purpose: str
    description: str = ""

class VoteInput(BaseModel):
    vote: str  # "for" or "against"

class PaymentInput(BaseModel):
    amount: float
    type: str = "ahorro"
    note: str = ""

# ─── Auth Routes ──────────────────────────────────────────────

@api_router.post("/auth/register")
async def register(input: RegisterInput, response: Response):
    email = input.email.strip().lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Este correo ya esta registrado")

    user_doc = {
        "email": email,
        "password_hash": hash_password(input.password),
        "name": input.name.strip(),
        "cedula": input.cedula.strip(),
        "phone": input.phone.strip(),
        "role": "socio",
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    return {"message": "Tu cuenta espera aprobacion del administrador", "user_id": user_id, "status": "pending"}

@api_router.post("/auth/login")
async def login(input: LoginInput, request: Request):
    email = input.email.strip().lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"

    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= 5:
        locked_until = attempt.get("locked_until")
        if locked_until and datetime.now(timezone.utc) < datetime.fromisoformat(locked_until):
            raise HTTPException(status_code=429, detail="Demasiados intentos. Intenta en 15 minutos.")
        else:
            await db.login_attempts.delete_one({"identifier": identifier})

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(input.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"locked_until": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}},
            upsert=True
        )
        raise HTTPException(status_code=401, detail="Correo o contrasena incorrectos")

    if user.get("status") == "pending":
        raise HTTPException(status_code=403, detail="Tu cuenta espera aprobacion del administrador")
    if user.get("status") == "rejected":
        raise HTTPException(status_code=403, detail="Tu cuenta ha sido rechazada")
    if user.get("status") == "suspended":
        raise HTTPException(status_code=403, detail="Tu cuenta ha sido suspendida")

    await db.login_attempts.delete_one({"identifier": identifier})

    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email)

    return {
        "access_token": access_token,
        "user": {
            "_id": user_id,
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "status": user["status"],
            "cedula": user.get("cedula", ""),
            "phone": user.get("phone", ""),
        }
    }

@api_router.post("/auth/logout")
async def logout():
    return {"message": "Sesion cerrada"}

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return user

@api_router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No hay refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Tipo de token invalido")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        user_id = str(user["_id"])
        new_access = create_access_token(user_id, user["email"])
        response.set_cookie(key="access_token", value=new_access, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
        return {"access_token": new_access}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalido")

# ─── Admin Routes ──────────────────────────────────────────────

@api_router.get("/admin/dashboard")
async def admin_dashboard(request: Request):
    admin = await require_admin(request)
    total_approved = await db.payments.find({"status": "approved"}).to_list(None)
    caja_total = sum(p.get("amount", 0) for p in total_approved)
    active_loans = await db.loans.find({"status": "active"}).to_list(None)
    prestamos_activos = sum(l.get("amount", 0) for l in active_loans)
    pending_users = await db.users.count_documents({"status": "pending"})
    total_socios = await db.users.count_documents({"role": "socio", "status": "active"})
    pending_payments = await db.payments.count_documents({"status": "pending"})
    pending_loans = await db.loans.count_documents({"status": "voting"})
    return {
        "caja_total": caja_total,
        "prestamos_activos": prestamos_activos,
        "socios_pendientes": pending_users,
        "total_socios": total_socios,
        "pagos_pendientes": pending_payments,
        "prestamos_en_votacion": pending_loans,
    }

@api_router.get("/admin/pending-users")
async def get_pending_users(request: Request):
    await require_admin(request)
    users = await db.users.find({"status": "pending"}, {"password_hash": 0}).to_list(100)
    return serialize_list(users)

@api_router.post("/admin/users/{user_id}/approve")
async def approve_user(user_id: str, request: Request):
    await require_admin(request)
    result = await db.users.update_one({"_id": ObjectId(user_id), "status": "pending"}, {"$set": {"status": "active"}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado o ya aprobado")
    return {"message": "Usuario aprobado exitosamente"}

@api_router.post("/admin/users/{user_id}/reject")
async def reject_user(user_id: str, request: Request):
    await require_admin(request)
    result = await db.users.update_one({"_id": ObjectId(user_id), "status": "pending"}, {"$set": {"status": "rejected"}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"message": "Usuario rechazado"}

@api_router.post("/admin/users/{user_id}/role")
async def change_role(user_id: str, input: RoleChange, request: Request):
    await require_admin(request)
    if input.role not in ("admin", "socio"):
        raise HTTPException(status_code=400, detail="Rol invalido")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"role": input.role}})
    return {"message": f"Rol cambiado a {input.role}"}

@api_router.post("/admin/users/{user_id}/reset-password")
async def admin_reset_password(user_id: str, input: ResetPasswordInput, request: Request):
    await require_admin(request)
    hashed = hash_password(input.new_password)
    result = await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"password_hash": hashed}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"message": "Contrasena reseteada exitosamente"}

@api_router.get("/admin/payments/pending")
async def get_pending_payments(request: Request):
    await require_admin(request)
    payments = await db.payments.find({"status": "pending"}).to_list(100)
    result = []
    for p in payments:
        p["_id"] = str(p["_id"])
        user = await db.users.find_one({"_id": ObjectId(p["user_id"])}, {"name": 1, "email": 1})
        p["user_name"] = user["name"] if user else "Desconocido"
        p["user_email"] = user["email"] if user else ""
        for k, v in p.items():
            if isinstance(v, ObjectId):
                p[k] = str(v)
            if isinstance(v, datetime):
                p[k] = v.isoformat()
        result.append(p)
    return result

# ─── Users Routes ──────────────────────────────────────────────

@api_router.get("/users")
async def list_users(request: Request):
    await require_admin(request)
    users = await db.users.find({}, {"password_hash": 0}).to_list(200)
    return serialize_list(users)

@api_router.get("/users/me/summary")
async def get_my_summary(request: Request):
    user = await require_active(request)
    user_id = user["_id"]
    approved_payments = await db.payments.find({"user_id": user_id, "status": "approved"}).to_list(None)
    total_savings = sum(p.get("amount", 0) for p in approved_payments)
    active_loans = await db.loans.find({"user_id": user_id, "status": "active"}).to_list(None)
    total_debt = sum(l.get("amount", 0) for l in active_loans)
    return {
        "savings": total_savings,
        "debt": total_debt,
        "available": total_savings - total_debt,
    }

# ─── Payment Routes ───────────────────────────────────────────

@api_router.post("/payments")
async def create_payment(request: Request, amount: float = Form(...), type: str = Form("ahorro"), note: str = Form(""), receipt: Optional[UploadFile] = File(None)):
    user = await require_active(request)
    receipt_data = None
    if receipt:
        content = await receipt.read()
        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Archivo muy grande (max 5MB)")
        b64 = base64.b64encode(content).decode("utf-8")
        receipt_data = f"data:{receipt.content_type};base64,{b64}"

    payment_doc = {
        "user_id": user["_id"],
        "amount": amount,
        "type": type,
        "note": note,
        "receipt_image": receipt_data,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.payments.insert_one(payment_doc)
    return {"message": "Pago enviado para aprobacion", "payment_id": str(result.inserted_id)}

@api_router.get("/payments/my")
async def get_my_payments(request: Request):
    user = await require_active(request)
    payments = await db.payments.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(100)
    return serialize_list(payments)

@api_router.post("/payments/{payment_id}/approve")
async def approve_payment(payment_id: str, request: Request):
    admin = await require_admin(request)
    result = await db.payments.update_one(
        {"_id": ObjectId(payment_id), "status": "pending"},
        {"$set": {"status": "approved", "approved_by": admin["_id"], "approved_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Pago no encontrado o ya procesado")
    return {"message": "Pago aprobado"}

@api_router.post("/payments/{payment_id}/reject")
async def reject_payment(payment_id: str, request: Request):
    admin = await require_admin(request)
    result = await db.payments.update_one(
        {"_id": ObjectId(payment_id), "status": "pending"},
        {"$set": {"status": "rejected", "rejected_by": admin["_id"], "rejected_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Pago no encontrado o ya procesado")
    return {"message": "Pago rechazado"}

# ─── Loan Routes ──────────────────────────────────────────────

@api_router.post("/loans")
async def create_loan(input: LoanInput, request: Request):
    user = await require_active(request)
    valid_purposes = ["vanidad", "salud", "educacion", "emergencia", "negocio", "otro"]
    if input.purpose.lower() not in valid_purposes:
        raise HTTPException(status_code=400, detail=f"Proposito invalido. Opciones: {', '.join(valid_purposes)}")

    loan_doc = {
        "user_id": user["_id"],
        "user_name": user["name"],
        "amount": input.amount,
        "purpose": input.purpose.lower(),
        "description": input.description,
        "status": "voting",
        "votes_for": [],
        "votes_against": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.loans.insert_one(loan_doc)
    return {"message": "Solicitud de prestamo creada. Los socios votaran.", "loan_id": str(result.inserted_id)}

@api_router.get("/loans")
async def list_loans(request: Request):
    user = await require_active(request)
    loans = await db.loans.find().sort("created_at", -1).to_list(100)
    active_users = await db.users.count_documents({"status": "active"})
    result = []
    for loan in loans:
        loan["_id"] = str(loan["_id"])
        loan["eligible_voters"] = active_users - 1
        loan["my_vote"] = None
        if user["_id"] in loan.get("votes_for", []):
            loan["my_vote"] = "for"
        elif user["_id"] in loan.get("votes_against", []):
            loan["my_vote"] = "against"
        loan["can_vote"] = user["_id"] != loan["user_id"] and loan["my_vote"] is None and loan["status"] == "voting"
        loan["votes_for_count"] = len(loan.get("votes_for", []))
        loan["votes_against_count"] = len(loan.get("votes_against", []))
        loan.pop("votes_for", None)
        loan.pop("votes_against", None)
        for k, v in loan.items():
            if isinstance(v, ObjectId):
                loan[k] = str(v)
            if isinstance(v, datetime):
                loan[k] = v.isoformat()
        result.append(loan)
    return result

@api_router.get("/loans/my")
async def get_my_loans(request: Request):
    user = await require_active(request)
    loans = await db.loans.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(50)
    result = []
    for loan in loans:
        loan["_id"] = str(loan["_id"])
        loan["votes_for_count"] = len(loan.get("votes_for", []))
        loan["votes_against_count"] = len(loan.get("votes_against", []))
        loan.pop("votes_for", None)
        loan.pop("votes_against", None)
        for k, v in loan.items():
            if isinstance(v, ObjectId):
                loan[k] = str(v)
            if isinstance(v, datetime):
                loan[k] = v.isoformat()
        result.append(loan)
    return result

@api_router.post("/loans/{loan_id}/vote")
async def vote_loan(loan_id: str, input: VoteInput, request: Request):
    user = await require_active(request)
    if input.vote not in ("for", "against"):
        raise HTTPException(status_code=400, detail="Voto invalido. Usa 'for' o 'against'")

    loan = await db.loans.find_one({"_id": ObjectId(loan_id)})
    if not loan:
        raise HTTPException(status_code=404, detail="Prestamo no encontrado")
    if loan["status"] != "voting":
        raise HTTPException(status_code=400, detail="La votacion ya cerro")
    if loan["user_id"] == user["_id"]:
        raise HTTPException(status_code=400, detail="No puedes votar en tu propio prestamo")
    if user["_id"] in loan.get("votes_for", []) or user["_id"] in loan.get("votes_against", []):
        raise HTTPException(status_code=400, detail="Ya votaste en este prestamo")

    if input.vote == "for":
        await db.loans.update_one({"_id": ObjectId(loan_id)}, {"$push": {"votes_for": user["_id"]}})
    else:
        await db.loans.update_one({"_id": ObjectId(loan_id)}, {"$push": {"votes_against": user["_id"]}})

    updated_loan = await db.loans.find_one({"_id": ObjectId(loan_id)})
    active_users = await db.users.count_documents({"status": "active"})
    eligible = active_users - 1
    votes_for = len(updated_loan.get("votes_for", []))
    votes_against = len(updated_loan.get("votes_against", []))
    majority = (eligible // 2) + 1

    if votes_for >= majority:
        await db.loans.update_one({"_id": ObjectId(loan_id)}, {"$set": {"status": "active", "approved_at": datetime.now(timezone.utc).isoformat()}})
        return {"message": "Prestamo aprobado por mayoria!", "status": "active"}
    elif votes_against >= majority:
        await db.loans.update_one({"_id": ObjectId(loan_id)}, {"$set": {"status": "rejected", "rejected_at": datetime.now(timezone.utc).isoformat()}})
        return {"message": "Prestamo rechazado por mayoria.", "status": "rejected"}

    return {"message": "Voto registrado", "votes_for": votes_for, "votes_against": votes_against}

# ─── Upload Route ────────────────────────────────────────────

@api_router.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...)):
    user = await require_active(request)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Archivo muy grande (max 5MB)")
    b64 = base64.b64encode(content).decode("utf-8")
    data_url = f"data:{file.content_type};base64,{b64}"
    return {"url": data_url}

# ─── Root ────────────────────────────────────────────────────

@api_router.get("/")
async def root():
    return {"message": "AhorroFamiliar API"}

# ─── Startup ─────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@ahorrofamiliar.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "***ELIMINADO***")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Administrador",
            "cedula": "",
            "phone": "",
            "role": "admin",
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Admin creado: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})
        logger.info("Admin password actualizado")

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
