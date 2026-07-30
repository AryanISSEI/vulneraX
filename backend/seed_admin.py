import asyncio
from sqlalchemy import select
import bcrypt
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import init_db, User, async_session

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

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
