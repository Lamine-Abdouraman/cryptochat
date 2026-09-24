/* Persönliche Freundesliste (einfache Kontaktliste, keine Bestätigung nötig).
 * Dient als Schnellauswahl beim Senden; jeder Nutzername bleibt weiterhin
 * unabhängig davon direkt adressierbar. */

const friendsSignedOutEl = document.getElementById("friends-signed-out");
const friendsSignedInEl = document.getElementById("friends-signed-in");
const friendsListEl = document.getElementById("friends-list");
const friendsEmptyEl = document.getElementById("friends-empty");
const friendsErrorEl = document.getElementById("friends-error");
const addFriendInput = document.getElementById("add-friend-username");
const btnAddFriend = document.getElementById("btn-add-friend");
const sendFriendChipsEl = document.getElementById("send-friend-chips");

let friendsUnsubscribe = null;

function showFriendsError(msg) {
  friendsErrorEl.textContent = "⚠️ " + msg;
  friendsErrorEl.classList.remove("hidden");
}

document.addEventListener("cryptochat-auth-changed", (e) => {
  if (friendsUnsubscribe) {
    friendsUnsubscribe();
    friendsUnsubscribe = null;
  }
  friendsListEl.innerHTML = "";
  sendFriendChipsEl.innerHTML = "";
  sendFriendChipsEl.classList.add("hidden");

  if (!e.detail) {
    friendsSignedOutEl.classList.remove("hidden");
    friendsSignedInEl.classList.add("hidden");
    return;
  }
  friendsSignedOutEl.classList.add("hidden");
  friendsSignedInEl.classList.remove("hidden");

  friendsUnsubscribe = db
    .collection("users")
    .doc(e.detail.uid)
    .collection("friends")
    .orderBy("addedAt", "desc")
    .onSnapshot(
      (snapshot) => {
        friendsListEl.innerHTML = "";
        sendFriendChipsEl.innerHTML = "";
        friendsEmptyEl.classList.toggle("hidden", !snapshot.empty);
        sendFriendChipsEl.classList.toggle("hidden", snapshot.empty);
        snapshot.forEach((doc) => {
          renderFriendItem(doc.id, doc.data());
          renderFriendChip(doc.data());
        });
      },
      (err) => {
        friendsListEl.innerHTML = `<p class="error">⚠️ ${err.message || err}</p>`;
      }
    );
});

/** Fügt einen Nutzer (bereits bekannte UID/Name/Avatar) der eigenen Freundesliste
 * hinzu. Wiederverwendet von der Freunde-Seite und vom "Freund hinzufügen"-Button
 * im Posteingang. */
async function addFriendByUid(friendUid, username, avatar) {
  if (!currentUser) return { ok: false, msg: "Bitte zuerst anmelden." };
  if (friendUid === currentUser.uid) return { ok: false, msg: "Das bist du selbst." };

  await db
    .collection("users")
    .doc(currentUser.uid)
    .collection("friends")
    .doc(friendUid)
    .set({
      username,
      avatar: avatar || null,
      addedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

  return { ok: true, msg: "✅ @" + username + " zu Freunden hinzugefügt." };
}

btnAddFriend.addEventListener("click", async () => {
  friendsErrorEl.classList.add("hidden");
  if (!currentUser) return;

  const usernameLower = usernameKey(addFriendInput.value);
  if (!usernameLower) return showFriendsError("Bitte einen Nutzernamen eingeben.");

  btnAddFriend.disabled = true;
  try {
    const usernameDoc = await db.collection("usernames").doc(usernameLower).get();
    if (!usernameDoc.exists) {
      return showFriendsError("Diesen Nutzernamen gibt es nicht.");
    }
    const friendUid = usernameDoc.data().uid;

    const friendProfile = await db.collection("users").doc(friendUid).get();
    const friendData = friendProfile.exists ? friendProfile.data() : {};
    const username = friendData.username || addFriendInput.value.trim();

    const result = await addFriendByUid(friendUid, username, friendData.avatar);
    if (!result.ok) return showFriendsError(result.msg);

    addFriendInput.value = "";
  } catch (err) {
    showFriendsError(err.message || String(err));
  } finally {
    btnAddFriend.disabled = false;
  }
});

function renderFriendItem(friendUid, data) {
  const item = document.createElement("div");
  item.className = "friend-item";
  item.innerHTML = `
    ${avatarHtml(data.avatar, data.username, "avatar-sm")}
    <span class="friend-username">@${escapeHtml(data.username)}</span>
    <button type="button" class="btn-secondary friend-send-btn">Senden</button>
    <button type="button" class="btn-link friend-remove-btn">Entfernen</button>
  `;

  item.querySelector(".friend-send-btn").addEventListener("click", () => {
    document.querySelector('.tab-btn[data-tab="hide"]').click();
    document.getElementById("send-to-username").value = data.username;
  });

  item.querySelector(".friend-remove-btn").addEventListener("click", async () => {
    await db.collection("users").doc(currentUser.uid).collection("friends").doc(friendUid).delete();
  });

  friendsListEl.appendChild(item);
}

function renderFriendChip(data) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "friend-chip";
  chip.innerHTML = `${avatarHtml(data.avatar, data.username, "avatar-xs")} @${escapeHtml(data.username)}`;
  chip.addEventListener("click", () => {
    document.getElementById("send-to-username").value = data.username;
  });
  sendFriendChipsEl.appendChild(chip);
}

// --- Freunde einladen ---

const APP_LINK = "https://lamine-abdouraman.github.io/cryptochat/";
const btnInviteFriends = document.getElementById("btn-invite-friends");
const inviteFriendsStatus = document.getElementById("invite-friends-status");

function showInviteStatus(msg) {
  inviteFriendsStatus.textContent = msg;
  inviteFriendsStatus.classList.remove("hidden");
}

btnInviteFriends.addEventListener("click", async () => {
  inviteFriendsStatus.classList.add("hidden");
  const inviteText =
    "Lass uns über CryptoChat verschlüsselte Nachrichten austauschen! " +
    "Hol dir die App hier: " +
    APP_LINK;

  if (navigator.share) {
    try {
      await navigator.share({ title: "CryptoChat", text: inviteText, url: APP_LINK });
      return;
    } catch (err) {
      if (err.name === "AbortError") return; // Nutzer hat den Teilen-Dialog abgebrochen
      // sonst weiter zum Zwischenablage-Fallback
    }
  }

  try {
    await navigator.clipboard.writeText(inviteText);
    showInviteStatus("✅ Einladungstext in die Zwischenablage kopiert – jetzt irgendwo einfügen.");
  } catch {
    showInviteStatus("⚠️ Teilen wird hier nicht unterstützt. Link zum Kopieren: " + APP_LINK);
  }
});
