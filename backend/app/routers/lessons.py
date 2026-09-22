"""Lesson listing endpoint."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Lesson, User
from app.schemas import AssessmentOut, LessonOut

router = APIRouter(tags=["lessons"])


@router.get("/lessons", response_model=list[LessonOut])
def list_lessons(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all lessons with assessments for the current user."""
    lessons = (
        db.query(Lesson)
        .filter(Lesson.user_id == current_user.id)
        .order_by(Lesson.id)
        .all()
    )
    result = []
    for lesson in lessons:
        assessments = [
            AssessmentOut(name=a.name, score=a.score)
            for a in lesson.assessments
        ]
        result.append(
            LessonOut(
                id=lesson.lesson_key,
                title=lesson.title,
                file=lesson.file,
                assessments=assessments,
            )
        )
    return result
