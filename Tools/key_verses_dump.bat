@echo off
for /f %%i in (key_verses.txt) do findstr /rc:"\<%%i\>" ..\letteris.utf8_txt >> key_verses_dump.txt
