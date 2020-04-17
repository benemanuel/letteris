@echo off
rem create html files
for /F "tokens=1,2,3" %%a in (C:\Users\avi\GitHub\letteris\booksnames.txt) DO createbooktex.bat %%b %%c
copy head.h + ..\%date%.tmp + body.h temp\index.html /y
\temp\updatehtml.bat
del ..\%date%.tmp /q

