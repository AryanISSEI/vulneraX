# Project Source Code

## backend\api\scan.py

```py
import uuid
import json
import asyncio
import re
import ipaddress
import os
from collections import defaultdict
import time
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from models import (
    ScanRequest, ScanResponse, ScanResult, ScanSummary,
    DNSResult, FingerprintResult, SSLResult, RiskScore
)
from database import save_scan, get_scan, get_all_scans, update_scan_status, update_scan_results

from scanner.dns_lookup import dns_lookup
from scanner.port_scanner import scan_ports
from scanner.banner import grab_banner
from scanner.fingerprint import fingerprint
from scanner.headers import check_headers
from scanner.cookies import analyze_cookies
from scanner.ssl_scan import scan_ssl
from scanner.crawler import crawl
from scanner.xss import test_xss
from scanner.sqli import test_sqli
from scanner.traversal import test_traversal
from scanner.redirect import test_redirect
from scanner.sensitive_files import check_sensitive_files
from scanner.risk_score import calculate_risk_score
from scanner.report import generate_json_report, generate_html_report, generate_pdf_report

router = APIRouter()

# In-memory store for active scan results (for real-time status)
active_scans: dict[str, ScanResult] = {}

# --- Concurrency & rate-limiting controls ---
# Limit to 5 scans running in parallel to prevent resource exhaustion
_scan_semaphore = asyncio.Semaphore(5)

# Simple per-IP rate limiter: track timestamps of recent requests
_RATE_WINDOW_SECONDS = 60
_RATE_MAX_REQUESTS = 3
_rate_tracker: dict[str, list[float]] = defaultdict(list)

# Strict regex: valid hostnames (RFC 952/1123) or IPv4 addresses only
_DOMAIN_RE = re.compile(
    r"^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$"
)
_IPV4_RE = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}$")


def _validate_target(raw: str) -> str:
    """Sanitise and validate a scan target. Returns a clean domain/IP or raises."""
    # Strip protocol and trailing slashes / paths
    cleaned = raw.strip()
    for prefix in ("https://", "http://"):
        if cleaned.lower().startswith(prefix):
            cleaned = cleaned[len(prefix):]
    cleaned = cleaned.strip("/").split("/")[0]  # drop any path component

    if not cleaned:
        raise HTTPException(status_code=400, detail="Target is required")

    # Must match a domain name or an IPv4 address
    if not (_DOMAIN_RE.match(cleaned) or _IPV4_RE.match(cleaned)):
        raise HTTPException(
            status_code=400,
            detail="Invalid target. Provide a valid domain name or IPv4 address.",
        )

    # If it looks like an IP, block private / loopback / link-local ranges
    if _IPV4_RE.match(cleaned):
        try:
            ip = ipaddress.ip_address(cleaned)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast:
                raise HTTPException(
                    status_code=400,
                    detail="Scanning private, loopback, or link-local addresses is not allowed.",
                )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid IP address.")

    return cleaned


def _safe_report_basename(filepath: str) -> str:
    """Extract a safe basename from a report filepath, preventing directory traversal."""
    return os.path.basename(filepath)


async def run_scan(scan_id: str, target: str):
    """Execute the full scan pipeline as a background task."""
    async with _scan_semaphore:
        result = ScanResult(
            scan_id=scan_id,
            target=target,
            timestamp=datetime.now(timezone.utc).isoformat(),
            status="running",
        )
        active_scans[scan_id] = result

        try:
            # Phase 1: DNS Lookup
            result.current_phase = "DNS Lookup"
            await update_scan_status(scan_id, "running", "DNS Lookup")
            try:
                result.dns = await dns_lookup(target)
            except Exception as e:
                result.dns = DNSResult()

            # Phase 2: Port Scanning
            result.current_phase = "Port Scanning"
            await update_scan_status(scan_id, "running", "Port Scanning")
            ip = result.dns.ip_address if result.dns else target

            # --- SSRF guard: block private / loopback / link-local resolved IPs ---
            if ip:
                try:
                    resolved = ipaddress.ip_address(ip)
                    if resolved.is_private or resolved.is_loopback or resolved.is_link_local or resolved.is_multicast:
                        raise ValueError(
                            f"Resolved IP {ip} is in a restricted range. Scan aborted."
                        )
                except ValueError as ve:
                    result.status = "error"
                    result.error = str(ve)
                    result.current_phase = "Error"
                    await update_scan_status(scan_id, "error", f"Error: {str(ve)}")
                    active_scans[scan_id] = result
                    return

            if ip:
                try:
                    result.ports = await scan_ports(ip)
                    # Grab banners for open ports
                    for port_result in result.ports:
                        if not port_result.banner:
                            try:
                                banner = await grab_banner(ip, port_result.port)
                                if banner:
                                    port_result.banner = banner
                            except Exception:
                                pass
                except Exception as e:
                    pass

            # Phase 3: Website Fingerprinting
            result.current_phase = "Fingerprinting"
            await update_scan_status(scan_id, "running", "Fingerprinting")
            try:
                result.fingerprint = await fingerprint(target)
            except Exception:
                result.fingerprint = FingerprintResult()

            # Phase 4: Security Headers
            result.current_phase = "Checking Headers"
            await update_scan_status(scan_id, "running", "Checking Headers")
            try:
                result.headers = await check_headers(target)
            except Exception:
                pass

            # Phase 5: Cookie Analysis
            result.current_phase = "Analyzing Cookies"
            await update_scan_status(scan_id, "running", "Analyzing Cookies")
            try:
                result.cookies = await analyze_cookies(target)
            except Exception:
                pass

            # Phase 6: SSL Scan
            result.current_phase = "SSL Scan"
            await update_scan_status(scan_id, "running", "SSL Scan")
            try:
                result.ssl = await scan_ssl(target)
            except Exception:
                result.ssl = SSLResult()

            # Phase 7: Crawling
            result.current_phase = "Crawling Website"
            await update_scan_status(scan_id, "running", "Crawling Website")
            crawl_data = {"urls": [], "forms": [], "params": []}
            # Only crawl if HTTP/HTTPS ports are open
            has_http = any(p.port in (80, 443, 8080, 8443, 8000, 3000) for p in result.ports) or True
            if has_http:
                try:
                    crawl_data = await crawl(target)
                except Exception:
                    pass

            # Phase 8: Vulnerability Tests
            result.current_phase = "Testing Vulnerabilities"
            await update_scan_status(scan_id, "running", "Testing Vulnerabilities")

            vuln_tasks = [
                test_xss(target, crawl_data),
                test_sqli(target, crawl_data),
                test_traversal(target, crawl_data),
                test_redirect(target, crawl_data),
                check_sensitive_files(target),
            ]

            vuln_results = await asyncio.gather(*vuln_tasks, return_exceptions=True)
            for vr in vuln_results:
                if isinstance(vr, list):
                    result.vulnerabilities.extend(vr)

            # Phase 9: Calculate Risk Score
            result.current_phase = "Calculating Risk Score"
            await update_scan_status(scan_id, "running", "Calculating Risk Score")
            result.risk_score = calculate_risk_score(
                result.vulnerabilities,
                result.headers,
                result.cookies,
                result.ssl,
            )

            # Done
            result.status = "completed"
            result.current_phase = "Completed"

            # Save to database
            await update_scan_results(
                scan_id,
                result.model_dump_json(),
                result.risk_score.overall if result.risk_score else 100,
                "completed"
            )

        except Exception as e:
            result.status = "error"
            result.error = str(e)
            result.current_phase = "Error"
            await update_scan_status(scan_id, "error", f"Error: {str(e)}")

        active_scans[scan_id] = result


@router.post("/scan", response_model=ScanResponse)
async def start_scan(request: ScanRequest, background_tasks: BackgroundTasks, req: Request):
    """Start a new security scan."""
    # --- Per-client rate limiting ---
    client_ip = req.client.host if req.client else "unknown"
    now = time.monotonic()
    # Prune entries older than the window
    _rate_tracker[client_ip] = [
        ts for ts in _rate_tracker[client_ip] if now - ts < _RATE_WINDOW_SECONDS
    ]
    if len(_rate_tracker[client_ip]) >= _RATE_MAX_REQUESTS:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {_RATE_MAX_REQUESTS} scans per {_RATE_WINDOW_SECONDS}s.",
        )
    _rate_tracker[client_ip].append(now)

    scan_id = str(uuid.uuid4())
    target = _validate_target(request.target)

    timestamp = datetime.now(timezone.utc).isoformat()
    await save_scan(scan_id, target, timestamp, "pending")

    # Start scan in background
    background_tasks.add_task(run_scan, scan_id, target)

    return ScanResponse(
        scan_id=scan_id,
        status="pending",
        message=f"Scan started for {target}"
    )


@router.get("/scan/{scan_id}/status")
async def get_scan_status(scan_id: str):
    """Get the current status of a scan."""
    # Check active scans first for real-time data
    if scan_id in active_scans:
        result = active_scans[scan_id]
        return {
            "scan_id": scan_id,
            "status": result.status,
            "current_phase": result.current_phase,
            "target": result.target,
        }

    # Check database
    scan = await get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    return {
        "scan_id": scan["id"],
        "status": scan["status"],
        "current_phase": scan.get("current_phase", ""),
        "target": scan["target"],
    }


@router.get("/scan/{scan_id}/results")
async def get_scan_results(scan_id: str):
    """Get the full results of a completed scan."""
    # Check active scans first
    if scan_id in active_scans:
        return active_scans[scan_id].model_dump()

    # Check database
    scan = await get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    try:
        results = json.loads(scan.get("results_json", "{}"))
        return results
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse scan results")


@router.get("/history")
async def get_scan_history():
    """Get all past scans."""
    scans = await get_all_scans()
    return {
        "scans": [
            ScanSummary(
                scan_id=s["id"],
                target=s["target"],
                timestamp=s["timestamp"],
                status=s["status"],
                risk_score=s.get("risk_score", 100),
            ).model_dump()
            for s in scans
        ]
    }


@router.get("/report/{scan_id}")
async def get_report(scan_id: str, format: str = "json"):
    """Generate and download a report in the specified format."""
    # Get scan result
    scan_result = None

    if scan_id in active_scans:
        scan_result = active_scans[scan_id]
    else:
        scan = await get_scan(scan_id)
        if not scan:
            raise HTTPException(status_code=404, detail="Scan not found")
        try:
            data = json.loads(scan.get("results_json", "{}"))
            scan_result = ScanResult(**data)
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to parse scan data")

    if scan_result.status != "completed":
        raise HTTPException(status_code=400, detail="Scan is not completed yet")

    if format == "json":
        filepath = generate_json_report(scan_result)
        return FileResponse(filepath, filename=_safe_report_basename(filepath), media_type="application/json")
    elif format == "html":
        filepath = generate_html_report(scan_result)
        return FileResponse(filepath, filename=_safe_report_basename(filepath), media_type="text/html")
    elif format == "pdf":
        filepath = generate_pdf_report(scan_result)
        return FileResponse(filepath, filename=_safe_report_basename(filepath), media_type="application/pdf")
    else:
        raise HTTPException(status_code=400, detail="Invalid format. Use: json, html, pdf")
```

## backend\api\__init__.py

```py
# VulneraX API Package
```

## backend\database.py

```py
import aiosqlite
import os
import json

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "scans")
DB_PATH = os.path.join(DB_DIR, "VulneraX.db")


async def init_db():
    """Initialize the database and create tables if they don't exist."""
    os.makedirs(DB_DIR, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS scans (
                id TEXT PRIMARY KEY,
                target TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                current_phase TEXT DEFAULT '',
                results_json TEXT DEFAULT '{}',
                risk_score INTEGER DEFAULT 100
            )
        """)
        await db.commit()


async def save_scan(scan_id: str, target: str, timestamp: str, status: str = "pending",
                     current_phase: str = "", results_json: str = "{}", risk_score: int = 100):
    """Insert or update a scan record."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO scans (id, target, timestamp, status, current_phase, results_json, risk_score)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                current_phase = excluded.current_phase,
                results_json = excluded.results_json,
                risk_score = excluded.risk_score
        """, (scan_id, target, timestamp, status, current_phase, results_json, risk_score))
        await db.commit()


async def get_scan(scan_id: str) -> dict | None:
    """Retrieve a single scan by ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM scans WHERE id = ?", (scan_id,)) as cursor:
            row = await cursor.fetchone()
            if row:
                return dict(row)
    return None


async def get_all_scans() -> list[dict]:
    """Retrieve all scans ordered by timestamp descending."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, target, timestamp, status, risk_score FROM scans ORDER BY timestamp DESC"
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


async def update_scan_status(scan_id: str, status: str, current_phase: str = ""):
    """Update the status and current phase of a scan."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE scans SET status = ?, current_phase = ? WHERE id = ?",
            (status, current_phase, scan_id)
        )
        await db.commit()


async def update_scan_results(scan_id: str, results_json: str, risk_score: int, status: str = "completed"):
    """Update scan results and risk score."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE scans SET results_json = ?, risk_score = ?, status = ? WHERE id = ?",
            (results_json, risk_score, status, scan_id)
        )
        await db.commit()
```

## backend\main.py

```py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from database import init_db
from api.scan import router as scan_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: initialize DB on startup."""
    await init_db()
    # Ensure reports directory exists
    os.makedirs(os.path.join(os.path.dirname(os.path.dirname(__file__)), "reports"), exist_ok=True)
    yield


app = FastAPI(
    title="VulneraX API",
    description="AI-Powered Security Assessment Platform",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(scan_router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "VulneraX API v1.0.0", "status": "running"}
```

## backend\models.py

```py
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class ScanRequest(BaseModel):
    target: str = Field(..., description="Domain or IP to scan", examples=["example.com"])


class PortResult(BaseModel):
    port: int
    state: str = "open"
    service: str = "unknown"
    banner: str = ""
    response_time_ms: float = 0.0


class DNSResult(BaseModel):
    ip_address: str = ""
    ipv6_address: str = ""
    country: str = ""
    registrar: str = ""
    nameservers: list[str] = []
    mx_records: list[str] = []
    txt_records: list[str] = []


class HeaderResult(BaseModel):
    name: str
    present: bool
    value: str = ""
    severity: Severity = Severity.INFO
    description: str = ""


class CookieResult(BaseModel):
    name: str
    value: str = ""
    http_only: bool = False
    secure: bool = False
    same_site: str = ""
    expires: str = ""
    issues: list[str] = []


class SSLResult(BaseModel):
    tls_version: str = ""
    issuer: str = ""
    subject: str = ""
    expires: str = ""
    days_remaining: int = 0
    serial_number: str = ""
    weak_cipher: bool = False
    cipher_name: str = ""
    issues: list[str] = []


class FingerprintResult(BaseModel):
    server: str = ""
    technologies: list[str] = []
    frameworks: list[str] = []
    cms: str = ""


class VulnerabilityResult(BaseModel):
    name: str
    category: str  # xss, sqli, traversal, redirect, sensitive_file
    severity: Severity
    url: str = ""
    payload: str = ""
    evidence: str = ""
    description: str = ""
    impact: str = ""  # How dangerous this vulnerability is in the real world
    exploit_scenario: str = ""  # Step-by-step how a hacker could exploit this
    recommendation: str = ""


class RiskScore(BaseModel):
    overall: int = 100  # 0-100, starts at 100 and decreases
    critical_count: int = 0
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0
    info_count: int = 0


class ScanResult(BaseModel):
    scan_id: str = ""
    target: str
    timestamp: str = ""
    status: str = "pending"  # pending, running, completed, error
    current_phase: str = ""
    dns: Optional[DNSResult] = None
    ports: list[PortResult] = []
    fingerprint: Optional[FingerprintResult] = None
    headers: list[HeaderResult] = []
    cookies: list[CookieResult] = []
    ssl: Optional[SSLResult] = None
    vulnerabilities: list[VulnerabilityResult] = []
    risk_score: Optional[RiskScore] = None
    error: str = ""


class ScanSummary(BaseModel):
    scan_id: str
    target: str
    timestamp: str
    status: str
    risk_score: int = 100


class ScanResponse(BaseModel):
    scan_id: str
    status: str
    message: str = ""
```

## backend\requirements.txt

```txt
fastapi
uvicorn[standard]
python-nmap
requests
beautifulsoup4
aiohttp
httpx
jinja2
fpdf2
python-whois
dnspython
aiosqlite
aiofiles
python-multipart
```

## backend\scanner\banner.py

