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
