# -*- coding: utf-8 -*-
"""
不動產估價師法規資料庫建置腳本
從全國法規資料庫官方 Open Data API 下載並萃取所有母法、子法、規則，
並結合中華民國不動產估價師公會全國聯合會公報。
"""

import os
import io
import re
import json
import zipfile
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE_DIR, "cache")
DATA_DIR = os.path.join(BASE_DIR, "data")

LAW_ZIP_URL = "https://law.moj.gov.tw/api/ch/law/json"
ORDER_ZIP_URL = "https://law.moj.gov.tw/api/ch/order/json"

# 目標法規定義表（依重要性與母法-子法層級重新排序：民法居首，母法後緊接子法/施行細則）
TARGET_LAWS = [
    # ==== 體系 1: 民法與土地基本法規（產權基石） ====
    {
        "name": "民法",
        "category": "civil",
        "categoryName": "民事產權與登記法規",
        "level": "法律",
        "abbr": ["民法", "民法物權"],
        "inExam": True,
        "examSubject": "民法物權與不動產法規",
        "priority": 1
    },
    {
        "name": "民法物權編施行法",
        "category": "civil",
        "categoryName": "民事產權與登記法規",
        "level": "法律",
        "abbr": ["物權法施行法"],
        "inExam": True,
        "examSubject": "民法物權與不動產法規",
        "priority": 2
    },
    {
        "name": "土地法",
        "category": "civil",
        "categoryName": "民事產權與登記法規",
        "level": "法律",
        "abbr": ["土地法"],
        "inExam": True,
        "examSubject": "民法物權與不動產法規",
        "priority": 3
    },
    {
        "name": "土地法施行法",
        "category": "civil",
        "categoryName": "民事產權與登記法規",
        "level": "法律",
        "abbr": ["土地法施行法"],
        "inExam": True,
        "examSubject": "民法物權與不動產法規",
        "priority": 4
    },
    {
        "name": "土地登記規則",
        "category": "civil",
        "categoryName": "民事產權與登記法規",
        "level": "法規命令",
        "abbr": ["土登規則", "土地登記"],
        "inExam": False,
        "examSubject": "產權與估價實務",
        "priority": 5
    },
    {
        "name": "地籍測量實施規則",
        "category": "civil",
        "categoryName": "民事產權與登記法規",
        "level": "法規命令",
        "abbr": ["地籍測量", "測量規則"],
        "inExam": False,
        "examSubject": "建物測量與產權估價實務",
        "priority": 6
    },

    # ==== 體系 2: 不動產估價專業法制體系 ====
    {
        "name": "不動產估價師法",
        "category": "valuation",
        "categoryName": "估價技術與職業規範",
        "level": "法律",
        "abbr": ["估價師法"],
        "inExam": True,
        "examSubject": "民法物權與不動產法規",
        "priority": 7
    },
    {
        "name": "不動產估價師法施行細則",
        "category": "valuation",
        "categoryName": "估價技術與職業規範",
        "level": "法規命令",
        "abbr": ["估價師細則"],
        "inExam": True,
        "examSubject": "民法物權與不動產法規",
        "priority": 8
    },
    {
        "name": "不動產估價技術規則",
        "category": "valuation",
        "categoryName": "估價技術與職業規範",
        "level": "法規命令",
        "abbr": ["技術規則", "估技", "估規"],
        "inExam": True,
        "examSubject": "不動產估價理論與實務、民法物權與不動產法規",
        "priority": 9
    },
    {
        "name": "地價調查估計規則",
        "category": "valuation",
        "categoryName": "估價技術與職業規範",
        "level": "法規命令",
        "abbr": ["地價規則", "地調規則"],
        "inExam": True,
        "examSubject": "民法物權與不動產法規",
        "priority": 10
    },
    {
        "name": "土地徵收補償市價查估辦法",
        "category": "valuation",
        "categoryName": "估價技術與職業規範",
        "level": "法規命令",
        "abbr": ["市價查估辦法", "徵收查估辦法"],
        "inExam": True,
        "examSubject": "民法物權與不動產法規",
        "priority": 11
    },
    {
        "name": "地價及標準地價評議委員會組織與運作辦法",
        "category": "valuation",
        "categoryName": "估價技術與職業規範",
        "level": "法規命令",
        "abbr": ["地評會辦法", "地價評議委員會"],
        "inExam": False,
        "examSubject": "地價評議與實務運作",
        "priority": 12
    },

    # ==== 體系 3: 平均地權、土地稅制與公有財產 ====
    {
        "name": "平均地權條例",
        "category": "tax",
        "categoryName": "土地稅制與公有財產",
        "level": "法律",
        "abbr": ["平權條例", "平均地權"],
        "inExam": True,
        "examSubject": "民法物權與不動產法規",
        "priority": 13
    },
    {
        "name": "平均地權條例施行細則",
        "category": "tax",
        "categoryName": "土地稅制與公有財產",
        "level": "法規命令",
        "abbr": ["平權細則"],
        "inExam": True,
        "examSubject": "民法物權與不動產法規",
        "priority": 14
    },
    {
        "name": "土地稅法",
        "category": "tax",
        "categoryName": "土地稅制與公有財產",
        "level": "法律",
        "abbr": ["土地稅法"],
        "inExam": True,
        "examSubject": "民法物權與不動產法規",
        "priority": 15
    },
    {
        "name": "土地稅法施行細則",
        "category": "tax",
        "categoryName": "土地稅制與公有財產",
        "level": "法規命令",
        "abbr": ["土地稅細則"],
        "inExam": True,
        "examSubject": "民法物權與不動產法規",
        "priority": 16
    },
    {
        "name": "房屋稅條例",
        "category": "tax",
        "categoryName": "土地稅制與公有財產",
        "level": "法律",
        "abbr": ["房屋稅條例"],
        "inExam": False,
        "examSubject": "房屋稅與差別稅率評定",
        "priority": 17
    },
    {
        "name": "契稅條例",
        "category": "tax",
        "categoryName": "土地稅制與公有財產",
        "level": "法律",
        "abbr": ["契稅條例"],
        "inExam": False,
        "examSubject": "不動產交易稅負分析",
        "priority": 18
    },
    {
        "name": "國有財產法",
        "category": "tax",
        "categoryName": "土地稅制與公有財產",
        "level": "法律",
        "abbr": ["國產法"],
        "inExam": False,
        "examSubject": "公有土地標售與地上權估價",
        "priority": 19
    },
    {
        "name": "國有財產法施行細則",
        "category": "tax",
        "categoryName": "土地稅制與公有財產",
        "level": "法規命令",
        "abbr": ["國產細則"],
        "inExam": False,
        "examSubject": "公有財產估價作業",
        "priority": 20
    },
    # 附：國有財產計價方式 (priority: 21) 定義於下文

    # ==== 體系 4: 都市更新、危老、重劃與土地徵收 ====
    {
        "name": "都市更新條例",
        "category": "redevelopment",
        "categoryName": "都更重劃與土地徵收",
        "level": "法律",
        "abbr": ["都更條例"],
        "inExam": True,
        "examSubject": "土地利用法規",
        "priority": 22
    },
    {
        "name": "都市更新條例施行細則",
        "category": "redevelopment",
        "categoryName": "都更重劃與土地徵收",
        "level": "法規命令",
        "abbr": ["都更細則"],
        "inExam": True,
        "examSubject": "土地利用法規",
        "priority": 23
    },
    {
        "name": "都市更新權利變換實施辦法",
        "category": "redevelopment",
        "categoryName": "都更重劃與土地徵收",
        "level": "法規命令",
        "abbr": ["都更權利變換辦法", "權變辦法"],
        "inExam": False,
        "examSubject": "都市更新權利變換估價核心",
        "priority": 24
    },
    {
        "name": "都市危險及老舊建築物加速重建條例",
        "category": "redevelopment",
        "categoryName": "都更重劃與土地徵收",
        "level": "法律",
        "abbr": ["危老條例"],
        "inExam": False,
        "examSubject": "危老重建估價",
        "priority": 25
    },
    {
        "name": "都市危險及老舊建築物加速重建條例施行細則",
        "category": "redevelopment",
        "categoryName": "都更重劃與土地徵收",
        "level": "法規命令",
        "abbr": ["危老細則"],
        "inExam": False,
        "examSubject": "危老重建估價",
        "priority": 26
    },
    {
        "name": "土地徵收條例",
        "category": "redevelopment",
        "categoryName": "都更重劃與土地徵收",
        "level": "法律",
        "abbr": ["土徵條例"],
        "inExam": True,
        "examSubject": "土地利用法規",
        "priority": 27
    },
    {
        "name": "土地徵收條例施行細則",
        "category": "redevelopment",
        "categoryName": "都更重劃與土地徵收",
        "level": "法規命令",
        "abbr": ["土徵細則"],
        "inExam": True,
        "examSubject": "土地利用法規",
        "priority": 28
    },
    {
        "name": "區段徵收實施辦法",
        "category": "redevelopment",
        "categoryName": "都更重劃與土地徵收",
        "level": "法規命令",
        "abbr": ["區段徵收辦法"],
        "inExam": True,
        "examSubject": "土地利用法規",
        "priority": 29
    },
    {
        "name": "市地重劃實施辦法",
        "category": "redevelopment",
        "categoryName": "都更重劃與土地徵收",
        "level": "法規命令",
        "abbr": ["市地重劃辦法"],
        "inExam": True,
        "examSubject": "土地利用法規",
        "priority": 30
    },
    {
        "name": "獎勵土地所有權人辦理市地重劃辦法",
        "category": "redevelopment",
        "categoryName": "都更重劃與土地徵收",
        "level": "法規命令",
        "abbr": ["自辦市地重劃辦法", "自辦重劃"],
        "inExam": False,
        "examSubject": "市地重劃與抵費地估價",
        "priority": 31
    },
    {
        "name": "都市計畫容積移轉實施辦法",
        "category": "redevelopment",
        "categoryName": "都更重劃與土地徵收",
        "level": "法規命令",
        "abbr": ["容移辦法", "容積移轉辦法"],
        "inExam": True,
        "examSubject": "土地利用法規",
        "priority": 32
    },

    # ==== 體系 5: 國土規劃、都市計畫與建築管制 ====
    {
        "name": "國土計畫法",
        "category": "landuse",
        "categoryName": "土地規劃與建築管制",
        "level": "法律",
        "abbr": ["國土法"],
        "inExam": True,
        "examSubject": "土地利用法規",
        "priority": 33
    },
    {
        "name": "國土計畫法施行細則",
        "category": "landuse",
        "categoryName": "土地規劃與建築管制",
        "level": "法規命令",
        "abbr": ["國土細則"],
        "inExam": True,
        "examSubject": "土地利用法規",
        "priority": 34
    },
    {
        "name": "區域計畫法",
        "category": "landuse",
        "categoryName": "土地規劃與建築管制",
        "level": "法律",
        "abbr": ["區域計畫法"],
        "inExam": True,
        "examSubject": "土地利用法規",
        "priority": 35
    },
    {
        "name": "區域計畫法施行細則",
        "category": "landuse",
        "categoryName": "土地規劃與建築管制",
        "level": "法規命令",
        "abbr": ["區域細則"],
        "inExam": True,
        "examSubject": "土地利用法規",
        "priority": 36
    },
    {
        "name": "非都市土地使用管制規則",
        "category": "landuse",
        "categoryName": "土地規劃與建築管制",
        "level": "法規命令",
        "abbr": ["非都管制規則", "非都規則"],
        "inExam": True,
        "examSubject": "土地利用法規",
        "priority": 37
    },
    {
        "name": "都市計畫法",
        "category": "landuse",
        "categoryName": "土地規劃與建築管制",
        "level": "法律",
        "abbr": ["都計法"],
        "inExam": True,
        "examSubject": "土地利用法規",
        "priority": 38
    },
    {
        "name": "都市計畫法臺灣省施行細則",
        "category": "landuse",
        "categoryName": "土地規劃與建築管制",
        "level": "法規命令",
        "abbr": ["都計細則", "都市計畫細則"],
        "inExam": True,
        "examSubject": "土地利用法規",
        "priority": 39
    },
    {
        "name": "建築法",
        "category": "landuse",
        "categoryName": "土地規劃與建築管制",
        "level": "法律",
        "abbr": ["建築法"],
        "inExam": False,
        "examSubject": "土地開發分析與建築法規",
        "priority": 40
    },
    {
        "name": "建築技術規則總則編",
        "category": "landuse",
        "categoryName": "土地規劃與建築管制",
        "level": "法規命令",
        "abbr": ["建技總則"],
        "inExam": False,
        "examSubject": "容積、建蔽率與建築規劃",
        "priority": 41
    },
    {
        "name": "建築技術規則建築設計施工編",
        "category": "landuse",
        "categoryName": "土地規劃與建築管制",
        "level": "法規命令",
        "abbr": ["設計施工編", "建技施工編"],
        "inExam": False,
        "examSubject": "建築設計與容積計算估價",
        "priority": 42
    },

    # ==== 體系 6: 交易管理、特殊土地與不動產金融 ====
    {
        "name": "公寓大廈管理條例",
        "category": "civil",
        "categoryName": "民事產權與登記法規",
        "level": "法律",
        "abbr": ["公寓大廈條例", "公寓大廈"],
        "inExam": False,
        "examSubject": "房地區分所有與共有持分估價",
        "priority": 43
    },
    {
        "name": "公寓大廈管理條例施行細則",
        "category": "civil",
        "categoryName": "民事產權與登記法規",
        "level": "法規命令",
        "abbr": ["公寓細則"],
        "inExam": False,
        "examSubject": "實務延伸",
        "priority": 44
    },
    {
        "name": "不動產經紀業管理條例",
        "category": "civil",
        "categoryName": "民事產權與登記法規",
        "level": "法律",
        "abbr": ["經紀業條例"],
        "inExam": False,
        "examSubject": "實價登錄與交易實務",
        "priority": 45
    },
    {
        "name": "不動產經紀業管理條例施行細則",
        "category": "civil",
        "categoryName": "民事產權與登記法規",
        "level": "法規命令",
        "abbr": ["經紀業細則"],
        "inExam": False,
        "examSubject": "實價登錄實務",
        "priority": 46
    },
    {
        "name": "農業發展條例",
        "category": "landuse",
        "categoryName": "土地規劃與建築管制",
        "level": "法律",
        "abbr": ["農發條例"],
        "inExam": False,
        "examSubject": "農地與農舍估價",
        "priority": 47
    },
    {
        "name": "農業發展條例施行細則",
        "category": "landuse",
        "categoryName": "土地規劃與建築管制",
        "level": "法規命令",
        "abbr": ["農發細則"],
        "inExam": False,
        "examSubject": "農地估價實務",
        "priority": 48
    },
    {
        "name": "不動產證券化條例",
        "category": "tax",
        "categoryName": "土地稅制與公有財產",
        "level": "法律",
        "abbr": ["證券化條例"],
        "inExam": False,
        "examSubject": "不動產投資信託 REITs 估價",
        "priority": 49
    },
    {
        "name": "不動產證券化條例施行細則",
        "category": "tax",
        "categoryName": "土地稅制與公有財產",
        "level": "法規命令",
        "abbr": ["證券化細則"],
        "inExam": False,
        "examSubject": "不動產證券化估價",
        "priority": 50
    },
    {
        "name": "信託法",
        "category": "civil",
        "categoryName": "民事產權與登記法規",
        "level": "法律",
        "abbr": ["信託法"],
        "inExam": False,
        "examSubject": "不動產投資與信託估價",
        "priority": 51
    },
    {
        "name": "文化資產保存法",
        "category": "landuse",
        "categoryName": "土地規劃與建築管制",
        "level": "法律",
        "abbr": ["文資法"],
        "inExam": False,
        "examSubject": "古蹟容積移轉與文化資產估價",
        "priority": 52
    },
    {
        "name": "水土保持法",
        "category": "landuse",
        "categoryName": "土地規劃與建築管制",
        "level": "法律",
        "abbr": ["水保法"],
        "inExam": False,
        "examSubject": "山坡地開發估價",
        "priority": 53
    },
    {
        "name": "山坡地保育利用條例",
        "category": "landuse",
        "categoryName": "土地規劃與建築管制",
        "level": "法律",
        "abbr": ["山坡地條例"],
        "inExam": False,
        "examSubject": "山坡地估價實務",
        "priority": 54
    }
]

