import { whisper } from 'openai-whisper-js';
import { WHISPER_MODEL } from '../config';

export async function transcribe(audioPath: string): Promise<any> {
  return whisper.transcribe({ modelName: WHISPER_MODEL as any, audio: audioPath });
}
