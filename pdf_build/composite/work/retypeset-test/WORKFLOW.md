# Retypeset Workflow: Page Generation

Page-for-page XeLaTeX retypeset of the Letteris Vienna 1882 Tanakh.
Everything lives in `C:\temp\ocr\composite\work\retypeset-test\`; all scripts
run from any directory.

## Quick reference

```bash
cd C:\temp\ocr\composite\work\retypeset-test
node create-page-config.js 9 21      # 1. pageN.tex configs (header, catchword)
node build-body.mjs 9 21             # 2. body + notes, fit each page, write pageN.pdf
node set-boundary.mjs p457 last = 1Sam10:19#12.1 p458 first = 1Sam10:19#12.2   # fix a boundary
node merge-book.mjs 141 300           # merge built pages into book-141-300.pdf with bookmarks (no args: all -> letteris-retypeset.pdf)
```

### Rebuilding the whole book

```bat
cd C:\temp\ocr\composite\work\retypeset-test
rebuild-all                 :: every page (1-1384) -> letteris-book.pdf (one run) + letteris-retypeset.pdf (merged), with bookmarks
rebuild-all 991 1085        :: a range -> book-991-1085.pdf
node merge-book.mjs         :: bookmarks only (after editing haftarot-table.json, psalms-books.json, ...): re-merge, no page rebuild
```

**Book build (one run, 2026-10-19):** `node build-book.mjs [first] [last]` typesets the built pages again in a single XeLaTeX run (`letteris-book.pdf`, or `book-<first>-<last>-onerun.pdf`) - the merged `letteris-retypeset.pdf` carries one copy of every font per page (32.7 MB for 1384 pages), this one each font once. Every page comes out as its `pageN.pdf` (checked pixel by pixel on text, song, book-opening, section title and blank pages), so run it after `build-body.mjs`. It warns if a page spills over (by the `BOOKPAGE` marks in its log) and lists the embedded fonts. `rebuild-all.bat` runs it as step 5. `page-master.tex` is now just `page-style.tex` + `page-content.tex`, the same files the one-run book uses: change the page template there (2026-10-20).

`rebuild-all.bat` runs four steps in order - page configs (`create-page-config.js`), page bodies + PDFs (`build-body.mjs`, the slow step), merge + bookmarks (`merge-book.mjs` -> `letteris-retypeset.pdf`), one-run book (`build-book.mjs` -> `letteris-book.pdf`, same bookmarks, each font once). With no range it takes the last page from the boundary data (`build-body.mjs` on its own defaults to `MAX_PAGE_TO_GENERATE` = 21). It stops on a failed step and shows the end of the log; all output goes to `rebuild-all.log`, warnings are listed at the end. Bookmarks: books with their chapters; `פרשות` (Torah books with their parashot, Psalms with its five books); `הפטרות` (from `work/haftarot-table.json`).

One page: `node create-page-config.js 20` then `node build-body.mjs 20`.
`build-body.mjs` writes the final `pageN.pdf` itself - no separate xelatex step.
Run `create-page-config.js` first: `build-body.mjs` needs `pageN.tex` to test-fit the page.

## Files

| File | Role |
|---|---|
| `tanach-lib.mjs` | Shared logic: book order / verse counts (tanach.json), citation parsing, maqaf-split words, gematria, page segments, catchword lookup, parshiot |
| `create-page-config.js` | Writes `pageN.tex` (header variables, catchword) for every page, page 1 included - there are no hand-made pages. Section title pages (351, 661, 989) are handed to `build-section-title.mjs`, which writes their `pageN.tex` and PDF |
| `build-body.mjs` | Writes `pageN-body.tex` + `pageN-notes.tex`, fits the page, writes `pageN.pdf`; records each built page's spacing in `spacing-report.json` / `spacing-report.md` |
| `spacing-report.json` / `.md` | Spacing data per built page, updated on every build (only the rebuilt pages' entries change): fit steps used (no paragraph gaps, heading level, % narrower, strict leading), body height used vs. text-block height and the slack, line count, baseline gaps min/mean/max, how many lines tall accent stacks pushed apart and the height that cost, wide letters. Vertical figures come from the `SPACING` line `page-content.tex` writes to the log; line data from the wide-letter measure pass (`pageN.pos`), so overflowing pages have none |
| `set-boundary.mjs` | Records human-verified page boundaries and rebuilds the affected pages |
| `build-haftarot.mjs` | Builds `work/haftarot.json` (haftara list: start, end, end status) from the haftara notes in `word_notes.json` |
| `haftara-recommendations.mjs` | Proposed fixes to the haftara notes, checked against Wikipedia's list -> `work/haftara-recommendations.md`; rerun after updating the source to see which are applied |
| `build-book.mjs` | The whole book (or a range) typeset in ONE XeLaTeX run -> `letteris-book.pdf`, each font embedded once, same bookmarks as `merge-book.mjs`; see "Book build" |
| `page-style.tex` / `page-content.tex` | The page template split for the one-run book: styles (once per document) and one page's content (per page, after `ookpagereset`) |
| `merge-book.mjs` | Merges the built `pageN.pdf` files into one PDF (pypdf) with book / parasha / chapter bookmarks; see below |
| `audit-seams.mjs` | Checks every page seam (chain + catchword) and writes suggested `set-boundary` fixes to `work/seam-fixes.txt` |
| `page-master.tex` | Template every `pageN.tex` inputs: `page-style.tex` (header, footer, styles) + `page-content.tex` (notes, title, body) |
| `preamble-common.tex` | Geometry, fonts, all macros |
| `OLD/` | Retired scripts/templates and the old `kri-cache-*.json` files - not used |

### Data sources (nothing is hardcoded)

| Data | Source |
|---|---|
| Page boundaries | `work/boundary-words-final.json` (built by `src/43-apply-boundary-verdicts.js` from `work/boundary-verdicts.json` = human verdicts, then `work/boundary-provisional.json` = tool suggestions, tagged `provisional`) |
| Text | `work/corpus/<Book>-<NNN>.json` - a local mirror of the corpus API, read on every build (refresh: see below) |
| Petuchah / setumah where the scan differs from the corpus | `work/scan-breaks.json`: corpus marker word (`Neh5:18#26`) -> `none` (the scan runs on), `setumah` or `petuchah`; checked against the scan. A noted marker keeps its footnote. Neh 5:18 (page 1256) is the first entry (2026-10-19) |
| Masora notes | `work/word_notes.json` |
| Masora finalis (end-of-book verse-count summaries) | `work/word_notes.json` reason 15 (on each book's last word): one note per scan line (`\n`), `**...**` = large type. `build-body.mjs` prints it as `\finalisblock` under the book's last verse (above the footer; the page's footnotes stay in the footer), also when the next book starts on the same page. `work/masora-finalis.json` is the original transcription (structured blocks + gematria checks), reference only |
| Book names, order, verse counts | `C:\temp\ocr\tanach.json` |
| Weekly portions | `C:\temp\ocr\parshiot.json` |
| Kri text (only when `RENDER_KRI = true`) | corpus API `http://localhost:8200/api/citation/v2/<Book><Chapter>` - never word_notes.json |

### Refreshing the text (`src/10-corpus-update.js`)

```bash
cd C:	emp\ocr\composite
node src/10-corpus-update.js                      # pull all 929 chapters from localhost:8200 into work/corpus-new + compare (~30 s)
node src/10-corpus-update.js --apply              # back up work/corpus, swap in the safe (text-only) chapters
node src/10-corpus-update.js --apply --apply-renumbered   # also chapters whose word count changed
```

Report: `work/corpus-update-report.txt`. Chapters are **identical**, **text-only** (same word positions - safe) or **renumbered** (a verse gained/lost words - every boundary, verdict, provisional edge and masora note pointing into those verses is listed, since `#n` positions may have moved). Options: `--book Gen`, `--api <url>`, `--skip-pull`. The source is the local corpus API (`src/10-corpus.js`, `DEFAULT_API`); the original 2026-09-03 mirror came from the stale remote geulah site.

## Page config (`create-page-config.js`)

- Hebrew book name = tanach.json `hebbook`; English = `name` uppercased with a space after a leading digit (`1 SAMUEL`), `Songofsongs` -> `SONG OF SONGS`.
- Chapters and gematrias from the page's span (works across books).
- `\pageparasha` (Torah only, shown on even pages between the Hebrew book name and the chapter numeral): the newest portion on the page; a book's first portion is never shown (same as the book name).
- Catchword = what follows the page's last word: the rest of a split maqaf word, otherwise the next corpus word (פ/ס markers skipped, masora circle removed).
- Blank pages (`_blankPages` in `boundary-verdicts.json`: 662, 988, 990) get `pageN.tex` = `\input{page-blank.tex}`, an empty page at the book's paper size with no header, as in the scan. `build-body.mjs` only compiles it. Pages 662, 988 and 990 built 2026-10-18.

## Body rules (`build-body.mjs`)

Config at the top of the file:
- `MAX_PAGE_TO_GENERATE` - pages built when no range is given.
- `RENDER_KRI = false` - Qere/Ketiv words print as the ktiv only (regular word). `true` restores ktiv (3/4 size, subscript) + kri (3/4 size, superscript), fetched from the API.
- `FIT_CHAPTER_HEADINGS` - test-typeset and fit every page.
- `RENDER_BOOK_MARKER = false` - the four-line-blank book marker (`װ`, only at Exod-Deut 1:1 word #1) is skipped (no blank lines), but a noted marker keeps its footnote and its masora circle prints alone just before the book's first word (`\masoracircle`, e.g. Exod1:1 on page 89); `true` prints it as `\parashabreak`.

Text:
- Verse numbers in the margin (`\vnum`); verse 1 never numbered. Size `\vnumsize` (14pt; scan ~17pt) in `preamble-common.tex`; on even pages (right margin) the number is pushed against the text, so both sides sit ~0.12in from it as in the scan (2026-10-19). Chapter opening: `\chapheading` + margin gematria (`\chapnum`), set against the text so a wide one spills outward, never into the text. A gematria wider than `\chapnumroom` (36pt: only 3-letter ones, Psalms 100+, e.g. קכא 47.7pt) nudges the chapter's first line in by the excess and moves into that gap, so it stays on the paper (page 1072, 2026-10-19). A book that begins mid-page gets an in-text title (`\midbooktitle`, see Known gaps).
- Psalms sub-books: `work/psalms-books.json` (the five books, first/last chapter, Hebrew + English title) is read by `subBookAt()` in `tanach-lib.mjs`; `build-body.mjs` prints `\subbooktitle{ספר שני}{BOOK 2}` (`\subbooktitlesmall` at fit level 1+; sizes/gaps in `preamble-common.tex`) before the sub-book's first chapter heading, and after the book title at Ps 1. The scan's Latin (LIBER SECUNDUS) is replaced by English. Pages 991, 1016, 1035, 1049, 1060 built and fit (2026-10-19). The file's `chapterLabel` ("Psalm") replaces "Chap." in Psalms chapter headings (`\chapheading[Psalm]{42}{מב}`; the label is an optional argument, default `Chap.`) . The Psalms running head has no label (`\pagechaplabel` empty, written by `create-page-config.js`; default `Chap.`): "PSALMS — 90,91", as in the scan's "PSALMI 90. 91.".
- Chapter label: "Chap." / "Psalm" in small caps (`\chaplabel` = `\textsc`: a full capital, then smaller capitals, like the scan's "Cap." / "Psal."), in headings and running head - Psalms' running head has none (2026-10-19; replaced plain "Cap."). Rebuilt so far: pages 3, 1016, 1049 - every other built page shows the old "Cap." until its config and body are rebuilt.
- פ/ס letters are printed only in the Torah. In the Prophets and Writings the scan keeps the same gaps and open lines but leaves the letter out (Josh 1:9 page 352, Job 2:10 page 1120); a noted break keeps its masora circle alone in the gap (Josh 4:1, page 356). `build-body.mjs` starts each non-Torah page's body with `\breaklettersfalse` (`\breakletter` in `preamble-common.tex`); a page mixing Torah and non-Torah text is an error.
- Petuchah / setumah / four-line blank from the corpus marker words (ײ ױ װ); a noted marker prints its masora circle on the פ/ס and keeps its footnote. A petuchah פ (and an inline `פ פ פ`) is tied to the word before it, so it never sits alone on a line. The פ/ס sits in the middle of the gap it makes, as in the scan: a petuchah's פ centred in the rest of its line (on a full line it still ends the line); a setumah's ס centred in its 3em gap, which shrinks to 1em when that keeps the next word on the line (page 121); a setumah that ends a paragraph (before a chapter heading, portion-end line, song) is set like a petuchah (`setumahopen`). A setumah may end a line, as in the scan (page 227, Num 6:23 and 6:26), but never starts one: the line can break only after the ס (the word space before it is unbreakable), and the gap after it is dropped at the break, so the ס ends the line. As a page's last word it is just ` ס` (`\setumahpageend`, no gap). A marker right after a page's last word belongs to that page (boundary data names only real words, e.g. Gen9:17 #13 on page 13). Likewise a book marker (`װ`) right before a page's first word belongs to that page (Exod1:1 #1 on page 89, whose boundary starts at #2); a פ/ס marker there still belongs to the previous page.
- The text line before a chapter heading ends ragged (like a petuchah); otherwise every body line is justified edge to edge (`\parfillskip=0pt`), and a chapter's short last line was being spread across the full width.
- End of each weekly portion: a centered `ס ס ס` (portion ends in a setumah) or `פ פ פ` (petuchah, or no break - book ends, Vayigash) line at heading size, replacing the single פ/ס.
- `חזק` at a book end comes only from the book's masora finalis note: a line that is just `חזק` -> `\chazak` (`\chazaksmall` at fit level 1+). A book with no finalis note gets no `חזק` (the standalone fallback was removed 2026-10-19; pages 929, 943, 948, 982, 1248, 1323 rebuilt).
- Maqaf-split boundary words: each page prints only its own part.
- Masora footnotes: every word_notes reason except 14 (pronunciation override). A note too long for one footer line wraps inside itself (shorter notes stay unbreakable). A note's `**...**` part is verse text the scan prints under the notes (Josh 21:36, page 389: the two verses found only in some books): it is moved to `\pagefootverses` and set in large type, starting with `*`, below a second rule; `page-content.tex` shortens that page's text block by the block's height so the footer stays on the paper. Large/small letters (reason 9) resized; the note names its letter ("צ׳ רבתי"), and when that letter is marked more than once in the word, the dagesh in the note's letter picks which (Dan 6:20 בשפרפרא, page 1218: "פ׳ זעירא" = the first פ, "פּ׳ רבתי" = the second). The cut vav (reason 9 "קטיעה", Num 25:12 שלום, page 264) is drawn with a gap in its stem and the lower piece moved right (`\cutletter`, TikZ clipping; height, gap and shift in `CUT_LETTER_*`) - the scan only marks it with the masora circle and footnote, which are kept. Hanging letters (reason 9 "תלויה": Judg 18:30 page 434, Ps 80:14 page 1042, Job 38:13,15 page 1150) are set smaller (`\hangsize`, 20pt against the 27pt body) and raised so their tops stand above the full-size letters (`\hangabove`, 0.2 of a letter's height - 0.35 brought page 434's masora circle into the line above) with `\hangletter`. The marks above (masora circle) rise with the letter; the vowels and accents below stay full size on the line, centred in the space of a full-size letter (`hangLetterTex` splits the marks). Those lower marks are drawn under a flat-based carrier letter (`\hangcarrier`, ב) that is clipped away with TikZ - clipping the letter itself cut off ע's hiriq, which tucks up into its tail (Job 38:13).

Fitting - each page is typeset and, while it overflows, steps through:
0. no space between paragraphs (`TIGHT_PARAGRAPHS`: `\parskip` 0 instead of 1mm, as in the scan; each petuchah/heading break otherwise costs 1mm - page 85, Gen 49, overflowed even at 5% narrowing without it, fits at 3% with it), kept for the steps below
1. full-size chapter heading and portion-end line
2. small heading + small portion-end line
3. portion-end marker inline at the end of the last text line (פ פ פ ends the line; ס ס ס keeps the setumah gap)
4. body letters narrowed 1% .. 6% (`\condensebody`, fontspec FakeStretch - the font has no condensed cut; page 97, Exod 6, needs 6%)
5. strict line spacing (`STRICT_LEADING`, `\strictleading` = `\lineskiplimit=-\maxdimen`): every line exactly 30.6pt apart. Otherwise a line with a tall accent stack is pushed down by `\lineskip` (31.5-34.5pt), which costs a whole line on a dense page. Page 216 (Num 1:37-54) needs this: 28 lines, only 27 fit without it. No accent collisions there at 200 dpi.

Line filling (`JALT = true`), after the page fits: lines whose added interword space is more than `MAX_EXTRA_SPACE_LETTERS` (3) letter-widths (ב at body size) get **wide letterforms** - the font's `jalt` alternates for א ד ה כ ל ם ר ת, each 0.3-0.4 em wider. Two passes, because XeLaTeX applies `jalt` to every covered glyph it touches (the reason it was dropped before):
1. **measure** - the page is typeset with invisible position marks around every word part (`\wb`/`\we` -> `pageN.pos`), plus the font's space and letter widths; this gives every line's words and its real added space;
2. **plan** - per loose line, wide letters (the last wide-capable letter of a word, spread from both ends of the line inward, at most `MAX_JALT_PER_LINE`) until the line is under the cap, never more than the line can absorb;
   Lines with a setumah are handled differently (page 227, Num 6:23-27): the scan spreads their words and keeps the ס gap at ~0.5-1em a side, where `\setumah`'s natural 3em left the words bunched. On such a line the setumah gap beyond `SETUMAH_TIGHT_GAP_EM` (0.75em) a side counts as loose space (a setumah ending the line: the space to the line end), the line gets wide letters from `SETUMAH_LINE_CAP_LETTERS` (0.5) letter-widths on, and its setumot are set as `\setumahtight` with that fixed gap, so the words take the space;
3. **set** - the chosen letters get `\wide{...}` and the line breaks are locked (`\break{}`), so nothing reflows;
4. **verify** - still one page, no new overfull line, every word on the same line as measured, and the final page without position marks is still one page with no new overfull line (the marks split shaping runs, e.g. across a maqaf, so a locked line can come out wider without them - page 103); otherwise the page is kept without wide letters (warning). Checked by eye and accepted as-is (no visible issue): pages 1027, 1043 (2026-10-19). `JALT_DEBUG=1 node build-body.mjs N` prints each loose line's added space before/after.

Book title page (`node build-title-page.mjs`, 2026-10-20): front matter before page 1, laid out after the 1882 scan's title page (`vienna-1882/analysis/0005.png`). Text from `title_page.txt` in the project root, one printed line per line; a blank line splits the top block from the imprint, which sits at the foot after a short rule. ASCII ' and " become ׳ and ״. The last imprint line (font credit) is set small in the English font, left to right, with "c/o" printed as ©. Line sizes/gaps are in the config at the top of the script; the big title is Magalith with FakeBold, scaled to `TITLE_WIDTH`. Writes `title-page.tex` / `title-page.pdf` (no header or page number). `merge-book.mjs` and `build-book.mjs` put it before page 1 (as "page 0", bookmarked first as `שער – Title Page`) whenever the range starts at page 1, and warn if it is missing; the one-run copy matches `title-page.pdf` pixel for pixel. `rebuild-all.bat` rebuilds it (step 3 of 5) when the range starts at page 1; otherwise run `build-title-page.mjs` by hand after changing `title_page.txt`.

Section title pages (`build-section-title.mjs <page>`): pages with no Bible text that open a section, e.g. page 351 (נביאים ראשונים before Joshua). They need no separate step: `create-page-config.js` runs `build-section-title.mjs` for them (tex + PDF, its warnings in the run's `Warnings:` list), `build-body.mjs` skips them, and `merge-book.mjs` doesn't count them as pages with missing boundary data. Running the script by hand still works. A section title page is found from the data (`sectionTitleBook()` in `tanach-lib.mjs`): a page with a (failed) boundary row but no text, between one book's last verse and the next book's first (351, 661, 989; the blank pages around them have no row). The list runs from that book up to the book after the next section title page, so page 661 (Latter Prophets) also lists the Twelve, as the scan does. The book names come from tanach.json / `englishHead()`; the list type is at most `LIST_SIZE` (22pt - the scan's names are ~0.58 of the English title's height) and at most `LIST_SIZE_RATIO` of the row pitch; a long list gets tighter rows so it fits in `LIST_MAX_HEIGHT` (351: 22/50pt, 989: 22/41.25pt, 661: 19.8/33pt). The scan's Latin names (PROPHETAE PRIORES, JEHOSUAH, I. SAMUELIS) are replaced by English ones; the English section title is the group's `name` in tanach.json (uppercased); layout sizes are in the config at the top of the script. Writes `pageN.tex` (no header or page number, as in the scan) and the PDF. The title is the largest tanach.json group that holds the first listed book and is listed in full: the whole division when the page lists all of it (989: כתובים / WRITINGS), else the book's own group (661: נביאים אחרונים, though the Twelve follow). Groups whose `name` is a transliteration get their English title from `GROUP_ENGLISH` in the config (Ktubim -> Writings). A group made of numbered parts of one book (Chronicles: דברי הימים א׳/ב׳) is one list entry, as in the scan; Samuel and Kings are not groups, so 351 keeps them split. Hebrew names are tanach.json `hebbook` (so מגילת איכה / מגילת אסתר, ישעיהו, where the scan has איכה, אסתר, ישעיה). After the run the script prints `Warnings:` for spacing problems: a list row whose two names leave less than `LIST_MIN_GAP` (2em) between them (a name may run past its column into the empty middle, but `\makebox` would let the names overlap silently), any overfull line, or a PDF of more than one page. Done: pages 351, 661, 989 (2026-10-18), no warnings.

Songs (shirah): `work/song-layouts.json` holds each song's layout transcribed line by line from the scan: per line, the first word of each block (`verse#word`, `#n.k` = maqaf part k when a scan line breaks inside a word), plus the song's last word (`end`). The file's `_note` has the format. `build-body.mjs` forces each scan line onto its own line (`\songbreak`) and pushes its blocks apart (`\songgap` = `\hfill`): 1 block = justified line, 2 = flush right + flush left, 3 = right / centre / left. The text after `end` continues as prose on a new line. Done: Exod 15:1-19 (pages 113-114), Deut 32:1-43 (pages 344-347, 70 two-block lines) and the kings list Josh 12:9-24 (pages 374-375, 31 lines: name flush right, אחד flush left; the total line continues as prose), all matching the scan line for line. Judg 5:1-31 (pages 405-408, 64 lines: 5:1 one justified line, then 3-block and 2-block lines alternate). 2Sam 22:2-51 (pages 541-544). Ps 18:2-51 (pages 998-1001, 71 lines, 3-block and 2-block lines alternate; 2026-10-19). Eccl 3:2-8 (page 1177, 14 lines, 2026-10-19) is two columns: its entry has `column: 0.35`, so each line's second block starts at a fixed column (`\songcolumn{0.35}` ... `\songcolumnend`: a box whose right edge is 0.35 of the line width from the left edge) instead of flush left; the scan's sof pasuq set apart at the far left is not copied. Outside the Torah a פ/ס right after a song's last word is dropped (Eccl 3:8): no letter prints there, so it only left an empty line the scan doesn't have; in the Torah its פ line stays (Deut 32:43, page 347). Esth 9:7-10 (page 1199, 11 lines, 2026-10-19): each name flush right, the next ואת flush left; its first line is ואת alone, written as an empty first block `["", "7#2"]` (`\songemptyblock`). All songs in the scan are now transcribed. Outside the Torah, פ/ס markers right before a song's first word are dropped too (a noted one keeps its circle): `\songstart` already ends the previous line ragged, and Esth 9:6-7's two markers (ײ then ױ) left an empty line the scan doesn't have. A verse that opens with a marker word (Esth 9:7, 2Chr 35:25) now gets its verse number on its first real word; before, it had none (page 1382 not rebuilt yet). Petuchot/setumot inside a song (first block to `end`) are ignored: they are the text's makeshift song layout, replaced by the scan layout (`layOutSongs`; a noted one would keep its footnote and masora circle). Only Ps 18 has any (106 setumot, one per block); kept, their gaps pushed Ps 18:35 onto three lines and page 1000 over.

Anything still overflowing is listed under "Warnings". Status: pages 1-21, 457, 458 all fit (page 20 needs 2% narrowing).

## Merging and bookmarks (`merge-book.mjs`)

`node merge-book.mjs [first] [last]` merges the `pageN.pdf` files that exist in the range (no args: every page, into `letteris-retypeset.pdf`; a range: `book-<first>-<last>.pdf`). Bookmarks use the scan bookmark titles: book `בראשית – Genesis`, parasha `נח – Noach`, chapter `7`. Three parts (2026-10-19): (1) every book with only its chapters under it; (2) `פרשות – Parashot`: each Torah book with its parashot, and Psalms with its five books (`ספר ראשון – Book One`, from `work/psalms-books.json`); (3) `הפטרות – Haftarot`, in calendar order (below). Each points at the page where its first verse starts, worked out from `boundary-words-final.json` (marker words before a page's first word are ignored, so Exod 1:1 lands on page 89). Pages with incomplete boundary data can't place their starts (listed as a warning). A `pageN.pdf` with more than one page (an overflow) is reported and the later bookmarks still land correctly. The computed outline is also written to `book-outline.json` for checking.

Haftarot: `node build-haftarot.mjs` regenerates `work/haftarot.json` from `word_notes.json` - a note naming a haftara (`...הפטרת X`) marks its first word, `עד כאן` / `עד כן` (optionally `לספרדים`/`לאשכנזים`) a last word. Each start is paired with the first end marker after it in its book; `end.status` is `marked` (its own end), `check` (another haftara starts in between, or the end is for one rite only - may not be this one's end) or `none` (no end marker). Don't edit the file: fix the notes and regenerate. `haftarot.json` is no longer used for bookmarks (2026-10-19).

Haftara bookmarks come from `work/haftarot-table.json`: the edition's own haftara table (`C:\temp\ocr\haftarot.pdf`, סדר ההפטרות, Ashkenazi and Sephardi), transcribed with start and end verses and every extra passage (Joel after Hosea on שבת שובה, Micah after Jonah, Josh 6:27). The file is in calendar order - portions in Torah order, holidays and fasts in year order (Rosh Hashana to the fast-day mincha), then Rosh Chodesh - and `merge-book.mjs` follows it: one bookmark per occasion at its first verse (`צו – Jer 7:21–8:3, 9:22–23`), or two marked `(אשכנז)` / `(ספרד)` where the rites differ (97 in all). The table's Jer 31:2-20 (Rosh Hashana 2) counts Jer 30:25 as 31:1 (the scan's note on page 789); the file has it as 31:1-19 in this edition's numbering. Compared with the notes: two haftara notes have no table entry (Ezek 17:22 "הפטרת האזינו", Hos 1:1 "הפטרה במדבר סיני"); table starts with no note: Isa 27:6 (שמות, Ashk.), Judg 5:1 (בשלח, Seph.), Judg 13:2 (נשא), 2Kgs 12:1 (שקלים, Ashk.), 1Sam 15:2 (זכור, Ashk.), Josh 3:5 (פסח א׳, Ashk.).

## Footer (page-style.tex)

- The rule above the footer is `\footerrulewidth` = 0.4 of the text width, starting at the right (Hebrew) edge, as in the scan (measured on pages 902, 919, 1043, 1200; set in `page-style.tex`, 2026-10-19). The second rule above footer verses (page 389) stays full width.
- Masora notes 12pt (`\masoranote`), each note one unbreakable unit: `°verse.word text`.
- Catchword 14.5pt at the far left of the first footer line.
- The notes' first line stops 1em short of the catchword; later lines use the full width.
- Notes taller than `\footnotesroom` (40pt = 2 rows; set in `page-style.tex`) move the rule up by the excess (the text block is shortened), so the last row stays ~0.5in from the paper edge. Page 902 (Ezek 40, 25 kri notes, 6 rows) had its last row cut off before this (2026-10-19). Pages with 3+ rows: 327 345 540 753 825 857 861 873 902 903 915 1115 1165 1178 1207 1211-1213 1215 1216 1219 1220 1236.

## Correcting page boundaries (`set-boundary.mjs`)

Don't edit `boundary-words-final.json` by hand. Use:

```bash
node set-boundary.mjs p457 last = 1Sam10:19#12.1 p458 first = 1Sam10:19#12.2 [--no-build]
```

- **Seam shift** - `node set-boundary.mjs p74 +.1` moves page 74's last word *and* page 75's first word together, as arithmetic on the word number: the integer part moves by whole words (across verses/chapters, skipping פ/ס markers), `.k` by maqaf parts. From `Gen43:15#3`: `+.1` -> `#3.1` (p75 starts `#3.2`), `+1` -> `#4`, `-2` -> `#1`. A whole-word shift lands on a whole word (`+1.1` = next word, part 1). `#3` = `#3.0`, and ending on a word's last part is the whole word, so from `#3.1` both `+.1` and `-.1` give `#3`. It prints the expanded full command (`= node set-boundary.mjs p74 last = ... p75 first = ...`). Add `--dry-run` to see the result without writing anything.
- `#12.1` = word 12, part 1 of a maqaf-joined word. As a page's **last** word, part k = parts 1..k; as a page's **first** word, part k = parts k..end. Whole words need no `.part`.
- Validates against the corpus, fills in the Hebrew text, writes only that override line into `work/boundary-verdicts.json`, runs script 43, warns if adjacent pages don't meet word-to-word, then rebuilds the changed pages.
- Provenance: a plain call is a **human verdict** (you checked the scan) -> `boundary-verdicts.json` overrides; it also drops any provisional entry for that edge (= confirmed). `--source=<tool>` is a **machine suggestion** -> `work/boundary-provisional.json` (value, source, date), never into overrides (that file's `_note` forbids it); refused if the edge already has a human verdict. Script 43 applies provisional edges only where there is no override, as tier 2 tagged `provisional: <tool>`, and doesn't count them as trustworthy.

## Auditing page seams (`audit-seams.mjs`)

```bash
node audit-seams.mjs      # ~2 s, writes work/seam-fixes.txt
```

Checks every seam (page N last -> page N+1 first) two ways: the chain must meet word-to-word (no overlap/gap, maqaf parts included), and the OCR catchword under page N (`work/catchwords.json`; consonants only, ו/י and OCR noise tolerated) must be page N+1's first word. Writes ready-to-run `set-boundary.mjs ... --no-build` lines, best first:

- **HIGH** - a catchword of 3+ letters places the seam within 6 words.
- **MEDIUM** - catchword further away or only 2 letters, or a broken chain repaired by trust (verified > tier 0 > tier 1 > tier 2).
- **CONFLICTS** - evidence contradicts a verified edge: check the scan.
- **UNRESOLVED** - no usable evidence, or the catchword fits two words equally well.

Verified edges are never changed by a suggested fix: pages 1-`VERIFIED_THROUGH_PAGE` (config at the top; 1384 = every page: the manual check of all page seams against the scan was finished 2026-10-19) and every override in `boundary-verdicts.json`. Raise `VERIFIED_THROUGH_PAGE` as manual checking advances. Nothing is applied automatically. The suggested commands carry `--source=audit-seams`, so applied fixes stay provisional (and open to re-audit) until you confirm them by re-running the same edit without `--source`.

## Known gaps

- 133 pages have incomplete boundary data (`chapter-dp-failed`, first at pages 86-88) - skipped with a warning.
- Book openings: a page whose first word is a book's first real word (`startsBook` in `tanach-lib.mjs`; marker words before it are ignored - Exod, Lev, Num, Deut 1:1 start with a `װ` marker as word #1, so their boundary `first` is correctly `#2`) gets `\pagebookstart{true}` (set by `create-page-config.js` from the data): the header keeps only the page number (no rule, no chapter indicator) and `page-content.tex` prints the title at the top of the text block - Hebrew name 58pt over English name 32pt, 2mm below the header and 10mm above the text (sizes/gaps: `\booktitle*` in `page-style.tex`). Pages 1, 89, 162, 214, 287, 352 built and fit. Most books start at the top of a page. Books that start mid-page keep the normal running head and get an in-text title from `build-body.mjs`: `\midbooktitle{heb}{eng}` (short rule, Hebrew name, English name, short rule; `\midbooktitlesmall` at fit level 1+; sizes/gaps in `preamble-common.tex`). Page 499 (2 Sam) built and fits (2026-10-18); the other mid-page openings below not rebuilt yet. The old hand-made page 1 is in `OLD/page1-handmade.tex`.
- Books that start mid-page (12; checked 2026-10-11 against `boundary-words-final.json` and `chapter-index-final.json`, which agree everywhere both have data). Page / line of chapter 1:

  | Book | Page | Line | | Book | Page | Line |
  |---|---|---|---|---|---|---|
  | 2Sam | 499 | 11 | | Zeph | 961 | 18 |
  | 2Kgs | 606 | 6 | | Hag | 965 | 10 |
  | Amos | 934 | 14 | | Zech | 968 | 7 |
  | Jonah | 945 | 14 | | Ruth | 1161 | 9 |
  | Nah | 955 | 19 | | Eccl | 1174 | 8 |
  | Hab | 958 | 16 | | Esth | 1187 | 17 |

  2Sam, Amos, Hab, Hag and Ruth fall on `chapter-dp-failed` pages, so their page/line comes from `chapter-index-final.json` only. All other 27 books start at the top of a page (Jer on 739 is also in a failed stretch, 737-741; the chapter index puts it at line 2).
- Lev and Num have no chapter-1 line in `chapter-index-final.json`.

## Troubleshooting

- **PDF looks stale** - `build-body.mjs` writes it; a viewer that locks the PDF makes it warn "PDF not written".
- **Page overflows** - see the Warnings list; fitting already tried every step above.
- **Wrong catchword / header** - rerun `create-page-config.js N` (it reads the current boundary data).
- **Note missing** - check `word_notes.json`; reason 14 is deliberately not printed.
