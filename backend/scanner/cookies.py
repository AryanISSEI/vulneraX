import httpx
from models import CookieResult


async def analyze_cookies(target: str, headers: dict = None, cookies: dict = None) -> list[CookieResult]:
    """Analyze cookies set by the target for security flags."""
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

                # Parse Set-Cookie headers
                set_cookie_headers = resp.headers.get_list("set-cookie") if hasattr(resp.headers, 'get_list') else []

                # Fallback: check raw headers
                if not set_cookie_headers:
                    for key, value in resp.headers.multi_items():
                        if key.lower() == "set-cookie":
                            set_cookie_headers.append(value)

                # Also check jar cookies
                for cookie in resp.cookies.jar:
                    issues = []
                    http_only = False
                    secure_flag = cookie.secure
                    same_site = ""
                    expires = ""

                    # Check the raw Set-Cookie header for this cookie
                    for raw in set_cookie_headers:
                        if cookie.name in raw:
                            raw_lower = raw.lower()
                            http_only = "httponly" in raw_lower
                            if "samesite=strict" in raw_lower:
                                same_site = "Strict"
                            elif "samesite=lax" in raw_lower:
                                same_site = "Lax"
                            elif "samesite=none" in raw_lower:
                                same_site = "None"
                            break

                    # Evaluate issues
                    if not http_only:
                        issues.append("Missing HttpOnly flag - cookie accessible via JavaScript")
                    if not secure_flag:
                        issues.append("Missing Secure flag - cookie sent over unencrypted connections")
                    if not same_site:
                        issues.append("Missing SameSite attribute - vulnerable to CSRF")
                    elif same_site == "None" and not secure_flag:
                        issues.append("SameSite=None without Secure flag")

                    if cookie.expires:
                        expires = str(cookie.expires)

                    results.append(CookieResult(
                        name=cookie.name,
                        value=cookie.value[:50] + "..." if len(cookie.value) > 50 else cookie.value,
                        http_only=http_only,
                        secure=secure_flag,
                        same_site=same_site,
                        expires=expires,
                        issues=issues,
                    ))

                break  # Success

        except Exception:
            continue

    return results
