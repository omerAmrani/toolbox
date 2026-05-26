import { whisper } from 'openai-whisper-js';
import { WHISPER_MODEL } from '../config.js';

export async function transcribe(audioPath) {
  return whisper.transcribe({ modelName: WHISPER_MODEL, audio: audioPath });
}
