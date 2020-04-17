@echo off
echo backtogether - to take all parts together again
copy ..\header.txt + ..\%date%.tmp ..\letteris_utf8.txt 
for /F "tokens=1,2" %%a in (..\booksnames.txt) do type ..\%%b_utf8.txt >> ..\letteris_utf8.txt
call updatehtml.bat
del ..\%date%.tmp /q
