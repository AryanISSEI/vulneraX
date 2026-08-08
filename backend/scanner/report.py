import json
import os
import re
from datetime import datetime
import csv
from jinja2 import Environment, FileSystemLoader
from fpdf import FPDF
from models import ScanResult


def _safe_filename(target: str) -> str:
    """Sanitise a target string so it is safe to use in a filename."""
    return re.sub(r'[^a-zA-Z0-9._-]', '_', target)


# __file__ is backend/scanner/report.py
# os.path.dirname(__file__) -> backend/scanner/
# one level up -> backend/
_BACKEND_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
_PROJECT_ROOT = os.path.normpath(os.path.join(_BACKEND_DIR, ".."))

TEMPLATES_DIR = os.path.join(_BACKEND_DIR, "templates")
if not os.path.exists(TEMPLATES_DIR):
    # Absolute fallback – shouldn't be needed
    TEMPLATES_DIR = os.path.join(_PROJECT_ROOT, "backend", "templates")

REPORTS_DIR = os.path.join(_PROJECT_ROOT, "reports")


def ensure_reports_dir():
    os.makedirs(REPORTS_DIR, exist_ok=True)


def generate_json_report(scan_result: ScanResult) -> str:
    """Generate a JSON report and return the file path."""
    ensure_reports_dir()
    filename = f"VulneraX_{_safe_filename(scan_result.target)}_{scan_result.scan_id[:8]}.json"
    filepath = os.path.join(REPORTS_DIR, filename)

    data = scan_result.model_dump()
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)

    return filepath


def generate_csv_report(scan_result: ScanResult) -> str:
    """Generate a CSV report of vulnerabilities and return the file path."""
    ensure_reports_dir()
    filename = f"VulneraX_{_safe_filename(scan_result.target)}_{scan_result.scan_id[:8]}.csv"
    filepath = os.path.join(REPORTS_DIR, filename)

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Name", "Category", "Severity", "URL", "Description", "Recommendation"])
        for v in scan_result.vulnerabilities:
            sev = v.severity.value if hasattr(v.severity, "value") else str(v.severity)
            writer.writerow([
                v.name,
                v.category,
                sev.upper(),
                v.url,
                v.description,
                v.recommendation
            ])
            
    return filepath


def generate_html_report(scan_result: ScanResult) -> str:
    """Generate an HTML report using Jinja2 template and return the file path."""
    ensure_reports_dir()

    try:
        env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))
        template = env.get_template("report.html")
    except Exception:
        # Fallback: generate inline HTML
        return _generate_inline_html(scan_result)

    html_content = template.render(
        scan=scan_result,
        generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    )

    filename = f"VulneraX_{_safe_filename(scan_result.target)}_{scan_result.scan_id[:8]}.html"
    filepath = os.path.join(REPORTS_DIR, filename)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html_content)

    return filepath


def _generate_inline_html(scan_result: ScanResult) -> str:
    """Fallback inline HTML report when template is not available."""
    import html as html_mod  # HTML escaping to prevent stored XSS

    ensure_reports_dir()
    s = scan_result
    esc = html_mod.escape  # shorthand

    def severity_color(sev):
        colors = {"critical": "#ef4444", "high": "#f97316", "medium": "#eab308", "low": "#3b82f6", "info": "#6b7280"}
        return colors.get(sev, "#6b7280")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VulneraX Report - {esc(s.target)}</title>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: 'Segoe UI', Tahoma, sans-serif; background: #0f172a; color: #e2e8f0; padding: 40px; }}
