/**
 * script.js
 * VoiceIQ — NLP Audio Analyzer Frontend
 * Fitur: Upload audio, rekam audio, proses ke backend, tampilkan hasil
 */

// ─── Konfigurasi ─────────────────────────────────────────────────────────────
const API_BASE_URL = "http://localhost:8000";
const API_ENDPOINT = `${API_BASE_URL}/process-audio/`;

// ─── State ────────────────────────────────────────────────────────────────────
let selectedFile = null;          // File yang dipilih via upload
let mediaRecorder = null;         // MediaRecorder instance
let recordedChunks = [];          // Chunks audio yang direkam
let recordedBlob = null;          // Blob hasil rekaman
let isRecording = false;          // Status rekaman
let recordingTimer = null;        // Timer untuk durasi rekaman
let recordingSeconds = 0;         // Detik rekaman
let activeTab = "upload";         // Tab aktif: "upload" atau "record"

// ─── DOM Elements ─────────────────────────────────────────────────────────────
const btnProcess       = document.getElementById("btn-process");
const dropzone         = document.getElementById("dropzone");
const fileInput        = document.getElementById("file-input");
const filePreview      = document.getElementById("file-preview");
const fileName         = document.getElementById("file-name");
const fileSize         = document.getElementById("file-size");
const uploadSection    = document.getElementById("upload-section");
const loadingSection   = document.getElementById("loading-section");
const resultsSection   = document.getElementById("results-section");
const errorToast       = document.getElementById("error-toast");
const errorMessage     = document.getElementById("error-message");

// ─────────────────────────────────────────────────────────────────────────────
// TAB MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Beralih antara tab Upload dan Rekam.
 * @param {string} tab - "upload" atau "record"
 */
function switchTab(tab) {
  activeTab = tab;

  // Update tab button state
  document.getElementById("tab-upload").classList.toggle("tab-btn--active", tab === "upload");
  document.getElementById("tab-record").classList.toggle("tab-btn--active", tab === "record");
  document.getElementById("tab-upload").setAttribute("aria-selected", tab === "upload");
  document.getElementById("tab-record").setAttribute("aria-selected", tab === "record");

  // Update panel visibility
  document.getElementById("panel-upload").classList.toggle("tab-panel--active", tab === "upload");
  document.getElementById("panel-record").classList.toggle("tab-panel--active", tab === "record");

  // Reset state saat pindah tab
  if (tab === "upload") {
    clearRecording();
  } else {
    removeFile();
  }

  updateProcessButton();
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE UPLOAD HANDLING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle pemilihan file dari input[type=file].
 * @param {Event} event
 */
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) setSelectedFile(file);
}

/**
 * Handle drag over pada dropzone.
 * @param {DragEvent} event
 */
function handleDragOver(event) {
  event.preventDefault();
  dropzone.classList.add("dropzone--dragover");
}

/**
 * Handle drag leave pada dropzone.
 */
function handleDragLeave() {
  dropzone.classList.remove("dropzone--dragover");
}

/**
 * Handle drop file ke dropzone.
 * @param {DragEvent} event
 */
function handleDrop(event) {
  event.preventDefault();
  dropzone.classList.remove("dropzone--dragover");

  const file = event.dataTransfer.files[0];
  if (file) {
    // Validasi tipe file
    if (!file.type.startsWith("audio/") && !file.type.startsWith("video/webm")) {
      showError("File harus berupa file audio (MP3, WAV, OGG, WebM, M4A, FLAC).");
      return;
    }
    setSelectedFile(file);
  }
}

/**
 * Set file yang dipilih dan tampilkan preview.
 * @param {File} file
 */
function setSelectedFile(file) {
  selectedFile = file;

  // Tampilkan preview
  fileName.textContent = file.name;
  fileSize.textContent = formatFileSize(file.size);
  filePreview.style.display = "flex";
  dropzone.style.display = "none";

  updateProcessButton();
}

/**
 * Hapus file yang dipilih.
 */
function removeFile() {
  selectedFile = null;
  fileInput.value = "";
  filePreview.style.display = "none";
  dropzone.style.display = "block";
  updateProcessButton();
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO RECORDING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Toggle mulai/berhenti rekam audio.
 */
async function toggleRecord() {
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

/**
 * Mulai merekam audio dari mikrofon.
 */
async function startRecording() {
  // Minta izin mikrofon
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    setupMediaRecorder(stream);
  } catch (error) {
    if (error.name === "NotAllowedError") {
      showError("Izin mikrofon ditolak. Izinkan akses mikrofon di browser untuk merekam audio.");
    } else if (error.name === "NotFoundError") {
      showError("Mikrofon tidak ditemukan. Pastikan perangkat audio terhubung.");
    } else {
      showError(`Gagal mengakses mikrofon: ${error.message}`);
    }
    return;
  }
}

/**
 * Setup MediaRecorder dengan stream audio.
 * @param {MediaStream} stream
 */
function setupMediaRecorder(stream) {
  // Tentukan format yang didukung browser
  const mimeType = getSupportedMimeType();
  const options = mimeType ? { mimeType } : {};

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, options);

  // Kumpulkan chunks audio
  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  // Selesai merekam
  mediaRecorder.onstop = () => {
    const mimeUsed = mediaRecorder.mimeType || "audio/webm";
    recordedBlob = new Blob(recordedChunks, { type: mimeUsed });
    displayRecordedAudio(recordedBlob);

    // Hentikan semua track
    stream.getTracks().forEach(track => track.stop());
  };

  // Mulai rekam
  mediaRecorder.start(100); // Collect data setiap 100ms
  isRecording = true;

  // Update UI
  updateRecordingUI(true);
  startRecordingTimer();
}

