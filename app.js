/* UI-Logik: Tabs, Bildquellen, Vorschau, Verstecken/Extrahieren */

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab !== "hide") stopCamera();
  });
});

window.addEventListener("beforeunload", () => stopCamera());

const uploadControls = document.getElementById("upload-controls");
const cameraControls = document.getElementById("camera-controls");
const gifControls = document.getElementById("gif-controls");
document.querySelectorAll('input[name="source"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    const source = document.querySelector('input[name="source"]:checked').value;
    uploadControls.classList.toggle("hidden", source !== "upload");
    cameraControls.classList.toggle("hidden", source !== "camera");
    gifControls.classList.toggle("hidden", source !== "gif");
    if (source !== "camera") stopCamera();
    refreshPreview();
  });
});

const previewCanvasHide = document.getElementById("preview-canvas-hide");
const capacityInfoEl = document.getElementById("capacity-info");
const messageEl = document.getElementById("message");

let uploadedImage = null; // HTMLImageElement für den Hide-Tab
let capturedPhotoCanvas = null; // Canvas mit aufgenommenem Kamerafoto
let selectedGifCanvas = null; // Canvas mit ausgewähltem GIF-Frame
let cameraStream = null;

function drawImageToCanvas(canvas, img) {
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
}

document.getElementById("image-upload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = await loadImageFromFile(file);
  uploadedImage = img;
  drawImageToCanvas(previewCanvasHide, img);
  refreshPreview();
});

// --- Kamera ---

const cameraVideo = document.getElementById("camera-video");
const cameraErrorEl = document.getElementById("camera-error");
const btnCameraStart = document.getElementById("btn-camera-start");
const btnCameraCapture = document.getElementById("btn-camera-capture");
const btnCameraRetake = document.getElementById("btn-camera-retake");

async function startCamera() {
  cameraErrorEl.classList.add("hidden");
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    cameraVideo.srcObject = cameraStream;
    btnCameraStart.classList.add("hidden");
    btnCameraCapture.classList.remove("hidden");
    btnCameraRetake.classList.add("hidden");
    cameraVideo.classList.remove("hidden");
  } catch (err) {
    cameraErrorEl.textContent = "⚠️ Kamerazugriff nicht möglich: " + (err.message || err);
    cameraErrorEl.classList.remove("hidden");
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  cameraVideo.srcObject = null;
  btnCameraStart.classList.remove("hidden");
  btnCameraCapture.classList.add("hidden");
  btnCameraRetake.classList.add("hidden");
}

function capturePhoto() {
  const canvas = document.createElement("canvas");
  canvas.width = cameraVideo.videoWidth;
  canvas.height = cameraVideo.videoHeight;
  canvas.getContext("2d").drawImage(cameraVideo, 0, 0);
  capturedPhotoCanvas = canvas;

  previewCanvasHide.width = canvas.width;
  previewCanvasHide.height = canvas.height;
  previewCanvasHide.getContext("2d").drawImage(canvas, 0, 0);

  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  cameraVideo.classList.add("hidden");
  btnCameraCapture.classList.add("hidden");
  btnCameraRetake.classList.remove("hidden");
  refreshPreview();
}

btnCameraStart.addEventListener("click", startCamera);
btnCameraCapture.addEventListener("click", capturePhoto);
btnCameraRetake.addEventListener("click", () => {
  capturedPhotoCanvas = null;
  cameraVideo.classList.remove("hidden");
  btnCameraRetake.classList.add("hidden");
  startCamera();
});

messageEl.addEventListener("input", refreshPreview);

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** Schätzt die benötigte Payload-Größe grob (AES-GCM Overhead: salt16+iv12+tag16 = 44 Byte) */
function estimatePayloadBytes(message) {
  const msgBytes = new TextEncoder().encode(message).length;
  return msgBytes + 16 + 12 + 16;
}

function requiredPixelsForMessage(message) {
  const payloadBytes = estimatePayloadBytes(message || "");
  const requiredBits = 32 + payloadBytes * 8;
  return Math.ceil(requiredBits / 3);
}

