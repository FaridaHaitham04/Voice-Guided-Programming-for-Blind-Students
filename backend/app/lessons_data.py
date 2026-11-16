"""
lessons_data.py – Structured, blind-accessible Python curriculum for BlindCode.

Provides lesson content, line-by-line spoken walkthroughs, starter code,
expected default outputs, and practice prompts served via GET /api/lessons
and GET /api/lessons/{lesson_id}.
"""

from __future__ import annotations

from copy import deepcopy

PRACTICE_FILES: dict[str, str] = {
    "trial.py": '# Practice in this file\nprint("hello")\n',
    "test.py": "# Quick test\nprint(1 + 1)\n",
}

LESSONS_DATA: list[dict] = [
    {
        "id": "lesson-1",
        "title": "Lesson 1 · Variables",
        "file": "lesson1.py",
        "summary": "Store a piece of text or a number inside a labeled variable and print it out.",
        "concept_explanation": (
            "Think of a variable like a labeled jar on your desk where you can tuck away a piece of information to reuse later. "
            "On the left side of the equals sign, you write the label name, and on the right side you put the value you want to store. "
            "Whenever you pass that label into the print command, Python opens the jar and speaks out whatever is inside."
        ),
        "objectives": [
            "Create a string variable using a label, an equals sign, and quotation marks.",
            "Print the value stored inside a variable using print(name).",
            "Change a variable's value and run the file to hear the updated output.",
        ],
        "code_walkthrough": [
            {
                "line": 1,
                "code": "# Store a name, then print it",
                "explanation": "Line 1 starts with a hash symbol, making it a comment that Python skips while explaining the goal to you.",
            },
            {
                "line": 2,
                "code": 'name = "Ada"',
                "explanation": 'Line 2 creates a variable called name and stores the text Ada inside double quotation marks.',
            },
            {
                "line": 3,
                "code": "print(name)",
                "explanation": "Line 3 calls print, open parenthesis, name, close parenthesis, so Python outputs Ada.",
            },
        ],
        "practice_prompt": (
            'Try changing "Ada" on line 2 to your own name, or add a second variable called greeting on line 4 and print it.'
        ),
        "starter_code": '# Store a name, then print it\nname = "Ada"\nprint(name)\n',
        "default_output": ["Ada"],
        "assessments": [
            {"name": "Assessment 1", "score": "9/10"},
            {"name": "Assessment 2", "score": "10/10"},
        ],
    },
    {
        "id": "lesson-2",
        "title": "Lesson 2 · For loops",
        "file": "lesson2.py",
        "summary": "Repeat an action automatically for each number in a sequence using a for loop.",
        "concept_explanation": (
            "A for loop is like stepping through a short playlist track by track without rewriting the play command each time. "
            "With range(1, 6), Python counts starting at 1 and stops right before 6, giving you 1, 2, 3, 4, and 5. "
            "Every line indented four spaces underneath the colon belongs inside the loop and runs once per number."
        ),
        "objectives": [
            "Understand how range(1, 6) generates numbers from 1 through 5.",
            "Recognize why the colon and four-space indentation group code inside the loop.",
            "Predict and hear each line printed as the loop variable updates.",
        ],
        "code_walkthrough": [
            {
                "line": 1,
                "code": "# Print each number from 1 to 5",
                "explanation": "Line 1 is a comment describing what this counting loop does.",
            },
            {
                "line": 2,
                "code": "for number in range(1, 6):",
                "explanation": "Line 2 starts the loop, assigning number to 1, then 2, up to 5, and ends with a colon.",
            },
            {
                "line": 3,
                "code": "    print(number)",
                "explanation": "Line 3 is indented four spaces inside the loop and prints the current value of number on each pass.",
            },
        ],
        "practice_prompt": (
            "Try changing range(1, 6) on line 2 so the loop prints numbers from 1 to 10, then click Run to hear the output."
        ),
        "starter_code": "# Print each number from 1 to 5\nfor number in range(1, 6):\n    print(number)\n",
        "default_output": ["1", "2", "3", "4", "5"],
        "assessments": [
            {"name": "Assessment 1", "score": "8/10"},
            {"name": "Assessment 2", "score": None},
        ],
    },
    {
        "id": "lesson-3",
        "title": "Lesson 3 · While loops",
        "file": "lesson3.py",
        "summary": "Keep repeating a block of code as long as a condition stays true, like a countdown timer.",
        "concept_explanation": (
            "A while loop acts like a countdown timer that keeps ticking only while a check remains true. "
            "Before every pass, Python checks whether count is still greater than zero. "
            "Inside the indented body, we print count and subtract one from it so the loop eventually reaches zero and stops safely."
        ),
        "objectives": [
            "Check a condition before each repetition using while count > 0.",
            "Update the loop variable inside the indented body so the loop ends cleanly.",
            "Trace how count changes from 3 down to 1 step by step.",
        ],
        "code_walkthrough": [
            {
                "line": 1,
                "code": "# Count down with a while loop",
                "explanation": "Line 1 is a comment introducing our countdown program.",
            },
            {
                "line": 2,
                "code": "count = 3",
                "explanation": "Line 2 sets the starting variable count to 3.",
            },
            {
                "line": 3,
                "code": "while count > 0:",
                "explanation": "Line 3 checks if count is greater than zero; while that stays true, the indented lines keep repeating.",
            },
            {
                "line": 4,
                "code": "    print(count)",
                "explanation": "Line 4 is indented four spaces and prints the current countdown number.",
            },
            {
                "line": 5,
                "code": "    count = count - 1",
                "explanation": "Line 5 is also indented four spaces and subtracts 1 from count so the countdown moves closer to zero.",
            },
        ],
        "practice_prompt": (
            'Try changing count on line 2 to 5, or add an unindented print("Liftoff!") on line 6 after the loop finishes.'
        ),
        "starter_code": "# Count down with a while loop\ncount = 3\nwhile count > 0:\n    print(count)\n    count = count - 1\n",
        "default_output": ["3", "2", "1"],
        "assessments": [
            {"name": "Assessment 1", "score": None},
            {"name": "Assessment 2", "score": None},
        ],
    },
]


def get_all_lessons() -> list[dict]:
    """Return a copy of all structured Python lessons."""
    return deepcopy(LESSONS_DATA)


def get_lesson_by_id(lesson_id: str) -> dict | None:
    """Return a single structured lesson by ID, or None if not found."""
    for lesson in LESSONS_DATA:
        if lesson["id"] == lesson_id:
            return deepcopy(lesson)
    return None
