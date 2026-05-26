'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavBar() {
  const pathname = usePathname();
  const isSettings = pathname.startsWith('/settings');
  const isClasses = !isSettings;
  return (
    <nav>
      <Link href="/classes" className={isClasses ? 'active' : undefined}>
        הקורסים שלי
      </Link>
      <Link href="/settings" className={isSettings ? 'active' : undefined}>
        הגדרות
      </Link>
    </nav>
  );
}
