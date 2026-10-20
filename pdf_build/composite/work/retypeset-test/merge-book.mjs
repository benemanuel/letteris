// Merges the built pageN.pdf files into one PDF with book, parasha and chapter
// bookmarks.
//
// Usage:  node merge-book.mjs [firstPage] [lastPage] [--outline-only]
//   no args -> every page that has a pageN.pdf
// Output: OUTPUT_FILE (or book-<first>-<last>.pdf for a range), plus
// book-outline.json (the bookmarks, for checking).
// A range starting at page 1 begins with the book title page (title-page.pdf,
// build-title-page.mjs), bookmarked first.
//
// Bookmarks (same titles as the scan's *.final.bookmarks.txt):
//   book     "בראשית – Genesis"            on the page where its 1:1 starts
//   parasha  "נח – Noach"                  on the page where its first verse starts
//   chapter  "7"                           on the page where the chapter starts
// Three parts, in this order:
//   1. every book, with only its chapters under it;
//   2. פרשות: each Torah book with its parashot under it, and Psalms with its
//      five books (work/psalms-books.json);
//   3. הפטרות (work/haftarot-table.json, the edition's haftara table): portions
//      in Torah order, then holidays in year order, then Rosh Chodesh; one per
//      occasion, or one per rite (אשכנז / ספרד) when they differ.
// Everything is bookmarked at its first verse. All starts come from
// boundary-words-final.json; a page with incomplete boundary data can't place
// its starts (warning).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  HERE, WORK, readJson, books, isTorah, loadChapter, isMarkerWord, citationKey,
  rowByPage, rowIsComplete, segmentsFor, lastPageInData, portionList, isSectionTitlePage,
  subBookList, blankPages,
} from './tanach-lib.mjs';

// ============================================================================
// CONFIG
// ============================================================================
const OUTPUT_FILE = 'letteris-retypeset.pdf';
const PYTHON = 'python';
const HAFTAROT_TABLE_FILE = path.join(WORK, 'haftarot-table.json');
const ASHKENAZ_LABEL = 'אשכנז';
const SEPHARDI_LABEL = 'ספרד';
const HAFTAROT_TITLE = 'הפטרות – Haftarot';
const PARASHOT_TITLE = 'פרשות – Parashot';
// Book title page (build-title-page.mjs): put before page 1 whenever the
// range starts at page 1; "page 0" in the page list and the outline.
const TITLE_PAGE_FILE = 'title-page.pdf';
const TITLE_PAGE_BOOKMARK = 'שער – Title Page';
// ============================================================================

// --outline-only: compute the bookmarks into book-outline.json and stop (no
// merge); build-book.mjs uses it for the one-run book.
const OUTLINE_ONLY = process.argv.includes('--outline-only');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--')).map(Number);
const firstPage = args[0] || 1;
const lastPage = args[1] || (args[0] ? args[0] : lastPageInData);
const outFile = args.length ? `book-${firstPage}-${lastPage}.pdf` : OUTPUT_FILE;
const warnings = [];

const pages = [];
for (let p = firstPage; p <= lastPage; p += 1) {
  if (fs.existsSync(path.join(HERE, `page${p}.pdf`))) pages.push(p);
  else if (args.length) warnings.push(`page ${p}: no page${p}.pdf - left out`);
}
if (!pages.length) {
  console.error('No pageN.pdf files in range.');
  process.exit(1);
}
const withTitlePage = firstPage === 1 && fs.existsSync(path.join(HERE, TITLE_PAGE_FILE));
if (firstPage === 1 && !withTitlePage) warnings.push(`no ${TITLE_PAGE_FILE} - run build-title-page.mjs; book has no title page`);

// Does verse v of segment s start on this page? Marker words (װ/ײ/ױ) before
// the page's first word don't count (Exod 1:1 starts at word #2 after a װ).
function verseStartsHere(s, v) {
  if (v < s.startVerse || v > s.endVerse) return false;
  if (v > s.startVerse) return true;
  if (s.startPart > 1) return false;
  const words = loadChapter(s.book, s.chapter).verses.find((x) => x.verse === v)?.words ?? [];
  return words.slice(0, s.startWordIdx - 1).every((w) => isMarkerWord(w.ktiv));
}

// Every verse start on a page: key -> page.
const startPage = new Map();
const unknown = [];
for (const p of pages) {
  const row = rowByPage.get(p);
  if (!rowIsComplete(row)) {
    if (!isSectionTitlePage(p) && !blankPages.has(p)) unknown.push(p);  // no verses to bookmark
    continue;
  }
  for (const s of segmentsFor(row)) {
    for (let v = s.startVerse; v <= s.endVerse; v += 1) {
      if (verseStartsHere(s, v)) startPage.set(citationKey({ book: s.book, chapter: s.chapter, verse: v }), p);
    }
  }
}
if (unknown.length) warnings.push(`${unknown.length} page(s) with incomplete boundary data - starts on them have no bookmark: ${unknown.join(', ')}`);

// Outline: [{ title, page, kids: [...] }], page = book page number (pageN.pdf).
const at = (book, chapter, verse) => startPage.get(citationKey({ book, chapter, verse })) ?? null;
const outline = [];
const portions = portionList();
for (const b of books) {
  const bookPage = at(b.short, 1, 1);
  const chapters = b.chapters.map((_, i) => ({ title: String(i + 1), page: at(b.short, i + 1, 1), kids: [] }))
    .filter((c) => c.page != null);
  if (bookPage == null && !chapters.length) continue;
  outline.push({ title: bookTitle(b), page: bookPage ?? chapters[0].page, kids: chapters });
}
function bookTitle(b) {
  return `${b.hebbook} – ${b.name.replace(/^(\d)/, '$1 ').replace('Songofsongs', 'Song of Songs')}`;
}

