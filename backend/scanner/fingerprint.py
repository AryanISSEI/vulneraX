import httpx
from bs4 import BeautifulSoup
from models import FingerprintResult


# Technology signatures in headers and HTML
TECH_SIGNATURES = {
    "headers": {
        "X-Powered-By": {
            "PHP": "PHP",
            "Express": "Express",
            "ASP.NET": "ASP.NET",
            "Next.js": "Next.js",
        },
        "Server": {
            "Apache": "Apache",
            "nginx": "Nginx",
            "Microsoft-IIS": "IIS",
            "LiteSpeed": "LiteSpeed",
            "Cloudflare": "Cloudflare",
            "gunicorn": "Gunicorn",
            "Caddy": "Caddy",
        },
        "X-Generator": {
            "WordPress": "WordPress",
            "Drupal": "Drupal",
            "Joomla": "Joomla",
        },
    },
    "meta": {
        "generator": {
            "WordPress": "WordPress",
            "Drupal": "Drupal",
            "Joomla": "Joomla",
            "Hugo": "Hugo",
            "Jekyll": "Jekyll",
            "Ghost": "Ghost",
        }
    },
    "html_patterns": {
        "wp-content": "WordPress",
        "wp-includes": "WordPress",
        "/drupal": "Drupal",
        "joomla": "Joomla",
        "react": "React",
        "__next": "Next.js",
        "__nuxt": "Nuxt.js",
        "angular": "Angular",
        "vue": "Vue.js",
        "svelte": "Svelte",
        "laravel": "Laravel",
        "django": "Django",
        "flask": "Flask",
        "rails": "Ruby on Rails",
        "bootstrap": "Bootstrap",
        "tailwind": "Tailwind CSS",
        "jquery": "jQuery",
    }
}


async def fingerprint(target: str) -> FingerprintResult:
    """Detect web technologies used by the target."""
    result = FingerprintResult()
    domain = target.replace("https://", "").replace("http://", "").strip("/").split("/")[0]

    # Try HTTPS first, then HTTP
    urls = [f"https://{domain}", f"http://{domain}"]

    for url in urls:
        try:
            async with httpx.AsyncClient(
                timeout=10,
                follow_redirects=True,
                verify=False
            ) as client:
                resp = await client.get(url)

                # Check headers
                for header_name, signatures in TECH_SIGNATURES["headers"].items():
                    header_val = resp.headers.get(header_name, "")
                    if header_val:
                        for sig, tech in signatures.items():
                            if sig.lower() in header_val.lower():
                                if tech not in result.technologies:
                                    result.technologies.append(tech)

                # Extract server
                server = resp.headers.get("Server", "")
                if server:
                    result.server = server

                # Parse HTML
                html = resp.text
                soup = BeautifulSoup(html, "html.parser")

                # Check meta generator
                gen_meta = soup.find("meta", attrs={"name": "generator"})
                if gen_meta and gen_meta.get("content"):
                    gen_val = gen_meta["content"]
                    for sig, tech in TECH_SIGNATURES["meta"]["generator"].items():
                        if sig.lower() in gen_val.lower():
                            result.cms = tech
                            if tech not in result.technologies:
                                result.technologies.append(tech)

                # Check HTML patterns
                html_lower = html.lower()
                for pattern, tech in TECH_SIGNATURES["html_patterns"].items():
                    if pattern in html_lower and tech not in result.technologies:
                        result.technologies.append(tech)

                # Check script sources for frameworks
                for script in soup.find_all("script", src=True):
                    src = script["src"].lower()
                    for pattern, tech in TECH_SIGNATURES["html_patterns"].items():
                        if pattern in src and tech not in result.frameworks:
                            result.frameworks.append(tech)

                break  # Success, don't try the other URL

        except Exception:
            continue

    return result
