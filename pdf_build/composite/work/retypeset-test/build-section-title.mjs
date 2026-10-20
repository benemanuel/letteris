// Section title pages (e.g. page 351, נביאים ראשונים before Joshua): a page
// with no Bible text that names a section and lists its books, Hebrew on the
// right and English on the left. The scan prints Latin names (PROPHETAE
// PRIORES, JEHOSUAH, I. SAMUELIS); the retypeset uses English ones.
//
// Usage:  node build-section-title.mjs <page> [--no-pdf]
//
// The section is the tanach.json group holding the book that starts after
// the page; its titles (`hebbook`, and `name` as the English one) come from
// tanach.json, book names from englishHead(). The list runs from that book up
// to the book after the next section title page, so page 661 (Latter
// Prophets) also lists the Twelve, which have no title page of their own.
// Writes pageN.tex and runs xelatex.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  HERE, WORK, books, readJson, lastPageInData, englishHead, sectionTitleBook,
} from './tanach-lib.mjs';

// ============================================================================
// Config
// ============================================================================
const HEB_TITLE_SIZE = '40pt';        // letter-spaced Hebrew title
const HEB_LETTER_GAP = '0.35em';      // between the Hebrew title's letters
const ENG_TITLE_SIZE = '38pt';
const LIST_SIZE = 22;                 // book list, both columns (pt) - largest size (scan: names ~0.58 of the title's height)
const LIST_LEADING = 50;              // row pitch (pt) - largest; a longer list gets tighter rows
const LIST_MAX_HEIGHT = 495;          // so it fits in this height (pt): 15 books (page 661) -> 33pt rows, as in the scan
const LIST_SIZE_RATIO = 0.6;          // type size at most this fraction of the row pitch
const LIST_COLUMN = '0.34\\textwidth'; // width of each list column
const LIST_INSET = '0.12\\textwidth';  // list block's margin on each side
const ENG_LETTER_SPACE = 12;          // fontspec LetterSpace for the English names
const LIST_ABOVE = 1;                 // stretch above / below the list (the scan's
const LIST_BELOW = 1.25;              // list sits a little above the middle)
const LIST_MIN_GAP = '2em';            // least space between a row's two names (else a warning)
const ORNAMENT_WIDTH = '1.6in';       // tapered rule under the title and at the foot
// English titles for tanach.json groups whose `name` is a transliteration.
const GROUP_ENGLISH = { Ktubim: 'Writings', Nivim: 'Prophets' };
// ============================================================================

const TANACH_FILE = path.join(WORK, '..', '..', 'tanach.json');
const argv = process.argv.slice(2);
const page = Number(argv.find((a) => /^\d+$/.test(a)));
if (!page) {
  console.error('Usage: node build-section-title.mjs <page> [--no-pdf]');
  process.exit(1);
}

const book = sectionTitleBook(page);
if (!book) throw new Error(`page ${page}: not a section title page (no text, between two books)`);

// Books up to the one opened by the next section title page.
let stopBook = null;
for (let p = page + 1; p <= lastPageInData && !stopBook; p += 1) stopBook = sectionTitleBook(p);
const from = books.findIndex((b) => b.short === book);
const to = stopBook ? books.findIndex((b) => b.short === stopBook) : books.length;
const listed = new Set(books.slice(from, to).map((b) => b.short));

// tanach.json groups (not books), each with the short names of all its books.
const groups = [];
(function collect(items) {
  items?.forEach((item) => {
    if (item.shortbook) return;
    const shorts = [];
    (function walk(xs) { xs?.forEach((x) => (x.shortbook ? shorts.push(x.shortbook) : walk(x.children))); })(item.children);
    groups.push({ ...item, shorts });
    collect(item.children);
  });
})(readJson(TANACH_FILE).children);

// Title: the largest group holding the first book whose books are all listed -
// the whole division when the page lists all of it (989: כתובים), otherwise
// the first book's own group (661: נביאים אחרונים, though the Twelve follow).
const group = groups
  .filter((g) => g.shorts.includes(book) && g.shorts.every((x) => listed.has(x)))
  .sort((a, b) => b.shorts.length - a.shorts.length)[0];
if (!group) throw new Error(`page ${page}: no tanach.json group for ${book}`);
const section = group.name;
const english = (GROUP_ENGLISH[group.name] ?? group.name).toUpperCase();

// List entries: one per book, except a group of numbered parts of one book
// (Chronicles: דברי הימים א׳ / ב׳) is one entry with the group's names, as in
// the scan. Samuel and Kings are not groups in tanach.json, so they stay split.
const isPartsGroup = (g) => g.shorts.length > 1
  && g.shorts.every((x) => books.find((b) => b.short === x).hebbook.startsWith(`${g.hebbook} `));
