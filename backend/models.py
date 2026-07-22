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
