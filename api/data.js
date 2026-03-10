import { put, list, del, head } from '@vercel/blob';
import crypto from 'crypto';

// タイミング攻撃耐性のあるシークレット比較
function safeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// リクエストボディの基本バリデーション
function validateRequestBody(body) {
  if (!body || typeof body !== 'object') return 'リクエストボディが不正です';
  if (Array.isArray(body)) return 'リクエストボディはオブジェクトである必要があります';
  // entries がある場合は配列であること
  if ('entries' in body && !Array.isArray(body.entries)) return 'entries は配列である必要があります';
  return null;
}

export default async function handler(req, res) {
  // キャッシュ防止
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  // CORS - 本番ドメインのみ許可（開発時は環境変数で追加可能）
  const allowedOrigins = ['https://taxi1-inky.vercel.app'];
  // 開発環境用の追加オリジン（環境変数で指定）
  const devOrigins = (process.env.DEV_CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const allOrigins = [...allowedOrigins, ...devOrigins];

  const reqOrigin = req.headers.origin || '';
  const corsOrigin = allOrigins.includes(reqOrigin) ? reqOrigin : allowedOrigins[0];
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Blob Storeトークン取得（明示的に渡す）
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  try {
    // トークン未設定チェック
    if (!blobToken) {
      console.error('[API] BLOB_READ_WRITE_TOKEN is not set');
      return res.status(503).json({
        error: 'クラウドストレージ未設定',
      });
    }

    // 認証チェック
    // POST/DELETEは常にSYNC_SECRET必須（GETは読み取り専用なので許可）
    if (req.method === 'POST' || req.method === 'DELETE') {
      const secret = (req.headers.authorization || '').replace('Bearer ', '').trim();
      const expected = (process.env.SYNC_SECRET || '').trim();
      if (!expected) {
        return res.status(503).json({ error: 'SYNC_SECRET環境変数が未設定です' });
      }
      if (!safeCompare(secret, expected)) {
        return res.status(401).json({ error: '認証エラー: シークレットが一致しません' });
      }
    }

    const type = req.query.type; // 'revenue' | 'rival' | 'workstatus' | 'standby' etc.
    if (!['revenue', 'rival', 'workstatus', 'gathering', 'shifts', 'breaks', 'standby'].includes(type)) {
      return res.status(400).json({ error: '無効なデータタイプ' });
    }

    const blobPathMap = {
      revenue: '売上記録/latest.json',
      rival: '他社乗車/latest.json',
      workstatus: '勤務状態/latest.json',
      gathering: '集客メモ/latest.json',
      shifts: 'シフト/latest.json',
      breaks: '休憩/latest.json',
      standby: '待機記録/latest.json',
    };
    const blobPath = blobPathMap[type];
    const blobPrefix = blobPath.split('/')[0] + '/';

    switch (req.method) {
      case 'POST': {
        // リクエストボディのバリデーション
        const validationError = validateRequestBody(req.body);
        if (validationError) {
          return res.status(400).json({ error: validationError });
        }

        let body;
        try {
          body = JSON.stringify(req.body);
        } catch (e) {
          return res.status(400).json({ error: 'リクエストボディのシリアライズに失敗しました' });
        }
        if (body.length > 10 * 1024 * 1024) {
          return res.status(413).json({ error: 'データサイズが大きすぎます' });
        }
        await put(blobPath, body, {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false,
          token: blobToken,
        });
        return res.json({ success: true });
      }

      case 'GET': {
        const result = await list({ prefix: blobPrefix, token: blobToken });
        const latest = result.blobs.find(b => b.pathname.endsWith('latest.json'));
        if (!latest) return res.json({ entries: [] });
        // head() で認証付き downloadUrl を取得
        const blobMeta = await head(latest.url, { token: blobToken });
        const blobUrl = blobMeta.downloadUrl;
        const blobRes = await fetch(blobUrl);
        if (!blobRes.ok) {
          const errBody = await blobRes.text().catch(() => '');
          if (errBody.includes('blocked')) {
            console.error('[API] Blob store is blocked');
            return res.status(503).json({ error: 'Blobストアがブロックされています。Vercelダッシュボードでストアの状態を確認してください。' });
          }
          console.error('[API] Blob fetch failed:', blobRes.status, errBody.substring(0, 200));
          return res.status(502).json({ error: `Blobデータ取得失敗 (${blobRes.status})` });
        }
        const text = await blobRes.text();
        try {
          const data = JSON.parse(text);
          return res.json(data);
        } catch (parseErr) {
          console.error('[API] JSON parse error:', parseErr.message, 'body preview:', text.substring(0, 200));
          return res.status(502).json({ error: 'Blobデータの形式が不正です' });
        }
      }

      case 'DELETE': {
        const listResult = await list({ prefix: blobPrefix, token: blobToken });
        if (listResult.blobs.length > 0) {
          await del(listResult.blobs.map(b => b.url), { token: blobToken });
        }
        return res.json({ success: true });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('[API ERROR]', err.message, err.stack);
    // 本番環境ではスタックトレースを返さない
    return res.status(500).json({ error: 'サーバーエラー' });
  }
}
