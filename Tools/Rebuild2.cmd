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
rmdir %temp%\upload /q/s
mkdir %temp%\upload
xcopy %userprofile%\GitHub\letteris\tools\temp\*.html %temp%\upload\. /m
pscp -P 22 -scp -i a:\misc\ocean.pvt.ppk %temp%\upload\* root@geulah.org.il:/var/www/geulah/HaTanach/.
echo %1
rem versecount.bat


