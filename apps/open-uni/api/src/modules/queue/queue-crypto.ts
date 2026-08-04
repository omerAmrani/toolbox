import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { QUEUE_ENCRYPTION_KEY } from '../../config';

// Encrypts job payloads before they go into a BullMQ job (Redis-backed), so
// Redis only ever holds ciphertext. Mirrors the AES-GCM pattern already used
// client-side in credentials.ts, but the key here lives server-side
// (QUEUE_ENCRYPTION_KEY) — this protects against a Redis-only compromise,
// not against the server itself being compromised.
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = Buffer.from(QUEUE_ENCRYPTION_KEY ?? '', 'base64');
  if (key.length !== 32) {
    throw new Error('QUEUE_ENCRYPTION_KEY must decode to exactly 32 bytes (base64) — regenerate with `openssl rand -base64 32`');
  }
  return key;
}

export function encryptForQueue(payload: unknown): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decryptFromQueue<T>(encrypted: string): T {
  const buf = Buffer.from(encrypted, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}
