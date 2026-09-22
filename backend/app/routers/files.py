"""File management endpoints: list, get, and update user code files."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import CodeFile, User
from app.schemas import FileOut, FileUpdateRequest

router = APIRouter(tags=["files"])


@router.get("/files", response_model=list[FileOut])
def list_files(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return every code file owned by the authenticated user."""
    rows = (
        db.query(CodeFile)
        .filter(CodeFile.user_id == current_user.id)
        .order_by(CodeFile.filename)
        .all()
    )
    return [FileOut(filename=f.filename, content=f.content) for f in rows]


@router.get("/files/{filename}", response_model=FileOut)
def get_file(
    filename: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the content of a single file."""
    row = (
        db.query(CodeFile)
        .filter(CodeFile.user_id == current_user.id, CodeFile.filename == filename)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")
    return FileOut(filename=row.filename, content=row.content)


@router.put("/files/{filename}", response_model=FileOut)
def update_file(
    filename: str,
    body: FileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update (or create) a code file."""
    row = (
        db.query(CodeFile)
        .filter(CodeFile.user_id == current_user.id, CodeFile.filename == filename)
        .first()
    )
    if row:
        row.content = body.content
    else:
        row = CodeFile(user_id=current_user.id, filename=filename, content=body.content)
        db.add(row)
    db.commit()
    db.refresh(row)
    return FileOut(filename=row.filename, content=row.content)
