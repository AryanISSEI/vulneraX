import asyncio
import socket
import time
from models import PortResult

# Try to import nmap
try:
    import nmap
    HAS_NMAP = True
except ImportError:
    HAS_NMAP = False

# Top 100 common ports
TOP_PORTS = [
    21, 22, 23, 25, 26, 53, 80, 81, 88, 110,
    111, 113, 119, 135, 139, 143, 161, 179, 199, 443,
    445, 465, 514, 515, 548, 554, 587, 631, 636, 646,
    873, 990, 993, 995, 1025, 1026, 1027, 1028, 1029, 1110,
    1433, 1434, 1521, 1720, 1723, 2000, 2001, 2049, 2121, 2717,
    3000, 3128, 3306, 3389, 3986, 4000, 4001, 4899, 5000, 5001,
    5003, 5009, 5050, 5051, 5060, 5101, 5190, 5357, 5432, 5631,
    5666, 5800, 5900, 5901, 6000, 6001, 6379, 6646, 7070, 8000,
    8008, 8009, 8080, 8081, 8443, 8888, 9000, 9090, 9100, 9200,
    9999, 10000, 10243, 11211, 27017, 27018, 28017, 32768, 49152, 49153,
]

COMMON_SERVICES = {
    21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP", 53: "DNS",
    80: "HTTP", 81: "HTTP-Alt", 88: "Kerberos", 110: "POP3", 111: "RPCBind",
    119: "NNTP", 135: "MSRPC", 139: "NetBIOS", 143: "IMAP", 161: "SNMP",
    179: "BGP", 443: "HTTPS", 445: "SMB", 465: "SMTPS", 514: "Syslog",
    548: "AFP", 554: "RTSP", 587: "SMTP-Sub", 631: "IPP", 636: "LDAPS",
    873: "Rsync", 990: "FTPS", 993: "IMAPS", 995: "POP3S",
    1433: "MSSQL", 1434: "MSSQL-M", 1521: "Oracle", 1723: "PPTP",
    2049: "NFS", 3000: "Node.js", 3128: "Squid", 3306: "MySQL",
    3389: "RDP", 5000: "Flask", 5432: "PostgreSQL", 5900: "VNC",
    6379: "Redis", 8000: "HTTP-Alt", 8008: "HTTP-Alt", 8080: "HTTP-Proxy",
    8443: "HTTPS-Alt", 8888: "HTTP-Alt", 9000: "PHP-FPM", 9090: "Prometheus",
    9200: "Elasticsearch", 10000: "Webmin", 11211: "Memcached",
    27017: "MongoDB", 27018: "MongoDB",
}


async def scan_port_socket(ip: str, port: int, timeout: float = 2.0) -> PortResult | None:
    """Scan a single port using raw socket connection."""
    start = time.monotonic()
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(ip, port),
            timeout=timeout
        )
        elapsed = (time.monotonic() - start) * 1000
        writer.close()
        await writer.wait_closed()

        service = COMMON_SERVICES.get(port, "unknown")
        return PortResult(
            port=port,
            state="open",
            service=service,
            response_time_ms=round(elapsed, 2)
        )
    except (asyncio.TimeoutError, ConnectionRefusedError, OSError):
        return None


async def scan_ports_socket(ip: str, ports: list[int] = None) -> list[PortResult]:
    """Scan multiple ports using async sockets (fallback when nmap unavailable)."""
    if ports is None:
        ports = TOP_PORTS

    # Scan in batches to avoid overwhelming the target
    batch_size = 20
    results = []

    for i in range(0, len(ports), batch_size):
        batch = ports[i:i + batch_size]
        tasks = [scan_port_socket(ip, port) for port in batch]
        batch_results = await asyncio.gather(*tasks)
        results.extend([r for r in batch_results if r is not None])

    return sorted(results, key=lambda r: r.port)


async def scan_ports_nmap(ip: str) -> list[PortResult]:
    """Scan ports using python-nmap for better service detection."""
    results = []
    try:
        nm = nmap.PortScanner()
        # Run nmap in a thread to avoid blocking
        await asyncio.to_thread(
            nm.scan, ip, arguments="-sV --top-ports 100 -T4 --open"
        )

        for host in nm.all_hosts():
            for proto in nm[host].all_protocols():
                ports = nm[host][proto].keys()
                for port in sorted(ports):
                    port_info = nm[host][proto][port]
                    if port_info["state"] == "open":
                        service = port_info.get("name", COMMON_SERVICES.get(port, "unknown"))
                        version = port_info.get("version", "")
                        product = port_info.get("product", "")
                        banner = f"{product} {version}".strip()

                        results.append(PortResult(
                            port=port,
                            state="open",
                            service=service,
                            banner=banner,
                        ))
    except Exception as e:
        # If nmap fails, fall back to socket scanning
        results = await scan_ports_socket(ip)

    return results


async def scan_ports(ip: str) -> list[PortResult]:
    """Main port scanning function. Uses nmap if available, falls back to sockets."""
    if HAS_NMAP:
        try:
            return await scan_ports_nmap(ip)
        except Exception:
            pass

    return await scan_ports_socket(ip)