```py
import asyncio
import socket


async def grab_banner(ip: str, port: int, timeout: float = 3.0) -> str:
    """Attempt to grab a banner from an open port."""
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(ip, port),
            timeout=timeout
        )

        # Some services send a banner immediately
        try:
            banner = await asyncio.wait_for(reader.read(1024), timeout=2.0)
            if banner:
                writer.close()
                await writer.wait_closed()
                return banner.decode("utf-8", errors="ignore").strip()
        except asyncio.TimeoutError:
            pass

        # For HTTP services, send a basic request
        if port in (80, 8080, 8000, 8008, 8888, 3000, 5000):
            writer.write(b"HEAD / HTTP/1.0\r\nHost: target\r\n\r\n")
            await writer.drain()
            try:
                response = await asyncio.wait_for(reader.read(1024), timeout=2.0)
                writer.close()
                await writer.wait_closed()
                # Extract Server header
                resp_text = response.decode("utf-8", errors="ignore")
                for line in resp_text.split("\r\n"):
                    if line.lower().startswith("server:"):
                        return line.split(":", 1)[1].strip()
                return resp_text.split("\r\n")[0] if resp_text else ""
            except asyncio.TimeoutError:
                pass

        writer.close()
        await writer.wait_closed()

    except (asyncio.TimeoutError, ConnectionRefusedError, OSError):
        pass

    return ""


async def grab_banners(ip: str, ports: list[int]) -> dict[int, str]:
    """Grab banners for multiple ports concurrently."""
    tasks = {port: grab_banner(ip, port) for port in ports}
    results = {}
    for port, task in tasks.items():
        banner = await task
        if banner:
            results[port] = banner
    return results
```

## backend\scanner\cookies.py

```py
import httpx
from models import CookieResult


async def analyze_cookies(target: str) -> list[CookieResult]:
    """Analyze cookies set by the target for security flags."""
    domain = target.replace("https://", "").replace("http://", "").strip("/").split("/")[0]
    results = []

    urls = [f"https://{domain}", f"http://{domain}"]

    for url in urls:
        try:
            async with httpx.AsyncClient(
                timeout=10,
                follow_redirects=True,
                verify=False
            ) as client:
                resp = await client.get(url)

                # Parse Set-Cookie headers
                set_cookie_headers = resp.headers.get_list("set-cookie") if hasattr(resp.headers, 'get_list') else []

                # Fallback: check raw headers
                if not set_cookie_headers:
                    for key, value in resp.headers.multi_items():
                        if key.lower() == "set-cookie":
                            set_cookie_headers.append(value)

                # Also check jar cookies
                for cookie in resp.cookies.jar:
                    issues = []
                    http_only = False
                    secure_flag = cookie.secure
                    same_site = ""
                    expires = ""

                    # Check the raw Set-Cookie header for this cookie
                    for raw in set_cookie_headers:
                        if cookie.name in raw:
                            raw_lower = raw.lower()
                            http_only = "httponly" in raw_lower
                            if "samesite=strict" in raw_lower:
                                same_site = "Strict"
                            elif "samesite=lax" in raw_lower:
                                same_site = "Lax"
                            elif "samesite=none" in raw_lower:
                                same_site = "None"
                            break

                    # Evaluate issues
                    if not http_only:
                        issues.append("Missing HttpOnly flag - cookie accessible via JavaScript")
                    if not secure_flag:
                        issues.append("Missing Secure flag - cookie sent over unencrypted connections")
                    if not same_site:
                        issues.append("Missing SameSite attribute - vulnerable to CSRF")
                    elif same_site == "None" and not secure_flag:
                        issues.append("SameSite=None without Secure flag")

                    if cookie.expires:
                        expires = str(cookie.expires)

                    results.append(CookieResult(
                        name=cookie.name,
                        value=cookie.value[:50] + "..." if len(cookie.value) > 50 else cookie.value,
                        http_only=http_only,
                        secure=secure_flag,
                        same_site=same_site,
                        expires=expires,
                        issues=issues,
                    ))

                break  # Success

        except Exception:
            continue

    return results
```

## backend\scanner\crawler.py

```py
import httpx
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import asyncio


async def crawl(target: str, max_depth: int = 2, max_pages: int = 50) -> dict:
    """
    Crawl a website to discover URLs, forms, and input parameters.
    Returns a dict with:
    - urls: list of discovered URLs
    - forms: list of dicts with {action, method, inputs}
    - params: list of URLs with query parameters
    """
    domain = target.replace("https://", "").replace("http://", "").strip("/").split("/")[0]

    base_urls = [f"https://{domain}", f"http://{domain}"]
    base_url = None

    # Find a working base URL
    async with httpx.AsyncClient(timeout=10, follow_redirects=True, verify=False) as client:
        for url in base_urls:
            try:
                resp = await client.get(url)
                if resp.status_code < 500:
                    base_url = str(resp.url).rstrip("/")
                    break
            except Exception:
                continue

    if not base_url:
        return {"urls": [], "forms": [], "params": []}

    visited = set()
    to_visit = [(base_url, 0)]
    all_urls = []
    all_forms = []
    all_params = []

    async with httpx.AsyncClient(timeout=10, follow_redirects=True, verify=False) as client:
        while to_visit and len(visited) < max_pages:
            url, depth = to_visit.pop(0)

            # Normalize URL
            parsed = urlparse(url)
            normalized = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"

            if normalized in visited:
                continue

            # Only crawl same domain
            if parsed.netloc and parsed.netloc != urlparse(base_url).netloc:
                continue

            visited.add(normalized)

            try:
                resp = await client.get(url)
                if "text/html" not in resp.headers.get("content-type", ""):
                    continue

                all_urls.append(url)

                # Track URLs with parameters
                if parsed.query:
                    all_params.append(url)

                soup = BeautifulSoup(resp.text, "html.parser")

                # Extract forms
                for form in soup.find_all("form"):
                    action = form.get("action", "")
                    method = form.get("method", "GET").upper()
                    full_action = urljoin(url, action) if action else url

                    inputs = []
                    for inp in form.find_all(["input", "textarea", "select"]):
                        input_name = inp.get("name", "")
                        input_type = inp.get("type", "text")
                        if input_name:
                            inputs.append({
                                "name": input_name,
                                "type": input_type,
                            })

                    if inputs:
                        all_forms.append({
                            "action": full_action,
                            "method": method,
                            "inputs": inputs,
                        })

                # Extract links for deeper crawling
                if depth < max_depth:
                    for link in soup.find_all("a", href=True):
                        href = link["href"]
                        full_url = urljoin(url, href)
                        link_parsed = urlparse(full_url)

                        # Skip non-HTTP, external, and fragment links
                        if link_parsed.scheme not in ("http", "https"):
                            continue
                        if link_parsed.netloc != urlparse(base_url).netloc:
                            continue
                        # Skip common non-page extensions
                        path = link_parsed.path.lower()
                        skip_exts = ('.jpg', '.jpeg', '.png', '.gif', '.svg', '.css', '.js',
                                     '.pdf', '.zip', '.tar', '.gz', '.mp4', '.mp3', '.ico')
                        if any(path.endswith(ext) for ext in skip_exts):
                            continue

                        to_visit.append((full_url, depth + 1))

            except Exception:
                continue

            # Small delay to be respectful
            await asyncio.sleep(0.2)

    return {
        "urls": list(set(all_urls)),
        "forms": all_forms,
        "params": list(set(all_params)),
    }
```

## backend\scanner\dns_lookup.py

```py
import dns.resolver
import socket
import asyncio
from models import DNSResult

try:
    import whois
    HAS_WHOIS = True
except ImportError:
    HAS_WHOIS = False


async def dns_lookup(target: str) -> DNSResult:
    """Perform DNS lookups and WHOIS for a target domain."""
    result = DNSResult()

    # Clean target
    domain = target.replace("https://", "").replace("http://", "").strip("/").split("/")[0]

    # A record (IPv4)
    try:
        answers = await asyncio.to_thread(dns.resolver.resolve, domain, "A")
        if answers:
            result.ip_address = str(answers[0])
    except Exception:
        # Fallback to socket
        try:
            ip = await asyncio.to_thread(socket.gethostbyname, domain)
            result.ip_address = ip
        except Exception:
            pass

    # AAAA record (IPv6)
    try:
        answers = await asyncio.to_thread(dns.resolver.resolve, domain, "AAAA")
        if answers:
            result.ipv6_address = str(answers[0])
    except Exception:
        pass

    # MX records
    try:
        answers = await asyncio.to_thread(dns.resolver.resolve, domain, "MX")
        result.mx_records = [str(r.exchange) for r in answers]
    except Exception:
        pass

    # NS records
    try:
        answers = await asyncio.to_thread(dns.resolver.resolve, domain, "NS")
        result.nameservers = [str(r) for r in answers]
    except Exception:
        pass

    # TXT records
    try:
        answers = await asyncio.to_thread(dns.resolver.resolve, domain, "TXT")
        result.txt_records = [str(r) for r in answers][:5]  # Limit to 5
    except Exception:
        pass

    # WHOIS
    if HAS_WHOIS:
        try:
            w = await asyncio.to_thread(whois.whois, domain)
            if w:
                result.registrar = str(w.registrar or "")
                if w.country:
                    result.country = str(w.country)
        except Exception:
            pass

    # Country fallback via IP geolocation header trick
    if not result.country and result.ip_address:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"http://ip-api.com/json/{result.ip_address}?fields=country,countryCode")
                if resp.status_code == 200:
                    data = resp.json()
                    result.country = data.get("country", "")
        except Exception:
            pass

    return result
```

## backend\scanner\fingerprint.py

```py
import httpx
from bs4 import BeautifulSoup
from models import FingerprintResult


# Technology signatures in headers and HTML
TECH_SIGNATURES = {
    "headers": {
        "X-Powered-By": {
            "PHP": "PHP",
            "Express": "Express",
            "ASP.NET": "ASP.NET",
            "Next.js": "Next.js",
        },
        "Server": {
            "Apache": "Apache",
            "nginx": "Nginx",
            "Microsoft-IIS": "IIS",
            "LiteSpeed": "LiteSpeed",
            "Cloudflare": "Cloudflare",
            "gunicorn": "Gunicorn",
            "Caddy": "Caddy",
        },
        "X-Generator": {
            "WordPress": "WordPress",
            "Drupal": "Drupal",
            "Joomla": "Joomla",
        },
    },
    "meta": {
        "generator": {
            "WordPress": "WordPress",
            "Drupal": "Drupal",
            "Joomla": "Joomla",
            "Hugo": "Hugo",
            "Jekyll": "Jekyll",
            "Ghost": "Ghost",
        }
    },
    "html_patterns": {
        "wp-content": "WordPress",
        "wp-includes": "WordPress",
        "/drupal": "Drupal",
        "joomla": "Joomla",
        "react": "React",
        "__next": "Next.js",
        "__nuxt": "Nuxt.js",
        "angular": "Angular",
        "vue": "Vue.js",
        "svelte": "Svelte",
        "laravel": "Laravel",
        "django": "Django",
        "flask": "Flask",
        "rails": "Ruby on Rails",
        "bootstrap": "Bootstrap",
        "tailwind": "Tailwind CSS",
        "jquery": "jQuery",
    }
}


async def fingerprint(target: str) -> FingerprintResult:
    """Detect web technologies used by the target."""
    result = FingerprintResult()
    domain = target.replace("https://", "").replace("http://", "").strip("/").split("/")[0]

    # Try HTTPS first, then HTTP
    urls = [f"https://{domain}", f"http://{domain}"]

    for url in urls:
        try:
            async with httpx.AsyncClient(
                timeout=10,
                follow_redirects=True,
                verify=False
            ) as client:
                resp = await client.get(url)

                # Check headers
                for header_name, signatures in TECH_SIGNATURES["headers"].items():
                    header_val = resp.headers.get(header_name, "")
                    if header_val:
                        for sig, tech in signatures.items():
                            if sig.lower() in header_val.lower():
                                if tech not in result.technologies:
                                    result.technologies.append(tech)

                # Extract server
                server = resp.headers.get("Server", "")
                if server:
                    result.server = server

                # Parse HTML
                html = resp.text
                soup = BeautifulSoup(html, "html.parser")

                # Check meta generator
                gen_meta = soup.find("meta", attrs={"name": "generator"})
                if gen_meta and gen_meta.get("content"):
                    gen_val = gen_meta["content"]
                    for sig, tech in TECH_SIGNATURES["meta"]["generator"].items():
                        if sig.lower() in gen_val.lower():
                            result.cms = tech
                            if tech not in result.technologies:
                                result.technologies.append(tech)

                # Check HTML patterns
                html_lower = html.lower()
                for pattern, tech in TECH_SIGNATURES["html_patterns"].items():
                    if pattern in html_lower and tech not in result.technologies:
                        result.technologies.append(tech)

                # Check script sources for frameworks
                for script in soup.find_all("script", src=True):
                    src = script["src"].lower()
                    for pattern, tech in TECH_SIGNATURES["html_patterns"].items():
                        if pattern in src and tech not in result.frameworks:
                            result.frameworks.append(tech)

                break  # Success, don't try the other URL

        except Exception:
            continue

    return result
```

## backend\scanner\headers.py

```py
import httpx
from models import HeaderResult, Severity

# Security headers to check with their descriptions and severity when missing
SECURITY_HEADERS = {
    "X-Frame-Options": {
        "description": "Prevents clickjacking attacks by controlling whether the page can be embedded in iframes.",
        "missing_severity": Severity.MEDIUM,
        "recommendation": "Set to 'DENY' or 'SAMEORIGIN'.",
    },
    "Content-Security-Policy": {
        "description": "Prevents XSS and data injection attacks by specifying allowed content sources.",
        "missing_severity": Severity.HIGH,
        "recommendation": "Define a strict CSP that limits script, style, and media sources.",
    },
    "Strict-Transport-Security": {
        "description": "Forces HTTPS connections, preventing protocol downgrade attacks.",
        "missing_severity": Severity.HIGH,
        "recommendation": "Set to 'max-age=31536000; includeSubDomains; preload'.",
    },
    "X-Content-Type-Options": {
        "description": "Prevents MIME-sniffing attacks by enforcing declared content types.",
        "missing_severity": Severity.MEDIUM,
        "recommendation": "Set to 'nosniff'.",
    },
    "Permissions-Policy": {
        "description": "Controls which browser features (camera, mic, geolocation) are allowed.",
        "missing_severity": Severity.LOW,
        "recommendation": "Restrict unnecessary features. Example: 'camera=(), microphone=()'.",
    },
    "Referrer-Policy": {
        "description": "Controls how much referrer information is shared with other sites.",
        "missing_severity": Severity.LOW,
        "recommendation": "Set to 'strict-origin-when-cross-origin' or 'no-referrer'.",
    },
}

# Weak values for headers
WEAK_VALUES = {
    "X-Frame-Options": ["ALLOWALL"],
    "Content-Security-Policy": ["unsafe-inline", "unsafe-eval", "*"],
    "Referrer-Policy": ["unsafe-url"],
}


async def check_headers(target: str) -> list[HeaderResult]:
    """Check security headers of the target."""
    domain = target.replace("https://", "").replace("http://", "").strip("/").split("/")[0]
    results = []

    urls = [f"https://{domain}", f"http://{domain}"]

    for url in urls:
        try:
            async with httpx.AsyncClient(
                timeout=10,
                follow_redirects=True,
                verify=False
            ) as client:
                resp = await client.get(url)

                for header_name, info in SECURITY_HEADERS.items():
                    value = resp.headers.get(header_name, "")

                    if value:
                        # Check for weak values
                        is_weak = False
                        if header_name in WEAK_VALUES:
                            for weak in WEAK_VALUES[header_name]:
                                if weak.lower() in value.lower():
                                    is_weak = True
                                    break

                        if is_weak:
                            severity = Severity.MEDIUM
                            desc = f"{info['description']} Current value is weak."
                        else:
                            severity = Severity.INFO
                            desc = info["description"]

                        results.append(HeaderResult(
                            name=header_name,
                            present=True,
                            value=value,
                            severity=severity,
                            description=desc,
                        ))
                    else:
                        results.append(HeaderResult(
                            name=header_name,
                            present=False,
                            value="",
                            severity=info["missing_severity"],
                            description=f"Missing: {info['description']} {info['recommendation']}",
                        ))

                break  # Success

        except Exception:
            continue

    # If all URLs failed
    if not results:
        for header_name, info in SECURITY_HEADERS.items():
            results.append(HeaderResult(
                name=header_name,
                present=False,
                value="",
                severity=Severity.INFO,
                description="Could not connect to target to check headers.",
            ))

    return results
```

