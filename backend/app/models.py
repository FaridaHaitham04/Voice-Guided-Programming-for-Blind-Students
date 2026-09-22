"""SQLAlchemy ORM models for the EchoCode database."""

from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    JSON,
)
from sqlalchemy.orm import relationship

from app.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=_utcnow)

    files = relationship("CodeFile", back_populates="owner", cascade="all, delete-orphan")
    lessons = relationship("Lesson", back_populates="owner", cascade="all, delete-orphan")
    messages = relationship("ChatMessage", back_populates="owner", cascade="all, delete-orphan")


class CodeFile(Base):
    __tablename__ = "code_files"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    content = Column(Text, nullable=False, default="")
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    owner = relationship("User", back_populates="files")


class Lesson(Base):
    __tablename__ = "lessons"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    lesson_key = Column(String(50), nullable=False)  # e.g. "lesson-1"
    title = Column(String(255), nullable=False)
    file = Column(String(255), nullable=False)

    owner = relationship("User", back_populates="lessons")
    assessments = relationship("Assessment", back_populates="lesson", cascade="all, delete-orphan")


class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(Integer, primary_key=True, index=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=False)
    name = Column(String(255), nullable=False)
    score = Column(String(20), nullable=True)

    lesson = relationship("Lesson", back_populates="assessments")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    sender = Column(String(10), nullable=False)  # "you" or "ai"
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=_utcnow)

    owner = relationship("User", back_populates="messages")


class LessonChunk(Base):
    __tablename__ = "lesson_chunks"

    id = Column(Integer, primary_key=True, index=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(JSON, nullable=True)  # list of floats, stored as JSON

    lesson = relationship("Lesson")
