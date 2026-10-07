@echo off
setlocal
chcp 65001 >nul
if "%~1"=="" (
  "%~dp0runtime\python.exe" -X utf8 -m src.cli menu
) else (
  "%~dp0runtime\python.exe" -X utf8 -m src.cli %*
)
exit /b %errorlevel%
