// Refresh the corpus mirror (work/corpus) from the local corpus API, safely.
//
//   node src/10-corpus-update.js              pull + compare, report only
//   node src/10-corpus-update.js --apply      ...then swap in every safe chapter
//   node src/10-corpus-update.js --apply --apply-renumbered   ...and the rest too
//   options: --book Gen   --api <url>   --skip-pull (compare an existing pull)
//
// Why not just refetch in place: every page boundary, verdict, provisional edge
// and masora note points at words by POSITION ("Gen30:34#5", "Gen1:21.3"), and
// the פ/ס/װ markers count as words. If upstream added, removed or split a word,
// every reference after it in that verse silently moves to the wrong word. So:
//
//   1. pull everything fresh into work/corpus-new (10-corpus.js --force --out)
//   2. compare chapter by chapter with work/corpus:
//        identical    - nothing to do
//        text-only    - same verses, same word count per verse; only spelling,
//                       vowels, accents or kri changed. Safe: positions hold.
//        renumbered   - a verse gained/lost words (or verses differ). Unsafe:
//                       lists every reference into the affected verses.
//   3. --apply: back up work/corpus to work/corpus-backup-<date>, copy in the
//      text-only chapters (and renumbered ones only with --apply-renumbered).
//
// Report: work/corpus-update-report.txt. Afterwards rebuild pages as usual -
// boundaries are unchanged by a text-only update.

import fs from 'node:fs';
import path from 'node:path';
import { WORK_DIR } from './config.js';
import { CORPUS_DIR, DEFAULT_API, books, main as pull } from './10-corpus.js';
import { runMain, parseArgs } from './lib/cli.js';

const NEW_DIR = path.join(WORK_DIR, 'corpus-new');
const REPORT = path.join(WORK_DIR, 'corpus-update-report.txt');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// --- Everything that points at a word position, keyed by "Book-chapter".
function references() {
  const refs = new Map(); // "Gen-30" -> [{ verse, where }]
  const add = (book, chapter, verse, where) => {
    const k = `${book}-${chapter}`;
    if (!refs.has(k)) refs.set(k, []);
    refs.get(k).push({ verse, where });
  };
  const cite = /^([0-9]?[A-Za-z]+)(\d+):(\d+)/;
  const fromValue = (v, where) => {
    const m = String(v).match(cite);
    if (m) add(m[1], Number(m[2]), Number(m[3]), where);
  };
  const verdicts = readJson(path.join(WORK_DIR, 'boundary-verdicts.json'));
  for (const [k, v] of Object.entries(verdicts.overrides ?? {})) fromValue(v, `verdict ${k}`);
  const provFile = path.join(WORK_DIR, 'boundary-provisional.json');
  if (fs.existsSync(provFile)) {
    for (const [k, e] of Object.entries(readJson(provFile).entries ?? {})) fromValue(e.value, `provisional ${k}`);
  }
  for (const r of readJson(path.join(WORK_DIR, 'boundary-words-final.json')).rows) {
    for (const edge of ['first', 'last']) {
      if (r[edge]?.citation) fromValue(r[edge].citation, `boundary ${r.page}|${edge}`);
    }
  }
  const notesFile = path.join(WORK_DIR, 'word_notes.json');
  if (fs.existsSync(notesFile)) {
    for (const n of readJson(notesFile).byReason.flatMap((r) => r.notes)) fromValue(n.citation, `masora note ${n.citation}`);
  }
  return refs;
}

