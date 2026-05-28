// ── Mock data ───────────────────────────────────────────────────────────
// All text is Hebrew. Dates are real-ish for the spring 2026 semester.

window.MOCK = (function () {
  const summary1 = `
# הרצאה 6 — אינטגרציה בחלקים ושיטות אלגנטיות

## פתיחה: למה אנחנו צריכים שיטה נוספת?

עד הרצאה זו ראינו אינטגרל מסוים ולא־מסוים, את משפט היסוד ואת שיטת ההצבה.
שיטת ההצבה עוזרת כאשר הפונקציה מתחת לאינטגרל היא "נגזרת של משהו". אבל מה
קורה כאשר יש לנו **מכפלה של פונקציות** ולא מבנה של נגזרת פנימית? לשם כך
נכנסת לתמונה **אינטגרציה בחלקים**.

> "אם אתם לא יודעים מאיפה להתחיל באינטגרל מורכב — נסו בחלקים. ב־70% מהמקרים
> זו התשובה." — המרצה, דקה 04:12

## הנוסחה ומקורה

הנוסחה נובעת ישירות מכלל המכפלה לנגזרת:

$$(uv)' = u'v + uv'$$

כאשר מבצעים אינטגרל לשני האגפים, מקבלים את:

$$\\int u\\,dv = uv - \\int v\\,du$$

ה־**אומנות** היא בבחירת \`u\` ו־\`dv\`. בחירה לא נכונה לא בהכרח טועה — היא
פשוט מובילה לאינטגרל מסובך יותר ממה שהתחלנו איתו.

## חוק LIATE

המרצה הציג כלל אצבע נוח לבחירת \`u\`:

- **L** — לוגריתמים
- **I** — פונקציות טריגונומטריות הפוכות
- **A** — אלגבריות (פולינומים)
- **T** — טריגונומטריות
- **E** — מעריכיות

מי שמופיע ראשון ברשימה — מועמד טוב ל־\`u\`.

## דוגמאות מהרצאה

1. **∫ x·ln(x) dx** — בחרנו u=ln(x), dv=x dx. תוצאה: ½x²·ln(x) − ¼x² + C
2. **∫ x·eˣ dx** — בחרנו u=x. שתי איטרציות והגענו לפתרון.
3. **∫ eˣ·sin(x) dx** — דוגמה ל"אינטגרל מעגלי", בו אחרי שתי אינטגרציות
   מקבלים את האינטגרל המקורי ופותרים אותו כמשוואה אלגברית.

## נקודות שצריך לזכור למבחן

- אינטגרציה בחלקים היא **לא** פעולה הפיכה של הצבה.
- אם אחרי בחירת u קיבלתם אינטגרל מסובך יותר — החליפו את u ו־dv ונסו שוב.
- במספר רב של איטרציות, שמרו על סימנים בקפידה. שני סימני מינוס שווים פלוס.

## תרגול מומלץ

ספר התרגול עמ׳ 142–148, שאלות 7,9,12,15. בנוסף, פתרו את שאלת המבחן משנת
2024 סמסטר אביב — בדיוק אותה צורה.
`;

  const summary2 = `
# הרצאה 5 — שיטת ההצבה

באוזן השנייה של היום הוכחנו ושחקנו עם שיטת ההצבה. החדוות העיקריות:

## הרעיון בקצרה

החלפת משתנה כך שמתחת לאינטגרל מופיעה פונקציה ונגזרתה — אז האינטגרל
מתפרק ל־∫ f(u) du והפך לפשוט.

## דוגמה מרכזית

∫ 2x·cos(x²) dx. הצבנו u=x², ולכן du=2x dx. האינטגרל הופך ל־∫ cos(u) du
= sin(u) + C = sin(x²) + C.

## מתי זה לא יעבוד

כשהנגזרת של ה־u המבוקש לא מופיעה כגורם. במקרים האלו ננסה אינטגרציה
בחלקים (הרצאה הבאה).
`;

  const summary3 = `
# הרצאה 3 — אלגברה לינארית: תלות לינארית

מבוא לקונספט המרכזי שילווה אותנו בכל הקורס.

## הגדרה פורמלית

קבוצת וקטורים v₁,...,vₖ נקראת **תלויה לינארית** אם קיימים סקלרים
α₁,...,αₖ, **לא כולם אפס**, כך ש־α₁v₁ + ... + αₖvₖ = 0.

## משפט מרכזי

קבוצה היא תלויה לינארית אםם **אחד** הוקטורים הוא צירוף לינארי של
האחרים.

## דוגמאות

- {(1,0), (0,1), (2,3)} ב־R² — תלויה (כי הממד 2, וקטורים 3)
- {(1,2), (2,4)} — תלויה (כפילה)
- {(1,0,0), (0,1,0), (0,0,1)} — בלתי־תלויה (הבסיס הסטנדרטי)
`;

  // ── Classes ────────────────────────────────────────────────────────────
  const classes = [
    {
      id: 'c-analyze-1',
      code: '20109',
      name: 'חשבון אינפיניטסימלי 1',
      semester: 'אביב',
      year: 2026,
      color: 'sage',
      icon: '∫',
      lectures: [
        { id: 'l-1', n: 1, name: 'מבוא ופונקציות אלמנטריות',     date: '2026-03-04', status: 'summarized', duration: 88 },
        { id: 'l-2', n: 2, name: 'גבולות ורציפות',               date: '2026-03-11', status: 'summarized', duration: 92 },
        { id: 'l-3', n: 3, name: 'נגזרות — הגדרה ושיטות',        date: '2026-03-18', status: 'summarized', duration: 84 },
        { id: 'l-4', n: 4, name: 'יישומי הנגזרת',                date: '2026-03-25', status: 'summarized', duration: 90 },
        { id: 'l-5', n: 5, name: 'שיטת ההצבה',                   date: '2026-04-01', status: 'summarized', duration: 86, summary: summary2 },
        { id: 'l-6', n: 6, name: 'אינטגרציה בחלקים',             date: '2026-04-15', status: 'summarized', duration: 94, summary: summary1, current: true },
        { id: 'l-7', n: 7, name: 'אינטגרלים לא־אמיתיים',         date: '2026-04-22', status: 'summarizing', duration: 89 },
        { id: 'l-8', n: 8, name: 'טורים אינסופיים',              date: '2026-04-29', status: 'transcribing', duration: 91 },
        { id: 'l-9', n: 9, name: 'מבחני התכנסות',                date: '2026-05-06', status: 'pending', duration: null },
        { id: 'l-10', n: 10, name: 'טורי טיילור',                date: '2026-05-13', status: 'pending', duration: null },
        { id: 'l-11', n: 11, name: 'חזרה למבחן',                 date: '2026-05-20', status: 'error', duration: 78 },
      ],
    },
    {
      id: 'c-linalg-2',
      code: '20229',
      name: 'אלגברה לינארית 2',
      semester: 'אביב',
      year: 2026,
      color: 'amber',
      icon: 'A',
      lectures: [
        { id: 'la-1', n: 1, name: 'תזכורת ממרחבים וקטוריים',   date: '2026-03-05', status: 'summarized', duration: 80 },
        { id: 'la-2', n: 2, name: 'בסיסים וממד',               date: '2026-03-12', status: 'summarized', duration: 82 },
        { id: 'la-3', n: 3, name: 'תלות לינארית',               date: '2026-03-19', status: 'summarized', duration: 85, summary: summary3 },
        { id: 'la-4', n: 4, name: 'העתקות לינאריות',           date: '2026-03-26', status: 'summarized', duration: 90 },
        { id: 'la-5', n: 5, name: 'מטריצת מעבר',                date: '2026-04-02', status: 'transcribed', duration: 87 },
        { id: 'la-6', n: 6, name: 'ערכים וקטורים עצמיים',      date: '2026-04-23', status: 'pending', duration: null },
      ],
    },
    {
      id: 'c-prob',
      code: '20416',
      name: 'הסתברות וסטטיסטיקה',
      semester: 'אביב',
      year: 2026,
      color: 'plum',
      icon: 'P',
      lectures: [
        { id: 'p-1', n: 1, name: 'מרחבי הסתברות',              date: '2026-03-03', status: 'summarized', duration: 95 },
        { id: 'p-2', n: 2, name: 'הסתברות מותנית',              date: '2026-03-10', status: 'summarized', duration: 92 },
        { id: 'p-3', n: 3, name: 'משתנים מקריים בדידים',       date: '2026-03-17', status: 'summarized', duration: 88 },
        { id: 'p-4', n: 4, name: 'תוחלת ושונות',                date: '2026-03-24', status: 'summarized', duration: 90 },
        { id: 'p-5', n: 5, name: 'התפלגויות חשובות',           date: '2026-03-31', status: 'summarized', duration: 93 },
        { id: 'p-6', n: 6, name: 'משתנים רציפים',              date: '2026-04-07', status: 'summarized', duration: 89 },
        { id: 'p-7', n: 7, name: 'התפלגות נורמלית',             date: '2026-04-14', status: 'pending', duration: null },
        { id: 'p-8', n: 8, name: 'משפט הגבול המרכזי',          date: '2026-04-21', status: 'pending', duration: null },
      ],
    },
    {
      id: 'c-cs-intro',
      code: '20441',
      name: 'מבוא למדעי המחשב',
      semester: 'אביב',
      year: 2026,
      color: 'ink',
      icon: '{}',
      lectures: [
        { id: 'cs-1', n: 1, name: 'מבוא לתכנות', date: '2026-03-06', status: 'summarized', duration: 75 },
        { id: 'cs-2', n: 2, name: 'משתנים וטיפוסים', date: '2026-03-13', status: 'summarized', duration: 78 },
        { id: 'cs-3', n: 3, name: 'תנאים ולולאות', date: '2026-03-20', status: 'summarized', duration: 80 },
        { id: 'cs-4', n: 4, name: 'פונקציות', date: '2026-03-27', status: 'summarized', duration: 82 },
        { id: 'cs-5', n: 5, name: 'מערכים ורשימות', date: '2026-04-10', status: 'pending', duration: null },
      ],
    },
    {
      id: 'c-history',
      code: '10110',
      name: 'תולדות המחשבה המודרנית',
      semester: 'חורף',
      year: 2025,
      color: 'sage',
      icon: 'φ',
      archived: true,
      lectures: [
        { id: 'h-1', n: 1, name: 'דקארט ורציונליזם', date: '2025-11-04', status: 'summarized', duration: 102 },
        { id: 'h-2', n: 2, name: 'אמפיריציזם בריטי', date: '2025-11-11', status: 'summarized', duration: 98 },
        { id: 'h-3', n: 3, name: 'קאנט', date: '2025-11-18', status: 'summarized', duration: 105 },
        { id: 'h-4', n: 4, name: 'הגל', date: '2025-11-25', status: 'summarized', duration: 110 },
        { id: 'h-5', n: 5, name: 'ניטשה', date: '2025-12-02', status: 'summarized', duration: 96 },
        { id: 'h-6', n: 6, name: 'פנומנולוגיה', date: '2025-12-09', status: 'summarized', duration: 104 },
        { id: 'h-7', n: 7, name: 'אקזיסטנציאליזם', date: '2025-12-16', status: 'summarized', duration: 99 },
        { id: 'h-8', n: 8, name: 'פילוסופיה אנליטית', date: '2025-12-23', status: 'summarized', duration: 102 },
      ],
    },
  ];

  // ── Q&A ─────────────────────────────────────────────────────────────────
  const qa = [
    {
      q: 'מה ההבדל בין שיטת ההצבה לאינטגרציה בחלקים? איך אדע איזו לבחור?',
      a: 'שיטת ההצבה מתאימה כאשר תחת האינטגרל מופיעה פונקציה ביחד עם הנגזרת שלה — אנחנו "מבטלים" את כלל השרשרת. אינטגרציה בחלקים, לעומת זאת, מתבססת על כלל המכפלה לנגזרת ומתאימה כאשר יש לנו מכפלה של שתי פונקציות שלא קשורות ביחס נגזרת־של.\n\nכלל אצבע: אם רואים פונקציה מורכבת שמופיעה שוב כנגזרת חלקית — נסו הצבה. אם רואים מכפלה של פונקציות מסוגים שונים (פולינום × טריגונומטרי, פולינום × מעריכי וכו׳) — נסו בחלקים, ובאלו של LIATE.',
    },
    {
      q: 'מה זה "אינטגרל מעגלי" ולמה זה לא יוצר לולאה אינסופית?',
      a: 'באינטגרל מעגלי, אחרי שתי אינטגרציות בחלקים האינטגרל המקורי מופיע שוב בצד השני של המשוואה (לרוב עם מקדם או סימן שונים). אנחנו מטפלים בו כמו במשוואה אלגברית: מעבירים את האינטגרל המקורי לצד שמאל ופותרים עבורו. הדוגמה הקלאסית: ∫ eˣ·sin(x) dx.',
    },
  ];

  return {
    classes,
    qa,
    me: { name: 'יואב', avatar: 'י' },
    universities: [
      { id: 'openu',    name: 'האוניברסיטה הפתוחה', short: 'או״פ',  lms: 'OPAL · Moodle', portal: 'opal.openu.ac.il',     icon: 'פ' },
      { id: 'tau',      name: 'אוניברסיטת תל אביב',  short: 'תל אביב', lms: 'Moodle',         portal: 'moodle.tau.ac.il',     icon: 'ת' },
      { id: 'huji',     name: 'האוניברסיטה העברית',  short: 'עברית',  lms: 'Moodle',         portal: 'moodle2.cs.huji.ac.il',icon: 'ע' },
      { id: 'technion', name: 'הטכניון',              short: 'טכניון', lms: 'Moodle',         portal: 'moodle.technion.ac.il', icon: 'ט' },
      { id: 'bgu',      name: 'אוניברסיטת בן־גוריון',short: 'בן־גוריון', lms: 'Moodle',     portal: 'lemida.biu.ac.il',     icon: 'ב' },
      { id: 'haifa',    name: 'אוניברסיטת חיפה',     short: 'חיפה',   lms: 'Moodle',         portal: 'moodle.haifa.ac.il',   icon: 'ח' },
      { id: 'biu',      name: 'אוניברסיטת בר־אילן',  short: 'בר־אילן',lms: 'Moodle',         portal: 'lemida.biu.ac.il',     icon: 'א' },
    ],
    // current account
    account: {
      universityId: 'openu',
      username: 'yoav.cohen@s.openu.ac.il',
      connected: true,
      lastSync: '2026-04-22T09:00:00Z',
    },
  };
})();
