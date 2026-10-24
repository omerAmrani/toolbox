'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from './api';

// Which keys the API has in its .env — booleans only, never the values
// (see GET /api/config/status, docs/adr/0002).
export interface ConfigStatus {
  localMode: boolean;
  opal: boolean;
  groq: boolean;
  gemini: boolean;
  claude: boolean;
}

const ENV_FILE = 'apps/open-uni/api/.env';

// null = everything this action needs is set; otherwise a hint for the user.
export function missingFor(status: ConfigStatus | null, action: 'transcribe' | 'summarize'): string | null {
  if (!status) return null;
  const missing: string[] = [];
  if (action === 'transcribe') {
    if (!status.opal) missing.push('OPENU_USERNAME / OPENU_PASSWORD / OPENU_ID');
    if (!status.groq) missing.push('GROQ_API_KEY');
  } else if (!status.gemini && !status.claude) {
    missing.push('GEMINI_API_KEY או ANTHROPIC_API_KEY');
  }
  return missing.length ? `חסר ב-${ENV_FILE}: ${missing.join(', ')}` : null;
}

export function useConfigStatus(): ConfigStatus | null {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  useEffect(() => {
    apiFetch('/api/config/status')
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => { /* leave null — actions stay enabled and the API reports what's missing */ });
  }, []);
  return status;
}
