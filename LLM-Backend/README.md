**LLM Backend

This is the LLM backend for the Voice-Guided Programming Tutor for Blind Students.

- It uses:

Python

FastAPI

Google Gemini

uv

1. Requirements

Install:

Python 3.13

uv

2. Clone the Project

git clone https://github.com/FaridaHaitham04/Voice-Guided-Programming-for-Blind-Students.git
cd Voice-Guided-Programming-for-Blind-Students
git checkout LLM

3. Go to the Backend

cd LLM-Backend

4. Install Dependencies

uv sync

5. Add Your Gemini API Key

Create a file called:

.env

Add:

GEMINI_API_KEY=your_api_key_here

Do not share or commit your .env file.

6. Test Gemini

uv run python src/llm_backend/gemini_test.py

If you get a response from Gemini, it is working.

7. Run the Backend

uv run uvicorn llm_backend.main:app --reload

The backend will run at:

http://127.0.0.1:8000

8. Test with Swagger

Open:

http://127.0.0.1:8000/docs

Open POST /ask, click Try it out, and use:

{
  "conversation_id": "test-001",
  "question": "What is a Python variable?"
}

For a follow-up question, use the same conversation_id:

{
  "conversation_id": "test-001",
  "question": "Can you give me a simple example?"
}

- Project Structure

LLM-Backend/
├── src/
│   └── llm_backend/
│       ├── main.py
│       └── gemini_test.py
├── .env.example
├── .python-version
├── pyproject.toml
├── uv.lock
└── README.md

- Important

Never commit .env.

Each team member should use their own Gemini API key.

Swagger /docs is only for backend testing.

The React frontend will communicate with this backend later.