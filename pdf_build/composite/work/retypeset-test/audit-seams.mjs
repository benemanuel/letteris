// Audit every page seam (page N's last word -> page N+1's first word) and
// write a ranked list of set-boundary.mjs fixes.
//
// Usage:  node audit-seams.mjs
//
// Two independent signals per seam:
//   1. Chain - page N+1 must start at the word (or maqaf part) right after
//      page N's last one: no overlap, no gap.
//   2. Catchword - the word OCR'd under page N in the scan
//      (work/catchwords.json) must be page N+1's first word.
// Plus one rule: a paseq (׀, its own corpus word) never starts a page - it
// ends the page before, as in the scan (pages 993, 1015, 1336). Any proposed
// seam is moved past a paseq.
//
// Trust decides which side of a broken seam moves: a manually checked edge
// (VERIFIED_THROUGH_PAGE, or an override in boundary-verdicts.json) is never
// changed - a fix that would need to is listed as a conflict instead. A
// catchword that places the seam at a specific word beats the alignment tiers.
// Provisional edges (boundary-provisional.json, earlier tool suggestions) are
// unverified and may be questioned again.
//
// Output: work/seam-fixes.txt (commands + evidence, best first). Nothing is
// applied - review, then run the lines you accept. The commands carry
// --source=audit-seams, so they land in boundary-provisional.json until a
// human confirms them (plain set-boundary.mjs call).

import fs from 'node:fs';
import path from 'node:path';
import {
  WORK, readJson, rowByPage, books, parseCitation, splitRef, wordParts, wordAfter, corpusWord,
} from './tanach-lib.mjs';

// ============================================================================
// CONFIG
// ============================================================================
// Pages whose both edges were checked by hand against the scan: all of them
// (the user's review finished 2026-10-19).
const VERIFIED_THROUGH_PAGE = 1384;
// Corpus window searched around each seam for the catchword (real words).
const WINDOW_BACK = 15;
const WINDOW_SIZE = 40;
// A catchword hit further than this many words from the current seam is "medium".
const NEAR = 6;
// Catchwords shorter than this (consonants) are only trusted as an exact
// match within SHORT_NEAR words of the seam (את, על, כן ... occur everywhere).
const MIN_CATCHWORD = 3;
const SHORT_NEAR = 2;
const OUT_FILE = path.join(WORK, 'seam-fixes.txt');
const PASEQ = '׀';
// ============================================================================

const catchwordsRaw = readJson(path.join(WORK, 'catchwords.json'));
const catchwordByPage = new Map((Array.isArray(catchwordsRaw) ? catchwordsRaw : catchwordsRaw.pages ?? catchwordsRaw.rows)
  .map((x) => [x.page, x.word]));
const overrides = readJson(path.join(WORK, 'boundary-verdicts.json')).overrides;

// --- Hebrew comparison: consonants only, final forms folded, ו/י ignored
// (full vs defective spelling), tolerant edit distance for OCR noise.
const FINALS = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
const skeleton = (s) => (s ?? '').replace(/[^א-ת]/g, '').replace(/[ךםןףץ]/g, (c) => FINALS[c]).replace(/[וי]/g, '');
function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const close = (a, b) => a && b && editDistance(a, b) <= Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.34));
// Spelling distance of a token to the catchword (whole word or this part); lower = better.
const spelling = (sk, t) => Math.min(editDistance(sk, skeleton(t.ktiv)), t.part === 1 ? editDistance(sk, skeleton(corpusWordText(t))) : Infinity);

