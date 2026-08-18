import { Module } from '@nestjs/common';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';
import { StorageModule } from '../storage/storage.module';
import { DetectModule } from '../detect/detect.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [StorageModule, DetectModule, AuthModule],
  controllers: [PipelineController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
