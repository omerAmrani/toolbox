import db from '../../src/db';
import { rmSync, existsSync } from 'fs';
import path from 'path';
import { CLASSES_DIR } from '../../src/db';

export function truncateAll() {
  db.prepare('DELETE FROM summaries').run();
  db.prepare('DELETE FROM lectures').run();
  db.prepare('DELETE FROM classes').run();
}

export function cleanClassesDir() {
  if (existsSync(CLASSES_DIR)) {
    rmSync(CLASSES_DIR, { recursive: true, force: true });
  }
}