// --- Token stream: every real word of the Tanakh in order, and every maqaf
// part of a joined word, so a seam inside a word is just another position.
// token = { word: "Gen24:5#3", part: k|null, parts: n, ktiv }
const ALL = [];
const firstTokenOfWord = new Map();
for (let w = wordAfter(books[0].short, 1, 1, 0); w; w = wordAfter(w.book, w.chapter, w.verse, w.n)) {
  const word = `${w.book}${w.chapter}:${w.verse}#${w.n}`;
  const parts = wordParts(w.ktiv);
  firstTokenOfWord.set(word, ALL.length);
  if (parts.length === 1) ALL.push({ word, part: null, parts: 1, ktiv: w.ktiv });
  else parts.forEach((pt, i) => ALL.push({ word, part: i + 1, parts: parts.length, ktiv: pt }));
}
// Window of tokens around a word: WINDOW_BACK words before it, WINDOW_SIZE in all.
function tokensAround(citation, n) {
  const at = firstTokenOfWord.get(`${citation}#${n}`) ?? 0;
  return ALL.slice(Math.max(0, at - WINDOW_BACK), at - WINDOW_BACK + WINDOW_SIZE);
}
// Canonical edge refs: a page's last edge names the last part it prints, its
// first edge the first part; a whole word carries no part.
const lastRefOf = (t) => (t.part && t.part < t.parts ? `${t.word}.${t.part}` : t.word);
const firstRefOf = (t) => (t.part && t.part > 1 ? `${t.word}.${t.part}` : t.word);
function canonical(edge, citation, n) {
  const { word, part } = splitRef(n);
  const c = parseCitation(citation);
  const parts = wordParts(corpusWord(c.book, c.chapter, c.verse, word).ktiv).length;
  const whole = !part || (edge === 'last' ? part >= parts : part <= 1);
  return `${citation}#${word}${whole ? '' : `.${part}`}`;
}
// Index of the token an edge points at (last: its final part, first: its first part).
function tokenIndex(tokens, ref, edge) {
  const [word, part] = ref.split(/\.(?=\d+$)/);
  const idx = tokens.map((t, i) => ({ t, i })).filter(({ t }) => t.word === word);
  if (!idx.length) return -1;
  if (part) return idx.find(({ t }) => t.part === Number(part))?.i ?? -1;
  return edge === 'last' ? idx.at(-1).i : idx[0].i;
}

const isPaseq = (t) => t?.ktiv.trim() === PASEQ;

const verified = (page, edge) => page <= VERIFIED_THROUGH_PAGE || Boolean(overrides[`${page}|${edge}`]);
const trust = (page, edge, e) => {
  if (verified(page, edge)) return 9;
  return { 0: 3, 1: 2.5, 2: (e.worst ?? 0) > 100 ? 1 : 2 }[e.tier] ?? 0;
};

const fixes = { high: [], medium: [], low: [] };
const conflicts = [];
const unresolved = [];
let checked = 0;
let ok = 0;

