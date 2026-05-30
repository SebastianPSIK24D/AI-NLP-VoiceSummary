"""
main.py
Backend utama FastAPI untuk aplikasi NLP Audio Analyzer.
Endpoint: POST /process-audio/
"""

import os
import uuid
import logging
import shutil
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from services.whisper_service import transcribe_audio
from services.llama_service import analyze_transcript

# ─── Konfigurasi Logging ───────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ─── Load Environment Variables ───────────────────────────────────────────────
load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# ─── Konfigurasi Direktori Upload ─────────────────────────────────────────────
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Format file audio yang diizinkan
ALLOWED_AUDIO_TYPES = {
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/wave",
    "audio/x-wav", "audio/ogg", "audio/webm", "audio/mp4",
    "audio/m4a", "audio/flac", "video/webm",  # webm dari browser recorder
}

# Ukuran file maksimum: 25MB (batas Groq API)
MAX_FILE_SIZE = 25 * 1024 * 1024


# ─── Lifespan Event ───────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle events untuk startup dan shutdown."""
    logger.info("=" * 50)
    logger.info("🚀 NLP Audio Analyzer Backend dimulai")
    logger.info(f"📁 Upload directory: {UPLOAD_DIR.absolute()}")
    logger.info(f"🔑 Groq API Key: {'✓ Tersedia' if GROQ_API_KEY else '✗ TIDAK ADA — set GROQ_API_KEY di .env'}")
    logger.info("=" * 50)
    yield
    logger.info("Backend berhenti.")


# ─── Inisialisasi FastAPI ──────────────────────────────────────────────────────
app = FastAPI(
    title="NLP Audio Analyzer API",
    description="API untuk transkripsi audio dan analisis NLP menggunakan Groq (Whisper + LLaMA)",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── CORS Middleware ───────────────────────────────────────────────────────────
# Izinkan akses dari semua origin (untuk development)
# Untuk production, ganti "*" dengan domain spesifik
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health Check Endpoint ────────────────────────────────────────────────────
@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "ok",
        "message": "NLP Audio Analyzer API berjalan",
        "api_key_configured": bool(GROQ_API_KEY),
    }


# ─── Main Endpoint: Process Audio ─────────────────────────────────────────────
@app.post("/process-audio/")
async def process_audio(file: UploadFile = File(...)):
    """
    Endpoint utama untuk memproses file audio.

    Alur:
    1. Validasi file audio yang diupload
    2. Simpan file sementara ke direktori uploads/
    3. Kirim ke Groq Whisper API → dapatkan transkripsi
    4. Kirim transkripsi ke Groq LLaMA API → dapatkan analisis
    5. Kembalikan hasil lengkap sebagai JSON

    Returns:
        JSONResponse dengan struktur:
        {
            "transcript": str,
            "summary": str,
            "important_points": list[str],
            "tasks": list[str]
        }
    """

    # ── 1. Validasi API Key ─────────────────────────────────────────────────
    if not GROQ_API_KEY:
        logger.error("GROQ_API_KEY tidak dikonfigurasi!")
        raise HTTPException(
            status_code=500,
            detail="Server error: GROQ_API_KEY belum dikonfigurasi. Tambahkan ke file .env",
        )

    # ── 2. Validasi File ────────────────────────────────────────────────────
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="Tidak ada file yang diupload.")

    # Cek content type
    content_type = file.content_type or ""
    if content_type not in ALLOWED_AUDIO_TYPES:
        # Coba deteksi dari ekstensi file jika content_type tidak dikenali
        ext = Path(file.filename).suffix.lower()
        allowed_exts = {".mp3", ".wav", ".ogg", ".webm", ".mp4", ".m4a", ".flac"}
        if ext not in allowed_exts:
            raise HTTPException(
                status_code=400,
                detail=f"Format file tidak didukung: {content_type}. "
                       f"Gunakan: MP3, WAV, OGG, WebM, MP4, M4A, atau FLAC.",
            )

    logger.info(f"[Request] File diterima: '{file.filename}' (type: {content_type})")

    # ── 3. Simpan File Sementara ────────────────────────────────────────────
    # Buat nama file unik untuk menghindari konflik
    ext = Path(file.filename).suffix or ".webm"
    unique_filename = f"{uuid.uuid4().hex}{ext}"
    temp_path = UPLOAD_DIR / unique_filename

    try:
        # Baca dan simpan file ke disk
        with open(temp_path, "wb") as buffer:
            content = await file.read()

            # Validasi ukuran file
            if len(content) == 0:
                raise HTTPException(status_code=400, detail="File audio kosong (0 bytes).")
            if len(content) > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"File terlalu besar ({len(content) / 1024 / 1024:.1f} MB). "
                           f"Maksimum 25 MB.",
                )

            buffer.write(content)

        logger.info(f"[Storage] File disimpan sementara: {temp_path} ({len(content) / 1024:.1f} KB)")

        # ── 4. Speech-to-Text dengan Whisper ───────────────────────────────
        logger.info("[Pipeline] Langkah 1/2: Mengirim ke Whisper API...")
        try:
            transcript = transcribe_audio(str(temp_path), GROQ_API_KEY)
        except ValueError as e:
            logger.error(f"[Whisper] Error: {e}")
            raise HTTPException(status_code=422, detail=f"Transkripsi gagal: {str(e)}")

        logger.info(f"[Pipeline] ✓ Transkripsi berhasil ({len(transcript)} karakter)")

        # ── 5. Analisis NLP dengan LLaMA ───────────────────────────────────
        logger.info("[Pipeline] Langkah 2/2: Mengirim ke LLaMA API...")
        try:
            analysis = analyze_transcript(transcript, GROQ_API_KEY)
        except ValueError as e:
            logger.error(f"[LLaMA] Error: {e}")
            raise HTTPException(status_code=422, detail=f"Analisis NLP gagal: {str(e)}")

        logger.info("[Pipeline] ✓ Analisis NLP berhasil")
        logger.info("=" * 40)
        logger.info("✅ Proses selesai — mengembalikan hasil ke frontend")
        logger.info("=" * 40)

        # ── 6. Kembalikan Hasil ─────────────────────────────────────────────
        return JSONResponse(
            status_code=200,
            content={
                "transcript": transcript,
                "summary": analysis["summary"],
                "important_points": analysis["important_points"],
                "tasks": analysis["tasks"],
            },
        )

    except HTTPException:
        # Re-raise HTTPException tanpa modifikasi
        raise

    except Exception as e:
        # Tangani error tak terduga
        logger.exception(f"[Error] Error tidak terduga: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Terjadi error tak terduga: {str(e)}",
        )

    finally:
        # ── 7. Bersihkan File Sementara ─────────────────────────────────────
        if temp_path.exists():
            os.remove(temp_path)
            logger.info(f"[Storage] File sementara dihapus: {temp_path}")
