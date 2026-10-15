# Descarga Node.js portatil desde el sitio oficial, verifica su firma SHA-256 y lo deja en
# herramientas\node. No instala nada en Windows ni necesita permisos de administrador.
param([string]$Version = 'v24.22.0')

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not [Environment]::Is64BitOperatingSystem) {
  throw 'Esta aplicacion necesita Windows de 64 bits.'
}
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
$name = "node-$Version-win-$arch"
$base = "https://nodejs.org/dist/$Version"
$destination = Join-Path $PSScriptRoot 'node'
$temp = Join-Path $env:TEMP ("creador-node-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $temp | Out-Null

try {
  $zip = Join-Path $temp "$name.zip"
  Write-Host "  Descargando Node.js $Version ($arch). Puede tardar unos minutos..."
  Invoke-WebRequest -Uri "$base/$name.zip" -OutFile $zip -UseBasicParsing

  # La firma oficial se publica en SHASUMS256.txt; si no coincide, no se usa la descarga.
  $sums = [string](Invoke-RestMethod -Uri "$base/SHASUMS256.txt" -UseBasicParsing)
  $line = ($sums -split "`n") | Where-Object { $_.Trim().EndsWith("  $name.zip") } | Select-Object -First 1
  if (-not $line) { throw 'No se encontro la firma oficial de Node.js.' }
  $expected = ($line.Trim() -split '\s+')[0].ToLower()
  $actual = (Get-FileHash -Path $zip -Algorithm SHA256).Hash.ToLower()
  if ($actual -ne $expected) { throw 'La descarga de Node.js no coincide con la firma oficial.' }

  Write-Host '  Descomprimiendo...'
  Expand-Archive -Path $zip -DestinationPath $temp -Force
  if (Test-Path $destination) { Remove-Item $destination -Recurse -Force }
  Move-Item -Path (Join-Path $temp $name) -Destination $destination
  Write-Host '  Node.js listo.'
}
catch {
  Write-Host ''
  Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
finally {
  Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}
