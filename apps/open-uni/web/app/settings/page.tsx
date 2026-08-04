'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiUrl, apiFetch } from '@/lib/api';
import { streamSSE } from '@/lib/sse';
import { Button } from '@/app/components/Button';
import { Select } from '@/app/components/Select';
import { SEMESTER_HE } from '@/lib/status';
import {SEMESTER_ORDER, getSelectedSemester, setSelectedSemester} from '@/lib/selectedSemester';
import { StoredCredentials, SecretKey, hasStoredCredentials, saveCredentials as saveCredentialsLocal, clearStoredCredentials, requireCredentials, getUnlocked, getPlainFields, getSecretFlags } from '@/lib/credentials';

interface DataDirInfo {
  current: string;
  configured: string | null;
  hasDb: boolean;
}

interface ClassRow {
  id: string;
  name: string;
  opalCourseUrl?: string | null;
  semester?: string | null;
  year?: number | null;
}

interface NewLecture {
  id: string;
  name: string;
  url: string;
  status: string;
  lectureDate?: string | null;
}

interface SyncSection {
  classId: string;
  className: string;
  semester?: string | null;
  year?: number | null;
  newLectures: NewLecture[];
}

type ModelKey = 'gemini' | 'claude';
type ModelStatus = 'idle' | 'testing' | 'ok' | 'error' | 'warning';

interface ModelState {
  status: ModelStatus;
  msg: string;
  latency?: number;
  response?: string;
}

const MODELS: { key: ModelKey; emoji: string; name: string; sub: string; role: string }[] = [
  { key: 'gemini', emoji: 'G', name: 'Gemini', sub: 'Google · gemini-2.0-flash', role: 'סיכומים גיבוי' },
  { key: 'claude', emoji: 'C', name: 'Claude', sub: 'Anthropic · claude-haiku-4-5-20251001', role: 'סיכומים' },
];

type CredentialField = { key: keyof StoredCredentials; label: string; secret: boolean };

// Right column (RTL) — OpenU login, plain ID/username + one secret password.
const OPAL_FIELDS: CredentialField[] = [
  { key: 'opalId', label: 'תעודת זהות', secret: false },
  { key: 'opalUsername', label: 'שם משתמש', secret: false },
  { key: 'opalPassword', label: 'סיסמה', secret: true },
];
// Left column (RTL) — AI provider API keys, all secret.
const API_KEY_FIELDS: CredentialField[] = [
  { key: 'groqApiKey', label: 'Groq (תמלול)', secret: true },
  { key: 'geminiApiKey', label: 'Gemini', secret: true },
  { key: 'anthropicApiKey', label: 'Claude', secret: true },
];
const EMPTY_CREDENTIAL_DRAFT: StoredCredentials = {
  opalUsername: '', opalId: '', opalPassword: '', groqApiKey: '', geminiApiKey: '', anthropicApiKey: '',
};

// Non-secret fields (username/ID) are stored unencrypted, so they always show
// their real value; secret fields (password, API keys) never prefill — the
// "already set" chip (driven by getSecretFlags()) is the only sign one has a value.
function draftFromPlainFields(plain: { opalUsername: string; opalId: string }): StoredCredentials {
  return { ...EMPTY_CREDENTIAL_DRAFT, opalUsername: plain.opalUsername, opalId: plain.opalId };
}

