import os

from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel
from google import genai
from google.genai import types


load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    raise RuntimeError("GEMINI_API_KEY is not set.")

client = genai.Client(api_key=api_key)

app = FastAPI()

# Stores conversations while the server is running
conversations = {}


class QuestionRequest(BaseModel):
    conversation_id: str
    question: str


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
"""

    # Get previous conversation history
    conversation_history = conversations[request.conversation_id]

    # Add the new student question to the history
    conversation_history.append(
        types.Content(
            role="user",
            parts=[
                types.Part.from_text(text=request.question)
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

    answer = response.text

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
    }