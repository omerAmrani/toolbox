'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { SEMESTER_HE } from '@/lib/status';
import { getClassColor, isClassArchived, classIcon } from '@/lib/classMeta';
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
  const [filter, setFilter] = useState<'all' | 'active' | 'archive'>('all');

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

  const allLectures = useMemo(
    () => Object.values(lecturesByClass).flat(),
    [lecturesByClass],
  );
  const summarizedCount = allLectures.filter(
    (l) => l.status === 'summarized' || l.status === 'done',
  ).length;
  const pendingCount = allLectures.filter((l) => l.status === 'pending').length;
  const attentionCount = allLectures.filter(
    (l) => l.status === 'error' || l.status === 'failed' || l.status === 'aborted',
  ).length;

  const partitioned = useMemo(() => {
    const list = classes ?? [];
    const active: ClassRow[] = [];
    const archived: ClassRow[] = [];
    for (const c of list) {
      if (isClassArchived(c.id)) archived.push(c);
      else active.push(c);
    }
    const sortFn = (a: ClassRow, b: ClassRow) => {
      const ya = a.year ?? 0;
      const yb = b.year ?? 0;
      if (yb !== ya) return yb - ya;
      const sa = SEMESTER_ORDER[a.semester ?? ''] ?? 0;
      const sb = SEMESTER_ORDER[b.semester ?? ''] ?? 0;
      if (sb !== sa) return sb - sa;
      return a.name.localeCompare(b.name, 'he');
    };
    active.sort(sortFn);
    archived.sort(sortFn);
    return { active, archived };
  }, [classes]);

  const visible =
    filter === 'all'
      ? [...partitioned.active, ...partitioned.archived]
      : filter === 'archive'
        ? partitioned.archived
        : partitioned.active;

  return (
    <div className="page fade-in">
      <div className="display-h">
        <div className="display-h__eye">העמוד הראשי</div>
        <h1 className="display-h__title">הספרייה האקדמית שלי.</h1>
        <p className="display-h__sub">
          {(classes?.length ?? 0)} קורסים, {allLectures.length} הרצאות. כל הקלטה
          מומרת לטקסט, מתוכלת ומסוכמת באופן אוטומטי.
        </p>
      </div>

      <div className="glance">
        <div className="glance__cell">
          <div className="glance__n">
            {summarizedCount}
            <small>/ {allLectures.length}</small>
          </div>
          <div className="glance__l">הרצאות מסוכמות</div>
        </div>
        <div className="glance__cell">
          <div className="glance__n">{pendingCount}</div>
          <div className="glance__l">ממתינות לעיבוד</div>
        </div>
        <div className="glance__cell">
          <div
            className="glance__n"
            style={attentionCount > 0 ? { color: 'var(--st-error)' } : undefined}
          >
            {attentionCount}
          </div>
          <div className="glance__l">דורשות תשומת לב</div>
        </div>
      </div>

      <div className="semester-strip">
        <button
          className={filter === 'all' ? 'is-active' : ''}
          onClick={() => setFilter('all')}
        >
          הכל{' '}
          <span className="semester-strip__count">{classes?.length ?? 0}</span>
        </button>
        <button
          className={filter === 'active' ? 'is-active' : ''}
          onClick={() => setFilter('active')}
        >
          פעילים{' '}
          <span className="semester-strip__count">{partitioned.active.length}</span>
        </button>
        <button
          className={filter === 'archive' ? 'is-active' : ''}
          onClick={() => setFilter('archive')}
        >
          ארכיון{' '}
          <span className="semester-strip__count">{partitioned.archived.length}</span>
        </button>
      </div>

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
