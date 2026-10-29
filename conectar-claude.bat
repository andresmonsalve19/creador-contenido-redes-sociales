@echo off
setlocal
title Conectar con Claude Desktop
cd /d "%~dp0"
echo.
echo   ============================================
echo     Conectar el Creador de contenido con Claude Desktop
echo   ============================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "herramientas\conectar-claude.ps1"
if errorlevel 1 goto :error
echo.
echo   Listo. Ahora:
echo     1. Cierra Claude Desktop por completo (tambien desde el icono junto al reloj) y vuelve a abrirlo.
echo     2. Abre la aplicacion con iniciar.bat y deja esa ventana abierta.
echo     3. En Claude Desktop pide, por ejemplo: "Lee mi marca y crea una imagen para el feed sobre ...".
echo.
pause
exit /b 0
:error
echo.
echo   No se pudo conectar. Si dice que falta algo, abre primero iniciar.bat una vez.
echo   Si el problema sigue, toma una captura de esta ventana y enviala a soporte.
echo.
pause
exit /b 1
