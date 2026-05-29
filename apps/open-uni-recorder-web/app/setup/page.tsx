'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface University {
  id: string;
  short: string;
  portal: string;
  icon: string;
  usernamePlaceholder: string;
  stub?: boolean;
}

const UNIVERSITIES: University[] = [
  { id: 'openu', short: 'האוניברסיטה הפתוחה', portal: 'my.openu.ac.il', icon: 'פ', usernamePlaceholder: 'מספר ת״ז' },
  { id: 'huji', short: 'האוניברסיטה העברית', portal: 'huji.ac.il', icon: 'ע', usernamePlaceholder: 'שם משתמש', stub: true },
];

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [uniId, setUniId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState(false);

  const uni = UNIVERSITIES.find((u) => u.id === uniId);

  const testConnection = () => {
    setTesting(true);
    setTimeout(() => {
      setTesting(false);
      setConnected(true);
    }, 1400);
  };

  return (
    <div className="setup" dir="rtl">
      <div className="setup__hero">
        <div className="setup__pitch-deco" />
        <div className="setup__brand">
          <div className="setup__brand-mark">פ</div>
          רקורדר
        </div>

        <div className="setup__pitch">
          <h1>הספרייה האקדמית שלך, אוטומטית.</h1>
          <p>
            רקורדר מתחבר לפורטל האוניברסיטה שלך, מזהה הרצאות חדשות, מתמלל ומסכם אותן
            בשבילך — אז במקום שעות של האזנה, יש לך דקות של קריאה.
          </p>
          <ul>
            <li>זיהוי אוטומטי של הרצאות חדשות באזור הקורס</li>
            <li>תמלול בעברית, סיכום על ידי Claude</li>
            <li>שאלות ותשובות חכמות על תוכן ההרצאה</li>
            <li>חיפוש בכל ההרצאות והתמלולים</li>
          </ul>
        </div>

        <div className="setup__footer">הכל פועל באופן מקומי. הקרדנציאלים שלך לא יוצאים מהמכשיר.</div>
      </div>

      <div className="setup__form">
        {step === 0 && (
          <div className="fade-in">
            <div className="setup__step">שלב 1 מתוך 3</div>
            <h2 className="setup__h">איזה מוסד אתה לומד בו?</h2>
            <p className="setup__sub">בחר את האוניברסיטה כדי שנדע איפה לחפש הרצאות חדשות.</p>

            <div className="uni-grid">
              {UNIVERSITIES.map((u) => (
                <button
                  key={u.id}
                  className={'uni-card' + (uniId === u.id ? ' is-selected' : '') + (u.stub ? ' uni-card--stub' : '')}
                  onClick={() => !u.stub && setUniId(u.id)}
                  style={u.stub ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                >
                  <div className="uni-card__icon">{u.icon}</div>
                  <div>
                    <div className="uni-card__name">{u.short}</div>
                    <div className="uni-card__sub">{u.stub ? 'בקרוב' : u.portal}</div>
                  </div>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="step-dots">
                <span className="is-active" />
                <span />
                <span />
              </div>
              <button className="btn" disabled={!uniId} style={{ opacity: uniId ? 1 : 0.4 }} onClick={() => setStep(1)}>
                המשך ←
              </button>
            </div>
          </div>
        )}

        {step === 1 && uni && (
          <div className="fade-in">
            <div className="setup__step">שלב 2 מתוך 3</div>
            <h2 className="setup__h">התחבר ל{uni.short}</h2>
            <p className="setup__sub">
              אנחנו ניגשים ל-{uni.portal} בשמך כדי לקרוא רשימת הרצאות. הסיסמה שלך נשמרת מוצפנת על
              המכשיר ולא נשלחת לאף שרת.
            </p>

            <div className="modal__field">
              <label>שם משתמש</label>
              <input
                type="text"
                placeholder={uni.usernamePlaceholder}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>

            <div className="modal__field">
              <label>סיסמה</label>
              <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            {connected && (
              <div className="connect-status">
                <div className="connect-status__icon">✓</div>
                <div>
                  <strong>החיבור הוכח.</strong> מוכן לסנכרן את הקורסים שלך.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 30 }}>
              <div className="step-dots">
                <span className="is-done" />
                <span className="is-active" />
                <span />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn--ghost btn--sm" onClick={() => { setStep(0); setConnected(false); }}>→ חזור</button>
                {!connected ? (
                  <button
                    className="btn"
                    disabled={!username || !password || testing}
                    style={{ opacity: !username || !password || testing ? 0.4 : 1 }}
                    onClick={testConnection}
                  >
                    {testing ? <><span className="spin" /> בודק חיבור...</> : 'התחבר'}
                  </button>
                ) : (
                  <button className="btn" onClick={() => setStep(2)}>המשך ←</button>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 2 && uni && (
          <div className="fade-in">
            <div className="setup__step">שלב 3 מתוך 3</div>
            <h2 className="setup__h">הכל מוכן.</h2>
            <p className="setup__sub">
              חיברנו את חשבונך ל-{uni.short}. הסיסטם יבדוק כעת אילו הרצאות חדשות זמינות, וכל אלו
              שתאשר יסוכמו אוטומטית.
            </p>

            <div className="connect-status">
              <div className="connect-status__icon">✓</div>
              <div>
                <strong>חשבונך מחובר.</strong> תוכל לנהל את הקורסים מדף הקורסים.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 30 }}>
              <div className="step-dots">
                <span className="is-done" />
                <span className="is-done" />
                <span className="is-active" />
              </div>
              <button className="btn btn--accent" onClick={() => router.push('/classes')}>
                קח אותי לקורסים ←
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
