@echo off
set "START=%~1"
set "END=%~2"

if "%START%"=="" set "START=1"
build %START% %END%
rem echo starting from %START%.
rem for /L %%I in (%START%,1,%END%) do call build %%I