import { SUMMARIZE_BACKEND } from './config';

const backends: Record<string, () => Promise<any>> = {
  gemini: () => import('./backends/summarize-gemini'),
  groq:   () => import('./backends/summarize-groq'),
  ollama: () => import('./backends/summarize-ollama'),
  claude: () => import('./backends/summarize-claude'),
};

export async function getSummarizer(backend?: string): Promise<any> {
  const load = backends[backend!] ?? backends[SUMMARIZE_BACKEND!] ?? backends.ollama;
  return load();
}

export function withAbort(promise: Promise<any>, signal?: AbortSignal): Promise<any> {
  if (!signal) return promise;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      if (signal.aborted) return reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true });
    }),
  ]);
}
