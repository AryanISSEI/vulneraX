import json
import os
from datetime import datetime
from jinja2 import Environment, FileSystemLoader
from fpdf import FPDF
from models import ScanResult


TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "backend", "templates")
# Fallback to local templates dir
if not os.path.exists(TEMPLATES_DIR):
    TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "..", "templates")
    TEMPLATES_DIR = os.path.normpath(TEMPLATES_DIR)

REPORTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "reports")


def ensure_reports_dir():
    os.makedirs(REPORTS_DIR, exist_ok=True)


def generate_json_report(scan_result: ScanResult) -> str:
    """Generate a JSON report and return the file path."""
    ensure_reports_dir()
    filename = f"VulneraX_{scan_result.target}_{scan_result.scan_id[:8]}.json"
    filepath = os.path.join(REPORTS_DIR, filename)

    data = scan_result.model_dump()
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)

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

    filename = f"VulneraX_{scan_result.target}_{scan_result.scan_id[:8]}.html"
    filepath = os.path.join(REPORTS_DIR, filename)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html_content)

    return filepath


def _generate_inline_html(scan_result: ScanResult) -> str:
    """Fallback inline HTML report when template is not available."""
    ensure_reports_dir()
    s = scan_result

    def severity_color(sev):
        colors = {"critical": "#ef4444", "high": "#f97316", "medium": "#eab308", "low": "#3b82f6", "info": "#6b7280"}
        return colors.get(sev, "#6b7280")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VulneraX Report - {s.target}</title>
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
<h1>🔒 VulneraX Security Report</h1>
<p class="meta">Target: {s.target} | Scan ID: {s.scan_id} | Date: {s.timestamp}</p>
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
        html += f'<tr><td><b>IP Address</b></td><td>{s.dns.ip_address}</td></tr>'
        html += f'<tr><td><b>Country</b></td><td>{s.dns.country}</td></tr>'
        html += f'<tr><td><b>Registrar</b></td><td>{s.dns.registrar}</td></tr>'
        html += '</table></div>'

    # Ports
    if s.ports:
        html += '<div class="card"><h2>Open Ports</h2><table><tr><th>Port</th><th>Service</th><th>State</th><th>Banner</th></tr>'
        for p in s.ports:
            html += f'<tr><td>{p.port}</td><td>{p.service}</td><td>{p.state}</td><td>{p.banner}</td></tr>'
        html += '</table></div>'

    # Headers
    if s.headers:
        html += '<div class="card"><h2>Security Headers</h2><table><tr><th>Header</th><th>Status</th><th>Value</th></tr>'
        for h in s.headers:
            status = "✅ Present" if h.present else "❌ Missing"
            html += f'<tr><td>{h.name}</td><td>{status}</td><td>{h.value or "-"}</td></tr>'
        html += '</table></div>'

    # SSL
    if s.ssl and s.ssl.tls_version:
        html += '<div class="card"><h2>SSL/TLS</h2><table>'
        html += f'<tr><td><b>TLS Version</b></td><td>{s.ssl.tls_version}</td></tr>'
        html += f'<tr><td><b>Issuer</b></td><td>{s.ssl.issuer}</td></tr>'
        html += f'<tr><td><b>Expires</b></td><td>{s.ssl.expires}</td></tr>'
        html += f'<tr><td><b>Days Remaining</b></td><td>{s.ssl.days_remaining}</td></tr>'
        html += '</table></div>'

    # Vulnerabilities
    if s.vulnerabilities:
        html += '<div class="card"><h2>Vulnerabilities</h2>'
        for v in s.vulnerabilities:
            html += f'<div style="margin:10px 0;padding:10px;background:#0f172a;border-radius:6px;border-left:3px solid {severity_color(v.severity.value)}">'
            html += f'<b>{v.name}</b> <span class="badge" style="background:{severity_color(v.severity.value)}">{v.severity.value.upper()}</span>'
            html += f'<p style="margin:5px 0;color:#94a3b8">{v.description}</p>'
            if v.recommendation:
                html += f'<p style="margin:5px 0;color:#7dd3fc">💡 {v.recommendation}</p>'
            html += '</div>'
        html += '</div>'

    html += '<div class="footer"><p>Generated by VulneraX Security Assessment Platform</p></div></div></body></html>'

    filename = f"VulneraX_{s.target}_{s.scan_id[:8]}.html"
    filepath = os.path.join(REPORTS_DIR, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)
    return filepath


