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
for /f "tokens=1 delims=." %%M in ("%REQUIRED_VERSION%") do set /a NEXT_MAJOR=%%M+1

if defined BUILDR_NODE (
  call :check "%BUILDR_NODE%" && exit /b 0
  >&2 echo Buildr Product checkout requires Node.js ^>=%REQUIRED_VERSION% ^<%NEXT_MAJOR%; BUILDR_NODE resolved to an out-of-range or invalid executable.
  exit /b 1
)

for /f "delims=" %%N in ('where node 2^>nul') do (
  call :check "%%N" && exit /b 0
)

>&2 echo Buildr Product checkout requires Node.js ^>=%REQUIRED_VERSION% ^<%NEXT_MAJOR%. Set BUILDR_NODE to a compatible executable or activate the Product .node-version (Node %REQUIRED_VERSION%) before running checkout commands.
exit /b 1

:check
set "CANDIDATE=%~1"
if not exist "%CANDIDATE%" exit /b 1
set "CANDIDATE_VERSION="
for /f "delims=" %%V in ('"%CANDIDATE%" -p "process.versions.node" 2^>nul') do set "CANDIDATE_VERSION=%%V"
if not defined CANDIDATE_VERSION exit /b 1
rem Accept the declared version and any newer Node on the same major line.
for /f "tokens=1-3 delims=." %%A in ("!CANDIDATE_VERSION!") do (
  set "CANDIDATE_MAJOR=%%A"
  set "CANDIDATE_MINOR=%%B"
  set "CANDIDATE_PATCH=%%C"
)
for /f "tokens=1-3 delims=." %%A in ("%REQUIRED_VERSION%") do (
  set "REQUIRED_MAJOR=%%A"
  set "REQUIRED_MINOR=%%B"
  set "REQUIRED_PATCH=%%C"
)
if not "!CANDIDATE_MAJOR!"=="!REQUIRED_MAJOR!" exit /b 1
if not defined CANDIDATE_MINOR set "CANDIDATE_MINOR=0"
if not defined CANDIDATE_PATCH set "CANDIDATE_PATCH=0"
if !CANDIDATE_MINOR! GTR !REQUIRED_MINOR! goto check_accept
if !CANDIDATE_MINOR! LSS !REQUIRED_MINOR! exit /b 1
if !CANDIDATE_PATCH! LSS !REQUIRED_PATCH! exit /b 1
:check_accept
echo %CANDIDATE%
exit /b 0
