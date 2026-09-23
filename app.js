/* UI-Logik: Tabs, Bildquellen, Vorschau, Verstecken/Extrahieren */

// Link zur App für Empfänger, die CryptoChat noch nicht haben. Auf den
// Play-Store-Eintrag umstellen, sobald der veröffentlicht ist.
const APP_LINK = "https://lamine-abdouraman.github.io/cryptochat/";

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
const generateControls = document.getElementById("generate-controls");
const cameraControls = document.getElementById("camera-controls");
document.querySelectorAll('input[name="source"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    const source = document.querySelector('input[name="source"]:checked').value;
    uploadControls.classList.toggle("hidden", source !== "upload");
    generateControls.classList.toggle("hidden", source !== "generate");
    cameraControls.classList.toggle("hidden", source !== "camera");
    if (source !== "camera") stopCamera();
    refreshPreview();
  });
});

const previewCanvasHide = document.getElementById("preview-canvas-hide");
const capacityInfoEl = document.getElementById("capacity-info");
const messageEl = document.getElementById("message");
const genStyleEl = document.getElementById("gen-style");
const genColor1El = document.getElementById("gen-color1");
const genColor2El = document.getElementById("gen-color2");

let uploadedImage = null; // HTMLImageElement für den Hide-Tab
let capturedPhotoCanvas = null; // Canvas mit aufgenommenem Kamerafoto
let cameraStream = null;
let currentSeed = Math.floor(Math.random() * 1_000_000);

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

genStyleEl.addEventListener("change", refreshPreview);
genColor1El.addEventListener("input", refreshPreview);
genColor2El.addEventListener("input", refreshPreview);
document.getElementById("btn-reroll").addEventListener("click", () => {
  currentSeed = Math.floor(Math.random() * 1_000_000);
  refreshPreview();
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

/** Zeichnet bei Bildquelle "generieren" die aktuelle Vorschau neu und aktualisiert die Kapazitätsanzeige. */
function refreshPreview() {
  const source = document.querySelector('input[name="source"]:checked').value;
  const message = messageEl.value;
  const requiredPixels = requiredPixelsForMessage(message);

  if (source === "upload" || source === "camera") {
    const hasImage = source === "upload" ? !!uploadedImage : !!capturedPhotoCanvas;
    if (!hasImage) {
      capacityInfoEl.textContent =
        source === "upload" ? "Bitte ein Bild hochladen." : "Bitte zuerst ein Foto aufnehmen.";
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
    return;
  }

  const side = Math.max(64, Math.ceil(Math.sqrt(requiredPixels * 1.15)));
  const style = genStyleEl.value;
  const color1 = hexToRgb(genColor1El.value);
  const color2 = hexToRgb(genColor2El.value);
  const art = generateArtCanvas(side, side, style, currentSeed, color1, color2);

  previewCanvasHide.width = side;
  previewCanvasHide.height = side;
  previewCanvasHide.getContext("2d").drawImage(art, 0, 0);

  capacityInfoEl.textContent = `Generiertes Bild: ${side}x${side} Pixel – genug Platz für deine Nachricht.`;
  capacityInfoEl.className = "capacity-info ok";
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

function lerpColor(c1, c2, t) {
  return {
    r: c1.r + (c2.r - c1.r) * t,
    g: c1.g + (c2.g - c1.g) * t,
    b: c1.b + (c2.b - c1.b) * t,
  };
}

/** Deterministischer, seed-basierter Zufallsgenerator (mulberry32). */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateArtCanvas(width, height, style, seed, color1, color2) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;
  const rng = makeRng(seed);
  const seedF = (seed % 1000) / 100;

  // Für "stars": vorab Sternpositionen erzeugen
  let stars = [];
  if (style === "stars") {
    const starCount = Math.max(15, Math.floor((width * height) / 350));
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: rng() * width,
        y: rng() * height,
        r: rng() * 1.2 + 0.4,
        brightness: rng() * 0.6 + 0.4,
      });
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let color;

      if (style === "plasma") {
        const v =
          Math.sin(x * 0.04 + seedF) +
          Math.sin(y * 0.05 + seedF * 1.3) +
          Math.sin((x + y) * 0.03 + seedF * 0.7) +
          Math.sin(Math.sqrt(x * x + y * y) * 0.04);
        const t = Math.sin(v) * 0.5 + 0.5;
        color = lerpColor(color1, color2, t);
      } else if (style === "circles") {
        const cx = width / 2, cy = height / 2;
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        const t = Math.sin(dist * 0.15 + seedF) * 0.5 + 0.5;
        color = lerpColor(color1, color2, t);
      } else if (style === "waves") {
        const t = Math.sin(x * 0.08 + Math.sin(y * 0.05 + seedF) * 3 + seedF) * 0.5 + 0.5;
        color = lerpColor(color1, color2, t);
      } else if (style === "grid") {
        const cell = Math.max(8, Math.floor(width / 16));
        const cellX = Math.floor(x / cell), cellY = Math.floor(y / cell);
        const checker = (cellX + cellY) % 2;
        const gradT = x / width;
        const base = lerpColor(color1, color2, gradT);
        color = checker === 0 ? base : { r: base.r * 0.6, g: base.g * 0.6, b: base.b * 0.6 };
      } else if (style === "gradient") {
        const t = (x / width + y / height) / 2;
        color = lerpColor(color1, color2, t);
      } else if (style === "stars") {
        let brightness = 0;
        for (const s of stars) {
          const dx = x - s.x, dy = y - s.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const glowRadius = s.r * 2.5;
          const falloff = Math.max(0, 1 - dist / glowRadius);
          brightness = Math.max(brightness, falloff * falloff * s.brightness);
        }
        const bg = lerpColor(
          { r: color2.r * 0.15, g: color2.g * 0.15, b: color2.b * 0.15 },
          { r: color1.r * 0.15, g: color1.g * 0.15, b: color1.b * 0.15 },
          y / height
        );
        color = lerpColor(bg, { r: 255, g: 255, b: 255 }, brightness);
      } else {
        // noise: leicht eingefärbtes Rauschen zwischen color1 und color2
        const t = rng();
        const base = lerpColor(color1, color2, t);
        const jitter = (rng() - 0.5) * 60;
        color = { r: base.r + jitter, g: base.g + jitter, b: base.b + jitter };
      }

      data[idx] = clampByte(color.r);
      data[idx + 1] = clampByte(color.g);
      data[idx + 2] = clampByte(color.b);
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

const hideErrorEl = document.getElementById("hide-error");
const hideResultEl = document.getElementById("hide-result");

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
    } else {
      refreshPreview(); // sicherstellen, dass die Vorschau zur aktuellen Nachricht passt
      workCanvas = document.createElement("canvas");
      workCanvas.width = previewCanvasHide.width;
      workCanvas.height = previewCanvasHide.height;
      workCanvas.getContext("2d").drawImage(previewCanvasHide, 0, 0);
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
    const link = document.getElementById("download-link");
    link.href = url;
    shareStatusEl.classList.add("hidden");
    hideResultEl.classList.remove("hidden");

    const htmlBlob = await buildSelfDecryptingHtml(blob);
    document.getElementById("download-html-link").href = URL.createObjectURL(htmlBlob);
  } catch (err) {
    showHideError(err.message || String(err));
  }
});

