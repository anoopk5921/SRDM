from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deletion_log import record_deletion
from app.models import AppUser
from app.routers.auth import require_admin
from app.schemas import AppUserCreate, AppUserOut, AppUserPasswordUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[AppUserOut])
def list_users(_actor: str = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(select(AppUser).order_by(AppUser.username)).all()


@router.post("", response_model=AppUserOut, status_code=201)
def create_user(
    payload: AppUserCreate,
    _actor: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.get(AppUser, payload.username) is not None:
        raise HTTPException(status_code=409, detail="That user name already exists")
    row = AppUser(username=payload.username, password=payload.password)
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="That user name already exists")
    db.refresh(row)
    return row


@router.put("/password", response_model=AppUserOut)
def update_user_password(
    payload: AppUserPasswordUpdate,
    request: Request,
    actor: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = db.get(AppUser, payload.username)
    if row is None:
        raise HTTPException(status_code=404, detail="That user was not found")
    if row.password != payload.password:
        row.auth_stamp += 1
        if row.username.casefold() == actor.casefold():
            request.session["stamp"] = row.auth_stamp
    row.password = payload.password
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{username}")
def delete_user(
    username: str,
    request: Request,
    actor: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    locked = list(db.scalars(select(AppUser).with_for_update()))
    row = next((item for item in locked if item.username.casefold() == username.casefold()), None)
    if row is None:
        raise HTTPException(status_code=404, detail="That user was not found")
    if row.username.casefold() == actor.casefold():
        raise HTTPException(status_code=400, detail="The signed-in user cannot be deleted")
    if len(locked) <= 1:
        raise HTTPException(status_code=400, detail="At least one user must remain")
    record_deletion(db, request, "Delete user", f"User {row.username}")
    db.delete(row)
    db.commit()
    return {"ok": True}
