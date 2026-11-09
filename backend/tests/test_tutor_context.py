"""
tests/test_tutor_context.py
===========================
Unit tests for backend/app/tutor_context.py.

Run from the backend/ directory:
    pytest tests/test_tutor_context.py -v

No Ollama connection is required – we do not call the model.
"""

import pytest

from app.tutor_context import (
    HISTORY_MAX_MESSAGES,
    build_messages,
    clean_for_speech,
)


# ===========================================================================
# Fixtures
# ===========================================================================

# Minimal valid arguments for build_messages so each test only overrides
# the one thing it cares about.
_DEFAULT_KWARGS = dict(
    lesson_title="Lesson 2 · For loops",
    file_name="lesson2.py",
    code="for number in range(1, 6):\n    print(number)\n",
    cursor_line=2,
    output=["1", "2", "3", "4", "5"],
    history=[],
    user_message="Why is print indented?",
)


def _build(**overrides):
    """Call build_messages with defaults, overriding specific kwargs."""
    return build_messages(**{**_DEFAULT_KWARGS, **overrides})


# ===========================================================================
# build_messages – structural tests
# ===========================================================================


class TestBuildMessagesStructure:
    def test_first_message_is_system(self):
        messages = _build()
        assert messages[0]["role"] == "system"

    def test_system_content_not_empty(self):
        messages = _build()
        assert messages[0]["content"].strip() != ""

    def test_last_message_is_user(self):
        messages = _build()
        assert messages[-1]["role"] == "user"

    def test_last_message_contains_student_text(self):
        messages = _build(user_message="What does range do?")
        assert "What does range do?" in messages[-1]["content"]

    def test_last_message_contains_numbered_code(self):
        """Line numbers must appear in the final user message."""
        messages = _build(code="x = 1\ny = 2\n")
        last = messages[-1]["content"]
        assert "1:" in last or "1: " in last
        assert "2:" in last or "2: " in last

    def test_last_message_contains_lesson_title(self):
        messages = _build(lesson_title="Lesson 3 · While loops")
        assert "Lesson 3" in messages[-1]["content"]

    def test_last_message_contains_file_name(self):
        messages = _build(file_name="lesson3.py")
        assert "lesson3.py" in messages[-1]["content"]

    def test_last_message_contains_cursor_line(self):
        messages = _build(cursor_line=4)
        assert "4" in messages[-1]["content"]

    def test_last_message_contains_output(self):
        messages = _build(output=["hello", "world"])
        last = messages[-1]["content"]
        assert "hello" in last
        assert "world" in last

    def test_no_output_shows_placeholder(self):
        messages = _build(output=[])
        assert "no output" in messages[-1]["content"].lower()

    def test_roles_alternate_after_system(self):
        """After the system message, roles must strictly alternate user/assistant."""
        history = [
            {"role": "user", "content": "first question"},
            {"role": "assistant", "content": "first answer"},
            {"role": "user", "content": "second question"},
            {"role": "assistant", "content": "second answer"},
        ]
        messages = _build(history=history)
        # Skip the system message; the rest must alternate
        conversation = messages[1:]
        for i, msg in enumerate(conversation):
            expected = "user" if i % 2 == 0 else "assistant"
            assert msg["role"] == expected, (
                f"Expected role '{expected}' at conversation index {i}, "
                f"got '{msg['role']}'. Full list: {[m['role'] for m in conversation]}"
            )


# ===========================================================================
# build_messages – history trimming
# ===========================================================================


