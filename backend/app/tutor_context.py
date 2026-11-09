"""
tutor_context.py – BlindCode Tutor message builder and speech cleaner.

Public API
----------
build_messages(lesson_title, file_name, code, cursor_line, output, history, user_message)
    Build the full Ollama message list for one tutor turn.

clean_for_speech(text)
    Strip markdown and other visual decoration from a model response so
    text-to-speech engines read it cleanly.  Safe to call per-sentence on a
    stream and idempotent: running it twice gives the same result.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

# ---------------------------------------------------------------------------
# System-prompt cache (reload when the file changes on disk)
# ---------------------------------------------------------------------------

_PROMPTS_DIR = Path(__file__).parent / "prompts"
_SYSTEM_PROMPT_PATH = _PROMPTS_DIR / "tutor_system.md"

# Cache entry: (mtime_ns, text)
_prompt_cache: tuple[int, str] | None = None


def _load_system_prompt() -> str:
    """
    Return the contents of tutor_system.md.

    Re-reads the file when its modification time has changed so that prompt
    edits are picked up without restarting the server.  Uses mtime_ns (integer
    nanoseconds) for a cheap, reliable comparison.
    """
    global _prompt_cache
    mtime = _SYSTEM_PROMPT_PATH.stat().st_mtime_ns
    if _prompt_cache is None or _prompt_cache[0] != mtime:
        text = _SYSTEM_PROMPT_PATH.read_text(encoding="utf-8").strip()
        _prompt_cache = (mtime, text)
    return _prompt_cache[1]


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Maximum number of messages kept from the stored conversation history.
# 6 messages = up to 3 user + 3 assistant pairs.
HISTORY_MAX_MESSAGES: int = 6

# Hard caps to keep the prompt size predictable.
_CODE_MAX_CHARS: int = 4000
_OUTPUT_MAX_CHARS: int = 1000

# Roles that the Ollama API accepts inside the messages list.
_VALID_ROLES: frozenset[str] = frozenset({"user", "assistant"})


# ---------------------------------------------------------------------------
# build_messages
# ---------------------------------------------------------------------------


def build_messages(
    lesson_title: str,
    file_name: str,
    code: str,
    cursor_line: int,
    output: list[str],
    history: list[dict[str, str]],
    user_message: str,
) -> list[dict[str, str]]:
    """
    Assemble the Ollama-compatible message list for a single tutor turn.

    Parameters
    ----------
    lesson_title : str
        Human-readable lesson name, e.g. "Lesson 2 · For loops".
    file_name : str
        Active file in the editor, e.g. "lesson2.py".
    code : str
        Full source text of the active file (may be multi-line).
        Capped at _CODE_MAX_CHARS characters before being sent.
    cursor_line : int
        1-based line the student's cursor is on.
    output : list[str]
        Lines printed by the last code run, or an empty list if not run yet.
        Joined and capped at _OUTPUT_MAX_CHARS characters.
    history : list[dict]
        Previous conversation turns, each {"role": "user"|"assistant", "content": str}.
        Items whose role is not "user" or "assistant" are silently dropped.
        Only the last HISTORY_MAX_MESSAGES items are kept, and the slice is
        adjusted forward until it starts with a "user" turn so that roles
        always alternate cleanly after the system message.
    user_message : str
        The student's current question or voice input.

    Returns
    -------
    list[dict[str, str]]
        Ready to pass to ollama.Client.chat(messages=...).

    Message layout
    --------------
    1. {"role": "system", ...}   – Vision tutor persona (from tutor_system.md,
                                   reloaded when the file mtime changes)
    2. {"role": "user", ...}     – context block (lesson, file, numbered code,
                                   cursor line, last output) + the student's words
    [3..N-1]                     – trimmed, role-validated conversation history
                                   (interleaved between prior turns, NOT here –
                                    see note below)

    Note on message order
    ---------------------
    The context block is prepended to the FINAL user message so that:
      - Stored history entries never contain context boilerplate.
      - Roles alternate cleanly: system → (user → assistant)* → user.
      - The model always has fresh code/output for the current turn.
    """

    # --- 1. System message ------------------------------------------------- #
    messages: list[dict[str, str]] = [
        {"role": "system", "content": _load_system_prompt()},
    ]

    # --- 2. Clean and trim history ----------------------------------------- #
    # Drop anything that isn't a plain user/assistant exchange.
    clean_history = [m for m in history if m.get("role") in _VALID_ROLES]

    # Keep only the most recent HISTORY_MAX_MESSAGES items.
    trimmed = clean_history[-HISTORY_MAX_MESSAGES:]

    # Ensure the slice doesn't start with an assistant turn, which would
    # break the user→assistant alternation expected by Ollama.
    while trimmed and trimmed[0]["role"] == "assistant":
        trimmed = trimmed[1:]

    messages.extend(trimmed)

    # --- 3. Final user message: context block + student's words ------------ #
    # Cap code and output sizes before embedding them in the prompt.
    code_text = code[:_CODE_MAX_CHARS]
    if len(code) > _CODE_MAX_CHARS:
        code_text += f"\n... (truncated, {len(code) - _CODE_MAX_CHARS} chars omitted)"

    output_joined = "\n".join(output)
    output_text = output_joined[:_OUTPUT_MAX_CHARS] if output_joined else "(no output yet)"
    if len(output_joined) > _OUTPUT_MAX_CHARS:
        output_text += f"\n... (truncated)"

    numbered_code = _number_lines(code_text)

    context_block = (
        f"[Context]\n"
        f"Lesson: {lesson_title}\n"
        f"File: {file_name}\n"
        f"Cursor on line: {cursor_line}\n"
        f"\n"
        f"Code:\n"
        f"{numbered_code}\n"
        f"\n"
        f"Last output:\n"
        f"{output_text}\n"
        f"\n"
        f"[Student]\n"
        f"{user_message}"
    )

    messages.append({"role": "user", "content": context_block})

    return messages


# ---------------------------------------------------------------------------
# clean_for_speech
# ---------------------------------------------------------------------------
#
# Design constraints (from requirements):
#   • Idempotent: clean_for_speech(clean_for_speech(x)) == clean_for_speech(x)
#   • Safe on a single sentence fragment (called per sentence on a stream)
#   • Must NOT strip real characters: "2 * 3" and "my_variable" must survive
#   • Code fence lines are removed; the code text INSIDE is kept
#
# Consequence for bold/italic:
#   "2 * 3" must pass through unchanged.  A bare "*" surrounded by spaces is
#   not a markdown delimiter (markdown requires the delimiter to touch the
#   adjacent word).  We therefore only strip ** / * / __ / _ when they
#   immediately wrap a word boundary (no space between delimiter and content).
# ---------------------------------------------------------------------------

# Triple-backtick fences: opening line (``` + optional lang) and closing line (```)
# are removed; the content lines between them are kept.
# We match the fence line-by-line so we can strip just the delimiter rows.
_RE_FENCE_OPEN = re.compile(r"^```[^\n]*\n?", re.MULTILINE)
_RE_FENCE_CLOSE = re.compile(r"^```\s*$", re.MULTILINE)

# Inline backtick: `word` → word   (backtick removed, text kept)
# Only matches when there is no newline inside (safe on sentence fragments).
_RE_INLINE_CODE = re.compile(r"`([^`\n]+)`")

# ATX headings: leading "# " … "###### " removed, text kept.
_RE_HEADING = re.compile(r"^#{1,6} ", re.MULTILINE)

# Bold (**word** / __word__) – delimiter must touch the content (no space inside).
# Keeps the inner text; "2 * 3" is unaffected because * is surrounded by spaces.
_RE_BOLD = re.compile(r"\*\*(\S(?:.*?\S)?)\*\*|__(\S(?:.*?\S)?)__", re.DOTALL)

# Italic (*word* / _word_) – same boundary rule.
# _word_ is only stripped when surrounded by word boundary to avoid breaking
# snake_case identifiers like "my_variable" (the _ is between word chars, not
# at a word boundary relative to whitespace, so the regex won't fire).
_RE_ITALIC_STAR = re.compile(r"(?<!\*)\*(\S(?:.*?\S)?)\*(?!\*)")
_RE_ITALIC_UNDER = re.compile(r"(?<![_\w])_(\S(?:.*?\S)?)_(?![_\w])")

# Horizontal rules: a line that is ONLY dashes/asterisks/underscores (3+).
_RE_HR = re.compile(r"^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$", re.MULTILINE)

# Markdown bullet markers at the start of a line: "- ", "* ", "+ "
# We require a space after the marker so "2 * 3" on its own line isn't touched.
_RE_BULLET = re.compile(r"^[ \t]*[-*+] ", re.MULTILINE)

# Numbered list markers: "1. ", "12. " etc. at the start of a line.
_RE_NUMBERED = re.compile(r"^[ \t]*\d+\. ", re.MULTILINE)

# HTML tags
_RE_HTML = re.compile(r"<[^>]+>")

# Emoji – the common Unicode emoji/pictograph ranges.
_RE_EMOJI = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F300-\U0001F5FF"  # misc symbols & pictographs
    "\U0001F680-\U0001F6FF"  # transport & map
    "\U0001F700-\U0001F77F"  # alchemical symbols
    "\U0001F780-\U0001F7FF"  # geometric shapes extended
    "\U0001F800-\U0001F8FF"  # supplemental arrows-C
    "\U0001F900-\U0001F9FF"  # supplemental symbols & pictographs
    "\U0001FA00-\U0001FA6F"  # chess symbols
    "\U0001FA70-\U0001FAFF"  # symbols and pictographs extended-A
    "\U00002702-\U000027B0"  # dingbats
    "\U000024C2-\U0001F251"  # enclosed chars
    "]+",
    flags=re.UNICODE,
)

# Collapse 3+ consecutive blank lines to a single blank line.
_RE_MULTI_BLANK = re.compile(r"\n{3,}")

# Trailing whitespace on each line.
_RE_TRAILING_WS = re.compile(r"[ \t]+$", re.MULTILINE)


def clean_for_speech(text: str) -> str:
    """
    Strip visual/markdown decoration so text-to-speech reads the result cleanly.

    What is REMOVED
    ---------------
    - Triple-backtick fence delimiter lines (``` lang / ```); code text kept
    - Inline backtick markers (`` `word` `` → word)
    - ATX heading markers (# / ## / … at line start)
    - Bold markers (**word** / __word__ → word)
    - Italic markers (*word* / _word_ → word)   [snake_case identifiers preserved]
    - Horizontal rules (--- / *** / ___)
    - Bullet list markers (- / * / + at line start, followed by a space)
    - Numbered list markers (1. / 12. at line start)
    - HTML tags
    - Emoji characters (common Unicode ranges)
    - Excess blank lines (3+ consecutive → one blank line)
    - Trailing whitespace on each line

    What is KEPT
    ------------
    All prose, including code inside fences, arithmetic like "2 * 3",
    snake_case identifiers like "my_variable", and all alphanumeric characters.

    Idempotent
    ----------
    Running clean_for_speech twice on the same string produces the same result.
    Safe to call on a single sentence fragment (stream use).

    Parameters
    ----------
    text : str

    Returns
    -------
    str
        TTS-ready text, leading/trailing whitespace stripped.
    """
    if not text:
        return ""

    # Fences first: strip the opening/closing ``` lines, keep code content.
    text = _RE_FENCE_OPEN.sub("", text)
    text = _RE_FENCE_CLOSE.sub("", text)

    text = _RE_INLINE_CODE.sub(r"\1", text)
    text = _RE_HEADING.sub("", text)
    text = _RE_BOLD.sub(lambda m: m.group(1) or m.group(2) or "", text)
    text = _RE_ITALIC_STAR.sub(r"\1", text)
    text = _RE_ITALIC_UNDER.sub(r"\1", text)
    text = _RE_HR.sub("", text)
    text = _RE_BULLET.sub("", text)
    text = _RE_NUMBERED.sub("", text)
    text = _RE_HTML.sub("", text)
    text = _RE_EMOJI.sub("", text)
    text = _RE_TRAILING_WS.sub("", text)
    text = _RE_MULTI_BLANK.sub("\n\n", text)

    return text.strip()


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _number_lines(code: str) -> str:
    """
    Return `code` with 1-based line numbers prepended, right-aligned to the
    width of the total line count so columns stay neat.

    Example for a 3-line file:
        1: name = "Ada"
        2: print(name)
        3:
    """
    lines = code.splitlines()
    if not lines:
        return ""
    width = len(str(len(lines)))
    return "\n".join(f"{i + 1:{width}}: {line}" for i, line in enumerate(lines))
