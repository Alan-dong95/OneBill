# Pack server for deploy (exclude .venv / .env / caches)
# Usage:
#   powershell -ExecutionPolicy Bypass -File server/scripts/pack-deploy.ps1

$ErrorActionPreference = "Stop"

$serverDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$repoDir = Split-Path $serverDir -Parent
$outZip = Join-Path $repoDir ("server-deploy-{0:yyyyMMdd-HHmmss}.zip" -f (Get-Date))
$staging = Join-Path $env:TEMP ("onebill-server-pack-" + [guid]::NewGuid().ToString("N"))

$excludeDirs = @(".venv", "venv", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".git")

Write-Host "Source : $serverDir"
Write-Host "Output : $outZip"

New-Item -ItemType Directory -Path $staging | Out-Null

try {
    Get-ChildItem -Path $serverDir -Force | ForEach-Object {
        if ($_.PSIsContainer -and ($excludeDirs -contains $_.Name)) {
            Write-Host "Skip dir : $($_.Name)"
            return
        }
        if (-not $_.PSIsContainer -and $_.Name -eq ".env") {
            Write-Host "Skip file: $($_.Name)"
            return
        }
        Copy-Item -Path $_.FullName -Destination (Join-Path $staging $_.Name) -Recurse -Force
    }

    Get-ChildItem -Path $staging -Recurse -Directory -Force -Filter "__pycache__" -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

    if (Test-Path $outZip) { Remove-Item $outZip -Force }
    Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $outZip -CompressionLevel Optimal

    $sizeMb = [math]::Round((Get-Item $outZip).Length / 1MB, 2)
    Write-Host ""
    Write-Host "Done: $outZip ($sizeMb MB)"
    Write-Host "Upload this zip only. On server: unzip, create .env, then Docker/pip install."
}
finally {
    if (Test-Path $staging) {
        Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
    }
}
