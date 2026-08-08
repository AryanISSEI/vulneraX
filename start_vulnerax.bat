@echo off
echo Starting VulneraX...

echo Starting Backend API...
start "VulneraX Backend" cmd.exe /k "cd backend && .\python-bin\tools\python.exe -X faulthandler -m uvicorn main:app --host 127.0.0.1 --port 8000"

echo Starting Frontend Dashboard...
start "VulneraX Frontend" cmd.exe /k "cd frontend && npm run dev -- --host --port 5175"

echo Waiting for services to start...
timeout /t 5 /nobreak >nul

echo Opening browser...
start http://localhost:5175

echo VulneraX is running in the newly opened windows!
echo Close this window to exit the launcher (the servers will keep running in their own windows).
pause
