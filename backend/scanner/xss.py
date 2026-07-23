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
