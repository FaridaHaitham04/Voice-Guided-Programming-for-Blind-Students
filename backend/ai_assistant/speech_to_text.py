
import torch
from transformers import pipeline

print("Loading Whisper model...")

asr = pipeline(
    task="automatic-speech-recognition",
    model="openai/whisper-base.en",
    device="cpu"
)


def transcribe_audio(audio_path):

    result = asr(audio_path)

    recognized_text = result["text"].strip()

    print("Recognized speech:", recognized_text)

    return recognized_text


if __name__ == "__main__":

    audio_path = "backend/audio/question.wav"

    question = transcribe_audio(audio_path)

    print("Final transcription:", question)
