'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { SEMESTER_HE } from '@/lib/status';
import { getClassColor, classIcon } from '@/lib/classMeta';
import NewCourseModal from '@/app/components/NewCourseModal';

interface ClassRow {
  id: string;
  name: string;
  semester?: string | null;
  year?: number | null;
  lectureCount: number;
}

interface LectureRow {
  id: string;
  status: string;
}

const SEMESTER_ORDER: Record<string, number> = { spring: 4, winter: 3, fall: 2, summer: 1 };

export default function ClassesPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [lecturesByClass, setLecturesByClass] = useState<Record<string, LectureRow[]>>({});
  const [modalOpen, setModalOpen] = useState(false);

  const loadClasses = async () => {
    try {
      const data: ClassRow[] = await fetch(apiUrl('/api/classes')).then((r) => r.json());
      setClasses(data);
    } catch {
      setClasses([]);
    }
  };

  const deleteClass = async (id: string) => {
    if (!confirm('למחוק את הקורס וכל ההרצאות שלו?')) return;
    await fetch(apiUrl(`/api/classes/${id}`), { method: 'DELETE' });
    loadClasses();
  };

  useEffect(() => {
    loadClasses();
  }, []);

  useEffect(() => {
    if (!classes) return;
    let cancelled = false;
    Promise.all(
      classes.map(async (c) => {
        try {
          const lecs: LectureRow[] = await fetch(
            apiUrl(`/api/classes/${c.id}/lectures`),
          ).then((r) => r.json());
          return [c.id, Array.isArray(lecs) ? lecs : []] as const;
        } catch {
          return [c.id, [] as LectureRow[]] as const;
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      const map: Record<string, LectureRow[]> = {};
      for (const [id, lecs] of pairs) map[id] = lecs;
      setLecturesByClass(map);
    });
    return () => {
      cancelled = true;
    };
  }, [classes]);

  const visible = useMemo(() => {
    const list = [...(classes ?? [])];
    list.sort((a, b) => {
      const ya = a.year ?? 0;
      const yb = b.year ?? 0;
      if (yb !== ya) return yb - ya;
      const sa = SEMESTER_ORDER[a.semester ?? ''] ?? 0;
      const sb = SEMESTER_ORDER[b.semester ?? ''] ?? 0;
      if (sb !== sa) return sb - sa;
      return a.name.localeCompare(b.name, 'he');
    });
    return list;
  }, [classes]);

  return (
    <div className="page fade-in">
      {classes !== null && classes.length === 0 ? (
        <div className="class-grid">
          <div className="class-new" data-testid="create-class-btn" onClick={() => setModalOpen(true)}>
            <div className="class-new__plus">+</div>
            <span>אין קורסים עדיין</span>
          </div>
        </div>
      ) : (
        <div className="class-grid">
          {visible.map((c) => {
            const sem = c.semester ? SEMESTER_HE[c.semester] || c.semester : '';
            const yr = c.year ? ` ${c.year}` : '';
            const meta = [sem + yr].filter(Boolean).join(' ');
            const lecs = lecturesByClass[c.id] ?? [];
            const done = lecs.filter(
              (l) => l.status === 'summarized' || l.status === 'done',
            ).length;
            return (
              <article
                key={c.id}
                className="class-card"
                data-testid="class-card"
                data-color={getClassColor(c.id)}
                onClick={() => router.push(`/classes/${c.id}`)}
              >
                <div className="class-card__bar" />
                <div className="class-card__top">
                  <div className="class-card__icon">{classIcon(c.name)}</div>
                  <button
                    className="btn btn--ghost btn--sm"
                    data-testid="class-delete-btn"
                    onClick={(e) => { e.stopPropagation(); deleteClass(c.id); }}
                    title="מחק קורס"
                    style={{ marginInlineStart: 'auto' }}
                  >
                    🗑
                  </button>
                </div>
                <h3 className="class-card__title">{c.name}</h3>
                {meta && <div className="class-card__meta">{meta}</div>}
                <div className="class-card__stats">
                  <div className="class-card__stat">
                    <div className="class-card__stat-n">
                      {done}/{c.lectureCount}
                    </div>
                    <div className="class-card__stat-l">מסוכם</div>
                  </div>
                </div>
              </article>
            );
          })}

          <div className="class-new" data-testid="create-class-btn" onClick={() => setModalOpen(true)}>
            <div className="class-new__plus">+</div>
            קורס חדש
          </div>
        </div>
      )}

      <NewCourseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(id) => {
          setModalOpen(false);
          loadClasses();
          setTimeout(() => router.push(`/classes/${id}`), 400);
        }}
      />
    </div>
  );
}
