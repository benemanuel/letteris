@echo off
for /F %%u in ('findstr %1 ..\booksnames.txt') do echo|set /p="%%u" > ..\docs\book.txt
echo|set /p="%2" >  ..\docs\chap.txt
echo|set /p="%3" >  ..\docs\verse.txt
del ..\docs\find.txt /Q
copy ..\docs\book.txt + tab.txt + ..\docs\chap.txt + tab.txt + ..\docs\verse.txt + eol.txt ..\docs\find.txt >  NUL
for /F "tokens=4" %%i in ('findstr /b /g:..\docs\find.txt  ..\%1.utf8_txt') do set FULLVALUE=%%i
for /F "tokens=2 delims=," %%i in ('findstr %1 workprogress.csv') do set BOOKVALUE=%%i
set /A "COUNT=((%BOOKVALUE%*10)-%FULLVALUE%)/10"
del present_book_status_pre.txt /q
rename present_book_status.txt present_book_status_pre.txt
echo %1 %2 %3 verse %FULLVALUE% left to do %COUNT% verses > present_book_status.txt

