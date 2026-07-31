import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
import datetime
from sqlalchemy.orm import relationship

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///../scans/VulneraX.db")

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(128), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    scans = relationship("Scan", back_populates="user", cascade="all, delete-orphan")

class Scan(Base):
    __tablename__ = "scans"
    id = Column(String(36), primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    target = Column(String, nullable=False)
    timestamp = Column(String, nullable=False)
    status = Column(String, default="pending")
    current_phase = Column(String, default="")
    results_json = Column(Text, default="{}")
    risk_score = Column(Integer, default=100)

    user = relationship("User", back_populates="scans")

async def init_db():
    if "sqlite" in DATABASE_URL:
        os.makedirs(os.path.join(os.path.dirname(os.path.dirname(__file__)), "scans"), exist_ok=True)
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def save_scan(scan_id: str, target: str, timestamp: str, status: str = "pending",
                     current_phase: str = "", results_json: str = "{}", risk_score: int = 100, user_id: int = None):
    async with async_session() as session:
        scan = await session.get(Scan, scan_id)
        if not scan:
            scan = Scan(
                id=scan_id,
                target=target,
                timestamp=timestamp,
                status=status,
                current_phase=current_phase,
                results_json=results_json,
                risk_score=risk_score,
                user_id=user_id
            )
            session.add(scan)
        else:
            scan.status = status
            scan.current_phase = current_phase
            scan.results_json = results_json
            scan.risk_score = risk_score
        await session.commit()

async def get_scan(scan_id: str) -> dict | None:
    from sqlalchemy import select
    async with async_session() as session:
        result = await session.execute(select(Scan).where(Scan.id == scan_id))
        scan = result.scalars().first()
        if scan:
            return {
                "id": scan.id,
                "target": scan.target,
                "timestamp": scan.timestamp,
                "status": scan.status,
                "current_phase": scan.current_phase,
                "results_json": scan.results_json,
                "risk_score": scan.risk_score,
                "user_id": scan.user_id
            }
    return None

async def get_all_scans(user_id: int = None) -> list[dict]:
    from sqlalchemy import select
    async with async_session() as session:
        stmt = select(Scan).order_by(Scan.timestamp.desc())
        if user_id is not None:
            stmt = stmt.where(Scan.user_id == user_id)
            
        result = await session.execute(stmt)
        scans = result.scalars().all()
        return [
            {
                "id": s.id,
                "target": s.target,
                "timestamp": s.timestamp,
                "status": s.status,
                "risk_score": s.risk_score,
                "user_id": s.user_id
            }
            for s in scans
        ]

async def update_scan_status(scan_id: str, status: str, current_phase: str = ""):
    from sqlalchemy import update
    async with async_session() as session:
        stmt = update(Scan).where(Scan.id == scan_id).values(status=status, current_phase=current_phase)
        await session.execute(stmt)
        await session.commit()

async def update_scan_results(scan_id: str, results_json: str, risk_score: int, status: str = "completed"):
    from sqlalchemy import update
    async with async_session() as session:
        stmt = update(Scan).where(Scan.id == scan_id).values(results_json=results_json, risk_score=risk_score, status=status)
        await session.execute(stmt)
        await session.commit()

async def delete_scan(scan_id: str) -> bool:
    from sqlalchemy import delete
    async with async_session() as session:
        stmt = delete(Scan).where(Scan.id == scan_id)
        result = await session.execute(stmt)
        await session.commit()
        return result.rowcount > 0
