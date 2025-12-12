// Fallback crypto using node-forge (works on HTTP without secure context)
import forge from 'node-forge';

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

// Convert forge keypair to Web Crypto-like format
function forgeKeyPairToWebCrypto(forgeKeyPair) {
  return {
    publicKey: forgeKeyPair.publicKey,
    privateKey: forgeKeyPair.privateKey,
    _forge: true, // Mark as forge keys
  };
}

export async function generateRSAKeyPair() {
  return new Promise((resolve, reject) => {
    try {
      forge.pki.rsa.generateKeyPair({ bits: 2048, workers: 2 }, (err, keypair) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(forgeKeyPairToWebCrypto(keypair));
      });
    } catch (err) {
      reject(err);
    }
  });
}

export async function exportPublicKeyToPem(publicKey) {
  if (publicKey._forge) {
    return forge.pki.publicKeyToPem(publicKey);
  }
  // If it's a Web Crypto key, convert it
  const spki = await window.crypto.subtle.exportKey('spki', publicKey);
  const b64 = ab2b64(spki);
  return `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
}

export async function exportPrivateKeyToPem(privateKey) {
  if (privateKey._forge) {
    return forge.pki.privateKeyToPem(privateKey);
  }
  const pkcs8 = await window.crypto.subtle.exportKey('pkcs8', privateKey);
  const b64 = ab2b64(pkcs8);
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
}

export async function importPrivateKeyFromPem(pem) {
  try {
    const privateKey = forge.pki.privateKeyFromPem(pem);
    return { ...privateKey, _forge: true };
  } catch (err) {
    // Fallback to Web Crypto if available
    if (window.crypto && window.crypto.subtle) {
      const b64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
      const ab = b642ab(b64);
      return window.crypto.subtle.importKey('pkcs8', ab, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt', 'unwrapKey']);
    }
    throw err;
  }
}

export async function importPublicKeyFromPem(pem) {
  try {
    const publicKey = forge.pki.publicKeyFromPem(pem);
    return { ...publicKey, _forge: true };
  } catch (err) {
    // Fallback to Web Crypto if available
    if (window.crypto && window.crypto.subtle) {
      const b64 = pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '');
      const ab = b642ab(b64);
      return window.crypto.subtle.importKey('spki', ab, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt', 'wrapKey']);
    }
    throw err;
  }
}

export async function encryptMessageForPublicKey(plaintext, recipientPublicPem, metadata = {}) {
  const recipientKey = await importPublicKeyFromPem(recipientPublicPem);
  
  if (recipientKey._forge) {
    // Use forge for encryption
    const aesKey = forge.random.getBytesSync(32); // 256-bit key
    const iv = forge.random.getBytesSync(12);
    
    // Encrypt plaintext with AES-GCM
    const cipher = forge.cipher.createCipher('AES-GCM', aesKey);
    cipher.start({ iv });
    cipher.update(forge.util.createBuffer(plaintext, 'utf8'));
    cipher.finish();
    const encrypted = cipher.output.getBytes();
    const tag = cipher.mode.tag.getBytes();
    
    // Combine encrypted + tag
    const ciphertext = encrypted + tag;
    
    // Encrypt AES key with RSA
    const wrappedKey = recipientKey.encrypt(aesKey, 'RSA-OAEP');
    
    return {
      type: 'message.payload',
      alg: 'RSA-OAEP+AES-256-GCM',
      from: metadata.from ?? null,
      to: metadata.to ?? null,
      wrappedKey: ab2b64(forge.util.encode64(wrappedKey)),
      iv: ab2b64(forge.util.encode64(iv)),
      ciphertext: ab2b64(forge.util.encode64(ciphertext)),
      timestamp: Date.now(),
    };
  } else {
    // Use Web Crypto
    const recipientKeyWeb = recipientKey;
    const aesKey = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, textEncoder.encode(plaintext));
    const wrappedKey = await window.crypto.subtle.wrapKey('raw', aesKey, recipientKeyWeb, { name: 'RSA-OAEP' });
    
    return {
      type: 'message.payload',
      alg: 'RSA-OAEP+AES-256-GCM',
      from: metadata.from ?? null,
      to: metadata.to ?? null,
      wrappedKey: ab2b64(wrappedKey),
      iv: ab2b64(iv.buffer),
      ciphertext: ab2b64(ciphertext),
      timestamp: Date.now(),
    };
  }
}

export async function decryptMessageWithPrivateKey(payload, privateKey) {
  if (privateKey._forge) {
    // Use forge for decryption
    const wrappedKey = forge.util.decode64(atob(payload.wrappedKey));
    const iv = forge.util.decode64(atob(payload.iv));
    const ciphertext = forge.util.decode64(atob(payload.ciphertext));
    
    // Decrypt AES key with RSA
    const aesKey = privateKey.decrypt(wrappedKey, 'RSA-OAEP');
    
    // Split ciphertext and tag (last 16 bytes are tag)
    const encrypted = ciphertext.slice(0, -16);
    const tag = ciphertext.slice(-16);
    
    // Decrypt with AES-GCM
    const decipher = forge.cipher.createDecipher('AES-GCM', aesKey);
    decipher.start({ iv, tag: forge.util.createBuffer(tag) });
    decipher.update(forge.util.createBuffer(encrypted));
    const success = decipher.finish();
    
    if (!success) {
      throw new Error('Decryption failed - authentication tag mismatch');
    }
    
    return decipher.output.toString('utf8');
  } else {
    // Use Web Crypto
    const wrapped = b642ab(payload.wrappedKey);
    const aesKey = await window.crypto.subtle.unwrapKey('raw', wrapped, privateKey, { name: 'RSA-OAEP' }, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
    const iv = new Uint8Array(b642ab(payload.iv));
    const ct = b642ab(payload.ciphertext);
    const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
    return textDecoder.decode(decrypted);
  }
}