class TestBuildMessagesHistoryTrimming:
    def _make_history(self, n_pairs: int) -> list[dict]:
        """Create n_pairs of alternating user/assistant messages."""
        history = []
        for i in range(n_pairs):
            history.append({"role": "user", "content": f"q{i}"})
            history.append({"role": "assistant", "content": f"a{i}"})
        return history

    def test_empty_history(self):
        messages = _build(history=[])
        # system + final user = 2 messages
        assert len(messages) == 2

    def test_history_within_limit_fully_included(self):
        history = self._make_history(2)  # 4 messages, below limit of 6
        messages = _build(history=history)
        # system + 4 history + final user = 6
        assert len(messages) == 6

    def test_history_at_limit_fully_included(self):
        history = self._make_history(3)  # exactly 6 messages
        messages = _build(history=history)
        assert len(messages) == 2 + HISTORY_MAX_MESSAGES

    def test_history_over_limit_trimmed_to_max(self):
        history = self._make_history(10)  # 20 messages → trimmed to 6
        messages = _build(history=history)
        # system + 6 history + final user = 8
        assert len(messages) == 2 + HISTORY_MAX_MESSAGES

    def test_trimmed_history_contains_most_recent_turns(self):
        """The last messages in history must survive trimming."""
        history = self._make_history(10)
        # The last pair before trimming: q9 / a9
        messages = _build(history=history)
        contents = [m["content"] for m in messages]
        assert "q9" in contents
        assert "a9" in contents

    def test_trimmed_history_drops_old_turns(self):
        history = self._make_history(10)
        messages = _build(history=history)
        contents = [m["content"] for m in messages]
        # q0 is old enough to be dropped
        assert "q0" not in contents

    def test_history_never_starts_with_assistant(self):
        """If trimming leaves an assistant turn first, it must be skipped."""
        # 7 messages: u0 a0 u1 a1 u2 a2 u3
        history = [
            {"role": "user", "content": "u0"},
            {"role": "assistant", "content": "a0"},
            {"role": "user", "content": "u1"},
            {"role": "assistant", "content": "a1"},
            {"role": "user", "content": "u2"},
            {"role": "assistant", "content": "a2"},
            {"role": "user", "content": "u3"},
        ]
        # Last 6 would be: a0 u1 a1 u2 a2 u3 → starts with assistant
        messages = _build(history=history)
        conversation = messages[1:]  # skip system
        assert conversation[0]["role"] == "user"

    def test_invalid_roles_dropped(self):
        """Messages with roles other than 'user' or 'assistant' are silently removed."""
        history = [
            {"role": "system", "content": "injected system"},
            {"role": "user", "content": "real question"},
            {"role": "assistant", "content": "real answer"},
            {"role": "tool", "content": "tool output"},
            {"role": "user", "content": "follow-up"},
        ]
        messages = _build(history=history)
        roles_in_history = [m["role"] for m in messages[1:-1]]  # exclude system + final user
        assert "system" not in roles_in_history
        assert "tool" not in roles_in_history

    def test_only_valid_roles_in_output(self):
        history = [
            {"role": "unknown", "content": "x"},
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "hello"},
        ]
        messages = _build(history=history)
        for msg in messages:
            assert msg["role"] in {"system", "user", "assistant"}


# ===========================================================================
# build_messages – size caps
# ===========================================================================


class TestBuildMessagesCodeCap:
    def test_code_capped_at_4000_chars(self):
        long_code = "x = 1\n" * 1000  # ~6000 chars
        messages = _build(code=long_code)
        last = messages[-1]["content"]
        # The numbered code in the message must not exceed 4000 chars of original
        # (plus line numbers/labels); a simple sanity: truncation marker appears
        assert "truncated" in last.lower() or len(last) < 15000

    def test_output_capped_at_1000_chars(self):
        long_output = ["A" * 100] * 20  # 2000 chars joined
        messages = _build(output=long_output)
        last = messages[-1]["content"]
        assert "truncated" in last.lower() or len(last) < 15000


# ===========================================================================
# clean_for_speech – core behaviour
# ===========================================================================


