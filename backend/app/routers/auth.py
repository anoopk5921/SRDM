from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, field_validator
from secrets import token_urlsafe

from app.config import settings

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


def _active_username(request: Request) -> str | None:
    username = request.session.get("user")
    session_id = request.session.get("sid")
    if not username or not session_id or session_id in _ended_sessions:
        return None
    return username


@router.post("/login")
def login(payload: AppLogin, request: Request):
    if payload.username != settings.app_username or payload.password != settings.app_password:
        raise HTTPException(status_code=401, detail="User name or password is incorrect")
    request.session["user"] = payload.username
    request.session["sid"] = token_urlsafe(24)
    return {"username": payload.username}


@router.get("/session")
def current_session(request: Request):
    username = _active_username(request)
    if not username:
        raise HTTPException(status_code=401, detail="Sign in required")
    return {"username": username}


@router.post("/logout")
def logout(request: Request):
    session_id = request.session.get("sid")
    if session_id:
        _ended_sessions.add(session_id)
    request.session.clear()
    return {"ok": True}
