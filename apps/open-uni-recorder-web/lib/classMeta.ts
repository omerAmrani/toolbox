const COLOR_OPTIONS = ['sage', 'amber', 'plum', 'ink'] as const;
export type ClassColor = (typeof COLOR_OPTIONS)[number];

const colorKey = (id: string) => `our:class:${id}:color`;
const archivedKey = (id: string) => `our:class:${id}:archived`;
const lecArchivedKey = (id: string) => `our:lecture:${id}:archived`;

export function getClassColor(id: string): ClassColor {
  if (typeof window === 'undefined') return 'sage';
  const existing = localStorage.getItem(colorKey(id));
  if (existing && (COLOR_OPTIONS as readonly string[]).includes(existing)) {
    return existing as ClassColor;
  }
  const picked = COLOR_OPTIONS[Math.floor(Math.random() * COLOR_OPTIONS.length)] ?? 'sage';
  localStorage.setItem(colorKey(id), picked);
  return picked;
}

export function isClassArchived(id: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(archivedKey(id)) === '1';
}

export function setClassArchived(id: string, archived: boolean): void {
  if (typeof window === 'undefined') return;
  if (archived) localStorage.setItem(archivedKey(id), '1');
  else localStorage.removeItem(archivedKey(id));
}

export function isLectureArchived(id: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(lecArchivedKey(id)) === '1';
}

export function setLectureArchived(id: string, archived: boolean): void {
  if (typeof window === 'undefined') return;
  if (archived) localStorage.setItem(lecArchivedKey(id), '1');
  else localStorage.removeItem(lecArchivedKey(id));
}

export function classIcon(name: string): string {
  const trimmed = name?.trim();
  if (!trimmed) return '·';
  return Array.from(trimmed)[0] || '·';
}
