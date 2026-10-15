@echo off
setlocal
title Creador de contenido - actualizando
cd /d "%~dp0"

rem Reinstala los componentes y vuelve a preparar la aplicacion.
rem Usalo despues de recibir una version nueva del proyecto. Tus datos y claves no se borran.

set "NODE_DIR=%~dp0herramientas\node"
set "PS=powershell -NoProfile -ExecutionPolicy Bypass"

echo.
echo   Actualizando el Creador de contenido...
echo.

if not exist "%NODE_DIR%\node.exe" (
  %PS% -File "herramientas\instalar-node.ps1"
  if errorlevel 1 goto :error
)
set "PATH=%NODE_DIR%;%PATH%"

echo   Instalando componentes...
call npm ci --no-audit --no-fund --loglevel=error
if errorlevel 1 goto :error

echo   Preparando la aplicacion...
call npm run build --silent
if errorlevel 1 goto :error

echo.
echo   Listo. Ya puedes abrir la aplicacion con iniciar.bat
echo.
pause
exit /b 0

:error
echo.
echo   Algo salio mal. Revisa tu conexion a internet e intentalo de nuevo.
echo.
pause
exit /b 1
