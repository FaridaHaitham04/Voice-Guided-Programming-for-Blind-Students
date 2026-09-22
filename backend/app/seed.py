"""Seed default data for a newly signed-up user.

Creates the five starter code files, three lessons with assessments,
initial chat messages, and lesson chunks (for RAG) — matching the
current hardcoded frontend data exactly.
"""

from sqlalchemy.orm import Session

from app.models import Assessment, ChatMessage, CodeFile, Lesson, LessonChunk

# ── Default file contents (matches frontend FILES object) ──────────────

DEFAULT_FILES: dict[str, str] = {
    "lesson1.py": '# Store a name, then print it\nname = "Ada"\nprint(name)\n',
    "lesson2.py": "# Print each number from 1 to 5\nfor number in range(1, 6):\n    print(number)\n",
    "lesson3.py": "# Count down with a while loop\ncount = 3\nwhile count > 0:\n    print(count)\n    count = count - 1\n",
    "trial.py": '# Practice in this file\nprint("hello")\n',
    "test.py": "# Quick test\nprint(1 + 1)\n",
}

# ── Default lessons / assessments (matches frontend LESSONS array) ─────

DEFAULT_LESSONS = [
    {
        "lesson_key": "lesson-1",
        "title": "Lesson 1 \u00b7 Variables",
        "file": "lesson1.py",
        "assessments": [
            {"name": "Assessment 1", "score": "9/10"},
            {"name": "Assessment 2", "score": "10/10"},
        ],
    },
    {
        "lesson_key": "lesson-2",
        "title": "Lesson 2 \u00b7 For loops",
        "file": "lesson2.py",
        "assessments": [
            {"name": "Assessment 1", "score": "8/10"},
            {"name": "Assessment 2", "score": None},
        ],
    },
    {
        "lesson_key": "lesson-3",
        "title": "Lesson 3 \u00b7 While loops",
        "file": "lesson3.py",
        "assessments": [
            {"name": "Assessment 1", "score": None},
            {"name": "Assessment 2", "score": None},
        ],
    },
]

# ── Default chat messages (matches frontend INITIAL_CHAT array) ────────

DEFAULT_CHAT = [
    {
        "sender": "ai",
        "text": "Line 3 prints each value of number as the loop runs. Want me to read the output aloud?",
    },
    {"sender": "you", "text": "Yes, read it out."},
    {
        "sender": "ai",
        "text": "Output: one, two, three, four, five \u2014 five lines total, counted correctly.",
    },
]


def seed_user_data(user_id: int, db: Session) -> None:
    """Populate default files, lessons, assessments, chat, and chunks for *user_id*."""

    # ── Files ──────────────────────────────────────────────────────────
    for filename, content in DEFAULT_FILES.items():
        db.add(CodeFile(user_id=user_id, filename=filename, content=content))

    # ── Lessons + Assessments ──────────────────────────────────────────
    for lesson_data in DEFAULT_LESSONS:
        lesson = Lesson(
            user_id=user_id,
            lesson_key=lesson_data["lesson_key"],
            title=lesson_data["title"],
            file=lesson_data["file"],
        )
        db.add(lesson)
        db.flush()  # get lesson.id

        for assessment_data in lesson_data["assessments"]:
            db.add(
                Assessment(
                    lesson_id=lesson.id,
                    name=assessment_data["name"],
                    score=assessment_data["score"],
                )
            )

        # ── Lesson chunks (for RAG) ───────────────────────────────────
        # Extract chunks from the associated file content.
        file_content = DEFAULT_FILES.get(lesson_data["file"], "")
        if file_content.strip():
            db.add(
                LessonChunk(
                    lesson_id=lesson.id,
                    content=f"{lesson_data['title']}\n\n{file_content}",
                    embedding=None,  # Computed lazily on first RAG call
                )
            )

    # ── Chat messages ──────────────────────────────────────────────────
    for msg in DEFAULT_CHAT:
        db.add(ChatMessage(user_id=user_id, sender=msg["sender"], text=msg["text"]))

    db.commit()
