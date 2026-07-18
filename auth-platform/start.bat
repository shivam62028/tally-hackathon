@echo off
echo Starting Auth Platform...

echo Starting backend on port 3001...
start "Backend" cmd /c "cd backend && npm run dev"

timeout /t 3 /nobreak > nul

echo Starting frontend on port 5173...
start "Frontend" cmd /c "cd frontend && npm run dev"

echo.
echo ===================================
echo Auth Platform is running!
echo ===================================
echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:3001
echo.
echo Demo Credentials:
echo   Email: alice@example.com (or bob, charlie, admin)
echo   Password: demo123
echo.
echo Close the terminal windows to stop the servers
pause