const entries = [];
books.slice(from, to).forEach((b) => {
  const parts = groups.find((g) => g.shorts.includes(b.short) && isPartsGroup(g) && g.shorts.every((x) => listed.has(x)));
  if (!parts) entries.push({ heb: b.hebbook, eng: englishHead(b.short) });
  else if (parts.shorts[0] === b.short) entries.push({ heb: parts.hebbook, eng: parts.name.toUpperCase() });
});
const listLeading = Math.min(LIST_LEADING, LIST_MAX_HEIGHT / entries.length);
const listSize = Math.min(LIST_SIZE, listLeading * LIST_SIZE_RATIO);

// Letter-spaced Hebrew title; word gaps three times the letter gap.
const spaced = group.hebbook.split(' ')
  .map((w) => [...w].join(`\\hspace{${HEB_LETTER_GAP}}`))
  .join(`\\hspace{${3 * parseFloat(HEB_LETTER_GAP)}em}`);

const ornament = `\\tikz\\fill (-0.5*${ORNAMENT_WIDTH},0) -- (-0.15*${ORNAMENT_WIDTH},0.35pt) .. controls (0,1.6pt) .. (0.15*${ORNAMENT_WIDTH},0.35pt) -- (0.5*${ORNAMENT_WIDTH},0) -- (0.15*${ORNAMENT_WIDTH},-0.35pt) .. controls (0,-1.6pt) .. (-0.15*${ORNAMENT_WIDTH},-0.35pt) -- cycle;`;

// \listrow{hebrew}{english}{label}: one list row; logs SECTIONWARN when the two
// names leave less than LIST_MIN_GAP between them (\makebox would let them
// overlap silently). A name may run past its column into the empty middle.
const rows = entries.map((e) => `\\listrow{${e.heb}}{\\textenglish{\\addfontfeature{LetterSpace=${ENG_LETTER_SPACE}}${e.eng}}}{${e.eng}}`);

const tex = `% Section title page - generated by build-section-title.mjs (section ${section}).
\\documentclass[12pt]{article}
\\input{preamble-common.tex}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\newcommand\\listrow[3]{\\setbox0\\hbox{#1}\\setbox2\\hbox{#2}%
\\ifdim\\dimexpr\\wd0+\\wd2+${LIST_MIN_GAP}\\relax>\\linewidth
\\typeout{SECTIONWARN: #3 - gap between the names \\the\\dimexpr\\linewidth-\\wd0-\\wd2\\relax, minimum ${LIST_MIN_GAP}}\\fi
\\makebox[${LIST_COLUMN}][r]{\\box0}\\hfill\\makebox[${LIST_COLUMN}][l]{\\box2}\\par}
\\begin{document}
\\begin{hebrew}
\\centering
{\\fontsize{${HEB_TITLE_SIZE}}{${HEB_TITLE_SIZE}}\\selectfont\\hebrewfont ${spaced}\\par}
\\vspace{14mm}
{\\fontsize{${ENG_TITLE_SIZE}}{${ENG_TITLE_SIZE}}\\selectfont\\textenglish{\\bfseries ${english}}\\par}
\\vspace{16mm}
${ornament}\\par
\\vspace{\\stretch{${LIST_ABOVE}}}
{\\fontsize{${listSize}pt}{${listLeading}pt}\\selectfont\\hebrewfont
\\begin{minipage}{\\dimexpr\\textwidth-2\\dimexpr${LIST_INSET}\\relax\\relax}
${rows.join('\n')}
\\end{minipage}\\par}
\\vspace{\\stretch{${LIST_BELOW}}}
${ornament}\\par
\\vspace{10mm}
\\end{hebrew}
\\end{document}
`;
const file = path.join(HERE, `page${page}.tex`);
fs.writeFileSync(file, tex, 'utf8');
console.log(`page ${page}: ${group.hebbook} / ${english} - ${entries.map((e) => e.eng).join(', ')} -> ${path.basename(file)}`);

if (!argv.includes('--no-pdf')) {
  for (let i = 0; i < 2; i += 1) {
    const r = spawnSync('xelatex', ['-interaction=nonstopmode', `page${page}.tex`], { cwd: HERE, stdio: 'ignore' });
    if (r.status !== 0) throw new Error(`xelatex failed - see page${page}.log`);
  }
  console.log(`wrote page${page}.pdf`);

  // Spacing check: names wider than their column, overfull lines, overflow.
  const log = fs.readFileSync(path.join(HERE, `page${page}.log`), 'utf8');
  const warnings = [
    ...[...log.matchAll(/^SECTIONWARN: (.*)$/gm)].map((m) => `list row too tight: ${m[1]}`),
    ...[...log.matchAll(/^Overfull \hbox \((.*?)\) .*$/gm)].map((m) => `overfull line (${m[1]}) - see page${page}.log`),
  ];
  const pages = Number(log.match(/Output written on .*?\((\d+) pages?/)?.[1] ?? 0);
  if (pages !== 1) warnings.push(`page${page}.pdf has ${pages} pages - the page overflows`);
  if (warnings.length) {
    console.log('Warnings:');
    warnings.forEach((w) => console.log(`  - ${w}`));
  }
}
