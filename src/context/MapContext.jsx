(function() {
// MapContext.jsx - 自動始業/終業のみ（GPS・地図追跡は無効）
const { createContext, useContext, useEffect, useRef, useMemo, useCallback, useState } = React;

window.MapContext = createContext(null);

window.MapProvider = ({ children }) => {
  const isTrackingRef = useRef(false);

  // 自動始業・終業（設定時刻）
  useEffect(() => {
    let lastFiredMinute = '';
    const checkAutoShift = () => {
      const scheduledStart = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.DEFAULT_SHIFT_START);
      const scheduledEnd = localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.DEFAULT_SHIFT_END);
      if (!scheduledStart && !scheduledEnd) return;

      const now = new Date();
      const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (nowHHMM === lastFiredMinute) return;

      let shifts = [];
      try { shifts = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS) || '[]'); } catch { return; }
      const activeShift = shifts.find(s => !s.endTime);

      if (scheduledStart && nowHHMM === scheduledStart && !activeShift) {
        const todayStr = getLocalDateString();
        const alreadyStartedToday = shifts.some(s => {
          const d = getLocalDateString(new Date(s.startTime));
          return d === todayStr && s.autoStarted;
        });
        if (!alreadyStartedToday) {
          lastFiredMinute = nowHHMM;
          const newShift = { id: Date.now().toString(), startTime: now.toISOString(), endTime: null, autoStarted: true };
          shifts.push(newShift);
          localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
          if (window.DataService) DataService.syncShiftsToCloud();
          window.dispatchEvent(new CustomEvent('taxi-data-changed'));
          window.dispatchEvent(new CustomEvent('taxi-auto-shift', { detail: { type: 'start', startTime: now.toISOString() } }));
          if (window.AppLogger) AppLogger.info(`自動始業: ${scheduledStart}`);
        }
      }

      if (scheduledEnd && nowHHMM === scheduledEnd && activeShift) {
        lastFiredMinute = nowHHMM;
        try {
          const breaks = JSON.parse(localStorage.getItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS) || '[]');
          const ab = breaks.find(b => !b.endTime);
          if (ab) {
            ab.endTime = now.toISOString();
            localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.BREAKS, JSON.stringify(breaks));
            if (window.DataService) DataService.syncBreaksToCloud();
          }
        } catch { /* ignore */ }
        activeShift.endTime = now.toISOString();
        localStorage.setItem(APP_CONSTANTS.STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
        if (window.DataService) DataService.syncShiftsToCloud();
        window.dispatchEvent(new CustomEvent('taxi-data-changed'));
        window.dispatchEvent(new CustomEvent('taxi-auto-shift', { detail: { type: 'end' } }));
        if (window.AppLogger) AppLogger.info(`自動終業: ${scheduledEnd}`);
      }
    };

    checkAutoShift();
    const timer = setInterval(checkAutoShift, 30000);
    const handleScheduleChanged = () => { lastFiredMinute = ''; };
    window.addEventListener('taxi-shift-schedule-changed', handleScheduleChanged);
    return () => {
      clearInterval(timer);
      window.removeEventListener('taxi-shift-schedule-changed', handleScheduleChanged);
    };
  }, []);

  // 互換用スタブ（GPS無効）
  const noop = useCallback(() => {}, []);
  const value = useMemo(() => ({
    currentPosition: null,
    mapCenter: APP_CONSTANTS.DEFAULT_MAP_CENTER || { lat: 43.7706, lng: 142.365 },
    zoom: APP_CONSTANTS.DEFAULT_MAP_ZOOM || 13,
    isTracking: false,
    gpsError: null,
    accuracy: null,
    speed: null,
    heading: null,
    currentLocationName: null,
    setMapCenter: noop,
    setZoom: noop,
    setGpsError: noop,
    updatePosition: noop,
    startTracking: noop,
    stopTracking: noop,
  }), [noop]);

  return React.createElement(MapContext.Provider, { value }, children);
};

window.useMapContext = () => useContext(MapContext);

})();
