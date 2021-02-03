@echo off
notepad %userprofile%\GitHub\letteris\readme.md
echo start
for /F "tokens=2,4" %%a in ('findstr "until" %userprofile%\GitHub\letteris\README.md') do set CLIPBOARD_TEXT=" Edited until  %%a %%b"
echo %CLIPBOARD_TEXT% | clip
for /F "tokens=2,4" %%a in ('findstr "until" %userprofile%\GitHub\letteris\README.md') do echo #Edited %date% until  %%a %%b > %date%.tmp
cd %userprofile%\GitHub\letteris\Tools
echo backtogether - to take all parts together again
copy ..\header.txt + ..\%date%.tmp ..\letteris_utf8.txt 
for /F "tokens=1,2" %%a in (..\booksnames.txt) do type ..\%%b_utf8.txt >> ..\letteris_utf8.txt
echo updatehtml - create html files
copy head.h + ..\%date%.tmp + body.h temp\index.html /y
echo if no notice then run \temp\readme2.bat
for /F "tokens=1,2,3" %%a in (%userprofile%\GitHub\letteris\booksnames.txt) DO createbooktex.bat %%b %%c
echo run \temp\readme2.bat %CLIPBOARD_TEXT%

