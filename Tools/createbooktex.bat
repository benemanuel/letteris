@echo off
SETLOCAL
FOR /F "tokens=* USEBACKQ" %%F IN (`attrib %userprofile%\GitHub\letteris\%1.utf8_txt`) DO SET var=%%F
IF "%VAR:~0,1%" == "A" GOTO NOFILE
:YESFILE
EXIT /B 0
:NOFILE
rem   @ECHO %1 Changed.
   attrib %userprofile%\GitHub\letteris\%1.utf8_txt -a
   echo html %1
   copy head.h temp\%1.html
   echo  %1 %2 >> temp\%1.html
   echo ^</br^> ^</h2^> >> temp\%1.html
   for /f "tokens=1,2,3,4,*" %%a in ('TYPE %userprofile%\GitHub\letteris\%1.utf8_txt') do echo (%%b,%%c) %%e >>  temp\%1.html
   echo ^</html^> >> temp\%1.html
