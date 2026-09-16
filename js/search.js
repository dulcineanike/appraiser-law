/**
 * 估價小六法 - 極速前端檢索與條號智慧解析引擎
 */

class LawSearchEngine {
  constructor() {
    this.lawsIndex = [];
    this.lawsData = [];
    this.bulletinsData = [];
    this.isLoaded = false;

    // 常見估價法規別名與縮寫映射表
    this.aliasMap = {
      '技術規則': '不動產估價技術規則',
      '估技': '不動產估價技術規則',
      '估規': '不動產估價技術規則',
      '技規': '不動產估價技術規則',
      '估價師法': '不動產估價師法',
      '估價師細則': '不動產估價師法施行細則',
      '地調規則': '地價調查估計規則',
      '地價規則': '地價調查估計規則',
      '市價查估': '土地徵收補償市價查估辦法',
      '土地法': '土地法',
      '土法': '土地法',
      '土登': '土地登記規則',
      '土地登記': '土地登記規則',
      '地籍測量': '地籍測量實施規則',
      '民法': '民法',
      '民法物權': '民法',
      '物權': '民法',
      '物權細則': '民法物權編施行法',
      '公寓大廈': '公寓大廈管理條例',
      '公寓': '公寓大廈管理條例',
      '經紀業': '不動產經紀業管理條例',
      '都計': '都市計畫法',
      '都市計畫': '都市計畫法',
      '都計細則': '都市計畫法臺灣省施行細則',
      '國土法': '國土計畫法',
      '區域法': '區域計畫法',
      '非都管制': '非都市土地使用管制規則',
      '非都': '非都市土地使用管制規則',
      '建築法': '建築法',
      '建技施工': '建築技術規則建築設計施工編',
      '施工編': '建築技術規則建築設計施工編',
      '都更': '都市更新條例',
      '都市更新': '都市更新條例',
      '都更細則': '都市更新條例施行細則',
      '權利變換': '都市更新權利變換實施辦法',
      '權變辦法': '都市更新權利變換實施辦法',
      '危老': '都市危險及老舊建築物加速重建條例',
      '危老條例': '都市危險及老舊建築物加速重建條例',
      '土徵': '土地徵收條例',
      '土地徵收': '土地徵收條例',
      '土徵細則': '土地徵收條例施行細則',
      '容移': '都市計畫容積移轉實施辦法',
      '容積移轉': '都市計畫容積移轉實施辦法',
      '區段徵收': '區段徵收實施辦法',
      '市地重劃': '市地重劃實施辦法',
      '自辦重劃': '獎勵土地所有權人辦理市地重劃辦法',
      '平均地權': '平均地權條例',
      '平權': '平均地權條例',
      '平權細則': '平均地權條例施行細則',
      '土地稅': '土地稅法',
      '土稅': '土地稅法',
      '房屋稅': '房屋稅條例',
      '契稅': '契稅條例',
      '國有財產': '國有財產法',
      '國產法': '國有財產法',
      '國產計價': '國有財產計價方式',
      '計價方式': '國有財產計價方式',
      '證券化': '不動產證券化條例'
    };
  }

  setDatabase(lawsIndex, lawsData, bulletinsData) {
    this.lawsIndex = lawsIndex || [];
    this.lawsData = lawsData || [];
    this.bulletinsData = bulletinsData || [];
    this.isLoaded = true;
  }

  /**
   * 解析輸入查詢字串
   * 例如：「技規 43」、「都更 67」、「土地法 97條」、「收益資本化率」
   */
  parseQuery(rawQuery) {
    const trimmed = (rawQuery || '').trim();
    if (!trimmed) return null;

    // 檢查是否為公報快捷，如「公報 5」、「第5號公報」、「公報五」
    const bulletinMatch = trimmed.match(/(?:第)?\s*([0-9一二三四五六七八九十]+)\s*(?:號)?公報/i) ||
                          trimmed.match(/公報\s*([0-9一二三四五六七八九十]+)/i);
    if (bulletinMatch) {
      let bNo = bulletinMatch[1];
      const cnMap = {'一':1, '二':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8, '九':9, '十':10, '十一':11, '十二':12, '十三':13, '十四':14, '十五':15};
      if (cnMap[bNo]) bNo = cnMap[bNo];
      return {
        type: 'bulletin_shortcut',
        bulletinNo: parseInt(bNo, 10),
        raw: trimmed
      };
    }

    // 檢查是否為「法規名稱/縮寫 + 條號」
    // 匹配例如: "技術規則 43", "技規43", "土地法第97條", "都更 67-1"
    const shortcutMatch = trimmed.match(/^([\u4e00-\u9fa5A-Za-z0-9]+?)[\s第]*([0-9]+(?:-[0-9]+)?)[\s條]*$/);
    if (shortcutMatch) {
      const alias = shortcutMatch[1];
      const artNo = shortcutMatch[2];
      const targetLawName = this.resolveLawName(alias);
      if (targetLawName) {
        return {
          type: 'article_shortcut',
          lawName: targetLawName,
          articleNo: artNo,
          raw: trimmed
        };
      }
    }

    // 一般關鍵字搜尋
    return {
      type: 'fulltext',
      keyword: trimmed,
      raw: trimmed
    };
  }

