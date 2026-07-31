import { Module } from '@nestjs/common';
import { ClassesController } from './classes.controller';
import { StorageModule } from '../storage/storage.module';
import { DetectModule } from '../detect/detect.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [StorageModule, DetectModule, AuthModule],
  controllers: [ClassesController],
})
export class ClassesModule {}
