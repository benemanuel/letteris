echo %1 %2 >> statistics.txt
findstr %1 ..\%2*|wc.exe >> statistics.txt
