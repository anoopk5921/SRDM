from io import BytesIO
from pathlib import Path

import qrcode
from qrcode.constants import ERROR_CORRECT_M
from reportlab.lib.colors import Color, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

GREEN = Color(20 / 255, 90 / 255, 42 / 255)
GREEN_DARK = Color(12 / 255, 61 / 255, 32 / 255)
CREAM = Color(255 / 255, 252 / 255, 245 / 255)
INK = Color(28 / 255, 36 / 255, 28 / 255)
MUTED = Color(71 / 255, 85 / 255, 72 / 255)
GOLD = Color(196 / 255, 146 / 255, 18 / 255)

INSTITUTION = "Sreedhareeyam Ayurvedic Eye Hospital and Research Centre Pvt. Ltd"
QR_PATTERN_SIZE = 20 * mm
QR_BORDER = 2
_APP_DIR = Path(__file__).resolve().parent
_REPO_DIR = _APP_DIR.parent.parent
LOGO_CANDIDATES = (
    _APP_DIR / "sreedhareeyam-logo.jfif",
    _APP_DIR / "sreedhareeyam-logo.png",
    _REPO_DIR / "images" / "images.jfif",
    _REPO_DIR / "frontend" / "public" / "sreedhareeyam-logo.png",
)


def _logo() -> ImageReader | None:
    for path in LOGO_CANDIDATES:
        if path.is_file():
            return ImageReader(str(path))
    return None


def _qr_image(value: str) -> tuple[ImageReader, int]:
    code = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=12, border=QR_BORDER)
    code.add_data(str(value))
    code.make(fit=True)
    image = code.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return ImageReader(buffer), code.modules_count


def _text_width(pdf: canvas.Canvas, text: str, font: str, size: float, char_space: float = 0) -> float:
    text = str(text or "")
    width = pdf.stringWidth(text, font, size)
    if char_space and len(text) > 1:
        width += char_space * (len(text) - 1)
    return width


def _fit_lines(
    pdf: canvas.Canvas,
    text: str,
    font: str,
    size: float,
    width: float,
    limit: int,
    char_space: float = 0,
) -> list[str]:
    words = str(text or "").split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        trial = f"{current} {word}"
        if _text_width(pdf, trial, font, size, char_space) <= width:
            current = trial
        else:
            lines.append(current)
            current = word
            if len(lines) == limit:
                break
    else:
        lines.append(current)
    if len(lines) <= limit:
        return lines
    kept = lines[:limit]
    last = kept[-1]
    while last and _text_width(pdf, f"{last}…", font, size, char_space) > width:
        last = last[:-1]
    kept[-1] = f"{last}…" if last else "…"
    return kept


def _token(value: str) -> str:
    return "".join(ch for ch in str(value or "").lower() if ch.isalnum())


def _fields(item: dict) -> list[tuple[str, str]]:
    category = _token(item.get("category"))
    relation = _token(item.get("relation"))
    admission = _token(item.get("admission_group"))
    employee_id = item.get("employee_id") or "—"
    department = item.get("department") or "—"
    employee_name = item.get("employee_name") or "—"
    guest_name = item.get("attendee_name") or "Guest"

    if category == "registered" and relation == "employee":
        return [
            ("Guest Cat", "Employee", True),
            ("Name", guest_name, True),
            ("Employee Code", employee_id, False),
            ("Department", department, False),
        ]
    if category == "registered":
        return [
            ("Guest Cat", "Family", True),
            ("Name", guest_name, True),
            ("Emp Name", employee_name, False),
            ("Dept", department, False),
            ("Employee ID", employee_id, False),
        ]
    if category == "unregistered" and admission == "employee" and relation != "employee":
        return [
            ("Guest Cat", "Family", True),
            ("Name", guest_name, True),
            ("Emp Name", employee_name, False),
            ("Dept", department, False),
            ("UR Number", item.get("unregistered_number") or "—", False),
        ]
    if category == "unregistered" and admission == "employee":
        return [
            ("Guest Cat", "Employee", True),
            ("Name", employee_name, True),
            ("Department", department, False),
            ("UR Number", item.get("unregistered_number") or "—", False),
        ]
    return [
        ("Guest Category", item.get("admission_group") or "Guest", True),
        ("Name", guest_name, True),
    ]


