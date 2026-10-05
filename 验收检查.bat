@echo off
REM ============================================================
REM  Acceptance check for the 10-09 "basically usable" release.
REM
REM  IMPORTANT: this .bat is intentionally ASCII-ONLY.
REM  cmd.exe reads .bat files using the console code page, and
REM  non-ASCII text leaves dangling lead bytes that swallow the
REM  newline -- the next line then runs as a command. Hit once.
REM  All Chinese output comes from the Python script instead.
REM  See the launcher .bat for the full note.
REM
REM  Created: 2026-10-05
REM ============================================================

setlocal
cd /d "%~dp0"

set PY=
where py >nul 2>nul && set PY=py
if "%PY%"=="" (
  where python >nul 2>nul && set PY=python
)

if "%PY%"=="" (
  echo   [ERROR] Python not found.
  echo   Please install Python 3 first:
  echo     https://www.python.org/downloads/
  echo.
  pause
  exit /b 1
)

%PY% "scripts\acceptance.py"

echo.
pause
