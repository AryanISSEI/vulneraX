import asyncio
import socket


async def grab_banner(ip: str, port: int, timeout: float = 3.0) -> str:
    """Attempt to grab a banner from an open port."""
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(ip, port),
            timeout=timeout
        )

        # Some services send a banner immediately
        try:
            banner = await asyncio.wait_for(reader.read(1024), timeout=2.0)
            if banner:
                writer.close()
                await writer.wait_closed()
                return banner.decode("utf-8", errors="ignore").strip()
        except asyncio.TimeoutError:
            pass

        # For HTTP services, send a basic request
        if port in (80, 8080, 8000, 8008, 8888, 3000, 5000):
            writer.write(b"HEAD / HTTP/1.0\r\nHost: target\r\n\r\n")
            await writer.drain()
            try:
                response = await asyncio.wait_for(reader.read(1024), timeout=2.0)
                writer.close()
                await writer.wait_closed()
                # Extract Server header
                resp_text = response.decode("utf-8", errors="ignore")
                for line in resp_text.split("\r\n"):
                    if line.lower().startswith("server:"):
                        return line.split(":", 1)[1].strip()
                return resp_text.split("\r\n")[0] if resp_text else ""
            except asyncio.TimeoutError:
                pass

        writer.close()
        await writer.wait_closed()

    except (asyncio.TimeoutError, ConnectionRefusedError, OSError):
        pass

    return ""


async def grab_banners(ip: str, ports: list[int]) -> dict[int, str]:
    """Grab banners for multiple ports concurrently."""
    tasks = {port: grab_banner(ip, port) for port in ports}
    results = {}
    for port, task in tasks.items():
        banner = await task
        if banner:
            results[port] = banner
    return results
