'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { marked } from 'marked';
import { apiUrl } from '@/lib/api';
import { streamSSE } from '@/lib/sse';
import { useToast } from '@/app/components/Toast';
import { BackendSelect } from '@/app/components/BackendSelect';
import { QASection } from '@/app/components/QASection';
import type { QAState } from '@/app/components/QASection';
import type { Backend } from '@/app/components/BackendSelect';
import { Status, fmtDateLong } from '@/app/components/Status';

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
  const [className, setClassName] = useState<string>('');
  const [lectures, setLectures] = useState<LectureListItem[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [summary, setSummary] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [history, setHistory] = useState<SummaryHistory>({ versions: [], currentSummary: null });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [qaOpen, setQaOpen] = useState(false);
  const [qa, setQa] = useState<QAState | null>(null);
  const [qaSubmitting, setQaSubmitting] = useState(false);
  const [qaAnswers, setQaAnswers] = useState<string[]>([]);
  const [backend, setBackend] = useState<Backend>('claude');
  const [jobActive, setJobActive] = useState(false);
  const [currentJobType, setCurrentJobType] = useState<JobType | null>(null);
  const [actionLabel, setActionLabel] = useState('🔄 סכם מחדש');
  const [retranscribeLabel, setRetranscribeLabel] = useState('↻ תמלל מחדש');
  const [retranscribeTestLabel, setRetranscribeTestLabel] = useState('🧪 תמלל 30 דקות');
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

  const loadClassName = useCallback(async () => {
    try {
      const data: { name?: string } = await fetch(apiUrl(`/api/classes/${classId}`)).then((r) =>
        r.json(),
      );
      if (data?.name) setClassName(data.name);
    } catch {
      /* ignore */
    }
  }, [classId]);

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
    loadClassName();
    loadLectures();
  }, [loadLecture, loadClassName, loadLectures]);

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
    const next = !transcriptOpen;
    setTranscriptOpen(next);
    if (next && transcript === null) {
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
      loadLecture();
      loadHistory();
    }
  };

  const runRetranscribe = async (test = false) => {
    if (jobActive) return;
    setJobActive(true);
    setCurrentJobType('transcribe');
    const setLbl = test ? setRetranscribeTestLabel : setRetranscribeLabel;
    const restoreLbl = test ? '🧪 תמלל 30 דקות' : '↻ תמלל מחדש';
    try {
      await streamSSE(
        `/api/classes/${classId}/lectures/${lectureId}/transcribe`,
        test ? { test: true } : {},
        (ev) => {
          if (ev.type === 'progress') setLbl(`⏳ ${String(ev.message)}`);
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
      setTranscriptOpen(true);
      loadLecture();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה';
      if (msg === 'aborted') showToast('הפעולה בוטלה');
      else showToast(msg, true);
      loadLecture();
    } finally {
      setJobActive(false);
      setCurrentJobType(null);
      setLbl(restoreLbl);
    }
  };

  const deleteLecture = async () => {
    if (!confirm('למחוק את ההרצאה וכל הקבצים שלה?')) return;
    const r = await fetch(apiUrl(`/api/classes/${classId}/lectures/${lectureId}`), {
      method: 'DELETE',
    });
    if (r.ok) router.push(`/classes/${classId}`);
    else showToast('שגיאה במחיקה', true);
  };

  const copyToClipboard = async () => {
    if (!summary) return;
    await navigator.clipboard.writeText(summary);
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

  const viewSummaryVersion = async (summaryId: string) => {
    try {
      const r = await fetch(
        apiUrl(`/api/classes/${classId}/lectures/${lectureId}/summaries/${summaryId}`),
      );
      if (!r.ok) throw new Error();
      setSummary(await r.text());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      showToast('שגיאה בטעינת סיכום', true);
    }
  };

  const setCurrentSummaryVersion = async (summaryId: string) => {
    try {
      await fetch(
        apiUrl(`/api/classes/${classId}/lectures/${lectureId}/summaries/${summaryId}/current`),
        { method: 'PUT' },
      );
      await viewSummaryVersion(summaryId);
      await loadHistory();
      showToast('הסיכום הוגדר כנוכחי');
    } catch {
      showToast('שגיאה', true);
    }
  };

  const deleteSummaryVersion = async (summaryId: string) => {
    if (!confirm('למחוק סיכום זה?')) return;
    try {
      await fetch(
        apiUrl(`/api/classes/${classId}/lectures/${lectureId}/summaries/${summaryId}`),
        { method: 'DELETE' },
      );
      await loadHistory();
      if (summaryId === history.currentSummary) {
        const next: SummaryHistory = await fetch(
          apiUrl(`/api/classes/${classId}/lectures/${lectureId}/summaries`),
        ).then((r) => r.json());
        if (next.currentSummary) await viewSummaryVersion(next.currentSummary);
        else setSummary('');
      }
      showToast('הסיכום נמחק');
    } catch {
      showToast('שגיאה במחיקה', true);
    }
  };

  const loadQA = async () => {
    try {
      const data: QAState = await fetch(
        apiUrl(`/api/classes/${classId}/lectures/${lectureId}/qa`),
      ).then((r) => r.json());
      setQa(data);
      const last = data.rounds[data.rounds.length - 1];
      if (last && last.feedback.length === 0) {
        setQaAnswers(new Array(last.questions.length).fill(''));
      }
    } catch {
      showToast('שגיאה בטעינת Q&A', true);
    }
  };

  const toggleQA = () => {
    const next = !qaOpen;
    setQaOpen(next);
    if (next && qa === null) loadQA();
  };

  const startNewQARound = async () => {
    try {
      const data: { questions?: string[]; error?: string; roundIndex?: number } = await fetch(
        apiUrl(`/api/classes/${classId}/lectures/${lectureId}/qa/generate`),
        { method: 'POST' },
      ).then((r) => r.json());
      if (data.error) throw new Error(data.error);
      await loadQA();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה';
      showToast(msg, true);
    }
  };

  const submitAnswers = async () => {
    if (!qa) return;
    const lastIdx = qa.rounds.length - 1;
    setQaSubmitting(true);
    try {
      const data: { error?: string } = await fetch(
        apiUrl(`/api/classes/${classId}/lectures/${lectureId}/qa/answer`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roundIndex: lastIdx, answers: qaAnswers }),
        },
      ).then((r) => r.json());
      if (data.error) throw new Error(data.error);
      await loadQA();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה';
      showToast(msg, true);
    } finally {
      setQaSubmitting(false);
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
          <div className="lec-h__eye">
            <a
              href={`/classes/${classId}`}
              onClick={(e) => {
                e.preventDefault();
                router.push(`/classes/${classId}`);
              }}
              style={{ color: 'inherit' }}
            >
              {className || 'קורס'}
            </a>
          </div>
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
          {prevLecture && (
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => router.push(`/classes/${classId}/lectures/${prevLecture.id}`)}
              title={prevLecture.name}
            >
              ← הקודמת
            </button>
          )}
          {nextLecture && (
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => router.push(`/classes/${classId}/lectures/${nextLecture.id}`)}
              title={nextLecture.name}
            >
              הבאה →
            </button>
          )}
          <button className="btn btn--ghost btn--sm" onClick={toggleTranscript}>
            📜 תמלול
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => setHistoryOpen((o) => !o)}>
            🕓 גרסאות {history.versions.length ? `(${history.versions.length})` : ''}
          </button>
          <button className="btn btn--ghost btn--sm" onClick={downloadMd} disabled={!summary}>
            ↗ ייצוא
          </button>
        </div>
      </div>

      <div className="lec-grid lec-grid--split">
        <div>
          {summary ? (
            <>
              <div className="summary-toolbar" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {streaming && (
                  <span className="streaming-badge">
                    <span className="dot" /> מסכם...
                  </span>
                )}
                <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8 }}>
                  <button className="btn btn--ghost btn--sm" onClick={copyToClipboard}>
                    העתק
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={downloadMd}>
                    הורד .md
                  </button>
                </div>
              </div>
              <div
                className="summary"
                data-testid="summary-body"
                dangerouslySetInnerHTML={{ __html: summaryHtml }}
              />
            </>
          ) : (
            <div className="summary" style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ color: 'var(--muted)', marginBottom: 16 }}>אין סיכום עדיין</p>
              <button className="btn" data-testid="summarize-btn" onClick={runSummarize}>
                ▶ סכם עכשיו
              </button>
            </div>
          )}

          {historyOpen && (
            <section className="lec-aside__meta" style={{ marginTop: 24 }}>
              <div className="lec-aside__title">היסטוריית סיכומים</div>
              {history.versions.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                  אין סיכומים שמורים
                </div>
              ) : (
                history.versions.map((v) => {
                  const isCurrent = v.id === history.currentSummary;
                  const date = new Date(v.date).toLocaleString('he-IL');
                  return (
                    <div
                      key={v.id}
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        padding: '10px 0',
                        borderTop: '1px dashed var(--line-2)',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.85rem' }}>
                          {isCurrent && (
                            <span
                              className="status status--summarized"
                              style={{ fontSize: '0.7rem', marginInlineEnd: 6 }}
                            >
                              נוכחי
                            </span>
                          )}
                          {date}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                          {v.backend}
                          {v.model ? ` · ${v.model}` : ''}
                        </div>
                      </div>
                      <button className="btn btn--ghost btn--sm" onClick={() => viewSummaryVersion(v.id)}>
                        הצג
                      </button>
                      {!isCurrent && (
                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() => setCurrentSummaryVersion(v.id)}
                        >
                          הגדר כנוכחי
                        </button>
                      )}
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => deleteSummaryVersion(v.id)}
                      >
                        מחק
                      </button>
                    </div>
                  );
                })
              )}
            </section>
          )}

          {transcriptOpen && (
            <section className="lec-aside__meta" style={{ marginTop: 24 }}>
              <div className="lec-aside__title">תמלול מלא</div>
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
            </section>
          )}

          {lecture?.currentSummary && (
            <section className="qa qa--inline" style={{ marginTop: 24 }}>
              <div className="qa__h">
                <h2 className="qa__title">🧠 שאלות ותשובות</h2>
                <button className="btn btn--ghost btn--sm" onClick={toggleQA}>
                  {qaOpen ? 'סגור' : 'פתח'}
                </button>
              </div>
              {qaOpen && (
                <QASection
                  qa={qa}
                  answers={qaAnswers}
                  onAnswerChange={(i, v) => {
                    const next = [...qaAnswers];
                    next[i] = v;
                    setQaAnswers(next);
                  }}
                  onStartNewRound={startNewQARound}
                  onSubmit={submitAnswers}
                  submitting={qaSubmitting}
                />
              )}
            </section>
          )}
        </div>

        <aside className="lec-aside">
          <div className="lec-aside__meta">
            <div className="lec-aside__title">פרטי ההרצאה</div>
            <dl>
              <div className="lec-aside__row">
                <dt>תאריך</dt>
                <dd>{headerDate || '—'}</dd>
              </div>
              <div className="lec-aside__row">
                <dt>תמלול</dt>
                <dd>{lecture?.whisperBackend || '—'}</dd>
              </div>
              <div className="lec-aside__row">
                <dt>סיכום</dt>
                <dd>
                  {lecture?.summarizeBackend
                    ? `${lecture.summarizeBackend}${lecture.summarizeModel ? ` · ${lecture.summarizeModel}` : ''}`
                    : '—'}
                </dd>
              </div>
              <div className="lec-aside__row">
                <dt>סוכם בתאריך</dt>
                <dd>
                  {lecture?.summarizedAt
                    ? new Date(lecture.summarizedAt).toLocaleString('he-IL')
                    : '—'}
                </dd>
              </div>
              {summary && (
                <div className="lec-aside__row">
                  <dt>זמן קריאה</dt>
                  <dd>~{readingMinutes} דקות</dd>
                </div>
              )}
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
              <button
                className="btn"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={runSummarize}
                disabled={jobActive}
              >
                {actionLabel}
              </button>
              <button
                className="btn btn--ghost btn--sm"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => runRetranscribe(false)}
                disabled={jobActive}
              >
                {retranscribeLabel}
              </button>
              <button
                className="btn btn--ghost btn--sm"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => runRetranscribe(true)}
                disabled={jobActive}
              >
                {retranscribeTestLabel}
              </button>
              {jobActive && (
                <button
                  className="btn"
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    background: 'var(--st-error)',
                    color: 'white',
                  }}
                  onClick={stopJob}
                >
                  ⏹ עצור
                </button>
              )}
              <hr style={{ border: 0, borderTop: '1px dashed var(--line-2)', margin: '4px 0' }} />
              <button
                className="btn btn--ghost btn--sm"
                style={{ width: '100%', justifyContent: 'center', color: 'var(--st-error)' }}
                onClick={deleteLecture}
              >
                🗑 מחק הרצאה
              </button>
            </div>
          </div>
        </aside>
      </div>

      {toastEl}
    </div>
  );
}
