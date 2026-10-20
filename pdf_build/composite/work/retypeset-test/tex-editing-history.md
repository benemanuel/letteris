# page1.tex editing history

Chronological record of what was tried on the retypesetting prototype
(`page1.tex` / `page1-body.tex` / `build-body.mjs`), kept so a later
session doesn't repeat a dead end. Job names (`page1b`, `page1q`, ...)
are the `-jobname` used for that compile; the `.tex`/`.pdf`/`.png` files
themselves were not all kept on disk, only the final state is.

## Large/small letter (`\initial` → `\largeletter`/`\smallletter`)

1. **First attempt (`page1`/`page1b`).** Hardcoded to word 1 of the book
   only, as `\initial`. Plain inline `{\fontsize{34}{34}\selectfont #1}`,
   no box tricks. **Looked right** at this stage, per direct user
   confirmation later - this is the version everything since should have
   been compared against.
2. Feedback: "who asked for this?" - 34pt was read as unprompted scope
   creep (true: nothing in the request asked for an oversized initial,
   it was added from the plan doc's general mention of the convention).
3. Vertical-overflow fix attempt: `\smash` + `\raisebox` - detached the
   glyph from line metrics entirely, left it floating above the column
   instead of integrated with it. Wrong diagnosis (assumed a vertical
   collision-with-header problem).
4. Reserved-space fix attempt: keep real height, add `\vspace` before the
   paragraph to make room. Did not fix the actual complaint, because the
   actual complaint turned out to be horizontal, not vertical.
5. User clarified: "too far right, outside the column" - a horizontal
   problem the whole time.
6. `\makebox[0pt][r]` fix: eliminated the right-overflow but made the
   glyph overlap/overwrite the following letters (zero-width box = next
   letter starts at the same position).
7. **Redesign, correctly scoped**: realized `\initial` was conceptually
   wrong - this is the general Masoretic large/small-letter convention
   (any letter, anywhere), not a book-opening special case. Rebuilt as
   `\largeletter`/`\smallletter` driven by `typography.json` (real data:
   citation + 1-based base-letter index + large/small). Found and fixed a
   real bug in the process: `typography.json`'s book-name strings
   ("1Samuel", "Songofsongs", ...) don't match this project's short codes
   ("1Sam", "Song", ...) - needed an explicit mapping table.
8. Re-tried `\makebox[0pt][r]` in the general version - same overlap bug
   as step 6.
9. `\settowidth` + `\makebox[\letterw][r]` (box sized to the NORMAL-size
   glyph's own width): fixed the overlap, but user reported it still
   overflows the column to the right.
10. Pixel-measured the actual PNG (via `sharp`) instead of eyeballing:
    confirmed ~9.7pt real overflow past the column edge.
11. Hypothesis: the corpus text embeds U+05AF (masora circle) literally in
    `ktiv` to flag the marked letter - assumed rendering that circle as
    ink was the extra width. Stripped it (`stripAnnotations` in
    `build-body.mjs` - this strip is correct and stays, the circle should
    never print) and re-measured. **Overflow was unchanged (~9.7pt).**
    Wrong hypothesis, but the strip itself was still a real, separate bug
    worth keeping fixed.
12. Isolated the glyph directly: `probe.tex` with `\fbox` around the
    13pt and 17pt renderings. Ink visibly crossed the frame at both
    sizes - concluded this font's bet+shva+dagesh cluster has real ink
    overhang past its own advance width, invisible at reading size,
    proportionally larger when enlarged.
13. Kern-compensation fix: `\kern-10pt{glyph}\kern10pt` inside the
    right-aligned makebox (kerns cancel for alignment math, net effect
    is to shift the drawn glyph left without moving the box's measured
    edges). Tested in `probe.tex` first - looked contained. Applied to
    the real page: **overflow got worse (~19pt)**, not better.
14. Realized the kern direction was backwards for this context: tested
    `-10pt`/`+10pt` ordering versus `+10pt`/`-10pt` side by side in
    `probe.tex`. Confirmed `+10pt` leading (not `-10pt`) is what actually
    shifts the glyph left here - plausibly a sign interaction between raw
    `\kern` and the `bidi` package's RTL reordering, not fully explained.
15. Applied the corrected `+10pt` sign to the real page. Pixel-measured:
    overflow down to 1.8pt (negligible). **But** user reported the glyph
    now sits ON TOP of the next letters (ר/א) - overcorrected in the
    other direction.
16. Re-isolated in a frame-free probe (`probe2.tex`, no `\fbox`, since the
    frame border itself had been contaminating earlier pixel
    measurements by reading as ink at a fixed position regardless of
    glyph size). **This isolated probe showed NO overflow at all**, for
    either the plain 17pt glyph or the makebox+following-text version -
    contradicting the real full-paragraph measurement entirely. Concluded
    the isolated probe does not reproduce whatever is actually happening
    in the real justified multi-word paragraph context (full-line
    interword stretch was the leading unconfirmed suspect) - probing in
    isolation was no longer trustworthy for this problem.
17. Tried reducing the kern to `+4pt` (empirical guess, not re-derived)
    directly on the real page as a compromise between steps 13-15's
    results. Not fully evaluated before the next correction arrived.
18. **User: "in page1b the bet was alright, now it's sitting on the next
    letter. What's going wrong?"** - the correct read: every fix from
    step 6 onward had been chasing and partially-reproducing a problem
    through increasingly complex machinery, without ever landing back on
    something as clean as the very first (step 1) plain-inline version,
    and each fix for one symptom (overflow vs. overlap) kept
    reintroducing the other. **Reverted entirely to step 1's approach**:
    plain `{\fontsize{17}{13}\selectfont #1}`, no `\settowidth`, no
    `\makebox`, no `\kern`. Rendered clean, matching page1b's look.

**Lesson for next time, stated directly:** when a fix for problem A
breaks problem B, and a fix for B breaks A again across multiple rounds,
stop adding machinery and check whether the ORIGINAL simplest version
(before any of the fixes) already looked right for reasons not yet
understood - it did, here, and four-plus rounds of increasingly clever
box/kern tricks were net-negative versus just reverting. Also: an isolated
probe is only trustworthy if it actually reproduces the failure (step 16
did not) - don't keep trusting a probe's result once it has visibly
diverged from the real page's behavior.

## Verse-number margin placement (`\vnum`)

- Started on the `marginnote` package. Two verse numbers landing close
  together (real, confirmed against the scan: Gen1:2/1:3 share one
  printed line) caused overlap, and numbers right after a `\petuchah`
  sometimes fell back to inline instead of the margin.
- Switched to core LaTeX `\marginpar`, which has built-in overlap
  avoidance (stacks rather than overlapping). Fixed the overlap.
- Removed `\petuchah`'s manual `\vspace{1mm}` (which was interleaved
  between its `\par` and the next paragraph's first line) in favor of a
  global `\parskip` - manual `\vspace` in that exact spot was suspected of
  throwing off `\marginpar`'s line-association bookkeeping.
- Result after that change: verse 9's number now lines up correctly.
  Verses 6 and 14 (same petuchah-adjacency shape) still land one line
  early. **Not yet resolved** - user indicated this has an easy fix they
  already described, not yet applied as of this file's writing.
- Known, separate, still-open gap: the real edition's convention of
  placing two close verse numbers side by side on one margin row
  (confirmed real, not just a stacking inconvenience) - `\marginpar` only
  stacks vertically, never places side by side. Needs real line-position
  awareness (e.g. `zref-savepos`) to solve properly.

## Page-break-is-not-a-paragraph-break (`\parfillskip`)

- First attempt: keep one continuous paragraph across the page cut, force
  the break with `\pagebreak[4]` - unreliable, only a penalty hint that
  may not land where placed.
- `\linebreak[4]\pagebreak[4]` together - worked on a single compile pass,
  but gave a different (wrong) result on a second pass (needed anyway for
  `marginpar`/cross-reference resolution) - not deterministic.
- **Settled design**: generate each page as its own separate paragraph,
  end it inside `{\parfillskip=0pt ... \par}` to force the true last line
  flush (removes the infinite trailing stretch that normally lets a
  paragraph's genuine final line sit short/ragged). Deterministic,
  generalizes directly to "one real paragraph per page from the boundary
  table."
- Had to additionally scope this so `\petuchah`'s own intentionally-short
  line wasn't also flattened by the same `\parfillskip=0pt` - its own
  `\par` restores default fill locally.

## Source-formatting-only change

- `\petuchah` (and `\setumah`/`\parashabreak`) now end their own line in
  the *generated* `.tex` source (`build-body.mjs` tracks a per-piece
  separator, `\n` after a marker instead of a space) - purely for
  readability of the generated file, confirmed to have zero effect on
  the typeset output.
