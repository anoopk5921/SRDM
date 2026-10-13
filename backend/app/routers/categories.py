from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, Company, Department, JoinEvent
from app.schemas import BulkRegistrationCreate, CategoryOut, JoinEventOut

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return db.scalars(select(Category).order_by(Category.id)).all()


@router.post("/reset-prefix", response_model=list[CategoryOut])
def reset_prefix_numbers(db: Session = Depends(get_db)):
    rows = db.scalars(select(Category).order_by(Category.id)).all()
    for row in rows:
        row.prefix_number = 0
    db.commit()
    return rows


@router.post("/bulk", response_model=list[JoinEventOut], status_code=201)
def create_bulk_registration(payload: BulkRegistrationCreate, db: Session = Depends(get_db)):
    category = db.scalar(select(Category).where(Category.id == payload.category_id).with_for_update())
    if category is None:
        raise HTTPException(status_code=404, detail="Choose a category from the list")
    if len(category.guest_category) > 20:
        raise HTTPException(status_code=400, detail="That category name is too long to store on a pass")
    if db.get(Company, payload.company_code) is None:
        raise HTTPException(status_code=400, detail="Choose a company from the list")
    if db.get(Department, (payload.department, payload.company_code)) is None:
        raise HTTPException(status_code=400, detail="Choose a department from the list")

    start = category.prefix_number
    if start > 2_000_000_000 - payload.total_pass:
        raise HTTPException(status_code=400, detail="Prefix number cannot go that high")

    names = [f"{category.guest_category}{start + offset}" for offset in range(1, payload.total_pass + 1)]
    taken = set(db.scalars(select(JoinEvent.name).where(JoinEvent.name.in_(names))).all())
    taken.update(db.scalars(select(JoinEvent.employee_name).where(JoinEvent.employee_name.in_(names))).all())
    duplicates = [name for name in names if name in taken]
    if duplicates:
        listed = ", ".join(duplicates)
        raise HTTPException(status_code=409, detail=f"These names already exist: {listed}")

    rows = []
    for coupon_name in names:
        rows.append(
            JoinEvent(
                employee_id=None,
                name=coupon_name,
                relation=category.guest_category,
                department=payload.department,
                employee_name=coupon_name,
                company=payload.company_code,
                category="UnRegistered",
                admission_group=category.guest_category,
            )
        )
    db.add_all(rows)
    category.prefix_number = start + payload.total_pass
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows
