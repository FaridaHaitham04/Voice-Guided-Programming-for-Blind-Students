"""Pydantic request / response schemas for all API endpoints."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


# ── Auth ───────────────────────────────────────────────────────────────

class SignUpRequest(BaseModel):
    email: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class UserOut(BaseModel):
    email: str
    name: str
    initials: str

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    access_token: str
    user: UserOut


# ── Files ──────────────────────────────────────────────────────────────

class FileOut(BaseModel):
    filename: str
    content: str

    model_config = {"from_attributes": True}


class FileUpdateRequest(BaseModel):
    content: str


# ── Run ────────────────────────────────────────────────────────────────

class RunRequest(BaseModel):
    code: str | None = None
    filename: str | None = None


class RunResponse(BaseModel):
    output: list[str]


# ── Lessons ────────────────────────────────────────────────────────────

class AssessmentOut(BaseModel):
    name: str
    score: str | None

    model_config = {"from_attributes": True}


class LessonOut(BaseModel):
    id: str
    title: str
    file: str
    assessments: list[AssessmentOut]


# ── Chat ───────────────────────────────────────────────────────────────

class ChatMessageOut(BaseModel):
    sender: str = Field(..., alias="from")
    text: str

    model_config = {"from_attributes": True, "populate_by_name": True}


class ChatRequest(BaseModel):
    text: str
    filename: str | None = None
    cursor_line: int | None = None


class ChatResponse(BaseModel):
    reply: str
