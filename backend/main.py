
from backend.ai_assistant.speech_to_text import transcribe_audio
from backend.ai_assistant.llm import ask_llm
from backend.ai_assistant.text_to_speech import generate_speech


def main():

    print("Welcome to your Voice Programming Assistant!")

    # Step 1: Convert student's speech into text
    print("\nListening to your recorded question...")
    question = transcribe_audio("backend/audio/question.wav")

    if not question:
        print("No speech was recognized.")
        return

    # Step 2: Send the question to the AI model
    print("\nGenerating AI response...")
    answer = ask_llm(question)

    # Step 3: Convert the AI response into speech
    print("\nConverting the answer into speech...")
    audio_path = generate_speech(answer)

    # Step 4: Play the generated audio
    print("\nPlaying the AI response...")
    import os
    os.startfile(audio_path)


if __name__ == "__main__":
    main()
