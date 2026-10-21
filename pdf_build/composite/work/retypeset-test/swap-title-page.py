# Replace page 1 of a built book with title-page.pdf, without rebuilding the book.
#
#   python swap-title-page.py                      -> letteris-book.pdf
#   python swap-title-page.py book-1-50-onerun.pdf -> that book instead
#
# The old page object is kept and given the new page's content, so every
# bookmark and link that points at page 1 still does. Run build-title-page.mjs
# first (swap-title-page.bat does both).
import os
import sys

from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject

# --- Config
TITLE_PAGE_FILE = 'title-page.pdf'
DEFAULT_BOOK = 'letteris-book.pdf'
PAGE_KEYS = ('/Contents', '/Resources', '/MediaBox', '/CropBox', '/TrimBox', '/BleedBox', '/ArtBox')

here = os.path.dirname(os.path.abspath(__file__))
book = os.path.join(here, sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BOOK)
title = os.path.join(here, TITLE_PAGE_FILE)
for f in (book, title):
    if not os.path.exists(f):
        sys.exit(f'missing: {f}')

w = PdfWriter(clone_from=book)
old = w.pages[0]
w.insert_page(PdfReader(title).pages[0], 0)  # copies the title page's objects into w
new = w.pages[0]
for key in PAGE_KEYS:
    if key in new:
        old[NameObject(key)] = new[key]
    elif key in old:
        del old[key]
w.remove_page(0)
w.compress_identical_objects(remove_duplicates=False, remove_unreferenced=True)

# Write beside the book, then replace it, so a failure never leaves half a file.
tmp = book + '.tmp'
w.write(tmp)
os.replace(tmp, book)
print(f'title page swapped into {os.path.basename(book)} ({len(w.pages)} pages)')