export default function SettingsPage() {
  const [dataDir, setDataDir] = useState<DataDirInfo | null>(null);
  const [pendingDataDir, setPendingDataDir] = useState<string | null>(null);
  const [dataDirHasDb, setDataDirHasDb] = useState(false);
  const [dataDirResult, setDataDirResult] = useState<{ msg: string; error?: boolean } | null>(null);
  const [pickingDir, setPickingDir] = useState(false);
  const [savingDir, setSavingDir] = useState(false);
  const [reloadMsg, setReloadMsg] = useState('');
  const [reloading, setReloading] = useState(false);

  const [emailDraft, setEmailDraft] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ msg: string; error?: boolean } | null>(null);
  const [emailEnabled, setEmailEnabled] = useState(false);

  const [syncSections, setSyncSections] = useState<SyncSection[]>([]);
  const [selectedSemesterKey, setSelectedSemesterKey] = useState('');
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [models, setModels] = useState<Record<ModelKey, ModelState>>({
    gemini: { status: 'idle', msg: 'לא נבדק' },
    claude: { status: 'idle', msg: 'לא נבדק' },
  });

  const [credentialsStored, setCredentialsStored] = useState(false);
  const [credentialDraft, setCredentialDraft] = useState<StoredCredentials>(EMPTY_CREDENTIAL_DRAFT);
  const [secretFlags, setSecretFlags] = useState<Record<SecretKey, boolean>>({
    opalPassword: false, groqApiKey: false, geminiApiKey: false, anthropicApiKey: false,
  });
  const [passphraseDraft, setPassphraseDraft] = useState('');
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [credentialsMsg, setCredentialsMsg] = useState<{ msg: string; error?: boolean } | null>(null);

  const loadDataDir = useCallback(async () => {
    try {
      const data: DataDirInfo = await fetch(apiUrl('/api/data-dir')).then((r) => r.json());
      setDataDir(data);
    } catch { /* ignore */ }
  }, []);

  const semesterOptions = useMemo(() => {
    const seen = new Map<string, { key: string; label: string; year: number; semester: string }>();
    for (const s of syncSections) {
      if (!s.semester || !s.year) continue;
      const key = `${s.semester}-${s.year}`;
      if (!seen.has(key)) seen.set(key, { key, label: `${SEMESTER_HE[s.semester] || s.semester} ${s.year}`, year: s.year, semester: s.semester });
    }
    return [...seen.values()].sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return (SEMESTER_ORDER[b.semester] ?? 0) - (SEMESTER_ORDER[a.semester] ?? 0);
    });
  }, [syncSections]);

  const loadNotifyEmail = useCallback(async () => {
    try {
      const data: { email: string | null } = await fetch(apiUrl('/api/classes/notify-email')).then((r) => r.json());
      setEmailDraft(data.email || '');
    } catch { /* ignore */ }
    try {
      const data: { enabled: boolean } = await fetch(apiUrl('/api/classes/notify-email-enabled')).then((r) => r.json());
      setEmailEnabled(data.enabled);
    } catch { /* ignore */ }
  }, []);

  const initSyncPanel = useCallback(async () => {
    try {
      const classes: ClassRow[] = await apiFetch('/api/classes').then((r) => r.json());
      const linked = classes.filter((c) => c.opalCourseUrl);
      setSyncSections(linked.map((cls) => ({
        classId: cls.id, className: cls.name, semester: cls.semester, year: cls.year, newLectures: [] as NewLecture[],
      })));
    } catch { /* ignore */ }
  }, []);

  const knownSemesterKeys = useRef<Set<string> | null>(null);

  useEffect(() => {
    const stored = getSelectedSemester();
    if (stored) setSelectedSemesterKey(stored);
  }, []);

  useEffect(() => {
    if (semesterOptions.length === 0) return;
    const currentKeys = new Set(semesterOptions.map((o) => o.key));
    const newest = semesterOptions[0]!;
    const isFirstLoad = knownSemesterKeys.current === null;
    const newestJustAppeared = !isFirstLoad && !knownSemesterKeys.current!.has(newest.key);
    knownSemesterKeys.current = currentKeys;

    if (newestJustAppeared) {
      setSelectedSemesterKey(newest.key);
    } else if (!currentKeys.has(selectedSemesterKey)) {
      setSelectedSemesterKey(newest.key);
    }
  }, [semesterOptions, selectedSemesterKey]);

  useEffect(() => {
    if (!selectedSemesterKey) return;
    setSelectedSemester(selectedSemesterKey);
    const selected = semesterOptions.find((o) => o.key === selectedSemesterKey);
    if (!selected) return;
    fetch(apiUrl('/api/classes/active-semester'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ semester: selected.semester, year: selected.year }),
    }).catch(() => { /* ignore — cron falls back to unfiltered until this succeeds */ });
  }, [selectedSemesterKey, semesterOptions]);

  const visibleSyncSections = useMemo(
    () => syncSections.filter((s) => `${s.semester}-${s.year}` === selectedSemesterKey),
    [syncSections, selectedSemesterKey],
  );

  useEffect(() => {
    loadDataDir();
    loadNotifyEmail();
    setCredentialsStored(hasStoredCredentials());
    setCredentialDraft(draftFromPlainFields(getPlainFields()));
    setSecretFlags(getSecretFlags());
    initSyncPanel();
  }, [loadDataDir, loadNotifyEmail, initSyncPanel]);

  const saveNotifyEmail = async () => {
    setSavingEmail(true);
    setEmailMsg(null);
    try {
      const res = await fetch(apiUrl('/api/classes/notify-email'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailDraft }),
      });
      const data = await res.json();
      if (!res.ok) { setEmailMsg({ msg: data.error || 'שגיאה', error: true }); return; }
      setEmailDraft(data.email);
      setEmailMsg({ msg: 'הכתובת נשמרה' });
    } catch { setEmailMsg({ msg: 'שגיאת רשת', error: true }); }
    finally { setSavingEmail(false); }
  };

  const toggleEmailEnabled = async () => {
    const next = !emailEnabled;
    setEmailEnabled(next);
    try {
      await fetch(apiUrl('/api/classes/notify-email-enabled'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
    } catch { setEmailEnabled(!next); }
  };

  const saveCredentials = async () => {
    if (!passphraseDraft.trim()) { setCredentialsMsg({ msg: 'יש להזין סיסמת הצפנה', error: true }); return; }
    setSavingCredentials(true);
    setCredentialsMsg(null);
    try {
      // ponytail: a blank secret field means "leave as-is", not "clear it" — but
      // that only works if we already have the old values in memory (unlocked
      // this session). If the store was never unlocked, a blank field really
      // does get saved blank; upgrade path is prompting to unlock before save.
      const previouslyUnlocked = getUnlocked();
      const toSave: StoredCredentials = { ...credentialDraft };
      for (const key of ['opalPassword', 'groqApiKey', 'geminiApiKey', 'anthropicApiKey'] as SecretKey[]) {
        if (!toSave[key] && previouslyUnlocked) toSave[key] = previouslyUnlocked[key];
      }

      await saveCredentialsLocal(passphraseDraft, toSave);
      setCredentialsStored(true);
      setCredentialDraft(draftFromPlainFields(getPlainFields()));
      setSecretFlags(getSecretFlags());
      setPassphraseDraft('');
      setCredentialsMsg({ msg: 'הפרטים נשמרו' });
    } catch { setCredentialsMsg({ msg: 'שגיאה בהצפנה', error: true }); }
    finally { setSavingCredentials(false); }
  };

  const clearCredentials = () => {
    if (!confirm('למחוק את פרטי הגישה השמורים בדפדפן זה?')) return;
    clearStoredCredentials();
    setCredentialsStored(false);
    setCredentialDraft(EMPTY_CREDENTIAL_DRAFT);
    setSecretFlags(getSecretFlags());
    setCredentialsMsg({ msg: 'הפרטים נמחקו' });
  };

  const pickDataDir = async () => {
    setPickingDir(true);
    try {
      const data: { path?: string; hasDb?: boolean; cancelled?: boolean; error?: string } =
        await fetch(apiUrl('/api/data-dir/pick'), { method: 'POST' }).then((r) => r.json());
      if (data.cancelled) return;
      if (data.error) { setDataDirResult({ msg: `שגיאה: ${data.error}`, error: true }); return; }
      if (data.path) { setPendingDataDir(data.path); setDataDirHasDb(!!data.hasDb); }
    } finally { setPickingDir(false); }
  };

  const saveDataDir = async () => {
    if (!pendingDataDir) return;
    setSavingDir(true);
    try {
      const data: { ok?: boolean; error?: string } = await fetch(apiUrl('/api/data-dir'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataDir: pendingDataDir }),
      }).then((r) => r.json());
      if (data.ok) { setDataDirResult({ msg: 'הנתיב נשמר. השרת מופעל מחדש...' }); setPendingDataDir(null); }
      else setDataDirResult({ msg: `שגיאה: ${data.error}`, error: true });
    } catch { setDataDirResult({ msg: 'שגיאת רשת', error: true }); }
    finally { setSavingDir(false); }
  };

  const reloadFromDisk = async () => {
    setReloading(true);
    setReloadMsg('טוען...');
    try {
      const data: { ok?: boolean; classes?: number; lectures?: number; error?: string } =
        await fetch(apiUrl('/api/reload-from-disk'), { method: 'POST' }).then((r) => r.json());
      if (data.ok) setReloadMsg(`שוחזר: ${data.classes} קורסים, ${data.lectures} הרצאות`);
      else setReloadMsg(`שגיאה: ${data.error}`);
    } catch { setReloadMsg('שגיאת רשת'); }
    finally { setReloading(false); }
  };

  const runSync = async () => {
    setSyncing(true);
    setSyncProgress('מתחיל...');
    try {
      const creds = await requireCredentials();
      const selected = semesterOptions.find((o) => o.key === selectedSemesterKey);
      const body = { ...creds, ...(selected ? { semester: selected.semester, year: selected.year } : {}) };
      await streamSSE('/api/classes/sync', body, (ev) => {
        if (ev.type === 'progress') setSyncProgress(String(ev.message));
        else if (ev.type === 'class') {
          const classId = String(ev.classId);
          const newLectures = (ev.newLectures as NewLecture[]) || [];
          setSyncSections((prev) => prev.map((s) => s.classId === classId ? { ...s, newLectures } : s));
        } else if (ev.type === 'done') setSyncProgress('סיום בדיקה');
      });
    } catch (err) {
      setSyncProgress(`שגיאה: ${err instanceof Error ? err.message : 'שגיאה'}`);
    } finally { setSyncing(false); }
  };

  const testModel = async (key: ModelKey) => {
    setModels((m) => ({ ...m, [key]: { status: 'testing', msg: 'שולח בקשה...' } }));
    try {
      const creds = await requireCredentials();
      const apiKey = key === 'claude' ? creds.anthropicApiKey : creds.geminiApiKey;
      const data: { ok?: boolean; configured?: boolean; error?: string; ms?: number; response?: string } =
        await fetch(apiUrl(`/health/${key}`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey }),
        }).then((r) => r.json());
      if (!data.configured) {
        setModels((m) => ({ ...m, [key]: { status: 'warning', msg: data.error || 'מפתח API לא מוגדר' } }));
      } else if (data.ok) {
        setModels((m) => ({ ...m, [key]: { status: 'ok', msg: 'תקין', latency: data.ms, response: data.response } }));
      } else {
        setModels((m) => ({ ...m, [key]: { status: 'error', msg: data.error || 'שגיאה' } }));
      }
    } catch (err) {
      setModels((m) => ({ ...m, [key]: { status: 'error', msg: err instanceof Error ? err.message : 'שגיאה' } }));
    }
  };

  const testAll = async () => { await Promise.all(MODELS.map((m) => testModel(m.key))); };

  return (
    <div className="page fade-in">
      <div className="settings-grid">
        {/* Detect-new sync card */}
        <div className="set-card">
          <div className="set-card__h">
            <div>
              <div className="set-card__title">זיהוי הרצאות חדשות</div>
              <div className="set-card__sub">בודק את אזור הקורס מול OPAL</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {semesterOptions.length > 0 && (
                <Select
                  value={selectedSemesterKey}
                  onChange={setSelectedSemesterKey}
                  options={semesterOptions.map((o) => ({ value: o.key, label: o.label }))}
                />
              )}
              <Button onClick={runSync} disabled={syncing}>
                {syncing ? 'מחפש...' : '🔍 בדוק עכשיו'}
              </Button>
            </div>
          </div>

          {syncProgress && (
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 12 }}>{syncProgress}</div>
          )}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {visibleSyncSections.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                אין קורסים עם קישור OPAL לסמסטר הנבחר
              </div>
            ) : visibleSyncSections.every((s) => s.newLectures.length === 0) ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                לא נמצאו הרצאות חדשות בבדיקה האחרונה
              </div>
            ) : (
              visibleSyncSections.filter((s) => s.newLectures.length > 0).map((s) => (
                <div key={s.classId} style={{ marginBottom: 12 }}>
                  <div style={{ font: '600 0.85rem/1 var(--font-ui)', marginBottom: 6 }}>{s.className}</div>
                  <div style={{ font: '600 0.78rem/1 var(--font-ui)', color: 'var(--accent)', padding: '4px 0' }}>
                    נוספו — {s.newLectures.length} הרצאות
                  </div>
                  {s.newLectures.map((l) => (
                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderTop: '1px dashed var(--line-2)', fontSize: '0.85rem' }}>
                      <span style={{ flex: 1, color: 'var(--ink-2)' }}>{l.name}</span>
                    </div>
                  ))}
                </div>
              ))
            )}

          </div>
        </div>

        {/* Notification email card */}
        <div className="set-card">
          <div className="set-card__h">
            <div>
              <div className="set-card__title">שליחת סיכומים למייל</div>
              <div className="set-card__sub">כתובת לשליחת סיכום לאחר עיבוד הרצאה</div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={emailEnabled} onChange={toggleEmailEnabled} />
              {emailEnabled ? 'פעיל' : 'כבוי'}
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="email"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              placeholder="you@example.com"
              className="text-field text-field--full"
              style={{ flex: 1 }}
            />
            <Button onClick={saveNotifyEmail} disabled={savingEmail}>
              {savingEmail ? 'שומר...' : 'שמור'}
            </Button>
          </div>
          {emailMsg && (
            <div style={{ marginTop: 8, fontSize: '0.82rem', color: emailMsg.error ? 'var(--danger)' : 'var(--good)' }}>
              {emailMsg.msg}
            </div>
          )}
        </div>

        {/* Storage card */}
        <div className="set-card">
          <div className="set-card__h">
            <div>
              <div className="set-card__title">אחסון</div>
              <div className="set-card__sub">תמלולים, סיכומים, מטה-דאטה</div>
            </div>
            <Button onClick={pickDataDir} disabled={pickingDir}>
              {pickingDir ? 'פותח...' : '📁 שנה תיקייה'}
            </Button>
          </div>

          <div style={{ font: '0.85rem/1.5 var(--font-ui)', color: 'var(--muted)', marginBottom: 14 }}>
            תיקייה נוכחית:
            <div style={{ font: '0.82rem var(--font-mono)', color: 'var(--ink)', wordBreak: 'break-all', marginTop: 6, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
              {dataDir ? dataDir.current : '—'}
            </div>
          </div>

          {pendingDataDir && !dataDirHasDb && dataDir?.current && (
            <div style={{ marginBottom: 8, fontSize: '0.85rem', color: 'var(--warn)' }}>
              נתיב זה ריק. הנתונים הקיימים נשארים ב: {dataDir.current}
            </div>
          )}
          {pendingDataDir && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '0.85rem', wordBreak: 'break-all', marginBottom: 8 }}>נתיב נבחר: {pendingDataDir}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={saveDataDir} disabled={savingDir}>{savingDir ? 'שומר...' : 'שמור והפעל מחדש'}</Button>
                <Button onClick={() => setPendingDataDir(null)}>ביטול</Button>
              </div>
            </div>
          )}
          {dataDirResult && (
            <div style={{ fontSize: '0.85rem', color: dataDirResult.error ? 'var(--danger)' : 'var(--good)', marginBottom: 8 }}>
              {dataDirResult.msg}
            </div>
          )}

          <div style={{ paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <Button onClick={reloadFromDisk} disabled={reloading}>
              {reloading ? 'טוען...' : '♻️ שחזור מדיסק'}
            </Button>
            {reloadMsg && (
              <div style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--muted)' }}>{reloadMsg}</div>
            )}
          </div>
        </div>

        {/* Credentials card */}
        <div className="set-card">
          <div className="set-card__h">
            <div>
              <div className="set-card__title">פרטי גישה</div>
              <div className="set-card__sub">
                האוניברסיטה הפתוחה ומפתחות API — מוצפן בדפדפן זה בלבד, לא נשמר בשרת
                {credentialsStored ? ' · שמור' : ''}
              </div>
            </div>
          </div>

          <div className="cred-grid">
            <div className="cred-section">
              <div className="cred-section__title">האוניברסיטה הפתוחה</div>
              {OPAL_FIELDS.map(({ key, label, secret }) => (
                <div key={key} className="cred-field">
                  <div className="cred-field__label">
                    {label}
                    {secret && secretFlags[key as SecretKey] && (
                      <span className="chip chip--accent"><span className="chip__dot" />מוגדר</span>
                    )}
                  </div>
                  <input
                    type={secret ? 'password' : 'text'}
                    value={credentialDraft[key]}
                    onChange={(e) => setCredentialDraft((d) => ({ ...d, [key]: e.target.value }))}
                    className="text-field text-field--full"
                  />
                </div>
              ))}
            </div>

            <div className="cred-section">
              <div className="cred-section__title">מפתחות API</div>
              {API_KEY_FIELDS.map(({ key, label, secret }) => (
                <div key={key} className="cred-field">
                  <div className="cred-field__label">
                    {label}
                    {secret && secretFlags[key as SecretKey] && (
                      <span className="chip chip--accent"><span className="chip__dot" />מוגדר</span>
                    )}
                  </div>
                  <input
                    type={secret ? 'password' : 'text'}
                    value={credentialDraft[key]}
                    onChange={(e) => setCredentialDraft((d) => ({ ...d, [key]: e.target.value }))}
                    className="text-field text-field--full"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="cred-divider" />

          <div className="cred-field">
            <div className="cred-field__label">סיסמת הצפנה</div>
            <input
              type="password"
              value={passphraseDraft}
              onChange={(e) => setPassphraseDraft(e.target.value)}
              placeholder="נדרשת כדי לפתוח את הפרטים בהמשך"
              className="text-field text-field--full"
            />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <Button onClick={saveCredentials} disabled={savingCredentials}>
              {savingCredentials ? 'שומר...' : 'שמור'}
            </Button>
            {credentialsStored && (
              <Button variant="danger-ghost" onClick={clearCredentials}>מחק פרטים שמורים</Button>
            )}
            {credentialsMsg && (
              <div style={{ fontSize: '0.82rem', color: credentialsMsg.error ? 'var(--danger)' : 'var(--good)' }}>
                {credentialsMsg.msg}
              </div>
            )}
          </div>
        </div>

        {/* AI Models — full width */}
        <div className="set-card set-card--wide">
          <div className="set-card__h">
            <div>
              <div className="set-card__title">מודלי בינה מלאכותית</div>
              <div className="set-card__sub">סטטוס בזמן אמת · בדיקת זמינות וזמני תגובה</div>
            </div>
            <Button onClick={testAll}>▶ בדוק את כולם</Button>
          </div>

          {MODELS.map(({ key, emoji, name, sub, role }) => {
            const m = models[key];
            const cls =
              m.status === 'ok' ? 'model model--ok' :
              m.status === 'error' ? 'model model--err' :
              m.status === 'warning' ? 'model model--warn' :
              'model';
            return (
              <div key={key} className={cls}>
                <div className="model__avatar">{emoji}</div>
                <div>
                  <div className="model__name">
                    {name}
                    <span style={{ fontWeight: 400, fontSize: '0.78rem', color: 'var(--muted)', marginInlineStart: 6 }}>· {role}</span>
                  </div>
                  <div className="model__sub">{sub}</div>
                </div>
                <div className="model__stat">
                  {m.status === 'testing' ? (
                    <>
                      <strong style={{ color: 'var(--muted)' }}>...</strong>
                      <span>בודק...</span>
                    </>
                  ) : m.latency ? (
                    <>
                      <strong>{m.latency}<span style={{ fontWeight: 400, fontSize: '0.7em', color: 'var(--muted)' }}>ms</span></strong>
                      <span>{m.msg}</span>
                    </>
                  ) : (
                    <>
                      <strong style={{ color: m.status === 'warning' ? 'var(--warn)' : 'var(--muted)' }}>—</strong>
                      <span>{m.msg}</span>
                    </>
                  )}
                  <Button
                    size="xs"
                    style={{ marginTop: 8 }}
                    onClick={() => testModel(key)}
                    disabled={m.status === 'testing'}
                  >
                    {m.status === 'testing' ? 'בודק...' : m.status === 'idle' ? 'בדוק' : 'בדוק שנית'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
