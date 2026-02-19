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

  // APIキーの接続テスト
  async function testConnection(apiKey) {
    const result = await callGemini(apiKey, 'こんにちは。接続テストです。「接続成功」と一言だけ返答してください。');
    return result;
  }

  return {
    callGemini,
    searchTransitInfo,
    searchEvents,
    testConnection,
  };
})();
