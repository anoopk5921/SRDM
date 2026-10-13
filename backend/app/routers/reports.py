from collections import Counter
from io import BytesIO

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from openpyxl import Workbook
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, Company, Employee, JoinChild, JoinEvent
from app.party import company_on_clause, labels
from app.registration_list_pdf import build_registration_list_pdf, build_registration_summary_pdf
from app.schemas import (
    FinalReport,
    RegistrationSummaryReport,
    ReportRow,
    ReportSummary,
    SummaryCategoryCount,
    SummaryCompanyRegistration,
    SummaryCompanyStrength,
    SummaryPass,
)

SUMMARY_SHEET = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PDF_SHEET = "application/pdf"

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/join-events", response_model=FinalReport)
def join_event_report(db: Session = Depends(get_db)):
    statement = (
        select(JoinEvent, Employee, Company)
        .outerjoin(Employee, JoinEvent.employee_id == Employee.employee_id)
        .outerjoin(Company, company_on_clause())
        .order_by(JoinEvent.unique_event_id)
    )
    rows = []
    for event, employee, company in db.execute(statement):
        if company is None:
            continue
        employee_id, employee_name, department, company_code, company_name = labels(event, employee, company)
        rows.append(
            ReportRow(
                unique_event_id=event.unique_event_id,
                employee_id=employee_id,
                employee_name=employee_name,
                department=department,
                company_code=company_code,
                company_name=company_name,
                name=event.name,
                relation=event.relation,
                approve_status=event.approve_status,
                print_status=event.print_status,
                join_status=event.join_status,
                meals_status=event.meals_status,
                report_issue=event.report_issue,
                unregistered_number=event.unregistered_number or "",
            )
        )
    summary = ReportSummary(
        registered=len(rows),
        approved=sum(row.approve_status == "Approved" for row in rows),
        pending_approval=sum(row.approve_status == "Pending" for row in rows),
        rejected=sum(row.approve_status == "Rejected" for row in rows),
        printed=sum(row.print_status == "Printed" for row in rows),
        entry_gate=sum(row.join_status == "Joined" for row in rows),
        meals_gate=sum(row.meals_status == "Served" for row in rows),
        drunk_issue=sum(row.report_issue == "Drunk Issue" for row in rows),
        other_issues=sum(row.report_issue == "Other Issues" for row in rows),
    )
    return FinalReport(summary=summary, rows=rows)


def registration_bucket(event: JoinEvent) -> str:
    if event.category == "Registered":
        if event.relation == "Employee":
            return "Registered Employee"
        return "Family"
    if event.admission_group == "Employee":
        if event.relation == "Employee":
            return "Unregistered Employee"
        return "Family"
    return event.admission_group or "Unregistered"


def _unregistered_number_order(number: str) -> int:
    suffix = number[2:] if number.upper().startswith("UR") else ""
    return int(suffix) if suffix.isdigit() else 0


def summary_pass(event: JoinEvent, company_names: dict[str, str]) -> SummaryPass:
    return SummaryPass(
        unique_event_id=event.unique_event_id,
        employee_id=event.employee_id or "",
        employee_name=event.employee_name,
        name=event.name,
        relation=event.relation,
        company_code=event.company,
        company_name=company_names.get(event.company, ""),
        department=event.department,
        category=event.category,
        admission_group=event.admission_group,
        approve_status=event.approve_status,
        print_status=event.print_status,
        join_status=event.join_status,
        meals_status=event.meals_status,
        unregistered_number=event.unregistered_number or "",
    )


