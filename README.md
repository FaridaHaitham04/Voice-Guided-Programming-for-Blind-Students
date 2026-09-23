# BlindCode — Voice-Guided Programming for Blind Students

A web-based Python programming environment with voice interaction, AI tutoring, and full accessibility for blind and low-vision students.

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite |
| Backend | FastAPI + SQLAlchemy |
| Database | MySQL 8 |
| AI Tutor | SovereignEG (RAG pipeline) |
| Code Execution | Sandboxed Python subprocess |

## Quick Start

### Prerequisites

- **Node.js** 18+ and **npm**
- **Python** 3.11+
- **Docker** & **Docker Compose**

### 1. Clone and configure

```bash
git clone https://github.com/FaridaHaitham04/Voice-Guided-Programming-for-Blind-Students.git
cd Voice-Guided-Programming-for-Blind-Students

# Copy environment template and fill in your values
cp .env.example .env
# Edit .env — set SEG_API_KEY and JWT_SECRET at minimum
```

### 2. Start the database

```bash
docker compose up -d
```

### 3. Start the backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

The API is now running at `http://localhost:8000` (Swagger UI at `/docs`).

### 4. Start the frontend

In a **separate terminal**, from the project root:

```bash
npm install
npm run dev
```

The app is now running at `http://localhost:5173`.

### 5. Use the app

1. Open `http://localhost:5173` in your browser.
2. Create an account on the sign-up page.
3. The workspace will load with pre-seeded lesson files.
4. Edit code, click **Run** to execute, and use the AI Tutor panel.

## Environment Variables

See [`.env.example`](.env.example) for all available variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MySQL connection string |
| `JWT_SECRET` | Secret key for signing JWT tokens |
| `SEG_API_KEY` | SovereignEG API key for AI tutor |
| `SEG_BASE_URL` | SovereignEG API base URL |
| `SEG_CHAT_MODEL` | Model name for chat completions |
| `SEG_EMBED_MODEL` | Model name for embeddings |
| `VITE_API_URL` | Backend URL for the frontend |

## Project Structure

```
├── .env.example              # Environment template
├── docker-compose.yml        # MySQL service
├── backend/                  # FastAPI backend
│   ├── README.md
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/              # Database migrations
│   └── app/                  # Application code
│       ├── main.py           # FastAPI entry point
│       ├── config.py         # Settings from .env
│       ├── models.py         # SQLAlchemy ORM models
│       ├── schemas.py        # Pydantic models
│       ├── auth.py           # JWT + bcrypt utilities
│       ├── rag.py            # RAG engine
│       ├── seed.py           # Default data seeding
│       └── routers/          # API endpoint modules
├── src/                      # React frontend
│   ├── api/client.js         # API client (fetch wrapper)
│   ├── pages/                # SignIn, SignUp, Workspace
│   ├── components/           # AuthShell, MicIcon
│   └── utils/                # Syntax highlighting
├── index.html
├── package.json
└── vite.config.js
```