.container {{ max-width: 900px; margin: 0 auto; }}
h1 {{ color: #38bdf8; margin-bottom: 8px; font-size: 28px; }}
h2 {{ color: #7dd3fc; margin: 30px 0 15px; padding-bottom: 8px; border-bottom: 1px solid #1e293b; }}
h3 {{ color: #bae6fd; margin: 15px 0 10px; }}
.meta {{ color: #94a3b8; margin-bottom: 30px; }}
.card {{ background: #1e293b; border-radius: 8px; padding: 20px; margin-bottom: 15px; }}
table {{ width: 100%; border-collapse: collapse; margin: 10px 0; }}
th {{ text-align: left; padding: 10px; background: #334155; color: #7dd3fc; }}
td {{ padding: 10px; border-bottom: 1px solid #334155; }}
.badge {{ display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; color: white; }}
.score {{ font-size: 64px; font-weight: 700; text-align: center; margin: 20px 0; }}
.footer {{ text-align: center; color: #64748b; margin-top: 40px; padding-top: 20px; border-top: 1px solid #1e293b; }}
</style>
</head>
<body>
<div class="container">
<h1>VulneraX Security Report</h1>
<p class="meta">Target: {esc(s.target)} | Scan ID: {esc(s.scan_id)} | Date: {esc(s.timestamp)}</p>
"""

    # Risk Score
    if s.risk_score:
        sc = s.risk_score.overall
        color = "#22c55e" if sc >= 80 else "#eab308" if sc >= 50 else "#ef4444"
        html += f'<div class="card"><h2>Risk Score</h2><div class="score" style="color:{color}">{sc}/100</div>'
        html += f'<p style="text-align:center">Critical: {s.risk_score.critical_count} | High: {s.risk_score.high_count} | Medium: {s.risk_score.medium_count} | Low: {s.risk_score.low_count}</p></div>'

    # DNS / Quick Info
    if s.dns:
        html += '<div class="card"><h2>Target Information</h2><table>'
        html += f'<tr><td><b>IP Address</b></td><td>{esc(s.dns.ip_address)}</td></tr>'
        html += f'<tr><td><b>Country</b></td><td>{esc(s.dns.country)}</td></tr>'
        html += f'<tr><td><b>Registrar</b></td><td>{esc(s.dns.registrar)}</td></tr>'
        html += '</table></div>'

    # Ports
    if s.ports:
        html += '<div class="card"><h2>Open Ports</h2><table><tr><th>Port</th><th>Service</th><th>State</th><th>Banner</th></tr>'
        for p in s.ports:
            html += f'<tr><td>{p.port}</td><td>{esc(p.service)}</td><td>{esc(p.state)}</td><td>{esc(p.banner)}</td></tr>'
        html += '</table></div>'

    # Headers
    if s.headers:
        html += '<div class="card"><h2>Security Headers</h2><table><tr><th>Header</th><th>Status</th><th>Value</th></tr>'
        for h in s.headers:
            status = "Present" if h.present else "MISSING"
            html += f'<tr><td>{esc(h.name)}</td><td>{status}</td><td>{esc(h.value) or "-"}</td></tr>'
        html += '</table></div>'

    # SSL
    if s.ssl and s.ssl.tls_version:
        html += '<div class="card"><h2>SSL/TLS</h2><table>'
        html += f'<tr><td><b>TLS Version</b></td><td>{esc(s.ssl.tls_version)}</td></tr>'
        html += f'<tr><td><b>Issuer</b></td><td>{esc(s.ssl.issuer)}</td></tr>'
        html += f'<tr><td><b>Expires</b></td><td>{esc(s.ssl.expires)}</td></tr>'
        html += f'<tr><td><b>Days Remaining</b></td><td>{s.ssl.days_remaining}</td></tr>'
        html += '</table></div>'

    # Vulnerabilities
    if s.vulnerabilities:
        html += '<div class="card"><h2>Vulnerabilities</h2>'
        for v in s.vulnerabilities:
            html += f'<div style="margin:10px 0;padding:10px;background:#0f172a;border-radius:6px;border-left:3px solid {severity_color(v.severity.value)}">'
            html += f'<b>{esc(v.name)}</b> <span class="badge" style="background:{severity_color(v.severity.value)}">{esc(v.severity.value.upper())}</span>'
            html += f'<p style="margin:5px 0;color:#94a3b8">{esc(v.description)}</p>'
            if v.recommendation:
                html += f'<p style="margin:5px 0;color:#7dd3fc">Recommendation: {esc(v.recommendation)}</p>'
            html += '</div>'
        html += '</div>'

    html += '<div class="footer"><p>Generated by VulneraX Security Assessment Platform</p></div></div></body></html>'

    filename = f"VulneraX_{_safe_filename(s.target)}_{s.scan_id[:8]}.html"
    filepath = os.path.join(REPORTS_DIR, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)
    return filepath


# ---------------------------------------------------------------------------
#  Color-themed PDF report
# ---------------------------------------------------------------------------

# -- Palette (RGB tuples) --
_CLR_BG_DARK = (15, 23, 42)        # #0f172a  deep navy
_CLR_BG_SECTION = (30, 41, 59)     # #1e293b  card background
_CLR_BG_TABLE_HDR = (51, 65, 85)   # #334155  table header
_CLR_CYAN = (56, 189, 248)         # #38bdf8  primary accent
_CLR_CYAN_LIGHT = (125, 211, 252)  # #7dd3fc  section headings
_CLR_TEXT = (226, 232, 240)        # #e2e8f0  body text
_CLR_TEXT_MUTED = (148, 163, 184)  # #94a3b8  muted text
_CLR_WHITE = (255, 255, 255)
_CLR_GREEN = (34, 197, 94)         # #22c55e
_CLR_YELLOW = (234, 179, 8)        # #eab308
_CLR_RED = (239, 68, 68)           # #ef4444
_CLR_ORANGE = (249, 115, 22)       # #f97316
_CLR_BLUE = (59, 130, 246)         # #3b82f6
_CLR_GRAY = (107, 114, 128)       # #6b7280

_SEVERITY_COLORS = {
    "critical": _CLR_RED,
    "high": _CLR_ORANGE,
    "medium": _CLR_YELLOW,
    "low": _CLR_BLUE,
    "info": _CLR_GRAY,
}


class VulneraXPDF(FPDF):
    """Custom PDF with dark-themed coloured pages."""

    def header(self):
        # Dark page background on every page
        self.set_fill_color(*_CLR_BG_DARK)
        self.rect(0, 0, self.w, self.h, "F")

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*_CLR_TEXT_MUTED)
        self.cell(0, 8, f"VulneraX Security Report  |  Page {self.page_no()}/{{nb}}", align="C")

    # -- helpers --------------------------------------------------------
    def _section_title(self, title: str):
        """Render a coloured section heading with an underline."""
        self.ln(4)
        self.set_font("Helvetica", "B", 15)
        self.set_text_color(*_CLR_CYAN_LIGHT)
        self.cell(0, 10, title, ln=True)
        # Accent line
        y = self.get_y()
        self.set_draw_color(*_CLR_CYAN)
        self.set_line_width(0.6)
        self.line(self.l_margin, y, self.l_margin + 60, y)
        self.ln(4)

    def _table_header(self, cols: list[tuple[str, int]]):
        """Draw a filled table header row. cols = [(label, width), ...]."""
        self.set_font("Helvetica", "B", 9)
        self.set_fill_color(*_CLR_BG_TABLE_HDR)
        self.set_text_color(*_CLR_CYAN_LIGHT)
        self.set_draw_color(*_CLR_BG_SECTION)
        for label, w in cols:
            self.cell(w, 8, label, border=1, fill=True)
        self.ln()

    def _table_row(self, values: list[tuple[str, int]], alt: bool = False):
        """Draw a single data row, optionally with an alternating tint."""
        self.set_font("Helvetica", "", 9)
        self.set_text_color(*_CLR_TEXT)
        if alt:
            self.set_fill_color(22, 30, 50)  # subtle alternate row
        else:
            self.set_fill_color(*_CLR_BG_DARK)
        self.set_draw_color(*_CLR_BG_SECTION)
        for text, w in values:
            self.cell(w, 7, text, border=1, fill=True)
        self.ln()

    def _kv_row(self, label: str, value: str, lw: int = 50):
        """Simple label → value row in body text."""
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(*_CLR_CYAN_LIGHT)
        self.cell(lw, 7, label)
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*_CLR_TEXT)
        self.cell(0, 7, value[:80], ln=True)


def generate_pdf_report(scan_result: ScanResult) -> str:
    """Generate a richly coloured PDF report and return the file path."""
    ensure_reports_dir()
    s = scan_result

    pdf = VulneraXPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # ── Title banner ─────────────────────────────────────────────
    pdf.set_fill_color(*_CLR_BG_SECTION)
    pdf.rect(10, 10, pdf.w - 20, 42, "F")
    # Accent stripe at the top of the banner
    pdf.set_fill_color(*_CLR_CYAN)
    pdf.rect(10, 10, pdf.w - 20, 2, "F")

    pdf.set_y(16)
    pdf.set_font("Helvetica", "B", 26)
    pdf.set_text_color(*_CLR_CYAN)
    pdf.cell(0, 12, "VulneraX Security Report", ln=True, align="C")

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*_CLR_TEXT_MUTED)
    pdf.cell(0, 7, f"Target: {s.target}  |  Scan ID: {s.scan_id}", ln=True, align="C")
    pdf.cell(0, 7, f"Date: {s.timestamp}", ln=True, align="C")
    pdf.ln(10)

    # ── Risk Score ───────────────────────────────────────────────
    if s.risk_score:
        pdf._section_title("Risk Score")
        sc = s.risk_score.overall
        if sc >= 80:
            clr = _CLR_GREEN
        elif sc >= 50:
            clr = _CLR_YELLOW
        else:
            clr = _CLR_RED

        # Score number – large and coloured
        pdf.set_font("Helvetica", "B", 48)
        pdf.set_text_color(*clr)
        pdf.cell(0, 22, f"{sc} / 100", ln=True, align="C")

        # Severity breakdown with coloured counts
        pdf.set_font("Helvetica", "", 10)
        breakdown = [
            ("Critical", s.risk_score.critical_count, _CLR_RED),
            ("High", s.risk_score.high_count, _CLR_ORANGE),
            ("Medium", s.risk_score.medium_count, _CLR_YELLOW),
            ("Low", s.risk_score.low_count, _CLR_BLUE),
        ]
        parts = []
        for label, count, _ in breakdown:
            parts.append(f"{label}: {count}")
        # Draw as centered coloured badges
        total_w = 0
        badge_data = []
        for label, count, color in breakdown:
            text = f" {label}: {count} "
            tw = pdf.get_string_width(text) + 6
            badge_data.append((text, tw, color))
            total_w += tw + 4
        x_start = (pdf.w - total_w) / 2
        y_badge = pdf.get_y() + 4
        for text, tw, color in badge_data:
            pdf.set_xy(x_start, y_badge)
            pdf.set_fill_color(*color)
            pdf.set_text_color(*_CLR_WHITE)
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(tw, 7, text, fill=True, align="C")
            # Round corners not natively supported; the fill gives a clean look
            x_start += tw + 4
        pdf.ln(16)

    # ── Target Information ───────────────────────────────────────
    if s.dns:
        pdf._section_title("Target Information")
        info = [
            ("IP Address", s.dns.ip_address),
            ("Country", s.dns.country),
            ("Registrar", s.dns.registrar),
        ]
        for label, value in info:
            if value:
                pdf._kv_row(label, value)
        if s.dns.nameservers:
            pdf._kv_row("Nameservers", ", ".join(s.dns.nameservers))
        pdf.ln(4)

    # ── Server & Technologies ────────────────────────────────────
    if s.fingerprint:
        pdf._section_title("Server & Technologies")
        if s.fingerprint.server:
            pdf._kv_row("Server", s.fingerprint.server)
        if s.fingerprint.technologies:
            pdf._kv_row("Technologies", ", ".join(s.fingerprint.technologies))
        if s.fingerprint.cms:
            pdf._kv_row("CMS", s.fingerprint.cms)
        pdf.ln(4)

    # ── Open Ports ───────────────────────────────────────────────
    if s.ports:
        pdf._section_title(f"Open Ports ({len(s.ports)})")
        cols = [("Port", 25), ("Service", 40), ("State", 25), ("Banner", 0)]
        # Compute last col width
        used = sum(w for _, w in cols[:-1])
        last_w = int(pdf.w - pdf.l_margin - pdf.r_margin - used)
        cols[-1] = ("Banner", last_w)
        pdf._table_header(cols)
        for i, p in enumerate(s.ports):
            pdf._table_row([
                (str(p.port), 25),
                (p.service, 40),
                (p.state, 25),
                (p.banner[:50] if p.banner else "-", last_w),
            ], alt=(i % 2 == 1))
        pdf.ln(4)

    # ── Security Headers ─────────────────────────────────────────
    if s.headers:
        pdf._section_title("Security Headers")
        cols = [("Header", 55), ("Status", 25)]
        used = 55 + 25
        val_w = int(pdf.w - pdf.l_margin - pdf.r_margin - used)
        cols.append(("Value", val_w))
        pdf._table_header(cols)
        for i, h in enumerate(s.headers):
            # Status with colour
            status_text = "Present" if h.present else "MISSING"
            pdf.set_font("Helvetica", "", 9)
            if h.present:
                # Green text for present
                pdf.set_text_color(*_CLR_GREEN)
            else:
                pdf.set_text_color(*_CLR_RED)

            if i % 2 == 1:
                pdf.set_fill_color(22, 30, 50)
            else:
                pdf.set_fill_color(*_CLR_BG_DARK)
            pdf.set_draw_color(*_CLR_BG_SECTION)

            # Header name
            pdf.set_text_color(*_CLR_TEXT)
            pdf.cell(55, 7, h.name, border=1, fill=True)
            # Status – coloured
            if h.present:
                pdf.set_text_color(*_CLR_GREEN)
            else:
                pdf.set_text_color(*_CLR_RED)
            pdf.cell(25, 7, status_text, border=1, fill=True)
            # Value
            pdf.set_text_color(*_CLR_TEXT)
            pdf.cell(val_w, 7, (h.value or "-")[:40], border=1, fill=True)
            pdf.ln()
        pdf.ln(4)

    # ── Cookie Analysis ──────────────────────────────────────────
    if s.cookies:
        pdf._section_title("Cookie Analysis")
        cols = [("Name", 40), ("HttpOnly", 20), ("Secure", 20), ("SameSite", 25)]
        used = sum(w for _, w in cols)
        iss_w = int(pdf.w - pdf.l_margin - pdf.r_margin - used)
        cols.append(("Issues", iss_w))
        pdf._table_header(cols)
        for i, c in enumerate(s.cookies):
            alt = i % 2 == 1
            if alt:
                pdf.set_fill_color(22, 30, 50)
            else:
                pdf.set_fill_color(*_CLR_BG_DARK)
            pdf.set_draw_color(*_CLR_BG_SECTION)
            pdf.set_font("Helvetica", "", 9)

            pdf.set_text_color(*_CLR_TEXT)
            pdf.cell(40, 7, c.name[:18], border=1, fill=True)

            # HttpOnly – green/red
            pdf.set_text_color(*(_CLR_GREEN if c.http_only else _CLR_RED))
            pdf.cell(20, 7, "Yes" if c.http_only else "No", border=1, fill=True)

            # Secure – green/red
            pdf.set_text_color(*(_CLR_GREEN if c.secure else _CLR_RED))
            pdf.cell(20, 7, "Yes" if c.secure else "No", border=1, fill=True)

            pdf.set_text_color(*_CLR_TEXT)
            pdf.cell(25, 7, c.same_site or "None", border=1, fill=True)

            issue_count = len(c.issues)
            pdf.set_text_color(*(_CLR_RED if issue_count else _CLR_GREEN))
            pdf.cell(iss_w, 7, f"{issue_count} issue(s)", border=1, fill=True)
            pdf.ln()
        pdf.ln(4)

    # ── SSL / TLS ────────────────────────────────────────────────
    if s.ssl and s.ssl.tls_version:
        pdf._section_title("SSL/TLS Certificate")
        ssl_items = [
            ("TLS Version", s.ssl.tls_version),
            ("Issuer", s.ssl.issuer),
            ("Subject", s.ssl.subject),
            ("Expires", s.ssl.expires),
            ("Days Remaining", str(s.ssl.days_remaining)),
            ("Cipher", s.ssl.cipher_name),
        ]
        for label, value in ssl_items:
            if value:
                pdf._kv_row(label, value[:60])

        # Weak cipher warning
        if s.ssl.weak_cipher:
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(*_CLR_RED)
            pdf.cell(0, 8, "WARNING: Weak cipher detected", ln=True)

        if s.ssl.issues:
            pdf.ln(2)
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(*_CLR_RED)
            pdf.cell(0, 8, "Issues:", ln=True)
            pdf.set_font("Helvetica", "", 9)
            for issue in s.ssl.issues:
                pdf.set_text_color(*_CLR_ORANGE)
                pdf.cell(8, 7, "")
                pdf.cell(0, 7, f"- {issue}", ln=True)
        pdf.ln(4)

    # ── Vulnerabilities ──────────────────────────────────────────
    if s.vulnerabilities:
        pdf._section_title(f"Vulnerability Findings ({len(s.vulnerabilities)})")

        for v in s.vulnerabilities:
            sev = v.severity.value if hasattr(v.severity, 'value') else str(v.severity)
            sev_clr = _SEVERITY_COLORS.get(sev, _CLR_GRAY)

            # Check if we need a new page (enough space for at least the header)
            if pdf.get_y() > pdf.h - 40:
                pdf.add_page()

            # Card background
            card_y = pdf.get_y()
            card_x = pdf.l_margin
            card_w = pdf.w - pdf.l_margin - pdf.r_margin

            # Left accent stripe (4px wide)
            pdf.set_fill_color(*sev_clr)
            pdf.rect(card_x, card_y, 3, 28, "F")

            # Card body background
            pdf.set_fill_color(*_CLR_BG_SECTION)
            pdf.rect(card_x + 3, card_y, card_w - 3, 28, "F")

            # Vulnerability name
            pdf.set_xy(card_x + 7, card_y + 2)
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(*_CLR_TEXT)
            name_w = pdf.get_string_width(v.name) + 4

            # Severity badge next to name
            badge_text = f" {sev.upper()} "
            badge_w = pdf.get_string_width(badge_text) + 6

            pdf.cell(name_w, 7, v.name)
            pdf.set_fill_color(*sev_clr)
            pdf.set_text_color(*_CLR_WHITE)
            pdf.set_font("Helvetica", "B", 8)
            pdf.cell(badge_w, 6, badge_text, fill=True, align="C")
            pdf.ln()

            # Category
            pdf.set_x(card_x + 7)
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(*_CLR_TEXT_MUTED)
            pdf.cell(0, 5, f"Category: {v.category}", ln=True)

            # URL if present
            if v.url:
                pdf.set_x(card_x + 7)
                pdf.set_text_color(*_CLR_CYAN_LIGHT)
                pdf.cell(0, 5, f"URL: {v.url[:75]}", ln=True)

            # Description (may wrap)
            if v.description:
                pdf.set_x(card_x + 7)
                pdf.set_text_color(*_CLR_TEXT_MUTED)
                pdf.set_font("Helvetica", "", 8)
                # Use multi_cell for wrapping within the card area
                pdf.multi_cell(card_w - 14, 5, v.description[:200])

            # Recommendation
            if v.recommendation:
                pdf.set_x(card_x + 7)
                pdf.set_text_color(*_CLR_CYAN_LIGHT)
                pdf.set_font("Helvetica", "I", 8)
                pdf.multi_cell(card_w - 14, 5, f"Recommendation: {v.recommendation[:200]}")

            pdf.ln(4)

    # ── Footer ───────────────────────────────────────────────────
    pdf.ln(8)
    pdf.set_draw_color(*_CLR_BG_TABLE_HDR)
    pdf.set_line_width(0.3)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(*_CLR_TEXT_MUTED)
    pdf.cell(0, 8, "Generated by VulneraX Security Assessment Platform", ln=True, align="C")
    pdf.cell(0, 6, "This report is for authorized security assessment purposes only.", ln=True, align="C")

    filename = f"VulneraX_{_safe_filename(s.target)}_{s.scan_id[:8]}.pdf"
    filepath = os.path.join(REPORTS_DIR, filename)
    pdf.output(filepath)

    return filepath
