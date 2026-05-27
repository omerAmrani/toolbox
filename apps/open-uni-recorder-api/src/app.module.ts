import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ClassesModule } from './modules/classes/classes.module';
import { HealthModule } from './modules/health/health.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { AppController } from './app.controller';
import { resetStuckProcessing } from '../lib/pipeline';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ClassesModule,
    HealthModule,
    JobsModule,
  ],
  controllers: [AppController],
})
export class AppModule implements OnApplicationBootstrap {
  onApplicationBootstrap() {
    resetStuckProcessing();
  }
}
