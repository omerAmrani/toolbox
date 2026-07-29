import { Module } from '@nestjs/common';
import { DetectService } from './detect.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [DetectService],
  exports: [DetectService],
})
export class DetectModule {}
