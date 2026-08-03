import asyncio
from sqlalchemy import select
import bcrypt
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import init_db, User, async_session

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

async def create_user(username="admin", password="VulneraX_Admin!2026"):
    await init_db()
    async with async_session() as session:
        result = await session.execute(select(User).where(User.username == username))
        user = result.scalars().first()
        hashed_password = get_password_hash(password)
        if not user:
            new_user = User(username=username, hashed_password=hashed_password)
            session.add(new_user)
            await session.commit()
            print(f"User '{username}' created successfully.")
        else:
            user.hashed_password = hashed_password
            await session.commit()
            print(f"User '{username}' password updated successfully.")

if __name__ == "__main__":
    username = sys.argv[1] if len(sys.argv) > 1 else "admin"
    password = sys.argv[2] if len(sys.argv) > 2 else "VulneraX_Admin!2026"
    asyncio.run(create_user(username, password))
