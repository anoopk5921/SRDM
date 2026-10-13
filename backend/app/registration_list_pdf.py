from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib.colors import Color, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models import JoinEvent
from app.schemas import RegistrationSummaryReport

GREEN = Color(20 / 255, 90 / 255, 42 / 255)
GREEN_DARK = Color(12 / 255, 61 / 255, 32 / 255)
INK = Color(28 / 255, 36 / 255, 28 / 255)
LINE = Color(187 / 255, 247 / 255, 208 / 255)
ZEBRA = Color(240 / 255, 253 / 255, 244 / 255)

HOSPITAL = "Sreedhareeyam Ayurvedic Eye Hospital And Research Centre Pvt Ltd"
TITLE = "Annual Day Registration List"
_APP_DIR = Path(__file__).resolve().parent
_REPO_DIR = _APP_DIR.parent.parent
LOGO_CANDIDATES = (
    _APP_DIR / "sreedhareeyam-logo.png",
    _REPO_DIR / "frontend" / "public" / "sreedhareeyam-logo.png",
    _REPO_DIR / "images" / "images.jfif",
)

HEADERS = [
    "Serial No",
    "Registration No",
    "Name",
    "Employee Code",
    "Unregistered Number",
    "AdmissionGroup",
    "Company",
    "Department",
]


def _logo() -> ImageReader | None:
    for path in LOGO_CANDIDATES:
        if path.is_file():
            return ImageReader(str(path))
    return None


def _paragraph(text, style: ParagraphStyle) -> Paragraph:
    shown = "" if text is None else str(text)
    return Paragraph(escape(shown), style)


def _header_style(name: str) -> ParagraphStyle:
    return ParagraphStyle(
        name,
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=white,
    )


def _cell_style(name: str, bold: bool = False) -> ParagraphStyle:
    return ParagraphStyle(
        name,
        fontName="Helvetica-Bold" if bold else "Helvetica",
        fontSize=8,
        leading=10,
        textColor=INK,
    )


def _section_style(name: str) -> ParagraphStyle:
    return ParagraphStyle(
        name,
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=GREEN_DARK,
        spaceBefore=4,
        spaceAfter=3,
    )


def _draw_letterhead(pdf, page_width, page_height, left, right, title, logo) -> None:
    pdf.saveState()
    logo_size = 18 * mm
    logo_x = left
    logo_y = page_height - 8 * mm - logo_size
    if logo is not None:
        pdf.drawImage(
            logo,
            logo_x,
            logo_y,
            logo_size,
            logo_size,
            mask="auto",
            preserveAspectRatio=True,
            anchor="c",
        )
    name_x = logo_x + logo_size + 4 * mm
    name_width = page_width - right - name_x
    name_size = 13
    pdf.setFont("Helvetica-Bold", name_size)
    while name_size > 8 and pdf.stringWidth(HOSPITAL, "Helvetica-Bold", name_size) > name_width:
        name_size -= 0.5
        pdf.setFont("Helvetica-Bold", name_size)
    pdf.setFillColor(GREEN_DARK)
    pdf.drawString(name_x, logo_y + (logo_size - name_size) / 2, HOSPITAL)

    band_top = logo_y - 3 * mm
    band_height = 8 * mm
    pdf.setFillColor(GREEN)
    pdf.rect(left, band_top - band_height, page_width - left - right, band_height, fill=1, stroke=0)
    pdf.setFillColor(white)
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawCentredString(page_width / 2, band_top - band_height + 2.2 * mm, title)
    pdf.restoreState()


def _data_table(rows: list[list], widths: list[float], total_row: bool = False, center_from: int = 1) -> Table:
    table = Table(rows, colWidths=widths, repeatRows=1)
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), GREEN),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (center_from, 1), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, ZEBRA]),
    ]
    if total_row and len(rows) > 1:
        commands.append(("BACKGROUND", (0, -1), (-1, -1), Color(209 / 255, 250 / 255, 229 / 255)))
    table.setStyle(TableStyle(commands))
    return table


