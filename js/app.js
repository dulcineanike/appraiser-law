/**
 * 估價小六法 - 主應用程式邏輯
 */

document.addEventListener('DOMContentLoaded', async () => {
  const searchEngine = new LawSearchEngine();
  
  // App State
  const state = {
    lawsIndex: [],
    lawsData: [],
    bulletinsData: [],
    currentView: 'reader', // 'reader', 'search', 'bulletins', 'bookmarks'
    currentLawId: '民法',
    currentCategory: 'all',
    currentSearchQuery: '',
    fontSize: localStorage.getItem('val_font_size') || '16',
    theme: localStorage.getItem('val_theme') || 'light',
    bookmarks: JSON.parse(localStorage.getItem('val_bookmarks') || '[]'),
    activeScrubberArticle: null
  };

  // DOM Elements
  const el = {
    sidebar: document.getElementById('sidebar'),
    sidebarBackdrop: document.getElementById('sidebarBackdrop'),
    btnToggleSidebar: document.getElementById('btnToggleSidebar'),
    categoryContainer: document.getElementById('categoryContainer'),
    lawListContainer: document.getElementById('lawListContainer'),
    mainContent: document.getElementById('mainContent'),
    searchInput: document.getElementById('searchInput'),
    btnThemeToggle: document.getElementById('btnThemeToggle'),
    btnFontToggle: document.getElementById('btnFontToggle'),
    modalOverlay: document.getElementById('modalOverlay'),
    modalTitle: document.getElementById('modalTitle'),
    modalContent: document.getElementById('modalContent'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    toast: document.getElementById('toast'),
    navTabs: document.querySelectorAll('.nav-tab-btn'),
    fabJump: document.getElementById('fabJump'),
    audioPlayerBar: document.getElementById('audioPlayerBar'),
    playerTitle: document.getElementById('playerTitle'),
    btnPlayerToggle: document.getElementById('btnPlayerToggle'),
    btnPlayerNext: document.getElementById('btnPlayerNext'),
    btnPlayerSpeed: document.getElementById('btnPlayerSpeed'),
    btnPlayerClose: document.getElementById('btnPlayerClose')
  };

  const ttsPlayer = new LawTTSPlayer();

  // Apply Theme & Font size
  document.documentElement.setAttribute('data-theme', state.theme);
  document.documentElement.style.setProperty('--font-size-base', `${state.fontSize}px`);

  // Show Toast
  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    setTimeout(() => {
      el.toast.classList.remove('show');
    }, 2200);
  }

  // Load Data
  try {
    const [indexRes, dataRes, bullRes] = await Promise.all([
      fetch('./data/laws_index.json'),
      fetch('./data/laws_data.json'),
      fetch('./data/bulletins_data.json')
    ]);

    state.lawsIndex = await indexRes.json();
    state.lawsData = await dataRes.json();
    state.bulletinsData = await bullRes.json();
    searchEngine.setDatabase(state.lawsIndex, state.lawsData, state.bulletinsData);

    renderCategories();
    renderLawList();
    renderReaderView(state.currentLawId);
  } catch (err) {
    console.error('Error loading legal database:', err);
    el.mainContent.innerHTML = `<div style="padding: 30px; text-align: center; color: red;">載入法規資料庫失敗，請確認資料檔案是否存在。</div>`;
  }

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        console.log('ServiceWorker registration successful with scope: ', reg.scope);
      }).catch((err) => {
        console.log('ServiceWorker registration failed: ', err);
      });
    });
  }

  // ================= Event Handlers =================

  // Toggle Sidebar
  function toggleSidebar(open) {
    if (open === undefined) {
      el.sidebar.classList.toggle('open');
      el.sidebarBackdrop.classList.toggle('show');
    } else if (open) {
      el.sidebar.classList.add('open');
      el.sidebarBackdrop.classList.add('show');
    } else {
      el.sidebar.classList.remove('open');
      el.sidebarBackdrop.classList.remove('show');
    }
  }

  el.btnToggleSidebar?.addEventListener('click', () => toggleSidebar());
  el.sidebarBackdrop?.addEventListener('click', () => toggleSidebar(false));

  // Theme Toggle
  el.btnThemeToggle?.addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('val_theme', state.theme);
    document.documentElement.setAttribute('data-theme', state.theme);
    showToast(state.theme === 'dark' ? '已切換為深色夜間模式' : '已切換為明亮模式');
  });

  // Font Size Cycle
  el.btnFontToggle?.addEventListener('click', () => {
    const sizes = ['15', '17', '19', '21'];
    let idx = sizes.indexOf(state.fontSize);
    state.fontSize = sizes[(idx + 1) % sizes.length];
    localStorage.setItem('val_font_size', state.fontSize);
    document.documentElement.style.setProperty('--font-size-base', `${state.fontSize}px`);
    showToast(`字體大小已設定為 ${state.fontSize}px`);
  });

  // Search Input
  let searchDebounceTimer = null;
  el.searchInput?.addEventListener('input', (e) => {
    const query = e.target.value;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      handleSearch(query);
    }, 180);
  });

  function handleSearch(query) {
    state.currentSearchQuery = query;
    if (!query.trim()) {
      if (state.currentView === 'search') {
        switchView('reader');
      }
      return;
    }

    const result = searchEngine.search(query);
    if (result.queryType === 'article_direct') {
      // 條號直達！直接跳至該法規與條文
      state.currentLawId = result.targetLaw.id;
      switchView('reader');
      renderReaderView(state.currentLawId, result.targetArticle.num);
      showToast(`已跳轉至《${result.targetLaw.name}》${result.targetArticle.rawNo}`);
      toggleSidebar(false);
      return;
    }

    if (result.queryType === 'bulletin_direct') {
      // 公報直達！
      switchView('bulletins');
      renderBulletinsView(result.target.id);
      showToast(`已跳轉至《${result.target.title}》`);
      toggleSidebar(false);
      return;
    }

    // 呈現全文搜尋結果
    state.currentView = 'search';
    el.navTabs.forEach(t => {
      if (t.getAttribute('data-view') === 'search') {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });
    renderSearchResults(result, query);
  }

  // Bottom Nav Tabs
  el.navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.getAttribute('data-view');
      switchView(view);
    });
  });

  function switchView(viewName) {
    state.currentView = viewName;
    el.navTabs.forEach(t => {
      if (t.getAttribute('data-view') === viewName) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });

    if (viewName === 'reader') {
      renderReaderView(state.currentLawId);
    } else if (viewName === 'bulletins') {
      renderBulletinsView();
    } else if (viewName === 'bookmarks') {
      renderBookmarksView();
    } else if (viewName === 'search') {
      if (state.currentSearchQuery) {
        const result = searchEngine.search(state.currentSearchQuery);
        renderSearchResults(result, state.currentSearchQuery);
      } else {
        renderSearchLandingView();
      }
    }
  }

  // Modal Close
  el.modalCloseBtn?.addEventListener('click', () => {
    el.modalOverlay.classList.remove('open');
  });
  el.modalOverlay?.addEventListener('click', (e) => {
    if (e.target === el.modalOverlay) {
      el.modalOverlay.classList.remove('open');
    }
  });

  // FAB Jump Click
  el.fabJump?.addEventListener('click', () => {
    openQuickJumpModal();
  });

  // ================= Renderers =================

  // Render Category Filter Chips
  function renderCategories() {
    const cats = [
      { id: 'all', name: '全部法規' },
      { id: 'civil', name: '民事產權' },
      { id: 'valuation', name: '估價技術' },
      { id: 'exam', name: '考試大綱' },
      { id: 'tax', name: '稅制公產' },
      { id: 'redevelopment', name: '都更重劃' },
      { id: 'landuse', name: '土地利用' }
    ];

    el.categoryContainer.innerHTML = cats.map(c => `
      <div class="category-chip ${state.currentCategory === c.id ? 'active' : ''}" data-cat="${c.id}">
        ${c.name}
      </div>
    `).join('');

    el.categoryContainer.querySelectorAll('.category-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        state.currentCategory = chip.getAttribute('data-cat');
        renderCategories();
        renderLawList();
      });
    });
  }

  // Render Sidebar Law List
  function renderLawList() {
    let filtered = state.lawsIndex;
    if (state.currentCategory === 'exam') {
      filtered = filtered.filter(l => l.inExam);
    } else if (state.currentCategory !== 'all') {
      filtered = filtered.filter(l => l.category === state.currentCategory);
    }

    el.lawListContainer.innerHTML = filtered.map(l => `
      <div class="law-item ${state.currentLawId === l.id ? 'active' : ''}" data-id="${l.id}">
        <div class="law-item-title">
          <span>${l.name}</span>
          ${l.inExam ? '<span class="badge-exam">命題大綱</span>' : ''}
        </div>
        <div class="law-item-meta">
          <span class="badge-level">${l.level}</span>
          <span>${l.totalArticles} 條</span>
          ${l.modifiedDate ? `<span>(${l.modifiedDate})</span>` : ''}
        </div>
      </div>
    `).join('');

    el.lawListContainer.querySelectorAll('.law-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        state.currentLawId = id;
        renderLawList();
        switchView('reader');
        renderReaderView(id);
        toggleSidebar(false);
      });
    });
  }

  // Render Reader View
  function renderReaderView(lawId, jumpArticleNo = null) {
    const law = state.lawsData.find(l => l.id === lawId) || state.lawsData[0];
    if (!law) return;

    let html = `
      <div class="content-container">
        <!-- Law Banner -->
        <div class="law-header-banner">
          <div class="law-header-title-row">
            <h1 class="law-main-title">${law.name}</h1>
            <div class="law-header-tags">
              ${law.inExam ? '<span class="badge-exam">★ 專技高考命題大綱</span>' : ''}
              <span class="badge-level">${law.level}</span>
              <span class="badge-level">${law.categoryName}</span>
            </div>
          </div>
          <div class="law-header-meta">
            ${law.examSubject ? `<span><strong>應試考科：</strong>${law.examSubject}</span>` : ''}
            <span><strong>總條數：</strong>${law.totalArticles} 條</span>
            ${law.modifiedDate ? `<span><strong>最新修正：</strong>${law.modifiedDate}</span>` : ''}
            ${law.lawURL ? `<span><a href="${law.lawURL}" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:none;">官方連結 ↗</a></span>` : ''}
          </div>
        </div>

        <!-- Quick Jump Scrubber Bar -->
        ${renderQuickJumpBar(law)}

        <!-- Articles List -->
        <div class="articles-container">
    `;

    let currentChapterTitle = '';

    law.articles.forEach(art => {
      // If new chapter heading
      if (art.chapter && art.chapter !== currentChapterTitle && art.chapter !== '總則') {
        currentChapterTitle = art.chapter;
        html += `<div class="chapter-header" id="chap-${encodeURIComponent(art.chapter)}">${art.chapter}</div>`;
      }

      const isBookmarked = state.bookmarks.some(b => b.lawId === law.id && b.articleNum === art.num);

      html += `
        <div class="article-card ${jumpArticleNo === art.num ? 'highlighted' : ''}" id="art-${art.num}" data-art-num="${art.num}">
          <div class="article-header">
            <span class="article-no">${art.rawNo}</span>
            <div class="article-tools">
              <button class="btn-tool btn-tts" data-law="${law.name}" data-art-no="${art.rawNo}" data-num="${art.num}" title="語音朗讀此條文">
                <span class="tool-icon">🔊</span><span class="tool-label">朗讀</span>
              </button>
              <button class="btn-tool btn-copy-citation" data-law="${law.name}" data-art-no="${art.rawNo}" data-num="${art.num}" title="一鍵複製報告書引用格式">
                <span class="tool-icon">📋</span><span class="tool-label">引用</span>
              </button>
              <button class="btn-tool btn-bookmark ${isBookmarked ? 'active' : ''}" data-law-id="${law.id}" data-law-name="${law.name}" data-num="${art.num}" data-raw-no="${art.rawNo}" title="加入或取消收藏">
                <span class="tool-icon">${isBookmarked ? '★' : '☆'}</span><span class="tool-label">${isBookmarked ? '已收藏' : '收藏'}</span>
              </button>
            </div>
          </div>
          <div class="article-body">
            ${art.paragraphs.map((p, idx) => `
              <p class="article-paragraph" data-para-idx="${idx + 1}">${formatArticleTextWithLinks(p)}</p>
            `).join('')}
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    el.mainContent.innerHTML = html;

    // Attach article events (copy, bookmark, cross ref)
    attachArticleEvents(law);

    // If target jump article specified
    if (jumpArticleNo) {
      setTimeout(() => {
        const targetEl = document.getElementById(`art-${jumpArticleNo}`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    } else {
      el.mainContent.scrollTop = 0;
    }
  }

  // Render Quick Jump Bar
  function renderQuickJumpBar(law) {
    if (law.chapters && law.chapters.length > 1) {
      return `
        <div class="quick-jump-bar">
          <span class="quick-jump-label">章節快速跳轉：</span>
          <div class="quick-jump-chips">
            ${law.chapters.map(c => `
              <span class="jump-chip" onclick="document.getElementById('art-${c.firstArticle}')?.scrollIntoView({behavior:'smooth',block:'start'})">
                ${c.chapterTitle}
              </span>
            `).join('')}
          </div>
        </div>
      `;
    } else if (law.totalArticles > 20) {
      // Generate numeric ranges (1~20, 21~40...)
      const chips = [];
      for (let i = 1; i <= law.totalArticles; i += 20) {
        const end = Math.min(i + 19, law.totalArticles);
        chips.push(`
          <span class="jump-chip" onclick="document.getElementById('art-${i}')?.scrollIntoView({behavior:'smooth',block:'start'})">
            第${i}~${end}條
          </span>
        `);
      }
      return `
        <div class="quick-jump-bar">
          <span class="quick-jump-label">條號分段：</span>
          <div class="quick-jump-chips">${chips.join('')}</div>
        </div>
      `;
    }
    return '';
  }

  // Format Article Text with Cross Reference Links
  function formatArticleTextWithLinks(text) {
    if (!text) return '';
    // Highlight references like "土地法第九十七條", "都市更新條例", "不動產估價技術規則"
    const lawKeywords = [
      '不動產估價技術規則', '不動產估價師法', '土地法', '平均地權條例', 
      '土地稅法', '都市更新條例', '國土計畫法', '區域計畫法', 
      '非都市土地使用管制規則', '土地徵收條例', '都市計畫法',
      '公寓大廈管理條例', '建築法', '民法'
    ];

    let formatted = text;
    for (const kw of lawKeywords) {
      const regex = new RegExp(`(${kw}(?:第[0-9一二三四五六七八九十百]+條(?:之[0-9一二三四五六七八九十]+)?)?)`, 'g');
      formatted = formatted.replace(regex, `<span class="ref-link" data-ref="$1">$1</span>`);
    }
    return formatted;
  }

  // Attach Article Event Handlers
  function attachArticleEvents(law) {
    // 複製引用按鈕
    el.mainContent.querySelectorAll('.btn-copy-citation').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const lawName = btn.getAttribute('data-law');
        const artNo = btn.getAttribute('data-art-no');
        const num = btn.getAttribute('data-num');
        const card = btn.closest('.article-card');
        const content = card.querySelector('.article-body').innerText.trim();

        const citation = `依《${lawName}》${artNo}規定：「${content}」`;
        navigator.clipboard.writeText(citation).then(() => {
          showToast(`已複製《${lawName}》${artNo}引用！`);
        }).catch(() => {
          showToast('複製成功');
        });
      });
    });

    // 收藏書籤按鈕
    el.mainContent.querySelectorAll('.btn-bookmark').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const lawId = btn.getAttribute('data-law-id');
        const lawName = btn.getAttribute('data-law-name');
        const num = btn.getAttribute('data-num');
        const rawNo = btn.getAttribute('data-raw-no');

        const existingIdx = state.bookmarks.findIndex(b => b.lawId === lawId && b.articleNum === num);
        if (existingIdx >= 0) {
          state.bookmarks.splice(existingIdx, 1);
          btn.classList.remove('active');
          btn.innerHTML = '<span class="tool-icon">☆</span><span class="tool-label">收藏</span>';
          showToast('已自收藏夾移除');
        } else {
          state.bookmarks.push({
            lawId,
            lawName,
            articleNum: num,
            articleRawNo: rawNo,
            savedAt: new Date().toISOString()
          });
          btn.classList.add('active');
          btn.innerHTML = '<span class="tool-icon">★</span><span class="tool-label">已收藏</span>';
          showToast('已加入收藏夾');
        }
        localStorage.setItem('val_bookmarks', JSON.stringify(state.bookmarks));
      });
    });

    // 語音朗讀按鈕
    el.mainContent.querySelectorAll('.btn-tts').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const lawName = btn.getAttribute('data-law');
        const artNo = btn.getAttribute('data-art-no');
        const num = btn.getAttribute('data-num');
        const card = btn.closest('.article-card');
        const paragraphs = Array.from(card.querySelectorAll('.article-paragraph')).map(p => p.innerText.trim());

        if (ttsPlayer.isPlaying && ttsPlayer.currentArticleData && ttsPlayer.currentArticleData.num === num) {
          if (ttsPlayer.isPaused) {
            ttsPlayer.resume();
          } else {
            ttsPlayer.pause();
          }
        } else {
          ttsPlayer.play(lawName, artNo, num, paragraphs, true);
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });

    // 交叉參照點擊
    el.mainContent.querySelectorAll('.ref-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.stopPropagation();
        const refStr = link.getAttribute('data-ref');
        openCrossReferenceModal(refStr);
      });
    });
  }

  // 設定語音朗讀回呼與浮動控制列
  ttsPlayer.onStatusChange = (status, data) => {
    document.querySelectorAll('.article-card.reading').forEach(c => c.classList.remove('reading'));
    document.querySelectorAll('.btn-tool.btn-tts.active').forEach(b => {
      b.classList.remove('active');
      b.innerHTML = '<span class="tool-icon">🔊</span><span class="tool-label">朗讀</span>';
    });

    if (status === 'playing' || status === 'paused') {
      el.audioPlayerBar.classList.add('active');
      el.playerTitle.textContent = `朗讀中：《${data.lawName}》${data.rawNo}`;
      el.btnPlayerToggle.textContent = status === 'playing' ? '⏸ 暫停' : '▶ 播放';

      const card = document.getElementById(`art-${data.num}`);
      if (card) {
        card.classList.add('reading');
        const btn = card.querySelector('.btn-tts');
        if (btn) {
          btn.classList.add('active');
          btn.innerHTML = status === 'playing' 
            ? '<span class="tool-icon">⏸</span><span class="tool-label">暫停</span>' 
            : '<span class="tool-icon">▶</span><span class="tool-label">播放</span>';
        }
      }
    } else {
      el.audioPlayerBar.classList.remove('active');
    }
  };

  ttsPlayer.onNextArticle = (currentNum) => {
    const law = state.lawsData.find(l => l.id === state.currentLawId);
    if (!law) return;
    const currentIdx = law.articles.findIndex(a => a.num === currentNum);
    if (currentIdx >= 0 && currentIdx + 1 < law.articles.length) {
      const nextArt = law.articles[currentIdx + 1];
      ttsPlayer.play(law.name, nextArt.rawNo, nextArt.num, nextArt.paragraphs, true);
      const nextCard = document.getElementById(`art-${nextArt.num}`);
      if (nextCard) {
        nextCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      showToast('已朗讀完本法規全部條文');
    }
  };

  el.btnPlayerToggle?.addEventListener('click', () => {
    if (ttsPlayer.isPaused) {
      ttsPlayer.resume();
    } else if (ttsPlayer.isPlaying) {
      ttsPlayer.pause();
    }
  });

  el.btnPlayerNext?.addEventListener('click', () => {
    if (ttsPlayer.currentArticleData) {
      ttsPlayer.onNextArticle(ttsPlayer.currentArticleData.num);
    }
  });

  el.btnPlayerSpeed?.addEventListener('click', () => {
    const rates = ['0.8', '1.0', '1.2', '1.5'];
    let current = ttsPlayer.rate.toFixed(1);
    let idx = rates.indexOf(current);
    if (idx === -1) idx = 1;
    const nextRate = rates[(idx + 1) % rates.length];
    ttsPlayer.setRate(nextRate);
    el.btnPlayerSpeed.textContent = `${nextRate}x`;
    showToast(`語速已調整為 ${nextRate}x`);
  });

  el.btnPlayerClose?.addEventListener('click', () => {
    ttsPlayer.stop();
  });

  // Cross Reference Modal
  function openCrossReferenceModal(refStr) {
    const searchRes = searchEngine.parseQuery(refStr);
    let title = refStr;
    let bodyHtml = '';

    if (searchRes && searchRes.type === 'article_shortcut') {
      const law = state.lawsData.find(l => l.name === searchRes.lawName);
      if (law) {
        const art = law.articles.find(a => a.num === searchRes.articleNo);
        if (art) {
          title = `《${law.name}》${art.rawNo}`;
          bodyHtml = `
            <div style="font-size: 1.05rem; line-height: 1.8;">
              ${art.paragraphs.map(p => `<p style="margin-bottom: 8px; text-indent: 1.8em;">${p}</p>`).join('')}
            </div>
            <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-color); text-align: right;">
              <button class="btn-tool" onclick="document.getElementById('modalOverlay').classList.remove('open'); window.dispatchEvent(new CustomEvent('nav-law', {detail: {lawId: '${law.id}', artNum: '${art.num}'}}));">
                前往法規全文 ➔
              </button>
            </div>
          `;
        }
      }
    }

    if (!bodyHtml) {
      // Look for law directly
      const law = state.lawsData.find(l => l.name.includes(refStr) || refStr.includes(l.name));
      if (law) {
        title = `《${law.name}》概要`;
        bodyHtml = `
          <p><strong>法規位階：</strong>${law.level}</p>
          <p><strong>總條數：</strong>${law.totalArticles} 條</p>
          <p><strong>主管考科：</strong>${law.examSubject || '專業實務'}</p>
          <div style="margin-top: 16px; text-align: right;">
            <button class="btn-tool" onclick="document.getElementById('modalOverlay').classList.remove('open'); window.dispatchEvent(new CustomEvent('nav-law', {detail: {lawId: '${law.id}'}}));">
              開啟此法規 ➔
            </button>
          </div>
        `;
      } else {
        title = `法規參照：${refStr}`;
        bodyHtml = `<p>請直接在頂部搜尋列輸入「${refStr}」進行完整查閱。</p>`;
      }
    }

    el.modalTitle.textContent = title;
    el.modalContent.innerHTML = bodyHtml;
    el.modalOverlay.classList.add('open');
  }

  // Listen to custom navigation events
  window.addEventListener('nav-law', (e) => {
    state.currentLawId = e.detail.lawId;
    renderLawList();
    switchView('reader');
    renderReaderView(state.currentLawId, e.detail.artNum);
  });

  // Render Bulletins View (1-15 ROCREAA Bulletins)
  function renderBulletinsView(targetBulletinId = null) {
    let html = `
      <div class="content-container">
        <div class="law-header-banner">
          <div class="law-header-title-row">
            <h1 class="law-main-title">中華民國不動產估價師公會全國聯合會公報</h1>
            <span class="bulletin-badge">第 1 號 ~ 第 15 號公報全收錄</span>
          </div>
          <p class="law-header-meta">依據《不動產估價師法》第二十二條規定，為不動產估價師製作估價報告書之專業自律規範與技術要領。</p>
        </div>
    `;

    state.bulletinsData.forEach(b => {
      html += `
        <div class="bulletin-card" id="${b.id}">
          <div class="law-header-title-row">
            <h2 style="font-size: 1.2rem; color: var(--primary); font-weight: 700;">${b.title}</h2>
            <span class="bulletin-badge">${b.shortTitle}</span>
          </div>
          <div style="font-size: 0.82rem; color: var(--text-muted); margin: 6px 0 12px 0;">
            <span><strong>法源依據：</strong>${b.legalBasis}</span> | <span><strong>發布狀態：</strong>${b.publishDate}</span>
          </div>
          <p style="margin-bottom: 12px; font-size: 0.94rem;">${b.summary}</p>

          <h3 style="font-size: 0.98rem; font-weight: 700; margin-bottom: 8px; color: var(--text-main);">核心要點與作業準則：</h3>
          ${b.keyPoints.map(kp => `
            <div style="margin-bottom: 8px;">
              <strong>${kp.title}</strong>
              <div style="margin-top: 2px; text-indent: 1.5em; font-size: 0.9rem; color: var(--text-muted); white-space: pre-line;">${kp.content}</div>
            </div>
          `).join('')}

          <div class="bulletin-template-box">
            <strong>📋 報告書標準引用句型：</strong>
            <div style="margin-top: 4px; font-style: italic;">「${b.reportTemplate}」</div>
            <div style="text-align: right; margin-top: 6px;">
              <button class="btn-tool" onclick="navigator.clipboard.writeText('${b.reportTemplate.replace(/'/g, "\\'")}').then(() => alert('已複製引用範例！'))">
                一鍵複製句型
              </button>
            </div>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    el.mainContent.innerHTML = html;

    if (targetBulletinId) {
      setTimeout(() => {
        document.getElementById(targetBulletinId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else {
      el.mainContent.scrollTop = 0;
    }
  }

  // Render Bookmarks View
  function renderBookmarksView() {
    let html = `
      <div class="content-container">
        <div class="law-header-banner">
          <h1 class="law-main-title">⭐ 我的法條收藏夾</h1>
          <p class="law-header-meta">您在閱讀法規時標記星號的常用法條，資料保存在此裝置中。</p>
        </div>
    `;

    if (state.bookmarks.length === 0) {
      html += `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          目前尚未收藏任何法條。<br>在法規頁面點擊法條右上角的「☆ 收藏」即可將常用條文保存在此！
        </div>
      `;
    } else {
      state.bookmarks.forEach(bm => {
        const law = state.lawsData.find(l => l.id === bm.lawId);
        const art = law ? law.articles.find(a => a.num === bm.articleNum) : null;

        html += `
          <div class="article-card">
            <div class="article-header">
              <span class="article-no">《${bm.lawName}》${bm.articleRawNo}</span>
              <div class="article-tools">
                <button class="btn-tool" onclick="window.dispatchEvent(new CustomEvent('nav-law', {detail: {lawId: '${bm.lawId}', artNum: '${bm.articleNum}'}}))">
                  開啟條文 ➔
                </button>
              </div>
            </div>
            <div class="article-body">
              ${art ? art.paragraphs.map(p => `<p class="article-paragraph">${p}</p>`).join('') : '<p>（條文資料）</p>'}
            </div>
          </div>
        `;
      });
    }

    html += `</div>`;
    el.mainContent.innerHTML = html;
  }

  // Render Search Results View
  function renderSearchResults(result, query) {
    let html = `
      <div class="content-container search-results-container">
        <div class="search-summary-bar">
          <span>查詢關鍵字：「<strong>${query}</strong>」</span>
          <span>找到 <strong>${result.hits.length}</strong> 筆相關條文 / 公報</span>
        </div>
    `;

    if (result.hits.length === 0) {
      html += `
        <div style="text-align: center; padding: 50px; color: var(--text-muted);">
          查無符合「${query}」的條文或公報。<br>
          您可以嘗試其他關鍵字，或輸入法規縮寫加條號（例如「技術規則 43」或「都更 67」）。
        </div>
      `;
    } else {
      result.hits.forEach(hit => {
        if (hit.type === 'article') {
          // Highlight snippet
          const hlSnippet = hit.snippet.replace(
            new RegExp(`(${query})`, 'gi'),
            `<mark class="highlight">$1</mark>`
          );

          html += `
            <div class="search-hit-card" onclick="window.dispatchEvent(new CustomEvent('nav-law', {detail: {lawId: '${hit.lawId}', artNum: '${hit.articleNum}'}}))">
              <div class="hit-law-title">
                <span>《${hit.lawName}》${hit.articleNo}</span>
                ${hit.inExam ? '<span class="badge-exam">考試大綱</span>' : ''}
              </div>
              <div class="hit-snippet">${hlSnippet}</div>
            </div>
          `;
        } else if (hit.type === 'bulletin') {
          html += `
            <div class="search-hit-card" onclick="document.querySelector('[data-view=bulletins]').click(); setTimeout(() => document.getElementById('${hit.id}')?.scrollIntoView({behavior:'smooth'}), 150);">
              <div class="hit-law-title">
                <span>${hit.title}</span>
                <span class="bulletin-badge">公會公報</span>
              </div>
              <div class="hit-snippet">${hit.snippet}</div>
            </div>
          `;
        }
      });
    }

    html += `</div>`;
    el.mainContent.innerHTML = html;
  }

  function renderSearchLandingView() {
    el.mainContent.innerHTML = `
      <div class="content-container" style="text-align: center; padding: 50px 20px;">
        <h2 style="font-size: 1.3rem; margin-bottom: 12px; color: var(--text-main);">🔍 估價法規極速檢索</h2>
        <p style="color: var(--text-muted); font-size: 0.95rem; line-height: 1.8;">
          請在上方搜尋列輸入關鍵字或條號快捷。<br>
          <strong>支援捷徑範例：</strong><br>
          <span style="display:inline-block; margin: 4px; padding: 3px 8px; background:var(--border-light); border-radius:4px; font-family:monospace;">技術規則 43</span>
          <span style="display:inline-block; margin: 4px; padding: 3px 8px; background:var(--border-light); border-radius:4px; font-family:monospace;">都更 67</span>
          <span style="display:inline-block; margin: 4px; padding: 3px 8px; background:var(--border-light); border-radius:4px; font-family:monospace;">土地法 97</span>
          <span style="display:inline-block; margin: 4px; padding: 3px 8px; background:var(--border-light); border-radius:4px; font-family:monospace;">公報 5</span>
          <span style="display:inline-block; margin: 4px; padding: 3px 8px; background:var(--border-light); border-radius:4px; font-family:monospace;">收益資本化率</span>
          <span style="display:inline-block; margin: 4px; padding: 3px 8px; background:var(--border-light); border-radius:4px; font-family:monospace;">權利變換</span>
        </p>
      </div>
    `;
  }

  // Quick Jump Modal for Mobile FAB
  function openQuickJumpModal() {
    const law = state.lawsData.find(l => l.id === state.currentLawId);
    if (!law) return;

    el.modalTitle.textContent = `快速跳轉《${law.name}》條號`;

    let html = `
      <div style="margin-bottom: 14px;">
        <div style="display: flex; gap: 8px;">
          <input type="number" id="quickJumpNumInput" placeholder="輸入條號（如 757）..." 
                 min="1" max="${law.totalArticles}" 
                 style="flex: 1; padding: 10px 14px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-main); color: var(--text-main); font-size: 1rem; outline: none;">
          <button id="btnConfirmQuickJump" class="btn-tool" 
                  style="padding: 10px 18px; background: var(--primary); color: #fff; border: none; font-weight: 600; border-radius: 8px; cursor: pointer;">
            立即直達
          </button>
        </div>
      </div>
    `;

    // If chapters exist, show chapters list
    if (law.chapters && law.chapters.length > 1) {
      html += `
        <div style="margin-bottom: 14px;">
          <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 8px;">📑 編章目錄快速導航：</div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 22vh; overflow-y: auto;">
            ${law.chapters.map(c => `
              <span class="jump-chip" style="padding: 5px 10px; font-size: 0.82rem;" 
                    onclick="document.getElementById('modalOverlay').classList.remove('open'); document.getElementById('art-${c.firstArticle}')?.scrollIntoView({behavior:'smooth',block:'start'})">
                ${c.chapterTitle}
              </span>
            `).join('')}
          </div>
        </div>
      `;
    }

    // If moderate size (<= 150 articles), show individual chips
    if (law.totalArticles <= 150) {
      let itemsHtml = '';
      for (let i = 1; i <= law.totalArticles; i++) {
        itemsHtml += `<span class="jump-chip" style="padding: 5px 10px; font-size: 0.82rem;" onclick="document.getElementById('modalOverlay').classList.remove('open'); document.getElementById('art-${i}')?.scrollIntoView({behavior:'smooth',block:'start'})">第${i}條</span>`;
      }
      html += `
        <div>
          <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 8px;">🔢 全條號清單：</div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 26vh; overflow-y: auto;">
            ${itemsHtml}
          </div>
        </div>
      `;
    } else {
      // Range blocks for massive laws like Civil Law (1~50, 51~100...)
      const rangeChips = [];
      for (let i = 1; i <= law.totalArticles; i += 50) {
        const end = Math.min(i + 49, law.totalArticles);
        rangeChips.push(`
          <span class="jump-chip" style="padding: 5px 10px; font-size: 0.82rem;" 
                onclick="document.getElementById('modalOverlay').classList.remove('open'); document.getElementById('art-${i}')?.scrollIntoView({behavior:'smooth',block:'start'})">
            第${i} ~ ${end}條
          </span>
        `);
      }
      html += `
        <div>
          <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 8px;">🔢 條號分段直達：</div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 26vh; overflow-y: auto;">
            ${rangeChips.join('')}
          </div>
        </div>
      `;
    }

    el.modalContent.innerHTML = html;
    el.modalOverlay.classList.add('open');

    const input = document.getElementById('quickJumpNumInput');
    const btnJump = document.getElementById('btnConfirmQuickJump');

    const doJump = () => {
      const val = input.value.trim();
      if (!val) return;
      el.modalOverlay.classList.remove('open');
      const target = document.getElementById(`art-${val}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('highlighted');
        setTimeout(() => target.classList.remove('highlighted'), 2000);
      } else {
        showToast(`未找到第 ${val} 條`);
      }
    };

    btnJump?.addEventListener('click', doJump);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doJump();
    });
    setTimeout(() => input?.focus(), 150);
  }
});