## backend\scanner\port_scanner.py

```py
import asyncio
import socket
import time
from models import PortResult

# Try to import nmap
try:
    import nmap
    HAS_NMAP = True
except ImportError:
    HAS_NMAP = False

# Top 100 common ports
TOP_PORTS = [
    21, 22, 23, 25, 26, 53, 80, 81, 88, 110,
    111, 113, 119, 135, 139, 143, 161, 179, 199, 443,
    445, 465, 514, 515, 548, 554, 587, 631, 636, 646,
    873, 990, 993, 995, 1025, 1026, 1027, 1028, 1029, 1110,
    1433, 1434, 1521, 1720, 1723, 2000, 2001, 2049, 2121, 2717,
    3000, 3128, 3306, 3389, 3986, 4000, 4001, 4899, 5000, 5001,
    5003, 5009, 5050, 5051, 5060, 5101, 5190, 5357, 5432, 5631,
    5666, 5800, 5900, 5901, 6000, 6001, 6379, 6646, 7070, 8000,
    8008, 8009, 8080, 8081, 8443, 8888, 9000, 9090, 9100, 9200,
    9999, 10000, 10243, 11211, 27017, 27018, 28017, 32768, 49152, 49153,
]

COMMON_SERVICES = {
    21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP", 53: "DNS",
    80: "HTTP", 81: "HTTP-Alt", 88: "Kerberos", 110: "POP3", 111: "RPCBind",
    119: "NNTP", 135: "MSRPC", 139: "NetBIOS", 143: "IMAP", 161: "SNMP",
    179: "BGP", 443: "HTTPS", 445: "SMB", 465: "SMTPS", 514: "Syslog",
    548: "AFP", 554: "RTSP", 587: "SMTP-Sub", 631: "IPP", 636: "LDAPS",
    873: "Rsync", 990: "FTPS", 993: "IMAPS", 995: "POP3S",
    1433: "MSSQL", 1434: "MSSQL-M", 1521: "Oracle", 1723: "PPTP",
    2049: "NFS", 3000: "Node.js", 3128: "Squid", 3306: "MySQL",
    3389: "RDP", 5000: "Flask", 5432: "PostgreSQL", 5900: "VNC",
    6379: "Redis", 8000: "HTTP-Alt", 8008: "HTTP-Alt", 8080: "HTTP-Proxy",
    8443: "HTTPS-Alt", 8888: "HTTP-Alt", 9000: "PHP-FPM", 9090: "Prometheus",
    9200: "Elasticsearch", 10000: "Webmin", 11211: "Memcached",
    27017: "MongoDB", 27018: "MongoDB",
}


async def scan_port_socket(ip: str, port: int, timeout: float = 2.0) -> PortResult | None:
    """Scan a single port using raw socket connection."""
    start = time.monotonic()
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(ip, port),
            timeout=timeout
        )
        elapsed = (time.monotonic() - start) * 1000
        writer.close()
        await writer.wait_closed()

        service = COMMON_SERVICES.get(port, "unknown")
        return PortResult(
            port=port,
            state="open",
            service=service,
            response_time_ms=round(elapsed, 2)
        )
    except (asyncio.TimeoutError, ConnectionRefusedError, OSError):
        return None


async def scan_ports_socket(ip: str, ports: list[int] = None) -> list[PortResult]:
    """Scan multiple ports using async sockets (fallback when nmap unavailable)."""
    if ports is None:
        ports = TOP_PORTS

    # Scan in batches to avoid overwhelming the target
    batch_size = 20
    results = []

    for i in range(0, len(ports), batch_size):
        batch = ports[i:i + batch_size]
        tasks = [scan_port_socket(ip, port) for port in batch]
        batch_results = await asyncio.gather(*tasks)
        results.extend([r for r in batch_results if r is not None])

    return sorted(results, key=lambda r: r.port)


async def scan_ports_nmap(ip: str) -> list[PortResult]:
    """Scan ports using python-nmap for better service detection."""
    results = []
    try:
        nm = nmap.PortScanner()
        # Run nmap in a thread to avoid blocking
        await asyncio.to_thread(
            nm.scan, ip, arguments="-sV --top-ports 100 -T4 --open"
        )

        for host in nm.all_hosts():
            for proto in nm[host].all_protocols():
                ports = nm[host][proto].keys()
                for port in sorted(ports):
                    port_info = nm[host][proto][port]
                    if port_info["state"] == "open":
                        service = port_info.get("name", COMMON_SERVICES.get(port, "unknown"))
                        version = port_info.get("version", "")
                        product = port_info.get("product", "")
                        banner = f"{product} {version}".strip()

                        results.append(PortResult(
                            port=port,
                            state="open",
                            service=service,
                            banner=banner,
                        ))
    except Exception as e:
        # If nmap fails, fall back to socket scanning
        results = await scan_ports_socket(ip)

    return results


async def scan_ports(ip: str) -> list[PortResult]:
    """Main port scanning function. Uses nmap if available, falls back to sockets."""
    if HAS_NMAP:
        try:
            return await scan_ports_nmap(ip)
        except Exception:
            pass

    return await scan_ports_socket(ip)
```

## backend\scanner\redirect.py

```py
import httpx
from urllib.parse import urlencode, urlparse, parse_qs
from models import VulnerabilityResult, Severity

# Redirect test destination
REDIRECT_TARGET = "https://www.google.com"

# Common redirect parameter names
REDIRECT_PARAMS = ["next", "url", "redirect", "return", "returnTo", "return_url",
                   "goto", "dest", "destination", "redir", "redirect_uri",
                   "continue", "forward", "to", "target", "ref", "site"]


async def test_redirect(target: str, crawl_data: dict) -> list[VulnerabilityResult]:
    """Test for open redirect vulnerabilities."""
    domain = target.replace("https://", "").replace("http://", "").strip("/").split("/")[0]
    base_urls = [f"https://{domain}", f"http://{domain}"]
    results = []

    async with httpx.AsyncClient(
        timeout=10,
        follow_redirects=False,  # Important: don't follow redirects
        verify=False
    ) as client:
        # Test common redirect parameters on discovered URLs
        urls_to_test = crawl_data.get("urls", [])[:10]
        if not urls_to_test:
            urls_to_test = base_urls[:1]

        for url in urls_to_test:
            for param in REDIRECT_PARAMS:
                test_url = f"{url}?{param}={REDIRECT_TARGET}"

                try:
                    resp = await client.get(test_url)

                    # Check if redirect occurs
                    if resp.status_code in (301, 302, 303, 307, 308):
                        location = resp.headers.get("location", "")
                        if "google.com" in location:
                            results.append(VulnerabilityResult(
                                name=f"Open Redirect via '{param}' parameter",
                                category="redirect",
                                severity=Severity.HIGH,
                                url=test_url,
                                payload=REDIRECT_TARGET,
                                evidence=f"Server redirects to: {location}",
                                description="The application redirects users to arbitrary external URLs, enabling phishing attacks.",
                                recommendation="Validate redirect URLs against a whitelist of allowed destinations. Avoid using user input directly in redirect targets.",
                            ))
                            break  # One finding per URL is enough
                except Exception:
                    continue

        # Also test parameters found in crawled URLs
        for url in crawl_data.get("params", [])[:10]:
            parsed = urlparse(url)
            params = parse_qs(parsed.query)

            for param_name in params:
                if param_name.lower() in [p.lower() for p in REDIRECT_PARAMS]:
                    test_params = {k: v[0] if isinstance(v, list) else v for k, v in params.items()}
                    test_params[param_name] = REDIRECT_TARGET
                    test_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}?{urlencode(test_params)}"

                    try:
                        resp = await client.get(test_url)
                        if resp.status_code in (301, 302, 303, 307, 308):
                            location = resp.headers.get("location", "")
                            if "google.com" in location:
                                results.append(VulnerabilityResult(
                                    name=f"Open Redirect via '{param_name}' parameter",
                                    category="redirect",
                                    severity=Severity.HIGH,
                                    url=test_url,
                                    payload=REDIRECT_TARGET,
                                    evidence=f"Server redirects to: {location}",
                                    description="The application redirects users to arbitrary external URLs.",
                                    recommendation="Implement URL validation and whitelist allowed redirect targets.",
                                ))
                    except Exception:
                        continue

    return results
```

## backend\scanner\report.py

```py
import json
import os
import re
from datetime import datetime
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
```

## backend\scanner\risk_score.py

```py
from models import RiskScore, VulnerabilityResult, HeaderResult, CookieResult, SSLResult, Severity

# Severity weights for score calculation
SEVERITY_WEIGHTS = {
    Severity.CRITICAL: 15,
    Severity.HIGH: 8,
    Severity.MEDIUM: 4,
    Severity.LOW: 2,
    Severity.INFO: 0,
}


def calculate_risk_score(
    vulnerabilities: list[VulnerabilityResult],
    headers: list[HeaderResult],
    cookies: list[CookieResult],
    ssl: SSLResult | None,
) -> RiskScore:
    """Calculate an overall risk score from 0-100 based on all findings."""
    score = RiskScore()
    deductions = 0

    # Count vulnerabilities by severity
    for vuln in vulnerabilities:
        match vuln.severity:
            case Severity.CRITICAL:
                score.critical_count += 1
            case Severity.HIGH:
                score.high_count += 1
            case Severity.MEDIUM:
                score.medium_count += 1
            case Severity.LOW:
                score.low_count += 1
            case Severity.INFO:
                score.info_count += 1

        deductions += SEVERITY_WEIGHTS.get(vuln.severity, 0)

    # Headers contribute to score
    for header in headers:
        if not header.present:
            match header.severity:
                case Severity.CRITICAL:
                    score.critical_count += 1
                case Severity.HIGH:
                    score.high_count += 1
                case Severity.MEDIUM:
                    score.medium_count += 1
                case Severity.LOW:
                    score.low_count += 1

            deductions += SEVERITY_WEIGHTS.get(header.severity, 0)

    # Cookie issues
    for cookie in cookies:
        if cookie.issues:
            issue_count = len(cookie.issues)
            if issue_count >= 3:
                score.medium_count += 1
                deductions += SEVERITY_WEIGHTS[Severity.MEDIUM]
            elif issue_count >= 1:
                score.low_count += 1
                deductions += SEVERITY_WEIGHTS[Severity.LOW]

    # SSL issues
    if ssl:
        for issue in ssl.issues:
            issue_lower = issue.lower()
            if "expired" in issue_lower or "ssl" in issue_lower:
                score.critical_count += 1
                deductions += SEVERITY_WEIGHTS[Severity.CRITICAL]
            elif "weak cipher" in issue_lower or "deprecated" in issue_lower:
                score.high_count += 1
                deductions += SEVERITY_WEIGHTS[Severity.HIGH]
            elif "expires in" in issue_lower:
                score.medium_count += 1
                deductions += SEVERITY_WEIGHTS[Severity.MEDIUM]

    # Calculate overall score (100 = safe, 0 = very risky)
    score.overall = max(0, min(100, 100 - deductions))

    return score
```

## backend\scanner\sensitive_files.py

```py
import httpx
from models import VulnerabilityResult, Severity

# Sensitive files to check
SENSITIVE_FILES = [
    {
        "path": "robots.txt",
        "severity": Severity.INFO,
        "description": "Robots.txt file found. May reveal hidden paths.",
        "validate": lambda text: "user-agent" in text.lower() or "disallow" in text.lower(),
    },
    {
        "path": ".well-known/security.txt",
        "severity": Severity.INFO,
        "description": "Security.txt file found. Contains security contact information.",
        "validate": lambda text: "contact:" in text.lower(),
    },
    {
        "path": "security.txt",
        "severity": Severity.INFO,
        "description": "Security.txt file found.",
        "validate": lambda text: "contact:" in text.lower(),
    },
    {
        "path": ".env",
        "severity": Severity.CRITICAL,
        "description": "Environment file exposed! May contain API keys, database credentials, and secrets.",
        "validate": lambda text: "=" in text and any(kw in text.upper() for kw in ["KEY", "SECRET", "PASSWORD", "DATABASE", "DB_"]),
    },
    {
        "path": ".git/HEAD",
        "severity": Severity.HIGH,
        "description": "Git repository exposed! Source code and commit history may be accessible.",
        "validate": lambda text: text.strip().startswith("ref:") or len(text.strip()) == 40,
    },
    {
        "path": ".git/config",
        "severity": Severity.HIGH,
        "description": "Git config exposed! May reveal repository origin and contributor info.",
        "validate": lambda text: "[core]" in text or "[remote" in text,
    },
    {
        "path": "backup.zip",
        "severity": Severity.HIGH,
        "description": "Backup archive found! May contain source code and sensitive data.",
        "validate": lambda text: False,  # Check via content-type or status only
    },
    {
        "path": "config.php",
        "severity": Severity.HIGH,
        "description": "PHP config file exposed! May contain database credentials.",
        "validate": lambda text: "<?php" in text or "mysql" in text.lower(),
    },
    {
        "path": "phpinfo.php",
        "severity": Severity.MEDIUM,
        "description": "PHP info page exposed! Reveals server configuration details.",
        "validate": lambda text: "phpinfo()" in text.lower() or "php version" in text.lower(),
    },
    {
        "path": "wp-config.php",
        "severity": Severity.CRITICAL,
        "description": "WordPress config exposed! Contains database credentials and auth keys.",
        "validate": lambda text: "DB_NAME" in text or "DB_PASSWORD" in text,
    },
    {
        "path": ".htaccess",
        "severity": Severity.MEDIUM,
        "description": "Apache .htaccess file exposed! Reveals server configuration rules.",
        "validate": lambda text: "rewrite" in text.lower() or "deny" in text.lower() or "allow" in text.lower(),
    },
    {
        "path": "server-status",
        "severity": Severity.MEDIUM,
        "description": "Apache server-status page exposed! Shows active connections and server info.",
        "validate": lambda text: "apache" in text.lower() and "server" in text.lower(),
    },
    {
        "path": "web.config",
        "severity": Severity.MEDIUM,
        "description": "IIS web.config file exposed! Reveals server configuration.",
        "validate": lambda text: "<configuration>" in text.lower(),
    },
]


async def check_sensitive_files(target: str) -> list[VulnerabilityResult]:
    """Check for commonly exposed sensitive files."""
    domain = target.replace("https://", "").replace("http://", "").strip("/").split("/")[0]
    results = []

    base_urls = [f"https://{domain}", f"http://{domain}"]

    async with httpx.AsyncClient(timeout=8, follow_redirects=False, verify=False) as client:
        for base_url in base_urls:
            try:
                # Test connectivity first
                await client.get(base_url)
            except Exception:
                continue

            for file_info in SENSITIVE_FILES:
                url = f"{base_url}/{file_info['path']}"

                try:
                    resp = await client.get(url)

                    # Skip 404, 403, 500 etc.
                    if resp.status_code not in (200, 301):
                        continue

                    # For binary files, just check status
                    if file_info["path"].endswith(".zip"):
                        content_type = resp.headers.get("content-type", "")
                        if "application" in content_type and resp.status_code == 200:
                            results.append(VulnerabilityResult(
                                name=f"Sensitive File: {file_info['path']}",
                                category="sensitive_file",
                                severity=file_info["severity"],
                                url=url,
                                evidence=f"File accessible (HTTP {resp.status_code}), Content-Type: {content_type}",
                                description=file_info["description"],
                                recommendation="Remove or restrict access to sensitive files. Configure web server to deny access.",
                            ))
                        continue

                    # Validate content
                    text = resp.text
                    if file_info["validate"](text):
                        results.append(VulnerabilityResult(
                            name=f"Sensitive File: {file_info['path']}",
                            category="sensitive_file",
                            severity=file_info["severity"],
                            url=url,
                            evidence=f"File accessible (HTTP {resp.status_code}) with valid content",
                            description=file_info["description"],
                            recommendation="Remove or restrict access to this file. Configure web server deny rules.",
                        ))

                except Exception:
                    continue

            break  # Only test first working base URL

    return results
```

## backend\scanner\sqli.py

