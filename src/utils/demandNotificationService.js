(function() {
window.DemandNotificationService = (() => {
  let _intervalId = null;

  function start() {
    if (_intervalId) return;
    _check(); // 初回即時実行
    _intervalId = setInterval(_check, 5 * 60 * 1000); // 5分間隔（交通到着通知対応）
  }

  function stop() {
    if (_intervalId) { clearInterval(_intervalId); _intervalId = null; }
  }

  function _check() {
    if (!NotificationService.isEnabled()) return;
    try {
    // 高需要時間帯チェック
    const hourly = DataService.getHourlyBreakdown();
    const now = new Date();
    const nextHour = (now.getHours() + 1) % 24;
    const nextSlot = hourly.find(h => h.hour === nextHour);
    if (nextSlot && nextSlot.avg > 0) {
      const allAvg = hourly.reduce((s, h) => s + h.avg, 0) / Math.max(hourly.filter(h => h.avg > 0).length, 1);
      if (nextSlot.avg >= allAvg * 1.3) {
        NotificationService.send('需要予測', {
          body: `${nextHour}時台は平均¥${nextSlot.avg.toLocaleString()}/回の高需要時間帯です`,
          tag: 'demand-alert',
        });
      }
    }
    // イベント終了アラート
    const alerts = DataService.getUpcomingEventAlerts();
    alerts.forEach(a => {
      NotificationService.send('イベント終了間近', {
        body: `${a.name}（${a.location || ''}）があと${a.minutesLeft}分で終了 — 周辺で需要増の可能性`,
        tag: 'event-alert-' + a.name,
      });
    });
    // 交通到着10分前通知（偶数日のみ — 奇数日は駅前待ち不可）
    const isEvenDay = now.getDate() % 2 === 0;
    if (isEvenDay) {
      const schedule = DataService.getDailyDemandSchedule();
      if (schedule.available && schedule.transitArrivals) {
        const nowMin = now.getHours() * 60 + now.getMinutes();
        schedule.transitArrivals.forEach(arr => {
          if (!arr.arrivalTime) return;
          const p = arr.arrivalTime.split(':');
          const arrMin = parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
          const diff = arrMin - nowMin;
          if (diff > 0 && diff <= 10) {
            NotificationService.send('交通到着まもなく', {
              body: `${arr.type || ''} ${arr.line || ''}が${arr.arrivalTime}に到着 → 駅前で需要増`,
              tag: 'transit-arrival-' + arr.arrivalTime,
            });
          }
        });
      }
    }

    // 病院退院ピーク15分前通知
    _checkHospitalDischarge(now);

    // ホテルチェックアウト15分前通知
    _checkHotelCheckout(now);

    // 天候変化通知
    _checkWeatherChange();
    } catch (e) {
      if (window.AppLogger) AppLogger.debug('DemandNotification check skipped', e.message);
    }
  }

  function _checkHospitalDischarge(now) {
    const hospitalData = DataService.getHospitalScheduleData();
    if (!hospitalData || !hospitalData.hospitals) return;
    hospitalData.hospitals.forEach(hosp => {
      if (hosp.nextEvent && hosp.nextEvent.type === 'discharge_peak' && hosp.nextEvent.minutesLeft > 0 && hosp.nextEvent.minutesLeft <= 15) {
        NotificationService.send('病院退院ピーク間近', {
          body: `${hosp.name}の${hosp.nextEvent.label || '退院ピーク'}まであと${hosp.nextEvent.minutesLeft}分`,
          tag: 'hospital-discharge-' + hosp.id,
        });
      }
    });
  }

  function _checkHotelCheckout(now) {
    const peaks = APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa.hotelPeakWindows || {};
    const nowMin = now.getHours() * 60 + now.getMinutes();
    Object.entries(peaks).forEach(([key, pw]) => {
      const [h, m] = pw.start.split(':').map(Number);
      const startMin = h * 60 + (m || 0);
      const diff = startMin - nowMin;
      if (diff > 0 && diff <= 15) {
        NotificationService.send('ホテル需要開始間近', {
          body: `${pw.label || key}が${pw.start}から開始 → ホテル周辺で需要増`,
          tag: 'hotel-checkout-' + key,
        });
      }
    });
  }

  function _checkWeatherChange() {
    GpsLogService.fetchHourlyForecast().then(forecast => {
      const impact = DataService.getWeatherDemandImpact(forecast);
      if (!impact || !impact.alerts || impact.alerts.length === 0) return;
      impact.alerts.forEach(alert => {
        NotificationService.send('天候変化予報', {
          body: alert.message,
          tag: 'weather-change-' + alert.time,
        });
      });
    }).catch(() => {});
  }

  return { start, stop };
})();
})();
