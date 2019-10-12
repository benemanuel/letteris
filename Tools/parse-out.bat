# to seperate original to book based files
findstr ^# letteris_utf8.txt > header.txt
for /F "tokens=1,2" %a in (booksnames.txt) do findstr ^%a letteris_utf8.txt > %b_utf8.txt
