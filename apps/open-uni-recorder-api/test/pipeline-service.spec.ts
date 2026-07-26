import { Test, TestingModule } from '@nestjs/testing';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { PipelineService } from '../src/modules/pipeline/pipeline.service';
import { StorageService } from '../src/modules/storage/storage.service';
import { DetectService } from '../src/modules/detect/detect.service';
import { DownloadService } from '../src/modules/download/download.service';
import { SummarizeService } from '../src/modules/summarize/summarize.service';
import { EmailService } from '../src/modules/email/email.service';
import { ClassesModule } from '../src/modules/classes/classes.module';
import { PipelineModule } from '../src/modules/pipeline/pipeline.module';
import { truncateAll, cleanClassesDir } from './helpers/db';

const mockDetect = { detectNewLectures: jest.fn() };
const mockDownload = {
  extractVideoUrl: jest.fn(),
  downloadAndTranscribe: jest.fn(),
};
const mockEmail = {
  sendLectureSummary: jest.fn(),
  sendDetectionNotification: jest.fn(),
};

let mockMergeSummaries: jest.Mock;
const mockSummarize = {
  getSummarizer: jest.fn(),
};

describe('PipelineService (direct)', () => {
  let service: PipelineService;
  let storage: StorageService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ClassesModule, PipelineModule],
    })
      .overrideProvider(DetectService).useValue(mockDetect)
      .overrideProvider(DownloadService).useValue(mockDownload)
      .overrideProvider(SummarizeService).useValue(mockSummarize)
      .overrideProvider(EmailService).useValue(mockEmail)
      .compile();

    service = module.get<PipelineService>(PipelineService);
    storage = module.get<StorageService>(StorageService);
  });

  afterAll(() => {
    cleanClassesDir();
  });

  beforeEach(() => {
    truncateAll();
    jest.clearAllMocks();

    mockDownload.extractVideoUrl.mockResolvedValue('https://example.com/video.mp4');
    mockDownload.downloadAndTranscribe.mockResolvedValue('Mock transcript content');
    mockMergeSummaries = jest.fn().mockResolvedValue('Mock summary');
    mockSummarize.getSummarizer.mockResolvedValue({ mergeSummaries: mockMergeSummaries });
    mockEmail.sendLectureSummary.mockResolvedValue(undefined);
    mockEmail.sendDetectionNotification.mockResolvedValue(undefined);
    mockDetect.detectNewLectures.mockResolvedValue([]);
  });

  // ── resetStuckProcessing ───────────────────────────────────────────────────

  describe('resetStuckProcessing()', () => {
    it('resets a stuck transcribing lecture to pending with lastError', () => {
      const cls = storage.createClass({ name: 'Test', semester: 'A', year: 2025 });
      const lec = storage.createLecture(cls.id, { name: 'L', url: 'https://example.com', status: 'pending' });
      storage.updateLectureMeta(cls.id, lec.id, { status: 'transcribing' });

      service.resetStuckProcessing();

      const updated = storage.getLecture(cls.id, lec.id);
      expect(updated.status).toBe('pending');
      expect(updated.lastError).toBe('Server restarted mid-job');
    });

    it('resets a stuck summarizing lecture to transcribed with lastError', () => {
      const cls = storage.createClass({ name: 'Test', semester: 'A', year: 2025 });
      const lec = storage.createLecture(cls.id, { name: 'L', url: 'https://example.com', status: 'pending' });
      storage.updateLectureMeta(cls.id, lec.id, { status: 'summarizing' });

      service.resetStuckProcessing();

      const updated = storage.getLecture(cls.id, lec.id);
      expect(updated.status).toBe('transcribed');
      expect(updated.lastError).toBe('Server restarted mid-job');
    });

    it('leaves pending, transcribed, and summarized lectures untouched', () => {
      const cls = storage.createClass({ name: 'Test', semester: 'A', year: 2025 });
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
      const cls = storage.createClass({ name: 'Test', semester: 'A', year: 2025 });
      const lec = storage.createLecture(cls.id, { name: 'L', url: 'https://example.com', status: 'pending' });
      storage.updateLectureMeta(cls.id, lec.id, { status: 'bogus-status' });

      service.resetStuckProcessing();

      const updated = storage.getLecture(cls.id, lec.id);
      expect(updated.status).toBe('pending');
      expect(updated.lastError).toBe('Unknown status: bogus-status');
    });

    it('handles multiple classes and resets only stuck in-flight ones', () => {
      const cls1 = storage.createClass({ name: 'A', semester: 'A', year: 2025 });
      const cls2 = storage.createClass({ name: 'B', semester: 'A', year: 2025 });
      const stuck = storage.createLecture(cls1.id, { name: 'Stuck', url: 'https://example.com', status: 'pending' });
      storage.updateLectureMeta(cls1.id, stuck.id, { status: 'transcribing' });
      const fine = storage.createLecture(cls2.id, { name: 'Fine', url: 'https://example.com', status: 'pending' });

      service.resetStuckProcessing();

      expect(storage.getLecture(cls1.id, stuck.id).status).toBe('pending');
      expect(storage.getLecture(cls2.id, fine.id).status).toBe('pending');
    });
  });

  // ── runQueue email dispatch ────────────────────────────────────────────────

  describe('runQueue() — email dispatch', () => {
    it('calls sendLectureSummary with correct args after successful summarize', async () => {
      const cls = storage.createClass({ name: 'My Class', semester: 'A', year: 2025 });
      storage.createLecture(cls.id, { name: 'My Lecture', url: 'https://example.com', status: 'pending' });

      await service.runQueue();

      expect(mockEmail.sendLectureSummary).toHaveBeenCalledTimes(1);
      expect(mockEmail.sendLectureSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          className: 'My Class',
          lectureName: 'My Lecture',
          summaryContent: 'Mock summary',
        }),
      );
    });

    it('marks lecture as summarized after successful run', async () => {
      const cls = storage.createClass({ name: 'C', semester: 'A', year: 2025 });
      const lec = storage.createLecture(cls.id, { name: 'L', url: 'https://example.com', status: 'pending' });

      await service.runQueue();

      expect(storage.getLecture(cls.id, lec.id).status).toBe('summarized');
    });

    it('reverts lecture to pending when download throws, resolves without throwing', async () => {
      const cls = storage.createClass({ name: 'C', semester: 'A', year: 2025 });
      const lec = storage.createLecture(cls.id, { name: 'L', url: 'https://example.com', status: 'pending' });
      mockDownload.extractVideoUrl.mockRejectedValueOnce(new Error('Download failed'));

      await expect(service.runQueue()).resolves.toBeUndefined();

      const updated = storage.getLecture(cls.id, lec.id);
      expect(updated.status).toBe('pending');
      expect(updated.lastError).toBe('Download failed');
      expect(mockEmail.sendLectureSummary).not.toHaveBeenCalled();
    });

    it('reverts lecture to transcribed when summarize throws', async () => {
      const cls = storage.createClass({ name: 'C', semester: 'A', year: 2025 });
      const lec = storage.createLecture(cls.id, { name: 'L', url: 'https://example.com', status: 'pending' });
      mockMergeSummaries.mockRejectedValueOnce(new Error('Summarize failed'));

      await expect(service.runQueue()).resolves.toBeUndefined();

      const updated = storage.getLecture(cls.id, lec.id);
      expect(updated.status).toBe('transcribed');
      expect(updated.lastError).toBe('Summarize failed');
      expect(mockEmail.sendLectureSummary).not.toHaveBeenCalled();
    });

    it('does not throw when sendLectureSummary rejects (fire-and-forget)', async () => {
      const cls = storage.createClass({ name: 'C', semester: 'A', year: 2025 });
      storage.createLecture(cls.id, { name: 'L', url: 'https://example.com', status: 'pending' });
      mockEmail.sendLectureSummary.mockRejectedValueOnce(new Error('SMTP error'));

      await expect(service.runQueue()).resolves.toBeUndefined();
    });

    it('deletes mp3 after successful transcription', async () => {
      const cls = storage.createClass({ name: 'C', semester: 'A', year: 2025 });
      const lec = storage.createLecture(cls.id, { name: 'L', url: 'https://example.com', status: 'pending' });
      const mp3Path = path.join(storage.lectureDirPath(cls.id, lec.id), 'audio.mp3');
      mkdirSync(path.dirname(mp3Path), { recursive: true });
      writeFileSync(mp3Path, 'fake audio');

      await service.runQueue();

      expect(existsSync(mp3Path)).toBe(false);
    });

    it('does not delete mp3 when transcript is empty (lecture fails, mp3 survives for retry)', async () => {
      const cls = storage.createClass({ name: 'C', semester: 'A', year: 2025 });
      const lec = storage.createLecture(cls.id, { name: 'L', url: 'https://example.com', status: 'pending' });
      const mp3Path = path.join(storage.lectureDirPath(cls.id, lec.id), 'audio.mp3');
      mkdirSync(path.dirname(mp3Path), { recursive: true });
      writeFileSync(mp3Path, 'fake audio');
      mockDownload.downloadAndTranscribe.mockResolvedValueOnce('   ');

      await service.runQueue();

      expect(storage.getLecture(cls.id, lec.id).status).toBe('pending');
      expect(existsSync(mp3Path)).toBe(true);
    });

    it('skips non-pending lectures', async () => {
      const cls = storage.createClass({ name: 'C', semester: 'A', year: 2025 });
      storage.createLecture(cls.id, { name: 'Transcribed', url: 'https://example.com', status: 'transcribed' });
      storage.createLecture(cls.id, { name: 'Summarized', url: 'https://example.com', status: 'summarized' });

      await service.runQueue();

      expect(mockDownload.extractVideoUrl).not.toHaveBeenCalled();
      expect(mockEmail.sendLectureSummary).not.toHaveBeenCalled();
    });
  });

  // ── runFullPipeline email dispatch ────────────────────────────────────────

  describe('runFullPipeline() — email dispatch', () => {
    it('calls sendDetectionNotification when new lectures are detected', async () => {
      const cls = storage.createClass({ name: 'OPAL Class', semester: 'A', year: 2025 });
      storage.updateClassMeta(cls.id, { opalCourseUrl: 'https://opal.example.com/1' });
      mockDetect.detectNewLectures.mockResolvedValueOnce([
        { name: 'New Lecture', url: 'https://example.com/new', lectureDate: '2025-01-01' },
      ]);

      await service.runFullPipeline();

      expect(mockEmail.sendDetectionNotification).toHaveBeenCalledTimes(1);
      expect(mockEmail.sendDetectionNotification).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ className: 'OPAL Class', lectureName: 'New Lecture' }),
        ]),
      );
    });

    it('does not call sendDetectionNotification when no new lectures found', async () => {
      const cls = storage.createClass({ name: 'OPAL Class', semester: 'A', year: 2025 });
      storage.updateClassMeta(cls.id, { opalCourseUrl: 'https://opal.example.com/1' });
      mockDetect.detectNewLectures.mockResolvedValueOnce([]);

      await service.runFullPipeline();

      expect(mockEmail.sendDetectionNotification).not.toHaveBeenCalled();
    });

    it('skips classes without opalCourseUrl', async () => {
      storage.createClass({ name: 'No URL', semester: 'A', year: 2025 });

      await service.runFullPipeline();

      expect(mockDetect.detectNewLectures).not.toHaveBeenCalled();
    });

    it('does not throw when sendDetectionNotification rejects (fire-and-forget)', async () => {
      const cls = storage.createClass({ name: 'OPAL Class', semester: 'A', year: 2025 });
      storage.updateClassMeta(cls.id, { opalCourseUrl: 'https://opal.example.com/1' });
      mockDetect.detectNewLectures.mockResolvedValueOnce([
        { name: 'L', url: 'https://example.com', lectureDate: '2025-01-01' },
      ]);
      mockEmail.sendDetectionNotification.mockRejectedValueOnce(new Error('SMTP error'));

      await expect(service.runFullPipeline()).resolves.not.toThrow();
    });

    it('continues to next class when detect throws for one class', async () => {
      const cls1 = storage.createClass({ name: 'Error Class', semester: 'A', year: 2025 });
      storage.updateClassMeta(cls1.id, { opalCourseUrl: 'https://opal.example.com/1' });
      const cls2 = storage.createClass({ name: 'OK Class', semester: 'A', year: 2025 });
      storage.updateClassMeta(cls2.id, { opalCourseUrl: 'https://opal.example.com/2' });

      mockDetect.detectNewLectures
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce([]);

      const result = await service.runFullPipeline();

      expect(result).toEqual({ found: 0, queued: 0 });
      expect(mockDetect.detectNewLectures).toHaveBeenCalledTimes(2);
    });
  });
});
