'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { apiUrl } from '@/lib/api';
import { Button } from '@/app/components/Button';
import { Select } from '@/app/components/Select';

interface EditTarget {
  id: string;
  name: string;
  code?: string | null;
  semester?: string | null;
  year?: number | null;
  opalCourseUrl?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  editTarget?: EditTarget | null;
}

const CURRENT_YEAR = new Date().getFullYear();

export default function NewCourseModal({ open, onClose, onCreated, editTarget }: Props) {
  const isEdit = !!editTarget;
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [semester, setSemester] = useState('א');
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [submitting, setSubmitting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const lastDetectedUrl = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      if (editTarget) {
        setName(editTarget.name || '');
        setUrl(editTarget.opalCourseUrl || '');
        setCode(editTarget.code || '');
        setSemester(editTarget.semester || 'א');
        setYear(String(editTarget.year || CURRENT_YEAR));
        setShowFallback(true);
        lastDetectedUrl.current = editTarget.opalCourseUrl || null;
      }
      setTimeout(() => nameRef.current?.focus(), 50);
    } else {
      setName('');
      setUrl('');
      setCode('');
      setSemester('א');
      setYear(String(CURRENT_YEAR));
      setError(null);
      setShowFallback(false);
      lastDetectedUrl.current = null;
    }
  }, [open, editTarget]);

  if (!open) return null;

  const createCourse = async (fields: { name: string; code?: string; semester?: string; year?: number }) => {
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch(apiUrl('/api/classes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fields.name,
          semester: fields.semester || semester,
          year: fields.year || Number(year),
          code: fields.code || undefined,
          opalCourseUrl: url.trim(),
        }),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string };
        setError(err.error || 'שגיאה ביצירת קורס');
        setShowFallback(true);
        return;
      }
      const cls: { id: string } = await r.json();
      onCreated(cls.id);
    } finally {
      setSubmitting(false);
    }
  };

  const detectFromOpal = async () => {
    const trimmed = url.trim();
    if (!trimmed || trimmed === lastDetectedUrl.current) return;
    lastDetectedUrl.current = trimmed;
    setDetecting(true);
    try {
      const r = await fetch(apiUrl('/api/classes/opal-metadata'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opalCourseUrl: trimmed }),
      });
      if (!r.ok) {
        setShowFallback(true);
        return;
      }
      const meta: { name?: string; code?: string; semester?: string; year?: number } = await r.json();
      if (!meta.name) {
        setShowFallback(true);
        return;
      }
      if (isEdit) {
        if (!name.trim()) setName(meta.name);
        if (meta.code) setCode(meta.code);
        if (meta.semester) setSemester(meta.semester);
        if (meta.year) setYear(String(meta.year));
        return;
      }
      // scrape succeeded on the create flow — trust it and skip the manual review step
      await createCourse(meta as { name: string; code?: string; semester?: string; year?: number });
    } catch {
      setShowFallback(true);
    } finally {
      setDetecting(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!isEdit && !name.trim() && url.trim()) {
      // name not typed yet — let the in-flight/pending OPAL detection fill it in and auto-create
      await detectFromOpal();
      return;
    }
    if (!name.trim()) {
      setError('שם הקורס נדרש');
      setShowFallback(true);
      return;
    }
    if (!isEdit) {
      await createCourse({ name: name.trim(), code: code.trim() || undefined, semester, year: Number(year) });
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(apiUrl(`/api/classes/${editTarget!.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          semester,
          year: Number(year),
          code: code.trim() || undefined,
          opalCourseUrl: url.trim(),
        }),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string };
        setError(err.error || 'שגיאה בעדכון קורס');
        return;
      }
      onCreated(editTarget!.id);
    } finally {
      setSubmitting(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="modal-bg"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal__eye">{isEdit ? 'עריכת קורס' : 'קורס חדש'}</div>
        <h2 className="modal__title">{isEdit ? editTarget!.name : 'הוספת קורס'}</h2>

        <div className="modal__field">
          <label>קישור לדף הקורס</label>
          <input
            ref={nameRef}
            type="url"
            dir="ltr"
            placeholder="https://opal.openu.ac.il/course/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={detectFromOpal}
            disabled={!isEdit && (detecting || submitting)}
          />
          <div className="modal__hint">
            {!isEdit && submitting
              ? '✨ נמצא! יוצר קורס...'
              : detecting
                ? '⏳ קורא פרטי קורס מ-OPAL...'
                : 'הדבק את הקישור לדף הקורס ב-OPAL. שם הקורס, קוד הקורס והסמסטר יזוהו אוטומטית.'}
          </div>
        </div>

        {showFallback && (
          <>
            <div className="modal__field">
              <label>שם הקורס</label>
              <input
                type="text"
                data-testid="class-name-input"
                placeholder="למשל: חשבון אינפיניטסימלי 1"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="modal__row">
              <div className="modal__field">
                <label>קוד קורס</label>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="10493"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <div className="modal__field">
                <label>שנה</label>
                <input
                  type="number"
                  dir="ltr"
                  min={2020}
                  max={2040}
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </div>
            </div>

            <div className="modal__field">
              <label>סמסטר</label>
              <Select
                value={semester}
                onChange={setSemester}
                full
                options={[
                  { value: 'א', label: 'סמסטר א' },
                  { value: 'ב', label: 'סמסטר ב' },
                  { value: 'ג', label: 'סמסטר ג (קיץ)' },
                ]}
              />
            </div>
          </>
        )}

        {error && (
          <div className="modal__hint" style={{ color: 'var(--st-error)' }}>
            {error}
          </div>
        )}

        <div className="modal__actions">
          <Button onClick={onClose} disabled={submitting} style={{ marginInlineEnd: 'auto' }}>
            ביטול
          </Button>
          <Button variant="primary" size="md" data-testid="class-submit-btn" onClick={submit} disabled={submitting}>
            {submitting ? '...' : isEdit ? 'שמור שינויים' : 'צור קורס'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
