# to seperate original to book based files
findstr ^# letteris.utf8_txt > header.txt
for /F "tokens=1,2" %a in (booksnames.txt) do findstr ^%a letteris.utf8_txt > %b.utf8_txt
