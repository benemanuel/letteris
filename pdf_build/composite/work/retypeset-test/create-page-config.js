#!/usr/bin/env node
// Writes pageN.tex (the page-master.tex config) from boundary-words-final.json,
// tanach.json and the corpus.
//
// Usage:  node create-page-config.js <page> [lastPage]
//   node create-page-config.js 9        -> page9.tex
//   node create-page-config.js 9 21     -> page9.tex .. page21.tex
// Runs from any working directory.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  HERE, bookInfo, englishHead, toGematria, parseCitation, wordAfter,
  rowByPage, rowIsComplete, segmentsFor, pageRange, blankPages, isSectionTitlePage,
  isTorah, headerParasha, parshiotAvailable,
  splitRef, wordParts, partText, corpusWord, startsBook, chapterLabel,
} from './tanach-lib.mjs';

const args = process.argv.slice(2);
if (!args.length) {
  console.error('Usage: node create-page-config.js <page> [lastPage]');
  process.exit(1);
}
const { startPage, endPage } = pageRange(args);

const warnings = [];
let written = 0;
for (let pageNum = startPage; pageNum <= endPage; pageNum += 1) {
  // Blank page in the print: empty page from page-blank.tex.
  if (blankPages.has(pageNum)) {
    fs.writeFileSync(path.join(HERE, `page${pageNum}.tex`), `\\def\\pagecfg{${pageNum}}\n\n\\input{page-blank.tex}\n`, 'utf8');
    written += 1;
    console.log(`page${pageNum}.tex  blank page`);
    continue;
  }
  // Section title page (no Bible text): build-section-title.mjs writes its
  // pageN.tex and PDF; build-body.mjs skips it.
  if (isSectionTitlePage(pageNum)) {
    const r = spawnSync(process.execPath, [path.join(HERE, 'build-section-title.mjs'), String(pageNum)], { cwd: HERE, encoding: 'utf8' });
    if (r.status !== 0) {
      warnings.push(`page ${pageNum}: build-section-title.mjs failed - ${(r.stderr || r.stdout).trim().split('\n').pop()}`);
      continue;
    }
    const lines = r.stdout.trim().split('\n');
    const warn = lines.indexOf('Warnings:');
    if (warn >= 0) lines.slice(warn + 1).forEach((w) => warnings.push(`page ${pageNum}: ${w.trim().replace(/^- /, '')}`));
    written += 1;
    console.log(`page${pageNum}.tex  section title page (+ PDF): ${lines[0].replace(/^page \d+: /, '')}`);
    continue;
  }
  const row = rowByPage.get(pageNum);
  if (!rowIsComplete(row)) {
    warnings.push(`page ${pageNum}: boundary missing - skipped`);
    continue;
  }

  const segments = segmentsFor(row);
  const pageBooks = [...new Set(segments.map((s) => s.book))];
  if (pageBooks.length > 1) warnings.push(`page ${pageNum}: spans ${pageBooks.join(' + ')} - header uses ${pageBooks[0]}`);
  const book = bookInfo(pageBooks[0]);
  const chapters = segments.filter((s) => s.book === book.short).map((s) => s.chapter);

  // Catchword: what follows this page's last word - the rest of a split maqaf
  // word, otherwise the next corpus word (masora circle removed).
  const last = parseCitation(row.last.citation);
  const { word: lastN, part: lastPart } = row.last.n == null ? { word: Infinity, part: null } : splitRef(row.last.n);
  let nextText = null;
  if (lastPart) {
    const w = corpusWord(last.book, last.chapter, last.verse, lastN);
    if (lastPart < wordParts(w.ktiv).length) nextText = partText(w.ktiv, lastPart + 1, 'first');
  }
  nextText ??= wordAfter(last.book, last.chapter, last.verse, lastN)?.ktiv ?? '';
  const catchword = nextText.replace(/֯/g, '');

  // Torah pages: the newest parasha on the page (printed on even pages).
  const parasha = isTorah(book.short) ? headerParasha(parseCitation(row.first.citation), last) : '';

  // A page that begins at a book's very first word gets the title header.
  const bookStart = startsBook(segments[0]);

  const config = `\\def\\pagecfg{${pageNum}}
\\def\\pagebookstart{${bookStart}}
\\def\\pageparity{${pageNum % 2 === 0 ? 'even' : 'odd'}}
\\def\\pagehebbook{${book.hebbook}}
\\def\\pageparasha{${parasha}}
\\def\\pageengbook{${englishHead(book.short)}}
\\def\\pagechapters{${chapters.join(',')}}
\\def\\pagechaplabel{${chapterLabel(book.short) ? '' : 'Chap.'}}
\\def\\pagegematrias{${chapters.map(toGematria).join(',')}}
\\def\\pagecatchword{${catchword}}

\\input{page-master.tex}
`;
  fs.writeFileSync(path.join(HERE, `page${pageNum}.tex`), config, 'utf8');
  written += 1;
  console.log(`page${pageNum}.tex  ${englishHead(book.short)} ${chapters.join(',')}${bookStart ? ' (book title page)' : ''}  catchword: ${catchword}`);
}

if (!parshiotAvailable()) warnings.push('parshiot.json not found next to tanach.json - \\pageparasha left empty');
console.log(`Wrote ${written} config(s).`);
if (warnings.length) console.log(`Warnings:\n  ${warnings.join('\n  ')}`);
