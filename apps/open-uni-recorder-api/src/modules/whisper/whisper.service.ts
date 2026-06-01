import { Injectable } from '@nestjs/common';
import { transcribe as transcribeGroq } from './backends/whisper-groq';

@Injectable()
export class WhisperService {
  async transcribe(audioPath: string, onProgress = (_: string) => {}): Promise<{ text: string; segments: any[] }> {
    onProgress('מתמלל עם Groq Whisper API...');
    console.log('🎙️   Transcribing with groq-whisper...');
    const result = await transcribeGroq(audioPath);
    const normalised = typeof result === 'string' ? { text: result, segments: [] } : result;
    console.log(`✅  Transcribed ${normalised.text.split(' ').length} words (${normalised.segments.length} segments)`);
    return normalised;
  }
}
