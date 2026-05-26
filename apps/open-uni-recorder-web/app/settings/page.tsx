'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api';
import { streamSSE } from '@/lib/sse';
import { PageHeader } from '@/app/components/PageHeader';

interface DataDirInfo {
  current: string;
  configured: string | null;
  hasDb: boolean;
}

interface QueueLecture {
  classId: string;
  className: string;
  lectureId: string;
  name: string;
  status: string;
  addedAt: string;
}

interface QueueData {
  running: boolean;
  lectures: QueueLecture[];
}

interface CronLog {
  timestamp: string;
  trigger: string;
  found: number;
  queued: number;
}

interface ClassRow {
  id: string;
  name: string;
  opalCourseUrl?: string | null;
}

interface Lecture {
  id: string;
  name: string;
  status: string;
  lectureDate?: string | null;
  addedAt?: string;
  currentSummary?: string | null;
}

interface NewLecture {
  name: string;
  url: string;
  lectureDate?: string | null;
}

interface SyncSection {
  classId: string;
  className: string;
  existing: Lecture[];
  newLectures: NewLecture[];
}

type ModelKey = 'gemini' | 'groq' | 'claude' | 'ollama';
type ModelStatus = 'idle' | 'testing' | 'ok' | 'error' | 'warning';

interface ModelState {
  status: ModelStatus;
  msg: string;
  latency?: number;
  response?: string;
}

const STATUS_LABEL_FULL: Record<string, string> = {
  pending: 'ממתין',
  processing: 'מעבד',
  transcribing: 'מתמלל',
  transcribed: 'תומלל',
  summarizing: 'מסכם',
  summarized: 'סוכם',
  done: 'הושלם',
  failed: 'נכשל',
  error: 'שגיאה',
  aborted: 'בוטל',
  skipped: 'דולג',
};

const STATUS_COLOR_FULL: Record<string, string> = {
  pending: 'var(--muted)',
  processing: 'var(--primary)',
  transcribing: 'var(--primary)',
  transcribed: 'var(--warning)',
  summarizing: 'var(--primary)',
  summarized: 'var(--success)',
  done: 'var(--success)',
  failed: 'var(--error)',
  error: 'var(--error)',
  aborted: 'var(--muted)',
  skipped: 'var(--muted)',
};

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('he-IL');
}

const MODELS: { key: ModelKey; icon: string; name: string; sub: string }[] = [
  { key: 'gemini', icon: '🌟', name: 'Gemini', sub: 'Google · gemini-2.0-flash' },
  { key: 'groq', icon: '⚡', name: 'Groq', sub: 'LLaMA 3.3 70B · Groq Cloud' },
  { key: 'claude', icon: '🤖', name: 'Claude', sub: 'Anthropic · claude-sonnet-4-6' },
  { key: 'ollama', icon: '🦙', name: 'Ollama', sub: 'מקומי · localhost:11434' },
];

