// Generates pageN-body.tex and pageN-notes.tex from boundary-words-final.json,
// then fits chapter headings so no page overflows.
//
// Usage:  node build-body.mjs [firstPage] [lastPage]
//   no args   -> pages 1..MAX_PAGE_TO_GENERATE
//   one arg   -> just that page
//   two args  -> that range
// Runs from any working directory (all paths are resolved from this file).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  HERE, WORK, readJson, shortForName, loadChapter, toGematria,
  rowByPage, rowIsComplete, segmentsFor, pageRange, isPortionEnd, parshiotAvailable, blankPages, isSectionTitlePage,
  wordParts, partText, isMarkerWord, bookInfo, verseCount, isTorah, englishHead, subBookAt, chapterLabel,
} from './tanach-lib.mjs';

// ============================================================================
// CONFIG
// ============================================================================
// Highest page generated when no CLI range is given (null = every page).
const MAX_PAGE_TO_GENERATE = 21;
// Compile each page that has a chapter heading and shrink the heading if the
// page overflows. Needs pageN.tex (node create-page-config.js N) to exist.
const FIT_CHAPTER_HEADINGS = true;
// Ktiv/kri pair rendering (ktiv subscript + kri superscript) is on hold:
// false = print only the ktiv, as a regular word. true restores the pair.
const RENDER_KRI = false;
const KRI_API = 'http://localhost:8200/api/citation/v2';
// Four-line-blank book marker (װ, only at Exod-Deut 1:1 word 1). Disabled:
// those books open on a new page with a title header, so no blank is printed.
const RENDER_BOOK_MARKER = false;
// Line filling with wide letterforms (the font's jalt alternates): after a page
// fits, lines whose added interword space exceeds MAX_EXTRA_SPACE_LETTERS
// letter-widths (ב at body size) get wide letters - one per word, the last
// wide-capable letter, spread over the line - with the line breaks locked.
const JALT = true;
const MAX_EXTRA_SPACE_LETTERS = 3;
const JALT_LETTERS = 'אדהכלםרת';
const MAX_JALT_PER_LINE = 6;
// Lines with a setumah: the scan spreads their words and keeps the ס gap small
// (~0.5-1em a side), where \setumah's natural 3em gap leaves the words bunched
// (page 227, Num 6:23-27, the priestly blessing). Such a line's setumah gap
// beyond SETUMAH_TIGHT_GAP_EM a side counts as loose space; it gets wide
// letters from SETUMAH_LINE_CAP_LETTERS (letter-widths) of loose space on, and
// its setumot are then set with that fixed gap (\setumahtight).
const SETUMAH_TIGHT_GAP_EM = 0.75;
const SETUMAH_LINE_CAP_LETTERS = 0.5;
const BODY_EM_PT = 27; // body font size, \fontsize{27}{30.6pt}
// Song layouts (Exod 15, ...): line-by-line blocks transcribed from the scan.
const SONG_LAYOUTS = path.join(WORK, 'song-layouts.json');
// Petuchah / setumah where the scan differs from the corpus: marker word
// "Neh5:18#26" -> "none" (the scan runs on), "setumah" or "petuchah".
const SCAN_BREAKS = path.join(WORK, 'scan-breaks.json');
const SCAN_BREAK_LETTER = { none: 'ײ', petuchah: 'ײ', setumah: 'ױ' };
const scanBreaks = new Map();
for (const b of fs.existsSync(SCAN_BREAKS) ? readJson(SCAN_BREAKS).breaks : []) {
  const m = b.word.match(/^(\d?[A-Za-z]+\d+:\d+)#(\d+)$/);
  const [chapterVerse, n] = m ? [m[1], Number(m[2])] : [];
  const { book, chapter, verse } = m ? parseCitationLocal(chapterVerse) : {};
  const w = m && loadChapter(book, chapter).verses.find((x) => x.verse === verse)?.words[n - 1];
  if (!w || !isMarkerWord(w.ktiv) || !(b.scan in SCAN_BREAK_LETTER)) throw new Error(`scan-breaks.json: "${b.word}" is not a marker word, or bad scan value "${b.scan}"`);
  scanBreaks.set(b.word, b.scan);
}
function parseCitationLocal(cv) {
  const [, book, chapter, verse] = cv.match(/^(\d?[A-Za-z]+)(\d+):(\d+)$/);
  return { book, chapter: Number(chapter), verse: Number(verse) };
}
// Cut letter (reason 9 note "קטיעה": the vav of Num 25:12 שלום): \cutletter
// draws the stem with a gap at CUT_LETTER_AT above the baseline, CUT_LETTER_GAP
// high, the lower piece moved CUT_LETTER_SHIFT to the right.
const CUT_LETTER_AT = '0.30em';
const CUT_LETTER_GAP = '0.05em';
const CUT_LETTER_SHIFT = '0.06em';
// Spacing data of every built page (fit steps, vertical space, baseline gaps).
// Each build updates only its own pages' entries; the .md is regenerated from
// the .json every time.
const SPACING_REPORT_JSON = path.join(HERE, 'spacing-report.json');
const SPACING_REPORT_MD = path.join(HERE, 'spacing-report.md');
// ============================================================================

// ---------------------------------------------------------------------------
// Songs: "Exod15:1#9" / "Exod15:5#5.2" (maqaf part) -> what starts there:
// 'song' (first word), 'line' (a new scan line) or 'block'. songEnds holds each
// song's last word; the song's text after it continues as prose.
// ---------------------------------------------------------------------------
const songStarts = new Map();
const songEnds = new Set();
// Two-column songs (song-layouts.json `column`, Eccl 3:2-8): a line's second
// block starts at a fixed column, not flush left. Block key -> the column's
// right edge, as a fraction of the line width from the left edge.
const songColumns = new Map();
const songLeftStarts = new Set();   // line starts whose line has an empty first block
const songSpans = [];   // { chapter: "Ps18", from: [verse, word], to: [verse, word] }
// Is the word "Ps18:7#3" (maqaf part ignored) inside a song, first to last word?
function songContains(k) {
  const [chapter, rest] = k.split(':');
  const [verse, n] = rest.split(/[#.]/).map(Number);
  const cmp = (a) => verse - a[0] || n - a[1];
  return songSpans.some((s) => s.chapter === chapter && cmp(s.from) >= 0 && cmp(s.to) <= 0);
}
for (const song of fs.existsSync(SONG_LAYOUTS) ? readJson(SONG_LAYOUTS).songs : []) {
  const key = (ref) => {
    const m = ref.match(/^(\d+)#(\d+)(?:\.(\d+))?$/);
    if (!m) throw new Error(`song-layouts.json ${song.name}: bad ref "${ref}"`);
    const [verse, n, part] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 1)];
    const w = loadChapter(song.book, song.chapter).verses.find((v) => v.verse === verse)?.words[n - 1];
    if (!w || part > wordParts(w.ktiv).length) throw new Error(`song-layouts.json ${song.name}: no word ${ref} in ${song.book} ${song.chapter}`);
    const k = `${song.book}${song.chapter}:${verse}#${n}`;
    return part > 1 ? `${k}.${part}` : k;
  };
  // [verse, word, part] - blocks must run forward through the text.
  const order = (k) => k.split(':')[1].split(/[#.]/).map(Number).concat(1).slice(0, 3);
  const after = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  let prev = null;
  // An empty first block ("") leaves the right side of its line blank, so the
  // line's only block sits flush left (Esth 9:7, page 1199: "ואת" alone).
  song.lines.forEach((blocks, li) => blocks.forEach((ref, bi) => {
    if (ref === '') {
      if (bi !== 0 || blocks.length < 2) throw new Error(`song-layouts.json ${song.name}: an empty block must be the first of two or more`);
      return;
    }
    const k = key(ref);
    if (prev && after(order(k), order(prev)) <= 0) throw new Error(`song-layouts.json ${song.name}: ${ref} is not after the block before it`);
    const first = bi === 0 || (bi === 1 && blocks[0] === '');
    songStarts.set(k, first ? (li === 0 ? 'song' : 'line') : 'block');
    if (first && blocks[0] === '') songLeftStarts.add(k);
    if (song.column && bi === 1 && !first) songColumns.set(k, song.column);
    prev = k;
  }));
  songEnds.add(key(song.end));
  songSpans.push({ chapter: `${song.book}${song.chapter}`, from: order(key(song.lines[0].find((r) => r !== ''))), to: order(key(song.end)) });
}

// Marker words may carry a masora circle (a noted petuchah/setumah); the
// circle is printed on the פ/ס via the macro's optional argument.
function macroFor(word) {
  const marks = word.ktiv.slice(1);
  const opt = marks ? `[${marks}]` : '';
  if (word.ktiv[0] === 'ײ') return `\\petuchah${opt}{}`;
  if (word.ktiv[0] === 'ױ') return `\\setumah${opt}{}`;
  if (word.ktiv[0] === 'װ') return '\\parashabreak{}';
  return null;
}

// ---------------------------------------------------------------------------
// Masora notes (word_notes.json). Footnote text only - the kri text itself
// comes from the corpus API, never from these notes.
// ---------------------------------------------------------------------------
// citation "Gen1:21.3" -> [{ reasonId, note, indices }]. One entry per note
// (not per marked letter), so a note marking two letters is footnoted once.
// `indices` are 1-based positions counting Hebrew base letters only; empty
// for notes that mark no letter (e.g. "בלא פסקא").
// Reasons that are not printed: 14 = pronunciation override (reading metadata).
const UNPRINTED_REASONS = new Set([14]);
// Reason 15 = masora finalis: the summary after a book's last verse, printed
// as a block (\finalisblock), not a footnote. Keyed by verse ("Gen50:26"):
// a closing פ/ס marker after the noted word must not hide it.
const FINALIS_REASON = 15;
const finalisByVerse = new Map();
const notesByCitation = new Map();
const warnings = [];
const FINAL_TO_BASE = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
const DAGESH = 'ּ';
const seg = new Intl.Segmenter('he', { granularity: 'grapheme' });
const isLetterCluster = (cluster) => /[א-ת]/.test(cluster[0]);
for (const note of readJson(path.join(WORK, 'word_notes.json')).byReason.flatMap((r) => r.notes)) {
  if (UNPRINTED_REASONS.has(note.reasonId)) continue;
  if (note.reasonId === FINALIS_REASON) {
    finalisByVerse.set(`${shortForName(note.book)}${note.chapter}:${note.verse}`, note.note);
    continue;
  }
  const citation = `${shortForName(note.book)}${note.chapter}:${note.verse}.${note.wordnumber}`;
  if (!notesByCitation.has(citation)) notesByCitation.set(citation, []);
  notesByCitation.get(citation).push({
    reasonId: note.reasonId,
    note: note.note,
    indices: noteLetters(note, citation).map((m) => m.index),
  });
}

// `marked` lists every masora circle in the word, not just this note's (Isa56:10.1:
// the kri's circle on ו and the large צ's circle both appear on both notes). A
// typography note names its letter ("צ׳ רבתי"), so keep only the marked letters
// that match it; a note naming no letter, or naming one that isn't marked, keeps all.
// When the letter is marked more than once, the dagesh in the note's letter picks
// between them (Dan6:20.3 בִּשְׁפַ֯רְפָּ֯רָ֖א: "פּ׳ רבתי" = the second פ, "פ׳ זעירא" = the first).
function noteLetters(note, citation) {
  const marked = note.marked || [];
  if (note.reasonId !== 9) return marked;
  const m = note.note.match(/([א-ת])([֑-ׇ]*)׳\s*(?:רבתי|זעיר|קטיע|תלוי)/);
  const named = m?.[1];
  const base = (letter) => FINAL_TO_BASE[letter] ?? letter;
  let matching = named ? marked.filter((x) => base(x.letter) === base(named)) : [];
  if (matching.length > 1) {
    const letters = [...seg.segment(note.word)].map((s) => s.segment).filter(isLetterCluster);
    const byDagesh = matching.filter((x) => letters[x.index - 1]?.includes(DAGESH) === m[2].includes(DAGESH));
    if (byDagesh.length) matching = byDagesh;
  }
  if (matching.length > 1) warnings.push(`${citation}: "${note.note}" names ${named}, which is marked ${matching.length} times - applied to all`);
  return matching.length ? matching : marked;
}

// reasonId 9 (typography) is the only reason that changes a letter's shape:
// returns the macro call (without the letter) or null.
function letterMacroFor(note) {
  if (note.reasonId !== 9) return null;
  if (note.note.includes('רבתי')) return '\\largeletter';
  if (note.note.includes('זעיר')) return '\\smallletter';
  if (note.note.includes('תלוי')) return '\\hangletter';
  if (note.note.includes('קטיעה')) return `\\cutletter{${CUT_LETTER_AT}}{${CUT_LETTER_GAP}}{${CUT_LETTER_SHIFT}}`;
  return null;
}

// A hanging letter is raised and small, but the vowels and accents under it stay
// full size on the line (as in the scan): \hangletter{letter}{letter + marks
// above}{marks below}. The TeX macro sets the marks below on a carrier letter
// and clips the carrier away.
// Marks below: the below vowels (sheva..qubutz, meteg, qamatz qatan) and accents.
const MARK_BELOW = /[ְ-ָׇֻֽ֑֖֛֢֣֤֥֦֧֪֚֭]/;
function hangLetterTex(cluster) {
  const [letter, ...marks] = [...cluster];
  const above = marks.filter((c) => !MARK_BELOW.test(c)).join('');
  const below = marks.filter((c) => MARK_BELOW.test(c)).join('');
  return `\\hangletter{${letter}}{${letter}${above}}{${below}}`;
}

// ---------------------------------------------------------------------------
// Kri, from the corpus API (filled by preloadKri before any page is built).
// ---------------------------------------------------------------------------
const kriCache = new Map(); // "Gen1:21.3" -> kri text

async function preloadKri(book, chapter) {
  const res = await fetch(`${KRI_API}/${book}${chapter}`);
  if (!res.ok) throw new Error(`kri API returned ${res.status} for ${book}${chapter}`);
  const json = await res.json();
  for (const verse of json.result ?? []) {
    for (const word of verse.words ?? []) {
      if (word.kri) kriCache.set(`${book}${chapter}:${verse.citation.verse}.${word.wordNumber}`, word.kri);
    }
  }
}


// U+05AF (masora circle) is kept: it is the real printed footnote marker.
// Maqaf joins words with no space, so TeX needs an explicit break point.
const MAQAF = '־';
const addMaqafBreaks = (ktiv) => ktiv.replaceAll(MAQAF, `${MAQAF}\\allowbreak{}`);

// Returns the word's inline TeX and appends its \masoranote calls to notesOut.
function applyNotes(ktivPlain, citation, notesOut) {
  const marks = notesByCitation.get(citation);
  if (!marks) return addMaqafBreaks(ktivPlain);
  const citeFrag = citation.split(':')[1]; // "Gen1:1.1" -> "1.1"
  for (const mark of marks) notesOut.push(`\\masoranote{${citeFrag}}{${mark.note}}`);

  // Qere/Ketiv: ktiv as 3/4-size subscript, then a space, then kri as 3/4-size
  // superscript. Neither box gets \allowbreak (a break inside an atomic box
  // corrupts its bidi order). Source order is KRI then KTIV because the bidi
  // engine mirrors two adjacent raised boxes - this reads ktiv-then-kri.
  if (RENDER_KRI && marks.some((m) => m.reasonId === 1)) {
    const kri = kriCache.get(citation);
    if (kri) return `\\qerisup{${kri}} \\qerisub{${ktivPlain.replace(/֯/g, '')}}`;
    warnings.push(`${citation}: Qere/Ketiv note but the API has no kri - rendered as plain word`);
  }

  const clusters = [...seg.segment(ktivPlain)].map((s) => s.segment);
  let letterN = 0;
  for (let i = 0; i < clusters.length; i += 1) {
    if (!isLetterCluster(clusters[i])) continue;
    letterN += 1;
    for (const mark of marks) {
      const macro = mark.indices.includes(letterN) && letterMacroFor(mark);
      if (macro === '\\hangletter') clusters[i] = hangLetterTex(clusters[i]);
      else if (macro) clusters[i] = `${macro}{${clusters[i]}}`;
    }
  }
  return addMaqafBreaks(clusters.join(''));
}

// ---------------------------------------------------------------------------
// Page assembly
// ---------------------------------------------------------------------------
// A segment opens a chapter when it starts at the start of its first word.
const opensChapter = (s) => s.startVerse === 1 && s.startWordIdx === 1 && (s.startPart ?? 1) === 1;

// Fit levels, tried in order until the page fits on one page:
//   0 = full-size chapter heading and end-of-portion line
//   1 = small heading and small end-of-portion line
//   2 = small heading, end-of-portion marker inline at the end of the last line
const FIT_LEVELS = ['full-size headings', 'small headings', 'small headings + inline end-of-portion marker'];
// After those, letters are narrowed step by step (fontspec FakeStretch); capped at 6%
// (page 97, Exod 6, needs 6%).
const CONDENSE_STEPS = [0.99, 0.98, 0.97, 0.96, 0.95, 0.94];
// A page that fits but ends mid-paragraph with one word alone on its last line
// steps through the same narrowing until the word joins the line above (page
// 972, Zech 6:2 הָרִאשֹׁנָה: the scan's last line was 1.5pt too wide for us).
const PULL_UP_LONE_LAST_WORD = true;
// First fit step of all: no extra space between paragraphs (\parskip 0, as in
// the scan) - every petuchah/heading break otherwise adds 1mm, a whole line on
// pages with many petuchot (Gen 49, page 85).
const TIGHT_PARAGRAPHS = true;
const tightPages = new Set();
// Last fit step, after narrowing: every line exactly one \baselineskip apart
// (\strictleading). Lines with tall accent stacks are otherwise pushed apart by
// \lineskip (31.5-34.5pt instead of 30.6pt), which costs a whole line on a dense
// page (page 216, Num 1:37-54: 28 lines needed, only 27 fit).
const STRICT_LEADING = true;
const strictPages = new Set();

function sedrahEnd(letter, opt, fit) {
  if (fit === 2) return `\\${letter === 'ס' ? 'sedrahendinlineclosed' : 'sedrahendinlineopen'}${opt}`;
  return `\\${fit === 1 ? 'sedrahendsmall' : 'sedrahend'}${opt}{${letter}}`;
}

// A masora finalis line that is just "חזק" (finalisLines): full or small size.
function chazakLine(fit) {
  return fit >= 1 ? '\\chazaksmall' : '\\chazak';
}

// Masora finalis note -> TeX lines. The note's lines ("\n", stored as a
// literal backslash-n) are the scan's lines; **...** = large type. A line that
// is just "חזק" uses the חזק line (never inline: it sits under the notes).
function finalisLines(note, fit) {
  return note.split('\\n').map((line) => {
    const tex = line.trim().replace(/\*\*(.+?)\*\*/g, '\\finalisbig{$1}');
    if (tex === 'חזק') return chazakLine(fit);
    if (/^חזק(\s|$)/.test(tex)) return `\\finalischazak{${tex}}`;
    return `\\finalisline{${tex}}`;
  }).join('\n');
}

function buildRange(segments, pageNum, fit) {
  const smallHeadings = fit >= 1;
  const pieces = [];
  const notes = [];
  let pendingCircle = false; // masora circle of an unrendered book marker
  for (const s of segments) {
    // The book's masora finalis (it carries its own חזק line, if the scan has
    // one), printed even when the next book starts further down the page. A
    // book with no finalis note gets no חזק.
    const finalisAt = (v) => finalisByVerse.get(`${s.book}${s.chapter}:${v.verse}`);
    const bookEndAt = (v) => finalisAt(v) !== undefined;
    const bookEndPiece = (v) => ({ text: `\\finalisblock{${finalisLines(finalisAt(v), fit)}}`, sep: '\n' });
    if (opensChapter(s)) {
      // A sub-book (the five books of Psalms, psalms-books.json) opening here:
      // its title goes before the chapter heading (after the book title at Ps 1).
      const subBook = subBookAt(s.book, s.chapter);
      const subBookPiece = subBook && { text: `\\${smallHeadings ? 'subbooktitlesmall' : 'subbooktitle'}{${subBook.heb}}{${subBook.eng}}`, sep: '\n' };
      if (subBookPiece && s.chapter !== 1) pieces.push(subBookPiece);
      if (s.chapter === 1) {
        // A book opening at the top of the page gets the title header (page-master.tex).
        // A book opening further down the page gets an in-text title.
        if (s !== segments[0]) {
          const cmd = smallHeadings ? 'midbooktitlesmall' : 'midbooktitle';
          pieces.push({ text: `\\${cmd}{${bookInfo(s.book).hebbook}}{${englishHead(s.book)}}`, sep: '\n' });
        }
        if (subBookPiece) pieces.push(subBookPiece);
      } else {
        const gem = toGematria(s.chapter);
        const cmd = smallHeadings ? 'chapheadingsmall' : 'chapheading';
        // Psalms: "Psalm 42" in place of "Cap. 42" (psalms-books.json chapterLabel).
        const label = chapterLabel(s.book);
        pieces.push({ text: `\\${cmd}${label ? `[${label}]` : ''}{${s.chapter}}{${gem}}\\chapnum{${gem}}`, sep: '\n' });
      }
    }
    for (const v of loadChapter(s.book, s.chapter).verses) {
      if (v.verse < s.startVerse || v.verse > s.endVerse) continue;
      let wordStart = v.verse === s.startVerse ? s.startWordIdx : 1;
      // A book marker (װ) before the page's first word belongs to this page
      // (boundary data names only real words, e.g. Exod1:1 starts at #2).
      while (wordStart > 1 && v.words[wordStart - 2].ktiv[0] === 'װ') wordStart -= 1;
      let wordEnd = v.verse === s.endVerse && s.endWordIdx ? s.endWordIdx : v.words.length;
      // Boundary data names the last real word; a פ/ס marker after it (e.g.
      // Gen9:17 #13) belongs to this page, or no page would print it.
      const endsWhole = v.verse === s.endVerse && s.endPart ? s.endPart === wordParts(v.words[wordEnd - 1].ktiv).length : true;
      if (endsWhole) while (wordEnd < v.words.length && isMarkerWord(v.words[wordEnd].ktiv)) wordEnd += 1;
      // Last verse of a weekly portion: its closing break becomes the
      // "פ פ פ" / "ס ס ס" line (no break at all, e.g. book end -> פ פ פ).
      const portionEnd = isPortionEnd(s.book, s.chapter, v.verse);
      const lastWord = v.words.at(-1);
      for (const corpusW of v.words.slice(wordStart - 1, wordEnd)) {
        const citation = `${s.book}${s.chapter}:${v.verse}.${corpusW.n}`;
        // The scan's own break where it differs from the corpus (scan-breaks.json).
        const scanBreak = scanBreaks.get(`${s.book}${s.chapter}:${v.verse}#${corpusW.n}`);
        const w = scanBreak ? { ...corpusW, ktiv: SCAN_BREAK_LETTER[scanBreak] + corpusW.ktiv.slice(1) } : corpusW;
        if (scanBreak === 'none') {
          for (const m of notesByCitation.get(citation) ?? []) notes.push(`\\masoranote{${citation.split(':')[1]}}{${m.note}}`);
          if (w.ktiv.includes('֯')) pendingCircle = true;
          continue;
        }
        const marker = macroFor(w);
        // Unrendered book marker: no blank lines, but a noted marker keeps its
        // footnote, and its masora circle goes just before the next word.
        if (!RENDER_BOOK_MARKER && w.ktiv[0] === 'װ') {
          for (const m of notesByCitation.get(citation) ?? []) notes.push(`\\masoranote{${citation.split(':')[1]}}{${m.note}}`);
          if (w.ktiv.includes('֯')) pendingCircle = true;
          continue;
        }
        if (marker) {
          for (const m of notesByCitation.get(citation) ?? []) notes.push(`\\masoranote{${citation.split(':')[1]}}{${m.note}}`);
          if (bookEndAt(v) && w === lastWord) {
            pieces.push(bookEndPiece(v));
          } else if (portionEnd && w === lastWord) {
            const letter = w.ktiv[0] === 'ױ' ? 'ס' : 'פ';
            const opt = w.ktiv.slice(1) ? `[${w.ktiv.slice(1)}]` : '';
            pieces.push({ text: sedrahEnd(letter, opt, fit), sep: '\n' });
          } else {
            pieces.push({ text: marker, sep: '\n' });
          }
          continue;
        }
        const wordNotes = [];
        let ktiv = applyNotes(w.ktiv, citation, wordNotes);
        // Maqaf word split across the page turn: print only this page's part.
        const endHalf = s.endPart && v.verse === s.endVerse && w.n === s.endWordIdx;
        const startHalf = s.startPart && v.verse === s.startVerse && w.n === s.startWordIdx;
        let keepNotes = true;
        if (endHalf || startHalf) {
          const edge = endHalf ? 'last' : 'first';
          const part = endHalf ? s.endPart : s.startPart;
          const texParts = ktiv.split(/(?<=־\\allowbreak\{\})/);
          if (texParts.length !== wordParts(w.ktiv).length) {
            // Qere/Ketiv pair: an atomic box that cannot be split - print it whole on the first page.
            warnings.push(`page ${pageNum}: ${citation} is split across pages but cannot be divided - printed whole on the earlier page`);
            if (edge === 'first') continue;
          } else {
            ktiv = (edge === 'last' ? texParts.slice(0, part) : texParts.slice(part - 1)).join('');
            // Footnotes go with the part carrying the masora circle (first part if none is marked).
            keepNotes = w.ktiv.includes('֯') ? partText(w.ktiv, part, edge).includes('֯') : edge === 'last';
          }
        }
        if (keepNotes) notes.push(...wordNotes);
        if (pendingCircle) {
          ktiv = `\\masoracircle{}${ktiv}`;
          pendingCircle = false;
        }
        // Verse 1 never carries a printed number in this edition; nor does the
        // continuation of a word whose start was on the previous page.
        // The verse's first real word: a verse may open with a פ/ס marker
        // (Esth 9:7, 2Chr 35:25), which never carries the number.
        const firstReal = v.words.slice(0, w.n - 1).every((x) => isMarkerWord(x.ktiv));
        const showVnum = firstReal && v.verse !== 1 && !(startHalf && s.startPart > 1);
        pieces.push({
          text: showVnum ? `\\vnum{${v.verse}}${ktiv}` : ktiv,
          sep: ' ',
          word: { pre: showVnum ? `\\vnum{${v.verse}}` : '', tex: ktiv },
          ref: { key: `${s.book}${s.chapter}:${v.verse}#${w.n}`, firstPart: startHalf ? s.startPart : 1 },
        });
        // A portion that ends with no פ/ס at all gets the "פ פ פ" line only at
        // the end of a book. Mid-book (only Vayigash -> Vayechi, Gen47:27) the
        // line just ends and the next portion starts on a new line - no marker.
        if (bookEndAt(v) && w === lastWord && !endHalf) {
          pieces.push(bookEndPiece(v));
        } else if (portionEnd && w === lastWord && !endHalf) {
          const bookEnd = s.chapter === bookInfo(s.book).chapters.length && v.verse === verseCount(s.book, s.chapter);
          pieces.push({ text: bookEnd ? sedrahEnd('פ', '', fit) : '\\portionbreak{}', sep: '\n' });
        }
      }
    }
  }
  if (songStarts.size) layOutSongs(pieces);
  // A setumah ending the page has nothing to keep its gap from.
  const lastPiece = pieces.at(-1);
  if (lastPiece?.text.startsWith('\\setumah')) lastPiece.text = lastPiece.text.replace('\\setumah', '\\setumahpageend');
  // A setumah right before something that ends the paragraph (chapter heading,
  // portion-end line, ...) leaves the rest of its line open, like a petuchah,
  // so its ס goes in the middle of that space.
  const endsParagraph = /^\\(chapheading|midbooktitle|subbooktitle|sedrahend(?!inline)|chazak(?!inline)|portionbreak|songstart|finalisblock)/;
  pieces.forEach((p, i) => {
    if (/^\\setumah[[{]/.test(p.text) && endsParagraph.test(pieces[i + 1]?.text ?? '')) p.text = p.text.replace('\\setumah', '\\setumahopen');
  });
  const body = renderBody(pieces);
  // Highest fit level that changes anything on this page.
  const maxFit = body.includes('\\sedrahend') || body.includes('\\chazak') ? 2 : body.includes('\\chapheading') || body.includes('\\midbooktitle') || body.includes('\\subbooktitle') ? 1 : 0;
  return { pieces, body, notes, maxFit };
}

// Song lines: each scan line is forced onto its own line (\songbreak), its
// blocks pushed apart by \songgap (\hfill), so a line of 2 blocks sits flush
// right + flush left and a line of 3 has its middle block between them. A song
// word whose maqaf parts fall on two scan lines is split into two pieces.
// Nothing is inserted before the page's first piece (a \break in vertical
// mode would be a page break) or after its last one (it would leave an empty line).
// Petuchot / setumot inside a song are ignored: they are the text's makeshift
// song layout (Ps 18 marks every block with a setumah), which the scan layout
// replaces - kept, their gaps pushed the widest lines over (page 1000, Ps 18:35).
// A noted one keeps its footnote (already collected) and its masora circle.
// A page that starts mid-song (no 'song' start on it) is in the song from its
// first piece.
function layOutSongs(pieces) {
  const firstRef = pieces.find((p) => p.ref)?.ref;
  let inSong = firstRef ? songContains(firstRef.key) : false;
  let columnOpen = false;   // inside a \songcolumn box (two-column songs)
  for (let i = 0; i < pieces.length; i += 1) {
    const p = pieces[i];
    if (!p.ref) {
      const marker = inSong && p.text.match(/^\\(?:setumah|petuchah)(\[[^\]]*\])?\{\}$/);
      if (marker) {
        if (marker[1]) p.text = '\\masoracircle{}';
        else { pieces.splice(i, 1); i -= 1; }
      }
      continue;
    }
    if (songStarts.get(p.ref.key) === 'song') inSong = true;
    if (songEnds.has(p.ref.key)) inSong = false;
    // Split off the parts from the first later part that starts a block.
    const parts = p.word.tex.split(MAQAF_SPLIT);
    const k = parts.findIndex((_, j) => j > 0 && songStarts.has(`${p.ref.key}.${p.ref.firstPart + j}`));
    if (k > 0) {
      const head = parts.slice(0, k).join('');
      const rest = parts.slice(k).join('');
      pieces.splice(i + 1, 0, { text: rest, sep: p.sep, word: { pre: '', tex: rest }, ref: { ...p.ref, firstPart: p.ref.firstPart + k } });
      Object.assign(p, { text: p.word.pre + head, sep: '', word: { ...p.word, tex: head } });
    }
    const blockKey = p.ref.firstPart > 1 ? `${p.ref.key}.${p.ref.firstPart}` : p.ref.key;
    const kind = songStarts.get(blockKey);
    if (kind && columnOpen) {
      pieces.splice(i, 0, { text: '\\songcolumnend{}', sep: '' });
      i += 1;
      columnOpen = false;
    }
    // Outside the Torah, פ/ס markers right before the song's first word are
    // dropped (a noted one keeps its circle): \songstart already ends the line
    // before ragged, and a second marker only left an empty line the scan
    // doesn't have (Esth 9:6-7, page 1199: ײ then ױ).
    if (kind === 'song' && !isTorah(p.ref.key.match(/^\d?[A-Za-z]+/)[0])) {
      for (let j = i - 1; j >= 0; j -= 1) {
        const m = pieces[j].text.match(/^\\(?:setumah|petuchah)(\[[^\]]*\])?\{\}$/);
        if (!m) break;
        if (m[1]) pieces[j].text = '\\masoracircle{}';
        else { pieces.splice(j, 1); i -= 1; }
      }
    }
    if (kind && i > 0) {
      const column = kind === 'block' && songColumns.get(blockKey);
      const left = songLeftStarts.has(blockKey) ? '\\songemptyblock{}' : '';
      const text = column ? `\\songcolumn{${column}}` : kind === 'song' ? `\\songstart{}${left}` : kind === 'line' ? `\\songbreak{}${left}` : '\\songgap{}';
      pieces.splice(i, 0, { text, sep: '' });
      i += 1;
      if (column) columnOpen = true;
    }
    if (songEnds.has(p.ref.key) && columnOpen) {
      pieces.splice(i + 1, 0, { text: '\\songcolumnend{}', sep: '' });
      i += 1;
      columnOpen = false;
    }
    // Outside the Torah a פ/ס right after the song's last word is dropped (a
    // noted one keeps its circle): no letter is printed there, so it would only
    // leave an empty line, which the scan doesn't have - the song's last line
    // already ends it (Eccl 3:8, page 1177). In the Torah its פ line stays (Deut 32:43, page 347).
    const next = pieces[i + 1];
    const endMarker = songEnds.has(p.ref.key) && !isTorah(p.ref.key.match(/^\d?[A-Za-z]+/)[0])
      && next?.text.match(/^\\(?:setumah|petuchah)(\[[^\]]*\])?\{\}$/);
    if (endMarker) {
      if (endMarker[1]) next.text = '\\masoracircle{}';
      else pieces.splice(i + 1, 1);
    }
    // After the song's last word the rest of its verse starts a new line, as prose.
    if (songEnds.has(p.ref.key) && !p.word.tex.endsWith('\\allowbreak{}') && i < pieces.length - 1) {
      pieces.splice(i + 1, 0, { text: '\\songbreak{}', sep: '' });
      i += 1;
    }
  }
  // A page ending inside a column block closes it.
  if (columnOpen) pieces.push({ text: '\\songcolumnend{}', sep: '' });
}

// ---------------------------------------------------------------------------
// Line filling (JALT)
// ---------------------------------------------------------------------------
// Word pieces are split into tokens at maqaf break points (a line can end
// inside a maqaf word); tokens are numbered in page order, identically in
// every pass. mode 'measure' wraps tokens in \wb/\we position marks;
// plan = { wide: Map(token -> letter index), breaks: Set(token) }.
const MAQAF_SPLIT = /(?<=־\\allowbreak\{\})/;
function renderBody(pieces, mode = null, plan = null) {
  let t = 0;
  return pieces.map((p, i) => {
    let text = p.text;
    if (plan?.tightSetumot.has(i)) text = text.replace(SETUMAH_PIECE, (_, opt) => `\\setumahtight${opt ?? ''}{${SETUMAH_TIGHT_GAP_EM}em}`);
    if (p.word && (mode || plan)) {
      text = p.word.pre + p.word.tex.split(MAQAF_SPLIT).map((part) => {
        const id = t;
        t += 1;
        let out = plan?.wide.has(id) ? widen(part, plan.wide.get(id)) : part;
        if (mode === 'measure') {
          const brk = out.endsWith('\\allowbreak{}') ? '\\allowbreak{}' : '';
          out = `\\wb{${id}}${brk ? out.slice(0, -brk.length) : out}\\we{${id}}${brk}`;
        }
        return plan?.breaks.has(id) ? `${out}\\break{}` : out;
      }).join('');
    }
    return text + (i < pieces.length - 1 ? p.sep : '');
  }).join('');
}

// Hebrew combining marks that stay with their letter (points, te'amim, masora
// circle) - not maqaf, paseq, sof pasuq or nun hafukha.
const COMBINING = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/;
// Index of the last wide-capable letter at brace depth 0 (outside size macros
// and other commands), or -1.
function wideLetterAt(tex) {
  let depth = 0;
  let found = -1;
  for (let i = 0; i < tex.length; i += 1) {
    const c = tex[i];
    if (c === '\\') {
      while (i + 1 < tex.length && /[A-Za-z]/.test(tex[i + 1])) i += 1;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (depth === 0 && JALT_LETTERS.includes(c)) found = i;
  }
  return found;
}
function widen(tex, at) {
  let end = at + 1;
  while (end < tex.length && COMBINING.test(tex[end])) end += 1;
  return `${tex.slice(0, at)}\\wide{${tex.slice(at, end)}}${tex.slice(end)}`;
}

// pageN.pos -> { space, unit, letters: {ה: [w, wide]}, tokens: Map(id -> {b, e, y}) }, in sp.
const SP = (s) => Math.round(parseFloat(s) * 65536);
function readPositions(pageNum) {
  const out = { letters: {}, tokens: new Map() };
  for (const line of fs.readFileSync(path.join(HERE, `page${pageNum}.pos`), 'utf8').split(/\r?\n/)) {
    const f = line.trim().split(/\s+/);
    if (f[0] === 'space') out.space = SP(f[1]);
    else if (f[0] === 'unit') out.unit = SP(f[1]);
    else if (f[0] === 'letter') out.letters[f[1]] = [SP(f[2]), SP(f[3])];
    else if (f[0] === 'b' || f[0] === 'e') {
      const tok = out.tokens.get(Number(f[1])) ?? {};
      tok[f[0]] = Number(f[2]);
      tok.y = Number(f[3]);
      out.tokens.set(Number(f[1]), tok);
    }
  }
  return out;
}

// Token metadata in page order: its piece, whether a stretchable space (not a
// maqaf) precedes it, and the index of its wide-capable letter (-1 if none).
function tokenList(pieces) {
  const list = [];
  pieces.forEach((p, pi) => {
    if (!p.word) return;
    p.word.tex.split(MAQAF_SPLIT).forEach((part, k) => {
      const prev = list.at(-1);
      list.push({
        piece: pi,
        spaced: k === 0 && Boolean(prev) && prev.piece === pi - 1 && pieces[pi - 1].sep === ' ',
        at: wideLetterAt(part),
        part,
      });
    });
  });
  return list;
}

// Index of the setumah piece between word pieces a and b, or -1.
const SETUMAH_PIECE = /^\\setumah(\[[^\]]*\])?\{\}/;
function setumahBetween(pieces, a, b) {
  for (let i = a + 1; i < b; i += 1) if (SETUMAH_PIECE.test(pieces[i].text)) return i;
  return -1;
}

// Choose wide letters and locked breaks from a measure pass.
function planJalt(pieces, pos) {
  const toks = tokenList(pieces);
  const lines = new Map(); // y -> [token ids]
  toks.forEach((_, id) => {
    const p = pos.tokens.get(id);
    if (!p || p.b == null || p.e == null) return;
    if (!lines.has(p.y)) lines.set(p.y, []);
    lines.get(p.y).push(id);
  });
  const cap = MAX_EXTRA_SPACE_LETTERS * pos.unit;
  // Line end of the text block (Hebrew: the left edge = smallest word-end x).
  const lineEnd = Math.min(...[...pos.tokens.values()].map((t) => t.e).filter((x) => x != null));
  const tightGap = SETUMAH_TIGHT_GAP_EM * BODY_EM_PT * PT;
  const tightSetumot = new Set(); // piece indexes set as \setumahtight
  const wide = new Map();
  let linesFilled = 0;
  for (const ids of lines.values()) {
    ids.sort((a, b) => a - b);
    // excess = what justification added to the spaces between words
    let excess = 0;
    const lineSetumot = [];
    for (let k = 1; k < ids.length; k += 1) {
      if (ids[k] !== ids[k - 1] + 1) continue;
      const gap = Math.abs(pos.tokens.get(ids[k - 1]).e - pos.tokens.get(ids[k]).b);
      if (toks[ids[k]].spaced) excess += gap - pos.space;
      else {
        const s = setumahBetween(pieces, toks[ids[k - 1]].piece, toks[ids[k]].piece);
        if (s < 0) continue;
        // all but the ס (about one letter) and a tight gap on each side
        excess += Math.max(0, gap - pos.unit - 2 * tightGap);
        lineSetumot.push(s);
      }
    }
    // A setumah ending the line (more text follows on the next line): the
    // space from the last word to the line end, less the ס and one tight gap.
    const last = ids.at(-1);
    const endS = toks[last + 1] ? setumahBetween(pieces, toks[last].piece, toks[last + 1].piece) : -1;
    if (endS >= 0) {
      excess += Math.max(0, Math.abs(pos.tokens.get(last).e - lineEnd) - pos.unit - tightGap);
      lineSetumot.push(endS);
    }
    const excess0 = excess;
    const lineCap = lineSetumot.length ? SETUMAH_LINE_CAP_LETTERS * pos.unit : cap;
    if (excess <= lineCap) continue;
    for (const s of lineSetumot) tightSetumot.add(s);
    // candidates spread over the line: alternate from both ends inward
    const cands = ids.filter((id) => toks[id].at >= 0);
    const order = [];
    for (let a = 0, b = cands.length - 1; a <= b; a += 1, b -= 1) {
      order.push(cands[a]);
      if (a !== b) order.push(cands[b]);
    }
    let used = 0;
    for (const id of order) {
      if (excess <= lineCap || used >= MAX_JALT_PER_LINE) break;
      const [w, ww] = pos.letters[toks[id].part[toks[id].at]] ?? [0, 0];
      const gain = ww - w;
      if (!(gain > 0) || gain > excess) continue; // unmeasured, or more than the line can absorb
      wide.set(id, toks[id].at);
      excess -= gain;
      used += 1;
    }
    if (used) linesFilled += 1;
    if (process.env.JALT_DEBUG) console.log(`  line y=${ids.length && pos.tokens.get(ids[0]).y} [${toks[ids[0]].part.slice(0, 8)} .. ${toks[ids.at(-1)].part.slice(0, 8)}] setumot=${lineSetumot.length}: ${ids.length} parts, extra space ${(excess0 / pos.unit).toFixed(1)} -> ${(excess / pos.unit).toFixed(1)} letter-widths, ${used} wide`);
  }
  if (!wide.size && !tightSetumot.size) return null;
  // Lock every line break that falls between two consecutive tokens of the
  // running text, so widening can't reflow it.
  const breaks = new Set();
  for (const ids of lines.values()) {
    const last = ids.at(-1);
    const next = pos.tokens.get(last + 1);
    if (!next || next.y === pos.tokens.get(last).y || !toks[last + 1]) continue;
    const t = toks[last + 1];
    if (t.piece === toks[last].piece || (t.spaced && t.piece === toks[last].piece + 1)) breaks.add(last);
  }
  return { wide, breaks, linesFilled, tightSetumot };
}

// Line assignment of every token, to confirm a locked layout didn't reflow.
const lineKey = (pos) => [...pos.tokens.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t.y).join(',');

// The notes file redefines \pagefootnotes because the footer expands it at shipout.
// `stretch` < 1 narrows the body's letters (\condensebody) as a last resort.
function writePage(pageNum, segments, fit, stretch = 1, mode = null, plan = null) {
  const { pieces, body: plain, notes, maxFit } = buildRange(segments, pageNum, fit);
  const body = mode || plan ? renderBody(pieces, mode, plan) : plain;
  // פ/ס letters are printed only in the Torah (preamble-common.tex \breakletter);
  // elsewhere the gaps stay and the letters are left out.
  const torah = segments.map((s) => isTorah(s.book));
  if (torah.some((t) => t !== torah[0])) throw new Error(`page ${pageNum} mixes Torah and non-Torah text - \\breakletters is set per page`);
  const prefix = (torah[0] ? '' : '\\breaklettersfalse\n')
    + (tightPages.has(pageNum) ? '\\setlength{\\parskip}{0pt}\n' : '')
    + (strictPages.has(pageNum) ? '\\strictleading\n' : '')
    + (stretch < 1 ? `\\condensebody{${stretch}}\n` : '')
    + (mode === 'measure' ? `\\posopen\\posmetrics{${JALT_LETTERS}}\n` : '');
  fs.writeFileSync(path.join(HERE, `page${pageNum}-body.tex`), prefix + body, 'utf8');
  // A note's **...** part is printed under the notes in large type (\footverses).
  const verses = [];
  const noteTex = notes.map((n) => n.replace(/\s*\*\*(.+?)\*\*/g, (_, v) => { verses.push(`\\footverses{${v.trim()}}`); return ''; }));
  fs.writeFileSync(path.join(HERE, `page${pageNum}-notes.tex`),
    `\\renewcommand{\\pagefootnotes}{${noteTex.join('')}}\n${verses.length ? `\\renewcommand{\\pagefootverses}{${verses.join('')}}\n` : ''}`, 'utf8');
  return { maxFit, pieces };
}

// Body height of the last compile (the SPACING line page-master.tex logs), pt.
const bodyHeight = (pageNum) => Number(fs.readFileSync(path.join(HERE, `page${pageNum}.log`), 'utf8').match(/^SPACING goal=[\d.]+pt total=([\d.]+)pt/m)?.[1] ?? NaN);

const overfullLines = (pageNum) => (fs.readFileSync(path.join(HERE, `page${pageNum}.log`), 'utf8').match(/^Overfull \\hbox/gm) ?? []).length;

// Measure the fitted page, plan wide letters, set them with locked breaks and
// verify (still one page, no new overfull line, no reflow); otherwise the
// plain page is kept.
function fillLines(pageNum, segments, fit, stretch) {
  const { pieces } = writePage(pageNum, segments, fit, stretch, 'measure');
  const plainOK = compiledPageCount(pageNum) === 1;
  const overBefore = overfullLines(pageNum);
  const pos = plainOK ? readPositions(pageNum) : null;
  const plan = pos ? planJalt(pieces, pos) : null;
  if (plan) {
    writePage(pageNum, segments, fit, stretch, 'measure', plan);
    const ok = compiledPageCount(pageNum) === 1 && overfullLines(pageNum) <= overBefore
      && lineKey(readPositions(pageNum)) === lineKey(pos);
    // The marks split the font's shaping runs (e.g. across a maqaf), so a
    // locked line can come out wider without them: check the real page too.
    // Such a line either overflows (overfull) or is broken again before its
    // last word, which then stands alone (page 241, Num 13:26 "הארץ׃") - that
    // shows as more body height than the measured page.
    if (ok) {
      const measured = bodyHeight(pageNum);
      writePage(pageNum, segments, fit, stretch, null, plan);
      if (compiledPageCount(pageNum) === 1 && overfullLines(pageNum) <= overBefore
        && !(bodyHeight(pageNum) > measured + 0.01)) return plan;
    }
    warnings.push(`page ${pageNum}: wide letters reflowed or overflowed the page - left without them`);
  }
  writePage(pageNum, segments, fit, stretch);
  return null;
}

// Measure pass: { count, lone } - lone = the page ends mid-paragraph and its
// last line holds a single word (maqaf parts of one word count as one) that
// continues the line above. A word opening a new paragraph (after a petuchah,
// page 1283) can't be pulled up and doesn't count.
function loneLastWord(pageNum, segments, fit, stretch) {
  const { pieces } = writePage(pageNum, segments, fit, stretch, 'measure');
  const count = compiledPageCount(pageNum);
  const prev = pieces.at(-2);
  if (count !== 1 || !pieces.at(-1)?.word || !prev?.word || prev.sep !== ' ') return { count, lone: false };
  const toks = tokenList(pieces);
  const pos = readPositions(pageNum);
  const lastY = pos.tokens.get(toks.length - 1)?.y;
  if (lastY == null) return { count, lone: false };
  const onLast = new Set(toks.map((t, id) => (pos.tokens.get(id)?.y === lastY ? t.piece : null)).filter((p) => p !== null));
  return { count, lone: onLast.size === 1 };
}

// Typesets pageN.tex (no PDF, so an open viewer can't interfere) and returns
// its page count; null if there is no config. Throws if TeX produced nothing.
function compiledPageCount(pageNum) {
  if (!fs.existsSync(path.join(HERE, `page${pageNum}.tex`))) return null;
  spawnSync('xelatex', ['-interaction=nonstopmode', '-no-pdf', `page${pageNum}.tex`], { cwd: HERE, encoding: 'utf8' });
  const log = fs.readFileSync(path.join(HERE, `page${pageNum}.log`), 'utf8');
  const m = log.match(/Output written on .*?\((\d+) pages?/);
  if (!m) throw new Error(`page ${pageNum}: xelatex produced no output - see page${pageNum}.log`);
  return Number(m[1]);
}

// ---------------------------------------------------------------------------
// Spacing report
// ---------------------------------------------------------------------------
const PT = 65536; // sp per pt
const round2 = (x) => Math.round(x * 100) / 100;

// One page's spacing record. Vertical figures come from the final run's log
// (the SPACING line page-master.tex writes); baseline gaps from this build's
// position marks (pageN.pos, written by the wide-letter measure pass - absent
// when the page overflowed or JALT is off).
function spacingRecord(pageNum, { count, fit, stretch, jalt, builtAfter }) {
  const log = fs.readFileSync(path.join(HERE, `page${pageNum}.log`), 'utf8');
  const m = log.match(/^SPACING goal=([\d.]+)pt total=([\d.]+)pt baselineskip=([\d.]+)pt/m);
  const rec = {
    built: new Date().toISOString().slice(0, 19).replace('T', ' '),
    pdfPages: count,
    steps: {
      noParagraphGaps: tightPages.has(pageNum),
      fitLevel: FIT_LEVELS[fit],
      narrowedPercent: Math.round((1 - stretch) * 100),
      strictLeading: strictPages.has(pageNum),
    },
    wideLetters: jalt ? jalt.wide.size : 0,
    linesFilled: jalt ? jalt.linesFilled : 0,
  };
  if (m) {
    const [goal, total, skip] = m.slice(1).map(Number);
    // An empty last page reports goal = \maxdimen (16383.99998pt).
    rec.vertical = goal < 16000
      ? { baselineskipPt: skip, goalPt: round2(goal), usedPt: round2(total), slackPt: round2(goal - total) }
      : { baselineskipPt: skip };
  }
  const posFile = path.join(HERE, `page${pageNum}.pos`);
  if (count <= 1 && fs.existsSync(posFile) && fs.statSync(posFile).mtimeMs >= builtAfter) {
    const ys = [...new Set([...readPositions(pageNum).tokens.values()].map((t) => t.y))].sort((a, b) => b - a);
    const gaps = ys.slice(1).map((y, i) => (ys[i] - y) / PT);
    const skip = rec.vertical?.baselineskipPt ?? 30.6;
    // Gaps of whole multiples are blank lines / headings; only count plain line steps.
    const steps = gaps.filter((g) => g < skip * 1.5);
    rec.lines = {
      count: ys.length,
      baselineGapPt: steps.length
        ? { min: round2(Math.min(...steps)), mean: round2(steps.reduce((a, b) => a + b, 0) / steps.length), max: round2(Math.max(...steps)) }
        : null,
      // Lines pushed further down than \baselineskip by tall accent stacks (\lineskip).
      pushedApart: steps.filter((g) => g > skip + 0.05).length,
      extraFromPushPt: round2(steps.reduce((a, g) => a + Math.max(0, g - skip), 0)),
    };
  }
  return rec;
}

function writeSpacingReport(records) {
  const all = fs.existsSync(SPACING_REPORT_JSON) ? readJson(SPACING_REPORT_JSON) : {};
  for (const [p, r] of records) all[p] = r;
  const sorted = Object.fromEntries(Object.entries(all).sort((a, b) => Number(a[0]) - Number(b[0])));
  fs.writeFileSync(SPACING_REPORT_JSON, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');

  const rows = Object.entries(sorted).map(([p, r]) => {
    const s = r.steps;
    const steps = [s.noParagraphGaps && 'no ¶ gaps', s.fitLevel !== FIT_LEVELS[0] && s.fitLevel,
      s.narrowedPercent && `${s.narrowedPercent}% narrower`, s.strictLeading && 'strict leading'].filter(Boolean).join(', ') || '-';
    const v = r.vertical?.goalPt ? `${r.vertical.usedPt} / ${r.vertical.goalPt} (${r.vertical.slackPt})` : '-';
    const g = r.lines?.baselineGapPt;
    const lines = r.lines ? r.lines.count : '-';
    const gap = g ? `${g.min} / ${g.mean} / ${g.max}` : '-';
    const push = r.lines ? `${r.lines.pushedApart} (+${r.lines.extraFromPushPt}pt)` : '-';
    const flag = r.pdfPages > 1 ? ` **OVERFLOW ${r.pdfPages}pp**` : '';
    return `| ${p}${flag} | ${steps} | ${v} | ${lines} | ${gap} | ${push} | ${r.wideLetters} on ${r.linesFilled} | ${r.built} |`;
  });
  const md = [
    '# Page spacing report',
    '',
    'Generated by `build-body.mjs` from `spacing-report.json` - do not edit; rebuilding a page updates its row.',
    '',
    '- **Used / goal (slack)**: body height used vs. text-block height, in pt (overflowing page: its last page).',
    '- **Gap min / mean / max**: distance between consecutive baselines, pt (headings and blank lines excluded). Design value: \\baselineskip 30.6pt.',
    '- **Pushed apart**: lines set lower than \\baselineskip because of tall accent stacks, and the total height that cost. Strict leading removes it.',
    '- Line data comes from the wide-letter measure pass, so it is missing for overflowing pages.',
    '',
    '| Page | Fit steps | Used / goal (slack) | Lines | Gap min / mean / max | Pushed apart | Wide letters | Built |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
  fs.writeFileSync(SPACING_REPORT_MD, md, 'utf8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const { startPage, endPage } = pageRange(process.argv.slice(2), MAX_PAGE_TO_GENERATE);

const pages = [];
let blanksWritten = 0;
for (let p = startPage; p <= endPage; p += 1) {
  // Blank page in the print: no body or notes, just compile its page-blank.tex config.
  if (blankPages.has(p)) {
    if (!fs.existsSync(path.join(HERE, `page${p}.tex`))) {
      warnings.push(`page ${p}: blank page, no page${p}.tex (run create-page-config.js ${p})`);
      continue;
    }
    const pdf = spawnSync('xelatex', ['-interaction=nonstopmode', `page${p}.tex`], { cwd: HERE, encoding: 'utf8' });
    if (/Output written on .*\.pdf/.test(pdf.stdout)) blanksWritten += 1;
    else warnings.push(`page ${p}: PDF not written (is page${p}.pdf open in a viewer that locks it?)`);
    console.log(`page ${p}: blank page`);
    continue;
  }
  // Section title page: built (tex + PDF) by create-page-config.js.
  if (isSectionTitlePage(p)) {
    console.log(`page ${p}: section title page - built by create-page-config.js`);
    continue;
  }
  const row = rowByPage.get(p);
  if (!rowIsComplete(row)) {
    warnings.push(`page ${p}: boundary missing (${row?.first?.reason || row?.last?.reason || 'no row'}) - skipped`);
    continue;
  }
  pages.push({ pageNum: p, segments: segmentsFor(row) });
}

// Only chapters that actually contain a Qere/Ketiv note need the API.
const qereChapters = new Set();
for (const [cit, marks] of notesByCitation) {
  if (marks.some((m) => m.reasonId === 1)) qereChapters.add(cit.split(':')[0]);
}
const kriChapters = new Map();
for (const { segments } of pages) {
  for (const s of segments) {
    if (qereChapters.has(`${s.book}${s.chapter}`)) kriChapters.set(`${s.book}${s.chapter}`, s);
  }
}
if (RENDER_KRI) {
  await Promise.all([...kriChapters.values()].map((s) => preloadKri(s.book, s.chapter)));
  console.log(`Pages ${startPage}-${endPage}: kri loaded for ${kriChapters.size} chapter(s) [${[...kriChapters.keys()].join(', ')}], ${kriCache.size} entries`);
} else {
  console.log(`Pages ${startPage}-${endPage}: ktiv only (RENDER_KRI = false)`);
}

// Every page with a config is test-typeset; pages with headings or
// end-of-portion markers step through the fit levels until they fit.
const spacing = new Map();
for (const { pageNum, segments } of pages) {
  const builtAfter = Date.now();
  let fit = 0;
  const { maxFit } = writePage(pageNum, segments, fit);
  if (!FIT_CHAPTER_HEADINGS) continue;
  let count = compiledPageCount(pageNum);
  if (count === null) {
    warnings.push(`page ${pageNum}: no page${pageNum}.tex, fit not checked (run create-page-config.js ${pageNum})`);
    continue;
  }
  if (count > 1 && TIGHT_PARAGRAPHS) {
    tightPages.add(pageNum);
    writePage(pageNum, segments, fit);
    count = compiledPageCount(pageNum);
  }
  while (count > 1 && fit < maxFit) {
    fit += 1;
    writePage(pageNum, segments, fit);
    count = compiledPageCount(pageNum);
  }
  // Still overflowing: narrow the letters slightly, at most MAX_CONDENSE.
  let stretch = 1;
  for (const s of CONDENSE_STEPS) {
    if (count <= 1) break;
    stretch = s;
    writePage(pageNum, segments, fit, stretch);
    count = compiledPageCount(pageNum);
  }
  if (count > 1 && STRICT_LEADING) {
    strictPages.add(pageNum);
    writePage(pageNum, segments, fit, stretch);
    count = compiledPageCount(pageNum);
  }
  let pulledUp = false;
  if (PULL_UP_LONE_LAST_WORD && count <= 1 && loneLastWord(pageNum, segments, fit, stretch).lone) {
    for (const s of CONDENSE_STEPS.filter((x) => x < stretch)) {
      const r = loneLastWord(pageNum, segments, fit, s);
      if (r.count === 1 && !r.lone) {
        stretch = s;
        pulledUp = true;
        break;
      }
    }
    if (!pulledUp) warnings.push(`page ${pageNum}: one word alone on the last line, even at the narrowest letters`);
    writePage(pageNum, segments, fit, stretch);
    count = compiledPageCount(pageNum);
  }
  const jalt = JALT && count <= 1 ? fillLines(pageNum, segments, fit, stretch) : null;
  const how = [tightPages.has(pageNum) && 'no paragraph gaps', fit > 0 && FIT_LEVELS[fit], stretch < 1 && `letters ${Math.round((1 - stretch) * 100)}% narrower${pulledUp ? ' (lone last word pulled up)' : ''}`, strictPages.has(pageNum) && 'strict line spacing'].filter(Boolean).join(' + ');
  if (jalt) console.log(`page ${pageNum}: ${jalt.wide.size} wide letter(s) on ${jalt.linesFilled} line(s)`);
  if (how) console.log(`page ${pageNum}: ${how}`);
  if (count > 1) warnings.push(`page ${pageNum}: overflows to ${count} pages${how ? ` even with ${how}` : ''}`);
  // Final PDF, so pageN.pdf always matches the generated body.
  const pdf = spawnSync('xelatex', ['-interaction=nonstopmode', `page${pageNum}.tex`], { cwd: HERE, encoding: 'utf8' });
  if (!/Output written on .*\.pdf/.test(pdf.stdout)) warnings.push(`page ${pageNum}: PDF not written (is page${pageNum}.pdf open in a viewer that locks it?)`);
  spacing.set(pageNum, spacingRecord(pageNum, { count, fit, stretch, jalt, builtAfter }));
}
if (spacing.size) writeSpacingReport(spacing);

if (!parshiotAvailable()) warnings.push('parshiot.json not found - no end-of-portion markers');
console.log(`Wrote ${pages.length} page(s)${blanksWritten ? ` + ${blanksWritten} blank` : ''}.`);
if (warnings.length) console.log(`Warnings:\n  ${warnings.join('\n  ')}`);