def download_file(url, target_path):
    if os.path.exists(target_path) and os.path.getsize(target_path) > 100000:
        print(f"File already cached: {target_path}")
        return
    print(f"Downloading from {url} to {target_path} ...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=90) as resp, open(target_path, 'wb') as f:
        f.write(resp.read())
    print(f"Saved: {target_path} ({os.path.getsize(target_path)} bytes)")

def load_laws_from_zip(zip_path, json_name):
    print(f"Reading {json_name} from {zip_path} ...")
    with zipfile.ZipFile(zip_path, 'r') as z:
        with z.open(json_name) as f:
            data = json.load(f)
            return data.get("Laws", [])

def clean_text(text):
    if not text:
        return ""
    lines = text.split("\n")
    cleaned_lines = []
    for line in lines:
        cleaned_lines.append(line.strip())
    return "\n".join(cleaned_lines).strip()

def parse_article_number(raw_no):
    if not raw_no:
        return ""
    m = re.search(r"第\s*(\d+(?:-\d+)?)\s*條", raw_no)
    if m:
        return m.group(1)
    return raw_no.strip()

def build_law_object(law_def, raw_data):
    law_id = re.sub(r"[^\w\d]", "_", law_def["name"]).strip("_")
    
    raw_articles = raw_data.get("LawArticles", [])
    parsed_articles = []
    chapters = []
    current_chapter = "總則"
    
    for art in raw_articles:
        art_type = art.get("ArticleType", "A")
        raw_no = art.get("ArticleNo", "").strip()
        content = clean_text(art.get("ArticleContent", ""))
        
        if art_type == "C":
            current_chapter = content
            chapters.append({
                "chapterTitle": content,
                "firstArticle": ""
            })
        else:
            art_num = parse_article_number(raw_no)
            if chapters and not chapters[-1]["firstArticle"]:
                chapters[-1]["firstArticle"] = art_num
            
            paragraphs = [p.strip() for p in content.split("\n") if p.strip()]
            
            parsed_articles.append({
                "rawNo": raw_no,
                "num": art_num,
                "chapter": current_chapter,
                "content": content,
                "paragraphs": paragraphs
            })
            
    return {
        "id": law_id,
        "name": law_def["name"],
        "category": law_def["category"],
        "categoryName": law_def["categoryName"],
        "level": law_def["level"],
        "abbr": law_def["abbr"],
        "inExam": law_def["inExam"],
        "examSubject": law_def["examSubject"],
        "priority": law_def["priority"],
        "lawURL": raw_data.get("LawURL", ""),
        "modifiedDate": raw_data.get("LawModifiedDate", ""),
        "effectiveDate": raw_data.get("LawEffectiveDate", ""),
        "totalArticles": len(parsed_articles),
        "chapters": chapters,
        "articles": parsed_articles
    }

NATIONAL_PROPERTY_PRICING_RULE = {
    "id": "國有財產計價方式",
    "name": "國有財產計價方式",
    "category": "tax",
    "categoryName": "土地稅制與公有財產",
    "level": "行政規則",
    "abbr": ["國產計價方式", "國有財產計價"],
    "inExam": False,
    "examSubject": "公有土地讓售、標售底價與地上權估價實務",
    "priority": 21,
    "lawURL": "https://www.fnp.gov.tw",
    "modifiedDate": "111.08.19",
    "effectiveDate": "111.08.19",
    "totalArticles": 8,
    "chapters": [{"chapterTitle": "全文", "firstArticle": "1"}],
    "articles": [
        {
            "rawNo": "第一點",
            "num": "1",
            "chapter": "全文",
            "content": "本計價方式依國有財產法第五十八條第一項規定訂定之。",
            "paragraphs": ["本計價方式依國有財產法第五十八條第一項規定訂定之。"]
        },
        {
            "rawNo": "第二點",
            "num": "2",
            "chapter": "全文",
            "content": "國有財產估價之標準，應參考市價查估。但依國有非公用不動產交換辦法第二條第七款規定與其他公有土地辦理交換者，依財政部核定交換日之當期公告土地現值計算其價值。\n前項所稱市價，指查估國有財產價格當時之市場價值。",
            "paragraphs": [
                "國有財產估價之標準，應參考市價查估。但依國有非公用不動產交換辦法第二條第七款規定與其他公有土地辦理交換者，依財政部核定交換日之當期公告土地現值計算其價值。",
                "前項所稱市價，指查估國有財產價格當時之市場價值。"
            ]
        },
        {
            "rawNo": "第三點",
            "num": "3",
            "chapter": "全文",
            "content": "依本計價方式查估評定或計算之國有財產價格，得為讓售價格、標售底價、贈與價格、交換價格或其他計算國有財產之價格；並得作為計算租金或地上權權利金之基礎。",
            "paragraphs": ["依本計價方式查估評定或計算之國有財產價格，得為讓售價格、標售底價、贈與價格、交換價格或其他計算國有財產之價格；並得作為計算租金或地上權權利金之基礎。"]
        },
        {
            "rawNo": "第四點",
            "num": "4",
            "chapter": "全文",
            "content": "國有財產價格，必要時得委託政府機關、適當機構、不動產估價師或其他專業人士查估。",
            "paragraphs": ["國有財產價格，必要時得委託政府機關、適當機構、不動產估價師或其他專業人士查估。"]
        },
        {
            "rawNo": "第五點",
            "num": "5",
            "chapter": "全文",
            "content": "國有不動產價格之計算方法如下：\n（一）國有土地之價格，應逐筆查估。\n（二）屬於取得開發許可範圍內之國有土地，其價格以開發後之價值計估，並得按國有土地占整體開發面積之比例減除開發成本；所減除之金額，不得超過該國有土地計估價格之百分之三十。\n（三）國有建築改良物之價格，應逐棟（戶）按其重建價格減除折舊後之餘額估計。但已超過耐用年限者，得依照稅捐稽徵機關提供之當年期現值計算。\n（四）國有區分所有建物及其基地之價格，應按各區分所有建物及其基地一併查估。該建物及基地總價減除前款查估之建築改良物價格後，為基地價格。私有區分所有建物使用之國有基地，其價格之查估亦同。依上述規定查估之基地價格，低於當期公告土地現值時，得將房地總價依建物所在地之稅捐稽徵機關提供之該建物當年期現值與公告土地現值總額之比例，分算建物價格與基地價格。但分算後之基地價格如高於當期公告土地現值時，以當期公告土地現值為基地價格，而房地總價減除該基地價格後之餘額為建物價格。\n（五）國有農作改良物之價格，參照當地地方政府規定之徵收補償標準查估。\n（六）國有林產物之價格，依照林業主管機關之規定查估。\n（七）天然資源之價格，依照有關法令查估。",
            "paragraphs": [
                "國有不動產價格之計算方法如下：",
                "（一）國有土地之價格，應逐筆查估。",
                "（二）屬於取得開發許可範圍內之國有土地，其價格以開發後之價值計估，並得按國有土地占整體開發面積之比例減除開發成本；所減除之金額，不得超過該國有土地計估價格之百分之三十。",
                "（三）國有建築改良物之價格，應逐棟（戶）按其重建價格減除折舊後之餘額估計。但已超過耐用年限者，得依照稅捐稽徵機關提供之當年期現值計算。",
                "（四）國有區分所有建物及其基地之價格，應按各區分所有建物及其基地一併查估。該建物及基地總價減除前款查估之建築改良物價格後，為基地價格。私有區分所有建物使用之國有基地，其價格之查估亦同。依上述規定查估之基地價格，低於當期公告土地現值時，得將房地總價依建物所在地之稅捐稽徵機關提供之該建物當年期現值與公告土地現值總額之比例，分算建物價格與基地價格。但分算後之基地價格如高於當期公告土地現值時，以當期公告土地現值為基地價格，而房地總價減除該基地價格後之餘額為建物價格。",
                "（五）國有農作改良物之價格，參照當地地方政府規定之徵收補償標準查估。",
                "（六）國有林產物之價格，依照林業主管機關之規定查估。",
                "（七）天然資源之價格，依照有關法令查估。"
            ]
        },
        {
            "rawNo": "第六點",
            "num": "6",
            "chapter": "全文",
            "content": "國有動產價格之計算方法如下：\n（一）一般國有動產價格，以原價扣除折舊後之餘額，按物價指數查估；其無原價者，按重置價格查估。\n（二）特殊物品按市價逐件查估。\n（三）抵稅之動產價格，按核定抵繳金額計算。其經列標未能標脫者，得逕行按照原底價減一成計算，再行列標。其仍無法標脫者，得續減價列標。",
            "paragraphs": [
                "國有動產價格之計算方法如下：",
                "（一）一般國有動產價格，以原價扣除折舊後之餘額，按物價指數查估；其無原價者，按重置價格查估。",
                "（二）特殊物品按市價逐件查估。",
                "（三）抵稅之動產價格，按核定抵繳金額計算。其經列標未能標脫者，得逕行按照原底價減一成計算，再行列標。其仍無法標脫者，得續減價列標。"
            ]
        },
        {
            "rawNo": "第七點",
            "num": "7",
            "chapter": "全文",
            "content": "（本點刪除）",
            "paragraphs": ["（本點刪除）"]
        },
        {
            "rawNo": "第八點",
            "num": "8",
            "chapter": "全文",
            "content": "依本計價方式查估之各項國有財產價格，財政部國有財產署所屬各分署應循估價作業程序提交所屬各分署國有財產估價小組審核，並依規定將審核結果報由國有財產署提交國有財產估價委員會評定。\n他機關或機構查估之國有財產價格，經行政院或財政部交付複估者，得由國有財產署逕提國有財產估價委員會評定。",
            "paragraphs": [
                "依本計價方式查估之各項國有財產價格，財政部國有財產署所屬各分署應循估價作業程序提交所屬各分署國有財產估價小組審核，並依規定將審核結果報由國有財產署提交國有財產估價委員會評定。",
                "他機關或機構查估之國有財產價格，經行政院或財政部交付複估者，得由國有財產署逕提國有財產估價委員會評定。"
            ]
        }
    ]
}

def main():
    os.makedirs(CACHE_DIR, exist_ok=True)
    os.makedirs(DATA_DIR, exist_ok=True)
    
    law_zip_path = os.path.join(CACHE_DIR, "ChLaw.zip")
    order_zip_path = os.path.join(CACHE_DIR, "ChOrder.zip")
    
    download_file(LAW_ZIP_URL, law_zip_path)
    download_file(ORDER_ZIP_URL, order_zip_path)
    
    raw_laws = load_laws_from_zip(law_zip_path, "ChLaw.json")
    raw_orders = load_laws_from_zip(order_zip_path, "ChOrder.json")
    
    print(f"Total laws loaded: {len(raw_laws)}, Total orders loaded: {len(raw_orders)}")
    
    law_map = {item.get("LawName"): item for item in raw_laws}
    order_map = {item.get("LawName"): item for item in raw_orders}
    
    extracted_laws = []
    missing_laws = []
    
    def find_in_dict(target_name, d):
        # 1. Exact match
        if target_name in d:
            return d[target_name]
        # 2. Match with replaced punctuation / conjunction
        norm_target = target_name.replace("與", "及")
        if norm_target in d:
            return d[norm_target]
        # 3. Match keys that start with target_name (e.g. key has trailing note like （89.12.29 訂定）)
        for k, v in d.items():
            clean_k = re.sub(r"[\（\(].*?[\）\)]", "", k).strip()
            if clean_k == target_name or clean_k == norm_target:
                return v
        for k, v in d.items():
            if k.startswith(target_name) or k.startswith(norm_target):
                return v
        return None

    for ldef in TARGET_LAWS:
        name = ldef["name"]
        raw_data = find_in_dict(name, law_map)
        if not raw_data:
            raw_data = find_in_dict(name, order_map)
            
        if not raw_data:
            missing_laws.append(name)
            continue
            
        law_obj = build_law_object(ldef, raw_data)
        extracted_laws.append(law_obj)
        print(f"Extracted: {name} (Articles: {law_obj['totalArticles']})")
        
    extracted_laws.append(NATIONAL_PROPERTY_PRICING_RULE)
    print("Extracted: 國有財產計價方式 (Articles: 8)")
    print(f"\nSuccessfully extracted {len(extracted_laws)} laws.")
    if missing_laws:
        print(f"Missing laws: {missing_laws}")
        
    extracted_laws.sort(key=lambda x: x["priority"])
    
    full_data_path = os.path.join(DATA_DIR, "laws_data.json")
    with open(full_data_path, "w", encoding="utf-8") as f:
        json.dump(extracted_laws, f, ensure_ascii=False, indent=2)
    print(f"Saved full laws data: {full_data_path} ({os.path.getsize(full_data_path)} bytes)")
    
    index_list = []
    for l in extracted_laws:
        index_list.append({
            "id": l["id"],
            "name": l["name"],
            "category": l["category"],
            "categoryName": l["categoryName"],
            "level": l["level"],
            "abbr": l["abbr"],
            "inExam": l["inExam"],
            "examSubject": l["examSubject"],
            "priority": l["priority"],
            "modifiedDate": l["modifiedDate"],
            "totalArticles": l["totalArticles"],
            "chapters": l["chapters"]
        })
        
    index_path = os.path.join(DATA_DIR, "laws_index.json")
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index_list, f, ensure_ascii=False, indent=2)
    print(f"Saved laws index: {index_path} ({os.path.getsize(index_path)} bytes)")

if __name__ == "__main__":
    main()
