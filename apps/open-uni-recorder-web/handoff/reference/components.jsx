// ── Shared components ───────────────────────────────────────────────────

const STATUS_LABEL = {
  pending:       'ממתין',
  transcribing:  'מתמלל',
  transcribed:   'תומלל',
  summarizing:   'מסכם',
  summarized:    'מסוכם',
  error:         'שגיאה',
};

function Status({ s }) {
  return (
    <span className="status" data-s={s}>
      <span className="status__dot" />
      {STATUS_LABEL[s] || s}
    </span>
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: 'short' });
}

function fmtDateLong(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Tiny markdown → React. Handles h1/h2, paragraphs, lists, bold, code, blockquote, hr.
function renderMd(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  let key = 0;

  const inline = (s) =>
    s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\$\$(.+?)\$\$/g, '<span class="math">$1</span>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

  while (i < lines.length) {
    const ln = lines[i];

    if (/^# /.test(ln)) {
      out.push(<h1 key={key++} dangerouslySetInnerHTML={{ __html: inline(ln.slice(2)) }} />);
      i++;
    } else if (/^## /.test(ln)) {
      out.push(<h2 key={key++} dangerouslySetInnerHTML={{ __html: inline(ln.slice(3)) }} />);
      i++;
    } else if (/^### /.test(ln)) {
      out.push(<h3 key={key++} dangerouslySetInnerHTML={{ __html: inline(ln.slice(4)) }} />);
      i++;
    } else if (/^\$\$.+\$\$$/.test(ln.trim())) {
      out.push(
        <div className="math" key={key++}>
          {ln.trim().replace(/^\$\$|\$\$$/g, '')}
        </div>,
      );
      i++;
    } else if (/^> /.test(ln)) {
      const buf = [];
      while (i < lines.length && /^> /.test(lines[i])) {
        buf.push(lines[i].slice(2));
        i++;
      }
      out.push(
        <blockquote key={key++} dangerouslySetInnerHTML={{ __html: inline(buf.join(' ')) }} />,
      );
    } else if (/^- /.test(ln) || /^\* /.test(ln)) {
      const buf = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        buf.push(lines[i].replace(/^[-*] /, ''));
        i++;
      }
      out.push(
        <ul key={key++}>
          {buf.map((b, k) => (
            <li key={k} dangerouslySetInnerHTML={{ __html: inline(b) }} />
          ))}
        </ul>,
      );
    } else if (/^\d+\.\s/.test(ln)) {
      const buf = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        buf.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      out.push(
        <ol key={key++}>
          {buf.map((b, k) => (
            <li key={k} dangerouslySetInnerHTML={{ __html: inline(b) }} />
          ))}
        </ol>,
      );
    } else if (/^---/.test(ln)) {
      out.push(<hr key={key++} />);
      i++;
    } else if (ln.trim() === '') {
      i++;
    } else {
      // paragraph — gather until blank line
      const buf = [];
      while (i < lines.length && lines[i].trim() !== '' && !/^(#|>|-|\*|\d+\.\s|---)/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      out.push(<p key={key++} dangerouslySetInnerHTML={{ __html: inline(buf.join(' ')) }} />);
    }
  }
  return out;
}

// ── Sidebar ─────────────────────────────────────────────────────────────
function Sidebar({ route, onNav }) {
  const at = (path) => route === path;
  return (
    <aside className="sb">
      <div className="sb__brand">
        <div className="sb__mark">פ</div>
        <div>
          <div className="sb__name">פתוחה / רקורדר</div>
          <div className="sb__sub">סמסטר אביב 2026</div>
        </div>
      </div>

      <div className="sb__section">
        <div className="sb__label">ניווט</div>
        <button
          className={'sb__item' + (at('/') ? ' is-active' : '')}
          onClick={() => onNav('/')}
        >
          <span className="sb__icon">⌂</span>
          הקורסים שלי
          <span className="sb__count">{MOCK.classes.filter(c => !c.archived).length}</span>
        </button>
        <button
          className={'sb__item' + (at('/stats') ? ' is-active' : '')}
          onClick={() => onNav('/stats')}
        >
          <span className="sb__icon">≡</span>
          סטטיסטיקות
        </button>
        <button
          className={'sb__item' + (at('/settings') ? ' is-active' : '')}
          onClick={() => onNav('/settings')}
        >
          <span className="sb__icon">⚙</span>
          הגדרות
        </button>
      </div>

      <div className="sb__divider" />

      <div className="sb__section">
        <div className="sb__label">הקורסים שלי</div>
        {MOCK.classes.filter(c => !c.archived).map(c => (
          <button
            key={c.id}
            className={'sb__item' + (route === `/c/${c.id}` ? ' is-active' : '')}
            onClick={() => onNav(`/c/${c.id}`)}
          >
            <span className="sb__icon">{c.icon}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.name}
            </span>
            <span className="sb__count">{c.lectures.length}</span>
          </button>
        ))}
      </div>

      <div className="sb__divider" />

      <div className="sb__section">
        <div className="sb__label">ארכיון</div>
        {MOCK.classes.filter(c => c.archived).map(c => (
          <button
            key={c.id}
            className={'sb__item' + (route === `/c/${c.id}` ? ' is-active' : '')}
            onClick={() => onNav(`/c/${c.id}`)}
          >
            <span className="sb__icon">{c.icon}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.name}
            </span>
            <span className="sb__count">{c.lectures.length}</span>
          </button>
        ))}
      </div>

      <div className="sb__me">
        <div className="sb__avatar">{MOCK.me.avatar}</div>
        <div className="sb__metxt">
          {MOCK.me.name}<br />
          <small>סטודנט · שנה ב</small>
        </div>
      </div>
    </aside>
  );
}

// ── Topbar ──────────────────────────────────────────────────────────────
function Topbar({ crumbs }) {
  return (
    <header className="topbar">
      <nav className="crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="crumbs__sep">/</span>}
            {c.href ? (
              <a href={c.href} onClick={(e) => { e.preventDefault(); c.onClick && c.onClick(); }}>
                {c.label}
              </a>
            ) : (
              <span className="crumbs__current">{c.label}</span>
            )}
          </React.Fragment>
        ))}
      </nav>
      <div className="search">
        <input type="text" placeholder="חיפוש בכל ההרצאות..." />
        <span className="search__icon">⌕</span>
        <span className="search__kbd">⌘K</span>
      </div>
    </header>
  );
}

// progress sparkline for class card
function Spark({ lectures }) {
  return (
    <div className="spark">
      {lectures.map(l => {
        let cls = 'spark__bar';
        if (l.status === 'summarized') cls += ' spark__bar--done';
        else if (l.status === 'summarizing' || l.status === 'transcribing') cls += ' spark__bar--active';
        else if (l.status === 'error') cls += ' spark__bar--err';
        return <div key={l.id} className={cls} title={l.name} />;
      })}
    </div>
  );
}

Object.assign(window, {
  Sidebar, Topbar, Status, Spark,
  STATUS_LABEL, fmtDate, fmtDateLong, renderMd,
});
