// Recommended changes to the haftara notes in word_notes.json (the corpus's
// word-notes table), checked against Wikipedia's "List of Haftarot"
// (https://en.wikipedia.org/wiki/Haftara, read 2026-10-14). The source is
// corrected by hand; this only proposes, and on every run reports which
// proposals word_notes.json already reflects.
//
// Usage:  node haftara-recommendations.mjs
// Writes: work/haftara-recommendations.md (for review), .json (same data)
//
// Conventions of the existing notes, kept in the proposals:
//   start  - "הפטרת X" on the haftara's first word ("לאשכנזים"/"לספרדים" when rites differ)
//   end    - "עד כאן" on its last word (rite suffix when rites end differently)
// A = Ashkenazi, S = Sephardi (Wikipedia's codes). Ranges are inclusive.

import fs from 'node:fs';
import path from 'node:path';
import { WORK, readJson, shortForName, loadChapter, isMarkerWord } from './tanach-lib.mjs';

// ============================================================================
// CONFIG
// ============================================================================
const NOTES_FILE = path.join(WORK, 'word_notes.json');
const OUT_MD = path.join(WORK, 'haftara-recommendations.md');
const OUT_JSON = path.join(WORK, 'haftara-recommendations.json');
const WIKI = 'https://en.wikipedia.org/wiki/Haftara#List_of_Haftarot';
// ============================================================================

