
import os
from pathlib import Path

from dotenv import load_dotenv
from groq import Groq

from backend.ai_assistant.system_prompt import SYSTEM_PROMPT


# Load the .env file
project_root = Path(__file__).resolve().parents[2]
load_dotenv(project_root / ".env")

# Get the Groq API key
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY was not found. Check your .env file.")


# Connect to Groq
client = Groq(api_key=GROQ_API_KEY)

MODEL_NAME = "openai/gpt-oss-20b"


# Generate answers for the AI Tutor
def ask_llm(question):

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {
                "role": "system",
                "content": SYSTEM_PROMPT
            },
            {
                "role": "user",
                "content": question
            }
        ],
        max_tokens=500
    )

    answer = response.choices[0].message.content.strip()

    print("\nAI Assistant:", answer)

    return answer


# Generate or update code in the editor
def generate_code(instruction, existing_code="", mode="dictation"):

    if mode == "dictation":

        system_prompt = """
You are a Python code transcription assistant for blind and visually impaired students.

The student is dictating actual Python code using their voice.

Your task is to convert the spoken words into accurate Python code.

DICTATION RULES:
1. Preserve the student's intended code and logic.
2. Convert spoken programming terms into Python syntax.
3. Convert terms such as:
   - "open parenthesis" and "close parenthesis"
   - "open bracket" and "close bracket"
   - "colon"
   - "new line"
   - "indent"
   - "equal to"
   - "plus", "minus", "multiply", and "divide"
4. Apply correct Python indentation and formatting.
5. Preserve variable names and function names.
6. Do not invent additional functionality.
7. Do not change the student's logic unnecessarily.
8. Do not interpret actual code dictation as a request for a different solution.

GENERAL RULES:
- Preserve existing code.
- Add the dictated code to the existing program when appropriate.
- Do not delete existing code unless explicitly requested.
- Check brackets, quotes, colons, and indentation.
- Return the complete updated Python program.
- Return Python code only.
- Do not include Markdown code fences or explanations.
"""

    elif mode == "generation":

        system_prompt = """
You are a Python code generation assistant for blind and visually impaired students.

The student describes what they want their program to do.

Your task is to generate correct, simple, beginner-friendly Python code.

GENERATION RULES:
1. Understand the student's requirements carefully.
2. Generate code that satisfies the requested task.
3. Use simple Python syntax.
4. Preserve existing code when adding new functionality.
5. Do not add unnecessary features.
6. Use meaningful variable names.
7. Check that the code has correct syntax and indentation.
8. Return the complete updated Python program.
9. Return Python code only.
10. Do not include Markdown code fences or explanations.
"""

    else:
        raise ValueError("Invalid mode. Use 'dictation' or 'generation'.")

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": f"""
Student instruction:
{instruction}

Existing code:
{existing_code}
"""
            }
        ],
        max_tokens=1200
    )

    generated_code = response.choices[0].message.content.strip()

    # Remove Markdown code fences if returned by the model
    if generated_code.startswith("```"):
        generated_code = generated_code.split("\n", 1)[1]
        generated_code = generated_code.rsplit("```", 1)[0].strip()

    return generated_code


if __name__ == "__main__":

    question = input("Enter your programming question: ")

    answer = ask_llm(question)

    print("\nAnswer:", answer)
