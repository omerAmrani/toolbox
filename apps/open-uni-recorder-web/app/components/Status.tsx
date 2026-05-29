import { STATUS_LABEL } from '@/lib/status';

export function Status({ s }: { s: string }) {
  return (
    <span className="status" data-s={s}>
      <span className="status__dot" />
      {STATUS_LABEL[s] || s}
    </span>
  );
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: 'short' });
}

export function fmtDateLong(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: 'long', year: 'numeric' });
}
