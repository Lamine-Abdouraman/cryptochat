/* Senden an / Empfangen von anderen CryptoChat-Nutzern über Firestore.
 * Firebase sieht nur das bereits verschlüsselte Bild, nie die Klartext-Nachricht
 * oder das Passwort (das bleibt weiterhin außerhalb der App vereinbart). */

const MAX_MESSAGE_DATA_URL_LENGTH = 700_000; // Sicherheitsabstand zum 1-MiB-Firestore-Limit

const sendToUserBox = document.getElementById("send-to-user-box");
const sendToUsernameInput = document.getElementById("send-to-username");
const sendSignedOutHint = document.getElementById("send-signed-out-hint");

document.addEventListener("cryptochat-auth-changed", (e) => {
  sendToUserBox.classList.toggle("hidden", !e.detail);
  sendSignedOutHint.classList.toggle("hidden", !!e.detail);
});

/** Verschlüsseltes Bild an einen Nutzernamen senden. Von app.js beim Klick
 * auf "Verschlüsseln & senden" aufgerufen (ein Klick statt zwei Schritte). */
async function sendImageTo(blob, usernameRaw) {
  if (!currentUser) return { ok: false, msg: "Bitte zuerst anmelden." };

  const usernameLower = usernameKey(usernameRaw);
  if (!usernameLower) return { ok: false, msg: "Bitte einen Empfänger-Nutzernamen eingeben." };

  const usernameDoc = await db.collection("usernames").doc(usernameLower).get();
  if (!usernameDoc.exists) {
    return { ok: false, msg: "Diesen Nutzernamen gibt es nicht." };
  }
  const toUid = usernameDoc.data().uid;

  const dataUrl = await blobToDataURL(blob);
  if (dataUrl.length > MAX_MESSAGE_DATA_URL_LENGTH) {
    return { ok: false, msg: "Bild zu groß für den Versand. Bitte ein anderes/kleineres Bild wählen." };
  }

  await db.collection("messages").add({
    to: toUid,
    from: currentUser.uid,
    fromUsername: currentUser.username,
    fromAvatar: currentUser.avatar || null,
    imageData: dataUrl,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    read: false,
  });

  return { ok: true, msg: "✅ Gesendet an @" + usernameRaw.trim() };
}

// --- Posteingang ---

const inboxListEl = document.getElementById("inbox-list");
const inboxEmptyEl = document.getElementById("inbox-empty");
const inboxSignedOutEl = document.getElementById("inbox-signed-out");
let inboxUnsubscribe = null;

document.addEventListener("cryptochat-auth-changed", (e) => {
  if (inboxUnsubscribe) {
    inboxUnsubscribe();
    inboxUnsubscribe = null;
  }
  inboxListEl.innerHTML = "";

  if (!e.detail) {
    inboxSignedOutEl.classList.remove("hidden");
    inboxEmptyEl.classList.add("hidden");
    return;
  }
  inboxSignedOutEl.classList.add("hidden");

  inboxUnsubscribe = db
    .collection("messages")
    .where("to", "==", e.detail.uid)
    .orderBy("createdAt", "desc")
    .onSnapshot(
      (snapshot) => {
        inboxListEl.innerHTML = "";
        inboxEmptyEl.classList.toggle("hidden", !snapshot.empty);
        snapshot.forEach((doc) => renderInboxMessage(doc.id, doc.data()));
      },
      (err) => {
        inboxEmptyEl.classList.add("hidden");
        inboxListEl.innerHTML = `<p class="error">⚠️ ${err.message || err}</p>`;
      }
    );
});

