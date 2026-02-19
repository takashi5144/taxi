// geminiService.js - Gemini AI API連携サービス
//
// Google Gemini 2.0 Flash を使用してAI検索を行うサービス層。
// 公共交通機関情報やイベント情報の検索に使用する。

window.GeminiService = (() => {
  const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  // Gemini APIにリクエストを送信
  async function callGemini(apiKey, prompt) {
    if (!apiKey) {
      return { success: false, error: 'Gemini APIキーが設定されていません' };
    }

    try {
      const response = await fetch(`${API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        return { success: false, error: '応答が空でした' };
      }

      return { success: true, text };
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

    try {
      const response = await fetch(`${API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        return { success: false, error: '応答が空でした' };
      }

      return { success: true, text };
    } catch (e) {
      AppLogger.error('Gemini API呼び出しエラー', e.message);
      return { success: false, error: `通信エラー: ${e.message}` };
    }
  }

  // 電車の運行時刻・運行情報を取得
  async function fetchTrainInfo(apiKey) {
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const prompt = `あなたは公共交通機関の情報提供アシスタントです。
今日は${today}です。

東京都内および近郊の主要鉄道路線について、本日の運行情報を網羅的に提供してください。

以下の路線を含めてください:
【JR線】山手線、中央線、京浜東北線、総武線、埼京線、湘南新宿ライン、東海道線、横須賀線、常磐線、武蔵野線、京葉線
【私鉄】東急（東横線・田園都市線・目黒線）、小田急線、京王線、西武線（池袋線・新宿線）、東武線（東上線・スカイツリーライン）、京成線、京急線
【地下鉄】東京メトロ（銀座線・丸ノ内線・日比谷線・東西線・千代田線・有楽町線・半蔵門線・南北線・副都心線）、都営地下鉄（浅草線・三田線・新宿線・大江戸線）

各路線について以下を記載してください:
- 始発時刻と終電時刻（主要駅基準）
- 本日の運行ダイヤ（平日/休日ダイヤ）
- ピーク時の運行間隔
- 現在の運行状況（通常運行/遅延/運休など）

見やすい表形式や箇条書きで整理してください。
※情報が確認できない場合は「※一般的な時刻」と明記してください。`;

    const result = await callGeminiLarge(apiKey, prompt);
    if (result.success) {
      AppLogger.info('Gemini: 電車運行情報を取得');
    }
    return result;
  }

  // バスの運行時刻・運行情報を取得
  async function fetchBusInfo(apiKey) {
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const prompt = `あなたは公共交通機関の情報提供アシスタントです。
今日は${today}です。

東京都内の主要バス路線について、本日の運行情報を網羅的に提供してください。

以下のバス会社を含めてください:
【都営バス】主要系統（都01〜都06、品93、渋88、東43、王40など主要路線）
【民営バス】東急バス、小田急バス、京王バス、関東バス、西武バス、国際興業バス、東武バス
【高速バス・空港バス】リムジンバス（羽田・成田）、高速バスターミナル（バスタ新宿）発着の主要路線
【深夜バス】深夜急行バス（渋谷・新宿・東京発）

各路線・会社について以下を記載してください:
- 主要路線名と区間
- 始発・終バスの時刻
- 本日のダイヤ（平日/休日）
- 運行間隔（ピーク時/日中/夜間）
- 現在の運行状況

見やすい表形式や箇条書きで整理してください。
※情報が確認できない場合は「※一般的な時刻」と明記してください。`;

    const result = await callGeminiLarge(apiKey, prompt);
    if (result.success) {
      AppLogger.info('Gemini: バス運行情報を取得');
    }
    return result;
  }

  // 飛行機の運航時刻・運航情報を取得
  async function fetchFlightInfo(apiKey) {
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const prompt = `あなたは公共交通機関の情報提供アシスタントです。
今日は${today}です。

羽田空港（HND）と成田空港（NRT）の本日のフライト情報を網羅的に提供してください。

【羽田空港】
- 国内線: 主要路線（札幌・大阪・福岡・沖縄・名古屋・広島・仙台・鹿児島等）の出発・到着便
- 国際線: 主要路線の出発・到着便
- 各ターミナル（第1・第2・第3）の利用航空会社

【成田空港】
- 国際線: 主要路線（アジア・北米・欧州方面）の出発・到着便
- 国内線: 主要路線の出発・到着便
- 各ターミナル（第1・第2・第3）の利用航空会社

以下の情報を含めてください:
- 早朝便（始発〜7時）と深夜便（21時以降）の一覧（タクシー需要が高い時間帯）
- ピーク時間帯（到着便が集中する時間）
- 現在の運航状況（通常運航/遅延/欠航など）
- 天候による影響（ある場合）

見やすい表形式や箇条書きで整理してください。
※情報が確認できない場合は「※一般的なスケジュール」と明記してください。`;

    const result = await callGeminiLarge(apiKey, prompt);
    if (result.success) {
      AppLogger.info('Gemini: 飛行機運航情報を取得');
    }
    return result;
  }

  // 遅延・トラブル情報を取得
  async function fetchTroubleInfo(apiKey) {
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const now = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const prompt = `あなたは公共交通機関の情報提供アシスタントです。
今日は${today}、現在時刻は${now}です。

現在発生している公共交通機関の遅延・トラブル・運休情報をすべて提供してください。

【確認対象】
1. 鉄道（JR・私鉄・地下鉄すべて）
2. バス（都営・民営・高速バス）
3. 航空（羽田・成田発着便）
4. その他（モノレール・ゆりかもめ・つくばエクスプレス等）

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
      AppLogger.info('Gemini: 遅延・トラブル情報を取得');
    }
    return result;
  }

  // APIキーの接続テスト
  async function testConnection(apiKey) {
    const result = await callGemini(apiKey, 'こんにちは。接続テストです。「接続成功」と一言だけ返答してください。');
    return result;
  }

  return {
    callGemini,
    searchTransitInfo,
    searchEvents,
    fetchTrainInfo,
    fetchBusInfo,
    fetchFlightInfo,
    fetchTroubleInfo,
    testConnection,
  };
})();
