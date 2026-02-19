# タクシーアプリ 総合分析レポート

**分析日:** 2026-02-17
**対象ファイル数:** 38個
**総行数:** 約12,000行

---

## エグゼクティブサマリー

プロジェクト全体を解析した結果、**3つの異なるバージョンが混在**しており、セキュリティ上の重大な問題、設計書と実装の乖離、大規模なコード重複が確認されました。

---

## 1. 🔴 重大な問題

### 1.1 ハードコードされたGoogle Maps APIキー

**ファイル:** `taxi-sales-support/src/utils/storage.js`

`getApiKey()` メソッド内にAPIキーがハードコードされています。このキーは誰でもアクセス可能で、不正利用による課金リスクがあります。

**対応:** 即座にキーを無効化し、環境変数経由でのみ読み込む方式に変更してください。

### 1.2 3つのバージョンが混在

```
タクシーアプリ/
├── index.html          ← v4.0 スタンドアロン版 (2020行, 113KB)
├── taxi-dashboard.jsx  ← v4.0 JSX版 (1948行, 112KB)
├── test-taxi.html      ← テスト版 (1097行, 70KB)
└── taxi-sales-support/ ← React版 v0.1.0
```

どれが本番バージョンなのか不明確で、同じロジック（定数・ユーティリティ・データ生成）が3ファイルに重複しています。

### 1.3 test-taxi.html に構文エラー

22行目で `ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area` が二重に宣言されており、このファイルはそのままでは動作しません。

---

## 2. 🟠 設計書と実装の乖離

### ARCHITECTURE.md で定義されているが存在しないファイル

| ファイル | 用途 | 状態 |
|---------|------|------|
| `src/hooks/useGoogleMaps.js` | Google Maps フック | ❌ 未実装 |
| `src/hooks/useLogger.js` | ロギングフック | ❌ 未実装 |
| `src/components/Map/MapControls.jsx` | 地図コントロール | ❌ 未実装 |
| `vite.config.js` | Viteの設定 | ❌ 存在しない |
| `package.json` | 依存関係管理 | ❌ 存在しない |
| `README.md` | プロジェクト説明 | ❌ 存在しない |

### 技術スタックの乖離

| 設計書の記載 | 実際の実装 |
|-------------|-----------|
| Vite 5 でビルド | CDNから直接読み込み（ビルドなし） |
| React Router 6 | 独自の switch/case ルーティング |
| @vis.gl/react-google-maps | Google Maps API を直接使用 |
| CSS Modules | インラインスタイル + グローバルCSS |
| PWA (vite-plugin-pwa) | manifest.json のみ（Service Worker なし） |

---

## 3. 🟠 アーキテクチャの問題

### 3.1 ルーティング

`App.jsx` で switch/case による独自ルーティングを実装しており、ブラウザの戻る/進むボタンが動作せず、URLも変わりません。ブックマークやページ共有ができない状態です。

### 3.2 グローバル名前空間の汚染

taxi-sales-support 内の全コンポーネント・フック・コンテキストが `window` オブジェクトに直接割り当てられています（`window.DashboardPage`、`window.useGeolocation` など）。ES6モジュールシステムが使われていません。

### 3.3 状態管理

AppContext にページ状態・UI状態・ユーザーデータが混在しています。また、カスタムDOMイベント（`document.addEventListener('navigate', ...)`）で無理やりナビゲーションを実現しています。

### 3.4 データ永続化の欠如

Revenue ページの売上データは `useState` のみで管理されており、ページリロードで全データが失われます。

---

## 4. 🟡 コード品質の問題

### 4.1 モノリシックファイル

- `index.html`: 2020行（HTML + CSS + React全コンポーネント + ビジネスロジック）
- `taxi-dashboard.jsx`: 1948行（同様の構成）

保守性・テスト可能性が極めて低い状態です。

### 4.2 コード重複

以下が3ファイル間で完全に重複しています：

- AREAS 定数（15エリアの緯度経度）
- WEATHER_OPTIONS / TRAFFIC_OPTIONS 定数
- getWeatherIcon / getTrafficIcon 等のユーティリティ関数
- generateDemandData / generateRideHistory 等のデータ生成ロジック
- formatDateTime ユーティリティ

### 4.3 カラーパレットの不統一

React版: `--color-primary: #1a73e8` / index.html版: `primary: "#2563eb"` — デザインシステムが統一されていません。

---

## 5. 🟡 セキュリティ上の懸念

### 5.1 APIキーの平文保存

localStorage にAPIキーが平文で保存されます。DevTools から容易にアクセスできます。

### 5.2 ログに機密情報が混入するリスク

`logger.js` は任意のデータを localStorage とブラウザコンソールに出力します。APIキー等が意図せずログに残る可能性があります。

---

## 6. 機能実装の進捗状況

| ページ | 設計書の予定 | 実装状況 | 進捗 |
|--------|------------|---------|------|
| Dashboard | 統計表示 | ダミーデータのみ | 30% |
| Map | Google Maps + GPS | GPS実装あり、Maps未完全 | 60% |
| Revenue | 売上記録 CRUD | メモリのみ（永続化なし） | 40% |
| Analytics | 売上分析・チャート | スケルトン | 10% |
| Settings | APIキー設定 | 実装済み | 100% |
| Dev Tools | ロガー・ビューア | 実装済み | 100% |
| PWA | オフライン対応 | manifest.jsonのみ | 10% |

---

## 7. 推奨される改善プラン

### フェーズ1: 緊急修正（即日）

1. ハードコードされたAPIキーを削除
2. 使わないバージョンのファイルを整理（index.html / test-taxi.html / taxi-dashboard.jsx）
3. test-taxi.html の構文エラーを修正

### フェーズ2: 基盤整備（1-2週間）

1. package.json / vite.config.js を作成し、正式なビルド環境を構築
2. ES6モジュールシステムに移行（window グローバル割り当てを廃止）
3. React Router 6 を導入
4. 環境変数管理（.env）を導入

### フェーズ3: コード品質向上（2-3週間）

1. モノリシックファイルをコンポーネント単位に分割
2. 共通定数・ユーティリティを一箇所に集約
3. TypeScript の導入を検討
4. ESLint / Prettier の設定

### フェーズ4: 機能完成（3-4週間）

1. Revenue データの永続化（localStorage or IndexedDB）
2. Analytics ページの実装
3. PWA対応（Service Worker + キャッシュ戦略）
4. Google Maps 統合の完成

---

## チェックリスト

### 必須

- [ ] ハードコードされたAPIキーを削除
- [ ] ARCHITECTURE.md を実装と同期
- [ ] 重複ファイルを整理
- [ ] 構文エラーを修正（test-taxi.html）
- [ ] package.json を作成
- [ ] React Router を導入

### 推奨

- [ ] TypeScript 導入
- [ ] ユニットテスト作成
- [ ] ESLint / Prettier 設定
- [ ] CI/CD パイプライン構築
- [ ] ドキュメント整備

---

*このレポートはプロジェクト内の全38ファイルを解析して作成されました。*
