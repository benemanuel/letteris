#to take all parts together again
copy ..\header.txt ..\letteris_utf8.txt
for /F "tokens=1,2" %%a in (..\booksnames.txt) do type ..\%%b_utf8.txt >> ..\letteris_utf8.txt
