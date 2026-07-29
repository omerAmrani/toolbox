import { Module } from '@nestjs/common';
import { QaService } from './qa.service';

@Module({
  providers: [QaService],
  exports: [QaService],
})
export class QaModule {}
