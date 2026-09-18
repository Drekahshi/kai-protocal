# ============================================================
#  KAI App Launcher - starts AI Agent + Next.js
#  Usage:  .\start.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "       KAI Nuvari App Launcher v1.0           " -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# -- 1. Set up Python venv if needed ------------------------
$AgentDir = if (Test-Path (Join-Path $Root "ai-agent")) { Join-Path $Root "ai-agent" } else { $Root }
$VenvPy   = Join-Path $AgentDir ".venv\Scripts\python.exe"
$VenvPip  = Join-Path $AgentDir ".venv\Scripts\pip.exe"

Write-Host ">> Python environment..." -ForegroundColor Yellow
if (-not (Test-Path $VenvPy)) {
    Write-Host "   Creating virtual environment..." -ForegroundColor Yellow
    py -m venv (Join-Path $AgentDir ".venv")
    Write-Host "   OK venv created." -ForegroundColor Green
}
Write-Host "   Installing / updating dependencies..." -ForegroundColor Yellow
& $VenvPip install -q -r (Join-Path $AgentDir "requirements.txt") --upgrade
Write-Host "   OK Dependencies ready." -ForegroundColor Green

# -- 2. Check for GROQ_API_KEY --------------------------------
Write-Host ">> Checking environment..." -ForegroundColor Yellow
$envFile = Join-Path $Root ".env"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match "GROQ_API_KEY=(.+)") {
        $key = $Matches[1].Trim()
        if ($key -and $key -ne "" -and $key -ne "your_groq_api_key_here") {
            Write-Host "   OK GROQ_API_KEY is set." -ForegroundColor Green
        } else {
            Write-Host "   WARNING: GROQ_API_KEY is not set in .env" -ForegroundColor Red
            Write-Host "   Get a key from https://console.groq.com" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   WARNING: GROQ_API_KEY not found in .env" -ForegroundColor Red
    }
} else {
    Write-Host "   WARNING: .env file not found. Copy .env.example to .env" -ForegroundColor Red
}

# -- 3. Launch AI Agent in new window ---------------------
Write-Host ">> Starting KAI AI Agent on port 8000..." -ForegroundColor Yellow
$agentCmd = "Set-Location '$AgentDir'; & '$VenvPy' -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $agentCmd -WindowStyle Normal

# Wait up to 90s for agent to be healthy
Write-Host "   Waiting for agent to start (index build may take a minute)..." -ForegroundColor Yellow
$waited = 0
do {
    Start-Sleep -Seconds 3
    $waited += 3
    try {
        $h = Invoke-RestMethod "http://127.0.0.1:8000/health" -TimeoutSec 2
        Write-Host "   OK AI Agent running - model: $($h.model)" -ForegroundColor Green
        break
    } catch {
        # retry
    }
} while ($waited -lt 90)

if ($waited -ge 90) {
    Write-Host "   WARNING: Agent did not respond in 90s - check the AI Agent window." -ForegroundColor Red
}

# -- 4. Launch Next.js frontend in new window --------------
Write-Host ">> Starting Next.js frontend on port 3000..." -ForegroundColor Yellow
$FrontendDir = Join-Path $Root "avax-frontend"
$frontCmd = "Set-Location '$FrontendDir'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontCmd -WindowStyle Normal

Write-Host ""
Write-Host "===============================================" -ForegroundColor Green
Write-Host "  All services launched!                      " -ForegroundColor Green
Write-Host "  Frontend : http://localhost:3000            " -ForegroundColor Green
Write-Host "  AI Agent : http://127.0.0.1:8000/health     " -ForegroundColor Green
Write-Host "  Provider : Groq (cloud API)                 " -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Close individual windows to stop each service." -ForegroundColor Gray
