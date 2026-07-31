import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class PipelineService {
  constructor(private readonly storage: StorageService) {}

  // Guards against mid-restart lectures stuck in a transient status —
  // runs once at boot (see AppModule.onApplicationBootstrap).
  resetStuckProcessing(): void {
    const revertTo: Record<string, string> = { transcribing: 'pending', summarizing: 'transcribed' };
    const knownStatuses = new Set(['pending', 'transcribing', 'transcribed', 'summarizing', 'summarized']);
    for (const cls of this.storage.getClasses()) {
      for (const lecture of this.storage.getLectures(cls.id)) {
        if (!knownStatuses.has(lecture.status)) {
          this.storage.updateLectureMeta(cls.id, lecture.id, {
            status: 'pending',
            lastError: `Unknown status: ${lecture.status}`,
            lastErrorAt: new Date().toISOString(),
          });
          console.log(`[pipeline] reset unknown-status lecture: ${cls.id}/${lecture.id} (${lecture.status})`);
          continue;
        }
        const reverted = revertTo[lecture.status];
        if (reverted) {
          this.storage.updateLectureMeta(cls.id, lecture.id, {
            status: reverted,
            lastError: 'Server restarted mid-job',
            lastErrorAt: new Date().toISOString(),
          });
          console.log(`[pipeline] reset stuck lecture: ${cls.id}/${lecture.id}`);
        }
      }
    }
  }
}
