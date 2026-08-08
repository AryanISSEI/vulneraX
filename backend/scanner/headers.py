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


async def check_headers(target: str, headers: dict = None, cookies: dict = None) -> list[HeaderResult]:
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
            , headers=headers, cookies=cookies) as client:
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
