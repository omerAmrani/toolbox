'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { marked } from 'marked';
import { apiUrl, deleteResource } from '@/lib/api';
import { streamSSE } from '@/lib/sse';
import { useToast } from '@/app/components/Toast';
import { BackendSelect } from '@/app/components/BackendSelect';
import type { Backend } from '@/app/components/BackendSelect';
import { Status, fmtDateLong } from '@/app/components/Status';
import { Button } from '@/app/components/Button';

interface LectureMeta {
  id: string;
  name: string;
  lectureDate?: string | null;
  status: string;
  whisperBackend?: string | null;
  summarizeBackend?: string | null;
  summarizeModel?: string | null;
  summarizedAt?: string | null;
  currentSummary?: string | null;
}

interface LectureListItem {
  id: string;
  name: string;
  lectureDate?: string | null;
  addedAt: string;
}

interface SummaryVersion {
  id: string;
  date: string;
  backend: string;
  model?: string | null;
}

interface SummaryHistory {
  versions: SummaryVersion[];
  currentSummary: string | null;
}

type JobType = 'transcribe' | 'summarize';

export default function LecturePage() {
  const params = useParams<{ classId: string; lectureId: string }>();
  const router = useRouter();
  const classId = params.classId;
  const lectureId = params.lectureId;
  const { show: showToast, element: toastEl } = useToast();

  const [lecture, setLecture] = useState<LectureMeta | null>(null);
  const [lectures, setLectures] = useState<LectureListItem[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [summary, setSummary] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [history, setHistory] = useState<SummaryHistory>({ versions: [], currentSummary: null });
  const [viewedSummaryId, setViewedSummaryId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'summary' | 'transcript'>('summary');
  const [transcript, setTranscript] = useState<string | null>(null);
  const [backend, setBackend] = useState<Backend>('claude');
  const [jobActive, setJobActive] = useState(false);
  const [currentJobType, setCurrentJobType] = useState<JobType | null>(null);
  const [actionLabel, setActionLabel] = useState('🔄 סכם מחדש');
  const [retranscribeLabel, setRetranscribeLabel] = useState('↻ תמלל מחדש');
  const [progressPct, setProgressPct] = useState(0);
  const streamBufferRef = useRef('');

  const loadLecture = useCallback(async () => {
    try {
      const data: LectureMeta & { error?: string } = await fetch(
        apiUrl(`/api/classes/${classId}/lectures/${lectureId}/status`),
      ).then((r) => r.json());
      if (!data || data.error) {
        setNotFound(true);
        return;
      }
      setLecture(data);
      document.title = `${data.name} — האוניברסיטה הפתוחה`;
    } catch {
      setNotFound(true);
    }
  }, [classId, lectureId]);

  const loadLectures = useCallback(async () => {
    try {
      const data: LectureListItem[] = await fetch(apiUrl(`/api/classes/${classId}/lectures`)).then((r) => r.json());
      if (Array.isArray(data)) setLectures(data);
    } catch {
      /* ignore */
    }
  }, [classId]);

  const loadSummary = useCallback(async () => {
    try {
      const r = await fetch(apiUrl(`/api/classes/${classId}/lectures/${lectureId}/summary`));
      if (!r.ok) return;
      setSummary(await r.text());
    } catch {
      /* ignore */
    }
  }, [classId, lectureId]);

  const loadHistory = useCallback(async () => {
    try {
      const data: SummaryHistory = await fetch(
        apiUrl(`/api/classes/${classId}/lectures/${lectureId}/summaries`),
      ).then((r) => r.json());
      setHistory(data);
    } catch {
      /* ignore */
    }
  }, [classId, lectureId]);

  useEffect(() => {
    loadLecture();
    loadLectures();
  }, [loadLecture, loadLectures]);

  useEffect(() => {
    if (!lecture) return;
    if (lecture.status === 'summarized') loadSummary();
    loadHistory();
  }, [lecture, loadSummary, loadHistory]);

  useEffect(() => {
    const onScroll = () => {
      const sc = document.documentElement.scrollTop || document.body.scrollTop;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgressPct(max > 0 ? Math.min(100, (sc / max) * 100) : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const summaryHtml = useMemo(
    () => (summary ? (marked.parse(summary) as string) : ''),
    [summary],
  );

  const readingMinutes = useMemo(() => {
    if (!summary) return 0;
    const words = summary.trim().split(/\s+/).length;
    return Math.max(1, Math.round(words / 200));
  }, [summary]);

  const { prevLecture, nextLecture } = useMemo(() => {
    const idx = lectures.findIndex((l) => l.id === lectureId);
    if (idx === -1) return { prevLecture: null, nextLecture: null };
    return {
      prevLecture: idx > 0 ? lectures[idx - 1] : null,
      nextLecture: idx < lectures.length - 1 ? lectures[idx + 1] : null,
    };
  }, [lectures, lectureId]);

  const toggleTranscript = async () => {
    if (activeView === 'transcript') {
      setActiveView('summary');
      return;
    }
    setActiveView('transcript');
    if (transcript === null) {
      try {
        const r = await fetch(apiUrl(`/api/classes/${classId}/lectures/${lectureId}/transcript`));
        setTranscript(r.ok ? await r.text() : 'אין תמלול זמין');
      } catch {
        setTranscript('אין תמלול זמין');
      }
    }
  };

  const stopJob = async () => {
    if (!currentJobType) return;
    try {
      await fetch(apiUrl(`/api/classes/${classId}/lectures/${lectureId}/abort`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: currentJobType }),
      });
    } catch {
      /* ignore */
    }
  };

  const runSummarize = async () => {
    if (jobActive) return;
    setActionLabel('⏳ מתחיל...');
    setStreaming(false);
    streamBufferRef.current = '';
    try {
      const hasTranscript = await fetch(
        apiUrl(`/api/classes/${classId}/lectures/${lectureId}/transcript`),
      ).then((r) => r.ok);

      if (!hasTranscript) {
        setJobActive(true);
        setCurrentJobType('transcribe');
        setActionLabel('⏳ מתמלל...');
        await streamSSE(
          `/api/classes/${classId}/lectures/${lectureId}/transcribe`,
          {},
          (ev) => {
            if (ev.type === 'progress') setActionLabel(`⏳ ${String(ev.message)}`);
            else if (ev.type === 'aborted') throw new Error('aborted');
            else if (ev.type === 'error') throw new Error(String(ev.message));
          },
        );
      }

      setJobActive(true);
      setCurrentJobType('summarize');
      setActionLabel('⏳ מסכם...');
      setStreaming(true);

      await streamSSE(
        `/api/classes/${classId}/lectures/${lectureId}/summarize`,
        { backend },
        (ev) => {
          if (ev.type === 'progress') {
            setActionLabel(`⏳ ${String(ev.message)}`);
          } else if (ev.type === 'token') {
            streamBufferRef.current += String(ev.token);
            setSummary(streamBufferRef.current);
          } else if (ev.type === 'done') {
            setSummary(String(ev.summary));
            setStreaming(false);
            showToast('הסיכום הושלם!');
          } else if (ev.type === 'aborted') {
            setStreaming(false);
            showToast('הפעולה בוטלה');
          } else if (ev.type === 'error') {
            throw new Error(String(ev.message));
          }
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה';
      setStreaming(false);
      if (msg !== 'aborted') showToast(msg, true);
      else showToast('הפעולה בוטלה');
    } finally {
      setJobActive(false);
      setCurrentJobType(null);
      setActionLabel('🔄 סכם מחדש');
      setViewedSummaryId(null);
      loadLecture();
      loadHistory();
    }
  };

  const runRetranscribe = async () => {
    if (jobActive) return;
    setJobActive(true);
    setCurrentJobType('transcribe');
    try {
      await streamSSE(
        `/api/classes/${classId}/lectures/${lectureId}/transcribe`,
        {},
        (ev) => {
          if (ev.type === 'progress') setRetranscribeLabel(`⏳ ${String(ev.message)}`);
          else if (ev.type === 'aborted') throw new Error('aborted');
          else if (ev.type === 'error') throw new Error(String(ev.message));
        },
      );
      showToast('התמלול הושלם!');
      try {
        const r = await fetch(apiUrl(`/api/classes/${classId}/lectures/${lectureId}/transcript`));
        if (r.ok) setTranscript(await r.text());
      } catch {
        /* ignore */
      }
      setActiveView('transcript');
      loadLecture();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה';
      if (msg === 'aborted') showToast('הפעולה בוטלה');
      else showToast(msg, true);
      loadLecture();
    } finally {
      setJobActive(false);
      setCurrentJobType(null);
      setRetranscribeLabel('↻ תמלל מחדש');
    }
  };

  const deleteLecture = async () => {
    const ok = await deleteResource(
      `/api/classes/${classId}/lectures/${lectureId}`,
      'למחוק את ההרצאה וכל הקבצים שלה?',
    );
    if (ok === null) return;
    if (ok) router.push(`/classes/${classId}`);
    else showToast('שגיאה במחיקה', true);
  };

  const copyActive = async () => {
    const text = activeView === 'transcript' ? transcript : summary;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    showToast('הועתק');
  };

  const downloadMd = () => {
    if (!summary) return;
    const blob = new Blob([summary], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'summary.md';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const viewSummary = async (summaryId: string) => {
    if (summaryId === history.currentSummary) {
      setViewedSummaryId(null);
      await loadSummary();
      setActiveView('summary');
      return;
    }
    try {
      const r = await fetch(
        apiUrl(`/api/classes/${classId}/lectures/${lectureId}/summaries/${summaryId}`),
      );
      if (!r.ok) throw new Error();
      setSummary(await r.text());
      setViewedSummaryId(summaryId);
      setActiveView('summary');
    } catch {
      showToast('שגיאה בטעינת סיכום', true);
    }
  };

  const deleteSummaryVersion = async () => {
    const id = viewedSummaryId ?? history.currentSummary;
    if (!id) return;
    const ok = await deleteResource(
      `/api/classes/${classId}/lectures/${lectureId}/summaries/${id}`,
      'למחוק סיכום זה?',
    );
    if (ok === null) return;
    try {
      const next: SummaryHistory = await fetch(
        apiUrl(`/api/classes/${classId}/lectures/${lectureId}/summaries`),
      ).then((r) => r.json());
      setHistory(next);
      setViewedSummaryId(null);
      if (next.currentSummary) await loadSummary();
      else setSummary('');
      showToast('הסיכום נמחק');
    } catch {
      showToast('שגיאה במחיקה', true);
    }
  };

  if (notFound) {
    return (
      <div className="page fade-in">
        <div className="display-h">
          <h1 className="display-h__title">הרצאה לא נמצאה</h1>
        </div>
      </div>
    );
  }

  const headerDate = lecture?.lectureDate ? fmtDateLong(lecture.lectureDate) : '';

  return (
    <div className="page lec-page fade-in">
      <div className="lec-progress">
        <span style={{ width: progressPct + '%' }} />
      </div>

      <div className="lec-h">
        <div>
          <h1 className="lec-h__title">{lecture?.name || 'טוען...'}</h1>
          <div className="lec-h__meta">
            {headerDate && <span>{headerDate}</span>}
            {readingMinutes > 0 && (
              <>
                <span className="dot" />
                <span>~{readingMinutes} דקות קריאה</span>
              </>
            )}
            {lecture && (
              <>
                <span className="dot" />
                <Status s={lecture.status} />
              </>
            )}
          </div>
        </div>
        <div className="lec-h__actions">
          {nextLecture && (
            <Button
              onClick={() => router.push(`/classes/${classId}/lectures/${nextLecture.id}`)}
              title={nextLecture.name}
            >
              הבאה →
            </Button>
          )}
          {prevLecture && (
            <Button
              onClick={() => router.push(`/classes/${classId}/lectures/${prevLecture.id}`)}
              title={prevLecture.name}
            >
              ← הקודמת
            </Button>
          )}
        </div>
      </div>

      <div className="lec-grid lec-grid--split">
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                className="select-field"
                value={viewedSummaryId ?? history.currentSummary ?? ''}
                onChange={(e) => e.target.value && viewSummary(e.target.value)}
              >
                {history.versions.map((v, i) => {
                  const label = v.backend === 'claude' ? 'Claude' : v.backend === 'gemini' ? 'Gemini' : 'Other';
                  const num = history.versions.length - i;
                  return (
                    <option key={v.id} value={v.id}>
                      {label} #{num}
                    </option>
                  );
                })}
              </select>
              <Button
                variant={activeView === 'transcript' ? 'primary' : 'ghost'}
                aria-pressed={activeView === 'transcript'}
                onClick={toggleTranscript}
              >
                תמלול
              </Button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {activeView === 'summary' && (
                <Button icon onClick={downloadMd} disabled={!summary} title="ייצוא">
                  ⬇
                </Button>
              )}
              <Button
                icon
                onClick={copyActive}
                disabled={!(activeView === 'transcript' ? transcript : summary)}
                title="העתק"
              >
                📋
              </Button>
              {activeView === 'summary' && summary && (
                <Button variant="danger-ghost" icon onClick={deleteSummaryVersion} title="מחק">
                  🗑
                </Button>
              )}
            </div>
          </div>

          {activeView === 'summary' &&
            (summary ? (
              <>
                {streaming && (
                  <div className="summary-toolbar" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <span className="streaming-badge">
                      <span className="dot" /> מסכם...
                    </span>
                  </div>
                )}
                <div
                  className="summary"
                  data-testid="summary-body"
                  dangerouslySetInnerHTML={{ __html: summaryHtml }}
                />
              </>
            ) : (
              <div className="summary" style={{ textAlign: 'center', padding: '40px 0' }}>
                <p style={{ color: 'var(--muted)', marginBottom: 16 }}>אין סיכום עדיין</p>
                <Button variant="primary" size="md" data-testid="summarize-btn" onClick={runSummarize}>
                  ▶ סכם עכשיו
                </Button>
              </div>
            ))}

          {activeView === 'transcript' && (
            <div
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: '0.85rem',
                color: 'var(--muted)',
                maxHeight: 400,
                overflow: 'auto',
              }}
            >
              {transcript ?? 'טוען תמלול...'}
            </div>
          )}
        </div>

        <aside className="lec-aside">
          <div className="lec-aside__meta">
            <div className="lec-aside__title">פרטי הסיכום</div>
            <dl>
              <div className="lec-aside__row">
                <dt>סיכום</dt>
                <dd>{lecture?.summarizeModel || '—'}</dd>
              </div>
              <div className="lec-aside__row">
                <dt>עודכן</dt>
                <dd>{fmtDateLong(lecture?.summarizedAt)}</dd>
              </div>
            </dl>
          </div>

          <div className="lec-aside__meta">
            <div className="lec-aside__title">פעולות</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label
                style={{ fontSize: '0.78rem', color: 'var(--muted)' }}
              >
                מודל AI
              </label>
              <BackendSelect
                value={backend}
                onChange={setBackend}
                className="select-field select-field--full"
              />
              <Button variant="primary" block onClick={runSummarize} disabled={jobActive}>
                {actionLabel}
              </Button>
              <Button block onClick={runRetranscribe} disabled={jobActive}>
                {retranscribeLabel}
              </Button>
              {jobActive && (
                <Button variant="danger" size="md" block onClick={stopJob}>
                  ⏹ עצור
                </Button>
              )}
              <Button variant="danger-ghost" block onClick={deleteLecture}>
                🗑 מחק הרצאה
              </Button>
            </div>
          </div>
        </aside>
      </div>

      {toastEl}
    </div>
  );
}
