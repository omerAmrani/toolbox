const COLOR_OPTIONS = ['sage', 'amber', 'plum', 'ink'] as const;
export type ClassColor = (typeof COLOR_OPTIONS)[number];

const colorKey = (id: string) => `our:class:${id}:color`;

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

export function classIcon(name: string): string {
  const trimmed = name?.trim();
  if (!trimmed) return '·';
  return Array.from(trimmed)[0] || '·';
}
