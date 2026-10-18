/**
 * Шифрование и расшифровка сообщений через Web Crypto API.
 */

import { loadPrivateKey } from './keys';

const RSA_ALGO = {
  name: 'RSA-OAEP',
  hash: 'SHA-256',
} as const;

const AES_ALGO = {
  name: 'AES-GCM',
  length: 256,
} as const;

const ENVELOPE_PREFIX = 'oursocial-e2e:v2:';

export interface RecipientPublicKey {
  userId: string;
  publicKey: string;
}

interface EncryptedEnvelope {
  iv: string;
  ciphertext: string;
  keys: Record<string, string>;
}

export async function encryptMessage(
  text: string,
  recipients: string | RecipientPublicKey[],
): Promise<string> {
  if (typeof recipients === 'string') {
    return encryptLegacyMessage(text, recipients);
  }

  if (recipients.length === 0) {
    throw new Error('At least one public key is required for encryption');
  }

  const aesKey = await window.crypto.subtle.generateKey(AES_ALGO, true, ['encrypt', 'decrypt']);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(text),
  );
  const rawAesKey = await window.crypto.subtle.exportKey('raw', aesKey);
  const encryptedKeys = await Promise.all(
    recipients.map(async ({ userId, publicKey }) => {
      const key = await importPublicKey(publicKey);
      const encryptedKey = await window.crypto.subtle.encrypt(RSA_ALGO, key, rawAesKey);
      return [userId, arrayBufferToBase64(encryptedKey)] as const;
    }),
  );

  const envelope: EncryptedEnvelope = {
    iv: arrayBufferToBase64(iv.buffer),
    ciphertext: arrayBufferToBase64(ciphertext),
    keys: Object.fromEntries(encryptedKeys),
  };

  return `${ENVELOPE_PREFIX}${JSON.stringify(envelope)}`;
}

async function encryptLegacyMessage(text: string, publicKeyJwk: string): Promise<string> {
  try {
    const publicKey = await importPublicKey(publicKeyJwk);
    const encoded = new TextEncoder().encode(text);
    const encrypted = await window.crypto.subtle.encrypt(RSA_ALGO, publicKey, encoded);

    return arrayBufferToBase64(encrypted);
  } catch (err) {
    console.error('❌ Encryption failed:', err);
    throw new Error('Encryption failed');
  }
}

async function importPublicKey(publicKeyJwk: string): Promise<CryptoKey> {
  return window.crypto.subtle.importKey(
    'jwk',
    JSON.parse(publicKeyJwk),
    RSA_ALGO,
    true,
    ['encrypt'],
  );
}

export async function decryptMessage(encryptedBase64: string, userId?: string): Promise<string> {
  if (!encryptedBase64) return '';
  try {
    const privateKey = await loadPrivateKey();
    if (!privateKey) {
      return encryptedBase64;
    }

    if (encryptedBase64.startsWith(ENVELOPE_PREFIX)) {
      const envelope = JSON.parse(encryptedBase64.slice(ENVELOPE_PREFIX.length)) as EncryptedEnvelope;
      const wrappedKey = userId
        ? envelope.keys[userId]
        : Object.values(envelope.keys)[0];
      if (!wrappedKey) return '[Сообщение зашифровано для другого устройства]';

      const rawKey = await window.crypto.subtle.decrypt(
        RSA_ALGO,
        privateKey,
        base64ToArrayBuffer(wrappedKey),
      );
      const aesKey = await window.crypto.subtle.importKey('raw', rawKey, AES_ALGO, false, ['decrypt']);
      const plaintext = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToArrayBuffer(envelope.iv) },
        aesKey,
        base64ToArrayBuffer(envelope.ciphertext),
      );
      return new TextDecoder().decode(plaintext);
    }

    const encrypted = base64ToArrayBuffer(encryptedBase64);
    const decrypted = await window.crypto.subtle.decrypt(RSA_ALGO, privateKey, encrypted);

    return new TextDecoder().decode(decrypted);
  } catch {
    // If decryption fails (e.g. sent as plain text), show the original message text
    return encryptedBase64;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}