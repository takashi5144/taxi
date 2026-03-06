(function() {
window.NotificationService = (() => {
  function isSupported() {
    return 'Notification' in window;
  }

  function getPermission() {
    return isSupported() ? Notification.permission : 'denied';
  }

  async function requestPermission() {
    if (!isSupported()) return 'denied';
    return await Notification.requestPermission();
  }

  function isEnabled() {
    return localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.NOTIFICATION_ENABLED) === 'true';
  }

  function setEnabled(val) {
    localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.NOTIFICATION_ENABLED, val ? 'true' : 'false');
  }

  function send(title, options = {}) {
    if (!isSupported() || !isEnabled() || getPermission() !== 'granted') return;
    try {
      new Notification(title, { icon: './icons/icon-192.png', ...options });
    } catch (e) {
      AppLogger.warn('通知送信失敗: ' + e.message);
    }
  }

  function sendTroubleAlert(text) {
    if (!text || !isEnabled()) return;
    const keywords = ['遅延', '運休', '事故', '見合わせ', '運転取りやめ', '不通'];
    const hasAlert = keywords.some(kw => text.includes(kw));
    if (hasAlert) {
      send('交通情報アラート', { body: text.slice(0, 200), tag: 'trouble-alert' });
    }
  }

  return { isSupported, getPermission, requestPermission, isEnabled, setEnabled, send, sendTroubleAlert };
})();
})();
