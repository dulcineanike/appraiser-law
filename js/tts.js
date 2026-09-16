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
    this.rate = parseFloat(localStorage.getItem('val_tts_rate') || '1.0');
    this.selectedVoice = null;
    this.currentArticleData = null;
    this.onStatusChange = null;
    this.onNextArticle = null;

    this.initVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => this.initVoices();
    }
  }

  initVoices() {
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
    this.stop();

    if (!this.synth) {
      alert('您的瀏覽器不支援語音朗讀功能');
      return;
    }

    this.currentArticleData = { lawName, rawNo, num, paragraphs, autoNext, includeLawName };
    const speechText = this.prepareSpeechText(rawNo, paragraphs, includeLawName ? lawName : null);

    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = 'zh-TW';
    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }
    utterance.rate = this.rate;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      this.isPlaying = true;
      this.isPaused = false;
      this.notifyStatus('playing');
    };

    utterance.onend = () => {
      this.isPlaying = false;
      this.isPaused = false;
      this.notifyStatus('ended');

      // 若開啟連續朗讀，自動播放下一條
      if (this.currentArticleData && this.currentArticleData.autoNext && this.onNextArticle) {
        this.onNextArticle(this.currentArticleData.num);
      }
    };

    utterance.onerror = (e) => {
      console.warn('TTS Error:', e);
      this.isPlaying = false;
      this.isPaused = false;
      this.notifyStatus('error');
    };

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  pause() {
    if (this.synth.speaking && !this.synth.paused) {
      this.synth.pause();
      this.isPaused = true;
      this.notifyStatus('paused');
    }
  }

  resume() {
    if (this.synth.paused) {
      this.synth.resume();
      this.isPaused = false;
      this.notifyStatus('playing');
    }
  }

  stop() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.isPlaying = false;
    this.isPaused = false;
    this.notifyStatus('stopped');
  }

  setRate(newRate) {
    this.rate = parseFloat(newRate);
    localStorage.setItem('val_tts_rate', this.rate.toString());
    // 若正在播放，重啟以套用語速
    if (this.isPlaying && this.currentArticleData) {
      const d = this.currentArticleData;
      this.play(d.lawName, d.rawNo, d.num, d.paragraphs, d.autoNext, d.includeLawName);
    }
  }

  notifyStatus(status) {
    if (this.onStatusChange) {
      this.onStatusChange(status, this.currentArticleData);
    }
  }
}

window.LawTTSPlayer = LawTTSPlayer;
