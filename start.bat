@echo off
setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
REM Remove trailing backslash so paths are clean
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

echo.
echo  ==========================================
echo   Clinical AI  ^|  Startup Script
echo  ==========================================
echo.

REM ── 1. Python virtual environment ────────────────────────────────────────────
if not exist "%ROOT%\.venv\Scripts\activate.bat" (
    echo [ERROR] Virtual environment not found at .venv\
    echo.
    echo  Create it with:
    echo    python -m venv .venv
    echo.
    pause
    exit /b 1
)
echo [OK] Virtual environment found.

REM ── 2. Backend Python dependencies ───────────────────────────────────────────
if not exist "%ROOT%\.venv\Scripts\uvicorn.exe" (
    echo [INFO] Backend dependencies not installed. Running pip install...
    echo.
    call "%ROOT%\.venv\Scripts\activate.bat"
    pip install -r "%ROOT%\backend\requirements.txt"
    if errorlevel 1 (
        echo.
        echo [ERROR] pip install failed.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Backend dependencies installed.
) else (
    echo [OK] Backend dependencies found.
)

REM ── 3. .env file ─────────────────────────────────────────────────────────────
if not exist "%ROOT%\.env" (
    echo [WARN] .env file not found.
    echo        AI chat will not work without OPENAI_API_KEY.
    echo        Create .env and add:  OPENAI_API_KEY=sk-...
    echo.
) else (
    echo [OK] .env file found.
)

REM ── 4. Model artefacts ───────────────────────────────────────────────────────
if not exist "%ROOT%\backend\models\model.pkl" (
    echo.
    echo [WARN] Model not trained yet. Backend starts but /predict returns 503.
    echo.
    echo  Train the model first (recommended before using Predict page):
    echo    .venv\Scripts\activate
    echo    python -m backend.scripts.train_model --skip-enrichment
    echo.
) else (
    echo [OK] Model artefacts found.
)

REM ── 5. Frontend node_modules ─────────────────────────────────────────────────
if not exist "%ROOT%\frontend\node_modules" (
    echo.
    echo [INFO] Frontend packages not installed. Running npm install...
    cd /d "%ROOT%\frontend"
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed. Ensure Node.js ^>=18 is installed.
        pause
        exit /b 1
    )
    cd /d "%ROOT%"
    echo [OK] Frontend packages installed.
) else (
    echo [OK] Frontend node_modules found.
)

echo.
echo  Starting services...
echo.

REM ── 6. Start backend in a new window ─────────────────────────────────────────
start "Clinical AI - Backend (8000)" /D "%ROOT%" cmd /k ^
    "call .venv\Scripts\activate.bat && uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000"

REM Give the backend a 3-second head-start before the browser opens
timeout /t 3 /nobreak >nul

REM ── 7. Start frontend in a new window ────────────────────────────────────────
start "Clinical AI - Frontend (5173)" /D "%ROOT%\frontend" cmd /k "npm run dev"

echo  ==========================================
echo   App is running in two new windows
echo.
echo   Frontend  -^>  http://localhost:5173
echo   Backend   -^>  http://localhost:8000
echo   API Docs  -^>  http://localhost:8000/docs
echo  ==========================================
echo.
echo  Close both terminal windows to shut everything down.
echo.
pause