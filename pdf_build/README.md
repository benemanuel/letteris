# Letteris Tanakh — retypeset PDF build

This folder builds a new, page-for-page retypeset PDF of the Letteris Tanakh
(Vienna 1882 printing): the same 1384 pages, each page starting and ending on
the same word as the printed book, set in XeLaTeX with the Magalith Tanach Pro
font. It holds the build scripts, the TeX templates, the font and the data the
build reads. Nothing else is needed except the tools listed under


## What is here

```
pdf_build/
  README.md                this file
  tanach.json              books, chapter counts, Hebrew/English names, groups
  parshiot.json            the weekly Torah portions
  title_page.txt           text of the book's title page
  composite/
    package.json           marks the .js scripts as ES modules
    vendor/fonts/          magalith Tanach Pro.otf
    src/                   corpus update script (update_ktiv.bat) and what it imports
    work/
      corpus/              the text: one JSON file per chapter (929)
      boundary-words-final.json   first/last word of every printed page
      boundary-verdicts.json      hand corrections to those; blank pages
      word_notes.json      footnotes, masora circles, masora finalis
      song-layouts.json    layouts of the songs (Exod 15, Deut 32, ...)
      scan-breaks.json     forced line breaks taken from the scan
      psalms-books.json    the five books of Psalms
      haftarot-table.json  the haftarot (for the PDF bookmarks)
      catchwords.json      the scan's catchwords (used by audit-seams.mjs)
      retypeset-test/      scripts and TeX templates; the build runs here
```

### Scripts (in `composite/work/retypeset-test/`)

| script | what it does |
|---|---|
| `rebuild-all.bat` | **the whole build**, steps 1-5 below |
| `create-page-config.js` | 1. writes `pageN.tex` (running head, catchword) for each page |
| `build-section-title.mjs` | section title pages 351, 661, 989 (called by step 1) |
| `build-body.mjs` | 2. writes each page's text and notes, fits it to the page, makes `pageN.pdf` |
| `build-title-page.mjs` | 3. the book's title page, from `title_page.txt` |
| `merge-book.mjs` | 4. merges the page PDFs, adds bookmarks |
| `build-book.mjs` | 5. sets the whole book again in one XeLaTeX run (smaller file) |
| `swap-title-page.bat` / `.py` | rebuilds the title page and puts it into an already-built book (no full rebuild) |
| `tanach-lib.mjs` | shared code and all data paths |
| `build.bat`, `config.bat`, `maketex.bat`, `allpdf.bat` | shortcuts, see below |
| `audit-seams.mjs` | checks page seams against the scan's catchwords |
| `build-haftarot.mjs`, `haftara-recommendations.mjs` | haftara data tools (not part of the build) |
| `set-boundary.mjs` | **does not work here**: it needs the OCR pipeline (`composite/src/`), which was not copied |

TeX templates: `preamble-common.tex` (paper size, fonts, base macros),
`page-style.tex` (head, foot, styles), `page-content.tex` (notes and text),
`page-master.tex` (the two together; every `pageN.tex` inputs it),
`page-blank.tex` (blank pages 662, 988, 990).

Docs: `WORKFLOW.md` is the detailed reference for how pages are built and
fitted (layout rules, fit levels, songs, notes, title pages).
`MIGRATION-FILES.md` lists every file the build uses and every path the
scripts assume. `BOOK-BUILD-PLAN.md` and `tex-editing-history.md` are design
notes.

## Requirements

- **Node.js** (the scripts are ES modules)
- **XeLaTeX** from TeX Live, with fontspec, polyglossia, geometry, fancyhdr,
  tikz, ifthen and subscript (all in a full TeX Live)
- **Python** with `pypdf` (`pip install pypdf`), for `merge-book.mjs`
- `pdffonts` (poppler), optional: the font report at the end of `build-book.mjs`

The font is loaded from `composite/vendor/fonts/` and does not need to be
installed.

## How to use it

Run everything from `composite/work/retypeset-test/`.

### Build the whole book

```
rebuild-all
```

This takes a long time; step 2 typesets every page, some several times
while fitting. It writes:

- `letteris-book.pdf`: the book in one XeLaTeX run, each font embedded once.
  **This is the one to use.**
