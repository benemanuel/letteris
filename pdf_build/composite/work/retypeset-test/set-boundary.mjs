// Record page boundaries and rebuild the affected pages.
//
// Usage:
//   node set-boundary.mjs p457 last = 1Sam10:19#12.1  p458 first = 1Sam10:19#12.2
//   node set-boundary.mjs "p21 last = Gen15:20#2.1" --no-build
//   node set-boundary.mjs p45 first = Gen28:1#1 --source=audit-seams
//   node set-boundary.mjs p74 +.1          shift the p74/p75 seam (see below)
//   node set-boundary.mjs p510             show p510's current edges as a runnable command
//   add --dry-run to print what would be written and stop
//
// Before writing, the proposed edges are checked for continuity: every edited
// page must read forward (first <= last) and meet its neighbours word-to-word
// (no overlap, no gap). A failing edit is refused; --force writes it anyway.
// Moving one side of a seam alone fails - set both, or use a seam shift.
//
// Seam shift "pN +X" / "pN -X" moves page N's last word AND page N+1's first
// word together, as arithmetic on the word number: the integer part moves by
// whole words (across verses/chapters, skipping פ/ס markers), the ".k" part by
// maqaf parts. p74 last Gen43:15#3 -> "p74 +.1" -> #3.1 (p75 first #3.2);
// "p74 +1" -> #4; "p74 -2" -> #1. A whole-word shift lands on a whole word
// ("+1.1" = next word, part 1; "-2.1" = two words back, part 1). ".k" alone ("+.1", "-0.1") steps k parts
// through the text, crossing into the next/previous word when needed (a word
// without a maqaf is one part): p400 last Judg2:7#19.1 -> "-.1" -> #18,
// "+.1" -> #19 (whole). The expanded full command is printed.
//
// Provenance: without --source the edit is a human verdict (checked against
// the scan) and goes into work/boundary-verdicts.json "overrides"; any
// provisional entry for the same edge is dropped (confirmed). With
// --source=<tool> it is a machine suggestion and goes into
// work/boundary-provisional.json instead - never into overrides (see that
// file's _note) - and an edge that already has a human verdict is refused.
//
// Each "pN first|last = Citation#word[.part]" sets that page edge. A ".part"
// names part of a maqaf-joined word (see splitRef in tanach-lib.mjs). The
// word "$" is the verse's last word: 1Sam20:42#$ (or #$.1 for a part of it).
// The Hebrew text is filled in from the corpus.
//
// Steps: validate against the corpus and check continuity -> write the override line into
// work/boundary-verdicts.json (only that line changes) or the provisional
// entry -> run
// src/43-apply-boundary-verdicts.js -> check that neighbouring pages still
// meet word-to-word -> regenerate pageN.tex + body/notes for the changed pages
// (skipped with --no-build).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  HERE, WORK, books, readJson, rowByPage, loadChapter, isMarkerWord, parseCitation, splitRef, wordParts, partText, corpusWord, wordAfter, wordBefore,
} from './tanach-lib.mjs';

const COMPOSITE = path.join(WORK, '..');
const VERDICTS = path.join(WORK, 'boundary-verdicts.json');
const PROVISIONAL = path.join(WORK, 'boundary-provisional.json');
const FINAL = path.join(WORK, 'boundary-words-final.json');

const argv = process.argv.slice(2);
const build = !argv.includes('--no-build');
const source = argv.find((a) => a.startsWith('--source='))?.slice('--source='.length) || null;
const spec = argv.filter((a) => !a.startsWith('--')).join(' ');
const edits = [...spec.matchAll(/p?(\d+)\s+(first|last)\s*=\s*(\S+)/gi)].map((m) => ({
  page: Number(m[1]), edge: m[2].toLowerCase(), ref: m[3],
}));

