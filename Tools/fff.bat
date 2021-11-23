@echo off
for /F %%u in ('findstr %1 ..\booksnames.txt') do echo|set /p="%%u" > temp\book.txt
echo|set /p="%2" >  temp\chap.txt
echo|set /p="%3" >  temp\verse.txt
del temp\find.txt /Q
copy temp\book.txt + tab.txt + temp\chap.txt + tab.txt + temp\verse.txt + eol.txt temp\find.txt >  NUL
for /F "tokens=4" %%i in ('findstr /b /g:temp\find.txt  ..\%1.utf8_txt') do set FULLVALUE=%%i
for /F "tokens=2 delims=," %%i in ('findstr %1 workprogress.csv') do set BOOKVALUE=%%i
set /A "COUNT=((%BOOKVALUE%*10)-%FULLVALUE%)/10"
echo %1 %2 %3 verse %FULLVALUE% left to do %COUNT% verses > present_book_status.txt

