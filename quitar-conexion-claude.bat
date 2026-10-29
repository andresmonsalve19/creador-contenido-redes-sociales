@echo off
setlocal
title Quitar la conexion manual con Claude Desktop
cd /d "%~dp0"
echo.
echo   Quita la conexion creada con conectar-claude.bat (por ejemplo, si instalaste la extension .mcpb).
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "herramientas\conectar-claude.ps1" -Quitar
if errorlevel 1 goto :error
echo.
echo   Listo. Cierra Claude Desktop por completo y vuelve a abrirlo.
echo.
pause
exit /b 0
:error
echo.
echo   No se pudo quitar la conexion. Toma una captura de esta ventana y enviala a soporte.
echo.
pause
exit /b 1
