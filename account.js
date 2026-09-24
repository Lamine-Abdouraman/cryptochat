/* Firebase-Konto (E-Mail/Passwort + Nutzername) für "An CryptoChat-Nutzer senden". */

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null; // { uid, username }

const accountSignedOutView = document.getElementById("account-signed-out");
const accountSignedInView = document.getElementById("account-signed-in");
const accountUsernameLabel = document.getElementById("account-username-label");
const accountErrorEl = document.getElementById("account-error");

function showAccountError(msg) {
  accountErrorEl.textContent = "⚠️ " + msg;
  accountErrorEl.classList.remove("hidden");
}

function clearAccountError() {
  accountErrorEl.classList.add("hidden");
}

function usernameKey(username) {
  return username.trim().toLowerCase();
}

function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

const AVATAR_SIZE = 128;
const AVATAR_COLORS = ["#7c5cff", "#22d3aa", "#ff9f5c", "#ff6b9d", "#5cc9ff"];

/** Skaliert/croppt ein Bild clientseitig auf ein kleines quadratisches JPEG (Base64). */
function resizeImageToAvatar(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - side) / 2;
      const sy = (img.naturalHeight - side) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      canvas
        .getContext("2d")
        .drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** Erzeugt HTML für einen Avatar: eigenes Bild oder ein Platzhalter-Kreis mit Anfangsbuchstabe. */
function avatarHtml(avatarDataUrl, username, sizeClass) {
  const cls = "avatar" + (sizeClass ? " " + sizeClass : "");
  if (avatarDataUrl) {
    return `<img src="${avatarDataUrl}" alt="" class="${cls}" />`;
  }
  const letter = (username || "?").trim().charAt(0).toUpperCase();
  const color = AVATAR_COLORS[letter.charCodeAt(0) % AVATAR_COLORS.length];
  return `<span class="${cls} avatar-fallback" style="background:${color}">${letter}</span>`;
}

document.getElementById("btn-signup").addEventListener("click", async () => {
  clearAccountError();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const username = document.getElementById("signup-username").value.trim();
  const usernameLower = usernameKey(username);

  if (!isValidUsername(username)) {
    return showAccountError("Nutzername: 3-20 Zeichen, nur Buchstaben/Zahlen/_.");
  }
  if (password.length < 6) {
    return showAccountError("Passwort muss mindestens 6 Zeichen haben.");
  }

  try {
    const existing = await db.collection("usernames").doc(usernameLower).get();
    if (existing.exists) {
      return showAccountError("Dieser Nutzername ist bereits vergeben.");
    }

    const credential = await auth.createUserWithEmailAndPassword(email, password);
    const uid = credential.user.uid;

    await db.collection("usernames").doc(usernameLower).set({ uid });
    await db.collection("users").doc(uid).set({
      username,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // onAuthStateChanged kann schon vor diesen Schreibvorgängen ausgelöst worden
    // sein (Race Condition) und dann noch kein Profil finden -> hier zusätzlich
    // direkt aktualisieren, damit der Nutzername sofort korrekt angezeigt wird.
    applySignedInUser(uid, username, null);
  } catch (err) {
    showAccountError(err.message || String(err));
  }
});

document.getElementById("btn-login").addEventListener("click", async () => {
  clearAccountError();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    showAccountError(err.message || String(err));
  }
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  await auth.signOut();
});

document.getElementById("btn-forgot-password").addEventListener("click", async () => {
  clearAccountError();
  const email = document.getElementById("login-email").value.trim();
  if (!email) return showAccountError("Bitte zuerst E-Mail-Adresse eingeben.");
  try {
    await auth.sendPasswordResetEmail(email);
    showAccountError("✅ E-Mail zum Zurücksetzen wurde verschickt.");
  } catch (err) {
    showAccountError(err.message || String(err));
  }
});

const accountAvatarBox = document.getElementById("account-avatar-box");
const avatarUploadInput = document.getElementById("avatar-upload-input");

function applySignedInUser(uid, username, avatar) {
  currentUser = { uid, username, avatar: avatar || null };
  accountUsernameLabel.textContent = "@" + username;
  accountAvatarBox.innerHTML = avatarHtml(currentUser.avatar, username, "avatar-md");
  accountSignedOutView.classList.add("hidden");
  accountSignedInView.classList.remove("hidden");
  document.dispatchEvent(new CustomEvent("cryptochat-auth-changed", { detail: currentUser }));
}

avatarUploadInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !currentUser) return;
  clearAccountError();
  try {
    const avatarDataUrl = await resizeImageToAvatar(file);
    await db.collection("users").doc(currentUser.uid).set({ avatar: avatarDataUrl }, { merge: true });
    applySignedInUser(currentUser.uid, currentUser.username, avatarDataUrl);
  } catch (err) {
    showAccountError(err.message || String(err));
  }
});

auth.onAuthStateChanged(async (user) => {
  clearAccountError();
  if (!user) {
    currentUser = null;
    accountSignedOutView.classList.remove("hidden");
    accountSignedInView.classList.add("hidden");
    document.dispatchEvent(new CustomEvent("cryptochat-auth-changed", { detail: null }));
    return;
  }

  // Bis zu 3 Versuche mit kurzer Pause: direkt nach dem Sign-up kann das
  // Profil-Dokument noch nicht sofort sichtbar sein (Race Condition), obwohl
  // der Sign-up-Handler es bereits geschrieben hat.
  let profile = await db.collection("users").doc(user.uid).get();
  for (let attempt = 0; attempt < 3 && !profile.exists; attempt++) {
    await new Promise((r) => setTimeout(r, 400));
    profile = await db.collection("users").doc(user.uid).get();
  }

  // Falls applySignedInUser() (aus dem Sign-up-Handler) für diesen Nutzer
  // inzwischen schon einen echten Nutzernamen gesetzt hat, diesen nicht mit
  // einem verspäteten "existiert noch nicht"-Ergebnis überschreiben.
  if (!profile.exists && currentUser && currentUser.uid === user.uid) {
    return;
  }

  const username = profile.exists ? profile.data().username : user.email;
  const avatar = profile.exists ? profile.data().avatar : null;
  applySignedInUser(user.uid, username, avatar);
});
