'use client';

export type Backend = 'gemini' | 'groq' | 'claude' | 'ollama';

interface Props {
  value: Backend;
  onChange: (v: Backend) => void;
  className?: string;
}

export function BackendSelect({ value, onChange, className = 'select-field' }: Props) {
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value as Backend)}>
      <option value="gemini">Gemini (Google)</option>
      <option value="groq">Groq (LLaMA)</option>
      <option value="claude">Claude (Anthropic)</option>
      <option value="ollama">Ollama (מקומי)</option>
    </select>
  );
}
