"""
llama_service.py
Layanan NLP menggunakan LLaMA via Groq API.
Menghasilkan: ringkasan, poin penting, dan daftar tugas dari teks transkripsi.
"""

import requests
import logging
import json
import re

logger = logging.getLogger(__name__)

# Groq API endpoint untuk chat completions
GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"

# Model LLaMA yang digunakan
LLAMA_MODEL = "llama-3.1-8b-instant"

# System prompt untuk NLP analysis
SYSTEM_PROMPT = """Analis percakapan. Balas HANYA dengan JSON valid, tanpa teks lain."""

# Template prompt untuk analisis teks
ANALYSIS_PROMPT_TEMPLATE = """Analisis teks ini, balas HANYA JSON:

{transcript}

Format:
{{"summary":"ringkasan 2-3 kalimat","important_points":["poin1","poin2"],"tasks":["tugas1"]}}"""


def analyze_transcript(transcript: str, api_key: str) -> dict:
    """
    Mengirim teks transkripsi ke Groq LLaMA API untuk dianalisis.

    Args:
        transcript (str): Teks hasil transkripsi.
        api_key (str): Groq API key.

    Returns:
        dict: Dictionary berisi 'summary', 'important_points', dan 'tasks'.

    Raises:
        ValueError: Jika transkripsi kosong atau response tidak valid.
        requests.HTTPError: Jika API mengembalikan error.
    """

    # Validasi input
    if not transcript or not transcript.strip():
        raise ValueError("Teks transkripsi tidak boleh kosong.")

    logger.info(f"[LLaMA] Memulai analisis teks. Panjang: {len(transcript)} karakter")

    # Header autentikasi
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    # Format prompt dengan transkripsi
    user_prompt = ANALYSIS_PROMPT_TEMPLATE.format(transcript=transcript)

    # Payload request
    payload = {
        "model": LLAMA_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,       # Rendah untuk output yang konsisten
        "max_tokens": 1024,
        "response_format": {"type": "json_object"},  # Force JSON output
    }

    try:
        response = requests.post(
            GROQ_CHAT_URL,
            headers=headers,
            json=payload,
            timeout=60,  # Timeout 60 detik
        )
        response.raise_for_status()
    except requests.exceptions.Timeout:
        raise ValueError("Timeout: LLaMA API tidak merespons dalam 60 detik.")
    except requests.exceptions.HTTPError as e:
        error_detail = ""
        try:
            error_detail = response.json().get("error", {}).get("message", str(e))
        except Exception:
            error_detail = str(e)
        raise ValueError(f"Groq LLaMA API error: {error_detail}")

    # Parse response
    result = response.json()

    # Ambil konten pesan dari response
    try:
        content = result["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as e:
        raise ValueError(f"Format response LLaMA tidak valid: {e}")

    # Parse JSON dari content
    analysis = _parse_llm_json(content)

    logger.info("[LLaMA] Analisis berhasil: ringkasan, poin penting, dan tugas diekstrak.")
    return analysis


def _parse_llm_json(content: str) -> dict:
    """
    Parse JSON dari response LLM. Menangani kasus di mana LLM menambahkan
    teks tambahan di sekitar JSON.

    Args:
        content (str): Raw content dari LLM response.

    Returns:
        dict: Parsed analysis data.
    """
    # Coba parse langsung
    try:
        data = json.loads(content)
        return _validate_and_normalize(data)
    except json.JSONDecodeError:
        pass

    # Coba ekstrak JSON dari dalam markdown code block
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
    if json_match:
        try:
            data = json.loads(json_match.group(1))
            return _validate_and_normalize(data)
        except json.JSONDecodeError:
            pass

    # Coba ekstrak JSON object dari text
    json_match = re.search(r"\{[\s\S]*\}", content)
    if json_match:
        try:
            data = json.loads(json_match.group())
            return _validate_and_normalize(data)
        except json.JSONDecodeError:
            pass

    # Fallback: kembalikan struktur default dengan konten mentah
    logger.warning("[LLaMA] Gagal parse JSON, menggunakan fallback.")
    return {
        "summary": content[:500] if content else "Tidak dapat memproses ringkasan.",
        "important_points": ["Tidak dapat mengekstrak poin penting."],
        "tasks": ["Tidak dapat mengekstrak daftar tugas."],
    }


def _validate_and_normalize(data: dict) -> dict:
    """
    Validasi dan normalisasi struktur data dari LLM.

    Args:
        data (dict): Raw parsed data.

    Returns:
        dict: Normalized data dengan keys yang benar.
    """
    # Pastikan semua key ada dan bertipe benar
    summary = data.get("summary", "Ringkasan tidak tersedia.")
    if not isinstance(summary, str):
        summary = str(summary)

    important_points = data.get("important_points", [])
    if not isinstance(important_points, list):
        important_points = [str(important_points)]
    important_points = [str(p) for p in important_points if p]

    tasks = data.get("tasks", [])
    if not isinstance(tasks, list):
        tasks = [str(tasks)]
    tasks = [str(t) for t in tasks if t]

    # Pastikan minimal ada 1 item
    if not important_points:
        important_points = ["Tidak ada poin penting yang teridentifikasi."]
    if not tasks:
        tasks = ["Tidak ada tugas yang teridentifikasi."]

    return {
        "summary": summary,
        "important_points": important_points,
        "tasks": tasks,
    }
