import { Module } from '@nestjs/common';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';
import { StorageModule } from '../storage/storage.module';
import { DetectModule } from '../detect/detect.module';
import { DownloadModule } from '../download/download.module';
import { SummarizeModule } from '../summarize/summarize.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [StorageModule, DetectModule, DownloadModule, SummarizeModule, EmailModule],
  controllers: [PipelineController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
