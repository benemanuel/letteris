@echo off
echo rebuild
cd Tools
backtogether.bat
del %date%.tmp /q
cd ..
del %date%.tmp /q
