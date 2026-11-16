"""
voice.py – Open-source Speech-to-Text (faster-whisper) and Text-to-Speech (Piper TTS).

Provides lazy-loaded singletons, PyAV 19 compatible audio decoding, automatic
Piper voice model download, and graceful capability detection.
"""

from __future__ import annotations

import importlib.util
import io
import itertools
import os
import re
import threading
import wave
from pathlib import Path

# Suppress noisy Windows symlink warnings from huggingface_hub when loading Whisper.
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

_BACKEND_DIR = Path(__file__).resolve().parents[1]
_DEFAULT_PIPER_REL_PATH = "./voices/en_US-lessac-medium.onnx"

_PYTHON_STT_PROMPT = (
    "Python programming tutor for blind students. "
    "Keywords: print, range, for, while, if, else, elif, def, return, "
    "variable, indent, colon, parenthesis, quote, equals, underscore."
)

_stt_lock = threading.Lock()
_stt_model = None

_tts_lock = threading.Lock()
_tts_voice = None
_tts_model_loaded_path: str | None = None


def _has_package(name: str) -> bool:
    """Return True if a Python package is discoverable in the active environment."""
    return importlib.util.find_spec(name) is not None


def _configured_piper_model_path() -> Path:
    """Resolve the configured Piper ONNX voice path relative to backend/."""
    raw = os.getenv("PIPER_MODEL_PATH", _DEFAULT_PIPER_REL_PATH).strip() or _DEFAULT_PIPER_REL_PATH
    candidate = Path(raw)
    if not candidate.is_absolute():
        candidate = (_BACKEND_DIR / candidate).resolve()
    return candidate


def get_voice_capabilities() -> dict:
    """
    Report which local open-source STT/TTS engines are ready to use.

    Returns
    -------
    dict
        Keys: stt_engine, tts_engine, faster_whisper_available, piper_available.
    """
    fw_available = _has_package("faster_whisper")
    piper_ready = _has_package("piper")

    return {
        "stt_engine": "faster-whisper" if fw_available else "browser-webspeech",
        "tts_engine": "piper-tts" if piper_ready else "browser-webspeech",
        "faster_whisper_available": fw_available,
        "piper_available": piper_ready,
    }


def _decode_audio_16k_mono(audio_path: str):
    """
    Decode an audio file into a 16 kHz mono float32 NumPy array using PyAV.

    Avoids passing `metadata_errors="ignore"` to `av.open()`, which was removed
    in PyAV 19 and breaks `faster_whisper.audio.decode_audio`.
    """
    import av
    import numpy as np

    resampler = av.audio.resampler.AudioResampler(
        format="s16",
        layout="mono",
        rate=16000,
    )
    raw_buffer = io.BytesIO()

    with av.open(audio_path, mode="r") as container:
        if not container.streams.audio:
            return np.zeros((0,), dtype=np.float32)

        frames = container.decode(audio=0)

        def _valid_frames():
            iterator = iter(frames)
            while True:
                try:
                    yield next(iterator)
                except StopIteration:
                    break
                except av.error.InvalidDataError:
                    continue

        for frame in itertools.chain(_valid_frames(), [None]):
            for resampled in resampler.resample(frame):
                raw_buffer.write(resampled.to_ndarray().tobytes())

    pcm_bytes = raw_buffer.getvalue()
    if not pcm_bytes:
        return np.zeros((0,), dtype=np.float32)

    return np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0


def _get_whisper_model():
    """Lazily instantiate and cache the faster-whisper WhisperModel singleton."""
    global _stt_model
    if _stt_model is not None:
        return _stt_model

    with _stt_lock:
        if _stt_model is not None:
            return _stt_model
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise RuntimeError(
                "faster-whisper is not installed. Install with: pip install faster-whisper"
            ) from exc

        model_name = os.getenv("WHISPER_MODEL", "base.en")
        device = os.getenv("WHISPER_DEVICE", "cpu")
        compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
        _stt_model = WhisperModel(model_name, device=device, compute_type=compute_type)
        return _stt_model


def transcribe_audio_file(audio_path: str) -> str:
    """
    Transcribe an audio file using faster-whisper with Python vocabulary priming.
    """
    model = _get_whisper_model()
    audio_array = _decode_audio_16k_mono(audio_path)
    if audio_array.size == 0:
        return ""

    try:
        segments, _info = model.transcribe(
            audio_array,
            initial_prompt=_PYTHON_STT_PROMPT,
            vad_filter=True,
        )
        parts = [seg.text.strip() for seg in segments if seg.text and seg.text.strip()]
        return " ".join(parts).strip()
    except ValueError:
        # Silero VAD raises ValueError when no speech segments are found on short/quiet clips.
        segments, _info = model.transcribe(
            audio_array,
            initial_prompt=_PYTHON_STT_PROMPT,
            vad_filter=False,
        )
        parts = [seg.text.strip() for seg in segments if seg.text and seg.text.strip()]
        return " ".join(parts).strip()