def generate_pdf_report(scan_result: ScanResult) -> str:
    """Generate a PDF report using fpdf2 and return the file path."""
    ensure_reports_dir()
    s = scan_result

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    # Title
    pdf.set_font("Helvetica", "B", 24)
    pdf.cell(0, 15, "VulneraX Security Report", ln=True, align="C")
    pdf.ln(5)

    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 8, f"Target: {s.target}", ln=True, align="C")
    pdf.cell(0, 8, f"Scan ID: {s.scan_id}", ln=True, align="C")
    pdf.cell(0, 8, f"Date: {s.timestamp}", ln=True, align="C")
    pdf.ln(10)

    # Risk Score
    if s.risk_score:
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 10, "Risk Score", ln=True)
        pdf.set_font("Helvetica", "B", 36)
        pdf.cell(0, 20, f"{s.risk_score.overall} / 100", ln=True, align="C")
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(0, 8,
                 f"Critical: {s.risk_score.critical_count}  |  High: {s.risk_score.high_count}  |  "
                 f"Medium: {s.risk_score.medium_count}  |  Low: {s.risk_score.low_count}",
                 ln=True, align="C")
        pdf.ln(10)

    # Target Info
    if s.dns:
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 10, "Target Information", ln=True)
        pdf.set_font("Helvetica", "", 10)
        info_items = [
            ("IP Address", s.dns.ip_address),
            ("Country", s.dns.country),
            ("Registrar", s.dns.registrar),
        ]
        for label, value in info_items:
            if value:
                pdf.cell(60, 8, label, border=0)
                pdf.cell(0, 8, value, border=0, ln=True)
        pdf.ln(5)

    # Server/Technologies
    if s.fingerprint:
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 10, "Server & Technologies", ln=True)
        pdf.set_font("Helvetica", "", 10)
        if s.fingerprint.server:
            pdf.cell(60, 8, "Server")
            pdf.cell(0, 8, s.fingerprint.server, ln=True)
        if s.fingerprint.technologies:
            pdf.cell(60, 8, "Technologies")
            pdf.cell(0, 8, ", ".join(s.fingerprint.technologies), ln=True)
        pdf.ln(5)

    # Open Ports
    if s.ports:
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 10, "Open Ports", ln=True)
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(25, 8, "Port", border=1)
        pdf.cell(40, 8, "Service", border=1)
        pdf.cell(25, 8, "State", border=1)
        pdf.cell(0, 8, "Banner", border=1, ln=True)
        pdf.set_font("Helvetica", "", 9)
        for p in s.ports:
            pdf.cell(25, 7, str(p.port), border=1)
            pdf.cell(40, 7, p.service, border=1)
            pdf.cell(25, 7, p.state, border=1)
            pdf.cell(0, 7, p.banner[:50], border=1, ln=True)
        pdf.ln(5)

    # Security Headers
    if s.headers:
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 10, "Security Headers", ln=True)
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(55, 8, "Header", border=1)
        pdf.cell(25, 8, "Status", border=1)
        pdf.cell(0, 8, "Value", border=1, ln=True)
        pdf.set_font("Helvetica", "", 9)
        for h in s.headers:
            status = "Present" if h.present else "MISSING"
            pdf.cell(55, 7, h.name, border=1)
            pdf.cell(25, 7, status, border=1)
            pdf.cell(0, 7, (h.value or "-")[:40], border=1, ln=True)
        pdf.ln(5)

    # Cookies
    if s.cookies:
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 10, "Cookie Analysis", ln=True)
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(40, 8, "Name", border=1)
        pdf.cell(20, 8, "HttpOnly", border=1)
        pdf.cell(20, 8, "Secure", border=1)
        pdf.cell(25, 8, "SameSite", border=1)
        pdf.cell(0, 8, "Issues", border=1, ln=True)
        pdf.set_font("Helvetica", "", 9)
        for c in s.cookies:
            pdf.cell(40, 7, c.name[:15], border=1)
            pdf.cell(20, 7, "Yes" if c.http_only else "No", border=1)
            pdf.cell(20, 7, "Yes" if c.secure else "No", border=1)
            pdf.cell(25, 7, c.same_site or "None", border=1)
            pdf.cell(0, 7, str(len(c.issues)) + " issue(s)", border=1, ln=True)
        pdf.ln(5)

    # SSL
    if s.ssl and s.ssl.tls_version:
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 10, "SSL/TLS Certificate", ln=True)
        pdf.set_font("Helvetica", "", 10)
        ssl_items = [
            ("TLS Version", s.ssl.tls_version),
            ("Issuer", s.ssl.issuer),
            ("Expires", s.ssl.expires),
            ("Days Remaining", str(s.ssl.days_remaining)),
            ("Cipher", s.ssl.cipher_name),
        ]
        for label, value in ssl_items:
            if value:
                pdf.cell(45, 8, label)
                pdf.cell(0, 8, value[:60], ln=True)
        if s.ssl.issues:
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(0, 8, "Issues:", ln=True)
            pdf.set_font("Helvetica", "", 9)
            for issue in s.ssl.issues:
                pdf.cell(10, 7, "")
                pdf.cell(0, 7, f"- {issue}", ln=True)
        pdf.ln(5)

    # Vulnerabilities
    if s.vulnerabilities:
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 10, "Vulnerability Findings", ln=True)
        for v in s.vulnerabilities:
            pdf.set_font("Helvetica", "B", 11)
            pdf.cell(0, 8, f"[{v.severity.value.upper()}] {v.name}", ln=True)
            pdf.set_font("Helvetica", "", 9)
            pdf.cell(0, 6, f"Category: {v.category}", ln=True)
            if v.url:
                pdf.cell(0, 6, f"URL: {v.url[:80]}", ln=True)
            if v.description:
                pdf.multi_cell(0, 6, f"Description: {v.description}")
            if v.recommendation:
                pdf.multi_cell(0, 6, f"Recommendation: {v.recommendation}")
            pdf.ln(3)

    # Footer
    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 9)
    pdf.cell(0, 8, "Generated by VulneraX Security Assessment Platform", ln=True, align="C")

    filename = f"VulneraX_{s.target}_{s.scan_id[:8]}.pdf"
    filepath = os.path.join(REPORTS_DIR, filename)
    pdf.output(filepath)

    return filepath
