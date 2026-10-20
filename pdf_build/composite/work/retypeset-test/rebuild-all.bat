@echo off
rem Rebuild pages and make the book PDF.
rem   rebuild-all              every page -> letteris-book.pdf (one run) + letteris-retypeset.pdf (merged)
rem   rebuild-all 991 1085     pages 991-1085 -> book-991-1085-onerun.pdf + book-991-1085.pdf
rem Steps: page configs (create-page-config.js), page bodies + PDFs
rem (build-body.mjs), the book title page when the range starts at page 1
rem (build-title-page.mjs, from title_page.txt), merge + bookmarks
rem (merge-book.mjs), then the whole range
rem typeset again in ONE XeLaTeX run with the same bookmarks (build-book.mjs):
rem each font embedded once, so a fraction of the merged file's size.
rem Each step's warnings are printed at its end; the full output also goes to rebuild-all.log.
setlocal
cd /d "%~dp0"

set "START=%~1"
set "END=%~2"
if "%START%"=="" (
  rem Last page with boundary data, from tanach-lib.mjs.
  for /f %%P in ('node --input-type=module -e "import('./tanach-lib.mjs').then((m) => console.log(m.lastPageInData))"') do set "LAST=%%P"
  set "START=1"
)
if "%END%"=="" if "%~1"=="" (call set "END=%%LAST%%") else (set "END=%START%")

echo Rebuilding pages %START%-%END% ...
echo ===== %DATE% %TIME% pages %START%-%END% ===== > rebuild-all.log

echo [1/5] page configs
node create-page-config.js %START% %END% >> rebuild-all.log 2>&1
if errorlevel 1 goto :failed

echo [2/5] page bodies and PDFs (this takes a while)
node build-body.mjs %START% %END% >> rebuild-all.log 2>&1
if errorlevel 1 goto :failed

echo [3/5] title page
if "%START%"=="1" (
  node build-title-page.mjs >> rebuild-all.log 2>&1
  if errorlevel 1 goto :failed
) else (
  echo       skipped - range does not start at page 1
)

echo [4/5] merge and bookmarks
if "%~1"=="" (
  node merge-book.mjs >> rebuild-all.log 2>&1
) else (
  node merge-book.mjs %START% %END% >> rebuild-all.log 2>&1
)
if errorlevel 1 goto :failed

echo [5/5] one-run book (fonts once)
if "%~1"=="" (
  node build-book.mjs >> rebuild-all.log 2>&1
) else (
  node build-book.mjs %START% %END% >> rebuild-all.log 2>&1
)
if errorlevel 1 goto :failed

echo.
echo Done. Warnings:
findstr /R /C:"^  page" /C:"^Warnings" /C:"warning" rebuild-all.log
echo Full output: rebuild-all.log
goto :eof

:failed
echo.
echo FAILED - see the end of rebuild-all.log
powershell -NoProfile -Command "Get-Content rebuild-all.log -Tail 20"
exit /b 1
