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
    DNSResult, FingerprintResult, SSLResult, RiskScore, VulnerabilityResult
)
from database import save_scan, get_scan, get_all_scans, update_scan_status, update_scan_results, delete_scan
from core.security import get_current_user
from core.celery_app import celery
import google.generativeai as genai
from pydantic import BaseModel

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
from scanner.report import generate_json_report, generate_html_report, generate_pdf_report, generate_csv_report

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
    risk_score_val = 0 if result.status in ("aborted", "error") else (result.risk_score.overall if result.risk_score else 100)
    await update_scan_results(
        result.scan_id,
        result.model_dump_json(),
        risk_score_val,
        result.status
    )


_ABORTED_SCANS = set()
_RUNNING_TASKS: dict[str, asyncio.Task] = {}


async def run_scan_logic(scan_id: str, target: str, user_id: int = None, custom_headers: dict = None, custom_cookies: dict = None):
    """Execute the full scan pipeline."""
    result = ScanResult(
        scan_id=scan_id,
        target=target,
        timestamp=datetime.now(timezone.utc).isoformat(),
        status="running",
    )

    async def check_and_handle_aborted() -> bool:
        if scan_id in _ABORTED_SCANS:
            result.status = "aborted"
            result.error = "Scan aborted by user"
            result.current_phase = "Aborted"
            await save_partial_results(result)
            return True
        return False

    try:
        # Phase 1: DNS Lookup
        if await check_and_handle_aborted(): return

        result.current_phase = "DNS Lookup"
        await update_scan_status(scan_id, "running", "DNS Lookup")
        try:
            result.dns = await dns_lookup(target)
        except Exception:
            result.dns = DNSResult()
        await save_partial_results(result)

        # Phase 2: Port Scanning
        if await check_and_handle_aborted(): return
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
                    if await check_and_handle_aborted(): return
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
        if await check_and_handle_aborted(): return
        result.current_phase = "Fingerprinting"
        await update_scan_status(scan_id, "running", "Fingerprinting")
        try:
            result.fingerprint = await fingerprint(target, headers=custom_headers, cookies=custom_cookies)
        except Exception:
            result.fingerprint = FingerprintResult()
        await save_partial_results(result)

        # Phase 4: Security Headers
        if await check_and_handle_aborted(): return
        result.current_phase = "Checking Headers"
        await update_scan_status(scan_id, "running", "Checking Headers")
        try:
            result.headers = await check_headers(target, headers=custom_headers, cookies=custom_cookies)
        except Exception:
            pass
        await save_partial_results(result)

        # Phase 5: Cookie Analysis
        if await check_and_handle_aborted(): return
        result.current_phase = "Analyzing Cookies"
        await update_scan_status(scan_id, "running", "Analyzing Cookies")
        try:
            result.cookies = await analyze_cookies(target, headers=custom_headers, cookies=custom_cookies)
        except Exception:
            pass
        await save_partial_results(result)

        # Phase 6: SSL Scan
        if await check_and_handle_aborted(): return
        result.current_phase = "SSL Scan"
        await update_scan_status(scan_id, "running", "SSL Scan")
        try:
            result.ssl = await scan_ssl(target)
        except Exception:
            result.ssl = SSLResult()
        await save_partial_results(result)

        # Phase 7: Crawling
        if await check_and_handle_aborted(): return
        result.current_phase = "Crawling Website"
        await update_scan_status(scan_id, "running", "Crawling Website")
        crawl_data = {"urls": [], "forms": [], "params": []}
        has_http = any(p.port in (80, 443, 8080, 8443, 8000, 3000) for p in result.ports) or True
        if has_http:
            try:
                crawl_data = await crawl(target, headers=custom_headers, cookies=custom_cookies)
            except Exception:
                pass
        await save_partial_results(result)

        # Phase 8: Vulnerability Tests
        if await check_and_handle_aborted(): return
        result.current_phase = "Testing Vulnerabilities"
        await update_scan_status(scan_id, "running", "Testing Vulnerabilities")

        vuln_tasks = [
            test_xss(target, crawl_data, headers=custom_headers, cookies=custom_cookies),
            test_sqli(target, crawl_data, headers=custom_headers, cookies=custom_cookies),
            test_traversal(target, crawl_data, headers=custom_headers, cookies=custom_cookies),
            test_redirect(target, crawl_data, headers=custom_headers, cookies=custom_cookies),
            check_sensitive_files(target, headers=custom_headers, cookies=custom_cookies),
        ]

        vuln_results = await asyncio.gather(*vuln_tasks, return_exceptions=True)
        if await check_and_handle_aborted(): return

        for vr in vuln_results:
            if isinstance(vr, list):
                result.vulnerabilities.extend(vr)
        await save_partial_results(result)

        # Phase 9: Calculate Risk Score
        if await check_and_handle_aborted(): return
        result.current_phase = "Calculating Risk Score"
        await update_scan_status(scan_id, "running", "Calculating Risk Score")
        result.risk_score = calculate_risk_score(
            result.vulnerabilities,
            result.headers,
            result.cookies,
            result.ssl,
        )

        if await check_and_handle_aborted(): return

        # Done
        result.status = "completed"
        result.current_phase = "Completed"
        await save_partial_results(result)

    except (asyncio.CancelledError, Exception) as e:
        result.status = "aborted" if (scan_id in _ABORTED_SCANS or isinstance(e, asyncio.CancelledError)) else "error"
        result.error = "Scan aborted by user" if result.status == "aborted" else str(e)
        result.current_phase = "Aborted" if result.status == "aborted" else "Error"
        await save_partial_results(result)
    finally:
        _RUNNING_TASKS.pop(scan_id, None)


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

    # Start scan task and track reference
    task = asyncio.create_task(run_scan_logic(scan_id, target, user_id, request.headers, request.cookies))
    _RUNNING_TASKS[scan_id] = task

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
    """Abort an ongoing security scan immediately."""
    scan = await get_scan(scan_id)
    if not scan or scan.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Scan not found")
        
    _ABORTED_SCANS.add(scan_id)
    task = _RUNNING_TASKS.pop(scan_id, None)
    if task and not task.done():
        task.cancel()  # Cancel task immediately in event loop

    await update_scan_status(scan_id, "aborted", "Aborted by user")
    
    try:
        data = json.loads(scan.get("results_json", "{}"))
        data["status"] = "aborted"
        data["error"] = "Scan aborted by user"
        data["current_phase"] = "Aborted"
        await update_scan_results(scan_id, json.dumps(data), 0, "aborted")
    except Exception:
        pass

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
                risk_score=s.get("risk_score", 100) if s["status"] not in ("aborted", "error") else 0,
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

    if scan_result.status not in ("completed", "aborted", "error"):
        raise HTTPException(status_code=400, detail="Scan is still in progress")

    if format == "json":
        filepath = generate_json_report(scan_result)
        return FileResponse(filepath, filename=_safe_report_basename(filepath), media_type="application/json")
    elif format == "html":
        filepath = generate_html_report(scan_result)
        return FileResponse(filepath, filename=_safe_report_basename(filepath), media_type="text/html")
    elif format == "pdf":
        filepath = generate_pdf_report(scan_result)
        return FileResponse(filepath, filename=_safe_report_basename(filepath), media_type="application/pdf")
    elif format == "csv":
        filepath = generate_csv_report(scan_result)
        return FileResponse(filepath, filename=_safe_report_basename(filepath), media_type="text/csv")
    else:
        raise HTTPException(status_code=400, detail="Invalid format. Use: json, html, pdf, csv")


class AIRemediationRequest(BaseModel):
    vulnerability_title: str
    vulnerability_description: str
    evidence: str = ""

@router.post("/scan/{scan_id}/remediation/ai")
async def generate_ai_remediation(scan_id: str, request: AIRemediationRequest, user_id: int = Depends(get_current_user)):
    """Generate AI-powered remediation advice for a specific vulnerability."""
    scan = await get_scan(scan_id)
    if not scan or scan.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Scan not found")
        
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI Remediation is not configured (Missing API Key).")
        
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-pro')
        
        prompt = f"""
        You are a senior application security engineer. Analyze the following vulnerability and provide a detailed, actionable remediation plan.
        
        Vulnerability Title: {request.vulnerability_title}
        Description: {request.vulnerability_description}
        Evidence/Payload: {request.evidence}
        
        Provide your response in Markdown format, structured as follows:
        1. **Root Cause Analysis**: Briefly explain why this vulnerability occurs.
        2. **Remediation Steps**: Step-by-step instructions to fix the issue.
        3. **Code Example (if applicable)**: Show how to fix it in code (assume a generic web framework if none is obvious).
        4. **Verification**: How the user can verify the fix.
        """
        
        response = model.generate_content(prompt)
        return {"remediation": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")
