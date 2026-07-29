export const STATUS_LABEL: Record<string, string> = {
  pending: 'ממתין',
  transcribing: 'מתמלל...',
  transcribed: 'תומלל',
  summarizing: 'מסכם...',
  summarized: 'סוכם',
};

export const STATUS_CLASS: Record<string, string> = {
  pending: 'badge-pending',
  transcribing: 'badge-pending',
  summarizing: 'badge-pending',
  transcribed: 'badge-transcribed',
  summarized: 'badge-summarized',
};

export const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--muted)',
  transcribing: 'var(--primary)',
  transcribed: 'var(--warning)',
  summarizing: 'var(--primary)',
  summarized: 'var(--success)',
};

export const STATUS_ABORT_TYPE: Record<string, 'transcribe' | 'summarize'> = {
  transcribing: 'transcribe',
  summarizing: 'summarize',
};

export const SEMESTER_HE: Record<string, string> = {
  א: 'א',
  ב: 'ב',
  ג: 'ג',
};
