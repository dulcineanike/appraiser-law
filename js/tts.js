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
    // 優先挑選台灣繁體中文 (zh-TW) 自然人聲
    const twVoices = voices.filter(v => v.lang === 'zh-TW' || v.lang === 'zh_TW');
    const cnVoices = voices.filter(v => v.lang.startsWith('zh'));

    if (twVoices.length > 0) {
      // 優先挑選高品質人聲 (如 HanHan, Yating, HsiaoChen, Mei-Jia)
      const premium = twVoices.find(v => v.name.includes('HsiaoChen') || v.name.includes('Yating') || v.name.includes('Mei-Jia') || v.name.includes('Natural'));
      this.selectedVoice = premium || twVoices[0];
    } else if (cnVoices.length > 0) {
      this.selectedVoice = cnVoices[0];
    }
  }

  /**
   * 整理條文文字為自然語音朗讀文字
   * @param {string} rawNo 條號字串（例如「第 1 條」）
   * @param {string[]} paragraphs 條文段落陣列
   * @param {string|null} lawName 法規名稱（若未指定或為 null 則不唸出，避免條條重複唸法規名稱）
   */
  prepareSpeechText(rawNo, paragraphs, lawName = null) {
    // 朗讀時以條號開頭（如「第一條。」），不重複唸「土地法 第一條」、「土地法 第二條」等法規名稱
    let cleanText = lawName ? `${lawName}，${rawNo}。 ` : `${rawNo}。 `;
    paragraphs.forEach((p, idx) => {
      let t = p.trim();
      // 替換常用法條符號，讓語音更通順
      t = t.replace(/％/g, '百分之')
           .replace(/\//g, '除以')
           .replace(/×/g, '乘以')
           .replace(/＋/g, '加上')
           .replace(/－/g, '減去')
           .replace(/＝/g, '等於')
           .replace(/（/g, '，')
           .replace(/）/g, '，')
           .replace(/NOI/gi, '淨營運收益')
           .replace(/DCF/gi, '折現現金流量')
           .replace(/REITs/gi, '不動產投資信託');
      if (!/[。；：！？]$/.test(t)) {
        cleanText += t + '。 ';
      } else {
        cleanText += t + ' ';
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
    utterance.pitch = 1.0;

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
        }, 80);
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
