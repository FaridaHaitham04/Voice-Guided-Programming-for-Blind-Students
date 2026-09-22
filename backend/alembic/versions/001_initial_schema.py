"""initial schema

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # ── code_files ─────────────────────────────────────────────────────
    op.create_table(
        "code_files",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    # ── lessons ────────────────────────────────────────────────────────
    op.create_table(
        "lessons",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("lesson_key", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("file", sa.String(255), nullable=False),
    )

    # ── assessments ────────────────────────────────────────────────────
    op.create_table(
        "assessments",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("lesson_id", sa.Integer, sa.ForeignKey("lessons.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("score", sa.String(20), nullable=True),
    )

    # ── chat_messages ──────────────────────────────────────────────────
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("sender", sa.String(10), nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── lesson_chunks ──────────────────────────────────────────────────
    op.create_table(
        "lesson_chunks",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("lesson_id", sa.Integer, sa.ForeignKey("lessons.id"), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("embedding", sa.JSON, nullable=True),
    )


def downgrade() -> None:
    op.drop_table("lesson_chunks")
    op.drop_table("chat_messages")
    op.drop_table("assessments")
    op.drop_table("lessons")
    op.drop_table("code_files")
    op.drop_index("ix_users_email", "users")
    op.drop_table("users")
