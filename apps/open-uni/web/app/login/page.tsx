'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import GoogleButton from 'react-google-button';
import { apiUrl } from '@/lib/api';

function LoginForm() {
  const params = useSearchParams();
  const error = params.get('error');

  return (
    <div style={{ maxWidth: 380, margin: '120px auto', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <h1 style={{ marginBottom: 8 }}>התחברות ל-Open Uni</h1>
      <p style={{ marginBottom: 24, color: 'var(--ink-2)' }}>נהלו את ההרצאות שלכם — תמלול, סיכומים וחיפוש, במקום אחד.</p>
      <GoogleButton onClick={() => { window.location.href = apiUrl('/api/auth/google'); }} />
      {error === 'oauth_failed' && <p style={{ color: 'red', marginTop: 12 }}>שגיאה בהתחברות — נסו שוב.</p>}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
