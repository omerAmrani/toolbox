'use client';

import { useState, useEffect, useRef } from 'react';
import { apiUrl } from '@/lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

const CURRENT_YEAR = new Date().getFullYear();

export default function NewCourseModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [semester, setSemester] = useState('spring');
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => nameRef.current?.focus(), 50);
    } else {
      setName('');
      setUrl('');
      setSemester('spring');
      setYear(String(CURRENT_YEAR));
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    setError(null);
    if (!name.trim() || !url.trim()) {
      setError('שם הקורס וקישור הדף נדרשים');
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(apiUrl('/api/classes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          semester,
          year: Number(year),
          opalCourseUrl: url.trim(),
        }),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string };
        setError(err.error || 'שגיאה ביצירת קורס');
        return;
      }
      const cls: { id: string } = await r.json();
      onCreated(cls.id);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-bg"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal__eye">קורס חדש</div>
        <h2 className="modal__title">הוספת קורס</h2>

        <div className="modal__field">
          <label>שם הקורס</label>
          <input
            ref={nameRef}
            type="text"
            placeholder="למשל: חשבון אינפיניטסימלי 1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="modal__field">
          <label>קישור לדף הקורס</label>
          <input
            type="url"
            dir="ltr"
            placeholder="https://opal.openu.ac.il/course/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="modal__hint">
            הדבק את הקישור לדף הקורס ב-OPAL. נשתמש בו לזיהוי הרצאות חדשות אוטומטית.
          </div>
        </div>

        <div className="modal__row">
          <div className="modal__field">
            <label>סמסטר</label>
            <select value={semester} onChange={(e) => setSemester(e.target.value)}>
              <option value="spring">אביב</option>
              <option value="summer">קיץ</option>
              <option value="fall">סתיו</option>
              <option value="winter">חורף</option>
            </select>
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

        {error && (
          <div className="modal__hint" style={{ color: 'var(--st-error)' }}>
            {error}
          </div>
        )}

        <div className="modal__actions">
          <button className="btn btn--ghost btn--sm" onClick={onClose} disabled={submitting}>
            ביטול
          </button>
          <button className="btn" onClick={submit} disabled={submitting}>
            {submitting ? '...' : 'צור קורס'}
          </button>
        </div>
      </div>
    </div>
  );
}
