@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "SCRIPT_ROOT=%~dp0"
for %%I in ("%SCRIPT_ROOT%..\..\..\..") do set "PRODUCT_ROOT=%%~fI"
set "REQUIRED_VERSION="
set /p REQUIRED_VERSION=<"%PRODUCT_ROOT%\.node-version"
if not defined REQUIRED_VERSION (
  >&2 echo Buildr Product checkout is missing projects\product\.node-version.
  exit /b 1
)

if defined BUILDR_NODE (
  call :check "%BUILDR_NODE%" && exit /b 0
  >&2 echo Buildr Product checkout requires exact Node.js %REQUIRED_VERSION%; BUILDR_NODE resolved to a different or invalid executable.
  exit /b 1
)

for /f "delims=" %%N in ('where node 2^>nul') do (
  call :check "%%N" && exit /b 0
)

>&2 echo Buildr Product checkout requires exact Node.js %REQUIRED_VERSION%. Set BUILDR_NODE to that executable or activate the Product .node-version before running checkout commands.
exit /b 1

:check
set "CANDIDATE=%~1"
if not exist "%CANDIDATE%" exit /b 1
for /f "delims=" %%V in ('"%CANDIDATE%" -p "process.versions.node" 2^>nul') do (
  if "%%V"=="%REQUIRED_VERSION%" (
    echo %CANDIDATE%
    exit /b 0
  )
)
exit /b 1
