'use client';

import { useState } from 'react';
import { apiUrl } from '@/lib/api';
import { Button } from '@/app/components/Button';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    try {
      const res = await fetch(apiUrl('/api/auth/request-link'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setStatus(res.ok ? 'sent' : 'error');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div style={{ maxWidth: 380, margin: '80px auto', padding: 24 }}>
      <h1 style={{ marginBottom: 24 }}>התחברות</h1>
      {status === 'sent' ? (
        <p>נשלח קישור התחברות ל-{email} — בדקו את תיבת הדואר.</p>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email"
            required
            placeholder="האימייל שלך"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: '10px 12px', fontSize: 15 }}
          />
          <Button type="submit" variant="primary" disabled={status === 'sending'}>
            {status === 'sending' ? 'שולח...' : 'שלח קישור התחברות'}
          </Button>
          {status === 'error' && <p style={{ color: 'red' }}>שגיאה בשליחה — נסו שוב.</p>}
        </form>
      )}
    </div>
  );
}
