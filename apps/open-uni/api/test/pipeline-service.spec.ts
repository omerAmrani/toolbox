import { Test, TestingModule } from '@nestjs/testing';
import { PipelineService } from '../src/modules/pipeline/pipeline.service';
import { StorageService } from '../src/modules/storage/storage.service';
import { ClassesModule } from '../src/modules/classes/classes.module';
import { PipelineModule } from '../src/modules/pipeline/pipeline.module';
import { truncateAll, cleanClassesDir } from './helpers/db';

describe('PipelineService (direct)', () => {
  let service: PipelineService;
  let storage: StorageService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ClassesModule, PipelineModule],
    }).compile();

    service = module.get<PipelineService>(PipelineService);
    storage = module.get<StorageService>(StorageService);
  });

  afterAll(() => {
    cleanClassesDir();
  });

  beforeEach(() => {
    truncateAll();
  });

  describe('resetStuckProcessing()', () => {
    it('resets a stuck transcribing lecture to pending with lastError', () => {
      const cls = storage.createClass({ name: 'Test', semester: 'A', year: 2025 }, 'test-user');
      const lec = storage.createLecture(cls.id, { name: 'L', url: 'https://example.com', status: 'pending' });
      storage.updateLectureMeta(cls.id, lec.id, { status: 'transcribing' });

      service.resetStuckProcessing();

      const updated = storage.getLecture(cls.id, lec.id);
      expect(updated.status).toBe('pending');
      expect(updated.lastError).toBe('Server restarted mid-job');
    });

    it('resets a stuck summarizing lecture to transcribed with lastError', () => {
      const cls = storage.createClass({ name: 'Test', semester: 'A', year: 2025 }, 'test-user');
      const lec = storage.createLecture(cls.id, { name: 'L', url: 'https://example.com', status: 'pending' });
      storage.updateLectureMeta(cls.id, lec.id, { status: 'summarizing' });

      service.resetStuckProcessing();

      const updated = storage.getLecture(cls.id, lec.id);
      expect(updated.status).toBe('transcribed');
      expect(updated.lastError).toBe('Server restarted mid-job');
    });

    it('leaves pending, transcribed, and summarized lectures untouched', () => {
      const cls = storage.createClass({ name: 'Test', semester: 'A', year: 2025 }, 'test-user');
      const statuses = ['pending', 'transcribed', 'summarized'];
      for (const status of statuses) {
        storage.createLecture(cls.id, { name: `L-${status}`, url: 'https://example.com', status });
      }

      service.resetStuckProcessing();

      for (const lec of storage.getLectures(cls.id)) {
        expect(statuses).toContain(lec.status);
      }
    });

    it('resets a lecture with an unknown status to pending with lastError', () => {
      const cls = storage.createClass({ name: 'Test', semester: 'A', year: 2025 }, 'test-user');
      const lec = storage.createLecture(cls.id, { name: 'L', url: 'https://example.com', status: 'pending' });
      storage.updateLectureMeta(cls.id, lec.id, { status: 'bogus-status' });

      service.resetStuckProcessing();

      const updated = storage.getLecture(cls.id, lec.id);
      expect(updated.status).toBe('pending');
      expect(updated.lastError).toBe('Unknown status: bogus-status');
    });

    it('handles multiple classes and resets only stuck in-flight ones', () => {
      const cls1 = storage.createClass({ name: 'A', semester: 'A', year: 2025 }, 'test-user');
      const cls2 = storage.createClass({ name: 'B', semester: 'A', year: 2025 }, 'test-user');
      const stuck = storage.createLecture(cls1.id, { name: 'Stuck', url: 'https://example.com', status: 'pending' });
      storage.updateLectureMeta(cls1.id, stuck.id, { status: 'transcribing' });
      const fine = storage.createLecture(cls2.id, { name: 'Fine', url: 'https://example.com', status: 'pending' });

      service.resetStuckProcessing();

      expect(storage.getLecture(cls1.id, stuck.id).status).toBe('pending');
      expect(storage.getLecture(cls2.id, fine.id).status).toBe('pending');
    });
  });
});
