from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Company
from app.schemas import CompanyCreate, CompanyOut

router = APIRouter(prefix="/api/companies", tags=["companies"])


@router.get("", response_model=list[CompanyOut])
def list_companies(q: str | None = None, db: Session = Depends(get_db)):
    statement = select(Company).order_by(Company.company_code)
    if q and q.strip():
        term = f"%{q.strip()}%"
        statement = statement.where(
            or_(Company.company_code.like(term), Company.company_name.like(term))
        )
    return db.scalars(statement).all()


@router.post("", response_model=CompanyOut, status_code=201)
def create_company(payload: CompanyCreate, db: Session = Depends(get_db)):
    if db.get(Company, payload.company_code) is not None:
        raise HTTPException(status_code=409, detail="That company code already exists")
    company = Company(company_code=payload.company_code, company_name=payload.company_name)
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@router.put("/{company_code}", response_model=CompanyOut)
def update_company(company_code: str, payload: CompanyCreate, db: Session = Depends(get_db)):
    company = db.get(Company, company_code)
    if company is None:
        raise HTTPException(status_code=404, detail="That company was not found")

    old_code = company.company_code
    new_code = payload.company_code
    new_name = payload.company_name
    if new_code.casefold() != old_code.casefold():
        taken = db.scalar(select(Company.company_code).where(Company.company_code == new_code))
        if taken is not None:
            raise HTTPException(status_code=409, detail="That company code already exists")

    code_changed = new_code != old_code
    try:
        if code_changed:
            db.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
            params = {"old": old_code, "new": new_code}
            db.execute(
                text("UPDATE `Department` SET `CompanyCode` = :new WHERE `CompanyCode` = :old"),
                params,
            )
            db.execute(
                text("UPDATE `EmployeeMaster` SET `CompanyCode` = :new WHERE `CompanyCode` = :old"),
                params,
            )
            db.execute(
                text("UPDATE `Joinevents` SET `Company` = :new WHERE `Company` = :old"),
                params,
            )
            db.execute(
                text(
                    "UPDATE `company_master` SET `company_code` = :new, `company_name` = :name "
                    "WHERE `company_code` = :old"
                ),
                {**params, "name": new_name},
            )
        else:
            company.company_name = new_name
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="That company code already exists") from None
    except Exception:
        db.rollback()
        raise
    finally:
        if code_changed:
            db.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
            db.commit()

    db.expire_all()
    updated = db.get(Company, new_code)
    if updated is None:
        raise HTTPException(status_code=404, detail="That company was not found")
    return updated
