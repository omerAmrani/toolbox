import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, readdirSync } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import db, { CLASSES_DIR } from './db';

export { CLASSES_DIR };

// ── App settings ──────────────────────────────────────────────────────────────
function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
}

export function getNotifyEmail(): string | null {
  return getSetting('notifyEmail');
}

export function setNotifyEmail(email: string): void {
  setSetting('notifyEmail', email);
}

export function getNotifyEmailEnabled(): boolean {
  return getSetting('notifyEmailEnabled') === '1';
}

export function setNotifyEmailEnabled(enabled: boolean): void {
  setSetting('notifyEmailEnabled', enabled ? '1' : '0');
}

export interface ActiveSemester { semester: string; year: number }

export function getActiveSemester(): ActiveSemester | null {
  const raw = getSetting('activeSemester');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function setActiveSemester(active: ActiveSemester): void {
  setSetting('activeSemester', JSON.stringify(active));
}

function makeId(name: string): string {
  const clean = name.toLowerCase()
    .replace(/[^\w]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
  return `${clean || 'item'}-${Date.now()}`;
}

function writeMetaBackup(filePath: string, data: any): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function lectureWithSummaries(row: any): any {
  if (!row) return null;
  const summaries = db.prepare(
    'SELECT id, date, backend FROM summaries WHERE lectureId = ? ORDER BY id DESC'
  ).all(row.id);
  return { ...row, summaries };
}

// ── Classes ───────────────────────────────────────────────────────────────────
export function createClass({ name, semester, year, code, opalCourseUrl }: { name: string; semester?: string; year?: number; code?: string; opalCourseUrl?: string }, userId: string): any {
  const id = makeId(name);
  const dir = path.join(CLASSES_DIR, id);
  mkdirSync(path.join(dir, 'lectures'), { recursive: true });
  const meta = { id, userId, name, semester, year: year ? Number(year) : null, createdAt: new Date().toISOString(), code: code || null, opalCourseUrl: opalCourseUrl || null };
  db.prepare('INSERT INTO classes (id, userId, name, semester, year, createdAt, code, opalCourseUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(meta.id, meta.userId, meta.name, meta.semester, meta.year, meta.createdAt, meta.code, meta.opalCourseUrl);
  writeMetaBackup(path.join(dir, 'meta.json'), meta);
  return meta;
}

// userId omitted → all classes across all owners. Only for internal/cron use
// (pipeline, detect) which isn't scoped to one browser. Controllers serving a
// browser request must always pass userId.
export function getClasses(userId?: string): any[] {
  if (userId) return db.prepare('SELECT * FROM classes WHERE userId = ? ORDER BY createdAt DESC').all(userId);
  return db.prepare('SELECT * FROM classes ORDER BY createdAt DESC').all();
}

// Unscoped lookup by id — for internal/cron use only (see getClasses above).
export function getClass(classId: string): any {
  return db.prepare('SELECT * FROM classes WHERE id = ?').get(classId) || null;
}

// Ownership-checked lookup — controllers use this to gate any class/lecture
// access. Returns null both when the class doesn't exist and when it belongs
// to someone else, so a mismatched device id behaves like "not found."
export function getClassForUser(classId: string, userId: string): any {
  return db.prepare('SELECT * FROM classes WHERE id = ? AND userId = ?').get(classId, userId) || null;
}

export function updateClassMeta(classId: string, updates: Record<string, any>): any {
  const cls = getClass(classId);
  if (!cls) return null;
  const updated = { ...cls, ...updates };
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE classes SET ${fields} WHERE id = ?`).run(...Object.values(updates), classId);
  writeMetaBackup(path.join(CLASSES_DIR, classId, 'meta.json'), updated);
  return updated;
}

export function deleteClass(classId: string): boolean {
  if (!getClass(classId)) return false;
  db.prepare('DELETE FROM summaries WHERE lectureId IN (SELECT id FROM lectures WHERE classId = ?)').run(classId);
  db.prepare('DELETE FROM lectures WHERE classId = ?').run(classId);
  db.prepare('DELETE FROM classes WHERE id = ?').run(classId);
  const dir = path.join(CLASSES_DIR, classId);
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  return true;
}

// ── Lectures ──────────────────────────────────────────────────────────────────
export function createLecture(classId: string, { name, url, lectureDate, status = 'pending' }: { name: string; url: string; lectureDate?: string | null; status?: string }): any {
  const id = makeId(name);
  const dir = path.join(CLASSES_DIR, classId, 'lectures', id);
  mkdirSync(dir, { recursive: true });
  const meta = {
    id, classId, name, url,
    lectureDate: lectureDate || null,
    addedAt: new Date().toISOString(),
    summarizedAt: null,
    whisperModel: null,
    whisperBackend: null,
    summarizeModel: null,
    summarizeBackend: null,
    status,
    currentSummary: null,
    lastError: null,
    lastErrorAt: null,
    startedAt: null,
  };
  db.prepare(
    'INSERT INTO lectures (id, classId, name, url, lectureDate, addedAt, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(meta.id, meta.classId, meta.name, meta.url, meta.lectureDate, meta.addedAt, meta.status);
  writeMetaBackup(path.join(dir, 'meta.json'), { ...meta, summaries: [] });
  return { ...meta, summaries: [] };
}

export function getLectures(classId: string): any[] {
  const rows = db.prepare(
    'SELECT * FROM lectures WHERE classId = ? ORDER BY COALESCE(lectureDate, addedAt) ASC'
  ).all(classId);
  return rows.map(lectureWithSummaries);
}

export function getLecture(classId: string, lectureId: string): any {
  const row = db.prepare('SELECT * FROM lectures WHERE id = ? AND classId = ?').get(lectureId, classId);
  return lectureWithSummaries(row);
}

export function updateLectureMeta(classId: string, lectureId: string, updates: Record<string, any>): any {
  const lecture = getLecture(classId, lectureId);
  if (!lecture) return null;
  const updated = { ...lecture, ...updates };
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE lectures SET ${fields} WHERE id = ?`).run(...Object.values(updates), lectureId);
  const dir = path.join(CLASSES_DIR, classId, 'lectures', lectureId);
  writeMetaBackup(path.join(dir, 'meta.json'), updated);
  return updated;
}

export function lectureDirPath(classId: string, lectureId: string): string {
  return path.join(CLASSES_DIR, classId, 'lectures', lectureId);
}

export function summariesDirPath(classId: string, lectureId: string): string {
  return path.join(CLASSES_DIR, classId, 'lectures', lectureId, 'summaries');
}

// ── Summary versions ──────────────────────────────────────────────────────────
export function saveSummaryVersion(classId: string, lectureId: string, content: string, backend: string, model?: string): string {
  const summariesDir = summariesDirPath(classId, lectureId);
  mkdirSync(summariesDir, { recursive: true });
  const id = String(Date.now());
  writeFileSync(path.join(summariesDir, `${id}.md`), content);
  db.prepare('INSERT INTO summaries (id, lectureId, date, backend, model) VALUES (?, ?, ?, ?, ?)')
    .run(id, lectureId, new Date().toISOString(), backend, model ?? null);
  db.prepare('UPDATE lectures SET currentSummary = ? WHERE id = ?').run(id, lectureId);
  const updated = getLecture(classId, lectureId);
  if (updated) {
    writeMetaBackup(path.join(lectureDirPath(classId, lectureId), 'meta.json'), updated);
  }
  return id;
}

export function getSummaryVersions(classId: string, lectureId: string): any {
  const lecture = getLecture(classId, lectureId);
  if (!lecture) return { versions: [], currentSummary: null };
  const versions = db.prepare(
    'SELECT id, date, backend, model FROM summaries WHERE lectureId = ? ORDER BY id DESC'
  ).all(lectureId);
  return { versions, currentSummary: lecture.currentSummary };
}

export function getSummaryContent(classId: string, lectureId: string, summaryId: string): string | null {
  const p = path.join(summariesDirPath(classId, lectureId), `${summaryId}.md`);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

export function getCurrentSummaryContent(classId: string, lectureId: string): string | null {
  const lecture = getLecture(classId, lectureId);
  if (!lecture?.currentSummary) return null;
  return getSummaryContent(classId, lectureId, lecture.currentSummary);
}

export function deleteSummaryVersion(classId: string, lectureId: string, summaryId: string): boolean {
  const p = path.join(summariesDirPath(classId, lectureId), `${summaryId}.md`);
  if (!existsSync(p)) return false;
  rmSync(p);
  db.prepare('DELETE FROM summaries WHERE id = ?').run(summaryId);
  const lecture = getLecture(classId, lectureId);
  if (lecture?.currentSummary === summaryId) {
    const next = db.prepare(
      'SELECT id FROM summaries WHERE lectureId = ? ORDER BY id DESC LIMIT 1'
    ).get(lectureId) as any;
    db.prepare('UPDATE lectures SET currentSummary = ? WHERE id = ?').run(next?.id || null, lectureId);
  }
  return true;
}

// ── Users & magic-link tokens ───────────────────────────────────────────────────
export interface User { id: string; email: string; createdAt: string }

export function getUserByEmail(email: string): User | null {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | null || null;
}

export function createUser(email: string): User {
  const user: User = { id: randomUUID(), email, createdAt: new Date().toISOString() };
  db.prepare('INSERT INTO users (id, email, createdAt) VALUES (?, ?, ?)').run(user.id, user.email, user.createdAt);
  return user;
}

export function getOrCreateUser(email: string): User {
  return getUserByEmail(email) || createUser(email);
}

export function createMagicLinkToken(tokenHash: string, email: string, expiresAt: string): void {
  db.prepare('INSERT INTO magic_link_tokens (tokenHash, email, expiresAt) VALUES (?, ?, ?)').run(tokenHash, email, expiresAt);
}

export function consumeMagicLinkToken(tokenHash: string): { email: string } | null {
  const row = db.prepare('SELECT email, expiresAt, usedAt FROM magic_link_tokens WHERE tokenHash = ?').get(tokenHash) as
    { email: string; expiresAt: string; usedAt: string | null } | undefined;
  if (!row || row.usedAt || new Date(row.expiresAt) < new Date()) return null;
  db.prepare('UPDATE magic_link_tokens SET usedAt = ? WHERE tokenHash = ?').run(new Date().toISOString(), tokenHash);
  return { email: row.email };
}

// ── Reload from disk ──────────────────────────────────────────────────────────
export function reloadFromDisk(): { classes: number; lectures: number } {
  if (!existsSync(CLASSES_DIR)) return { classes: 0, lectures: 0 };

  let classCount = 0, lectureCount = 0;

  for (const classDir of readdirSync(CLASSES_DIR, { withFileTypes: true }).filter(d => d.isDirectory())) {
    const classId = classDir.name;
    const metaPath = path.join(CLASSES_DIR, classId, 'meta.json');
    if (!existsSync(metaPath)) continue;

    let classMeta: any;
    try { classMeta = JSON.parse(readFileSync(metaPath, 'utf8')); } catch { continue; }

    if (!classMeta.userId) { console.warn(`[reload] skipping class without userId: ${classId}`); continue; }

    db.prepare(
      'INSERT OR REPLACE INTO classes (id, userId, name, semester, year, createdAt, opalCourseUrl, code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(classMeta.id, classMeta.userId, classMeta.name, classMeta.semester, classMeta.year || null, classMeta.createdAt, classMeta.opalCourseUrl || null, classMeta.code || null);
    classCount++;

    const lecturesDir = path.join(CLASSES_DIR, classId, 'lectures');
    if (!existsSync(lecturesDir)) continue;

    for (const lectureDir of readdirSync(lecturesDir, { withFileTypes: true }).filter(d => d.isDirectory())) {
      const lectureId = lectureDir.name;
      const lMetaPath = path.join(lecturesDir, lectureId, 'meta.json');
      if (!existsSync(lMetaPath)) continue;

      let m: any;
      try { m = JSON.parse(readFileSync(lMetaPath, 'utf8')); } catch { continue; }

      db.prepare(
        `INSERT OR REPLACE INTO lectures
          (id, classId, name, url, lectureDate, addedAt, summarizedAt, whisperModel, whisperBackend,
           summarizeModel, summarizeBackend, status, currentSummary, lastError, lastErrorAt, startedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        m.id, m.classId, m.name, m.url, m.lectureDate || null, m.addedAt,
        m.summarizedAt || null, m.whisperModel || null, m.whisperBackend || null,
        m.summarizeModel || null, m.summarizeBackend || null, m.status || 'pending',
        m.currentSummary || null, m.lastError || null, m.lastErrorAt || null, m.startedAt || null,
      );
      lectureCount++;

      if (m.summaries?.length) {
        for (const s of m.summaries) {
          db.prepare('INSERT OR REPLACE INTO summaries (id, lectureId, date, backend) VALUES (?, ?, ?, ?)')
            .run(s.id, lectureId, s.date, s.backend || 'unknown');
        }
      }
    }
  }

  console.log(`[reload] rebuilt from disk: ${classCount} classes, ${lectureCount} lectures`);
  return { classes: classCount, lectures: lectureCount };
}
