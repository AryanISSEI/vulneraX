@echo off
echo ===================================================
echo             Starting VulneraX Platform
echo ===================================================

echo [1/2] Starting Backend API (FastAPI)...
start "VulneraX Backend" cmd /c "cd backend && python-bin\tools\python.exe -m uvicorn main:app --port 8000"

echo [2/2] Starting Frontend UI (Vite)...
start "VulneraX Frontend" cmd /c "cd frontend && npm run dev"

echo.
echo All services have been launched in separate windows!
echo - Frontend UI will be available at: http://localhost:5173
echo - Backend API will be available at: http://localhost:8000
echo.
echo (Note: Redis is required for running new scans locally)
echo.
pause
