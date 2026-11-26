@echo off
chcp 65001 >nul
echo ========================================================
echo   KHOI CHAY HE THONG SOA EVENT PLATFORM MICROSERVICES
echo ========================================================
echo.

set "BASE_DIR=%~dp0"

echo [1/6] Khoi dong Identity Service (Port 8001)...
start "1. Identity Service - Port 8001" cmd /k "cd /d "%BASE_DIR%backend\identity_service" && .venv\Scripts\python.exe -m uvicorn main:app --port 8001 --reload"

echo [2/6] Khoi dong Event Service (Port 8002)...
start "2. Event Service - Port 8002" cmd /k "cd /d "%BASE_DIR%backend\event_service" && .venv\Scripts\python.exe -m uvicorn main:app --port 8002 --reload"

echo [3/6] Khoi dong Booking Service (Port 8003)...
start "3. Booking Service - Port 8003" cmd /k "cd /d "%BASE_DIR%backend\booking-service" && .venv\Scripts\python.exe -m uvicorn main:app --port 8003 --reload"

echo [4/6] Khoi dong Payment Service (Port 8004)...
start "4. Payment Service - Port 8004" cmd /k "cd /d "%BASE_DIR%backend\payment_service" && .venv\Scripts\python.exe -m uvicorn main:app --port 8004 --reload"

echo [5/6] Khoi dong Ticket Service (Port 8005)...
start "5. Ticket Service - Port 8005" cmd /k "cd /d "%BASE_DIR%backend\ticket-service" && .venv\Scripts\python.exe -m uvicorn main:app --port 8005 --reload"

echo [6/6] Khoi dong Frontend React (Port 3000)...
start "6. Frontend React - Port 3000" cmd /k "cd /d "%BASE_DIR%frontend" && npm run dev"

echo.
echo ========================================================
echo   DA BAT XONG 6 DICH VU TREN CAC CUA SO RIENG BIET!
echo   - Frontend: http://localhost:3000
echo   - Identity: http://localhost:8001/docs
echo   - Event:    http://localhost:8002/docs
echo   - Booking:  http://localhost:8003/docs
echo   - Payment:  http://localhost:8004/docs
echo   - Ticket:   http://localhost:8005/docs
echo ========================================================
pause