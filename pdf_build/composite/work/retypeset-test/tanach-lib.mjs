// Shared Tanakh data and page-boundary helpers for build-body.mjs and
// create-page-config.js. Everything book-related comes from tanach.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));   // work/retypeset-test
export const WORK = path.join(HERE, '..');                           // work
const TANACH_FILE = path.join(WORK, '..', '..', 'tanach.json');       // C:\temp\ocr\tanach.json
export const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// [{ short, name, hebbook, section, chapters: [verseCount, ...] }] in edition
// order. `section` is the enclosing group's name ("Torah", ...).
export const books = [];
(function collect(items, section) {
  items?.forEach((item) => {
    if (item.shortbook) {
      books.push({ short: item.shortbook, name: item.name, hebbook: item.hebbook, section, chapters: item.chapters.map(Number) });
    }
    collect(item.children, item.shortbook ? section : item.name);
  });
})(readJson(TANACH_FILE).children);

const bookIndex = new Map(books.map((b, i) => [b.short, i]));
const shortByName = new Map(books.map((b) => [b.name, b.short]));

export function bookInfo(short) {
  const b = books[bookIndex.get(short)];
  if (!b) throw new Error(`book "${short}" not in tanach.json`);
  return b;
}

// "Genesis" -> "Gen" (word_notes.json uses tanach.json's `name`).
export function shortForName(name) {
  const s = shortByName.get(name);
  if (!s) throw new Error(`book name "${name}" not in tanach.json`);
  return s;
}

// Running-head English name: "1Samuel" -> "1 SAMUEL", "Songofsongs" -> "SONG OF SONGS".
const ENGLISH_NAME_FIXES = { Songofsongs: 'Song of Songs' };
export const englishHead = (short) => {
  const { name } = bookInfo(short);
  return (ENGLISH_NAME_FIXES[name] ?? name).replace(/^(\d)/, '$1 ').toUpperCase();
};

export const isTorah = (short) => bookInfo(short).section === 'Torah';

// Sort key for a citation, comparable across books.
export function citationKey({ book, chapter, verse }) {
  return (bookIndex.get(book) * 1000 + chapter) * 1000 + verse;
}

export function verseCount(book, chapter) {
  const n = bookInfo(book).chapters[chapter - 1];
  if (!n) throw new Error(`${book} has no chapter ${chapter}`);
  return n;
}

// Every (book, chapter) from `from` to `to` inclusive, in edition order.
export function chaptersBetween(from, to) {
  const out = [];
  let bi = bookIndex.get(from.book);
  let ch = from.chapter;
  const endBi = bookIndex.get(to.book);
  if (bi === undefined || endBi === undefined) throw new Error(`unknown book in ${from.book}..${to.book}`);
  while (bi < endBi || (bi === endBi && ch <= to.chapter)) {
    out.push({ book: books[bi].short, chapter: ch });
    ch += 1;
    if (ch > books[bi].chapters.length) { bi += 1; ch = 1; }
  }
  return out;
}

// The chapter after (book, chapter) in edition order, or null at the end.
function nextChapter(book, chapter) {
  const bi = bookIndex.get(book);
  if (chapter < books[bi].chapters.length) return { book, chapter: chapter + 1 };
  return bi + 1 < books.length ? { book: books[bi + 1].short, chapter: 1 } : null;
}
function prevChapter(book, chapter) {
  const bi = bookIndex.get(book);
  if (chapter > 1) return { book, chapter: chapter - 1 };
  return bi > 0 ? { book: books[bi - 1].short, chapter: books[bi - 1].chapters.length } : null;
}

const chapterCache = new Map();
export function loadChapter(book, chapter) {
  const key = `${book}-${chapter}`;
  if (!chapterCache.has(key)) {
    chapterCache.set(key, readJson(path.join(WORK, 'corpus', `${book}-${String(chapter).padStart(3, '0')}.json`)));
  }
  return chapterCache.get(key);
}

// Boundary word refs may name part of a maqaf-joined word: "#12.1" is word 12,
// part 1. As a page's LAST word, part k means parts 1..k; as a page's FIRST
// word, part k means parts k..end. A whole number means the whole word.
export function splitRef(n) {
  const [word, part] = String(n).split('.');
  return { word: Number(word), part: part ? Number(part) : null };
}

// "וְאֶת־כָּל־הָעָם" -> ["וְאֶת־", "כָּל־", "הָעָם"] (maqaf stays on its part).
export const wordParts = (ktiv) => ktiv.split(/(?<=־)/);

// The text of `ktiv` that belongs on a page whose `edge` ('first'|'last') is part `part`.
export function partText(ktiv, part, edge) {
  const parts = wordParts(ktiv);
  if (part < 1 || part > parts.length) throw new Error(`"${ktiv}" has no part ${part}`);
  return (edge === 'last' ? parts.slice(0, part) : parts.slice(part - 1)).join('');
}

export function corpusWord(book, chapter, verse, n) {
  const v = loadChapter(book, chapter).verses.find((x) => x.verse === verse);
  const w = v?.words.find((x) => x.n === n);
  if (!w) throw new Error(`no word ${book}${chapter}:${verse}#${n} in corpus`);
  return w;
}

