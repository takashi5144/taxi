(function() {
// sheetsService.js - Google スプレッドシート連携（Apps Script Web App）
// 無料。ブラウザから POST（text/plain）で CORS 問題を回避。
window.GoogleSheetsService = (() => {
  const KEYS = {
    URL: 'taxi_app_sheets_webapp_url',
    SECRET: 'taxi_app_sheets_secret',
    AUTO: 'taxi_app_sheets_auto_sync',
    SHEET: 'taxi_app_sheets_sheet_name',
  };

  const HEADERS = [
    'ID', '日付', '合算日', '曜日', '祝日', '記録日時',
    '金額', '支払方法', '割引額', 'クーポン額',
    '乗車時間', '降車時間', '人数',
    '乗車地', '降車地', 'メモ',
  ];

  function getConfig() {
    return {
      webAppUrl: (localStorage.getItem(KEYS.URL) || '').trim(),
      secret: (localStorage.getItem(KEYS.SECRET) || '').trim(),
      autoSync: localStorage.getItem(KEYS.AUTO) === 'true',
      sheetName: (localStorage.getItem(KEYS.SHEET) || '売上記録').trim() || '売上記録',
    };
  }

  function saveConfig(partial) {
    const cur = getConfig();
    const next = { ...cur, ...partial };
    localStorage.setItem(KEYS.URL, (next.webAppUrl || '').trim());
    localStorage.setItem(KEYS.SECRET, (next.secret || '').trim());
    localStorage.setItem(KEYS.AUTO, next.autoSync ? 'true' : 'false');
    localStorage.setItem(KEYS.SHEET, (next.sheetName || '売上記録').trim() || '売上記録');
    return getConfig();
  }

  function isConfigured() {
    return !!getConfig().webAppUrl;
  }

  function isAutoSyncEnabled() {
    const c = getConfig();
    return c.autoSync && !!c.webAppUrl;
  }

  function paymentLabel(method) {
    if (method === 'uncollected') return '未収';
    if (method === 'didi') return 'DIDI決済';
    if (method === 'uber') return 'Uber';
    return '現金';
  }

  function entryToRow(e) {
    if (!e) return null;
    const entryDate = e.date || '';
    const shiftDate = e.shiftDate || entryDate;
    let dateTime = '';
    try {
      dateTime = e.timestamp ? new Date(e.timestamp).toLocaleString('ja-JP') : '';
    } catch { dateTime = e.timestamp || ''; }
    return [
      String(e.id || ''),
      entryDate,
      shiftDate,
      e.dayOfWeek || '',
      e.holiday || '',
      dateTime,
      e.amount != null ? Number(e.amount) : 0,
      paymentLabel(e.paymentMethod),
      e.discountAmount || 0,
      e.couponAmount || 0,
      e.pickupTime || '',
      e.dropoffTime || '',
      e.passengers || '',
      e.pickup || '',
      e.dropoff || '',
      e.memo || '',
    ];
  }

  async function request(payload) {
    const cfg = getConfig();
    if (!cfg.webAppUrl) {
      return { ok: false, error: 'WebアプリURLが未設定です' };
    }
    if (!/^https:\/\/script\.google\.com\//.test(cfg.webAppUrl)) {
      return { ok: false, error: 'URLは https://script.google.com/ で始まる必要があります' };
    }

    const body = JSON.stringify({
      ...payload,
      secret: cfg.secret,
      sheetName: cfg.sheetName,
    });

    try {
      const res = await fetch(cfg.webAppUrl, {
        method: 'POST',
        // text/plain にすると CORS プリフライトを避けやすい（GAS 定番）
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        redirect: 'follow',
      });
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        return json;
      } catch {
        if (res.ok) {
          return { ok: true, message: '応答を受信しました（JSON以外）', raw: text.slice(0, 200) };
        }
        return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  async function ping() {
    return request({ action: 'ping' });
  }

  async function replaceAll(entries) {
    const list = Array.isArray(entries) ? entries : [];
    const rows = list.map(entryToRow).filter(Boolean);
    return request({ action: 'replaceAll', headers: HEADERS, rows });
  }

  async function appendEntries(entries) {
    const list = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
    if (list.length === 0) return { ok: true, added: 0, skipped: 0 };
    const rows = list.map(entryToRow).filter(Boolean);
    return request({ action: 'append', headers: HEADERS, rows });
  }

  /** 全件をスプレッドシートに上書き同期 */
  async function syncAll() {
    if (!window.DataService) {
      return { ok: false, error: 'DataServiceが利用できません' };
    }
    const entries = DataService.getEntries();
    const result = await replaceAll(entries);
    if (result && result.ok) {
      if (window.AppLogger) AppLogger.info(`スプレッドシート全件同期: ${entries.length}件`);
    } else if (window.AppLogger) {
      AppLogger.warn('スプレッドシート全件同期失敗: ' + ((result && result.error) || ''));
    }
    return result;
  }

  /** 新規記録後の自動追記（失敗しても売上保存は妨げない） */
  function onEntriesSaved(entries) {
    if (!isAutoSyncEnabled()) return;
    const list = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
    if (list.length === 0) return;
    appendEntries(list).then((result) => {
      if (result && result.ok) {
        if (window.AppLogger) AppLogger.info(`スプレッドシート追記: +${result.added != null ? result.added : list.length}件`);
      } else if (window.AppLogger) {
        AppLogger.warn('スプレッドシート追記失敗: ' + ((result && result.error) || ''));
      }
    }).catch((err) => {
      if (window.AppLogger) AppLogger.warn('スプレッドシート追記例外: ' + (err.message || err));
    });
  }

  /** ユーザーが Google スプレッドシートに貼り付ける Apps Script */
  function getAppsScriptSource() {
    return `/**
 * タクシー売上サポート — スプレッドシート連携スクリプト
 *
 * セットアップ:
 * 1. 新しい Google スプレッドシートを作成
 * 2. 拡張機能 → Apps Script
 * 3. このコードをすべて貼り付けて保存
 * 4. （任意）プロジェクトの設定 → スクリプトプロパティ
 *    に SECRET = 任意のパスワード を追加
 * 5. デプロイ → 新しいデプロイ → 種類: ウェブアプリ
 *    - 実行ユーザー: 自分
 *    - アクセスできるユーザー: 全員
 * 6. デプロイ後の URL をアプリの設定に貼り付け
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var expected = PropertiesService.getScriptProperties().getProperty('SECRET') || '';
    if (expected && data.secret !== expected) {
      return jsonOut_({ ok: false, error: '認証エラー: シークレットが一致しません' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var name = data.sheetName || '売上記録';
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }

    if (data.action === 'ping') {
      return jsonOut_({
        ok: true,
        message: '接続OK',
        sheet: name,
        title: ss.getName(),
      });
    }

    var headers = data.headers || [];
    var rows = data.rows || [];
    var colCount = headers.length || (rows[0] ? rows[0].length : 0);

    if (data.action === 'replaceAll') {
      sheet.clear();
      if (headers.length) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
        sheet.setFrozenRows(1);
      }
      if (rows.length && colCount) {
        sheet.getRange(2, 1, rows.length + 1, colCount).setValues(rows);
      }
      try { sheet.autoResizeColumns(1, Math.max(colCount, 1)); } catch (ignore) {}
      return jsonOut_({ ok: true, action: 'replaceAll', count: rows.length });
    }

    if (data.action === 'append') {
      if (sheet.getLastRow() === 0 && headers.length) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
        sheet.setFrozenRows(1);
      }
      var existing = {};
      var last = sheet.getLastRow();
      if (last > 1) {
        var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
        for (var i = 0; i < ids.length; i++) {
          existing[String(ids[i][0])] = true;
        }
      }
      var toAdd = [];
      for (var j = 0; j < rows.length; j++) {
        var id = String(rows[j][0]);
        if (!existing[id]) toAdd.push(rows[j]);
      }
      if (toAdd.length) {
        var start = sheet.getLastRow() + 1;
        var w = colCount || toAdd[0].length;
        sheet.getRange(start, 1, start + toAdd.length - 1, w).setValues(toAdd);
      }
      return jsonOut_({
        ok: true,
        action: 'append',
        added: toAdd.length,
        skipped: rows.length - toAdd.length,
      });
    }

    return jsonOut_({ ok: false, error: '不明な action: ' + data.action });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return jsonOut_({
    ok: true,
    message: 'タクシー売上スプレッドシート連携。アプリから POST してください。',
  });
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
  }

  async function copyScriptToClipboard() {
    const src = getAppsScriptSource();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(src);
      return true;
    }
    // フォールバック
    const ta = document.createElement('textarea');
    ta.value = src;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(ta);
    }
  }

  return {
    KEYS,
    HEADERS,
    getConfig,
    saveConfig,
    isConfigured,
    isAutoSyncEnabled,
    ping,
    replaceAll,
    appendEntries,
    syncAll,
    onEntriesSaved,
    getAppsScriptSource,
    copyScriptToClipboard,
    entryToRow,
  };
})();
})();