// Parashot: their own group after the books - each Torah book with its
// parashot, and Psalms with its five books - each at its first verse.
const divisions = [];
for (const b of books) {
  const kids = isTorah(b.short)
    ? portions.filter((x) => x.start.book === b.short)
      .map((x) => ({ title: `${x.name} – ${x.english}`, page: at(x.start.book, x.start.chapter, x.start.verse), kids: [] }))
    : subBookList().filter((x) => x.book === b.short)
      .map((x) => ({ title: `${x.heb} – ${x.eng.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}`, page: at(x.book, x.chapter, 1), kids: [] }));
  const placed = kids.filter((x) => x.page != null);
  if (placed.length) divisions.push({ title: bookTitle(b), page: placed[0].page, kids: placed });
}
if (divisions.length) outline.push({ title: PARASHOT_TITLE, page: divisions[0].page, kids: divisions });

// Haftarot (work/haftarot-table.json, the edition's own table): one group
// after the parashot, in the table file's order (portions, then holidays in
// year order, then Rosh Chodesh). One bookmark per occasion at its first verse;
// two (אשכנז / ספרד) when the rites read different passages.
if (fs.existsSync(HAFTAROT_TABLE_FILE)) {
  const kids = [];
  for (const h of readJson(HAFTAROT_TABLE_FILE).haftarot) {
    const rites = h.ashkenaz.join() === h.sephardi.join()
      ? [['', h.ashkenaz]]
      : [[` (${ASHKENAZ_LABEL})`, h.ashkenaz], [` (${SEPHARDI_LABEL})`, h.sephardi]];
    for (const [label, ranges] of rites) {
      const first = parseRange(ranges[0]);
      const page = at(first.book, first.c1, first.v1);
      if (page == null) continue;
      kids.push({ title: `${h.occasion}${label} – ${rangesText(ranges)}`, page, kids: [] });
    }
  }
  if (kids.length) outline.push({ title: HAFTAROT_TITLE, page: kids[0].page, kids });
} else {
  warnings.push(`no ${path.basename(HAFTAROT_TABLE_FILE)} - no haftara bookmarks`);
}

// "Isa42:5-43:10" / "Ezek3:12" -> { book, c1, v1, c2, v2 }.
function parseRange(r) {
  const m = r.match(/^(\d?[A-Za-z]+)(\d+):(\d+)(?:-(\d+):(\d+))?$/);
  if (!m) throw new Error(`haftarot-table.json: bad range "${r}"`);
  const [c1, v1] = [Number(m[2]), Number(m[3])];
  return { book: m[1], c1, v1, c2: Number(m[4] ?? c1), v2: Number(m[5] ?? v1) };
}

// ["Isa27:6-28:13", "Isa29:22-29:23", "Joel2:15-2:27"] -> "Isa 27:6–28:13, 29:22–23; Joel 2:15–27".
function rangesText(ranges) {
  let prevBook = null;
  return ranges.map((r) => {
    const { book, c1, v1, c2, v2 } = parseRange(r);
    const end = c2 === c1 && v2 === v1 ? '' : c2 === c1 ? `–${v2}` : `–${c2}:${v2}`;
    const text = `${book === prevBook ? '' : `${book} `}${c1}:${v1}${end}`;
    const sep = prevBook == null ? '' : book === prevBook ? ', ' : '; ';
    prevBook = book;
    return sep + text;
  }).join('');
}

if (withTitlePage) {
  pages.unshift(0);
  outline.unshift({ title: TITLE_PAGE_BOOKMARK, page: 0, kids: [] });
}

const outlineFile = path.join(HERE, 'book-outline.json');
fs.writeFileSync(outlineFile, JSON.stringify({ pages, outline }, null, 1), 'utf8');
if (OUTLINE_ONLY) {
  console.log(`Wrote ${path.basename(outlineFile)}: ${pages.length} page(s)`);
  if (warnings.length) console.log(`Warnings:\n  ${warnings.join('\n  ')}`);
  process.exit(0);
}

// The merge itself: pypdf (python), from the outline file.
const py = `
import json, sys
from pypdf import PdfWriter
d = json.load(open(sys.argv[1], encoding='utf-8'))
w = PdfWriter()
first = {}  # book page -> index of its first PDF page (a pageN.pdf may have more than one)
for p in d['pages']:
    first[p] = len(w.pages)
    w.append(sys.argv[3] + '/' + (sys.argv[4] if p == 0 else 'page%d.pdf' % p), import_outline=False)
    if len(w.pages) - first[p] > 1:
        print('page %d: %d PDF pages (overflows)' % (p, len(w.pages) - first[p]))
def add(items, parent):
    for it in items:
        add(it['kids'], w.add_outline_item(it['title'], first[it['page']], parent=parent))
add(d['outline'], None)
w.page_mode = '/UseOutlines'
with open(sys.argv[2], 'wb') as f:
    w.write(f)
`;
const r = spawnSync(PYTHON, ['-c', py, outlineFile, path.join(HERE, outFile), HERE, TITLE_PAGE_FILE], { encoding: 'utf8' });
if (r.status !== 0) {
  console.error(r.stderr || r.error);
  process.exit(1);
}
if (r.stdout.trim()) warnings.push(...r.stdout.trim().split(/\r?\n/));
const count =(items) => items.reduce((n, it) => n + 1 + count(it.kids), 0);
console.log(`Wrote ${outFile}: ${pages.length} page(s), ${count(outline)} bookmark(s)`);
if (warnings.length) console.log(`Warnings:\n  ${warnings.join('\n  ')}`);