// Petuchah / setumah / four-line-blank markers stored as corpus "words"
// (possibly followed by a masora circle).
export const isMarkerWord = (ktiv) => /^[ײױװ]/.test(ktiv);

// True when a page starting at segment s0 begins at its book's first real word:
// chapter 1, verse 1, and only marker words (Exod-Deut open with a װ) before it.
export function startsBook(s0) {
  if (s0.chapter !== 1 || s0.startVerse !== 1 || (s0.startPart ?? 1) !== 1) return false;
  const v1 = loadChapter(s0.book, 1).verses.find((x) => x.verse === 1);
  return v1.words.every((w) => w.n >= s0.startWordIdx || isMarkerWord(w.ktiv));
}

// Last real word before (book chapter:verse, word n) - the corpus word plus its
// book/chapter/verse - or null at the start of the Tanakh.
export function wordBefore(book, chapter, verse, n) {
  let cur = { book, chapter };
  let fromVerse = verse;
  let fromWord = n;
  while (cur) {
    const verses = loadChapter(cur.book, cur.chapter).verses;
    for (let vi = verses.length - 1; vi >= 0; vi -= 1) {
      const v = verses[vi];
      if (v.verse > fromVerse) continue;
      for (let wi = v.words.length - 1; wi >= 0; wi -= 1) {
        const w = v.words[wi];
        if (v.verse === fromVerse && w.n >= fromWord) continue;
        if (!isMarkerWord(w.ktiv)) return { ...w, book: cur.book, chapter: cur.chapter, verse: v.verse };
      }
    }
    cur = prevChapter(cur.book, cur.chapter);
    fromVerse = Infinity;
    fromWord = Infinity;
  }
  return null;
}

// First real word after (book chapter:verse, word n) - the corpus word plus its
// book/chapter/verse - or null at the end of the Tanakh.
export function wordAfter(book, chapter, verse, n) {
  let cur = { book, chapter };
  let fromVerse = verse;
  let fromWord = n;
  while (cur) {
    for (const v of loadChapter(cur.book, cur.chapter).verses) {
      if (v.verse < fromVerse) continue;
      for (const w of v.words) {
        if (v.verse === fromVerse && w.n <= fromWord) continue;
        if (!isMarkerWord(w.ktiv)) return { ...w, book: cur.book, chapter: cur.chapter, verse: v.verse };
      }
    }
    cur = nextChapter(cur.book, cur.chapter);
    fromVerse = 0;
    fromWord = 0;
  }
  return null;
}

// Hebrew numerals; 15/16 avoid spelling the divine name (also 115/116).
const GEMATRIA_ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const GEMATRIA_TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const GEMATRIA_HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת'];
export function toGematria(n) {
  const hundreds = GEMATRIA_HUNDREDS[Math.floor(n / 100)];
  const rest = n % 100;
  if (rest === 15) return `${hundreds}ט״ו`;
  if (rest === 16) return `${hundreds}ט״ז`;
  return `${hundreds}${GEMATRIA_TENS[Math.floor(rest / 10)]}${GEMATRIA_ONES[rest % 10]}`;
}

// Sub-books within a book (the five books of Psalms), from
// work/psalms-books.json: "<book>:<first chapter>" -> { heb, eng }.
const SUB_BOOKS_FILE = path.join(WORK, 'psalms-books.json');
// Its `chapterLabel` ("Psalm") replaces "Cap." in that book's chapter headings.
const subBooks = new Map();
const chapterLabels = new Map();
if (fs.existsSync(SUB_BOOKS_FILE)) {
  const data = readJson(SUB_BOOKS_FILE);
  const book = shortForName(data.book);
  for (const b of data.books) subBooks.set(`${book}:${b.firstChapter}`, { heb: b.heb, eng: b.eng });
  if (data.chapterLabel) chapterLabels.set(book, data.chapterLabel);
}
export const subBookAt = (book, chapter) => subBooks.get(`${book}:${chapter}`);
// [{ book, chapter, heb, eng }] in text order (bookmarks).
export const subBookList = () => [...subBooks].map(([k, v]) => {
  const [book, chapter] = k.split(':');
  return { book, chapter: Number(chapter), ...v };
});
export const chapterLabel = (book) => chapterLabels.get(book);

// Citation format: "Gen1:30", "1Sam3:4" (book may start with a digit). The
// book is matched case-insensitively and returned in tanach.json's spelling.
const bookByLower = new Map(books.map((b) => [b.short.toLowerCase(), b.short]));
export function parseCitation(cit) {
  const m = cit.match(/^(\d?[A-Za-z]+)(\d+):(\d+)$/);
  if (!m) throw new Error(`unparseable citation: ${cit}`);
  const book = bookByLower.get(m[1].toLowerCase());
  if (!book) throw new Error(`unknown book "${m[1]}" in ${cit}`);
  return { book, chapter: Number(m[2]), verse: Number(m[3]) };
}

