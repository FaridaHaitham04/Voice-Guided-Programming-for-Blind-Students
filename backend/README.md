# BlindCode – Backend

FastAPI backend for the BlindCode voice-guided Python tutor.
It powers the Vite + React 19 frontend on `http://localhost:5173` using:
- **LLM**: `qwen3:4b` hosted locally via Ollama (`think=False` for fast responses)
- **Speech-to-Text**: Whisper (`faster-whisper` via `POST /api/stt`)
- **Text-to-Speech**: Piper TTS (`piper-tts` via `POST /api/tts`, with browser Web Speech fallback when local voice files are not configured)

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

# Install dependencies
pip install -r requirements.txt

# Optional local voice engines (Whisper + Piper TTS)
pip install faster-whisper piper-tts

# Create local .env
copy .env.example .env
```

Pull the tutor model in Ollama:

```bash
ollama pull qwen3:4b
```

---

## Run the API server

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Liveness check, active `qwen3:4b` model, and Whisper/Piper readiness |
| `/api/lessons` | GET | Structured Python lessons with walkthroughs and starter code |
| `/api/lessons/{lesson_id}` | GET | Single lesson detail by ID |
| `/api/tutor` | POST | Single-turn speech-cleaned tutor response |
| `/api/tutor/stream` | POST | NDJSON sentence-by-sentence streaming tutor response |
| `/api/stt` | POST | Speech-to-Text transcription via `faster-whisper` |
| `/api/tts` | POST | Text-to-Speech WAV synthesis via Piper TTS |

---

## Run Tests

```bash
.\venv\Scripts\pytest.exe tests -v
```

---

## Project layout

```
backend/
├── app/
│   ├── prompts/
│   │   └── tutor_system.md   ← Vision spoken tutor persona & few-shot examples
│   ├── lessons_data.py       ← Structured Python lessons & code walkthroughs
│   ├── main.py               ← FastAPI app & endpoints
│   ├── tutor_context.py      ← Prompt assembly, speech cleaning & sentence splitter
│   └── voice.py              ← faster-whisper STT & Piper TTS wrappers
├── tests/
│   ├── test_tutor_api.py
│   └── test_tutor_context.py
├── .env.example
├── requirements.txt
└── README.md
```
