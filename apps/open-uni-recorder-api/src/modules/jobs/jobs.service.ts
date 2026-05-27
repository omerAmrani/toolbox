import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runFullPipeline, logCronRun } from '../../../lib/pipeline';

@Injectable()
export class JobsService {
  private retryTimer: NodeJS.Timeout | null = null;

  @Cron('0 10 * * 4,5', { timeZone: 'Asia/Jerusalem' })
  async handleCron(): Promise<void> {
    await this.cronRun('cron');
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  async cronRun(trigger = 'cron'): Promise<void> {
    this.clearRetry();
    console.log(`[cron] running (${trigger})`);
    const { found, queued } = await runFullPipeline((msg) => console.log('[cron]', msg));
    logCronRun({ trigger, found, queued });

    if (found === 0) {
      this.retryTimer = setInterval(async () => {
        const hour = new Date().getHours();
        if (hour >= 18) { this.clearRetry(); return; }
        console.log('[cron] retry — nothing found earlier, checking again');
        const result = await runFullPipeline((msg) => console.log('[cron retry]', msg));
        logCronRun({ trigger: 'retry', found: result.found, queued: result.queued });
        if (result.found > 0) this.clearRetry();
      }, 30 * 60 * 1000);
    }
  }
}
