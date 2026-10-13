from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Company, Employee, JoinEvent
from app.party import company_on_clause, labels
from app.schemas import GateEntry, GateEntryOut, GateIssue

router = APIRouter(prefix="/api/gate", tags=["gate"])


def _load_pass(joining_id: str, db: Session):
    statement = (
        select(JoinEvent, Employee, Company)
        .outerjoin(Employee, JoinEvent.employee_id == Employee.employee_id)
        .outerjoin(Company, company_on_clause())
        .where(JoinEvent.unique_event_id == int(joining_id))
    )
    row = db.execute(statement).first()
    if row is None or row[2] is None:
        raise HTTPException(status_code=404, detail="Joining id not found")
    return row


def _gate_out(
    event: JoinEvent,
    employee: Employee | None,
    company: Company,
    already_joined: bool,
    already_served: bool,
) -> GateEntryOut:
    employee_id, employee_name, department, company_code, company_name = labels(event, employee, company)
    return GateEntryOut(
        unique_event_id=event.unique_event_id,
        employee_id=employee_id,
        employee_name=employee_name,
        department=department,
        company_code=company_code,
        company_name=company_name,
        name=event.name,
        relation=event.relation,
        join_status=event.join_status,
        meals_status=event.meals_status,
        report_issue=event.report_issue,
        already_joined=already_joined,
        already_served=already_served,
    )


@router.post("/entry", response_model=GateEntryOut)
def record_entry(payload: GateEntry, db: Session = Depends(get_db)):
    event, employee, company = _load_pass(payload.joining_id, db)
    already_joined = event.join_status == "Joined"
    already_served = event.meals_status == "Served"
    if not already_joined:
        event.join_status = "Joined"
        db.commit()
        db.refresh(event)
    return _gate_out(event, employee, company, already_joined, already_served)


@router.post("/meals", response_model=GateEntryOut)
def record_meal(payload: GateEntry, db: Session = Depends(get_db)):
    event, employee, company = _load_pass(payload.joining_id, db)
    already_joined = event.join_status == "Joined"
    already_served = event.meals_status == "Served"
    if not already_served:
        event.meals_status = "Served"
        db.commit()
        db.refresh(event)
    return _gate_out(event, employee, company, already_joined, already_served)


@router.post("/issue", response_model=GateEntryOut)
def report_issue(payload: GateIssue, db: Session = Depends(get_db)):
    event, employee, company = _load_pass(payload.joining_id, db)
    already_joined = event.join_status == "Joined"
    already_served = event.meals_status == "Served"
    event.report_issue = payload.report_issue
    db.commit()
    db.refresh(event)
    return _gate_out(event, employee, company, already_joined, already_served)
