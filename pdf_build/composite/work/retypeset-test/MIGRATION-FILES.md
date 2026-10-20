# Files the retypeset build uses (for moving it elsewhere)

Traced from the scripts on 2026-10-20: every file `rebuild-all.bat` and the
scripts it runs read (create-page-config.js, build-body.mjs,
build-section-title.mjs, build-title-page.mjs, merge-book.mjs,
build-book.mjs), plus the TeX files they `\input`.

Paths below are relative to `C:\temp\ocr`. **The scripts find their data by
relative path**, so either keep this layout under the new root, or change the
path constants listed under "Paths baked into the code".

## 1. Scripts and TeX templates — `composite/work/retypeset-test/`

| file | role |
|---|---|
| `rebuild-all.bat` | the full build: 5 steps below |
| `tanach-lib.mjs` | shared library; all data paths start here |
| `create-page-config.js` | step 1: writes `pageN.tex` |
| `build-section-title.mjs` | section title pages 351, 661, 989 (run by step 1) |
| `build-body.mjs` | step 2: `pageN-body.tex`, `pageN-notes.tex`, page PDFs, fitting |
| `build-title-page.mjs` | step 3: book title page |
| `merge-book.mjs` | step 4: merged PDF + bookmarks (`book-outline.json`) |
| `build-book.mjs` | step 5: one-run book PDF |
| `preamble-common.tex` | geometry, fonts, base macros (every page) |
| `page-style.tex` | header/footer/styles (inputs `preamble-common.tex`) |
| `page-content.tex` | page notes + body |
| `page-master.tex` | `page-style.tex` + `page-content.tex` (each `pageN.tex` inputs it) |
| `page-blank.tex` | blank pages 662, 988, 990 |

Optional (not run by `rebuild-all.bat`):

| file | role |
|---|---|
| `build.bat`, `config.bat`, `maketex.bat`, `allpdf.bat` | shortcuts for steps 1-2 / one page |
| `set-boundary.mjs` | changes a page boundary and rebuilds; **also needs `composite/src/`** (runs `src/43-apply-boundary-verdicts.js`, which imports `config.js`, `41-boundary-words.js`, `lib/cli.js` and more of the OCR pipeline) |
| `audit-seams.mjs` | seam check; also reads `work/catchwords.json` |
| `build-haftarot.mjs`, `haftara-recommendations.mjs` | make `work/haftarot.json` / the recommendations from `word_notes.json`; not used by the build itself |
| `WORKFLOW.md`, `BOOK-BUILD-PLAN.md`, `tex-editing-history.md` | docs |

Not needed: `magalith Tanach Pro.otf` in this folder (an identical copy; the
font is loaded from `vendor/fonts/`), `OLD/`, `probe*`, `test*`, `preview88*`,
`_s221.png`, `showpdf.bat`, `openpdf.bat`, `generate-all-pages.sh` (old).

## 2. Data — `composite/work/` (the scripts' `WORK`)

| file | read by |
|---|---|
| `boundary-words-final.json` | tanach-lib (first/last word of every page) |
| `boundary-verdicts.json` | tanach-lib (`_blankPages`) |
| `corpus/` (929 files, `<Book>-NNN.json`, 32 MB) | tanach-lib (`loadChapter`): the text |
| `word_notes.json` (2 MB) | build-body (footnotes, masora circles, masora finalis) |
| `song-layouts.json` | build-body (songs) |
| `scan-breaks.json` | build-body |
| `psalms-books.json` | tanach-lib (Psalms sub-books) |
| `haftarot-table.json` | merge-book (haftara bookmarks) |

## 3. Data — project root `C:\temp\ocr\`

| file | read by |
|---|---|
| `tanach.json` | tanach-lib, build-section-title (books, groups, names) |
| `parshiot.json` | tanach-lib (parashot) |
| `title_page.txt` | build-title-page |

## 4. Font — `composite/vendor/fonts/`

| file | |
|---|---|
| `magalith Tanach Pro.otf` | loaded by `Path = ../../vendor/fonts/` |

## 5. Generated (copy to skip a full rebuild, or let the build remake them)

In `retypeset-test/`, per page: `pageN.tex`, `pageN-body.tex`,
`pageN-notes.tex`, `pageN.pos`, `pageN.pdf` (+ `.aux/.log/.xdv`, not needed),
and `title-page.tex/.pdf`, `spacing-report.json/.md`, `book-outline.json`.
`build-book.mjs` needs every page's `pageN.tex` + `-body.tex` + `-notes.tex`;
`merge-book.mjs` needs the `pageN.pdf` files. Rebuilding all of them is step 2
of `rebuild-all.bat` (the slow one).

## Paths baked into the code

| where | path | points at |
|---|---|---|
| `tanach-lib.mjs:9` | `WORK = HERE/..` | `composite/work` |
| `tanach-lib.mjs:10`, `build-section-title.mjs:43` | `WORK/../../tanach.json` | project root |
| `tanach-lib.mjs:226` | `WORK/../../parshiot.json` | project root |
| `build-title-page.mjs:20` | `WORK/../../title_page.txt` | project root |
| `preamble-common.tex:16,20`, `build-title-page.mjs:74` (generated `title-page.tex`) | `../../vendor/fonts/` | font folder |
| `set-boundary.mjs:52` | `WORK/..` (`composite`) | `src/` pipeline |
| `build-body.mjs:30` | `http://localhost:8200/api/citation/v2` | kri API; only used when `RENDER_KRI = true` (currently false) |

Simplest move: copy so the new root has the same shape —
`<root>/tanach.json`, `parshiot.json`, `title_page.txt`,
`<root>/composite/vendor/fonts/`, `<root>/composite/work/<data>`,
`<root>/composite/work/retypeset-test/<scripts>` — and nothing needs editing.

## Module type

The `.js` scripts are ES modules: in the original folder `composite/package.json`
(the OCR pipeline's) sets `"type": "module"`. A copy needs a `package.json` with
`"type": "module"` at or above `retypeset-test/` (the pdf_build copy has a minimal
one in `composite/`), or node warns and reparses each `.js` file.

## Tools needed on the new machine/folder

- Node.js (ES modules, global `fetch` only if RENDER_KRI is turned on)
- XeLaTeX (TeX Live; packages fontspec, polyglossia, geometry, fancyhdr,
  tikz, ifthen, subscript)
- Python with `pypdf` (merge-book.mjs)
- `pdffonts` (poppler/xpdf; build-book.mjs font report, optional)
