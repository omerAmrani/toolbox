import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

interface ActiveJob {
  bus?: EventEmitter;
  controllers: Map<string, AbortController>;
}

@Injectable()
export class LecturesService {
  readonly activeJobs = new Map<string, ActiveJob>();
}
