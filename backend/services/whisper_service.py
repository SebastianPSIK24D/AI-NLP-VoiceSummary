"""
whisper_service.py
Layanan Speech-to-Text menggunakan Whisper via Groq API.
"""

import os
import requests
import logging

logger = logging.getLogger(__name__)

# Groq API endpoint untuk audio transcription
GROQ_AUDIO_URL = "https://api.groq.com/openai/v1/audio/transcriptions"

# Model Whisper yang digunakan
WHISPER_MODEL = "whisper-large-v3"


def transcribe_audio(file_path: str, api_key: str) -> str:
    """
    Mengirim file audio ke Groq Whisper API dan mengembalikan hasil transkripsi.

    Args:
        file_path (str): Path ke file audio yang akan ditranskrip.
        api_key (str): Groq API key.

    Returns:
        str: Teks hasil transkripsi.

    Raises:
        ValueError: Jika file tidak ditemukan atau response tidak valid.
        requests.HTTPError: Jika API mengembalikan error.
    """

    # Validasi file
    if not os.path.exists(file_path):
        raise ValueError(f"File audio tidak ditemukan: {file_path}")

    file_size = os.path.getsize(file_path)
    if file_size == 0:
        raise ValueError("File audio kosong (ukuran 0 bytes).")

    logger.info(f"[Whisper] Memulai transkripsi: {file_path} ({file_size} bytes)")

    # Header autentikasi
    headers = {
        "Authorization": f"Bearer {api_key}",
    }

    # Kirim file audio ke Groq API
    with open(file_path, "rb") as audio_file:
        files = {
            "file": (os.path.basename(file_path), audio_file, "audio/mpeg"),
        }
        data = {
            "model": WHISPER_MODEL,
            "response_format": "json",
            "language": "id",  # Deteksi otomatis bahasa (id = Indonesia, bisa diganti "en" atau dihapus untuk auto-detect)
        }

        try:
            response = requests.post(
                GROQ_AUDIO_URL,
                headers=headers,
                files=files,
                data=data,
                timeout=120,  # Timeout 2 menit untuk file besar
            )
            response.raise_for_status()
        except requests.exceptions.Timeout:
            raise ValueError("Timeout: Groq API tidak merespons dalam 120 detik.")
        except requests.exceptions.HTTPError as e:
            error_detail = ""
            try:
                error_detail = response.json().get("error", {}).get("message", str(e))
            except Exception:
                error_detail = str(e)
            raise ValueError(f"Groq Whisper API error: {error_detail}")

    # Parse hasil transkripsi
    result = response.json()
    transcript = result.get("text", "").strip()

    if not transcript:
        raise ValueError("Transkripsi kosong — audio mungkin tidak mengandung suara yang bisa dikenali.")

    logger.info(f"[Whisper] Transkripsi berhasil. Panjang teks: {len(transcript)} karakter")
    return transcript
