@echo off
del tails.txt
del eof.txt
for /F "tokens=1,2,3" %%a in (%userprofile%\GitHub\letteris\booksnames.txt) DO powershell Get-Content "%%b.utf8_txt" -tail 1 >> tails.txt
for /F "tokens=1,2,3,4" %%a in (tails.txt) DO echo %%a %%d >> eof.txt