// --- Compare one chapter: identical | text-only | renumbered (+ details).
const sig = (w) => `${w.ktiv}\u0000${w.kri ?? ''}`;
function compare(oldJ, newJ) {
  const ov = new Map(oldJ.verses.map((v) => [v.verse, v]));
  const nv = new Map(newJ.verses.map((v) => [v.verse, v]));
  const renumbered = [];
  let changedWords = 0;
  const samples = [];
  for (const verse of new Set([...ov.keys(), ...nv.keys()])) {
    const a = ov.get(verse);
    const b = nv.get(verse);
    if (!a || !b) { renumbered.push({ verse, why: a ? 'verse removed' : 'verse added' }); continue; }
    if (a.words.length !== b.words.length) {
      renumbered.push({ verse, why: `${a.words.length} -> ${b.words.length} words` });
      continue;
    }
    a.words.forEach((w, i) => {
      if (sig(w) !== sig(b.words[i])) {
        changedWords += 1;
        if (samples.length < 3) samples.push(`${verse}#${w.n} ${w.ktiv}${w.kri ? `/${w.kri}` : ''} -> ${b.words[i].ktiv}${b.words[i].kri ? `/${b.words[i].kri}` : ''}`);
      }
    });
  }
  if (renumbered.length) return { kind: 'renumbered', renumbered, changedWords, samples };
  return { kind: changedWords ? 'text-only' : 'identical', changedWords, samples };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const only = args.str('book');
  const api = args.str('api', DEFAULT_API);

  if (!args.has('skip-pull')) {
    const pullArgs = ['--force', '--out', NEW_DIR, '--api', api, ...(only ? ['--book', only] : [])];
    const { failed } = await pull(pullArgs);
    if (failed) throw new Error(`${failed} chapters failed to download - nothing compared or applied; rerun`);
  }

  const refs = references();
  const result = { identical: [], 'text-only': [], renumbered: [], missing: [] };
  for (const b of books().filter((x) => !only || x.short === only)) {
    for (let ch = 1; ch <= b.verses.length; ch += 1) {
      const name = `${b.short}-${String(ch).padStart(3, '0')}.json`;
      const oldF = path.join(CORPUS_DIR, name);
      const newF = path.join(NEW_DIR, name);
      if (!fs.existsSync(newF)) { result.missing.push(`${b.short} ${ch}: not in the new pull`); continue; }
      if (!fs.existsSync(oldF)) { result['text-only'].push({ name, line: `${b.short} ${ch}: new chapter (no old copy)` }); continue; }
      const c = compare(readJson(oldF), readJson(newF));
      const tag = `${b.short} ${ch}`;
      if (c.kind === 'identical') result.identical.push({ name });
      else if (c.kind === 'text-only') {
        result['text-only'].push({ name, line: `${tag}: ${c.changedWords} word(s) changed, e.g. ${c.samples.join(' | ')}` });
      } else {
        const verses = new Set(c.renumbered.map((r) => r.verse));
        const hit = (refs.get(`${b.short}-${ch}`) ?? []).filter((r) => verses.has(r.verse));
        result.renumbered.push({
          name,
          line: `${tag}: ${c.renumbered.map((r) => `v${r.verse} ${r.why}`).join(', ')}`
            + `\n      references into those verses (${hit.length}): ${hit.map((h) => h.where).join('; ') || 'none'}`,
        });
      }
    }
  }

  const lines = [
    `Corpus update - ${new Date().toISOString().slice(0, 10)} - ${api}`,
    `identical ${result.identical.length}, text-only ${result['text-only'].length}, renumbered ${result.renumbered.length}, missing ${result.missing.length}`,
    '',
    '== RENUMBERED (unsafe: word positions moved; check every reference listed) ==',
    ...result.renumbered.map((r) => `  ${r.line}`),
    '',
    '== TEXT-ONLY (safe: same positions, spelling/marks/kri changed) ==',
    ...result['text-only'].map((r) => `  ${r.line}`),
    '',
    '== MISSING FROM NEW PULL ==',
    ...result.missing.map((m) => `  ${m}`),
  ];

  if (args.has('apply')) {
    const take = [...result['text-only'], ...(args.has('apply-renumbered') ? result.renumbered : [])];
    if (take.length) {
      const backup = path.join(WORK_DIR, `corpus-backup-${new Date().toISOString().slice(0, 10)}`);
      // No corpus yet (a fresh copy of the build): nothing to back up, every chapter is new.
      const hadCorpus = fs.existsSync(CORPUS_DIR);
      if (hadCorpus && !fs.existsSync(backup)) fs.cpSync(CORPUS_DIR, backup, { recursive: true });
      fs.mkdirSync(CORPUS_DIR, { recursive: true });
      for (const t of take) fs.copyFileSync(path.join(NEW_DIR, t.name), path.join(CORPUS_DIR, t.name));
      lines.push('', `APPLIED ${take.length} chapter(s) into ${CORPUS_DIR} (${hadCorpus ? `backup: ${backup}` : 'new corpus, no backup'})`);
      if (result.renumbered.length && !args.has('apply-renumbered')) {
        lines.push(`NOT applied: ${result.renumbered.length} renumbered chapter(s) - fix their references, then rerun with --apply-renumbered`);
      }
    } else {
      lines.push('', 'Nothing to apply.');
    }
  } else {
    lines.push('', 'Report only - rerun with --apply to swap in the text-only chapters.');
  }

  fs.writeFileSync(REPORT, `${lines.join('\n')}\n`, 'utf8');
  console.log(lines.slice(0, 2).join('\n'));
  console.log(lines.at(-1));
  console.log(`report: ${REPORT}`);
}

runMain(import.meta.url, main);
