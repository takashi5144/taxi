(function() {
// TransitInfo.jsx - 公共交通機関情報ページ
// Gemini AI を使用して電車・バス・飛行機の運行情報と遅延情報を取得・保存
window.TransitInfoPage = () => {
  const { useState, useCallback, useEffect, useMemo, useRef } = React;
  const { geminiApiKey, apiKey } = useAppContext();

  const STORAGE_KEY = APP_CONSTANTS.STORAGE_KEYS.TRANSIT_INFO;

  // GPS地域検出
  const [region, setRegion] = useState(null);
  const [regionLoading, setRegionLoading] = useState(false);
  const regionFetched = useRef(null);

  // ページ読み込み時にGPSで現在地の地域を取得
  useEffect(() => {
    if (regionFetched.current === apiKey) return;
    regionFetched.current = apiKey;

    if (!navigator.geolocation) return;
    setRegionLoading(true);

    getAccuratePosition({ accuracyThreshold: 500, timeout: 10000, maxWaitAfterFix: 3000 })
      .then((position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        // Google Maps Geocoder があれば使用
        if (apiKey && window.google && window.google.maps) {
          const geocoder = new google.maps.Geocoder();
          geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            setRegionLoading(false);
            if (status === 'OK' && results[0]) {
              const comps = results[0].address_components;
              let prefecture = '', city = '';
              for (const c of comps) {
                if (c.types.includes('administrative_area_level_1')) prefecture = c.long_name;
                if (c.types.includes('locality')) city = c.long_name;
                if (!city && (c.types.includes('sublocality_level_1') || c.types.includes('ward'))) city = c.long_name;
              }
              const regionStr = [prefecture, city].filter(Boolean).join(' ');
              if (regionStr) {
                setRegion(regionStr);
                AppLogger.info(`交通情報: 地域検出成功 (Google) - ${regionStr}`);
              }
            } else {
              // Google失敗時はNominatimにフォールバック
              _fetchRegionNominatim(lat, lng);
            }
          });
        } else {
          // Nominatimで逆ジオコーディング
          _fetchRegionNominatim(lat, lng);
        }
      })
      .catch((err) => {
        setRegionLoading(false);
        AppLogger.warn('交通情報: 地域検出失敗 - ' + (err.message || ''));
      });
  }, [apiKey]);

  // Nominatim逆ジオコーディングで地域名を取得
  const _fetchRegionNominatim = useCallback((lat, lng) => {
    const url = TaxiApp.utils.nominatimUrl(lat, lng, 10);
    fetch(url)
      .then(res => res.json())
      .then(data => {
        setRegionLoading(false);
        if (data && data.address) {
          const a = data.address;
          const prefecture = a.province || a.state || '';
          const city = a.city || a.town || a.village || a.county || '';
          const regionStr = [prefecture, city].filter(Boolean).join(' ');
          if (regionStr) {
            setRegion(regionStr);
            AppLogger.info(`交通情報: 地域検出成功 (Nominatim) - ${regionStr}`);
          }
        }
      })
      .catch(() => {
        setRegionLoading(false);
      });
  }, []);

  // カテゴリ定義
  const categories = useMemo(() => [
    { key: 'demand',  icon: 'insights',         label: '需要予測',       color: '124,58,237',  fetchFn: null },
    { key: 'trouble', icon: 'warning',        label: '遅延・トラブル', color: '229,57,53',  fetchFn: GeminiService.fetchTroubleInfo },
    { key: 'train',   icon: 'train',           label: '電車',           color: '26,115,232',  fetchFn: GeminiService.fetchTrainInfo },
    { key: 'bus',     icon: 'directions_bus',   label: 'バス',           color: '46,125,50',   fetchFn: GeminiService.fetchBusInfo },
    { key: 'flight',  icon: 'flight',           label: '飛行機',         color: '156,39,176',  fetchFn: GeminiService.fetchFlightInfo },
  ], []);

  // localStorageから保存済みデータを読み込み
  const loadSaved = () => {
    const saved = AppStorage.get(STORAGE_KEY, {});
    const result = {};
    categories.forEach(c => {
      if (c.key === 'demand') return;
      const s = saved[c.key];
      result[c.key] = { loading: false, result: s?.text || null, error: null, fetchedAt: s?.fetchedAt || null };
    });
    return result;
  };

  const [data, setData] = useState(loadSaved);
  const [activeTab, setActiveTab] = useState(geminiApiKey ? 'demand' : 'bus');

  // 需要予測プラン関連（data/setData宣言後に配置）
  const [demandLoading, setDemandLoading] = useState(false);
  const demandLoadingRef = useRef(false);
  const demandSchedule = useMemo(() => DataService.getDailyDemandSchedule(), [data]);

  const handleFetchDemandPlan = useCallback(async () => {
    if (!geminiApiKey || demandLoadingRef.current) return;
    demandLoadingRef.current = true;
    setDemandLoading(true);
    const result = await GeminiService.fetchDailyDemandPlan(geminiApiKey, region);
    if (result.success && result.data) {
      const today = new Date().toISOString().slice(0, 10);
      AppStorage.set(APP_CONSTANTS.STORAGE_KEYS.DAILY_DEMAND_PLAN, { date: today, data: result.data, fetchedAt: new Date().toISOString() });
      window.dispatchEvent(new CustomEvent('taxi-data-changed', { detail: { type: 'demand-plan' } }));
      setData(prev => ({ ...prev }));
    }
    demandLoadingRef.current = false;
    setDemandLoading(false);
  }, [geminiApiKey, region]);

  // データをlocalStorageに保存 + ファイル保存
  const saveToStorage = useCallback((newData) => {
    const toSave = {};
    Object.keys(newData).forEach(key => {
      if (newData[key].result) {
        toSave[key] = { text: newData[key].result, fetchedAt: newData[key].fetchedAt };
      }
    });
    AppStorage.set(STORAGE_KEY, toSave);
    // 保存先フォルダが設定されていればファイルにも保存
    DataService.autoSaveTransitToFile(toSave);
    window.dispatchEvent(new CustomEvent('taxi-data-changed', { detail: { type: 'transit' } }));
  }, [STORAGE_KEY]);

  // カテゴリ別取得
  const handleFetch = useCallback(async (categoryKey) => {
    if (categoryKey === 'demand') { handleFetchDemandPlan(); return; }
    const cat = categories.find(c => c.key === categoryKey);
    if (!cat || !cat.fetchFn) return;

    setData(prev => ({ ...prev, [categoryKey]: { ...prev[categoryKey], loading: true, error: null } }));

    const result = await cat.fetchFn(geminiApiKey, region);
    const now = new Date().toISOString();

    setData(prev => {
      const updated = {
        ...prev,
        [categoryKey]: {
          loading: false,
          result: result.success ? result.text : prev[categoryKey].result,
          error: result.success ? null : result.error,
          fetchedAt: result.success ? now : prev[categoryKey].fetchedAt,
        }
      };
      if (result.success) saveToStorage(updated);
      return updated;
    });

    // 遅延・トラブル情報取得成功時にプッシュ通知
    if (categoryKey === 'trouble' && result.success && result.text) {
      NotificationService.sendTroubleAlert(result.text);
    }
  }, [geminiApiKey, region, categories, saveToStorage, handleFetchDemandPlan]);

  // 全カテゴリ一括取得
  const handleFetchAll = useCallback(async () => {
    for (const cat of categories) {
      await handleFetch(cat.key);
    }
  }, [categories, handleFetch]);

  // 取得時刻のフォーマット
  const formatTime = (isoStr) => {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  };

  // Geminiテキストを見やすく整形するレンダラー
  const renderFormattedText = (text) => {
    if (!text) return null;

    const lines = text.split('\n');
    const elements = [];

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) {
        elements.push(React.createElement('div', { key: idx, style: { height: '6px' } }));
        return;
      }

      // ### 見出し3
      if (trimmed.startsWith('### ')) {
        elements.push(React.createElement('div', {
          key: idx,
          style: {
            fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)',
            marginTop: '12px', marginBottom: '4px', paddingBottom: '3px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          },
        }, renderInlineFormatting(trimmed.slice(4))));
        return;
      }

      // ## 見出し2
      if (trimmed.startsWith('## ')) {
        elements.push(React.createElement('div', {
          key: idx,
          style: {
            fontSize: '13px', fontWeight: 700, color: 'var(--color-primary-light)',
            marginTop: '14px', marginBottom: '6px', paddingBottom: '4px',
            borderBottom: '1px solid rgba(26,115,232,0.2)',
            display: 'flex', alignItems: 'center', gap: '6px',
          },
        }, renderInlineFormatting(trimmed.slice(3))));
        return;
      }

      // # 見出し1
      if (trimmed.startsWith('# ')) {
        elements.push(React.createElement('div', {
          key: idx,
          style: {
            fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)',
            marginTop: '16px', marginBottom: '8px', paddingBottom: '6px',
            borderBottom: '2px solid rgba(26,115,232,0.3)',
          },
        }, renderInlineFormatting(trimmed.slice(2))));
        return;
      }

      // 【セクション】ヘッダー
      if (trimmed.startsWith('\u3010') && trimmed.includes('\u3011')) {
        elements.push(React.createElement('div', {
          key: idx,
          style: {
            fontSize: '13px', fontWeight: 700, color: 'var(--color-primary-light)',
            marginTop: '14px', marginBottom: '6px', padding: '6px 10px',
            borderRadius: '6px', background: 'rgba(26,115,232,0.08)',
            borderLeft: '3px solid rgba(26,115,232,0.5)',
          },
        }, renderInlineFormatting(trimmed)));
        return;
      }

      // 表区切り線 (|---|---| 形式) - スキップ
      if (/^\|[\s\-:]+\|/.test(trimmed) && !trimmed.replace(/[\|\s\-:]/g, '')) {
        return;
      }

      // テーブル行 (| cell | cell |)
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const cells = trimmed.split('|').filter(c => c.trim());
        const isHeader = idx + 1 < lines.length && /^\|[\s\-:]+\|/.test(lines[idx + 1]?.trim() || '');
        elements.push(React.createElement('div', {
          key: idx,
          style: {
            display: 'grid',
            gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
            gap: '1px', fontSize: '11px',
            background: 'rgba(255,255,255,0.04)', borderRadius: idx === 0 ? '4px 4px 0 0' : '0',
          },
        },
          cells.map((cell, ci) => React.createElement('div', {
            key: ci,
            style: {
              padding: '5px 8px',
              fontWeight: isHeader ? 700 : 400,
              color: isHeader ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: isHeader ? 'rgba(26,115,232,0.08)' : 'rgba(255,255,255,0.02)',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            },
          }, renderInlineFormatting(cell.trim())))
        ));
        return;
      }

      // 箇条書き (- / * / ・)
      if (/^[-*\u30FB]/.test(trimmed) && trimmed.length > 1) {
        const content = trimmed.replace(/^[-*\u30FB]\s*/, '');
        elements.push(React.createElement('div', {
          key: idx,
          style: {
            display: 'flex', gap: '6px', fontSize: '12px', color: 'var(--text-primary)',
            padding: '2px 0 2px 8px', lineHeight: 1.6,
          },
        },
          React.createElement('span', { style: { color: 'var(--color-primary-light)', flexShrink: 0, marginTop: '2px', fontSize: '8px' } }, '\u25CF'),
          React.createElement('span', null, renderInlineFormatting(content))
        ));
        return;
      }

      // 番号付きリスト (1. / 2.)
      if (/^\d+[\.\)]\s/.test(trimmed)) {
        const num = trimmed.match(/^(\d+)[\.\)]\s/)[1];
        const content = trimmed.replace(/^\d+[\.\)]\s*/, '');
        elements.push(React.createElement('div', {
          key: idx,
          style: {
            display: 'flex', gap: '6px', fontSize: '12px', color: 'var(--text-primary)',
            padding: '2px 0 2px 4px', lineHeight: 1.6,
          },
        },
          React.createElement('span', {
            style: {
              color: 'var(--color-primary-light)', flexShrink: 0, fontWeight: 600,
              fontSize: '11px', minWidth: '16px', textAlign: 'right',
            },
          }, num + '.'),
          React.createElement('span', null, renderInlineFormatting(content))
        ));
        return;
      }

      // 通常テキスト
      elements.push(React.createElement('div', {
        key: idx,
        style: { fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.7, padding: '1px 0' },
      }, renderInlineFormatting(trimmed)));
    });

    return elements;
  };

  // インライン書式（太字・強調）
  const renderInlineFormatting = (text) => {
    if (!text) return '';
    // **太字**
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    if (parts.length <= 1) return text;
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return React.createElement('strong', {
          key: i,
          style: { fontWeight: 700, color: 'var(--text-primary)' },
        }, part.slice(2, -2));
      }
      return part;
    });
  };

  // APIキー未設定時はバスタブをデフォルトにする（バスはAPIキー不要）
  // 他タブ（電車・飛行機・トラブル・需要予測）はAPIキー必要

  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const anyLoading = categories.some(c => data[c.key]?.loading);
  const activeCat = categories.find(c => c.key === activeTab) || { key: 'demand', icon: 'insights', label: '需要予測', color: '124,58,237', fetchFn: null };
  const activeData = data[activeTab] || { loading: false, result: null, error: null, fetchedAt: null };

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'directions_transit'),
      '公共交通機関情報'
    ),

    // 上部: 日付 + 取得ボタン群
    React.createElement(Card, { style: { marginBottom: 'var(--space-md)' } },
      // 日付 + 地域
      React.createElement('div', {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '8px', flexWrap: 'wrap', gap: '8px',
        },
      },
        React.createElement('div', {
          style: { display: 'flex', flexDirection: 'column', gap: '4px' },
        },
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '16px' } }, 'today'),
            today
          ),
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' },
          },
            React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, regionLoading ? 'sync' : 'place'),
            regionLoading ? '地域を検出中...'
              : region ? region
              : 'GPS地域未検出（デフォルト: 東京都内）'
          )
        ),
        React.createElement(Button, {
          variant: 'primary',
          icon: anyLoading ? 'sync' : 'refresh',
          onClick: handleFetchAll,
          disabled: anyLoading,
          style: { fontSize: '11px', padding: '6px 12px' },
        }, anyLoading ? '取得中...' : 'すべて取得')
      ),

      // 個別取得ボタン群
      React.createElement('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' },
      },
        categories.map(cat => {
          const catData = cat.key === 'demand' ? { result: demandSchedule.available, loading: demandLoading } : (data[cat.key] || {});
          const hasData = !!catData.result;
          const isLoading = catData.loading;
          return React.createElement('button', {
            key: cat.key,
            onClick: () => { if (!isLoading) handleFetch(cat.key); },
            disabled: isLoading,
            style: {
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              padding: '10px 4px', borderRadius: '10px', border: 'none',
              background: isLoading ? 'rgba(255,255,255,0.08)' : `rgba(${cat.color}, 0.1)`,
              cursor: isLoading ? 'wait' : 'pointer', transition: 'all 0.15s',
              opacity: isLoading ? 0.7 : 1,
            },
            onMouseEnter: (e) => { if (!isLoading) e.currentTarget.style.background = `rgba(${cat.color}, 0.2)`; },
            onMouseLeave: (e) => { e.currentTarget.style.background = isLoading ? 'rgba(255,255,255,0.08)' : `rgba(${cat.color}, 0.1)`; },
          },
            React.createElement('span', {
              className: 'material-icons-round',
              style: {
                fontSize: '22px', color: `rgb(${cat.color})`,
                animation: isLoading ? 'spin 1s linear infinite' : 'none',
              },
            }, isLoading ? 'sync' : cat.icon),
            React.createElement('span', {
              style: { fontSize: '10px', fontWeight: 600, color: 'var(--text-primary)' },
            }, cat.label),
            // 取得済みマーク or 未取得
            hasData
              ? React.createElement('span', {
                  style: { fontSize: '9px', color: 'var(--text-muted)' },
                }, formatTime(catData.fetchedAt) + ' 取得')
              : React.createElement('span', {
                  style: { fontSize: '9px', color: 'var(--text-muted)', opacity: 0.5 },
                }, '未取得')
          );
        })
      )
    ),

    // タブ切り替え
    React.createElement('div', {
      style: {
        display: 'flex', gap: '2px', marginBottom: 'var(--space-sm)',
        background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '3px',
      },
    },
      categories.map(cat => {
        const isActive = activeTab === cat.key;
        const catData = cat.key === 'demand' ? { result: demandSchedule.available } : (data[cat.key] || {});
        return React.createElement('button', {
          key: cat.key,
          onClick: () => setActiveTab(cat.key),
          style: {
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
            padding: '8px 4px', borderRadius: '8px', border: 'none',
            background: isActive ? `rgba(${cat.color}, 0.15)` : 'transparent',
            color: isActive ? `rgb(${cat.color})` : 'var(--text-muted)',
            fontWeight: isActive ? 600 : 400, fontSize: '11px',
            cursor: 'pointer', transition: 'all 0.15s', position: 'relative',
          },
        },
          React.createElement('span', {
            className: 'material-icons-round',
            style: { fontSize: '16px' },
          }, cat.icon),
          // モバイルではラベル非表示
          React.createElement('span', {
            style: { fontSize: '10px' },
            className: 'transit-tab-label',
          }, cat.label),
          // 取得済みドット
          catData.result && React.createElement('span', {
            style: {
              position: 'absolute', top: '4px', right: '4px',
              width: '5px', height: '5px', borderRadius: '50%',
              background: `rgb(${cat.color})`,
            },
          })
        );
      })
    ),

    // 需要予測タブ コンテンツ
    activeTab === 'demand' && React.createElement(Card, {
      style: { marginBottom: 'var(--space-md)' },
    },
      // ヘッダー
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement('span', { className: 'material-icons-round', style: { fontSize: '20px', color: '#7c3aed' } }, 'insights'),
          React.createElement('div', null,
            React.createElement('div', { style: { fontWeight: 700, fontSize: '13px' } }, '交通需要予測'),
            React.createElement('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, 'JR特急・バス到着 + 病院外来ピーク')
          )
        ),
        React.createElement('button', {
          onClick: handleFetchDemandPlan,
          disabled: demandLoading || !geminiApiKey,
          style: {
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '4px 10px', borderRadius: '6px', border: 'none',
            background: 'rgba(124,58,237,0.15)', color: '#a78bfa',
            fontSize: '11px', fontWeight: 600, cursor: geminiApiKey ? 'pointer' : 'not-allowed',
            opacity: demandLoading ? 0.6 : 1,
          },
        },
          React.createElement('span', {
            className: 'material-icons-round',
            style: { fontSize: '14px', animation: demandLoading ? 'spin 1s linear infinite' : 'none' },
          }, demandLoading ? 'sync' : 'refresh'),
          demandLoading ? '取得中...' : '取得'
        )
      ),

      // APIキー未設定
      !geminiApiKey && React.createElement('div', {
        style: { padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '28px', display: 'block', marginBottom: '6px', color: '#7c3aed' } }, 'vpn_key'),
        'Gemini APIキーを設定すると需要予測が利用できます'
      ),

      // ローディング
      demandLoading && !demandSchedule.available && React.createElement('div', {
        style: { padding: '20px', textAlign: 'center', color: 'var(--text-muted)' },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '32px', animation: 'spin 1s linear infinite', display: 'block', marginBottom: '6px' } }, 'sync'),
        'Gemini AIから需要予測データを取得中...'
      ),

      // タイムライン
      demandSchedule.available && demandSchedule.dailyPlan.length > 0 && React.createElement('div', {
        style: { marginBottom: '16px' },
      },
        React.createElement('div', { style: { fontSize: '12px', fontWeight: 600, color: '#7c3aed', marginBottom: '8px' } }, '営業タイムライン'),
        demandSchedule.dailyPlan.map((block, i) => {
          const now = new Date();
          const nowStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
          const isCurrent = nowStr >= (block.startTime || '') && nowStr < (block.endTime || '24:00');
          const lc = block.demandLevel === 'high' ? '#ef4444' : block.demandLevel === 'medium' ? '#f59e0b' : '#3b82f6';
          return React.createElement('div', {
            key: i,
            style: {
              display: 'flex', gap: '10px', padding: '8px', borderRadius: '6px', marginBottom: '3px',
              background: isCurrent ? 'rgba(124,58,237,0.12)' : 'transparent',
              border: isCurrent ? '1px solid rgba(124,58,237,0.3)' : '1px solid transparent',
            },
          },
            React.createElement('div', {
              style: { minWidth: '70px', padding: '2px 6px', borderRadius: '4px', background: `${lc}20`, color: lc, fontSize: '11px', fontWeight: 700, textAlign: 'center', borderLeft: `3px solid ${lc}` },
            }, `${block.startTime || ''}`, React.createElement('br'), `〜${block.endTime || ''}`),
            React.createElement('div', { style: { flex: 1 } },
              React.createElement('div', { style: { fontSize: '12px', fontWeight: 600 } }, block.location || ''),
              React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, block.action || '')
            ),
            isCurrent && React.createElement('span', {
              style: { fontSize: '10px', padding: '2px 6px', borderRadius: '8px', background: '#7c3aed', color: '#fff', alignSelf: 'center', fontWeight: 700 },
            }, 'NOW')
          );
        })
      ),

      // 到着テーブル
      demandSchedule.available && demandSchedule.transitArrivals.length > 0 && React.createElement('div', {
        style: { marginBottom: '16px' },
      },
        React.createElement('div', { style: { fontSize: '12px', fontWeight: 600, color: '#ec4899', marginBottom: '8px' } }, '到着便一覧'),
        React.createElement('div', { style: { borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' } },
          demandSchedule.transitArrivals.map((arr, i) => {
            const now = new Date();
            const nowMin = now.getHours() * 60 + now.getMinutes();
            const p = (arr.arrivalTime || '00:00').split(':');
            const arrMin = parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
            const isPast = arrMin < nowMin;
            return React.createElement('div', {
              key: i,
              style: {
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 10px', fontSize: '12px',
                background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                opacity: isPast ? 0.4 : 1,
              },
            },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px', color: '#ec4899' } },
                  (arr.type || '').includes('バス') ? 'directions_bus' : 'train'
                ),
                React.createElement('span', { style: { fontWeight: 600 } }, `${arr.type || ''} ${arr.line || ''}`),
                React.createElement('span', { style: { color: 'var(--text-muted)', fontSize: '11px' } }, `(${arr.origin || ''})`)
              ),
              React.createElement('div', { style: { fontWeight: 700, color: isPast ? 'var(--text-muted)' : '#ec4899' } }, arr.arrivalTime || '')
            );
          })
        )
      ),

      // 病院ウィンドウ
      demandSchedule.available && demandSchedule.hospitalWindows.length > 0 && React.createElement('div', null,
        React.createElement('div', { style: { fontSize: '12px', fontWeight: 600, color: '#10b981', marginBottom: '8px' } }, '病院外来ピーク'),
        demandSchedule.hospitalWindows.map((hw, i) =>
          React.createElement('div', {
            key: i,
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
          },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px', color: '#10b981' } }, 'local_hospital'),
              React.createElement('span', { style: { fontSize: '12px', fontWeight: 500 } }, hw.name || '')
            ),
            React.createElement('span', { style: { fontSize: '12px', fontWeight: 600, color: '#10b981' } },
              `${hw.peakStart || ''} 〜 ${hw.peakEnd || ''}`
            )
          )
        )
      ),

      // データなし
      geminiApiKey && !demandLoading && !demandSchedule.available && React.createElement('div', {
        style: { padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' },
      },
        React.createElement('span', { className: 'material-icons-round', style: { fontSize: '28px', display: 'block', marginBottom: '6px' } }, 'schedule'),
        '「取得」ボタンを押すと本日の需要予測が表示されます'
      )
    ),

    // 他カテゴリ コンテンツエリア
    activeTab !== 'demand' && (activeData.loading
      ? React.createElement(Card, null,
          React.createElement('div', {
            style: {
              padding: 'var(--space-xl)', textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
            },
          },
            React.createElement('span', {
              className: 'material-icons-round',
              style: { fontSize: '36px', color: activeCat ? `rgb(${activeCat.color})` : '#999', animation: 'spin 1s linear infinite' },
            }, 'sync'),
            React.createElement('span', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' } },
              (activeCat ? activeCat.label : '') + 'の情報を取得中...'
            )
          )
        )
      : activeData.error
        ? React.createElement(Card, null,
            React.createElement('div', {
              style: {
                padding: '12px', borderRadius: '8px',
                background: 'rgba(229,57,53,0.08)', border: '1px solid rgba(229,57,53,0.2)',
                display: 'flex', alignItems: 'center', gap: '8px',
              },
            },
              React.createElement('span', { className: 'material-icons-round', style: { fontSize: '18px', color: 'var(--color-danger)' } }, 'error'),
              React.createElement('span', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)' } }, activeData.error)
            )
          )
        : activeData.result
          ? React.createElement(Card, null,
              // ヘッダー: カテゴリ名 + 取得時刻 + 再取得ボタン
              React.createElement('div', {
                style: {
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: '12px', paddingBottom: '10px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                },
              },
                React.createElement('div', {
                  style: { display: 'flex', alignItems: 'center', gap: '8px' },
                },
                  React.createElement('span', {
                    className: 'material-icons-round',
                    style: { fontSize: '20px', color: `rgb(${activeCat.color})` },
                  }, activeCat.icon),
                  React.createElement('div', null,
                    React.createElement('div', { style: { fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' } },
                      activeCat.label + ' 運行情報'
                    ),
                    activeData.fetchedAt && React.createElement('div', {
                      style: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' },
                    },
                      React.createElement('span', { className: 'material-icons-round', style: { fontSize: '10px', verticalAlign: 'middle', marginRight: '2px' } }, 'schedule'),
                      formatTime(activeData.fetchedAt) + ' に取得'
                    )
                  )
                ),
                React.createElement('button', {
                  onClick: () => handleFetch(activeTab),
                  style: {
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '4px 10px', borderRadius: '6px', border: 'none',
                    background: `rgba(${activeCat.color}, 0.1)`, color: `rgb(${activeCat.color})`,
                    fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                  },
                  onMouseEnter: (e) => { e.currentTarget.style.background = `rgba(${activeCat.color}, 0.2)`; },
                  onMouseLeave: (e) => { e.currentTarget.style.background = `rgba(${activeCat.color}, 0.1)`; },
                },
                  React.createElement('span', { className: 'material-icons-round', style: { fontSize: '14px' } }, 'refresh'),
                  '再取得'
                )
              ),

              // 整形済みコンテンツ
              React.createElement('div', {
                style: { maxHeight: '60vh', overflowY: 'auto', padding: '0 2px' },
              }, renderFormattedText(activeData.result)),

              // 免責事項
              React.createElement('div', {
                style: {
                  marginTop: '12px', paddingTop: '8px',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  fontSize: '10px', color: 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', gap: '4px',
                },
              },
                React.createElement('span', { className: 'material-icons-round', style: { fontSize: '12px' } }, 'info'),
                activeTab === 'bus'
                  ? '※ 2025年12月改正冬ダイヤ準拠。空港バスは月変動あり。最新は各社HPでご確認ください'
                  : '※ AIによる回答です。最新情報は各交通機関の公式サイトでご確認ください'
              )
            )
          : // 未取得状態
            React.createElement(Card, null,
              React.createElement('div', {
                style: {
                  textAlign: 'center', padding: 'var(--space-xl)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                },
              },
                React.createElement('span', {
                  className: 'material-icons-round',
                  style: { fontSize: '40px', color: `rgb(${activeCat.color})`, opacity: 0.3 },
                }, activeCat.icon),
                React.createElement('div', { style: { fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' } },
                  activeCat.label + 'の情報がありません'
                ),
                React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.5 } },
                  '上のボタンをタップして情報を取得してください'
                ),
                React.createElement(Button, {
                  variant: 'primary',
                  icon: 'download',
                  onClick: () => handleFetch(activeTab),
                  style: { fontSize: '12px', marginTop: '4px' },
                }, activeCat ? (activeCat.label + 'の情報を取得') : '取得')
              )
            ))
  );
};

})();
