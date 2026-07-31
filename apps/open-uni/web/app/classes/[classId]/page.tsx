'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, deleteResource } from '@/lib/api';
import { SEMESTER_HE } from '@/lib/status';
import { streamSSE } from '@/lib/sse';
import { requireCredentials } from '@/lib/credentials';
import { useToast } from '@/app/components/Toast';
import { Status, fmtDateLong } from '@/app/components/Status';
import { getClassColor, classIcon } from '@/lib/classMeta';
import { Button } from '@/app/components/Button';
import NewCourseModal from '@/app/components/NewCourseModal';

interface ClassInfo {
  id: string;
  name: string;
  semester?: string | null;
  year?: number | null;
  opalCourseUrl?: string | null;
  code?: string | null;
}

interface Lecture {
  id: string;
  name: string;
  lectureDate?: string | null;
  status: string;
  lastError?: string | null;
}

const IN_FLIGHT = new Set(['transcribing', 'summarizing']);

export default function ClassDetailPage() {
  const params = useParams<{ classId: string }>();
  const router = useRouter();
  const classId = params.classId;
  const { show: showToast, element: toastEl } = useToast();

  const [cls, setCls] = useState<ClassInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [lectures, setLectures] = useState<Lecture[] | null>(null);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadClass = useCallback(async () => {
    try {
      const r = await apiFetch('/api/classes');
      if (!r.ok) throw new Error('failed to load classes');
      const all: ClassInfo[] = await r.json();
      const found = all.find((c) => c.id === classId);
      if (!found) {
        setNotFound(true);
        return;
      }
      setCls(found);
      document.title = `${found.name} — האוניברסיטה הפתוחה`;
    } catch {
      setNotFound(true);
    }
  }, [classId]);

  const loadLectures = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/classes/${classId}/lectures`);
      if (!r.ok) throw new Error('failed to load lectures');
      const data: Lecture[] = await r.json();
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
    const sorted = [...lectures].sort((a, b) => {
      const da = a.lectureDate ? new Date(a.lectureDate).getTime() : 0;
      const db = b.lectureDate ? new Date(b.lectureDate).getTime() : 0;
      if (da !== db) return da - db;
      return a.name.localeCompare(b.name, 'he');
    });
    return sorted.map((l, i) => ({ ...l, n: i + 1 }));
  }, [lectures]);

  const summarizedCount = orderedLectures.filter(
    (l) => l.status === 'summarized' || l.status === 'done',
  ).length;

  const deleteClass = async () => {
    const ok = await deleteResource(`/api/classes/${classId}`, 'למחוק את הקורס וכל ההרצאות שלו?');
    if (ok === null) return;
    if (ok) {
      showToast('הקורס נמחק');
      router.push('/classes');
    } else {
      showToast('שגיאה במחיקה', true);
    }
  };

  const runPipeline = async (lectureId: string) => {
    setRunningIds((s) => new Set(s).add(lectureId));
    try {
      const creds = await requireCredentials();
      await streamSSE(
        `/api/classes/${classId}/lectures/${lectureId}/transcribe`,
        creds,
        (ev) => {
          if (ev.type === 'aborted') throw new Error('aborted');
          if (ev.type === 'error') throw new Error(String(ev.message));
        },
      );
      await streamSSE(
        `/api/classes/${classId}/lectures/${lectureId}/summarize`,
        creds,
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
      const creds = await requireCredentials();
      await streamSSE(
        `/api/classes/${classId}/lectures/${lectureId}/summarize`,
        creds,
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

  const deleteLecture = async (lectureId: string) => {
    const ok = await deleteResource(`/api/classes/${classId}/lectures/${lectureId}`, 'למחוק את ההרצאה?');
    if (ok === null) return;
    if (ok) {
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
      <div className="detail-h" data-color={color}>
        <div className="detail-h__mark">{classIcon(cls.name)}</div>
        <div className="detail-h__body">
          <div className="detail-h__code">{cls.code || '—'}</div>
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
          <Button icon onClick={() => setEditModalOpen(true)} title="ערוך קורס">
            ✎
          </Button>
          <Button variant="danger-ghost" icon onClick={deleteClass} title="מחק קורס">
            🗑
          </Button>
        </div>
      </div>

      <NewCourseModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        editTarget={cls}
        onCreated={() => {
          setEditModalOpen(false);
          showToast('הקורס עודכן');
          loadClass();
        }}
      />

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
            const showProgress = l.status === 'transcribing' || l.status === 'summarizing';
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
                  onClick={() => router.push(`/classes/${classId}/lectures/${l.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="lec-card__num">{String(l.n).padStart(2, '0')}</div>
                  <div>
                    <div className="lec-card__title">{l.name}</div>
                    <div className="lec-card__meta">
                      <span>{fmtDateLong(l.lectureDate)}</span>
                      <span style={{ opacity: 0.4 }}>·</span>
                      <Status s={l.status} />
                      {l.lastError && (
                        <>
                          <span style={{ opacity: 0.4 }}>·</span>
                          <span style={{ color: 'var(--error)' }}>{l.lastError}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="lec-card__actions" onClick={(e) => e.stopPropagation()}>
                    {l.status === 'pending' && (
                      <Button
                        variant="primary"
                        data-testid="run-pipeline-btn"
                        onClick={() => runPipeline(l.id)}
                        title="הפעל pipeline"
                      >
                        ▶ הפעל
                      </Button>
                    )}
                    {l.status === 'transcribed' && (
                      <Button variant="primary" onClick={() => runSummarize(l.id)} title="סכם">
                        ▶ סכם
                      </Button>
                    )}
                    <Button
                      variant="danger-ghost"
                      icon
                      data-testid="delete-lecture-btn"
                      onClick={() => deleteLecture(l.id)}
                      title="מחק"
                    >
                      🗑
                    </Button>
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
