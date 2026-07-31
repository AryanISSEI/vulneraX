import uuid
import json
import asyncio
import re
import ipaddress
import os
from collections import defaultdict
import time
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, Depends, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse

from models import (
    ScanRequest, ScanResponse, ScanResult, ScanSummary,
    DNSResult, FingerprintResult, SSLResult, RiskScore
)
from database import save_scan, get_scan, get_all_scans, update_scan_status, update_scan_results, delete_scan
from core.security import get_current_user
from core.celery_app import celery

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

# --- Concurrency & rate-limiting controls ---
_RATE_WINDOW_SECONDS = 60
_RATE_MAX_REQUESTS = 3
_rate_tracker: dict[str, list[float]] = defaultdict(list)

# Strict regex: valid hostnames (RFC 952/1123) or IPv4 addresses only
_DOMAIN_RE = re.compile(
    r"^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$"
)
_IPV4_RE = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}$")


def _validate_target(raw: str) -> str:
    cleaned = raw.strip()
    for prefix in ("https://", "http://"):
        if cleaned.lower().startswith(prefix):
            cleaned = cleaned[len(prefix):]
    cleaned = cleaned.strip("/").split("/")[0]

    if not cleaned:
        raise HTTPException(status_code=400, detail="Target is required")

    if not (_DOMAIN_RE.match(cleaned) or _IPV4_RE.match(cleaned)):
        raise HTTPException(
            status_code=400,
            detail="Invalid target. Provide a valid domain name or IPv4 address.",
        )

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
    return os.path.basename(filepath)


async def save_partial_results(result: ScanResult):
    await update_scan_results(
        result.scan_id,
        result.model_dump_json(),
        result.risk_score.overall if result.risk_score else 100,
        result.status
    )


_ABORTED_SCANS = set()


async def run_scan_logic(scan_id: str, target: str, user_id: int = None):
    """Execute the full scan pipeline."""
    result = ScanResult(
        scan_id=scan_id,
        target=target,
        timestamp=datetime.now(timezone.utc).isoformat(),
        status="running",
    )

    def check_aborted():
        if scan_id in _ABORTED_SCANS:
            return True
        return False

    try:
        # Phase 1: DNS Lookup
        if check_aborted():
            result.status = "error"
            result.error = "Scan aborted by user"
            result.current_phase = "Aborted"
            await save_partial_results(result)
            return

        result.current_phase = "DNS Lookup"
        await update_scan_status(scan_id, "running", "DNS Lookup")
        try:
            result.dns = await dns_lookup(target)
        except Exception:
            result.dns = DNSResult()
        await save_partial_results(result)

        # Phase 2: Port Scanning
        if check_aborted():
            result.status = "error"
            result.error = "Scan aborted by user"
            result.current_phase = "Aborted"
            await save_partial_results(result)
            return
        result.current_phase = "Port Scanning"
        await update_scan_status(scan_id, "running", "Port Scanning")
        ip = result.dns.ip_address if result.dns else target

        if ip:
            try:
                resolved = ipaddress.ip_address(ip)
                if resolved.is_private or resolved.is_loopback or resolved.is_link_local or resolved.is_multicast:
                    raise ValueError(f"Resolved IP {ip} is in a restricted range. Scan aborted.")
            except ValueError as ve:
                result.status = "error"
                result.error = str(ve)
                result.current_phase = "Error"
                await save_partial_results(result)
                return

        if ip:
            try:
                result.ports = await scan_ports(ip)
                for port_result in result.ports:
                    if not port_result.banner:
                        try:
                            banner = await grab_banner(ip, port_result.port)
                            if banner:
                                port_result.banner = banner
                        except Exception:
                            pass
            except Exception:
                pass
        await save_partial_results(result)

        # Phase 3: Website Fingerprinting
        result.current_phase = "Fingerprinting"
        await update_scan_status(scan_id, "running", "Fingerprinting")
        try:
            result.fingerprint = await fingerprint(target)
        except Exception:
            result.fingerprint = FingerprintResult()
        await save_partial_results(result)

        # Phase 4: Security Headers
        result.current_phase = "Checking Headers"
        await update_scan_status(scan_id, "running", "Checking Headers")
        try:
            result.headers = await check_headers(target)
        except Exception:
            pass
        await save_partial_results(result)

        # Phase 5: Cookie Analysis
        result.current_phase = "Analyzing Cookies"
        await update_scan_status(scan_id, "running", "Analyzing Cookies")
        try:
            result.cookies = await analyze_cookies(target)
        except Exception:
            pass
        await save_partial_results(result)

        # Phase 6: SSL Scan
        result.current_phase = "SSL Scan"
        await update_scan_status(scan_id, "running", "SSL Scan")
        try:
            result.ssl = await scan_ssl(target)
        except Exception:
            result.ssl = SSLResult()
        await save_partial_results(result)

        # Phase 7: Crawling
        result.current_phase = "Crawling Website"
        await update_scan_status(scan_id, "running", "Crawling Website")
        crawl_data = {"urls": [], "forms": [], "params": []}
        has_http = any(p.port in (80, 443, 8080, 8443, 8000, 3000) for p in result.ports) or True
        if has_http:
            try:
                crawl_data = await crawl(target)
            except Exception:
                pass
        await save_partial_results(result)

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
        await save_partial_results(result)

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
        await save_partial_results(result)

    except Exception as e:
        result.status = "error"
        result.error = str(e)
        result.current_phase = "Error"
        await save_partial_results(result)


