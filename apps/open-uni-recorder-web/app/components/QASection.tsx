'use client';

interface QARound {
  questions: string[];
  answers: string[];
  feedback: { correct: boolean; explanation: string }[];
}

export interface QAState {
  rounds: QARound[];
}

interface Props {
  qa: QAState | null;
  answers: string[];
  onAnswerChange: (i: number, v: string) => void;
  onStartNewRound: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

export function QASection({ qa, answers, onAnswerChange, onStartNewRound, onSubmit, submitting }: Props) {
  if (qa === null) {
    return <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>טוען...</div>;
  }

  const lastRound = qa.rounds[qa.rounds.length - 1];
  const hasUnanswered = lastRound && lastRound.feedback.length === 0;

  if (hasUnanswered) {
    return (
      <>
        {lastRound.questions.map((q, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              {i + 1}. {q}
            </div>
            <textarea
              rows={3}
              style={{
                width: '100%',
                padding: 8,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--subtle)',
                color: 'var(--text)',
                fontSize: '0.9rem',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
              placeholder="התשובה שלך..."
              value={answers[i] || ''}
              onChange={(e) => onAnswerChange(i, e.target.value)}
            />
          </div>
        ))}
        <button className="btn" onClick={onSubmit} disabled={submitting}>
          {submitting ? 'שולח...' : 'שלח תשובות'}
        </button>
      </>
    );
  }

  return (
    <>
      {lastRound &&
        lastRound.questions.map((q, i) => {
          const fb = lastRound.feedback[i];
          const color = fb?.correct ? 'var(--success)' : 'var(--error)';
          const icon = fb?.correct ? '✓' : '✗';
          return (
            <div
              key={i}
              style={{
                marginBottom: 16,
                padding: 12,
                borderRadius: 8,
                border: `1px solid ${color}30`,
                background: `${color}10`,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {i + 1}. {q}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 6 }}>
                תשובתך: {lastRound.answers[i] || '—'}
              </div>
              <div style={{ color, fontSize: '0.9rem' }}>
                {icon} {fb?.explanation || ''}
              </div>
            </div>
          );
        })}
      <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={onStartNewRound}>
        {lastRound ? '🔁 סיבוב נוסף' : '🧠 צור שאלות'}
      </button>
    </>
  );
}
