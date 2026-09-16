# -*- coding: utf-8 -*-
"""
估價小六法 - 一鍵全自動雲端發布腳本
無論何時更新法規或功能，執行此腳本即可自動發布至全球 CDN 雲端正式網址。
"""

import os
import sys
import subprocess
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOMAIN = "appraiser-law-tw.surge.sh"

def deploy():
    print(f"==================================================")
    print(f"  正在將估價小六法發布至全球雲端: https://{DOMAIN}")
    print(f"==================================================")

    # 執行 Surge 自動部署
    cmd = ["npx.cmd", "surge", BASE_DIR, DOMAIN]
    p = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        encoding="utf-8",
        errors="replace"
    )
    
    auth_input = "dulcineanike@hotmail.com\nValLaw2026!\n"
    stdout, stderr = p.communicate(input=auth_input)

    # 驗證網站狀態
    test_url = f"https://{DOMAIN}"
    try:
        req = urllib.request.Request(test_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                print("\n[SUCCESS] 發布成功！正式公開網址：")
                print(f"--> {test_url}\n")
                return True
    except Exception as e:
        print(f"驗證線上狀態時發生錯誤: {e}")
        return False

if __name__ == "__main__":
    deploy()
