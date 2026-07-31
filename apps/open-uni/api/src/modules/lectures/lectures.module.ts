import { Module } from '@nestjs/common';
import { LecturesController } from './lectures.controller';
import { LecturesService } from './lectures.service';
import { StorageModule } from '../storage/storage.module';
import { DownloadModule } from '../download/download.module';
import { SummarizeModule } from '../summarize/summarize.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [StorageModule, DownloadModule, SummarizeModule, AuthModule],
  controllers: [LecturesController],
  providers: [LecturesService],
})
export class LecturesModule {}
