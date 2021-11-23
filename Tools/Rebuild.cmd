@echo off
notepad %userprofile%\GitHub\letteris\readme.md
ren echo start
for /F "tokens=2,4" %%a in ('findstr "until" %userprofile%\GitHub\letteris\README.md') do set CLIPBOARD_TEXT="Edited until  %%a %%b"
echo %CLIPBOARD_TEXT% | clip
for /F "tokens=2,4" %%a in ('findstr "until" %userprofile%\GitHub\letteris\README.md') do echo #Edited %date% until  %%a %%b > tmp.tmp
cd %userprofile%\GitHub\letteris\Tools
rem echo backtogether - to take all parts together again
copy ..\header.txt + ..\tmp.tmp ..\letteris.utf8_txt  >  NUL
for /F "tokens=1,2" %%a in (..\booksnames.txt) do type ..\%%b.utf8_txt >> ..\letteris.utf8_txt
rem echo updatehtml - create html files
copy head.h + ..\tmp.tmp + body.h temp\index.html /y >  NUL
echo if no notice then run rebuild2.cmd %CLIPBOARD_TEXT%
for /F "tokens=1,2,3" %%a in (%userprofile%\GitHub\letteris\booksnames.txt) DO createbooktex.bat %%b %%c 
echo run rebuild2.cmd %CLIPBOARD_TEXT%

