// TransitInfo.jsx - 公共交通機関情報ページ
// Gemini AI を使用して電車・バス・飛行機の運行情報と遅延情報を取得・保存
window.TransitInfoPage = () => {
  const { useState, useCallback, useEffect, useMemo, useRef } = React;
  const { geminiApiKey, apiKey } = useAppContext();

  const STORAGE_KEY = APP_CONSTANTS.STORAGE_KEYS.TRANSIT_INFO;

  // GPS地域検出
  const [region, setRegion] = useState(null);
  const [regionLoading, setRegionLoading] = useState(false);
  const regionFetched = useRef(false);

  // ページ読み込み時にGPSで現在地の地域を取得
  useEffect(() => {
    if (regionFetched.current) return;
    regionFetched.current = true;

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
              _fetchRegionNominatim(lat, lng);
            }
          });
        } else {
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
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1&accept-language=ja`;
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
      const s = saved[c.key];
      result[c.key] = { loading: false, result: s?.text || null, error: null, fetchedAt: s?.fetchedAt || null };
    });
    return result;
  };

  const [data, setData] = useState(loadSaved);
  const [activeTab, setActiveTab] = useState('trouble');

  // データをlocalStorageに保存
  const saveToStorage = useCallback((newData) => {
    const toSave = {};
    Object.keys(newData).forEach(key => {
      if (newData[key].result) {
        toSave[key] = { text: newData[key].result, fetchedAt: newData[key].fetchedAt };
      }
    });
    AppStorage.set(STORAGE_KEY, toSave);
  }, [STORAGE_KEY]);

  // カテゴリ別取得
  const handleFetch = useCallback(async (categoryKey) => {
    const cat = categories.find(c => c.key === categoryKey);
    if (!cat) return;

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
  }, [geminiApiKey, region, categories, saveToStorage]);

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
    let i = 0;

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
      if (trimmed.startsWith('【') && trimmed.includes('】')) {
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
      if (/^[-*・]/.test(trimmed) && trimmed.length > 1) {
        const content = trimmed.replace(/^[-*・]\s*/, '');
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

  // APIキー未設定時
  if (!geminiApiKey) {
    return React.createElement('div', null,
      React.createElement('h1', { className: 'page-title' },
        React.createElement('span', { className: 'material-icons-round' }, 'directions_transit'),
        '公共交通機関情報'
      ),
      React.createElement(Card, null,
        React.createElement('div', {
          style: {
            textAlign: 'center', padding: 'var(--space-lg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
          },
        },
          React.createElement('span', {
            className: 'material-icons-round',
            style: { fontSize: '36px', color: 'var(--color-primary-light)', opacity: 0.5 },
          }, 'smart_toy'),
          React.createElement('div', { style: { fontWeight: 600, fontSize: 'var(--font-size-sm)' } }, '公共交通機関情報'),
          React.createElement('div', { style: { color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)', lineHeight: 1.6 } },
            'Gemini APIキーを設定すると、AIで交通機関の運行情報を取得できます'
          ),
          React.createElement(Button, {
            variant: 'secondary',
            icon: 'settings',
            onClick: () => document.dispatchEvent(new CustomEvent('navigate', { detail: 'settings' })),
            style: { fontSize: '12px' },
          }, '設定ページへ')
        )
      )
    );
  }

  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const anyLoading = categories.some(c => data[c.key]?.loading);
  const activeCat = categories.find(c => c.key === activeTab);
  const activeData = data[activeTab] || { loading: false, result: null, error: null, fetchedAt: null };

  return React.createElement('div', null,
    React.createElement('h1', { className: 'page-title' },
      React.createElement('span', { className: 'material-icons-round' }, 'directions_transit'),
      '公共交通機関情報'
    ),

    // 上部: 日付 + 取得ボタン群
    React.createElement(Card, { style: { marginBottom: 'var(--space-md)' } },
      // 日付
      React.createElement('div', {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '12px', flexWrap: 'wrap', gap: '8px',
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
            style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' },
          },
            regionLoading
              ? React.createElement(React.Fragment, null,
                  React.createElement('span', {
                    className: 'material-icons-round',
                    style: { fontSize: '14px', animation: 'spin 1s linear infinite' },
                  }, 'sync'),
                  '地域を検出中...'
                )
              : region
                ? React.createElement(React.Fragment, null,
                    React.createElement('span', {
                      className: 'material-icons-round',
                      style: { fontSize: '14px', color: 'var(--color-primary-light)' },
                    }, 'place'),
                    region
                  )
                : React.createElement(React.Fragment, null,
                    React.createElement('span', {
                      className: 'material-icons-round',
                      style: { fontSize: '14px', opacity: 0.5 },
                    }, 'place'),
                    'GPS地域未検出（デフォルト: 東京都内）'
                  )
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
        style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' },
      },
        categories.map(cat => {
          const catData = data[cat.key] || {};
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
        const catData = data[cat.key] || {};
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

    // コンテンツエリア
    activeData.loading
      ? React.createElement(Card, null,
          React.createElement('div', {
            style: {
              padding: 'var(--space-xl)', textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
            },
          },
            React.createElement('span', {
              className: 'material-icons-round',
              style: { fontSize: '36px', color: `rgb(${activeCat.color})`, animation: 'spin 1s linear infinite' },
            }, 'sync'),
            React.createElement('span', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' } },
              activeCat.label + 'の情報を取得中...'
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
                '※ AIによる回答です。最新情報は各交通機関の公式サイトでご確認ください'
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
                }, activeCat.label + 'の情報を取得')
              )
            )
  );
};