// Seam shifts: "p74 +.1", "p74 -2", "p74 +1.1" -> last/first edits for N and N+1.
for (const m of spec.matchAll(/(?:^|\s)p?(\d+)\s+([+-])(\d*)(?:\.(\d+))?(?=\s|$)/gi)) {
  const page = Number(m[1]);
  const sign = m[2] === '+' ? 1 : -1;
  const words = Number(m[3] || 0);
  const parts = Number(m[4] || 0);
  if (!words && !parts) throw new Error(`"${m[0].trim()}": shift by what? e.g. p${page} +1 or p${page} +.1`);
  const last = rowByPage.get(page)?.last;
  if (!last?.citation) throw new Error(`page ${page} has no last word to shift`);
  const c = parseCitation(last.citation);
  let { word, part } = splitRef(last.n);
  let cur = { ...c, n: word };
  for (let i = 0; i < words; i += 1) {
    const w = sign > 0 ? wordAfter(cur.book, cur.chapter, cur.verse, cur.n) : wordBefore(cur.book, cur.chapter, cur.verse, cur.n);
    if (!w) throw new Error(`"${m[0].trim()}": runs off the ${sign > 0 ? 'end' : 'start'} of the Tanakh`);
    cur = { book: w.book, chapter: w.chapter, verse: w.verse, n: w.n };
  }
  const partsOf = (w) => wordParts(corpusWord(w.book, w.chapter, w.verse, w.n).ktiv).length;
  const step = (w, dir) => {
    const x = dir > 0 ? wordAfter(w.book, w.chapter, w.verse, w.n) : wordBefore(w.book, w.chapter, w.verse, w.n);
    if (!x) throw new Error(`"${m[0].trim()}": runs off the ${dir > 0 ? 'end' : 'start'} of the Tanakh`);
    return { book: x.book, chapter: x.chapter, verse: x.verse, n: x.n };
  };
  let nParts = partsOf(cur);
  const here = `${cur.book}${cur.chapter}:${cur.verse}#${cur.n}`;
  if (words) {
    // A whole-word shift lands on a whole word; "+1.1" / "-5.1" then end at
    // part 1 of it (the sign applies to the word count only).
    if (parts && nParts === 1) throw new Error(`"${m[0].trim()}": ${here} has no maqaf parts - use whole words (p${page} ${m[2]}${words})`);
    part = parts; // 0 = whole word
    if (part > nParts) throw new Error(`"${m[0].trim()}": ${here} has only ${nParts} parts`);
  } else {
    // ".k" alone steps k maqaf parts through the text (a word without a maqaf
    // is one part): Judg2:7#19.1 -.1 -> #18 (whole), +.1 -> #19 (whole).
    let k = (part || nParts) + sign * parts; // the edge ends after part k of cur
    while (k <= 0) { cur = step(cur, -1); nParts = partsOf(cur); k += nParts; }
    while (k > nParts) { k -= nParts; cur = step(cur, 1); nParts = partsOf(cur); }
    part = k;
  }
  if (part === nParts) part = 0;
  const lastRef = `${cur.book}${cur.chapter}:${cur.verse}#${cur.n}${part ? `.${part}` : ''}`;
  let firstRef;
  if (part) firstRef = `${cur.book}${cur.chapter}:${cur.verse}#${cur.n}.${part + 1}`;
  else {
    const nx = wordAfter(cur.book, cur.chapter, cur.verse, cur.n);
    if (!nx) throw new Error(`"${m[0].trim()}": no word after ${lastRef}`);
    firstRef = `${nx.book}${nx.chapter}:${nx.verse}#${nx.n}`;
  }
  edits.push({ page, edge: 'last', ref: lastRef }, { page: page + 1, edge: 'first', ref: firstRef });
  console.log(`${m[0].trim()}: p${page} last ${last.citation}#${last.n} -> ${lastRef}`);
}
if (edits.length && /(?:^|\s)p?\d+\s+[+-][\d.]/.test(spec)) {
  const flags = argv.filter((a) => a.startsWith('--'));
  console.log(`= node set-boundary.mjs ${edits.map((e) => `p${e.page} ${e.edge} = ${e.ref}`).join(' ')}${flags.length ? ` ${flags.join(' ')}` : ''}`);
}
// Page numbers alone ("p510"): show the current edges as a runnable command.
if (!edits.length && /^(\s*p?\d+)+\s*$/i.test(spec)) {
  const human = readJson(VERDICTS).overrides;
  const prov = fs.existsSync(PROVISIONAL) ? readJson(PROVISIONAL).entries : {};
  const origin = (key, e) => (human[key] ? 'verdict' : prov[key] ? `provisional (${prov[key].source})` : `machine (tier ${e.tier ?? '?'})`);
  const cmd = [];
  for (const page of [...spec.matchAll(/\d+/g)].map(Number)) {
    const row = rowByPage.get(page);
    if (!row) { console.error(`page ${page}: no boundary data`); continue; }
    for (const edge of ['first', 'last']) {
      const e = row[edge];
      if (!e?.citation) { console.log(`p${page} ${edge}: none`); continue; }
      const ref = `${e.citation}#${e.n}`;
      console.log(`p${page} ${edge.padEnd(5)} = ${ref.padEnd(16)} ${origin(`${page}|${edge}`, e).padEnd(24)} ${e.ktiv ?? ''}`);
      cmd.push(`p${page} ${edge} = ${ref}`);
    }
    const prev = rowByPage.get(page - 1)?.last;
    const next = rowByPage.get(page + 1)?.first;
    if (prev?.citation) console.log(`  (p${page - 1} last  = ${prev.citation}#${prev.n})`);
    if (next?.citation) console.log(`  (p${page + 1} first = ${next.citation}#${next.n})`);
  }
  if (cmd.length) console.log(`node set-boundary.mjs ${cmd.join(' ')}`);
  process.exit(0);
}
if (!edits.length) {
  console.error('Usage: node set-boundary.mjs p457 last = 1Sam10:19#12.1 [p458 first = 1Sam10:19#12.2 ...] | p74 +.1 | p74 -2  [--source=<tool>] [--no-build]');
  process.exit(1);
}

