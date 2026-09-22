"""FastAPI application entry-point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    """On startup, create tables if they don't exist (dev convenience only —
    Alembic is the primary migration tool for production)."""
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="EchoCode API", version="0.1.0", lifespan=lifespan)

# ── CORS ───────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────
from app.routers.auth import router as auth_router  # noqa: E402

app.include_router(auth_router)


@app.get("/health")
def health():
    return {"status": "ok"}
