# Running BlindCode

This guide contains the exact, step-by-step instructions to get the full BlindCode stack (Frontend, Backend, Database, and AI Tutor) running from a fresh checkout. 

---

### 1. Clone the repository
First, clone the repository and make sure you are on the `feature/backend-integration` branch:

```powershell
git clone https://github.com/FaridaHaitham04/Voice-Guided-Programming-for-Blind-Students.git
cd Voice-Guided-Programming-for-Blind-Students
git checkout feature/backend-integration
```

### 2. Configure Environment Variables
You must create a local environment file. If the backend doesn't find a `.env` file, it will fall back to default values which will cause connections to fail.

```powershell
# Copy the example file to create your local .env
Copy-Item .env.example .env
```

Open the `.env` file and fill in these values:
- `DATABASE_URL`: Leave this as `mysql+pymysql://blindcode:blindcode@localhost:3307/blindcode` (connects to the local Docker database).
- `JWT_SECRET`: Change this to a secure random string of your choice (used for signing login tokens).
- `SEG_API_KEY`: Enter your real API key from the SovereignEG dashboard.
- `SEG_BASE_URL`: Leave as `https://backend.sovereigneg.com/v1`.
- `SEG_CHAT_MODEL`: Leave as `gpt-oss-20b`.
- `SEG_EMBED_MODEL`: Leave as `bge-m3`.
- `VITE_API_URL`: Leave as `http://localhost:8000` (used by the frontend to find the backend).

### 3. Start the Database
The project uses MySQL 8 via Docker. 

```powershell
# Start the database container in the background
docker compose up -d

# Verify it is running and healthy
docker compose ps
```
*(Note: You should see the container `Up (healthy)`. We map this to host port **3307** instead of the default 3306 to avoid conflicts with any local MySQL installs you might already have running.)*

### 4. Setup Python Virtual Environment
We use Python 3.11+ for the FastAPI backend. You must create and activate the virtual environment so dependencies are isolated.

```powershell
cd backend
python -m venv venv

# Activate the environment (Windows)
venv\Scripts\activate

# Install the backend dependencies
pip install -r requirements.txt
```

### 5. Run Database Migrations
With the virtual environment active, run the Alembic migrations to create the database tables. 

```powershell
# Ensure you are still in the backend folder
python -m alembic upgrade head
```
*(Note: We use `python -m alembic` instead of a bare `alembic` command. This ensures the `backend` directory is properly added to Python's path so Alembic can import the `app` module without throwing a "ModuleNotFoundError".)*

### 6. Start the Backend API
Start the FastAPI server:

```powershell
uvicorn app.main:app --reload --port 8000
```
Confirm there are no startup errors in the terminal. The API is now listening at `http://localhost:8000`.

### 7. Start the Frontend
Open a **new, separate terminal** window. Leave the backend running in the first one.

```powershell
# From the project root
npm install
npm run dev
```
The frontend is now running at `http://localhost:5173`.

---

## ✅ How to know it's actually working

To confirm the full stack is wired up and talking end-to-end:
1. **Open the App**: Navigate to `http://localhost:5173` in your browser.
2. **Sign Up**: Create a brand new account using the Sign Up page. If it succeeds, the frontend is successfully talking to the database via the backend API.
3. **Check the Workspace**: Once logged in, look at the sidebar. You should see a populated list of files (e.g., `lesson1.py`) and lessons, proving the backend successfully seeded default data for your new user.
4. **Run Code**: Open a file, write a simple `print("Hello World")`, and click **Run**. It should execute in the backend sandbox and return the output to the UI.
5. **Ask the Tutor**: Open the AI Tutor panel and say "Hello". If you receive a coherent reply, the SovereignEG RAG pipeline and OpenAI client are correctly authenticated and working!

---

## 🛑 Troubleshooting

- **"ModuleNotFoundError" in VS Code**: Your IDE might highlight imports in red because it's using your global Python interpreter. Ensure you have the virtual environment activated in your terminal (`venv\Scripts\activate`) before running scripts, and point your IDE's Python interpreter to `backend/venv/Scripts/python.exe`.
- **Database Connection Fails / Port Conflicts**: If you get a connection refused or bind error when starting `docker compose`, check if something else is using port 3307. We explicitly moved away from port 3306 (which is baked into `docker-compose.yml` as `3307:3306`) to avoid clashing with standard local MySQL installations.
- **Backend crashes immediately on startup**: Double-check that your `.env` file actually exists and is named exactly `.env`. If you forgot to copy `.env.example`, the backend will fall back to defaults that might silently break connections.
