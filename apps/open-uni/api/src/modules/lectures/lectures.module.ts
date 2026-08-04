import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LecturesController } from './lectures.controller';
import { LecturesService } from './lectures.service';
import { TranscribeProcessor } from './transcribe.processor';
import { StorageModule } from '../storage/storage.module';
import { DownloadModule } from '../download/download.module';
import { SummarizeModule } from '../summarize/summarize.module';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { TRANSCRIBE_QUEUE } from '../queue/queue.constants';

@Module({
  imports: [
    StorageModule,
    DownloadModule,
    SummarizeModule,
    AuthModule,
    EmailModule,
    BullModule.registerQueue({ name: TRANSCRIBE_QUEUE }),
  ],
  controllers: [LecturesController],
  providers: [LecturesService, TranscribeProcessor],
})
export class LecturesModule {}
