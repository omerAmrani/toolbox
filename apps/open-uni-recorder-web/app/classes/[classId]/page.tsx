'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { SEMESTER_HE, STATUS_ABORT_TYPE } from '@/lib/status';
import type { Backend } from '@/app/components/BackendSelect';
import { streamSSE } from '@/lib/sse';
import { PageHeader } from '@/app/components/PageHeader';
import { Modal } from '@/app/components/Modal';
import { useToast } from '@/app/components/Toast';
import { StatusBadge } from '@/app/components/StatusBadge';
import { BackendSelect } from '@/app/components/BackendSelect';
import { EmptyState } from '@/app/components/EmptyState';

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

interface SearchResult {
  lectureId: string;
  lectureName: string;
  snippet: string;
}

interface JobState {
  message: string;
  type: 'transcribe' | 'summarize' | null;
}

export default function ClassDetailPage() {
  const params = useParams<{ classId: string }>();
  const classId = params.classId;
  const { show: showToast, element: toastEl } = useToast();

  const [cls, setCls] = useState<ClassInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [opalUrl, setOpalUrl] = useState('');
  const [lectures, setLectures] = useState<Lecture[] | null>(null);
  const [backend, setBackend] = useState<Backend>('gemini');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | 'loading' | 'error' | null>(null);
  const [running, setRunning] = useState<Map<string, JobState>>(new Map());

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newDate, setNewDate] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');

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
      document.title = `${found.name} — האוניברסיטה הפתוחה`;
    } catch {
      setNotFound(true);
    }
  }, [classId]);

  const loadLectures = useCallback(async () => {
    try {
      const data: Lecture[] = await fetch(apiUrl(`/api/classes/${classId}/lectures`)).then((r) => r.json());
      setLectures(data);
    } catch {
      setLectures([]);
    }
  }, [classId]);

  useEffect(() => {
    loadClass();
    loadLectures();
  }, [loadClass, loadLectures]);

  // Polling when there are pending lectures not actively running locally
  useEffect(() => {
    if (!lectures) return;
    const hasUntracked = lectures.some((l) => l.status === 'pending' && !running.has(l.id));
    if (hasUntracked && !pollTimerRef.current) {
      pollTimerRef.current = setInterval(loadLectures, 5000);
    } else if (!hasUntracked && pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [lectures, running, loadLectures]);

  const setRunningEntry = (id: string, entry: JobState | null) => {
    setRunning((prev) => {
      const next = new Map(prev);
      if (entry) next.set(id, entry);
      else next.delete(id);
      return next;
    });
  };

  const saveOpalUrl = async () => {
    const r = await fetch(apiUrl(`/api/classes/${classId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opalCourseUrl: opalUrl.trim() }),
    });
    if (r.ok) showToast('קישור OPAL נשמר');
    else showToast('שגיאה בשמירה', true);
  };

  const stopJob = async (lectureId: string) => {
    const job = running.get(lectureId);
    if (!job || !job.type) return;
    setRunningEntry(lectureId, { message: 'מבטל...', type: job.type });
    try {
      await fetch(apiUrl(`/api/classes/${classId}/lectures/${lectureId}/abort`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: job.type }),
      });
    } catch {
      /* ignore */
    }
  };

  const stopJobByStatus = async (lectureId: string, type: 'transcribe' | 'summarize') => {
    try {
      await fetch(apiUrl(`/api/classes/${classId}/lectures/${lectureId}/abort`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
    } catch {
      /* ignore */
    }
    await loadLectures();
  };

  const runPipeline = async (lectureId: string) => {
    if (running.has(lectureId)) return;
    setRunningEntry(lectureId, { message: 'בודק...', type: 'transcribe' });
    try {
      const [hasTranscript, hasSummary] = await Promise.all([
        fetch(apiUrl(`/api/classes/${classId}/lectures/${lectureId}/transcript`)).then((r) => r.ok),
        fetch(apiUrl(`/api/classes/${classId}/lectures/${lectureId}/summary`)).then((r) => r.ok),
      ]);

      if (!hasTranscript) {
        setRunningEntry(lectureId, { message: 'מתמלל...', type: 'transcribe' });
        await streamSSE(
          `/api/classes/${classId}/lectures/${lectureId}/transcribe`,
          {},
          (ev) => {
            if (ev.type === 'progress') {
              setRunningEntry(lectureId, { message: String(ev.message), type: 'transcribe' });
            } else if (ev.type === 'aborted') {
              throw new Error('aborted');
            } else if (ev.type === 'error') {
              throw new Error(String(ev.message));
            }
          },
        );
      }

      if (!hasSummary) {
        setRunningEntry(lectureId, { message: 'מסכם...', type: 'summarize' });
        await streamSSE(
          `/api/classes/${classId}/lectures/${lectureId}/summarize`,
          { backend },
          (ev) => {
            if (ev.type === 'progress') {
              setRunningEntry(lectureId, { message: String(ev.message), type: 'summarize' });
            } else if (ev.type === 'aborted') {
              throw new Error('aborted');
            } else if (ev.type === 'error') {
              throw new Error(String(ev.message));
            }
          },
        );
      }

      if (hasTranscript && hasSummary) {
        setRunningEntry(lectureId, { message: 'הכל קיים', type: null });
      } else {
        showToast('הסיכום הושלם!');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה';
      if (msg === 'aborted') showToast('הפעולה בוטלה');
      else showToast(msg, true);
    } finally {
      setRunningEntry(lectureId, null);
      loadLectures();
    }
  };

  const runSummarize = async (lectureId: string) => {
    if (running.has(lectureId)) return;
    setRunningEntry(lectureId, { message: 'מסכם...', type: 'summarize' });
    try {
      await streamSSE(
        `/api/classes/${classId}/lectures/${lectureId}/summarize`,
        { backend },
        (ev) => {
          if (ev.type === 'progress') {
            setRunningEntry(lectureId, { message: String(ev.message), type: 'summarize' });
          } else if (ev.type === 'aborted') {
            throw new Error('aborted');
          } else if (ev.type === 'error') {
            throw new Error(String(ev.message));
          }
        },
      );
      showToast('הסיכום הושלם!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה';
      if (msg === 'aborted') showToast('הפעולה בוטלה');
      else showToast(msg, true);
    } finally {
      setRunningEntry(lectureId, null);
      loadLectures();
    }
  };

  const doSearch = async () => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    setSearchResults('loading');
    try {
      const data: SearchResult[] = await fetch(
        apiUrl(`/api/search?q=${encodeURIComponent(q)}&classId=${classId}`),
      ).then((r) => r.json());
      setSearchResults(data);
    } catch {
      setSearchResults('error');
    }
  };

  const addLecture = async () => {
    const name = newName.trim();
    const url = newUrl.trim();
    if (!name || !url) {
      showToast('שם וקישור נדרשים', true);
      return;
    }
    const r = await fetch(apiUrl(`/api/classes/${classId}/lectures`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url, lectureDate: newDate || undefined }),
    });
    if (r.ok) {
      setAddOpen(false);
      setNewName('');
      setNewUrl('');
      setNewDate('');
      showToast('ההרצאה נוספה');
      loadLectures();
    } else {
      const err = (await r.json().catch(() => ({}))) as { error?: string };
      showToast(err.error || 'שגיאה', true);
    }
  };

  const saveLecture = async () => {
    const r = await fetch(apiUrl(`/api/classes/${classId}/lectures/${editId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), lectureDate: editDate || null }),
    });
    if (r.ok) {
      setEditOpen(false);
      showToast('נשמר');
      loadLectures();
    } else {
      showToast('שגיאה', true);
    }
  };

  const deleteLecture = async (id: string) => {
    if (!confirm('למחוק את ההרצאה?')) return;
    const r = await fetch(apiUrl(`/api/classes/${classId}/lectures/${id}`), { method: 'DELETE' });
    if (r.ok) {
      showToast('נמחק');
      loadLectures();
    } else {
      showToast('שגיאה', true);
    }
  };

  const openEditModal = (l: Lecture) => {
    setEditId(l.id);
    setEditName(l.name);
    setEditDate(l.lectureDate || '');
    setEditOpen(true);
  };

  const renderActions = (l: Lecture) => {
    const job = running.get(l.id);
    if (job) {
      return (
        <button className="btn btn-sm btn-danger" onClick={() => stopJob(l.id)}>
          ⏹ עצור
        </button>
      );
    }
    const abortType = STATUS_ABORT_TYPE[l.status];
    const btns: React.ReactNode[] = [];

    if (abortType) {
      btns.push(
        <button
          key="stop"
          className="btn btn-sm btn-danger"
          onClick={() => stopJobByStatus(l.id, abortType)}
        >
          ⏹ עצור
        </button>,
      );
    } else if (l.status === 'pending') {
      btns.push(
        <button key="run" className="btn btn-sm" onClick={() => runPipeline(l.id)}>
          ▶ סכם
        </button>,
      );
    } else if (l.status === 'transcribed') {
      btns.push(
        <button key="run" className="btn btn-sm" onClick={() => runSummarize(l.id)}>
          ▶ סכם
        </button>,
      );
    } else if (l.status === 'summarized') {
      btns.push(
        <button
          key="resum"
          className="btn btn-sm btn-outline"
          onClick={() => runSummarize(l.id)}
        >
          🔄 סכם מחדש
        </button>,
      );
      btns.push(
        <Link
          key="view"
          className="btn btn-sm btn-outline"
          href={`/classes/${classId}/lectures/${l.id}`}
        >
          👁 צפה
        </Link>,
      );
    } else if (l.status === 'error' || l.status === 'aborted' || l.status === 'failed') {
      btns.push(
        <button key="retry" className="btn btn-sm" onClick={() => runPipeline(l.id)}>
          ↩ נסה שנית
        </button>,
      );
    }
    btns.push(
      <button
        key="edit"
        className="btn btn-sm btn-outline"
        onClick={() => openEditModal(l)}
      >
        ✏️
      </button>,
    );
    btns.push(
      <button
        key="delete"
        className="btn btn-sm btn-danger"
        onClick={() => deleteLecture(l.id)}
      >
        🗑
      </button>,
    );
    return btns;
  };

  const headerTitle = notFound ? 'קורס לא נמצא' : cls?.name || 'טוען...';
  const headerMeta = cls
    ? [cls.semester ? SEMESTER_HE[cls.semester] : '', cls.year || ''].filter(Boolean).join(' ')
    : '';

  return (
    <div className="page-class-detail">
      <PageHeader>
        <Link className="back" href="/classes">
          ← חזרה לקורסים
        </Link>
        <h1>{headerTitle}</h1>
        <p>{headerMeta}</p>
      </PageHeader>

      <main>
        <div className="card">
          <div className="search-row">
            <input
              type="text"
              className="search-input"
              placeholder="חיפוש בתמלולים..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') doSearch();
              }}
            />
            <button className="btn" onClick={doSearch}>
              חפש
            </button>
          </div>
          {searchResults === 'loading' && <p className="search-msg">מחפש...</p>}
          {searchResults === 'error' && (
            <p className="search-msg search-msg--error">שגיאה בחיפוש</p>
          )}
          {Array.isArray(searchResults) && searchResults.length === 0 && (
            <p className="search-msg">לא נמצאו תוצאות</p>
          )}
          {Array.isArray(searchResults) &&
            searchResults.map((r) => (
              <Link
                key={r.lectureId}
                href={`/classes/${classId}/lectures/${r.lectureId}`}
                className="search-result-item"
                style={{ display: 'block' }}
              >
                <div className="search-result-name">{r.lectureName}</div>
                <div className="search-result-snippet">...{r.snippet}...</div>
              </Link>
            ))}
        </div>

        {cls && (
          <div className="card">
            <div className="section-title">קישור OPAL לזיהוי אוטומטי</div>
            <div className="opal-row">
              <input
                type="url"
                className="form-input"
                dir="ltr"
                placeholder="https://opal.openu.ac.il/course/view.php?id=..."
                value={opalUrl}
                onChange={(e) => setOpalUrl(e.target.value)}
              />
              <button className="btn" onClick={saveOpalUrl}>
                שמור
              </button>
            </div>
            <p className="opal-hint">
              קישור לדף הקורס ב-OPAL — נדרש לזיהוי אוטומטי של הרצאות חדשות
            </p>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h2>הרצאות</h2>
            <div className="header-actions">
              <BackendSelect value={backend} onChange={setBackend} />
              <button className="btn" onClick={() => setAddOpen(true)}>
                + הוסף הרצאה
              </button>
            </div>
          </div>

          {lectures === null && <EmptyState message="טוען..." loading />}

          {lectures?.length === 0 && (
            <EmptyState message="אין הרצאות עדיין" icon="🎬">
              <button className="btn" onClick={() => setAddOpen(true)}>
                + הוסף הרצאה ראשונה
              </button>
            </EmptyState>
          )}

          {lectures && lectures.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>שם</th>
                  <th>סטטוס</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {lectures.map((l) => {
                  const date = l.lectureDate
                    ? new Date(l.lectureDate).toLocaleDateString('he-IL')
                    : '—';
                  const job = running.get(l.id);
                  return (
                    <tr key={l.id}>
                      <td className="td-date">{date}</td>
                      <td>
                        <Link
                          href={`/classes/${classId}/lectures/${l.id}`}
                          className="lecture-link"
                        >
                          {l.name}
                        </Link>
                      </td>
                      <td className="col-status">
                        {job ? (
                          <StatusBadge status={l.status} message={job.message} spinner />
                        ) : (
                          <StatusBadge status={l.status} />
                        )}
                      </td>
                      <td className="col-actions">
                        <div className="actions">{renderActions(l)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Add lecture modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)}>
        <h3>הרצאה חדשה</h3>
        <div className="form-group">
          <label>שם ההרצאה *</label>
          <input
            type="text"
            className="form-input"
            placeholder="למשל: הרצאה 3 — מבוא ל-ANOVA"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>קישור להרצאה *</label>
          <input
            type="url"
            className="form-input"
            dir="ltr"
            placeholder="https://opal.openu.ac.il/..."
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>תאריך הרצאה</label>
          <input
            type="date"
            className="form-input"
            dir="ltr"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={() => setAddOpen(false)}>
            ביטול
          </button>
          <button className="btn" onClick={addLecture}>
            הוסף
          </button>
        </div>
      </Modal>

      {/* Edit lecture modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)}>
        <h3>עריכת הרצאה</h3>
        <div className="form-group">
          <label>שם ההרצאה</label>
          <input
            type="text"
            className="form-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>תאריך</label>
          <input
            type="date"
            className="form-input"
            dir="ltr"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={() => setEditOpen(false)}>
            ביטול
          </button>
          <button className="btn" onClick={saveLecture}>
            שמור
          </button>
        </div>
      </Modal>

      {toastEl}
    </div>
  );
}
