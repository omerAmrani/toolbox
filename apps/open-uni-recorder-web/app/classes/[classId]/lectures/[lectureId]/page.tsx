'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { marked } from 'marked';
import { apiUrl } from '@/lib/api';
import { streamSSE } from '@/lib/sse';
import { PageHeader } from '@/app/components/PageHeader';
import { useToast } from '@/app/components/Toast';
import { StatusBadge } from '@/app/components/StatusBadge';
import { BackendSelect } from '@/app/components/BackendSelect';
import { QASection } from '@/app/components/QASection';
import type { QAState } from '@/app/components/QASection';
import type { Backend } from '@/app/components/BackendSelect';

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
  const classId = params.classId;
  const lectureId = params.lectureId;
  const { show: showToast, element: toastEl } = useToast();

  const [lecture, setLecture] = useState<LectureMeta | null>(null);
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
  const [retranscribeLabel, setRetranscribeLabel] = useState('🔄 תמלל מחדש');
  const [retranscribeTestLabel, setRetranscribeTestLabel] = useState('🧪 תמלל 30 דקות (בדיקה)');
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

  const loadSummary = useCallback(async () => {
    try {
      const r = await fetch(apiUrl(`/api/classes/${classId}/lectures/${lectureId}/summary`));
      if (!r.ok) return;
      const text = await r.text();
      setSummary(text);
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
  }, [loadLecture]);

  useEffect(() => {
    if (!lecture) return;
    if (lecture.status === 'summarized') loadSummary();
    loadHistory();
  }, [lecture, loadSummary, loadHistory]);

  const toggleTranscript = async () => {
    const next = !transcriptOpen;
    setTranscriptOpen(next);
    if (next && transcript === null) {
      try {
        const r = await fetch(apiUrl(`/api/classes/${classId}/lectures/${lectureId}/transcript`));
        if (!r.ok) {
          setTranscript('אין תמלול זמין');
          return;
        }
        setTranscript(await r.text());
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
    const restoreLbl = test ? '🧪 תמלל 30 דקות (בדיקה)' : '🔄 תמלל מחדש';
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
      // refresh transcript
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
    if (r.ok) {
      window.location.href = `/classes/${classId}`;
    } else {
      showToast('שגיאה במחיקה', true);
    }
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

  const headerTitle = notFound ? 'הרצאה לא נמצאה' : lecture?.name || 'טוען...';
  const headerDate = lecture?.lectureDate
    ? new Date(lecture.lectureDate).toLocaleDateString('he-IL')
    : '';

  return (
    <div className="page-lecture">
      <PageHeader>
        <Link className="back" href={`/classes/${classId}`}>
          ← חזרה לקורס
        </Link>
        <h1>{headerTitle}</h1>
        <p>{headerDate}</p>
      </PageHeader>

      <main>
        {/* Summary column */}
        <div>
          <div className="card">
            <div className="summary-header">
              <div className="summary-title-group">
                <h2>📝 סיכום</h2>
                {streaming && (
                  <span className="streaming-badge">
                    <span className="dot" />
                    מסכם...
                  </span>
                )}
              </div>
              <div className="btn-group">
                <button className="btn btn-outline" onClick={copyToClipboard}>
                  העתק
                </button>
                <button className="btn btn-outline" onClick={downloadMd}>
                  הורד .md
                </button>
              </div>
            </div>

            {summary ? (
              <div
                className="summary-body"
                data-testid="summary-body"
                dangerouslySetInnerHTML={{ __html: marked.parse(summary) as string }}
              />
            ) : (
              <div className="no-summary">
                <p>אין סיכום עדיין</p>
                <button className="btn" data-testid="summarize-btn" onClick={runSummarize}>
                  ▶ סכם עכשיו
                </button>
              </div>
            )}

            {/* Summary history */}
            <div className="transcript-toggle" onClick={() => setHistoryOpen((o) => !o)}>
              <span className={`transcript-arrow${historyOpen ? ' open' : ''}`}>▼</span>
              <span>היסטוריית סיכומים</span>
              <span
                style={{
                  marginRight: 'auto',
                  fontSize: '0.75rem',
                  color: 'var(--muted)',
                  fontWeight: 400,
                }}
              >
                {history.versions.length ? `(${history.versions.length})` : ''}
              </span>
            </div>
            {historyOpen && (
              <div>
                {history.versions.length === 0 && (
                  <div
                    style={{
                      padding: '12px 0',
                      color: 'var(--muted)',
                      fontSize: '0.85rem',
                    }}
                  >
                    אין סיכומים שמורים
                  </div>
                )}
                {history.versions.map((v) => {
                  const isCurrent = v.id === history.currentSummary;
                  const date = new Date(v.date).toLocaleString('he-IL');
                  return (
                    <div
                      key={v.id}
                      className={`history-item${isCurrent ? ' history-current' : ''}`}
                    >
                      <div className="history-item-info">
                        {isCurrent && (
                          <span
                            className="badge badge-summarized"
                            style={{ fontSize: '0.7rem', padding: '2px 7px' }}
                          >
                            נוכחי
                          </span>
                        )}
                        <span className="history-date">{date}</span>
                        <span className="history-backend">
                          {v.backend}{v.model ? ` · ${v.model}` : ''}
                        </span>
                      </div>
                      <div className="history-item-actions">
                        <button
                          className="btn btn-outline btn-xs"
                          onClick={() => viewSummaryVersion(v.id)}
                        >
                          הצג
                        </button>
                        {!isCurrent && (
                          <button
                            className="btn btn-outline btn-xs"
                            onClick={() => setCurrentSummaryVersion(v.id)}
                          >
                            הגדר כנוכחי
                          </button>
                        )}
                        <button
                          className="btn btn-danger btn-xs"
                          onClick={() => deleteSummaryVersion(v.id)}
                        >
                          מחק
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Transcript */}
            <div className="transcript-toggle" onClick={toggleTranscript}>
              <span className={`transcript-arrow${transcriptOpen ? ' open' : ''}`}>▼</span>
              <span>תמלול מלא</span>
            </div>
            {transcriptOpen && (
              <div className="transcript-body">{transcript ?? 'טוען תמלול...'}</div>
            )}

            {/* Q&A */}
            {lecture?.currentSummary && (
              <>
                <div className="transcript-toggle" onClick={toggleQA}>
                  <span className={`transcript-arrow${qaOpen ? ' open' : ''}`}>▼</span>
                  <span>🧠 שאלות ותשובות</span>
                </div>
                {qaOpen && (
                  <div style={{ padding: '16px 0' }}>
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
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="sidebar">
          <div className="card">
            <div className="card-title">פרטים</div>
            <div className="meta-item">
              <div className="meta-label">סטטוס</div>
              <div className="meta-value">
                {lecture ? <StatusBadge status={lecture.status} /> : '—'}
              </div>
            </div>
            <div className="meta-item">
              <div className="meta-label">תאריך הרצאה</div>
              <div className="meta-value">
                {lecture?.lectureDate
                  ? new Date(lecture.lectureDate).toLocaleDateString('he-IL')
                  : '—'}
              </div>
            </div>
            <div className="meta-item">
              <div className="meta-label">תמלול</div>
              <div className="meta-value">{lecture?.whisperBackend || '—'}</div>
            </div>
            <div className="meta-item">
              <div className="meta-label">סיכום</div>
              <div className="meta-value">
                {lecture?.summarizeBackend
                  ? `${lecture.summarizeBackend}${lecture.summarizeModel ? ` · ${lecture.summarizeModel}` : ''}`
                  : '—'}
              </div>
            </div>
            <div className="meta-item">
              <div className="meta-label">תאריך סיכום</div>
              <div className="meta-value">
                {lecture?.summarizedAt
                  ? new Date(lecture.summarizedAt).toLocaleString('he-IL')
                  : '—'}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">פעולות</div>
            <div className="action-stack">
              <div>
                <label className="field-label">מודל AI</label>
                <BackendSelect value={backend} onChange={setBackend} className="select-field select-field--full" />
              </div>
              <button className="btn" onClick={runSummarize} disabled={jobActive}>
                {actionLabel}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => runRetranscribe(false)}
                disabled={jobActive}
              >
                {retranscribeLabel}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => runRetranscribe(true)}
                disabled={jobActive}
              >
                {retranscribeTestLabel}
              </button>
              {jobActive && (
                <button className="btn btn-danger" onClick={stopJob}>
                  ⏹ עצור
                </button>
              )}
              <hr className="action-divider" />
              <button className="btn btn-danger" onClick={deleteLecture}>
                🗑 מחק הרצאה
              </button>
            </div>
          </div>
        </div>
      </main>

      {toastEl}
    </div>
  );
}

