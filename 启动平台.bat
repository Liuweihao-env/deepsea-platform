@echo off
chcp 65001 >nul
setlocal

REM ============================================================
REM  深远海养殖与海洋牧场智能管控平台 —— 一键启动
REM
REM  双击本文件即可。会做三件事：
REM    1. 找到 Python
REM    2. 启动后端（同时托管前端页面）
REM    3. 自动打开浏览器
REM
REM  零依赖：不需要 pip install，不需要联网。
REM  建立：2026-10-05
REM ============================================================

cd /d "%~dp0"

echo ============================================================
echo   深远海养殖与海洋牧场智能管控平台
echo ============================================================
echo.

REM ---- 找 Python ----
set PY=
where py >nul 2>nul && set PY=py
if "%PY%"=="" ( where python >nul 2>nul && set PY=python )

if "%PY%"=="" (
  echo   [错误] 没有找到 Python。
  echo.
  echo   请先安装 Python 3 ^(https://www.python.org/downloads/^)，
  echo   安装时务必勾选 "Add Python to PATH"。
  echo.
  pause
  exit /b 1
)

echo   使用 Python: %PY%
echo   正在启动服务...
echo.

%PY% "backend\server.py" --port 8080

echo.
echo   服务已停止。
pause
