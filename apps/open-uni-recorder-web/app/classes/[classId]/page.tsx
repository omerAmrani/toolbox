'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { SEMESTER_HE } from '@/lib/status';
import { streamSSE } from '@/lib/sse';
import { useToast } from '@/app/components/Toast';
import { Status, fmtDateLong } from '@/app/components/Status';
import {
  getClassColor,
  classIcon,
  isClassArchived,
  setClassArchived,
  isLectureArchived,
  setLectureArchived,
} from '@/lib/classMeta';

interface ClassInfo {
  id: string;
  name: string;
  semester?: string | null;
  year?: number | null;
  opalCourseUrl?: string | null;
}

interface Lecture {
  id: string;
  name: string;
  lectureDate?: string | null;
  status: string;
}

const IN_FLIGHT = new Set(['transcribing', 'summarizing', 'processing']);

export default function ClassDetailPage() {
  const params = useParams<{ classId: string }>();
  const router = useRouter();
  const classId = params.classId;
  const { show: showToast, element: toastEl } = useToast();

  const [cls, setCls] = useState<ClassInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [opalUrl, setOpalUrl] = useState('');
  const [editingUrl, setEditingUrl] = useState(false);
  const [lectures, setLectures] = useState<Lecture[] | null>(null);
  const [archivedRefresh, setArchivedRefresh] = useState(0);
  const [classArchivedState, setClassArchivedState] = useState(false);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [addLectureOpen, setAddLectureOpen] = useState(false);
  const [newLectureName, setNewLectureName] = useState('');
  const [newLectureUrl, setNewLectureUrl] = useState('');
  const [addLectureSubmitting, setAddLectureSubmitting] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadClass = useCallback(async () => {
    try {
      const all: ClassInfo[] = await fetch(apiUrl('/api/classes')).then((r) => r.json());
      const found = all.find((c) => c.id === classId);
      if (!found) {
        setNotFound(true);
        return;
      }
      setCls(found);
      setOpalUrl(found.opalCourseUrl || '');
      setClassArchivedState(isClassArchived(found.id));
      document.title = `${found.name} — האוניברסיטה הפתוחה`;
    } catch {
      setNotFound(true);
    }
  }, [classId]);

  const loadLectures = useCallback(async () => {
    try {
      const data: Lecture[] = await fetch(
        apiUrl(`/api/classes/${classId}/lectures`),
      ).then((r) => r.json());
      setLectures(data);
    } catch {
      setLectures([]);
    }
  }, [classId]);

  useEffect(() => {
    loadClass();
    loadLectures();
  }, [loadClass, loadLectures]);

  useEffect(() => {
    if (!lectures) return;
    const hasInFlight = lectures.some(
      (l) => IN_FLIGHT.has(l.status) || (l.status === 'pending' && runningIds.has(l.id)),
    );
    if (hasInFlight && !pollTimerRef.current) {
      pollTimerRef.current = setInterval(loadLectures, 5000);
    } else if (!hasInFlight && pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [lectures, runningIds, loadLectures]);

  const orderedLectures = useMemo(() => {
    if (!lectures) return [] as (Lecture & { n: number })[];
    const visible = lectures.filter((l) => !isLectureArchived(l.id));
    void archivedRefresh;
    const sorted = [...visible].sort((a, b) => {
      const da = a.lectureDate ? new Date(a.lectureDate).getTime() : 0;
      const db = b.lectureDate ? new Date(b.lectureDate).getTime() : 0;
      if (da !== db) return da - db;
      return a.name.localeCompare(b.name, 'he');
    });
    return sorted.map((l, i) => ({ ...l, n: i + 1 }));
  }, [lectures, archivedRefresh]);

  const summarizedCount = orderedLectures.filter(
    (l) => l.status === 'summarized' || l.status === 'done',
  ).length;

  const saveOpalUrl = async () => {
    const r = await fetch(apiUrl(`/api/classes/${classId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opalCourseUrl: opalUrl.trim() }),
    });
    if (r.ok) {
      showToast('קישור OPAL נשמר');
      setEditingUrl(false);
      if (cls) setCls({ ...cls, opalCourseUrl: opalUrl.trim() });
    } else {
      showToast('שגיאה בשמירה', true);
    }
  };

  const syncNow = async () => {
    try {
      showToast('סנכרון התחיל');
      await streamSSE('/api/classes/sync', {}, () => {});
      showToast('סנכרון הסתיים');
      loadLectures();
    } catch {
      showToast('שגיאה בסנכרון', true);
    }
  };

  const toggleArchiveClass = () => {
    const next = !classArchivedState;
    setClassArchived(classId, next);
    setClassArchivedState(next);
    showToast(next ? 'הקורס בארכיון' : 'הקורס שוחזר');
  };

  const deleteClass = async () => {
    if (!confirm('למחוק את הקורס וכל ההרצאות שלו?')) return;
    const r = await fetch(apiUrl(`/api/classes/${classId}`), { method: 'DELETE' });
    if (r.ok) {
      showToast('הקורס נמחק');
      router.push('/classes');
    } else {
      showToast('שגיאה במחיקה', true);
    }
  };

  const addLecture = async () => {
    if (!newLectureName.trim()) return;
    setAddLectureSubmitting(true);
    try {
      await fetch(apiUrl(`/api/classes/${classId}/lectures`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newLectureName.trim(), url: newLectureUrl.trim() }),
      });
      setAddLectureOpen(false);
      setNewLectureName('');
      setNewLectureUrl('');
      loadLectures();
    } finally {
      setAddLectureSubmitting(false);
    }
  };

  const runPipeline = async (lectureId: string) => {
    setRunningIds((s) => new Set(s).add(lectureId));
    try {
      await streamSSE(
        `/api/classes/${classId}/lectures/${lectureId}/transcribe`,
        {},
        (ev) => {
          if (ev.type === 'aborted') throw new Error('aborted');
          if (ev.type === 'error') throw new Error(String(ev.message));
        },
      );
      await streamSSE(
        `/api/classes/${classId}/lectures/${lectureId}/summarize`,
        {},
        (ev) => {
          if (ev.type === 'aborted') throw new Error('aborted');
          if (ev.type === 'error') throw new Error(String(ev.message));
        },
      );
      showToast('הסיכום הושלם!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה';
      if (msg === 'aborted') showToast('הפעולה בוטלה');
      else showToast(msg, true);
    } finally {
      setRunningIds((s) => {
        const next = new Set(s);
        next.delete(lectureId);
        return next;
      });
      loadLectures();
    }
  };

  const runSummarize = async (lectureId: string) => {
    setRunningIds((s) => new Set(s).add(lectureId));
    try {
      await streamSSE(
        `/api/classes/${classId}/lectures/${lectureId}/summarize`,
        {},
        (ev) => {
          if (ev.type === 'aborted') throw new Error('aborted');
          if (ev.type === 'error') throw new Error(String(ev.message));
        },
      );
      showToast('הסיכום הושלם');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה';
      if (msg === 'aborted') showToast('הפעולה בוטלה');
      else showToast(msg, true);
    } finally {
      setRunningIds((s) => {
        const next = new Set(s);
        next.delete(lectureId);
        return next;
      });
      loadLectures();
    }
  };

  const retryLecture = async (lectureId: string) => {
    const r = await fetch(
      apiUrl(`/api/classes/${classId}/lectures/${lectureId}/retry`),
      { method: 'POST' },
    );
    if (r.ok) {
      showToast('הופעל מחדש');
      loadLectures();
    } else {
      showToast('שגיאה', true);
    }
  };

  const skipLecture = async (lectureId: string, currentStatus: string) => {
    const route = currentStatus === 'skipped' ? 'unskip' : 'skip';
    const r = await fetch(
      apiUrl(`/api/classes/${classId}/lectures/${lectureId}/${route}`),
      { method: 'POST' },
    );
    if (r.ok) {
      showToast(route === 'skip' ? 'דולג' : 'הוחזר');
      loadLectures();
    } else {
      showToast('שגיאה', true);
    }
  };

  const archiveLecture = (lectureId: string) => {
    const next = !isLectureArchived(lectureId);
    setLectureArchived(lectureId, next);
    setArchivedRefresh((n) => n + 1);
    showToast(next ? 'בארכיון' : 'שוחזר');
  };

  const deleteLecture = async (lectureId: string) => {
    if (!confirm('למחוק את ההרצאה?')) return;
    const r = await fetch(
      apiUrl(`/api/classes/${classId}/lectures/${lectureId}`),
      { method: 'DELETE' },
    );
    if (r.ok) {
      showToast('נמחק');
      loadLectures();
    } else {
      showToast('שגיאה', true);
    }
  };

  if (notFound) {
    return <div className="page">קורס לא נמצא</div>;
  }
  if (!cls) {
    return <div className="page">טוען...</div>;
  }

  const meta = [cls.semester ? SEMESTER_HE[cls.semester] || cls.semester : '', cls.year || '']
    .filter(Boolean)
    .join(' ');
  const color = getClassColor(cls.id);

  return (
    <div className="page fade-in">
      <button
        className="btn btn--ghost btn--sm"
        style={{ marginBottom: 'var(--gap-lg)' }}
        onClick={() => router.push('/classes')}
      >
        ← חזרה לקורסים
      </button>

      <div className="detail-h" data-color={color}>
        <div className="detail-h__mark">{classIcon(cls.name)}</div>
        <div className="detail-h__body">
          <div className="detail-h__code">— · האוניברסיטה הפתוחה</div>
          <h1 className="detail-h__title">{cls.name}</h1>
          <div className="detail-h__meta">
            {meta && (
              <>
                <span>{meta}</span>
                <span style={{ opacity: 0.4 }}>·</span>
              </>
            )}
            <span>{lectures?.length ?? 0} הרצאות</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{summarizedCount} מסוכמות</span>
          </div>
        </div>
        <div className="detail-h__actions">
          <button
            className="btn btn--ghost btn--sm"
            onClick={syncNow}
            title="סנכרון הרצאות חדשות"
          >
            ⟳ סנכרן
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={toggleArchiveClass}
            title={classArchivedState ? 'שחזר מארכיון' : 'העבר לארכיון'}
          >
            {classArchivedState ? '↺' : '🗄'}
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={deleteClass}
            title="מחק קורס"
          >
            🗑
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 'var(--gap-lg)' }}>
        {editingUrl ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="url"
              dir="ltr"
              autoFocus
              value={opalUrl}
              onChange={(e) => setOpalUrl(e.target.value)}
              onBlur={saveOpalUrl}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveOpalUrl();
                if (e.key === 'Escape') {
                  setOpalUrl(cls.opalCourseUrl || '');
                  setEditingUrl(false);
                }
              }}
              placeholder="https://opal.openu.ac.il/course/..."
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid var(--line)',
                borderRadius: 8,
                background: 'var(--surface)',
                font: '0.85rem/1 var(--font-mono)',
              }}
            />
          </div>
        ) : (
          <button
            onClick={() => setEditingUrl(true)}
            style={{
              font: '0.85rem/1.4 var(--font-mono)',
              color: 'var(--muted)',
              textAlign: 'start',
              direction: 'ltr',
              cursor: 'text',
            }}
          >
            {cls.opalCourseUrl || '+ הוסף קישור OPAL'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--gap-sm)' }}>
        <button
          className="btn btn--sm"
          data-testid="add-lecture-btn"
          onClick={() => setAddLectureOpen(true)}
        >
          + הוסף הרצאה
        </button>
      </div>

      {addLectureOpen && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setAddLectureOpen(false); }}>
          <div className="modal">
            <h2 className="modal__title">הוספת הרצאה</h2>
            <div className="modal__field">
              <label>שם ההרצאה</label>
              <input
                type="text"
                data-testid="lecture-name-input"
                value={newLectureName}
                onChange={(e) => setNewLectureName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="modal__field">
              <label>קישור</label>
              <input
                type="url"
                dir="ltr"
                data-testid="lecture-url-input"
                value={newLectureUrl}
                onChange={(e) => setNewLectureUrl(e.target.value)}
              />
            </div>
            <div className="modal__actions">
              <button className="btn btn--ghost btn--sm" onClick={() => setAddLectureOpen(false)} disabled={addLectureSubmitting}>ביטול</button>
              <button className="btn" data-testid="add-lecture-submit" onClick={addLecture} disabled={addLectureSubmitting}>
                {addLectureSubmitting ? '...' : 'הוסף'}
              </button>
            </div>
          </div>
        </div>
      )}

      {lectures === null ? (
        <div style={{ color: 'var(--muted)' }}>טוען...</div>
      ) : orderedLectures.length === 0 ? (
        <div style={{ color: 'var(--muted)', padding: 'var(--gap-lg) 0' }}>
          אין הרצאות עדיין. נסה לסנכרן את הקורס.
        </div>
      ) : (
        <div className="timeline">
          {orderedLectures.map((l) => {
            const current = IN_FLIGHT.has(l.status);
            const failed = l.status === 'failed' || l.status === 'error' || l.status === 'aborted';
            const showProgress = l.status === 'transcribing' || l.status === 'summarizing' || l.status === 'processing';
            return (
              <div
                key={l.id}
                className="tl-item"
                data-testid="lecture-row"
                data-status={l.status}
                data-current={current ? '' : undefined}
              >
                <div className="tl-item__dot" />
                <article
                  className="lec-card"
                  data-current={current ? '' : undefined}
                >
                  <div className="lec-card__num">{String(l.n).padStart(2, '0')}</div>
                  <div>
                    <a
                      className="lecture-link"
                      href={`/classes/${classId}/lectures/${l.id}`}
                      onClick={(e) => { e.preventDefault(); router.push(`/classes/${classId}/lectures/${l.id}`); }}
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      <div className="lec-card__title">{l.name}</div>
                    </a>
                    <div className="lec-card__meta">
                      <span>{fmtDateLong(l.lectureDate)}</span>
                      <span style={{ opacity: 0.4 }}>·</span>
                      <Status s={l.status} />
                    </div>
                  </div>
                  <div className="lec-card__actions">
                    {l.status === 'pending' && (
                      <button
                        className="btn btn--sm"
                        data-testid="run-pipeline-btn"
                        onClick={() => runPipeline(l.id)}
                        title="הפעל pipeline"
                      >
                        ▶ הפעל
                      </button>
                    )}
                    {l.status === 'transcribed' && (
                      <button
                        className="btn btn--sm"
                        onClick={() => runSummarize(l.id)}
                        title="סכם"
                      >
                        ▶ סכם
                      </button>
                    )}
                    {failed && (
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => retryLecture(l.id)}
                        title="נסה שנית"
                      >
                        ↻ נסה שנית
                      </button>
                    )}
                    {l.status === 'skipped' && (
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => skipLecture(l.id, l.status)}
                        title="בטל דילוג"
                      >
                        ↺ בטל דילוג
                      </button>
                    )}
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => archiveLecture(l.id)}
                      title="העבר לארכיון"
                    >
                      🗄
                    </button>
                    <button
                      className="btn btn--ghost btn--sm"
                      data-testid="delete-lecture-btn"
                      onClick={() => deleteLecture(l.id)}
                      title="מחק"
                    >
                      🗑
                    </button>
                  </div>
                  {showProgress && (
                    <div className="lec-card__progress">
                      <span style={{ width: l.status === 'summarizing' ? '70%' : '40%' }} />
                    </div>
                  )}
                </article>
              </div>
            );
          })}
        </div>
      )}

      {toastEl}
    </div>
  );
}
