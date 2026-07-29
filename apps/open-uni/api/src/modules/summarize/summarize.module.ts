import { Module } from '@nestjs/common';
import { SummarizeService } from './summarize.service';

@Module({
  providers: [SummarizeService],
  exports: [SummarizeService],
})
export class SummarizeModule {}
