import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { PipelineModule } from '../pipeline/pipeline.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PipelineModule, StorageModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
