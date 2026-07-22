import aiosqlite
import os
import json

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "scans")
DB_PATH = os.path.join(DB_DIR, "VulneraX.db")


async def init_db():
    """Initialize the database and create tables if they don't exist."""
    os.makedirs(DB_DIR, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS scans (
                id TEXT PRIMARY KEY,
                target TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                current_phase TEXT DEFAULT '',
                results_json TEXT DEFAULT '{}',
                risk_score INTEGER DEFAULT 100
            )
        """)
        await db.commit()


async def save_scan(scan_id: str, target: str, timestamp: str, status: str = "pending",
                     current_phase: str = "", results_json: str = "{}", risk_score: int = 100):
    """Insert or update a scan record."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO scans (id, target, timestamp, status, current_phase, results_json, risk_score)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                current_phase = excluded.current_phase,
                results_json = excluded.results_json,
                risk_score = excluded.risk_score
        """, (scan_id, target, timestamp, status, current_phase, results_json, risk_score))
        await db.commit()


async def get_scan(scan_id: str) -> dict | None:
    """Retrieve a single scan by ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM scans WHERE id = ?", (scan_id,)) as cursor:
            row = await cursor.fetchone()
            if row:
                return dict(row)
    return None


async def get_all_scans() -> list[dict]:
    """Retrieve all scans ordered by timestamp descending."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, target, timestamp, status, risk_score FROM scans ORDER BY timestamp DESC"
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


async def update_scan_status(scan_id: str, status: str, current_phase: str = ""):
    """Update the status and current phase of a scan."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE scans SET status = ?, current_phase = ? WHERE id = ?",
            (status, current_phase, scan_id)
        )
        await db.commit()


async def update_scan_results(scan_id: str, results_json: str, risk_score: int, status: str = "completed"):
    """Update scan results and risk score."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE scans SET results_json = ?, risk_score = ?, status = ? WHERE id = ?",
            (results_json, risk_score, status, scan_id)
        )
        await db.commit()
