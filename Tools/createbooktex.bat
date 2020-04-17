@echo off
echo html %1
copy head.h temp\%1.html
echo  %1 %2 >> temp\%1.html
echo ^</br^> ^</h2^> >> temp\%1.html
for /f "tokens=1,2,3,4,*" %%a in ('TYPE C:\Users\avi\GitHub\letteris\%1_utf8.txt') do echo (%%b,%%c) %%e >>  temp\%1.html
echo ^</html^> >> temp\%1.html
