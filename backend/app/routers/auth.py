"""Authentication endpoints: signup, login, and /me."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    initials_from_name,
    verify_password,
)
from app.database import get_db
from app.models import User
from app.schemas import AuthResponse, LoginRequest, SignUpRequest, UserOut
from app.seed import seed_user_data

router = APIRouter(prefix="/auth", tags=["auth"])


def _initials_from_email(email: str) -> str:
    """Derive 2-letter initials from the local part of an email."""
    local = email.split("@")[0] or "ec"
    import re
    parts = [p for p in re.split(r"[._\-]+", local) if p]
    if len(parts) >= 2:
        return (parts[0][0] + parts[1][0]).upper()
    return local[:2].upper()


@router.post("/signup", response_model=AuthResponse)
def signup(body: SignUpRequest, db: Session = Depends(get_db)):
    """Create a new user account and return a JWT."""
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(
        name=body.name.strip(),
        email=body.email.strip().lower(),
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Seed default files, lessons, assessments, chat, and lesson chunks
    seed_user_data(user.id, db)

    token = create_access_token({"sub": str(user.id)})
    return AuthResponse(
        access_token=token,
        user=UserOut(
            email=user.email,
            name=user.name,
            initials=initials_from_name(user.name),
        ),
    )


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate with email + password and return a JWT."""
    user = db.query(User).filter(User.email == body.email.strip().lower()).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Wrong email or password.",
        )

    token = create_access_token({"sub": str(user.id)})
    return AuthResponse(
        access_token=token,
        user=UserOut(
            email=user.email,
            name=user.name,
            initials=initials_from_name(user.name),
        ),
    )