export default function SettingsPage() {
  // Data dir
  const [dataDir, setDataDir] = useState<DataDirInfo | null>(null);
  const [pendingDataDir, setPendingDataDir] = useState<string | null>(null);
  const [dataDirHasDb, setDataDirHasDb] = useState(false);
  const [dataDirResult, setDataDirResult] = useState<{ msg: string; error?: boolean } | null>(null);
  const [pickingDir, setPickingDir] = useState(false);
  const [savingDir, setSavingDir] = useState(false);

  // Queue
  const [queue, setQueue] = useState<QueueData | null>(null);
  const [cronLog, setCronLog] = useState<CronLog | null>(null);
  const queueRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reload from disk
  const [reloadMsg, setReloadMsg] = useState('');
  const [reloading, setReloading] = useState(false);

  // Sync
  const [syncSections, setSyncSections] = useState<SyncSection[]>([]);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Archive
  const [archive, setArchive] = useState<(Lecture & { classId: string; className: string })[]>([]);

  // Email
  const [emailOptions, setEmailOptions] = useState<{ classId: string; lectureId: string; label: string }[]>(
    [],
  );
  const [emailIdx, setEmailIdx] = useState('');
  const [emailMsg, setEmailMsg] = useState<{ msg: string; error?: boolean } | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Cron test
  const [cronTestMsg, setCronTestMsg] = useState<{ msg: string; error?: boolean } | null>(null);
  const [testingCron, setTestingCron] = useState(false);

  // Model tests
  const [models, setModels] = useState<Record<ModelKey, ModelState>>({
    gemini: { status: 'idle', msg: 'לא נבדק' },
    groq: { status: 'idle', msg: 'לא נבדק' },
    claude: { status: 'idle', msg: 'לא נבדק' },
    ollama: { status: 'idle', msg: 'לא נבדק' },
  });

  const loadDataDir = useCallback(async () => {
    try {
      const data: DataDirInfo = await fetch(apiUrl('/api/data-dir')).then((r) => r.json());
      setDataDir(data);
    } catch {
      /* ignore */
    }
  }, []);

  const loadQueue = useCallback(async () => {
    try {
      const data: QueueData = await fetch(apiUrl('/api/classes/queue')).then((r) => r.json());
      setQueue(data);
      const anyProcessing = data.lectures.some((l) => l.status === 'processing');
      if (anyProcessing && !queueRefreshTimer.current) {
        queueRefreshTimer.current = setInterval(async () => {
          try {
            const d: QueueData = await fetch(apiUrl('/api/classes/queue')).then((r) => r.json());
            setQueue(d);
            if (!d.lectures.some((l) => l.status === 'processing')) {
              if (queueRefreshTimer.current) {
                clearInterval(queueRefreshTimer.current);
                queueRefreshTimer.current = null;
              }
            }
          } catch {
            /* ignore */
          }
        }, 3000);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadCronLog = useCallback(async () => {
    try {
      const log: CronLog | null = await fetch(apiUrl('/api/classes/cron-log')).then((r) =>
        r.json(),
      );
      setCronLog(log);
    } catch {
      /* ignore */
    }
  }, []);

  const loadArchive = useCallback(async () => {
    try {
      const classes: ClassRow[] = await fetch(apiUrl('/api/classes')).then((r) => r.json());
      const rows: (Lecture & { classId: string; className: string })[] = [];
      for (const cls of classes) {
        const lectures: Lecture[] = await fetch(apiUrl(`/api/classes/${cls.id}/lectures`))
          .then((r) => r.json())
          .catch(() => []);
        for (const l of lectures) {
          if (l.status === 'skipped') rows.push({ ...l, classId: cls.id, className: cls.name });
        }
      }
      setArchive(rows);
    } catch {
      /* ignore */
    }
  }, []);

  const initSyncPanel = useCallback(async () => {
    try {
      const classes: ClassRow[] = await fetch(apiUrl('/api/classes')).then((r) => r.json());
      const linked = classes.filter((c) => c.opalCourseUrl);
      const sections = await Promise.all(
        linked.map(async (cls) => {
          const existing: Lecture[] = await fetch(apiUrl(`/api/classes/${cls.id}/lectures`))
            .then((r) => r.json())
            .catch(() => []);
          return {
            classId: cls.id,
            className: cls.name,
            existing,
            newLectures: [] as NewLecture[],
          };
        }),
      );
      setSyncSections(sections);
    } catch {
      /* ignore */
    }
  }, []);

  const loadEmailLectures = useCallback(async () => {
    try {
      const classes: ClassRow[] = await fetch(apiUrl('/api/classes')).then((r) => r.json());
      const options: { classId: string; lectureId: string; label: string }[] = [];
      for (const cls of classes) {
        const lectures: Lecture[] = await fetch(apiUrl(`/api/classes/${cls.id}/lectures`))
          .then((r) => r.json())
          .catch(() => []);
        for (const l of lectures) {
          if (l.currentSummary) {
            options.push({
              classId: cls.id,
              lectureId: l.id,
              label: `${cls.name} — ${l.name}`,
            });
          }
        }
      }
      setEmailOptions(options);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadDataDir();
    loadQueue();
    loadCronLog();
    initSyncPanel();
    loadArchive();
    loadEmailLectures();
    return () => {
      if (queueRefreshTimer.current) {
        clearInterval(queueRefreshTimer.current);
        queueRefreshTimer.current = null;
      }
    };
  }, [loadDataDir, loadQueue, loadCronLog, initSyncPanel, loadArchive, loadEmailLectures]);

  const pickDataDir = async () => {
    setPickingDir(true);
    try {
      const data: { path?: string; hasDb?: boolean; cancelled?: boolean; error?: string } =
        await fetch(apiUrl('/api/data-dir/pick'), { method: 'POST' }).then((r) => r.json());
      if (data.cancelled) return;
      if (data.error) {
        setDataDirResult({ msg: `שגיאה: ${data.error}`, error: true });
        return;
      }
      if (data.path) {
        setPendingDataDir(data.path);
        setDataDirHasDb(!!data.hasDb);
      }
    } finally {
      setPickingDir(false);
    }
  };

  const saveDataDir = async () => {
    if (!pendingDataDir) return;
    setSavingDir(true);
    try {
      const data: { ok?: boolean; error?: string } = await fetch(apiUrl('/api/data-dir'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataDir: pendingDataDir }),
      }).then((r) => r.json());
      if (data.ok) {
        setDataDirResult({ msg: 'הנתיב נשמר. השרת מופעל מחדש...' });
        setPendingDataDir(null);
      } else {
        setDataDirResult({ msg: `שגיאה: ${data.error}`, error: true });
      }
    } catch {
      setDataDirResult({ msg: 'שגיאת רשת', error: true });
    } finally {
      setSavingDir(false);
    }
  };

  const reloadFromDisk = async () => {
    setReloading(true);
    setReloadMsg('טוען...');
    try {
      const r = await fetch(apiUrl('/api/reload-from-disk'), { method: 'POST' });
      const data: { ok?: boolean; classes?: number; lectures?: number; error?: string } =
        await r.json();
      if (data.ok) setReloadMsg(`שוחזר: ${data.classes} קורסים, ${data.lectures} הרצאות`);
      else setReloadMsg(`שגיאה: ${data.error}`);
    } catch {
      setReloadMsg('שגיאת רשת');
    } finally {
      setReloading(false);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    setSyncProgress('מתחיל...');
    try {
      await streamSSE('/api/classes/sync', {}, (ev) => {
        if (ev.type === 'progress') {
          setSyncProgress(String(ev.message));
        } else if (ev.type === 'class') {
          const classId = String(ev.classId);
          const newLectures = (ev.newLectures as NewLecture[]) || [];
          setSyncSections((prev) =>
            prev.map((s) => (s.classId === classId ? { ...s, newLectures } : s)),
          );
        } else if (ev.type === 'done') {
          setSyncProgress('סיום בדיקה');
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה';
      setSyncProgress(`שגיאה: ${msg}`);
    } finally {
      setSyncing(false);
    }
  };

  const queueLecture = async (classId: string, idx: number) => {
    const section = syncSections.find((s) => s.classId === classId);
    const lecture = section?.newLectures[idx];
    if (!lecture) return;
    const r = await fetch(apiUrl(`/api/classes/${classId}/lectures`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: lecture.name,
        url: lecture.url,
        lectureDate: lecture.lectureDate,
      }),
    });
    if (r.ok) {
      setSyncSections((prev) =>
        prev.map((s) =>
          s.classId === classId
            ? {
                ...s,
                newLectures: s.newLectures.filter((_, i) => i !== idx),
                existing: [...s.existing, { id: '', name: lecture.name, status: 'pending', lectureDate: lecture.lectureDate || null }],
              }
            : s,
        ),
      );
    }
  };

  const skipLecture = async (classId: string, idx: number) => {
    const section = syncSections.find((s) => s.classId === classId);
    const lecture = section?.newLectures[idx];
    if (!lecture) return;
    const r = await fetch(apiUrl(`/api/classes/${classId}/lectures`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: lecture.name,
        url: lecture.url,
        lectureDate: lecture.lectureDate,
        status: 'skipped',
      }),
    });
    if (r.ok) {
      setSyncSections((prev) =>
        prev.map((s) =>
          s.classId === classId
            ? { ...s, newLectures: s.newLectures.filter((_, i) => i !== idx) }
            : s,
        ),
      );
      loadArchive();
    }
  };

  const skipFromQueue = async (classId: string, lectureId: string) => {
    const r = await fetch(apiUrl(`/api/classes/${classId}/lectures/${lectureId}/skip`), {
      method: 'POST',
    });
    if (r.ok) {
      loadQueue();
      loadArchive();
    }
  };

  const unskipLecture = async (classId: string, lectureId: string) => {
    const r = await fetch(apiUrl(`/api/classes/${classId}/lectures/${lectureId}/unskip`), {
      method: 'POST',
    });
    if (r.ok) {
      loadArchive();
      loadQueue();
    }
  };

  const triggerPipeline = async () => {
    await fetch(apiUrl('/api/classes/run-queue'), { method: 'POST' });
    await loadQueue();
  };

  const testCron = async () => {
    setTestingCron(true);
    setCronTestMsg({ msg: 'מזהה הרצאות חדשות...' });
    try {
      const r = await fetch(apiUrl('/api/classes/run-pipeline'), { method: 'POST' });
      const data: { message?: string; found?: number } = await r.json();
      setCronTestMsg({ msg: data.message || `נמצאו ${data.found ?? '?'} הרצאות חדשות` });
      loadQueue();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה';
      setCronTestMsg({ msg: `שגיאה: ${msg}`, error: true });
    } finally {
      setTestingCron(false);
    }
  };

  const sendTestEmail = async () => {
    const opt = emailOptions[Number(emailIdx)];
    if (!opt) return;
    setSendingEmail(true);
    setEmailMsg({ msg: 'שולח מייל...' });
    try {
      const r = await fetch(apiUrl('/api/classes/test-email'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: opt.classId, lectureId: opt.lectureId }),
      });
      const data: { error?: string } = await r.json();
      if (r.ok) setEmailMsg({ msg: 'המייל נשלח בהצלחה ✓' });
      else setEmailMsg({ msg: `שגיאה: ${data.error}`, error: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה';
      setEmailMsg({ msg: `שגיאת רשת: ${msg}`, error: true });
    } finally {
      setSendingEmail(false);
    }
  };

  const testModel = async (key: ModelKey) => {
    setModels((m) => ({ ...m, [key]: { status: 'testing', msg: 'שולח בקשה...' } }));
    try {
      const data: { ok?: boolean; configured?: boolean; error?: string; ms?: number; response?: string } =
        await fetch(apiUrl(`/api/health/${key}`)).then((r) => r.json());
      if (!data.configured) {
        setModels((m) => ({
          ...m,
          [key]: { status: 'warning', msg: data.error || 'מפתח API לא מוגדר' },
        }));
      } else if (data.ok) {
        setModels((m) => ({
          ...m,
          [key]: {
            status: 'ok',
            msg: 'פועל',
            latency: data.ms,
            response: data.response,
          },
        }));
      } else {
        setModels((m) => ({ ...m, [key]: { status: 'error', msg: data.error || 'שגיאה' } }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה';
      setModels((m) => ({ ...m, [key]: { status: 'error', msg } }));
    }
  };

  const testAll = async () => {
    await Promise.all(MODELS.map((m) => testModel(m.key)));
  };

  const cronInfoStr = cronLog
    ? `הרצה אחרונה: ${new Date(cronLog.timestamp).toLocaleString('he-IL')} · ${
        cronLog.trigger === 'cron' ? 'cרון' : cronLog.trigger === 'retry' ? 'ניסיון חוזר' : 'ידני'
      } · נמצאו ${cronLog.found} · עובדו ${cronLog.queued}`
    : '';

  const pendingQueue = queue?.lectures.filter((l) => l.status === 'pending') || [];

  return (
    <div className="page-settings">
      <PageHeader>
        <h1>⚙️ הגדרות</h1>
        <p>בדיקת מצב מודלי AI</p>
      </PageHeader>

      <main>
        {/* Data directory */}
        <div className="card card-compact">
          <div className="section-title">מיקום נתונים</div>
          <div
            style={{
              fontSize: '0.85rem',
              color: 'var(--muted)',
              marginBottom: 8,
              wordBreak: 'break-all',
            }}
          >
            {dataDir ? `נתיב נוכחי: ${dataDir.current}` : 'טוען...'}
          </div>
          <button className="test-all-btn" onClick={pickDataDir} disabled={pickingDir}>
            {pickingDir ? 'פותח...' : '📁 בחר תיקייה'}
          </button>
          {pendingDataDir && !dataDirHasDb && dataDir?.current && (
            <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--warning)' }}>
              נתיב זה ריק. הנתונים הקיימים נשארים ב: {dataDir.current}
            </div>
          )}
          {pendingDataDir && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: '0.85rem', wordBreak: 'break-all', marginBottom: 8 }}>
                נתיב נבחר: {pendingDataDir}
              </div>
              <button className="test-all-btn" onClick={saveDataDir} disabled={savingDir}>
                {savingDir ? 'שומר...' : 'שמור והפעל מחדש'}
              </button>
              <button
                className="test-btn test-btn-ghost"
                style={{ marginRight: 8 }}
                onClick={() => setPendingDataDir(null)}
              >
                ביטול
              </button>
            </div>
          )}
          {dataDirResult && (
            <div
              style={{
                marginTop: 8,
                fontSize: '0.85rem',
                color: dataDirResult.error ? 'var(--error)' : 'var(--success)',
              }}
            >
              {dataDirResult.msg}
            </div>
          )}
        </div>

        {/* Queue */}
        <div className="card card-compact">
          <div className="section-title">תור העיבוד</div>
          <button className="test-all-btn" onClick={triggerPipeline} disabled={queue?.running}>
            {queue?.running ? 'פועל...' : '▶ הפעל תור'}
          </button>
          <div className="cron-info">{cronInfoStr}</div>
          <div style={{ marginTop: 12 }}>
            {pendingQueue.length === 0 ? (
              <div className="sync-empty">התור ריק</div>
            ) : (
              pendingQueue.map((l) => (
                <div key={l.lectureId} className="sync-row">
                  <span className="sync-date">{l.className}</span>
                  <span className="sync-name">{l.name}</span>
                  <span className="sync-added">{fmtDate(l.addedAt)}</span>
                  <button
                    className="test-btn test-btn-ghost"
                    onClick={() => skipFromQueue(l.classId, l.lectureId)}
                  >
                    דלג
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Reload from disk */}
        <div className="card card-compact">
          <div className="section-title">שחזור מדיסק</div>
          <button className="test-all-btn" onClick={reloadFromDisk} disabled={reloading}>
            ♻️ טען מחדש מדיסק
          </button>
          <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--muted)' }}>
            {reloadMsg}
          </div>
        </div>

        {/* Sync */}
        <div className="card card-compact">
          <div className="section-title">זיהוי הרצאות חדשות</div>
          <button className="test-all-btn" onClick={runSync} disabled={syncing}>
            {syncing ? 'מחפש...' : '🔍 בדוק הרצאות חדשות'}
          </button>
          {syncProgress !== null && (
            <div className="sync-progress">{syncProgress}</div>
          )}
          {syncSections.length === 0 ? (
            <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              אין קורסים עם קישור OPAL — הגדר קישור בדף הקורס
            </div>
          ) : (
            syncSections.map((s) => (
              <div key={s.classId} className="sync-class-section">
                <div className="sync-class-name">{s.className}</div>
                {s.existing.length === 0 ? (
                  <div className="sync-empty">אין הרצאות שמורות</div>
                ) : (
                  s.existing.map((l, i) => (
                    <div key={l.id || i} className="sync-row">
                      <span className="sync-date">{fmtDate(l.lectureDate)}</span>
                      <span className="sync-name">{l.name}</span>
                      <span
                        className="sync-status"
                        style={{ color: STATUS_COLOR_FULL[l.status] || 'var(--muted)' }}
                      >
                        {STATUS_LABEL_FULL[l.status] || l.status}
                      </span>
                    </div>
                  ))
                )}
                {s.newLectures.length > 0 && (
                  <>
                    <div className="sync-new-header">חדש — {s.newLectures.length} הרצאות</div>
                    {s.newLectures.map((l, i) => (
                      <div key={i} className="sync-row">
                        <span className="sync-date">{fmtDate(l.lectureDate)}</span>
                        <span className="sync-name">{l.name}</span>
                        <button
                          className="test-btn"
                          onClick={() => queueLecture(s.classId, i)}
                        >
                          + הוסף לתור
                        </button>
                        <button
                          className="test-btn test-btn-ghost"
                          onClick={() => skipLecture(s.classId, i)}
                        >
                          דלג
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Archive */}
        <div className="card card-compact">
          <div className="section-title">ארכיון — הרצאות שדולגו</div>
          {archive.length === 0 ? (
            <div className="sync-empty">אין הרצאות בארכיון</div>
          ) : (
            archive.map((l) => (
              <div key={`${l.classId}-${l.id}`} className="sync-row">
                <span className="sync-date">{l.className}</span>
                <span className="sync-name">{l.name}</span>
                <span className="sync-added">{fmtDate(l.lectureDate || l.addedAt)}</span>
                <button className="test-btn" onClick={() => unskipLecture(l.classId, l.id)}>
                  ↩ הוצא מארכיון
                </button>
              </div>
            ))
          )}
        </div>

        {/* Test Email */}
        <div className="card card-compact">
          <div className="section-title">בדיקת שליחת מייל</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
            <select
              style={{
                flex: 1,
                minWidth: 200,
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--subtle)',
                color: 'var(--text)',
                fontSize: '0.9rem',
              }}
              value={emailIdx}
              onChange={(e) => setEmailIdx(e.target.value)}
            >
              <option value="">
                {emailOptions.length === 0 ? 'אין הרצאות עם סיכום' : 'בחר הרצאה...'}
              </option>
              {emailOptions.map((o, i) => (
                <option key={i} value={String(i)}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              className="test-all-btn"
              style={{ margin: 0 }}
              disabled={!emailIdx || sendingEmail}
              onClick={sendTestEmail}
            >
              {sendingEmail ? 'שולח...' : 'שלח'}
            </button>
          </div>
          {emailMsg && (
            <div
              style={{
                marginTop: 8,
                fontSize: '0.85rem',
                color: emailMsg.error ? 'var(--error)' : 'var(--success)',
              }}
            >
              {emailMsg.msg}
            </div>
          )}
        </div>

        {/* Test Cron */}
        <div className="card card-compact">
          <div className="section-title">בדיקת קרון — זיהוי והוספה לתור</div>
          <button className="test-all-btn" onClick={testCron} disabled={testingCron}>
            {testingCron ? 'מריץ...' : '▶ הרץ קרון עכשיו'}
          </button>
          {cronTestMsg && (
            <div
              style={{
                marginTop: 8,
                fontSize: '0.85rem',
                color: cronTestMsg.error ? 'var(--error)' : 'var(--success)',
              }}
            >
              {cronTestMsg.msg}
            </div>
          )}
        </div>

        {/* AI model tests */}
        <div className="card">
          <div className="section-title">מודלי AI — בדיקת תקינות</div>
          <button className="test-all-btn" onClick={testAll}>
            ▶ בדוק את כולם
          </button>
          <div className="model-grid">
            {MODELS.map(({ key, icon, name, sub }) => {
              const m = models[key];
              const cardCls =
                m.status === 'ok'
                  ? 'model-card ok'
                  : m.status === 'error'
                    ? 'model-card error'
                    : m.status === 'warning'
                      ? 'model-card no-key'
                      : 'model-card';
              const dotCls =
                m.status === 'ok'
                  ? 'status-dot dot-ok'
                  : m.status === 'error'
                    ? 'status-dot dot-error'
                    : m.status === 'warning'
                      ? 'status-dot dot-warning'
                      : 'status-dot dot-idle';
              return (
                <div key={key} className={cardCls}>
                  <div className="model-header">
                    <div className="model-icon">{icon}</div>
                    <div>
                      <div className="model-name">{name}</div>
                      <div className="model-sub">{sub}</div>
                    </div>
                  </div>
                  <div className="status-row">
                    <div className={dotCls} />
                    <span className="status-text">{m.msg}</span>
                    {m.latency !== undefined && (
                      <span className="latency">{m.latency}ms</span>
                    )}
                  </div>
                  {m.response && (
                    <div className="response-preview" style={{ display: 'block' }}>
                      תגובה: &quot;{m.response}&quot;
                    </div>
                  )}
                  <button
                    className="test-btn"
                    onClick={() => testModel(key)}
                    disabled={m.status === 'testing'}
                  >
                    {m.status === 'testing' ? 'בודק...' : m.status === 'idle' ? 'בדוק' : 'בדוק שנית'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
