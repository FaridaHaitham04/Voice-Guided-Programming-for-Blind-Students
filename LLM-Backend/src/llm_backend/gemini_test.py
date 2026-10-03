import os

from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    raise RuntimeError("GEMINI_API_KEY is not set.")

client = genai.Client(api_key=api_key)

print("Sending request...")

response = client.models.generate_content(
    model="gemini-3.5-flash-lite",
    contents="Explain what a Python variable is in one simple sentence.",
)

print("Response received:")
print(response.text)