def _draw_pass(pdf: canvas.Canvas, x: float, y: float, width: float, height: float, item: dict, logo) -> None:
    pdf.setFillColor(CREAM)
    pdf.roundRect(x, y, width, height, 6, stroke=0, fill=1)

    header_h = 26 * mm
    footer_h = 8 * mm
    pdf.saveState()
    clip = pdf.beginPath()
    clip.roundRect(x, y, width, height, 6)
    pdf.clipPath(clip, stroke=0, fill=0)
    pdf.setFillColor(GREEN_DARK)
    pdf.rect(x, y + height - header_h, width, header_h, stroke=0, fill=1)
    pdf.restoreState()

    logo_size = 18 * mm
    logo_x = x + 1.6 * mm
    logo_y = y + height - 1.2 * mm - logo_size
    if logo is not None:
        pdf.drawImage(
            logo,
            logo_x,
            logo_y,
            logo_size,
            logo_size,
            preserveAspectRatio=True,
            mask="auto",
            anchor="c",
        )
    entry = "Entry Pass"
    entry_size = 20
    entry_right = x + width - 2.2 * mm
    entry_room = entry_right - (logo_x + logo_size + 1.6 * mm)
    while entry_size > 12 and pdf.stringWidth(entry, "Helvetica-Bold", entry_size) > entry_room:
        entry_size -= 0.4
    pdf.setFillColor(GOLD)
    pdf.setFont("Helvetica-Bold", entry_size)
    pdf.drawRightString(entry_right, logo_y + (logo_size - entry_size) / 2, entry)

    side = 2.2 * mm
    text_width = width - 2 * side
    name_size = 8.2
    while name_size > 6 and pdf.stringWidth(INSTITUTION, "Helvetica-Bold", name_size) > text_width:
        name_size -= 0.1
    pdf.setFillColor(white)
    pdf.setFont("Helvetica-Bold", name_size)
    pdf.drawString(x + side, logo_y - 4.4 * mm, INSTITUTION)

    pdf.saveState()
    clip = pdf.beginPath()
    clip.roundRect(x, y, width, height, 6)
    pdf.clipPath(clip, stroke=0, fill=0)
    pdf.setFillColor(GREEN_DARK)
    pdf.rect(x, y, width, footer_h, stroke=0, fill=1)
    pdf.restoreState()

    event_name = item.get("event") or "Annual Day 2026"
    event_size = 13
    pdf.setFillColor(GOLD)
    pdf.setFont("Helvetica-Bold", event_size)
    pdf.drawCentredString(x + width / 2, y + (footer_h - event_size) / 2 + 1, event_name)

    qr_image, qr_modules = _qr_image(item["unique_event_id"])
    qr_size = QR_PATTERN_SIZE * (qr_modules + 2 * QR_BORDER) / qr_modules
    qr_x = x + (width - qr_size) / 2
    qr_y = y + footer_h + 3.1 * mm
    pdf.drawImage(
        qr_image,
        qr_x,
        qr_y,
        qr_size,
        qr_size,
        mask="auto",
    )
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawCentredString(x + width / 2, y + footer_h + 0.9 * mm, str(item["unique_event_id"]))

    field_width = width - 8 * mm
    field_x = x + 4 * mm
    field_y = y + height - header_h - 10
    label_space = 1.7
    value_space = 2.4
    detail_space = 0.85
    for label, value, prominent in _fields(item):
        if prominent:
            pdf.setFillColor(MUTED)
            pdf.setFont("Helvetica-Bold", 7)
            pdf.drawString(field_x, field_y, label.upper(), charSpace=label_space)
            size = 14
            space = value_space
            while size > 8 and _text_width(pdf, str(value), "Helvetica-Bold", size, space) > field_width:
                size -= 0.5
            while space > 0 and _text_width(pdf, str(value), "Helvetica-Bold", size, space) > field_width:
                space = max(0, space - 0.15)
            field_y -= size + 2
            pdf.setFillColor(INK)
            pdf.setFont("Helvetica-Bold", size)
            for line in _fit_lines(pdf, value, "Helvetica-Bold", size, field_width, 1, space):
                pdf.drawString(field_x, field_y, line, charSpace=space)
                field_y -= size + 1
        else:
            pdf.setFillColor(INK)
            pdf.setFont("Helvetica", 8)
            detail = f"{label}: {value}"
            space = detail_space
            while space > 0 and _text_width(pdf, detail, "Helvetica", 8, space) > field_width:
                space = max(0, space - 0.1)
            pdf.drawString(
                field_x,
                field_y,
                _fit_lines(pdf, detail, "Helvetica", 8, field_width, 1, space)[0],
                charSpace=space,
            )
            field_y -= 10

    pdf.setStrokeColor(GREEN)
    pdf.setLineWidth(1.4)
    pdf.roundRect(x, y, width, height, 6, stroke=1, fill=0)


def build_passes_pdf(passes: list[dict]) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    page_w, page_h = A4
    margin_x = 8 * mm
    margin_y = 8 * mm
    gap_x = 4 * mm
    gap_y = 4 * mm
    columns, rows = 2, 3
    card_w = (page_w - 2 * margin_x - gap_x * (columns - 1)) / columns
    card_h = (page_h - 2 * margin_y - gap_y * (rows - 1)) / rows
    logo = _logo()

    for index, item in enumerate(passes):
        slot = index % (columns * rows)
        if index and slot == 0:
            pdf.showPage()
        column = slot % columns
        row = slot // columns
        x = margin_x + column * (card_w + gap_x)
        y = page_h - margin_y - (row + 1) * card_h - row * gap_y
        _draw_pass(pdf, x, y, card_w, card_h, item, logo)

    pdf.save()
    return buffer.getvalue()