/**
 * Hentikan perekaman audio.
 */
function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    stopRecordingTimer();
    updateRecordingUI(false);
  }
}

/**
 * Update tampilan UI saat rekaman mulai/berhenti.
 * @param {boolean} recording
 */
function updateRecordingUI(recording) {
  const btnRecord        = document.getElementById("btn-record");
  const recorderStatus   = document.getElementById("recorder-status");
  const recorderTimer    = document.getElementById("recorder-timer");
  const visualizer       = document.getElementById("visualizer");
  const visualizerBars   = document.getElementById("visualizer-bars");
  const recorderIdleIcon = document.getElementById("recorder-idle-icon");

  if (recording) {
    btnRecord.classList.add("recording");
    btnRecord.innerHTML = `
      <span class="btn__icon">
        <svg viewBox="0 0 20 20" fill="none"><rect x="5" y="5" width="10" height="10" rx="2" fill="currentColor"/></svg>
      </span>
      Hentikan Rekaman
    `;
    recorderStatus.textContent = "Sedang merekam...";
    recorderTimer.style.display = "block";
    visualizer.classList.add("recording");
    visualizerBars.classList.add("active");
    recorderIdleIcon.style.display = "none";
  } else {
    btnRecord.classList.remove("recording");
    btnRecord.innerHTML = `
      <span class="btn__icon">
        <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="6" fill="currentColor"/></svg>
      </span>
      Mulai Rekam
    `;
    recorderStatus.textContent = "Rekaman selesai";
    visualizer.classList.remove("recording");
    visualizerBars.classList.remove("active");
    recorderIdleIcon.style.display = "flex";
  }
}

/**
 * Tampilkan audio hasil rekaman.
 * @param {Blob} blob
 */
function displayRecordedAudio(blob) {
  const audioURL = URL.createObjectURL(blob);
  const audioEl = document.getElementById("recorded-audio");
  audioEl.src = audioURL;

  document.getElementById("recorder-status").textContent =
    `Rekaman siap (${formatFileSize(blob.size)})`;
  document.getElementById("recorded-preview").style.display = "flex";

  updateProcessButton();
}

/**
 * Hapus rekaman audio.
 */
function clearRecording() {
  if (isRecording) stopRecording();

  recordedBlob = null;
  recordedChunks = [];

  const audioEl = document.getElementById("recorded-audio");
  if (audioEl.src) {
    URL.revokeObjectURL(audioEl.src);
    audioEl.src = "";
  }

  document.getElementById("recorded-preview").style.display = "none";
  document.getElementById("recorder-status").textContent = "Siap merekam";
  document.getElementById("recorder-timer").style.display = "none";
  document.getElementById("recorder-timer").textContent = "00:00";

  updateProcessButton();
}

// ─────────────────────────────────────────────────────────────────────────────
// RECORDING TIMER
// ─────────────────────────────────────────────────────────────────────────────

function startRecordingTimer() {
  recordingSeconds = 0;
  updateTimerDisplay();
  recordingTimer = setInterval(() => {
    recordingSeconds++;
    updateTimerDisplay();

    // Batas maksimum 5 menit
    if (recordingSeconds >= 300) {
      stopRecording();
    }
  }, 1000);
}

function stopRecordingTimer() {
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }
}

function updateTimerDisplay() {
  const min = String(Math.floor(recordingSeconds / 60)).padStart(2, "0");
  const sec = String(recordingSeconds % 60).padStart(2, "0");
  document.getElementById("recorder-timer").textContent = `${min}:${sec}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PROCESS FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kirim audio ke backend untuk diproses.
 * Alur: Audio → FormData → POST /process-audio/ → Tampilkan hasil
 */
async function processAudio() {
  // Tentukan sumber audio
  let audioSource = null;
  let audioName = "";

  if (activeTab === "upload" && selectedFile) {
    audioSource = selectedFile;
    audioName = selectedFile.name;
  } else if (activeTab === "record" && recordedBlob) {
    audioSource = recordedBlob;
    audioName = `rekaman_${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
  }

  if (!audioSource) {
    showError("Pilih atau rekam audio terlebih dahulu.");
    return;
  }

  // Sembunyikan error lama
  hideError();

  // Tampilkan loading, sembunyikan form
  uploadSection.style.display = "none";
  resultsSection.style.display = "none";
  loadingSection.style.display = "block";
  setLoadingStep(1);

  // Siapkan FormData
  const formData = new FormData();
  formData.append("file", audioSource, audioName);

  try {
    // Step 2: Kirim ke backend
    setTimeout(() => setLoadingStep(2), 1500);
    setTimeout(() => setLoadingStep(3), 4000);

    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      body: formData,
      // Tidak set Content-Type — biarkan browser set boundary multipart otomatis
    });

    // Parse response
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("Server mengembalikan response yang tidak valid.");
    }

    // Tangani error HTTP
    if (!response.ok) {
      const errMsg = data?.detail || `HTTP Error ${response.status}`;
      throw new Error(errMsg);
    }

    // ── Tampilkan Hasil ──
    loadingSection.style.display = "none";
    displayResults(data);

  } catch (error) {
    // ── Tampilkan Error ──
    loadingSection.style.display = "none";
    uploadSection.style.display = "block";

    let userMessage = error.message;

    // Pesan error yang lebih ramah pengguna
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      userMessage = "Tidak dapat terhubung ke backend. Pastikan server berjalan di http://localhost:8000";
    } else if (error.message.includes("NetworkError")) {
      userMessage = "Koneksi ke server gagal. Periksa apakah backend sudah berjalan.";
    }

    showError(userMessage);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPLAY RESULTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tampilkan hasil analisis dari API.
 * @param {Object} data - { transcript, summary, important_points, tasks }
 */
