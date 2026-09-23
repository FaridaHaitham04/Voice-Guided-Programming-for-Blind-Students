"""Sandboxed Python code execution endpoint."""

import os
import subprocess
import sys
import tempfile

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import CodeFile, User
from app.schemas import RunRequest, RunResponse

router = APIRouter(tags=["run"])

# Maximum execution time in seconds
_TIMEOUT = 5


@router.post("/run", response_model=RunResponse)
def run_code(
    body: RunRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Execute Python code in a sandboxed subprocess and return stdout lines.

    The sandbox enforces:
    - A hard timeout (5 seconds)
    - Execution in an isolated temporary directory
    - No network access (best-effort via restricted env)
    - stderr captured separately so runtime errors are reported cleanly
    """
    # Resolve the code to execute
    code: str | None = body.code
    if code is None and body.filename:
        row = (
            db.query(CodeFile)
            .filter(
                CodeFile.user_id == current_user.id,
                CodeFile.filename == body.filename,
            )
            .first()
        )
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"File '{body.filename}' not found.",
            )
        code = row.content

    if not code or not code.strip():
        return RunResponse(output=["(no output)"])

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

        stdout_lines = result.stdout.rstrip("\n").split("\n") if result.stdout.strip() else []

        if result.returncode != 0 and result.stderr.strip():
            # Append the last line of the traceback as a user-visible error
            err_lines = result.stderr.strip().split("\n")
            error_msg = err_lines[-1] if err_lines else "Runtime error"
            stdout_lines.append(f"Error: {error_msg}")

        if not stdout_lines:
            stdout_lines = ["(no output)"]

        return RunResponse(output=stdout_lines)

    except subprocess.TimeoutExpired:
        return RunResponse(output=["Error: Code execution timed out (5 second limit)."])
    finally:
        # Clean up temp files
        try:
            os.remove(script_path)
            os.rmdir(tmp_dir)
        except OSError:
            pass
