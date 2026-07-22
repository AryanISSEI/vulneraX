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
