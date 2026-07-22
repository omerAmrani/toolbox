import { writeFileSync, rmSync, existsSync } from 'fs';
import path from 'path';
import { DownloadService } from '../src/modules/download/download.service';
import { TMP_DIR } from '../src/config';

describe('DownloadService transcribe queue', () => {
  const segPath = (i: number) => path.join(TMP_DIR, `chunk_${String(i).padStart(3, '0')}.wav`);

  afterEach(() => {
    for (let i = 0; i < 3; i++) if (existsSync(segPath(i))) rmSync(segPath(i));
  });

  it('does not deadlock when an early segment fails while later segments are still queued', async () => {
    for (let i = 0; i < 3; i++) writeFileSync(segPath(i), 'fake audio');

    const mockWhisper = {
      transcribe: jest.fn().mockImplementation((filePath: string) => {
        if (filePath.includes('chunk_000')) return Promise.reject(new Error('transcription failed'));
        return new Promise((resolve) => setTimeout(() => resolve({ text: 'ok', segments: [] }), 50));
      }),
    };
    const service = new DownloadService(mockWhisper as any);
    const queue = (service as any).runTranscribeQueue(() => {});

    // Enqueue 3 segments back-to-back so the 3rd is still in `pending` when
    // segment 0 fails (concurrency is 2 by default — see WHISPER_CONCURRENCY).
    queue.enqueue(0);
    queue.enqueue(1);
    queue.enqueue(2);

    await expect(queue.waitAll()).rejects.toThrow('transcription failed');
  });
});
