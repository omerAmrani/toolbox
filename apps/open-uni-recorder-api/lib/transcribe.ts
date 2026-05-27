import { transcribe as transcribeCpp } from './backends/whisper-cpp';
import { transcribe as transcribeGroq } from './backends/whisper-groq';
import { WHISPER_MODEL, WHISPER_BACKEND } from './config';

const useGroq = WHISPER_BACKEND === 'groq-whisper' || WHISPER_BACKEND === 'openai-whisper-js';

export async function transcribe(audioPath: string, onProgress = (_: string) => {}): Promise<{ text: string; segments: any[] }> {
  if (useGroq) {
    onProgress('מתמלל עם Groq Whisper API...');
    console.log('🎙️   Transcribing with groq-whisper...');
    try {
      const result = await transcribeGroq(audioPath);
      const normalised = typeof result === 'string' ? { text: result, segments: [] } : result;
      console.log(`✅  Transcribed ${normalised.text.split(' ').length} words (${normalised.segments.length} segments)`);
      return normalised;
    } catch (err: any) {
      const isRateLimit = err?.status === 429 || err?.message?.includes('429');
      if (isRateLimit) {
        console.warn('[groq-whisper] Rate limit exhausted — falling back to local whisper-cpp...');
        onProgress(`Groq rate limit — מתמלל מקומית עם Whisper (${WHISPER_MODEL})...`);
      } else {
        throw err;
      }
    }
  } else {
    onProgress(`מתמלל עם Whisper (${WHISPER_MODEL}) — זה עשוי לקחת מספר דקות...`);
    console.log(`🎙️   Transcribing with ${WHISPER_BACKEND} (model: ${WHISPER_MODEL})...`);
  }

  const result = await transcribeCpp(audioPath);
  const normalised = typeof result === 'string' ? { text: result, segments: [] } : result;
  console.log(`✅  Transcribed ${normalised.text.split(' ').length} words (${normalised.segments.length} segments)`);
  return normalised;
}
