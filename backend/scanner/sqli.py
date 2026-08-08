import httpx
from urllib.parse import urlencode, urlparse, parse_qs
from models import VulnerabilityResult, Severity

# SQL injection test payloads
SQLI_PAYLOADS = [
    "'",
    '"',
    "' OR '1'='1",
    "1 OR 1=1",
    "admin'--",
    "' UNION SELECT NULL--",
    "1; DROP TABLE test--",
]

# Common SQL error messages indicating a vulnerability
SQL_ERRORS = {
    "mysql": [
        "you have an error in your sql syntax",
        "warning: mysql",
        "unclosed quotation mark",
        "mysql_fetch",
        "mysql_num_rows",
        "mysql_query",
    ],
    "postgresql": [
        "pg_query",
        "pg_exec",
        "postgresql",
        "unterminated quoted string",
        "syntax error at or near",
    ],
    "mssql": [
        "microsoft sql server",
        "sql server",
        "unclosed quotation mark after the character string",
        "incorrect syntax near",
    ],
    "sqlite": [
        "sqlite3.operationalerror",
        "sqlite_error",
        "unrecognized token",
        "near \"",
    ],
    "oracle": [
        "ora-01756",
        "ora-00933",
        "oracle error",
        "quoted string not properly terminated",
    ],
    "generic": [
        "sql syntax",
        "sql error",
        "syntax error",
        "database error",
        "query failed",
        "odbc drivers",
        "invalid query",
    ],
}


def detect_sql_error(response_text: str) -> str | None:
    """Check if the response contains SQL error messages."""
    text_lower = response_text.lower()
    for db_type, errors in SQL_ERRORS.items():
        for error in errors:
            if error in text_lower:
                return db_type
    return None


async def test_sqli(target: str, crawl_data: dict, headers: dict = None, cookies: dict = None) -> list[VulnerabilityResult]:
    """Test for SQL injection vulnerabilities in forms and URL parameters."""
    domain = target.replace("https://", "").replace("http://", "").strip("/").split("/")[0]
    results = []

    async with httpx.AsyncClient(timeout=10, follow_redirects=True, verify=False, headers=headers, cookies=cookies) as client:
        # Test URL parameters
        for url in crawl_data.get("params", [])[:10]:
            parsed = urlparse(url)
            params = parse_qs(parsed.query)

            for param_name in params:
                for payload in SQLI_PAYLOADS[:4]:
                    test_params = {k: v[0] if isinstance(v, list) else v for k, v in params.items()}
                    test_params[param_name] = payload
                    test_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}?{urlencode(test_params)}"

                    try:
                        resp = await client.get(test_url)
                        db_type = detect_sql_error(resp.text)

                        if db_type:
                            results.append(VulnerabilityResult(
                                name=f"SQL Injection in parameter '{param_name}'",
                                category="sqli",
                                severity=Severity.CRITICAL,
                                url=test_url,
                                payload=payload,
                                evidence=f"SQL error from {db_type} database detected in response",
                                description="The application includes user input in SQL queries without proper sanitization.",
                                recommendation="Use parameterized queries/prepared statements. Never concatenate user input into SQL.",
                            ))
                            break  # One finding per parameter
                    except Exception:
                        continue

        # Test forms
        for form in crawl_data.get("forms", [])[:5]:
            action = form["action"]
            method = form["method"]

            for inp in form["inputs"]:
                if inp["type"] in ("hidden", "submit", "button", "file", "image"):
                    continue

                for payload in SQLI_PAYLOADS[:3]:
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

                        db_type = detect_sql_error(resp.text)
                        if db_type:
                            results.append(VulnerabilityResult(
                                name=f"SQL Injection in form input '{inp['name']}'",
                                category="sqli",
                                severity=Severity.CRITICAL,
                                url=action,
                                payload=payload,
                                evidence=f"SQL error from {db_type} database detected via {method} form",
                                description="The application constructs SQL queries with unsanitized form input.",
                                recommendation="Use parameterized queries. Validate and sanitize all user input.",
                            ))
                            break
                    except Exception:
                        continue

    return results
