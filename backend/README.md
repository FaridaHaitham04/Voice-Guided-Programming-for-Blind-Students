# BlindCode – Backend

FastAPI backend for the BlindCode voice-guided Python tutor.  
It serves a REST API consumed by the Vite + React 19 frontend running on `http://localhost:5173`.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.11 + | Matches the `venv` already in this directory |
| Ollama | latest | <https://ollama.com> – must be running locally |
| Node / Vite | — | Frontend is in the repo root; backend is independent |

---

## First-time setup

```bash
# 1. Enter the backend directory
cd backend

# 2. Activate the virtual environment
#    Windows PowerShell:
.\venv\Scripts\Activate.ps1
#    macOS / Linux:
source venv/bin/activate

# 3. Install / sync dependencies
pip install -r requirements.txt

# 4. Create your local .env file
copy .env.example .env     # Windows
# cp .env.example .env     # macOS / Linux
# Then edit .env if you need a different OLLAMA_HOST or TUTOR_MODEL
```

---

## Pull the Ollama models

Before running anything, pull the models you intend to use:

```bash
ollama pull qwen2.5-coder:7b   # recommended tutor model (TUTOR_MODEL default)
ollama pull qwen2.5-coder:1.5b # lightweight alternative
ollama pull qwen3:8b           # benchmark only
ollama pull qwen3:4b           # benchmark only
ollama pull gemma3:4b          # benchmark only
```

---

## Run the API server

```bash
# From the repo root (recommended – uvicorn resolves app as backend/app/main.py)
cd backend
uvicorn app.main:app --reload --port 8000
```

The server starts at **<http://localhost:8000>**.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Liveness check; returns `{"status":"ok","tutor_model":"..."}` |
| `/docs` | GET | Interactive Swagger UI (auto-generated) |
| `/redoc` | GET | ReDoc API reference |

### Quick smoke-test (PowerShell)

```powershell
Invoke-RestMethod http://localhost:8000/api/health
```

Expected output:
```json
{ "status": "ok", "tutor_model": "qwen2.5-coder:7b" }
```

---

## Run the LLM benchmark

```bash
# Activate the venv first, then from the backend/ directory:
python tools/benchmark_llm.py
```

Outputs written to `backend/tools/`:

| File | Contents |
|------|----------|
| `benchmark_results.csv` | Raw metrics: model, question, TTFT, total time, tok/sec |
| `benchmark_answers.md` | All answers side-by-side with empty 1–5 score columns |

A formatted summary table is also printed to the terminal.

Override models or questions via environment variables — see the top of `benchmark_llm.py`.

---

## Project layout

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py          ← FastAPI app, CORS, /api/health
│   └── routers/         ← future route modules go here
├── tools/
│   ├── __init__.py
│   └── benchmark_llm.py ← LLM benchmark script
├── .env.example         ← copy → .env, never commit .env
├── requirements.txt
└── README.md            ← you are here
```
