import json
import tempfile
import wave
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from pydantic import ValidationError

import app.main as main_mod
from app.main import (
    TutorChatRequest,
    TtsRequest,
    _format_ollama_error,
    _ndjson_tutor_stream,
    chat_with_tutor,
    get_lesson,
    health,
    list_lessons,
    speech_to_text,
    stream_chat_with_tutor,
    text_to_speech,
)
from app.voice import _decode_audio_16k_mono, format_for_tts_prosody


def _run_coro(coro):
    """Drive a coroutine to completion without spawning an asyncio socketpair."""
    try:
        while True:
            coro.send(None)
    except StopIteration as stop:
        return stop.value


class _FakeUploadFile:
    """Minimal async UploadFile stand-in for sandbox-safe unit tests."""

    def __init__(self, filename: str, data: bytes):
        self.filename = filename
        self._data = data

    async def read(self) -> bytes:
        return self._data


def test_health_endpoint():
    data = health()
    assert data["status"] == "ok"
    assert data["tutor_model"] == "qwen2.5-coder:1.5b"
    assert "voice" in data
    assert "stt_engine" in data["voice"]
    assert "tts_engine" in data["voice"]


def test_lessons_endpoints():
    lessons = list_lessons()
    assert len(lessons) == 3
    assert [l["id"] for l in lessons] == ["lesson-1", "lesson-2", "lesson-3"]
    for lesson in lessons:
        assert lesson["title"]
        assert lesson["concept_explanation"]
        assert len(lesson["code_walkthrough"]) > 0
        assert lesson["practice_prompt"]

    single = get_lesson("lesson-2")
    assert single["file"] == "lesson2.py"

    with pytest.raises(HTTPException) as exc_info:
        get_lesson("non-existent-lesson")
    assert exc_info.value.status_code == 404


def test_tutor_chat_success():
    mock_chat_response = MagicMock()
    mock_chat_response.message.content = "Great job! Try using `print('Hello')`."

    with patch("app.main.get_ollama_client") as mock_get_client:
        mock_ollama = MagicMock()
        mock_ollama.chat.return_value = mock_chat_response
        mock_get_client.return_value = mock_ollama

        payload = TutorChatRequest(
            lesson_title="Lesson 1 · Variables",
            file_name="main.py",
            code="x = 10",
            cursor_line=1,
            output=["10"],
            history=[],
            user_message="What does x = 10 mean?",
        )

        data = chat_with_tutor(payload)

        assert data.model == "qwen2.5-coder:1.5b"
        assert data.raw_reply == "Great job! Try using `print('Hello')`."
        assert "`" not in data.reply
        assert "print('Hello')" in data.reply

        mock_ollama.chat.assert_called_once()
        call_kwargs = mock_ollama.chat.call_args.kwargs
        assert call_kwargs["model"] == "qwen2.5-coder:1.5b"
        assert call_kwargs["stream"] is False
        assert "think" not in call_kwargs
        assert call_kwargs["options"]["num_predict"] == 512
        assert call_kwargs["keep_alive"] == "30m"


def test_tutor_chat_ollama_offline_returns_503():
    with patch("app.main.get_ollama_client") as mock_get_client:
        mock_ollama = MagicMock()
        mock_ollama.chat.side_effect = ConnectionError("Could not connect to Ollama")
        mock_get_client.return_value = mock_ollama

        payload = TutorChatRequest(user_message="Can you hear me?")
        with pytest.raises(HTTPException) as exc_info:
            chat_with_tutor(payload)

        assert exc_info.value.status_code == 503
        assert "Failed to communicate with Ollama" in exc_info.value.detail
        assert "ConnectionError" in exc_info.value.detail


def test_tutor_chat_validation_error():
    with pytest.raises(ValidationError):
        TutorChatRequest.model_validate({"code": "x = 1"})


