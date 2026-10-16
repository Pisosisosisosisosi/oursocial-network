/**
 * Шифрование и расшифровка сообщений через Web Crypto API.
 */

import { loadPrivateKey } from './keys';

const ALGO = {
  name: 'RSA-OAEP',
  hash: 'SHA-256',
} as const;

export async function encryptMessage(text: string, publicKeyJwk: string): Promise<string> {
  try {
    const jwk = JSON.parse(publicKeyJwk);
    const publicKey = await window.crypto.subtle.importKey(
      'jwk',
      jwk,
      ALGO,
      true,
      ['encrypt']
    );

    const encoded = new TextEncoder().encode(text);
    const encrypted = await window.crypto.subtle.encrypt(ALGO, publicKey, encoded);

    return arrayBufferToBase64(encrypted);
  } catch (err) {
    console.error('❌ Encryption failed:', err);
    throw new Error('Encryption failed');
  }
}

export async function decryptMessage(encryptedBase64: string): Promise<string> {
  try {
    const privateKey = await loadPrivateKey();
    if (!privateKey) {
      console.warn('⚠️ No private key found');
      return '[Нет ключа для расшифровки]';
    }

    const encrypted = base64ToArrayBuffer(encryptedBase64);
    const decrypted = await window.crypto.subtle.decrypt(ALGO, privateKey, encrypted);

    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error('❌ Decryption failed:', err);
    return '[Не удалось расшифровать]';
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