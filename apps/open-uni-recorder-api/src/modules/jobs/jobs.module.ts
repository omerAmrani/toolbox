import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { PipelineModule } from '../pipeline/pipeline.module';

@Module({
  imports: [PipelineModule],
  providers: [JobsService],
})
export class JobsModule {}
