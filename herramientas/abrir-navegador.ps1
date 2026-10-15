# Espera a que la aplicacion responda y la abre en el navegador.
# Sale con codigo 0 si la abrio y 1 si no respondio a tiempo.
param(
  [string]$Url = 'http://127.0.0.1:3001',
  [int]$Seconds = 120
)

$ProgressPreference = 'SilentlyContinue'
$deadline = (Get-Date).AddSeconds($Seconds)
do {
  try {
    Invoke-WebRequest -Uri "$Url/api/setup/status" -UseBasicParsing -TimeoutSec 3 | Out-Null
    Start-Process $Url
    exit 0
  }
  catch {
    Start-Sleep -Milliseconds 800
  }
} while ((Get-Date) -lt $deadline)
exit 1
