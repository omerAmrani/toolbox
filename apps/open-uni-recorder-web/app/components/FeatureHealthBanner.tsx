'use client';

import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api';

const FEATURE_LABEL: Record<string, string> = {
  'transcription':      'תמלול',
  'summarization':      'סיכומים',
  'lecture-download':   'הורדת הרצאות',
  'email-notifications':'התראות מייל',
};

interface FeatureStatus {
  feature: string;
  available: boolean;
}

export default function FeatureHealthBanner() {
  const [features, setFeatures] = useState<FeatureStatus[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch(apiUrl('/health/features'))
      .then((r) => r.json())
      .then(setFeatures)
      .catch(() => {});
  }, []);

  if (!features || dismissed) return null;

  const unavailable = features.filter((f) => !f.available);
  if (unavailable.length === 0) return null;

  const available = features.filter((f) => f.available);

  return (
    <div style={{
      borderLeft: '3px solid var(--warn)',
      background: 'var(--surface-2)',
      borderRadius: 10,
      padding: '14px 16px',
      marginBottom: 'var(--gap)',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ font: '600 0.88rem/1 var(--font-ui)', color: 'var(--warn)' }}>
          ⚠ {unavailable.length} {unavailable.length === 1 ? 'פיצ׳ר לא זמין' : 'פיצ׳רים לא זמינים'}
        </span>
        <button
          className="btn btn--ghost btn--sm"
          style={{ fontSize: '0.75rem' }}
          onClick={() => setDismissed(true)}
        >
          הסתר
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {unavailable.map(({ feature }) => (
          <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warn)', flexShrink: 0 }} />
            <span style={{ color: 'var(--ink)' }}>{FEATURE_LABEL[feature] ?? feature}</span>
            <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>לא מוגדר</span>
          </div>
        ))}
      </div>

      {available.length > 0 && (
        <div style={{ display: 'flex', gap: 10, paddingTop: 8, borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
          {available.map(({ feature }) => (
            <span key={feature} style={{ fontSize: '0.78rem', color: 'var(--good)' }}>
              ✓ {FEATURE_LABEL[feature] ?? feature}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
