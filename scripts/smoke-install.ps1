param(
    [string]$VenvPath = ".smoke-venv"
)

$ErrorActionPreference = "Stop"

Write-Host "[smoke] creating virtual environment at $VenvPath"
python -m venv $VenvPath

$pythonExe = Join-Path $VenvPath "Scripts\\python.exe"
$shadowflowExe = Join-Path $VenvPath "Scripts\\shadowflow.exe"

Write-Host "[smoke] upgrading pip"
& $pythonExe -m pip install -U pip

Write-Host "[smoke] installing package"
& $pythonExe -m pip install -e ".[dev]"

Write-Host "[smoke] checking CLI entrypoints"
& $shadowflowExe --help | Out-Null
& $pythonExe -m shadowflow.cli --help | Out-Null

Write-Host "[smoke] validating local workflow"
& $shadowflowExe validate -w "examples/runtime-contract/cli-generic-local.yaml" | Out-Null

Write-Host "[smoke] running local workflow"
& $shadowflowExe run -w "examples/runtime-contract/cli-generic-local.yaml" -i '{"goal":"smoke-install"}' | Out-Null

Write-Host "[smoke] success"
