/**
 * Field-level encryption for PHI data stored in SQLite.
 * Uses AES-256-GCM via Node.js built-in crypto — no external dependencies.
 * Each encrypted value includes a random IV so identical plaintexts produce different ciphertexts.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recommended IV length
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a plaintext string. Returns a base64-encoded string containing IV + authTag + ciphertext.
 * The key must be a 64-char hex string (32 bytes).
 */
export function encrypt(plaintext: string, key: string): string {
  const keyBuffer = Buffer.from(key, 'hex');
  if (keyBuffer.length !== 32) {
    throw new Error('Encryption key must be 64 hex characters (32 bytes)');
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Pack: IV(12) + authTag(16) + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt a base64-encoded encrypted string. Returns the original plaintext.
 * Throws if the key is wrong or data is tampered.
 */
export function decrypt(ciphertext: string, key: string): string {
  const keyBuffer = Buffer.from(key, 'hex');
  if (keyBuffer.length !== 32) {
    throw new Error('Encryption key must be 64 hex characters (32 bytes)');
  }
  const packed = Buffer.from(ciphertext, 'base64');
  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Try to decrypt; if it fails (e.g., pre-encryption plaintext data), return the original string.
 * This provides graceful migration from unencrypted to encrypted data.
 */
export function decryptOrPassthrough(value: string, key: string): string {
  try {
    return decrypt(value, key);
  } catch {
    return value; // Assume it's unencrypted legacy data
  }
}
