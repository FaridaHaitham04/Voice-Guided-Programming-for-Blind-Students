"""FastAPI application entry-point."""

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
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
from app.routers.files import router as files_router  # noqa: E402
from app.routers.run import router as run_router  # noqa: E402
from app.routers.lessons import router as lessons_router  # noqa: E402
from app.routers.chat import router as chat_router  # noqa: E402

app.include_router(auth_router)
app.include_router(files_router)
app.include_router(run_router)
app.include_router(lessons_router)
app.include_router(chat_router)


@app.get("/health")
def health():
    return {"status": "ok"}


# ── GET /me (top-level, not under /auth prefix) ───────────────────────
from app.auth import get_current_user, initials_from_name  # noqa: E402
from app.models import User  # noqa: E402
from app.schemas import UserOut  # noqa: E402


@app.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return UserOut(
        email=current_user.email,
        name=current_user.name,
        initials=initials_from_name(current_user.name),
    )

