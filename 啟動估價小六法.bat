@echo off
chcp 65001 >nul
title 不動產估價小六法 - 本地伺服器
echo ========================================================
echo        不動產估價小六法 - 手機/電腦雙用離線資料庫
echo ========================================================
echo.
echo 正在啟動本地 Web 服務...
echo 電腦瀏覽器網址： http://localhost:8080
echo.
echo [手機同區域網路 (Wi-Fi) 連線方法]：
echo 請查詢下方本機 IP (IPv4)，在手機瀏覽器輸入例如：
echo http://[您的IP]:8080
echo 即可在手機上查閱，並點選「加入主畫面」當作 App 使用！
echo --------------------------------------------------------
ipconfig | findstr /i "IPv4"
echo --------------------------------------------------------
echo.
start http://localhost:8080
python -m http.server 8080
pause
