import { put, list, del } from '@vercel/blob';

export default async function handler(req, res) {
  // CORS対応
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 認証チェック
  const secret = req.headers.authorization?.replace('Bearer ', '');
  if (secret !== process.env.SYNC_SECRET) {
    return res.status(401).json({ error: '認証エラー' });
  }

  const type = req.query.type; // 'revenue' | 'rival'
  if (!['revenue', 'rival'].includes(type)) {
    return res.status(400).json({ error: '無効なデータタイプ' });
  }

  const blobPath = type === 'revenue' ? '売上記録/latest.json' : '他社乗車/latest.json';

  switch (req.method) {
    case 'POST': {
      const blob = await put(blobPath, JSON.stringify(req.body), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      });
      return res.json({ success: true, url: blob.url });
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