def build_registration_summary(db: Session) -> RegistrationSummaryReport:
    companies = db.scalars(select(Company).order_by(Company.company_code)).all()
    employees = db.scalars(select(Employee)).all()
    events = db.scalars(select(JoinEvent).order_by(JoinEvent.unique_event_id)).all()
    guest_categories = db.scalars(select(Category).order_by(Category.id)).all()
    children_under_five = db.scalar(select(func.coalesce(func.sum(JoinChild.kids_number), 0))) or 0
    company_names = {company.company_code: company.company_name for company in companies}

    strength_counts: dict[str, list[int]] = {company.company_code: [0, 0] for company in companies}
    for employee in employees:
        bucket = strength_counts.setdefault(employee.company_code, [0, 0])
        bucket[0] += 1
        bucket[1] += employee.allowed_strength

    strength_by_company = [
        SummaryCompanyStrength(
            company_code=code,
            company_name=company_names.get(code, ""),
            employees=counts[0],
            strength=counts[1],
        )
        for code, counts in strength_counts.items()
    ]
    strength_by_company.sort(key=lambda row: row.company_code)

    registration_codes = list(company_names)
    for event in events:
        if event.company and event.company not in registration_codes:
            registration_codes.append(event.company)
    registration_counts = {
        code: {
            "registered_employees": 0,
            "family_members": 0,
            "unregistered_employees": 0,
        }
        for code in registration_codes
    }
    for event in events:
        counts = registration_counts.setdefault(
            event.company,
            {
                "registered_employees": 0,
                "family_members": 0,
                "unregistered_employees": 0,
            },
        )
        if event.category == "Registered" and event.relation == "Employee":
            counts["registered_employees"] += 1
        elif event.category == "Registered" or (
            event.category == "UnRegistered"
            and event.admission_group == "Employee"
            and event.relation != "Employee"
        ):
            counts["family_members"] += 1
        elif event.category == "UnRegistered" and event.relation == "Employee":
            counts["unregistered_employees"] += 1

    registered_employees_by_company = [
        SummaryCompanyRegistration(
            company_code=code,
            company_name=company_names.get(code, ""),
            registered_employees=counts["registered_employees"],
            family_members=counts["family_members"],
            unregistered_employees=counts["unregistered_employees"],
            total_employees_and_family=(
                counts["registered_employees"]
                + counts["family_members"]
                + counts["unregistered_employees"]
            ),
        )
        for code, counts in registration_counts.items()
    ]
    registered_employees_by_company.sort(key=lambda row: row.company_code)

    passes = [summary_pass(event, company_names) for event in events]
    registered_employees = [
        row for row in passes if row.category == "Registered" and row.relation == "Employee"
    ]
    registered_employees.sort(key=lambda row: (row.company_code, row.employee_id, row.unique_event_id))
    unregistered_employees = [
        row for row in passes if row.category == "UnRegistered" and row.relation == "Employee"
    ]
    unregistered_employees.sort(
        key=lambda row: (row.company_code, _unregistered_number_order(row.unregistered_number), row.unique_event_id)
    )
    family_members = [
        row
        for row in passes
        if row.relation != "Employee"
        and (
            row.category == "Registered"
            or (row.category == "UnRegistered" and row.admission_group == "Employee")
        )
    ]
    category_counts = Counter(registration_bucket(event) for event in events)
    category_order = ["Registered Employee", "Family", "Unregistered Employee"]
    for category in guest_categories:
        if category.guest_category not in category_order:
            category_order.append(category.guest_category)
    for name in category_counts:
        if name not in category_order:
            category_order.append(name)

    return RegistrationSummaryReport(
        total_employees=len(employees),
        total_employee_strength=sum(employee.allowed_strength for employee in employees),
        children_under_five=int(children_under_five),
        strength_by_company=strength_by_company,
        total_registrations=len(events),
        registered_employees_by_company=registered_employees_by_company,
        registered_employees=registered_employees,
        unregistered_employees=unregistered_employees,
        family_members=family_members,
        categories=[
            SummaryCategoryCount(category=name, count=category_counts.get(name, 0))
            for name in category_order
        ],
        entry_gate_count=sum(event.join_status == "Joined" for event in events),
        meals_gate_count=sum(event.meals_status == "Served" for event in events),
        entry_gate=[row for row in passes if row.join_status == "Joined"],
        meals_gate=[row for row in passes if row.meals_status == "Served"],
        registrations=passes,
    )


def _write_sheet(workbook: Workbook, title: str, headers: list[str], rows: list[list]):
    sheet = workbook.create_sheet(title)
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    sheet.auto_filter.ref = sheet.dimensions
    sheet.freeze_panes = "A2"
    return sheet


