"""
BlindCode – FastAPI backend entry point.

Exposes:
  GET  /api/health               → liveness check + active model + STT/TTS capability status
  GET  /api/lessons              → structured blind-accessible Python lessons
  GET  /api/lessons/{lesson_id}  → single lesson detail + walkthrough
  POST /api/tutor                → single-turn tutor response (speech-cleaned)
  POST /api/tutor/stream         → NDJSON sentence-by-sentence streaming tutor response
  POST /api/stt                  → Speech-to-Text via faster-whisper (501 if unavailable)
  POST /api/tts                  → Text-to-Speech WAV synthesis via Piper TTS (501 if unavailable)
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Iterator

import ollama
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from app.lessons_data import get_all_lessons, get_lesson_audio_path, get_lesson_by_id
from app.tutor_context import build_messages, clean_for_speech, pop_complete_sentences
from app.voice import (
    get_voice_capabilities,
    synthesize_speech_bytes,
    transcribe_audio_file,
)

# Load environment variables from backend/.env (falls back gracefully if
# the file is absent, e.g. in CI where vars are injected another way).
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

DEFAULT_TUTOR_MODEL = "qwen2.5-coder:1.5b"
_force_cpu_mode: bool = False

app = FastAPI(
    title="BlindCode Tutor API",
    version="0.2.0",
    description="Voice-guided Python tutoring backend powered by Ollama, Whisper, and Piper TTS.",
)

# --- CORS ------------------------------------------------------------------ #
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# --------------------------------------------------------------------------- #


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    """
    Liveness check.

    Returns status, configured tutor model, and open-source STT/TTS readiness.
    """
    return {
        "status": "ok",
        "tutor_model": os.getenv("TUTOR_MODEL", DEFAULT_TUTOR_MODEL),
        "voice": get_voice_capabilities(),
    }


# --- Lessons Endpoints ----------------------------------------------------- #


@app.get("/api/lessons", tags=["lessons"])
def list_lessons() -> list[dict]:
    """Return all structured Python lessons with walkthroughs and starter code."""
    return get_all_lessons()


@app.get("/api/lessons/{lesson_id}", tags=["lessons"])
def get_lesson(lesson_id: str) -> dict:
    """Return a single structured lesson by ID, or 404 if not found."""
    lesson = get_lesson_by_id(lesson_id)
    if lesson is None:
        raise HTTPException(status_code=404, detail=f"Lesson '{lesson_id}' not found.")
    return lesson


@app.get("/api/lessons/{lesson_id}/audio", tags=["lessons"])
def get_lesson_audio(lesson_id: str):
    """
    Serve the constant pre-recorded WAV audio for a lesson.
    Falls back to synthesizing and saving via Piper TTS if missing.
    """
    lesson = get_lesson_by_id(lesson_id)
    if lesson is None:
        raise HTTPException(status_code=404, detail=f"Lesson '{lesson_id}' not found.")

    audio_path = get_lesson_audio_path(lesson_id)
    if audio_path is not None:
        return FileResponse(path=str(audio_path), media_type="audio/wav", filename=f"{lesson_id}.wav")

    script_parts = lesson.get("script")
    script_text = "\n\n".join(script_parts) if isinstance(script_parts, list) else lesson.get("concept_explanation", "")
    cleaned = clean_for_speech(script_text)
    if not cleaned:
        raise HTTPException(status_code=400, detail="Lesson script is empty.")

    try:
        wav_bytes = synthesize_speech_bytes(cleaned, length_scale=1.22)
    except RuntimeError as e:
        raise HTTPException(status_code=501, detail=str(e)) from e

    return Response(content=wav_bytes, media_type="audio/wav")


# --- Tutor Endpoints ------------------------------------------------------- #


class TutorChatRequest(BaseModel):
    lesson_id: str | None = None
    lesson_title: str = ""
    file_name: str = "main.py"
    code: str = ""
    cursor_line: int = 1
    output: list[str] = Field(default_factory=list)
    history: list[dict[str, str]] = Field(default_factory=list)
    user_message: str
    max_tokens: int | None = None
    temperature: float | None = None


class TutorChatResponse(BaseModel):
    reply: str
    raw_reply: str
    model: str


class TtsRequest(BaseModel):
    text: str
    length_scale: float | None = None


def is_qwen3(model_name: str) -> bool:
    """Return True if the model is Qwen3, requiring thinking tokens disabled."""
    return model_name.lower().startswith("qwen3")


def get_ollama_host() -> str:
    """Return the configured Ollama host URL."""
    return os.getenv("OLLAMA_HOST", "http://localhost:11434")


def get_ollama_client() -> ollama.Client:
    """Instantiate the Ollama client configured via OLLAMA_HOST."""
    return ollama.Client(host=get_ollama_host())


def _is_cuda_error(exc: Exception) -> bool:
    """Return True if Ollama crashed due to an incompatible CUDA/GPU kernel."""
    msg = str(exc).lower()
    return "cuda" in msg or "kernel image" in msg or "0xc0000409" in msg


def _build_fallback_kwargs(exc: Exception, chat_kwargs: dict) -> dict | None:
    """
    Build fallback kwargs when Ollama rejects `think` or crashes on CUDA.
    Returns None if no fallback applies.
    """
    global _force_cpu_mode
    options = dict(chat_kwargs.get("options") or {})

    if _is_cuda_error(exc) and options.get("num_gpu") != 0:
        _force_cpu_mode = True
        options["num_gpu"] = 0
        print("[Ollama] CUDA kernel error detected; falling back to CPU (num_gpu=0)", flush=True)
        return {**chat_kwargs, "options": options}

    if "think" in chat_kwargs and "think" in str(exc).lower():
        return {k: v for k, v in chat_kwargs.items() if k != "think"}

    return None


def _format_ollama_error(exc: Exception, model: str) -> str:
    """Log Ollama error details and return an actionable user-facing message."""
    host = get_ollama_host()
    print(f"[Ollama Error] model={model} host={host} -> {type(exc).__name__}: {exc}", flush=True)
    msg = str(exc)
    lower = msg.lower()
    if getattr(exc, "status_code", None) == 404 or ("model" in lower and "not found" in lower):
        return (
            f"Failed to communicate with Ollama: Model '{model}' is not installed in Ollama. "
            f"Run: ollama pull {model}"
        )
    return (
        f"Failed to communicate with Ollama at {host}: {type(exc).__name__}: {msg}. "
        f"Make sure Ollama is running (ollama serve)."
    )


def _prepare_tutor_call(request: TutorChatRequest) -> tuple[str, list[dict[str, str]], dict]:
    """Resolve model, context messages, and Ollama latency/tone options."""
    selected_model = os.getenv("TUTOR_MODEL", DEFAULT_TUTOR_MODEL)

    lesson_title = request.lesson_title
    if not lesson_title and request.lesson_id:
        lesson = get_lesson_by_id(request.lesson_id)
        if lesson:
            lesson_title = lesson["title"]

    messages = build_messages(
        lesson_title=lesson_title,
        file_name=request.file_name,
        code=request.code,
        cursor_line=request.cursor_line,
        output=request.output,
        history=request.history,
        user_message=request.user_message,
    )

    temperature = (
        request.temperature
        if request.temperature is not None
        else float(os.getenv("TUTOR_TEMPERATURE", "0.6"))
    )
    num_predict = request.max_tokens or int(os.getenv("TUTOR_MAX_TOKENS", "512"))

    options: dict = {
        "temperature": temperature,
        "num_predict": num_predict,
    }
    raw_num_gpu = os.getenv("OLLAMA_NUM_GPU", "").strip()
    if _force_cpu_mode:
        options["num_gpu"] = 0
    elif raw_num_gpu != "":
        options["num_gpu"] = int(raw_num_gpu)

    chat_kwargs: dict = {
        "options": options,
        "keep_alive": os.getenv("OLLAMA_KEEP_ALIVE", "30m"),
    }
    if is_qwen3(selected_model):
        chat_kwargs["think"] = False

    return selected_model, messages, chat_kwargs


_CONTINUATION_PROMPT = (
    "Please finish the rest of your explanation in 1 to 2 sentences "
    "and end by offering one helpful next step for the student."
)


def _looks_truncated(text: str, done_reason: object) -> bool:
    """Return True if generation hit `num_predict` or ended mid-sentence."""
    if done_reason == "length":
        return True
    stripped = (text or "").rstrip()
    if not stripped:
        return False
    return stripped[-1] not in ".!?\"'"


def _chat_sync_with_fallback(
    client: ollama.Client,
    model: str,
    messages: list[dict[str, str]],
    chat_kwargs: dict,
):
    """Execute synchronous client.chat with CUDA-to-CPU and `think` fallbacks."""
    current_kwargs = chat_kwargs
    for _ in range(3):
        try:
            response = client.chat(
                model=model,
                messages=messages,
                stream=False,
                **current_kwargs,
            )
            return response, current_kwargs
        except Exception as e:
            fallback = _build_fallback_kwargs(e, current_kwargs)
            if fallback is not None:
                current_kwargs = fallback
                continue
            raise HTTPException(
                status_code=503,
                detail=_format_ollama_error(e, model),
            ) from e
    raise HTTPException(status_code=503, detail=f"Failed to communicate with Ollama for model '{model}'.")


@app.post("/api/tutor", response_model=TutorChatResponse, tags=["tutor"])
def chat_with_tutor(request: TutorChatRequest) -> TutorChatResponse:
    """
    Handle a voice or text interaction turn with the BlindCode AI Tutor.

    Builds the context-aware prompt using `build_messages()`, queries Ollama,
    automatically continues if the explanation stopped mid-thought, and returns
    both the raw response and a clean, speech-friendly version.
    """
    selected_model, messages, chat_kwargs = _prepare_tutor_call(request)
    client = get_ollama_client()

    response, active_kwargs = _chat_sync_with_fallback(
        client, selected_model, messages, chat_kwargs
    )

    raw_reply = response.message.content or ""
    done_reason = getattr(response, "done_reason", None)
    if _looks_truncated(raw_reply, done_reason):
        cont_messages = [
            *messages,
            {"role": "assistant", "content": raw_reply},
            {"role": "user", "content": _CONTINUATION_PROMPT},
        ]
        try:
            cont_resp, _ = _chat_sync_with_fallback(
                client, selected_model, cont_messages, active_kwargs
            )
            cont_text = (cont_resp.message.content or "").strip()
            if cont_text:
                raw_reply = f"{raw_reply.rstrip()} {cont_text}".strip()
        except HTTPException:
            pass

    speech_reply = clean_for_speech(raw_reply)

    return TutorChatResponse(
        reply=speech_reply,
        raw_reply=raw_reply,
        model=selected_model,
    )


def _has_unclosed_think(text: str) -> bool:
    """Return True if an opening <think> tag has appeared without its closing tag yet."""
    lower = text.lower()
    open_idx = lower.rfind("<think>")
    if open_idx == -1:
        return False
    close_idx = lower.rfind("</think>")
    return close_idx < open_idx


def _ndjson_tutor_stream(
    stream_iter,
    selected_model: str,
    chat_kwargs: dict | None = None,
    retry_fn=None,
    continue_fn=None,
) -> Iterator[str]:
    """Yield NDJSON sentence events followed by a final done event."""
    raw_chunks: list[str] = []
    sentence_buffer = ""
    last_done_reason = None

    def _consume(iterator):
        nonlocal sentence_buffer, last_done_reason
        for chunk in iterator:
            chunk_done_reason = (
                chunk.get("done_reason")
                if isinstance(chunk, dict)
                else getattr(chunk, "done_reason", None)
            )
            if chunk_done_reason is not None:
                last_done_reason = chunk_done_reason

            msg = getattr(chunk, "message", None)
            if msg is not None:
                token = getattr(msg, "content", "") or ""
            elif isinstance(chunk, dict):
                token = chunk.get("message", {}).get("content", "") or ""
            else:
                token = ""

            if not token:
                continue

            raw_chunks.append(token)
            sentence_buffer += token

            # Wait for </think> before flushing if a reasoning block is in progress.
            if _has_unclosed_think(sentence_buffer):
                continue

            ready_sentences, sentence_buffer = pop_complete_sentences(sentence_buffer)
            for sentence in ready_sentences:
                cleaned = clean_for_speech(sentence)
                if cleaned:
                    yield json.dumps({"type": "sentence", "text": cleaned}) + "\n"

    try:
        current_iter = stream_iter
        current_kwargs = chat_kwargs or {}
        for _ in range(3):
            try:
                yield from _consume(current_iter)
                break
            except Exception as exc:
                fallback = (
                    _build_fallback_kwargs(exc, current_kwargs)
                    if not raw_chunks and retry_fn is not None
                    else None
                )
                if fallback is not None:
                    current_kwargs = fallback
                    current_iter = retry_fn(fallback)
                    continue
                raise

        full_so_far = "".join(raw_chunks)
        if continue_fn is not None and _looks_truncated(full_so_far, last_done_reason):
            if raw_chunks and not raw_chunks[-1].endswith((" ", "\n")):
                raw_chunks.append(" ")
            if sentence_buffer and not sentence_buffer.endswith((" ", "\n")):
                sentence_buffer += " "
            try:
                yield from _consume(continue_fn(full_so_far, current_kwargs))
            except Exception:
                pass

        if sentence_buffer.strip():
            cleaned_tail = clean_for_speech(sentence_buffer)
            if cleaned_tail:
                yield json.dumps({"type": "sentence", "text": cleaned_tail}) + "\n"

        full_raw = "".join(raw_chunks)
        full_reply = clean_for_speech(full_raw)
        yield (
            json.dumps(
                {
                    "type": "done",
                    "reply": full_reply,
                    "raw_reply": full_raw,
                    "model": selected_model,
                }
            )
            + "\n"
        )
    except Exception as e:
        yield (
            json.dumps(
                {
                    "type": "error",
                    "detail": _format_ollama_error(e, selected_model),
                }
            )
            + "\n"
        )


@app.post("/api/tutor/stream", tags=["tutor"])
def stream_chat_with_tutor(request: TutorChatRequest) -> StreamingResponse:
    """
    Stream tutor sentences as NDJSON so the frontend starts speaking immediately
    after the first complete sentence rather than waiting for the whole answer.
    """
    selected_model, messages, chat_kwargs = _prepare_tutor_call(request)
    client = get_ollama_client()

    try:
        stream_iter = client.chat(
            model=selected_model,
            messages=messages,
            stream=True,
            **chat_kwargs,
        )
    except Exception as e:
        fallback = _build_fallback_kwargs(e, chat_kwargs)
        if fallback is not None:
            chat_kwargs = fallback
            try:
                stream_iter = client.chat(
                    model=selected_model,
                    messages=messages,
                    stream=True,
                    **chat_kwargs,
                )
            except Exception as retry_err:
                raise HTTPException(
                    status_code=503,
                    detail=_format_ollama_error(retry_err, selected_model),
                ) from retry_err
        else:
            raise HTTPException(
                status_code=503,
                detail=_format_ollama_error(e, selected_model),
            ) from e

    retry_fn = lambda kw: client.chat(
        model=selected_model,
        messages=messages,
        stream=True,
        **kw,
    )
    continue_fn = lambda partial, kw: client.chat(
        model=selected_model,
        messages=[
            *messages,
            {"role": "assistant", "content": partial},
            {"role": "user", "content": _CONTINUATION_PROMPT},
        ],
        stream=True,
        **kw,
    )

    return StreamingResponse(
        _ndjson_tutor_stream(
            stream_iter,
            selected_model,
            chat_kwargs=chat_kwargs,
            retry_fn=retry_fn,
            continue_fn=continue_fn,
        ),
        media_type="application/x-ndjson",
    )


# --- Voice STT / TTS Endpoints --------------------------------------------- #


@app.post("/api/stt", tags=["voice"])
async def speech_to_text(file: UploadFile = File(...)) -> dict:
    """
    Transcribe uploaded microphone audio using faster-whisper.
    Returns 501 when faster-whisper is not installed locally.
    """
    suffix = Path(file.filename or "recording.webm").suffix or ".webm"
    temp_path: str | None = None

    try:
        audio_bytes = await file.read()
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            temp_path = tmp.name

        text = transcribe_audio_file(temp_path)
        return {"text": text, "engine": "faster-whisper"}
    except RuntimeError as e:
        raise HTTPException(status_code=501, detail=str(e)) from e
    finally:
        if temp_path and Path(temp_path).exists():
            Path(temp_path).unlink()


@app.post("/api/tts", tags=["voice"])
def text_to_speech(request: TtsRequest) -> Response:
    """
    Convert speech-ready text into WAV audio via Piper TTS.
    Returns 501 when Piper TTS or PIPER_MODEL_PATH is unavailable.
    """
    cleaned = clean_for_speech(request.text)
    if not cleaned:
        raise HTTPException(status_code=400, detail="Text is empty after speech cleaning.")

    try:
        wav_bytes = synthesize_speech_bytes(cleaned, length_scale=request.length_scale)
    except RuntimeError as e:
        raise HTTPException(status_code=501, detail=str(e)) from e

    return Response(content=wav_bytes, media_type="audio/wav")