def _get_piper_voice():
    """Lazily load (and auto-download if missing) the PiperVoice model."""
    global _tts_voice, _tts_model_loaded_path
    model_path = _configured_piper_model_path()
    config_path = Path(f"{model_path}.json")
    model_str = str(model_path)

    if _tts_voice is not None and _tts_model_loaded_path == model_str:
        return _tts_voice

    with _tts_lock:
        if _tts_voice is not None and _tts_model_loaded_path == model_str:
            return _tts_voice
        try:
            from piper import PiperVoice
            from piper.download_voices import download_voice
        except ImportError as exc:
            raise RuntimeError(
                "piper-tts is not installed. Install with: pip install piper-tts"
            ) from exc

        if not model_path.is_file() or not config_path.is_file():
            model_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                download_voice(model_path.stem, model_path.parent)
            except Exception as exc:
                raise RuntimeError(
                    f"Failed to download Piper voice '{model_path.stem}': {type(exc).__name__}: {exc}"
                ) from exc

        _tts_voice = PiperVoice.load(model_str)
        _tts_model_loaded_path = model_str
        return _tts_voice


_RE_CODE_CALL = re.compile(r"\b([A-Za-z_]\w*)\(([^()\n]*)\)")
_RE_STANDALONE_EQ = re.compile(r"\s=\s")
_RE_UNDERSCORE_JOIN = re.compile(r"(?<=\w)_(?=\w)")
_RE_MULTI_SPACE = re.compile(r"[ \t]{2,}")


def format_for_tts_prosody(text: str) -> str:
    """
    Prepare spoken response text for Piper TTS by turning Python symbols and
    inline function calls into clear, naturally paced spoken words with pauses.
    """
    if not text:
        return ""

    spoken = text
    for sym, phrase in (
        ("==", " equals equals "),
        ("!=", " not equals "),
        (">=", " greater than or equal to "),
        ("<=", " less than or equal to "),
        ("+=", " plus equals "),
        ("-=", " minus equals "),
        ("*=", " times equals "),
    ):
        spoken = spoken.replace(sym, phrase)

    spoken = _RE_STANDALONE_EQ.sub(" equals ", spoken)

    def _expand_call(match: re.Match[str]) -> str:
        fn_name = match.group(1)
        args = match.group(2).strip()
        if args:
            return f"{fn_name}, open parenthesis, {args}, close parenthesis"
        return f"{fn_name}, open parenthesis, close parenthesis"

    # Expand nested calls if any (up to 2 passes) before turning underscores to words.
    for _ in range(2):
        spoken = _RE_CODE_CALL.sub(_expand_call, spoken)

    spoken = _RE_UNDERSCORE_JOIN.sub(" underscore ", spoken)
    spoken = _RE_MULTI_SPACE.sub(" ", spoken)
    return spoken.strip()


def synthesize_speech_bytes(text: str, length_scale: float | None = None) -> bytes:
    """
    Synthesize calm, clearly paced WAV audio bytes for `text` using Piper TTS.

    Applies natural prosody settings (slower default `length_scale=1.28`), speaks
    Python code symbols clearly, and inserts breathing silences between chunks.
    """
    cleaned = (text or "").strip()
    if not cleaned:
        raise ValueError("Cannot synthesize empty text.")

    speak_symbols = os.getenv("PIPER_SPEAK_SYMBOLS", "true").strip().lower() not in {
        "0",
        "false",
        "no",
    }
    spoken_text = format_for_tts_prosody(cleaned) if speak_symbols else cleaned

    voice = _get_piper_voice()

    from piper.config import SynthesisConfig

    resolved_length = (
        length_scale
        if length_scale is not None
        else float(os.getenv("PIPER_LENGTH_SCALE", "1.28"))
    )
    resolved_length = max(0.5, min(2.5, float(resolved_length)))
    syn_config = SynthesisConfig(
        length_scale=resolved_length,
        noise_scale=float(os.getenv("PIPER_NOISE_SCALE", "0.72")),
        noise_w_scale=float(os.getenv("PIPER_NOISE_W_SCALE", "0.85")),
    )

    chunks = list(voice.synthesize(spoken_text, syn_config=syn_config))
    if not chunks:
        raise RuntimeError("Piper TTS produced no audio.")

    first = chunks[0]
    sample_rate = first.sample_rate
    sample_width = first.sample_width
    sample_channels = first.sample_channels
    bytes_per_sample = sample_width * sample_channels

    silence_between = b"\x00" * (int(sample_rate * 0.32) * bytes_per_sample)
    silence_end = b"\x00" * (int(sample_rate * 0.20) * bytes_per_sample)

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setframerate(sample_rate)
        wav_file.setsampwidth(sample_width)
        wav_file.setnchannels(sample_channels)

        for idx, audio_chunk in enumerate(chunks):
            if idx > 0:
                wav_file.writeframes(silence_between)
            wav_file.writeframes(audio_chunk.audio_int16_bytes)

        wav_file.writeframes(silence_end)

    return buffer.getvalue()
