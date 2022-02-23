@echo off
del *.tmp /q
del ..\*.tmp /q
echo push html to server
REM Get-Date   -UFormat   "%d-%b-%Y" 
:USB
IF EXIST a:\misc\ocean.pvt.ppk goto UPDATE
echo "Insert USB"
pause
goto USB
:UPDATE
rmdir %..\docs%\upload /q/s
mkdir %..\docs%\upload
xcopy %userprofile%\GitHub\letteris\docs\*.html %..\docs%\upload\. /m
pscp -P 22 -scp -i a:\misc\ocean.pvt.ppk %..\docs%\upload\* root@geulah.org.il:/var/www/geulah/HaTanach/.
echo %1
createallbooks.bat
rem versecount.bat


