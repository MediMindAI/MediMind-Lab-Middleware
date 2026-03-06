/**
 * Tests for field-level encryption — AES-256-GCM encrypt/decrypt for PHI data.
 */

import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, decryptOrPassthrough } from './fieldEncryption.js';
import { randomBytes } from 'node:crypto';

/** A valid 32-byte (64 hex char) key for testing */
const TEST_KEY = randomBytes(32).toString('hex');

/** A different valid key for wrong-key tests */
const WRONG_KEY = randomBytes(32).toString('hex');

describe('fieldEncryption', () => {
  // --- encrypt + decrypt round-trip ---

  it('round-trip: encrypt then decrypt returns original text', () => {
    const plaintext = 'Patient: John Doe, WBC=7.5 x10^3/uL';
    const ciphertext = encrypt(plaintext, TEST_KEY);
    const decrypted = decrypt(ciphertext, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it('round-trip works with empty string', () => {
    const ciphertext = encrypt('', TEST_KEY);
    const decrypted = decrypt(ciphertext, TEST_KEY);
    expect(decrypted).toBe('');
  });

  it('round-trip works with unicode content', () => {
    const plaintext = 'პაციენტი: გიორგი, WBC=7.5';
    const ciphertext = encrypt(plaintext, TEST_KEY);
    const decrypted = decrypt(ciphertext, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });

  // --- Random IV ---

  it('produces different ciphertexts for same plaintext (random IV)', () => {
    const plaintext = 'Same text every time';
    const ct1 = encrypt(plaintext, TEST_KEY);
    const ct2 = encrypt(plaintext, TEST_KEY);
    expect(ct1).not.toBe(ct2);
    // But both decrypt to the same value
    expect(decrypt(ct1, TEST_KEY)).toBe(plaintext);
    expect(decrypt(ct2, TEST_KEY)).toBe(plaintext);
  });

  // --- Wrong key ---

  it('throws error when decrypting with wrong key', () => {
    const ciphertext = encrypt('secret data', TEST_KEY);
    expect(() => decrypt(ciphertext, WRONG_KEY)).toThrow();
  });

  // --- decryptOrPassthrough ---

  it('decryptOrPassthrough returns plaintext for non-encrypted strings', () => {
    const plaintext = 'H|\\^&||SysmexXN||||||LIS2-A2|P|1';
    const result = decryptOrPassthrough(plaintext, TEST_KEY);
    expect(result).toBe(plaintext);
  });

  it('decryptOrPassthrough decrypts valid encrypted strings', () => {
    const plaintext = 'sensitive data';
    const ciphertext = encrypt(plaintext, TEST_KEY);
    const result = decryptOrPassthrough(ciphertext, TEST_KEY);
    expect(result).toBe(plaintext);
  });

  // --- Invalid key length ---

  it('encrypt throws for key shorter than 32 bytes', () => {
    expect(() => encrypt('test', 'abcd1234')).toThrow('Encryption key must be 64 hex characters (32 bytes)');
  });

  it('decrypt throws for key shorter than 32 bytes', () => {
    expect(() => decrypt('dGVzdA==', 'abcd1234')).toThrow('Encryption key must be 64 hex characters (32 bytes)');
  });

  it('encrypt throws for key longer than 32 bytes', () => {
    const longKey = randomBytes(48).toString('hex'); // 96 hex chars = 48 bytes
    expect(() => encrypt('test', longKey)).toThrow('Encryption key must be 64 hex characters (32 bytes)');
  });
});