// --- Selbstentschlüsselnde HTML-Datei ---
// Bettet das PNG als Data-URL direkt in eine HTML-Seite ein, zusammen mit der
// Entschlüsselungslogik. Da es sich um eine Textdatei (kein Bild-Anhang) handelt,
// wird sie von Messengern/sozialen Netzwerken nicht in JPEG umgewandelt.

let cryptoStegoSourceCache = null;

async function getCryptoStegoSource() {
  if (!cryptoStegoSourceCache) {
    cryptoStegoSourceCache = await fetch("crypto-stego.js").then((r) => r.text());
  }
  return cryptoStegoSourceCache;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function buildSelfDecryptingHtml(pngBlob) {
  const [cryptoStegoSrc, imageDataUrl] = await Promise.all([
    getCryptoStegoSource(),
    blobToDataURL(pngBlob),
  ]);

  return new Blob([SELF_DECRYPT_HTML_TEMPLATE(cryptoStegoSrc, imageDataUrl)], { type: "text/html" });
}

function SELF_DECRYPT_HTML_TEMPLATE(cryptoStegoSrc, imageDataUrl) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>CryptoChat – Verstecktes Bild</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background:#0f1220; color:#e9e9f4; display:flex; flex-direction:column; align-items:center; padding:32px 16px; margin:0; min-height:100vh; box-sizing:border-box; }
  h1 { font-size:1.4rem; margin:0 0 4px; }
  p.hint { color:#9a9cb8; font-size:0.85rem; margin:0 0 16px; text-align:center; max-width:420px; }
  img { max-width:320px; width:100%; border-radius:12px; border:1px solid #2a2f4a; margin-bottom:16px; }
  .card { display:flex; flex-direction:column; align-items:center; gap:10px; width:100%; max-width:420px; }
  input { font-size:0.95rem; padding:10px 12px; border-radius:10px; border:1px solid #2a2f4a; width:100%; box-sizing:border-box; background:#10142450; color:#e9e9f4; }
  button { font-size:0.95rem; padding:10px 12px; border-radius:10px; border:none; width:100%; background:linear-gradient(90deg,#7c5cff,#22d3aa); color:#0a0c18; font-weight:700; cursor:pointer; }
  pre { white-space:pre-wrap; word-break:break-word; background:#10142450; border:1px solid #2a2f4a; border-radius:10px; padding:12px; width:100%; box-sizing:border-box; margin:0; font-family:inherit; }
  .error { color:#ff6b6b; margin:0; font-size:0.9rem; }
  .error.hidden, pre.hidden { display:none; }
  .invite { margin-top:24px; padding-top:16px; border-top:1px solid #2a2f4a; text-align:center; max-width:420px; }
  .invite a { color:#7c5cff; font-weight:600; text-decoration:none; }
</style>
</head>
<body>
  <h1>🔐 CryptoChat</h1>
  <p class="hint">Dieses Bild enthält eine versteckte, verschlüsselte Nachricht. Passwort eingeben, um sie sichtbar zu machen. Läuft komplett offline in deinem Browser, es wird nichts übertragen.</p>
  <img id="stego-img" src="${imageDataUrl}" alt="Verstecktes Bild" />
  <div class="card">
    <input type="password" id="pw" placeholder="Passwort" autocomplete="current-password" />
    <button id="btn-decrypt" type="button">Entschlüsseln</button>
    <pre id="out" class="hidden"></pre>
    <p class="error hidden" id="err"></p>
  </div>
  <p class="invite hint">Noch keine CryptoChat-App? <a href="${APP_LINK}" target="_blank" rel="noopener">Hier bekommst du sie</a> – kostenlos, ohne Installation direkt im Browser nutzbar.</p>
<script>
${cryptoStegoSrc}
</script>
<script>
  document.getElementById("btn-decrypt").addEventListener("click", async () => {
    const errEl = document.getElementById("err");
    const outEl = document.getElementById("out");
    errEl.classList.add("hidden");
    outEl.classList.add("hidden");
    const password = document.getElementById("pw").value;
    if (!password) {
      errEl.textContent = "Bitte Passwort eingeben.";
      errEl.classList.remove("hidden");
      return;
    }
    try {
      const img = document.getElementById("stego-img");
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      const imageData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
      const payload = extractPayload(imageData);
      const message = await decryptPayload(password, payload);
      outEl.textContent = message;
      outEl.classList.remove("hidden");
    } catch (e) {
      errEl.textContent = "Entschlüsselung fehlgeschlagen. Falsches Passwort?";
      errEl.classList.remove("hidden");
    }
  });
</script>
</body>
</html>`;
}

function showHideError(msg) {
  hideErrorEl.textContent = "⚠️ " + msg;
  hideErrorEl.classList.remove("hidden");
}

// --- Bild teilen ---

let currentResultBlob = null;
const shareStatusEl = document.getElementById("share-status");

document.getElementById("btn-share").addEventListener("click", async () => {
  if (!currentResultBlob) return;
  shareStatusEl.classList.add("hidden");

  const file = new File([currentResultBlob], "secret.png", { type: "image/png" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: "CryptoChat-Bild",
        text:
          "Verstecktes Bild aus CryptoChat (nur als PNG öffnen/weitergeben). " +
          "Zum Entschlüsseln brauchst du das Passwort und die App: " +
          APP_LINK,
      });
      return;
    } catch (err) {
      if (err.name === "AbortError") return; // Nutzer hat den Teilen-Dialog abgebrochen
      // sonst weiter zum Zwischenablage-Fallback
    }
  }

  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": currentResultBlob })]);
    showShareStatus("✅ Bild in die Zwischenablage kopiert – zum Teilen irgendwo einfügen.");
  } catch {
    showShareStatus("⚠️ Teilen wird hier nicht unterstützt. Bitte über \"Bild herunterladen\" speichern und manuell teilen.");
  }
});

function showShareStatus(msg) {
  shareStatusEl.textContent = msg;
  shareStatusEl.classList.remove("hidden");
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
