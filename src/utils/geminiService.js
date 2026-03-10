(function() {
// geminiService.js - Gemini AI API連携サービス
//
// Google Gemini 2.0 Flash を使用してAI検索を行うサービス層。
// 公共交通機関情報やイベント情報の検索に使用する。

window.GeminiService = (() => {
  const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  // レート制限: 最小リクエスト間隔（ミリ秒）
  const MIN_REQUEST_INTERVAL = 2000;
  let _lastRequestTime = 0;

  function _checkRateLimit() {
    const now = Date.now();
    if (now - _lastRequestTime < MIN_REQUEST_INTERVAL) {
      return false;
    }
    _lastRequestTime = now;
    return true;
  }

  // API応答のバリデーション共通処理
  const MAX_RESPONSE_SIZE = 100000;
  function _parseGeminiResponse(raw) {
    if (raw.length > MAX_RESPONSE_SIZE) {
      return { success: false, error: 'API応答が大きすぎます' };
    }
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !Array.isArray(data.candidates)) {
      return { success: false, error: 'API応答形式が不正です' };
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text || typeof text !== 'string') {
      return { success: false, error: '応答が空でした' };
    }
    return { success: true, text: text.slice(0, 50000) };
  }

  // Gemini APIにリクエストを送信
  async function callGemini(apiKey, prompt) {
    if (!apiKey) {
      return { success: false, error: 'Gemini APIキーが設定されていません' };
    }
    if (!_checkRateLimit()) {
      return { success: false, error: '連続リクエスト制限中です。少し待ってから再試行してください。' };
    }

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048,
          },
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error?.message || `HTTPエラー: ${response.status}`;
        if (response.status === 400) return { success: false, error: 'APIキーが無効です。正しいキーを設定してください。' };
        if (response.status === 429) return { success: false, error: 'API利用制限に達しました。しばらく待ってから再試行してください。' };
        return { success: false, error: errMsg };
      }

      return _parseGeminiResponse(await response.text());
    } catch (e) {
      AppLogger.error('Gemini API呼び出しエラー', e.message);
      return { success: false, error: `通信エラー: ${e.message}` };
    }
  }

  // 公共交通機関の運行情報を検索
  async function searchTransitInfo(apiKey, query) {
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const prompt = `あなたはタクシードライバー向けの交通情報アシスタントです。
今日は${today}です。

以下の質問に対して、タクシー営業に役立つ公共交通機関の情報を簡潔に回答してください。
- 鉄道の運行状況、遅延、運休の情報
- バス路線の状況
- 終電・始発の時刻
- タクシー需要が増える可能性のあるポイント

回答は箇条書きで分かりやすくお願いします。推測や不確実な情報には「※推定」と明記してください。

質問: ${query}`;

    const result = await callGemini(apiKey, prompt);
    if (result.success) {
      AppLogger.info(`Gemini交通情報検索: ${query}`);
    }
    return result;
  }

  // 周辺イベント情報を検索
  async function searchEvents(apiKey, query, area) {
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const areaStr = area ? `エリア: ${area}\n` : '';
    const prompt = `あなたはタクシードライバー向けのイベント情報アシスタントです。
今日は${today}です。
${areaStr}
以下の質問に対して、タクシー需要に影響する可能性のあるイベント情報を回答してください。
各イベントについて以下の形式で回答してください:
- イベント名
- 日時（分かれば）
- 場所
- 規模の目安（小/中/大/特大）
- タクシー需要への影響予測（需要増/需要減/不明）

推測や不確実な情報には「※推定」と明記してください。

質問: ${query}`;

    const result = await callGemini(apiKey, prompt);
    if (result.success) {
      AppLogger.info(`Geminiイベント検索: ${query}`);
    }
    return result;
  }

  // 大容量レスポンス用のGemini API呼び出し
  async function callGeminiLarge(apiKey, prompt) {
    if (!apiKey) {
      return { success: false, error: 'Gemini APIキーが設定されていません' };
    }
    if (!_checkRateLimit()) {
      return { success: false, error: '連続リクエスト制限中です。少し待ってから再試行してください。' };
    }

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
          },
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error?.message || `HTTPエラー: ${response.status}`;
        if (response.status === 400) return { success: false, error: 'APIキーが無効です。正しいキーを設定してください。' };
        if (response.status === 429) return { success: false, error: 'API利用制限に達しました。しばらく待ってから再試行してください。' };
        return { success: false, error: errMsg };
      }

      return _parseGeminiResponse(await response.text());
    } catch (e) {
      AppLogger.error('Gemini API呼び出しエラー', e.message);
      return { success: false, error: `通信エラー: ${e.message}` };
    }
  }

  // 電車の運行時刻・運行情報を取得
  async function fetchTrainInfo(apiKey, region) {
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const area = region || '東京都内および近郊';
    const prompt = `あなたは公共交通機関の情報提供アシスタントです。
今日は${today}です。
ユーザーの現在地: ${area}

「${area}」およびその近郊で利用される主要鉄道路線について、本日の運行情報を網羅的に提供してください。

以下を含めてください:
- この地域を走るJR線の主要路線
- この地域を走る私鉄の主要路線
- この地域を走る地下鉄・モノレール等の路線

各路線について以下を記載してください:
- 始発時刻と終電時刻（主要駅基準）
- 本日の運行ダイヤ（平日/休日ダイヤ）
- ピーク時の運行間隔
- 現在の運行状況（通常運行/遅延/運休など）

見やすい表形式や箇条書きで整理してください。
※情報が確認できない場合は「※一般的な時刻」と明記してください。`;

    const result = await callGeminiLarge(apiKey, prompt);
    if (result.success) {
      AppLogger.info(`Gemini: 電車運行情報を取得 (${area})`);
    }
    return result;
  }

  // バスの運行時刻（旭川駅前バスターミナル実データ）
  // ※2025年12月改正冬ダイヤ準拠。空港バスは月ごとにフライト連動で変わるため目安。
  async function fetchBusInfo(_apiKey, _region) {
    const now = new Date();
    const isWeekend = [0, 6].includes(now.getDay());
    const dayType = isWeekend ? '土日祝日ダイヤ' : '平日ダイヤ';
    const dateStr = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

    // --- 高速あさひかわ号（札幌⇔旭川）全便 ---
    const asahikawaDepAll = [
      '06:00','07:00','07:30','08:00','08:30','09:00','09:30','10:00',
      '11:00','11:40','12:20','13:00','13:30','14:00','14:40','15:20',
      '15:50','16:30','17:00','17:30','18:00','18:40','19:00','19:30','20:30','21:30',
    ];
    const asahikawaDepWeekend = ['08:45','10:30','14:20']; // 土日祝のみ
    const asahikawaDepOp = {
      '06:00':'中央バス','07:00':'道北バス','07:30':'中央バス','08:00':'道北バス',
      '08:30':'中央バス','08:45':'中央バス','09:00':'中央バス','09:30':'道北バス',
      '10:00':'道北バス','10:30':'中央バス','11:00':'中央バス','11:40':'中央バス',
      '12:20':'JR北海道バス','13:00':'道北バス','13:30':'中央バス','14:00':'中央バス',
      '14:20':'中央バス','14:40':'道北バス','15:20':'中央バス','15:50':'中央バス',
      '16:30':'道北バス','17:00':'中央バス','17:30':'中央バス','18:00':'JR北海道バス',
      '18:40':'中央バス','19:00':'中央バス','19:30':'JR北海道バス','20:30':'中央バス','21:30':'中央バス',
    };
    // 札幌発→旭川着（冬ダイヤ: 所要2時間25分）
    const sapporoDepAll = [
      '07:00','08:00','08:30','09:00','09:50','10:30','11:00','11:30',
      '12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30',
      '16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:40','20:20','20:50','21:30',
    ];
    const sapporoDepWeekend = ['13:45','19:20'];
    const sapporoDepOp = {
      '07:00':'中央バス','08:00':'JR北海道バス','08:30':'中央バス','09:00':'中央バス',
      '09:50':'中央バス','10:30':'中央バス','11:00':'JR北海道バス','11:30':'道北バス',
      '12:00':'中央バス','12:30':'道北バス','13:00':'中央バス','13:30':'中央バス',
      '13:45':'中央バス','14:00':'道北バス','14:30':'JR北海道バス','15:00':'道北バス',
      '15:30':'中央バス','16:00':'中央バス','16:30':'中央バス','17:00':'中央バス',
      '17:30':'中央バス','18:00':'道北バス','18:30':'中央バス','19:00':'中央バス',
      '19:20':'中央バス','19:40':'道北バス','20:20':'中央バス','20:50':'道北バス','21:30':'中央バス',
    };
    function addMin(hhmm, min) {
      const [h, m] = hhmm.split(':').map(Number);
      const t = h * 60 + m + min;
      return String(Math.floor(t / 60)).padStart(2,'0') + ':' + String(t % 60).padStart(2,'0');
    }

    // --- 都市間バス ---
    // 特急オホーツク号（紋別方面）
    const monbetsuDep = [{t:'12:45',arr:'紋別',dur:'3時間',op:'道北バス/北紋バス'},{t:'17:15',arr:'紋別',dur:'3時間',op:'道北バス/北紋バス'}];
    const monbetsuArr = [{t:'09:45',from:'紋別',op:'道北バス/北紋バス'},{t:'14:45',from:'紋別',op:'道北バス/北紋バス'}];
    // ノースライナー号（帯広方面）
    const obihiroDep = [
      {t:'07:55',arr:'帯広',dur:'4時間10分',op:'拓殖バス/道北バス/十勝バス'},
      {t:'09:30',arr:'帯広',dur:'4時間10分',op:'拓殖バス/道北バス/十勝バス'},
      {t:'14:10',arr:'帯広',dur:'4時間10分',op:'拓殖バス/道北バス/十勝バス'},
      {t:'15:35',arr:'帯広',dur:'4時間10分',op:'拓殖バス/道北バス/十勝バス'},
      {t:'17:10',arr:'帯広',dur:'4時間10分',op:'拓殖バス/道北バス/十勝バス'},
    ];
    const obihiroArr = [
      {t:'12:00',from:'帯広',op:'拓殖バス/道北バス/十勝バス'},
      {t:'13:30',from:'帯広',op:'拓殖バス/道北バス/十勝バス'},
      {t:'15:10',from:'帯広',op:'拓殖バス/道北バス/十勝バス'},
      {t:'19:55',from:'帯広',op:'拓殖バス/道北バス/十勝バス'},
      {t:'21:10',from:'帯広',op:'拓殖バス/道北バス/十勝バス'},
    ];
    // サンライズ旭川・釧路号（北見方面）
    const kitamiDep = [
      {t:'07:50',arr:'北見',dur:'3時間25分',op:'道北バス/北見バス/阿寒バス'},
      {t:'13:05',arr:'北見',dur:'3時間25分',op:'道北バス/北見バス/阿寒バス'},
    ];
    const kitamiArr = [
      {t:'15:15',from:'北見',op:'道北バス/北見バス/阿寒バス'},
      {t:'20:30',from:'北見',op:'道北バス/北見バス/阿寒バス'},
    ];
    // 名寄線（道北バス路線バス）
    const nayoroDep = [
      {t:'06:35',arr:'名寄',dur:'2時間32分',op:'道北バス'},
      {t:'09:10',arr:'名寄',dur:'2時間49分',op:'道北バス'},
      {t:'10:25',arr:'名寄',dur:'2時間49分',op:'道北バス'},
      {t:'12:00',arr:'名寄',dur:'2時間49分',op:'道北バス'},
      {t:'14:45',arr:'名寄',dur:'2時間49分',op:'道北バス'},
      {t:'17:20',arr:'名寄',dur:'2時間49分',op:'道北バス'},
    ];
    const nayoroArr = [
      {t:'09:07',from:'名寄',op:'道北バス'},{t:'11:59',from:'名寄',op:'道北バス'},
      {t:'13:14',from:'名寄',op:'道北バス'},{t:'14:49',from:'名寄',op:'道北バス'},
      {t:'17:34',from:'名寄',op:'道北バス'},{t:'20:09',from:'名寄',op:'道北バス'},
    ];
    // 特急天北号（鬼志別方面）
    const tenpokuDep = [{t:'14:30',arr:'鬼志別',dur:'約5時間',op:'宗谷バス/道北バス'}];
    const tenpokuArr = [{t:'11:10',from:'鬼志別',op:'宗谷バス/道北バス'}];

    // --- 空港連絡バス（2月ダイヤ目安） ---
    const airportDep = [
      {t:'06:56',arr:'旭川空港',op:'旭川電気軌道'},{t:'07:51',arr:'旭川空港',op:'旭川電気軌道'},
      {t:'11:36',arr:'旭川空港',op:'旭川電気軌道'},{t:'12:11',arr:'旭川空港',op:'旭川電気軌道'},
      {t:'12:46',arr:'旭川空港',op:'旭川電気軌道'},{t:'14:11',arr:'旭川空港',op:'旭川電気軌道'},
      {t:'17:36',arr:'旭川空港',op:'旭川電気軌道'},{t:'17:41',arr:'旭川空港',op:'旭川電気軌道'},
    ];
    const airportArr = [
      {t:'09:19',from:'旭川空港',op:'旭川電気軌道'},{t:'10:09',from:'旭川空港',op:'旭川電気軌道'},
      {t:'13:49',from:'旭川空港',op:'旭川電気軌道'},{t:'14:49',from:'旭川空港',op:'旭川電気軌道'},
      {t:'15:09',from:'旭川空港',op:'旭川電気軌道'},{t:'16:39',from:'旭川空港',op:'旭川電気軌道'},
      {t:'19:49',from:'旭川空港',op:'旭川電気軌道'},{t:'19:59',from:'旭川空港',op:'旭川電気軌道'},
    ];

    // --- 旭山動物園線（冬期） ---
    const zooDep = [
      {t:'08:40',arr:'旭山動物園',op:'旭川電気軌道'},{t:'09:40',arr:'旭山動物園',op:'旭川電気軌道'},
      {t:'11:10',arr:'旭山動物園',op:'旭川電気軌道'},{t:'12:10',arr:'旭山動物園',op:'旭川電気軌道'},
      {t:'13:10',arr:'旭山動物園',op:'旭川電気軌道'},{t:'14:40',arr:'旭山動物園',op:'旭川電気軌道'},
    ];
    const zooArr = [
      {t:'11:40',from:'旭山動物園',op:'旭川電気軌道'},{t:'12:10',from:'旭山動物園',op:'旭川電気軌道'},
      {t:'13:10',from:'旭山動物園',op:'旭川電気軌道'},{t:'14:10',from:'旭山動物園',op:'旭川電気軌道'},
      {t:'15:40',from:'旭山動物園',op:'旭川電気軌道'},{t:'16:10',from:'旭山動物園',op:'旭川電気軌道'},
    ];

    // --- テキスト生成 ---
    const nowHH = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    let text = `## 旭川駅前バスターミナル 時刻表\n📅 ${dateStr}（${dayType}）\n⏰ ${nowHH} 現在\n\n`;
    text += `※2025年12月改正冬ダイヤ準拠　空港バスはフライト連動のため月ごとに変動あり\n\n`;

    // ---- 到着便 ----
    text += `### 🚌 旭川駅前 到着便\n\n`;

    // 高速あさひかわ号 到着
    text += `**■ 高速あさひかわ号 到着（札幌→旭川 所要: 冬2時間25分/夏2時間5分）**\n`;
    text += `| 時刻 | 札幌発 | バス会社 | 備考 |\n|------|--------|----------|------|\n`;
    let sapAll = [...sapporoDepAll];
    if (isWeekend) sapAll = sapAll.concat(sapporoDepWeekend);
    sapAll.sort();
    sapAll.forEach(dep => {
      const arr = addMin(dep, 145); // 冬: 2h25m
      const mark = arr >= nowHH && arr <= addMin(nowHH, 30) ? ' 🚕需要高' : (arr < nowHH ? ' ✅到着済' : '');
      const wknd = sapporoDepWeekend.includes(dep) ? '土日祝のみ' : '';
      text += `| **${arr}** | ${dep}発 | ${sapporoDepOp[dep] || ''} | ${wknd}${mark} |\n`;
    });

    // 都市間バス到着
    text += `\n**■ 都市間バス 到着**\n`;
    text += `| 時刻 | 路線名 | 出発地 | バス会社 | 備考 |\n|------|--------|--------|----------|------|\n`;
    const interArr = [
      ...monbetsuArr.map(a => ({t:a.t,name:'特急オホーツク号',from:a.from,op:a.op})),
      ...obihiroArr.map(a => ({t:a.t,name:'ノースライナー号',from:a.from,op:a.op})),
      ...kitamiArr.map(a => ({t:a.t,name:'サンライズ号',from:a.from,op:a.op})),
      ...nayoroArr.map(a => ({t:a.t,name:'名寄線',from:a.from,op:a.op})),
      ...tenpokuArr.map(a => ({t:a.t,name:'特急天北号',from:a.from,op:a.op})),
    ].sort((a,b) => a.t.localeCompare(b.t));
    interArr.forEach(a => {
      const mark = a.t >= nowHH && a.t <= addMin(nowHH, 30) ? ' 🚕需要高' : (a.t < nowHH ? ' ✅到着済' : '');
      text += `| **${a.t}** | ${a.name} | ${a.from} | ${a.op} | ${mark} |\n`;
    });

    // 空港バス到着
    text += `\n**■ 空港連絡バス 到着（旭川空港→旭川駅 所要: 約39分）**\n`;
    text += `| 時刻 | バス会社 | 備考 |\n|------|----------|------|\n`;
    airportArr.forEach(a => {
      const mark = a.t >= nowHH && a.t <= addMin(nowHH, 30) ? ' 🚕需要高' : (a.t < nowHH ? ' ✅到着済' : '');
      text += `| **${a.t}** | ${a.op} | ${mark} |\n`;
    });

    // 動物園線到着
    text += `\n**■ 旭山動物園線 到着（動物園→旭川駅 所要: 約40-50分）**\n`;
    text += `| 時刻 | バス会社 | 備考 |\n|------|----------|------|\n`;
    zooArr.forEach(a => {
      const mark = a.t < nowHH ? ' ✅到着済' : '';
      text += `| **${a.t}** | ${a.op} | ${mark} |\n`;
    });

    // ---- 出発便 ----
    text += `\n---\n\n### 🚌 旭川駅前 出発便\n\n`;

    // 高速あさひかわ号 出発
    text += `**■ 高速あさひかわ号 出発（旭川→札幌 所要: 冬2時間25分/夏2時間5分）**\n`;
    text += `| 時刻 | バス会社 | 備考 |\n|------|----------|------|\n`;
    let depAll = [...asahikawaDepAll];
    if (isWeekend) depAll = depAll.concat(asahikawaDepWeekend);
    depAll.sort();
    depAll.forEach(dep => {
      const mark = dep < nowHH ? ' ✅出発済' : '';
      const wknd = asahikawaDepWeekend.includes(dep) ? '土日祝のみ' : '';
      text += `| **${dep}** | ${asahikawaDepOp[dep] || ''} | ${wknd}${mark} |\n`;
    });

    // 都市間バス出発
    text += `\n**■ 都市間バス 出発**\n`;
    text += `| 時刻 | 路線名 | 行先 | バス会社 | 備考 |\n|------|--------|------|----------|------|\n`;
    const interDep = [
      ...monbetsuDep.map(d => ({t:d.t,name:'特急オホーツク号',to:d.arr,dur:d.dur,op:d.op})),
      ...obihiroDep.map(d => ({t:d.t,name:'ノースライナー号',to:d.arr,dur:d.dur,op:d.op})),
      ...kitamiDep.map(d => ({t:d.t,name:'サンライズ号',to:d.arr,dur:d.dur,op:d.op})),
      ...nayoroDep.map(d => ({t:d.t,name:'名寄線',to:d.arr,dur:d.dur,op:d.op})),
      ...tenpokuDep.map(d => ({t:d.t,name:'特急天北号',to:d.arr,dur:d.dur,op:d.op})),
    ].sort((a,b) => a.t.localeCompare(b.t));
    interDep.forEach(d => {
      const mark = d.t < nowHH ? ' ✅出発済' : '';
      text += `| **${d.t}** | ${d.name} | ${d.to}（${d.dur}） | ${d.op} | ${mark} |\n`;
    });

    // 空港バス出発
    text += `\n**■ 空港連絡バス 出発（旭川駅→旭川空港 所要: 約44分）**\n`;
    text += `| 時刻 | バス会社 | 備考 |\n|------|----------|------|\n`;
    airportDep.forEach(d => {
      const mark = d.t < nowHH ? ' ✅出発済' : '';
      text += `| **${d.t}** | ${d.op} | ${mark} |\n`;
    });

    // 動物園線出発
    text += `\n**■ 旭山動物園線 出発（旭川駅→動物園 所要: 約40-50分）**\n`;
    text += `| 時刻 | バス会社 | 備考 |\n|------|----------|------|\n`;
    zooDep.forEach(d => {
      const mark = d.t < nowHH ? ' ✅出発済' : '';
      text += `| **${d.t}** | ${d.op} | ${mark} |\n`;
    });

    text += `\n---\n※ 高速あさひかわ号は予約不要（自由席）。都市間バス（紋別・帯広・北見・天北）は要予約。\n`;
    text += `※ 空港連絡バスはフライトスケジュール連動のため毎月変更あり。最新は旭川電気軌道HPでご確認ください。\n`;
    text += `※ 高速えんがる号は旭川駅に停車しません。特急北大雪号（旭川⇔遠軽）は現在運休中です。\n`;
    text += `※ 高速なよろ号（札幌⇔名寄直行）は旭川駅に停車しません。上記は道北バス名寄線（路線バス）です。\n`;

    AppLogger.info('バス時刻表: 旭川駅前ハードコードデータを生成');
    return { success: true, text: text };
  }

  // 飛行機の運航時刻・運航情報を取得
  async function fetchFlightInfo(apiKey, region) {
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const area = region || '東京都';
    const prompt = `あなたは公共交通機関の情報提供アシスタントです。
今日は${today}です。
ユーザーの現在地: ${area}

「${area}」から最も近い主要空港について、本日のフライト情報を網羅的に提供してください。

まず「${area}」の最寄りの主要空港を特定し、各空港について以下を提供してください:
- 国内線: 主要路線の出発・到着便
- 国際線: 主要路線の出発・到着便（該当する場合）
- 各ターミナルの利用航空会社

以下の情報も含めてください:
- 早朝便（始発〜7時）と深夜便（21時以降）の一覧（タクシー需要が高い時間帯）
- ピーク時間帯（到着便が集中する時間）
- 現在の運航状況（通常運航/遅延/欠航など）
- 天候による影響（ある場合）

見やすい表形式や箇条書きで整理してください。
※情報が確認できない場合は「※一般的なスケジュール」と明記してください。`;

    const result = await callGeminiLarge(apiKey, prompt);
    if (result.success) {
      AppLogger.info(`Gemini: 飛行機運航情報を取得 (${area})`);
    }
    return result;
  }

  // 遅延・トラブル情報を取得
  async function fetchTroubleInfo(apiKey, region) {
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const now = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const area = region || '東京都内';
    const prompt = `あなたは公共交通機関の情報提供アシスタントです。
今日は${today}、現在時刻は${now}です。
ユーザーの現在地: ${area}

「${area}」およびその近郊で現在発生している公共交通機関の遅延・トラブル・運休情報をすべて提供してください。

【確認対象】
1. 鉄道（この地域のJR・私鉄・地下鉄すべて）
2. バス（公営バス・民営バス・高速バス）
3. 航空（最寄り空港の発着便）
4. その他（モノレール・新交通システム等）

【各トラブルについて以下を記載】
- 路線名・区間
- トラブルの種類（遅延/運休/運転見合わせ/徐行運転/振替輸送等）
- 原因（人身事故/車両故障/天候/信号故障等）
- 発生時刻（分かれば）
- 復旧見込み（分かれば）
- 影響度（小/中/大）
- タクシー需要への影響（需要増のエリア・駅を具体的に）

【追加情報】
- 本日予定されている計画運休・工事運休
- 天候による今後の影響予測
- 振替輸送の実施状況

タクシードライバーの営業に役立つ観点でまとめてください。
トラブルがない場合は「現在、大きなトラブルは報告されていません」と回答してください。
※リアルタイム情報が不明な場合は「※最新情報は各社公式サイトで確認してください」と明記してください。`;

    const result = await callGeminiLarge(apiKey, prompt);
    if (result.success) {
      AppLogger.info(`Gemini: 遅延・トラブル情報を取得 (${area})`);
    }
    return result;
  }

  // 需要予測JSONパーサー: コードブロック抽出 → 生JSON → ブレース抽出 → 空フォールバック
  function _parseDemandPlanJson(text) {
    const empty = { transitArrivals: [], hospitalWindows: [], demandWindows: [], dailyPlan: [] };
    if (!text || typeof text !== 'string') return empty;
    // 1. コードブロック内のJSON抽出
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try { return { ...empty, ...JSON.parse(codeBlockMatch[1].trim()) }; } catch(e) {}
    }
    // 2. そのままJSON
    try { return { ...empty, ...JSON.parse(text.trim()) }; } catch(e) {}
    // 3. ブレース抽出
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try { return { ...empty, ...JSON.parse(braceMatch[0]) }; } catch(e) {}
    }
    return empty;
  }

  // 交通需要プラン取得（構造化JSON）
  async function fetchDailyDemandPlan(apiKey, area) {
    area = area || '旭川';
    const today = new Date();
    const dow = ['日','月','火','水','木','金','土'][today.getDay()];
    const dateStr = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日(${dow})`;

    const dayOfMonth = today.getDate();
    const isEvenDay = dayOfMonth % 2 === 0;
    const stationRule = isEvenDay
      ? `本日は${dayOfMonth}日（偶数日）のため旭川駅前でタクシー待ち営業が可能です。駅前待機を積極的に組み込んでください。`
      : `本日は${dayOfMonth}日（奇数日）のため旭川駅前でのタクシー待ち営業はできません。駅前待機は除外し、病院・商業施設周辺での流し営業を中心にプランを作成してください。`;

    const prompt = `あなたは北海道${area}のタクシー需要予測AIです。
本日は${dateStr}です。

【重要ルール】${stationRule}

以下のJSON形式で、本日の交通需要予測データを返してください。
JSONのみを返し、他のテキストは不要です。

{
  "transitArrivals": [
    { "type": "JR特急", "line": "ライラック", "arrivalTime": "09:30", "origin": "札幌", "demandDelay": 5, "peakWeight": 0.8 }
  ],
  "hospitalWindows": [
    { "name": "旭川医科大学病院", "peakStart": "08:00", "peakEnd": "11:00", "type": "morning", "weight": 0.7 }
  ],
  "demandWindows": [
    { "startTime": "09:25", "endTime": "10:00", "location": "旭川駅", "level": "high", "overlappingArrivals": ["ライラック"], "reason": "JR特急到着+通勤" }
  ],
  "dailyPlan": [
    { "startTime": "06:00", "endTime": "08:00", "location": "旭川駅", "action": "早朝の通勤需要を狙う", "demandLevel": "medium" }
  ]
}

要件:
- transitArrivals: ${area}駅に到着するJR特急・高速バスの本日の時刻表（主要便）。demandDelayは到着後の需要ピークまでの分数。peakWeightは0-1の需要強度。
- hospitalWindows: ${area}市内の主要病院の外来受付ピーク。typeはmorning/afternoon。weightは0-1。
- demandWindows: 上記を組み合わせた需要ピーク時間帯。levelはhigh/medium/low。
- dailyPlan: タクシードライバーの1日の推奨営業プラン（6時〜22時、1-2時間ごとのブロック）。

実際の${area}の時刻表・病院情報に基づいてできるだけ正確に回答してください。`;

    const result = await callGeminiLarge(apiKey, prompt);
    if (result.success) {
      const parsed = _parseDemandPlanJson(result.text);
      AppLogger.info(`Gemini: 需要予測プラン取得 - 到着便${parsed.transitArrivals.length}件, プラン${parsed.dailyPlan.length}ブロック`);
      return { success: true, data: parsed, raw: result.text };
    }
    return { success: false, error: result.error, data: null };
  }

  // APIキーの接続テスト
  async function testConnection(apiKey) {
    const result = await callGemini(apiKey, 'こんにちは。接続テストです。「接続成功」と一言だけ返答してください。');
    return result;
  }

  // レシート画像から金額を読み取る（Vision API）
  async function analyzeReceiptImage(apiKey, base64Image, mimeType) {
    if (!_checkRateLimit()) {
      throw new Error('連続リクエスト制限中です。少し待ってから再試行してください。');
    }
    const body = {
      contents: [{
        parts: [
          { text: 'このタクシーの領収書・レシート画像から「計」の行に記載されている合計金額を読み取ってください。「計」「合計」「総額」「お支払い」などの行の金額です。数値のみを返してください（円、¥、カンマなどの記号は不要）。金額が見つからない場合は「0」を返してください。' },
          { inlineData: { mimeType, data: base64Image } }
        ]
      }]
    };
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API エラー (${res.status}): ${errText}`);
    }
    const parsed = _parseGeminiResponse(await res.text());
    if (!parsed.success) throw new Error(parsed.error);
    const text = parsed.text || '';
    const match = text.replace(/[,，\s]/g, '').match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }

  // ホテル価格一括取得
  async function fetchHotelPrices(apiKey, hotels) {
    const today = new Date();
    const dateStr = today.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const hotelList = hotels.map((h, i) => `${i + 1}. ${h.name}`).join('\n');

    const prompt = `あなたは北海道旭川市のホテル価格調査アシスタントです。
今日は${dateStr}です。

以下の旭川市内ホテルについて、本日のスタンダードシングル（またはダブル）1泊の標準的な宿泊料金（税込）を調査してください。

${hotelList}

以下のJSON配列のみを返してください。他のテキストは不要です。
各ホテルの料金が不明な場合は、同クラスのホテルの相場から推定し、estimatedをtrueにしてください。

[
  { "name": "ホテル名", "price": 8000, "estimated": false },
  ...
]

注意:
- priceは数値（円単位、税込）
- 繁忙期や週末は通常より高くなる場合があります
- 料金が分からない場合でも必ず推定値を返してください`;

    const result = await callGemini(apiKey, prompt);
    if (!result.success) return result;

    try {
      const jsonText = result.text.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
      const prices = JSON.parse(jsonText);
      if (!Array.isArray(prices)) return { success: false, error: '応答形式が不正です' };
      AppLogger.info(`Gemini: ホテル価格${prices.length}件取得`);
      return { success: true, prices };
    } catch (e) {
      AppLogger.error('ホテル価格パースエラー', e.message);
      return { success: false, error: '価格データの解析に失敗しました' };
    }
  }

  return {
    callGemini,
    searchTransitInfo,
    searchEvents,
    callGeminiLarge,
    fetchTrainInfo,
    fetchBusInfo,
    fetchFlightInfo,
    fetchTroubleInfo,
    fetchDailyDemandPlan,
    testConnection,
    analyzeReceiptImage,
    fetchHotelPrices,
  };
})();
})();
