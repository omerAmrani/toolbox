import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ClassesModule } from './modules/classes/classes.module';
import { LecturesModule } from './modules/lectures/lectures.module';
import { PipelineModule } from './modules/pipeline/pipeline.module';
import { PipelineService } from './modules/pipeline/pipeline.service';
import { StorageModule } from './modules/storage/storage.module';
import { HealthModule } from './modules/health/health.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    StorageModule,
    ClassesModule,
    LecturesModule,
    PipelineModule,
    HealthModule,
    JobsModule,
  ],
  controllers: [AppController],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private readonly pipeline: PipelineService) {}

  onApplicationBootstrap() {
    this.pipeline.resetStuckProcessing();
  }
}
