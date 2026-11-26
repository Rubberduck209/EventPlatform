@echo off
chcp 65001 >nul
echo Dang dung cac dich vu SOA Event Platform (Ports 8001-8005, 3000)...
for %%p in (8001 8002 8003 8004 8005 3000) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%%p " ^| findstr "LISTENING"') do (
        taskkill /F /PID %%a >nul 2>&1
    )
)
echo Da dung tat ca cac dich vu!
pause