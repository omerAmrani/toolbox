import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [JobsController],
})
export class JobsModule {}
