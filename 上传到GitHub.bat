@echo off
REM ============================================================
REM  Push this repository to GitHub.
REM
REM  ASCII-ONLY on purpose -- see the project conventions doc, section 8.3.
REM  cmd.exe reads .bat with the console code page, and non-ASCII text
REM  leaves dangling lead bytes that swallow the newline.
REM
REM  Created: 2026-10-05
REM ============================================================

setlocal
cd /d "%~dp0"

echo ============================================================
echo   Push to GitHub
echo ============================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo   [ERROR] git not found. Install Git for Windows first:
  echo     https://git-scm.com/download/win
  echo.
  pause
  exit /b 1
)

echo   Remote:
git remote -v
echo.

echo   Current version tag:
git describe --tags --always 2>nul
echo.

echo   Uncommitted changes:
git status --short
echo.

echo   --- pushing main branch and tags ---
echo   A GitHub login window may pop up. Sign in and allow it.
echo.

git push -u origin main
if errorlevel 1 goto failed

git push origin --tags
if errorlevel 1 goto failed

echo.
echo ============================================================
echo   DONE. Open your repository page:
echo.
git remote get-url origin
echo ============================================================
echo.
pause
exit /b 0

:failed
echo.
echo ============================================================
echo   PUSH FAILED.
echo.
echo   Most likely cause: the repository does not exist on GitHub yet.
echo   Go to https://github.com/new and create an EMPTY repository named
echo   deepsea-platform  ^(do NOT add README / .gitignore / license^),
echo   then run this file again.
echo ============================================================
echo.
pause
exit /b 1
