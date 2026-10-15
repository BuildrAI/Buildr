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
  >&2 echo Buildr Product checkout requires Node.js ^>=%REQUIRED_VERSION%; BUILDR_NODE resolved to an out-of-range or invalid executable.
  exit /b 1
)

for /f "delims=" %%N in ('where node 2^>nul') do (
  call :check "%%N" && exit /b 0
)

>&2 echo Buildr Product checkout requires Node.js ^>=%REQUIRED_VERSION%. Set BUILDR_NODE to a compatible executable or activate the Product .node-version (Node %REQUIRED_VERSION%) before running checkout commands.
exit /b 1

:check
set "CANDIDATE=%~1"
if not exist "%CANDIDATE%" exit /b 1
rem Compare with Node itself to avoid cmd integer limits and accept newer majors.
"%CANDIDATE%" -e "const parse=value=>/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(value)?value.split('.').map(Number):null; const actual=parse(process.versions.node), required=parse(process.argv[1]); if(actual===null||required===null||actual.every(Number.isSafeInteger)===false||required.every(Number.isSafeInteger)===false)process.exit(1); let order=0; for(let i=0;i<3;i++){if(actual[i]===required[i])continue;order=actual[i]>required[i]?1:-1;break;}process.exit(order>=0?0:1);" "%REQUIRED_VERSION%" >nul 2>nul
if errorlevel 1 exit /b 1
echo %CANDIDATE%
exit /b 0
