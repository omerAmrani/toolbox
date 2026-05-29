'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiUrl } from '@/lib/api';
import { SEMESTER_HE } from '@/lib/status';
import { classIcon, isClassArchived } from '@/lib/classMeta';

interface ClassRow {
  id: string;
  name: string;
  semester?: string | null;
  year?: number | null;
  lectureCount: number;
}

interface LectureRow {
  id: string;
  status: string;
  lectureDate?: string | null;
}

function ComingSoon() {
  return (
    <span
      className="status"
      data-s="pending"
      style={{ fontSize: '0.7rem', verticalAlign: 'middle', marginInlineStart: 6 }}
    >
      בקרוב
    </span>
  );
}

export default function StatsPage() {
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [lecturesByClass, setLecturesByClass] = useState<Record<string, LectureRow[]>>({});

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl('/api/classes'))
      .then((r) => r.json())
      .then((data: ClassRow[]) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setClasses(list);
        Promise.all(
          list.map(async (c) => {
            try {
              const lecs: LectureRow[] = await fetch(
                apiUrl(`/api/classes/${c.id}/lectures`),
              ).then((r) => r.json());
              return [c.id, Array.isArray(lecs) ? lecs : []] as const;
            } catch {
              return [c.id, [] as LectureRow[]] as const;
            }
          }),
        ).then((pairs) => {
          if (cancelled) return;
          const map: Record<string, LectureRow[]> = {};
          for (const [id, lecs] of pairs) map[id] = lecs;
          setLecturesByClass(map);
        });
      })
      .catch(() => {
        if (!cancelled) setClasses([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const allLectures = useMemo(
    () => Object.values(lecturesByClass).flat(),
    [lecturesByClass],
  );

  const total = allLectures.length;
  const summarized = allLectures.filter(
    (l) => l.status === 'summarized' || l.status === 'done',
  ).length;
  const summarizing = allLectures.filter((l) => l.status === 'summarizing').length;
  const transcribing = allLectures.filter((l) => l.status === 'transcribing').length;
  const processing = allLectures.filter((l) => l.status === 'processing').length;
  const transcribed = allLectures.filter((l) => l.status === 'transcribed').length;
  const pending = allLectures.filter((l) => l.status === 'pending').length;
  const errors = allLectures.filter(
    (l) => l.status === 'error' || l.status === 'failed' || l.status === 'aborted',
  ).length;
  const skipped = allLectures.filter((l) => l.status === 'skipped').length;

  const inProcessing = summarizing + transcribing + processing;

  const classList = classes ?? [];
  const activeClasses = classList.filter((c) => !isClassArchived(c.id));
  const archivedClasses = classList.filter((c) => isClassArchived(c.id));

  const distSegments = [
    { key: 'summarized', count: summarized, color: 'var(--st-summarized)', label: 'מסוכמות' },
    { key: 'summarizing', count: summarizing, color: 'var(--st-summarizing)', label: 'מסכם כעת' },
    { key: 'transcribing', count: transcribing + processing, color: 'var(--st-transcribing)', label: 'מתמלל כעת' },
    { key: 'transcribed', count: transcribed, color: 'var(--st-transcribed)', label: 'תומלל' },
    { key: 'pending', count: pending, color: 'var(--line-2)', label: 'ממתין' },
    { key: 'skipped', count: skipped, color: 'var(--muted)', label: 'דולג' },
    { key: 'error', count: errors, color: 'var(--st-error)', label: 'שגיאות' },
  ].filter((s) => s.count > 0);

  // Weekly activity: last 8 weeks based on lectureDate
  const weeklyData = useMemo(() => {
    const dates = allLectures
      .filter((l) => l.lectureDate)
      .map((l) => new Date(l.lectureDate!).getTime())
      .filter((t) => !isNaN(t));

    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    return Array.from({ length: 8 }, (_, i) => {
      const end = now - i * weekMs;
      const start = end - weekMs;
      const count = dates.filter((t) => t > start && t <= end).length;
      const d = new Date(end);
      return { count, label: `${d.getDate()}/${d.getMonth() + 1}` };
    }).reverse();
  }, [allLectures]);

  const maxWeek = Math.max(1, ...weeklyData.map((w) => w.count));

  const loading = classes === null;

  return (
    <div className="page fade-in">
      <div className="display-h">
        <div className="display-h__eye">סקירה כללית</div>
        <h1 className="display-h__title">סטטיסטיקות.</h1>
        <p className="display-h__sub">
          מבט מקיף על הספרייה האקדמית שלך — כל הסטטוסים, פעילות לאורך זמן ופירוט לפי קורס.
        </p>
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 'var(--gap)' }}>טוען...</div>
      ) : (
        <>
          {/* Stat tiles */}
          <div className="stats-grid">
            <div className="stat-tile">
              <div className="stat-tile__eye">מסוכמות</div>
              <div className="stat-tile__n">
                {summarized}
                {total > 0 && <small>/ {total}</small>}
              </div>
              <div className="stat-tile__sub">
                {total > 0 ? `${Math.round((summarized / total) * 100)}% מסך ההרצאות הושלמו` : 'אין הרצאות'}
              </div>
            </div>

            <div className="stat-tile">
              <div className="stat-tile__eye">בעיבוד</div>
              <div className="stat-tile__n">{inProcessing}</div>
              <div className="stat-tile__sub">
                {summarizing > 0 && `${summarizing} בסיכום`}
                {summarizing > 0 && transcribing + processing > 0 && ' · '}
                {transcribing + processing > 0 && `${transcribing + processing} בתמלול`}
                {inProcessing === 0 && 'אין כרגע בעיבוד'}
              </div>
            </div>

            <div className="stat-tile">
              <div className="stat-tile__eye">ממתינות</div>
              <div className="stat-tile__n">{pending}</div>
              <div className="stat-tile__sub">בתור לעיבוד אוטומטי</div>
            </div>

            <div className={'stat-tile' + (errors > 0 ? ' stat-tile--warn' : '')}>
              <div className="stat-tile__eye">שגיאות</div>
              <div className="stat-tile__n">{errors}</div>
              <div className="stat-tile__sub">דורשות תשומת לב ידנית</div>
            </div>

            <div className="stat-tile">
              <div className="stat-tile__eye">קורסים</div>
              <div className="stat-tile__n">
                {activeClasses.length}
                {archivedClasses.length > 0 && <small>/ {classList.length}</small>}
              </div>
              <div className="stat-tile__sub">
                {activeClasses.length} פעילים
                {archivedClasses.length > 0 && ` · ${archivedClasses.length} בארכיון`}
              </div>
            </div>

            <div className="stat-tile">
              <div className="stat-tile__eye">
                תוכן מוקלט
                <ComingSoon />
              </div>
              <div className="stat-tile__n" style={{ color: 'var(--muted)' }}>—</div>
              <div className="stat-tile__sub">דורש שדה משך מהשרת</div>
            </div>

            <div className="stat-tile stat-tile--accent">
              <div className="stat-tile__eye">
                זמן קריאה נחסך
                <ComingSoon />
              </div>
              <div className="stat-tile__n" style={{ color: 'var(--muted)' }}>—</div>
              <div className="stat-tile__sub">תחושב לאחר הוספת משך הרצאה</div>
            </div>

            <div className="stat-tile">
              <div className="stat-tile__eye">
                ממוצע אורך הרצאה
                <ComingSoon />
              </div>
              <div className="stat-tile__n" style={{ color: 'var(--muted)' }}>—</div>
              <div className="stat-tile__sub">דורש שדה משך מהשרת</div>
            </div>
          </div>

          {/* Status distribution */}
          {total > 0 && (
            <>
              <div className="section-h">
                <div className="section-h__t">התפלגות סטטוסים</div>
                <div className="section-h__s">{total} הרצאות בסך הכל</div>
              </div>
              <div className="dist">
                <div className="dist__bar">
                  {distSegments.map((s) => (
                    <div
                      key={s.key}
                      className="dist__seg"
                      style={{ flex: s.count, background: s.color }}
                      title={`${s.label}: ${s.count}`}
                    />
                  ))}
                </div>
                <div className="dist__legend">
                  {distSegments.map((s) => (
                    <div key={s.key} className="dist__l">
                      <span className="dist__l-dot" style={{ background: s.color }} />
                      <span className="dist__l-lbl">{s.label}</span>
                      <span className="dist__l-n">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Weekly activity */}
          <div className="section-h">
            <div className="section-h__t">פעילות שבועית</div>
            <div className="section-h__s">הרצאות שנוספו ב־8 השבועות האחרונים</div>
          </div>
          <div className="weekly__card" style={{ marginBottom: 'var(--gap)' }}>
            <div className="weekly__bars">
              {weeklyData.map((w, i) => (
                <div className="weekly__bar" key={i}>
                  <div
                    className="weekly__bar-fill"
                    style={{
                      height: `${(w.count / maxWeek) * 100}%`,
                      background: w.count === 0 ? 'var(--surface-2)' : 'var(--accent)',
                    }}
                  >
                    {w.count > 0 && <span className="weekly__bar-n">{w.count}</span>}
                  </div>
                  <div className="weekly__bar-l">{w.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Per-class breakdown */}
          {classList.length > 0 && (
            <>
              <div className="section-h">
                <div className="section-h__t">פירוט לפי קורס</div>
                <div className="section-h__s">התקדמות ביחס לכלל ההרצאות</div>
              </div>
              <div className="bycls">
                {classList.map((c) => {
                  const lecs = lecturesByClass[c.id] ?? [];
                  const tot = lecs.length;
                  const done = lecs.filter(
                    (l) => l.status === 'summarized' || l.status === 'done',
                  ).length;
                  const proc = lecs.filter(
                    (l) =>
                      l.status === 'summarizing' ||
                      l.status === 'transcribing' ||
                      l.status === 'processing',
                  ).length;
                  const err = lecs.filter(
                    (l) =>
                      l.status === 'error' ||
                      l.status === 'failed' ||
                      l.status === 'aborted',
                  ).length;
                  const wait = lecs.filter((l) => l.status === 'pending').length;
                  const sem = c.semester ? SEMESTER_HE[c.semester] || c.semester : '';
                  const yr = c.year ? ` ${c.year}` : '';
                  const meta = [sem + yr].filter(Boolean).join(' ');
                  return (
                    <div className="bycls__row" key={c.id}>
                      <div className="bycls__icon">{classIcon(c.name)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="bycls__title">{c.name}</div>
                        {tot > 0 && (
                          <div className="bycls__bar">
                            {done > 0 && (
                              <span
                                style={{
                                  width: `${(done / tot) * 100}%`,
                                  background: 'var(--st-summarized)',
                                }}
                              />
                            )}
                            {proc > 0 && (
                              <span
                                style={{
                                  width: `${(proc / tot) * 100}%`,
                                  background: 'var(--st-summarizing)',
                                }}
                              />
                            )}
                            {wait > 0 && (
                              <span
                                style={{
                                  width: `${(wait / tot) * 100}%`,
                                  background: 'var(--line-2)',
                                }}
                              />
                            )}
                            {err > 0 && (
                              <span
                                style={{
                                  width: `${(err / tot) * 100}%`,
                                  background: 'var(--st-error)',
                                }}
                              />
                            )}
                          </div>
                        )}
                      </div>
                      <div className="bycls__stat">
                        {done}/{tot}
                        {meta && <small>{meta}</small>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* AI model usage — no backend data yet */}
          <div className="section-h">
            <div className="section-h__t">
              שימוש במודלי AI
              <ComingSoon />
            </div>
            <div className="section-h__s">נתונים יתווספו לאחר הוספת endpoint סטטיסטיקות</div>
          </div>
          <div
            className="bycls"
            style={{
              opacity: 0.5,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            {['מודל סיכום', 'מודל תמלול', 'מודל שאלות-תשובות'].map((name) => (
              <div className="bycls__row" key={name}>
                <div
                  className="bycls__icon"
                  style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}
                >
                  —
                </div>
                <div>
                  <div className="bycls__title">{name}</div>
                  <div style={{ font: 'var(--type-small)', color: 'var(--muted)', marginTop: 2 }}>
                    בקרוב
                  </div>
                </div>
                <div className="bycls__stat">
                  —<small>—</small>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
