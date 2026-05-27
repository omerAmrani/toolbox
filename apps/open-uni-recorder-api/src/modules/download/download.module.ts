import { Module } from '@nestjs/common';
import { DownloadService } from './download.service';
import { WhisperModule } from '../whisper/whisper.module';

@Module({
  imports: [WhisperModule],
  providers: [DownloadService],
  exports: [DownloadService],
})
export class DownloadModule {}
