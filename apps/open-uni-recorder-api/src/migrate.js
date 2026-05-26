import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { CLASSES_DIR } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function reloadFromDisk() {
  if (!existsSync(CLASSES_DIR)) return { classes: 0, lectures: 0 };

  let classCount = 0, lectureCount = 0;

  for (const classDir of readdirSync(CLASSES_DIR, { withFileTypes: true }).filter(d => d.isDirectory())) {
    const classId = classDir.name;
    const metaPath = path.join(CLASSES_DIR, classId, 'meta.json');
    if (!existsSync(metaPath)) continue;

    let classMeta;
    try { classMeta = JSON.parse(readFileSync(metaPath, 'utf8')); } catch { continue; }

    db.prepare(
      'INSERT OR REPLACE INTO classes (id, name, semester, year, createdAt, opalCourseUrl) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(classMeta.id, classMeta.name, classMeta.semester, classMeta.year || null, classMeta.createdAt, classMeta.opalCourseUrl || null);
    classCount++;

    const lecturesDir = path.join(CLASSES_DIR, classId, 'lectures');
    if (!existsSync(lecturesDir)) continue;

    for (const lectureDir of readdirSync(lecturesDir, { withFileTypes: true }).filter(d => d.isDirectory())) {
      const lectureId = lectureDir.name;
      const lMetaPath = path.join(lecturesDir, lectureId, 'meta.json');
      if (!existsSync(lMetaPath)) continue;

      let m;
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