def test_tutor_stream_ndjson_sentences():
    fake_chunks = [
        {"message": {"content": "<think>plan</think>Nice work! "}},
        {"message": {"content": "Line 2 loops from 1 to 5. "}},
        {"message": {"content": "Want to try running it?"}},
    ]

    with patch("app.main.get_ollama_client") as mock_get_client:
        mock_ollama = MagicMock()
        mock_ollama.chat.return_value = iter(fake_chunks)
        mock_get_client.return_value = mock_ollama

        payload = TutorChatRequest(
            lesson_id="lesson-2",
            user_message="Explain line 2",
        )
        response = stream_chat_with_tutor(payload)
        assert isinstance(response, StreamingResponse)
        assert response.media_type == "application/x-ndjson"
        call_kwargs = mock_ollama.chat.call_args.kwargs
        assert call_kwargs["model"] == "qwen2.5-coder:1.5b"
        assert call_kwargs["stream"] is True
        assert "think" not in call_kwargs

    events = [json.loads(line) for line in _ndjson_tutor_stream(iter(fake_chunks), "qwen2.5-coder:1.5b")]
    sentence_texts = [e["text"] for e in events if e["type"] == "sentence"]
    done_events = [e for e in events if e["type"] == "done"]

    assert sentence_texts == [
        "Nice work!",
        "Line 2 loops from 1 to 5.",
        "Want to try running it?",
    ]
    assert len(done_events) == 1
    assert "<think>" not in done_events[0]["reply"]
    assert done_events[0]["model"] == "qwen2.5-coder:1.5b"


def test_stt_and_tts_unavailable_return_501():
    upload = _FakeUploadFile("clip.webm", b"fake-audio")
    with patch("app.main.transcribe_audio_file", side_effect=RuntimeError("not installed")):
        with pytest.raises(HTTPException) as stt_exc:
            _run_coro(speech_to_text(file=upload))
        assert stt_exc.value.status_code == 501

    with patch("app.main.synthesize_speech_bytes", side_effect=RuntimeError("no model")):
        with pytest.raises(HTTPException) as tts_exc:
            text_to_speech(TtsRequest(text="Hello student"))
        assert tts_exc.value.status_code == 501


def test_stt_and_tts_mocked_success():
    upload = _FakeUploadFile("clip.webm", b"fake-audio")
    with patch("app.main.transcribe_audio_file", return_value="What is a loop?"):
        result = _run_coro(speech_to_text(file=upload))
        assert result == {"text": "What is a loop?", "engine": "faster-whisper"}

    with patch("app.main.synthesize_speech_bytes", return_value=b"RIFFdemo"):
        resp = text_to_speech(TtsRequest(text="**Nice work!**"))
        assert resp.media_type == "audio/wav"
        assert resp.body == b"RIFFdemo"


def test_decode_audio_16k_mono_pyav19_compatible():
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    try:
        with wave.open(str(tmp_path), "wb") as wav_out:
            wav_out.setnchannels(1)
            wav_out.setsampwidth(2)
            wav_out.setframerate(16000)
            wav_out.writeframes(b"\x00\x00" * 1600)

        decoded = _decode_audio_16k_mono(str(tmp_path))
        assert isinstance(decoded, np.ndarray)
        assert decoded.dtype == np.float32
        assert decoded.shape == (1600,)
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


def test_tutor_chat_retries_without_think_when_unsupported(monkeypatch):
    monkeypatch.setenv("TUTOR_MODEL", "qwen3:4b")
    mock_chat_response = MagicMock()
    mock_chat_response.message.content = "Nice work!"

    with patch("app.main.get_ollama_client") as mock_get_client:
        mock_ollama = MagicMock()
        mock_ollama.chat.side_effect = [
            Exception("unknown field 'think'"),
            mock_chat_response,
        ]
        mock_get_client.return_value = mock_ollama

        data = chat_with_tutor(TutorChatRequest(user_message="Hi"))
        assert data.reply == "Nice work!"
        assert mock_ollama.chat.call_count == 2
        assert "think" in mock_ollama.chat.call_args_list[0].kwargs
        assert "think" not in mock_ollama.chat.call_args_list[1].kwargs


