# BlindCode Architecture & Implementation

## Table of Contents
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Environment Variables](#environment-variables)
- [Current Git State](#current-git-state)
- [Timeline of Changes & Fixes](#timeline-of-changes--fixes)
- [Backend Implementation Details](#backend-implementation-details)
  - [Models & Database (`backend/app/models.py`)](#models--database)
  - [Alembic Migrations (`backend/alembic/versions/001_initial_schema.py`)](#alembic-migrations)
  - [Authentication Engine (`backend/app/auth.py`)](#authentication-engine)
  - [Auth Routing (`backend/app/routers/auth.py`)](#auth-routing)
  - [Files Routing (`backend/app/routers/files.py`)](#files-routing)
  - [Sandboxed Code Execution (`backend/app/routers/run.py`)](#sandboxed-code-execution)
  - [RAG & AI Tutor Pipeline (`backend/app/rag.py`)](#rag--ai-tutor-pipeline)
- [Frontend Implementation Details](#frontend-implementation-details)
  - [API Client (`src/api/client.js`)](#api-client)
  - [SignInPage (`src/pages/SignInPage.jsx`)](#signinpage)
  - [SignUpPage (`src/pages/SignUpPage.jsx`)](#signuppage)
  - [WorkspacePage (`src/pages/WorkspacePage.jsx`)](#workspacepage)

---

## Database Schema

| Table | Column | Type | Constraints / Purpose |
| :--- | :--- | :--- | :--- |
| `users` | `id` | `Integer` | Primary Key |
| `users` | `name` | `String(255)` | Not Null |
| `users` | `email` | `String(255)` | Unique, Indexed, Not Null |
| `users` | `hashed_password`| `String(255)` | Not Null |
| `users` | `created_at` | `DateTime` | Defaults to UTC now |
| `code_files` | `id` | `Integer` | Primary Key |
| `code_files` | `user_id` | `Integer` | Foreign Key to `users.id` |
| `code_files` | `filename` | `String(255)` | Not Null |
| `code_files` | `content` | `Text` | Not Null, Default "" |
| `code_files` | `updated_at` | `DateTime` | Auto-updates on modification |
| `lessons` | `id` | `Integer` | Primary Key |
| `lessons` | `user_id` | `Integer` | Foreign Key to `users.id` |
| `lessons` | `lesson_key` | `String(50)` | E.g. "lesson-1" |
| `lessons` | `title` | `String(255)` | Not Null |
| `lessons` | `file` | `String(255)` | The associated `.py` filename |
| `assessments` | `id` | `Integer` | Primary Key |
| `assessments` | `lesson_id` | `Integer` | Foreign Key to `lessons.id` |
| `assessments` | `name` | `String(255)` | Not Null |
| `assessments` | `score` | `String(20)` | Nullable |
| `chat_messages` | `id` | `Integer` | Primary Key |
| `chat_messages` | `user_id` | `Integer` | Foreign Key to `users.id` |
| `chat_messages` | `sender` | `String(10)` | "you" or "ai" |
| `chat_messages` | `text` | `Text` | Not Null |
| `chat_messages` | `created_at` | `DateTime` | Defaults to UTC now |
| `lesson_chunks` | `id` | `Integer` | Primary Key |
| `lesson_chunks` | `lesson_id` | `Integer` | Foreign Key to `lessons.id` |
| `lesson_chunks` | `content` | `Text` | Not Null |
| `lesson_chunks` | `embedding` | `JSON` | Nullable, stores `list[float]` |

---

## API Endpoints

| Method | Path | Request Body | Response Body |
| :--- | :--- | :--- | :--- |
| **POST** | `/auth/signup` | `{ name, email, password }` | `{ access_token, user: { email, name, initials } }` |
| **POST** | `/auth/login` | `{ email, password }` | `{ access_token, user: { email, name, initials } }` |
| **GET** | `/me` | None (Requires JWT Bearer) | `{ email, name, initials }` |
| **GET** | `/files` | None (Requires JWT) | `[{ filename, content }, ...]` |
| **GET** | `/files/{filename}` | None (Requires JWT) | `{ filename, content }` |
| **PUT** | `/files/{filename}` | `{ content }` (Requires JWT)| `{ filename, content }` |
| **POST** | `/run` | `{ filename }` or `{ code }` (JWT)| `{ output: [ "line1", "line2" ] }` |
| **GET** | `/lessons` | None (Requires JWT) | `[{ id, title, file, assessments }, ...]` |
| **POST** | `/chat` | `{ text, filename, cursor_line }` | `{ reply: "AI text" }` |
| **GET** | `/chat` | None (Requires JWT) | `[{ from, text }, ...]` |

---

## Environment Variables

| Variable | Purpose |
| :--- | :--- |
| `DATABASE_URL` | SQLAlchemy connection string pointing to our local MySQL Docker container (`mysql+pymysql://blindcode:blindcode@localhost:3307/blindcode`). |
| `JWT_SECRET` | A secure string used to cryptographically sign the JWT access tokens issued at login. |
| `SEG_API_KEY` | The API Key from the SovereignEG dashboard, used by the OpenAI client to hit SovereignEG's API. |
| `SEG_BASE_URL` | The endpoint URL for SovereignEG API (`https://backend.sovereigneg.com/v1`). |
| `SEG_CHAT_MODEL` | The LLM used for answering questions (`gpt-oss-20b`). |
| `SEG_EMBED_MODEL`| The LLM used to vectorize lesson chunks for RAG (`bge-m3`). |
| `VITE_API_URL` | Configures the frontend to point to the backend (typically `http://localhost:8000`). |

---

## Current Git State
- **Branch Name**: `feature/backend-integration`
- **Pushed?**: No. All recent work is local.
- **Git Log (Latest 10)**:
  ```text
  319d319 ignore .vscode/ folder
  f29ca69 wire up the real SovereignEG API using the openai client
  7a2df89 fix JWT crash by casting the user id subject to a string
  fb96caf fix mysql port conflict and rename database to blindcode
  c48f57e rename all EchoCode references to BlindCode across the stack
  e504ad4 fix: update requirements.txt versions for Python 3.13 compatibility
  4a1d813 fix: move /me endpoint to app root to match API spec
  be0a3bc feat: wire WorkspacePage to backend endpoints
  a92c5b1 feat: wire SignInPage + SignUpPage to real auth
  eb20a25 feat: add frontend API client
  ```

---

## Timeline of Changes & Fixes

1. **Rebranding**: The project was originally named `EchoCode`. We ran a full global replace in UI visible strings, documentation, `.json` files, connection URLs, and temporary dir prefixes to rename the brand to `BlindCode` (`blindcode`).
2. **Database Port Conflict**: We encountered `Bind for 0.0.0.0:3306 failed: port is already allocated` because developer machines often have MySQL running locally. We changed the host-port mapping in `docker-compose.yml` to `3307:3306`.
3. **JWT Sub Claim Crash**: During early testing of the `/auth/login` and `/auth/signup` routes, the FastAPI backend threw a Pydantic schema validation error upon token generation because the `user.id` passed to the `sub` claim was an `Integer`, but the standard JWT `sub` is explicitly expected to be a `String`. We fixed it by calling `str(user.id)`.
4. **SovereignEG / AI Tutor SDK Shift**: The initial RAG engine was written assuming a proprietary python package named `sovereigneg` existed. When we hit `ModuleNotFoundError`, we discovered SovereignEG actually just uses the official `openai` SDK but overrides the `base_url`. We swapped the requirements to install `openai` and refactored `app/rag.py` to use `client.chat.completions.create` and `client.embeddings.create`.

---

## Backend Implementation Details

### Models & Database
**File**: `backend/app/models.py`
**Job**: Maps Python classes to our MySQL tables via SQLAlchemy ORM. 

```python
class LessonChunk(Base):
    __tablename__ = "lesson_chunks"

    id = Column(Integer, primary_key=True, index=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(JSON, nullable=True)  # list of floats, stored as JSON
```
**Why**: We store vector embeddings directly in MySQL using a standard `JSON` column rather than spinning up a full vector database like PGVector or Pinecone. Since the dataset (lesson chunks) is extremely small, loading JSON arrays into memory and doing numpy cosine similarity is completely adequate and keeps the infrastructure simple.

### Alembic Migrations
**File**: `backend/alembic/versions/001_initial_schema.py`
**Job**: Defines the raw DDL schema creation steps.

```python
    op.create_table(
        "lesson_chunks",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("lesson_id", sa.Integer, sa.ForeignKey("lessons.id"), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("embedding", sa.JSON, nullable=True),
    )
```
**Why**: We define `embedding` explicitly as `sa.JSON`. This is because we need a place to safely stash the list of float embeddings returned by the SovereignEG embedding model without needing complex custom SQLAlchemy types.

### Authentication Engine
**File**: `backend/app/auth.py`
**Job**: Houses password hashing (bcrypt) and JWT encode/decode logic.

```python
def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create a signed JWT with *data* payload."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.jwt_expire_minutes)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)
```
**Why**: The JWT token expires quickly by default (`jwt_expire_minutes=60`). This is a standard security practice, though for a learning application, we might eventually want refresh tokens. We use `passlib.context.CryptContext` with `bcrypt` for passwords because it handles salting automatically.

### Auth Routing
**File**: `backend/app/routers/auth.py`
**Job**: Implements the HTTP endpoints for authentication.

```python
    # Seed default files, lessons, assessments, chat, and lesson chunks
    seed_user_data(user.id, db)

    token = create_access_token({"sub": str(user.id)})
```
**Why**: Upon a successful `/signup`, we invoke `seed_user_data(user.id, db)`. Because this app replaces the previously mocked state, we need to generate realistic files and lesson plans in the database immediately so the `WorkspacePage` isn't empty on first login. 
Notice `{"sub": str(user.id)}`. This is the fix for the crash mentioned in the timeline; JWT standards define the subject as a string, and `python-jose` strictly enforces it.

### Files Routing
**File**: `backend/app/routers/files.py`
**Job**: Handles CRUD operations for users' Python files.

```python
@router.put("/files/{filename}", response_model=FileOut)
def update_file(
    filename: str,
    body: FileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update (or create) a code file."""
    row = (
        db.query(CodeFile)
        .filter(CodeFile.user_id == current_user.id, CodeFile.filename == filename)
        .first()
    )
    if row:
        row.content = body.content
    else:
        row = CodeFile(user_id=current_user.id, filename=filename, content=body.content)
        db.add(row)
    db.commit()
```
**Why**: The frontend fires debounced `PUT` requests when code is edited. We use an upsert pattern here (check if it exists, update it if it does, create it if it doesn't) to simplify the frontend logic so it doesn't need to differentiate between a newly created practice file and an existing lesson file.

### Sandboxed Code Execution
**File**: `backend/app/routers/run.py`
**Job**: Safely executes untrusted user Python code in the backend.

```python
    # Write to a temp file inside an isolated directory
    tmp_dir = tempfile.mkdtemp(prefix="blindcode_")
    script_path = os.path.join(tmp_dir, "user_script.py")

    try:
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(code)

        # Build a restricted environment — remove variables that could
        # leak info or enable network access on some platforms.
        env = {
            "PATH": os.environ.get("PATH", ""),
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONUNBUFFERED": "1",
        }

        result = subprocess.run(
            [sys.executable, "-u", script_path],
            capture_output=True,
            text=True,
            timeout=_TIMEOUT,
            cwd=tmp_dir,
            env=env,
        )
```
**Why**: We isolate the execution locally using a temporary directory via `tempfile.mkdtemp(prefix="blindcode_")` so file I/O operations from one user do not pollute another user's execution environment. 
- **Timeout**: The `_TIMEOUT=5` parameter on `subprocess.run` enforces a strict execution time limit to prevent infinite loops (common for students learning `while`). 
- **No-network limits**: We attempt to enforce isolation via stripping the environment variables down to just `PATH`. *However, honesty check: this is NOT a true sandbox.* Stripping `env` variables does not stop Python code from `import urllib` and making outbound requests on a standard host. To enforce real network boundaries, the container itself would need to run with restricted network capabilities (e.g. `docker run --network none`), or we'd need to use tools like `nsjail`. For now, it is a "soft" sandbox.

### RAG & AI Tutor Pipeline
**File**: `backend/app/rag.py`
**Job**: Uses embeddings to find relevant context, then passes context+code to the SovereignEG LLM.

```python
def _get_seg_client():
    """Return a lazily-initialised SovereignEG client."""
    global _seg_client
    if _seg_client is None:
        try:
            from openai import OpenAI
            _seg_client = OpenAI(
                api_key=settings.seg_api_key,
                base_url=settings.seg_base_url,
            )
        except ImportError:
            logger.warning(
                "openai package not installed — RAG will fall back to "
                "simple keyword replies."
            )
    return _seg_client
```
**Why**: We use the official `openai` client but point `base_url` to `https://backend.sovereigneg.com/v1`. The initialization is lazy so that if the DB starts up before the API key is fully exported or if `openai` isn't installed locally, the server doesn't crash on boot and can fallback to basic keyword responses.

```python
    q_emb = _embed_with_retry(client, question)
    q_vec = np.array(q_emb, dtype=np.float32)
    q_norm = np.linalg.norm(q_vec)
    if q_norm > 0:
        q_vec = q_vec / q_norm

    similarities = _chunk_matrix @ q_vec
    top_indices = np.argsort(similarities)[::-1][:top_k]
    return [_chunk_texts[i] for i in top_indices]
```
**Why**: This is the core similarity search. We keep `_chunk_matrix` (a normalized NumPy matrix of all embeddings) cached in memory. When a question comes in, we embed the question, normalize its vector, and use matrix multiplication (`@`) to compute Cosine Similarities against all chunks simultaneously. We sort to find the top `K`. Since it's done in-memory via C-bindings in numpy, it's extremely fast and avoids the complexity of querying a dedicated vector database for just ~50 chunks.

---

## Frontend Implementation Details

### API Client
**File**: `src/api/client.js`
**Job**: Centralized fetch wrapper to handle Base URLs, JWT injection, and Error handling.

```javascript
async function request(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  // ...
  const response = await fetch(`${BASE_URL}${path}`, options);
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const err = await response.json();
      if (err.detail) detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
    } catch { /* ... */ }
    throw new Error(detail);
  }
  return response.json();
}
```
**Why**: Instead of peppering `fetch()` all over React components, this thin wrapper ensures every outbound request automatically includes the `Bearer token` from `localStorage`, and translates standard FastAPI HTTP 400/500 `{"detail": "..."}` errors into standard JavaScript `Error` objects that our UI components can `.catch()` easily.

### SignInPage
**File**: `src/pages/SignInPage.jsx`
**Job**: Authenticates the user and handles Voice login gracefully.

```javascript
  async function handleEmailSubmit(event) {
    event.preventDefault();
    // ...
    try {
      const data = await api.post("/auth/login", {
        email: email.trim(),
        password,
      });
      setToken(data.access_token);
      announce(`Signed in as ${data.user.email}.`);
      onSignedIn(data.user);
    } catch (err) {
      announce(err.message || "Sign-in failed. Please try again.");
    }
  }
```
**Why**: We replaced the previous in-memory mock state auth with real calls to `/auth/login`. On success, we save the token via `setToken` and bubble up the `user` object to the parent Shell so it knows to transition to the Workspace. Note the extensive use of `announce()`. This is an accessibility-first application. When async operations complete or fail, a live region (an `aria-live="polite"` div) is populated to read the result to the blind student.

### SignUpPage
**File**: `src/pages/SignUpPage.jsx`
**Job**: Creates a new user profile.

```javascript
      const data = await api.post("/auth/signup", {
        name: name.trim(),
        email: email.trim(),
        password,
      });
      setToken(data.access_token);
      announce(`Account created for ${data.user.name}. Opening BlindCode.`);
      onSignedIn(data.user);
```
**Why**: Like SignInPage, we replace mock logic with a real `/auth/signup` fetch. Notice we automatically set the token and call `onSignedIn` to seamlessly log the user in upon creation.

### WorkspacePage
**File**: `src/pages/WorkspacePage.jsx`
**Job**: The primary authenticated dashboard (Editor, Output, AI Chat).

```javascript
  const saveToBackend = useCallback(
    (filename, content) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          await api.put(`/files/${encodeURIComponent(filename)}`, { content });
        } catch { } // Silent failure on autosave
      }, 1000);
    },
    []
  );

  function updateCode(next) {
    setFiles((current) => ({ ...current, [activeFile]: next }));
    const line = next.slice(0, editorRef.current?.selectionStart || 0).split("\n").length;
    setCursorLine(line);
    saveToBackend(activeFile, next);
  }
```
**Why**: When the student types code, updating the database on every keystroke would overwhelm our FastAPI backend. We utilize a `setTimeout` debouncer (1000ms delay) that is cleared on every keystroke. It silently fails if there is a network issue, since keeping the local state updated is paramount to their immediate typing experience.

```javascript
  async function runCode() {
    setAnnounce("Running code\u2026");
    try {
      const data = await api.post("/run", { filename: activeFile });
      const result = data.output || [];
      setOutput(result.length ? result : ["(no output)"]);
      setAnnounce(`Ran ${activeFile}. ${result.length} output lines.`);
    } catch (err) { ... }
  }
```
**Why**: This executes the remote `/run` endpoint against the active file and updates the DOM UI with the output arrays. We strictly use `data.output` to map back the array of lines produced by `stdout` on the server.

```javascript
    try {
      const data = await api.post("/chat", {
        text,
        filename: activeFile,
        cursor_line: cursorLine,
      });
      const reply = data.reply;
      setChat((current) => [...current, { from: "ai", text: reply }]);
      setAnnounce(reply);
      // ...
```
**Why**: For the AI Tutor, we not only send the user's spoken `text`, but also contextual information: the currently active `filename` and the `cursor_line` (calculated on key presses in the editor). This gives the RAG backend exact awareness of what the blind student is looking at, which allows the AI to reference precise locations (e.g. "You have a syntax error on line 4") which is critical for non-visual debugging.