for (const [p, row] of rowByPage) {
  const next = rowByPage.get(p + 1);
  if (!row?.last?.citation || !next?.first?.citation) continue;
  checked += 1;
  const curLast = canonical('last', row.last.citation, row.last.n);
  const curFirst = canonical('first', next.first.citation, next.first.n);
  const tokens = tokensAround(row.last.citation, splitRef(row.last.n).word);
  const iLast = tokenIndex(tokens, curLast, 'last');
  const iFirst = tokenIndex(tokens, curFirst, 'first');
  const chainOK = iLast >= 0 && iFirst === iLast + 1;
  const seamAt = iLast >= 0 ? iLast + 1 : iFirst; // token index the next page should start at

  // Catchword: where does it place the seam?
  const ocr = catchwordByPage.get(p);
  const sk = skeleton(ocr);
  let cw = null; // { i, dist }
  if (sk) {
    const hits = tokens.map((t, i) => ({ t, i, dist: Math.abs(i - seamAt), ed: spelling(sk, t) }))
      .filter(({ t, dist }) => {
        const tk = skeleton(t.ktiv);
        if (sk.length >= MIN_CATCHWORD) return close(sk, tk) || (t.part === 1 && close(sk, skeleton(corpusWordText(t))));
        return dist <= SHORT_NEAR && sk === tk;
      })
      .filter(({ i }) => i > 0)
      // best spelling first (an exact OCR read beats a near-miss next door), then nearest
      .sort((a, b) => a.ed - b.ed || a.dist - b.dist);
    if (hits.length) cw = { ...hits[0], tied: hits.length > 1 && hits[1].ed === hits[0].ed && hits[1].dist === hits[0].dist, agrees: hits.some(({ i }) => i === iFirst), short: sk.length < MIN_CATCHWORD };
  }
  const vLast = verified(p, 'last');
  const vFirst = verified(p + 1, 'first');
  // Consistent: chain meets and the catchword (if readable) fits the current
  // first word, or both edges are hand-verified (they beat OCR).
  const paseqFirst = isPaseq(tokens[iFirst]);
  if (chainOK && !paseqFirst && (!cw || cw.agrees || (vLast && vFirst))) { ok += 1; continue; }

  const tag = `${p}/${p + 1}`;
  const label = (v, e) => (v ? 'verified' : e.provisional ? `provisional ${e.provisional}` : `t${e.tier}`);
  const evidence = `now: p${p} last ${curLast} (${label(vLast, row.last)}), p${p + 1} first ${curFirst} (${label(vFirst, next.first)}${paseqFirst ? ', a paseq' : ''}); chain ${chainOK ? 'ok' : iFirst <= iLast ? 'OVERLAP' : 'GAP'}; catchword "${ocr ?? '-'}"`;

  // Proposed seam: catchword hit if any, else move the less-trusted side.
  let at = null;
  let why = '';
  let level = 'low';
  if (cw && !cw.tied && !cw.agrees) {
    at = cw.i;
    why = `catchword matches ${firstRefOf(tokens[at])} "${tokens[at].ktiv}"`;
    level = cw.dist <= NEAR && !cw.short ? 'high' : 'medium';
  } else if (!chainOK) {
    const keepLast = trust(p, 'last', row.last) >= trust(p + 1, 'first', next.first);
    at = keepLast ? iLast + 1 : iFirst;
    if (at <= 0 || at >= tokens.length) at = null;
    why = keepLast ? `keep p${p} last (more trusted), move p${p + 1} first` : `keep p${p + 1} first (more trusted), move p${p} last`;
    level = 'medium';
  } else if (paseqFirst) {
    at = iFirst;
    why = 'paseq never starts a page';
    level = 'high';
  }
  // A paseq at the proposed seam goes to the page before.
  if (at != null && isPaseq(tokens[at])) {
    while (isPaseq(tokens[at])) at += 1;
    if (at >= tokens.length) at = null;
    else if (!why.startsWith('paseq')) why += '; paseq moved to the page before';
  }
  if (at == null) { unresolved.push(`${tag}  ${evidence}  - ${cw?.tied ? 'catchword fits two words equally well' : 'no usable evidence'}`); continue; }

  const newLast = lastRefOf(tokens[at - 1]);
  const newFirst = firstRefOf(tokens[at]);
  const edits = [];
  if (newLast !== curLast) edits.push({ page: p, edge: 'last', ref: newLast, locked: vLast });
  if (newFirst !== curFirst) edits.push({ page: p + 1, edge: 'first', ref: newFirst, locked: vFirst });
  if (!edits.length) { ok += 1; continue; }
  if (edits.some((e) => e.locked)) {
    conflicts.push(`${tag}  ${evidence}\n    ${why}; would change verified ${edits.filter((e) => e.locked).map((e) => `p${e.page} ${e.edge}`).join(' + ')} -> check the scan`);
    continue;
  }
  const cmd = `node set-boundary.mjs ${edits.map((e) => `p${e.page} ${e.edge} = ${e.ref}`).join(' ')} --source=audit-seams --no-build`;
  fixes[level].push(`# ${tag}  ${why}\n#   ${evidence}\n${cmd}`);
}

// Text of a whole corpus word from a token (catchword may print a whole maqaf word).
function corpusWordText(t) {
  const [cit, n] = t.word.split('#');
  const c = parseCitation(cit);
  return corpusWord(c.book, c.chapter, c.verse, Number(n)).ktiv;
}

const out = [
  `# Seam audit - generated by audit-seams.mjs on ${new Date().toISOString().slice(0, 10)}`,
  `# Verified: pages 1-${VERIFIED_THROUGH_PAGE} + boundary-verdicts.json overrides (never changed here).`,
  `# Seams checked ${checked}: ok ${ok}, high ${fixes.high.length}, medium ${fixes.medium.length}, low ${fixes.low.length}, conflicts ${conflicts.length}, unresolved ${unresolved.length}.`,
  '# Commands use --source=audit-seams (-> boundary-provisional.json, unverified) and --no-build;',
  '# rebuild afterwards (create-page-config.js + build-body.mjs). Confirm an edge after checking the scan',
  '# by re-running it without --source.',
  '',
  '# ===== HIGH: catchword places the seam within a few words =====', ...fixes.high, '',
  '# ===== MEDIUM: catchword further away, or chain repaired by trust =====', ...fixes.medium, '',
  '# ===== CONFLICTS: evidence contradicts a verified edge - check the scan =====', ...conflicts.map((c) => `# ${c}`), '',
  '# ===== UNRESOLVED: broken but no usable evidence =====', ...unresolved.map((u) => `# ${u}`), '',
].join('\n');
fs.writeFileSync(OUT_FILE, out, 'utf8');
console.log(out.split('\n').slice(0, 3).join('\n'));
console.log(`written to ${OUT_FILE}`);
