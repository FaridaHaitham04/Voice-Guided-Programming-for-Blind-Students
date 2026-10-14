
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

app = FastAPI(title="BlindCode API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


class TutorRequest(BaseModel):
    message: str


@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "BlindCode API is running"}


@app.post("/api/tutor/chat")
async def tutor_chat(request: TutorRequest):
    if not request.message.strip():
        raise HTTPException(
            status_code=400,
            detail="Please provide a question."
        )

    payload = {
        "model": "qwen2.5-coder:3b",
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are BlindCode, a patient programming tutor "
                    "for blind and visually impaired beginners. "
                    "Teach Python using simple language and short, "
                    "clear explanations. Guide students step by step "
                    "rather than immediately giving away every answer. "
                    "Avoid relying on visual descriptions alone."
                ),
            },
            {
                "role": "user",
                "content": request.message,
            },
        ],
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(
                "http://127.0.0.1:11434/api/chat",
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        return {"reply": data["message"]["content"]}

    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="Ollama is not running. Please start Ollama."
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="The AI took too long to respond. Please try again."
        )
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Ollama returned an error: {exc.response.text}"
        )