// at: "Book ch:v" (+ "#n" for a word; no "#n" = first word for a start, last
// word for an end). action: add | change | move | reclassify | delete | comment.
const R = [
  // ---- Genesis ----
  { h: 'Bereshit', action: 'change', at: 'Isa 42:21', end: true, from: 'עד כאן', to: 'עד כאן לספרדים', why: 'S: Isa 42:5-21; A continues to 43:10' },
  { h: 'Bereshit', action: 'add', at: 'Isa 43:10', end: true, to: 'עד כאן לאשכנזים', why: 'A: Isa 42:5-43:10' },
  { h: 'Noach', action: 'add', at: 'Isa 55:5', end: true, to: 'עד כאן להפטרת נח לאשכנזים', why: 'A: Isa 54:1-55:5; S (and Ki Teitzei, all): 54:1-10. 55:5 already ends Re\'eh - a second note on the word' },
  { h: 'Noach', action: 'change', at: 'Isa 54:10', end: true, from: 'עד כאן', to: 'עד כאן (נח לספרדים, וכי תצא)', why: 'this end serves S Noach and Ki Teitzei (A and S)' },
  { h: 'Vayeira', action: 'change', at: '2Kgs 4:23', end: true, from: 'עד כן', to: 'עד כאן לספרדים', why: 'S: 2 Kgs 4:1-23' },
  { h: 'Vayeira', action: 'add', at: '2Kgs 4:37', end: true, to: 'עד כאן לאשכנזים', why: 'A: 2 Kgs 4:1-37' },
  { h: 'Vayetze / Vayishlach', action: 'comment', at: 'Hos 12:13', why: 'Disputed. The notes follow Cassuto/Harkavy (A Vayishlach = Hos 12:13-14:10, Vayetze = 11:7-12:12). Hirsch, Hertz, Koren, Jerusalem Crown: A Vayetze = 12:13-14:10, A Vayishlach = 11:7-12:12; S Vayetze = 11:7-12:12, S Vayishlach = Obadiah. No change needed unless the edition says otherwise' },
  { h: 'Miketz', action: 'add', at: '1Kgs 4:1', end: true, to: 'עד כאן', why: 'A, S: 1 Kgs 3:15-4:1 (no end note; the next one, 6:13, is Terumah\'s)' },
  // ---- Exodus ----
  { h: 'Shemot', action: 'change', at: 'Jer 1:1', from: 'הפטרת ואלה שמות וגם הפטרת ראשי המטות', to: 'הפטרת ואלה שמות לספרדים וגם הפטרת ראשי המטות', why: 'S Shemot: Jer 1:1-2:3; Matot (A, S): Jer 1:1-2:3' },
  { h: 'Shemot', action: 'add', at: 'Isa 27:6', to: 'הפטרת ואלה שמות לאשכנזים', why: 'A: Isa 27:6-28:13 & 29:22-23 - no start note' },
  { h: 'Shemot', action: 'add', at: 'Isa 28:13', end: true, to: 'עד כאן לאשכנזים ומוסיפים כט:כב-כג', why: 'A ends 28:13, then adds 29:22-23' },
  { h: 'Beshalach', action: 'add', at: 'Judg 5:1', to: 'הפטרת בשלח לספרדים', why: 'S: Judg 5:1-31 (the 4:4 note says "ויש מתחילין ותשר דבורה")' },
  { h: 'Beshalach', action: 'add', at: 'Judg 5:31', end: true, to: 'עד כאן', why: 'A: Judg 4:4-5:31, S: 5:1-31 - no end note (the next one, 11:33, is Chukat\'s)' },
  { h: 'Yitro', action: 'change', at: 'Isa 6:13', end: true, from: 'עד כאן', to: 'עד כאן לספרדים', why: 'S: Isa 6:1-13' },
  { h: 'Yitro', action: 'add', at: 'Isa 7:6', end: true, to: 'עד כאן לאשכנזים ומוסיפים ט:ה-ו', why: 'A: Isa 6:1-7:6 & 9:5-6' },
  { h: 'Mishpatim', action: 'add', at: 'Jer 34:22', end: true, to: 'עד כאן ומוסיפים לג:כה-כו', why: 'A, S: Jer 34:8-22 & 33:25-26 (no end note; 46:28 is Bo\'s)' },
  { h: 'Vayakhel (A) / Pekudei (S)', action: 'add', at: '1Kgs 7:50', end: true, to: 'עד כאן', why: 'A Vayakhel, S Pekudei, 2nd Shabbat Chanukah: 1 Kgs 7:40-50' },
  { h: 'Vayakhel (A) / Pekudei (S)', action: 'comment', at: '1Kgs 7:40', why: 'also the haftara of the second Shabbat of Chanukah (A, S)' },
  // ---- Leviticus ----
  { h: 'Tzav', action: 'add', at: 'Jer 8:3', end: true, to: 'עד כאן ומדלגין לט:כב-כג', why: 'A, S: Jer 7:21-8:3 & 9:22-23 (the 9:23 end is shared with Tisha B\'Av)' },
  { h: 'Shemini', action: 'change', at: '2Sam 6:19', end: true, from: 'עד כאן', to: 'עד כאן לספרדים', why: 'S: 2 Sam 6:1-19' },
  { h: 'Shemini', action: 'add', at: '2Sam 7:17', end: true, to: 'עד כאן לאשכנזים', why: 'A: 2 Sam 6:1-7:17' },
  { h: 'Kedoshim', action: 'add', at: 'Ezek 20:20', end: true, to: 'עד כאן', why: 'S: Ezek 20:2-20 (no end note; 22:16 is Acharei Mot\'s)' },
  // ---- Numbers ----
  { h: 'Bemidbar', action: 'delete', at: 'Hos 1:1', from: 'הפטרה במדבר סיני', why: 'all rites: Hos 2:1-22, which has its own note; no tradition starts at 1:1. Check the print before deleting' },
  { h: 'Naso', action: 'add', at: 'Judg 13:2', to: 'הפטרת נשא', why: 'A, S: Judg 13:2-25 - no start note (its end, 13:25, exists)' },
  { h: 'Shelach', action: 'add', at: 'Josh 2:24', end: true, to: 'עד כאן', why: 'A, S: Josh 2:1-24' },
  { h: 'Korach', action: 'reclassify', at: '1Sam 11:14', from: 'הפטרת קרח', why: 'filed under reason 6 (ניקוד); should be 13 (הפטרה)' },
  { h: 'Korach', action: 'move', at: '1Sam 12:21', end: true, to: '1Sam 12:22', why: 'A, S, Y: 1 Sam 11:14-12:22. Check the print' },
  { h: 'Masei', action: 'add', at: 'Jer 2:28', end: true, to: 'עד כאן ומוסיפים לאשכנזים ג:ד ולספרדים ד:א-ב', why: 'A: Jer 2:4-28 & 3:4; S: 2:4-28 & 4:1-2 (no end note; 9:23 is Tzav\'s / Tisha B\'Av\'s)' },
  // ---- Deuteronomy ----
  { h: 'Devarim', action: 'move', at: 'Isa 1:28#1', end: true, to: 'Isa 1:27', why: 'all: Isa 1:1-27; the note sits on the first word of 1:28' },
  { h: 'Shoftim', action: 'add', at: 'Isa 52:12', end: true, to: 'עד כאן', why: 'A, S: Isa 51:12-52:12 (no end note; 54:10 is Noach\'s)' },
  { h: 'Vayelech', action: 'comment', at: 'Isa 55:6', why: 'also A mincha of Tisha B\'Av and of fast days' },
  { h: 'Haazinu / Shabbat Shuvah', action: 'comment', at: 'Hos 14:2', why: 'this is Shabbat Shuvah\'s haftara (Hos 14:2-10; A add Joel 2:15-27, S add Micah 7:18-20); also S mincha of Tisha B\'Av' },
  { h: 'Haazinu', action: 'add', at: '2Sam 22:51', end: true, to: 'עד כאן', why: 'Haazinu (A, S) and 7th day of Pesach: 2 Sam 22:1-51' },
  { h: 'Haazinu', action: 'comment', at: 'Ezek 17:22', why: 'Ezek 17:22-18:32 is the Italian and Yemenite Haazinu; A, S read 2 Sam 22' },
  // ---- Festivals and special Sabbaths ----
  { h: 'Simchat Torah', action: 'add', at: 'Josh 1:9', end: true, to: 'עד כאן לספרדים', why: 'S: Josh 1:1-9' },
  { h: 'Simchat Torah', action: 'add', at: 'Josh 1:18', end: true, to: 'עד כאן לאשכנזים', why: 'A: Josh 1:1-18' },
  { h: 'Shabbat Rosh Chodesh', action: 'add', at: 'Isa 66:24', end: true, to: 'עד כאן וחוזרין פסוק כג', why: 'Isa 66:1-24, repeat 66:23' },
  { h: 'Rosh Hashanah 1', action: 'add', at: '1Sam 2:10', end: true, to: 'עד כאן', why: 'Wikipedia: I, Y, Chabad (and A, S acc. to Benisch) 1 Sam 1:1-2:10; it lists A, S as 1:1-2:20. Check which your edition intends' },
  { h: 'Shekalim', action: 'change', at: '2Kgs 11:17', from: 'הפטרת פרשת שקלים', to: 'הפטרת פרשת שקלים לספרדים', why: 'S: 2 Kgs 11:17-12:17' },
  { h: 'Shekalim', action: 'add', at: '2Kgs 12:1', to: 'הפטרת פרשת שקלים לאשכנזים', why: 'A: 2 Kgs 12:1-17 (Talmud, Megillah 29b)' },
  { h: 'Zachor', action: 'change', at: '1Sam 15:1', from: 'הפטרת שבת זכור', to: 'הפטרת שבת זכור לספרדים', why: 'S: 1 Sam 15:1-34' },
  { h: 'Zachor', action: 'add', at: '1Sam 15:2', to: 'הפטרת שבת זכור לאשכנזים', why: 'A: 1 Sam 15:2-34' },
  { h: 'Zachor', action: 'add', at: '1Sam 15:34', end: true, to: 'עד כאן', why: 'no end note (the next one, 20:42, is Machar Chodesh\'s)' },
  { h: 'HaChodesh', action: 'change', at: 'Ezek 45:16', from: 'הפטרת פרשת החודש', to: 'הפטרת פרשת החודש לאשכנזים', why: 'A: Ezek 45:16-46:18; S: 45:18-46:15' },
  { h: 'HaChodesh', action: 'change', at: 'Ezek 46:15', end: true, from: 'עד כאן לספרים', to: 'עד כאן לספרדים', why: 'typo' },
  { h: 'Shabbat Chol HaMoed Pesach', action: 'comment', at: 'Ezek 36:37', why: 'the notes give A 36:37-37:14, S 37:1-14. Wikipedia: A, S 37:1-17; Chabad 37:1-14; Y 36:37-37:14; I, R 36:37-37:17' },
  { h: 'Pesach 1', action: 'add', at: 'Josh 6:1', end: true, to: 'עד כאן ומוסיפים פסוק ו:כז', why: 'Josh 5:2-6:1 & 6:27 (Chabad also 3:5-7 first)' },
  { h: 'Pesach 2', action: 'add', at: '2Kgs 23:9', end: true, to: 'עד כאן ומדלגין לפסוק כא', why: 'A, S: 2 Kgs 23:1-9 & 23:21-25' },
  { h: 'Pesach 2', action: 'add', at: '2Kgs 23:25', end: true, to: 'עד כאן', why: 'end of the second part' },
  { h: 'Shavuot 1', action: 'comment', at: 'Ezek 1:28', why: 'A, S add 3:12 after 1:28' },
  { h: 'Yom Kippur mincha', action: 'comment', at: 'Jonah 4:11', why: 'followed by Micah 7:18-20' },
  { h: 'Shabbat HaGadol', action: 'comment', at: 'Mal 3:24', why: 'repeat 3:23' },
];

