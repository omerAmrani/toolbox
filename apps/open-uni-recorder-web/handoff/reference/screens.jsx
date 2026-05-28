// ═══════════════════════════════════════════════════════════════════════
//  SCREENS
// ═══════════════════════════════════════════════════════════════════════

// ── Classes ────────────────────────────────────────────────────────────
function ClassesScreen({ go }) {
  const [filter, setFilter] = React.useState('all');
  const [modalOpen, setModalOpen] = React.useState(false);
  const active = MOCK.classes.filter(c => !c.archived);
  const archived = MOCK.classes.filter(c => c.archived);

  const visible =
    filter === 'all' ? MOCK.classes :
    filter === 'spring-26' ? active :
    archived;

  // glance stats — kept minimal, full set lives in /stats
  const allLectures = MOCK.classes.flatMap(c => c.lectures);
  const total = allLectures.length;
  const summarized = allLectures.filter(l => l.status === 'summarized').length;
  const pending    = allLectures.filter(l => l.status === 'pending').length;
  const errors     = allLectures.filter(l => l.status === 'error').length;

  return (
    <div className="page fade-in">
      <div className="display-h">
        <div className="display-h__eye">העמוד הראשי</div>
        <h1 className="display-h__title">הספרייה האקדמית שלי.</h1>
        <p className="display-h__sub">
          ארבעה קורסים פעילים, {total} הרצאות. כל הקלטה מומרת לטקסט, מתוכלת ומסוכמת
          באופן אוטומטי — כדי שתוכל לקרוא, לא להתרכז בלהאזין.
        </p>
      </div>

      <div className="glance">
        <div className="glance__cell">
          <div className="glance__n">{summarized}<small>/ {total}</small></div>
          <div className="glance__l">הרצאות מסוכמות</div>
        </div>
        <div className="glance__cell">
          <div className="glance__n">{pending}</div>
          <div className="glance__l">ממתינות לעיבוד</div>
        </div>
        <div className="glance__cell">
          <div className="glance__n">42<small>:18</small></div>
          <div className="glance__l">שעות קריאה נחסכו</div>
        </div>
        <div className="glance__cell">
          <div className="glance__n" style={errors > 0 ? {color:'var(--st-error)'} : undefined}>{errors}</div>
          <div className="glance__l">דורשות תשומת לב</div>
        </div>
      </div>

      <div className="semester-strip">
        <button className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>
          הכל <span className="semester-strip__count">{MOCK.classes.length}</span>
        </button>
        <button className={filter === 'spring-26' ? 'is-active' : ''} onClick={() => setFilter('spring-26')}>
          אביב 2026 <span className="semester-strip__count">{active.length}</span>
        </button>
        <button className={filter === 'archive' ? 'is-active' : ''} onClick={() => setFilter('archive')}>
          ארכיון <span className="semester-strip__count">{archived.length}</span>
        </button>
      </div>

      <div className="class-grid">
        {visible.map(c => {
          const done = c.lectures.filter(l => l.status === 'summarized').length;
          return (
            <article
              key={c.id}
              className="class-card"
              data-color={c.color}
              onClick={() => go(`/c/${c.id}`)}
            >
              <div className="class-card__bar" />
              <div className="class-card__top">
                <div className="class-card__icon">{c.icon}</div>
                <div className="class-card__code">{c.code}</div>
              </div>
              <h3 className="class-card__title">{c.name}</h3>
              <div className="class-card__meta">{c.semester} · {c.year}</div>
              <Spark lectures={c.lectures} />
              <div className="class-card__stats">
                <div className="class-card__stat">
                  <div className="class-card__stat-n">{done}/{c.lectures.length}</div>
                  <div className="class-card__stat-l">מסוכם</div>
                </div>
                <div className="class-card__stat">
                  <div className="class-card__stat-n">
                    {Math.round(c.lectures.filter(l=>l.duration).reduce((s,l)=>s+l.duration,0)/60)}<span style={{color:'var(--muted)',fontWeight:400,fontSize:'0.7em'}}>ש׳</span>
                  </div>
                  <div className="class-card__stat-l">תוכן</div>
                </div>
              </div>
            </article>
          );
        })}

        <div className="class-new" onClick={() => setModalOpen(true)}>
          <div className="class-new__plus">+</div>
          קורס חדש
        </div>
      </div>

      {modalOpen && <NewCourseModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}

// ── New Course Modal ───────────────────────────────────────────────────
function NewCourseModal({ onClose }) {
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [semester, setSemester] = React.useState('spring');
  const [year, setYear] = React.useState('2026');
  const acct = MOCK.account;
  const uni = MOCK.universities.find(u => u.id === acct.universityId);

  const submit = () => {
    if (!name.trim() || !url.trim()) {
      alert('שם הקורס וקישור הדף נדרשים');
      return;
    }
    alert(`קורס "${name}" נוסף. נתחיל לסרוק את ${uni.portal} עבור הרצאות חדשות.`);
    onClose();
  };

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal__eye">{uni.name}</div>
        <h2 className="modal__title">קורס חדש</h2>

        <div className="modal__field">
          <label>שם הקורס</label>
          <input
            type="text"
            placeholder="למשל: חשבון אינפיניטסימלי 1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="modal__field">
          <label>קישור לדף הקורס</label>
          <input
            type="url"
            dir="ltr"
            placeholder={`https://${uni.portal}/course/...`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="modal__hint">
            הדבק את הקישור מ-{uni.portal}. נשתמש בו כדי לזהות הרצאות חדשות אוטומטית.
          </div>
        </div>

        <div className="modal__row">
          <div className="modal__field">
            <label>קוד קורס</label>
            <input
              type="text"
              dir="ltr"
              placeholder="20109"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="modal__field">
            <label>סמסטר</label>
            <select value={semester} onChange={(e) => setSemester(e.target.value)}>
              <option value="spring">אביב</option>
              <option value="summer">קיץ</option>
              <option value="fall">סתיו</option>
              <option value="winter">חורף</option>
            </select>
          </div>
          <div className="modal__field">
            <label>שנה</label>
            <input
              type="number"
              dir="ltr"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
        </div>

        <div className="modal__actions">
          <button className="btn btn--ghost btn--sm" onClick={onClose}>ביטול</button>
          <button className="btn" onClick={submit}>צור קורס</button>
        </div>
      </div>
    </div>
  );
}

// ── Class detail ───────────────────────────────────────────────────────
function ClassDetailScreen({ classId, layout, go }) {
  const c = MOCK.classes.find(x => x.id === classId);
  if (!c) return <div className="page">לא נמצא</div>;

  const [view, setView] = React.useState(layout || 'cards'); // cards | table

  React.useEffect(() => { setView(layout || 'cards'); }, [layout]);

  const done = c.lectures.filter(l => l.status === 'summarized').length;
  const totalHours = (c.lectures.filter(l=>l.duration).reduce((s,l)=>s+l.duration,0)/60).toFixed(1);

  return (
    <div className="page fade-in">
      <div className="detail-h" data-color={c.color}>
        <div className="detail-h__mark">{c.icon}</div>
        <div className="detail-h__body">
          <div className="detail-h__code">{c.code} · האוניברסיטה הפתוחה</div>
          <h1 className="detail-h__title">{c.name}</h1>
          <div className="detail-h__meta">
            <span>{c.semester} {c.year}</span>
            <span style={{opacity:0.4}}>·</span>
            <span>{c.lectures.length} הרצאות</span>
            <span style={{opacity:0.4}}>·</span>
            <span>{done} מסוכמות</span>
            <span style={{opacity:0.4}}>·</span>
            <span>{totalHours} שעות תוכן</span>
          </div>
        </div>
        <div className="detail-h__actions">
          <div className="layout-toggle">
            <button className={view==='cards' ? 'is-active':''} onClick={() => setView('cards')}>קווי זמן</button>
            <button className={view==='table' ? 'is-active':''} onClick={() => setView('table')}>טבלה</button>
          </div>
          <button className="btn btn--ghost btn--sm" title="ערוך קורס">✎</button>
        </div>
      </div>

      {view === 'cards' ? <TimelineView c={c} go={go} /> : <TableView c={c} go={go} />}
    </div>
  );
}

function TimelineView({ c, go }) {
  return (
    <div className="timeline">
      {c.lectures.map(l => (
        <div key={l.id} className="tl-item" data-status={l.status} data-current={l.current ? '' : undefined}>
          <div className="tl-item__dot" />
          <article
            className="lec-card"
            data-current={l.current ? '' : undefined}
            onClick={() => l.status === 'summarized' && go(`/c/${c.id}/l/${l.id}`)}
          >
            <div className="lec-card__num">{String(l.n).padStart(2,'0')}</div>
            <div>
              <div className="lec-card__title">{l.name}</div>
              <div className="lec-card__meta">
                <span>{fmtDateLong(l.date)}</span>
                {l.duration && <><span style={{opacity:0.4}}>·</span><span>{l.duration} דק׳</span></>}
                <span style={{opacity:0.4}}>·</span>
                <Status s={l.status} />
              </div>
            </div>
            <div className="lec-card__actions">
              {l.status === 'summarized' && (
                <button className="btn btn--ghost btn--sm" onClick={(e) => { e.stopPropagation(); go(`/c/${c.id}/l/${l.id}`); }}>קרא ↺</button>
              )}
              {l.status === 'pending' && (
                <button className="btn btn--sm">▶ סכם</button>
              )}
              {l.status === 'error' && (
                <button className="btn btn--ghost btn--sm">↻ נסה שנית</button>
              )}
              {(l.status === 'summarizing' || l.status === 'transcribing') && (
                <button className="btn btn--ghost btn--sm">⏹ עצור</button>
              )}
            </div>
            {(l.status === 'summarizing' || l.status === 'transcribing') && (
              <div className="lec-card__progress"><span style={{ width: l.status==='summarizing' ? '78%' : '42%' }} /></div>
            )}
          </article>
        </div>
      ))}
    </div>
  );
}

function TableView({ c, go }) {
  return (
    <table className="lec-table">
      <thead>
        <tr>
          <th>#</th>
          <th>שם ההרצאה</th>
          <th>תאריך</th>
          <th>אורך</th>
          <th>סטטוס</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {c.lectures.map(l => (
          <tr key={l.id} data-current={l.current ? '' : undefined} onClick={() => l.status === 'summarized' && go(`/c/${c.id}/l/${l.id}`)}>
            <td className="lec-table__num">{String(l.n).padStart(2,'0')}</td>
            <td className="lec-table__name">{l.name}</td>
            <td className="lec-table__date">{fmtDate(l.date)}</td>
            <td className="lec-table__date">{l.duration ? `${l.duration} דק׳` : '—'}</td>
            <td><Status s={l.status} /></td>
            <td style={{textAlign:'end'}}>
              {l.status === 'summarized' && <button className="btn btn--ghost btn--sm">קרא ↺</button>}
              {l.status === 'pending' && <button className="btn btn--sm">▶ סכם</button>}
              {l.status === 'error' && <button className="btn btn--ghost btn--sm">↻</button>}
              {(l.status === 'summarizing' || l.status === 'transcribing') && <button className="btn btn--ghost btn--sm">⏹</button>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Lecture detail ─────────────────────────────────────────────────────
function LectureScreen({ classId, lectureId, layout, go }) {
  const c = MOCK.classes.find(x => x.id === classId);
  const l = c?.lectures.find(x => x.id === lectureId);
  const [progressPct, setProgressPct] = React.useState(0);
  const [qaInput, setQaInput] = React.useState('');
  const [qaMessages, setQaMessages] = React.useState(MOCK.qa.slice(0, 1));
  const [thinking, setThinking] = React.useState(false);

  const onScroll = React.useCallback(() => {
    const sc = document.documentElement.scrollTop || document.body.scrollTop;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    setProgressPct(max > 0 ? Math.min(100, (sc / max) * 100) : 0);
  }, []);

  React.useEffect(() => {
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  if (!c || !l) return <div className="page">לא נמצא</div>;
  const md = l.summary || `# ${l.name}\n\nהסיכום עדיין לא נוצר.`;

  const askQuestion = (q) => {
    if (!q) return;
    setQaMessages(prev => [...prev, { q, a: null }]);
    setQaInput('');
    setThinking(true);
    setTimeout(() => {
      setQaMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          q,
          a: 'תשובה לדוגמה: על סמך ההרצאה, התשובה הקצרה היא — תלוי בהקשר. בדגמה אנו לא רצים מודל אמיתי, אבל ביישום החי המשובץ AI היה מחזיר תשובה מדויקת המבוססת על התמלול.',
        };
        return copy;
      });
      setThinking(false);
    }, 1200);
  };

  const isSplit = layout === 'split';

  const summaryBlock = (
    <div className="summary">
      {renderMd(md)}
    </div>
  );

  const qaBlock = (
    <section className={'qa' + (isSplit ? ' qa--inline' : '')}>
      <div className="qa__h">
        <h2 className="qa__title">שאל את ההרצאה</h2>
        <span className="qa__sub">המודל קורא את כל התמלול ועונה</span>
      </div>
      {qaMessages.map((m, i) => (
        <div className="qa__msg" key={i}>
          <div>
            <span className="qa__avatar qa__avatar--me">{MOCK.me.avatar}</span>
            <span className="qa__q">{m.q}</span>
          </div>
          {m.a !== null ? (
            <div className="qa__a">
              <span className="qa__avatar">פ</span>
              {m.a}
            </div>
          ) : (
            <div className="qa__a"><span className="qa__avatar">פ</span> <span className="spin" style={{verticalAlign:'middle',marginInlineStart:8}}/> חושב על התמלול…</div>
          )}
        </div>
      ))}
      <div className="qa__compose">
        <input
          type="text"
          placeholder="שאל שאלה על ההרצאה הזו..."
          value={qaInput}
          onChange={(e) => setQaInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && askQuestion(qaInput)}
        />
        <button className="btn btn--accent btn--sm" onClick={() => askQuestion(qaInput)}>שלח ⌃</button>
      </div>
      <div className="suggested">
        <button onClick={() => askQuestion('מה הם שלושת הנושאים העיקריים של ההרצאה?')}>סכם את הנושאים העיקריים</button>
        <button onClick={() => askQuestion('מה צריך לדעת מההרצאה הזו למבחן?')}>מה צריך לדעת למבחן?</button>
        <button onClick={() => askQuestion(MOCK.qa[1].q)}>מה זה אינטגרל מעגלי?</button>
      </div>
    </section>
  );

  const sidebar = (
    <aside className="lec-aside">
      <div className="lec-aside__meta">
        <div className="lec-aside__title">פרטי ההרצאה</div>
        <dl>
          <div className="lec-aside__row"><dt>תאריך</dt><dd>{fmtDateLong(l.date)}</dd></div>
          <div className="lec-aside__row"><dt>אורך מקור</dt><dd>{l.duration} דקות</dd></div>
          <div className="lec-aside__row"><dt>תמלול</dt><dd>Whisper · large-v3</dd></div>
          <div className="lec-aside__row"><dt>סיכום</dt><dd>Claude · haiku 4.5</dd></div>
          <div className="lec-aside__row"><dt>גרסת סיכום</dt><dd>v3 · 14 באפר׳</dd></div>
          <div className="lec-aside__row"><dt>זמן קריאה</dt><dd>~6 דקות</dd></div>
        </dl>
      </div>
      <div className="lec-aside__meta">
        <div className="lec-aside__title">פעולות</div>
        <button className="btn btn--ghost btn--sm" style={{width:'100%', justifyContent:'center', marginBottom:8}}>🔄 סכם מחדש</button>
        <button className="btn btn--ghost btn--sm" style={{width:'100%', justifyContent:'center', marginBottom:8}}>↻ תמלל מחדש</button>
        <button className="btn btn--ghost btn--sm" style={{width:'100%', justifyContent:'center', marginBottom:8}}>📜 הצג תמלול גולמי</button>
        <button className="btn btn--ghost btn--sm" style={{width:'100%', justifyContent:'center'}}>🕓 גרסאות קודמות (3)</button>
      </div>
    </aside>
  );

  return (
    <div className="page lec-page fade-in">
      <div className="lec-progress"><span style={{ width: progressPct + '%' }} /></div>

      <div className="lec-h">
        <div>
          <div className="lec-h__eye">
            <a href="#" onClick={(e) => { e.preventDefault(); go(`/c/${classId}`); }} style={{color:'inherit'}}>
              {c.name}
            </a>
            <span style={{margin:'0 8px'}}>·</span>
            הרצאה {l.n}
          </div>
          <h1 className="lec-h__title">{l.name}</h1>
          <div className="lec-h__meta">
            <span>{fmtDateLong(l.date)}</span>
            <span className="dot"/>
            <span>{l.duration} דקות הקלטה</span>
            <span className="dot"/>
            <span>~6 דקות קריאה</span>
            <span className="dot"/>
            <Status s={l.status} />
          </div>
        </div>
        <div className="lec-h__actions">
          <button className="btn btn--ghost btn--sm">📜 תמלול</button>
          <button className="btn btn--ghost btn--sm">🕓 גרסאות</button>
          <button className="btn btn--ghost btn--sm">↗ ייצוא</button>
        </div>
      </div>

      {isSplit ? (
        <div className="lec-grid lec-grid--split">
          <div>
            {summaryBlock}
            {qaBlock}
          </div>
          {sidebar}
        </div>
      ) : (
        <div className="lec-grid">
          {summaryBlock}
          {qaBlock}
        </div>
      )}
    </div>
  );
}

// ── Settings ───────────────────────────────────────────────────────────
function SettingsScreen({ go }) {
  const [testing, setTesting] = React.useState(null);
  const [statuses, setStatuses] = React.useState({
    claude: { state: 'ok',  msg: 'תקין', latency: 412 },
    gemini: { state: 'ok',  msg: 'תקין', latency: 287 },
    whisper:{ state: 'ok',  msg: 'תקין', latency: 1840 },
    openai: { state: 'warn',msg: 'מפתח API לא מוגדר', latency: null },
  });

  const test = (key) => {
    setTesting(key);
    setTimeout(() => {
      setStatuses(s => ({ ...s, [key]: { state:'ok', msg:'תקין', latency: 200 + Math.floor(Math.random()*600) }}));
      setTesting(null);
    }, 1100);
  };

  const queue = [
    { id: 1, cls: 'חשבון 1', name: 'הרצאה 8 — טורים אינסופיים', status: 'transcribing', t: '13:42' },
    { id: 2, cls: 'חשבון 1', name: 'הרצאה 7 — אינטגרלים לא־אמיתיים', status: 'summarizing', t: '13:39' },
    { id: 3, cls: 'אלגברה 2', name: 'הרצאה 6 — ערכים עצמיים', status: 'pending', t: '13:30' },
  ];

  const models = [
    { key: 'claude',  name: 'Claude', sub: 'Anthropic · claude-haiku-4.5', emoji: 'C', role: 'סיכומים' },
    { key: 'gemini',  name: 'Gemini', sub: 'Google · gemini-2.5-pro',      emoji: 'G', role: 'סיכומים גיבוי' },
    { key: 'whisper', name: 'Whisper', sub: 'OpenAI · large-v3',           emoji: 'W', role: 'תמלול' },
    { key: 'openai',  name: 'GPT-4o', sub: 'OpenAI · gpt-4o-mini',         emoji: 'O', role: 'תשובות שאלות' },
  ];

  return (
    <div className="page fade-in">
      <div className="display-h">
        <div className="display-h__eye">תצורה ובריאות</div>
        <h1 className="display-h__title">הגדרות.</h1>
        <p className="display-h__sub">
          ניהול מודלי בינה מלאכותית, תור עיבוד, וזיהוי אוטומטי של הרצאות חדשות
          מאזור הקורס בפורטל האוניברסיטה הפתוחה.
        </p>
      </div>

      <AccountCard go={go} />

      <div className="settings-grid">
        {/* Sync */}
        <div className="set-card">
          <div className="set-card__h">
            <div>
              <div className="set-card__title">זיהוי הרצאות חדשות</div>
              <div className="set-card__sub">בודק את אזור הקורס מדי 6 שעות</div>
            </div>
            <button className="btn btn--ghost btn--sm">🔍 בדוק עכשיו</button>
          </div>
          <div style={{ font: '0.85rem/1.5 var(--font-ui)', color: 'var(--muted)' }}>
            הרצה אחרונה: <strong style={{color:'var(--ink)',fontWeight:600}}>היום · 09:00</strong><br />
            נמצאו 2 הרצאות חדשות, נוספו לתור.<br />
            <br />
            <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderTop:'1px dashed var(--line-2)'}}>
              <span>חשבון 1</span><span style={{color:'var(--ink)'}}>+1 הרצאה</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderTop:'1px dashed var(--line-2)'}}>
              <span>אלגברה 2</span><span style={{color:'var(--ink)'}}>+1 הרצאה</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderTop:'1px dashed var(--line-2)',borderBottom:'1px dashed var(--line-2)'}}>
              <span>הסתברות</span><span style={{color:'var(--muted)'}}>—</span>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="set-card">
          <div className="set-card__h">
            <div>
              <div className="set-card__title">התראות</div>
              <div className="set-card__sub">איך לקבל עדכון על סיכומים חדשים</div>
            </div>
          </div>
          <SettingsToggle label="מייל בסיום סיכום" defaultOn />
          <SettingsToggle label="התראת מערכת בכישלון" defaultOn />
          <SettingsToggle label="סיכום שבועי במייל" />
          <SettingsToggle label="התראת WhatsApp (ניסיוני)" />
        </div>

        {/* Storage */}
        <div className="set-card">
          <div className="set-card__h">
            <div>
              <div className="set-card__title">אחסון</div>
              <div className="set-card__sub">תמלולים, סיכומים, מטה־דאטה</div>
            </div>
            <button className="btn btn--ghost btn--sm">📁 שנה תיקייה</button>
          </div>
          <div style={{ font: '0.85rem/1.5 var(--font-ui)', color: 'var(--muted)', marginBottom: 14 }}>
            תיקייה נוכחית:
            <div style={{font: '0.82rem var(--font-mono)', color:'var(--ink)', wordBreak:'break-all', marginTop:6, padding:'8px 12px', background:'var(--surface-2)', borderRadius:8}}>
              ~/Documents/openuni-recordings
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, fontSize:'0.82rem' }}>
            <div>
              <div style={{color:'var(--muted)'}}>תמלולים</div>
              <div style={{font:'600 1rem/1 var(--font-read)',marginTop:4}}>1.2 GB</div>
            </div>
            <div>
              <div style={{color:'var(--muted)'}}>סיכומים</div>
              <div style={{font:'600 1rem/1 var(--font-read)',marginTop:4}}>184 KB</div>
            </div>
            <div>
              <div style={{color:'var(--muted)'}}>הקלטות</div>
              <div style={{font:'600 1rem/1 var(--font-read)',marginTop:4}}>14.7 GB</div>
            </div>
          </div>
        </div>

        {/* Queue */}
        <div className="set-card">
          <div className="set-card__h">
            <div>
              <div className="set-card__title">תור עיבוד</div>
              <div className="set-card__sub">{queue.length} הרצאות פעילות</div>
            </div>
            <button className="btn btn--sm">▶ הפעל תור</button>
          </div>
          {queue.map(q => (
            <div key={q.id} className="queue-row">
              <div className="queue-row__class">{q.cls}</div>
              <div className="queue-row__name">{q.name}</div>
              <Status s={q.status} />
              <div className="queue-row__t">{q.t}</div>
            </div>
          ))}
        </div>

        {/* AI Health */}
        <div className="set-card set-card--wide">
          <div className="set-card__h">
            <div>
              <div className="set-card__title">מודלי בינה מלאכותית</div>
              <div className="set-card__sub">סטטוס בזמן אמת · בדיקת זמינות וזמני תגובה</div>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => models.forEach(m => test(m.key))}>
              ▶ בדוק את כולם
            </button>
          </div>
          {models.map(m => {
            const s = statuses[m.key];
            const cls =
              s.state === 'ok'   ? 'model model--ok'   :
              s.state === 'warn' ? 'model model--warn' :
                                    'model model--err';
            return (
              <div key={m.key} className={cls}>
                <div className="model__avatar">{m.emoji}</div>
                <div>
                  <div className="model__name">{m.name} <span style={{fontWeight:400,fontSize:'0.78rem',color:'var(--muted)',marginInlineStart:6}}>· {m.role}</span></div>
                  <div className="model__sub">{m.sub}</div>
                </div>
                <div className="model__stat">
                  {testing === m.key ? (
                    <>
                      <strong style={{color:'var(--muted)'}}><span className="spin" style={{verticalAlign:'middle'}}/></strong>
                      <span>בודק...</span>
                    </>
                  ) : s.latency ? (
                    <>
                      <strong>{s.latency}<span style={{fontWeight:400,fontSize:'0.7em',color:'var(--muted)'}}>ms</span></strong>
                      <span>{s.msg}</span>
                    </>
                  ) : (
                    <>
                      <strong style={{color:'var(--warn)'}}>—</strong>
                      <span>{s.msg}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  STATS SCREEN
// ═══════════════════════════════════════════════════════════════════════
function StatsScreen({ go }) {
  const allLectures = MOCK.classes.flatMap(c => c.lectures.map(l => ({ ...l, cls: c })));
  const total = allLectures.length;
  const summarized   = allLectures.filter(l => l.status === 'summarized').length;
  const summarizing  = allLectures.filter(l => l.status === 'summarizing').length;
  const transcribing = allLectures.filter(l => l.status === 'transcribing').length;
  const transcribed  = allLectures.filter(l => l.status === 'transcribed').length;
  const pending      = allLectures.filter(l => l.status === 'pending').length;
  const errors       = allLectures.filter(l => l.status === 'error').length;
  const totalMinutes = allLectures.filter(l=>l.duration).reduce((s,l)=>s+l.duration,0);
  const audioHours   = (totalMinutes/60).toFixed(1);
  const dates = allLectures.filter(l=>l.date).map(l=>new Date(l.date).getTime());
  const latest = Math.max(...dates);

  // weekly bars: last 8 weeks of activity
  const weekMs = 7*24*60*60*1000;
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = latest - i*weekMs;
    const start = end - weekMs;
    const count = dates.filter(t => t > start && t <= end).length;
    const d = new Date(end);
    return { count, label: `${d.getDate()}/${d.getMonth()+1}` };
  }).reverse();
  const maxWeek = Math.max(1, ...weeks.map(w => w.count));

  const distSegments = [
    { key:'summarized',   count: summarized,   color: 'var(--st-summarized)',   label: 'מסוכמות' },
    { key:'summarizing',  count: summarizing,  color: 'var(--st-summarizing)',  label: 'מסכם כעת' },
    { key:'transcribing', count: transcribing, color: 'var(--st-transcribing)', label: 'מתמלל כעת' },
    { key:'transcribed',  count: transcribed,  color: 'var(--st-transcribed)',  label: 'תומלל' },
    { key:'pending',      count: pending,      color: 'var(--line-2)',          label: 'ממתין' },
    { key:'error',        count: errors,       color: 'var(--st-error)',        label: 'שגיאות' },
  ].filter(s => s.count > 0);

  const active = MOCK.classes.filter(c => !c.archived);
  // model usage (mock)
  const models = [
    { name: 'Claude · haiku 4.5',     role: 'סיכומים',         used: 19, cost: '$0.42' },
    { name: 'Gemini · 2.5 pro',       role: 'סיכומים (גיבוי)', used: 6,  cost: '$0.18' },
    { name: 'Whisper · large-v3',     role: 'תמלולים',         used: 25, cost: '$1.04' },
    { name: 'GPT-4o · mini',          role: 'תשובות שאלות',    used: 38, cost: '$0.09' },
  ];

  return (
    <div className="page fade-in">
      <div className="display-h">
        <div className="display-h__eye">סקירה כללית</div>
        <h1 className="display-h__title">סטטיסטיקות.</h1>
        <p className="display-h__sub">
          מבט מקיף על הספרייה האקדמית שלך — כל הסטטוסים, פעילות לאורך זמן,
          פירוט לפי קורס, ושימוש במודלי AI.
        </p>
      </div>

      <div className="stats-grid">
        <div className="stat-tile">
          <div className="stat-tile__eye">מסוכמות</div>
          <div className="stat-tile__n">{summarized}<small>/ {total}</small></div>
          <div className="stat-tile__sub">{Math.round(summarized/total*100)}% מסך ההרצאות הושלמו</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile__eye">בעיבוד</div>
          <div className="stat-tile__n">{summarizing + transcribing}</div>
          <div className="stat-tile__sub">{summarizing} בסיכום · {transcribing} בתמלול</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile__eye">ממתינות</div>
          <div className="stat-tile__n">{pending}</div>
          <div className="stat-tile__sub">בתור לעיבוד אוטומטי</div>
        </div>
        <div className={'stat-tile ' + (errors > 0 ? 'stat-tile--warn' : '')}>
          <div className="stat-tile__eye">שגיאות</div>
          <div className="stat-tile__n">{errors}</div>
          <div className="stat-tile__sub">דורשות תשומת לב ידנית</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile__eye">תוכן מוקלט</div>
          <div className="stat-tile__n">{audioHours}<small>ש׳</small></div>
          <div className="stat-tile__sub"><strong>{totalMinutes}</strong> דקות הרצאה</div>
        </div>
        <div className="stat-tile stat-tile--accent">
          <div className="stat-tile__eye">זמן קריאה נחסך</div>
          <div className="stat-tile__n">42<small>:18 ש׳</small></div>
          <div className="stat-tile__sub">סיכומים קצרים פי ~7 מהמקור</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile__eye">קורסים</div>
          <div className="stat-tile__n">{active.length}<small>/ {MOCK.classes.length}</small></div>
          <div className="stat-tile__sub">{active.length} פעילים · {MOCK.classes.length - active.length} בארכיון</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile__eye">ממוצע אורך הרצאה</div>
          <div className="stat-tile__n">{Math.round(totalMinutes / allLectures.filter(l=>l.duration).length)}<small>דק׳</small></div>
          <div className="stat-tile__sub">~6 דקות קריאה אחרי סיכום</div>
        </div>
      </div>

      <div className="section-h">
        <div className="section-h__t">התפלגות סטטוסים</div>
        <div className="section-h__s">{total} הרצאות בסך הכל</div>
      </div>
      <div className="dist">
        <div className="dist__bar">
          {distSegments.map(s => (
            <div
              key={s.key}
              className="dist__seg"
              style={{ flex: s.count, background: s.color }}
              title={`${s.label}: ${s.count}`}
            />
          ))}
        </div>
        <div className="dist__legend">
          {distSegments.map(s => (
            <div key={s.key} className="dist__l">
              <span className="dist__l-dot" style={{ background: s.color }} />
              <span className="dist__l-lbl">{s.label}</span>
              <span className="dist__l-n">{s.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="section-h">
        <div className="section-h__t">פעילות שבועית</div>
        <div className="section-h__s">הרצאות שנוספו ב־8 השבועות האחרונים</div>
      </div>
      <div className="weekly__card" style={{marginBottom: 'var(--gap)'}}>
        <div className="weekly__bars">
          {weeks.map((w, i) => (
            <div className="weekly__bar" key={i}>
              <div
                className="weekly__bar-fill"
                style={{ height: `${(w.count / maxWeek) * 100}%`, background: w.count === 0 ? 'var(--surface-2)' : 'var(--accent)' }}
              >
                {w.count > 0 && <span className="weekly__bar-n">{w.count}</span>}
              </div>
              <div className="weekly__bar-l">{w.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="section-h">
        <div className="section-h__t">פירוט לפי קורס</div>
        <div className="section-h__s">התקדמות ביחס לכלל ההרצאות</div>
      </div>
      <div className="bycls">
        {MOCK.classes.map(c => {
          const done = c.lectures.filter(l => l.status === 'summarized').length;
          const proc = c.lectures.filter(l => ['summarizing','transcribing'].includes(l.status)).length;
          const err  = c.lectures.filter(l => l.status === 'error').length;
          const wait = c.lectures.filter(l => l.status === 'pending').length;
          const tot = c.lectures.length;
          const mins = c.lectures.filter(l=>l.duration).reduce((s,l)=>s+l.duration,0);
          return (
            <div className="bycls__row" key={c.id}>
              <div className="bycls__icon">{c.icon}</div>
              <div style={{minWidth:0}}>
                <div className="bycls__title">{c.name}</div>
                <div className="bycls__bar">
                  {done > 0 && <span style={{ width: `${done/tot*100}%`, background: 'var(--st-summarized)' }} />}
                  {proc > 0 && <span style={{ width: `${proc/tot*100}%`, background: 'var(--st-summarizing)' }} />}
                  {wait > 0 && <span style={{ width: `${wait/tot*100}%`, background: 'var(--line-2)' }} />}
                  {err  > 0 && <span style={{ width: `${err/tot*100}%`,  background: 'var(--st-error)' }} />}
                </div>
              </div>
              <div className="bycls__stat">
                {done}/{tot}
                <small>{(mins/60).toFixed(1)} ש׳ · {c.semester} {c.year}</small>
              </div>
            </div>
          );
        })}
      </div>

      <div className="section-h">
        <div className="section-h__t">שימוש במודלי AI</div>
        <div className="section-h__s">לפי החודש האחרון · עלות מצטברת מוערכת</div>
      </div>
      <div className="bycls">
        {models.map(m => (
          <div className="bycls__row" key={m.name}>
            <div className="bycls__icon" style={{background:'var(--surface-2)',color:'var(--ink)'}}>
              {m.name[0]}
            </div>
            <div>
              <div className="bycls__title">{m.name}</div>
              <div style={{font:'var(--type-small)', color:'var(--muted)', marginTop:2}}>{m.role}</div>
            </div>
            <div className="bycls__stat">
              {m.used}<small>קריאות · {m.cost}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsToggle({ label, defaultOn }) {
  const [on, setOn] = React.useState(!!defaultOn);
  return (
    <div
      style={{
        display:'flex',
        justifyContent:'space-between',
        alignItems:'center',
        padding:'12px 0',
        borderBottom:'1px solid var(--line)',
        cursor:'pointer',
      }}
      onClick={() => setOn(!on)}
    >
      <span style={{fontSize:'0.9rem'}}>{label}</span>
      <span
        style={{
          width:36, height:20,
          background: on ? 'var(--ink)' : 'var(--line-2)',
          borderRadius:999,
          position:'relative',
          transition:'background 0.15s',
        }}
      >
        <span style={{
          position:'absolute',
          insetBlockStart:2,
          insetInlineEnd: on ? 2 : 18,
          width:16, height:16,
          background:'var(--bg)',
          borderRadius:'50%',
          transition:'inset-inline-end 0.15s',
        }}/>
      </span>
    </div>
  );
}

// ── Account Card (settings) ────────────────────────────────────────────
function AccountCard({ go }) {
  const acct = MOCK.account;
  const uni = MOCK.universities.find(u => u.id === acct.universityId);
  const lastSync = new Date(acct.lastSync).toLocaleString('he-IL', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="account" style={{marginBottom: 'var(--gap)'}}>
      <div className="account__avatar">{uni.icon}</div>
      <div>
        <div className="account__uni">{uni.name}</div>
        <div className="account__user">{acct.username}</div>
        <div className="account__pill">מחובר · סנכרון אחרון {lastSync}</div>
      </div>
      <div style={{display:'flex',gap:8,flexDirection:'column'}}>
        <button
          className="btn btn--ghost btn--sm"
          style={{background:'transparent', color:'var(--bg)', borderColor:'color-mix(in srgb, var(--bg) 30%, transparent)'}}
          onClick={() => go('/setup')}
        >
          ↗ שנה אוניברסיטה
        </button>
        <button
          className="btn btn--ghost btn--sm"
          style={{background:'transparent', color:'var(--bg)', borderColor:'color-mix(in srgb, var(--bg) 30%, transparent)'}}
        >
          ↻ עדכן סיסמה
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  SETUP / LOGIN SCREEN
// ═══════════════════════════════════════════════════════════════════════
function SetupScreen({ go }) {
  const [step, setStep] = React.useState(0);
  const [uniId, setUniId] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [testing, setTesting] = React.useState(false);
  const [connected, setConnected] = React.useState(false);

  const uni = MOCK.universities.find(u => u.id === uniId);

  const testConnection = () => {
    setTesting(true);
    setTimeout(() => {
      setTesting(false);
      setConnected(true);
    }, 1400);
  };

  const finish = () => {
    go('/');
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
            רקורדר מתחבר לפורטל האוניברסיטה שלך, מזהה הרצאות חדשות,
            מתמלל ומסכם אותן בשבילך — אז במקום שעות של האזנה,
            יש לך דקות של קריאה.
          </p>
          <ul>
            <li>זיהוי אוטומטי של הרצאות חדשות באזור הקורס</li>
            <li>תמלול בעברית, סיכום על ידי Claude</li>
            <li>שאלות ותשובות חכמות על תוכן ההרצאה</li>
            <li>חיפוש בכל ההרצאות והתמלולים</li>
          </ul>
        </div>

        <div className="setup__footer">
          הכל פועל באופן מקומי. הקרדנציאלים שלך לא יוצאים מהמכשיר.
        </div>
      </div>

      <div className="setup__form">
        {step === 0 && (
          <div className="fade-in">
            <div className="setup__step">שלב 1 מתוך 3</div>
            <h2 className="setup__h">איזה מוסד אתה לומד בו?</h2>
            <p className="setup__sub">בחר את האוניברסיטה כדי שנדע איפה לחפש הרצאות חדשות.</p>

            <div className="uni-grid">
              {MOCK.universities.map(u => (
                <button
                  key={u.id}
                  className={'uni-card' + (uniId === u.id ? ' is-selected' : '')}
                  onClick={() => setUniId(u.id)}
                >
                  <div className="uni-card__icon">{u.icon}</div>
                  <div>
                    <div className="uni-card__name">{u.short}</div>
                    <div className="uni-card__sub">{u.lms}</div>
                  </div>
                </button>
              ))}
            </div>

            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div className="step-dots">
                <span className="is-active" />
                <span />
                <span />
              </div>
              <button
                className="btn"
                disabled={!uniId}
                style={{opacity: uniId ? 1 : 0.4, pointerEvents: uniId ? 'auto' : 'none'}}
                onClick={() => setStep(1)}
              >
                המשך ←
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="fade-in">
            <div className="setup__step">שלב 2 מתוך 3</div>
            <h2 className="setup__h">התחבר ל{uni.short}</h2>
            <p className="setup__sub">
              אנחנו ניגשים ל-{uni.portal} בשמך כדי לקרוא רשימת הרצאות.
              הסיסמה שלך נשמרת מוצפנת על המכשיר ולא נשלחת לאף שרת.
            </p>

            <div className="modal__field">
              <label>שם משתמש</label>
              <input
                type="text"
                placeholder={uni.id === 'openu' ? 'מספר ת״ז' : 'שם משתמש'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>

            <div className="modal__field">
              <label>סיסמה</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {connected && (
              <div className="connect-status">
                <div className="connect-status__icon">✓</div>
                <div>
                  <strong>החיבור הוכח.</strong> זיהינו 4 קורסים פעילים בסמסטר הנוכחי.
                </div>
              </div>
            )}

            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:30}}>
              <div className="step-dots">
                <span className="is-done" />
                <span className="is-active" />
                <span />
              </div>
              <div style={{display:'flex',gap:10}}>
                <button className="btn btn--ghost btn--sm" onClick={() => setStep(0)}>→ חזור</button>
                {!connected ? (
                  <button
                    className="btn"
                    disabled={!username || !password || testing}
                    style={{opacity: (!username || !password || testing) ? 0.4 : 1}}
                    onClick={testConnection}
                  >
                    {testing ? (<><span className="spin"/> בודק חיבור...</>) : 'התחבר'}
                  </button>
                ) : (
                  <button className="btn" onClick={() => setStep(2)}>המשך ←</button>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="fade-in">
            <div className="setup__step">שלב 3 מתוך 3</div>
            <h2 className="setup__h">הכל מוכן.</h2>
            <p className="setup__sub">
              חיברנו את חשבונך ל-{uni.short}. הסיסטם יבדוק כעת אילו הרצאות
              חדשות זמינות, וכל אלו שתאשר יסוכמו אוטומטית.
            </p>

            <div className="connect-status">
              <div className="connect-status__icon">✓</div>
              <div><strong>4 קורסים פעילים</strong> זוהו וזמינים בקורסים שלך.</div>
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:14,marginTop:24}}>
              <div style={{padding:'14px 16px', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, display:'flex',justifyContent:'space-between'}}>
                <span style={{font:'500 0.9rem var(--font-ui)'}}>חשבון אינפיניטסימלי 1</span>
                <span style={{font:'500 0.78rem var(--font-mono)', color:'var(--muted)'}}>20109 · 11 הרצאות</span>
              </div>
              <div style={{padding:'14px 16px', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, display:'flex',justifyContent:'space-between'}}>
                <span style={{font:'500 0.9rem var(--font-ui)'}}>אלגברה לינארית 2</span>
                <span style={{font:'500 0.78rem var(--font-mono)', color:'var(--muted)'}}>20229 · 6 הרצאות</span>
              </div>
              <div style={{padding:'14px 16px', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, display:'flex',justifyContent:'space-between'}}>
                <span style={{font:'500 0.9rem var(--font-ui)'}}>הסתברות וסטטיסטיקה</span>
                <span style={{font:'500 0.78rem var(--font-mono)', color:'var(--muted)'}}>20416 · 8 הרצאות</span>
              </div>
              <div style={{padding:'14px 16px', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, display:'flex',justifyContent:'space-between'}}>
                <span style={{font:'500 0.9rem var(--font-ui)'}}>מבוא למדעי המחשב</span>
                <span style={{font:'500 0.78rem var(--font-mono)', color:'var(--muted)'}}>20441 · 5 הרצאות</span>
              </div>
            </div>

            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:30}}>
              <div className="step-dots">
                <span className="is-done" />
                <span className="is-done" />
                <span className="is-active" />
              </div>
              <button className="btn btn--accent" onClick={finish}>קח אותי לקורסים ←</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, {
  ClassesScreen, ClassDetailScreen, LectureScreen, SettingsScreen, StatsScreen, SetupScreen,
});
