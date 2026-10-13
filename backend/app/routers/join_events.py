from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deletion_log import attendee_detail, record_deletion
from app.models import Department, Employee, JoinChild, JoinEvent
from app.schemas import (
    JoinChildOut,
    JoinEventCreate,
    JoinEventOut,
    UnregisteredFamilyCreate,
    UnregisteredJoinCreate,
)
from app.unregistered_number import (
    hold_unregistered_number,
    next_unregistered_number,
    unregistered_number_in_use,
)

router = APIRouter(prefix="/api/join-events", tags=["join-events"])
UNREGISTERED_ATTENDEE_LIMIT = 6


def _is_printed(event: JoinEvent) -> bool:
    return (event.print_status or "").strip().lower() == "printed"


@router.get("", response_model=list[JoinEventOut])
def list_join_events(employee_id: str = Query(min_length=1), db: Session = Depends(get_db)):
    employee_id = employee_id.strip()
    if db.get(Employee, employee_id) is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    statement = (
        select(JoinEvent)
        .where(JoinEvent.employee_id == employee_id)
        .order_by(JoinEvent.unique_event_id)
    )
    return db.scalars(statement).all()


@router.get("/child", response_model=JoinChildOut)
def get_join_child(employee_id: str = Query(min_length=1), db: Session = Depends(get_db)):
    employee_id = employee_id.strip()
    if db.get(Employee, employee_id) is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    child = db.get(JoinChild, employee_id)
    return JoinChildOut(
        employee_id=employee_id,
        kids_number=None if child is None else child.kids_number,
    )


@router.delete("/{event_id}", status_code=204)
def delete_join_event(event_id: int, request: Request, db: Session = Depends(get_db)):
    event = db.get(JoinEvent, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Attendee not found")
    if _is_printed(event):
        raise HTTPException(
            status_code=409,
            detail="This attendee cannot be removed after the pass is printed",
        )
    detail = attendee_detail(event)
    db.delete(event)
    record_deletion(db, request, "Remove attendee", detail)
    db.commit()


@router.post("", response_model=list[JoinEventOut], status_code=201)
def create_join_events(payload: JoinEventCreate, db: Session = Depends(get_db)):
    employee = db.get(Employee, payload.employee_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")

    existing = db.scalar(
        select(func.count())
        .select_from(JoinEvent)
        .where(JoinEvent.employee_id == employee.employee_id)
    )
    existing = existing or 0
    if payload.members and existing + len(payload.members) > employee.allowed_strength:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Allowed strength is {employee.allowed_strength}. "
                f"{existing} attendee{'s' if existing != 1 else ''} already saved."
            ),
        )

    rows = [
        JoinEvent(
            employee_id=payload.employee_id,
            name=member.name,
            relation=member.relation,
            department=employee.department,
            employee_name=employee.employee_name,
            company=employee.company_code,
            category="Registered",
            admission_group="Employee",
        )
        for member in payload.members
    ]
    db.add_all(rows)
    child = db.get(JoinChild, payload.employee_id)
    if child is None:
        db.add(JoinChild(employee_id=payload.employee_id, kids_number=payload.kids_number))
    else:
        child.kids_number = payload.kids_number
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


def _normalize_unregistered_number(value: str) -> str:
    number = "".join(value.split()).upper()
    if len(number) < 3 or not number.startswith("UR") or not number[2:].isdigit():
        raise HTTPException(status_code=400, detail="Enter an unregistered number like UR1")
    return f"UR{int(number[2:])}"


def _unregistered_household(number: str, db: Session) -> list[JoinEvent]:
    rows = db.scalars(
        select(JoinEvent)
        .where(
            JoinEvent.unregistered_number == number,
            JoinEvent.category == "UnRegistered",
            JoinEvent.admission_group == "Employee",
        )
        .order_by(JoinEvent.unique_event_id)
    ).all()
    if not rows:
        raise HTTPException(status_code=404, detail="Unregistered employee not found")
    return rows


def _unregistered_employee(rows: list[JoinEvent]) -> JoinEvent:
    for row in rows:
        if row.relation == "Employee":
            return row
    return rows[0]


def _limit_unregistered_attendees(existing: int, adding: int) -> None:
    if existing + adding <= UNREGISTERED_ATTENDEE_LIMIT:
        return
    raise HTTPException(
        status_code=400,
        detail=(
            f"An unregistered employee can have only {UNREGISTERED_ATTENDEE_LIMIT} "
            "attendees, including the employee."
        ),
    )


@router.get("/unregistered", response_model=list[JoinEventOut])
def list_unregistered_household(number: str = Query(min_length=1), db: Session = Depends(get_db)):
    return _unregistered_household(_normalize_unregistered_number(number), db)


@router.post("/unregistered/family", response_model=list[JoinEventOut], status_code=201)
def add_unregistered_family(payload: UnregisteredFamilyCreate, db: Session = Depends(get_db)):
    household = _unregistered_household(payload.unregistered_number, db)
    _limit_unregistered_attendees(len(household), len(payload.members))
    employee = _unregistered_employee(household)
    rows = [
        JoinEvent(
            employee_id=None,
            name=member.name,
            relation=member.relation,
            department=employee.department,
            employee_name=employee.employee_name,
            company=employee.company,
            category="UnRegistered",
            admission_group="Employee",
            unregistered_number=employee.unregistered_number,
        )
        for member in payload.members
    ]
    db.add_all(rows)
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


@router.post("/unregistered", response_model=list[JoinEventOut], status_code=201)
def create_unregistered_join(payload: UnregisteredJoinCreate, db: Session = Depends(get_db)):
    department = db.get(Department, (payload.department, payload.company_code))
    if department is None:
        raise HTTPException(status_code=400, detail="Choose a department from the list")
    _limit_unregistered_attendees(0, 1 + len(payload.members))

    try:
        with hold_unregistered_number(db):
            number = next_unregistered_number(db)
            rows = [
                JoinEvent(
                    employee_id=None,
                    name=payload.employee_name,
                    relation="Employee",
                    department=payload.department,
                    employee_name=payload.employee_name,
                    company=payload.company_code,
                    category="UnRegistered",
                    admission_group="Employee",
                    unregistered_number=number,
                )
            ]
            for member in payload.members:
                rows.append(
                    JoinEvent(
                        employee_id=None,
                        name=member.name,
                        relation=member.relation,
                        department=payload.department,
                        employee_name=payload.employee_name,
                        company=payload.company_code,
                        category="UnRegistered",
                        admission_group="Employee",
                        unregistered_number=number,
                    )
                )
            db.add_all(rows)
            db.flush()
            for _ in range(5):
                own_ids = {row.unique_event_id for row in rows}
                if not unregistered_number_in_use(db, number, own_ids):
                    break
                number = next_unregistered_number(db)
                for row in rows:
                    row.unregistered_number = number
                db.flush()
            else:
                raise RuntimeError("Could not assign an unregistered number")
            db.commit()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Could not assign an unregistered number. Try again.")
    for row in rows:
        db.refresh(row)
    return rows
