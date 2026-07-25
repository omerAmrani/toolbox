'use client';

import { Select } from './Select';

export type Backend = 'gemini' | 'claude';

interface Props {
  value: Backend;
  onChange: (v: Backend) => void;
  full?: boolean;
}

const options = [
  { value: 'gemini', label: 'Gemini (Google)' },
  { value: 'claude', label: 'Claude (Anthropic)' },
];

export function BackendSelect({ value, onChange, full }: Props) {
  return <Select value={value} onChange={(v) => onChange(v as Backend)} options={options} full={full} />;
}
