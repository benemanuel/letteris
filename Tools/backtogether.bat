@echo off
del ..\Sos.utf8_txt
rename ..\Songofsongs.utf8_txt Sos.utf8_txt
echo backtogether - to take all parts together again
copy ..\header.txt + ..\tmp.tmp ..\letteris.utf8_txt  >  NUL
for /F "tokens=1,2" %%a in (..\booksnames.txt) do type ..\%%b.utf8_txt >> ..\letteris.utf8_txt
updatehtml.bat
rem del %date%.tmp /q
rem del ..\%date%.tmp /q
