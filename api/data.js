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
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 認証チェック
  // 同一オリジン（ブラウザからのアプリ内リクエスト）はシークレット不要
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const host = req.headers.host || '';
  const isSameOrigin = (origin && host && origin.includes(host)) || (referer && host && referer.includes(host));

  if (!isSameOrigin) {
    // 外部リクエスト（curl等）: SYNC_SECRET必須
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
      // リクエストボディサイズチェック（10MB上限）
      const body = JSON.stringify(req.body);
      if (body.length > 10 * 1024 * 1024) {
        return res.status(413).json({ error: 'データサイズが大きすぎます' });
      }
      await put(blobPath, body, {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      });
      return res.json({ success: true });
    }

    case 'GET': {
      const result = await list({ prefix: type === 'revenue' ? '売上記録/' : '他社乗車/' });
      const latest = result.blobs.find(b => b.pathname.endsWith('latest.json'));
      if (!latest) return res.json({ entries: [] });
      const data = await fetch(latest.url).then(r => r.json());
      return res.json(data);
    }

    case 'DELETE': {
      const listResult = await list({ prefix: type === 'revenue' ? '売上記録/' : '他社乗車/' });
      if (listResult.blobs.length > 0) {
        await del(listResult.blobs.map(b => b.url));
      }
      return res.json({ success: true });
    }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}
