# Registra la app en Claude Desktop como servidor MCP ("creador-de-contenido").
# Claude Desktop lo inicia con el Node portable de la app; la app debe estar abierta (iniciar.bat).
# Hace una copia de seguridad de la configuracion antes de cambiarla y no toca otros servidores.
# Con -Quitar elimina esta conexion (por ejemplo, al pasar a la extension .mcpb).
param(
  [string]$AppUrl = 'http://127.0.0.1:3001',
  [switch]$Quitar
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'herramientas\node\node.exe'
$entry = Join-Path $root 'server\dist\mcp\index.js'

if (-not $Quitar) {
  if (-not (Test-Path $node)) { throw 'Falta Node.js: abre primero iniciar.bat una vez.' }
  if (-not (Test-Path $entry)) { throw 'Falta preparar la aplicacion: abre primero iniciar.bat una vez.' }
}

# Ruta normal de Claude Desktop y, si existe, la de la version de la Microsoft Store.
$targets = @(Join-Path $env:APPDATA 'Claude')
$store = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Packages') -Filter 'Claude_*' -Directory -ErrorAction SilentlyContinue
foreach ($package in $store) {
  $targets += Join-Path $package.FullName 'LocalCache\Roaming\Claude'
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
foreach ($dir in $targets) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $file = Join-Path $dir 'claude_desktop_config.json'
  if ($Quitar -and -not (Test-Path $file)) { continue }
  $config = [pscustomobject]@{}
  if (Test-Path $file) {
    $raw = [System.IO.File]::ReadAllText($file)
    if ($raw.Trim()) {
      Copy-Item $file "$file.respaldo-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
      $config = $raw | ConvertFrom-Json
    }
  }
  if (-not ($config.PSObject.Properties.Name -contains 'mcpServers')) {
    $config | Add-Member -NotePropertyName 'mcpServers' -NotePropertyValue ([pscustomobject]@{})
  }
  if ($Quitar) {
    $config.mcpServers.PSObject.Properties.Remove('creador-de-contenido')
    [System.IO.File]::WriteAllText($file, ($config | ConvertTo-Json -Depth 20), $utf8)
    Write-Host "  Conexion quitada: $file"
    continue
  }
  $server = [pscustomobject]@{
    command = $node
    args    = @($entry)
    env     = [pscustomobject]@{ APP_URL = $AppUrl }
  }
  $config.mcpServers | Add-Member -NotePropertyName 'creador-de-contenido' -NotePropertyValue $server -Force
  [System.IO.File]::WriteAllText($file, ($config | ConvertTo-Json -Depth 20), $utf8)
  Write-Host "  Configurado: $file"
}
exit 0