function displayResults(data) {
  // Transkripsi
  const transcriptEl = document.getElementById("transcript-content");
  transcriptEl.textContent = data.transcript || "Tidak ada transkripsi.";

  // Ringkasan
  const summaryEl = document.getElementById("summary-content");
  summaryEl.textContent = data.summary || "Tidak ada ringkasan.";

  // Poin Penting
  const pointsEl = document.getElementById("points-content");
  const points = Array.isArray(data.important_points) ? data.important_points : [];
  pointsEl.innerHTML = "";
  points.forEach(point => {
    const li = document.createElement("li");
    li.textContent = point;
    pointsEl.appendChild(li);
  });
  document.getElementById("points-count").textContent = points.length;

  // Daftar Tugas
  const tasksEl = document.getElementById("tasks-content");
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  tasksEl.innerHTML = "";
  tasks.forEach(task => {
    const li = document.createElement("li");
    li.textContent = task;
    tasksEl.appendChild(li);
  });
  document.getElementById("tasks-count").textContent = tasks.length;

  // Tampilkan section hasil
  resultsSection.style.display = "block";

  // Scroll ke hasil
  setTimeout(() => {
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update state tombol Analisis Audio.
 */
function updateProcessButton() {
  const hasUpload = activeTab === "upload" && selectedFile !== null;
  const hasRecord = activeTab === "record" && recordedBlob !== null;
  btnProcess.disabled = !(hasUpload || hasRecord);
}

/**
 * Set step loading yang aktif (1, 2, atau 3).
 * @param {number} step
 */
function setLoadingStep(step) {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`step-${i}`);
    if (!el) continue;
    el.classList.remove("loading-step--active", "loading-step--done");
    if (i < step) el.classList.add("loading-step--done");
    else if (i === step) el.classList.add("loading-step--active");
  }
}

/**
 * Tampilkan pesan error.
 * @param {string} message
 */
function showError(message) {
  errorMessage.textContent = message;
  errorToast.style.display = "flex";
  errorToast.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/**
 * Sembunyikan pesan error.
 */
function hideError() {
  errorToast.style.display = "none";
}

/**
 * Reset semua state dan kembali ke form awal.
 */
function resetAll() {
  resultsSection.style.display = "none";
  uploadSection.style.display = "block";
  loadingSection.style.display = "none";
  hideError();
  removeFile();
  clearRecording();
  switchTab("upload");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Salin teks dari elemen ke clipboard.
 * @param {string} elementId - ID elemen yang teksnya akan disalin
 */
async function copyText(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const text = el.tagName === "UL"
    ? Array.from(el.querySelectorAll("li")).map(li => `• ${li.textContent}`).join("\n")
    : el.textContent;

  try {
    await navigator.clipboard.writeText(text);

    // Visual feedback
    const btn = el.closest(".result-card").querySelector(".copy-btn");
    if (btn) {
      const originalHTML = btn.innerHTML;
      btn.innerHTML = `<svg viewBox="0 0 20 20" fill="none"><path d="M4 10l4 4 8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      btn.style.color = "var(--green)";
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.style.color = "";
      }, 2000);
    }
  } catch {
    showError("Gagal menyalin teks ke clipboard.");
  }
}

/**
 * Format ukuran file ke string yang readable.
 * @param {number} bytes
 * @returns {string}
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Dapatkan MIME type yang didukung browser untuk MediaRecorder.
 * @returns {string|null}
 */
function getSupportedMimeType() {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────

// Cek dukungan MediaRecorder API
if (!window.MediaRecorder) {
  const tabRecord = document.getElementById("tab-record");
  if (tabRecord) {
    tabRecord.disabled = true;
    tabRecord.title = "Browser Anda tidak mendukung perekaman audio";
    tabRecord.style.opacity = "0.4";
    tabRecord.style.cursor = "not-allowed";
  }
}

console.log("✅ VoiceIQ Frontend dimuat. Backend URL:", API_BASE_URL);
