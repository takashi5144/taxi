(function() {
// Info.jsx - 情報ページ（交通機関 + イベント + ホテル統合）

// ホテル混雑状況コンポーネント
window.HotelStatusPage = () => {
  const { useState, useMemo, useEffect, useCallback } = React;
  const createElement = React.createElement;
  const { geminiApiKey } = useAppContext();
  const [now, setNow] = useState(new Date());
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState('');
  const [priceAnalysis, setPriceAnalysis] = useState(() => DataService.analyzeHotelPrices());

  // 1分ごとに自動更新
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const locs = APP_CONSTANTS.KNOWN_LOCATIONS.asahikawa;
  const hotels = locs.hotels || [];
  const peaks = locs.hotelPeakWindows || {};

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  function timeToMin(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  // 各ピーク時間帯のアクティブ状態を算出
  const windowStatus = useMemo(() => {
    return Object.entries(peaks).map(([key, win]) => {
      const startMin = timeToMin(win.start);
      const endMin = timeToMin(win.end);
      const isCurrent = currentMinutes >= startMin && currentMinutes <= endMin;
      const isSoon = !isCurrent && currentMinutes >= startMin - 30 && currentMinutes < startMin;
      const isPast = currentMinutes > endMin + 15;
      let progress = 0;
      if (isCurrent) progress = Math.min(1, (currentMinutes - startMin) / (endMin - startMin));
      return { key, ...win, isCurrent, isSoon, isPast, progress };
    });
  }, [currentMinutes]);

  // 各ホテルの現在の需要レベルを算出
  const hotelStatus = useMemo(() => {
    const maxRooms = 355;
    return hotels.map(hotel => {
      let totalWeight = 0;
      let activeWindow = null;
      Object.values(peaks).forEach(win => {
        const startMin = timeToMin(win.start);
        const endMin = timeToMin(win.end);
        let tw = 0;
        if (currentMinutes >= startMin && currentMinutes <= endMin) tw = 1.0;
        else if (currentMinutes >= startMin - 30 && currentMinutes < startMin) tw = (currentMinutes - (startMin - 30)) / 30;
        else if (currentMinutes > endMin && currentMinutes <= endMin + 30) tw = 1.0 - (currentMinutes - endMin) / 30;
        if (tw > 0) {
          const distFactor = hotel.distKm >= 0.8 ? 1.0 : hotel.distKm >= 0.4 ? 0.6 : 0.3;
          const roomFactor = hotel.rooms / maxRooms;
          const w = win.weight * tw * distFactor * roomFactor;
          if (w > totalWeight) {
            totalWeight = w;
            activeWindow = win.label;
          }
        }
      });
      const score = Math.min(100, Math.round(totalWeight * 100));
      return { ...hotel, score, activeWindow };
    }).sort((a, b) => b.score - a.score);
  }, [currentMinutes]);

  // 価格分析データとホテル需要をマージ
  const hotelWithPrices = useMemo(() => {
    if (!priceAnalysis.hasData) return hotelStatus;
    const priceMap = {};
    priceAnalysis.hotels.forEach(p => { priceMap[p.name] = p; });
    return hotelStatus.map(h => ({
      ...h,
      priceInfo: priceMap[h.name] || null,
    }));
  }, [hotelStatus, priceAnalysis]);

  // 一括取得ハンドラー
  const handleFetchPrices = useCallback(async () => {
    if (!geminiApiKey) { setPriceError('Gemini APIキーを設定してください'); return; }
    setPriceLoading(true);
    setPriceError('');
    try {
      const result = await GeminiService.fetchHotelPrices(geminiApiKey, hotels);
      if (!result.success) { setPriceError(result.error); return; }
      DataService.saveHotelPrices(result.prices);
      setPriceAnalysis(DataService.analyzeHotelPrices());
    } catch (e) {
      setPriceError(`取得エラー: ${e.message}`);
    } finally {
      setPriceLoading(false);
    }
  }, [geminiApiKey, hotels]);

  const levelConfig = {
    very_high: { label: '非常に高い', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    high: { label: '高い', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    medium: { label: '中程度', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
    low: { label: '低い', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  };

  const trendConfig = {
    high: { icon: 'trending_up', label: '高騰', color: '#ef4444' },
    rising: { icon: 'trending_up', label: 'やや高い', color: '#f59e0b' },
    stable: { icon: 'trending_flat', label: '通常', color: '#3b82f6' },
    falling: { icon: 'trending_down', label: 'やや安い', color: '#22c55e' },
    low: { icon: 'trending_down', label: '安い', color: '#22c55e' },
  };

  const occupancyConfig = {
    very_high: { label: '非常に高い', color: '#ef4444' },
    high: { label: '高い', color: '#f59e0b' },
    normal: { label: '通常', color: '#3b82f6' },
    low: { label: '低い', color: '#22c55e' },
    unknown: { label: '不明', color: '#6b7280' },
  };

  const activeWindows = windowStatus.filter(w => w.isCurrent || w.isSoon);
  const activeHotels = hotelStatus.filter(h => h.score > 0);

  // 高稼働ホテル数
  const highOccupancyCount = priceAnalysis.hasData
    ? priceAnalysis.hotels.filter(h => h.occupancyEstimate === 'high' || h.occupancyEstimate === 'very_high').length : 0;

  return createElement('div', null,
    createElement('h1', { className: 'page-title' },
      createElement('span', { className: 'material-icons-round' }, 'hotel'),
      'ホテル混雑状況'
    ),

    // 現在時刻カード
    createElement('div', {
      className: 'card',
      style: { padding: 'var(--space-md)', marginBottom: 'var(--space-md)', textAlign: 'center' },
    },
      createElement('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', marginBottom: 4 } }, '現在時刻'),
      createElement('div', { style: { fontSize: 'var(--font-size-xl)', fontWeight: 700 } }, timeStr),
      createElement('div', {
        style: { marginTop: 6, fontSize: 'var(--font-size-sm)', color: activeWindows.length > 0 ? '#ef4444' : 'var(--text-muted)' },
      },
        activeWindows.length > 0
          ? `${activeWindows.map(w => `${w.label}${w.isCurrent ? '（進行中）' : '（まもなく）'}`).join('、')}`
          : '現在アクティブなピーク時間帯はありません'
      )
    ),

    // ホテル価格取得カード
    createElement('div', {
      className: 'card',
      style: { padding: 'var(--space-md)', marginBottom: 'var(--space-md)' },
    },
      createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' },
      },
        createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', fontWeight: 700 } },
          createElement('span', { className: 'material-icons-round', style: { fontSize: 18, color: '#a78bfa' } }, 'payments'),
          '料金情報'
        ),
        createElement('button', {
          className: `btn btn--primary`,
          onClick: handleFetchPrices,
          disabled: priceLoading || !geminiApiKey,
          style: { padding: '6px 14px', fontSize: 'var(--font-size-xs)', display: 'flex', alignItems: 'center', gap: 4 },
        },
          priceLoading && createElement('span', {
            className: 'material-icons-round',
            style: { fontSize: 14, animation: 'spin 1s linear infinite' },
          }, 'sync'),
          priceLoading ? '取得中...' : '一括取得'
        )
      ),
      priceError && createElement('div', {
        style: { fontSize: 'var(--font-size-xs)', color: '#ef4444', marginBottom: 'var(--space-xs)', padding: '4px 8px', background: 'rgba(239,68,68,0.1)', borderRadius: 4 },
      }, priceError),
      !geminiApiKey && createElement('div', {
        style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', padding: '4px 0' },
      }, 'Gemini APIキーを設定画面で入力してください'),
      priceAnalysis.hasData && createElement('div', {
        style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' },
      },
        createElement('span', null, `蓄積: ${priceAnalysis.recordCount}回`),
        createElement('span', null, `最終: ${priceAnalysis.latestFetch ? new Date(priceAnalysis.latestFetch).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}`),
        highOccupancyCount > 0 && createElement('span', { style: { color: '#ef4444', fontWeight: 600 } }, `高稼働: ${highOccupancyCount}件`)
      )
    ),

    // 稼働率分析サマリー（価格データあり時のみ表示）
    priceAnalysis.hasData && priceAnalysis.recordCount >= 2 && createElement('div', {
      className: 'card',
      style: { padding: 'var(--space-md)', marginBottom: 'var(--space-md)', borderLeft: '3px solid #a78bfa' },
    },
      createElement('div', {
        style: { fontWeight: 700, marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' },
      },
        createElement('span', { className: 'material-icons-round', style: { fontSize: 18, color: '#a78bfa' } }, 'analytics'),
        '稼働率分析'
      ),
      createElement('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', marginBottom: 8 } },
        '料金変動から推定した稼働率（料金高騰 = 高稼働 = タクシー需要増）'
      ),
      ...priceAnalysis.hotels.filter(h => h.occupancyEstimate !== 'normal' && h.occupancyEstimate !== 'unknown').slice(0, 5).map(h => {
        const oc = occupancyConfig[h.occupancyEstimate] || occupancyConfig.unknown;
        const tc = trendConfig[h.trend] || trendConfig.stable;
        return createElement('div', {
          key: h.name,
          style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-color)' },
        },
          createElement('span', { className: 'material-icons-round', style: { fontSize: 16, color: tc.color } }, tc.icon),
          createElement('div', { style: { flex: 1, minWidth: 0 } },
            createElement('div', {
              style: { fontSize: 'var(--font-size-sm)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
            }, h.name),
            createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' } },
              `${h.latest ? h.latest.toLocaleString() + '円' : '-'} (平均: ${h.avg ? h.avg.toLocaleString() + '円' : '-'})`
            )
          ),
          createElement('div', { style: { textAlign: 'right' } },
            createElement('div', { style: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: oc.color } }, `稼働: ${oc.label}`),
            createElement('div', { style: { fontSize: 10, color: tc.color } }, tc.label)
          )
        );
      }),
      priceAnalysis.hotels.filter(h => h.occupancyEstimate !== 'normal' && h.occupancyEstimate !== 'unknown').length === 0 &&
        createElement('div', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', padding: '8px 0' } },
          '全ホテルが通常稼働率です。料金データが蓄積されると変動が表示されます。'
        )
    ),

    // ピーク時間帯タイムライン
    createElement('div', {
      className: 'card',
      style: { padding: 'var(--space-md)', marginBottom: 'var(--space-md)' },
    },
      createElement('div', {
        style: { fontWeight: 700, marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' },
      },
        createElement('span', { className: 'material-icons-round', style: { fontSize: 18, color: 'var(--color-secondary)' } }, 'schedule'),
        'ピーク時間帯'
      ),
      ...windowStatus.map(w =>
        createElement('div', {
          key: w.key,
          style: {
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
            borderBottom: '1px solid var(--border-color)', opacity: w.isPast ? 0.4 : 1,
          },
        },
          createElement('div', {
            style: {
              minWidth: 52, textAlign: 'center', fontSize: 10, fontWeight: 700, padding: '3px 6px', borderRadius: 4,
              background: w.isCurrent ? 'rgba(239,68,68,0.15)' : w.isSoon ? 'rgba(245,158,11,0.15)' : w.isPast ? 'rgba(107,114,128,0.1)' : 'rgba(59,130,246,0.1)',
              color: w.isCurrent ? '#ef4444' : w.isSoon ? '#f59e0b' : w.isPast ? '#6b7280' : '#3b82f6',
            },
          }, w.isCurrent ? 'NOW' : w.isSoon ? 'SOON' : w.isPast ? '終了' : '待機'),
          createElement('div', { style: { flex: 1 } },
            createElement('div', { style: { fontWeight: 600, fontSize: 'var(--font-size-sm)' } }, w.label),
            createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' } }, `${w.start} 〜 ${w.end}`)
          ),
          w.isCurrent && createElement('div', {
            style: { width: 60, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
          },
            createElement('div', {
              style: { width: `${Math.round(w.progress * 100)}%`, height: '100%', background: '#ef4444', borderRadius: 3, transition: 'width 0.5s' },
            })
          )
        )
      )
    ),

    // ホテル一覧（価格情報付き）
    createElement('div', {
      className: 'card',
      style: { padding: 'var(--space-md)' },
    },
      createElement('div', {
        style: { fontWeight: 700, marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
      },
        createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' } },
          createElement('span', { className: 'material-icons-round', style: { fontSize: 18, color: 'var(--color-secondary)' } }, 'apartment'),
          `ホテル一覧（${hotels.length}件）`
        ),
        createElement('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' } },
          `タクシー需要あり: ${activeHotels.length}件`
        )
      ),
      ...hotelWithPrices.map(h => {
        const lc = levelConfig[h.demandLevel] || levelConfig.low;
        const barWidth = Math.max(2, h.score);
        const pi = h.priceInfo;
        const tc = pi ? (trendConfig[pi.trend] || trendConfig.stable) : null;
        return createElement('div', {
          key: h.name,
          style: {
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
            borderBottom: '1px solid var(--border-color)',
          },
        },
          // 需要レベルバッジ
          createElement('div', {
            style: {
              minWidth: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 6, background: lc.bg, fontSize: 14,
            },
          },
            createElement('span', { className: 'material-icons-round', style: { fontSize: 18, color: lc.color } }, 'hotel')
          ),
          // ホテル情報
          createElement('div', { style: { flex: 1, minWidth: 0 } },
            createElement('div', {
              style: { fontWeight: 600, fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
            }, h.name),
            createElement('div', {
              style: { display: 'flex', gap: 8, fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 2, flexWrap: 'wrap' },
            },
              createElement('span', null, `${h.rooms}室`),
              createElement('span', null, `駅${h.distKm}km`),
              createElement('span', { style: { color: lc.color } }, lc.label),
              h.activeWindow && createElement('span', { style: { color: '#ef4444', fontWeight: 600 } }, h.activeWindow),
              pi && pi.latest > 0 && createElement('span', { style: { color: tc.color, fontWeight: 600 } },
                `${pi.latest.toLocaleString()}円`,
                pi.trend !== 'stable' ? ` ${tc.label}` : ''
              )
            )
          ),
          // スコアバー
          createElement('div', { style: { width: 60, textAlign: 'right' } },
            createElement('div', {
              style: { width: 60, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 2 },
            },
              createElement('div', {
                style: { width: `${barWidth}%`, height: '100%', borderRadius: 3, background: h.score > 50 ? '#ef4444' : h.score > 20 ? '#f59e0b' : h.score > 0 ? '#3b82f6' : '#6b7280', transition: 'width 0.5s' },
              })
            ),
            h.score > 0 && createElement('div', {
              style: { fontSize: 10, fontWeight: 700, color: h.score > 50 ? '#ef4444' : h.score > 20 ? '#f59e0b' : '#3b82f6' },
            }, `${h.score}`)
          )
        );
      })
    )
  );
};

