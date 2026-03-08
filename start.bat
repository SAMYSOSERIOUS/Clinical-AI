@echo off
title Health AI App

echo ============================================
echo   Starting Health AI Application...
echo ============================================

:: Activate virtual environment
call "%~dp0.venv\Scripts\activate.bat"

:: Kill any leftover processes from a previous run
echo Cleaning up old processes...
taskkill /F /FI "WINDOWTITLE eq Health AI - Backend" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Health AI - Frontend" >nul 2>&1
:: Also free ports 8000 and 5173 if occupied
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 " 2^>nul') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " 2^>nul') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 /nobreak >nul

:: Start the backend in a new window
echo [1/2] Starting backend (FastAPI)...
start "Health AI - Backend" cmd /k "cd /d "%~dp0" && call .venv\Scripts\activate.bat && uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000"

:: Give the backend a moment to start
timeout /t 3 /nobreak >nul

:: Start the frontend in a new window
echo [2/2] Starting frontend (Vite)...
start "Health AI - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

:: Wait a few seconds for the frontend dev server to boot up
echo Waiting for servers to start...
timeout /t 5 /nobreak >nul

:: Open the app in the default browser
echo Opening app in browser...
start "" "http://localhost:5173"

echo.
echo ============================================
echo   Health AI is running!
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:8000
echo   API docs : http://localhost:8000/docs
echo ============================================
echo.
echo Close the Backend and Frontend windows to stop the app.
pause
