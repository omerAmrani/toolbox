import { existsSync, readFileSync, rmSync } from 'fs';
import { nodewhisper } from 'nodejs-whisper';
import { WHISPER_MODEL } from '../../../config';

const silentLogger = { debug: () => {}, log: () => {}, error: () => {}, warn: () => {} };

let suppressCount = 0;
const realStdout = process.stdout.write.bind(process.stdout);
const realStderr = process.stderr.write.bind(process.stderr);

interface Segment { startSec: number; text: string }

function parseSrt(content: string): Segment[] {
  const blocks = content.trim().split(/\n\n+/);
  return blocks.flatMap(block => {
    const lines = block.split('\n');
    const timeMatch = lines[1]?.match(/(\d+):(\d+):(\d+),(\d+)/);
    if (!timeMatch) return [];
    const startSec = +timeMatch[1] * 3600 + +timeMatch[2] * 60 + +timeMatch[3];
    const text = lines.slice(2).join(' ').trim();
    return text ? [{ startSec, text }] : [];
  });
}

export async function transcribe(audioPath: string): Promise<{ text: string; segments: Segment[] }> {
  if (suppressCount === 0) {
    process.stdout.write = () => true;
    process.stderr.write = () => true;
  }
  suppressCount++;
  console.log = (...args: any[]) => realStdout(args.join(' ') + '\n');
  try {
    console.log(`  [whisper-cpp] starting nodewhisper for ${audioPath}`);
    await nodewhisper(audioPath, {
      modelName: WHISPER_MODEL,
      autoDownloadModelName: WHISPER_MODEL,
      removeWavFileAfterTranscription: false,
      whisperOptions: { outputInSrt: true, language: 'he' },
      logger: silentLogger,
    } as any);
    console.log(`  [whisper-cpp] nodewhisper resolved for ${audioPath}`);
  } finally {
    suppressCount--;
    if (suppressCount === 0) {
      process.stdout.write = realStdout;
      process.stderr.write = realStderr;
    }
  }

  const srtPath = `${audioPath}.srt`;
  console.log(`  [whisper-cpp] checking for output file: ${srtPath} (exists=${existsSync(srtPath)})`);

  if (existsSync(srtPath)) {
    const raw = readFileSync(srtPath, 'utf8');
    console.log(`  [whisper-cpp] read ${raw.length} chars from ${srtPath}`);
    rmSync(srtPath);
    const segments = parseSrt(raw);
    const text = segments.map(s => s.text).join(' ');
    return { text, segments };
  } else {
    throw new Error(`Transcription file not found at: ${srtPath}`);
  }
}