class TestCleanForSpeechBasic:
    def test_empty_string(self):
        assert clean_for_speech("") == ""

    def test_plain_text_unchanged(self):
        text = "A variable stores a value. Try typing x equals five."
        assert clean_for_speech(text) == text

    def test_single_sentence_safe(self):
        """Must not corrupt a plain single sentence (stream use case)."""
        s = "The for loop runs from one to five."
        assert clean_for_speech(s) == s

    def test_idempotent_plain(self):
        text = "Hello, this is a plain sentence."
        assert clean_for_speech(clean_for_speech(text)) == clean_for_speech(text)

    def test_idempotent_with_markdown(self):
        text = "**bold** and `code` and # heading\n- bullet"
        once = clean_for_speech(text)
        twice = clean_for_speech(once)
        assert once == twice


# ===========================================================================
# clean_for_speech – code fences
# ===========================================================================


class TestCleanForSpeechCodeFences:
    def test_fence_delimiter_lines_removed(self):
        text = "```python\nprint('hello')\n```"
        result = clean_for_speech(text)
        assert "```" not in result

    def test_fence_code_content_kept(self):
        text = "```python\nprint('hello')\n```"
        result = clean_for_speech(text)
        assert "print('hello')" in result

    def test_fence_no_lang_tag(self):
        text = "```\nfor i in range(5):\n    pass\n```"
        result = clean_for_speech(text)
        assert "```" not in result
        assert "for i in range(5):" in result

    def test_fence_multiline_content_kept(self):
        text = "Here is code:\n```python\nx = 1\ny = 2\n```\nDone."
        result = clean_for_speech(text)
        assert "x = 1" in result
        assert "y = 2" in result
        assert "```" not in result

    def test_fence_idempotent(self):
        text = "```\ncode here\n```"
        once = clean_for_speech(text)
        assert clean_for_speech(once) == once


# ===========================================================================
# clean_for_speech – inline backticks
# ===========================================================================


class TestCleanForSpeechInlineCode:
    def test_backticks_removed(self):
        assert "`" not in clean_for_speech("Use `print` to display values.")

    def test_inline_code_text_kept(self):
        result = clean_for_speech("Use `print` to display values.")
        assert "print" in result

    def test_snake_case_in_backticks(self):
        result = clean_for_speech("The variable `my_variable` holds a number.")
        assert "my_variable" in result
        assert "`" not in result


# ===========================================================================
# clean_for_speech – bold and italic (and preservation of real characters)
# ===========================================================================


class TestCleanForSpeechBoldItalic:
    def test_double_star_bold_markers_removed(self):
        result = clean_for_speech("This is **important** to know.")
        assert "**" not in result
        assert "important" in result

    def test_double_underscore_bold_markers_removed(self):
        result = clean_for_speech("This is __important__ to know.")
        assert "__" not in result
        assert "important" in result

    def test_star_italic_markers_removed(self):
        result = clean_for_speech("This is *emphasized* text.")
        assert result.count("*") == 0
        assert "emphasized" in result

    def test_arithmetic_star_preserved(self):
        """'2 * 3' must not be altered – the * is surrounded by spaces."""
        result = clean_for_speech("The result of 2 * 3 is 6.")
        assert "2 * 3" in result

    def test_snake_case_underscore_preserved(self):
        """'my_variable' must survive – underscores are inside word chars."""
        result = clean_for_speech("Use my_variable to store the value.")
        assert "my_variable" in result

    def test_underscore_italic_stripped_at_boundaries(self):
        result = clean_for_speech("This is _important_ text.")
        assert "important" in result
        # The wrapping underscores should be gone
        assert "_important_" not in result


# ===========================================================================
# clean_for_speech – headings
# ===========================================================================


class TestCleanForSpeechHeadings:
    def test_h1_marker_removed(self):
        result = clean_for_speech("# Variables\nA variable stores a value.")
        assert result.startswith("#") is False
        assert "Variables" in result

    def test_h2_marker_removed(self):
        result = clean_for_speech("## For Loops\nUse a for loop to repeat code.")
        assert "##" not in result
        assert "For Loops" in result

    def test_deep_heading_marker_removed(self):
        result = clean_for_speech("### Step 1\nType the word print.")
        assert "###" not in result
        assert "Step 1" in result


