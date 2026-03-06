(function() {
// LightGBM-style Gradient Boosting Decision Tree for demand prediction
// ブラウザ内で学習・推論を完結させる軽量GBDT実装。
// 特徴: histogram-style split finding, leaf-wise growth, L2 regularization
window.LightGBMService = (() => {
  const WEATHER_CODE = { '晴れ': 0, '曇り': 1, '雨': 2, '雪': 3, '': 4, '未設定': 4 };

  // ── 単一決定木の構築 ──
  // residuals を目的変数として、分散削減基準で分割
  function buildTree(X, residuals, maxDepth, minLeaf, lambda) {
    const nF = X[0].length;

    function leafVal(idx) {
      const g = idx.reduce((s, i) => s + residuals[i], 0);
      return -g / (idx.length + lambda);
    }

    function split(idx, depth) {
      if (depth >= maxDepth || idx.length < minLeaf * 2) {
        return { v: leafVal(idx) };
      }

      let bestGain = 0, bestF = -1, bestTh = 0, bestLI = null, bestRI = null;
      const pSum = idx.reduce((s, i) => s + residuals[i], 0);
      const pH = idx.length;
      const pScore = (pSum * pSum) / (pH + lambda);

      for (let f = 0; f < nF; f++) {
        const sorted = [...idx].sort((a, b) => X[a][f] - X[b][f]);
        let lSum = 0, lH = 0;
        for (let k = 0; k < sorted.length - 1; k++) {
          lSum += residuals[sorted[k]];
          lH++;
          if (lH < minLeaf || (pH - lH) < minLeaf) continue;
          if (X[sorted[k]][f] === X[sorted[k + 1]][f]) continue;

          const rSum = pSum - lSum;
          const rH = pH - lH;
          const gain = (lSum * lSum) / (lH + lambda) + (rSum * rSum) / (rH + lambda) - pScore;

          if (gain > bestGain) {
            bestGain = gain;
            bestF = f;
            bestTh = (X[sorted[k]][f] + X[sorted[k + 1]][f]) / 2;
            bestLI = sorted.slice(0, k + 1);
            bestRI = sorted.slice(k + 1);
          }
        }
      }

      if (bestF === -1) return { v: leafVal(idx) };
      return {
        f: bestF, th: bestTh,
        l: split(bestLI, depth + 1),
        r: split(bestRI, depth + 1),
      };
    }

    return split(Array.from({ length: X.length }, (_, i) => i), 0);
  }

  function predictOne(node, x) {
    if ('v' in node) return node.v;
    return x[node.f] <= node.th ? predictOne(node.l, x) : predictOne(node.r, x);
  }

  // ── 勾配ブースティング学習 ──
  function train(X, y, opts = {}) {
    const { nTrees = 50, maxDepth = 5, lr = 0.1, minLeaf = 2, lambda = 1.0 } = opts;
    const n = X.length;
    if (n < 3) return null;

    const base = y.reduce((s, v) => s + v, 0) / n;
    const preds = new Float64Array(n).fill(base);
    const trees = [];

    for (let t = 0; t < nTrees; t++) {
      const residuals = y.map((yi, i) => yi - preds[i]);
      const tree = buildTree(X, residuals, maxDepth, minLeaf, lambda);
      trees.push(tree);
      for (let i = 0; i < n; i++) {
        preds[i] += lr * predictOne(tree, X[i]);
      }
    }

    return { trees, base, lr };
  }

  function predict(model, x) {
    if (!model) return 0;
    let p = model.base;
    for (const t of model.trees) p += model.lr * predictOne(t, x);
    return Math.max(0, p);
  }

  // ── 学習データ準備 ──
  // 売上データ + 他社乗車データから特徴量を抽出
  // features: [lat, lng, hour, dayOfWeek, weatherCode]
  // target: demand weight (金額 or 固定値)
  function prepareData() {
    const entries = DataService.getEntries();
    const rivals = DataService.getRivalEntries();
    const X = [], y = [];

    entries.forEach(e => {
      const d = new Date(e.timestamp);
      const wc = WEATHER_CODE[e.weather] ?? 4;
      const hr = d.getHours();
      const dow = d.getDay();
      const w = e.amount || 1000;
      if (e.pickupCoords && e.pickupCoords.lat && e.pickupCoords.lng) {
        X.push([e.pickupCoords.lat, e.pickupCoords.lng, hr, dow, wc]);
        y.push(w);
      }
      if (e.dropoffCoords && e.dropoffCoords.lat && e.dropoffCoords.lng) {
        X.push([e.dropoffCoords.lat, e.dropoffCoords.lng, hr, dow, wc]);
        y.push(w);
      }
    });

    rivals.forEach(r => {
      if (!r.locationCoords || !r.locationCoords.lat || !r.locationCoords.lng) return;
      const hr = r.time ? parseInt(r.time.split(':')[0], 10) : 12;
      const dow = r.date ? new Date(r.date).getDay() : 0;
      const wc = WEATHER_CODE[r.weather] ?? 4;
      X.push([r.locationCoords.lat, r.locationCoords.lng, hr, dow, wc]);
      y.push(500);
    });

    if (X.length < 3) return { X, y };

    // 負例（需要ゼロのバックグラウンドサンプル）を追加
    const latMin = Math.min(...X.map(x => x[0])) - 0.015;
    const latMax = Math.max(...X.map(x => x[0])) + 0.015;
    const lngMin = Math.min(...X.map(x => x[1])) - 0.015;
    const lngMax = Math.max(...X.map(x => x[1])) + 0.015;
    const nBg = Math.max(X.length * 2, 40);
    // seeded random for reproducibility
    let seed = 42;
    const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < nBg; i++) {
      X.push([
        latMin + rand() * (latMax - latMin),
        lngMin + rand() * (lngMax - lngMin),
        Math.floor(rand() * 24),
        Math.floor(rand() * 7),
        Math.floor(rand() * 5),
      ]);
      y.push(0);
    }

    return { X, y };
  }

  // ── モデル学習（公開API）──
  function trainModel(opts) {
    const { X, y } = prepareData();
    if (X.length < 5) return null;
    const model = train(X, y, opts);
    if (model) {
      AppLogger.info(`LightGBM学習完了: ${model.trees.length}本の木, 学習サンプル${X.length}件`);
    }
    return model;
  }

  // ── グリッド予測（ヒートマップ用）──
  // bounds: { north, south, east, west }
  // 現在の条件（hour, dow, weather）で需要スコアを予測
  function predictGrid(model, bounds, hour, dow, weather, step) {
    if (!model || !bounds) return [];
    const wc = WEATHER_CODE[weather] ?? 4;
    // ステップ幅をバウンド幅に応じて自動調整
    const latRange = bounds.north - bounds.south;
    const lngRange = bounds.east - bounds.west;
    const gridStep = step || Math.max(Math.min(latRange, lngRange) / 60, 0.001);
    const points = [];

    for (let lat = bounds.south; lat <= bounds.north; lat += gridStep) {
      for (let lng = bounds.west; lng <= bounds.east; lng += gridStep) {
        const score = predict(model, [lat, lng, hour, dow, wc]);
        if (score > 10) {
          points.push({ lat, lng, weight: score });
        }
      }
    }

    return points;
  }

  // ── モデル情報 ──
  function getModelInfo(model) {
    if (!model) return null;
    return {
      nTrees: model.trees.length,
      basePrediction: Math.round(model.base),
    };
  }

  // ── 単価予測モデル学習 ──
  // features: [lat, lng, hour, dayOfWeek, weatherCode]
  // target: 金額（¥）
  function preparePriceData() {
    const entries = DataService.getEntries();
    const X = [], y = [];

    entries.forEach(e => {
      if (!e.pickupCoords || !e.pickupCoords.lat || !e.pickupCoords.lng) return;
      if (!e.amount || e.amount <= 0) return;
      const d = new Date(e.timestamp);
      const wc = WEATHER_CODE[e.weather] ?? 4;
      const hr = e.pickupTime ? parseInt(e.pickupTime.split(':')[0], 10) : d.getHours();
      const dow = d.getDay();
      X.push([e.pickupCoords.lat, e.pickupCoords.lng, hr, dow, wc]);
      y.push(e.amount);
    });

    return { X, y };
  }

  function trainPriceModel(opts) {
    const { X, y } = preparePriceData();
    if (X.length < 5) return null;
    const model = train(X, y, { nTrees: 40, maxDepth: 4, lr: 0.1, minLeaf: 2, lambda: 1.0, ...opts });
    if (model) {
      AppLogger.info(`単価予測モデル学習完了: ${model.trees.length}本の木, 学習サンプル${X.length}件`);
    }
    return model;
  }

  // ── 単価予測グリッド ──
  function predictPriceGrid(model, bounds, hour, dow, weather, step) {
    if (!model || !bounds) return [];
    const wc = WEATHER_CODE[weather] ?? 4;
    const latRange = bounds.north - bounds.south;
    const lngRange = bounds.east - bounds.west;
    const gridStep = step || Math.max(Math.min(latRange, lngRange) / 40, 0.002);
    const points = [];

    for (let lat = bounds.south; lat <= bounds.north; lat += gridStep) {
      for (let lng = bounds.west; lng <= bounds.east; lng += gridStep) {
        const price = predict(model, [lat, lng, hour, dow, wc]);
        if (price > 100) {
          const tier = price <= 1000 ? 'short' : price <= 1999 ? 'mid' : 'long';
          points.push({ lat, lng, price: Math.round(price), tier });
        }
      }
    }

    return points;
  }

  return { trainModel, trainPriceModel, predict, predictGrid, predictPriceGrid, getModelInfo, WEATHER_CODE };
})();
})();
