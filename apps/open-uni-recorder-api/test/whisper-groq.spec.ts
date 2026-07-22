const mockCreate = jest.fn();

jest.mock('groq-sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    audio: { transcriptions: { create: mockCreate } },
  })),
}));

import { writeFileSync, rmSync, existsSync } from 'fs';
import path from 'path';
import { transcribe } from '../src/modules/whisper/backends/whisper-groq';
import { TMP_DIR } from '../src/config';

describe('whisper-groq transcribe', () => {
  const audioPath = path.join(TMP_DIR, 'whisper-groq-test.wav');

  beforeEach(() => {
    mockCreate.mockReset();
    writeFileSync(audioPath, 'fake audio');
  });

  afterEach(() => {
    if (existsSync(audioPath)) rmSync(audioPath);
  });

  it('fails fast with a clear message on an expired/invalid API key (401), without retrying', async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }));

    await expect(transcribe(audioPath)).rejects.toThrow(
      'Groq API key invalid or expired — check GROQ_API_KEY in .env',
    );
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
