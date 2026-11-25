<#
.SYNOPSIS
    One-command setup and launcher for BlindCode (Frontend + Backend + Ollama).
.DESCRIPTION
    Automatically sets up node_modules, backend\venv, backend\.env, and the
    Ollama model on first run, then starts both the FastAPI backend (port 8000)
    and the Vite frontend (port 5173). Press Ctrl+C to stop both cleanly.
#>
param(
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $RootDir "backend"
$VenvDir = Join-Path $BackendDir "venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$VenvPip = Join-Path $VenvDir "Scripts\pip.exe"
$VenvUvicorn = Join-Path $VenvDir "Scripts\uvicorn.exe"
$ReqFile = Join-Path $BackendDir "requirements.txt"
$ReqMarker = Join-Path $VenvDir ".requirements_installed"
$EnvFile = Join-Path $BackendDir ".env"
$EnvExample = Join-Path $BackendDir ".env.example"
$TutorModel = "qwen2.5-coder:1.5b"

Write-Host "=== BlindCode Startup ===" -ForegroundColor Cyan

# 1. Check required tools
foreach ($cmd in @("python", "node", "npm", "ollama")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Host "[ERROR] '$cmd' is not installed or not in PATH. Please install it first." -ForegroundColor Red
        exit 1
    }
}

# 2. Frontend dependencies
$NodeModules = Join-Path $RootDir "node_modules"
if (-not (Test-Path $NodeModules)) {
    Write-Host "[1/4] Installing frontend dependencies (npm install)..." -ForegroundColor Yellow
    Push-Location $RootDir
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[1/4] Frontend dependencies ready." -ForegroundColor Green
}

# 3. Backend virtual environment & dependencies
if (-not (Test-Path $VenvPython)) {
    Write-Host "[2/4] Creating Python virtual environment in backend\venv..." -ForegroundColor Yellow
    python -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) { throw "Failed to create Python venv" }
}

$NeedsPipInstall = (-not (Test-Path $VenvUvicorn)) -or (-not (Test-Path $ReqMarker)) -or ((Get-Item $ReqFile).LastWriteTimeUtc -gt (Get-Item $ReqMarker).LastWriteTimeUtc)
if ($NeedsPipInstall) {
    Write-Host "[2/4] Installing backend dependencies from requirements.txt..." -ForegroundColor Yellow
    & $VenvPython -m pip install --upgrade pip
    & $VenvPip install -r $ReqFile
    if ($LASTEXITCODE -ne 0) { throw "pip install failed" }
    New-Item -ItemType File -Path $ReqMarker -Force | Out-Null
} else {
    Write-Host "[2/4] Backend virtual environment ready." -ForegroundColor Green
}

# 4. Backend .env file
if (-not (Test-Path $EnvFile)) {
    Write-Host "[3/4] Creating backend\.env from .env.example..." -ForegroundColor Yellow
    Copy-Item $EnvExample $EnvFile
} else {
    Write-Host "[3/4] backend\.env ready." -ForegroundColor Green
}

# Read TUTOR_MODEL from .env if present
$EnvModelLine = Select-String -Path $EnvFile -Pattern '^TUTOR_MODEL=(.+)$' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($EnvModelLine) {
    $ParsedModel = $EnvModelLine.Matches.Groups[1].Value.Trim()
    if ($ParsedModel) { $TutorModel = $ParsedModel }
}

# 5. Ollama server & model check
$OllamaRunning = $false
try {
    $null = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 2 -ErrorAction Stop
    $OllamaRunning = $true
} catch {
    $OllamaRunning = $false
}

if (-not $OllamaRunning) {
    Write-Host "[4/4] Starting Ollama service in background..." -ForegroundColor Yellow
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

$ModelList = ollama list 2>$null | Out-String
if ($ModelList -notmatch [regex]::Escape($TutorModel)) {
    Write-Host "[4/4] Pulling Ollama model '$TutorModel' (first-time download)..." -ForegroundColor Yellow
    ollama pull $TutorModel
    if ($LASTEXITCODE -ne 0) { throw "Failed to pull Ollama model $TutorModel" }
} else {
    Write-Host "[4/4] Ollama model '$TutorModel' ready." -ForegroundColor Green
}

if ($CheckOnly) {
    Write-Host "`nAll checks passed! Everything is ready to run." -ForegroundColor Cyan
    exit 0
}

# 6. Launch Backend & Frontend together
Write-Host "`nStarting FastAPI backend (http://localhost:8000) and Vite frontend (http://localhost:5173)..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop both servers.`n" -ForegroundColor DarkGray

$BackendProc = Start-Process -FilePath $VenvUvicorn `
    -ArgumentList "app.main:app", "--reload", "--port", "8000" `
    -WorkingDirectory $BackendDir `
    -NoNewWindow -PassThru

try {
    Push-Location $RootDir
    npm run dev
} finally {
    Pop-Location
    if ($BackendProc -and -not $BackendProc.HasExited) {
        Write-Host "`nStopping backend server..." -ForegroundColor Yellow
        Stop-Process -Id $BackendProc.Id -Force -ErrorAction SilentlyContinue
    }
}
