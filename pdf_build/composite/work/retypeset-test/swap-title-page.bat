@echo off
rem Rebuild the title page from title_page.txt and put it in place of page 1
rem of an already-built book, without rebuilding the book.
rem   swap-title-page                       letteris-book.pdf
rem   swap-title-page book-1-50-onerun.pdf  that book instead
rem Bookmarks are kept. The book must have been built from page 1.
setlocal
cd /d "%~dp0"

node build-title-page.mjs
if errorlevel 1 goto :failed
python swap-title-page.py %1
if errorlevel 1 goto :failed
exit /b 0

:failed
echo FAILED
exit /b 1
