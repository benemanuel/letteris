@echo off
echo backtogether - to take all parts together again
copy ..\header.txt + ..\%date%.tmp ..\letteris.utf8_txt 
for /F "tokens=1,2" %%a in (..\booksnames.txt) do type ..\%%b.utf8_txt >> ..\letteris.utf8_txt
updatehtml.bat
del %date%.tmp /q
del ..\%date%.tmp /q
