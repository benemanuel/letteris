// Typesets the whole book (or a range) in ONE XeLaTeX run, so each font is
// embedded once - merging the page PDFs (merge-book.mjs) keeps one copy of
// every font per page (1384 pages: 32.7 MB). Bookmarks are the same as
// merge-book.mjs's (its --outline-only mode).
//
// Usage:  node build-book.mjs [firstPage] [lastPage]
//   no args -> every page -> OUTPUT_FILE; a range -> book-<first>-<last>-onerun.pdf
//
// Run after build-body.mjs: each page's pageN-body.tex / pageN-notes.tex are
// final (fit level, narrowing and wide letters already chosen), so every page
// comes out as its pageN.pdf. Per page, book.tex holds
//   \begingroup <the page's \def settings from pageN.tex> \input{page-content}
//   \clearpage \endgroup
// with the styles loaded once (page-style.tex). Blank pages (page-blank.tex),
// section title pages (build-section-title.mjs) and the book title page
// (build-title-page.mjs, before page 1) get their own content.
//
// Checks: one PDF page per book page (a page that spills over is named), the
// embedded fonts (pdffonts). See BOOK-BUILD-PLAN.md.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { HERE, readJson, lastPageInData } from './tanach-lib.mjs';

// ============================================================================
// CONFIG
// ============================================================================
const OUTPUT_FILE = 'letteris-book.pdf';
// Book title page (build-title-page.mjs): set before page 1 whenever the range
// starts at page 1; "page 0" in the page list and merge-book.mjs's outline.
const TITLE_PAGE_TEX = 'title-page.tex';
// ============================================================================
// A section title page is a standalone document with LaTeX's defaults, not the
// text pages' settings from page-style.tex: put those back for its page.
const STANDALONE_DEFAULTS = '\\setlength{\\parskip}{0pt plus 1pt}\\raggedbottom';

const args = process.argv.slice(2).map(Number);
const firstPage = args[0] || 1;
const lastPage = args[1] || (args[0] ? args[0] : lastPageInData);
const outFile = args.length ? `book-${firstPage}-${lastPage}-onerun.pdf` : OUTPUT_FILE;
const job = outFile.replace(/\.pdf$/, '');
const warnings = [];

// One run per output at a time: two runs writing the same PDF interleave into
// a broken file (2026-10-20: one complete PDF plus the other run's leftover
// bytes - some readers showed only page 1).
const lockFile = path.join(HERE, `${job}.lock`);
if (fs.existsSync(lockFile)) {
  const pid = Number(fs.readFileSync(lockFile, 'utf8'));
  let alive = false;
  try { process.kill(pid, 0); alive = true; } catch { /* stale lock */ }
  if (alive) {
    console.error(`Another build-book run (pid ${pid}) is writing ${outFile} - wait for it to finish.`);
    process.exit(1);
  }
}
fs.writeFileSync(lockFile, String(process.pid));
process.on('exit', () => fs.rmSync(lockFile, { force: true }));

// The page's own content in the book document, or null (skipped). Page 0 is the title page.
function pageContent(p) {
  const texFile = path.join(HERE, p === 0 ? TITLE_PAGE_TEX : `page${p}.tex`);
  if (!fs.existsSync(texFile)) return null;
  const tex = fs.readFileSync(texFile, 'utf8');
  // Log mark (spill-over check) and a named destination for the bookmarks.
  const mark = `\\typeout{BOOKPAGE ${p} \\the\\value{page}}\\special{pdf:dest (bp${p}) [@thispage /Fit]}`;
  // Blank page: empty, no header.
  if (tex.includes('\\input{page-blank.tex}')) return `\\begingroup${mark}\\bookpagereset\\thispagestyle{empty}\\null\\clearpage\\endgroup`;
  // Section title page or the title page: a whole document - its own setup lines and content.
  if (tex.includes('\\documentclass')) {
    const setup = tex.split('\\input{preamble-common.tex}')[1]?.split('\\begin{document}')[0];
    const content = tex.split('\\begin{document}')[1]?.split('\\end{document}')[0];
    if (setup == null || content == null) return null;
    return `\\begingroup${mark}\\bookpagereset\\thispagestyle{empty}${STANDALONE_DEFAULTS}${setup.replace('\\pagestyle{empty}', '')}${content}\\clearpage\\endgroup`;
  }
  // Text page: its settings, then the shared content.
  const settings = tex.split('\\input{page-master.tex}')[0];
  if (settings === tex) return null;
  for (const f of [`page${p}-body.tex`, `page${p}-notes.tex`]) if (!fs.existsSync(path.join(HERE, f))) return null;
  return `\\begingroup\n${settings.trim()}\n${mark}\\input{page-content.tex}\\clearpage\\endgroup`;
}

const included = [];
const parts = [];
if (firstPage === 1 && !fs.existsSync(path.join(HERE, TITLE_PAGE_TEX))) warnings.push(`no ${TITLE_PAGE_TEX} - run build-title-page.mjs; book has no title page`);
for (let p = firstPage === 1 && fs.existsSync(path.join(HERE, TITLE_PAGE_TEX)) ? 0 : firstPage; p <= lastPage; p += 1) {
  const c = pageContent(p);
  if (c == null) { warnings.push(`page ${p}: not built (no pageN.tex / body / notes) - left out`); continue; }
  included.push(p);
  parts.push(`% ---- page ${p}\n${c}`);
}
if (!included.length) {
  console.error('No built pages in range.');
  process.exit(1);
}

