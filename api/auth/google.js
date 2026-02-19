import { put, list, del } from '@vercel/blob';

export default async function handler(req, res) {
  // CORS対応
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 認証チェック
  const secret = req.headers.authorization?.replace('Bearer ', '');
  if (secret !== process.env.SYNC_SECRET) {
    return res.status(401).json({ error: '認証エラー' });
  }

  const { action, code, redirectUri } = req.body;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Google OAuth未設定' });
  }

  const BLOB_PATH = 'auth/google_tokens.json';

  try {
    switch (action) {
      // authorization code → access_token + refresh_token
      case 'exchange': {
        if (!code) {
          return res.status(400).json({ error: 'authorization code が必要です' });
        }

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri || 'postmessage',
            grant_type: 'authorization_code',
          }),
        });

        const tokenData = await tokenRes.json();
        if (!tokenRes.ok) {
          return res.status(400).json({ error: tokenData.error_description || tokenData.error });
        }

        // refresh_tokenをBlobに保存
        if (tokenData.refresh_token) {
          await put(BLOB_PATH, JSON.stringify({
            refresh_token: tokenData.refresh_token,
            savedAt: new Date().toISOString(),
          }), {
            access: 'public',
            contentType: 'application/json',
            addRandomSuffix: false,
          });
        }

        // ユーザー情報取得
        let email = '';
        try {
          const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
          });
          if (userRes.ok) {
            const userInfo = await userRes.json();
            email = userInfo.email || '';
          }
        } catch {
          // メール取得失敗は無視
        }

        return res.json({
          access_token: tokenData.access_token,
          expires_in: tokenData.expires_in,
          email,
        });
      }

      // refresh_tokenでaccess_tokenを再取得
      case 'refresh': {
        // Blobからrefresh_tokenを読み取る
        const result = await list({ prefix: 'auth/' });
        const tokenBlob = result.blobs.find(b => b.pathname === BLOB_PATH);
        if (!tokenBlob) {
          return res.status(400).json({ error: 'refresh_tokenが見つかりません。再接続してください。' });
        }

        const stored = await fetch(tokenBlob.url).then(r => r.json());
        if (!stored.refresh_token) {
          return res.status(400).json({ error: 'refresh_tokenが無効です。再接続してください。' });
        }

        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            refresh_token: stored.refresh_token,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
          }),
        });

        const refreshData = await refreshRes.json();
        if (!refreshRes.ok) {
          return res.status(400).json({ error: refreshData.error_description || refreshData.error });
        }

        return res.json({
          access_token: refreshData.access_token,
          expires_in: refreshData.expires_in,
        });
      }

      // トークン取消し + Blob削除
      case 'revoke': {
        // Blobからrefresh_tokenを読み取って取り消し
        const listResult = await list({ prefix: 'auth/' });
        const blob = listResult.blobs.find(b => b.pathname === BLOB_PATH);

        if (blob) {
          try {
            const stored = await fetch(blob.url).then(r => r.json());
            if (stored.refresh_token) {
              await fetch(`https://oauth2.googleapis.com/revoke?token=${stored.refresh_token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              });
            }
          } catch {
            // 取り消し失敗は無視（トークンが既に無効な場合など）
          }
          await del(blob.url);
        }

        return res.json({ success: true });
      }

      default:
        return res.status(400).json({ error: '無効なアクション' });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