window.InfoPage = () => {
  const { useState } = React;
  const createElement = React.createElement;
  const [tab, setTab] = useState('transit');

  const tabs = [
    { id: 'transit', label: '交通機関', icon: 'directions_transit' },
    { id: 'hotel', label: 'ホテル', icon: 'hotel' },
    { id: 'events', label: 'イベント', icon: 'event' },
  ];

  return createElement('div', null,
    createElement('h1', { className: 'page-title' },
      createElement('span', { className: 'material-icons-round' }, 'info'),
      '情報'
    ),
    // タブバー
    createElement('div', {
      style: {
        display: 'flex',
        gap: 'var(--space-xs)',
        marginBottom: 'var(--space-lg)',
        background: 'var(--bg-card)',
        borderRadius: 'var(--border-radius)',
        padding: 4,
      }
    },
      ...tabs.map(t =>
        createElement('button', {
          key: t.id,
          className: `btn ${tab === t.id ? 'btn--primary' : 'btn--ghost'}`,
          onClick: () => setTab(t.id),
          style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 10px', fontSize: '13px' }
        },
          createElement('span', { className: 'material-icons-round', style: { fontSize: 17 } }, t.icon),
          t.label
        )
      )
    ),
    // 子ページ（タイトルは非表示）
    createElement('div', { className: 'info-page-content' },
      tab === 'transit'
        ? createElement(TransitInfoPage)
        : tab === 'hotel'
        ? createElement(HotelStatusPage)
        : createElement(EventsPage)
    )
  );
};

})();
