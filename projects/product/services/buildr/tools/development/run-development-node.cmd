@echo off
setlocal EnableExtensions
set "SCRIPT_ROOT=%~dp0"
for /f "delims=" %%N in ('call "%SCRIPT_ROOT%resolve-development-node.cmd" 2^>nul') do if not defined NODE set "NODE=%%N"
if not defined NODE exit /b 1
"%NODE%" %*
exit /b %ERRORLEVEL%
