@echo off
for /F "tokens=1,2,3" %%x in (%userprofile%\GitHub\letteris\booksnames.txt) DO for /f "tokens=1,2,3,4,*" %%a in ('TYPE %userprofile%\GitHub\letteris\%%y.utf8_txt') DO echo Book %%a Chap %%b Verse %%c Index %%d Text "%%e"
