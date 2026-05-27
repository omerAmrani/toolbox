import Database, { Database as BetterDatabase } from 'better-sqlite3';
import path from 'path';
import { mkdirSync } from 'fs';
import { getSettings } from '../settings';

const DEFAULT_DATA_DIR = path.resolve(__dirname, '..', '..', 'recorder-db');
export const DATA_DIR: string = getSettings().dataDir || DEFAULT_DATA_DIR;
export const CLASSES_DIR: string = path.join(DATA_DIR, 'classes');

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(CLASSES_DIR, { recursive: true });

const db: BetterDatabase = new Database(path.join(DATA_DIR, 'recorder.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    semester TEXT,
    year INTEGER,
    createdAt TEXT NOT NULL,
    opalCourseUrl TEXT
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
    backend TEXT NOT NULL
  );
`);

export default db;
