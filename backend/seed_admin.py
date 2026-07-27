import asyncio
import os
import sys

# Ensure we can import from backend modules
sys.path.append(os.path.dirname(__file__))

from database import User, async_session, init_db
from core.security import get_password_hash
from sqlalchemy import select

async def seed_admin():
    # Make sure DB is initialized
    await init_db()
    
    async with async_session() as session:
        result = await session.execute(select(User).where(User.username == "admin@vulnerax.com"))
        if not result.scalars().first():
            hashed_pw = get_password_hash("VulneraX2026!")
            new_user = User(username="admin@vulnerax.com", hashed_password=hashed_pw)
            session.add(new_user)
            await session.commit()
            print("Admin user created successfully.")
        else:
            print("Admin user already exists.")

if __name__ == "__main__":
    asyncio.run(seed_admin())
