@echo off
setlocal EnableExtensions
set "SCRIPT_ROOT=%~dp0"
for /f "delims=" %%N in ('call "%SCRIPT_ROOT%resolve-development-node.cmd" 2^>nul') do if not defined NODE set "NODE=%%N"
if not defined NODE exit /b 1
for %%I in ("%NODE%") do set "NODE_ROOT=%%~dpI"
set "PATH=%NODE_ROOT%;%PATH%"
set "NPM_CLI=%NODE_ROOT%node_modules\npm\bin\npm-cli.js"
if not exist "%NPM_CLI%" set "NPM_CLI=%NODE_ROOT%..\lib\node_modules\npm\bin\npm-cli.js"
if not exist "%NPM_CLI%" (
  >&2 echo Exact Buildr Product Node does not provide its adjacent npm CLI.
  exit /b 1
)
"%NODE%" "%NPM_CLI%" %*
exit /b %ERRORLEVEL%
