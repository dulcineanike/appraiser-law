@echo off
chcp 65001 >nul
title 不動產估價小六法 - 24小時雲端正式版
echo ========================================================
echo        不動產估價小六法 - 24小時雲端與手機離線版
echo ========================================================
echo.
echo [24小時雲端正式網址] (電腦關機、手機在外 4G/5G 隨時可用):
echo --> https://dulcineanike.github.io/appraiser-law/
echo.
echo 備用網址 (Surge CDN):
echo --> https://appraiser-law-tw.surge.sh
echo.
echo 正在為您開啟 GitHub 雲端正式網址...
start https://dulcineanike.github.io/appraiser-law/
echo.
echo --------------------------------------------------------
echo 提示：
echo 1. 請將上述網址加到手機 Safari/Chrome 書籤或「加入主畫面」。
echo 2. 這是全球 CDN 雲端託管，您的電腦關機、出門在外手機都能隨時正常開啟！
echo --------------------------------------------------------
echo.
echo 若您需要在本機完全斷網環境下開啟本地伺服器，請按任意鍵...
pause >nul
echo 正在啟動本機伺服器 (http://localhost:8080) ...
start http://localhost:8080
python -m http.server 8080
