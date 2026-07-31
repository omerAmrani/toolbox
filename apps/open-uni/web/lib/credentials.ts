// Client-side credential store (OPAL login + AI API keys).
// Non-secret fields (username/ID) live in plain localStorage — no reason to
// encrypt what isn't a secret. Secret fields (password, API keys) live in an
// AES-GCM encrypted blob; plaintext only ever exists in memory for this tab's
// session (cleared on reload) and in request bodies sent straight to the API
// for the duration of one job — never persisted server-side.

export interface StoredCredentials {
  opalUsername: string;
  opalId: string;
  opalPassword: string;
  groqApiKey: string;
  geminiApiKey: string;
  anthropicApiKey: string;
}

type PlainFields = Pick<StoredCredentials, 'opalUsername' | 'opalId'>;
type SecretFields = Pick<StoredCredentials, 'opalPassword' | 'groqApiKey' | 'geminiApiKey' | 'anthropicApiKey'>;
export type SecretKey = keyof SecretFields;

const SECRET_KEYS: SecretKey[] = ['opalPassword', 'groqApiKey', 'geminiApiKey', 'anthropicApiKey'];
const EMPTY_PLAIN: PlainFields = { opalUsername: '', opalId: '' };
const EMPTY_FLAGS: Record<SecretKey, boolean> = {
  opalPassword: false, groqApiKey: false, geminiApiKey: false, anthropicApiKey: false,
};

const PLAIN_STORAGE_KEY = 'our:credentials:plain:v1';
const SECRET_STORAGE_KEY = 'our:credentials:v1'; // pre-existing key; now holds only the secret fields
const FLAGS_STORAGE_KEY = 'our:credentials:flags:v1';
const PBKDF2_ITERATIONS = 250_000;

let unlocked: StoredCredentials | null = null;

function toB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function getPlainFields(): PlainFields {
  if (typeof window === 'undefined') return EMPTY_PLAIN;
  const raw = localStorage.getItem(PLAIN_STORAGE_KEY);
  return raw ? JSON.parse(raw) : EMPTY_PLAIN;
}

function savePlainFields(fields: PlainFields): void {
  localStorage.setItem(PLAIN_STORAGE_KEY, JSON.stringify(fields));
}

// Lets the UI show a "already set" indicator for password/API-key fields
// without ever decrypting them.
export function getSecretFlags(): Record<SecretKey, boolean> {
  if (typeof window === 'undefined') return EMPTY_FLAGS;
  const raw = localStorage.getItem(FLAGS_STORAGE_KEY);
  return raw ? JSON.parse(raw) : EMPTY_FLAGS;
}

function saveSecretFlags(secrets: SecretFields): void {
  const flags = Object.fromEntries(SECRET_KEYS.map((k) => [k, !!secrets[k]])) as Record<SecretKey, boolean>;
  localStorage.setItem(FLAGS_STORAGE_KEY, JSON.stringify(flags));
}

export function hasStoredCredentials(): boolean {
  return typeof window !== 'undefined' &&
    (!!localStorage.getItem(SECRET_STORAGE_KEY) || !!localStorage.getItem(PLAIN_STORAGE_KEY));
}

export function getUnlocked(): StoredCredentials | null {
  return unlocked;
}

export function lock(): void {
  unlocked = null;
}

export function clearStoredCredentials(): void {
  localStorage.removeItem(SECRET_STORAGE_KEY);
  localStorage.removeItem(PLAIN_STORAGE_KEY);
  localStorage.removeItem(FLAGS_STORAGE_KEY);
  unlocked = null;
}

export async function saveCredentials(passphrase: string, creds: StoredCredentials): Promise<void> {
  savePlainFields({ opalUsername: creds.opalUsername, opalId: creds.opalId });

  const secrets: SecretFields = {
    opalPassword: creds.opalPassword,
    groqApiKey: creds.groqApiKey,
    geminiApiKey: creds.geminiApiKey,
    anthropicApiKey: creds.anthropicApiKey,
  };
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(JSON.stringify(secrets)));
  localStorage.setItem(SECRET_STORAGE_KEY, JSON.stringify({ salt: toB64(salt.buffer as ArrayBuffer), iv: toB64(iv.buffer as ArrayBuffer), ciphertext: toB64(ciphertext) }));
  saveSecretFlags(secrets);
  unlocked = creds;
}

export async function unlockCredentials(passphrase: string): Promise<StoredCredentials> {
  const raw = localStorage.getItem(SECRET_STORAGE_KEY);
  if (!raw) throw new Error('No saved credentials — set them in Settings first');
  const { salt, iv, ciphertext } = JSON.parse(raw) as { salt: string; iv: string; ciphertext: string };
  const key = await deriveKey(passphrase, fromB64(salt));
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv).buffer as ArrayBuffer }, key, fromB64(ciphertext).buffer as ArrayBuffer);
    // Older saves encrypted username/ID alongside the secrets — decoded here as
    // optional extras so pre-migration blobs still parse.
    const decoded = JSON.parse(new TextDecoder().decode(plaintext)) as SecretFields & Partial<PlainFields>;

    let plain = getPlainFields();
    // ponytail: one-time migration for pre-existing blobs — if the plain-storage
    // copy is still empty and this decrypt turned up a username/ID, adopt them.
    if (!plain.opalUsername && !plain.opalId && (decoded.opalUsername || decoded.opalId)) {
      plain = { opalUsername: decoded.opalUsername || '', opalId: decoded.opalId || '' };
      savePlainFields(plain);
    }

    const creds: StoredCredentials = {
      ...plain,
      opalPassword: decoded.opalPassword,
      groqApiKey: decoded.groqApiKey,
      geminiApiKey: decoded.geminiApiKey,
      anthropicApiKey: decoded.anthropicApiKey,
    };
    unlocked = creds;
    return creds;
  } catch {
    throw new Error('Wrong passphrase');
  }
}

// Returns the unlocked credentials, prompting for the passphrase if locked.
// ponytail: native prompt() for the passphrase — a proper modal can replace
// this later without touching callers, they only depend on this function.
export async function requireCredentials(): Promise<StoredCredentials> {
  if (unlocked) return unlocked;
  if (!hasStoredCredentials()) throw new Error('אין פרטי גישה שמורים — הגדירו אותם בהגדרות');
  const passphrase = window.prompt('הזינו סיסמת הצפנה כדי לפתוח את פרטי הגישה השמורים:');
  if (!passphrase) throw new Error('בוטל');
  return unlockCredentials(passphrase);
}
