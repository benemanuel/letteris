# Plan: single-document book build

**Status: implemented 2026-10-19** - `build-book.mjs`, `page-style.tex`,
`page-content.tex`; `merge-book.mjs --outline-only` gives it the bookmarks.
Tested on pages 85-100, 345-353 and 660-663 (text pages, narrowed letters,
songs, book openings, a section title page, a blank page): every page
pixel-identical to its up-to-date `pageN.pdf`, each font embedded once
(16 pages: 0.1 MB, against ~21 KB per page PDF). `page-master.tex` now inputs the two
shared files (pages 90, 97, 352, 389, 902, 1199 rebuilt identical), and
`rebuild-all.bat` runs `build-book.mjs` as step 4 (2026-10-20).
Differences from the plan below: `\pagestyle{bookpage}` is selected per page
in `page-content.tex` (fancyhdr picks the header layout when it runs); the
per-page reset is `ookpagereset` (text height, Hebrew font) in
`page-style.tex`, also run for blank and section title pages; section title
pages get LaTeX's default `\parskip` and `
aggedbottom` back for their page.

## Why

Every `pageN.pdf` embeds its own subset of each font (different random
prefix, different glyph set), so merging the page PDFs keeps one copy per
page. Measured on pages 1-21: separate files 406 KB, `pdfunite` merge 479 KB,
Ghostscript re-distill 490 KB - 21 copies of MagalithTanachPro in every
case. A full ~1380-page merge would be roughly 25-30 MB. Fonts are only
shared when everything is typeset in **one XeLaTeX run**.

Measured 2026-10-19 on the full merge (`letteris-retypeset.pdf`, 1384
pages): **32.7 MB**, with 6340 embedded font subsets - MagalithTanachPro
1381 times, LM Roman (English headings, numbers) 10/12/9/17 about 1270-1380
times each, LM Roman Caps 95 (the new small-caps Chap./Psalm label). The
page PDFs alone total 29 MB.

## Goal

One XeLaTeX run produces `book.pdf`, each font embedded once, and every page
identical to its `pageN.pdf` (page breaks are already fixed by the boundary
data, and `build-body.mjs` has already chosen each page's fit level, so
`pageN-body.tex` is final).

## 1. Split `page-master.tex` into reusable parts

- **`page-style.tex`** - everything now between `\documentclass` and
  `\begin{document}`: `preamble-common.tex`, `\booktitle*` sizes,
  header/footer (`fancypagestyle`).
- **`page-content.tex`** - everything now inside the document: notes, book
  title, body.
- The odd/even margin switch moves from the preamble into
  `page-content.tex` so it runs per page, and must set both directions
  (`\reversemarginpar` / `\normalmarginpar`) - in one document it can't
  stay set from the previous page.
- **`page-master.tex`** becomes `\documentclass` + `\input{page-style}` +
  `\begin{document}\input{page-content}\end{document}`. Single-page builds
  behave exactly as now.

## 2. New `build-book.mjs [first] [last]`

- For each page in the range, read the page settings (`\def\page...` lines)
  from `pageN.tex` and write into `book.tex`:
  `\begingroup <settings> \input{page-content} \clearpage \endgroup`.
- The page is shipped out inside the group, so the header, footer, notes
  and any narrowed letters apply to that page only.
- Page numbers come from each page's own `\pagecfg`, so a partial range
  (e.g. 1-60) is labelled correctly.
- Pages without a built body are skipped and listed (same as
  `build-body.mjs` does for missing boundary data).
- One xelatex pass (no cross-references).

## 3. Checks

- **Page count:** PDF pages must equal pages included. A mismatch means a
  page spilled over; report which one by finding where the running page
  numbers drift.
- **Fonts:** `pdffonts book.pdf` should show one Hebrew font plus one
  squeezed copy per narrowing step actually used (at most 5), not one per
  page.
- **Spot comparison:** render 2-3 pages of `book.pdf` next to their
  `pageN.pdf` and confirm they're identical.

## 4. Things to watch

- **Narrowed letters:** `\condensebody` redefines `\hebrewfont`. The page
  group should undo it; the build must confirm the next page is back to
  normal width.
- **Run time:** one XeLaTeX run over ~1380 pages may take a few minutes.
- **Missing pages:** none any more - all 1384 pages have boundary data and
  are built (2026-10-19).
- **Pages that don't use `page-master.tex`:** blank pages (662, 988, 990:
  `pageN.tex` = `\input{page-blank.tex}`) and section title pages (351,
  661, 989: `pageN.tex` written by `build-section-title.mjs`). `build-book.mjs`
  needs a way to include these too (e.g. split them the same way, or a
  per-type content file).
- **Per-page settings added since the plan:** `\pagechaplabel` (running-head
  label, empty for Psalms), `\pagebookstart`, notes taller than
  `ootnotesroom` moving the rule up, `\pagefootverses` (page 389). All are
  per-page and must be reset inside each page's group.

## 5. Docs

Add a "Book build" section to `WORKFLOW.md` and list `build-book.mjs`,
`page-style.tex` and `page-content.tex` in its Files table.
