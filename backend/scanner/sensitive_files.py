import httpx
from models import VulnerabilityResult, Severity

# Sensitive files to check
SENSITIVE_FILES = [
    {
        "path": "robots.txt",
        "severity": Severity.INFO,
        "description": "Robots.txt file found. May reveal hidden paths.",
        "validate": lambda text: "user-agent" in text.lower() or "disallow" in text.lower(),
    },
    {
        "path": ".well-known/security.txt",
        "severity": Severity.INFO,
        "description": "Security.txt file found. Contains security contact information.",
        "validate": lambda text: "contact:" in text.lower(),
    },
    {
        "path": "security.txt",
        "severity": Severity.INFO,
        "description": "Security.txt file found.",
        "validate": lambda text: "contact:" in text.lower(),
    },
    {
        "path": ".env",
        "severity": Severity.CRITICAL,
        "description": "Environment file exposed! May contain API keys, database credentials, and secrets.",
        "validate": lambda text: "=" in text and any(kw in text.upper() for kw in ["KEY", "SECRET", "PASSWORD", "DATABASE", "DB_"]),
    },
    {
        "path": ".git/HEAD",
        "severity": Severity.HIGH,
        "description": "Git repository exposed! Source code and commit history may be accessible.",
        "validate": lambda text: text.strip().startswith("ref:") or len(text.strip()) == 40,
    },
    {
        "path": ".git/config",
        "severity": Severity.HIGH,
        "description": "Git config exposed! May reveal repository origin and contributor info.",
        "validate": lambda text: "[core]" in text or "[remote" in text,
    },
    {
        "path": "backup.zip",
        "severity": Severity.HIGH,
        "description": "Backup archive found! May contain source code and sensitive data.",
        "validate": lambda text: False,  # Check via content-type or status only
    },
    {
        "path": "config.php",
        "severity": Severity.HIGH,
        "description": "PHP config file exposed! May contain database credentials.",
        "validate": lambda text: "<?php" in text or "mysql" in text.lower(),
    },
    {
        "path": "phpinfo.php",
        "severity": Severity.MEDIUM,
        "description": "PHP info page exposed! Reveals server configuration details.",
        "validate": lambda text: "phpinfo()" in text.lower() or "php version" in text.lower(),
    },
    {
        "path": "wp-config.php",
        "severity": Severity.CRITICAL,
        "description": "WordPress config exposed! Contains database credentials and auth keys.",
        "validate": lambda text: "DB_NAME" in text or "DB_PASSWORD" in text,
    },
    {
        "path": ".htaccess",
        "severity": Severity.MEDIUM,
        "description": "Apache .htaccess file exposed! Reveals server configuration rules.",
        "validate": lambda text: "rewrite" in text.lower() or "deny" in text.lower() or "allow" in text.lower(),
    },
    {
        "path": "server-status",
        "severity": Severity.MEDIUM,
        "description": "Apache server-status page exposed! Shows active connections and server info.",
        "validate": lambda text: "apache" in text.lower() and "server" in text.lower(),
    },
    {
        "path": "web.config",
        "severity": Severity.MEDIUM,
        "description": "IIS web.config file exposed! Reveals server configuration.",
        "validate": lambda text: "<configuration>" in text.lower(),
    },
]


async def check_sensitive_files(target: str, headers: dict = None, cookies: dict = None) -> list[VulnerabilityResult]:
    """Check for commonly exposed sensitive files."""
    domain = target.replace("https://", "").replace("http://", "").strip("/").split("/")[0]
    results = []

    base_urls = [f"https://{domain}", f"http://{domain}"]

    async with httpx.AsyncClient(timeout=8, follow_redirects=False, verify=False, headers=headers, cookies=cookies) as client:
        for base_url in base_urls:
            try:
                # Test connectivity first
                await client.get(base_url)
            except Exception:
                continue

            for file_info in SENSITIVE_FILES:
                url = f"{base_url}/{file_info['path']}"

                try:
                    resp = await client.get(url)

                    # Skip 404, 403, 500 etc.
                    if resp.status_code not in (200, 301):
                        continue

                    # For binary files, just check status
                    if file_info["path"].endswith(".zip"):
                        content_type = resp.headers.get("content-type", "")
                        if "application" in content_type and resp.status_code == 200:
                            results.append(VulnerabilityResult(
                                name=f"Sensitive File: {file_info['path']}",
                                category="sensitive_file",
                                severity=file_info["severity"],
                                url=url,
                                evidence=f"File accessible (HTTP {resp.status_code}), Content-Type: {content_type}",
                                description=file_info["description"],
                                recommendation="Remove or restrict access to sensitive files. Configure web server to deny access.",
                            ))
                        continue

                    # Validate content
                    text = resp.text
                    if file_info["validate"](text):
                        results.append(VulnerabilityResult(
                            name=f"Sensitive File: {file_info['path']}",
                            category="sensitive_file",
                            severity=file_info["severity"],
                            url=url,
                            evidence=f"File accessible (HTTP {resp.status_code}) with valid content",
                            description=file_info["description"],
                            recommendation="Remove or restrict access to this file. Configure web server deny rules.",
                        ))

                except Exception:
                    continue

            break  # Only test first working base URL

    return results
