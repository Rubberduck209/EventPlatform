@echo off
chcp 65001 >nul
echo ========================================================
echo   NAP TOAN BO CSDL VA DU LIEU TEST MAU (SOA 5 SERVICES)
echo ========================================================
echo.

set MYSQL_PWD=12345678
mysql -u root -p12345678 < "%~dp0schema.sql"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo   [THANH CONG] DA NAP TOAN BO CSDL VA SEED DATA MAU!
    echo   - identity_db (Tai khoan, Admin, Organizer, Staff)
    echo   - event_db    (5 su kien bao phu cac trang thai)
    echo   - booking_db  (Don hang: Da mua, Giu cho 10p, Het han)
    echo   - payment_db  (VNPay transactions, Hoan tien)
    echo   - ticket_db   (Ve QR ky so, Nhat ky soat ve)
    echo ========================================================
) else (
    echo.
    echo [LOI] Khong the nap tu dong qua lenh mysql.
    echo Vui long mo MySQL Workbench / Navicat va chay file schema.sql.
)
pause