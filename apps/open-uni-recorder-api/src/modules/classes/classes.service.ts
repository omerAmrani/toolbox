import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

@Injectable()
export class ClassesService {
  readonly activeJobs = new Map<string, EventEmitter>();
  readonly activeAbortControllers = new Map<string, AbortController>();
}
