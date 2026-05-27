'use client';
import { STATUS_CLASS, STATUS_LABEL } from '@/lib/status';

interface Props {
  status: string;
  message?: string;
  spinner?: boolean;
}

export function StatusBadge({ status, message, spinner }: Props) {
  const cls = STATUS_CLASS[status] || 'badge-pending';
  const label = message ?? STATUS_LABEL[status] ?? status;
  return (
    <span className={`badge ${cls}`}>
      {spinner && <span className="spinner-sm" />}
      {label}
    </span>
  );
}
