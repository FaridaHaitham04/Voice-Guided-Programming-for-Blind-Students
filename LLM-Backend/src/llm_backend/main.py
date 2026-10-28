import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import base64
import json
from pydantic import BaseModel
from google import genai
from google.genai import types


load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    raise RuntimeError("GEMINI_API_KEY is not set.")

client = genai.Client(api_key=api_key)

app = FastAPI()

LIVE_MODELS = {
    "gemini-3.8-live",
    "gemini-2.5-flash-native-audio-preview-12-2025",
}

TUTOR_PROMPT = """You are a voice-first programming tutor for blind students. Speak clearly and concisely. Never rely on visual references. Explain code step by step, describe what it does and why it works, and kindly explain errors and fixes. Ask a brief clarification question when needed."""

# Stores conversations while the server is running
conversations = {}


@app.websocket("/live")
async def live_tutor(websocket: WebSocket):
    """Bridge student text/transcripts to Gemini Live without exposing the API key."""
    await websocket.accept()
    try:
        request = await websocket.receive_json()
        model = request.get("model", "gemini-3.8-live")
        if model not in LIVE_MODELS:
            await websocket.send_json({"type": "error", "message": "That Live model is not enabled."})
            await websocket.close(code=1008)
            return

        question = request.get("question", "").strip()
        if not question:
            await websocket.send_json({"type": "error", "message": "Please ask a question."})
            await websocket.close(code=1008)
            return

        context = request.get("context", "")
        prompt = f"Student question: {question}"
        if context:
            prompt += f"\n\nCurrent student work and output:\n{context}"

        async with client.aio.live.connect(
            model=model,
            config={
                "response_modalities": ["AUDIO"],
                "system_instruction": TUTOR_PROMPT,
                "output_audio_transcription": {},
            },
        ) as session:
            await session.send_realtime_input(text=prompt)
            async for response in session.receive():
                content = response.server_content
                if content:
                    transcript = getattr(content, "output_transcription", None)
                    if transcript and transcript.text:
                        await websocket.send_json({"type": "text", "text": transcript.text})
                    turn = getattr(content, "model_turn", None)
                    if turn:
                        for part in turn.parts:
                            inline = getattr(part, "inline_data", None)
                            if inline and inline.data:
                                audio = inline.data
                                if isinstance(audio, str):
                                    encoded = audio
                                else:
                                    encoded = base64.b64encode(audio).decode("ascii")
                                await websocket.send_json({
                                    "type": "audio",
                                    "data": encoded,
                                    "mimeType": getattr(inline, "mime_type", "audio/pcm;rate=24000"),
                                })
                            elif getattr(part, "text", None):
                                await websocket.send_json({"type": "text", "text": part.text})
                    if getattr(content, "turn_complete", False):
                        break
        await websocket.send_json({"type": "done"})
    except WebSocketDisconnect:
        return
    except Exception:
        # Keep provider errors and configuration details on the server only.
        await websocket.send_json({"type": "error", "message": "Gemini Live is unavailable for this model or account."})
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


class QuestionRequest(BaseModel):
    conversation_id: str
    question: str
    current_file: str | None = None
    code: str | None = None
    output: str | None = None


@app.get("/")
def home():
    return {"message": "LLM Backend is running!"}


@app.post("/ask")
def ask_gemini(request: QuestionRequest):

    # Create a new conversation if it doesn't exist
    if request.conversation_id not in conversations:
        conversations[request.conversation_id] = []

    tutor_prompt = """
You are a voice-first programming tutor designed specifically for blind students.

Your goal is to teach programming clearly, patiently, and step by step.

Follow these rules:

1. Use simple and beginner-friendly language.

2. Your responses will usually be read aloud using text-to-speech.
   Make your responses natural and easy to understand when spoken.

3. Do not depend on visual information.
   Never tell the student to look at something, click something visually,
   or refer to things as being above, below, left, right, or on the screen.

4. Explain programming concepts step by step.
   When a concept is complicated, break it into smaller parts.

5. When giving code, introduce the code verbally first.
   Then explain what the important parts of the code do.

6. When explaining code, explain both:
   - what the code does
   - why it works

7. When the student makes a programming error:
   - explain what the error means
   - explain why it happened
   - explain how to fix it
   - provide corrected code when useful

8. Keep spoken explanations concise.
   Avoid unnecessarily long answers unless the student asks for more detail.

9. Do not assume the student can see the code visually.
   Describe important code elements clearly using words.

10. Encourage learning and understanding.
    Do not simply give the final answer when teaching a concept.

11. When giving multiple steps, clearly number them so they are easy to follow
    when spoken aloud.

12. If the student's question is unclear, ask a short clarification question
    instead of guessing.

13. Be patient, supportive, and respectful.
    Never make the student feel bad for making a mistake.

14. When presenting code, say "The code is" instead of using visual phrases
    such as "looks like this".

15. If the student asks you to write, create, or change code, provide one
    complete Python file in a fenced python code block. Explain the purpose
    and main steps briefly before or after the code block. Base the code on
    the student's current file when one is included.
"""

    # Get previous conversation history
    conversation_history = conversations[request.conversation_id]

    # Add the new student question to the history
    student_message = request.question
    if request.code is not None:
        student_message += f"\n\nCurrent file ({request.current_file or 'Python file'}):\n```python\n{request.code}\n```"
    if request.output:
        student_message += f"\n\nMost recent program output:\n{request.output}"

    conversation_history.append(
        types.Content(
            role="user",
            parts=[
                types.Part.from_text(text=student_message)
            ],
        )
    )

    # Generate Gemini response using the complete conversation
    response = client.models.generate_content(
        model="gemini-3.5-flash-lite",
        contents=conversation_history,
        config=types.GenerateContentConfig(
            system_instruction=tutor_prompt
        ),
    )

    answer = response.text or "I could not prepare a reply. Please try again."
    code_match = re.search(r"```(?:python|py)?\s*\n(.*?)```", answer, re.IGNORECASE | re.DOTALL)
    suggested_code = code_match.group(1).strip("\n") if code_match else None
    if code_match:
        answer = (answer[:code_match.start()] + answer[code_match.end():]).strip()

    # Save Gemini's response to the conversation
    conversation_history.append(
        types.Content(
            role="model",
            parts=[
                types.Part.from_text(text=answer)
            ],
        )
    )

    return {
        "conversation_id": request.conversation_id,
        "answer": answer,
        "suggested_code": suggested_code,
    }
