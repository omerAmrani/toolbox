'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { apiUrl } from '@/lib/api';

interface ClassRow {
  id: string;
  name: string;
  lectureCount: number;
}

export default function Sidebar() {
  const pathname = usePathname();
  const [classes, setClasses] = useState<ClassRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl('/api/classes'))
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setClasses(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const at = (path: string) => pathname === path;

  return (
    <aside className="sb">
      <div className="sb__brand">
        <div className="sb__mark">פ</div>
        <div>
          <div className="sb__name">פתוחה / רקורדר</div>
          <div className="sb__sub">סמסטר אביב 2026</div>
        </div>
      </div>

      <div className="sb__section">
        <div className="sb__label">ניווט</div>
        <Link className={'sb__item' + (at('/classes') ? ' is-active' : '')} href="/classes">
          <span className="sb__icon">⌂</span>
          הקורסים שלי
          <span className="sb__count">{classes.length}</span>
        </Link>
        <Link className={'sb__item' + (at('/stats') ? ' is-active' : '')} href="/stats">
          <span className="sb__icon">≡</span>
          סטטיסטיקות
        </Link>
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
    </aside>
  );
}
