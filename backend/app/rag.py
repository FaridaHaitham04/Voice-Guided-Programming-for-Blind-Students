"""Brute-force RAG engine using SovereignEG for embeddings + chat.

- Stores lesson chunk embeddings in MySQL as JSON columns.
- Loads all embeddings into a numpy array on first request (cached).
- Computes cosine similarity in numpy to find top-k relevant chunks.
- Feeds chunks + code context into SovereignEG .chat() for a response.
- Handles 429 rate-limit with a single retry using Retry-After header.
"""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

import numpy as np

from app.config import settings

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ── Lazy SovereignEG client ────────────────────────────────────────────

_seg_client = None


def _get_seg_client():
    """Return a lazily-initialised SovereignEG client."""
    global _seg_client
    if _seg_client is None:
        try:
            from sovereigneg import SovereignEG

            _seg_client = SovereignEG(
                api_key=settings.seg_api_key,
                base_url=settings.seg_base_url,
            )
        except ImportError:
            logger.warning(
                "sovereigneg package not installed — RAG will fall back to "
                "simple keyword replies."
            )
    return _seg_client


# ── In-memory chunk cache ─────────────────────────────────────────────

_chunk_texts: list[str] = []
_chunk_matrix: np.ndarray | None = None
_cache_loaded = False


def _load_chunks(db: "Session") -> None:
    """Load all lesson chunk embeddings into memory."""
    global _chunk_texts, _chunk_matrix, _cache_loaded

    from app.models import LessonChunk

    chunks = db.query(LessonChunk).all()
    texts = []
    embeddings = []

    for chunk in chunks:
        texts.append(chunk.content)
        if chunk.embedding:
            embeddings.append(chunk.embedding)
        else:
            embeddings.append(None)

    # Compute missing embeddings
    client = _get_seg_client()
    for i, emb in enumerate(embeddings):
        if emb is None and client is not None:
            try:
                emb_result = _embed_with_retry(client, texts[i])
                embeddings[i] = emb_result
                # Persist back to DB
                chunk_row = chunks[i]
                chunk_row.embedding = emb_result
            except Exception as exc:
                logger.warning("Failed to embed chunk %d: %s", i, exc)
                embeddings[i] = []

    db.commit()

    # Build numpy matrix (skip chunks without embeddings)
    valid_texts = []
    valid_embeddings = []
    for text, emb in zip(texts, embeddings):
        if emb:
            valid_texts.append(text)
            valid_embeddings.append(emb)

    _chunk_texts = valid_texts
    if valid_embeddings:
        _chunk_matrix = np.array(valid_embeddings, dtype=np.float32)
        # Normalise rows for cosine similarity
        norms = np.linalg.norm(_chunk_matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1
        _chunk_matrix = _chunk_matrix / norms
    else:
        _chunk_matrix = None

    _cache_loaded = True


# ── Embedding helper with 429 retry ───────────────────────────────────


def _embed_with_retry(client, text: str, retries: int = 1) -> list[float]:
    """Call client.embed() with a single retry on 429."""
    for attempt in range(retries + 1):
        try:
            result = client.embed(text, model=settings.seg_embed_model)
            # The SDK may return the embedding directly or nested
            if isinstance(result, list) and result and isinstance(result[0], float):
                return result
            if hasattr(result, "embedding"):
                return result.embedding
            if hasattr(result, "data") and result.data:
                first = result.data[0]
                if hasattr(first, "embedding"):
                    return first.embedding
            # Last resort: try to iterate
            return list(result)
        except Exception as exc:
            retry_after = _get_retry_after(exc)
            if retry_after is not None and attempt < retries:
                logger.info("Rate limited, retrying after %s seconds", retry_after)
                time.sleep(retry_after)
                continue
            raise


def _chat_with_retry(client, messages: list[dict], retries: int = 1) -> str:
    """Call client.chat() with a single retry on 429."""
    for attempt in range(retries + 1):
        try:
            result = client.chat(messages, model=settings.seg_chat_model)
            # Handle various response shapes
            if isinstance(result, str):
                return result
            if hasattr(result, "content"):
                return result.content
            if hasattr(result, "choices") and result.choices:
                choice = result.choices[0]
                if hasattr(choice, "message"):
                    return choice.message.content
            return str(result)
        except Exception as exc:
            retry_after = _get_retry_after(exc)
            if retry_after is not None and attempt < retries:
                logger.info("Rate limited, retrying after %s seconds", retry_after)
                time.sleep(retry_after)
                continue
            raise


def _get_retry_after(exc: Exception) -> float | None:
    """Extract Retry-After seconds from a 429 exception, if present."""
    # Check for status code attribute
    status = getattr(exc, "status_code", None) or getattr(exc, "status", None)
    if status == 429:
        # Try to get Retry-After from headers or response
        response = getattr(exc, "response", None)
        if response is not None:
            headers = getattr(response, "headers", {})
            retry_after = headers.get("Retry-After") or headers.get("retry-after")
            if retry_after:
                try:
                    return float(retry_after)
                except ValueError:
                    return 2.0
        return 2.0  # Default retry delay
    return None


# ── Public API ─────────────────────────────────────────────────────────


def get_relevant_chunks(question: str, db: "Session", top_k: int = 3) -> list[str]:
    """Return the top-k most relevant lesson chunks for *question*."""
    global _cache_loaded
    if not _cache_loaded:
        _load_chunks(db)

    if _chunk_matrix is None or len(_chunk_texts) == 0:
        return []

    client = _get_seg_client()
    if client is None:
        return _chunk_texts[:top_k]  # fallback: return first chunks

    try:
        q_emb = _embed_with_retry(client, question)
        q_vec = np.array(q_emb, dtype=np.float32)
        q_norm = np.linalg.norm(q_vec)
        if q_norm > 0:
            q_vec = q_vec / q_norm

        similarities = _chunk_matrix @ q_vec
        top_indices = np.argsort(similarities)[::-1][:top_k]
        return [_chunk_texts[i] for i in top_indices]
    except Exception as exc:
        logger.warning("Embedding failed for question: %s", exc)
        return _chunk_texts[:top_k]


def ask_tutor(
    question: str,
    code_context: str,
    filename: str | None,
    cursor_line: int | None,
    db: "Session",
) -> str:
    """Run the full RAG pipeline and return the tutor's reply text."""
    # 1. Get relevant chunks
    chunks = get_relevant_chunks(question, db)

    # 2. Build the prompt
    context_parts = []
    if chunks:
        context_parts.append("Relevant lesson material:\n" + "\n---\n".join(chunks))
    if code_context:
        context_parts.append(f"Current file ({filename or 'untitled'}):\n```python\n{code_context}\n```")
    if cursor_line:
        context_parts.append(f"The student's cursor is on line {cursor_line}.")

    system_msg = (
        "You are an AI tutor for a voice-guided Python programming platform for blind students. "
        "Be concise, clear, and encouraging. Use plain language suitable for screen readers. "
        "Reference specific line numbers when discussing code. "
        "If the student asks you to read output, describe it verbally."
    )

    context_block = "\n\n".join(context_parts) if context_parts else ""

    messages = [
        {"role": "system", "content": system_msg},
    ]
    if context_block:
        messages.append({"role": "system", "content": context_block})
    messages.append({"role": "user", "content": question})

    # 3. Call LLM
    client = _get_seg_client()
    if client is None:
        # Fallback when SDK is not installed
        return _keyword_fallback(question, code_context, cursor_line)

    try:
        return _chat_with_retry(client, messages)
    except Exception as exc:
        logger.error("SovereignEG chat failed: %s", exc)
        return _keyword_fallback(question, code_context, cursor_line)


def _keyword_fallback(question: str, code_context: str, cursor_line: int | None) -> str:
    """Simple keyword-based fallback when the LLM is unavailable."""
    lower = question.lower()
    if "line" in lower and cursor_line:
        lines = code_context.split("\n") if code_context else []
        line_text = lines[cursor_line - 1] if 0 < cursor_line <= len(lines) else "empty line"
        return f"You are on line {cursor_line}: {line_text}."
    if any(w in lower for w in ("read", "output", "aloud")):
        return "I'll read the output for you."
    return "I'm here to help. Ask me about any line of code, the output, or a concept."
