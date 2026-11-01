
import uuid
import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.ai_assistant.speech_to_text import transcribe_audio
from backend.ai_assistant.llm import ask_llm, generate_code
from backend.ai_assistant.text_to_speech import generate_speech


# Create the FastAPI application
app = FastAPI(title="BlindCode AI Tutor")

# Allow the React website to communicate with Python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Audio folder
AUDIO_DIR = Path(__file__).resolve().parent / "audio"
AUDIO_DIR.mkdir(exist_ok=True)

# Make generated audio available to the website
app.mount(
    "/audio",
    StaticFiles(directory=str(AUDIO_DIR)),
    name="audio"
)


# Receive typed questions
class TextQuestion(BaseModel):
    question: str


# Generate an answer and its audio
def create_tutor_response(question):

    if not question.strip():
        raise HTTPException(status_code=400, detail="Question is empty.")

    answer = ask_llm(question)

    audio_filename = f"answer-{uuid.uuid4().hex}.wav"
    audio_path = AUDIO_DIR / audio_filename

    generate_speech(answer, str(audio_path))

    return {
        "question": question,
        "answer": answer,
        "audio_url": f"/audio/{audio_filename}"
    }


# Test the API
@app.get("/")
def home():
    return {"message": "BlindCode AI Tutor API is running!"}


# Handle typed questions
@app.post("/api/tutor/text")
def text_question(data: TextQuestion):
    return create_tutor_response(data.question)


# Handle microphone recordings for the AI Tutor
@app.post("/api/tutor/voice")
async def voice_question(file: UploadFile = File(...)):

    temporary_path = None

    try:
        # Save the microphone recording temporarily
        suffix = Path(file.filename or "recording.webm").suffix or ".webm"

        with tempfile.NamedTemporaryFile(
            suffix=suffix, delete=False
        ) as temporary_file:
            temporary_file.write(await file.read())
            temporary_path = temporary_file.name

        # Convert the recording into text using Whisper
        question = transcribe_audio(temporary_path)

        if not question:
            raise HTTPException(
                status_code=400,
                detail="No speech was recognized."
            )

        # Send the recognized question to Groq
        return create_tutor_response(question)

    finally:
        # Delete the temporary microphone recording
        if temporary_path and Path(temporary_path).exists():
            Path(temporary_path).unlink()


# Handle voice instructions for the code editor
@app.post("/api/editor/voice")
async def voice_to_code(
    file: UploadFile = File(...),
    existing_code: str = Form(""),
    mode: str = Form("dictation")
):

    temporary_path = None

    try:
        # Validate the selected mode
        if mode not in ["dictation", "generation"]:
            raise HTTPException(
                status_code=400,
                detail="Invalid mode. Choose dictation or generation."
            )

        # Save the microphone recording temporarily
        suffix = Path(file.filename or "recording.webm").suffix or ".webm"

        with tempfile.NamedTemporaryFile(
            suffix=suffix, delete=False
        ) as temporary_file:
            temporary_file.write(await file.read())
            temporary_path = temporary_file.name

        # Convert the student's speech into text
        instruction = transcribe_audio(temporary_path)

        if not instruction:
            raise HTTPException(
                status_code=400,
                detail="No speech was recognized."
            )

        # Generate or update Python code using the selected mode
        generated_code = generate_code(
            instruction,
            existing_code,
            mode
        )

        return {
            "instruction": instruction,
            "mode": mode,
            "code": generated_code
        }

    finally:
        # Delete the temporary recording
        if temporary_path and Path(temporary_path).exists():
            Path(temporary_path).unlink()
