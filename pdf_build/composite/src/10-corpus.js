// Mirror the digitised text locally, once.
//
// Everything downstream - word alignment, mark counting, per-ta'am templates -
// reads the corpus thousands of times per page. Nothing in that loop should
// touch the network: a run that half-fails partway through a book leaves an
// alignment that cannot be reproduced, and the failure looks like a mapping
// error rather than a fetch error.
//
// One request per chapter, 929 of them. Resumable: a chapter already on disk is
// skipped, so an interrupted run costs only the chapter it was fetching.
//
// Source: the local corpus API (localhost:8200), which serves the current text -
// the remote tanach.geulah.org.il copy is stale (see 10-corpus-local.js). The
// mirror in work/corpus was originally pulled from the remote site (2026-09-03).
//
//   node src/10-corpus.js                          missing chapters only
//   node src/10-corpus.js --force --out work/corpus-new   refetch everything elsewhere
//   node src/10-corpus.js --book Gen --api <url>
// To refresh the live mirror safely use 10-corpus-update.js (pull + compare + apply).

import fs from 'node:fs';
import path from 'node:path';
import { WORK_DIR } from './config.js';
import { analyseWord } from './lib/hebrew.js';
import { runMain, parseArgs } from './lib/cli.js';

export const CORPUS_DIR = path.join(WORK_DIR, 'corpus');
// ============================================================================
// CONFIG
// ============================================================================
export const DEFAULT_API = 'http://localhost:8200/api/citation/v2';
// ============================================================================
const STRUCTURE = path.resolve(WORK_DIR, '..', '..', 'tanach.json');

/** Books in canonical order, with the verse count of each chapter. */
export function books() {
  const tree = JSON.parse(fs.readFileSync(STRUCTURE, 'utf8'));
  const out = [];
  const walk = (n) => {
    if (n.chapters && n.shortbook) {
      out.push({ name: n.bookname || n.name, short: n.shortbook, verses: n.chapters });
    }
    (n.children || []).forEach(walk);
  };
  walk(tree);
  return out;
}

export const chapterPath = (short, ch) =>
  path.join(CORPUS_DIR, `${short}-${String(ch).padStart(3, '0')}.json`);

async function fetchChapter(api, short, ch, attempt = 0) {
  const url = `${api}/${encodeURIComponent(`${short}${ch}`)}`;
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    if (!j.result || !j.result.length) throw new Error('empty result');
    return j.result;
  } catch (e) {
    // A transient failure mid-book would otherwise leave a gap that only shows
    // up much later as an alignment break, so retry rather than record nothing.
    if (attempt < 3) {
      await new Promise((r) => { setTimeout(r, 800 * (attempt + 1)); });
      return fetchChapter(api, short, ch, attempt + 1);
    }
    throw e;
  }
}

/** Corpus verses reduced to what the mapping needs. */
export function reduceChapter(result) {
  return result.map((v) => ({
    // older API responses had `verse` at the top level, current ones nest it
    verse: v.verse ?? v.citation?.verse,
    words: (v.words || []).map((w) => {
      // stray whitespace has come back from the API (Judg13:18 #9 " וְה֖וּא")
      const ktiv = String(w.ktiv).trim();
      const a = analyseWord(ktiv);
      return {
        n: w.wordNumber,
        ktiv,
        kri: w.kri ? String(w.kri).trim() : null,
        letters: a.letters,
        segments: a.segments,
        above: a.above,
        below: a.below,
        inside: a.inside,
        teamim: a.teamim,
      };
    }),
  }));
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const only = args.str('book');
  const api = args.str('api', DEFAULT_API);
  const outDir = path.resolve(args.str('out', CORPUS_DIR));
  const force = args.has('force');
  fs.mkdirSync(outDir, { recursive: true });
  const target = (short, ch) => path.join(outDir, path.basename(chapterPath(short, ch)));

  const list = books().filter((b) => !only || b.short === only);
  const total = list.reduce((a, b) => a + b.verses.length, 0);
  console.log(`mirroring ${list.length} books, ${total} chapters from ${api} -> ${outDir}${force ? ' (refetch all)' : ''}`);

  let done = 0;
  let fetched = 0;
  let failed = 0;
  for (const b of list) {
    for (let ch = 1; ch <= b.verses.length; ch += 1) {
      const file = target(b.short, ch);
      done += 1;
      if (!force && fs.existsSync(file)) continue;
      try {
        const result = await fetchChapter(api, b.short, ch);
        const verses = reduceChapter(result);
        // The corpus is the reference the whole mapping is checked against, so
        // a chapter that arrives short of its expected verse count is recorded
        // as suspect rather than silently trusted.
        const expected = b.verses[ch - 1];
        if (verses.some((v) => v.verse == null)) throw new Error('verse number missing in API response');
        fs.writeFileSync(file, `${JSON.stringify({
          book: b.short,
          bookName: b.name,
          chapter: ch,
          expectedVerses: expected,
          verses,
          short: verses.length !== expected ? true : undefined,
        })}\n`);
        fetched += 1;
      } catch (e) {
        failed += 1;
        console.log(`  ${b.short} ${ch}: FAILED ${String(e.message).slice(0, 60)}`);
      }
      if (fetched % 50 === 0 && fetched) {
        console.log(`  ${done}/${total} chapters, ${fetched} fetched`);
      }
    }
  }
  console.log(`\n${fetched} fetched, ${done - fetched - failed} already present, ${failed} failed`);

  // Summarise, and flag any chapter whose verse count disagrees with the
  // structure file - that is either a corpus difference or a bad fetch, and
  // both matter before alignment starts.
  let words = 0;
  let verses = 0;
  const suspect = [];
  for (const f of fs.readdirSync(outDir)) {
    const j = JSON.parse(fs.readFileSync(path.join(outDir, f), 'utf8'));
    verses += j.verses.length;
    for (const v of j.verses) words += v.words.length;
    if (j.short) suspect.push(`${j.book} ${j.chapter} (${j.verses.length}/${j.expectedVerses})`);
  }
  console.log(`corpus: ${verses} verses, ${words} words`);
  if (suspect.length) console.log(`verse-count mismatches: ${suspect.join(', ')}`);
  return { fetched, failed };
}

runMain(import.meta.url, main);
