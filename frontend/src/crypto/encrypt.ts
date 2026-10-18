/**
 * E2EE message encryption with ephemeral ECDH P-256 and AES-GCM-256.
 */

import { loadLegacyPrivateKey, loadPrivateKey } from './keys';

const ECDH_ALGO = {
  name: 'ECDH',
  namedCurve: 'P-256',
} as const;
const AES_ALGO = {
  name: 'AES-GCM',
  length: 256,
} as const;
const HKDF_ALGO = 'HKDF';
const ENVELOPE_PREFIX = 'skyline-e2e:v3:';
const LEGACY_ENVELOPE_PREFIX = 'oursocial-e2e:v2:';
const LEGACY_RSA_ALGO = {
  name: 'RSA-OAEP',
  hash: 'SHA-256',
} as const;
const DECRYPTION_FAILURE = '[Зашифрованное сообщение]';

export interface RecipientPublicKey {
  userId: string;
  publicKey: string;
}

interface RecipientEnvelope {
  ephemeralPublicKey: JsonWebKey;
  salt: string;
  iv: string;
  ciphertext: string;
}

interface EncryptedEnvelope {
  recipients: Record<string, RecipientEnvelope>;
}

export function isEncryptedMessage(text: string): boolean {
  if (text.startsWith(ENVELOPE_PREFIX) || text.startsWith(LEGACY_ENVELOPE_PREFIX)) return true;
  try {
    return base64ToArrayBuffer(text).byteLength === 256;
  } catch {
    return false;
  }
}

export async function encryptMessage(
  text: string,
  recipients: string | RecipientPublicKey[],
): Promise<string> {
  if (typeof recipients === 'string') {
    return encryptLegacyMessage(text, recipients);
  }

  if (recipients.length === 0 || recipients.some(({ userId, publicKey }) => !userId || !publicKey)) {
    throw new Error('Valid recipient public keys are required for encryption');
  }

  const encryptedRecipients = await Promise.all(
    recipients.map(async ({ userId, publicKey }) => {
      const recipientKey = await window.crypto.subtle.importKey(
        'jwk',
        JSON.parse(publicKey) as JsonWebKey,
        ECDH_ALGO,
        false,
        [],
      );
      const ephemeralKeyPair = await window.crypto.subtle.generateKey(
        ECDH_ALGO,
        true,
        ['deriveBits'],
      );
      const sharedSecret = await window.crypto.subtle.deriveBits(
        { name: 'ECDH', public: recipientKey },
        ephemeralKeyPair.privateKey,
        256,
      );
      const salt = window.crypto.getRandomValues(new Uint8Array(16));
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const aesKey = await deriveAesKey(sharedSecret, salt.buffer, userId);
      const ciphertext = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        new TextEncoder().encode(text),
      );
      const ephemeralPublicKey = await window.crypto.subtle.exportKey(
        'jwk',
        ephemeralKeyPair.publicKey,
      );

      return [userId, {
        ephemeralPublicKey,
        salt: arrayBufferToBase64(salt.buffer),
        iv: arrayBufferToBase64(iv.buffer),
        ciphertext: arrayBufferToBase64(ciphertext),
      }] as const;
    }),
  );

  const envelope: EncryptedEnvelope = { recipients: Object.fromEntries(encryptedRecipients) };
  return `${ENVELOPE_PREFIX}${JSON.stringify(envelope)}`;
}

export async function decryptMessage(encryptedText: string, userId?: string): Promise<string> {
  if (!encryptedText) return '';

  if (encryptedText.startsWith(ENVELOPE_PREFIX)) {
    try {
      if (!userId) return DECRYPTION_FAILURE;
      const envelope = JSON.parse(encryptedText.slice(ENVELOPE_PREFIX.length)) as EncryptedEnvelope;
      const recipientEnvelope = envelope.recipients[userId];
      const privateKey = await loadPrivateKey(userId);
      if (!recipientEnvelope || !privateKey) return DECRYPTION_FAILURE;

      const ephemeralPublicKey = await window.crypto.subtle.importKey(
        'jwk',
        recipientEnvelope.ephemeralPublicKey,
        ECDH_ALGO,
        false,
        [],
      );
      const sharedSecret = await window.crypto.subtle.deriveBits(
        { name: 'ECDH', public: ephemeralPublicKey },
        privateKey,
        256,
      );
      const aesKey = await deriveAesKey(
        sharedSecret,
        base64ToArrayBuffer(recipientEnvelope.salt),
        userId,
      );
      const plaintext = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToArrayBuffer(recipientEnvelope.iv) },
        aesKey,
        base64ToArrayBuffer(recipientEnvelope.ciphertext),
      );
      return new TextDecoder().decode(plaintext);
    } catch {
      return DECRYPTION_FAILURE;
    }
  }

  if (encryptedText.startsWith(LEGACY_ENVELOPE_PREFIX)) {
    try {
      const privateKey = await loadLegacyPrivateKey();
      if (!privateKey) return DECRYPTION_FAILURE;
      const envelope = JSON.parse(encryptedText.slice(LEGACY_ENVELOPE_PREFIX.length)) as {
        iv: string;
        ciphertext: string;
        keys: Record<string, string>;
      };
      const wrappedKey = userId
        ? envelope.keys[userId]
        : Object.values(envelope.keys)[0];
      if (!wrappedKey) return DECRYPTION_FAILURE;

      const rawKey = await window.crypto.subtle.decrypt(
        LEGACY_RSA_ALGO,
        privateKey,
        base64ToArrayBuffer(wrappedKey),
      );
      const aesKey = await window.crypto.subtle.importKey(
        'raw',
        rawKey,
        AES_ALGO,
        false,
        ['decrypt'],
      );
      const plaintext = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToArrayBuffer(envelope.iv) },
        aesKey,
        base64ToArrayBuffer(envelope.ciphertext),
      );
      return new TextDecoder().decode(plaintext);
    } catch {
      return DECRYPTION_FAILURE;
    }
  }

  if (!isEncryptedMessage(encryptedText)) return encryptedText;
  try {
    const privateKey = await loadLegacyPrivateKey();
    if (!privateKey) return DECRYPTION_FAILURE;
    const decrypted = await window.crypto.subtle.decrypt(
      LEGACY_RSA_ALGO,
      privateKey,
      base64ToArrayBuffer(encryptedText),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return DECRYPTION_FAILURE;
  }
}

async function deriveAesKey(
  sharedSecret: ArrayBuffer,
  salt: ArrayBuffer,
  userId: string,
): Promise<CryptoKey> {
  const hkdfKey = await window.crypto.subtle.importKey(
    'raw',
    sharedSecret,
    HKDF_ALGO,
    false,
    ['deriveKey'],
  );
  return window.crypto.subtle.deriveKey(
    {
      name: HKDF_ALGO,
      hash: 'SHA-256',
      salt,
      info: new TextEncoder().encode(`skyline-e2e:v3:${userId}`),
    },
    hkdfKey,
    AES_ALGO,
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptLegacyMessage(text: string, publicKeyJwk: string): Promise<string> {
  const publicKey = await window.crypto.subtle.importKey(
    'jwk',
    JSON.parse(publicKeyJwk) as JsonWebKey,
    LEGACY_RSA_ALGO,
    true,
    ['encrypt'],
  );
  const ciphertext = await window.crypto.subtle.encrypt(
    LEGACY_RSA_ALGO,
    publicKey,
    new TextEncoder().encode(text),
  );
  return arrayBufferToBase64(ciphertext);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}
