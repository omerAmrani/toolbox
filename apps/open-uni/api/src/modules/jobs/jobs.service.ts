import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PipelineService } from '../pipeline/pipeline.service';
import { StorageService, CronSchedule } from '../storage/storage.service';

const JOB_NAME = 'lecture-pipeline-cron';
const TIMEZONE = 'Asia/Jerusalem';

@Injectable()
export class JobsService implements OnModuleInit {
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly pipeline: PipelineService,
    private readonly storage: StorageService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    this.registerJob(this.storage.getCronSchedule());
  }

  private toCronExpression({ days, hour, minute }: CronSchedule): string {
    return `${minute} ${hour} * * ${days.join(',')}`;
  }

  private registerJob(schedule: CronSchedule): void {
    if (this.scheduler.doesExist('cron', JOB_NAME)) this.scheduler.deleteCronJob(JOB_NAME);
    const job = new CronJob(this.toCronExpression(schedule), () => { void this.cronRun('cron'); }, null, false, TIMEZONE);
    this.scheduler.addCronJob(JOB_NAME, job);
    job.start();
  }

  updateSchedule(schedule: CronSchedule): void {
    this.storage.setCronSchedule(schedule);
    this.registerJob(schedule);
  }

  getSchedule(): { schedule: CronSchedule; nextRun: string | null } {
    const job = this.scheduler.getCronJob(JOB_NAME);
    const nextRun = job.running ? job.nextDate().toJSDate().toISOString() : null;
    return { schedule: this.storage.getCronSchedule(), nextRun };
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
    const { found, queued } = await this.pipeline.runFullPipeline((msg) => console.log('[cron]', msg));
    this.pipeline.logCronRun({ trigger, found, queued });

    if (found === 0) {
      this.retryTimer = setInterval(async () => {
        const hour = new Date().getHours();
        if (hour >= 18) { this.clearRetry(); return; }
        console.log('[cron] retry — nothing found earlier, checking again');
        const result = await this.pipeline.runFullPipeline((msg) => console.log('[cron retry]', msg));
        this.pipeline.logCronRun({ trigger: 'retry', found: result.found, queued: result.queued });
        if (result.found > 0) this.clearRetry();
      }, 30 * 60 * 1000);
    }
  }
}
