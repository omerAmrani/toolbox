'use client';
import { useCallback, useRef, useState } from 'react';

export function useToast() {
  const [state, setState] = useState({ msg: '', error: false, show: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((msg: string, error = false) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState({ msg, error, show: true });
    timerRef.current = setTimeout(() => {
      setState((s) => ({ ...s, show: false }));
    }, 3000);
  }, []);

  const element = (
    <div
      className={`toast${state.show ? ' show' : ''}${state.error ? ' error' : ''}`}
    >
      {state.msg}
    </div>
  );

  return { show, element };
}
