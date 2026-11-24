"""
lessons_data.py – Constant, blind-accessible Python curriculum for BlindCode.

Loads persisted lesson content, scripts, audio metadata, line-by-line spoken
walkthroughs, starter code, expected default outputs, and practice prompts from
``lessons_data.json`` so lessons remain identical across reloads and sessions.
"""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

_APP_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _APP_DIR.parents[1]
_LESSONS_JSON_PATH = _APP_DIR / "lessons_data.json"
_LESSONS_AUDIO_DIR = _PROJECT_ROOT / "public" / "audio" / "lessons"

PRACTICE_FILES: dict[str, str] = {
    "trial.py": '# Practice in this file\nprint("hello")\n',
    "test.py": "# Quick test\nprint(1 + 1)\n",
}

LESSONS_DATA: list[dict] = json.loads(
    _LESSONS_JSON_PATH.read_text(encoding="utf-8")
)


def get_all_lessons() -> list[dict]:
    """Return a copy of all structured Python lessons."""
    return deepcopy(LESSONS_DATA)


def get_lesson_by_id(lesson_id: str) -> dict | None:
    """Return a single structured lesson by ID, or None if not found."""
    for lesson in LESSONS_DATA:
        if lesson["id"] == lesson_id:
            return deepcopy(lesson)
    return None


def get_lesson_audio_path(lesson_id: str) -> Path | None:
    """Return the pre-generated WAV path for a lesson if it exists on disk."""
    lesson = get_lesson_by_id(lesson_id)
    if lesson is None:
        return None
    candidate = _LESSONS_AUDIO_DIR / f"{lesson_id}.wav"
    if candidate.is_file():
        return candidate
    return None