function renderInboxMessage(id, data) {
  const item = document.createElement("div");
  item.className = "inbox-item";

  const when = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() : new Date();

  item.innerHTML = `
    <div class="inbox-thumb-wrap">
      <img src="${data.imageData}" alt="Verschlüsseltes Bild" class="inbox-thumb" />
      <canvas class="inbox-decrypt-overlay" width="90" height="90"></canvas>
    </div>
    <div class="inbox-meta">
      <p class="inbox-from">
        ${avatarHtml(data.fromAvatar, data.fromUsername, "avatar-sm")} @${escapeHtml(data.fromUsername)}
        <button type="button" class="btn-link inbox-add-friend hidden">➕ Freund hinzufügen</button>
      </p>
      <p class="inbox-date">${when.toLocaleString("de-DE")}</p>
      <input type="password" placeholder="Passwort" class="inbox-password" />
      <div class="inbox-actions">
        <button type="button" class="btn-secondary inbox-decrypt">Entschlüsseln</button>
        <button type="button" class="btn-link inbox-reply">↩️ Antworten</button>
        <button type="button" class="btn-link inbox-delete" title="Löschen">🗑️</button>
      </div>
      <pre class="inbox-plaintext hidden"></pre>
      <p class="error hidden inbox-error"></p>
    </div>
  `;

  const addFriendBtn = item.querySelector(".inbox-add-friend");
  db.collection("users")
    .doc(currentUser.uid)
    .collection("friends")
    .doc(data.from)
    .get()
    .then((doc) => {
      if (!doc.exists) addFriendBtn.classList.remove("hidden");
    });

  addFriendBtn.addEventListener("click", async () => {
    addFriendBtn.disabled = true;
    const result = await addFriendByUid(data.from, data.fromUsername, data.fromAvatar);
    if (result.ok) {
      addFriendBtn.remove();
    } else {
      addFriendBtn.disabled = false;
      showInboxItemError(item, result.msg);
    }
  });

  item.querySelector(".inbox-reply").addEventListener("click", () => {
    document.querySelector('.tab-btn[data-tab="hide"]').click();
    document.getElementById("send-to-username").value = data.fromUsername;
    const messageInput = document.getElementById("message");
    messageInput.value = "";
    messageInput.focus();
  });

  item.querySelector(".inbox-decrypt").addEventListener("click", async () => {
    const errEl = item.querySelector(".inbox-error");
    const outEl = item.querySelector(".inbox-plaintext");
    const overlay = item.querySelector(".inbox-decrypt-overlay");
    errEl.classList.add("hidden");
    const password = item.querySelector(".inbox-password").value;

    overlay.classList.add("active");
    const stopAnim = startDecryptGlitch(overlay);
    const minDuration = new Promise((resolve) => setTimeout(resolve, 650));

    try {
      const img = item.querySelector(".inbox-thumb");
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      const imageData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
      const payload = extractPayload(imageData);
      const [message] = await Promise.all([decryptPayload(password, payload), minDuration]);
      outEl.textContent = message;
      outEl.classList.remove("hidden");
    } catch (err) {
      await minDuration;
      errEl.textContent = "⚠️ Entschlüsselung fehlgeschlagen. Falsches Passwort?";
      errEl.classList.remove("hidden");
    } finally {
      stopAnim();
      overlay.classList.remove("active");
    }
  });

  item.querySelector(".inbox-delete").addEventListener("click", async () => {
    await db.collection("messages").doc(id).delete();
  });

  inboxListEl.appendChild(item);
}

/** Zeigt während des Entschlüsselns aufblinkende alphanumerische Zeichen über
 * dem Bild an. Gibt eine Funktion zurück, die die Animation wieder stoppt. */
function startDecryptGlitch(canvas) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const cols = 5;
  const rows = 5;
  const cellW = w / cols;
  const cellH = h / rows;

  const tick = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(10, 12, 24, 0.55)";
    ctx.fillRect(0, 0, w, h);
    ctx.font = `${Math.floor(cellH * 0.7)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() < 0.5) continue;
        ctx.globalAlpha = 0.4 + Math.random() * 0.6;
        ctx.fillStyle = Math.random() < 0.2 ? "#7c5cff" : "#22d3aa";
        const ch = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(ch, c * cellW + cellW / 2, r * cellH + cellH / 2);
      }
    }
    ctx.globalAlpha = 1;
  };

  tick();
  const intervalId = setInterval(tick, 70);
  return () => {
    clearInterval(intervalId);
    ctx.clearRect(0, 0, w, h);
  };
}

function showInboxItemError(item, msg) {
  const errEl = item.querySelector(".inbox-error");
  errEl.textContent = "⚠️ " + msg;
  errEl.classList.remove("hidden");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
