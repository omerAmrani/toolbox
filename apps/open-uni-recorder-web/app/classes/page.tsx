'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { SEMESTER_HE } from '@/lib/status';
import { PageHeader } from '@/app/components/PageHeader';
import { Modal } from '@/app/components/Modal';
import { useToast } from '@/app/components/Toast';
import { EmptyState } from '@/app/components/EmptyState';

interface ClassRow {
  id: string;
  name: string;
  semester?: string | null;
  year?: number | null;
  lectureCount: number;
}

export default function ClassesPage() {
  const router = useRouter();
  const { show: showToast, element: toastEl } = useToast();
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [semester, setSemester] = useState('');
  const [year, setYear] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const loadClasses = async () => {
    try {
      const data: ClassRow[] = await fetch(apiUrl('/api/classes')).then((r) => r.json());
      setClasses(data);
    } catch {
      setClasses([]);
      showToast('שגיאה בטעינת הקורסים', true);
    }
  };

  useEffect(() => {
    loadClasses();
  }, []);

  useEffect(() => {
    if (modalOpen) setTimeout(() => nameInputRef.current?.focus(), 100);
  }, [modalOpen]);

  const closeModal = () => {
    setModalOpen(false);
    setName('');
    setSemester('');
    setYear('');
  };

  const createClass = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      nameInputRef.current?.focus();
      return;
    }
    const r = await fetch(apiUrl('/api/classes'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: trimmed,
        semester,
        year: year ? Number(year) : undefined,
      }),
    });
    if (r.ok) {
      const cls: { id: string } = await r.json();
      closeModal();
      showToast('הקורס נוצר');
      await loadClasses();
      setTimeout(() => router.push(`/classes/${cls.id}`), 600);
    } else {
      const err = (await r.json().catch(() => ({}))) as { error?: string };
      showToast(err.error || 'שגיאה', true);
    }
  };

  const deleteClass = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('למחוק את הקורס וכל ההרצאות שלו?')) return;
    const r = await fetch(apiUrl(`/api/classes/${id}`), { method: 'DELETE' });
    if (r.ok) {
      showToast('הקורס נמחק');
      loadClasses();
    } else {
      showToast('שגיאה במחיקה', true);
    }
  };

  return (
    <div className="page-classes">
      <PageHeader>
        <div className="logo">🎓</div>
        <h1>הקורסים שלי</h1>
        <p>ניהול הרצאות לפי קורס</p>
      </PageHeader>

      <main>
        <div className="card">
          <div className="card-header">
            <h2>קורסים</h2>
            <button className="btn" onClick={() => setModalOpen(true)}>
              + קורס חדש
            </button>
          </div>

          <div className="classes-grid">
            {classes === null && <EmptyState message="טוען..." loading />}

            {classes?.length === 0 && (
              <EmptyState message="אין קורסים עדיין" icon="📚">
                <button className="btn" onClick={() => setModalOpen(true)}>
                  + הוסף קורס ראשון
                </button>
              </EmptyState>
            )}

            {classes?.map((c) => {
              const sem = c.semester ? SEMESTER_HE[c.semester] || c.semester : '';
              const yr = c.year ? ` ${c.year}` : '';
              const meta = [sem + yr].filter(Boolean).join(' ');
              return (
                <div
                  key={c.id}
                  className="class-card"
                  onClick={() => router.push(`/classes/${c.id}`)}
                >
                  <button
                    className="class-delete"
                    onClick={(e) => deleteClass(e, c.id)}
                    title="מחק קורס"
                  >
                    ✕
                  </button>
                  <h3>{c.name}</h3>
                  {meta && <div className="class-meta">{meta}</div>}
                  <span className="class-count">📖 {c.lectureCount} הרצאות</span>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <Modal open={modalOpen} onClose={closeModal}>
        <h3>קורס חדש</h3>
        <div className="form-group">
          <label>שם הקורס *</label>
          <input
            ref={nameInputRef}
            type="text"
            className="form-input"
            placeholder="למשל: סטטיסטיקה 101"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createClass();
            }}
          />
        </div>
        <div className="form-group">
          <label>סמסטר</label>
          <select
            className="form-input form-select"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
          >
            <option value="">— בחר —</option>
            <option value="spring">אביב</option>
            <option value="summer">קיץ</option>
            <option value="fall">סתיו</option>
            <option value="winter">חורף</option>
          </select>
        </div>
        <div className="form-group">
          <label>שנה</label>
          <input
            type="number"
            className="form-input"
            placeholder="2026"
            min="2020"
            max="2040"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={closeModal}>
            ביטול
          </button>
          <button className="btn" onClick={createClass}>
            צור קורס
          </button>
        </div>
      </Modal>

      {toastEl}
    </div>
  );
}
