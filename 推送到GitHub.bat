@echo off
chcp 65001 >nul
title 上傳不動產及估價法規到 GitHub (dulcineanike)
echo ========================================================
echo        正在準備將不動產及估價法規推送到 GitHub 倉庫
echo        目標帳號: dulcineanike
echo        倉庫網址: https://github.com/dulcineanike/appraiser-law
echo ========================================================
echo.
echo 請選擇登入驗證方式：
echo   [1] 開啟瀏覽器進行 GitHub 授權登入（推薦）
echo   [2] 直接輸入 GitHub Token（個人訪問權杖）
echo.
set /p choice="請輸入選項 (1 或 2，預設為 1): "
if "%choice%"=="" set choice=1

if "%choice%"=="2" goto INPUT_TOKEN

:BROWSER_LOGIN
echo.
echo 正在開啟瀏覽器進行 GitHub 登入授權...
echo (若瀏覽器彈出，請點選綠色按鈕授權給 dulcineanike)
"C:\Users\dulci\AppData\Local\Programs\Git\mingw64\bin\git-credential-manager.exe" github login --browser
goto DO_PUSH

:INPUT_TOKEN
echo.
echo 請貼上您的 GitHub Token (例如 ghp_xxxxxxxxxxxxxxxxxxxx):
set /p user_token="Token: "
if "%user_token%"=="" goto INPUT_TOKEN
git remote set-url origin https://%user_token%@github.com/dulcineanike/appraiser-law.git
goto DO_PUSH

:DO_PUSH
echo.
echo 正在推送到 GitHub main 分支...
git push -u origin main
echo.
if %ERRORLEVEL% equ 0 (
    echo ========================================================
    echo  [成功] 程式碼與法規資料庫已順利推送到 GitHub！
    echo ========================================================
    echo.
    echo 正在為您開啟 GitHub Pages 設定頁面...
    echo 請在 Branch 下拉選單選擇 "main"，並點擊 "Save" 即可！
    start https://github.com/dulcineanike/appraiser-law/settings/pages
) else (
    echo ========================================================
    echo  [推送未成功] 請檢查是否授權正確的 dulcineanike 帳號。
    echo ========================================================
)
echo.
pause
