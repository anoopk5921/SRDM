import hmac

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from secrets import token_urlsafe
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import AppUser

router = APIRouter(prefix="/api/auth", tags=["auth"])

_ended_sessions: set[str] = set()


class AppLogin(BaseModel):
    username: str
    password: str

    @field_validator("username", "password")
    @classmethod
    def required_text(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("Enter the user name and password")
        return text


class AdminPasskey(BaseModel):
    passkey: str

    @field_validator("passkey")
    @classmethod
    def required_passkey(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("Enter the passkey")
        return text


def _passkey_matches(value: str) -> bool:
    expected = settings.admin_passkey
    if len(value) != len(expected):
        return False
    return hmac.compare_digest(value.encode(), expected.encode())


def _stamp_value(session) -> int | None:
    try:
        return int(session.get("stamp"))
    except (TypeError, ValueError):
        return None


def user_from_session(session, db: Session) -> AppUser | None:
    username = session.get("user")
    session_id = session.get("sid")
    stamp = _stamp_value(session)
    if not username or not session_id or stamp is None or session_id in _ended_sessions:
        return None
    user = db.get(AppUser, username)
    if user is None or user.auth_stamp != stamp:
        return None
    return user


def signed_in_user(request: Request, db: Session) -> AppUser | None:
    return user_from_session(request.session, db)


def require_signed_in(request: Request, db: Session = Depends(get_db)) -> str:
    user = signed_in_user(request, db)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in required")
    return user.username


def require_admin(request: Request, db: Session = Depends(get_db)) -> str:
    username = require_signed_in(request, db)
    if request.session.get("admin") is not True:
        raise HTTPException(status_code=403, detail="Enter the admin passkey")
    return username


def _start_session(request: Request, user: AppUser) -> None:
    request.session["user"] = user.username
    request.session["sid"] = token_urlsafe(24)
    request.session["stamp"] = user.auth_stamp
    request.session["admin"] = False


@router.post("/login")
def login(payload: AppLogin, request: Request, db: Session = Depends(get_db)):
    user = db.get(AppUser, payload.username)
    if user is None or user.password != payload.password:
        raise HTTPException(status_code=401, detail="User name or password is incorrect")
    _start_session(request, user)
    return {"username": user.username, "admin": False}


@router.get("/session")
def current_session(request: Request, db: Session = Depends(get_db)):
    user = signed_in_user(request, db)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in required")
    return {"username": user.username, "admin": request.session.get("admin") is True}


@router.post("/admin")
def unlock_admin(payload: AdminPasskey, request: Request, db: Session = Depends(get_db)):
    user = signed_in_user(request, db)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in required")
    if not _passkey_matches(payload.passkey):
        raise HTTPException(status_code=403, detail="The passkey is not correct")
    request.session["admin"] = True
    return {"username": user.username, "admin": True}


@router.post("/admin/lock")
def lock_admin(request: Request, db: Session = Depends(get_db)):
    if signed_in_user(request, db) is None:
        raise HTTPException(status_code=401, detail="Sign in required")
    request.session["admin"] = False
    return {"admin": False}


@router.post("/logout")
def logout(request: Request):
    session_id = request.session.get("sid")
    if session_id:
        _ended_sessions.add(session_id)
    request.session.clear()
    return {"ok": True}
