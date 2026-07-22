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
                                recommendation="Implement output encoding/escaping. Use Content-Security-Policy headers.",
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
                                recommendation="Implement server-side output encoding and CSP headers.",
                            ))
                            break
                    except Exception:
                        continue

    return results
