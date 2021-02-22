@echo off
echo updatehtml - create html files
copy head.h + ..\%date%.tmp + body.h temp\index.html /y
for /F "tokens=1,2,3" %%a in (%userprofile%\GitHub\letteris\booksnames.txt) DO createbooktex.bat %%b %%c


