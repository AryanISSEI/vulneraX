import ssl
import socket
import asyncio
from datetime import datetime
from models import SSLResult


async def scan_ssl(target: str) -> SSLResult:
    """Scan SSL/TLS configuration of the target."""
    domain = target.replace("https://", "").replace("http://", "").strip("/").split("/")[0]
    result = SSLResult()

    try:
        # Create SSL context
        context = ssl.create_default_context()

        def _do_ssl_scan():
            """Synchronous SSL scan to run in thread."""
            conn = context.wrap_socket(
                socket.socket(socket.AF_INET, socket.SOCK_STREAM),
                server_hostname=domain
            )
            conn.settimeout(10)
            conn.connect((domain, 443))

            # Get certificate info
            cert = conn.getpeercert()
            cipher = conn.cipher()
            tls_version = conn.version()

            conn.close()
            return cert, cipher, tls_version

        cert, cipher, tls_version = await asyncio.to_thread(_do_ssl_scan)

        # TLS version
        result.tls_version = tls_version or ""

        # Cipher info
        if cipher:
            result.cipher_name = cipher[0]
            # Check for weak ciphers
            weak_ciphers = ["RC4", "DES", "3DES", "MD5", "NULL", "EXPORT", "anon"]
            result.weak_cipher = any(w.lower() in cipher[0].lower() for w in weak_ciphers)

        # Certificate details
        if cert:
            # Issuer
            issuer_parts = []
            for item in cert.get("issuer", []):
                for key, value in item:
                    if key in ("organizationName", "commonName"):
                        issuer_parts.append(value)
            result.issuer = ", ".join(issuer_parts) if issuer_parts else ""

            # Subject
            subject_parts = []
            for item in cert.get("subject", []):
                for key, value in item:
                    if key == "commonName":
                        subject_parts.append(value)
            result.subject = ", ".join(subject_parts) if subject_parts else ""

            # Serial number
            result.serial_number = cert.get("serialNumber", "")

            # Expiry
            not_after = cert.get("notAfter", "")
            if not_after:
                result.expires = not_after
                try:
                    expiry_date = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z")
                    result.days_remaining = (expiry_date - datetime.utcnow()).days
                except ValueError:
                    pass

            # Issues
            if result.days_remaining <= 0:
                result.issues.append("Certificate has expired!")
            elif result.days_remaining <= 30:
                result.issues.append(f"Certificate expires in {result.days_remaining} days")

            if result.weak_cipher:
                result.issues.append(f"Weak cipher detected: {result.cipher_name}")

            if tls_version and "TLSv1.0" in tls_version:
                result.issues.append("TLS 1.0 is deprecated and insecure")
            if tls_version and "TLSv1.1" in tls_version:
                result.issues.append("TLS 1.1 is deprecated and insecure")
            if tls_version and "SSLv" in tls_version:
                result.issues.append("SSL is deprecated and insecure")

    except ssl.SSLError as e:
        result.issues.append(f"SSL Error: {str(e)}")
    except socket.timeout:
        result.issues.append("Connection timed out - port 443 may not be open")
    except ConnectionRefusedError:
        result.issues.append("Connection refused - HTTPS not available")
    except Exception as e:
        result.issues.append(f"Could not perform SSL scan: {str(e)}")

    return result