@router.post("/scan", response_model=ScanResponse)
async def start_scan(request: ScanRequest, req: Request, background_tasks: BackgroundTasks, user_id: int = Depends(get_current_user)):
    """Start a new security scan."""
    client_ip = req.client.host if req.client else "unknown"
    now = time.monotonic()
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
    await save_scan(scan_id, target, timestamp, "pending", user_id=user_id)

    # Start scan via BackgroundTasks
    background_tasks.add_task(run_scan_logic, scan_id, target, user_id)

    return ScanResponse(
        scan_id=scan_id,
        status="pending",
        message=f"Scan started for {target}"
    )


@router.get("/scan/{scan_id}/status")
async def get_scan_status(scan_id: str, user_id: int = Depends(get_current_user)):
    """Get the current status of a scan."""
    scan = await get_scan(scan_id)
    if not scan or scan.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Scan not found")

    return {
        "scan_id": scan["id"],
        "status": scan["status"],
        "current_phase": scan.get("current_phase", ""),
        "target": scan["target"],
    }


@router.get("/scan/{scan_id}/results")
async def get_scan_results(scan_id: str, user_id: int = Depends(get_current_user)):
    """Get the full results of a scan."""
    scan = await get_scan(scan_id)
    if not scan or scan.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Scan not found")

    try:
        results = json.loads(scan.get("results_json", "{}"))
        if not results:
            return {}
        return results
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse scan results")

@router.post("/scan/{scan_id}/abort")
async def abort_scan(scan_id: str, user_id: int = Depends(get_current_user)):
    """Abort an ongoing security scan."""
    scan = await get_scan(scan_id)
    if not scan or scan.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Scan not found")
        
    _ABORTED_SCANS.add(scan_id)
    await update_scan_status(scan_id, "error", "Aborted by user")
    return {"scan_id": scan_id, "status": "aborted", "message": "Scan aborted successfully"}


@router.delete("/scan/{scan_id}")
async def delete_scan_endpoint(scan_id: str, user_id: int = Depends(get_current_user)):
    """Delete a scan."""
    scan = await get_scan(scan_id)
    if not scan or scan.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    success = await delete_scan(scan_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete scan")
    return {"message": "Scan deleted successfully"}



@router.get("/history")
async def get_scan_history(user_id: int = Depends(get_current_user)):
    """Get all past scans for current user."""
    scans = await get_all_scans(user_id=user_id)
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
async def get_report(scan_id: str, format: str = "json", user_id: int = Depends(get_current_user)):
    """Generate and download a report in the specified format."""
    scan = await get_scan(scan_id)
    if not scan or scan.get("user_id") != user_id:
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
