import asyncio
from sqlalchemy import select
from passlib.context import CryptContext
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import init_db, User, async_session

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

async def seed_admin():
    await init_db()
    async with async_session() as session:
        result = await session.execute(select(User).where(User.username == "admin"))
        admin = result.scalars().first()
        new_password = "VulneraX_Admin!2026"
        hashed_password = get_password_hash(new_password)
        if not admin:
            new_admin = User(username="admin", hashed_password=hashed_password)
            session.add(new_admin)
            await session.commit()
            print("Admin user created successfully.")
        else:
            admin.hashed_password = hashed_password
            await session.commit()
            print("Admin user password updated successfully.")

if __name__ == "__main__":
    asyncio.run(seed_admin())
