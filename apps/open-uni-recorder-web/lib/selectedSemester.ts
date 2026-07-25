'use client';

import { useEffect, useState } from 'react';

export const SELECTED_SEMESTER_KEY = 'our:settings:selectedSemester';
export const SEMESTER_ORDER: Record<string, number> = { א: 1, ב: 2, ג: 3 };

const CHANGE_EVENT = 'selected-semester-changed';

export function getSelectedSemester(): string {
  return typeof window === 'undefined' ? '' : localStorage.getItem(SELECTED_SEMESTER_KEY) || '';
}

export function setSelectedSemester(key: string) {
  localStorage.setItem(SELECTED_SEMESTER_KEY, key);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useSelectedSemester(): string {
  const [value, setValue] = useState('');
  useEffect(() => {
    setValue(getSelectedSemester());
    const onChange = () => setValue(getSelectedSemester());
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
  return value;
}