// "1Sam10:19#12.1" -> { citation, n, book, chapter, verse, word, part, text }.
// The book may be written in any case ("gen22:1#1") or left out ("30:34#5"):
// it is then taken from the page's current boundary data for that edge. The
// citation is always stored in tanach.json's spelling ("Gen30:34").
function resolve(ref, edge, page) {
  const m = ref.match(/^(.+?)#((?:\d+|\$)(?:\.\d+)?)$/);
  if (!m) throw new Error(`"${ref}": expected Citation#word, e.g. 1Sam10:19#12.1 or 1Sam20:42#$`);
  let cit = m[1];
  if (/^\d+:\d+$/.test(cit)) {
    const current = rowByPage.get(page)?.[edge]?.citation;
    if (!current) throw new Error(`"${ref}": no book given and page ${page} has no ${edge} word to take it from`);
    cit = parseCitation(current).book + cit;
  }
  const c = parseCitation(cit);
  if (m[2].startsWith('$')) {
    // "$" = the verse's last real word (פ/ס marker words skipped).
    const v = loadChapter(c.book, c.chapter).verses.find((x) => x.verse === c.verse);
    const lastWord = v?.words.filter((w) => !isMarkerWord(w.ktiv)).at(-1);
    if (!lastWord) throw new Error(`"${ref}": no verse ${c.book}${c.chapter}:${c.verse} in corpus`);
    m[2] = `${lastWord.n}${m[2].slice(1)}`;
    console.log(`${ref} = ${c.book}${c.chapter}:${c.verse}#${m[2]}`);
  }
  const { word, part } = splitRef(m[2]);
  const w = corpusWord(c.book, c.chapter, c.verse, word);
  const text = part ? partText(w.ktiv, part, edge) : w.ktiv;
  return { citation: `${c.book}${c.chapter}:${c.verse}`, n: m[2], ...c, word, part, text };
}

const refOf = (e) => (e?.citation && e.n != null
  ? { ...parseCitation(e.citation), ...splitRef(e.n), label: `${e.citation}#${e.n}` } : null);
const label = (r) => `${r.book}${r.chapter}:${r.verse}#${r.word}${r.part ? `.${r.part}` : ''}`;

// The word (or maqaf part) that comes right after page-last edge `r`.
function expectedAfter(r) {
  const w = corpusWord(r.book, r.chapter, r.verse, r.word);
  if (r.part && r.part < wordParts(w.ktiv).length) return { ...r, part: r.part + 1 };
  const n = wordAfter(r.book, r.chapter, r.verse, r.word);
  return n && { book: n.book, chapter: n.chapter, verse: n.verse, word: n.n, part: null };
}
function follows(prevLast, nextFirst) {
  const expect = expectedAfter(prevLast);
  return Boolean(expect) && expect.book === nextFirst.book && expect.chapter === nextFirst.chapter
    && expect.verse === nextFirst.verse && expect.word === nextFirst.word && (expect.part ?? 1) === (nextFirst.part ?? 1);
}
// Reading order: edition book order, then chapter/verse/word/part.
const bookOrder = (short) => books.findIndex((b) => b.short === short);
const compare = (a, b) => bookOrder(a.book) - bookOrder(b.book) || a.chapter - b.chapter
  || a.verse - b.verse || a.word - b.word || (a.part ?? 0) - (b.part ?? 0);

// The word (or maqaf part) that comes right before page-first edge `r`.
function expectedBefore(r) {
  if (r.part && r.part > 1) return { ...r, part: r.part - 1 };
  const w = wordBefore(r.book, r.chapter, r.verse, r.word);
  return w && { book: w.book, chapter: w.chapter, verse: w.verse, word: w.n, part: null };
}

// Problems for `pages` given edgeOf(page, 'first'|'last') -> ref or null:
// a page reading backwards, or a seam with page N±1 that overlaps or leaves a
// gap. Pages without boundary data (title pages) are skipped. Each problem is
// { msg, seam?, fixes? }: a broken seam carries the two ways to close it -
// keep page N's last and move N+1's first, or the reverse.
function continuityProblems(pages, edgeOf) {
  const out = [];
  for (const p of pages) {
    const f = edgeOf(p, 'first');
    const l = edgeOf(p, 'last');
    if (f && l && compare(f, l) > 0) out.push({ msg: `page ${p} first (${f.label}) comes after its last (${l.label})` });
  }
  const seams = [...new Set(pages.flatMap((p) => [p - 1, p]))].sort((a, b) => a - b);
  for (const p of seams) {
    const a = edgeOf(p, 'last');
    const b = edgeOf(p + 1, 'first');
    if (!a || !b || follows(a, b)) continue;
    const expect = expectedAfter(a);
    const before = expectedBefore(b);
    const kind = expect && compare(b, expect) < 0 ? 'overlaps' : 'leaves a gap after';
    const fixes = {};
    if (expect) fixes.keepLast = [{ page: p, edge: 'last', ref: a.label }, { page: p + 1, edge: 'first', ref: label(expect) }];
    if (before) fixes.keepFirst = [{ page: p, edge: 'last', ref: label(before) }, { page: p + 1, edge: 'first', ref: b.label }];
    out.push({ msg: `page ${p + 1} first (${b.label}) ${kind} page ${p} last (${a.label})${expect ? ` - expected ${label(expect)}` : ''}`, seam: p, fixes });
  }
  return out;
}

// Print problems, then runnable commands that close the broken seams: the
// given edits with the fix merged in. The fix keeps the edge the user typed
// (page N+1's first when only that was given, else page N's last); with one
// broken seam the other way is offered too.
function reportProblems(problems, level, given) {
  for (const p of problems) console.error(`${level}: ${p.msg}`);
  const broken = problems.filter((p) => p.seam != null);
  if (!broken.length) return;
  const typed = (page, edge) => given.some((e) => e.page === page && e.edge === edge);
  const prefer = (p) => (typed(p.seam + 1, 'first') && !typed(p.seam, 'last') ? ['keepFirst', 'keepLast'] : ['keepLast', 'keepFirst']);
  const flags = argv.filter((a) => a.startsWith('--') && a !== '--force');
  const command = (fix) => {
    const m = new Map(given.map((e) => [`${e.page}|${e.edge}`, e]));
    for (const e of fix) m.set(`${e.page}|${e.edge}`, e);
    const list = [...m.values()].sort((x, y) => x.page - y.page || (x.edge === 'last') - (y.edge === 'last'));
    return `node set-boundary.mjs ${list.map((e) => `p${e.page} ${e.edge} = ${e.ref}`).join(' ')}${flags.length ? ` ${flags.join(' ')}` : ''}`;
  };
  const options = [broken.flatMap((p) => p.fixes[prefer(p).find((k) => p.fixes[k])] ?? [])];
  if (broken.length === 1) {
    const alt = broken[0].fixes[prefer(broken[0])[1]];
    if (alt) options.push(alt);
  }
  console.error(`To fix:${options.map((o) => `
  ${command(o)}`).join(`
 or`)}`);
}

// Validate everything before touching any file.
for (const e of edits) {
  e.r = resolve(e.ref, e.edge, e.page);
  e.key = `${e.page}|${e.edge}`;
  e.value = `${e.r.citation}#${e.r.n} ${e.r.text}`;
  console.log(`${e.key.padEnd(10)} ${e.value}`);
}

// Continuity check on the proposed edges (edits over the current boundary
// data): each edited page must read forward (first <= last), and each seam it
// touches must meet word-to-word - no overlap, no gap. Refused unless --force.
const proposed = (page, edge) => {
  const e = edits.findLast((x) => x.page === page && x.edge === edge);
  return e ? { ...e.r, label: `${e.r.citation}#${e.r.n}` } : refOf(rowByPage.get(page)?.[edge]);
};
const problems = continuityProblems([...new Set(edits.map((e) => e.page))], proposed);
if (problems.length) {
  reportProblems(problems, argv.includes('--force') ? 'WARNING' : 'ERROR', edits.map((e) => ({ page: e.page, edge: e.edge, ref: `${e.r.citation}#${e.r.n}` })));
  if (!argv.includes('--force')) {
    console.error('Refused: boundaries would not be continuous - fix the neighbouring edge in the same call, or add --force.');
    process.exit(1);
  }
}
if (argv.includes('--dry-run')) {
  console.log('(dry run - nothing written)');
  process.exit(0);
}

const provisional = fs.existsSync(PROVISIONAL) ? readJson(PROVISIONAL) : {
  _note: [
    'Machine-suggested page edges (set-boundary.mjs --source=<tool>). NOT',
    'human-verified: applied by src/43-apply-boundary-verdicts.js only where',
    'boundary-verdicts.json has no override, tagged provisional. Confirming an',
    'edge with a plain set-boundary.mjs call moves it into overrides.',
  ],
  entries: {},
};
const writeProvisional = () => fs.writeFileSync(PROVISIONAL, `${JSON.stringify(provisional, null, 2)}\n`, 'utf8');

if (source) {
  const human = readJson(VERDICTS).overrides;
  const locked = edits.filter((e) => human[e.key]);
  if (locked.length) {
    console.error(`Refused: human verdict exists for ${locked.map((e) => `${e.key} (${human[e.key]})`).join(', ')} - drop --source to change it.`);
    process.exit(1);
  }
  const date = new Date().toISOString().slice(0, 10);
  for (const e of edits) provisional.entries[e.key] = { value: e.value, source, date };
  provisional.entries = Object.fromEntries(Object.entries(provisional.entries)
    .sort(([a], [b]) => { const [pa, ea] = a.split('|'); const [pb, eb] = b.split('|'); return pa - pb || (ea === 'last') - (eb === 'last'); }));
  writeProvisional();
  console.log(`Updated ${path.relative(COMPOSITE, PROVISIONAL)} (source: ${source})`);
} else {
  // Write each override as its own line inside "overrides", keeping page order
  // and every other line of the hand-maintained file untouched.
  const raw = fs.readFileSync(VERDICTS, 'utf8');
  const EOL = raw.includes('\r\n') ? '\r\n' : '\n'; // the file is CRLF; keep it that way
  let lines = raw.split(/\r?\n/);
  const ENTRY = /^ {4}"(\d+)\|(first|last)": /;
  const order = (page, edge) => page * 2 + (edge === 'last' ? 1 : 0);
  for (const e of edits) {
    const start = lines.findIndex((l) => l.startsWith('  "overrides": {'));
    let end = start + 1;
    while (!lines[end].startsWith('  }')) end += 1;
    const newLine = `    ${JSON.stringify(e.key)}: ${JSON.stringify(e.value)}`;
    const existing = lines.findIndex((l, i) => i > start && i < end && l.startsWith(`    ${JSON.stringify(e.key)}:`));
    if (existing !== -1) {
      lines[existing] = newLine + (lines[existing].endsWith(',') ? ',' : '');
      continue;
    }
    let at = end; // default: append after the last entry
    for (let i = start + 1; i < end; i += 1) {
      const m = lines[i].match(ENTRY);
      if (m && order(Number(m[1]), m[2]) > order(e.page, e.edge)) { at = i; break; }
    }
    if (at === end) {
      lines[end - 1] = lines[end - 1].replace(/,?$/, ',');
      lines.splice(end, 0, newLine);
    } else {
      lines.splice(at, 0, `${newLine},`);
    }
  }
  const updated = lines.join(EOL);
  const parsed = JSON.parse(updated); // refuse to write a broken file
  for (const e of edits) {
    if (parsed.overrides[e.key] !== e.value) throw new Error(`internal: ${e.key} not written correctly`);
  }
  fs.writeFileSync(VERDICTS, updated, 'utf8');
  console.log(`Updated ${path.relative(COMPOSITE, VERDICTS)}`);
  const confirmed = edits.filter((e) => provisional.entries[e.key]);
  if (confirmed.length) {
    for (const e of confirmed) delete provisional.entries[e.key];
    writeProvisional();
    console.log(`Confirmed (removed from provisional): ${confirmed.map((e) => e.key).join(', ')}`);
  }
}

const run = (args, cwd) => {
  const r = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`failed: node ${args.join(' ')}`);
};
run([path.join('src', '43-apply-boundary-verdicts.js')], COMPOSITE);

// Re-check against what 43 actually wrote (it may merge in other data).
const rows = new Map(readJson(FINAL).rows.map((r) => [r.page, r]));
const pages = [...new Set(edits.map((e) => e.page))].sort((a, b) => a - b);
reportProblems(continuityProblems(pages, (page, edge) => refOf(rows.get(page)?.[edge])), 'WARNING', []);

if (build) {
  const lo = pages[0];
  const hi = pages.at(-1);
  run([path.join(HERE, 'create-page-config.js'), String(lo), String(hi)], HERE);
  run([path.join(HERE, 'build-body.mjs'), String(lo), String(hi)], HERE);
}
