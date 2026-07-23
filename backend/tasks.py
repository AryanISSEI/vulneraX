import asyncio
from core.celery_app import celery

# We import run_scan_logic inline to avoid circular imports during celery init if needed
# Actually it's safe to import here as long as scan doesn't import tasks at module level in a cyclic way.
# I'll just import it.

from api.scan import run_scan_logic

@celery.task(name="tasks.run_scan_task")
def run_scan_task(scan_id: str, target: str, user_id: int = None):
    """Celery task wrapper for running a scan."""
    asyncio.run(run_scan_logic(scan_id, target, user_id))
