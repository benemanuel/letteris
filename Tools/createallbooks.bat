del ..\allbooks.zip /q
for /F "tokens=1,2,3" %%a in (%userprofile%\GitHub\letteris\booksnames.txt) DO 7z a ..\allbooks.zip ..\%%b.utf8_txt
