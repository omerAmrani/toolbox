'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Crumb {
  label: string;
  href?: string;
}

interface TopbarProps {
  crumbs?: Crumb[];
}

function deriveCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return [{ label: 'בית' }];

  const crumbs: Crumb[] = [];
  if (segments[0] === 'classes') {
    crumbs.push({ label: 'הקורסים שלי', href: '/classes' });
    if (segments[1]) crumbs.push({ label: segments[1], href: `/classes/${segments[1]}` });
    if (segments[2] === 'lectures' && segments[3]) crumbs.push({ label: 'הרצאה' });
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
  const items = crumbs ?? deriveCrumbs(pathname || '/');

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
