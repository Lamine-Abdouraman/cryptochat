/* Lokale App-Sperre (PIN). Läuft komplett offline, schützt nur den Zugriff auf
   diesem Gerät – hat keinen Einfluss auf die Verschlüsselung der Nachrichten. */

const LOCK_SALT_KEY = "cryptostego_lock_salt";
const LOCK_HASH_KEY = "cryptostego_lock_hash";
const PIN_ITERATIONS = 100000;

const lockOverlay = document.getElementById("lock-overlay");
const appRoot = document.getElementById("app-root");
const setupView = document.getElementById("lock-setup-view");
const enterView = document.getElementById("lock-enter-view");

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hashPin(pin, saltBytes) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: PIN_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function unlockApp() {
  lockOverlay.classList.add("hidden");
  appRoot.classList.remove("hidden");
}

function showLockOverlay() {
  appRoot.classList.add("hidden");
  lockOverlay.classList.remove("hidden");
  const hasPin = !!localStorage.getItem(LOCK_HASH_KEY);
  setupView.classList.toggle("hidden", hasPin);
  enterView.classList.toggle("hidden", !hasPin);
  document.getElementById("enter-pin").value = "";
  document.getElementById("setup-pin").value = "";
  document.getElementById("setup-pin-confirm").value = "";
}

document.getElementById("btn-setup-pin").addEventListener("click", async () => {
  const errEl = document.getElementById("setup-error");
  errEl.classList.add("hidden");
  const pin = document.getElementById("setup-pin").value;
  const confirmPin = document.getElementById("setup-pin-confirm").value;

  if (pin.length < 4) {
    errEl.textContent = "⚠️ Der PIN muss mindestens 4 Zeichen haben.";
    errEl.classList.remove("hidden");
    return;
  }
  if (pin !== confirmPin) {
    errEl.textContent = "⚠️ Die PINs stimmen nicht überein.";
    errEl.classList.remove("hidden");
    return;
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPin(pin, salt);
  localStorage.setItem(LOCK_SALT_KEY, bytesToBase64(salt));
  localStorage.setItem(LOCK_HASH_KEY, bytesToBase64(hash));
  unlockApp();
});

document.getElementById("btn-unlock").addEventListener("click", async () => {
  const errEl = document.getElementById("unlock-error");
  errEl.classList.add("hidden");
  const pin = document.getElementById("enter-pin").value;
  const salt = base64ToBytes(localStorage.getItem(LOCK_SALT_KEY));
  const storedHash = base64ToBytes(localStorage.getItem(LOCK_HASH_KEY));
  const enteredHash = await hashPin(pin, salt);

  if (bytesEqual(enteredHash, storedHash)) {
    unlockApp();
  } else {
    errEl.textContent = "⚠️ Falscher PIN.";
    errEl.classList.remove("hidden");
  }
});

document.getElementById("enter-pin").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("btn-unlock").click();
});
document.getElementById("setup-pin-confirm").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("btn-setup-pin").click();
});

document.getElementById("btn-forgot-pin").addEventListener("click", () => {
  const confirmed = confirm(
    "PIN zurücksetzen? Dies löscht nur die App-Sperre auf diesem Gerät. Bereits erzeugte Bilder/Dateien sind davon nicht betroffen, da CryptoChat keine Nachrichten speichert."
  );
  if (!confirmed) return;
  localStorage.removeItem(LOCK_SALT_KEY);
  localStorage.removeItem(LOCK_HASH_KEY);
  showLockOverlay();
});

document.getElementById("btn-lock-now").addEventListener("click", () => {
  showLockOverlay();
});

showLockOverlay();
