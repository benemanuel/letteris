@echo off
SETLOCAL
FOR /F "tokens=* USEBACKQ" %%F IN (`attrib %userprofile%\GitHub\letteris\%1.utf8_txt`) DO SET var=%%F
IF "%VAR:~0,1%" == "A" GOTO NEWFILE
:DONEFILE
EXIT /B 0
:NEWFILE
rem   @ECHO %1 Changed.
   attrib %userprofile%\GitHub\letteris\%1.utf8_txt -a
   echo create html %1
   copy head.h ..\docs\%1.html  >  NUL
   echo  %1 %2 >> ..\docs\%1.html
   echo ^</br^> ^</h2^> >> ..\docs\%1.html
rem  html text only file
rem for /f "tokens=1,2,3,4,*" %%a in ('TYPE %userprofile%\GitHub\letteris\%1.utf8_txt') do echo (%%b,%%c) %%e >>  ..\docs\%1.html
rem  html with verse links
  for /f "tokens=1,2,3,4,*" %%a in ('TYPE %userprofile%\GitHub\letteris\%1.utf8_txt') do echo ^<a target = '_blank' href='https://geulah.org.il/HaTanach/verse/?verse=%%d'/^> (%%b,%%c)^</a^> %%e >>  ..\docs\%1.html
   echo ^</html^> >> ..\docs\%1.html