def build_registration_list_pdf(events: list[JoinEvent]) -> bytes:
    buffer = BytesIO()
    page_size = landscape(A4)
    page_width, page_height = page_size
    left = 12 * mm
    right = 12 * mm
    top = 42 * mm
    bottom = 12 * mm
    logo = _logo()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=page_size,
        leftMargin=left,
        rightMargin=right,
        topMargin=top,
        bottomMargin=bottom,
        title=TITLE,
        author=HOSPITAL,
    )

    header_style = _header_style("registration-list-header")
    cell_style = _cell_style("registration-list-cell")
    rows = [[_paragraph(label, header_style) for label in HEADERS]]
    for serial, event in enumerate(events, start=1):
        rows.append(
            [
                _paragraph(serial, cell_style),
                _paragraph(event.unique_event_id, cell_style),
                _paragraph(event.name, cell_style),
                _paragraph(event.employee_id or "", cell_style),
                _paragraph(event.unregistered_number or "", cell_style),
                _paragraph(event.admission_group, cell_style),
                _paragraph(event.company, cell_style),
                _paragraph(event.department, cell_style),
            ]
        )

    usable = page_width - left - right
    column_widths = [
        18 * mm,
        32 * mm,
        52 * mm,
        28 * mm,
        32 * mm,
        34 * mm,
        26 * mm,
        usable - (222 * mm),
    ]
    table = Table(rows, colWidths=column_widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), GREEN),
                ("TEXTCOLOR", (0, 0), (-1, 0), white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ALIGN", (0, 0), (1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, ZEBRA]),
            ]
        )
    )

    def draw_header(pdf, _doc) -> None:
        _draw_letterhead(pdf, page_width, page_height, left, right, TITLE, logo)

    doc.build([table], onFirstPage=draw_header, onLaterPages=draw_header)
    return buffer.getvalue()


SUMMARY_TITLE = "Annual Day Registration Summery"


def build_registration_summary_pdf(report: RegistrationSummaryReport) -> bytes:
    buffer = BytesIO()
    page_size = landscape(A4)
    page_width, page_height = page_size
    left = 12 * mm
    right = 12 * mm
    usable = page_width - left - right
    logo = _logo()
    header = _header_style("registration-summary-header")
    cell = _cell_style("registration-summary-cell")
    bold = _cell_style("registration-summary-bold", bold=True)
    section = _section_style("registration-summary-section")

    def headings(*labels: str) -> list:
        return [_paragraph(label, header) for label in labels]

    def values(*items, emphasize: bool = False) -> list:
        style = bold if emphasize else cell
        return [_paragraph(item, style) for item in items]

    totals = [
        headings("Particulars", "Count"),
        values("Total employees", report.total_employees),
        values("Total employee strength", report.total_employee_strength),
        values("Children under 5 years", report.children_under_five),
        values("Total registrations", report.total_registrations),
        values("Entry gate scanned", report.entry_gate_count),
        values("Meals gate scanned", report.meals_gate_count),
    ]
    strength_rows = [headings("Company", "Company name", "Employees", "Strength")]
    for row in report.strength_by_company:
        strength_rows.append(values(row.company_code, row.company_name, row.employees, row.strength))
    strength_rows.append(
        values("Total", "", report.total_employees, report.total_employee_strength, emphasize=True)
    )
    company_rows = [
        headings(
            "Company",
            "Company name",
            "Registered employees",
            "Unregistered employees",
            "Family members",
            "Total Employees and Family",
        )
    ]
    for row in report.registered_employees_by_company:
        company_rows.append(
            values(
                row.company_code,
                row.company_name,
                row.registered_employees,
                row.unregistered_employees,
                row.family_members,
                row.total_employees_and_family,
            )
        )
    category_rows = [headings("Category", "Registrations")]
    for row in report.categories:
        category_rows.append(values(row.category, row.count))
    category_rows.append(values("Total", sum(row.count for row in report.categories), emphasize=True))

    story = [
        _data_table(totals, [120 * mm, 36 * mm]),
        Spacer(1, 4 * mm),
        KeepTogether(
            [
                Paragraph("Employee strength by company", section),
                _data_table(
                    strength_rows,
                    [32 * mm, usable - 112 * mm, 40 * mm, 40 * mm],
                    total_row=True,
                    center_from=2,
                ),
            ]
        ),
        Spacer(1, 4 * mm),
        KeepTogether(
            [
                Paragraph("Registered employees by company", section),
                _data_table(
                    company_rows,
                    [28 * mm, usable - 188 * mm, 40 * mm, 44 * mm, 36 * mm, 40 * mm],
                    center_from=2,
                ),
            ]
        ),
        Spacer(1, 4 * mm),
        KeepTogether(
            [
                Paragraph("Category wise registration", section),
                _data_table(category_rows, [120 * mm, 36 * mm], total_row=True),
            ]
        ),
    ]

    doc = SimpleDocTemplate(
        buffer,
        pagesize=page_size,
        leftMargin=left,
        rightMargin=right,
        topMargin=42 * mm,
        bottomMargin=12 * mm,
        title=SUMMARY_TITLE,
        author=HOSPITAL,
    )

    def draw_header(pdf, _doc) -> None:
        _draw_letterhead(pdf, page_width, page_height, left, right, SUMMARY_TITLE, logo)

    doc.build(story, onFirstPage=draw_header, onLaterPages=draw_header)
    return buffer.getvalue()
