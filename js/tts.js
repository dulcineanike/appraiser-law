/**
 * 估價小六法 - 專業法條語音朗讀引擎 (Web Speech API)
 * 支援單條朗讀、連續朗讀、語速切換與自然中文字詞替換
 */

class LawTTSPlayer {
  constructor() {
    this.synth = window.speechSynthesis;
    this.currentUtterance = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.isTransitioning = false;
    this.rate = parseFloat(localStorage.getItem('val_tts_rate') || '1.0');
    this.selectedVoice = null;
    this.currentArticleData = null;
    this.onStatusChange = null;
    this.onNextArticle = null;
    this.wakeLock = null;
    this.hasWakeLockSupport = ('wakeLock' in navigator);
    this.availableVoices = [];

    // 音色與音調調節支援（標準 / 沉穩男音 / 清亮女音，解決手機單一人聲無法換聲之限制）
    this.timbreModes = [
      { id: 'standard', name: '標準原聲', pitch: 1.0, icon: '🗣️' },
      { id: 'male', name: '沉穩男音', pitch: 0.80, icon: '👨' },
      { id: 'female', name: '清亮女音', pitch: 1.20, icon: '👩' }
    ];
    this.timbreIndex = parseInt(localStorage.getItem('val_tts_timbre_idx') || '0', 10);
    if (isNaN(this.timbreIndex) || this.timbreIndex < 0 || this.timbreIndex >= this.timbreModes.length) {
      this.timbreIndex = 0;
    }
    const savedPitch = parseFloat(localStorage.getItem('val_tts_pitch'));
    this.pitch = !isNaN(savedPitch) ? savedPitch : this.timbreModes[this.timbreIndex].pitch;

    this.initVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => this.initVoices();
    }
    this.initWakeLockListeners();
  }

  initWakeLockListeners() {
    // 當頁面從背景（如切換分頁或下拉通知中心）返回前景時，若仍在朗讀則重新取得 Wake Lock
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && this.isPlaying && !this.isPaused) {
        await this.requestWakeLock();
      }
    });
  }

  /**
   * 請求螢幕常亮喚醒鎖（防止手機自動休眠黑屏中斷朗讀）
   */
  async requestWakeLock() {
    if (!this.hasWakeLockSupport) return false;
    try {
      if (!this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
          this.notifyStatus(this.isPlaying ? (this.isPaused ? 'paused' : 'playing') : 'stopped');
        });
        this.notifyStatus(this.isPlaying ? (this.isPaused ? 'paused' : 'playing') : 'stopped');
      }
      return true;
    } catch (err) {
      console.warn('Wake Lock request error:', err);
      return false;
    }
  }

  /**
   * 釋放螢幕常亮喚醒鎖（恢復系統預設休眠省電）
   */
  async releaseWakeLock() {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
      } catch (err) {
        console.warn('Wake Lock release error:', err);
      }
      this.wakeLock = null;
      this.notifyStatus(this.isPlaying ? (this.isPaused ? 'paused' : 'playing') : 'stopped');
    }
  }

  /**
   * 更新 Media Session API（提供鎖定畫面與控制中心基礎播放狀態與操作）
   */
  updateMediaSession(lawName, rawNo) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${rawNo} - ${lawName}`,
        artist: '不動產及估價法規',
        album: '法規條文連續朗讀',
        artwork: [
          { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      });
      navigator.mediaSession.playbackState = 'playing';

      navigator.mediaSession.setActionHandler('play', () => this.resume());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.skipNext());
      navigator.mediaSession.setActionHandler('stop', () => this.stop());
    } catch (e) {
      // 忽略部分瀏覽器對特定動作的限制
    }
  }

  initVoices() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    if (!voices || voices.length === 0) return;

    // 嚴格篩選台灣繁體中文人聲（排除香港粵語、大陸普通話，避免在 iOS/手機上產生無效切換）
    const twVoices = voices.filter(v => {
      if (!v.lang) return false;
      const l = v.lang.toLowerCase();
      const n = (v.name || '').toLowerCase();
      return l === 'zh-tw' || l === 'zh_tw' || l === 'zh-hant-tw' || l === 'cmn-tw' || 
             n.includes('taiwan') || n.includes('臺灣') || n.includes('台灣') || n.includes('meijia') || n.includes('mei-jia');
    });

    if (twVoices.length > 0) {
      this.availableVoices = twVoices;
    } else {
      this.availableVoices = voices.filter(v => v.lang && (v.lang.startsWith('zh') || v.lang.includes('cmn')));
    }

    // 優先還原使用者自選之語音偏好
    const savedVoiceName = localStorage.getItem('val_tts_voice');
    if (savedVoiceName) {
      this.selectedVoice = this.availableVoices.find(v => v.name === savedVoiceName) || null;
    }

    if (!this.selectedVoice && this.availableVoices.length > 0) {
      // 預設高品質人聲優先順序（微軟自然人聲、蘋果 Siri/美佳增強版、Google 國語）
      const priorityKeywords = [
        'Natural', 'Online', 'Neural', 
        'HsiaoChen', 'Hsiao-Chen', 'Yating', 'Ya-Ting', 
        'Mei-Jia', 'Meijia', 'Siri', 
        'Google 國語', 'Google'
      ];

      let chosen = null;
      for (const kw of priorityKeywords) {
        chosen = this.availableVoices.find(v => v.name && v.name.includes(kw));
        if (chosen) break;
      }
      this.selectedVoice = chosen || this.availableVoices[0];
    }
  }

  /**
   * 切換下一種可用中文人聲（男聲/女聲/各系統音色切換）
   */
  cycleVoice() {
    if (!this.availableVoices || this.availableVoices.length <= 1) return null;
    const currentIdx = this.availableVoices.findIndex(v => v.name === this.selectedVoice?.name);
    const nextIdx = (currentIdx + 1) % this.availableVoices.length;
    this.selectedVoice = this.availableVoices[nextIdx];
    localStorage.setItem('val_tts_voice', this.selectedVoice.name);

    // 若正在播放中，無縫以新音色重新朗讀當前同一條文（同步執行以滿足 iOS 觸摸手勢要求）
    if ((this.isPlaying || this.isPaused) && this.currentArticleData) {
      const d = { ...this.currentArticleData };
      this.play(d.lawName, d.rawNo, d.num, d.paragraphs, d.autoNext, d.includeLawName);
    }
    return this.selectedVoice;
  }

  /**
   * 取得當前人聲或音色之顯示資訊（供 UI 按鈕呈現圖示與標題）
   */
  getCurrentVoiceOrTimbreInfo() {
    if (this.availableVoices && this.availableVoices.length > 1) {
      const v = this.selectedVoice || this.availableVoices[0];
      const name = v?.name || '';
      const isMale = /yunxi|yunjian|yunyang|danny|zhiwei|male|男/i.test(name);
      const isFemale = /hsiaochen|xiaoxiao|yating|meijia|mei-jia|female|女|siri/i.test(name);
      const icon = isMale ? '👨' : (isFemale ? '👩' : '🗣️');
      return {
        type: 'voice',
        name: v?.name || '系統中文人聲',
        icon: icon,
        pitch: this.pitch,
        title: `切換人聲（目前：${v?.name || '預設'}）`
      };
    } else {
      const mode = this.timbreModes[this.timbreIndex] || this.timbreModes[0];
      return {
        type: 'timbre',
        name: mode.name,
        icon: mode.icon,
        pitch: mode.pitch,
        title: `切換音色（目前：${mode.name}）`
      };
    }
  }

  /**
   * 切換下一種音色模式（標準 / 沉穩男音 / 清亮女音）
   */
  cycleTimbre() {
    this.timbreIndex = (this.timbreIndex + 1) % this.timbreModes.length;
    const mode = this.timbreModes[this.timbreIndex];
    this.pitch = mode.pitch;
    localStorage.setItem('val_tts_pitch', this.pitch.toString());
    localStorage.setItem('val_tts_timbre_idx', this.timbreIndex.toString());

    // 若正在播放中，無縫以新音調重新朗讀當前同一條文（同步執行以滿足 iOS 觸摸手勢要求）
    if ((this.isPlaying || this.isPaused) && this.currentArticleData) {
      const d = { ...this.currentArticleData };
      this.play(d.lawName, d.rawNo, d.num, d.paragraphs, d.autoNext, d.includeLawName);
    }

    return {
      type: 'timbre',
      name: mode.name,
      icon: mode.icon,
      pitch: mode.pitch,
      description: `音色：${mode.icon} ${mode.name}`
    };
  }

  /**
   * 智慧切換發音人聲或音色
   * - 當系統有多個人聲時（如電腦版）：循環切換真實中文人聲（微軟自然人聲男/女聲等）
   * - 當系統只有單一人聲時（如手機 iOS Safari/Android）：循環切換音色模式（標準 / 沉穩男音 / 清亮女音）
   */
  cycleVoiceOrTimbre() {
    if (this.availableVoices && this.availableVoices.length > 1) {
      const v = this.cycleVoice();
      const isMale = /yunxi|yunjian|yunyang|danny|zhiwei|male|男/i.test(v?.name || '');
      const isFemale = /hsiaochen|xiaoxiao|yating|meijia|mei-jia|female|女|siri/i.test(v?.name || '');
      const icon = isMale ? '👨' : (isFemale ? '👩' : '🗣️');
      return {
        type: 'voice',
        name: v?.name || '系統中文人聲',
        icon: icon,
        pitch: this.pitch,
        description: `人聲：${v?.name || ''}`
      };
    } else {
      return this.cycleTimbre();
    }
  }

  /**
   * 將阿拉伯數字轉為中文國字數字（例如 2 -> 二, 12 -> 十二, 34 -> 三十四）
   * 徹底防止語音引擎把「第 2 條」誤當成量詞讀為「第兩條」
   */
  numberToChinese(numStr) {
    const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const n = parseInt(numStr, 10);
    if (isNaN(n)) return numStr;
    if (n < 10) return digits[n];
    if (n < 20) return (n === 10 ? '十' : '十' + digits[n % 10]);
    if (n < 100) {
      const tens = Math.floor(n / 10);
      const units = n % 10;
      return digits[tens] + '十' + (units > 0 ? digits[units] : '');
    }
    if (n < 1000) {
      const hundreds = Math.floor(n / 100);
      const remainder = n % 100;
      const tens = Math.floor(remainder / 10);
      const units = remainder % 10;
      let res = digits[hundreds] + '百';
      if (remainder === 0) return res;
      if (tens === 0) return res + '零' + digits[units];
      return res + digits[tens] + '十' + (units > 0 ? digits[units] : '');
    }
    return numStr;
  }

  /**
   * 規範化法律序數發音（強制轉為中文字符，徹底根絕「第兩條」、「第兩項」之發音錯誤）
   */
  normalizeLegalOrdinals(text) {
    if (!text) return '';
    // 處理如「第 34-1 條」->「第三十四條之一」
    text = text.replace(/第\s*(\d+)-(\d+)\s*條/g, (m, a, b) => '第' + this.numberToChinese(a) + '條之' + this.numberToChinese(b));
    // 處理如「第 2 條之 1」->「第二條之一」
    text = text.replace(/第\s*(\d+)\s*條之\s*(\d+)/g, (m, a, b) => '第' + this.numberToChinese(a) + '條之' + this.numberToChinese(b));
    // 處理如「第 2 條」->「第二條」
    text = text.replace(/第\s*(\d+)\s*條/g, (m, a) => '第' + this.numberToChinese(a) + '條');
    // 處理如「第 2 項」->「第二項」
    text = text.replace(/第\s*(\d+)\s*項/g, (m, a) => '第' + this.numberToChinese(a) + '項');
    // 處理如「第 2 款」->「第二款」
    text = text.replace(/第\s*(\d+)\s*款/g, (m, a) => '第' + this.numberToChinese(a) + '款');
    // 處理如「第 2 目」->「第二目」
    text = text.replace(/第\s*(\d+)\s*目/g, (m, a) => '第' + this.numberToChinese(a) + '目');
    // 處理如「第 2 點」->「第二點」
    text = text.replace(/第\s*(\d+)\s*點/g, (m, a) => '第' + this.numberToChinese(a) + '點');
    return text;
  }

  /**
   * 整理條文文字為具備自然抑揚頓挫、清晰語意層次與呼吸節奏的朗讀文字
   * @param {string} rawNo 條號字串（例如「第 1 條」或「第 34-1 條」）
   * @param {string[]} paragraphs 條文段落陣列
   * @param {string|null} lawName 法規名稱（若未指定或為 null 則不唸出）
   */
  prepareSpeechText(rawNo, paragraphs, lawName = null) {
    // 1. 條號發音正規化：將「第 2 條」轉為「第二條」，「第 34-1 條」轉為「第三十四條之一」
    // 強制以中文「二」發音，徹底解決語音引擎遇到阿拉伯數字「2」誤讀為「第兩條」之問題！
    let speechRawNo = this.normalizeLegalOrdinals(rawNo);

    // 2. 條號宣告帶入冒號提示，觸發播音式沉穩語調與 300ms 清晰停頓
    let cleanText = lawName ? `${lawName}，${speechRawNo}：\n` : `${speechRawNo}：\n`;

    paragraphs.forEach((p, idx) => {
      let t = p.trim();
      if (!t) return;

      // 條項款目序號中文正規化（防止文中引用的「第 2 條」、「第 2 項」被唸成「第兩條」）
      t = this.normalizeLegalOrdinals(t);

      // 3. 條款目次層級化（賦予各款、各目鮮明的階層感與呼吸停頓）
      // 款次：「一、」、「二、」轉為「第一款，」、「第二款，」
      t = t.replace(/^([一二三四五六七八九十]+)、/gm, '第$1款，');
      // 目次：「（一）」、「（二）」轉為「第一目，」、「第二目，」
      t = t.replace(/（([一二三四五六七八九十]+)）/g, '第$1目，');

      // 4. 複合括號與行政機關簡稱自然化（徹底清除不自然的逗號停頓）
      t = t.replace(/直轄市、縣\s*（市）/g, '直轄市及縣市')
           .replace(/縣\s*（市）/g, '縣市')
           .replace(/鄉\s*（鎮、市、區）/g, '鄉鎮市區')
           .replace(/鄉\s*（鎮、市）/g, '鄉鎮市')
           .replace(/機關\s*（構）/g, '機關機構')
           .replace(/處\s*（局）/g, '處局')
           .replace(/公\s*（私）/g, '公私')
           .replace(/（刪除）/g, '，本條文已刪除。');

      // 5. 專門法規字詞發音修正（修復破音字與罕見字）
      t = t.replace(/窳陋/g, '雨陋'); // 精準還原「yǔ lòu」讀音，避免機器人合成錯誤

      // 6. 度量衡、法定多數決比例與估價專有名詞
      t = t.replace(/㎡|m²|m\^2/gi, '平方公尺')
           .replace(/([0-9]+)\s*ha\b/gi, '$1公頃')
           .replace(/％|%/g, '百分之')
           .replace(/1\/2|1／2/g, '二分之一')
           .replace(/2\/3|2／3/g, '三分之二')
           .replace(/3\/4|3／4/g, '四分之三')
           .replace(/1\/3|1／3/g, '三分之一')
           .replace(/1\/4|1／4/g, '四分之一')
           .replace(/1\/5|1\/5/g, '五分之一')
           .replace(/\//g, '除以')
           .replace(/×/g, '乘以')
           .replace(/＋/g, '加上')
           .replace(/－/g, '減去')
           .replace(/＝/g, '等於')
           .replace(/NOI/gi, '淨營運收益')
           .replace(/DCF/gi, '折現現金流量')
           .replace(/REITs/gi, '不動產投資信託')
           .replace(/LTV/gi, '貸款成數')
           .replace(/Cap\s*Rate/gi, '收益資本化率');

      // 7. 長句語意斷句與韻律呼吸點植入（創造抑揚頓挫的核心技術）
      // 在缺乏標點的長條件句關鍵轉折詞前置或後置適度補上逗號，觸發語音引擎的聲調微揚與自然換氣
      t = t.replace(/者([應並由得須其向])(?![，。；：])/g, '者，$1')
           .replace(/時([應並由得須其向])(?![，。；：])/g, '時，$1')
           .replace(/後([應並由得須其向])(?![，。；：])/g, '後，$1')
           .replace(/(?<![，。；：\s])但(?=[其有本此若])/g, '，但')
           .replace(/；其有/g, '；其有')
           .replace(/前項情形([，。])/g, '前項情形$1');

      // 8. 清理多餘符號與括號
      t = t.replace(/[（(「」『』）)]/g, '，')
           .replace(/，{2,}/g, '，')
           .replace(/，([。；：！？])/g, '$1');

      if (!/[。；：！？]$/.test(t)) {
        cleanText += t + '。\n';
      } else {
        cleanText += t + '\n';
      }
    });

    return cleanText.trim();
  }

  /**
   * 播放指定條文
   * @param {string} lawName 法規名稱（供浮動播放列顯示使用）
   * @param {string} rawNo 條號字串（例如「第 1 條」）
   * @param {string} num 條號數字
   * @param {string[]} paragraphs 條文段落
   * @param {boolean} autoNext 是否連續朗讀下一條
   * @param {boolean} includeLawName 語音內容是否包含法規名稱（預設 false，不重複唸）
   */
  play(lawName, rawNo, num, paragraphs, autoNext = true, includeLawName = false) {
    this.stop(false);

    if (!this.synth) {
      alert('您的瀏覽器不支援語音朗讀功能');
      return;
    }

    this.currentArticleData = { lawName, rawNo, num, paragraphs, autoNext, includeLawName };
    const speechText = this.prepareSpeechText(rawNo, paragraphs, includeLawName ? lawName : null);

    // 啟動螢幕常亮喚醒鎖與更新 Media Session 控制
    this.requestWakeLock();
    this.updateMediaSession(lawName, rawNo);

    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = 'zh-TW';
    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }
    utterance.rate = this.rate;
    utterance.pitch = this.pitch || 1.0;

    utterance.onstart = () => {
      if (this.currentUtterance !== utterance) return;
      this.isPlaying = true;
      this.isPaused = false;
      this.requestWakeLock();
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
      this.notifyStatus('playing');
    };

    utterance.onend = () => {
      // 僅響應當前正活躍的 utterance，若已被中途取消則忽略
      if (this.currentUtterance !== utterance) return;
      this.currentUtterance = null;
      this.isPlaying = false;
      this.isPaused = false;
      this.notifyStatus('ended');

      // 若開啟連續朗讀且未在換條過渡中，自動播放下一條
      if (this.currentArticleData && this.currentArticleData.autoNext && this.onNextArticle && !this.isTransitioning) {
        this.isTransitioning = true;
        const currentNum = this.currentArticleData.num;
        setTimeout(() => {
          this.isTransitioning = false;
          if (this.onNextArticle) {
            this.onNextArticle(currentNum);
          }
        }, 320);
      } else {
        this.releaseWakeLock();
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'none';
        }
      }
    };

    utterance.onerror = (e) => {
      if (this.currentUtterance !== utterance) return;
      // 忽略因使用者切換、暫停或取消引發的正常中斷錯誤
      if (e.error === 'canceled' || e.error === 'interrupted') {
        this.currentUtterance = null;
        return;
      }
      console.warn('TTS Error:', e);
      this.currentUtterance = null;
      this.isPlaying = false;
      this.isPaused = false;
      this.releaseWakeLock();
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
      }
      this.notifyStatus('error');
    };

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  pause() {
    if (this.synth && this.synth.speaking && !this.synth.paused) {
      this.synth.pause();
      this.isPaused = true;
      this.releaseWakeLock();
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
      this.notifyStatus('paused');
    }
  }

  resume() {
    if (this.synth && this.synth.paused) {
      this.synth.resume();
      this.isPaused = false;
      this.requestWakeLock();
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
      this.notifyStatus('playing');
    }
  }

  /**
   * 停止當前語音
   * @param {boolean} notify 是否通知外部狀態已停止（內部切換或重載時設為 false）
   */
  stop(notify = true) {
    // 關鍵修復：在呼叫 synth.cancel() 前，徹底解除舊 utterance 的所有事件回呼
    // 防止瀏覽器在取消時向舊 utterance 派發 onend/onerror，導致連鎖觸發 onNextArticle 跳過法條
    if (this.currentUtterance) {
      this.currentUtterance.onstart = null;
      this.currentUtterance.onend = null;
      this.currentUtterance.onerror = null;
      this.currentUtterance = null;
    }

    if (this.synth) {
      this.synth.cancel();
    }
    this.isPlaying = false;
    this.isPaused = false;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
    }
    if (notify) {
      this.releaseWakeLock();
      this.notifyStatus('stopped');
    }
  }

  /**
   * 手動點擊「下一條」時調用，具防抖與精準單步推進機制
   */
  skipNext() {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    setTimeout(() => {
      this.isTransitioning = false;
    }, 350);

    if (this.currentArticleData && this.onNextArticle) {
      const currentNum = this.currentArticleData.num;
      // 停止當前朗讀（不重置外部播放條 UI）
      this.stop(false);
      setTimeout(() => {
        if (this.onNextArticle) {
          this.onNextArticle(currentNum);
        }
      }, 50);
    }
  }

  /**
   * 調整朗讀速度，並平滑重新朗讀當前條文（不會跳到其他條文）
   * @param {string|number} newRate 新速度（例如 1.2）
   */
  setRate(newRate) {
    this.rate = parseFloat(newRate);
    localStorage.setItem('val_tts_rate', this.rate.toString());
    // 若正在播放或暫停中，精確重啟當前同一法條
    if ((this.isPlaying || this.isPaused) && this.currentArticleData) {
      const d = { ...this.currentArticleData };
      this.stop(false);
      setTimeout(() => {
        this.play(d.lawName, d.rawNo, d.num, d.paragraphs, d.autoNext, d.includeLawName);
      }, 60);
    }
  }

  notifyStatus(status) {
    if (this.onStatusChange) {
      this.onStatusChange(status, this.currentArticleData, {
        wakeLockActive: !!this.wakeLock,
        hasWakeLockSupport: this.hasWakeLockSupport
      });
    }
  }
}

window.LawTTSPlayer = LawTTSPlayer;
