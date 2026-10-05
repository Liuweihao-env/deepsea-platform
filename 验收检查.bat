@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM ============================================================
REM  一键验收检查 —— 对着 10-09「基本可用初版」四条标准跑一遍
REM  建立：2026-10-05
REM ============================================================

set PY=
where py >nul 2>nul && set PY=py
if "%PY%"=="" ( where python >nul 2>nul && set PY=python )

if "%PY%"=="" (
  echo   [错误] 没有找到 Python。请先安装 Python 3 并勾选 "Add Python to PATH"。
  pause
  exit /b 1
)

%PY% "scripts\acceptance.py"
echo.
pause
