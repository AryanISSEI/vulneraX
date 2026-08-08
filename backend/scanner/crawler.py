import httpx
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import asyncio


async def crawl(target: str, max_depth: int = 2, max_pages: int = 50, headers: dict = None, cookies: dict = None) -> dict:
    """
    Crawl a website to discover URLs, forms, and input parameters.
    Returns a dict with:
    - urls: list of discovered URLs
    - forms: list of dicts with {action, method, inputs}
    - params: list of URLs with query parameters
    """
    domain = target.replace("https://", "").replace("http://", "").strip("/").split("/")[0]

    base_urls = [f"https://{domain}", f"http://{domain}"]
    base_url = None

    # Find a working base URL
    async with httpx.AsyncClient(timeout=10, follow_redirects=True, verify=False, headers=headers, cookies=cookies) as client:
        for url in base_urls:
            try:
                resp = await client.get(url)
                if resp.status_code < 500:
                    base_url = str(resp.url).rstrip("/")
                    break
            except Exception:
                continue

    if not base_url:
        return {"urls": [], "forms": [], "params": []}

    visited = set()
    to_visit = [(base_url, 0)]
    all_urls = []
    all_forms = []
    all_params = []

    async with httpx.AsyncClient(timeout=10, follow_redirects=True, verify=False, headers=headers, cookies=cookies) as client:
        while to_visit and len(visited) < max_pages:
            url, depth = to_visit.pop(0)

            # Normalize URL
            parsed = urlparse(url)
            normalized = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"

            if normalized in visited:
                continue

            # Only crawl same domain
            if parsed.netloc and parsed.netloc != urlparse(base_url).netloc:
                continue

            visited.add(normalized)

            try:
                resp = await client.get(url)
                if "text/html" not in resp.headers.get("content-type", ""):
                    continue

                all_urls.append(url)

                # Track URLs with parameters
                if parsed.query:
                    all_params.append(url)

                soup = BeautifulSoup(resp.text, "html.parser")

                # Extract forms
                for form in soup.find_all("form"):
                    action = form.get("action", "")
                    method = form.get("method", "GET").upper()
                    full_action = urljoin(url, action) if action else url

                    inputs = []
                    for inp in form.find_all(["input", "textarea", "select"]):
                        input_name = inp.get("name", "")
                        input_type = inp.get("type", "text")
                        if input_name:
                            inputs.append({
                                "name": input_name,
                                "type": input_type,
                            })

                    if inputs:
                        all_forms.append({
                            "action": full_action,
                            "method": method,
                            "inputs": inputs,
                        })

                # Extract links for deeper crawling
                if depth < max_depth:
                    for link in soup.find_all("a", href=True):
                        href = link["href"]
                        full_url = urljoin(url, href)
                        link_parsed = urlparse(full_url)

                        # Skip non-HTTP, external, and fragment links
                        if link_parsed.scheme not in ("http", "https"):
                            continue
                        if link_parsed.netloc != urlparse(base_url).netloc:
                            continue
                        # Skip common non-page extensions
                        path = link_parsed.path.lower()
                        skip_exts = ('.jpg', '.jpeg', '.png', '.gif', '.svg', '.css', '.js',
                                     '.pdf', '.zip', '.tar', '.gz', '.mp4', '.mp3', '.ico')
                        if any(path.endswith(ext) for ext in skip_exts):
                            continue

                        to_visit.append((full_url, depth + 1))

            except Exception:
                continue

            # Small delay to be respectful
            await asyncio.sleep(0.2)

    return {
        "urls": list(set(all_urls)),
        "forms": all_forms,
        "params": list(set(all_params)),
    }
