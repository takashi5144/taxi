(function() {
// DataManage.jsx - データ管理ページ（売上・他社・交通情報の編集・削除）

// GPS記録タブ（サブコンポーネント）
const GpsLogTab = ({ refreshKey, setRefreshKey }) => {
  const { useState, useEffect } = React;
  const [gpsDates, setGpsDates] = useState([]);
  const [gpsDate, setGpsDate] = useState('');
  const [classified, setClassified] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gpsConfirmClear, setGpsConfirmClear] = useState(false);
  const [gpsConfirmDelete, setGpsConfirmDelete] = useState(false);
  const [gpsLogPage, setGpsLogPage] = useState(0);

  // 日付一覧の非同期取得
  useEffect(() => {
    if (!window.GpsLogService) { setLoading(false); return; }
    setLoading(true);
    GpsLogService.getLogDates().then(dates => {
      setGpsDates(dates);
      setGpsDate(prev => dates.includes(prev) ? prev : (dates[0] || ''));
      setLoading(false);
    });
  }, [refreshKey]);

  // 分類・サマリーの非同期取得
  useEffect(() => {
    if (!gpsDate || !window.GpsLogService) { setClassified([]); setSummary(null); return; }
    let cancelled = false;
    setLoading(true);
    setGpsLogPage(0); // 日付変更時にページリセット
    Promise.all([
      GpsLogService.classifyEntries(gpsDate),
      GpsLogService.getDaySummary(gpsDate),
    ]).then(([cls, sum]) => {
      if (cancelled) return;
      setClassified(cls);
      setSummary(sum);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [gpsDate, refreshKey]);

  if (loading) {
    return React.createElement('div', { style: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' } },
      React.createElement('div', { style: { fontSize: '14px' } }, '読み込み中...')
    );
  }

  if (gpsDates.length === 0) {
    return React.createElement('div', { style: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' } },
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '48px', display: 'block', marginBottom: '12px', opacity: 0.4 } }, 'location_off'),
      React.createElement('div', { style: { fontSize: '14px' } }, 'GPS記録がありません'),
      React.createElement('div', { style: { fontSize: '12px', marginTop: '8px' } }, 'GPS追跡中は1秒間隔で自動記録されます')
    );
  }

  return React.createElement(React.Fragment, null,
    // 日付セレクタ
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } },
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: 'var(--text-secondary)' } }, 'calendar_today'),
      React.createElement('select', {
        value: gpsDate,
        onChange: e => { setGpsDate(e.target.value); setGpsConfirmDelete(false); },
        style: { flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '14px' }
      },
        ...gpsDates.map(d => React.createElement('option', { key: d, value: d }, d))
      )
    ),

    // サマリーカード
    summary && React.createElement(Card, { style: { marginBottom: '12px' } },
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' } },
        ...[
          { label: '記録件数', value: summary.points + '件', color: 'var(--text-primary)' },
          { label: '記録時間', value: summary.total + '分', color: 'var(--text-primary)' },
          { label: '実車率', value: summary.rate + '%', color: summary.rate > 0 ? 'var(--color-accent)' : 'var(--text-secondary)' },
          { label: '実車時間', value: summary.occupied + '分', color: 'var(--color-accent)' },
          { label: '空車時間', value: summary.vacant + '分', color: 'var(--text-secondary)' },
          { label: '記録期間', value: summary.firstTime && summary.lastTime
            ? new Date(summary.firstTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) + ' - ' + new Date(summary.lastTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
            : '-', color: 'var(--text-secondary)' },
        ].map((item, i) => React.createElement('div', { key: i },
          React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '2px' } }, item.label),
          React.createElement('div', { style: { fontSize: '16px', fontWeight: 600, color: item.color } }, item.value)
        ))
      )
    ),

    // 操作ボタン
    React.createElement('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' } },
      React.createElement('button', {
        onClick: async () => { await GpsLogService.exportCsv(gpsDate); },
        style: { padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'download'),
        'CSV出力'
      ),
      React.createElement('button', {
        onClick: async () => {
          if (gpsConfirmDelete) {
            await GpsLogService.deleteDate(gpsDate);
            setGpsConfirmDelete(false);
            const newDates = await GpsLogService.getLogDates();
            setGpsDate(newDates[0] || '');
            setRefreshKey(k => k + 1);
          } else {
            setGpsConfirmDelete(true);
            setTimeout(() => setGpsConfirmDelete(false), 3000);
          }
        },
        style: { padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: gpsConfirmDelete ? 'var(--color-danger)' : 'var(--bg-secondary)', color: gpsConfirmDelete ? '#fff' : 'var(--text-primary)', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'delete'),
        gpsConfirmDelete ? 'もう一度押して削除' : 'この日を削除'
      ),
      React.createElement('button', {
        onClick: async () => {
          if (gpsConfirmClear) {
            await GpsLogService.clearAll();
            setGpsConfirmClear(false);
            setGpsDate('');
            setRefreshKey(k => k + 1);
          } else {
            setGpsConfirmClear(true);
            setTimeout(() => setGpsConfirmClear(false), 3000);
          }
        },
        style: { padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: gpsConfirmClear ? 'var(--color-danger)' : 'var(--bg-secondary)', color: gpsConfirmClear ? '#fff' : 'var(--color-danger)', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'delete_forever'),
        gpsConfirmClear ? 'もう一度押して全削除' : '全GPS記録削除'
      )
    ),

    // ログ一覧テーブル（ページネーション付き — 大量データでのパフォーマンス低下を防止）
    (() => {
      const GPS_PAGE_SIZE = 200;
      const totalPoints = classified.length;
      const totalPages = Math.max(1, Math.ceil(totalPoints / GPS_PAGE_SIZE));
      const currentPage = Math.min(gpsLogPage || 0, totalPages - 1);
      const startIdx = currentPage * GPS_PAGE_SIZE;
      const pageData = classified.slice(startIdx, startIdx + GPS_PAGE_SIZE);

      return React.createElement('div', null,
        React.createElement('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          React.createElement('span', null, totalPoints + '件のGPSポイント' + (totalPages > 1 ? `（${currentPage + 1}/${totalPages}ページ）` : '')),
          totalPages > 1 && React.createElement('div', { style: { display: 'flex', gap: '4px' } },
            React.createElement('button', {
              onClick: () => setGpsLogPage(Math.max(0, currentPage - 1)),
              disabled: currentPage === 0,
              style: { padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: currentPage === 0 ? 'default' : 'pointer', opacity: currentPage === 0 ? 0.4 : 1, fontSize: '11px' }
            }, '前'),
            React.createElement('button', {
              onClick: () => setGpsLogPage(Math.min(totalPages - 1, currentPage + 1)),
              disabled: currentPage >= totalPages - 1,
              style: { padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: currentPage >= totalPages - 1 ? 'default' : 'pointer', opacity: currentPage >= totalPages - 1 ? 0.4 : 1, fontSize: '11px' }
            }, '次')
          )
        ),
        React.createElement('div', { style: { overflowX: 'auto', maxHeight: '400px', overflowY: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' } },
          React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' } },
            React.createElement('thead', null,
              React.createElement('tr', { style: { background: 'var(--bg-secondary)', position: 'sticky', top: 0 } },
                ...['時刻', '緯度', '経度', '精度', '速度', '状態'].map((h, i) =>
                  React.createElement('th', { key: i, style: { padding: '6px 8px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', whiteSpace: 'nowrap' } }, h)
                )
              )
            ),
            React.createElement('tbody', null,
              ...pageData.map((p, i) => {
                const time = new Date(p.t).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const spdKmh = p.spd != null ? (p.spd * 3.6).toFixed(1) + ' km/h' : '-';
                const isOccupied = p.status === 'occupied';
                return React.createElement('tr', { key: startIdx + i, style: { borderBottom: '1px solid rgba(255,255,255,0.05)' } },
                  React.createElement('td', { style: { padding: '4px 8px', whiteSpace: 'nowrap' } }, time),
                  React.createElement('td', { style: { padding: '4px 8px' } }, p.lat.toFixed(6)),
                  React.createElement('td', { style: { padding: '4px 8px' } }, p.lng.toFixed(6)),
                  React.createElement('td', { style: { padding: '4px 8px' } }, p.acc != null ? p.acc + 'm' : '-'),
                  React.createElement('td', { style: { padding: '4px 8px' } }, spdKmh),
                  React.createElement('td', { style: { padding: '4px 8px' } },
                    React.createElement('span', { style: {
                      display: 'inline-block', padding: '1px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 500,
                      background: isOccupied ? 'rgba(0,200,83,0.15)' : 'rgba(255,255,255,0.08)',
                      color: isOccupied ? 'var(--color-accent)' : 'var(--text-secondary)'
                    } }, isOccupied ? '実車' : '空車')
                  )
                );
              })
            )
          )
        )
      );
    })()
  );
};

// GPS分析タブ（サブコンポーネント）
const GpsAnalysisTab = ({ refreshKey }) => {
  const { useState, useEffect, useRef, useCallback } = React;
  const { isLoaded: mapsLoaded } = useGoogleMaps();
  const [subTab, setSubTab] = useState('trend');  // trend | matrix | playback
  const [loading, setLoading] = useState(false);

  // --- 走行トレンド ---
  const [trends, setTrends] = useState([]);
  useEffect(() => {
    if (subTab !== 'trend' || !window.GpsLogService) return;
    let cancelled = false;
    setLoading(true);
    GpsLogService.getAllDailyTrends().then(t => { if (!cancelled) { setTrends(t); setLoading(false); } });
    return () => { cancelled = true; };
  }, [subTab, refreshKey]);

  // --- エリア×時間帯マトリクス ---
  const [matrix, setMatrix] = useState(null);
  const [matrixDays, setMatrixDays] = useState(7);
  useEffect(() => {
    if (subTab !== 'matrix' || !window.GpsLogService) return;
    let cancelled = false;
    setLoading(true);
    GpsLogService.getLogDates().then(async dates => {
      if (cancelled) return;
      const target = dates.slice(0, matrixDays);
      if (target.length === 0) { setMatrix(null); setLoading(false); return; }
      const m = await GpsLogService.getAreaTimeMatrix(target);
      if (!cancelled) { setMatrix(m); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [subTab, matrixDays, refreshKey]);

  // --- 軌跡プレイバック ---
  const [playDates, setPlayDates] = useState([]);
  const [playDate, setPlayDate] = useState('');
  const [trackData, setTrackData] = useState([]);
  const [playIdx, setPlayIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(10);
  const playTimerRef = useRef(null);
  const playMapRef = useRef(null);
  const playMapInstanceRef = useRef(null);
  const playPolylineRef = useRef(null);
  const playMarkerRef = useRef(null);
  const playTrailRef = useRef(null);
  const playSegmentsRef = useRef([]);
  const pickupMarkersRef = useRef([]);
  const pickupInfoWindowRef = useRef(null);

  // --- 待機分析 ---
  const [standbyDates, setStandbyDates] = useState([]);
  const [standbyDate, setStandbyDate] = useState('');
  const [standbyPeriods, setStandbyPeriods] = useState([]);
  const [standbyNames, setStandbyNames] = useState({});
  const [standbyEfficiency, setStandbyEfficiency] = useState(null);
  const [standbyAllDays, setStandbyAllDays] = useState(null);
  const [standbyAllDaysLoading, setStandbyAllDaysLoading] = useState(false);
  const standbyMapRef = useRef(null);
  const standbyMapInstanceRef = useRef(null);
  const standbyMarkersRef = useRef([]);
  const standbyInfoWindowRef = useRef(null);

  useEffect(() => {
    if (subTab !== 'playback' || !window.GpsLogService) return;
    let cancelled = false;
    GpsLogService.getLogDates().then(dates => {
      if (!cancelled) {
        setPlayDates(dates);
        if (dates.length > 0 && !playDate) setPlayDate(dates[0]);
      }
    });
    return () => { cancelled = true; };
  }, [subTab, refreshKey]);

  useEffect(() => {
    if (!playDate || subTab !== 'playback') return;
    let cancelled = false;
    setLoading(true);
    setPlaying(false);
    if (playTimerRef.current) clearInterval(playTimerRef.current);
    GpsLogService.getTrackData(playDate).then(data => {
      if (!cancelled) { setTrackData(data); setPlayIdx(0); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [playDate, subTab]);

  // プレイバック地図の初期化
  useEffect(() => {
    if (subTab !== 'playback' || !playMapRef.current || !mapsLoaded || !window.google) return;
    if (playMapInstanceRef.current) return;
    playMapInstanceRef.current = new google.maps.Map(playMapRef.current, {
      center: { lat: 43.77, lng: 142.365 },
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: [{ elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] }],
    });
  }, [subTab, mapsLoaded]);

  // トラックデータ変更時に地図更新
  useEffect(() => {
    if (!playMapInstanceRef.current || trackData.length === 0) return;
    const map = playMapInstanceRef.current;

    // 既存のオーバーレイをクリア
    if (playPolylineRef.current) playPolylineRef.current.setMap(null);
    if (playMarkerRef.current) playMarkerRef.current.setMap(null);
    if (playTrailRef.current) playTrailRef.current.setMap(null);
    playSegmentsRef.current.forEach(s => s.polyline.setMap(null));
    playSegmentsRef.current = [];
    pickupMarkersRef.current.forEach(m => m.setMap(null));
    pickupMarkersRef.current = [];
    if (pickupInfoWindowRef.current) pickupInfoWindowRef.current.close();

    // 全ルートのポリライン（薄いライン）
    const path = trackData.map(p => ({ lat: p.lat, lng: p.lng }));
    playPolylineRef.current = new google.maps.Polyline({
      path, map, strokeColor: 'rgba(255,255,255,0.15)', strokeWeight: 2,
    });

    // セグメント別ポリライン（実車/空車色分け）
    const segments = [];
    let segStart = 0;
    for (let i = 1; i <= trackData.length; i++) {
      if (i === trackData.length || trackData[i].status !== trackData[segStart].status) {
        const isOccupied = trackData[segStart].status === 'occupied';
        const segPath = trackData.slice(segStart, i + (i < trackData.length ? 1 : 0))
          .map(pt => ({ lat: pt.lat, lng: pt.lng }));
        const polyline = new google.maps.Polyline({
          path: segPath,
          map: null, // 初期は非表示、再生で表示
          strokeColor: isOccupied ? '#00e676' : '#ff9800',
          strokeWeight: isOccupied ? 4 : 3,
          strokeOpacity: 0.9,
        });
        segments.push({ startIdx: segStart, endIdx: i - 1, polyline, status: trackData[segStart].status });
        segStart = i;
      }
    }
    playSegmentsRef.current = segments;

    // playTrailRefは互換性のため残す（非表示）
    playTrailRef.current = null;

    // 乗車地マーカー
    if (playDate && window.DataService) {
      const entries = DataService.getEntries();
      const dayEntries = entries.filter(e => e.date === playDate && e.pickupCoords && e.pickupCoords.lat && e.pickupCoords.lng);
      const iw = new google.maps.InfoWindow();
      pickupInfoWindowRef.current = iw;
      dayEntries.forEach(e => {
        const marker = new google.maps.Marker({
          position: { lat: e.pickupCoords.lat, lng: e.pickupCoords.lng },
          map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: '#ff1744',
            fillOpacity: 0.9,
            strokeColor: '#fff',
            strokeWeight: 1.5,
            scale: 6,
          },
          zIndex: 50,
          title: e.pickup || '乗車地',
        });
        marker.addListener('click', () => {
          const amt = e.amount ? `${Number(e.amount).toLocaleString()}円` : '---';
          const time = e.pickupTime || '---';
          const place = e.pickup || '不明';
          iw.setContent(`<div style="color:#333;font-size:13px;line-height:1.5;min-width:120px"><b>${amt}</b><br>${time} | ${place}</div>`);
          iw.open(map, marker);
        });
        pickupMarkersRef.current.push(marker);
      });
    }

    // 現在位置マーカー
    playMarkerRef.current = new google.maps.Marker({
      position: path[0], map,
      icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: '#00e676', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, scale: 8 },
      zIndex: 100,
    });

    // 全体が見えるようにフィット
    const bounds = new google.maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, 40);
  }, [trackData, playDate]);

  // プレイバック位置更新
  useEffect(() => {
    if (!playMapInstanceRef.current || !playMarkerRef.current || trackData.length === 0) return;
    const idx = Math.min(playIdx, trackData.length - 1);
    const p = trackData[idx];
    const pos = { lat: p.lat, lng: p.lng };
    playMarkerRef.current.setPosition(pos);

    // セグメント別表示更新
    const segments = playSegmentsRef.current;
    for (const seg of segments) {
      if (seg.endIdx < idx) {
        // 完全に通過済み → フル表示（次セグメントとの接続点も含む）
        if (!seg.polyline.getMap()) seg.polyline.setMap(playMapInstanceRef.current);
        const end = Math.min(seg.endIdx + 2, trackData.length);
        const fullPath = trackData.slice(seg.startIdx, end).map(pt => ({ lat: pt.lat, lng: pt.lng }));
        seg.polyline.setPath(fullPath);
      } else if (seg.startIdx <= idx) {
        // 現在位置を含むセグメント → 途中まで表示
        if (!seg.polyline.getMap()) seg.polyline.setMap(playMapInstanceRef.current);
        const partialPath = trackData.slice(seg.startIdx, idx + 1).map(pt => ({ lat: pt.lat, lng: pt.lng }));
        seg.polyline.setPath(partialPath);
      } else {
        // まだ到達していないセグメント → 非表示
        seg.polyline.setMap(null);
      }
    }

    // 現在位置マーカーの色を実車/空車で変える
    playMarkerRef.current.setIcon({
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: p.status === 'occupied' ? '#00e676' : '#ff9800',
      fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, scale: 8,
    });
  }, [playIdx, trackData]);

  // 再生タイマー
  useEffect(() => {
    if (playTimerRef.current) clearInterval(playTimerRef.current);
    if (!playing || trackData.length === 0) return;
    playTimerRef.current = setInterval(() => {
      setPlayIdx(prev => {
        if (prev >= trackData.length - 1) { setPlaying(false); return prev; }
        return prev + 1;
      });
    }, 1000 / playSpeed);
    return () => clearInterval(playTimerRef.current);
  }, [playing, playSpeed, trackData.length]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      playSegmentsRef.current.forEach(s => s.polyline.setMap(null));
      playSegmentsRef.current = [];
      pickupMarkersRef.current.forEach(m => m.setMap(null));
      pickupMarkersRef.current = [];
      if (pickupInfoWindowRef.current) pickupInfoWindowRef.current.close();
    };
  }, []);

  // --- 待機分析: 日付リスト取得 ---
  useEffect(() => {
    if (subTab !== 'standby' || !window.GpsLogService) return;
    let cancelled = false;
    GpsLogService.getLogDates().then(dates => {
      if (!cancelled) {
        setStandbyDates(dates);
        if (dates.length > 0 && !dates.includes(standbyDate)) setStandbyDate(dates[0]);
      }
    });
    return () => { cancelled = true; };
  }, [subTab, refreshKey]);

  // --- 待機分析: 待機期間検出 + 効率分析 + 逆ジオコーディング ---
  useEffect(() => {
    if (subTab !== 'standby' || !standbyDate || !window.GpsLogService) return;
    let cancelled = false;
    setLoading(true);
    setStandbyPeriods([]);
    setStandbyNames({});
    setStandbyEfficiency(null);
    GpsLogService.getStandbyEfficiency(standbyDate).then(async result => {
      if (cancelled) return;
      setStandbyPeriods(result.periods);
      setStandbyEfficiency(result.stats);
      setLoading(false);
      // 逆ジオコーディング（500ms間隔でレート制限）
      if (window.TaxiApp && TaxiApp.utils.reverseGeocode) {
        const names = {};
        for (let i = 0; i < result.periods.length; i++) {
          if (cancelled) break;
          try {
            // nearbyNameがあればそれを使用、なければ逆ジオコーディング
            const p = result.periods[i];
            const name = p.nearbyName || await TaxiApp.utils.reverseGeocode(p.lat, p.lng);
            names[i] = name;
            if (!cancelled) setStandbyNames(prev => ({ ...prev, [i]: name }));
          } catch {}
          if (i < result.periods.length - 1) await new Promise(r => setTimeout(r, 500));
        }
      }
    });
    return () => { cancelled = true; };
  }, [standbyDate, subTab]);

  // --- 待機分析: 全日集計（初回のみ自動取得） ---
  useEffect(() => {
    if (subTab !== 'standby' || !window.GpsLogService || standbyAllDays) return;
    let cancelled = false;
    setStandbyAllDaysLoading(true);
    GpsLogService.getStandbyAllDaysSummary().then(result => {
      if (!cancelled) { setStandbyAllDays(result); setStandbyAllDaysLoading(false); }
    }).catch(() => { if (!cancelled) setStandbyAllDaysLoading(false); });
    return () => { cancelled = true; };
  }, [subTab]);

  // --- 待機分析: 地図初期化 ---
  useEffect(() => {
    if (subTab !== 'standby' || !standbyMapRef.current || !mapsLoaded || !window.google) return;
    if (standbyMapInstanceRef.current) return;
    standbyMapInstanceRef.current = new google.maps.Map(standbyMapRef.current, {
      center: { lat: 43.77, lng: 142.365 },
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: [{ elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] }],
    });
    standbyInfoWindowRef.current = new google.maps.InfoWindow();
  }, [subTab, mapsLoaded]);

  // --- 待機分析: マーカー更新 ---
  useEffect(() => {
    if (!standbyMapInstanceRef.current) return;
    const map = standbyMapInstanceRef.current;
    // 既存マーカークリア
    standbyMarkersRef.current.forEach(m => m.setMap(null));
    standbyMarkersRef.current = [];
    if (standbyInfoWindowRef.current) standbyInfoWindowRef.current.close();

    if (standbyPeriods.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    const catColors = { station: '#1a73e8', hospital: '#e53935', hotel: '#9c27b0', spot: '#ff9800', other: '#6c757d' };
    standbyPeriods.forEach((p, idx) => {
      const pos = { lat: p.lat, lng: p.lng };
      bounds.extend(pos);
      const scale = Math.min(6 + p.durationMin * 0.5, 20); // 待機時間に応じたサイズ
      const markerColor = catColors[p.category] || catColors.other;
      const marker = new google.maps.Marker({
        position: pos, map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: markerColor,
          fillOpacity: 0.8,
          strokeColor: '#fff',
          strokeWeight: 1.5,
          scale,
        },
        zIndex: 30,
      });
      marker.addListener('click', () => {
        const iwCatMap = { station: '駅', hospital: '病院', hotel: 'ホテル', spot: 'スポット', other: 'その他' };
        // 具体施設名を優先
        const name = p.nearbyName || standbyNames[idx] || '取得中...';
        const start = new Date(p.startTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        const end = new Date(p.endTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        const catLabel = iwCatMap[p.category] || '';
        const rideInfo = p.gotRide
          ? `<br><span style="color:#00c853">→ 乗車 ¥${(p.nextRideAmount||0).toLocaleString()}${p.nextRideDropoff ? '（'+p.nextRideDropoff+'）' : ''}</span>`
          : '<br><span style="color:#e53935">→ 乗車なし</span>';
        const seasonTag = p.zooSeason ? ` <span style="font-size:9px;padding:1px 4px;border-radius:3px;background:${p.zooSeason === '冬期' ? '#e3f2fd' : '#e8f5e9'};color:${p.zooSeason === '冬期' ? '#1565c0' : '#2e7d32'}">${p.zooSeason}</span>` : '';
        standbyInfoWindowRef.current.setContent(
          `<div style="color:#333;font-size:13px;line-height:1.6;min-width:160px"><b>${name}</b> <span style="font-size:10px;color:${markerColor}">[${catLabel}]</span>${seasonTag}<br>${start} 〜 ${end}<br><b>${p.durationMin}分</b>待機${rideInfo}</div>`
        );
        standbyInfoWindowRef.current.open(map, marker);
      });
      standbyMarkersRef.current.push(marker);
    });
    map.fitBounds(bounds, 40);
  }, [standbyPeriods, standbyNames]);

  // --- 待機分析: クリーンアップ ---
  useEffect(() => {
    return () => {
      standbyMarkersRef.current.forEach(m => m.setMap(null));
      standbyMarkersRef.current = [];
      if (standbyInfoWindowRef.current) standbyInfoWindowRef.current.close();
    };
  }, []);

  const subTabs = [
    { id: 'trend', label: '走行トレンド', icon: 'trending_up' },
    { id: 'matrix', label: 'エリア分析', icon: 'grid_on' },
    { id: 'playback', label: '軌跡プレイバック', icon: 'play_circle' },
    { id: 'standby', label: '待機分析', icon: 'hourglass_top' },
  ];

  // --- レンダリング ---
  return React.createElement(React.Fragment, null,
    // サブタブ
    React.createElement('div', { style: { display: 'flex', gap: '4px', marginBottom: '16px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '4px' } },
      ...subTabs.map(st => React.createElement('button', {
        key: st.id,
        onClick: () => setSubTab(st.id),
        style: {
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
          padding: '8px 4px', borderRadius: '8px', border: 'none',
          fontSize: '12px', fontWeight: subTab === st.id ? 700 : 500, cursor: 'pointer',
          background: subTab === st.id ? 'var(--color-accent)' : 'transparent',
          color: subTab === st.id ? '#fff' : 'var(--text-secondary)',
          transition: 'all 0.2s',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, st.icon),
        st.label
      ))
    ),

    // ローディング
    loading && React.createElement('div', { style: { textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' } }, '分析中...'),

    // === 走行トレンド ===
    !loading && subTab === 'trend' && (() => {
      if (trends.length === 0) {
        return React.createElement('div', { style: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '48px', display: 'block', marginBottom: '12px', opacity: 0.4 } }, 'show_chart'),
          'GPSデータがありません'
        );
      }
      const maxDist = Math.max(...trends.map(t => t.distanceKm), 1);
      return React.createElement(React.Fragment, null,
        // サマリーカード（全日合計）
        React.createElement(Card, { style: { marginBottom: '12px' } },
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' } },
            ...[
              { label: '記録日数', value: trends.length + '日', color: 'var(--text-primary)' },
              { label: '総走行距離', value: trends.reduce((s, t) => s + t.distanceKm, 0).toFixed(1) + ' km', color: 'var(--color-accent)' },
              { label: '平均速度', value: (trends.reduce((s, t) => s + t.avgSpeed, 0) / trends.length).toFixed(1) + ' km/h', color: 'var(--text-primary)' },
            ].map((item, i) => React.createElement('div', { key: i },
              React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '2px' } }, item.label),
              React.createElement('div', { style: { fontSize: '16px', fontWeight: 600, color: item.color } }, item.value)
            ))
          )
        ),
        // 日別バーチャート
        React.createElement('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' } }, '日別走行距離'),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
          ...trends.slice(0, 30).map(t => React.createElement('div', { key: t.date, style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' } },
            React.createElement('span', { style: { width: '78px', flexShrink: 0, color: 'var(--text-secondary)' } }, t.date),
            React.createElement('div', { style: { flex: 1, height: '16px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden', position: 'relative' } },
              React.createElement('div', { style: {
                height: '100%', borderRadius: '4px', transition: 'width 0.3s',
                width: `${Math.max((t.distanceKm / maxDist) * 100, 1)}%`,
                background: t.distanceKm > 50 ? 'var(--color-accent)' : t.distanceKm > 20 ? '#2196F3' : 'rgba(255,255,255,0.2)',
              } })
            ),
            React.createElement('span', { style: { width: '55px', textAlign: 'right', flexShrink: 0, fontWeight: 600 } }, t.distanceKm + ' km'),
            React.createElement('span', { style: { width: '60px', textAlign: 'right', flexShrink: 0, color: 'var(--text-secondary)' } }, t.avgSpeed + ' km/h'),
            React.createElement('span', { style: { width: '40px', textAlign: 'right', flexShrink: 0, color: 'var(--text-secondary)' } }, t.duration + '分')
          ))
        ),
        // 速度トレンド
        React.createElement('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', marginTop: '16px', marginBottom: '8px' } }, '最高速度トレンド'),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
          ...trends.slice(0, 30).map(t => {
            const maxSpdAll = Math.max(...trends.map(x => x.maxSpeed), 1);
            return React.createElement('div', { key: t.date + '_spd', style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' } },
              React.createElement('span', { style: { width: '78px', flexShrink: 0, color: 'var(--text-secondary)' } }, t.date),
              React.createElement('div', { style: { flex: 1, height: '12px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' } },
                React.createElement('div', { style: {
                  height: '100%', borderRadius: '4px',
                  width: `${Math.max((t.maxSpeed / maxSpdAll) * 100, 1)}%`,
                  background: t.maxSpeed > 80 ? '#f44336' : t.maxSpeed > 50 ? '#ff9800' : '#4caf50',
                } })
              ),
              React.createElement('span', { style: { width: '65px', textAlign: 'right', flexShrink: 0, fontWeight: 500, color: t.maxSpeed > 80 ? '#f44336' : 'var(--text-primary)' } }, t.maxSpeed + ' km/h')
            );
          })
        )
      );
    })(),

    // === エリア×時間帯マトリクス ===
    !loading && subTab === 'matrix' && (() => {
      if (!matrix || matrix.cells.length === 0) {
        return React.createElement('div', { style: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '48px', display: 'block', marginBottom: '12px', opacity: 0.4 } }, 'grid_off'),
          'データが不足しています（複数日のGPS記録が必要）'
        );
      }
      // 期間選択
      const dayOptions = [7, 14, 30];
      // マトリクスをテーブルとして表示
      const rateColor = (rate) => {
        if (rate >= 70) return '#00e676';
        if (rate >= 50) return '#66bb6a';
        if (rate >= 30) return '#ffa726';
        if (rate >= 10) return '#ef5350';
        return 'rgba(255,255,255,0.1)';
      };
      const cellMap = {};
      matrix.cells.forEach(c => { cellMap[`${c.areaIdx}_${c.hour}`] = c; });
      // 使用する時間帯を絞る（データがある時間帯のみ）
      const usedHours = [...new Set(matrix.cells.map(c => c.hour))].sort((a, b) => a - b);

      return React.createElement(React.Fragment, null,
        // 期間セレクタ
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } },
          React.createElement('span', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, '分析期間:'),
          ...dayOptions.map(d => React.createElement('button', {
            key: d,
            onClick: () => setMatrixDays(d),
            style: {
              padding: '4px 12px', borderRadius: '6px', border: 'none', fontSize: '12px', cursor: 'pointer',
              background: matrixDays === d ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
              color: matrixDays === d ? '#fff' : 'var(--text-secondary)',
            },
          }, d + '日'))
        ),
        // 凡例
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '11px' } },
          React.createElement('span', { style: { color: 'var(--text-secondary)' } }, '実車率:'),
          ...[[70, '#00e676', '70%+'], [50, '#66bb6a', '50%+'], [30, '#ffa726', '30%+'], [10, '#ef5350', '10%+'], [0, 'rgba(255,255,255,0.15)', '<10%']].map(([, c, l]) =>
            React.createElement('span', { key: l, style: { display: 'inline-flex', alignItems: 'center', gap: '3px' } },
              React.createElement('span', { style: { width: '10px', height: '10px', borderRadius: '2px', background: c, display: 'inline-block' } }),
              l
            )
          )
        ),
        // ヒートマップテーブル
        React.createElement('div', { style: { overflowX: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' } },
          React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '11px' } },
            React.createElement('thead', null,
              React.createElement('tr', { style: { background: 'var(--bg-secondary)' } },
                React.createElement('th', { style: { padding: '4px 6px', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '10px', whiteSpace: 'nowrap' } }, 'エリア'),
                ...usedHours.map(h => React.createElement('th', { key: h, style: { padding: '4px 3px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '10px', minWidth: '28px' } }, h + '時'))
              )
            ),
            React.createElement('tbody', null,
              ...matrix.areas.map(area => React.createElement('tr', { key: area.idx },
                React.createElement('td', { style: { padding: '3px 6px', fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' } }, area.label),
                ...usedHours.map(h => {
                  const cell = cellMap[`${area.idx}_${h}`];
                  return React.createElement('td', { key: h, style: { padding: '2px', textAlign: 'center' } },
                    cell ? React.createElement('div', {
                      style: {
                        background: rateColor(cell.rate), borderRadius: '3px', padding: '2px 0',
                        color: cell.rate >= 30 ? '#000' : '#fff', fontWeight: 600, fontSize: '10px',
                      },
                      title: `実車率${cell.rate}% (${cell.total}点)`,
                    }, cell.rate + '%') : React.createElement('div', { style: { color: 'rgba(255,255,255,0.1)', fontSize: '10px' } }, '-')
                  );
                })
              ))
            )
          )
        ),
        // エリア座標の説明
        React.createElement('div', { style: { marginTop: '8px', fontSize: '11px', color: 'var(--text-secondary)' } },
          '* エリアはGPS範囲を5x5グリッドに分割。座標は各エリアの中心点。'
        )
      );
    })(),

    // === 軌跡プレイバック ===
    subTab === 'playback' && (() => {
      const current = trackData[Math.min(playIdx, trackData.length - 1)];
      return React.createElement(React.Fragment, null,
        // 日付選択
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: 'var(--text-secondary)' } }, 'calendar_today'),
          React.createElement('select', {
            value: playDate,
            onChange: e => setPlayDate(e.target.value),
            style: { flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '14px' },
          },
            ...playDates.map(d => React.createElement('option', { key: d, value: d }, d))
          )
        ),

        // 地図（loading中も常に表示し、DOM要素を保持）
        React.createElement('div', {
          ref: playMapRef,
          style: { width: '100%', height: '300px', borderRadius: '12px', marginBottom: '12px', background: '#1a1a2e' },
        }),

        // ローディング表示
        loading && React.createElement('div', { style: { textAlign: 'center', padding: '12px', color: 'var(--text-secondary)', fontSize: '13px' } }, '読み込み中...'),

        // コントロール
        !loading && trackData.length > 0 && React.createElement(React.Fragment, null,
          // 再生バー
          React.createElement('div', { style: { marginBottom: '8px' } },
            React.createElement('input', {
              type: 'range', min: 0, max: Math.max(trackData.length - 1, 0), value: playIdx,
              onChange: e => { setPlayIdx(parseInt(e.target.value)); setPlaying(false); },
              style: { width: '100%', accentColor: 'var(--color-accent)' },
            })
          ),
          // ボタン
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } },
            React.createElement('button', {
              onClick: () => setPlayIdx(0),
              style: { padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer' },
            }, React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, 'skip_previous')),
            React.createElement('button', {
              onClick: () => {
                if (playIdx >= trackData.length - 1) setPlayIdx(0);
                setPlaying(prev => !prev);
              },
              style: { padding: '8px 20px', borderRadius: '8px', border: 'none', background: playing ? '#f44336' : 'var(--color-accent)', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' },
            },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '20px' } }, playing ? 'pause' : 'play_arrow'),
              playing ? '停止' : '再生'
            ),
            // 速度
            React.createElement('span', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, '速度:'),
            ...[1, 5, 10, 30, 60].map(s => React.createElement('button', {
              key: s,
              onClick: () => setPlaySpeed(s),
              style: {
                padding: '4px 8px', borderRadius: '4px', border: 'none', fontSize: '11px', cursor: 'pointer',
                background: playSpeed === s ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
                color: playSpeed === s ? '#fff' : 'var(--text-secondary)',
              },
            }, s + 'x'))
          ),
          // 現在位置情報
          current && React.createElement(Card, { style: { padding: '10px 12px' } },
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center', fontSize: '12px' } },
              ...[
                { label: '時刻', value: new Date(current.t).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) },
                { label: '状態', value: current.status === 'occupied' ? '実車' : '空車', color: current.status === 'occupied' ? '#00e676' : '#ff9800' },
                { label: '累積距離', value: (current.distM / 1000).toFixed(1) + ' km' },
                { label: '速度', value: current.spd != null ? (current.spd * 3.6).toFixed(1) + ' km/h' : '-' },
                { label: '精度', value: current.acc != null ? current.acc + 'm' : '-' },
                { label: '進捗', value: `${playIdx + 1} / ${trackData.length}` },
              ].map((item, i) => React.createElement('div', { key: i },
                React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '1px' } }, item.label),
                React.createElement('div', { style: { fontWeight: 600, color: item.color || 'var(--text-primary)' } }, item.value)
              ))
            )
          )
        ),
        trackData.length === 0 && !loading && React.createElement('div', { style: { textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '13px' } }, 'この日のGPSデータはありません')
      );
    })(),

    // === 待機分析 ===
    subTab === 'standby' && (() => {
      if (standbyDates.length === 0 && !loading) {
        return React.createElement('div', { style: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '48px', display: 'block', marginBottom: '12px', opacity: 0.4 } }, 'hourglass_empty'),
          'GPSデータがありません'
        );
      }

      const totalMin = standbyPeriods.reduce((s, p) => s + p.durationMin, 0);
      const avgMin = standbyPeriods.length > 0 ? Math.round(totalMin / standbyPeriods.length * 10) / 10 : 0;
      const maxMin = standbyPeriods.length > 0 ? Math.max(...standbyPeriods.map(p => p.durationMin)) : 0;

      // カテゴリアイコン・色マッピング
      const catStyle = { station: { icon: 'train', color: '#1a73e8' }, hospital: { icon: 'local_hospital', color: '#e53935' }, hotel: { icon: 'hotel', color: '#9c27b0' }, spot: { icon: 'pin_drop', color: '#ff9800' }, other: { icon: 'place', color: '#6c757d' } };

      // 頻出待機地点の集計（逆ジオコーディング名+カテゴリ付きで集約）
      const freqMap = {};
      standbyPeriods.forEach((p, idx) => {
        // 具体施設名を優先（nearbyName > 逆ジオコーディング名）
        const name = p.nearbyName || standbyNames[idx] || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;
        if (!freqMap[name]) freqMap[name] = { name, count: 0, totalMin: 0, gotRide: 0, totalAmount: 0, category: p.category };
        freqMap[name].count++;
        freqMap[name].totalMin += p.durationMin;
        if (p.gotRide) { freqMap[name].gotRide++; freqMap[name].totalAmount += (p.nextRideAmount || 0); }
      });
      const freqTop5 = Object.values(freqMap).sort((a, b) => b.count - a.count || b.totalMin - a.totalMin).slice(0, 5);

      // カテゴリ別集計（当日）
      const dayCatMap = {};
      standbyPeriods.forEach(p => {
        const key = p.category || 'other';
        const dayCatLabelMap = { station: '駅', hospital: '病院', hotel: 'ホテル', spot: '待機スポット', other: 'その他' };
        if (!dayCatMap[key]) dayCatMap[key] = { count: 0, totalMin: 0, gotRide: 0, label: dayCatLabelMap[key] || 'その他' };
        dayCatMap[key].count++;
        dayCatMap[key].totalMin += p.durationMin;
        if (p.gotRide) dayCatMap[key].gotRide++;
      });
      const dayCats = Object.entries(dayCatMap).sort((a, b) => b[1].count - a[1].count);

      return React.createElement(React.Fragment, null,
        // 日付選択
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: 'var(--text-secondary)' } }, 'calendar_today'),
          React.createElement('select', {
            value: standbyDate,
            onChange: e => setStandbyDate(e.target.value),
            style: { flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '14px' },
          },
            ...standbyDates.map(d => React.createElement('option', { key: d, value: d }, d))
          )
        ),

        // 地図
        React.createElement('div', {
          ref: standbyMapRef,
          style: { width: '100%', height: '300px', borderRadius: '12px', marginBottom: '12px', background: '#1a1a2e' },
        }),

        // ローディング
        loading && React.createElement('div', { style: { textAlign: 'center', padding: '12px', color: 'var(--text-secondary)', fontSize: '13px' } }, '検出中...'),

        // サマリーカード（効率分析付き）
        !loading && standbyPeriods.length > 0 && React.createElement(Card, { style: { marginBottom: '12px' } },
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', textAlign: 'center' } },
            ...[
              { label: '待機回数', value: standbyPeriods.length + '回', color: '#ff9800' },
              { label: '合計待機', value: Math.round(totalMin) + '分', color: 'var(--text-primary)' },
              { label: '平均待機', value: avgMin + '分', color: 'var(--text-primary)' },
              { label: '最長待機', value: maxMin + '分', color: '#f44336' },
            ].map((item, i) => React.createElement('div', { key: i },
              React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' } }, item.label),
              React.createElement('div', { style: { fontSize: '15px', fontWeight: 600, color: item.color } }, item.value)
            ))
          ),
          // 待機→乗車 効率行
          standbyEfficiency && React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)' } },
            ...[
              { label: '乗車成功', value: standbyEfficiency.gotRide + '/' + standbyEfficiency.total + '回', color: '#00c853' },
              { label: '乗車率', value: standbyEfficiency.conversionRate + '%', color: standbyEfficiency.conversionRate >= 50 ? '#00c853' : standbyEfficiency.conversionRate >= 30 ? '#ff9800' : '#f44336' },
              { label: '待機→乗車', value: standbyEfficiency.avgWaitToRide > 0 ? standbyEfficiency.avgWaitToRide + '分' : '--', color: 'var(--text-primary)' },
            ].map((item, i) => React.createElement('div', { key: 'eff' + i },
              React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' } }, item.label),
              React.createElement('div', { style: { fontSize: '15px', fontWeight: 600, color: item.color } }, item.value)
            ))
          )
        ),

        // カテゴリ別内訳（当日）
        !loading && dayCats.length > 0 && React.createElement(React.Fragment, null,
          React.createElement('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', marginTop: '4px' } }, '場所カテゴリ別'),
          React.createElement('div', { style: { display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' } },
            ...dayCats.map(([key, val]) => {
              const cs = catStyle[key] || catStyle.other;
              const rate = val.count > 0 ? Math.round(val.gotRide / val.count * 100) : 0;
              return React.createElement('div', { key: key, style: { flex: '1 1 auto', minWidth: '80px', background: 'var(--bg-card)', borderRadius: '10px', padding: '8px 10px', border: `1px solid ${cs.color}33` } },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' } },
                  React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px', color: cs.color } }, cs.icon),
                  React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: cs.color } }, val.label)
                ),
                React.createElement('div', { style: { fontSize: '13px', fontWeight: 700 } }, val.count + '回'),
                React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-secondary)' } }, Math.round(val.totalMin) + '分 / 乗車率' + rate + '%')
              );
            })
          )
        ),

        // 頻出待機地点TOP5（カテゴリ・効率付き）
        !loading && freqTop5.length > 0 && React.createElement(React.Fragment, null,
          React.createElement('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', marginTop: '4px' } }, '頻出待機地点 TOP5'),
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' } },
            ...freqTop5.map((f, i) => {
              const cs = catStyle[f.category] || catStyle.other;
              const rate = f.count > 0 ? Math.round(f.gotRide / f.count * 100) : 0;
              return React.createElement(Card, { key: i, style: { padding: '8px 12px' } },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                  React.createElement('div', { style: { width: '28px', height: '28px', borderRadius: '50%', background: cs.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
                    React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: cs.color } }, cs.icon)
                  ),
                  React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                    React.createElement('div', { style: { fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, f.name),
                    React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-secondary)' } },
                      f.count + '回 / ' + Math.round(f.totalMin) + '分 / 乗車率' + rate + '%' +
                      (f.gotRide > 0 ? ' / 平均¥' + Math.round(f.totalAmount / f.gotRide).toLocaleString() : '')
                    )
                  )
                )
              );
            })
          )
        ),

        // 待機履歴リスト（カテゴリ・乗車結果付き）
        !loading && standbyPeriods.length > 0 && React.createElement(React.Fragment, null,
          React.createElement('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' } }, '待機履歴'),
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
            ...standbyPeriods.map((p, idx) => {
              const start = new Date(p.startTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
              const end = new Date(p.endTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
              const histCatLabelMap = { station: '駅', hospital: '病院', hotel: 'ホテル', spot: 'スポット', other: 'その他' };
              // 具体施設名を優先表示（nearbyName > 逆ジオコーディング名）
              const name = p.nearbyName || standbyNames[idx] || '場所取得中...';
              const cs = catStyle[p.category] || catStyle.other;
              const badgeLabel = histCatLabelMap[p.category] || 'その他';
              return React.createElement(Card, { key: idx, style: { padding: '8px 12px' } },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                  React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: cs.color } }, cs.icon),
                  React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                      React.createElement('span', { style: { fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, name),
                      React.createElement('span', { style: { fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: cs.color + '22', color: cs.color, fontWeight: 600, flexShrink: 0 } }, badgeLabel),
                      p.zooSeason && React.createElement('span', { style: { fontSize: '8px', padding: '1px 4px', borderRadius: '3px', fontWeight: 700, background: p.zooSeason === '冬期' ? 'rgba(59,130,246,0.2)' : 'rgba(16,185,129,0.2)', color: p.zooSeason === '冬期' ? '#3b82f6' : '#10b981', flexShrink: 0 } }, p.zooSeason)
                    ),
                    React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-secondary)' } }, start + ' 〜 ' + end),
                    // 乗車結果
                    p.gotRide
                      ? React.createElement('div', { style: { fontSize: '10px', color: '#00c853', marginTop: '2px' } },
                          '→ 乗車 ¥' + (p.nextRideAmount || 0).toLocaleString() +
                          (p.nextRideDropoff ? '（' + p.nextRideDropoff + '）' : '') +
                          (p.nextRideSource ? ' [' + p.nextRideSource + ']' : '') +
                          (p.waitToRideMin != null ? ' ' + p.waitToRideMin + '分後' : '')
                        )
                      : React.createElement('div', { style: { fontSize: '10px', color: '#f44336', marginTop: '2px' } }, '→ 乗車なし')
                  ),
                  React.createElement('div', { style: { fontSize: '15px', fontWeight: 700, color: p.durationMin >= 10 ? '#f44336' : '#ff9800', flexShrink: 0 } }, p.durationMin + '分')
                )
              );
            })
          )
        ),

        // ============================================================
        // 全期間集計セクション
        // ============================================================
        !loading && React.createElement('div', { style: { marginTop: '20px', paddingTop: '16px', borderTop: '2px solid rgba(255,255,255,0.08)' } },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: '#1a73e8' } }, 'assessment'),
            React.createElement('span', { style: { fontSize: '14px', fontWeight: 700 } }, '全期間 待機効率レポート')
          ),

          standbyAllDaysLoading && React.createElement('div', { style: { textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '13px' } }, '全日データ集計中...'),

          standbyAllDays && standbyAllDays.overall && React.createElement(React.Fragment, null,
            // 全体統計
            React.createElement(Card, { style: { marginBottom: '12px' } },
              React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' } },
                ...[
                  { label: '総待機回数', value: standbyAllDays.overall.totalPeriods + '回', color: '#ff9800' },
                  { label: '総待機時間', value: standbyAllDays.overall.totalMin + '分', color: 'var(--text-primary)' },
                  { label: '平均待機', value: standbyAllDays.overall.avgMin + '分', color: 'var(--text-primary)' },
                ].map((item, i) => React.createElement('div', { key: 'ov' + i },
                  React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' } }, item.label),
                  React.createElement('div', { style: { fontSize: '15px', fontWeight: 600, color: item.color } }, item.value)
                ))
              ),
              React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)' } },
                ...[
                  { label: '分析日数', value: standbyAllDays.overall.totalDays + '日', color: 'var(--text-primary)' },
                  { label: '乗車成功', value: standbyAllDays.overall.gotRide + '回', color: '#00c853' },
                  { label: '全体乗車率', value: standbyAllDays.overall.conversionRate + '%', color: standbyAllDays.overall.conversionRate >= 50 ? '#00c853' : standbyAllDays.overall.conversionRate >= 30 ? '#ff9800' : '#f44336' },
                ].map((item, i) => React.createElement('div', { key: 'ov2' + i },
                  React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' } }, item.label),
                  React.createElement('div', { style: { fontSize: '15px', fontWeight: 600, color: item.color } }, item.value)
                ))
              )
            ),

            // カテゴリ別集計
            standbyAllDays.byCategory.length > 0 && React.createElement(React.Fragment, null,
              React.createElement('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' } }, 'カテゴリ別 待機効率'),
              React.createElement('div', { style: { overflowX: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '12px' } },
                React.createElement('table', { style: { borderCollapse: 'collapse', fontSize: '11px', width: '100%', minWidth: '400px' } },
                  React.createElement('thead', null,
                    React.createElement('tr', null,
                      ...['場所種別', '回数', '合計(分)', '平均(分)', '乗車率', '平均売上'].map(h =>
                        React.createElement('th', { key: h, style: { padding: '6px 8px', fontWeight: 700, textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap', color: 'var(--text-secondary)' } }, h)
                      )
                    )
                  ),
                  React.createElement('tbody', null,
                    ...standbyAllDays.byCategory.map(c => {
                      const cs = catStyle[c.category] || catStyle.other;
                      return React.createElement('tr', { key: c.category },
                        React.createElement('td', { style: { padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)' } },
                          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px', color: cs.color } }, cs.icon),
                            React.createElement('span', { style: { fontWeight: 600, color: cs.color } }, c.label)
                          )
                        ),
                        React.createElement('td', { style: { padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', fontWeight: 600 } }, c.count),
                        React.createElement('td', { style: { padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' } }, Math.round(c.totalMin)),
                        React.createElement('td', { style: { padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' } }, c.avgMin),
                        React.createElement('td', { style: { padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', fontWeight: 600, color: c.conversionRate >= 50 ? '#00c853' : c.conversionRate >= 30 ? '#ff9800' : '#f44336' } }, c.conversionRate + '%'),
                        React.createElement('td', { style: { padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' } }, c.avgAmount > 0 ? '¥' + c.avgAmount.toLocaleString() : '--')
                      );
                    })
                  )
                )
              )
            ),

            // 場所別ランキング
            standbyAllDays.byPlace.length > 0 && React.createElement(React.Fragment, null,
              React.createElement('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' } }, '場所別 待機ランキング（全期間）'),
              React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' } },
                ...standbyAllDays.byPlace.slice(0, 10).map((pl, i) => {
                  const cs = catStyle[pl.category] || catStyle.other;
                  return React.createElement(Card, { key: i, style: { padding: '8px 12px' } },
                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                      React.createElement('div', { style: { width: '24px', height: '24px', borderRadius: '50%', background: cs.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '12px', fontWeight: 700, color: cs.color } }, i + 1),
                      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: cs.color, flexShrink: 0 } }, cs.icon),
                      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                        React.createElement('div', { style: { fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, pl.name),
                        React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-secondary)' } },
                          pl.count + '回 / ' + Math.round(pl.totalMin) + '分 / 乗車率' + pl.conversionRate + '%' +
                          (pl.avgAmount > 0 ? ' / 平均¥' + pl.avgAmount.toLocaleString() : '')
                        )
                      )
                    )
                  );
                })
              )
            )
          ),

          !standbyAllDays && !standbyAllDaysLoading && React.createElement('div', { style: { textAlign: 'center', padding: '12px', color: 'var(--text-secondary)', fontSize: '12px' } }, 'データなし')
        ),

        // データなし表示
        !loading && standbyPeriods.length === 0 && standbyDate && React.createElement('div', { style: { textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '13px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '36px', display: 'block', marginBottom: '8px', opacity: 0.4 } }, 'check_circle'),
          'この日は待機（3分以上の停車）は検出されませんでした'
        )
      );
    })()
  );
};

window.DataManagePage = () => {
  const { useState, useEffect, useCallback, useMemo } = React;
  const [tab, setTab] = useState('revenue');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const todayDefault = getLocalDateString();
  const [addForm, setAddForm] = useState({ date: todayDefault, weather: '', amount: '', pickup: '', pickupTime: '', dropoff: '', dropoffTime: '', passengers: '1', gender: '', purpose: '', memo: '', source: '', discounts: {} });
  const [addErrors, setAddErrors] = useState([]);
  const [showVacantAddForm, setShowVacantAddForm] = useState(false);
  const [vacantAddForm, setVacantAddForm] = useState({ date: todayDefault, weather: '', pickup: '', pickupTime: '', memo: '' });
  const [vacantAddErrors, setVacantAddErrors] = useState([]);
  const [showStandbyAddForm, setShowStandbyAddForm] = useState(false);
  const [standbyAddForm, setStandbyAddForm] = useState({ date: todayDefault, weather: '', location: '', startTime: '', endTime: '', memo: '' });
  const [standbyAddErrors, setStandbyAddErrors] = useState([]);
  const [mapPickerField, setMapPickerField] = useState(null); // 'pickup' | 'dropoff' | null
  const [addCoords, setAddCoords] = useState({ pickupCoords: null, dropoffCoords: null });
  const mapPickerRef = React.useRef(null);
  const mapPickerInstanceRef = React.useRef(null);
  const mapPickerMarkerRef = React.useRef(null);
  const [editMapPickerField, setEditMapPickerField] = useState(null); // 'pickup' | 'dropoff' | null
  const editMapPickerRef = React.useRef(null);
  const editMapPickerInstanceRef = React.useRef(null);
  const editMapPickerMarkerRef = React.useRef(null);
  const { apiKey } = useAppContext();

  const tabs = [
    { id: 'revenue', label: '売上記録', icon: 'receipt_long' },
    { id: 'vacant', label: '空車記録', icon: 'person_off' },
    { id: 'standby', label: '待機記録', icon: 'hourglass_top' },
    { id: 'rival', label: '他社記録', icon: 'local_taxi' },
    { id: 'transit', label: '交通情報', icon: 'directions_transit' },
    { id: 'gps', label: 'GPS記録', icon: 'location_on' },
    { id: 'gps-analysis', label: 'GPS分析', icon: 'analytics' },
    { id: 'trash', label: 'ゴミ箱', icon: 'delete_outline' },
  ];

  // データ読み込み
  const revenueEntries = useMemo(() => DataService.getEntries(), [refreshKey]);
  const vacantEntries = useMemo(() => DataService.getVacantEntries(), [refreshKey]);
  const standbyEntries = useMemo(() => DataService.getStandbyEntries(), [refreshKey]);
  const rivalEntries = useMemo(() => DataService.getRivalEntries(), [refreshKey]);
  const transitData = useMemo(() => {
    try {
      const saved = AppStorage.get(APP_CONSTANTS.STORAGE_KEYS.TRANSIT_INFO, {});
      return saved;
    } catch { return {}; }
  }, [refreshKey]);
  const trashEntries = useMemo(() => DataService.getTrash(), [refreshKey]);
  const [confirmTrashDelete, setConfirmTrashDelete] = useState(null);
  const [regeocoding, setRegeocoding] = useState(false);
  const [regeoProgress, setRegeoProgress] = useState('');

  // 座標から住所を一括再取得
  const handleRegeocode = useCallback(async () => {
    const targets = revenueEntries.filter(e =>
      (e.pickupCoords && e.pickupCoords.lat && e.pickupCoords.lng) ||
      (e.dropoffCoords && e.dropoffCoords.lat && e.dropoffCoords.lng)
    );
    if (targets.length === 0) {
      alert('座標データを持つ記録がありません。');
      return;
    }
    if (!confirm(`${targets.length}件の記録の住所を座標から再取得します。よろしいですか？`)) return;

    setRegeocoding(true);
    let updated = 0;
    const geocoder = window.google && window.google.maps && window.google.maps.Geocoder ? new window.google.maps.Geocoder() : null;

    for (let i = 0; i < targets.length; i++) {
      const entry = targets[i];
      setRegeoProgress(`${i + 1}/${targets.length}件処理中...`);
      const updates = {};

      try {
        // 乗車地
        if (entry.pickupCoords && entry.pickupCoords.lat && entry.pickupCoords.lng) {
          const addr = await reverseGeocode(geocoder, entry.pickupCoords.lat, entry.pickupCoords.lng);
          if (addr) updates.pickup = addr;
        }
        // 降車地
        if (entry.dropoffCoords && entry.dropoffCoords.lat && entry.dropoffCoords.lng) {
          const addr = await reverseGeocode(geocoder, entry.dropoffCoords.lat, entry.dropoffCoords.lng);
          if (addr) updates.dropoff = addr;
        }

        if (Object.keys(updates).length > 0) {
          DataService.updateEntry(entry.id, updates);
          updated++;
        }
      } catch (err) {
        AppLogger.warn(`住所再取得エラー (id=${entry.id}): ${err.message}`);
      }

      // Nominatimレート制限対策（500ms間隔）
      if (i < targets.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    setRegeocoding(false);
    setRegeoProgress('');
    setRefreshKey(k => k + 1);
    alert(`住所再取得完了: ${updated}/${targets.length}件を更新しました。`);
  }, [revenueEntries]);

  // 逆ジオコーディングヘルパー
  async function reverseGeocode(geocoder, lat, lng) {
    if (geocoder) {
      try {
        const results = await new Promise((resolve, reject) => {
          geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            if (status === 'OK' && results && results.length > 0) resolve(results);
            else reject(new Error(status));
          });
        });
        const preferred = TaxiApp.utils.pickBestGeocoderResult(results, lat, lng);
        return TaxiApp.utils.extractAddress(preferred);
      } catch {
        // Google失敗時はNominatimにフォールバック
      }
    }
    // Nominatim
    const res = await fetch(TaxiApp.utils.nominatimUrl(lat, lng, 18));
    const data = await res.json();
    if (data && data.address) {
      const a = data.address;
      const parts = [a.city || a.town || a.village || a.county || '', a.suburb || a.neighbourhood || a.quarter || '', a.road || ''].filter(Boolean);
      return parts.join(' ') || data.display_name.split(',').slice(0, 3).join(' ');
    }
    return null;
  }

  // storage変更を監視
  useEffect(() => {
    const handleStorage = (e) => {
      if ([APP_CONSTANTS.STORAGE_KEYS.REVENUE_DATA, APP_CONSTANTS.STORAGE_KEYS.RIVAL_RIDES, APP_CONSTANTS.STORAGE_KEYS.TRANSIT_INFO, APP_CONSTANTS.STORAGE_KEYS.TRASH].includes(e.key)) {
        setRefreshKey(k => k + 1);
      }
    };
    window.addEventListener('storage', handleStorage);
    const handleVisibility = () => {
      if (!document.hidden) setRefreshKey(k => k + 1);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    const handleDataChanged = () => setRefreshKey(k => k + 1);
    window.addEventListener('taxi-data-changed', handleDataChanged);
    return () => {
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('taxi-data-changed', handleDataChanged);
    };
  }, []);

  // 編集開始
  const startEdit = useCallback((entry, type) => {
    setEditingId(entry.id);
    setEditForm(type === 'revenue'
      ? { amount: String((entry.amount || 0) + (entry.discountAmount || 0)), date: entry.date || '', weather: entry.weather || '', pickup: entry.pickup || '', pickupTime: entry.pickupTime || '', dropoff: entry.dropoff || '', dropoffTime: entry.dropoffTime || '', passengers: entry.passengers || '', gender: entry.gender || '', purpose: entry.purpose || '', memo: entry.memo || '', source: entry.source || '', paymentMethod: entry.paymentMethod || 'cash' }
      : type === 'vacant'
      ? { date: entry.date || '', weather: entry.weather || '', pickup: entry.pickup || '', pickupTime: entry.pickupTime || '', memo: entry.memo || '' }
      : { date: entry.date || '', time: entry.time || '', weather: entry.weather || '', location: entry.location || '', memo: entry.memo || '' }
    );
    setErrors([]);
  }, []);

  // 編集保存
  const saveEdit = useCallback(() => {
    setErrors([]);
    let result;
    if (tab === 'revenue') {
      // 金額は割引前で表示→割引後に変換して保存
      const entry = revenueEntries.find(e => e.id === editingId);
      const discAmt = (entry && entry.discountAmount) || 0;
      const revenueUpdates = { ...editForm };
      if (revenueUpdates.amount != null) {
        revenueUpdates.amount = (parseInt(revenueUpdates.amount) || 0) - discAmt;
      }
      result = DataService.updateEntry(editingId, revenueUpdates);
    } else if (tab === 'vacant') {
      const vacantUpdates = { ...editForm, noPassenger: true, amount: 0 };
      result = DataService.updateEntry(editingId, vacantUpdates);
    } else if (tab === 'standby') {
      const standbyUpdates = { ...editForm, noPassenger: true, amount: 0, purpose: '待機' };
      result = DataService.updateEntry(editingId, standbyUpdates);
    } else if (tab === 'rival') {
      result = DataService.updateRivalEntry(editingId, editForm);
    } else {
      setErrors(['このタブでは編集できません']);
      return;
    }
    if (!result || !result.success) { setErrors((result && result.errors) || ['保存に失敗しました']); return; }
    setEditingId(null);
    setEditForm({});
    setEditMapPickerField(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setRefreshKey(k => k + 1);
  }, [tab, editingId, editForm]);

  // 削除確認→実行（ゴミ箱に移動）
  const handleDelete = useCallback((id) => {
    if (confirmDelete === id) {
      if (tab === 'revenue' || tab === 'vacant' || tab === 'standby') DataService.moveToTrash(id);
      else if (tab === 'rival') DataService.moveRivalToTrash(id);
      setConfirmDelete(null);
      setRefreshKey(k => k + 1);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  }, [tab, confirmDelete]);

  // ゴミ箱: 復元
  const handleRestore = useCallback((trashId) => {
    DataService.restoreFromTrash(trashId);
    setRefreshKey(k => k + 1);
  }, []);

  // ゴミ箱: 完全削除（2回クリック）
  const handlePermanentDelete = useCallback((trashId) => {
    if (confirmTrashDelete === trashId) {
      DataService.permanentDeleteFromTrash(trashId);
      setConfirmTrashDelete(null);
      setRefreshKey(k => k + 1);
    } else {
      setConfirmTrashDelete(trashId);
      setTimeout(() => setConfirmTrashDelete(null), 3000);
    }
  }, [confirmTrashDelete]);

  // ゴミ箱を空にする
  const handleEmptyTrash = useCallback(() => {
    if (confirm('ゴミ箱を空にしますか？全てのデータが完全に削除されます。')) {
      DataService.emptyTrash();
      setRefreshKey(k => k + 1);
    }
  }, []);

  // 交通情報の個別カテゴリ削除
  const deleteTransitCategory = useCallback((key) => {
    const current = AppStorage.get(APP_CONSTANTS.STORAGE_KEYS.TRANSIT_INFO, {});
    delete current[key];
    AppStorage.set(APP_CONSTANTS.STORAGE_KEYS.TRANSIT_INFO, current);
    setRefreshKey(k => k + 1);
  }, []);

  // マップピッカーの初期化・クリックハンドラ
  useEffect(() => {
    if (!mapPickerField || !mapPickerRef.current || !window.google || !window.google.maps) return;
    setTimeout(() => { mapPickerRef.current && mapPickerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100);
    const center = APP_CONSTANTS.DEFAULT_MAP_CENTER;
    const map = new google.maps.Map(mapPickerRef.current, {
      center, zoom: 13, mapTypeId: 'roadmap', disableDefaultUI: true,
      zoomControl: true, fullscreenControl: false, mapTypeControl: false,
    });
    mapPickerInstanceRef.current = map;
    const marker = new google.maps.Marker({ map, position: center, visible: false });
    mapPickerMarkerRef.current = marker;

    // GPS現在地を取得してマップの中心に設定
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const currentPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          map.setCenter(currentPos);
          map.setZoom(13);
          new google.maps.Marker({ map, position: currentPos, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#4285F4', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 }, title: '現在地', clickable: false });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
      );
    }

    const _extractAddress = TaxiApp.utils.extractAddress;

    map.addListener('click', (e) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      marker.setPosition(e.latLng);
      marker.setVisible(true);

      // 最優先: 既知場所マッチング
      const knownPlace2 = TaxiApp.utils.matchKnownPlace(lat, lng);
      if (knownPlace2) {
        const coordsKey = mapPickerField === 'pickup' ? 'pickupCoords' : 'dropoffCoords';
        setAddForm(f => ({ ...f, [mapPickerField]: knownPlace2 }));
        setAddCoords(c => ({ ...c, [coordsKey]: { lat, lng } }));
        return;
      }
      // 逆ジオコーディング
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === 'OK' && results && results.length > 0) {
          const preferred = TaxiApp.utils.pickBestGeocoderResult(results, lat, lng);
          const addr = _extractAddress(preferred);
          const coordsKey = mapPickerField === 'pickup' ? 'pickupCoords' : 'dropoffCoords';
          setAddForm(f => ({ ...f, [mapPickerField]: addr }));
          setAddCoords(c => ({ ...c, [coordsKey]: { lat, lng } }));
        } else {
          // Nominatimフォールバック
          fetch(TaxiApp.utils.nominatimUrl(lat, lng, 18))
            .then(r => r.json()).then(data => {
              const a = data.address || {};
              const parts = [a.city || a.town || a.village || '', a.suburb || a.neighbourhood || a.quarter || '', a.road || '', a.house_number || ''].filter(Boolean);
              const addr = parts.join(' ') || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
              const coordsKey = mapPickerField === 'pickup' ? 'pickupCoords' : 'dropoffCoords';
              setAddForm(f => ({ ...f, [mapPickerField]: addr }));
              setAddCoords(c => ({ ...c, [coordsKey]: { lat, lng } }));
            }).catch(() => {
              const coordsKey = mapPickerField === 'pickup' ? 'pickupCoords' : 'dropoffCoords';
              setAddForm(f => ({ ...f, [mapPickerField]: `${lat.toFixed(6)}, ${lng.toFixed(6)}` }));
              setAddCoords(c => ({ ...c, [coordsKey]: { lat, lng } }));
            });
        }
      });
    });

    return () => { mapPickerInstanceRef.current = null; mapPickerMarkerRef.current = null; };
  }, [mapPickerField]);

  // 編集用マップピッカーの初期化・クリックハンドラ
  useEffect(() => {
    if (!editMapPickerField || !editMapPickerRef.current || !window.google || !window.google.maps) return;
    setTimeout(() => { editMapPickerRef.current && editMapPickerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100);
    const center = APP_CONSTANTS.DEFAULT_MAP_CENTER;
    const map = new google.maps.Map(editMapPickerRef.current, {
      center, zoom: 13, mapTypeId: 'roadmap', disableDefaultUI: true,
      zoomControl: true, fullscreenControl: false, mapTypeControl: false,
    });
    editMapPickerInstanceRef.current = map;
    const marker = new google.maps.Marker({ map, position: center, visible: false });
    editMapPickerMarkerRef.current = marker;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const currentPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          map.setCenter(currentPos);
          map.setZoom(13);
          new google.maps.Marker({ map, position: currentPos, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#4285F4', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 }, title: '現在地', clickable: false });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
      );
    }

    const _extractAddress = TaxiApp.utils.extractAddress;

    map.addListener('click', (e) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      marker.setPosition(e.latLng);
      marker.setVisible(true);

      // 最優先: 既知場所マッチング
      const knownPlace3 = TaxiApp.utils.matchKnownPlace(lat, lng);
      if (knownPlace3) {
        const targetField = editMapPickerField === 'dropoff' ? 'dropoff' : 'pickup';
        setEditForm(f => ({ ...f, [targetField]: knownPlace3 }));
        return;
      }
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === 'OK' && results && results.length > 0) {
          const preferred = TaxiApp.utils.pickBestGeocoderResult(results, lat, lng);
          const addr = _extractAddress(preferred);
          const targetField = editMapPickerField === 'dropoff' ? 'dropoff' : 'pickup';
          setEditForm(f => ({ ...f, [targetField]: addr }));
        } else {
          fetch(TaxiApp.utils.nominatimUrl(lat, lng, 18))
            .then(r => r.json()).then(data => {
              const a = data.address || {};
              const parts = [a.city || a.town || a.village || '', a.suburb || a.neighbourhood || a.quarter || '', a.road || '', a.house_number || ''].filter(Boolean);
              const addr = parts.join(' ') || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
              const targetField = editMapPickerField === 'dropoff' ? 'dropoff' : 'pickup';
              setEditForm(f => ({ ...f, [targetField]: addr }));
            }).catch(() => {
              const targetField = editMapPickerField === 'dropoff' ? 'dropoff' : 'pickup';
              setEditForm(f => ({ ...f, [targetField]: `${lat.toFixed(6)}, ${lng.toFixed(6)}` }));
            });
        }
      });
    });

    return () => { editMapPickerInstanceRef.current = null; editMapPickerMarkerRef.current = null; };
  }, [editMapPickerField]);

  // 手動追加
  const handleManualAdd = useCallback(() => {
    setAddErrors([]);
    const formWithCoords = { ...addForm, pickupCoords: addCoords.pickupCoords, dropoffCoords: addCoords.dropoffCoords };
    const result = DataService.addEntry(formWithCoords);
    if (!result.success) { setAddErrors(result.errors); return; }
    setAddForm({ date: getLocalDateString(), weather: addForm.weather, amount: '', pickup: '', pickupTime: '', dropoff: '', dropoffTime: '', passengers: '1', gender: '', purpose: '', memo: '', source: '', discounts: {} });
    setAddCoords({ pickupCoords: null, dropoffCoords: null });
    setMapPickerField(null);
    setShowAddForm(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setRefreshKey(k => k + 1);
  }, [addForm, addCoords, todayDefault]);

  // 空車記録の手動追加
  const handleVacantAdd = useCallback(() => {
    setVacantAddErrors([]);
    if (!vacantAddForm.pickup) { setVacantAddErrors(['乗車地を入力してください']); return; }
    const form = {
      ...vacantAddForm,
      amount: '0',
      noPassenger: true,
      dropoff: '',
      dropoffTime: '',
      passengers: '0',
      gender: '',
      purpose: '',
      source: '',
    };
    const result = DataService.addEntry(form);
    if (!result.success) { setVacantAddErrors(result.errors); return; }
    setVacantAddForm({ date: getLocalDateString(), weather: vacantAddForm.weather, pickup: '', pickupTime: '', memo: '' });
    setShowVacantAddForm(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setRefreshKey(k => k + 1);
  }, [vacantAddForm]);

  // 待機記録の手動追加
  const handleStandbyAdd = useCallback(() => {
    setStandbyAddErrors([]);
    if (!standbyAddForm.location) { setStandbyAddErrors(['待機場所を入力してください']); return; }
    if (!standbyAddForm.startTime) { setStandbyAddErrors(['開始時刻を入力してください']); return; }
    const form = {
      date: standbyAddForm.date,
      weather: standbyAddForm.weather,
      amount: '0',
      noPassenger: true,
      pickup: standbyAddForm.location,
      pickupTime: standbyAddForm.startTime,
      dropoff: standbyAddForm.location,
      dropoffTime: standbyAddForm.endTime || '',
      passengers: '0',
      gender: '',
      purpose: '待機',
      source: '',
      memo: standbyAddForm.memo,
      standbyInfo: {
        locationName: standbyAddForm.location,
        startTime: standbyAddForm.startTime,
        endTime: standbyAddForm.endTime || '',
      },
    };
    const result = DataService.addEntry(form);
    if (!result.success) { setStandbyAddErrors(result.errors); return; }
    // 待機記録追加→売上記録の双方向同期（配車方法「待機」の売上と連動）
    if (result.entry && form.standbyInfo && form.standbyInfo.locationName) {
      const revEntries = DataService.getEntries();
      const matchingRev = revEntries.find(r => {
        if (r.noPassenger) return false;
        if (r.date !== form.date) return false;
        if (r.source !== '待機') return false;
        const rsi = r.standbyInfo || {};
        if (rsi.startTime && form.standbyInfo.startTime && rsi.startTime === form.standbyInfo.startTime) return true;
        if (rsi.startTime && form.standbyInfo.startTime) {
          const rMin = parseInt(rsi.startTime.replace(':',''));
          const sMin = parseInt(form.standbyInfo.startTime.replace(':',''));
          if (!isNaN(rMin) && !isNaN(sMin) && Math.abs(rMin - sMin) <= 5) return true;
        }
        return false;
      });
      if (matchingRev) {
        DataService.updateEntry(matchingRev.id, { standbyInfo: form.standbyInfo });
      }
    }
    setStandbyAddForm({ date: getLocalDateString(), weather: standbyAddForm.weather, location: '', startTime: '', endTime: '', memo: '' });
    setShowStandbyAddForm(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setRefreshKey(k => k + 1);
  }, [standbyAddForm]);

  // 検索フィルター
  const filteredRevenue = useMemo(() => {
    if (!search) return revenueEntries;
    const q = search.toLowerCase();
    return revenueEntries.filter(e =>
      (e.pickup || '').toLowerCase().includes(q) || (e.dropoff || '').toLowerCase().includes(q) ||
      (e.date || '').includes(q) || (e.memo || '').toLowerCase().includes(q) ||
      String(e.amount).includes(q)
    );
  }, [revenueEntries, search]);

  const filteredVacant = useMemo(() => {
    if (!search) return vacantEntries;
    const q = search.toLowerCase();
    return vacantEntries.filter(e =>
      (e.pickup || '').toLowerCase().includes(q) || (e.dropoff || '').toLowerCase().includes(q) ||
      (e.date || '').includes(q) || (e.memo || '').toLowerCase().includes(q)
    );
  }, [vacantEntries, search]);

  const filteredStandby = useMemo(() => {
    if (!search) return standbyEntries;
    const q = search.toLowerCase();
    return standbyEntries.filter(e =>
      (e.pickup || '').toLowerCase().includes(q) || (e.dropoff || '').toLowerCase().includes(q) ||
      (e.date || '').includes(q) || (e.memo || '').toLowerCase().includes(q) ||
      (e.standbyInfo && e.standbyInfo.locationName || '').toLowerCase().includes(q)
    );
  }, [standbyEntries, search]);

  const filteredRival = useMemo(() => {
    if (!search) return rivalEntries;
    const q = search.toLowerCase();
    return rivalEntries.filter(e =>
      (e.location || '').toLowerCase().includes(q) || (e.date || '').includes(q) ||
      (e.memo || '').toLowerCase().includes(q)
    );
  }, [rivalEntries, search]);

  // 天候選択肢
  const weatherOptions = ['', '晴れ', '曇り', '雨', '雪'];

  // 共通入力フィールド生成
  const field = (label, key, type, opts) => {
    const val = editForm[key] || '';
    return React.createElement('div', { key, style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' } },
      React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', minWidth: '56px', textAlign: 'right' } }, label),
      type === 'select'
        ? React.createElement('select', {
            value: val,
            onChange: e => setEditForm(f => ({ ...f, [key]: e.target.value })),
            style: { flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px' },
          }, (opts || []).map(o => React.createElement('option', { key: o, value: o }, o || '未設定')))
        : React.createElement('input', {
            type: type || 'text',
            value: val,
            onChange: e => setEditForm(f => ({ ...f, [key]: e.target.value })),
            style: { flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px' },
          })
    );
  };

  // 編集フォーム
  const editPanel = (type) => {
    if (!editingId) return null;
    return React.createElement('div', {
      style: { background: 'rgba(26,115,232,0.08)', border: '1px solid rgba(26,115,232,0.3)', borderRadius: '10px', padding: '14px', marginBottom: '12px' },
    },
      React.createElement('div', { style: { fontWeight: 600, fontSize: '13px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' } },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: 'var(--color-primary-light)' } }, 'edit'),
        'データ編集'
      ),
      type === 'revenue' ? React.createElement(React.Fragment, null,
        field('金額', 'amount', 'number'),
        field('日付', 'date', 'date'),
        field('天候', 'weather', 'select', weatherOptions),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' } },
          React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', minWidth: '56px', textAlign: 'right' } }, '乗車地'),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', { style: { display: 'flex', gap: '4px' } },
              React.createElement('input', { type: 'text', value: editForm.pickup || '', onChange: e => setEditForm(f => ({ ...f, pickup: e.target.value })), style: { flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px' } }),
              React.createElement('button', {
                onClick: () => setEditMapPickerField(editMapPickerField === 'pickup' ? null : 'pickup'),
                style: { padding: '6px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', background: editMapPickerField === 'pickup' ? 'var(--color-primary)' : 'var(--bg-tertiary)', color: editMapPickerField === 'pickup' ? '#fff' : 'var(--text-secondary)', whiteSpace: 'nowrap' },
              }, React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'map'), '地図')
            ),
            editMapPickerField === 'pickup' && React.createElement('div', { style: { marginTop: '6px' } },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontSize: '11px', color: 'var(--color-primary-light)' } },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'touch_app'),
                '地図をタップして乗車地を選択'
              ),
              (window.google && window.google.maps)
                ? React.createElement('div', { ref: editMapPickerRef, style: { width: '100%', height: '660px', borderRadius: '8px', border: '2px solid var(--color-primary)', overflow: 'hidden' } })
                : React.createElement('div', { style: { padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' } }, 'Google Maps APIキーを設定してください')
            )
          )
        ),
        field('乗車時刻', 'pickupTime', 'time'),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' } },
          React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', minWidth: '56px', textAlign: 'right' } }, '降車地'),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', { style: { display: 'flex', gap: '4px' } },
              React.createElement('input', { type: 'text', value: editForm.dropoff || '', onChange: e => setEditForm(f => ({ ...f, dropoff: e.target.value })), style: { flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px' } }),
              React.createElement('button', {
                onClick: () => setEditMapPickerField(editMapPickerField === 'dropoff' ? null : 'dropoff'),
                style: { padding: '6px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', background: editMapPickerField === 'dropoff' ? 'var(--color-secondary)' : 'var(--bg-tertiary)', color: editMapPickerField === 'dropoff' ? '#fff' : 'var(--text-secondary)', whiteSpace: 'nowrap' },
              }, React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'map'), '地図')
            ),
            editMapPickerField === 'dropoff' && React.createElement('div', { style: { marginTop: '6px' } },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontSize: '11px', color: 'var(--color-secondary)' } },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'touch_app'),
                '地図をタップして降車地を選択'
              ),
              (window.google && window.google.maps)
                ? React.createElement('div', { ref: editMapPickerRef, style: { width: '100%', height: '660px', borderRadius: '8px', border: '2px solid var(--color-secondary)', overflow: 'hidden' } })
                : React.createElement('div', { style: { padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' } }, 'Google Maps APIキーを設定してください')
            )
          )
        ),
        field('降車時刻', 'dropoffTime', 'time'),
        field('人数', 'passengers', 'number'),
        field('性別', 'gender', 'select', ['', '男性', '女性', 'その他']),
        field('用途', 'purpose', 'select', ['', '通勤', '通院', '買物', '観光', '出張', '送迎', '空港', '飲食', 'パチンコ', '駅移動']),
        field('配車方法', 'source', 'select', ['', 'Go', 'Uber', 'DIDI', '電話', '流し', '待機']),
        // 支払方法
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' } },
          React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', minWidth: '56px', textAlign: 'right' } }, '支払方法'),
          React.createElement('div', { style: { flex: 1, display: 'flex', gap: '6px' } },
            ...['cash', 'uncollected', 'didi'].map(method => {
              const selected = (editForm.paymentMethod || 'cash') === method;
              const label = method === 'cash' ? '現金' : method === 'didi' ? 'DIDI決済' : '未収';
              const icon = method === 'cash' ? 'payments' : method === 'didi' ? 'smartphone' : 'pending';
              const activeColor = method === 'cash' ? 'var(--color-accent)' : method === 'didi' ? 'var(--color-warning)' : 'var(--color-error)';
              const activeBg = method === 'cash' ? 'rgba(0,200,83,0.15)' : method === 'didi' ? 'rgba(255,152,0,0.15)' : 'rgba(229,57,53,0.15)';
              return React.createElement('button', {
                key: method, type: 'button',
                onClick: () => setEditForm(f => ({ ...f, paymentMethod: method })),
                style: {
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  padding: '6px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: selected ? 700 : 400,
                  cursor: 'pointer',
                  border: selected ? `2px solid ${activeColor}` : '1px solid rgba(255,255,255,0.15)',
                  background: selected ? activeBg : 'rgba(255,255,255,0.05)',
                  color: selected ? activeColor : 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                },
              },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, icon),
                label
              );
            })
          )
        ),
        field('メモ', 'memo', 'text')
      ) : React.createElement(React.Fragment, null,
        field('日付', 'date', 'date'),
        field('時刻', 'time', 'time'),
        field('天候', 'weather', 'select', weatherOptions),
        field('場所', 'location', 'text'),
        field('メモ', 'memo', 'text')
      ),
      errors.length > 0 && React.createElement('div', { style: { color: 'var(--color-danger)', fontSize: '12px', marginTop: '6px' } },
        errors.join(', ')
      ),
      React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' } },
        React.createElement(Button, { variant: 'ghost', onClick: () => { setEditingId(null); setErrors([]); setEditMapPickerField(null); } }, 'キャンセル'),
        React.createElement(Button, { icon: 'save', onClick: saveEdit }, '保存')
      )
    );
  };

  // 売上エントリ行
  const revenueRow = (entry) => {
    const isEditing = editingId === entry.id;
    const isConfirm = confirmDelete === entry.id;
    const eDate = entry.date || getLocalDateString(new Date(entry.timestamp));
    const info = entry.dayOfWeek ? { dayOfWeek: entry.dayOfWeek, holiday: entry.holiday, isSunday: entry.dayOfWeek === '日', isSaturday: entry.dayOfWeek === '土', isHoliday: !!entry.holiday } : JapaneseHolidays.getDateInfo(eDate);
    const dayColor = info.isSunday || info.isHoliday ? '#ef4444' : info.isSaturday ? '#3b82f6' : 'var(--text-muted)';

    return React.createElement('div', { key: entry.id },
      isEditing && editPanel('revenue'),
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', opacity: isEditing ? 0.5 : 1 },
      },
        React.createElement('div', { style: { flex: 1, minWidth: 0 } },
          React.createElement('div', { style: { fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', fontSize: '13px' } },
            entry.pickupTime && React.createElement('span', { style: { fontSize: '10px', color: 'var(--color-primary-light)', fontWeight: 600, padding: '1px 5px', borderRadius: '3px', background: 'rgba(26,115,232,0.12)' } }, entry.pickupTime),
            React.createElement('span', null, entry.pickup || '---'),
            React.createElement('span', { style: { color: 'var(--text-muted)', margin: '0 2px' } }, '→'),
            entry.dropoffTime && React.createElement('span', { style: { fontSize: '10px', color: 'var(--color-accent)', fontWeight: 600, padding: '1px 5px', borderRadius: '3px', background: 'rgba(0,200,83,0.12)' } }, entry.dropoffTime),
            React.createElement('span', null, entry.dropoff || '---')
          ),
          React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' } },
            React.createElement('span', null, eDate),
            React.createElement('span', { style: { color: dayColor, fontWeight: 600 } }, `(${info.dayOfWeek})`),
            info.holiday && React.createElement('span', { style: { color: '#ef4444', fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(239,68,68,0.1)' } }, info.holiday),
            entry.weather && React.createElement('span', null, entry.weather),
            entry.passengers && React.createElement('span', { style: { fontSize: '10px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)' } }, `${entry.passengers}名`),
            entry.source && React.createElement('span', { style: { fontSize: '10px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(255,152,0,0.15)', color: '#ffb74d', fontWeight: 600 } }, entry.source),
            entry.memo && React.createElement('span', { style: { color: 'var(--text-muted)' } }, `| ${entry.memo}`)
          )
        ),
        React.createElement('div', { style: { marginRight: '8px', whiteSpace: 'nowrap', textAlign: 'right' } },
          entry.noPassenger
            ? React.createElement('div', null,
                React.createElement('div', { style: { fontWeight: 700, color: '#d32f2f', fontSize: '15px' } }, '¥0（空車）'),
                entry.memo && entry.memo.includes('自動記録') && React.createElement('div', { style: { fontSize: '9px', color: '#ff9800', marginTop: '1px' } }, 'GPS自動検出')
              )
            : React.createElement('div', { style: { fontWeight: 700, color: 'var(--color-secondary)', fontSize: '15px' } }, `¥${entry.amount.toLocaleString()}`),
          !entry.noPassenger && React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, `税抜¥${Math.floor(entry.amount / 1.1).toLocaleString()} 税¥${(entry.amount - Math.floor(entry.amount / 1.1)).toLocaleString()}`)
        ),
        React.createElement('button', {
          onClick: () => startEdit(entry, 'revenue'),
          style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-light)', padding: '4px' },
          title: '編集',
        }, React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, 'edit')),
        React.createElement('button', {
          onClick: () => handleDelete(entry.id),
          style: { background: 'none', border: 'none', cursor: 'pointer', color: isConfirm ? 'var(--color-danger)' : 'var(--text-muted)', padding: '4px' },
          title: isConfirm ? 'もう一度押して削除' : '削除',
        }, React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, isConfirm ? 'delete_forever' : 'delete_outline'))
      )
    );
  };

  // 他社エントリ行
  const rivalRow = (entry) => {
    const isEditing = editingId === entry.id;
    const isConfirm = confirmDelete === entry.id;
    const info = entry.dayOfWeek ? { dayOfWeek: entry.dayOfWeek, holiday: entry.holiday, isSunday: entry.dayOfWeek === '日', isSaturday: entry.dayOfWeek === '土', isHoliday: !!entry.holiday } : JapaneseHolidays.getDateInfo(entry.date);
    const dayColor = info.isSunday || info.isHoliday ? '#ef4444' : info.isSaturday ? '#3b82f6' : 'var(--text-muted)';

    return React.createElement('div', { key: entry.id },
      isEditing && editPanel('rival'),
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', opacity: isEditing ? 0.5 : 1 },
      },
        React.createElement('div', { style: { flex: 1, minWidth: 0 } },
          React.createElement('div', { style: { fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' } },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: 'var(--color-primary-light)' } }, 'local_taxi'),
            React.createElement('span', null, entry.location || '---')
          ),
          React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' } },
            React.createElement('span', null, entry.date),
            React.createElement('span', { style: { color: dayColor, fontWeight: 600 } }, `(${info.dayOfWeek})`),
            info.holiday && React.createElement('span', { style: { color: '#ef4444', fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(239,68,68,0.1)' } }, info.holiday),
            entry.time && React.createElement('span', { style: { fontSize: '11px', color: 'var(--color-primary-light)', fontWeight: 600, padding: '1px 5px', borderRadius: '3px', background: 'rgba(26,115,232,0.12)' } }, entry.time),
            entry.weather && React.createElement('span', null, entry.weather),
            entry.memo && React.createElement('span', { style: { color: 'var(--text-muted)' } }, `| ${entry.memo}`)
          )
        ),
        React.createElement('button', {
          onClick: () => startEdit(entry, 'rival'),
          style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-light)', padding: '4px' },
          title: '編集',
        }, React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, 'edit')),
        React.createElement('button', {
          onClick: () => handleDelete(entry.id),
          style: { background: 'none', border: 'none', cursor: 'pointer', color: isConfirm ? 'var(--color-danger)' : 'var(--text-muted)', padding: '4px' },
          title: isConfirm ? 'もう一度押して削除' : '削除',
        }, React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, isConfirm ? 'delete_forever' : 'delete_outline'))
      )
    );
  };

  // 交通情報カテゴリラベル
  const transitLabels = { trouble: '遅延・運休情報', train: '電車情報', bus: 'バス情報', flight: 'フライト情報' };
  const transitIcons = { trouble: 'warning', train: 'train', bus: 'directions_bus', flight: 'flight' };

  return React.createElement('div', null,
    // タブバー
    React.createElement('div', { style: { display: 'flex', gap: '4px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' } },
      tabs.map(t => React.createElement('button', {
        key: t.id,
        onClick: () => { setTab(t.id); setEditingId(null); setErrors([]); setSearch(''); },
        style: {
          display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 14px',
          borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
          background: tab === t.id ? 'var(--color-primary)' : 'var(--bg-tertiary)',
          color: tab === t.id ? '#fff' : 'var(--text-secondary)',
          whiteSpace: 'nowrap', transition: 'all 0.2s',
        },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, t.icon),
        t.label
      ))
    ),

    // 検索バー（売上・空車・他社タブ）
    (tab === 'revenue' || tab === 'vacant' || tab === 'standby' || tab === 'rival') && React.createElement('div', { style: { marginBottom: '12px' } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '8px 12px' } },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: 'var(--text-muted)' } }, 'search'),
        React.createElement('input', {
          type: 'text', value: search, placeholder: '検索...',
          onChange: e => setSearch(e.target.value),
          style: { flex: 1, border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' },
        }),
        search && React.createElement('button', {
          onClick: () => setSearch(''),
          style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' },
        }, React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'close'))
      )
    ),

    // 保存成功バナー
    saved && React.createElement('div', {
      style: { background: 'rgba(0,200,83,0.15)', border: '1px solid rgba(0,200,83,0.3)', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--color-accent)' },
    },
      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, 'check_circle'),
      '保存しました'
    ),

    // === 売上記録タブ ===
    tab === 'revenue' && React.createElement(React.Fragment, null,
      // 手動追加ボタン / フォーム
      !showAddForm
        ? React.createElement('div', { style: { marginBottom: '12px', display: 'flex', gap: '8px' } },
            React.createElement(Button, {
              icon: 'add', onClick: () => setShowAddForm(true),
              style: { flex: 1, padding: '10px', fontSize: '13px', fontWeight: 600 },
            }, '手動で売上を追加')
          )
        : React.createElement('div', {
            style: { background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.3)', borderRadius: '10px', padding: '14px', marginBottom: '12px' },
          },
            React.createElement('div', { style: { fontWeight: 600, fontSize: '13px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' } },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: 'var(--color-accent)' } }, 'add_circle'),
              '売上を手動入力'
            ),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' } },
              React.createElement('div', { style: { gridColumn: '1 / -1' } },
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '金額 *'),
                React.createElement('input', { type: 'number', value: addForm.amount, placeholder: '例: 3500', onChange: e => setAddForm(f => ({ ...f, amount: e.target.value })), style: { width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '15px', fontWeight: 700, boxSizing: 'border-box' } })
              ),
              React.createElement('div', null,
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '日付'),
                React.createElement('input', { type: 'date', value: addForm.date, onChange: e => setAddForm(f => ({ ...f, date: e.target.value })), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' } })
              ),
              React.createElement('div', null,
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '天候'),
                React.createElement('select', { value: addForm.weather, onChange: e => setAddForm(f => ({ ...f, weather: e.target.value })), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' } },
                  ['', '晴れ', '曇り', '雨', '雪'].map(o => React.createElement('option', { key: o, value: o }, o || '未設定'))
                )
              ),
              React.createElement('div', { style: { gridColumn: '1 / -1' } },
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '乗車地'),
                React.createElement('div', { style: { display: 'flex', gap: '4px' } },
                  React.createElement('input', { type: 'text', value: addForm.pickup, placeholder: '地図をクリックまたは手入力', onChange: e => setAddForm(f => ({ ...f, pickup: e.target.value })), style: { flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' } }),
                  React.createElement('button', {
                    onClick: () => setMapPickerField(mapPickerField === 'pickup' ? null : 'pickup'),
                    style: { padding: '6px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', background: mapPickerField === 'pickup' ? 'var(--color-primary)' : 'var(--bg-tertiary)', color: mapPickerField === 'pickup' ? '#fff' : 'var(--text-secondary)', whiteSpace: 'nowrap' },
                  }, React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'map'), '地図')
                ),
                addCoords.pickupCoords && React.createElement('div', { style: { fontSize: '10px', color: 'var(--color-accent)', marginTop: '2px' } }, `${addCoords.pickupCoords.lat.toFixed(5)}, ${addCoords.pickupCoords.lng.toFixed(5)}`)
              ),
              // 乗車地マップピッカー
              mapPickerField === 'pickup' && React.createElement('div', { style: { gridColumn: '1 / -1' } },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontSize: '11px', color: 'var(--color-primary-light)' } },
                  React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'touch_app'),
                  '地図をタップして乗車地を選択'
                ),
                (window.google && window.google.maps)
                  ? React.createElement('div', { ref: mapPickerRef, style: { width: '100%', height: '660px', borderRadius: '8px', border: '2px solid var(--color-primary)', overflow: 'hidden' } })
                  : React.createElement('div', { style: { padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' } }, 'Google Maps APIキーを設定してください')
              ),
              React.createElement('div', null,
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '乗車時刻'),
                React.createElement('input', { type: 'time', value: addForm.pickupTime, onChange: e => setAddForm(f => ({ ...f, pickupTime: e.target.value })), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' } })
              ),
              React.createElement('div', { style: { gridColumn: '1 / -1' } },
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '降車地'),
                React.createElement('div', { style: { display: 'flex', gap: '4px' } },
                  React.createElement('input', { type: 'text', value: addForm.dropoff, placeholder: '地図をクリックまたは手入力', onChange: e => setAddForm(f => ({ ...f, dropoff: e.target.value })), style: { flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' } }),
                  React.createElement('button', {
                    onClick: () => setMapPickerField(mapPickerField === 'dropoff' ? null : 'dropoff'),
                    style: { padding: '6px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', background: mapPickerField === 'dropoff' ? 'var(--color-secondary)' : 'var(--bg-tertiary)', color: mapPickerField === 'dropoff' ? '#fff' : 'var(--text-secondary)', whiteSpace: 'nowrap' },
                  }, React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'map'), '地図')
                ),
                addCoords.dropoffCoords && React.createElement('div', { style: { fontSize: '10px', color: 'var(--color-accent)', marginTop: '2px' } }, `${addCoords.dropoffCoords.lat.toFixed(5)}, ${addCoords.dropoffCoords.lng.toFixed(5)}`)
              ),
              // 降車地マップピッカー
              mapPickerField === 'dropoff' && React.createElement('div', { style: { gridColumn: '1 / -1' } },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontSize: '11px', color: 'var(--color-secondary)' } },
                  React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'touch_app'),
                  '地図をタップして降車地を選択'
                ),
                (window.google && window.google.maps)
                  ? React.createElement('div', { ref: mapPickerRef, style: { width: '100%', height: '660px', borderRadius: '8px', border: '2px solid var(--color-secondary)', overflow: 'hidden' } })
                  : React.createElement('div', { style: { padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' } }, 'Google Maps APIキーを設定してください')
              ),
              React.createElement('div', null,
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '降車時刻'),
                React.createElement('input', { type: 'time', value: addForm.dropoffTime, onChange: e => setAddForm(f => ({ ...f, dropoffTime: e.target.value })), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' } })
              ),
              React.createElement('div', null,
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '人数'),
                React.createElement('input', { type: 'number', value: addForm.passengers, min: 1, max: 9, onChange: e => setAddForm(f => ({ ...f, passengers: e.target.value })), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' } })
              ),
              React.createElement('div', null,
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '性別'),
                React.createElement('select', { value: addForm.gender, onChange: e => setAddForm(f => ({ ...f, gender: e.target.value })), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' } },
                  ['', '男性', '女性', 'その他'].map(o => React.createElement('option', { key: o, value: o }, o || '未設定'))
                )
              ),
              React.createElement('div', null,
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '配車方法'),
                React.createElement('select', { value: addForm.source, onChange: e => setAddForm(f => ({ ...f, source: e.target.value })), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' } },
                  ['', 'Go', 'Uber', 'DIDI', '電話', '流し', '待機'].map(o => React.createElement('option', { key: o, value: o }, o || '未設定'))
                )
              ),
              React.createElement('div', { style: { gridColumn: '1 / -1' } },
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' } }, '用途'),
                React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                  ...[
                    { value: '通勤', icon: '🏢' },
                    { value: '通院', icon: '🏥' },
                    { value: '買物', icon: '🛒' },
                    { value: '観光', icon: '📸' },
                    { value: '出張', icon: '💼' },
                    { value: '送迎', icon: '🚗' },
                    { value: '空港', icon: '✈️' },
                    { value: '飲食', icon: '🍺' },
                    { value: 'パチンコ', icon: '🎰' },
                    { value: '駅移動', icon: '🚉' },
                  ].map(p =>
                    React.createElement('button', {
                      key: p.value,
                      type: 'button',
                      onClick: () => setAddForm(f => ({ ...f, purpose: f.purpose === p.value ? '' : p.value })),
                      style: {
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '6px 10px', borderRadius: '8px',
                        fontSize: '12px', fontWeight: addForm.purpose === p.value ? '700' : '400',
                        cursor: 'pointer',
                        border: addForm.purpose === p.value ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.15)',
                        background: addForm.purpose === p.value ? 'rgba(26,115,232,0.25)' : 'rgba(255,255,255,0.05)',
                        color: addForm.purpose === p.value ? 'var(--color-primary-light)' : 'var(--text-secondary)',
                        transition: 'all 0.15s ease',
                      },
                    },
                      React.createElement('span', { style: { fontSize: '14px' } }, p.icon),
                      p.value
                    )
                  )
                )
              ),
              React.createElement('div', { style: { gridColumn: '1 / -1' } },
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, 'メモ'),
                React.createElement('input', { type: 'text', value: addForm.memo, placeholder: '自由入力', onChange: e => setAddForm(f => ({ ...f, memo: e.target.value })), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' } })
              ),
              // 割引（複数選択可）
              React.createElement('div', { style: { gridColumn: '1 / -1' } },
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' } }, '割引（複数選択可）'),
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                  ...[
                    { value: 'disability', label: '障害者割引', icon: 'accessible' },
                    { value: 'coupon', label: 'クーポン', icon: 'local_offer' },
                    { value: 'ticket', label: 'タクシーチケット', icon: 'confirmation_number' },
                  ].map(d => {
                    const selected = d.value in (addForm.discounts || {});
                    return React.createElement('div', { key: d.value, style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: d.value === 'coupon' ? 'wrap' : 'nowrap' } },
                      React.createElement('button', {
                        type: 'button',
                        onClick: () => setAddForm(f => {
                          const disc = { ...(f.discounts || {}) };
                          if (selected) {
                            delete disc[d.value]; if (d.value === 'coupon') { delete disc._couponUnitPrice; delete disc._couponSheets; }
                            return { ...f, discounts: disc };
                          } else {
                            if (d.value === 'ticket') {
                              disc[d.value] = f.amount || '';
                              return { ...f, discounts: disc, paymentMethod: 'uncollected' };
                            } else {
                              disc[d.value] = ''; if (d.value === 'coupon') { disc._couponUnitPrice = ''; disc._couponSheets = '1'; }
                              return { ...f, discounts: disc };
                            }
                          }
                        }),
                        style: {
                          flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '4px',
                          padding: '6px 10px', borderRadius: '8px',
                          fontSize: '12px', fontWeight: selected ? '700' : '400',
                          cursor: 'pointer', minWidth: '110px',
                          border: selected ? '2px solid #a78bfa' : '1px solid rgba(255,255,255,0.15)',
                          background: selected ? 'rgba(167,139,250,0.25)' : 'rgba(255,255,255,0.05)',
                          color: selected ? '#c4b5fd' : 'var(--text-secondary)',
                          transition: 'all 0.15s ease',
                        },
                      },
                        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, d.icon),
                        d.label
                      ),
                      // クーポン: 単価 × 枚数
                      d.value === 'coupon' && selected && React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flex: 1, minWidth: '200px' } },
                        React.createElement('input', {
                          type: 'number', min: '0', max: '100000', placeholder: '1枚の金額',
                          value: (addForm.discounts || {})._couponUnitPrice || '',
                          onChange: e => setAddForm(f => {
                            const unitPrice = e.target.value;
                            const sheets = (f.discounts || {})._couponSheets || '1';
                            const total = (parseInt(unitPrice) || 0) * (parseInt(sheets) || 0);
                            return { ...f, discounts: { ...(f.discounts || {}), _couponUnitPrice: unitPrice, _couponSheets: sheets, coupon: String(total || '') } };
                          }),
                          style: { flex: 1, minWidth: '60px', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(167,139,250,0.3)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' },
                        }),
                        React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, '円 ×'),
                        React.createElement('input', {
                          type: 'number', min: '1', max: '100', placeholder: '枚数',
                          value: (addForm.discounts || {})._couponSheets || '',
                          onChange: e => setAddForm(f => {
                            const sheets = e.target.value;
                            const unitPrice = (f.discounts || {})._couponUnitPrice || '';
                            const total = (parseInt(unitPrice) || 0) * (parseInt(sheets) || 0);
                            return { ...f, discounts: { ...(f.discounts || {}), _couponSheets: sheets, _couponUnitPrice: unitPrice, coupon: String(total || '') } };
                          }),
                          style: { width: '45px', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(167,139,250,0.3)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' },
                        }),
                        React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, '枚'),
                        (parseInt((addForm.discounts || {}).coupon) || 0) > 0 && React.createElement('span', { style: { fontSize: '11px', color: '#a78bfa', fontWeight: 700, whiteSpace: 'nowrap' } },
                          `= ¥${parseInt((addForm.discounts || {}).coupon).toLocaleString()}`
                        )
                      ),
                      // その他: 金額入力
                      d.value !== 'coupon' && selected && React.createElement('input', {
                        type: 'number', value: (addForm.discounts || {})[d.value] || '', placeholder: `${d.label}金額`,
                        onChange: e => setAddForm(f => ({ ...f, discounts: { ...(f.discounts || {}), [d.value]: e.target.value } })),
                        style: { flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(167,139,250,0.3)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' },
                      }),
                      d.value !== 'coupon' && selected && React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, '円')
                    );
                  })
                ),
                (() => {
                  const d = addForm.discounts || {};
                  const totalDiscount = Object.entries(d).filter(([k]) => !k.startsWith('_')).reduce((s, [, v]) => s + (parseInt(v) || 0), 0);
                  const amt = parseInt(addForm.amount) || 0;
                  if (totalDiscount > 0 && amt > 0) {
                    return React.createElement('div', { style: { fontSize: '11px', color: '#a78bfa', marginTop: '4px' } },
                      `割引合計: -¥${totalDiscount.toLocaleString()} / 割引後: ¥${(amt - totalDiscount).toLocaleString()} (割引率: ${Math.round(totalDiscount / amt * 100)}%)`
                    );
                  }
                  return null;
                })()
              )
            ),
            addErrors.length > 0 && React.createElement('div', { style: { color: 'var(--color-danger)', fontSize: '12px', marginTop: '8px' } }, addErrors.join(', ')),
            React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' } },
              React.createElement(Button, { variant: 'ghost', onClick: () => { setShowAddForm(false); setAddErrors([]); } }, 'キャンセル'),
              React.createElement(Button, { icon: 'save', onClick: handleManualAdd }, '記録を追加')
            )
          ),

      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
        React.createElement('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } },
          `${filteredRevenue.length}件${search ? ` (全${revenueEntries.length}件中)` : ''}`
        ),
        React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
          React.createElement(Button, {
            icon: 'my_location',
            disabled: regeocoding,
            onClick: handleRegeocode,
            style: { padding: '5px 10px', fontSize: '11px', color: regeocoding ? 'var(--text-muted)' : 'var(--color-primary)', borderColor: 'var(--color-primary)' },
          }, regeocoding ? regeoProgress : '住所再取得'),
          revenueEntries.length > 0 && React.createElement(Button, {
            variant: 'danger', icon: 'delete_forever',
            onClick: () => { if (confirm('全ての売上記録を削除しますか？この操作は取り消せません。')) { DataService.clearAllEntries(); setRefreshKey(k => k + 1); } },
            style: { padding: '5px 10px', fontSize: '11px' },
          }, '全削除')
        )
      ),
      filteredRevenue.length === 0
        ? React.createElement('div', { style: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' } },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '48px', opacity: 0.3, display: 'block', marginBottom: '8px' } }, 'receipt_long'),
            search ? '該当する記録がありません' : '売上記録がありません'
          )
        : React.createElement(Card, null, filteredRevenue.map(e => revenueRow(e)))
    ),

    // === 空車記録タブ ===
    tab === 'vacant' && React.createElement(React.Fragment, null,
      // 空車記録追加ボタン / フォーム
      !showVacantAddForm
        ? React.createElement('div', { style: { marginBottom: '12px' } },
            React.createElement('button', {
              onClick: () => setShowVacantAddForm(true),
              style: { display: 'flex', alignItems: 'center', gap: '6px', width: '100%', padding: '10px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700, background: '#d32f2f', color: '#fff', justifyContent: 'center' },
            },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, 'person_off'),
              '空車記録を追加'
            )
          )
        : React.createElement('div', {
            style: { background: 'rgba(211,47,47,0.08)', border: '1px solid rgba(211,47,47,0.3)', borderRadius: '10px', padding: '14px', marginBottom: '12px' },
          },
            React.createElement('div', { style: { fontWeight: 600, fontSize: '13px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' } },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: '#d32f2f' } }, 'person_off'),
              '空車記録を入力'
            ),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' } },
              React.createElement('div', null,
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '日付'),
                React.createElement('input', { type: 'date', value: vacantAddForm.date, onChange: e => setVacantAddForm(f => ({ ...f, date: e.target.value })), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' } })
              ),
              React.createElement('div', null,
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '天候'),
                React.createElement('select', { value: vacantAddForm.weather, onChange: e => setVacantAddForm(f => ({ ...f, weather: e.target.value })), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' } },
                  ['', '晴れ', '曇り', '雨', '雪'].map(o => React.createElement('option', { key: o, value: o }, o || '未設定'))
                )
              ),
              React.createElement('div', { style: { gridColumn: '1 / -1' } },
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '場所 *'),
                React.createElement('input', { type: 'text', value: vacantAddForm.pickup, placeholder: '待機場所を入力', onChange: e => setVacantAddForm(f => ({ ...f, pickup: e.target.value })), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' } })
              ),
              React.createElement('div', null,
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '時刻'),
                React.createElement('input', { type: 'time', value: vacantAddForm.pickupTime, onChange: e => setVacantAddForm(f => ({ ...f, pickupTime: e.target.value })), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' } })
              ),
              React.createElement('div', { style: { gridColumn: '1 / -1' } },
                React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, 'メモ'),
                React.createElement('input', { type: 'text', value: vacantAddForm.memo, placeholder: '自由入力', onChange: e => setVacantAddForm(f => ({ ...f, memo: e.target.value })), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' } })
              )
            ),
            vacantAddErrors.length > 0 && React.createElement('div', { style: { color: 'var(--color-danger)', fontSize: '12px', marginTop: '8px' } }, vacantAddErrors.join(', ')),
            React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' } },
              React.createElement(Button, { variant: 'ghost', onClick: () => { setShowVacantAddForm(false); setVacantAddErrors([]); } }, 'キャンセル'),
              React.createElement(Button, { icon: 'save', onClick: handleVacantAdd, style: { background: '#d32f2f', borderColor: '#d32f2f' } }, '記録を追加')
            )
          ),

      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
        React.createElement('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } },
          `${filteredVacant.length}件${search ? ` (全${vacantEntries.length}件中)` : ''}`
        )
      ),
      filteredVacant.length === 0
        ? React.createElement('div', { style: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' } },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '48px', opacity: 0.3, display: 'block', marginBottom: '8px' } }, 'person_off'),
            search ? '該当する記録がありません' : '空車記録がありません'
          )
        : React.createElement(Card, null, filteredVacant.map(e => {
            const isEditing = editingId === e.id;
            const isConfirm = confirmDelete === e.id;
            const eDate = e.date || getLocalDateString(new Date(e.timestamp));
            const info = e.dayOfWeek ? { dayOfWeek: e.dayOfWeek, holiday: e.holiday, isSunday: e.dayOfWeek === '日', isSaturday: e.dayOfWeek === '土', isHoliday: !!e.holiday } : JapaneseHolidays.getDateInfo(eDate);
            const dayColor = info.isSunday || info.isHoliday ? '#ef4444' : info.isSaturday ? '#3b82f6' : 'var(--text-muted)';
            return React.createElement('div', { key: e.id },
              // 編集パネル
              isEditing && React.createElement('div', {
                style: { background: 'rgba(211,47,47,0.08)', border: '1px solid rgba(211,47,47,0.3)', borderRadius: '10px', padding: '14px', marginBottom: '12px' },
              },
                React.createElement('div', { style: { fontWeight: 600, fontSize: '13px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' } },
                  React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px', color: '#d32f2f' } }, 'edit'),
                  '空車記録を編集'
                ),
                field('日付', 'date', 'date'),
                field('天候', 'weather', 'select', ['', '晴れ', '曇り', '雨', '雪']),
                field('場所', 'pickup', 'text'),
                field('時刻', 'pickupTime', 'time'),
                field('メモ', 'memo', 'text'),
                errors.length > 0 && React.createElement('div', { style: { color: 'var(--color-danger)', fontSize: '12px', marginTop: '6px' } },
                  errors.join(', ')
                ),
                React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' } },
                  React.createElement(Button, { variant: 'ghost', onClick: () => { setEditingId(null); setErrors([]); } }, 'キャンセル'),
                  React.createElement(Button, { icon: 'save', onClick: saveEdit }, '保存')
                )
              ),
              React.createElement('div', {
                style: { display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', opacity: isEditing ? 0.5 : 1 },
              },
                React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                  React.createElement('div', { style: { fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', fontSize: '13px' } },
                    e.pickupTime && React.createElement('span', { style: { fontSize: '10px', color: 'var(--color-primary-light)', fontWeight: 600, padding: '1px 5px', borderRadius: '3px', background: 'rgba(26,115,232,0.12)' } }, e.pickupTime),
                    React.createElement('span', null, e.pickup || '---'),
                    e.dropoff && React.createElement('span', { style: { color: 'var(--text-muted)', margin: '0 2px' } }, '→'),
                    e.dropoff && React.createElement('span', null, e.dropoff)
                  ),
                  React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' } },
                    React.createElement('span', null, eDate),
                    React.createElement('span', { style: { color: dayColor, fontWeight: 600 } }, `(${info.dayOfWeek})`),
                    info.holiday && React.createElement('span', { style: { color: '#ef4444', fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(239,68,68,0.1)' } }, info.holiday),
                    e.weather && React.createElement('span', null, e.weather),
                    e.memo && React.createElement('span', { style: { color: 'var(--text-muted)' } }, `| ${e.memo}`)
                  )
                ),
                React.createElement('div', { style: { marginRight: '8px', whiteSpace: 'nowrap', textAlign: 'right' } },
                  React.createElement('div', { style: { fontWeight: 700, color: '#d32f2f', fontSize: '15px' } }, '空車'),
                  e.memo && e.memo.includes('自動記録') && React.createElement('div', { style: { fontSize: '9px', color: '#ff9800', marginTop: '1px' } }, 'GPS自動検出')
                ),
                React.createElement('button', {
                  onClick: () => startEdit(e, 'vacant'),
                  style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-light)', padding: '4px' },
                  title: '編集',
                }, React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, 'edit')),
                React.createElement('button', {
                  onClick: () => handleDelete(e.id),
                  style: { background: 'none', border: 'none', cursor: 'pointer', color: isConfirm ? 'var(--color-danger)' : 'var(--text-muted)', padding: '4px' },
                  title: isConfirm ? 'もう一度押して削除' : '削除',
                }, React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, isConfirm ? 'delete_forever' : 'delete_outline'))
              )
            );
          }))
    ),

    // === 待機記録タブ ===
    tab === 'standby' && React.createElement(React.Fragment, null,
      // ヘッダー（件数 + 追加ボタン）
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
        React.createElement('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } },
          `${filteredStandby.length}件${search ? ` (全${standbyEntries.length}件中)` : ''}`
        ),
        !showStandbyAddForm
          ? React.createElement('button', {
              onClick: () => { setShowStandbyAddForm(true); setEditingId(null); setEditForm({}); },
              style: { display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(255,167,38,0.3)', background: 'rgba(255,167,38,0.1)', color: '#ffa726', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
            },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'add'),
              '待機記録を追加'
            )
          : React.createElement('button', {
              onClick: () => { setShowStandbyAddForm(false); setStandbyAddErrors([]); },
              style: { padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' },
            }, '閉じる')
      ),
      // 追加フォーム
      showStandbyAddForm && React.createElement('div', {
        style: { padding: '12px', borderRadius: '8px', marginBottom: '12px', background: 'rgba(255,167,38,0.05)', border: '1px solid rgba(255,167,38,0.25)' },
      },
        // 待機場所
        React.createElement('div', { style: { marginBottom: '8px' } },
          React.createElement('label', { style: { fontSize: '11px', color: '#ffa726', display: 'block', marginBottom: '2px' } }, '待機場所 *'),
          React.createElement('input', {
            type: 'text', value: standbyAddForm.location,
            onChange: (e) => setStandbyAddForm(f => ({ ...f, location: e.target.value })),
            style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,167,38,0.3)', background: 'rgba(255,167,38,0.06)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' },
            placeholder: '例: 旭川駅',
          })
        ),
        // 待機時間（開始〜終了）
        React.createElement('div', { style: { marginBottom: '8px' } },
          React.createElement('label', { style: { fontSize: '11px', color: '#ffa726', display: 'block', marginBottom: '2px' } }, '待機時間 *'),
          React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
            React.createElement('input', {
              type: 'time', value: standbyAddForm.startTime,
              onChange: (e) => setStandbyAddForm(f => ({ ...f, startTime: e.target.value })),
              style: { flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,167,38,0.3)', background: 'rgba(255,167,38,0.06)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box', colorScheme: 'dark' },
            }),
            React.createElement('span', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, '〜'),
            React.createElement('input', {
              type: 'time', value: standbyAddForm.endTime,
              onChange: (e) => setStandbyAddForm(f => ({ ...f, endTime: e.target.value })),
              style: { flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,167,38,0.3)', background: 'rgba(255,167,38,0.06)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box', colorScheme: 'dark' },
            })
          )
        ),
        // 日付・天候
        React.createElement('div', { style: { display: 'flex', gap: '8px', marginBottom: '8px' } },
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '日付'),
            React.createElement('input', { type: 'date', value: standbyAddForm.date, onChange: (e) => setStandbyAddForm(f => ({ ...f, date: e.target.value })), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box', colorScheme: 'dark' } })
          ),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '天候'),
            React.createElement('select', { value: standbyAddForm.weather, onChange: (e) => setStandbyAddForm(f => ({ ...f, weather: e.target.value })), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' } },
              React.createElement('option', { value: '' }, '--'),
              ...['晴れ', '曇り', '雨', '雪'].map(w => React.createElement('option', { key: w, value: w }, w))
            )
          )
        ),
        // メモ
        React.createElement('div', { style: { marginBottom: '8px' } },
          React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, 'メモ'),
          React.createElement('input', { type: 'text', value: standbyAddForm.memo, onChange: (e) => setStandbyAddForm(f => ({ ...f, memo: e.target.value })), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }, placeholder: '自由入力' })
        ),
        standbyAddErrors.length > 0 && React.createElement('div', { style: { color: 'var(--color-danger)', fontSize: '12px', marginTop: '8px' } }, standbyAddErrors.join(', ')),
        React.createElement('button', {
          onClick: handleStandbyAdd,
          style: { width: '100%', marginTop: '8px', padding: '8px', borderRadius: '6px', border: 'none', background: 'rgba(255,167,38,0.2)', color: '#ffa726', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
        }, '追加')
      ),
      // リスト表示
      filteredStandby.length === 0 && !showStandbyAddForm
        ? React.createElement('div', { style: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '13px' } },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '40px', display: 'block', marginBottom: '8px', opacity: 0.4 } }, 'hourglass_empty'),
            '待機記録がありません'
          )
        : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          ...filteredStandby.map(e => {
            const isConfirm = confirmDelete === e.id;
            const si = e.standbyInfo || {};
            const locationName = si.locationName || e.pickup || '';
            const sTime = si.startTime || e.pickupTime || '';
            const eTime = si.endTime || e.dropoffTime || '';
            const isEditing = editingId === e.id;
            return React.createElement(React.Fragment, { key: e.id },
              // レコード行
              React.createElement('div', {
                style: {
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '10px 12px', borderRadius: '8px',
                  background: isEditing ? 'rgba(255,167,38,0.08)' : 'var(--bg-card)',
                  border: isEditing ? '1px solid rgba(255,167,38,0.3)' : '1px solid rgba(255,255,255,0.06)',
                  fontSize: '13px',
                },
              },
                // 時刻バッジ
                React.createElement('div', {
                  style: {
                    minWidth: '90px', textAlign: 'center', padding: '4px 8px',
                    borderRadius: '6px', background: 'rgba(255,167,38,0.12)',
                    fontSize: '12px', fontWeight: 600, color: '#ffa726',
                    fontVariantNumeric: 'tabular-nums',
                  },
                }, sTime && eTime ? sTime + '〜' + eTime : (sTime || '--:--')),
                // 場所・日付
                React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                  React.createElement('div', { style: { fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                    locationName || '不明'
                  ),
                  React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' } },
                    React.createElement('span', null, e.date || ''),
                    e.weather && React.createElement('span', null, e.weather),
                    e.memo && React.createElement('span', { style: { color: 'var(--text-secondary)' } }, e.memo)
                  )
                ),
                // ラベル
                React.createElement('div', { style: { marginRight: '4px', whiteSpace: 'nowrap', textAlign: 'right' } },
                  React.createElement('div', { style: { fontWeight: 700, color: '#ffa726', fontSize: '12px' } }, '待機'),
                  e.memo && e.memo.includes('自動記録') && React.createElement('div', { style: { fontSize: '9px', color: '#ff9800', marginTop: '1px' } }, 'GPS自動')
                ),
                // 編集ボタン
                React.createElement('button', {
                  onClick: () => {
                    if (isEditing) { setEditingId(null); setEditForm({}); setErrors([]); return; }
                    setEditingId(e.id);
                    setEditForm({
                      date: e.date || '', weather: e.weather || '', pickup: e.pickup || '',
                      pickupTime: e.pickupTime || '', dropoffTime: e.dropoffTime || '',
                      memo: e.memo || '',
                      standbyLocation: si.locationName || e.pickup || '',
                      standbyStartTime: si.startTime || e.pickupTime || '',
                      standbyEndTime: si.endTime || e.dropoffTime || '',
                    });
                    setErrors([]);
                    setShowStandbyAddForm(false);
                  },
                  style: { background: 'none', border: 'none', cursor: 'pointer', color: isEditing ? '#ffa726' : 'var(--color-primary-light)', padding: '4px' },
                  title: isEditing ? '閉じる' : '編集',
                }, React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, isEditing ? 'close' : 'edit')),
                // 削除ボタン
                React.createElement('button', {
                  onClick: () => handleDelete(e.id),
                  style: { background: 'none', border: 'none', cursor: 'pointer', color: isConfirm ? 'var(--color-danger)' : 'var(--text-muted)', padding: '4px' },
                  title: isConfirm ? 'もう一度押して削除' : '削除',
                }, React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, isConfirm ? 'delete_forever' : 'delete_outline'))
              ),
              // 編集フォーム（該当レコード直下）
              isEditing && React.createElement('div', {
                style: {
                  padding: '12px', borderRadius: '0 0 8px 8px', marginTop: '-4px',
                  background: 'rgba(255,167,38,0.05)',
                  border: '1px solid rgba(255,167,38,0.25)', borderTop: 'none',
                },
              },
                errors.length > 0 && React.createElement('div', { style: { color: 'var(--color-danger)', fontSize: '12px', marginBottom: '8px' } }, errors.join(', ')),
                // 待機場所
                React.createElement('div', { style: { marginBottom: '8px' } },
                  React.createElement('label', { style: { fontSize: '11px', color: '#ffa726', display: 'block', marginBottom: '2px' } }, '待機場所'),
                  React.createElement('input', {
                    type: 'text', value: editForm.standbyLocation || '',
                    onChange: (ev) => setEditForm({ ...editForm, standbyLocation: ev.target.value, pickup: ev.target.value, dropoff: ev.target.value }),
                    style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,167,38,0.3)', background: 'rgba(255,167,38,0.06)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' },
                    placeholder: '例: 旭川駅',
                  })
                ),
                // 待機時間（開始〜終了）
                React.createElement('div', { style: { marginBottom: '8px' } },
                  React.createElement('label', { style: { fontSize: '11px', color: '#ffa726', display: 'block', marginBottom: '2px' } }, '待機時間'),
                  React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
                    React.createElement('input', {
                      type: 'time', value: editForm.standbyStartTime || '',
                      onChange: (ev) => setEditForm({ ...editForm, standbyStartTime: ev.target.value, pickupTime: ev.target.value }),
                      style: { flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,167,38,0.3)', background: 'rgba(255,167,38,0.06)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box', colorScheme: 'dark' },
                    }),
                    React.createElement('span', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, '〜'),
                    React.createElement('input', {
                      type: 'time', value: editForm.standbyEndTime || '',
                      onChange: (ev) => setEditForm({ ...editForm, standbyEndTime: ev.target.value, dropoffTime: ev.target.value }),
                      style: { flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,167,38,0.3)', background: 'rgba(255,167,38,0.06)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box', colorScheme: 'dark' },
                    })
                  )
                ),
                // 日付・天候
                React.createElement('div', { style: { display: 'flex', gap: '8px', marginBottom: '8px' } },
                  React.createElement('div', { style: { flex: 1 } },
                    React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '日付'),
                    React.createElement('input', { type: 'date', value: editForm.date || '', onChange: (ev) => setEditForm({ ...editForm, date: ev.target.value }), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box', colorScheme: 'dark' } })
                  ),
                  React.createElement('div', { style: { flex: 1 } },
                    React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, '天候'),
                    React.createElement('select', { value: editForm.weather || '', onChange: (ev) => setEditForm({ ...editForm, weather: ev.target.value }), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' } },
                      React.createElement('option', { value: '' }, '--'),
                      ...['晴れ', '曇り', '雨', '雪'].map(w => React.createElement('option', { key: w, value: w }, w))
                    )
                  )
                ),
                // メモ
                React.createElement('div', { style: { marginBottom: '8px' } },
                  React.createElement('label', { style: { fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' } }, 'メモ'),
                  React.createElement('input', { type: 'text', value: editForm.memo || '', onChange: (ev) => setEditForm({ ...editForm, memo: ev.target.value }), style: { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }, placeholder: 'メモ' })
                ),
                // 保存・キャンセル
                React.createElement('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
                  React.createElement('button', {
                    onClick: () => { setEditingId(null); setEditForm({}); setErrors([]); },
                    style: { padding: '6px 16px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' },
                  }, 'キャンセル'),
                  React.createElement('button', {
                    onClick: () => {
                      const updates = {
                        ...editForm,
                        noPassenger: true, amount: 0, purpose: '待機',
                        standbyInfo: {
                          locationName: editForm.standbyLocation || '',
                          startTime: editForm.standbyStartTime || '',
                          endTime: editForm.standbyEndTime || '',
                        },
                      };
                      const result = DataService.updateEntry(editingId, updates);
                      if (!result || !result.success) { setErrors((result && result.errors) || ['保存に失敗しました']); return; }
                      // 待機記録→売上記録の双方向同期
                      if (result.entry && updates.standbyInfo && updates.standbyInfo.locationName) {
                        const sEntry = result.entry;
                        const origSi = sEntry.standbyInfo || {};
                        const revEntries = DataService.getEntries();
                        // 配車方法が「待機」またはstandbyInfoが一致する売上記録を検索
                        const matchingRev = revEntries.find(r => {
                          if (r.noPassenger) return false; // 空車/待機記録は除外
                          if (r.date !== sEntry.date) return false;
                          // 配車方法が「待機」でstandbyInfoが一致
                          if (r.source === '待機') {
                            const rsi = r.standbyInfo || {};
                            if (rsi.startTime && origSi.startTime && rsi.startTime === origSi.startTime) return true;
                            if (rsi.startTime && updates.standbyInfo.startTime && rsi.startTime === updates.standbyInfo.startTime) return true;
                            // 時刻が近い（5分以内）
                            if (rsi.startTime && origSi.startTime) {
                              const rMin = parseInt(rsi.startTime.replace(':',''));
                              const sMin = parseInt(origSi.startTime.replace(':',''));
                              if (!isNaN(rMin) && !isNaN(sMin) && Math.abs(rMin - sMin) <= 5) return true;
                            }
                          }
                          // standbyInfoのstartTimeが一致
                          const rsi = r.standbyInfo || {};
                          if (rsi.locationName && rsi.startTime && origSi.startTime && rsi.startTime === origSi.startTime) return true;
                          return false;
                        });
                        if (matchingRev) {
                          DataService.updateEntry(matchingRev.id, { standbyInfo: updates.standbyInfo });
                        }
                      }
                      setEditingId(null); setEditForm({}); setSaved(true); setTimeout(() => setSaved(false), 2000); setRefreshKey(k => k + 1);
                    },
                    style: { padding: '6px 16px', borderRadius: '6px', border: 'none', background: 'rgba(255,167,38,0.2)', color: '#ffa726', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
                  }, '保存')
                )
              )
            );
          })
        )
    ),

    // === 他社記録タブ ===
    tab === 'rival' && React.createElement(React.Fragment, null,
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
        React.createElement('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } },
          `${filteredRival.length}件${search ? ` (全${rivalEntries.length}件中)` : ''}`
        ),
        rivalEntries.length > 0 && React.createElement(Button, {
          variant: 'danger', icon: 'delete_forever',
          onClick: () => { if (confirm('全ての他社乗車記録を削除しますか？この操作は取り消せません。')) { DataService.clearAllRivalEntries(); setRefreshKey(k => k + 1); } },
          style: { padding: '5px 10px', fontSize: '11px' },
        }, '全削除')
      ),
      filteredRival.length === 0
        ? React.createElement('div', { style: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' } },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '48px', opacity: 0.3, display: 'block', marginBottom: '8px' } }, 'local_taxi'),
            search ? '該当する記録がありません' : '他社乗車記録がありません'
          )
        : React.createElement(Card, null, filteredRival.map(e => rivalRow(e)))
    ),

    // === 交通情報タブ ===
    tab === 'transit' && React.createElement(React.Fragment, null,
      React.createElement('div', { style: { fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' } },
        '保存済みの公共交通機関情報'
      ),
      Object.keys(transitData).length === 0
        ? React.createElement('div', { style: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' } },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '48px', opacity: 0.3, display: 'block', marginBottom: '8px' } }, 'directions_transit'),
            '保存された交通情報がありません'
          )
        : React.createElement(Card, null,
            Object.entries(transitData).sort((a, b) => (b[1].fetchedAt || '').localeCompare(a[1].fetchedAt || '')).map(([key, val]) =>
              React.createElement('div', {
                key,
                style: { padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
              },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' } },
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px' } },
                    React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: key === 'trouble' ? 'var(--color-warning)' : 'var(--color-primary-light)' } }, transitIcons[key] || 'info'),
                    transitLabels[key] || key
                  ),
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    val.fetchedAt && React.createElement('span', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, new Date(val.fetchedAt).toLocaleString('ja-JP')),
                    React.createElement('button', {
                      onClick: () => { if (confirm(`「${transitLabels[key] || key}」のデータを削除しますか？`)) deleteTransitCategory(key); },
                      style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' },
                      title: '削除',
                    }, React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, 'delete_outline'))
                  )
                ),
                val.text && React.createElement('div', {
                  style: { fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, maxHeight: '120px', overflow: 'auto', padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', whiteSpace: 'pre-wrap' },
                }, val.text.slice(0, 500) + (val.text.length > 500 ? '...' : ''))
              )
            )
          ),
      Object.keys(transitData).length > 0 && React.createElement('div', { style: { marginTop: '12px', display: 'flex', justifyContent: 'flex-end' } },
        React.createElement(Button, {
          variant: 'danger', icon: 'delete_forever',
          onClick: () => { if (confirm('全ての交通情報を削除しますか？')) { AppStorage.set(APP_CONSTANTS.STORAGE_KEYS.TRANSIT_INFO, {}); setRefreshKey(k => k + 1); } },
          style: { padding: '5px 10px', fontSize: '11px' },
        }, '全削除')
      )
    ),

    // === GPS記録タブ ===
    tab === 'gps' && React.createElement(GpsLogTab, { refreshKey, setRefreshKey }),

    // === GPS分析タブ ===
    tab === 'gps-analysis' && React.createElement(GpsAnalysisTab, { refreshKey }),

    // === ゴミ箱タブ ===
    tab === 'trash' && React.createElement(React.Fragment, null,
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
        React.createElement('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } },
          `ゴミ箱（${trashEntries.length}件）`
        ),
        trashEntries.length > 0 && React.createElement(Button, {
          variant: 'danger', icon: 'delete_forever',
          onClick: handleEmptyTrash,
          style: { padding: '5px 10px', fontSize: '11px' },
        }, 'ゴミ箱を空にする')
      ),
      React.createElement('div', {
        style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' },
      }, '削除から1ヶ月経過後に自動削除されます'),
      trashEntries.length === 0
        ? React.createElement('div', { style: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' } },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '48px', opacity: 0.3, display: 'block', marginBottom: '8px' } }, 'delete_outline'),
            'ゴミ箱は空です'
          )
        : React.createElement(Card, null,
            trashEntries.map(entry => {
              const isConfirmPerm = confirmTrashDelete === entry._trashId;
              const deletedDate = new Date(entry._deletedAt);
              const now = new Date();
              const diffMs = now - deletedDate;
              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              const agoText = diffDays === 0 ? '今日' : diffDays === 1 ? '昨日' : `${diffDays}日前`;
              const typeLabel = entry._trashType === 'revenue' ? '売上記録' : entry._trashType === 'rival' ? '他社記録' : 'データ';
              const typeBg = entry._trashType === 'revenue' ? 'rgba(0,200,83,0.12)' : 'rgba(26,115,232,0.12)';
              const typeColor = entry._trashType === 'revenue' ? 'var(--color-accent)' : 'var(--color-primary-light)';

              return React.createElement('div', {
                key: entry._trashId,
                style: { padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
              },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' } },
                  React.createElement('span', {
                    style: { fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: typeBg, color: typeColor, fontWeight: 600 },
                  }, typeLabel),
                  React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, `削除: ${agoText}`)
                ),
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                  React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                    entry._trashType === 'revenue'
                      ? React.createElement(React.Fragment, null,
                          React.createElement('div', { style: { fontWeight: 500, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' } },
                            entry.noPassenger
                              ? React.createElement('span', { style: { color: '#d32f2f', fontWeight: 700 } }, '¥0（待機）')
                              : React.createElement('span', { style: { color: 'var(--color-secondary)', fontWeight: 700 } }, `¥${(entry.amount || 0).toLocaleString()}`),
                            entry.pickup && React.createElement('span', { style: { color: 'var(--text-muted)', fontSize: '12px' } }, `${entry.pickup}→${entry.dropoff || '---'}`)
                          ),
                          React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, entry.date || '')
                        )
                      : React.createElement(React.Fragment, null,
                          React.createElement('div', { style: { fontWeight: 500, fontSize: '13px' } }, entry.location || '---'),
                          React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)' } },
                            [entry.date, entry.time].filter(Boolean).join(' ')
                          )
                        )
                  ),
                  React.createElement('button', {
                    onClick: () => handleRestore(entry._trashId),
                    style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-light)', padding: '4px', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px', fontWeight: 600 },
                    title: '復元',
                  },
                    React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, 'restore'),
                  ),
                  React.createElement('button', {
                    onClick: () => handlePermanentDelete(entry._trashId),
                    style: { background: 'none', border: 'none', cursor: 'pointer', color: isConfirmPerm ? 'var(--color-danger)' : 'var(--text-muted)', padding: '4px' },
                    title: isConfirmPerm ? 'もう一度押して完全削除' : '完全削除',
                  },
                    React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px' } }, isConfirmPerm ? 'delete_forever' : 'delete_outline')
                  )
                )
              );
            })
          )
    )
  );
};

})();