def _pass_row(row: SummaryPass) -> list:
    return [
        row.unique_event_id,
        row.employee_id,
        row.employee_name,
        row.name,
        row.relation,
        row.company_code,
        row.company_name,
        row.department,
        row.category,
        row.admission_group,
        row.unregistered_number,
        row.approve_status,
        row.print_status,
        row.join_status,
        row.meals_status,
    ]


PASS_HEADERS = [
    "Event id",
    "Employee id",
    "Employee name",
    "Name",
    "Relation",
    "Company",
    "Company name",
    "Department",
    "Category",
    "Admission group",
    "Unregistered number",
    "Approve",
    "Print",
    "Entry gate",
    "Meals gate",
]


@router.get("/registration-summary", response_model=RegistrationSummaryReport)
def registration_summary(db: Session = Depends(get_db)):
    return build_registration_summary(db)


@router.get("/registration-summary.xlsx")
def download_registration_summary(db: Session = Depends(get_db)):
    report = build_registration_summary(db)
    workbook = Workbook()
    summary = workbook.active
    summary.title = "Summary"
    summary.append(["Registration Summary"])
    summary.append(["Annual Day 2026"])
    summary.append([])
    summary.append(["Total employees", report.total_employees])
    summary.append(["Total employee strength", report.total_employee_strength])
    summary.append(["Children under 5 years", report.children_under_five])
    summary.append(["Total registrations", report.total_registrations])
    summary.append(["Entry gate scanned", report.entry_gate_count])
    summary.append(["Meals gate scanned", report.meals_gate_count])

    _write_sheet(
        workbook,
        "Strength by Company",
        ["Company", "Company name", "Employees", "Strength"],
        [
            [row.company_code, row.company_name, row.employees, row.strength]
            for row in report.strength_by_company
        ],
    )
    _write_sheet(
        workbook,
        "By Company",
        ["Company", "Company name", "Registered employees", "Unregistered employees", "Family members", "Total Employees and Family"],
        [
            [
                row.company_code,
                row.company_name,
                row.registered_employees,
                row.unregistered_employees,
                row.family_members,
                row.total_employees_and_family,
            ]
            for row in report.registered_employees_by_company
        ],
    )
    _write_sheet(
        workbook,
        "Category",
        ["Category", "Registrations"],
        [[row.category, row.count] for row in report.categories],
    )
    _write_sheet(
        workbook,
        "Registered Employees",
        PASS_HEADERS,
        [_pass_row(row) for row in report.registered_employees],
    )
    _write_sheet(
        workbook,
        "Unregistered Employees",
        PASS_HEADERS,
        [_pass_row(row) for row in report.unregistered_employees],
    )
    _write_sheet(workbook, "Family Members", PASS_HEADERS, [_pass_row(row) for row in report.family_members])
    _write_sheet(workbook, "Entry Gate", PASS_HEADERS, [_pass_row(row) for row in report.entry_gate])
    _write_sheet(workbook, "Meals Gate", PASS_HEADERS, [_pass_row(row) for row in report.meals_gate])
    _write_sheet(workbook, "All Registrations", PASS_HEADERS, [_pass_row(row) for row in report.registrations])

    buffer = BytesIO()
    workbook.save(buffer)
    return Response(
        content=buffer.getvalue(),
        media_type=SUMMARY_SHEET,
        headers={"Content-Disposition": 'attachment; filename="registration-summary.xlsx"'},
    )


@router.get("/registration-summary.pdf")
def download_registration_summary_pdf(db: Session = Depends(get_db)):
    report = build_registration_summary(db)
    return Response(
        content=build_registration_summary_pdf(report),
        media_type=PDF_SHEET,
        headers={"Content-Disposition": 'attachment; filename="registration-summary.pdf"'},
    )


@router.get("/registration-list.pdf")
def download_registration_list(db: Session = Depends(get_db)):
    events = db.scalars(select(JoinEvent).order_by(JoinEvent.unique_event_id)).all()
    return Response(
        content=build_registration_list_pdf(events),
        media_type=PDF_SHEET,
        headers={"Content-Disposition": 'attachment; filename="registration-list.pdf"'},
    )
