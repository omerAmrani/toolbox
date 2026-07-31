import Database, { Database as BetterDatabase } from 'better-sqlite3';
import path from 'path';
import { mkdirSync } from 'fs';
import { getSettings } from '../settings';

const DEFAULT_DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '..', '..', 'recorder-db');
const TEST_DATA_DIR = path.resolve(process.cwd(), 'temp-db');
export const DATA_DIR: string =
  process.env.NODE_ENV === 'test' ? TEST_DATA_DIR : (getSettings().dataDir || DEFAULT_DATA_DIR);
export const CLASSES_DIR: string = path.join(DATA_DIR, 'classes');

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(CLASSES_DIR, { recursive: true });

const db: BetterDatabase = new Database(path.join(DATA_DIR, 'recorder.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    name TEXT NOT NULL,
    semester TEXT,
    year INTEGER,
    createdAt TEXT NOT NULL,
    opalCourseUrl TEXT,
    code TEXT
  );

  CREATE TABLE IF NOT EXISTS lectures (
    id TEXT PRIMARY KEY,
    classId TEXT NOT NULL REFERENCES classes(id),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    lectureDate TEXT,
    addedAt TEXT NOT NULL,
    summarizedAt TEXT,
    whisperModel TEXT,
    whisperBackend TEXT,
    summarizeModel TEXT,
    summarizeBackend TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    currentSummary TEXT,
    lastError TEXT,
    lastErrorAt TEXT,
    startedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS summaries (
    id TEXT PRIMARY KEY,
    lectureId TEXT NOT NULL REFERENCES lectures(id),
    date TEXT NOT NULL,
    backend TEXT NOT NULL,
    model TEXT
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS magic_link_tokens (
    tokenHash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    usedAt TEXT
  );
`);

try { db.exec('ALTER TABLE summaries ADD COLUMN model TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE classes ADD COLUMN code TEXT'); } catch (_) {}

// classes.userId is NOT NULL — a pre-existing dev DB from before multi-user scoping
// can't be migrated with ALTER TABLE (no default owner). Wipe and let it repopulate.
const hasUserId = (db.pragma('table_info(classes)') as { name: string }[]).some(c => c.name === 'userId');
if (!hasUserId) {
  db.exec('DROP TABLE IF EXISTS summaries; DROP TABLE IF EXISTS lectures; DROP TABLE IF EXISTS classes;');
  db.exec(`
    CREATE TABLE classes (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT NOT NULL,
      semester TEXT,
      year INTEGER,
      createdAt TEXT NOT NULL,
      opalCourseUrl TEXT,
      code TEXT
    );

    CREATE TABLE lectures (
      id TEXT PRIMARY KEY,
      classId TEXT NOT NULL REFERENCES classes(id),
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      lectureDate TEXT,
      addedAt TEXT NOT NULL,
      summarizedAt TEXT,
      whisperModel TEXT,
      whisperBackend TEXT,
      summarizeModel TEXT,
      summarizeBackend TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      currentSummary TEXT,
      lastError TEXT,
      lastErrorAt TEXT,
      startedAt TEXT
    );

    CREATE TABLE summaries (
      id TEXT PRIMARY KEY,
      lectureId TEXT NOT NULL REFERENCES lectures(id),
      date TEXT NOT NULL,
      backend TEXT NOT NULL,
      model TEXT
    );
  `);
}

export default db;
