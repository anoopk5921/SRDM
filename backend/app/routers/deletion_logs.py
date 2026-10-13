from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DeletionLog
from app.schemas import DeletionLogOut

router = APIRouter(prefix="/api/deletion-logs", tags=["deletion-logs"])


@router.get("", response_model=list[DeletionLogOut])
def list_deletion_logs(db: Session = Depends(get_db)):
    return db.scalars(select(DeletionLog).order_by(DeletionLog.id.desc())).all()
