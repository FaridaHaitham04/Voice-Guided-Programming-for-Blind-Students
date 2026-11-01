import numpy as np
import soundfile as sf
from kokoro import KPipeline

print("Loading Kokoro TTS model...")

# Initialize Kokoro for American English
tts_pipeline = KPipeline(lang_code="a")


def generate_speech(text, output_path="backend/audio/answer.wav"):
    """
    Convert text into speech and save it as a WAV file.
    """

    print("Generating speech...")

    # Generate audio using the af_heart voice
    generator = tts_pipeline(text, voice="af_heart")

    audio_chunks = []

    # Collect all generated audio chunks
    for _, _, audio in generator:
        audio_chunks.append(audio)

    # Combine chunks into one audio file
    if not audio_chunks:
        raise RuntimeError("Kokoro did not generate any audio.")

    final_audio = np.concatenate(audio_chunks)

    # Save the audio at 24 kHz
    sf.write(output_path, final_audio, 24000)

    print("Speech saved to:", output_path)

    return output_path