// Bookmarks: merge-book.mjs's outline (same range), written by xdvipdfmx
// itself - an outline special per entry, in outline order, on the first page,
// each pointing at its page's named destination (bp<page>). (Adding them to
// the finished PDF with pypdf failed: it misreads the 1384-page file.)
const outlineRun = spawnSync('node', ['merge-book.mjs', String(firstPage), String(lastPage), '--outline-only'], { cwd: HERE, encoding: 'utf8' });
let bookmarks = 0;
if (outlineRun.status !== 0) {
  warnings.push(`no bookmarks: merge-book.mjs --outline-only failed: ${outlineRun.stderr}`);
} else {
  const pdfString = (t) => {   // UTF-16BE hex with byte-order mark
    const le = Buffer.from(t, 'utf16le');
    for (let i = 0; i < le.length; i += 2) [le[i], le[i + 1]] = [le[i + 1], le[i]];
    return `<FEFF${le.toString('hex').toUpperCase()}>`;
  };
  const specials = [];
  const add = (items, level) => {
    for (const it of items) {
      if (!included.includes(it.page)) continue;
      specials.push(`\\special{pdf:out ${level} << /Title ${pdfString(it.title)} /A << /S /GoTo /D (bp${it.page}) >> >>}`);
      bookmarks += 1;
      add(it.kids, level + 1);
    }
  };
  add(readJson(path.join(HERE, 'book-outline.json')).outline, 1);
  specials.push('\\special{pdf:docview << /PageMode /UseOutlines >>}');
  parts[0] = parts[0].replace('\\begingroup', `\\begingroup\n${specials.join('\n')}\n`);
}

const book = `% Generated by build-book.mjs - do not edit.
\\documentclass[12pt]{article}
\\input{page-style.tex}
\\begin{document}
${parts.join('\n')}
\\end{document}
`;
fs.writeFileSync(path.join(HERE, `${job}.tex`), book, 'utf8');
// No cross-references: a leftover .aux from a broken run only causes errors.
fs.rmSync(path.join(HERE, `${job}.aux`), { force: true });
console.log(`Typesetting ${included.length} page(s) in one run (${job}.tex) ...`);
const t0 = Date.now();
const run = spawnSync('xelatex', ['-interaction=nonstopmode', `${job}.tex`], { cwd: HERE, encoding: 'utf8', maxBuffer: 1 << 30 });
const log = fs.existsSync(path.join(HERE, `${job}.log`)) ? fs.readFileSync(path.join(HERE, `${job}.log`), 'utf8') : '';
const written = log.match(/Output written on .*?\((\d+) pages?/s);
if (!written) {
  console.error(`xelatex produced no PDF - see ${job}.log`);
  console.error((run.stdout ?? '').split('\n').filter((l) => l.startsWith('!')).slice(0, 10).join('\n'));
  process.exit(1);
}
console.log(`xelatex: ${written[1]} PDF page(s) in ${Math.round((Date.now() - t0) / 1000)} s`);
const errors = log.split('\n').filter((l) => l.startsWith('! ')).length;
if (errors) warnings.push(`${errors} TeX error(s) - see ${job}.log`);

// Where each book page landed: "BOOKPAGE <page> <PDF page>". A page whose PDF
// page is not one after the previous page's means the previous one spilled over.
const pdfIndex = new Map();
for (const m of log.matchAll(/^BOOKPAGE (\d+) (\d+)$/gm)) pdfIndex.set(Number(m[1]), Number(m[2]));
let expected = 1;
for (const p of included) {
  const at = pdfIndex.get(p);
  if (at == null) { warnings.push(`page ${p}: no BOOKPAGE mark in the log`); continue; }
  if (at !== expected) warnings.push(`page ${p} starts on PDF page ${at}, expected ${expected} - the page before it spilled over`);
  expected = at + 1;
}
if (Number(written[1]) !== included.length) warnings.push(`${written[1]} PDF pages for ${included.length} book pages`);

// Fonts: one copy each (plus one per narrowing step used), not one per page.
const fonts = spawnSync('pdffonts', [outFile], { cwd: HERE, encoding: 'utf8' });
if (fonts.status === 0) {
  const names = fonts.stdout.split('\n').slice(2).map((l) => l.split(/\s+/)[0]).filter(Boolean);
  console.log(`Fonts: ${names.length} embedded (${[...new Set(names.map((n) => n.replace(/^[A-Z]{6}\+/, '')))].join(', ')})`);
}
const size = fs.statSync(path.join(HERE, outFile)).size;
console.log(`Wrote ${outFile}: ${included.length} page(s), ${bookmarks} bookmark(s), ${(size / 1e6).toFixed(1)} MB`);
if (warnings.length) console.log(`Warnings:\n  ${warnings.join('\n  ')}`);
