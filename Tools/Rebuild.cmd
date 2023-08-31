@echo off
cd %userprofile%\GitHub\letteris\Tools
notepad %userprofile%\GitHub\letteris\README.md
rem in first pass "until" was the book, from here on it's the date of change 
for /F "tokens=3,4" %%a in ('findstr "until" %userprofile%\GitHub\letteris\README.md') do set CLIPBOARD_TEXT="Edited updated  %%a %%b"
echo %CLIPBOARD_TEXT% | clip
echo %CLIPBOARD_TEXT% > ..\tmp.tmp
rem echo backtogether - to take all parts together again
copy ..\header.txt + ..\tmp.tmp ..\letteris.utf8_txt  >  NUL
rem echo updatehtml - create html files
copy head.h + ..\tmp.tmp + body.h ..\docs\index.html /y >  NUL
for /F "tokens=1,2" %%a in (..\booksnames.txt) do type ..\%%b.utf8_txt >> ..\letteris.utf8_txt
del statistics.txt /q
for /F "tokens=1,2" %%a in (..\booksnames.txt) do statistics.bat %%a %%b
rem from this point on the batch stops working
findstr Version ..\metadata.txt
notepad ..\metadata.txt
pause
rem create zip version of letteris
7z a ..\letteris.zip ..\letteris.utf8_txt
rem for /F "tokens=1,2,3" %a in (%userprofile%\GitHub\letteris\booksnames.txt) DO createbooktex.bat %b %c 
for /F "tokens=1,2,3" %%a in (%userprofile%\GitHub\letteris\booksnames.txt) DO createbooktex.bat %%b %%c 
del *.tmp /q
del ..\*.tmp /q
createallbooks.bat
echo to update html on server update GitHUB and follow instructions
echo /var/www/hatanach/verse/setup/create/howto.txt
