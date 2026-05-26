import { SUMMARIZE_BACKEND } from './config.js';

const backends = {
  gemini: () => import('./backends/summarize-gemini.js'),
  groq:   () => import('./backends/summarize-groq.js'),
  ollama: () => import('./backends/summarize-ollama.js'),
  claude: () => import('./backends/summarize-claude.js'),
};

export async function getSummarizer(backend) {
  const load = backends[backend] ?? backends[SUMMARIZE_BACKEND] ?? backends.ollama;
  return load();
}

const { summarizeChunk, mergeSummaries } = await (backends[SUMMARIZE_BACKEND] ?? backends.ollama)();
export { summarizeChunk, mergeSummaries };

export function withAbort(promise, signal) {
  if (!signal) return promise;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      if (signal.aborted) return reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true });
    }),
  ]);
}
