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
const stockControls = document.getElementById("stock-controls");
document.querySelectorAll('input[name="source"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    const source = document.querySelector('input[name="source"]:checked').value;
    uploadControls.classList.toggle("hidden", source !== "upload");
    cameraControls.classList.toggle("hidden", source !== "camera");
    gifControls.classList.toggle("hidden", source !== "gif");
    stockControls.classList.toggle("hidden", source !== "stock");
    if (source !== "camera") stopCamera();
    refreshPreview();
  });
});

const previewCanvasHide = document.getElementById("preview-canvas-hide");
const capacityInfoEl = document.getElementById("capacity-info");
const messageEl = document.getElementById("message");

let uploadedImage = null; // Canvas mit hochgeladenem/skaliertem Bild
let capturedPhotoCanvas = null; // Canvas mit aufgenommenem Kamerafoto
let selectedGifCanvas = null; // Canvas mit ausgewähltem GIF-Frame
let selectedStockCanvas = null; // Canvas mit ausgewähltem Foto (Pixabay)
let cameraStream = null;

// Bilder werden auf diese maximale Kantenlänge herunterskaliert – hält die
// PNG-Dateigröße klein genug für den Versand (Firestore-Limit) und reicht
// für die Bildkapazität locker aus.
const MAX_CARRIER_DIMENSION = 400;

function drawImageToCanvas(canvas, img) {
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
}

/** Skaliert ein Canvas herunter, falls es maxDim in Breite/Höhe überschreitet. */
function resizeCanvasToMax(canvas, maxDim) {
  if (canvas.width <= maxDim && canvas.height <= maxDim) return canvas;
  const scale = maxDim / Math.max(canvas.width, canvas.height);
  const resized = document.createElement("canvas");
  resized.width = Math.max(1, Math.round(canvas.width * scale));
  resized.height = Math.max(1, Math.round(canvas.height * scale));
  resized.getContext("2d").drawImage(canvas, 0, 0, resized.width, resized.height);
  return resized;
}

document.getElementById("image-upload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = await loadImageFromFile(file);
  const fullCanvas = document.createElement("canvas");
  drawImageToCanvas(fullCanvas, img);
  uploadedImage = resizeCanvasToMax(fullCanvas, MAX_CARRIER_DIMENSION);
  previewCanvasHide.width = uploadedImage.width;
  previewCanvasHide.height = uploadedImage.height;
  previewCanvasHide.getContext("2d").drawImage(uploadedImage, 0, 0);
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
  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = cameraVideo.videoWidth;
  fullCanvas.height = cameraVideo.videoHeight;
  fullCanvas.getContext("2d").drawImage(cameraVideo, 0, 0);
  capturedPhotoCanvas = resizeCanvasToMax(fullCanvas, MAX_CARRIER_DIMENSION);

  previewCanvasHide.width = capturedPhotoCanvas.width;
  previewCanvasHide.height = capturedPhotoCanvas.height;
  previewCanvasHide.getContext("2d").drawImage(capturedPhotoCanvas, 0, 0);

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

  const sourceCanvases = {
    upload: uploadedImage,
    camera: capturedPhotoCanvas,
    gif: selectedGifCanvas,
    stock: selectedStockCanvas,
  };
  if (!sourceCanvases[source]) {
    const messages = {
      upload: "Bitte ein Bild hochladen.",
      camera: "Bitte zuerst ein Foto aufnehmen.",
      gif: "Bitte zuerst ein GIF auswählen.",
      stock: "Bitte zuerst ein Foto auswählen.",
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
const hideSuccessMsgEl = document.getElementById("hide-success-msg");
const btnHideEl = document.getElementById("btn-hide");

document.getElementById("btn-hide").addEventListener("click", async () => {
  hideErrorEl.classList.add("hidden");
  hideResultEl.classList.add("hidden");

  const message = messageEl.value;
  const password = document.getElementById("password-hide").value;
  const source = document.querySelector('input[name="source"]:checked').value;
  const recipient = document.getElementById("send-to-username").value;

  if (!currentUser) return showHideError("Bitte zuerst anmelden, um eine Nachricht zu senden.");
  if (!message.trim()) return showHideError("Bitte eine Nachricht eingeben.");
  if (!password) return showHideError("Bitte ein Passwort eingeben.");
  if (!recipient.trim()) return showHideError("Bitte einen Empfänger-Nutzernamen eingeben.");

  btnHideEl.disabled = true;
  let workCanvas;
  try {
    const sourceMessages = {
      upload: "Bitte zuerst ein Bild hochladen.",
      camera: "Bitte zuerst ein Foto aufnehmen.",
      gif: "Bitte zuerst ein GIF auswählen.",
      stock: "Bitte zuerst ein Foto auswählen.",
    };
    const sourceCanvas = { upload: uploadedImage, camera: capturedPhotoCanvas, gif: selectedGifCanvas, stock: selectedStockCanvas }[
      source
    ];
    if (!sourceCanvas) return showHideError(sourceMessages[source]);

    workCanvas = document.createElement("canvas");
    workCanvas.width = sourceCanvas.width;
    workCanvas.height = sourceCanvas.height;
    workCanvas.getContext("2d").drawImage(sourceCanvas, 0, 0);

    const ctx = workCanvas.getContext("2d");
    const imageData = ctx.getImageData(0, 0, workCanvas.width, workCanvas.height);

    const payload = await encryptMessage(password, message);
    embedPayload(imageData, payload);
    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise((resolve) => workCanvas.toBlob(resolve, "image/png"));
    const url = URL.createObjectURL(blob);

    const sendResult = await sendImageTo(blob, recipient);
    if (!sendResult.ok) {
      return showHideError(sendResult.msg);
    }

    document.getElementById("result-image").src = url;
    hideSuccessMsgEl.textContent = sendResult.msg;
    hideResultEl.classList.remove("hidden");
    document.getElementById("send-to-username").value = "";
  } catch (err) {
    showHideError(err.message || String(err));
  } finally {
    btnHideEl.disabled = false;
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

refreshPreview();
