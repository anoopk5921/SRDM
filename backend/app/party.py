from sqlalchemy import and_, or_

from app.models import Company, Employee, JoinEvent


def in_department(company_code: str, department: str):
    return or_(
        and_(Employee.company_code == company_code, Employee.department == department),
        and_(
            JoinEvent.employee_id.is_(None),
            JoinEvent.company == company_code,
            JoinEvent.department == department,
        ),
    )


def company_on_clause():
    return or_(
        Company.company_code == Employee.company_code,
        and_(JoinEvent.employee_id.is_(None), Company.company_code == JoinEvent.company),
    )


def labels(event: JoinEvent, employee: Employee | None, company: Company | None = None):
    if employee is not None:
        return (
            employee.employee_id,
            employee.employee_name,
            employee.department,
            employee.company_code,
            company.company_name if company is not None else "",
        )
    return (
        "",
        event.employee_name,
        event.department,
        event.company,
        company.company_name if company is not None else "",
    )