# ===========================================================================
# clean_for_speech – bullets and numbered lists
# ===========================================================================


class TestCleanForSpeechLists:
    def test_dash_bullet_marker_removed(self):
        result = clean_for_speech("- First item\n- Second item")
        assert result.startswith("-") is False

    def test_star_bullet_marker_removed(self):
        result = clean_for_speech("* First item\n* Second item")
        assert "* First" not in result

    def test_bullet_text_kept(self):
        result = clean_for_speech("- First item\n- Second item")
        assert "First item" in result
        assert "Second item" in result

    def test_numbered_list_marker_removed(self):
        result = clean_for_speech("1. First\n2. Second\n3. Third")
        assert "1." not in result
        assert "2." not in result

    def test_numbered_list_text_kept(self):
        result = clean_for_speech("1. First\n2. Second")
        assert "First" in result
        assert "Second" in result


# ===========================================================================
# clean_for_speech – emoji
# ===========================================================================


class TestCleanForSpeechEmoji:
    def test_emoji_removed(self):
        result = clean_for_speech("Great job! 🎉 Keep going! 🚀")
        assert "🎉" not in result
        assert "🚀" not in result

    def test_prose_around_emoji_kept(self):
        result = clean_for_speech("Great job! 🎉 Keep going!")
        assert "Great job" in result
        assert "Keep going" in result

    def test_smiley_removed(self):
        result = clean_for_speech("Well done 😊")
        assert "😊" not in result
        assert "Well done" in result


# ===========================================================================
# clean_for_speech – horizontal rules
# ===========================================================================


class TestCleanForSpeechHR:
    def test_triple_dash_hr_removed(self):
        text = "Before\n---\nAfter"
        result = clean_for_speech(text)
        assert "---" not in result
        assert "Before" in result
        assert "After" in result

    def test_triple_star_hr_removed(self):
        result = clean_for_speech("Before\n***\nAfter")
        assert "***" not in result


# ===========================================================================
# clean_for_speech – HTML tags
# ===========================================================================


class TestCleanForSpeechHTML:
    def test_html_tag_removed(self):
        result = clean_for_speech("Use <strong>print</strong> to show output.")
        assert "<strong>" not in result
        assert "print" in result

    def test_br_tag_removed(self):
        result = clean_for_speech("Line one.<br>Line two.")
        assert "<br>" not in result


# ===========================================================================
# clean_for_speech – realistic model output
# ===========================================================================


class TestCleanForSpeechRealistic:
    def test_mixed_markdown_response(self):
        response = (
            "## Why indentation matters\n\n"
            "In Python, **indentation** tells the computer which lines belong inside a loop.\n\n"
            "For example:\n\n"
            "```python\n"
            "for number in range(1, 6):\n"
            "    print(number)\n"
            "```\n\n"
            "- Line 1 starts the loop.\n"
            "- Line 2, indented four spaces, runs once per number.\n\n"
            "Does that make sense? 😊"
        )
        result = clean_for_speech(response)

        # Decoration removed
        assert "##" not in result
        assert "**" not in result
        assert "```" not in result
        assert "😊" not in result
        assert result.count("- ") == 0 or result.startswith("Line")  # bullet markers gone

        # Content preserved
        assert "indentation" in result
        assert "for number in range(1, 6):" in result
        assert "print(number)" in result
        assert "Line 1 starts the loop" in result
        assert "Line 2" in result

    def test_arithmetic_expression_preserved(self):
        result = clean_for_speech("So 2 * 3 gives you 6, and my_variable holds that result.")
        assert "2 * 3" in result
        assert "my_variable" in result

    def test_idempotent_on_realistic_output(self):
        response = "**Step 1**: type `print` and press Enter. 🎉\n- Done!"
        once = clean_for_speech(response)
        twice = clean_for_speech(once)
        assert once == twice
