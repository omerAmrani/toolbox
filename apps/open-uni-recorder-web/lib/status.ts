export const STATUS_LABEL: Record<string, string> = {
  pending: 'ממתין',
  processing: 'מעבד',
  transcribing: 'מתמלל...',
  transcribed: 'תומלל',
  summarizing: 'מסכם...',
  summarized: 'סוכם',
  done: 'הושלם',
  failed: 'נכשל',
  error: 'שגיאה',
  aborted: 'בוטל',
  skipped: 'דולג',
};

export const STATUS_CLASS: Record<string, string> = {
  pending: 'badge-pending',
  processing: 'badge-pending',
  transcribing: 'badge-pending',
  summarizing: 'badge-pending',
  transcribed: 'badge-transcribed',
  summarized: 'badge-summarized',
  error: 'badge-error',
  failed: 'badge-error',
  aborted: 'badge-error',
};

export const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--muted)',
  processing: 'var(--primary)',
  transcribing: 'var(--primary)',
  transcribed: 'var(--warning)',
  summarizing: 'var(--primary)',
  summarized: 'var(--success)',
  done: 'var(--success)',
  failed: 'var(--error)',
  error: 'var(--error)',
  aborted: 'var(--muted)',
  skipped: 'var(--muted)',
};

export const STATUS_ABORT_TYPE: Record<string, 'transcribe' | 'summarize'> = {
  processing: 'transcribe',
  transcribing: 'transcribe',
  summarizing: 'summarize',
};

export const SEMESTER_HE: Record<string, string> = {
  spring: 'אביב',
  summer: 'קיץ',
  fall: 'סתיו',
  winter: 'חורף',
};
