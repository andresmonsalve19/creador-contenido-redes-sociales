@echo off
setlocal
title Creador de contenido - no cierres esta ventana
cd /d "%~dp0"

set "APP_URL=http://127.0.0.1:3001"
set "NODE_DIR=%~dp0herramientas\node"
set "PS=powershell -NoProfile -ExecutionPolicy Bypass"

echo.
echo   ============================================
echo     Creador de contenido para redes sociales
echo   ============================================
echo.

rem Si la aplicacion ya esta abierta, solo se muestra en el navegador.
%PS% -File "herramientas\abrir-navegador.ps1" -Url "%APP_URL%" -Seconds 2 >nul 2>&1
if not errorlevel 1 (
  echo   La aplicacion ya estaba abierta: se mostro en tu navegador.
  timeout /t 5 >nul
  exit /b 0
)

if not exist "%NODE_DIR%\node.exe" (
  echo   [1 de 3] Preparando Node.js - solo la primera vez
  %PS% -File "herramientas\instalar-node.ps1"
  if errorlevel 1 goto :error
)
set "PATH=%NODE_DIR%;%PATH%"

if not exist "node_modules\.package-lock.json" (
  echo   [2 de 3] Instalando componentes - solo la primera vez, unos minutos
  call npm ci --no-audit --no-fund --loglevel=error
  if errorlevel 1 goto :error
)

set "NEEDS_BUILD="
if not exist "server\dist\core\index.js" set "NEEDS_BUILD=1"
if not exist "client\dist\index.html" set "NEEDS_BUILD=1"
if not exist "server\dist\mcp\index.js" set "NEEDS_BUILD=1"
if defined NEEDS_BUILD (
  echo   [3 de 3] Preparando la aplicacion - solo la primera vez
  call npm run build --silent
  if errorlevel 1 goto :error
)

echo.
echo   Abriendo la aplicacion en tu navegador: %APP_URL%
echo   Mientras la uses, deja esta ventana abierta. Para cerrar la aplicacion, cierra esta ventana.
echo.
start "" /b %PS% -WindowStyle Hidden -File "herramientas\abrir-navegador.ps1" -Url "%APP_URL%" -Seconds 120

set "NODE_ENV=production"
node server\dist\core\index.js
if errorlevel 1 goto :error
goto :eof

:error
echo.
echo   Algo salio mal. Revisa tu conexion a internet y vuelve a abrir iniciar.bat.
echo   Si arriba dice EADDRINUSE, la aplicacion ya esta abierta en otra ventana
echo   o el puerto 3001 lo usa otro programa: cierra esa ventana y vuelve a intentarlo.
echo   Si el problema sigue, toma una captura de esta ventana y enviala a soporte.
echo.
pause
exit /b 1