/** Aktualisiert die Vorschau/Kapazitätsanzeige für die aktuell gewählte Bildquelle. */
function refreshPreview() {
  const source = document.querySelector('input[name="source"]:checked').value;
  const message = messageEl.value;
  const requiredPixels = requiredPixelsForMessage(message);

  const hasImage =
    source === "upload" ? !!uploadedImage : source === "camera" ? !!capturedPhotoCanvas : !!selectedGifCanvas;
  if (!hasImage) {
    const messages = {
      upload: "Bitte ein Bild hochladen.",
      camera: "Bitte zuerst ein Foto aufnehmen.",
      gif: "Bitte zuerst ein GIF auswählen.",
    };
    capacityInfoEl.textContent = messages[source];
    capacityInfoEl.className = "capacity-info";
    return;
  }
  const capacityPixels = previewCanvasHide.width * previewCanvasHide.height;
  if (message.length === 0) {
    capacityInfoEl.textContent = `Bildkapazität: ${capacityPixels.toLocaleString("de-DE")} Pixel.`;
    capacityInfoEl.className = "capacity-info";
  } else if (requiredPixels <= capacityPixels) {
    capacityInfoEl.textContent = `Passt: benötigt ~${requiredPixels.toLocaleString("de-DE")} von ${capacityPixels.toLocaleString("de-DE")} Pixeln.`;
    capacityInfoEl.className = "capacity-info ok";
  } else {
    capacityInfoEl.textContent = `Zu groß: benötigt ~${requiredPixels.toLocaleString("de-DE")} Pixel, Bild hat nur ${capacityPixels.toLocaleString("de-DE")}.`;
    capacityInfoEl.className = "capacity-info bad";
  }
}

const hideErrorEl = document.getElementById("hide-error");
const hideResultEl = document.getElementById("hide-result");
let currentResultBlob = null; // vom "An CryptoChat-Nutzer senden"-Flow in inbox.js verwendet

document.getElementById("btn-hide").addEventListener("click", async () => {
  hideErrorEl.classList.add("hidden");
  hideResultEl.classList.add("hidden");

  const message = messageEl.value;
  const password = document.getElementById("password-hide").value;
  const source = document.querySelector('input[name="source"]:checked').value;

  if (!message.trim()) return showHideError("Bitte eine Nachricht eingeben.");
  if (!password) return showHideError("Bitte ein Passwort eingeben.");

  let workCanvas;
  try {
    if (source === "upload") {
      if (!uploadedImage) return showHideError("Bitte zuerst ein Bild hochladen.");
      workCanvas = document.createElement("canvas");
      drawImageToCanvas(workCanvas, uploadedImage);
    } else if (source === "camera") {
      if (!capturedPhotoCanvas) return showHideError("Bitte zuerst ein Foto aufnehmen.");
      workCanvas = document.createElement("canvas");
      workCanvas.width = capturedPhotoCanvas.width;
      workCanvas.height = capturedPhotoCanvas.height;
      workCanvas.getContext("2d").drawImage(capturedPhotoCanvas, 0, 0);
    } else if (source === "gif") {
      if (!selectedGifCanvas) return showHideError("Bitte zuerst ein GIF auswählen.");
      workCanvas = document.createElement("canvas");
      workCanvas.width = selectedGifCanvas.width;
      workCanvas.height = selectedGifCanvas.height;
      workCanvas.getContext("2d").drawImage(selectedGifCanvas, 0, 0);
    }

    const ctx = workCanvas.getContext("2d");
    const imageData = ctx.getImageData(0, 0, workCanvas.width, workCanvas.height);

    const payload = await encryptMessage(password, message);
    embedPayload(imageData, payload);
    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise((resolve) => workCanvas.toBlob(resolve, "image/png"));
    const url = URL.createObjectURL(blob);

    currentResultBlob = blob;
    document.getElementById("result-image").src = url;
    hideResultEl.classList.remove("hidden");
  } catch (err) {
    showHideError(err.message || String(err));
  }
});

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function showHideError(msg) {
  hideErrorEl.textContent = "⚠️ " + msg;
  hideErrorEl.classList.remove("hidden");
}

// --- Reveal Tab ---

const previewCanvasReveal = document.getElementById("preview-canvas-reveal");
const revealErrorEl = document.getElementById("reveal-error");
const revealResultEl = document.getElementById("reveal-result");
let revealImage = null;

document.getElementById("image-reveal").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  revealImage = await loadImageFromFile(file);
  drawImageToCanvas(previewCanvasReveal, revealImage);
});

document.getElementById("btn-reveal").addEventListener("click", async () => {
  revealErrorEl.classList.add("hidden");
  revealResultEl.classList.add("hidden");

  const password = document.getElementById("password-reveal").value;
  if (!revealImage) return showRevealError("Bitte zuerst ein Bild auswählen.");
  if (!password) return showRevealError("Bitte das Passwort eingeben.");

  try {
    const ctx = previewCanvasReveal.getContext("2d");
    const imageData = ctx.getImageData(0, 0, previewCanvasReveal.width, previewCanvasReveal.height);
    const payload = extractPayload(imageData);
    const message = await decryptPayload(password, payload);
    document.getElementById("revealed-message").textContent = message;
    revealResultEl.classList.remove("hidden");
  } catch (err) {
    showRevealError("Entschlüsselung fehlgeschlagen. Falsches Passwort oder kein verstecktes Bild.");
  }
});

function showRevealError(msg) {
  revealErrorEl.textContent = "⚠️ " + msg;
  revealErrorEl.classList.remove("hidden");
}

refreshPreview();
