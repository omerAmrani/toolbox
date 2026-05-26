import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'fs';
import path from 'path';
import db, { CLASSES_DIR } from './db.js';

export { CLASSES_DIR };

function makeId(name) {
  const clean = name.toLowerCase()
    .replace(/[^\w]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
  return `${clean || 'item'}-${Date.now()}`;
}

function writeMetaBackup(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function lectureWithSummaries(row) {
  if (!row) return null;
  const summaries = db.prepare(
    'SELECT id, date, backend FROM summaries WHERE lectureId = ? ORDER BY id DESC'
  ).all(row.id);
  return { ...row, summaries };
}

// ── Classes ───────────────────────────────────────────────────────────────────
export function createClass({ name, semester, year }) {
  const id = makeId(name);
  const dir = path.join(CLASSES_DIR, id);
  mkdirSync(path.join(dir, 'lectures'), { recursive: true });
  const meta = { id, name, semester, year: year ? Number(year) : null, createdAt: new Date().toISOString() };
  db.prepare('INSERT INTO classes (id, name, semester, year, createdAt) VALUES (?, ?, ?, ?, ?)')
    .run(meta.id, meta.name, meta.semester, meta.year, meta.createdAt);
  writeMetaBackup(path.join(dir, 'meta.json'), meta);
  return meta;
}

export function getClasses() {
  return db.prepare('SELECT * FROM classes ORDER BY createdAt DESC').all();
}

export function getClass(classId) {
  return db.prepare('SELECT * FROM classes WHERE id = ?').get(classId) || null;
}

export function updateClassMeta(classId, updates) {
  const cls = getClass(classId);
  if (!cls) return null;
  const updated = { ...cls, ...updates };
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE classes SET ${fields} WHERE id = ?`).run(...Object.values(updates), classId);
  writeMetaBackup(path.join(CLASSES_DIR, classId, 'meta.json'), updated);
  return updated;
}

export function deleteClass(classId) {
  if (!getClass(classId)) return false;
  db.prepare('DELETE FROM summaries WHERE lectureId IN (SELECT id FROM lectures WHERE classId = ?)').run(classId);
  db.prepare('DELETE FROM lectures WHERE classId = ?').run(classId);
  db.prepare('DELETE FROM classes WHERE id = ?').run(classId);
  const dir = path.join(CLASSES_DIR, classId);
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  return true;
}

// ── Lectures ──────────────────────────────────────────────────────────────────
export function createLecture(classId, { name, url, lectureDate, status = 'pending' }) {
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

export function getLectures(classId) {
  const rows = db.prepare(
    'SELECT * FROM lectures WHERE classId = ? ORDER BY COALESCE(lectureDate, addedAt) ASC'
  ).all(classId);
  return rows.map(lectureWithSummaries);
}

export function getLecture(classId, lectureId) {
  const row = db.prepare('SELECT * FROM lectures WHERE id = ? AND classId = ?').get(lectureId, classId);
  return lectureWithSummaries(row);
}

export function updateLectureMeta(classId, lectureId, updates) {
  const lecture = getLecture(classId, lectureId);
  if (!lecture) return null;
  const updated = { ...lecture, ...updates };
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE lectures SET ${fields} WHERE id = ?`).run(...Object.values(updates), lectureId);
  const dir = path.join(CLASSES_DIR, classId, 'lectures', lectureId);
  writeMetaBackup(path.join(dir, 'meta.json'), updated);
  return updated;
}

export function deleteLecture(classId, lectureId) {
  if (!getLecture(classId, lectureId)) return false;
  db.prepare('DELETE FROM summaries WHERE lectureId = ?').run(lectureId);
  db.prepare('DELETE FROM lectures WHERE id = ?').run(lectureId);
  const dir = path.join(CLASSES_DIR, classId, 'lectures', lectureId);
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  return true;
}

export function lectureDirPath(classId, lectureId) {
  return path.join(CLASSES_DIR, classId, 'lectures', lectureId);
}

export function summariesDirPath(classId, lectureId) {
  return path.join(CLASSES_DIR, classId, 'lectures', lectureId, 'summaries');
}

// ── Summary versions ──────────────────────────────────────────────────────────
export function saveSummaryVersion(classId, lectureId, content, backend) {
  const summariesDir = summariesDirPath(classId, lectureId);
  mkdirSync(summariesDir, { recursive: true });
  const id = String(Date.now());
  writeFileSync(path.join(summariesDir, `${id}.md`), content);
  db.prepare('INSERT INTO summaries (id, lectureId, date, backend) VALUES (?, ?, ?, ?)')
    .run(id, lectureId, new Date().toISOString(), backend);
  db.prepare('UPDATE lectures SET currentSummary = ? WHERE id = ?').run(id, lectureId);
  const updated = getLecture(classId, lectureId);
  if (updated) {
    writeMetaBackup(path.join(lectureDirPath(classId, lectureId), 'meta.json'), updated);
  }
  return id;
}

export function getSummaryVersions(classId, lectureId) {
  const lecture = getLecture(classId, lectureId);
  if (!lecture) return { versions: [], currentSummary: null };
  const versions = db.prepare(
    'SELECT id, date, backend FROM summaries WHERE lectureId = ? ORDER BY id DESC'
  ).all(lectureId);
  return { versions, currentSummary: lecture.currentSummary };
}

export function getSummaryContent(classId, lectureId, summaryId) {
  const p = path.join(summariesDirPath(classId, lectureId), `${summaryId}.md`);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

export function getCurrentSummaryContent(classId, lectureId) {
  const lecture = getLecture(classId, lectureId);
  if (!lecture?.currentSummary) return null;
  return getSummaryContent(classId, lectureId, lecture.currentSummary);
}

export function setCurrentSummary(classId, lectureId, summaryId) {
  const p = path.join(summariesDirPath(classId, lectureId), `${summaryId}.md`);
  if (!existsSync(p)) return false;
  db.prepare('UPDATE lectures SET currentSummary = ? WHERE id = ?').run(summaryId, lectureId);
  return true;
}

export function deleteSummaryVersion(classId, lectureId, summaryId) {
  const p = path.join(summariesDirPath(classId, lectureId), `${summaryId}.md`);
  if (!existsSync(p)) return false;
  rmSync(p);
  db.prepare('DELETE FROM summaries WHERE id = ?').run(summaryId);
  const lecture = getLecture(classId, lectureId);
  if (lecture?.currentSummary === summaryId) {
    const next = db.prepare(
      'SELECT id FROM summaries WHERE lectureId = ? ORDER BY id DESC LIMIT 1'
    ).get(lectureId);
    db.prepare('UPDATE lectures SET currentSummary = ? WHERE id = ?').run(next?.id || null, lectureId);
  }
  return true;
}
