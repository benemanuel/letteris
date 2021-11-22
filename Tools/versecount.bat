@echo off
for /F "tokens=2,4" %%a in ('findstr "until" %%userprofile%%\GitHub\letteris\README.md') do for /F "tokens=1,2 delims=:" %%i in ("%%b") do fff %%a %%i %%j