```py
import httpx
from urllib.parse import urlencode, urlparse, parse_qs
from models import VulnerabilityResult, Severity

# SQL injection test payloads
SQLI_PAYLOADS = [
    "'",
    '"',
    "' OR '1'='1",
    "1 OR 1=1",
    "admin'--",
    "' UNION SELECT NULL--",
    "1; DROP TABLE test--",
]

# Common SQL error messages indicating a vulnerability
SQL_ERRORS = {
    "mysql": [
        "you have an error in your sql syntax",
        "warning: mysql",
        "unclosed quotation mark",
        "mysql_fetch",
        "mysql_num_rows",
        "mysql_query",
    ],
    "postgresql": [
        "pg_query",
        "pg_exec",
        "postgresql",
        "unterminated quoted string",
        "syntax error at or near",
    ],
    "mssql": [
        "microsoft sql server",
        "sql server",
        "unclosed quotation mark after the character string",
        "incorrect syntax near",
    ],
    "sqlite": [
        "sqlite3.operationalerror",
        "sqlite_error",
        "unrecognized token",
        "near \"",
    ],
    "oracle": [
        "ora-01756",
        "ora-00933",
        "oracle error",
        "quoted string not properly terminated",
    ],
    "generic": [
        "sql syntax",
        "sql error",
        "syntax error",
        "database error",
        "query failed",
        "odbc drivers",
        "invalid query",
    ],
}


def detect_sql_error(response_text: str) -> str | None:
    """Check if the response contains SQL error messages."""
    text_lower = response_text.lower()
    for db_type, errors in SQL_ERRORS.items():
        for error in errors:
            if error in text_lower:
                return db_type
    return None


async def test_sqli(target: str, crawl_data: dict) -> list[VulnerabilityResult]:
    """Test for SQL injection vulnerabilities in forms and URL parameters."""
    domain = target.replace("https://", "").replace("http://", "").strip("/").split("/")[0]
    results = []

    async with httpx.AsyncClient(timeout=10, follow_redirects=True, verify=False) as client:
        # Test URL parameters
        for url in crawl_data.get("params", [])[:10]:
            parsed = urlparse(url)
            params = parse_qs(parsed.query)

            for param_name in params:
                for payload in SQLI_PAYLOADS[:4]:
                    test_params = {k: v[0] if isinstance(v, list) else v for k, v in params.items()}
                    test_params[param_name] = payload
                    test_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}?{urlencode(test_params)}"

                    try:
                        resp = await client.get(test_url)
                        db_type = detect_sql_error(resp.text)

                        if db_type:
                            results.append(VulnerabilityResult(
                                name=f"SQL Injection in parameter '{param_name}'",
                                category="sqli",
                                severity=Severity.CRITICAL,
                                url=test_url,
                                payload=payload,
                                evidence=f"SQL error from {db_type} database detected in response",
                                description="The application includes user input in SQL queries without proper sanitization.",
                                recommendation="Use parameterized queries/prepared statements. Never concatenate user input into SQL.",
                            ))
                            break  # One finding per parameter
                    except Exception:
                        continue

        # Test forms
        for form in crawl_data.get("forms", [])[:5]:
            action = form["action"]
            method = form["method"]

            for inp in form["inputs"]:
                if inp["type"] in ("hidden", "submit", "button", "file", "image"):
                    continue

                for payload in SQLI_PAYLOADS[:3]:
                    form_data = {}
                    for fi in form["inputs"]:
                        if fi["name"] == inp["name"]:
                            form_data[fi["name"]] = payload
                        else:
                            form_data[fi["name"]] = "test"

                    try:
                        if method == "POST":
                            resp = await client.post(action, data=form_data)
                        else:
                            resp = await client.get(action, params=form_data)

                        db_type = detect_sql_error(resp.text)
                        if db_type:
                            results.append(VulnerabilityResult(
                                name=f"SQL Injection in form input '{inp['name']}'",
                                category="sqli",
                                severity=Severity.CRITICAL,
                                url=action,
                                payload=payload,
                                evidence=f"SQL error from {db_type} database detected via {method} form",
                                description="The application constructs SQL queries with unsanitized form input.",
                                recommendation="Use parameterized queries. Validate and sanitize all user input.",
                            ))
                            break
                    except Exception:
                        continue

    return results
```

## backend\scanner\ssl_scan.py

```py
import ssl
import socket
import asyncio
from datetime import datetime
from models import SSLResult


async def scan_ssl(target: str) -> SSLResult:
    """Scan SSL/TLS configuration of the target."""
    domain = target.replace("https://", "").replace("http://", "").strip("/").split("/")[0]
    result = SSLResult()

    try:
        # Create SSL context
        context = ssl.create_default_context()

        def _do_ssl_scan():
            """Synchronous SSL scan to run in thread."""
            conn = context.wrap_socket(
                socket.socket(socket.AF_INET, socket.SOCK_STREAM),
                server_hostname=domain
            )
            conn.settimeout(10)
            conn.connect((domain, 443))

            # Get certificate info
            cert = conn.getpeercert()
            cipher = conn.cipher()
            tls_version = conn.version()

            conn.close()
            return cert, cipher, tls_version

        cert, cipher, tls_version = await asyncio.to_thread(_do_ssl_scan)

        # TLS version
        result.tls_version = tls_version or ""

        # Cipher info
        if cipher:
            result.cipher_name = cipher[0]
            # Check for weak ciphers
            weak_ciphers = ["RC4", "DES", "3DES", "MD5", "NULL", "EXPORT", "anon"]
            result.weak_cipher = any(w.lower() in cipher[0].lower() for w in weak_ciphers)

        # Certificate details
        if cert:
            # Issuer
            issuer_parts = []
            for item in cert.get("issuer", []):
                for key, value in item:
                    if key in ("organizationName", "commonName"):
                        issuer_parts.append(value)
            result.issuer = ", ".join(issuer_parts) if issuer_parts else ""

            # Subject
            subject_parts = []
            for item in cert.get("subject", []):
                for key, value in item:
                    if key == "commonName":
                        subject_parts.append(value)
            result.subject = ", ".join(subject_parts) if subject_parts else ""

            # Serial number
            result.serial_number = cert.get("serialNumber", "")

            # Expiry
            not_after = cert.get("notAfter", "")
            if not_after:
                result.expires = not_after
                try:
                    expiry_date = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z")
                    result.days_remaining = (expiry_date - datetime.utcnow()).days
                except ValueError:
                    pass

            # Issues
            if result.days_remaining <= 0:
                result.issues.append("Certificate has expired!")
            elif result.days_remaining <= 30:
                result.issues.append(f"Certificate expires in {result.days_remaining} days")

            if result.weak_cipher:
                result.issues.append(f"Weak cipher detected: {result.cipher_name}")

            if tls_version and "TLSv1.0" in tls_version:
                result.issues.append("TLS 1.0 is deprecated and insecure")
            if tls_version and "TLSv1.1" in tls_version:
                result.issues.append("TLS 1.1 is deprecated and insecure")
            if tls_version and "SSLv" in tls_version:
                result.issues.append("SSL is deprecated and insecure")

    except ssl.SSLError as e:
        result.issues.append(f"SSL Error: {str(e)}")
    except socket.timeout:
        result.issues.append("Connection timed out - port 443 may not be open")
    except ConnectionRefusedError:
        result.issues.append("Connection refused - HTTPS not available")
    except Exception as e:
        result.issues.append(f"Could not perform SSL scan: {str(e)}")

    return result
```

## backend\scanner\traversal.py

```py
import httpx
from urllib.parse import urlencode, urlparse, parse_qs
from models import VulnerabilityResult, Severity

# Path traversal payloads
TRAVERSAL_PAYLOADS = [
    "../../etc/passwd",
    "..\\..\\windows\\win.ini",
    "....//....//etc/passwd",
    "..%2f..%2fetc%2fpasswd",
    "..%5c..%5cwindows%5cwin.ini",
    "....//....//....//etc/passwd",
]

# Known file content signatures
FILE_SIGNATURES = {
    "etc/passwd": ["root:", "/bin/bash", "/bin/sh", "nobody:"],
    "win.ini": ["[fonts]", "[extensions]", "[mci extensions]"],
}


def check_traversal_success(response_text: str) -> str | None:
    """Check if the response contains known file contents."""
    text_lower = response_text.lower()
    for file_type, signatures in FILE_SIGNATURES.items():
        matches = sum(1 for sig in signatures if sig.lower() in text_lower)
        if matches >= 2:  # Require at least 2 matches to reduce false positives
            return file_type
    return None


async def test_traversal(target: str, crawl_data: dict) -> list[VulnerabilityResult]:
    """Test for directory traversal vulnerabilities."""
    domain = target.replace("https://", "").replace("http://", "").strip("/").split("/")[0]
    results = []

    async with httpx.AsyncClient(timeout=10, follow_redirects=True, verify=False) as client:
        # Test URL parameters
        for url in crawl_data.get("params", [])[:10]:
            parsed = urlparse(url)
            params = parse_qs(parsed.query)

            for param_name in params:
                # Focus on parameters likely to handle files
                name_lower = param_name.lower()
                if not any(kw in name_lower for kw in
                           ["file", "path", "page", "doc", "dir", "folder",
                            "include", "load", "read", "template", "view"]):
                    continue

                for payload in TRAVERSAL_PAYLOADS[:3]:
                    test_params = {k: v[0] if isinstance(v, list) else v for k, v in params.items()}
                    test_params[param_name] = payload
                    test_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}?{urlencode(test_params)}"

                    try:
                        resp = await client.get(test_url)
                        file_type = check_traversal_success(resp.text)

                        if file_type:
                            results.append(VulnerabilityResult(
                                name=f"Directory Traversal in parameter '{param_name}'",
                                category="traversal",
                                severity=Severity.CRITICAL,
                                url=test_url,
                                payload=payload,
                                evidence=f"Contents of {file_type} found in response",
                                description="The application allows reading arbitrary files from the server filesystem.",
                                recommendation="Validate and sanitize file paths. Use a whitelist of allowed files. Avoid passing file paths in user input.",
                            ))
                            break
                    except Exception:
                        continue

    return results
```

## backend\scanner\xss.py

```py
import httpx
from urllib.parse import urlencode, urlparse, parse_qs, urljoin
from models import VulnerabilityResult, Severity

# Basic reflected XSS test payloads
XSS_PAYLOADS = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '"><svg onload=alert(1)>',
    "'-alert(1)-'",
    '<body onload=alert(1)>',
]


async def test_xss(target: str, crawl_data: dict) -> list[VulnerabilityResult]:
    """Test for reflected XSS vulnerabilities in forms and URL parameters."""
    domain = target.replace("https://", "").replace("http://", "").strip("/").split("/")[0]
    results = []

    async with httpx.AsyncClient(timeout=10, follow_redirects=True, verify=False) as client:
        # Test URL parameters
        for url in crawl_data.get("params", [])[:10]:
            parsed = urlparse(url)
            params = parse_qs(parsed.query)

            for param_name in params:
                for payload in XSS_PAYLOADS[:3]:  # Limit payloads per param
                    test_params = {k: v[0] if isinstance(v, list) else v for k, v in params.items()}
                    test_params[param_name] = payload
                    test_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}?{urlencode(test_params)}"

                    try:
                        resp = await client.get(test_url)
                        if payload in resp.text:
                            results.append(VulnerabilityResult(
                                name=f"Reflected XSS in parameter '{param_name}'",
                                category="xss",
                                severity=Severity.CRITICAL,
                                url=test_url,
                                payload=payload,
                                evidence=f"Payload reflected unencoded in response body",
                                description="The application reflects user input without proper encoding, allowing script injection.",
                                impact="An attacker can execute arbitrary JavaScript in a victim's browser, stealing session cookies, credentials, and personal data. This can lead to full account takeover, identity theft, or malware distribution to every user who clicks a malicious link.",
                                exploit_scenario="1. Attacker crafts a URL containing malicious JavaScript in the vulnerable parameter. 2. Victim clicks the link (sent via email, social media, or embedded in another site). 3. The server reflects the script back in the page without sanitization. 4. The victim's browser executes the script, sending their session cookie to the attacker's server. 5. Attacker uses the stolen cookie to impersonate the victim and access their account.",
                                recommendation="Implement output encoding/escaping for all user input. Deploy a strict Content-Security-Policy header. Use HttpOnly cookies to prevent JavaScript access to session tokens.",
                            ))
                            break  # One finding per parameter is enough
                    except Exception:
                        continue

        # Test forms
        for form in crawl_data.get("forms", [])[:5]:
            action = form["action"]
            method = form["method"]

            for inp in form["inputs"]:
                if inp["type"] in ("hidden", "submit", "button", "file", "image"):
                    continue

                for payload in XSS_PAYLOADS[:2]:
                    form_data = {}
                    for fi in form["inputs"]:
                        if fi["name"] == inp["name"]:
                            form_data[fi["name"]] = payload
                        else:
                            form_data[fi["name"]] = "test"

                    try:
                        if method == "POST":
                            resp = await client.post(action, data=form_data)
                        else:
                            resp = await client.get(action, params=form_data)

                        if payload in resp.text:
                            results.append(VulnerabilityResult(
                                name=f"Reflected XSS in form input '{inp['name']}'",
                                category="xss",
                                severity=Severity.CRITICAL,
                                url=action,
                                payload=payload,
                                evidence=f"Payload reflected unencoded via {method} form submission",
                                description="The application reflects form input without proper encoding.",
                                impact="An attacker can inject malicious scripts through form submissions, potentially hijacking user sessions, defacing the website, or redirecting users to phishing pages. Since forms often handle sensitive operations, this could compromise financial transactions or personal data.",
                                exploit_scenario="1. Attacker identifies the vulnerable form input field. 2. They submit the form with a JavaScript payload instead of normal data. 3. The server includes the unescaped payload in the response page. 4. Any user viewing the affected page has their browser execute the malicious script. 5. The script can steal credentials, install keyloggers, or perform actions on behalf of the victim.",
                                recommendation="Implement server-side output encoding and CSP headers. Validate and sanitize all form inputs both client-side and server-side. Use frameworks that auto-escape output by default.",
                            ))
                            break
                    except Exception:
                        continue

    return results
```

## backend\scanner\__init__.py

```py
# VulneraX Scanner Package
```

