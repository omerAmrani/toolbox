'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { streamSSE } from '@/lib/sse';
import { Status, fmtDate } from '@/app/components/Status';
import { STATUS_LABEL, STATUS_COLOR } from '@/lib/status';

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

type ModelKey = 'gemini' | 'claude';
type ModelStatus = 'idle' | 'testing' | 'ok' | 'error' | 'warning';

interface ModelState {
  status: ModelStatus;
  msg: string;
  latency?: number;
  response?: string;
}

const MODELS: { key: ModelKey; emoji: string; name: string; sub: string; role: string }[] = [
  { key: 'gemini', emoji: 'G', name: 'Gemini', sub: 'Google · gemini-2.0-flash', role: 'סיכומים גיבוי' },
  { key: 'claude', emoji: 'C', name: 'Claude', sub: 'Anthropic · claude-haiku-4-5-20251001', role: 'סיכומים' },
];

function SettingsToggle({ label, defaultOn }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(!!defaultOn);
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 0',
        borderBottom: '1px solid var(--line)',
        cursor: 'pointer',
      }}
      onClick={() => setOn(!on)}
    >
      <span style={{ fontSize: '0.9rem' }}>{label}</span>
      <span
        style={{
          width: 36,
          height: 20,
          background: on ? 'var(--ink)' : 'var(--line-2)',
          borderRadius: 999,
          position: 'relative',
          transition: 'background 0.15s',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            insetBlockStart: 2,
            insetInlineEnd: on ? 2 : 18,
            width: 16,
            height: 16,
            background: 'var(--bg)',
            borderRadius: '50%',
            transition: 'inset-inline-end 0.15s',
          }}
        />
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [dataDir, setDataDir] = useState<DataDirInfo | null>(null);
  const [pendingDataDir, setPendingDataDir] = useState<string | null>(null);
  const [dataDirHasDb, setDataDirHasDb] = useState(false);
  const [dataDirResult, setDataDirResult] = useState<{ msg: string; error?: boolean } | null>(null);
  const [pickingDir, setPickingDir] = useState(false);
  const [savingDir, setSavingDir] = useState(false);
  const [reloadMsg, setReloadMsg] = useState('');
  const [reloading, setReloading] = useState(false);

  const [queue, setQueue] = useState<QueueData | null>(null);
  const [cronLog, setCronLog] = useState<CronLog | null>(null);
  const queueRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [syncSections, setSyncSections] = useState<SyncSection[]>([]);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [cronTestMsg, setCronTestMsg] = useState<{ msg: string; error?: boolean } | null>(null);
  const [testingCron, setTestingCron] = useState(false);

  const [archive, setArchive] = useState<(Lecture & { classId: string; className: string })[]>([]);

  const [models, setModels] = useState<Record<ModelKey, ModelState>>({
    gemini: { status: 'idle', msg: 'לא נבדק' },
    claude: { status: 'idle', msg: 'לא נבדק' },
  });

  const loadDataDir = useCallback(async () => {
    try {
      const data: DataDirInfo = await fetch(apiUrl('/api/data-dir')).then((r) => r.json());
      setDataDir(data);
    } catch { /* ignore */ }
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
              if (queueRefreshTimer.current) { clearInterval(queueRefreshTimer.current); queueRefreshTimer.current = null; }
            }
          } catch { /* ignore */ }
        }, 3000);
      }
    } catch { /* ignore */ }
  }, []);

  const loadCronLog = useCallback(async () => {
    try {
      const log: CronLog | null = await fetch(apiUrl('/api/classes/cron-log')).then((r) => r.json());
      setCronLog(log);
    } catch { /* ignore */ }
  }, []);

  const loadArchive = useCallback(async () => {
    try {
      const classes: ClassRow[] = await fetch(apiUrl('/api/classes')).then((r) => r.json());
      const rows: (Lecture & { classId: string; className: string })[] = [];
      for (const cls of classes) {
        const lectures: Lecture[] = await fetch(apiUrl(`/api/classes/${cls.id}/lectures`)).then((r) => r.json()).catch(() => []);
        for (const l of lectures) {
          if (l.status === 'skipped') rows.push({ ...l, classId: cls.id, className: cls.name });
        }
      }
      setArchive(rows);
    } catch { /* ignore */ }
  }, []);

  const initSyncPanel = useCallback(async () => {
    try {
      const classes: ClassRow[] = await fetch(apiUrl('/api/classes')).then((r) => r.json());
      const linked = classes.filter((c) => c.opalCourseUrl);
      const sections = await Promise.all(
        linked.map(async (cls) => {
          const existing: Lecture[] = await fetch(apiUrl(`/api/classes/${cls.id}/lectures`)).then((r) => r.json()).catch(() => []);
          return { classId: cls.id, className: cls.name, existing, newLectures: [] as NewLecture[] };
        }),
      );
      setSyncSections(sections);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadDataDir();
    loadQueue();
    loadCronLog();
    initSyncPanel();
    loadArchive();
    return () => {
      if (queueRefreshTimer.current) { clearInterval(queueRefreshTimer.current); queueRefreshTimer.current = null; }
    };
  }, [loadDataDir, loadQueue, loadCronLog, initSyncPanel, loadArchive]);

  const pickDataDir = async () => {
    setPickingDir(true);
    try {
      const data: { path?: string; hasDb?: boolean; cancelled?: boolean; error?: string } =
        await fetch(apiUrl('/api/data-dir/pick'), { method: 'POST' }).then((r) => r.json());
      if (data.cancelled) return;
      if (data.error) { setDataDirResult({ msg: `שגיאה: ${data.error}`, error: true }); return; }
      if (data.path) { setPendingDataDir(data.path); setDataDirHasDb(!!data.hasDb); }
    } finally { setPickingDir(false); }
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
      if (data.ok) { setDataDirResult({ msg: 'הנתיב נשמר. השרת מופעל מחדש...' }); setPendingDataDir(null); }
      else setDataDirResult({ msg: `שגיאה: ${data.error}`, error: true });
    } catch { setDataDirResult({ msg: 'שגיאת רשת', error: true }); }
    finally { setSavingDir(false); }
  };

  const reloadFromDisk = async () => {
    setReloading(true);
    setReloadMsg('טוען...');
    try {
      const data: { ok?: boolean; classes?: number; lectures?: number; error?: string } =
        await fetch(apiUrl('/api/reload-from-disk'), { method: 'POST' }).then((r) => r.json());
      if (data.ok) setReloadMsg(`שוחזר: ${data.classes} קורסים, ${data.lectures} הרצאות`);
      else setReloadMsg(`שגיאה: ${data.error}`);
    } catch { setReloadMsg('שגיאת רשת'); }
    finally { setReloading(false); }
  };

  const runSync = async () => {
    setSyncing(true);
    setSyncProgress('מתחיל...');
    try {
      await streamSSE('/api/classes/sync', {}, (ev) => {
        if (ev.type === 'progress') setSyncProgress(String(ev.message));
        else if (ev.type === 'class') {
          const classId = String(ev.classId);
          const newLectures = (ev.newLectures as NewLecture[]) || [];
          setSyncSections((prev) => prev.map((s) => s.classId === classId ? { ...s, newLectures } : s));
        } else if (ev.type === 'done') setSyncProgress('סיום בדיקה');
      });
    } catch (err) {
      setSyncProgress(`שגיאה: ${err instanceof Error ? err.message : 'שגיאה'}`);
    } finally { setSyncing(false); }
  };

  const queueLectureItem = async (classId: string, idx: number) => {
    const section = syncSections.find((s) => s.classId === classId);
    const lecture = section?.newLectures[idx];
    if (!lecture) return;
    const r = await fetch(apiUrl(`/api/classes/${classId}/lectures`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: lecture.name, url: lecture.url, lectureDate: lecture.lectureDate }),
    });
    if (r.ok) {
      setSyncSections((prev) =>
        prev.map((s) =>
          s.classId === classId
            ? { ...s, newLectures: s.newLectures.filter((_, i) => i !== idx), existing: [...s.existing, { id: '', name: lecture.name, status: 'pending', lectureDate: lecture.lectureDate || null }] }
            : s,
        ),
      );
    }
  };

  const skipLectureItem = async (classId: string, idx: number) => {
    const section = syncSections.find((s) => s.classId === classId);
    const lecture = section?.newLectures[idx];
    if (!lecture) return;
    const r = await fetch(apiUrl(`/api/classes/${classId}/lectures`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: lecture.name, url: lecture.url, lectureDate: lecture.lectureDate, status: 'skipped' }),
    });
    if (r.ok) {
      setSyncSections((prev) => prev.map((s) => s.classId === classId ? { ...s, newLectures: s.newLectures.filter((_, i) => i !== idx) } : s));
      loadArchive();
    }
  };

  const skipFromQueue = async (classId: string, lectureId: string) => {
    const r = await fetch(apiUrl(`/api/classes/${classId}/lectures/${lectureId}/skip`), { method: 'POST' });
    if (r.ok) { loadQueue(); loadArchive(); }
  };

  const unskipLecture = async (classId: string, lectureId: string) => {
    const r = await fetch(apiUrl(`/api/classes/${classId}/lectures/${lectureId}/unskip`), { method: 'POST' });
    if (r.ok) { loadArchive(); loadQueue(); }
  };

  const triggerPipeline = async () => {
    await fetch(apiUrl('/api/classes/run-queue'), { method: 'POST' });
    await loadQueue();
  };

  const testCron = async () => {
    setTestingCron(true);
    setCronTestMsg({ msg: 'מזהה הרצאות חדשות...' });
    try {
      const data: { message?: string; found?: number } =
        await fetch(apiUrl('/api/classes/run-pipeline'), { method: 'POST' }).then((r) => r.json());
      setCronTestMsg({ msg: data.message || `נמצאו ${data.found ?? '?'} הרצאות חדשות` });
      loadQueue();
    } catch (err) {
      setCronTestMsg({ msg: `שגיאה: ${err instanceof Error ? err.message : 'שגיאה'}`, error: true });
    } finally { setTestingCron(false); }
  };

  const testModel = async (key: ModelKey) => {
    setModels((m) => ({ ...m, [key]: { status: 'testing', msg: 'שולח בקשה...' } }));
    try {
      const data: { ok?: boolean; configured?: boolean; error?: string; ms?: number; response?: string } =
        await fetch(apiUrl(`/api/health/${key}`)).then((r) => r.json());
      if (!data.configured) {
        setModels((m) => ({ ...m, [key]: { status: 'warning', msg: data.error || 'מפתח API לא מוגדר' } }));
      } else if (data.ok) {
        setModels((m) => ({ ...m, [key]: { status: 'ok', msg: 'תקין', latency: data.ms, response: data.response } }));
      } else {
        setModels((m) => ({ ...m, [key]: { status: 'error', msg: data.error || 'שגיאה' } }));
      }
    } catch (err) {
      setModels((m) => ({ ...m, [key]: { status: 'error', msg: err instanceof Error ? err.message : 'שגיאה' } }));
    }
  };

  const testAll = async () => { await Promise.all(MODELS.map((m) => testModel(m.key))); };

  const cronInfoStr = cronLog
    ? `הרצה אחרונה: ${new Date(cronLog.timestamp).toLocaleString('he-IL')} · ${cronLog.trigger === 'cron' ? 'קרון' : cronLog.trigger === 'retry' ? 'ניסיון חוזר' : 'ידני'} · נמצאו ${cronLog.found} · עובדו ${cronLog.queued}`
    : null;

  const pendingQueue = queue?.lectures.filter((l) => l.status === 'pending') || [];

  return (
    <div className="page fade-in">
      <div className="display-h">
        <div className="display-h__eye">תצורה ובריאות</div>
        <h1 className="display-h__title">הגדרות.</h1>
        <p className="display-h__sub">
          ניהול מודלי בינה מלאכותית, תור עיבוד, וזיהוי אוטומטי של הרצאות חדשות
          מאזור הקורס בפורטל האוניברסיטה הפתוחה.
        </p>
      </div>

      {/* Account Card — static (decision 7) */}
      <div className="account" style={{ marginBottom: 'var(--gap)' }}>
        <div className="account__avatar">פ</div>
        <div>
          <div className="account__uni">האוניברסיטה הפתוחה</div>
          <div className="account__user">—</div>
          <div className="account__pill">חיבור לא מוגדר</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
          <button
            className="btn btn--ghost btn--sm"
            style={{ background: 'transparent', color: 'var(--bg)', borderColor: 'color-mix(in srgb, var(--bg) 30%, transparent)' }}
            onClick={() => router.push('/setup')}
          >
            ↗ הגדר חשבון
          </button>
        </div>
      </div>

      <div className="settings-grid">
        {/* Detect-new sync card */}
        <div className="set-card">
          <div className="set-card__h">
            <div>
              <div className="set-card__title">זיהוי הרצאות חדשות</div>
              <div className="set-card__sub">
                {cronInfoStr || 'בודק את אזור הקורס מדי 6 שעות'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--ghost btn--sm" onClick={runSync} disabled={syncing}>
                {syncing ? 'מחפש...' : '🔍 בדוק עכשיו'}
              </button>
              <button className="btn btn--ghost btn--sm" onClick={testCron} disabled={testingCron}>
                {testingCron ? 'מריץ...' : '▶ קרון'}
              </button>
            </div>
          </div>

          {syncProgress && (
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 12 }}>{syncProgress}</div>
          )}
          {cronTestMsg && (
            <div style={{ fontSize: '0.85rem', color: cronTestMsg.error ? 'var(--danger)' : 'var(--good)', marginBottom: 12 }}>
              {cronTestMsg.msg}
            </div>
          )}

          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {syncSections.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                אין קורסים עם קישור OPAL — הגדר קישור בדף הקורס
              </div>
            ) : (
              syncSections.map((s) => (
                <div key={s.classId} style={{ marginBottom: 12 }}>
                  <div style={{ font: '600 0.85rem/1 var(--font-ui)', marginBottom: 6 }}>{s.className}</div>
                  {s.existing.map((l, i) => (
                    <div key={l.id || i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px dashed var(--line-2)', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--ink-2)' }}>{l.name}</span>
                      <span style={{ color: STATUS_COLOR[l.status] || 'var(--muted)' }}>{STATUS_LABEL[l.status] || l.status}</span>
                    </div>
                  ))}
                  {s.newLectures.length > 0 && (
                    <>
                      <div style={{ font: '600 0.78rem/1 var(--font-ui)', color: 'var(--accent)', padding: '8px 0 4px', borderTop: '1px dashed var(--line-2)', marginTop: 4 }}>
                        חדש — {s.newLectures.length} הרצאות
                      </div>
                      {s.newLectures.map((l, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px dashed var(--line-2)', fontSize: '0.85rem' }}>
                          <span style={{ flex: 1, color: 'var(--ink-2)' }}>{l.name}</span>
                          <button className="btn btn--sm" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={() => queueLectureItem(s.classId, i)}>+ הוסף</button>
                          <button className="btn btn--ghost btn--sm" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={() => skipLectureItem(s.classId, i)}>דלג</button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ))
            )}

            {/* Archive */}
            {archive.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                <div style={{ font: '600 0.85rem/1 var(--font-ui)', marginBottom: 8, color: 'var(--muted)' }}>ארכיון — דולגו</div>
                {archive.map((l) => (
                  <div key={`${l.classId}-${l.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px dashed var(--line-2)', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{l.className}</span>
                    <span style={{ flex: 1, color: 'var(--ink-2)' }}>{l.name}</span>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={() => unskipLecture(l.classId, l.id)}>↩ הוצא</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Notifications — static (decision 9) */}
        <div className="set-card">
          <div className="set-card__h">
            <div>
              <div className="set-card__title">התראות</div>
              <div className="set-card__sub">איך לקבל עדכון על סיכומים חדשים</div>
            </div>
          </div>
          <SettingsToggle label="מייל בסיום סיכום" defaultOn />
          <SettingsToggle label="התראת מערכת בכישלון" defaultOn />
          <SettingsToggle label="סיכום שבועי במייל" />
          <SettingsToggle label="התראת WhatsApp (ניסיוני)" />
        </div>

        {/* Storage card */}
        <div className="set-card">
          <div className="set-card__h">
            <div>
              <div className="set-card__title">אחסון</div>
              <div className="set-card__sub">תמלולים, סיכומים, מטה-דאטה</div>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={pickDataDir} disabled={pickingDir}>
              {pickingDir ? 'פותח...' : '📁 שנה תיקייה'}
            </button>
          </div>

          <div style={{ font: '0.85rem/1.5 var(--font-ui)', color: 'var(--muted)', marginBottom: 14 }}>
            תיקייה נוכחית:
            <div style={{ font: '0.82rem var(--font-mono)', color: 'var(--ink)', wordBreak: 'break-all', marginTop: 6, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
              {dataDir ? dataDir.current : '—'}
            </div>
          </div>

          {pendingDataDir && !dataDirHasDb && dataDir?.current && (
            <div style={{ marginBottom: 8, fontSize: '0.85rem', color: 'var(--warn)' }}>
              נתיב זה ריק. הנתונים הקיימים נשארים ב: {dataDir.current}
            </div>
          )}
          {pendingDataDir && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '0.85rem', wordBreak: 'break-all', marginBottom: 8 }}>נתיב נבחר: {pendingDataDir}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn--sm" onClick={saveDataDir} disabled={savingDir}>{savingDir ? 'שומר...' : 'שמור והפעל מחדש'}</button>
                <button className="btn btn--ghost btn--sm" onClick={() => setPendingDataDir(null)}>ביטול</button>
              </div>
            </div>
          )}
          {dataDirResult && (
            <div style={{ fontSize: '0.85rem', color: dataDirResult.error ? 'var(--danger)' : 'var(--good)', marginBottom: 8 }}>
              {dataDirResult.msg}
            </div>
          )}

          <div style={{ paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <button className="btn btn--ghost btn--sm" onClick={reloadFromDisk} disabled={reloading}>
              {reloading ? 'טוען...' : '♻️ שחזור מדיסק'}
            </button>
            {reloadMsg && (
              <div style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--muted)' }}>{reloadMsg}</div>
            )}
          </div>
        </div>

        {/* Queue card */}
        <div className="set-card">
          <div className="set-card__h">
            <div>
              <div className="set-card__title">תור עיבוד</div>
              <div className="set-card__sub">{pendingQueue.length} הרצאות ממתינות</div>
            </div>
            <button className="btn btn--sm" onClick={triggerPipeline} disabled={queue?.running}>
              {queue?.running ? 'פועל...' : '▶ הפעל תור'}
            </button>
          </div>

          {pendingQueue.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>התור ריק</div>
          ) : (
            pendingQueue.map((l) => (
              <div key={l.lectureId} className="queue-row">
                <div className="queue-row__class">{l.className}</div>
                <div className="queue-row__name">{l.name}</div>
                <Status s={l.status} />
                <button
                  className="btn btn--ghost btn--sm"
                  style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                  onClick={() => skipFromQueue(l.classId, l.lectureId)}
                >
                  דלג
                </button>
              </div>
            ))
          )}
        </div>

        {/* AI Models — full width */}
        <div className="set-card set-card--wide">
          <div className="set-card__h">
            <div>
              <div className="set-card__title">מודלי בינה מלאכותית</div>
              <div className="set-card__sub">סטטוס בזמן אמת · בדיקת זמינות וזמני תגובה</div>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={testAll}>▶ בדוק את כולם</button>
          </div>

          {MODELS.map(({ key, emoji, name, sub, role }) => {
            const m = models[key];
            const cls =
              m.status === 'ok' ? 'model model--ok' :
              m.status === 'error' ? 'model model--err' :
              m.status === 'warning' ? 'model model--warn' :
              'model';
            return (
              <div key={key} className={cls}>
                <div className="model__avatar">{emoji}</div>
                <div>
                  <div className="model__name">
                    {name}
                    <span style={{ fontWeight: 400, fontSize: '0.78rem', color: 'var(--muted)', marginInlineStart: 6 }}>· {role}</span>
                  </div>
                  <div className="model__sub">{sub}</div>
                </div>
                <div className="model__stat">
                  {m.status === 'testing' ? (
                    <>
                      <strong style={{ color: 'var(--muted)' }}>...</strong>
                      <span>בודק...</span>
                    </>
                  ) : m.latency ? (
                    <>
                      <strong>{m.latency}<span style={{ fontWeight: 400, fontSize: '0.7em', color: 'var(--muted)' }}>ms</span></strong>
                      <span>{m.msg}</span>
                    </>
                  ) : (
                    <>
                      <strong style={{ color: m.status === 'warning' ? 'var(--warn)' : 'var(--muted)' }}>—</strong>
                      <span>{m.msg}</span>
                    </>
                  )}
                  <button
                    className="btn btn--ghost btn--sm"
                    style={{ marginTop: 8, fontSize: '0.75rem' }}
                    onClick={() => testModel(key)}
                    disabled={m.status === 'testing'}
                  >
                    {m.status === 'testing' ? 'בודק...' : m.status === 'idle' ? 'בדוק' : 'בדוק שנית'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
