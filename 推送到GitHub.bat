@echo off
chcp 65001 >nul
title 上傳估價小六法到 GitHub (dulcineanike)
echo ========================================================
echo        正在將估價小六法推送到 GitHub 倉庫
echo        目標帳號: dulcineanike
echo        倉庫網址: https://github.com/dulcineanike/appraiser-law
echo ========================================================
echo.
echo 如果跳出登入視窗，請點選「Sign in with your browser」並授權 dulcineanike。
echo.
git push -u origin main
echo.
if %ERRORLEVEL% equ 0 (
    echo ========================================================
    echo  [成功] 程式碼與法規資料庫已順利推送到 GitHub！
    echo ========================================================
) else (
    echo [提示] 如果登入失敗，請確認已登入 dulcineanike 帳號。
)
echo.
pause
