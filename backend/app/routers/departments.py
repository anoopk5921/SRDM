from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Company, Department
from app.schemas import DepartmentCreate, DepartmentMasterOut, DepartmentPasswordUpdate

router = APIRouter(prefix="/api/departments", tags=["departments"])


@router.get("", response_model=list[DepartmentMasterOut])
def list_departments(db: Session = Depends(get_db)):
    statement = select(Department).order_by(Department.company_code, Department.department)
    return db.scalars(statement).all()


@router.post("", response_model=DepartmentMasterOut, status_code=201)
def create_department(payload: DepartmentCreate, db: Session = Depends(get_db)):
    if db.get(Company, payload.company_code) is None:
        raise HTTPException(status_code=400, detail="Choose a company from the list")
    if db.get(Department, (payload.department, payload.company_code)) is not None:
        raise HTTPException(status_code=409, detail="That department already exists for this company")
    row = Department(
        department=payload.department,
        company_code=payload.company_code,
        password=payload.password,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="That department already exists for this company")
    db.refresh(row)
    return row


@router.put("/password", response_model=DepartmentMasterOut)
def update_department_password(payload: DepartmentPasswordUpdate, db: Session = Depends(get_db)):
    row = db.get(Department, (payload.department, payload.company_code))
    if row is None:
        raise HTTPException(status_code=404, detail="That department was not found")
    row.password = payload.password
    db.commit()
    db.refresh(row)
    return row
