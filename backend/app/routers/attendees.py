from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Department, Employee, JoinEvent
from app.party import in_department, labels
from app.schemas import AttendeeApproveAll, AttendeeDecision, AttendeeLogin, AttendeeOut, DepartmentOut

router = APIRouter(prefix="/api/attendees", tags=["attendees"])


def _require_department_login(payload: AttendeeLogin, db: Session) -> Department:
    department = db.get(Department, (payload.department, payload.company_code))
    if department is None or department.password != payload.password:
        raise HTTPException(status_code=401, detail="Company, department, or password is incorrect")
    return department


def _attendee_rows(company_code: str, department: str, db: Session) -> list[AttendeeOut]:
    statement = (
        select(JoinEvent, Employee)
        .outerjoin(Employee, JoinEvent.employee_id == Employee.employee_id)
        .where(in_department(company_code, department))
        .order_by(JoinEvent.unique_event_id)
    )
    rows = []
    for event, employee in db.execute(statement):
        employee_id, employee_name, event_department, event_company, _company_name = labels(event, employee)
        rows.append(
            AttendeeOut(
                unique_event_id=event.unique_event_id,
                employee_id=employee_id,
                employee_name=employee_name,
                department=event_department,
                company_code=event_company,
                name=event.name,
                relation=event.relation,
                approve_status=event.approve_status,
                print_status=event.print_status,
                unregistered_number=event.unregistered_number or "",
            )
        )
    return rows


@router.get("/pending-departments", response_model=list[DepartmentOut])
def list_pending_approval_departments(company_code: str = Query(min_length=1), db: Session = Depends(get_db)):
    company_code = company_code.strip()
    registered = (
        select(Employee.department)
        .join(JoinEvent, JoinEvent.employee_id == Employee.employee_id)
        .where(
            Employee.company_code == company_code,
            JoinEvent.approve_status == "Pending",
        )
    )
    unregistered = select(JoinEvent.department).where(
        JoinEvent.employee_id.is_(None),
        JoinEvent.company == company_code,
        JoinEvent.approve_status == "Pending",
    )
    names = {name.strip() for name in db.scalars(registered) if name and name.strip()}
    names.update(name.strip() for name in db.scalars(unregistered) if name and name.strip())
    return [
        DepartmentOut(department=name, company_code=company_code)
        for name in sorted(names, key=str.casefold)
    ]


@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(company_code: str | None = None, db: Session = Depends(get_db)):
    statement = select(Department).order_by(Department.company_code, Department.department)
    if company_code and company_code.strip():
        statement = statement.where(Department.company_code == company_code.strip())
    return [
        DepartmentOut(department=row.department, company_code=row.company_code)
        for row in db.scalars(statement)
    ]


@router.post("/login")
def login(payload: AttendeeLogin, db: Session = Depends(get_db)):
    department = _require_department_login(payload, db)
    return {"company_code": department.company_code, "department": department.department}


@router.post("/list", response_model=list[AttendeeOut])
def list_attendees(payload: AttendeeLogin, db: Session = Depends(get_db)):
    _require_department_login(payload, db)
    return _attendee_rows(payload.company_code, payload.department, db)


@router.post("/approve-all", response_model=list[AttendeeOut])
def approve_all(payload: AttendeeApproveAll, db: Session = Depends(get_db)):
    _require_department_login(payload, db)
    wanted = set(payload.event_ids)
    statement = (
        select(JoinEvent, Employee)
        .outerjoin(Employee, JoinEvent.employee_id == Employee.employee_id)
        .where(in_department(payload.company_code, payload.department))
    )
    found: set[int] = set()
    for event, _employee in db.execute(statement):
        if event.unique_event_id not in wanted:
            continue
        event.approve_status = "Approved"
        found.add(event.unique_event_id)
    if found != wanted:
        db.rollback()
        raise HTTPException(status_code=404, detail="That entry is not in this department")
    db.commit()
    return _attendee_rows(payload.company_code, payload.department, db)


@router.post("/reject-all", response_model=list[AttendeeOut])
def reject_all(payload: AttendeeApproveAll, db: Session = Depends(get_db)):
    _require_department_login(payload, db)
    wanted = set(payload.event_ids)
    statement = (
        select(JoinEvent, Employee)
        .outerjoin(Employee, JoinEvent.employee_id == Employee.employee_id)
        .where(in_department(payload.company_code, payload.department))
    )
    found: set[int] = set()
    rejected = 0
    for event, _employee in db.execute(statement):
        if event.unique_event_id not in wanted:
            continue
        found.add(event.unique_event_id)
        if (event.print_status or "").strip().lower() == "printed":
            continue
        event.approve_status = "Rejected"
        rejected += 1
    if found != wanted:
        db.rollback()
        raise HTTPException(status_code=404, detail="That entry is not in this department")
    if rejected == 0:
        db.rollback()
        raise HTTPException(status_code=400, detail="Printed passes cannot be rejected")
    db.commit()
    return _attendee_rows(payload.company_code, payload.department, db)


@router.put("/{unique_event_id}", response_model=AttendeeOut)
def decide_attendee(unique_event_id: int, payload: AttendeeDecision, db: Session = Depends(get_db)):
    _require_department_login(payload, db)
    event = db.get(JoinEvent, unique_event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Join event entry not found")
    employee = db.get(Employee, event.employee_id) if event.employee_id else None
    employee_id, employee_name, event_department, event_company, _company_name = labels(event, employee)
    if event_company != payload.company_code or event_department != payload.department:
        raise HTTPException(status_code=404, detail="That entry is not in this department")
    if payload.approve_status == "Rejected" and (event.print_status or "").strip().lower() == "printed":
        raise HTTPException(status_code=400, detail="Printed passes cannot be rejected")
    event.approve_status = payload.approve_status
    db.commit()
    db.refresh(event)
    return AttendeeOut(
        unique_event_id=event.unique_event_id,
        employee_id=employee_id,
        employee_name=employee_name,
        department=event_department,
        company_code=event_company,
        name=event.name,
        relation=event.relation,
        approve_status=event.approve_status,
        print_status=event.print_status,
        unregistered_number=event.unregistered_number or "",
    )