- `letteris-retypeset.pdf`: the page PDFs merged (same pages, much larger file)
- `pageN.pdf` for every page, plus each page's `.tex` and `.log`

Both books start with the title page and have bookmarks for books, chapters,
parashot, the five books of Psalms and the haftarot. The run's output and
warnings go to `rebuild-all.log`; the warnings are also printed at the end.

### Build a range of pages

```
rebuild-all 991 1085
```

writes `book-991-1085-onerun.pdf` and `book-991-1085.pdf`. The title page is
included only when the range starts at page 1.

### Build one page or a few

```
build 457            page 457 -> page457.pdf
build 457 460        pages 457-460
```

`build` runs steps 1 and 2 only (`create-page-config.js` +
`build-body.mjs`). Look at `pageN.pdf` directly. Run `rebuild-all` (or
`merge-book.mjs` / `build-book.mjs` with the range) to get a combined PDF.

### Change the title page

Edit `title_page.txt` (in this folder's root), one printed line per line:

- the lines before the blank line form the top of the page
- the lines after it are the imprint at the foot of the page
- the last line is the font credit, set small in English; `c/o` prints as ©
- `'` and `"` print as Hebrew ׳ and ״

Then run `node build-title-page.mjs` (or `rebuild-all`, which runs it
whenever the range starts at page 1). Sizes and spacing of each line are in
the config block at the top of `build-title-page.mjs`.

To update the title page of a book you have already built, run
`swap-title-page` (or `swap-title-page book-1-50-onerun.pdf` for another
book). It rebuilds the title page and replaces page 1 in place; bookmarks
and every other page stay as they are.

### Change the text or the notes

The text comes from `composite/work/corpus/` and the notes from
`composite/work/word_notes.json`. Rebuild the pages they fall on with
`build <first> <last>`. Which word starts and ends each page comes from
`boundary-words-final.json`. That file was made by the OCR project, and
changing a page boundary needs `set-boundary.mjs` in the original project.

### Refresh the text from the corpus API

Run `composite\work\update_ktiv.bat`. The corpus API must be running at
`localhost:8200`. (local version of https://tanach.geulah.org.il) The batch file runs
`composite/src/10-corpus-update.js --apply --apply-renumbered`, which:

- pulls all 929 chapters into `work/corpus-new/`
- compares each with `work/corpus/`:
  - identical: nothing to do
  - text-only: spelling, vowels or accents changed; safe
  - renumbered: a verse gained or lost words, so page boundaries and notes
    pointing at later words in it may now point at the wrong word. The
    report lists every such reference.
- backs up `work/corpus/` to `work/corpus-backup-<date>/` and copies the
  changed chapters in. If `work/corpus/` is missing, it is created from the
  pull, with no backup and no comparison.

Then it deletes `work/corpus-new/`; the next run downloads it again. Read
`work/corpus-update-report.txt` afterwards, then rebuild. Without `--apply`
the script only reports and keeps `work/corpus-new/`, so
`--skip-pull` can compare it again without downloading.

`update_notes.bat` regenerates `word_notes.json` from the
`cantillation-sequences` repo (`C:\Users\avi\GitHub\cantillation-sequences`)
and opens it in Notepad++ for the ײ→פ / ױ→ס edits. `update.bat` runs both.

`composite/src/` holds only the five files the corpus update needs
(`10-corpus-update.js`, `10-corpus.js`, `config.js`, `lib/cli.js`,
`lib/hebrew.js`). It is not the full OCR pipeline.

### Settings

Each script has its settings in a `Config` block at the top. For example,
`build-body.mjs` has `RENDER_KRI = false`: only the ktiv is printed. Turning
it on also needs the corpus API running at `localhost:8200`.

## Notes

- The generated files (`pageN.tex`, `pageN-body.tex`, `pageN-notes.tex`,
  `pageN.pos`, `pageN.pdf`, `.aux/.log/.xdv`, `spacing-report.*`,
  `book-outline.json`, the book PDFs) are all remade by the build. They do
  not need to be kept or committed.
- Two builds writing the same book PDF at once would corrupt it, so
  `build-book.mjs` refuses to start while another run holds its lock file.
