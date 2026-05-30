# VoiceIQ — NLP Audio Analyzer

Aplikasi web NLP yang mengubah audio menjadi transkripsi, ringkasan, poin penting, dan daftar tugas secara otomatis menggunakan **Groq API** (Whisper + LLaMA 3).

---

## Arsitektur Sistem

```
User (Browser)
    │
    │  Upload/Rekam Audio
    ▼
Frontend (HTML/CSS/JS)
    │
    │  POST /process-audio/ (multipart/form-data)
    ▼
FastAPI Backend (Python)
    ├──▶ Groq Whisper API  ──▶ Transkripsi Teks
    └──▶ Groq LLaMA 3 API ──▶ Ringkasan + Poin Penting + Tugas
    │
    │  JSON Response
    ▼
Frontend menampilkan hasil
```

---

## Struktur Folder

```
project-nlp/
├── backend/
│   ├── main.py                    # FastAPI app utama
│   ├── services/
│   │   ├── __init__.py
│   │   ├── whisper_service.py     # Speech-to-Text via Groq
│   │   └── llama_service.py      # NLP Analysis via Groq
│   ├── uploads/                   # Folder upload sementara (auto-created)
│   ├── requirements.txt
│   └── .env.example               # Template environment variables
│
└── frontend/
    ├── index.html                 # UI utama
    ├── style.css                  # Styling
    └── script.js                  # Logic frontend
```

---

## Prerequisites

- **Python 3.9+**
- **Groq API Key** — daftar gratis di [console.groq.com](https://console.groq.com)
- Browser modern (Chrome/Firefox/Edge terbaru)

---

## Cara Install & Menjalankan

### Langkah 1: Dapatkan Groq API Key

1. Kunjungi [https://console.groq.com/keys](https://console.groq.com/keys)
2. Buat akun atau login
3. Buat API key baru
4. Salin API key tersebut

---

### Langkah 2: Setup Backend

```bash
# Masuk ke folder backend
cd project-nlp/backend

# (Opsional tapi direkomendasikan) Buat virtual environment
python -m venv venv

# Aktifkan virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Buat file .env dari template
cp .env.example .env

# Edit .env dan masukkan Groq API key Anda
# Buka file .env dan ganti "your_groq_api_key_here" dengan API key Anda
```

Isi file `.env`:
```env
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

### Langkah 3: Jalankan Backend

```bash
# Dari dalam folder backend/
uvicorn main:app --reload --port 8000
```

Backend akan berjalan di: **http://localhost:8000**

Verifikasi dengan membuka: http://localhost:8000 (seharusnya menampilkan JSON status)

---

### Langkah 4: Buka Frontend

Tidak perlu web server khusus! Cukup buka langsung di browser:

**Opsi A — Buka langsung:**
```
Klik dua kali file: project-nlp/frontend/index.html
```

**Opsi B — Gunakan Python server (direkomendasikan untuk rekam audio):**
```bash
cd project-nlp/frontend
python -m http.server 3000
```
Kemudian buka: **http://localhost:3000**

> ⚠️ **Catatan:** Fitur rekam audio dari browser membutuhkan HTTPS atau localhost. Jika membuka file langsung (file://), perekaman mungkin tidak berfungsi di beberapa browser. Gunakan opsi Python server untuk pengalaman terbaik.

---

## URL Akses

| Service  | URL                          |
|----------|------------------------------|
| Backend  | http://localhost:8000        |
| API Docs | http://localhost:8000/docs   |
| Frontend | http://localhost:3000 (atau file:// langsung) |

---

## Cara Penggunaan

1. Buka frontend di browser
2. **Pilih input audio:**
   - **Tab "Upload File"**: Drag & drop atau klik untuk pilih file audio (MP3, WAV, OGG, M4A, FLAC, WebM)
   - **Tab "Rekam Audio"**: Klik "Mulai Rekam", bicara, lalu klik "Hentikan Rekaman"
3. Klik tombol **"Analisis Audio"**
4. Tunggu proses (biasanya 10–30 detik tergantung panjang audio)
5. Lihat hasil:
   - **Transkripsi**: Teks lengkap dari audio
   - **Ringkasan**: Ringkasan singkat percakapan
   - **Poin Penting**: Daftar poin kunci
   - **Daftar Tugas**: Action items dari percakapan

---

## Format Audio yang Didukung

| Format | Ekstensi  | Keterangan              |
|--------|-----------|-------------------------|
| MP3    | .mp3      | Paling umum             |
| WAV    | .wav      | Kualitas tinggi         |
| OGG    | .ogg      | Open source             |
| M4A    | .m4a      | Format Apple            |
| FLAC   | .flac     | Lossless                |
| WebM   | .webm     | Default browser recorder|

**Ukuran maksimum:** 25 MB (batas Groq API)

---

## Troubleshooting

### "Tidak dapat terhubung ke backend"
- Pastikan backend sudah berjalan: `uvicorn main:app --reload`
- Cek apakah port 8000 tersedia
- Pastikan tidak ada firewall yang memblokir

### "GROQ_API_KEY belum dikonfigurasi"
- Buat file `.env` di folder `backend/`
- Isi dengan API key yang valid: `GROQ_API_KEY=gsk_...`

### "Izin mikrofon ditolak"
- Izinkan akses mikrofon di browser
- Gunakan HTTPS atau localhost (bukan file://)

### Transkripsi tidak akurat
- Pastikan audio jelas dan tidak terlalu berisik
- Untuk audio bahasa Indonesia, Whisper sudah mendukung secara native
- Coba audio dengan kualitas lebih tinggi

---

## Teknologi yang Digunakan

| Komponen        | Teknologi                    |
|-----------------|------------------------------|
| Frontend        | HTML5, CSS3, Vanilla JS      |
| Backend         | FastAPI (Python)             |
| Speech-to-Text  | Whisper Large v3 via Groq    |
| NLP/LLM         | LLaMA 3 8B via Groq          |
| Audio Recording | Web MediaRecorder API        |

---

## Catatan Pengembangan

- Backend secara otomatis menghapus file audio setelah diproses (tidak disimpan permanen)
- Folder `uploads/` hanya digunakan untuk penyimpanan sementara
- Semua kunci API disimpan di `.env` dan tidak boleh di-commit ke Git
- Tambahkan `.env` ke `.gitignore` jika menggunakan version control
