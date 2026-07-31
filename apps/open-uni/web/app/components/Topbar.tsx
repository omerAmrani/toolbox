'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface Crumb {
  label: string;
  href?: string;
}

interface TopbarProps {
  crumbs?: Crumb[];
}

function deriveCrumbs(pathname: string, className: string | null, lectureName: string | null): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return [{ label: 'בית' }];

  const crumbs: Crumb[] = [];
  if (segments[0] === 'classes') {
    crumbs.push({ label: 'הקורסים שלי', href: '/classes' });
    if (segments[1]) {
      crumbs.push({ label: className ?? segments[1], href: `/classes/${segments[1]}` });
    }
    if (segments[2] === 'lectures' && segments[3]) {
      crumbs.push({ label: lectureName ?? segments[3] });
    }
  } else if (segments[0] === 'stats') {
    crumbs.push({ label: 'סטטיסטיקות' });
  } else if (segments[0] === 'settings') {
    crumbs.push({ label: 'הגדרות' });
  } else if (segments[0] === 'setup') {
    crumbs.push({ label: 'הגדרת חשבון' });
  } else {
    crumbs.push({ label: segments.join(' / ') });
  }

  const last = crumbs[crumbs.length - 1];
  if (last) delete last.href;
  return crumbs;
}

export default function Topbar({ crumbs }: TopbarProps) {
  const pathname = usePathname();
  const segments = (pathname || '/').split('/').filter(Boolean);
  const classId = segments[0] === 'classes' ? segments[1] : undefined;
  const lectureId = segments[2] === 'lectures' ? segments[3] : undefined;
  const [className, setClassName] = useState<string | null>(null);
  const [lectureName, setLectureName] = useState<string | null>(null);

  useEffect(() => {
    if (!classId) {
      setClassName(null);
      return;
    }
    let cancelled = false;
    apiFetch('/api/classes')
      .then((r) => r.json())
      .then((data: { id: string; name: string }[]) => {
        if (cancelled) return;
        setClassName(Array.isArray(data) ? data.find((c) => c.id === classId)?.name ?? null : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [classId]);

  useEffect(() => {
    if (!classId || !lectureId) {
      setLectureName(null);
      return;
    }
    let cancelled = false;
    apiFetch(`/api/classes/${classId}/lectures/${lectureId}/status`)
      .then((r) => r.json())
      .then((data: { name?: string }) => {
        if (!cancelled) setLectureName(data?.name ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [classId, lectureId]);

  const items = crumbs ?? deriveCrumbs(pathname || '/', className, lectureName);

  return (
    <header className="topbar">
      <nav className="crumbs">
        {items.map((c, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {i > 0 && <span className="crumbs__sep">/</span>}
            {c.href ? <Link href={c.href}>{c.label}</Link> : <span className="crumbs__current">{c.label}</span>}
          </span>
        ))}
      </nav>
    </header>
  );
}