def test_format_ollama_error_distinguishes_missing_model():
    missing_err = Exception("model 'qwen2.5-coder:1.5b' not found")
    msg = _format_ollama_error(missing_err, "qwen2.5-coder:1.5b")
    assert "ollama pull qwen2.5-coder:1.5b" in msg

    conn_err = ConnectionError("Connection refused")
    conn_msg = _format_ollama_error(conn_err, "qwen2.5-coder:1.5b")
    assert "ollama serve" in conn_msg


def test_tutor_chat_falls_back_to_cpu_on_cuda_error(monkeypatch):
    monkeypatch.delenv("OLLAMA_NUM_GPU", raising=False)
    monkeypatch.setattr(main_mod, "_force_cpu_mode", False)

    mock_chat_response = MagicMock()
    mock_chat_response.message.content = "I am Vision, your Python tutor!"

    with patch("app.main.get_ollama_client") as mock_get_client:
        mock_ollama = MagicMock()
        mock_ollama.chat.side_effect = [
            Exception("CUDA error: device kernel image is invalid (status code: 500)"),
            mock_chat_response,
        ]
        mock_get_client.return_value = mock_ollama

        data = chat_with_tutor(TutorChatRequest(user_message="Hi, who are you?"))
        assert data.reply == "I am Vision, your Python tutor!"
        assert mock_ollama.chat.call_count == 2
        assert "num_gpu" not in mock_ollama.chat.call_args_list[0].kwargs["options"]
        assert mock_ollama.chat.call_args_list[1].kwargs["options"]["num_gpu"] == 0
        assert main_mod._force_cpu_mode is True


def test_format_for_tts_prosody_speaks_code_clearly():
    spoken = format_for_tts_prosody(
        "Line 2 calls range(1, 6) and checks my_count == 3."
    )
    assert "range, open parenthesis, 1, 6, close parenthesis" in spoken
    assert "my underscore count" in spoken
    assert "equals equals" in spoken


def test_tutor_chat_auto_continues_when_truncated():
    part1 = MagicMock()
    part1.message.content = "You can choose a range of numbers"
    part1.done_reason = "length"

    part2 = MagicMock()
    part2.message.content = "from 1 up to 5. Would you like to try running that next?"
    part2.done_reason = "stop"

    with patch("app.main.get_ollama_client") as mock_get_client:
        mock_ollama = MagicMock()
        mock_ollama.chat.side_effect = [part1, part2]
        mock_get_client.return_value = mock_ollama

        data = chat_with_tutor(TutorChatRequest(user_message="Explain range"))
        assert mock_ollama.chat.call_count == 2
        assert "choose a range of numbers from 1 up to 5." in data.reply
        assert "Would you like to try running that next?" in data.reply


def test_tutor_stream_auto_continues_when_truncated():
    first_pass = [
        {"message": {"content": "You can choose a range of numbers"}},
        {"message": {"content": ""}, "done_reason": "length"},
    ]
    second_pass = [
        {"message": {"content": "like 1 to 5. Want to try editing line 2 next?"}},
        {"message": {"content": ""}, "done_reason": "stop"},
    ]

    events = [
        json.loads(line)
        for line in _ndjson_tutor_stream(
            iter(first_pass),
            "qwen2.5-coder:1.5b",
            chat_kwargs={"options": {"num_predict": 512}},
            continue_fn=lambda partial, kw: iter(second_pass),
        )
    ]
    done = [e for e in events if e["type"] == "done"]
    assert len(done) == 1
    assert "choose a range of numbers like 1 to 5." in done[0]["reply"]
    assert "Want to try editing line 2 next?" in done[0]["reply"]
