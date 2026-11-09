"""
BlindCode – FastAPI backend entry point.

Exposes:
  GET /api/health  →  quick liveness check used by the React frontend
                      and the benchmark tool to confirm the server is up.

CORS is open only to the Vite dev server (http://localhost:5173) so that
browser fetch calls work during local development without widening the
attack surface in production.
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables from backend/.env (falls back gracefully if
# the file is absent, e.g. in CI where vars are injected another way).
load_dotenv()

app = FastAPI(
    title="BlindCode Tutor API",
    version="0.1.0",
    description="Voice-guided Python tutoring backend powered by a local Ollama model.",
)

# --- CORS ------------------------------------------------------------------ #
# Allow the Vite dev server to call this API from the browser.
# Adjust ALLOWED_ORIGINS via the environment for staging/production.
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

    Returns {"status": "ok"} so the frontend (and monitoring scripts)
    can confirm the backend is reachable before making heavier requests.
    The tutor model name is echoed back so callers can verify the config
    was picked up correctly.
    """
    return {
        "status": "ok",
        "tutor_model": os.getenv("TUTOR_MODEL", "qwen2.5-coder:7b"),
    }