  resolveLawName(alias) {
    if (this.aliasMap[alias]) return this.aliasMap[alias];
    // 比對完整法規名稱或前綴
    for (const law of this.lawsIndex) {
      if (law.name === alias || law.name.includes(alias)) {
        return law.name;
      }
      if (law.abbr && law.abbr.includes(alias)) {
        return law.name;
      }
    }
    return null;
  }

  /**
   * 執行搜尋
   */
  search(queryStr) {
    if (!this.isLoaded || !queryStr) return { hits: [], queryType: 'none' };
    const parsed = this.parseQuery(queryStr);
    if (!parsed) return { hits: [], queryType: 'none' };

    // 1. 公報快捷直達
    if (parsed.type === 'bulletin_shortcut') {
      const b = this.bulletinsData.find(item => item.no === parsed.bulletinNo);
      if (b) {
        return {
          queryType: 'bulletin_direct',
          target: b,
          hits: [{
            type: 'bulletin',
            id: b.id,
            title: b.title,
            subTitle: b.subject,
            snippet: b.summary,
            data: b
          }]
        };
      }
    }

    // 2. 條號快捷直達
    if (parsed.type === 'article_shortcut') {
      const targetLaw = this.lawsData.find(l => l.name === parsed.lawName);
      if (targetLaw) {
        const art = targetLaw.articles.find(a => a.num === parsed.articleNo);
        if (art) {
          return {
            queryType: 'article_direct',
            targetLaw: targetLaw,
            targetArticle: art,
            hits: [{
              type: 'article',
              lawId: targetLaw.id,
              lawName: targetLaw.name,
              articleNo: art.rawNo,
              articleNum: art.num,
              chapter: art.chapter,
              snippet: art.content,
              matched: true
            }]
          };
        }
      }
    }

    // 3. 全文關鍵字檢索
    const kw = parsed.keyword.toLowerCase();
    const hits = [];

    // 檢索法規條文
    for (const law of this.lawsData) {
      // 若法規名稱符合
      const lawNameMatch = law.name.toLowerCase().includes(kw);

      for (const art of law.articles) {
        const artNoMatch = art.num === kw || art.rawNo.includes(kw);
        const contentMatch = art.content.toLowerCase().includes(kw);

        if (artNoMatch || contentMatch || lawNameMatch) {
          // 生成帶高亮的摘要片段
          const snippet = this.createSnippet(art.content, kw);
          hits.push({
            type: 'article',
            lawId: law.id,
            lawName: law.name,
            level: law.level,
            inExam: law.inExam,
            articleNo: art.rawNo,
            articleNum: art.num,
            chapter: art.chapter,
            snippet: snippet,
            score: (artNoMatch ? 100 : 0) + (contentMatch ? 50 : 0) + (lawNameMatch ? 20 : 0) + (law.inExam ? 10 : 0)
          });
          if (hits.length >= 80) break;
        }
      }
      if (hits.length >= 80) break;
    }

    // 檢索公會公報
    for (const b of this.bulletinsData) {
      const titleMatch = b.title.toLowerCase().includes(kw);
      const summaryMatch = b.summary.toLowerCase().includes(kw);
      const kpMatch = b.keyPoints.some(kp => kp.title.includes(kw) || kp.content.includes(kw));

      if (titleMatch || summaryMatch || kpMatch) {
        hits.push({
          type: 'bulletin',
          id: b.id,
          title: b.title,
          subTitle: b.subject,
          snippet: this.createSnippet(b.summary + ' ' + b.keyPoints.map(k => k.title + ': ' + k.content).join(' '), kw),
          score: 80 + (titleMatch ? 40 : 0)
        });
      }
    }

    // 依分數排序
    hits.sort((a, b) => (b.score || 0) - (a.score || 0));

    return {
      queryType: 'fulltext',
      keyword: kw,
      totalCount: hits.length,
      hits: hits.slice(0, 50)
    };
  }

  createSnippet(text, keyword) {
    if (!text) return '';
    const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
    if (idx === -1) {
      return text.slice(0, 110) + (text.length > 110 ? '...' : '');
    }
    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + keyword.length + 65);
    let snippet = text.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
    return snippet;
  }
}

window.LawSearchEngine = LawSearchEngine;
