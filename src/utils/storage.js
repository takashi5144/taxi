(function() {
// storage.js - localStorage管理
window.AppStorage = {
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },

  getApiKey() {
    // APIキーはユーザーが設定画面から入力したもののみ使用
    // ハードコードされたキーは使用しない（セキュリティリスク）
    const key = this.get(APP_CONSTANTS.STORAGE_KEYS.API_KEY, '');
    if (key) return key;
    // フォールバック: JSON.stringifyなしで保存された生文字列に対応
    try {
      const raw = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.API_KEY);
      if (raw && raw.trim()) {
        // 正しい形式で再保存
        this.set(APP_CONSTANTS.STORAGE_KEYS.API_KEY, raw.trim());
        return raw.trim();
      }
    } catch {}
    return '';
  },

  setApiKey(key) {
    return this.set(APP_CONSTANTS.STORAGE_KEYS.API_KEY, key);
  },

  getGeminiApiKey() {
    const key = this.get(APP_CONSTANTS.STORAGE_KEYS.GEMINI_API_KEY, '');
    if (key) return key;
    try {
      const raw = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.GEMINI_API_KEY);
      if (raw && raw.trim()) {
        this.set(APP_CONSTANTS.STORAGE_KEYS.GEMINI_API_KEY, raw.trim());
        return raw.trim();
      }
    } catch {}
    return '';
  },

  setGeminiApiKey(key) {
    return this.set(APP_CONSTANTS.STORAGE_KEYS.GEMINI_API_KEY, key);
  },

  getSettings() {
    return this.get(APP_CONSTANTS.STORAGE_KEYS.SETTINGS, {
      gpsAutoTrack: true,
      mapType: 'roadmap',
    });
  },

  setSettings(settings) {
    return this.set(APP_CONSTANTS.STORAGE_KEYS.SETTINGS, settings);
  },
};

})();
