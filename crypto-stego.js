/* Verschlüsselung (AES-256-GCM + PBKDF2) und LSB-Steganografie. */

const PBKDF2_ITERATIONS = 200000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const HEADER_BITS = 32; // 32-Bit Länge des Payloads in Bytes

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Verschlüsselt eine Textnachricht -> Uint8Array [salt|iv|ciphertext(+tag)] */
async function encryptMessage(password, message) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(message)
  );
  const ciphertext = new Uint8Array(ciphertextBuf);

  const payload = new Uint8Array(salt.length + iv.length + ciphertext.length);
  payload.set(salt, 0);
  payload.set(iv, salt.length);
  payload.set(ciphertext, salt.length + iv.length);
  return payload;
}

/** Entschlüsselt ein Payload [salt|iv|ciphertext] -> Klartext-String */
async function decryptPayload(password, payload) {
  const salt = payload.slice(0, SALT_LENGTH);
  const iv = payload.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = payload.slice(SALT_LENGTH + IV_LENGTH);
  const key = await deriveKey(password, salt);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plainBuf);
}

function bytesToBitArray(bytes) {
  const bits = new Uint8Array(bytes.length * 8);
  for (let i = 0; i < bytes.length; i++) {
    for (let b = 0; b < 8; b++) {
      bits[i * 8 + b] = (bytes[i] >> (7 - b)) & 1;
    }
  }
  return bits;
}

function uint32ToBits(n) {
  const bits = new Uint8Array(32);
  for (let b = 0; b < 32; b++) {
    bits[b] = (n >>> (31 - b)) & 1;
  }
  return bits;
}

function bitsToUint32(bits, offset) {
  let n = 0;
  for (let b = 0; b < 32; b++) {
    n = (n << 1) | bits[offset + b];
  }
  return n >>> 0;
}

/** Wie viele Bits (R,G,B je Pixel) stehen für Nutzdaten zur Verfügung? */
function imageCapacityBits(width, height) {
  return width * height * 3;
}

function requiredBitsForPayload(payloadByteLength) {
  return HEADER_BITS + payloadByteLength * 8;
}

/** Bettet payload (Uint8Array) in die LSBs von imageData.data (RGBA) ein. Mutiert imageData. */
function embedPayload(imageData, payload) {
  const capacity = imageCapacityBits(imageData.width, imageData.height);
  const required = requiredBitsForPayload(payload.length);
  if (required > capacity) {
    throw new Error(
      `Bild zu klein: benötigt ${Math.ceil(required / 3)} Pixel, verfügbar ${imageData.width * imageData.height}.`
    );
  }

  const headerBits = uint32ToBits(payload.length);
  const payloadBits = bytesToBitArray(payload);
  const allBits = new Uint8Array(headerBits.length + payloadBits.length);
  allBits.set(headerBits, 0);
  allBits.set(payloadBits, headerBits.length);

  const data = imageData.data;
  let bitIndex = 0;
  for (let px = 0; px < data.length && bitIndex < allBits.length; px += 4) {
    for (let channel = 0; channel < 3 && bitIndex < allBits.length; channel++) {
      data[px + channel] = (data[px + channel] & 0xfe) | allBits[bitIndex];
      bitIndex++;
    }
  }
}

/** Extrahiert das zuvor eingebettete Payload aus imageData. */
function extractPayload(imageData) {
  const data = imageData.data;
  const capacityBits = imageCapacityBits(imageData.width, imageData.height);
  if (capacityBits < HEADER_BITS) {
    throw new Error("Bild ist zu klein, um Daten zu enthalten.");
  }

  // Erst Header lesen (erste 32 Bits)
  const headerBits = new Uint8Array(HEADER_BITS);
  let bitIndex = 0;
  let px = 0;
  outer: for (; px < data.length; px += 4) {
    for (let channel = 0; channel < 3; channel++) {
      if (bitIndex >= HEADER_BITS) break outer;
      headerBits[bitIndex] = data[px + channel] & 1;
      bitIndex++;
    }
  }
  const payloadLength = bitsToUint32(headerBits, 0);
  const totalNeededBits = HEADER_BITS + payloadLength * 8;

  if (payloadLength <= 0 || totalNeededBits > capacityBits || payloadLength > 50_000_000) {
    throw new Error("Keine gültigen versteckten Daten gefunden (falsches Bild?).");
  }

  const payloadBits = new Uint8Array(payloadLength * 8);
  let payloadBitIndex = 0;
  let globalBitIndex = 0;
  for (px = 0; px < data.length && payloadBitIndex < payloadBits.length; px += 4) {
    for (let channel = 0; channel < 3 && payloadBitIndex < payloadBits.length; channel++) {
      if (globalBitIndex >= HEADER_BITS) {
        payloadBits[payloadBitIndex] = data[px + channel] & 1;
        payloadBitIndex++;
      }
      globalBitIndex++;
    }
  }

  const payload = new Uint8Array(payloadLength);
  for (let i = 0; i < payloadLength; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | payloadBits[i * 8 + b];
    }
    payload[i] = byte;
  }
  return payload;
}
