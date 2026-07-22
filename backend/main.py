from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from database import init_db
from api.scan import router as scan_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: initialize DB on startup."""
    await init_db()
    # Ensure reports directory exists
    os.makedirs(os.path.join(os.path.dirname(os.path.dirname(__file__)), "reports"), exist_ok=True)
    yield


app = FastAPI(
    title="VulneraX API",
    description="AI-Powered Security Assessment Platform",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(scan_router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "VulneraX API v1.0.0", "status": "running"}
