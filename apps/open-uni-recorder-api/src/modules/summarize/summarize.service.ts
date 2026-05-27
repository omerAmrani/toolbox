import { Injectable } from '@nestjs/common';
import { SUMMARIZE_BACKEND } from '../../config';

export type ProgressCallback = (msg: string) => void;
export type TokenCallback = (token: string) => void;

export interface SummarizerBackend {
  mergeSummaries(chunks: string[], onProgress?: ProgressCallback, onToken?: TokenCallback | null): Promise<string>;
}

const backends: Record<string, () => Promise<SummarizerBackend>> = {
  gemini: () => import('./backends/summarize-gemini'),
  groq:   () => import('./backends/summarize-groq'),
  ollama: () => import('./backends/summarize-ollama'),
  claude: () => import('./backends/summarize-claude'),
};

@Injectable()
export class SummarizeService {
  async getSummarizer(backend?: string): Promise<SummarizerBackend> {
    const load = backends[backend!] ?? backends[SUMMARIZE_BACKEND!] ?? backends.ollama;
    return load();
  }

  withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        if (signal.aborted) return reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true });
      }),
    ]);
  }
}
