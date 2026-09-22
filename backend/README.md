# EchoCode Backend

FastAPI + SQLAlchemy + MySQL backend for the EchoCode voice-guided programming platform.

## Prerequisites

- Python 3.11+
- Docker & Docker Compose (for MySQL)

## Setup

### 1. Start the database

From the **project root**:

```bash
docker compose up -d
```

This starts a MySQL 8 instance on port 3306 with the database `echocode`.

### 2. Create a virtual environment

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment

Copy the example environment file and fill in your real values:

```bash
# From the project root
cp .env.example .env
```

Edit `.env` and set at minimum:
- `SEG_API_KEY` — your SovereignEG API key
- `JWT_SECRET` — a random string for signing JWTs

### 5. Run database migrations

```bash
cd backend
alembic upgrade head
```

### 6. Start the API server

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`. Visit `/docs` for the interactive Swagger UI.

## Project Structure

```
backend/
├── alembic/                # Database migrations
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
│       └── 001_initial_schema.py
├── alembic.ini
├── app/
│   ├── __init__.py
│   ├── auth.py             # Password hashing, JWT, current-user dep
│   ├── config.py           # Pydantic-settings (reads .env)
│   ├── database.py         # SQLAlchemy engine & session
│   ├── main.py             # FastAPI app entry point
│   ├── models.py           # ORM models (6 tables)
│   ├── rag.py              # Brute-force RAG engine
│   ├── schemas.py          # Pydantic request/response models
│   ├── seed.py             # Default data seeding on signup
│   └── routers/
│       ├── __init__.py
│       ├── auth.py         # POST /auth/signup, /auth/login, GET /me
│       ├── chat.py         # GET /chat, POST /chat
│       ├── files.py        # GET /files, GET/PUT /files/{name}
│       ├── lessons.py      # GET /lessons
│       └── run.py          # POST /run (sandboxed execution)
└── requirements.txt
```
