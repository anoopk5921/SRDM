from contextlib import contextmanager

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models import JoinEvent


@contextmanager
def hold_unregistered_number(db: Session):
    locked = db.scalar(text("SELECT GET_LOCK('srdm_unregistered_number', 10)"))
    if locked != 1:
        raise RuntimeError("Could not assign an unregistered number")
    try:
        yield
    finally:
        db.execute(text("SELECT RELEASE_LOCK('srdm_unregistered_number')"))


def unregistered_number_in_use(db: Session, number: str, ignore_ids: set[int] | None = None) -> bool:
    statement = select(JoinEvent.unique_event_id).where(JoinEvent.unregistered_number == number)
    if ignore_ids:
        statement = statement.where(JoinEvent.unique_event_id.not_in(ignore_ids))
    return db.scalar(statement.limit(1)) is not None


def next_unregistered_number(db: Session) -> str:
    """Next UR number that is not already used by another registration."""
    candidate = _highest(db) + 1
    while unregistered_number_in_use(db, f"UR{candidate}"):
        candidate += 1
        if candidate > 1_000_000:
            raise RuntimeError("Could not assign an unregistered number")
    return f"UR{candidate}"


def assign_missing_unregistered_numbers(db: Session) -> None:
    """Give each unregistered employee the next UR number and copy it to their family."""
    db.flush()
    rows = db.scalars(
        select(JoinEvent)
        .where(
            JoinEvent.category == "UnRegistered",
            JoinEvent.admission_group == "Employee",
        )
        .order_by(JoinEvent.unique_event_id)
    ).all()
    highest = _highest(db)
    household: dict[tuple[str, str, str], str] = {}
    for row in rows:
        if row.relation != "Employee":
            continue
        key = _household_key(row)
        number = (row.unregistered_number or "").strip()
        if not number:
            highest += 1
            number = f"UR{highest}"
            row.unregistered_number = number
        household.setdefault(key, number)
    for row in rows:
        if row.relation == "Employee":
            continue
        if (row.unregistered_number or "").strip():
            continue
        shared = household.get(_household_key(row))
        if shared:
            row.unregistered_number = shared


def _highest(db: Session) -> int:
    values = db.scalars(
        select(JoinEvent.unregistered_number).where(JoinEvent.unregistered_number.like("UR%"))
    ).all()
    highest = 0
    for value in values:
        text_value = (value or "").strip()
        if len(text_value) > 2 and text_value.startswith("UR") and text_value[2:].isdigit():
            highest = max(highest, int(text_value[2:]))
    return highest


def _household_key(row: JoinEvent) -> tuple[str, str, str]:
    return (
        (row.employee_name or "").strip().casefold(),
        (row.company or "").strip().casefold(),
        (row.department or "").strip().casefold(),
    )
