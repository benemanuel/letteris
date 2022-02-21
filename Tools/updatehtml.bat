@echo off
echo updatehtml - create html files
copy head.h + ..\tmp.tmp + body.h ..\docs\index.html /y
for /F "tokens=1,2,3" %%a in (%userprofile%\GitHub\letteris\booksnames.txt) DO createbooktex.bat %%b %%c


