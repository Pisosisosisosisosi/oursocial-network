/**
 * Client-side ECDH P-256 keys. Private keys remain in this browser.
 */

const ECDH_ALGO = {
  name: 'ECDH',
  namedCurve: 'P-256',
} as const;
const RSA_ALGO = {
  name: 'RSA-OAEP',
  hash: 'SHA-256',
} as const;

const STORAGE_KEY_PREFIX = 'e2e_p256_private_key';
const PUBLIC_KEY_STORAGE_PREFIX = 'e2e_p256_public_key';
const LEGACY_STORAGE_KEY = 'e2e_private_key';

export async function generateKeyPair(userId: string): Promise<{ publicKeyJwk: string; privateKey: CryptoKey }> {
  const keyPair = await window.crypto.subtle.generateKey(ECDH_ALGO, true, ['deriveBits']);
  const publicJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const publicKeyJwk = JSON.stringify(publicJwk);
  const privateJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);

  localStorage.setItem(privateStorageKey(userId), JSON.stringify(privateJwk));
  localStorage.setItem(publicStorageKey(userId), publicKeyJwk);

  return { publicKeyJwk, privateKey: keyPair.privateKey };
}

export async function loadPrivateKey(userId?: string): Promise<CryptoKey | null> {
  if (!userId) return null;
  const stored = localStorage.getItem(privateStorageKey(userId));
  if (!stored) return null;

  try {
    return await window.crypto.subtle.importKey(
      'jwk',
      JSON.parse(stored),
      ECDH_ALGO,
      true,
      ['deriveBits'],
    );
  } catch (error) {
    console.error('Failed to load ECDH private key:', error);
    return null;
  }
}

export async function loadLegacyPrivateKey(): Promise<CryptoKey | null> {
  const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!stored) return null;

  try {
    return await window.crypto.subtle.importKey(
      'jwk',
      JSON.parse(stored),
      RSA_ALGO,
      true,
      ['decrypt'],
    );
  } catch (error) {
    console.error('Failed to load legacy RSA private key:', error);
    return null;
  }
}

export async function getOrCreateKeyPair(userId: string): Promise<{ publicKeyJwk: string; privateKey: CryptoKey }> {
  const privateKey = await loadPrivateKey(userId);
  const publicKeyJwk = localStorage.getItem(publicStorageKey(userId));
  if (privateKey && publicKeyJwk) return { publicKeyJwk, privateKey };

  const unscopedPrivateKey = localStorage.getItem(STORAGE_KEY_PREFIX);
  const unscopedPublicKey = localStorage.getItem(PUBLIC_KEY_STORAGE_PREFIX);
  if (unscopedPrivateKey && unscopedPublicKey) {
    localStorage.setItem(privateStorageKey(userId), unscopedPrivateKey);
    localStorage.setItem(publicStorageKey(userId), unscopedPublicKey);
    localStorage.removeItem(STORAGE_KEY_PREFIX);
    localStorage.removeItem(PUBLIC_KEY_STORAGE_PREFIX);
    const migratedPrivateKey = await loadPrivateKey(userId);
    if (migratedPrivateKey) return { publicKeyJwk: unscopedPublicKey, privateKey: migratedPrivateKey };
  }

  return generateKeyPair(userId);
}

function privateStorageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}:${encodeURIComponent(userId)}`;
}

function publicStorageKey(userId: string) {
  return `${PUBLIC_KEY_STORAGE_PREFIX}:${encodeURIComponent(userId)}`;
}
