# BlindCode – Backend

FastAPI backend for the BlindCode voice-guided Python tutor.
It powers the Vite + React 19 frontend on `http://localhost:5173` using:
- **LLM**: `qwen2.5-coder:1.5b` hosted locally via Ollama (with automatic continuation and CUDA-to-CPU fallback)
- **Speech-to-Text**: Whisper (`faster-whisper` via `POST /api/stt`)
- **Text-to-Speech**: Piper TTS (`piper-tts` via `POST /api/tts`, auto-downloads `en_US-lessac-medium.onnx` into `backend/voices/`, with browser Web Speech fallback if not installed)

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.11+ | Matches the `venv` in `backend/` |
| Ollama | latest | <https://ollama.com> – must be running locally |
| Node / Vite | — | Frontend runs from the repo root |

---

## Setup

```bash
cd backend

# Activate the virtual environment (Windows PowerShell)
.\venv\Scripts\Activate.ps1

# Install core dependencies
pip install -r requirements.txt

# Optional local voice engines (Whisper + Piper TTS)
pip install faster-whisper piper-tts

# Create local .env
copy .env.example .env
```

Pull the tutor model in Ollama:

```bash
ollama pull qwen2.5-coder:1.5b
```

---

## Run the API server

```bash
cd backend
.\venv\Scripts\uvicorn.exe app.main:app --reload --port 8000
```

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Liveness check, active tutor model (`qwen2.5-coder:1.5b`), and Whisper/Piper readiness |
| `/api/lessons` | GET | Structured Python lessons with walkthroughs and starter code |
| `/api/lessons/{lesson_id}` | GET | Single lesson detail by ID |
| `/api/tutor` | POST | Single-turn speech-cleaned tutor response |
| `/api/tutor/stream` | POST | NDJSON sentence-by-sentence streaming tutor response |
| `/api/stt` | POST | Speech-to-Text transcription via `faster-whisper` |
| `/api/tts` | POST | Text-to-Speech WAV synthesis via Piper TTS (`length_scale` configurable) |

---

## Configuration & Troubleshooting

All settings are read from `backend/.env` (see `.env.example`):

- **Tutor Model & Length**: `TUTOR_MODEL=qwen2.5-coder:1.5b`, `TUTOR_MAX_TOKENS=512`. Multi-step answers automatically continue if they hit the token cap before completing.
- **Voice Pacing**: `PIPER_LENGTH_SCALE=1.28` slows speech slightly with natural prosody and punctuation pauses so blind students can follow code explanations clearly. Piper voice files download automatically to `backend/voices/` (git-ignored) on first use.
- **Older GPU / CUDA Error**: If Ollama fails with `CUDA error: device kernel image is invalid`, set `OLLAMA_NUM_GPU=0` in `backend/.env` (the backend also automatically falls back to CPU mode if a CUDA crash is detected).

---

## Run Tests

Install dev dependencies (`pytest`) once if needed, then run the test suite:

```bash
cd backend
.\venv\Scripts\pip.exe install -r requirements-dev.txt
.\venv\Scripts\pytest.exe tests -v
```

---

## Project layout

```
backend/
├── app/
│   ├── prompts/
│   │   ├── __init__.py
│   │   └── tutor_system.md   ← Vision spoken tutor persona & few-shot examples
│   ├── __init__.py
│   ├── lessons_data.py       ← Structured Python lessons & code walkthroughs
│   ├── main.py               ← FastAPI app & endpoints
│   ├── tutor_context.py      ← Prompt assembly, speech cleaning & sentence splitter
│   └── voice.py              ← faster-whisper STT & Piper TTS wrappers
├── tests/
│   ├── __init__.py
│   ├── test_tutor_api.py     ← Endpoint & streaming unit tests
│   └── test_tutor_context.py ← Prompt & speech-cleaning unit tests
├── .env.example              ← Environment variable template
├── requirements.txt          ← Core runtime dependencies
├── requirements-dev.txt      ← Development & test dependencies (pytest)
└── README.md
```
