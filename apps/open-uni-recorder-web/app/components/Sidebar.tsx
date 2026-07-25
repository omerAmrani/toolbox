'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { SEMESTER_HE } from '@/lib/status';
import { SEMESTER_ORDER, useSelectedSemester } from '@/lib/selectedSemester';
import NewCourseModal from '@/app/components/NewCourseModal';

interface ClassRow {
  id: string;
  name: string;
  lectureCount: number;
  semester?: string | null;
  year?: number | null;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const loadClasses = () => {
    fetch(apiUrl('/api/classes'))
      .then((r) => r.json())
      .then((data) => setClasses(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  useEffect(() => {
    loadClasses();
  }, []);

  const selectedSemesterKey = useSelectedSemester();
  const semesterLabel = useMemo(() => {
    const withSem = classes.filter((c) => c.semester && c.year);
    const match =
      withSem.find((c) => `${c.semester}-${c.year}` === selectedSemesterKey) ??
      [...withSem].sort((a, b) => {
        if ((b.year ?? 0) !== (a.year ?? 0)) return (b.year ?? 0) - (a.year ?? 0);
        return (SEMESTER_ORDER[b.semester ?? ''] ?? 0) - (SEMESTER_ORDER[a.semester ?? ''] ?? 0);
      })[0];
    if (!match) return null;
    return `סמסטר ${SEMESTER_HE[match.semester!] || match.semester} ${match.year}`;
  }, [classes, selectedSemesterKey]);

  const at = (path: string) => pathname === path;

  return (
    <aside className="sb">
      <div className="sb__brand">
        <div className="sb__mark">פ</div>
        <div>
          <div className="sb__name">פתוחה / רקורדר</div>
          <div className="sb__sub">{semesterLabel || '—'}</div>
        </div>
      </div>

      <div className="sb__section">
        <div className="sb__label">ניווט</div>
        <Link className={'sb__item' + (at('/classes') ? ' is-active' : '')} href="/classes">
          <span className="sb__icon">⌂</span>
          הקורסים שלי
          <span className="sb__count">{classes.length}</span>
        </Link>
        {/* ponytail: stats page deprecated for now, commented out not removed
        <Link className={'sb__item' + (at('/stats') ? ' is-active' : '')} href="/stats">
          <span className="sb__icon">≡</span>
          סטטיסטיקות
        </Link>
        */}
        <button
          type="button"
          className="sb__item"
          data-testid="sidebar-create-class-btn"
          onClick={() => setModalOpen(true)}
        >
          <span className="sb__icon">+</span>
          הוסף קורס
        </button>
        <Link className={'sb__item' + (at('/settings') ? ' is-active' : '')} href="/settings">
          <span className="sb__icon">⚙</span>
          הגדרות
        </Link>
      </div>

      <div className="sb__divider" />

      <div className="sb__section">
        <div className="sb__label">הקורסים שלי</div>
        {classes.map((c) => {
          const href = `/classes/${c.id}`;
          const icon = c.name?.trim()?.[0] || '·';
          return (
            <Link
              key={c.id}
              className={'sb__item' + (pathname === href ? ' is-active' : '')}
              href={href}
            >
              <span className="sb__icon">{icon}</span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {c.name}
              </span>
              <span className="sb__count">{c.lectureCount}</span>
            </Link>
          );
        })}
      </div>
      <div className="sb__me">
        <div className="sb__avatar">פ</div>
        <div className="sb__metxt">
          —<br />
          <small>חיבור לא מוגדר</small>
        </div>
      </div>

      <NewCourseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(id) => {
          setModalOpen(false);
          loadClasses();
          router.push(`/classes/${id}`);
        }}
      />
    </aside>
  );
}
