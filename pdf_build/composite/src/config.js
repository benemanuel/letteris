// Project configuration.
//
// Everything measured from the actual files rather than assumed.  The three
// scans are the same typesetting: each prints the same folio on the same
// printed page, so they are related to the printed page by a constant offset
// (verified across 14 hundred-page blocks per source, no drift).

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const INPUT_DIR = path.join(ROOT, 'input');
export const WORK_DIR = path.join(ROOT, 'work');
export const OUTPUT_DIR = path.join(ROOT, 'output');
export const MANIFEST_PATH = path.join(WORK_DIR, 'manifest.json');

// The printed book. The Tanakh body ends on printed page 1384 (2 Chronicles 36
// begins on 1382); the Vienna scans carry a few unnumbered leaves after that,
// and the HPC reprint carries more. Composite covers the body only.
export const FIRST_PRINTED_PAGE = 1;
export const LAST_PRINTED_PAGE = 1384;

// Source scans.
//
//   offset      fileIndex = printedPage + offset  (1-based PDF page number)
//   mrc         page is Mixed Raster Content: a low-res background image plus
//               a high-res JBIG2 stencil mask carrying the text. Rendering
//               composites the two, so a naive raster of an MRC page looks
//               softer and greyer than the text detail it actually holds.
//               This must be accounted for when comparing sources.
//   nativeDpi   effective resolution of the page's main image
export const SOURCES = [
  {
    id: 'vienna-1872',
    pdf: path.join(INPUT_DIR, 'vienna-1872.pdf'),
    fallbackPdf: path.join(ROOT, '..', 'Letteris_Tanakh_Vienna_1872.pdf'),
    // no text layer at all; folios come from the header-strip OCR index
    ocrIndex: path.join(ROOT, '..', 'Letteris_Tanakh_Vienna_1872.headers.txt'),
    offset: 4,
    pages: 1392,
    mrc: false,
    nativeDpi: 72,
    note: 'plain grayscale JPEG, already cleaned to a white ground',
  },
  {
    id: 'vienna-1882',
    pdf: path.join(INPUT_DIR, 'vienna-1882.pdf'),
    fallbackPdf: path.join(ROOT, '..', 'Letteris_Tanakh_Vienna_1882.pdf'),
    offset: 6,
    pages: 1394,
    mrc: true,
    nativeDpi: 300,
    note: 'MRC: 2268x4120 JBIG2 text mask over a compressed colour ground',
  },
  {
    id: 'hpc-1910',
    pdf: path.join(INPUT_DIR, 'hpc-1910.pdf'),
    fallbackPdf: path.join(ROOT, '..', 'Letteris_Tanakh.pdf'),
    // text layer exists but mangles the folio; the header OCR reads it
    ocrIndex: path.join(ROOT, '..', 'final_bible_index.txt'),
    offset: 6,
    pages: 1403,
    mrc: true,
    nativeDpi: 150,
    note: 'Internet Archive scan of the Hebrew Publishing Co. New York reprint',
  },
];

export const SOURCE_IDS = SOURCES.map((s) => s.id);
export const sourceById = (id) => SOURCES.find((s) => s.id === id);

// How pages are rendered for the composite.
//
//   'mask'      for MRC sources, extract the JBIG2 text layer and present it
//               as black on white. Sharpest possible marks, and the grey
//               compressed ground disappears entirely. The result is a
//               processed image, not a facsimile of the scan.
//   'faithful'  render the page as the PDF presents it, grey ground and all.
//
// Chosen: 'mask' - the goal is the clearest legible text, not a facsimile.
// A source with no mask (vienna-1872 is a plain grayscale JPEG) always renders
// faithfully, since there is no text layer to lift.
//
// Analysis deliberately stays on the faithful render even in mask mode: the
// grey ground is where fading, show-through and binding shadows are visible,
// and the bitonal mask has already thrown that information away.
export const RENDER_MODE = process.env.RENDER_MODE || 'mask';

// Resolution everything is normalised to before scoring, so that a 72 dpi
// source and a 300 dpi source are compared on surviving detail rather than
// pixel count.
export const SCORE_DPI = 150;

// Text-block crop used for scoring, as a fraction of the page. Excludes the
// binding shadow and the outer margin, both of which vary by scan and would
// otherwise dominate the statistics.
export const CROP_BOXES = {
  'vienna-1872': { top: 0.06, bottom: 0.06, left: 0.10, right: 0.10 },
  'vienna-1882': { top: 0.06, bottom: 0.06, left: 0.10, right: 0.10 },
  'hpc-1910': { top: 0.06, bottom: 0.06, left: 0.10, right: 0.10 },
};

// A page is auto-decided when the winner beats the runner-up by this margin.
export const AUTO_DECIDE_MARGIN = 0.20;
