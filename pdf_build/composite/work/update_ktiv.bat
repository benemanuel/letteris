@echo off
rem Refresh work\corpus from the corpus API (localhost:8200): pull into
rem work\corpus-new, compare, back up work\corpus, copy in the changed chapters.
rem Report: work\corpus-update-report.txt
cd /d "%~dp0.."
node src\10-corpus-update.js --apply --apply-renumbered
