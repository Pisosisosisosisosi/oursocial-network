/**
 * Генерация пары ключей RSA-OAEP через Web Crypto API.
 * Используется для E2E-шифрования сообщений.
 */

const ALGO = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
} as const;

const STORAGE_KEY = 'e2e_private_key';
const PUBLIC_KEY_STORAGE = 'e2e_public_key';

export async function generateKeyPair(): Promise<{ publicKeyJwk: string; privateKey: CryptoKey }> {
  const keyPair = await window.crypto.subtle.generateKey(
    ALGO,
    true,
    ['encrypt', 'decrypt']
  );

  const publicJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const publicKeyJwk = JSON.stringify(publicJwk);

  const privateJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(privateJwk));
  localStorage.setItem(PUBLIC_KEY_STORAGE, publicKeyJwk);

  return { publicKeyJwk, privateKey: keyPair.privateKey };
}

export async function loadPrivateKey(): Promise<CryptoKey | null> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;

  try {
    const jwk = JSON.parse(stored);
    return await window.crypto.subtle.importKey(
      'jwk',
      jwk,
      ALGO,
      true,
      ['decrypt']
    );
  } catch (err) {
    console.error('❌ Failed to load private key:', err);
    return null;
  }
}

export function hasPrivateKey(): boolean {
  return !!localStorage.getItem(STORAGE_KEY);
}

export function clearKeys() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PUBLIC_KEY_STORAGE);
}