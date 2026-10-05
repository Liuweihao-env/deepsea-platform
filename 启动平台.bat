@echo off
REM ============================================================
REM  Deep-sea Aquaculture Platform  --  one-click launcher
REM
REM  IMPORTANT: this .bat is intentionally ASCII-ONLY.
REM  cmd.exe reads .bat files using the console code page (GBK on
REM  Chinese Windows). UTF-8 Chinese text leaves dangling lead
REM  bytes at line ends, which swallow the newline and make the
REM  NEXT line get executed as a command. That bug was hit once.
REM  All Chinese messages are printed by Python instead, which
REM  writes wide chars straight to the console and is always right.
REM
REM  Created: 2026-10-05
REM ============================================================

setlocal
cd /d "%~dp0"

echo ============================================================
echo   Deep-sea Aquaculture Intelligent Management Platform
echo ============================================================
echo.

set PY=
where py >nul 2>nul && set PY=py
if "%PY%"=="" (
  where python >nul 2>nul && set PY=python
)

if "%PY%"=="" (
  echo   [ERROR] Python not found.
  echo.
  echo   Please install Python 3 first:
  echo     https://www.python.org/downloads/
  echo   During install, tick "Add Python to PATH".
  echo.
  pause
  exit /b 1
)

echo   Starting...  ^(Python: %PY%^)
echo.

%PY% "backend\server.py" --port 8080

echo.
echo   Stopped.
pause
