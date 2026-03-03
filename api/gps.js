import { put, list, del, head } from '@vercel/blob';

export default async function handler(req, res) {
  // キャッシュ防止
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  // CORS
  const origin = req.headers.origin || '';
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    return res.status(503).json({ error: 'ストレージ未設定' });
  }

  const uid = req.query.uid;
  if (!uid || !/^[a-zA-Z0-9]{4,20}$/.test(uid)) {
    return res.status(400).json({ error: '無効なUID' });
  }

  const blobPath = `watch-gps/${uid}.json`;

  try {
    switch (req.method) {
      case 'POST': {
        const { lat, lng, accuracy, timestamp } = req.body;
        if (lat == null || lng == null) {
          return res.status(400).json({ error: '座標が必要です' });
        }
        const data = JSON.stringify({
          lat: Number(lat),
          lng: Number(lng),
          accuracy: accuracy != null ? Number(accuracy) : null,
          timestamp: timestamp || Date.now(),
          created: Date.now(),
        });
        await put(blobPath, data, {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false,
          token: blobToken,
        });
        return res.json({ success: true });
      }

      case 'GET': {
        const result = await list({ prefix: 'watch-gps/', token: blobToken });
        const blob = result.blobs.find(b => b.pathname === blobPath);
        if (!blob) return res.json({ empty: true });

        const blobMeta = await head(blob.url, { token: blobToken });
        const blobRes = await fetch(blobMeta.downloadUrl);
        if (!blobRes.ok) return res.json({ empty: true });

        const data = await blobRes.json();

        // 5分以上経過したデータは期限切れ
        if (data.created && Date.now() - data.created > 5 * 60 * 1000) {
          await del(blob.url, { token: blobToken });
          return res.json({ empty: true });
        }

        return res.json(data);
      }

      case 'DELETE': {
        const listResult = await list({ prefix: 'watch-gps/', token: blobToken });
        const target = listResult.blobs.find(b => b.pathname === blobPath);
        if (target) {
          await del(target.url, { token: blobToken });
        }
        return res.json({ success: true });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('[GPS API ERROR]', err.message);
    return res.status(500).json({ error: 'サーバーエラー', detail: err.message });
  }
}
