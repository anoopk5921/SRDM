from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DeletionLog
from app.routers.auth import require_admin
from app.schemas import DeletionLogOut

router = APIRouter(prefix="/api/deletion-logs", tags=["deletion-logs"])


@router.get("", response_model=list[DeletionLogOut])
def list_deletion_logs(_admin: str = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(select(DeletionLog).order_by(DeletionLog.id.desc())).all()