## backend\templates\report.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VulneraX Report - {{ scan.target }}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
            color: #e2e8f0;
            min-height: 100vh;
            padding: 40px 20px;
        }
        .container { max-width: 960px; margin: 0 auto; }
        .header {
            text-align: center;
            margin-bottom: 40px;
            padding: 30px;
            background: rgba(30, 41, 59, 0.8);
            border-radius: 16px;
            border: 1px solid rgba(56, 189, 248, 0.2);
        }
        .header h1 { color: #38bdf8; font-size: 32px; margin-bottom: 10px; }
        .header .meta { color: #94a3b8; font-size: 14px; }
        .section {
            background: rgba(30, 41, 59, 0.6);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 20px;
            border: 1px solid rgba(51, 65, 85, 0.5);
        }
        .section h2 { color: #7dd3fc; font-size: 20px; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #334155; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #334155; color: #7dd3fc; text-align: left; padding: 10px 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
        td { padding: 10px 12px; border-bottom: 1px solid #1e293b; font-size: 14px; }
        tr:hover td { background: rgba(51, 65, 85, 0.3); }
        .score-container { text-align: center; padding: 20px; }
        .score-value { font-size: 72px; font-weight: 800; }
        .score-label { font-size: 14px; color: #94a3b8; margin-top: 5px; }
        .severity-counts { display: flex; justify-content: center; gap: 20px; margin-top: 15px; flex-wrap: wrap; }
        .severity-item { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; }
        .sev-critical { background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); }
        .sev-high { background: rgba(249, 115, 22, 0.2); color: #fdba74; border: 1px solid rgba(249, 115, 22, 0.3); }
        .sev-medium { background: rgba(234, 179, 8, 0.2); color: #fde047; border: 1px solid rgba(234, 179, 8, 0.3); }
        .sev-low { background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3); }
        .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; color: white; text-transform: uppercase; }
        .badge-present { background: #22c55e; }
        .badge-missing { background: #ef4444; }
        .badge-weak { background: #eab308; }
        .vuln-card { background: #0f172a; border-radius: 8px; padding: 16px; margin-bottom: 12px; border-left: 4px solid; }
        .vuln-card.critical { border-left-color: #ef4444; }
        .vuln-card.high { border-left-color: #f97316; }
        .vuln-card.medium { border-left-color: #eab308; }
        .vuln-card.low { border-left-color: #3b82f6; }
        .vuln-card.info { border-left-color: #6b7280; }
        .vuln-title { font-weight: 700; font-size: 15px; margin-bottom: 6px; }
        .vuln-detail { font-size: 13px; color: #94a3b8; margin: 3px 0; }
        .vuln-recommendation { color: #7dd3fc; font-size: 13px; margin-top: 8px; }
        .footer { text-align: center; padding: 30px; color: #475569; font-size: 13px; }
        .check-yes { color: #22c55e; }
        .check-no { color: #ef4444; }
        @media (max-width: 768px) { body { padding: 15px; } .section { padding: 16px; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔒 VulneraX Security Report</h1>
            <p class="meta">Target: <strong>{{ scan.target }}</strong> | Scan ID: {{ scan.scan_id }} | Generated: {{ generated_at }}</p>
        </div>

        {% if scan.risk_score %}
        <div class="section">
            <h2>Risk Score</h2>
            <div class="score-container">
                {% set score = scan.risk_score.overall %}
                {% if score >= 80 %}
                    <div class="score-value" style="color: #22c55e;">{{ score }}</div>
                {% elif score >= 50 %}
                    <div class="score-value" style="color: #eab308;">{{ score }}</div>
                {% else %}
                    <div class="score-value" style="color: #ef4444;">{{ score }}</div>
                {% endif %}
                <div class="score-label">out of 100</div>
                <div class="severity-counts">
                    <span class="severity-item sev-critical">Critical: {{ scan.risk_score.critical_count }}</span>
                    <span class="severity-item sev-high">High: {{ scan.risk_score.high_count }}</span>
                    <span class="severity-item sev-medium">Medium: {{ scan.risk_score.medium_count }}</span>
                    <span class="severity-item sev-low">Low: {{ scan.risk_score.low_count }}</span>
                </div>
            </div>
        </div>
        {% endif %}

        {% if scan.dns %}
        <div class="section">
            <h2>Target Information</h2>
            <table>
                <tr><td><strong>IP Address</strong></td><td>{{ scan.dns.ip_address }}</td></tr>
                {% if scan.dns.ipv6_address %}<tr><td><strong>IPv6</strong></td><td>{{ scan.dns.ipv6_address }}</td></tr>{% endif %}
                {% if scan.dns.country %}<tr><td><strong>Country</strong></td><td>{{ scan.dns.country }}</td></tr>{% endif %}
                {% if scan.dns.registrar %}<tr><td><strong>Registrar</strong></td><td>{{ scan.dns.registrar }}</td></tr>{% endif %}
                {% if scan.dns.nameservers %}<tr><td><strong>Nameservers</strong></td><td>{{ scan.dns.nameservers | join(', ') }}</td></tr>{% endif %}
            </table>
        </div>
        {% endif %}

        {% if scan.fingerprint %}
        <div class="section">
            <h2>Server & Technologies</h2>
            <table>
                {% if scan.fingerprint.server %}<tr><td><strong>Server</strong></td><td>{{ scan.fingerprint.server }}</td></tr>{% endif %}
                {% if scan.fingerprint.technologies %}<tr><td><strong>Technologies</strong></td><td>{{ scan.fingerprint.technologies | join(', ') }}</td></tr>{% endif %}
                {% if scan.fingerprint.cms %}<tr><td><strong>CMS</strong></td><td>{{ scan.fingerprint.cms }}</td></tr>{% endif %}
            </table>
        </div>
        {% endif %}

        {% if scan.ports %}
        <div class="section">
            <h2>Open Ports ({{ scan.ports | length }})</h2>
            <table>
                <tr><th>Port</th><th>Service</th><th>State</th><th>Banner</th></tr>
                {% for port in scan.ports %}
                <tr>
                    <td><strong>{{ port.port }}</strong></td>
                    <td>{{ port.service }}</td>
                    <td>{{ port.state }}</td>
                    <td>{{ port.banner or '-' }}</td>
                </tr>
                {% endfor %}
            </table>
        </div>
        {% endif %}

        {% if scan.headers %}
        <div class="section">
            <h2>Security Headers</h2>
            <table>
                <tr><th>Header</th><th>Status</th><th>Value</th></tr>
                {% for header in scan.headers %}
                <tr>
                    <td><strong>{{ header.name }}</strong></td>
                    <td>
                        {% if header.present %}
                            <span class="badge badge-present">Present</span>
                        {% else %}
                            <span class="badge badge-missing">Missing</span>
                        {% endif %}
                    </td>
                    <td>{{ header.value or '-' }}</td>
                </tr>
                {% endfor %}
            </table>
        </div>
        {% endif %}

        {% if scan.cookies %}
        <div class="section">
            <h2>Cookie Analysis</h2>
            <table>
                <tr><th>Name</th><th>HttpOnly</th><th>Secure</th><th>SameSite</th><th>Issues</th></tr>
                {% for cookie in scan.cookies %}
                <tr>
                    <td><strong>{{ cookie.name }}</strong></td>
                    <td class="{{ 'check-yes' if cookie.http_only else 'check-no' }}">{{ '✓' if cookie.http_only else '✗' }}</td>
                    <td class="{{ 'check-yes' if cookie.secure else 'check-no' }}">{{ '✓' if cookie.secure else '✗' }}</td>
                    <td>{{ cookie.same_site or 'Not set' }}</td>
                    <td>{{ cookie.issues | length }} issue(s)</td>
                </tr>
                {% endfor %}
            </table>
        </div>
        {% endif %}

        {% if scan.ssl and scan.ssl.tls_version %}
        <div class="section">
            <h2>SSL/TLS Certificate</h2>
            <table>
                <tr><td><strong>TLS Version</strong></td><td>{{ scan.ssl.tls_version }}</td></tr>
                <tr><td><strong>Issuer</strong></td><td>{{ scan.ssl.issuer }}</td></tr>
                <tr><td><strong>Subject</strong></td><td>{{ scan.ssl.subject }}</td></tr>
                <tr><td><strong>Expires</strong></td><td>{{ scan.ssl.expires }}</td></tr>
                <tr><td><strong>Days Remaining</strong></td><td>{{ scan.ssl.days_remaining }}</td></tr>
                <tr><td><strong>Cipher</strong></td><td>{{ scan.ssl.cipher_name }}</td></tr>
                <tr><td><strong>Weak Cipher</strong></td><td class="{{ 'check-no' if scan.ssl.weak_cipher else 'check-yes' }}">{{ 'Yes ⚠️' if scan.ssl.weak_cipher else 'No ✓' }}</td></tr>
            </table>
            {% if scan.ssl.issues %}
            <h3 style="margin-top: 15px; color: #fca5a5;">Issues</h3>
            <ul style="margin-top: 8px; padding-left: 20px;">
                {% for issue in scan.ssl.issues %}
                <li style="margin: 4px 0; color: #fca5a5;">{{ issue }}</li>
                {% endfor %}
            </ul>
            {% endif %}
        </div>
        {% endif %}

        {% if scan.vulnerabilities %}
        <div class="section">
            <h2>Vulnerability Findings ({{ scan.vulnerabilities | length }})</h2>
            {% for vuln in scan.vulnerabilities %}
            <div class="vuln-card {{ vuln.severity.value }}">
                <div class="vuln-title">
                    {{ vuln.name }}
                    <span class="badge" style="background: {{ {'critical':'#ef4444','high':'#f97316','medium':'#eab308','low':'#3b82f6','info':'#6b7280'}[vuln.severity.value] }}">
                        {{ vuln.severity.value | upper }}
                    </span>
                </div>
                <div class="vuln-detail">Category: {{ vuln.category }}</div>
                {% if vuln.url %}<div class="vuln-detail">URL: {{ vuln.url }}</div>{% endif %}
                {% if vuln.evidence %}<div class="vuln-detail">Evidence: {{ vuln.evidence }}</div>{% endif %}
                {% if vuln.description %}<div class="vuln-detail">{{ vuln.description }}</div>{% endif %}
                {% if vuln.recommendation %}<div class="vuln-recommendation">💡 {{ vuln.recommendation }}</div>{% endif %}
            </div>
            {% endfor %}
        </div>
        {% endif %}

        <div class="footer">
            <p>Generated by VulneraX Security Assessment Platform</p>
            <p>This report is for authorized security assessment purposes only.</p>
        </div>
    </div>
</body>
</html>
```

## frontend\index.html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="VulneraX — AI-Powered Security Assessment Platform. Scan targets for DNS, ports, headers, SSL, and vulnerabilities." />
    <meta name="theme-color" content="#0a0e1a" />
    <title>VulneraX — Security Assessment Platform</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

## frontend\package.json

```json
{
  "name": "frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "oxlint",
    "preview": "vite preview"
  },
  "dependencies": {
    "@gsap/react": "^2.1.2",
    "@radix-ui/react-dropdown-menu": "^2.1.21",
    "@radix-ui/react-slot": "^1.3.0",
    "@radix-ui/react-tooltip": "^1.2.13",
    "@tailwindcss/vite": "^4.3.3",
    "axios": "^1.18.1",
    "chart.js": "^4.5.1",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "framer-motion": "^12.42.2",
    "gsap": "^3.15.0",
    "lucide-react": "^1.25.0",
    "react": "^19.2.7",
    "react-chartjs-2": "^5.3.1",
    "react-dom": "^19.2.7",
    "react-router-dom": "^7.18.1",
    "tailwind-merge": "^3.6.0",
    "tailwindcss": "^4.3.3"
  },
  "devDependencies": {
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.3",
    "oxlint": "^1.71.0",
    "vite": "^8.1.1"
  }
}
```

## frontend\README.md

```md
# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
```

## frontend\src\api\client.js

```js
import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  timeout: 300000, // 5 minutes for long scans
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
client.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error)
);

// Response interceptor
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.detail || error.message || 'An error occurred';
    console.error('[VulneraX API]', message);
    return Promise.reject(error);
  }
);

export const startScan = (target) => client.post('/scan', { target });
export const getScanStatus = (scanId) => client.get(`/scan/${scanId}/status`);
export const getScanResults = (scanId) => client.get(`/scan/${scanId}/results`);
export const getScanHistory = () => client.get('/history');
export const getReport = (scanId, format) =>
  client.get(`/report/${scanId}?format=${format}`, {
    responseType: format === 'json' ? 'json' : 'blob',
  });

export default client;
```

## frontend\src\App.jsx

```jsx
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Websites from './pages/Websites';

import { ThemeProvider } from './components/ThemeProvider';
import Header from './components/Header';
import CustomCursor from './components/CustomCursor';

function AnimatedRoutes() {
  const location = useLocation();
  
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className="w-full h-full flex flex-col"
      >
        <Routes location={location}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/websites" element={<Websites />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vulnerax-theme">
      <BrowserRouter>
        <CustomCursor />
        <div className="flex h-screen w-screen overflow-hidden bg-background">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <Header />
            <main className="flex-1 overflow-auto flex flex-col relative">
              <AnimatedRoutes />
            </main>
          </div>
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}
```

## frontend\src\components\CookiePanel.jsx

```jsx
import { Cookie, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

export default function CookiePanel({ cookies }) {
  if (!cookies || cookies.length === 0) {
    return (
      <div className="glass-panel p-6 sm:p-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-secondary/10">
            <Cookie className="h-5 w-5 text-accent-secondary" />
          </div>
          <h3 className="font-semibold text-text-primary">Cookies</h3>
        </div>
        <p className="text-sm text-text-muted">No cookies detected.</p>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 sm:p-8 animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-secondary/10">
          <Cookie className="h-5 w-5 text-accent-secondary" />
        </div>
        <div>
          <h3 className="font-semibold text-text-primary">Cookies</h3>
          <p className="text-xs text-text-muted">{cookies.length} cookie{cookies.length !== 1 ? 's' : ''} found</p>
        </div>
      </div>

      <div className="space-y-3">
        {cookies.map((cookie, i) => (
          <div key={`${cookie.name}-${i}`} className="rounded-xl bg-bg-card/60 border border-border-default/50 p-4 hover:border-border-glow transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-sm font-semibold text-accent-primary">{cookie.name}</span>
              {cookie.issues?.length > 0 && (
                <span className="text-[10px] font-medium text-severity-medium bg-severity-medium/10 px-2 py-0.5 rounded-full">
                  {cookie.issues.length} issue{cookie.issues.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Flags */}
            <div className="flex flex-wrap gap-2 mb-2">
              {[
                { label: 'HttpOnly', value: cookie.http_only },
                { label: 'Secure', value: cookie.secure },
                { label: 'SameSite', value: !!cookie.same_site, detail: cookie.same_site },
              ].map((flag) => (
                <span
                  key={flag.label}
                  className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md ${
                    flag.value
                      ? 'bg-accent-emerald/10 text-accent-emerald'
                      : 'bg-severity-critical/10 text-severity-critical'
                  }`}
                >
                  {flag.value ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <XCircle className="h-3 w-3" />
                  )}
                  {flag.label}
                  {flag.detail && `: ${flag.detail}`}
                </span>
              ))}
            </div>

            {/* Issues */}
            {cookie.issues?.length > 0 && (
              <div className="mt-2 space-y-1">
                {cookie.issues.map((issue, j) => (
                  <p key={j} className="text-xs text-severity-medium flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {issue}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

## frontend\src\components\CustomCursor.jsx

```jsx
import { useEffect, useState, useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { Navigation } from 'lucide-react';

export default function CustomCursor() {
  const [isHovering, setIsHovering] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Use MotionValues to avoid React re-renders on every mouse move
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const cursorRotation = useMotionValue(0);
  const lastPos = useRef({ x: -100, y: -100 });

  // Springs for the pointer position and rotation
  const pointerX = useSpring(cursorX, { stiffness: 600, damping: 30, mass: 0.5 });
  const pointerY = useSpring(cursorY, { stiffness: 600, damping: 30, mass: 0.5 });
  const pointerRotation = useSpring(cursorRotation, { stiffness: 400, damping: 30, mass: 0.5 });

  useEffect(() => {
    const updateMousePosition = (e) => {
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      
      // Only update rotation if moved significantly to avoid jitter
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        // Calculate angle of movement
        let targetAngle = Math.atan2(dy, dx) * (180 / Math.PI) + 90; // +90 because Navigation points UP
        let currentAngle = cursorRotation.get();
        
        // Find shortest rotation path to avoid sudden 360-degree spins
        let diff = targetAngle - currentAngle;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        
        cursorRotation.set(currentAngle + diff);
      }

      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
      lastPos.current = { x: e.clientX, y: e.clientY };
      
      if (!isVisible) setIsVisible(true);
    };

    const handleMouseOver = (e) => {
      const target = e.target;
      if (
        target.tagName.toLowerCase() === 'button' ||
        target.tagName.toLowerCase() === 'a' ||
        target.closest('button') ||
        target.closest('a') ||
        target.classList.contains('cursor-pointer') ||
        window.getComputedStyle(target).cursor === 'pointer'
      ) {
        setIsHovering(true);
      } else {
        setIsHovering(false);
      }
    };

    const handleMouseLeave = () => setIsVisible(false);
    const handleMouseEnter = () => setIsVisible(true);

    window.addEventListener('mousemove', updateMousePosition);
    window.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);

    return () => {
      window.removeEventListener('mousemove', updateMousePosition);
      window.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
    };
  }, [isVisible, cursorX, cursorY, cursorRotation]);

  // Hide default cursor globally
  useEffect(() => {
    document.body.style.cursor = 'none';
    const style = document.createElement('style');
    style.innerHTML = `
      * { cursor: none !important; }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.body.style.cursor = 'auto';
      document.head.removeChild(style);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <>
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9999] text-primary flex items-center justify-center filter drop-shadow-[0_0_15px_var(--color-primary)]"
        style={{
          x: pointerX,
          y: pointerY,
          rotate: pointerRotation,
          translateX: "-50%",
          translateY: "-50%",
        }}
        animate={{
          scale: isHovering ? 1.3 : 1,
          opacity: isHovering ? 1 : 0.9,
        }}
      >
        <Navigation className="w-5 h-5 fill-primary stroke-primary" />
      </motion.div>
    </>
  );
}
```

## frontend\src\components\Header.jsx

```jsx
import { useState, useRef, useEffect } from 'react';
import { Moon, Sun, Monitor, Laptop, User, LogOut, Settings } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { Button } from './ui/button';

export default function Header() {
  const { theme, setTheme } = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  
  const themeRef = useRef(null);
  const profileRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (themeRef.current && !themeRef.current.contains(event.target)) setThemeOpen(false);
      if (profileRef.current && !profileRef.current.contains(event.target)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between px-6 z-10 shrink-0">
      <div className="flex-1" />
      
      <div className="flex items-center gap-4">
        {/* Theme Switcher */}
        <div className="relative" ref={themeRef}>
          <Button variant="ghost" size="icon" onClick={() => setThemeOpen(!themeOpen)}>
            {theme === 'light' ? <Sun className="h-5 w-5" /> : theme === 'midnight' ? <Monitor className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          
          {themeOpen && (
            <div className="absolute right-0 mt-2 w-40 rounded-md border border-border bg-popover shadow-md overflow-hidden z-50 animate-in fade-in zoom-in duration-200">
              <div className="flex flex-col p-1">
                <button onClick={() => { setTheme('light'); setThemeOpen(false); }} className={`flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground ${theme === 'light' ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground'}`}>
                  <Sun className="h-4 w-4" /> Light Mode
                </button>
                <button onClick={() => { setTheme('dark'); setThemeOpen(false); }} className={`flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground ${theme === 'dark' ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground'}`}>
                  <Moon className="h-4 w-4" /> Dark Mode
                </button>
                <button onClick={() => { setTheme('midnight'); setThemeOpen(false); }} className={`flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground ${theme === 'midnight' ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground'}`}>
                  <Monitor className="h-4 w-4" /> Midnight
                </button>
                <div className="h-px bg-border my-1" />
                <button onClick={() => { setTheme('neon'); setThemeOpen(false); }} className={`flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground ${theme === 'neon' ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground'}`}>
                  <div className="h-2 w-2 rounded-full bg-[#39ff14]" /> Neon Cyberpunk
                </button>
                <button onClick={() => { setTheme('ocean'); setThemeOpen(false); }} className={`flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground ${theme === 'ocean' ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground'}`}>
                  <div className="h-2 w-2 rounded-full bg-[#06b6d4]" /> Deep Ocean
                </button>
                <button onClick={() => { setTheme('sunset'); setThemeOpen(false); }} className={`flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground ${theme === 'sunset' ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground'}`}>
                  <div className="h-2 w-2 rounded-full bg-[#f97316]" /> Sunset
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="relative" ref={profileRef}>
          <button 
            className="flex items-center justify-center h-9 w-9 rounded-full bg-secondary border border-border overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all focus:outline-none"
            onClick={() => setProfileOpen(!profileOpen)}
          >
            <User className="h-5 w-5 text-muted-foreground" />
          </button>
          
          {profileOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-md border border-border bg-popover shadow-md overflow-hidden z-50 animate-in fade-in zoom-in duration-200">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-medium text-foreground">Admin User</p>
                <p className="text-xs text-muted-foreground truncate">admin@vulnerax.io</p>
              </div>
              <div className="flex flex-col p-1">
                <button className="flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground text-foreground">
                  <Settings className="h-4 w-4" /> Account Settings
                </button>
                <button className="flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground text-destructive font-medium mt-1">
                  <LogOut className="h-4 w-4" /> Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
```

## frontend\src\components\HeadersPanel.jsx

```jsx
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { headerStatusColor } from '../utils/helpers';

export default function HeadersPanel({ headers }) {
  if (!headers || headers.length === 0) {
    return (
      <div className="glass-panel p-6 sm:p-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-primary/10">
            <ShieldCheck className="h-5 w-5 text-accent-primary" />
          </div>
          <h3 className="font-semibold text-text-primary">Security Headers</h3>
        </div>
        <p className="text-sm text-text-muted">No header data available.</p>
      </div>
    );
  }

  const presentCount = headers.filter((h) => h.present).length;
  const weakCount = headers.filter((h) => h.present && h.severity === 'medium').length;
  const missingCount = headers.filter((h) => !h.present).length;

  return (
    <div className="glass-panel p-6 sm:p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-primary/10">
            <ShieldCheck className="h-5 w-5 text-accent-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">Security Headers</h3>
            <p className="text-xs text-text-muted">{presentCount} present · {weakCount} weak · {missingCount} missing</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {headers.map((header, i) => {
          const isWeak = header.present && header.severity === 'medium';
          const status = headerStatusColor(header.present, isWeak);
          const StatusIcon = header.present
            ? (isWeak ? AlertTriangle : CheckCircle2)
            : XCircle;

          return (
            <div
              key={`${header.name}-${i}`}
              className={`flex items-center justify-between rounded-xl px-4 py-3 ${status.bg} border border-transparent hover:border-border-default transition-all group`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <StatusIcon className={`h-4 w-4 shrink-0 ${status.color}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">{header.name}</p>
                  {header.value && (
                    <p className="text-xs text-text-muted font-mono truncate max-w-[300px]" title={header.value}>
                      {header.value}
                    </p>
                  )}
                </div>
              </div>
              <span className={`shrink-0 ml-3 text-xs font-semibold px-2.5 py-1 rounded-full ${status.bg} ${status.color}`}>
                {status.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

## frontend\src\components\Navbar.jsx

```jsx
import { Shield, History, ExternalLink } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const location = useLocation();

  const navLinks = [
    { to: '/', label: 'Scanner', icon: Shield },
    { to: '/history', label: 'History', icon: History },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-border-default bg-bg-primary/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-accent-primary/15 transition-all group-hover:bg-accent-primary/25 group-hover:shadow-lg group-hover:shadow-accent-primary/20">
            <Shield className="h-5 w-5 text-accent-primary" />
            <div className="absolute inset-0 rounded-lg animate-pulse-glow opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className="text-xl font-bold gradient-text tracking-tight">VulneraX</span>
        </Link>

        {/* Nav Links */}
        <div className="flex items-center gap-1">
          {navLinks.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200
                  ${active
                    ? 'bg-accent-primary/15 text-accent-primary shadow-sm shadow-accent-primary/10'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
                  }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-card transition-all"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </nav>
  );
}
```

## frontend\src\components\PortTable.jsx

```jsx
import { Network, Wifi } from 'lucide-react';

export default function PortTable({ ports }) {
  if (!ports || ports.length === 0) {
    return (
      <div className="glass-panel p-6 sm:p-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-severity-medium/10">
            <Network className="h-5 w-5 text-severity-medium" />
          </div>
          <h3 className="font-semibold text-text-primary">Open Ports</h3>
        </div>
        <p className="text-sm text-text-muted">No open ports detected.</p>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 sm:p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-severity-medium/10">
            <Network className="h-5 w-5 text-severity-medium" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">Open Ports</h3>
            <p className="text-xs text-text-muted">{ports.length} port{ports.length !== 1 ? 's' : ''} detected</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-default text-left">
              <th className="pb-3 pr-4 font-medium text-text-muted text-xs uppercase tracking-wider">Port</th>
              <th className="pb-3 pr-4 font-medium text-text-muted text-xs uppercase tracking-wider">Service</th>
              <th className="pb-3 pr-4 font-medium text-text-muted text-xs uppercase tracking-wider">State</th>
              <th className="pb-3 pr-4 font-medium text-text-muted text-xs uppercase tracking-wider">Banner</th>
              <th className="pb-3 font-medium text-text-muted text-xs uppercase tracking-wider">Response</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default/50">
            {ports.map((port, i) => (
              <tr key={`${port.port}-${i}`} className="group hover:bg-bg-card/50 transition-colors">
                <td className="py-3 pr-4">
                  <span className="font-mono font-semibold text-accent-primary">{port.port}</span>
                </td>
                <td className="py-3 pr-4">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-bg-card px-2 py-0.5 text-xs font-medium text-text-primary">
                    <Wifi className="h-3 w-3 text-accent-cyan" />
                    {port.service || 'unknown'}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent-emerald/10 px-2.5 py-0.5 text-xs font-medium text-accent-emerald">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-emerald animate-pulse" />
                    {port.state}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <span className="font-mono text-xs text-text-secondary truncate max-w-[200px] block" title={port.banner}>
                    {port.banner || '—'}
                  </span>
                </td>
                <td className="py-3">
                  <span className="text-xs text-text-muted">
                    {port.response_time_ms ? `${port.response_time_ms}ms` : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

## frontend\src\components\QuickInfo.jsx

```jsx
import { Globe, Server, MapPin, Network, Shield, Cpu } from 'lucide-react';
import { riskScoreColor } from '../utils/helpers';

export default function QuickInfo({ scanResult }) {
  if (!scanResult) return null;

  const { dns, fingerprint, ports, risk_score } = scanResult;
  const scoreInfo = riskScoreColor(risk_score?.overall ?? 100);

  const cards = [
    {
      icon: Globe,
      label: 'IP Address',
      value: dns?.ip_address || '—',
      color: 'text-accent-primary',
      bg: 'bg-accent-primary/10',
    },
    {
      icon: MapPin,
      label: 'Country',
      value: dns?.country || '—',
      color: 'text-accent-cyan',
      bg: 'bg-accent-cyan/10',
    },
    {
      icon: Server,
      label: 'Server',
      value: fingerprint?.server || '—',
      color: 'text-accent-secondary',
      bg: 'bg-accent-secondary/10',
    },
    {
      icon: Cpu,
      label: 'Technologies',
      value: fingerprint?.technologies?.length
        ? fingerprint.technologies.slice(0, 3).join(', ')
        : '—',
      color: 'text-accent-emerald',
      bg: 'bg-accent-emerald/10',
    },
    {
      icon: Network,
      label: 'Open Ports',
      value: ports?.length?.toString() || '0',
      color: 'text-severity-medium',
      bg: 'bg-severity-medium/10',
    },
    {
      icon: Shield,
      label: 'Risk Score',
      value: `${risk_score?.overall ?? 100}/100`,
      color: '',
      bg: '',
      customColor: scoreInfo.color,
      sublabel: scoreInfo.label,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5 stagger-children">
      {cards.map((card) => (
        <div
          key={card.label}
          className="glass-panel p-6 sm:p-8 flex flex-col items-center text-center gap-3 hover:scale-[1.02] transition-transform duration-200"
        >
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${card.bg || 'bg-bg-card'}`}>
            <card.icon
              className="h-6 w-6"
              style={card.customColor ? { color: card.customColor } : undefined}
              {...(!card.customColor ? { className: `h-6 w-6 ${card.color}` } : {})}
            />
          </div>
          <div>
            <p className="text-[11px] font-medium text-text-muted uppercase tracking-wider mb-0.5">
              {card.label}
            </p>
            <p
              className="text-sm font-semibold text-text-primary truncate max-w-[140px]"
              title={card.value}
              style={card.customColor ? { color: card.customColor } : undefined}
            >
              {card.value}
            </p>
            {card.sublabel && (
              <p className="text-[10px] font-medium mt-0.5" style={{ color: card.customColor }}>
                {card.sublabel}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

## frontend\src\components\ReportDownload.jsx

```jsx
import { FileJson, FileText, FileDown, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { getReport } from '../api/client';

export default function ReportDownload({ scanId }) {
  const [loading, setLoading] = useState('');

  if (!scanId) return null;

  const handleDownload = async (format) => {
    setLoading(format);
    try {
      const response = await getReport(scanId, format);

      if (format === 'json') {
        const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `VulneraX-report-${scanId.slice(0, 8)}.json`);
      } else {
        const blob = response.data;
        const ext = format === 'pdf' ? 'pdf' : 'html';
        const mimeType = format === 'pdf' ? 'application/pdf' : 'text/html';
        downloadBlob(new Blob([blob], { type: mimeType }), `VulneraX-report-${scanId.slice(0, 8)}.${ext}`);
      }
    } catch (err) {
      console.error(`Failed to download ${format} report:`, err);
    } finally {
      setLoading('');
    }
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const buttons = [
    { format: 'json', label: 'JSON', icon: FileJson, color: 'text-accent-emerald', bg: 'bg-accent-emerald/10 hover:bg-accent-emerald/20' },
    { format: 'html', label: 'HTML', icon: FileText, color: 'text-accent-cyan', bg: 'bg-accent-cyan/10 hover:bg-accent-cyan/20' },
    { format: 'pdf', label: 'PDF', icon: FileDown, color: 'text-accent-primary', bg: 'bg-accent-primary/10 hover:bg-accent-primary/20' },
  ];

  return (
    <div className="glass-panel p-6 sm:p-8 animate-fade-in">
      <h3 className="font-semibold text-text-primary mb-4">Download Report</h3>
      <div className="flex flex-wrap gap-3">
        {buttons.map(({ format, label, icon: Icon, color, bg }) => (
          <button
            key={format}
            id={`download-${format}-button`}
            onClick={() => handleDownload(format)}
            disabled={!!loading}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium ${color} ${bg} border border-transparent hover:border-border-glow transition-all disabled:opacity-50`}
          >
            {loading === format ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Icon className="h-4 w-4" />
            )}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

## frontend\src\components\RiskChart.jsx

```jsx
import { useEffect, useRef } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { countBySeverity } from '../utils/helpers';
import { PieChart } from 'lucide-react';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function RiskChart({ vulnerabilities }) {
  const counts = countBySeverity(vulnerabilities);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (total === 0) return null;

  const data = {
    labels: ['Critical', 'High', 'Medium', 'Low', 'Info'],
    datasets: [
      {
        data: [counts.critical, counts.high, counts.medium, counts.low, counts.info],
        backgroundColor: [
          'rgba(239, 68, 68, 0.8)',
          'rgba(249, 115, 22, 0.8)',
          'rgba(234, 179, 8, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(107, 114, 128, 0.8)',
        ],
        borderColor: [
          'rgba(239, 68, 68, 1)',
          'rgba(249, 115, 22, 1)',
          'rgba(234, 179, 8, 1)',
          'rgba(59, 130, 246, 1)',
          'rgba(107, 114, 128, 1)',
        ],
        borderWidth: 2,
        hoverBorderWidth: 3,
        hoverOffset: 8,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#94a3b8',
          padding: 16,
          usePointStyle: true,
          pointStyle: 'circle',
          font: { size: 11, family: 'Inter' },
        },
      },
      tooltip: {
        backgroundColor: '#1a2035',
        titleColor: '#e2e8f0',
        bodyColor: '#94a3b8',
        borderColor: 'rgba(99, 102, 241, 0.3)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        titleFont: { weight: '600' },
      },
    },
  };

  return (
    <div className="glass-panel p-6 sm:p-8 animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-primary/10">
          <PieChart className="h-5 w-5 text-accent-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-text-primary">Finding Distribution</h3>
          <p className="text-xs text-text-muted">{total} total finding{total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="relative h-[220px]">
        <Doughnut data={data} options={options} />
        {/* Center label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginBottom: '40px' }}>
          <div className="text-center">
            <span className="text-3xl font-bold text-text-primary">{total}</span>
            <br />
            <span className="text-[10px] text-text-muted uppercase tracking-wider">Findings</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

## frontend\src\components\RiskGauge.jsx

```jsx
import { useEffect, useRef } from 'react';
import { riskScoreColor } from '../utils/helpers';
import { Gauge } from 'lucide-react';

export default function RiskGauge({ score }) {
  const canvasRef = useRef(null);
  const animatedScore = useRef(0);
  const animFrameRef = useRef(null);

  const info = riskScoreColor(score ?? 100);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const size = 200;
    canvas.width = size * dpr;
    canvas.height = (size * 0.65) * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size * 0.65}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size * 0.55;
    const radius = size * 0.4;
    const lineWidth = 12;
    const startAngle = Math.PI;
    const endAngle = 2 * Math.PI;

    const targetScore = score ?? 100;

    function draw(currentScore) {
      ctx.clearRect(0, 0, size, size);

      // Background arc
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.1)';
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Score arc
      const scoreAngle = startAngle + (currentScore / 100) * Math.PI;
      const gradient = ctx.createLinearGradient(0, cy, size, cy);
      gradient.addColorStop(0, '#ef4444');
      gradient.addColorStop(0.3, '#f97316');
      gradient.addColorStop(0.5, '#eab308');
      gradient.addColorStop(0.7, '#3b82f6');
      gradient.addColorStop(1, '#34d399');

      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, scoreAngle);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Glow effect
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, scoreAngle);
      ctx.strokeStyle = info.color + '30';
      ctx.lineWidth = lineWidth + 8;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Score text
      ctx.fillStyle = info.color;
      ctx.font = 'bold 36px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(currentScore), cx, cy - 8);

      // Label
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText('RISK SCORE', cx, cy + 16);
    }

    // Animate
    const duration = 1200;
    const startTime = performance.now();
    const startVal = animatedScore.current;

    function animate(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (targetScore - startVal) * eased;

      animatedScore.current = current;
      draw(current);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    }

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [score, info.color]);

  return (
    <div className="glass-panel p-6 sm:p-8 animate-fade-in flex flex-col items-center">
      <div className="flex items-center gap-3 mb-4 self-start">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: info.color + '15' }}>
          <Gauge className="h-5 w-5" style={{ color: info.color }} />
        </div>
        <div>
          <h3 className="font-semibold text-text-primary">Risk Score</h3>
          <p className="text-xs font-medium" style={{ color: info.color }}>{info.label}</p>
        </div>
      </div>
      <canvas ref={canvasRef} />
    </div>
  );
}
```

## frontend\src\components\ScanForm.jsx

```jsx
import { useState } from 'react';
import { Target, Search, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent } from './ui/card';

export default function ScanForm({ onScan, isScanning }) {
  const [target, setTarget] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (target.trim() && !isScanning) {
      onScan(target.trim());
    }
  };

  return (
    <Card className="bg-muted/10 border-border">
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Target className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Enter domain or IP address (e.g., example.com)"
              className="pl-11 h-12 text-base bg-background"
              disabled={isScanning}
            />
          </div>
          <Button 
            type="submit" 
            disabled={!target.trim() || isScanning}
            className="h-12 px-8"
          >
            {isScanning ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Search className="mr-2 h-5 w-5" />
                Start Scan
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

## frontend\src\components\ScanProgress.jsx

```jsx
import { Loader2, CheckCircle2, XCircle, Zap } from 'lucide-react';

const PHASES = [
  'DNS Lookup',
  'Port Scanning',
  'Fingerprinting',
  'Checking Headers',
  'Analyzing Cookies',
  'SSL Scan',
  'Crawling Website',
  'Testing Vulnerabilities',
  'Calculating Risk Score',
];

export default function ScanProgress({ status, currentPhase }) {
  if (!status || status === 'completed' || status === 'error') return null;

  const currentIndex = PHASES.findIndex(
    (p) => currentPhase?.toLowerCase().includes(p.toLowerCase())
  );

  return (
    <div className="glass-panel p-6 sm:p-8 animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-cyan/15">
          <Zap className="h-5 w-5 text-accent-cyan animate-pulse" />
        </div>
        <div>
          <h3 className="font-semibold text-text-primary">Scan in Progress</h3>
          <p className="text-xs text-text-secondary">
            {currentPhase || 'Initializing...'}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-5 h-1.5 rounded-full bg-bg-input overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent-primary via-accent-cyan to-accent-emerald transition-all duration-700 ease-out"
          style={{ width: `${Math.max(((currentIndex + 1) / PHASES.length) * 100, 5)}%` }}
        />
      </div>

      {/* Phase list */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {PHASES.map((phase, i) => {
          let Icon, color, bgColor;
          if (i < currentIndex) {
            Icon = CheckCircle2;
            color = 'text-accent-emerald';
            bgColor = 'bg-accent-emerald/10';
          } else if (i === currentIndex) {
            Icon = Loader2;
            color = 'text-accent-cyan';
            bgColor = 'bg-accent-cyan/10';
          } else {
            Icon = null;
            color = 'text-text-muted';
            bgColor = 'bg-bg-input/50';
          }

          return (
            <div
              key={phase}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${color} ${bgColor} transition-all duration-300`}
            >
              {Icon ? (
                <Icon className={`h-3.5 w-3.5 shrink-0 ${i === currentIndex ? 'animate-spin' : ''}`} />
              ) : (
                <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-text-muted/30" />
              )}
              {phase}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

## frontend\src\components\Sidebar.jsx

```jsx
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Shield, History, PlusSquare, Globe } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Sidebar() {
  const location = useLocation();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Shield, path: '/' },
    { id: 'websites', label: 'Websites', icon: Globe, path: '/websites' },
    { id: 'history', label: 'History', icon: History, path: '/history' },
  ];

  return (
    <div className="w-64 h-full border-r border-border bg-card flex flex-col z-20">
      <div className="h-16 flex items-center px-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg tracking-tight">VulneraX</span>
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        <div className="mb-4 px-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Menu
          </p>
        </div>
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.id}
              to={item.path}
              className="relative flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors hover:text-foreground text-muted-foreground"
            >
              {isActive && (
                <motion.div
                  layoutId="active-nav-bg"
                  className="absolute inset-0 bg-accent rounded-md"
                  initial={false}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <item.icon className={`h-4 w-4 relative z-10 ${isActive ? 'text-primary' : ''}`} />
              <span className={`relative z-10 ${isActive ? 'text-foreground font-semibold' : ''}`}>
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border mt-auto">
        <div className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors">
          <div className="h-8 w-8 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 overflow-hidden">
            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=Admin`} alt="User" className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-col flex-1 overflow-hidden">
            <span className="text-sm font-medium truncate">Admin User</span>
            <span className="text-xs text-muted-foreground truncate">admin@vulnerax.io</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

## frontend\src\components\SSLPanel.jsx

```jsx
import { Lock, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';

export default function SSLPanel({ ssl }) {
  if (!ssl) {
    return (
      <div className="glass-panel p-6 sm:p-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-emerald/10">
            <Lock className="h-5 w-5 text-accent-emerald" />
          </div>
          <h3 className="font-semibold text-text-primary">SSL / TLS</h3>
        </div>
        <p className="text-sm text-text-muted">No SSL data available.</p>
      </div>
    );
  }

  const hasIssues = ssl.issues && ssl.issues.length > 0;
  const daysColor = ssl.days_remaining > 60 ? 'text-accent-emerald' : ssl.days_remaining > 30 ? 'text-severity-medium' : 'text-severity-critical';

  const fields = [
    { label: 'TLS Version', value: ssl.tls_version || '—' },
    { label: 'Cipher', value: ssl.cipher_name || '—' },
    { label: 'Issuer', value: ssl.issuer || '—' },
    { label: 'Subject', value: ssl.subject || '—' },
    { label: 'Expires', value: ssl.expires || '—' },
    { label: 'Serial', value: ssl.serial_number || '—' },
  ];

  return (
    <div className="glass-panel p-6 sm:p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-emerald/10">
            <Lock className="h-5 w-5 text-accent-emerald" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">SSL / TLS</h3>
            <p className="text-xs text-text-muted">{ssl.tls_version || 'Unknown version'}</p>
          </div>
        </div>
        {ssl.days_remaining > 0 && (
          <div className={`flex items-center gap-1.5 text-sm font-semibold ${daysColor}`}>
            <Clock className="h-4 w-4" />
            {ssl.days_remaining}d remaining
          </div>
        )}
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {fields.map((f) => (
          <div key={f.label} className="rounded-lg bg-bg-card/60 px-3 py-2">
            <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-0.5">{f.label}</p>
            <p className="text-xs font-medium text-text-primary font-mono truncate" title={f.value}>{f.value}</p>
          </div>
        ))}
      </div>

      {/* Weak cipher warning */}
      {ssl.weak_cipher && (
        <div className="flex items-center gap-2 rounded-lg bg-severity-critical/10 border border-severity-critical/20 px-3 py-2 text-xs text-severity-critical mb-3">
          <XCircle className="h-4 w-4 shrink-0" />
          Weak cipher detected: {ssl.cipher_name}
        </div>
      )}

      {/* Issues */}
      {hasIssues && (
        <div className="space-y-1.5">
          {ssl.issues.map((issue, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-severity-medium">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {issue}
            </div>
          ))}
        </div>
      )}

      {!hasIssues && !ssl.weak_cipher && ssl.tls_version && (
        <div className="flex items-center gap-2 text-xs text-accent-emerald">
          <CheckCircle2 className="h-3.5 w-3.5" />
          No SSL issues detected
        </div>
      )}
    </div>
  );
}
```

## frontend\src\components\ThemeProvider.jsx

```jsx
import React, { createContext, useContext, useEffect, useState } from "react"

const initialState = {
  theme: "dark",
  setTheme: () => null,
}

const ThemeProviderContext = createContext(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = "vite-ui-theme",
  ...props
}) {
  const [theme, setTheme] = useState(
    () => localStorage.getItem(storageKey) || defaultTheme
  )

  useEffect(() => {
    const root = window.document.documentElement

    root.classList.remove("light", "dark", "midnight", "neon", "ocean", "sunset")

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light"

      root.classList.add(systemTheme)
      return
    }

    root.classList.add(theme)
  }, [theme])

  const value = {
    theme,
    setTheme: (theme) => {
      localStorage.setItem(storageKey, theme)
      setTheme(theme)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}
```

## frontend\src\components\ui\badge.jsx

```jsx
import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
```

## frontend\src\components\ui\button.jsx

```jsx
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button, buttonVariants }
```

## frontend\src\components\ui\card.jsx

```jsx
import * as React from "react"
import { cn } from "../../lib/utils"

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("rounded-xl border bg-card text-card-foreground shadow-sm", className)}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
```

## frontend\src\components\ui\input.jsx

```jsx
import * as React from "react"
import { cn } from "../../lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = "Input"

export { Input }
```

## frontend\src\components\ui\table.jsx

```jsx
import * as React from "react"
import { cn } from "../../lib/utils"

const Table = React.forwardRef(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
```

## frontend\src\components\VulnPanel.jsx

```jsx
import { useState } from 'react';
import { Bug, ChevronDown, ChevronUp, AlertTriangle, AlertOctagon, Info, ShieldAlert } from 'lucide-react';
import { severityColor, severityOrder } from '../utils/helpers';

export default function VulnPanel({ vulnerabilities }) {
  const [expandedIndex, setExpandedIndex] = useState(null);

  if (!vulnerabilities || vulnerabilities.length === 0) {
    return (
      <div className="glass-panel p-6 sm:p-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-emerald/10">
            <Bug className="h-5 w-5 text-accent-emerald" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">Vulnerabilities</h3>
            <p className="text-xs text-text-muted">No vulnerabilities detected</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-accent-emerald bg-accent-emerald/10 rounded-lg px-4 py-3">
          <ShieldAlert className="h-4 w-4" />
          No security vulnerabilities were found during this scan.
        </div>
      </div>
    );
  }

  // Sort by severity
  const sorted = [...vulnerabilities].sort(
    (a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4)
  );

  const severityIcon = (sev) => {
    switch (sev?.toLowerCase()) {
      case 'critical': return AlertOctagon;
      case 'high': return AlertTriangle;
      case 'medium': return AlertTriangle;
      case 'low': return Info;
      default: return Info;
    }
  };

  return (
    <div className="glass-panel p-6 sm:p-8 animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-severity-critical/10">
          <Bug className="h-5 w-5 text-severity-critical" />
        </div>
        <div>
          <h3 className="font-semibold text-text-primary">Vulnerabilities</h3>
          <p className="text-xs text-text-muted">{vulnerabilities.length} finding{vulnerabilities.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="space-y-2">
        {sorted.map((vuln, i) => {
          const colors = severityColor(vuln.severity);
          const SevIcon = severityIcon(vuln.severity);
          const isExpanded = expandedIndex === i;

          return (
            <div
              key={i}
              className={`rounded-xl border ${colors.border} ${colors.bg} transition-all`}
            >
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left"
                onClick={() => setExpandedIndex(isExpanded ? null : i)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <SevIcon className={`h-4 w-4 shrink-0 ${colors.text}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">{vuln.name}</p>
                    <p className="text-xs text-text-muted">{vuln.category}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                    {vuln.severity}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-text-muted" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-text-muted" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-2 animate-fade-in">
                  {vuln.url && (
                    <div>
                      <span className="text-[10px] font-medium text-text-muted uppercase">URL</span>
                      <p className="text-xs font-mono text-accent-cyan break-all">{vuln.url}</p>
                    </div>
                  )}
                  {vuln.payload && (
                    <div>
                      <span className="text-[10px] font-medium text-text-muted uppercase">Payload</span>
                      <p className="text-xs font-mono text-severity-medium bg-bg-input rounded px-2 py-1 break-all">{vuln.payload}</p>
                    </div>
                  )}
                  {vuln.evidence && (
                    <div>
                      <span className="text-[10px] font-medium text-text-muted uppercase">Evidence</span>
                      <p className="text-xs text-text-secondary">{vuln.evidence}</p>
                    </div>
                  )}
                  {vuln.description && (
                    <div>
                      <span className="text-[10px] font-medium text-text-muted uppercase">Description</span>
                      <p className="text-xs text-text-secondary">{vuln.description}</p>
                    </div>
                  )}
                  {vuln.recommendation && (
                    <div className="bg-accent-emerald/5 border border-accent-emerald/10 rounded-lg px-3 py-2">
                      <span className="text-[10px] font-medium text-accent-emerald uppercase">Recommendation</span>
                      <p className="text-xs text-text-primary">{vuln.recommendation}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

## frontend\src\index.css

```css
@import "tailwindcss";

@layer base {
  :root {
    /* Light Theme (CyberScope Classic) */
    --background: #f8fafc;
    --foreground: #0f172a;
    
    --card: #ffffff;
    --card-foreground: #0f172a;
    
    --popover: #ffffff;
    --popover-foreground: #0f172a;
    
    --primary: #3b82f6; /* Blue */
    --primary-foreground: #ffffff;
    
    --secondary: #f1f5f9;
    --secondary-foreground: #0f172a;
    
    --muted: #f1f5f9;
    --muted-foreground: #64748b;
    
    --accent: #f1f5f9;
    --accent-foreground: #0f172a;
    
    --destructive: #ef4444;
    --destructive-foreground: #ffffff;
    
    --border: #e2e8f0;
    --input: #e2e8f0;
    --ring: #3b82f6;
    
    --radius: 0.5rem;
  }

  .dark {
    /* Dark Theme (Antigravity/Cyber Purple & Red) */
    --background: #09090b;
    --foreground: #fafafa;
    
    --card: #09090b;
    --card-foreground: #fafafa;
    
    --popover: #09090b;
    --popover-foreground: #fafafa;
    
    --primary: #a855f7; /* Vibrant Purple */
    --primary-foreground: #ffffff;
    
    --secondary: #27272a;
    --secondary-foreground: #fafafa;
    
    --muted: #27272a;
    --muted-foreground: #a1a1aa;
    
    --accent: #27272a;
    --accent-foreground: #fafafa;
    
    --destructive: #f43f5e; /* Rose Red */
    --destructive-foreground: #fafafa;
    
    --border: #27272a;
    --input: #27272a;
    --ring: #a855f7;
  }

  .midnight {
    /* Midnight Theme (Pure Black OLED) */
    --background: #000000;
    --foreground: #ffffff;
    
    --card: #000000;
    --card-foreground: #ffffff;
    
    --popover: #000000;
    --popover-foreground: #ffffff;
    
    --primary: #38bdf8; /* Light Sky Blue */
    --primary-foreground: #000000;
    
    --secondary: #171717;
    --secondary-foreground: #ffffff;
    
    --muted: #171717;
    --muted-foreground: #737373;
    
    --accent: #171717;
    --accent-foreground: #ffffff;
    
    --destructive: #f87171;
    --destructive-foreground: #000000;
    
    --border: #262626;
    --input: #262626;
    --ring: #38bdf8;
  }
  .neon {
    /* Neon Cyberpunk Theme */
    --background: #050510;
    --foreground: #fdfdfd;
    --card: #050510;
    --card-foreground: #fdfdfd;
    --popover: #050510;
    --popover-foreground: #fdfdfd;
    --primary: #39ff14; /* Neon Green */
    --primary-foreground: #000000;
    --secondary: #1a1a2e;
    --secondary-foreground: #fdfdfd;
    --muted: #1a1a2e;
    --muted-foreground: #a0a0b0;
    --accent: #1a1a2e;
    --accent-foreground: #fdfdfd;
    --destructive: #ff00ff; /* Neon Pink */
    --destructive-foreground: #000000;
    --border: #1f1f3a;
    --input: #1f1f3a;
    --ring: #39ff14;
  }

  .ocean {
    /* Deep Ocean Theme */
    --background: #020617;
    --foreground: #f8fafc;
    --card: #020617;
    --card-foreground: #f8fafc;
    --popover: #020617;
    --popover-foreground: #f8fafc;
    --primary: #06b6d4; /* Cyan */
    --primary-foreground: #ffffff;
    --secondary: #0f172a;
    --secondary-foreground: #f8fafc;
    --muted: #0f172a;
    --muted-foreground: #94a3b8;
    --accent: #0f172a;
    --accent-foreground: #f8fafc;
    --destructive: #f43f5e;
    --destructive-foreground: #ffffff;
    --border: #1e293b;
    --input: #1e293b;
    --ring: #06b6d4;
  }

  .sunset {
    /* Sunset Theme */
    --background: #110906;
    --foreground: #fffbeb;
    --card: #110906;
    --card-foreground: #fffbeb;
    --popover: #110906;
    --popover-foreground: #fffbeb;
    --primary: #f97316; /* Orange */
    --primary-foreground: #ffffff;
    --secondary: #2a150b;
    --secondary-foreground: #fffbeb;
    --muted: #2a150b;
    --muted-foreground: #d6d3d1;
    --accent: #2a150b;
    --accent-foreground: #fffbeb;
    --destructive: #ef4444;
    --destructive-foreground: #ffffff;
    --border: #3d2417;
    --input: #3d2417;
    --ring: #f97316;
  }
}

@theme {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);

  --font-sans: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
}

@layer base {
  * {
    @apply border-border cursor-none; /* Enforce custom cursor */
  }
  body {
    @apply bg-background text-foreground font-sans antialiased transition-colors duration-500 cursor-none;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}

@keyframes wave {
  0% { transform: scale(1) translate(0, 0) rotate(0deg); opacity: 0.8; }
  33% { transform: scale(1.1) translate(3%, 4%) rotate(2deg); opacity: 1; }
  66% { transform: scale(1.05) translate(-2%, -3%) rotate(-1deg); opacity: 0.9; }
  100% { transform: scale(1) translate(0, 0) rotate(0deg); opacity: 0.8; }
}

@keyframes wave-fast {
  0% { transform: scale(1) translate(0, 0) rotate(0deg); }
  33% { transform: scale(1.15) translate(4%, 6%) rotate(3deg); }
  66% { transform: scale(1.1) translate(-4%, -2%) rotate(-2deg); }
  100% { transform: scale(1) translate(0, 0) rotate(0deg); }
}

/* Deep Minimalist Background Effects */
body::before {
  content: '';
  position: fixed;
  inset: -10%; /* Oversize to allow for movement */
  pointer-events: none;
  z-index: 0;
  transition: background 0.5s ease;
  animation: wave 15s ease-in-out infinite alternate;
}

/* Dark Theme Specific Glow */
.dark body::before {
  background: 
    radial-gradient(ellipse at 15% 50%, rgba(168, 85, 247, 0.12), transparent 50%),
    radial-gradient(ellipse at 85% 30%, rgba(244, 63, 94, 0.12), transparent 50%);
}

.midnight body::before {
  background: 
    radial-gradient(ellipse at 15% 50%, rgba(56, 189, 248, 0.08), transparent 50%);
  animation: wave 25s ease-in-out infinite alternate;
}

.neon body::before {
  background: 
    radial-gradient(ellipse at 20% 60%, rgba(57, 255, 20, 0.15), transparent 45%),
    radial-gradient(ellipse at 80% 20%, rgba(255, 0, 255, 0.15), transparent 45%);
  animation: wave-fast 8s ease-in-out infinite alternate;
}

.ocean body::before {
  background: 
    radial-gradient(ellipse at 30% 70%, rgba(6, 182, 212, 0.15), transparent 60%),
    radial-gradient(ellipse at 70% 30%, rgba(59, 130, 246, 0.15), transparent 60%);
  animation: wave 12s ease-in-out infinite alternate;
}

.sunset body::before {
  background: 
    radial-gradient(ellipse at 15% 80%, rgba(249, 115, 22, 0.15), transparent 55%),
    radial-gradient(ellipse at 85% 20%, rgba(239, 68, 68, 0.15), transparent 55%);
  animation: wave 18s ease-in-out infinite alternate;
}

/* Global Subtle Mesh Mask */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  background-image: 
    linear-gradient(rgba(128, 128, 128, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(128, 128, 128, 0.05) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(circle at 50% 0%, black, transparent 70%);
  -webkit-mask-image: radial-gradient(circle at 50% 0%, black, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(128,128,128,0.2);
  border-radius: 10px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(128,128,128,0.4);
}
```

## frontend\src\lib\utils.js

```js
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
```

## frontend\src\main.jsx

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

## frontend\src\pages\Dashboard.jsx

```jsx
import { useState, useEffect, useRef } from 'react';
import ScanForm from '../components/ScanForm';
import ScanProgress from '../components/ScanProgress';
import QuickInfo from '../components/QuickInfo';
import PortTable from '../components/PortTable';
import HeadersPanel from '../components/HeadersPanel';
import CookiePanel from '../components/CookiePanel';
import SSLPanel from '../components/SSLPanel';
import VulnPanel from '../components/VulnPanel';
import RiskChart from '../components/RiskChart';
import RiskGauge from '../components/RiskGauge';
import ReportDownload from '../components/ReportDownload';
import { startScan, getScanStatus, getScanResults } from '../api/client';
import { Activity, Network, Globe, Lock } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

export default function Dashboard() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanId, setScanId] = useState(null);
  const [scanStatus, setScanStatus] = useState(null);
  const [currentPhase, setCurrentPhase] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const pollRef = useRef(null);
  const containerRef = useRef(null);

  // GSAP Animations
  useGSAP(() => {
    if (scanResult) {
      gsap.fromTo('.gsap-stagger-item', 
        { opacity: 0, y: 30, rotationX: 10 }, 
        { opacity: 1, y: 0, rotationX: 0, duration: 0.8, stagger: 0.15, ease: 'power3.out', clearProps: 'all' }
      );
    }
  }, { dependencies: [scanResult, activeTab], scope: containerRef });

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleScan = async (target) => {
    setIsScanning(true);
    setError('');
    setScanResult(null);
    setScanStatus('pending');
    setCurrentPhase('Initializing...');
    setActiveTab('overview');

    try {
      const { data } = await startScan(target);
      setScanId(data.scan_id);
      setScanStatus('running');

      // Start polling for status
      pollRef.current = setInterval(async () => {
        try {
          const { data: status } = await getScanStatus(data.scan_id);
          setCurrentPhase(status.current_phase || '');
          setScanStatus(status.status);

          if (status.status === 'completed') {
            clearInterval(pollRef.current);
            pollRef.current = null;

            // Fetch full results
            const { data: results } = await getScanResults(data.scan_id);
            setScanResult(results);
            setIsScanning(false);
          } else if (status.status === 'error') {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setError('Scan encountered an error. Please try again.');
            setIsScanning(false);
          }
        } catch (err) {
          console.error('Status poll error:', err);
        }
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to start scan. Is the backend running?');
      setIsScanning(false);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'network', label: 'Network', icon: Network },
    { id: 'web', label: 'Web Security', icon: Globe },
    { id: 'crypto', label: 'Cryptography', icon: Lock },
  ];

  return (
    <div className="w-full h-full p-8 flex flex-col space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Vulnerability Scanner</h1>
              <p className="mt-1 text-muted-foreground">AI-powered web application security assessment</p>
            </div>
            {scanResult && <ReportDownload scanId={scanResult.scan_id} />}
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
              {error}
            </div>
          )}

          {/* Scanner Input */}
          <div className="shrink-0">
            <ScanForm onScan={handleScan} isScanning={isScanning} />
          </div>

          {/* Scan Progress */}
          {isScanning && (
            <div className="shrink-0">
              <ScanProgress status={scanStatus} currentPhase={currentPhase} />
            </div>
          )}

          {/* Navigation Tabs */}
          {scanResult && (
            <div className="border-b border-border shrink-0">
              <nav className="-mb-px flex space-x-8">
                {[
                  { id: 'overview', label: 'Overview', icon: Activity },
                  { id: 'network', label: 'Network & Ports', icon: Network },
                  { id: 'web', label: 'Web Headers', icon: Globe },
                  { id: 'crypto', label: 'SSL/TLS', icon: Lock },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`
                      group inline-flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                      transition-colors duration-200
                      ${activeTab === id
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                      }
                    `}
                  >
                    <Icon className={`h-4 w-4 ${activeTab === id ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
                    {label}
                  </button>
                ))}
              </nav>
            </div>
          )}

          {/* Tab Content */}
          {scanResult && (
            <div className="flex-1 flex flex-col" ref={containerRef}>
              {activeTab === 'overview' && (
                <div className="space-y-8">
                  <div className="gsap-stagger-item perspective-[1000px]">
                    <QuickInfo scanResult={scanResult} />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 gsap-stagger-item perspective-[1000px]">
                    <RiskGauge score={scanResult?.risk_score?.overall} />
                    <RiskChart vulnerabilities={scanResult?.vulnerabilities || []} />
                  </div>
                  <div className="gsap-stagger-item perspective-[1000px]">
                    <VulnPanel vulnerabilities={scanResult?.vulnerabilities || []} />
                  </div>
                </div>
              )}

              {activeTab === 'network' && (
                <div className="space-y-8">
                  <div className="gsap-stagger-item">
                    <PortTable ports={scanResult?.ports || []} />
                  </div>
                </div>
              )}

              {activeTab === 'web' && (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 gsap-stagger-item">
                    <HeadersPanel headers={scanResult?.headers || {}} />
                    <CookiePanel cookies={scanResult?.cookies || []} />
                  </div>
                </div>
              )}

              {activeTab === 'crypto' && (
                <div className="space-y-8">
                  <div className="gsap-stagger-item">
                    <SSLPanel ssl={scanResult?.ssl || {}} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
  );
}
```

## frontend\src\pages\History.jsx

```jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { History as HistoryIcon, Search, Shield, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { getScanHistory } from '../api/client';
import { formatTimestamp, riskScoreColor } from '../utils/helpers';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

export default function History() {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const { data } = await getScanHistory();
      setScans(data.scans || []);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const filtered = scans.filter((s) =>
    s.target.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div className="w-full h-full p-8 flex flex-col space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scan History</h1>
          <p className="text-muted-foreground mt-1">Review past vulnerability assessments</p>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <HistoryIcon className="h-5 w-5 text-muted-foreground" />
            History Log ({scans.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by target..."
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="icon" onClick={fetchHistory} title="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 p-0 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Shield className="h-12 w-12 text-muted-foreground mb-3 opacity-30" />
              <p className="text-muted-foreground text-sm">
                {searchQuery ? 'No scans match your search.' : 'No scans yet. Run your first scan from the Dashboard.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10 shadow-sm">
                <TableRow>
                  <TableHead className="w-[300px]">Target</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Risk Score</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody as={motion.tbody} variants={container} initial="hidden" animate="show">
                {filtered.map((scan) => {
                  const scoreInfo = riskScoreColor(scan.risk_score);
                  return (
                    <TableRow key={scan.scan_id} as={motion.tr} variants={item}>
                      <TableCell className="font-medium font-mono text-primary">
                        {scan.target}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatTimestamp(scan.timestamp)}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={scan.status === 'error' ? 'destructive' : 'outline'}
                          className={scan.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border-none hover:bg-emerald-500/20' : ''}
                        >
                          <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
                            scan.status === 'completed' ? 'bg-emerald-500' : scan.status === 'error' ? 'bg-destructive' : 'bg-amber-500 animate-pulse'
                          }`} />
                          {scan.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold" style={{ color: scoreInfo.color }}>
                            {scan.risk_score}/100
                          </span>
                          <span className="text-[10px] text-muted-foreground">({scoreInfo.label})</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-primary hover:text-primary hover:bg-primary/10"
                          onClick={() => navigate(`/?scan=${scan.scan_id}`)}
                        >
                          View
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

## frontend\src\pages\Websites.jsx

```jsx
import { useState } from 'react';
import { Search, Plus, Globe, Activity, Clock, ShieldAlert, User, Scan, Edit, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

export default function Websites() {
  const [websites] = useState([
    { id: 1, url: 'example.com', status: 'Healthy', lastScan: '2 hours ago', risk: 'Low', ip: '93.184.216.34' },
    { id: 2, url: 'test.vulnweb.com', status: 'Vulnerable', lastScan: '1 day ago', risk: 'High', ip: '176.28.50.165' },
    { id: 3, url: 'scanme.nmap.org', status: 'Warning', lastScan: '5 hours ago', risk: 'Medium', ip: '45.33.32.156' },
    { id: 4, url: 'demo.testfire.net', status: 'Vulnerable', lastScan: '3 days ago', risk: 'Critical', ip: '65.61.137.117' },
  ]);

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  const getRiskBadge = (risk) => {
    switch (risk) {
      case 'Low': return <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 shadow-none border-none">Low</Badge>;
      case 'Medium': return <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 shadow-none border-none">Medium</Badge>;
      case 'High': return <Badge className="bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 shadow-none border-none">High</Badge>;
      case 'Critical': return <Badge variant="destructive" className="shadow-none">Critical</Badge>;
      default: return <Badge variant="outline">{risk}</Badge>;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Healthy': return <Activity className="h-4 w-4 text-emerald-500" />;
      case 'Warning': return <Activity className="h-4 w-4 text-amber-500" />;
      case 'Vulnerable': return <ShieldAlert className="h-4 w-4 text-rose-500" />;
      default: return <Globe className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="w-full h-full p-8 flex flex-col space-y-6">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Websites</h1>
          <p className="text-muted-foreground mt-1">Manage and monitor your target assets</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Target
        </Button>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 pb-4">
          <CardTitle className="text-lg">Monitored Assets</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search targets..." className="pl-9" />
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10 shadow-sm">
              <TableRow>
                <TableHead className="w-[300px]">Target URL</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Risk Level</TableHead>
                <TableHead>Last Scan</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody as={motion.tbody} variants={container} initial="hidden" animate="show">
              {websites.map((site) => (
                <TableRow key={site.id} as={motion.tr} variants={item}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                        <Globe className="h-5 w-5 text-primary" />
                      </div>
                      {site.url}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{site.ip}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(site.status)}
                      <span className="text-sm">{site.status}</span>
                    </div>
                  </TableCell>
                  <TableCell>{getRiskBadge(site.risk)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span className="text-xs">{site.lastScan}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 text-muted-foreground">
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-foreground"><User className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary"><Scan className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-foreground"><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <div className="border-t border-border p-4 flex items-center justify-end bg-muted/10">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="default" size="icon" className="h-8 w-8">1</Button>
            <Button variant="outline" size="icon" className="h-8 w-8">2</Button>
            <Button variant="outline" size="icon" className="h-8 w-8">3</Button>
            <Button variant="outline" size="icon" className="h-8 w-8"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
```

## frontend\src\utils\helpers.js

```js
/**
 * Map severity level to a color class / hex
 */
export const severityColor = (severity) => {
  const map = {
    critical: { bg: 'bg-severity-critical/15', text: 'text-severity-critical', hex: '#ef4444', border: 'border-severity-critical/30' },
    high:     { bg: 'bg-severity-high/15',     text: 'text-severity-high',     hex: '#f97316', border: 'border-severity-high/30' },
    medium:   { bg: 'bg-severity-medium/15',   text: 'text-severity-medium',   hex: '#eab308', border: 'border-severity-medium/30' },
    low:      { bg: 'bg-severity-low/15',      text: 'text-severity-low',      hex: '#3b82f6', border: 'border-severity-low/30' },
    info:     { bg: 'bg-severity-info/15',      text: 'text-severity-info',     hex: '#6b7280', border: 'border-severity-info/30' },
  };
  return map[severity?.toLowerCase()] || map.info;
};

/**
 * Map header status to color
 */
export const headerStatusColor = (present, isWeak) => {
  if (!present) return { label: 'Missing', color: 'text-status-missing', icon: '✕', bg: 'bg-status-missing/10' };
  if (isWeak) return { label: 'Weak', color: 'text-status-weak', icon: '⚠', bg: 'bg-status-weak/10' };
  return { label: 'Present', color: 'text-status-present', icon: '✓', bg: 'bg-status-present/10' };
};

/**
 * Risk score to color gradient
 */
export const riskScoreColor = (score) => {
  if (score >= 80) return { color: '#34d399', label: 'Excellent' };
  if (score >= 60) return { color: '#3b82f6', label: 'Good' };
  if (score >= 40) return { color: '#eab308', label: 'Fair' };
  if (score >= 20) return { color: '#f97316', label: 'Poor' };
  return { color: '#ef4444', label: 'Critical' };
};

/**
 * Format a timestamp string
 */
export const formatTimestamp = (ts) => {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return ts;
  }
};

/**
 * Truncate a string
 */
export const truncate = (str, maxLen = 60) => {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '…' : str;
};

/**
 * Severity ordering for sorting
 */
export const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/**
 * Count vulnerabilities by severity
 */
export const countBySeverity = (vulns) => {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  (vulns || []).forEach((v) => {
    const key = v.severity?.toLowerCase();
    if (key in counts) counts[key]++;
  });
  return counts;
};
```

## frontend\vite.config.js

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```

## README.md

```md

```

