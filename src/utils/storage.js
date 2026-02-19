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
    return this.get(APP_CONSTANTS.STORAGE_KEYS.API_KEY, '');
  },

  setApiKey(key) {
    return this.set(APP_CONSTANTS.STORAGE_KEYS.API_KEY, key);
  },

  getGeminiApiKey() {
    return this.get(APP_CONSTANTS.STORAGE_KEYS.GEMINI_API_KEY, '');
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
