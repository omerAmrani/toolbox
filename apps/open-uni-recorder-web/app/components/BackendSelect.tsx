'use client';

export type Backend = 'gemini' | 'claude';

interface Props {
  value: Backend;
  onChange: (v: Backend) => void;
  className?: string;
}

export function BackendSelect({ value, onChange, className = 'select-field' }: Props) {
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value as Backend)}>
      <option value="gemini">Gemini (Google)</option>
      <option value="claude">Claude (Anthropic)</option>
    </select>
  );
}