// Resolve "Isa 42:21" / "Isa 1:28#1" to a corpus word (start: first, end: last real word).
function resolve(at, end) {
  const m = at.match(/^(\S+) (\d+):(\d+)(?:#(\d+))?$/);
  if (!m) throw new Error(`bad ref "${at}"`);
  const [book, chapter, verse] = [m[1], Number(m[2]), Number(m[3])];
  const v = loadChapter(book, chapter).verses.find((x) => x.verse === verse);
  if (!v) throw new Error(`no verse ${at}`);
  const real = v.words.filter((w) => !isMarkerWord(w.ktiv));
  const w = m[4] ? v.words[Number(m[4]) - 1] : end ? real.at(-1) : real[0];
  return { book, chapter, verse, word: w.n, ktiv: w.ktiv, citation: `${book}${chapter}:${verse}#${w.n}` };
}

// Current notes per word ("Isa42:21#18" -> [{ reasonId, note }]).
const notesAt = new Map();
for (const n of readJson(NOTES_FILE).byReason.flatMap((r) => r.notes)) {
  const k = `${shortForName(n.book)}${n.chapter}:${n.verse}#${n.wordnumber}`;
  if (!notesAt.has(k)) notesAt.set(k, []);
  notesAt.get(k).push({ reasonId: n.reasonId, note: n.note.trim() });
}
const has = (k, text) => (notesAt.get(k) ?? []).some((n) => n.note.includes(text));
// Some existing ends sit on the פ/ס marker after the last word: accept either.
const endKeys = (r) => {
  const v = loadChapter(r.book, r.chapter).verses.find((x) => x.verse === r.verse);
  return v.words.slice(r.word - 1).filter((w, i) => i === 0 || isMarkerWord(w.ktiv)).map((w) => `${r.book}${r.chapter}:${r.verse}#${w.n}`);
};

const rows = R.map((rec) => {
  const w = resolve(rec.at, rec.end);
  const keys = rec.end ? endKeys(w) : [w.citation];
  const current = keys.flatMap((k) => notesAt.get(k) ?? []).map((n) => n.note);
  let status = 'pending';
  if (rec.action === 'add' || rec.action === 'change') status = keys.some((k) => has(k, rec.to)) ? 'applied' : 'pending';
  else if (rec.action === 'delete') status = keys.some((k) => has(k, rec.from)) ? 'pending' : 'applied';
  else if (rec.action === 'reclassify') status = keys.some((k) => (notesAt.get(k) ?? []).some((n) => n.reasonId === 13 && n.note.includes(rec.from))) ? 'applied' : 'pending';
  else if (rec.action === 'move') {
    const t = resolve(rec.to, true);
    status = endKeys(t).some((k) => has(k, 'עד כ')) && !current.some((n) => /עד כ/.test(n)) ? 'applied' : 'pending';
    return { ...rec, word: w, target: t, current, status };
  } else status = 'review';
  return { ...rec, word: w, current, status };
});

// ---- Markdown for review ----
const ACTION = { add: 'add note', change: 'change note', move: 'move end note', reclassify: 'reason 6 -> 13', delete: 'delete note', comment: 'comment only' };
const cell = (s) => String(s ?? '').replaceAll('|', '\\|');
const lines = [
  '# Haftara notes - recommended updates',
  '',
  `Generated by \`retypeset-test/haftara-recommendations.mjs\` from \`word_notes.json\`, checked against [Wikipedia's List of Haftarot](${WIKI}) (read 2026-10-14). A = Ashkenazi, S = Sephardi. Correct the source (word-notes table), refresh \`word_notes.json\`, rerun this script: rows you applied turn **applied**. Then \`node build-haftarot.mjs\` and \`node merge-book.mjs\` for the bookmarks.`,
  '',
  `${rows.length} items: ${['pending', 'applied', 'review'].map((s) => `${rows.filter((r) => r.status === s).length} ${s}`).join(', ')}.`,
  '',
  '| # | Haftara | Action | Where (word) | Current note | Proposed | Basis | Status |',
  '|---|---|---|---|---|---|---|---|',
  ...rows.map((r, i) => {
    const where = `${r.word.citation} ${r.word.ktiv}`;
    const proposed = r.action === 'move' ? `move to ${r.target.citation} ${r.target.ktiv}`
      : r.action === 'delete' ? '(delete)' : r.action === 'reclassify' ? 'reason 13 (הפטרה)' : r.to ?? '';
    return `| ${i + 1} | ${cell(r.h)} | ${ACTION[r.action]} | ${cell(where)} | ${cell(r.current.join(' / '))} | ${cell(proposed)} | ${cell(r.why)} | ${r.status} |`;
  }),
  '',
];
fs.writeFileSync(OUT_MD, lines.join('\n'), 'utf8');
fs.writeFileSync(OUT_JSON, `${JSON.stringify({ source: WIKI, generated: new Date().toISOString(), items: rows }, null, 1)}\n`, 'utf8');
console.log(`Wrote ${path.basename(OUT_MD)} + .json: ${rows.length} items (${rows.filter((r) => r.status === 'pending').length} pending, ${rows.filter((r) => r.status === 'applied').length} applied, ${rows.filter((r) => r.status === 'review').length} comments)`);
