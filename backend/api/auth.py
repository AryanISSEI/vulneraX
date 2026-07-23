from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from core.security import verify_password, get_password_hash, create_access_token, get_current_user
from database import User, async_session
from sqlalchemy import select

router = APIRouter()

class UserAuth(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

@router.post("/register", response_model=Token)
async def register(user: UserAuth):
    async with async_session() as session:
        result = await session.execute(select(User).where(User.username == user.username))
        if result.scalars().first():
            raise HTTPException(status_code=400, detail="Username already registered")
        
        hashed_pw = get_password_hash(user.password)
        new_user = User(username=user.username, hashed_password=hashed_pw)
        session.add(new_user)
        await session.commit()
        await session.refresh(new_user)
        
        access_token = create_access_token(data={"sub": str(new_user.id)})
        return {"access_token": access_token, "token_type": "bearer"}

@router.post("/login", response_model=Token)
async def login(user: UserAuth):
    async with async_session() as session:
        result = await session.execute(select(User).where(User.username == user.username))
        db_user = result.scalars().first()
        if not db_user or not verify_password(user.password, db_user.hashed_password):
            raise HTTPException(status_code=401, detail="Incorrect username or password")
        
        access_token = create_access_token(data={"sub": str(db_user.id)})
        return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me")
async def get_me(user_id: int = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return {"id": user.id, "username": user.username}
