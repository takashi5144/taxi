import { put, list, del } from '@vercel/blob';
import crypto from 'crypto';

// タイミング攻撃耐性のあるシークレット比較
function safeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export default async function handler(req, res) {
  // キャッシュ防止
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Blob Storeトークン取得（明示的に渡す）
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  // 診断ログ
  console.log('[DIAG]', JSON.stringify({
    tokenSet: !!blobToken,
    tokenLen: blobToken ? blobToken.length : 0,
    blobEnvKeys: Object.keys(process.env).filter(k => k.includes('BLOB')),
    method: req.method,
    host: req.headers.host || '',
    origin: req.headers.origin || '',
    referer: req.headers.referer || '',
    secFetchSite: req.headers['sec-fetch-site'] || '',
  }));

  try {
    // トークン未設定チェック
    if (!blobToken) {
      console.error('[API ERROR] BLOB_READ_WRITE_TOKEN is not set. Available env keys with BLOB:', Object.keys(process.env).filter(k => k.includes('BLOB')));
      return res.status(503).json({
        error: 'クラウドストレージ未設定',
        detail: 'BLOB_READ_WRITE_TOKEN環境変数が設定されていません。Vercelダッシュボード → Storage → Blob Store を接続してください。',
      });
    }

    // 認証チェック
    // 明示的にクロスオリジンの場合のみSYNC_SECRET必須
    // ブラウザのfetch()はGETでOrigin/Referer/Sec-Fetch-Siteを送らない場合があるため
    // 「ヘッダーなし＝同一オリジン」として許可する（サーバー側のblobTokenが保護層）
    const origin = req.headers.origin || '';
    const host = req.headers.host || '';
    const secFetchSite = req.headers['sec-fetch-site'] || '';
    const isCrossOrigin = secFetchSite === 'cross-site' ||
      (origin && host && !origin.includes(host));

    if (isCrossOrigin) {
      // 明示的クロスオリジン: SYNC_SECRET必須
      const secret = (req.headers.authorization || '').replace('Bearer ', '').trim();
      const expected = (process.env.SYNC_SECRET || '').trim();
      if (!safeCompare(secret, expected)) {
        return res.status(401).json({ error: '認証エラー' });
      }
    }

    const type = req.query.type; // 'revenue' | 'rival'
    if (!['revenue', 'rival'].includes(type)) {
      return res.status(400).json({ error: '無効なデータタイプ' });
    }

    const blobPath = type === 'revenue' ? '売上記録/latest.json' : '他社乗車/latest.json';

    switch (req.method) {
      case 'POST': {
        const body = JSON.stringify(req.body);
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
        const result = await list({ prefix: type === 'revenue' ? '売上記録/' : '他社乗車/', token: blobToken });
        const latest = result.blobs.find(b => b.pathname.endsWith('latest.json'));
        if (!latest) return res.json({ entries: [] });
        const data = await fetch(latest.url).then(r => r.json());
        return res.json(data);
      }

      case 'DELETE': {
        const listResult = await list({ prefix: type === 'revenue' ? '売上記録/' : '他社乗車/', token: blobToken });
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
    return res.status(500).json({ error: 'サーバーエラー', detail: err.message });
  }
}
