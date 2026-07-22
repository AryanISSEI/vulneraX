import uuid
import json
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, HTTPException
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


async def run_scan(scan_id: str, target: str):
    """Execute the full scan pipeline as a background task."""
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
async def start_scan(request: ScanRequest, background_tasks: BackgroundTasks):
    """Start a new security scan."""
    scan_id = str(uuid.uuid4())
    target = request.target.strip().replace("https://", "").replace("http://", "").strip("/")

    if not target:
        raise HTTPException(status_code=400, detail="Target is required")

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
        return FileResponse(filepath, filename=filepath.split("/")[-1].split("\\")[-1], media_type="application/json")
    elif format == "html":
        filepath = generate_html_report(scan_result)
        return FileResponse(filepath, filename=filepath.split("/")[-1].split("\\")[-1], media_type="text/html")
    elif format == "pdf":
        filepath = generate_pdf_report(scan_result)
        return FileResponse(filepath, filename=filepath.split("/")[-1].split("\\")[-1], media_type="application/pdf")
    else:
        raise HTTPException(status_code=400, detail="Invalid format. Use: json, html, pdf")
