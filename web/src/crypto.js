// Utility helpers for hybrid RSA-OAEP + AES-GCM encryption in browsers.

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function ab2b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b642ab(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function generateRSAKeyPair() {
  return window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
  );
}

export async function exportPublicKeyToPem(publicKey) {
  const spki = await window.crypto.subtle.exportKey("spki", publicKey);
  const b64 = ab2b64(spki);
  return `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join("\n")}\n-----END PUBLIC KEY-----`;
}

export async function exportPrivateKeyToPem(privateKey) {
  const pkcs8 = await window.crypto.subtle.exportKey("pkcs8", privateKey);
  const b64 = ab2b64(pkcs8);
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----`;
}

export async function importPrivateKeyFromPem(pem) {
  const b64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const ab = b642ab(b64);
  return window.crypto.subtle.importKey(
    "pkcs8",
    ab,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt", "unwrapKey"],
  );
}

export async function importPublicKeyFromPem(pem) {
  const b64 = pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, "");
  const ab = b642ab(b64);
  return window.crypto.subtle.importKey(
    "spki",
    ab,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt", "wrapKey"],
  );
}

export async function encryptMessageForPublicKey(plaintext, recipientPublicPem, metadata = {}) {
  const recipientKey = await importPublicKeyFromPem(recipientPublicPem);
  const aesKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    textEncoder.encode(plaintext),
  );
  const wrappedKey = await window.crypto.subtle.wrapKey("raw", aesKey, recipientKey, {
    name: "RSA-OAEP",
  });

  return {
    type: "message.payload",
    alg: "RSA-OAEP+AES-256-GCM",
    from: metadata.from ?? null,
    to: metadata.to ?? null,
    wrappedKey: ab2b64(wrappedKey),
    iv: ab2b64(iv.buffer),
    ciphertext: ab2b64(ciphertext),
    timestamp: Date.now(),
  };
}

export async function decryptMessageWithPrivateKey(payload, privateKey) {
  const wrapped = b642ab(payload.wrappedKey);
  const aesKey = await window.crypto.subtle.unwrapKey(
    "raw",
    wrapped,
    privateKey,
    { name: "RSA-OAEP" },
    { name: "AES-GCM", length: 256 },
    true,
    ["decrypt"],
  );

  const iv = new Uint8Array(b642ab(payload.iv));
  const ciphertext = b642ab(payload.ciphertext);

  const plaintext = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    ciphertext,
  );

  return textDecoder.decode(plaintext);
}
