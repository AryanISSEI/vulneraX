import dns.resolver
import socket
import asyncio
from models import DNSResult

try:
    import whois
    HAS_WHOIS = True
except ImportError:
    HAS_WHOIS = False


async def dns_lookup(target: str) -> DNSResult:
    """Perform DNS lookups and WHOIS for a target domain."""
    result = DNSResult()

    # Clean target
    domain = target.replace("https://", "").replace("http://", "").strip("/").split("/")[0]

    # A record (IPv4)
    try:
        answers = await asyncio.to_thread(dns.resolver.resolve, domain, "A")
        if answers:
            result.ip_address = str(answers[0])
    except Exception:
        # Fallback to socket
        try:
            ip = await asyncio.to_thread(socket.gethostbyname, domain)
            result.ip_address = ip
        except Exception:
            pass

    # AAAA record (IPv6)
    try:
        answers = await asyncio.to_thread(dns.resolver.resolve, domain, "AAAA")
        if answers:
            result.ipv6_address = str(answers[0])
    except Exception:
        pass

    # MX records
    try:
        answers = await asyncio.to_thread(dns.resolver.resolve, domain, "MX")
        result.mx_records = [str(r.exchange) for r in answers]
    except Exception:
        pass

    # NS records
    try:
        answers = await asyncio.to_thread(dns.resolver.resolve, domain, "NS")
        result.nameservers = [str(r) for r in answers]
    except Exception:
        pass

    # TXT records
    try:
        answers = await asyncio.to_thread(dns.resolver.resolve, domain, "TXT")
        result.txt_records = [str(r) for r in answers][:5]  # Limit to 5
    except Exception:
        pass

    # WHOIS
    if HAS_WHOIS:
        try:
            w = await asyncio.to_thread(whois.whois, domain)
            if w:
                result.registrar = str(w.registrar or "")
                if w.country:
                    result.country = str(w.country)
        except Exception:
            pass

    # Country fallback via IP geolocation header trick
    if not result.country and result.ip_address:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"http://ip-api.com/json/{result.ip_address}?fields=country,countryCode")
                if resp.status_code == 200:
                    data = resp.json()
                    result.country = data.get("country", "")
        except Exception:
            pass

    return result
