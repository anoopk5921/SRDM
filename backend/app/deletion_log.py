from datetime import datetime

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import DeletionLog, JoinEvent


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    address = forwarded.split(",")[0].strip() if forwarded else ""
    if not address:
        address = request.headers.get("x-real-ip", "").strip()
    if not address and request.client is not None:
        address = request.client.host or ""
    if address.startswith("::ffff:"):
        address = address[7:]
    return address[:45]


def actor_name(request: Request) -> str:
    username = request.session.get("user") if "session" in request.scope else ""
    return str(username or "")[:50]


def attendee_detail(event: JoinEvent) -> str:
    parts = [f"Event {event.unique_event_id}", event.name, event.relation]
    if event.unregistered_number:
        parts.append(event.unregistered_number)
    if event.employee_id:
        parts.append(f"employee {event.employee_name} ({event.employee_id})")
    elif event.employee_name:
        parts.append(event.employee_name)
    if event.company:
        parts.append(event.company)
    if event.department:
        parts.append(event.department)
    return ", ".join(part for part in parts if part)[:500]


def record_deletion(db: Session, request: Request, action: str, detail: str) -> None:
    db.add(
        DeletionLog(
            created_at=datetime.now(),
            ip_address=client_ip(request),
            username=actor_name(request),
            action=action[:80],
            detail=detail[:500],
        )
    )