// Weekly Torah portions, from parshiot.json next to tanach.json:
//   { torah_portions: [{ book: "Genesis", portions: [
//       { name_hebrew: "בראשית", start_verse: "Genesis 1:1", end_verse: "Genesis 6:8" }, ...] }] }
// Book names are tanach.json `name`s.
const PARSHIOT_FILE = path.join(WORK, '..', '..', 'parshiot.json');
function parsePortionVerse(s) {
  const m = s.match(/^(.+) (\d+):(\d+)$/);
  if (!m) throw new Error(`parshiot.json: unparseable verse "${s}"`);
  return { book: shortForName(m[1]), chapter: Number(m[2]), verse: Number(m[3]) };
}
const parshiot = fs.existsSync(PARSHIOT_FILE)
  ? readJson(PARSHIOT_FILE).torah_portions.flatMap((b) => b.portions.map((p, i) => ({
    name: p.name_hebrew,
    english: p.name,
    start: parsePortionVerse(p.start_verse),
    firstInBook: i === 0,
    from: citationKey(parsePortionVerse(p.start_verse)),
    to: citationKey(parsePortionVerse(p.end_verse)),
  })))
  : null;
export const parshiotAvailable = () => parshiot !== null;
// All portions in order: { name (Hebrew), english, start: {book, chapter, verse}, ... }.
export const portionList = () => parshiot ?? [];

const portionEndKeys = new Set((parshiot ?? []).map((p) => p.to));
export const isPortionEnd = (book, chapter, verse) => portionEndKeys.has(citationKey({ book, chapter, verse }));

// Header parasha for a page spanning first..last: the newest portion on the
// page, or '' when that is a book's first portion (its name is the book's).
export function headerParasha(first, last) {
  if (!parshiot) return '';
  const a = citationKey(first);
  const b = citationKey(last);
  const p = parshiot.filter((x) => x.from <= b && x.to >= a).at(-1);
  return p && !p.firstInBook ? p.name : '';
}

// boundary-words-final.json rows, keyed by page number.
export const pageRows = readJson(path.join(WORK, 'boundary-words-final.json')).rows ?? [];
export const rowByPage = new Map(pageRows.map((r) => [r.page, r]));
export const lastPageInData = Math.max(...pageRows.map((r) => r.page || 0));
export const rowIsComplete = (row) => Boolean(row?.first?.citation && row?.last?.citation);

// Pages left empty in the print (no text, no page number), from the
// "_blankPages" list in boundary-verdicts.json ("662|first" -> 662).
export const blankPages = new Set(Object.keys(readJson(path.join(WORK, 'boundary-verdicts.json'))._blankPages ?? {})
  .map((k) => Number(k.split('|')[0])));

// Section title pages (351, 661, 989; built by build-section-title.mjs): a page
// with a (failed) boundary row but no text, lying between a book's last verse
// and the next book's first verse. The blank pages next to them have no row.
// Returns the book that follows, or null for any other page.
const rowHasText = (row) => Boolean(row?.first?.citation || row?.last?.citation);
export function sectionTitleBook(p) {
  if (!rowByPage.has(p) || rowHasText(rowByPage.get(p)) || blankPages.has(p)) return null;
  let a = p - 1;
  while (a > 0 && !rowByPage.get(a)?.last?.citation) a -= 1;
  let b = p + 1;
  while (b <= lastPageInData && !rowByPage.get(b)?.first?.citation) b += 1;
  const last = rowByPage.get(a)?.last;
  const first = rowByPage.get(b)?.first;
  if (!last || !first) return null;
  const l = parseCitation(last.citation);
  const f = parseCitation(first.citation);
  const { chapters } = bookInfo(l.book);
  const endsBook = l.chapter === chapters.length && l.verse === chapters.at(-1);
  return endsBook && f.book !== l.book && f.chapter === 1 && f.verse === 1 ? f.book : null;
}
export const isSectionTitlePage = (p) => sectionTitleBook(p) !== null;

// One segment per chapter the page touches; first/last are partial.
// startPart/endPart are set when the page starts/ends inside a maqaf word.
export function segmentsFor(row) {
  const f = splitRef(row.first.n ?? 1);
  const l = row.last.n == null ? { word: null, part: null } : splitRef(row.last.n);
  const first = parseCitation(row.first.citation);
  const last = parseCitation(row.last.citation);
  const chapters = chaptersBetween(first, last);
  return chapters.map(({ book, chapter }, i) => ({
    book,
    chapter,
    startVerse: i === 0 ? first.verse : 1,
    startWordIdx: i === 0 ? f.word : 1,
    startPart: i === 0 ? f.part : null,
    endVerse: i === chapters.length - 1 ? last.verse : verseCount(book, chapter),
    endWordIdx: i === chapters.length - 1 ? l.word : null,
    endPart: i === chapters.length - 1 ? l.part : null,
  }));
}

// "node script.mjs [first] [last]" -> { startPage, endPage }.
export function pageRange(argv, defaultMax) {
  const [a, b] = argv.map(Number);
  const startPage = a || 1;
  const endPage = b || a || Math.min(defaultMax ?? lastPageInData, lastPageInData);
  return { startPage, endPage };
}
