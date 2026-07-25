import { Module } from '@nestjs/common';
import { ClassesController } from './classes.controller';
import { StorageModule } from '../storage/storage.module';
import { DetectModule } from '../detect/detect.module';

@Module({
  imports: [StorageModule, DetectModule],
  controllers: [ClassesController],
})
export class ClassesModule {}
