import {
  OPENU_USERNAME, OPENU_PASSWORD, OPENU_ID, GROQ_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY, SUMMARIZE_BACKEND, IS_LOCAL_MODE,
} from './config';

// Credentials come from the API's .env (local mode, see docs/adr/0002) and are
// only ever held in memory for the life of a job. Each feature checks only
// the keys it actually needs, so the app boots with none set.
export interface OpalCredentials {
  username: string;
  password: string;
  id: string;
}

export type SummarizeBackendName = 'gemini' | 'claude';

export const MISSING_CREDENTIALS = {
  opal: 'OPENU_USERNAME / OPENU_PASSWORD / OPENU_ID missing — set them in apps/open-uni/api/.env',
  groq: 'GROQ_API_KEY missing — set it in apps/open-uni/api/.env',
  summarize: 'GEMINI_API_KEY or ANTHROPIC_API_KEY missing — set one in apps/open-uni/api/.env',
};

export function getOpalCredentials(): OpalCredentials | null {
  if (!OPENU_USERNAME || !OPENU_PASSWORD || !OPENU_ID) return null;
  return { username: OPENU_USERNAME, password: OPENU_PASSWORD, id: OPENU_ID };
}

export function getGroqApiKey(): string | null {
  return GROQ_API_KEY || null;
}

function summarizeKey(backend: SummarizeBackendName): string | undefined {
  return backend === 'claude' ? ANTHROPIC_API_KEY : GEMINI_API_KEY;
}

// First backend that has a key: the one the client asked for, then
// SUMMARIZE_BACKEND, then whichever of gemini/claude is configured.
export function getSummarizeBackend(requested?: string): { backend: SummarizeBackendName; apiKey: string } | null {
  for (const name of [requested, SUMMARIZE_BACKEND, 'gemini', 'claude']) {
    if (name !== 'gemini' && name !== 'claude') continue;
    const apiKey = summarizeKey(name);
    if (apiKey) return { backend: name, apiKey };
  }
  return null;
}

// Booleans only — never expose the values themselves.
export function getCredentialsStatus() {
  return {
    localMode: IS_LOCAL_MODE,
    opal: !!getOpalCredentials(),
    groq: !!getGroqApiKey(),
    gemini: !!GEMINI_API_KEY,
    claude: !!ANTHROPIC_API_KEY,
  };
}
