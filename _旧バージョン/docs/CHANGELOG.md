# 変更履歴 (CHANGELOG)

## [0.2.0] - 2026-02-17

### セキュリティ修正
- ハードコードされたGoogle Maps APIキーを削除（storage.js）

### 構造改善
- 旧バージョンファイル3つを archive/ に移動（index.html, taxi-dashboard.jsx, test-taxi.html）
- TaxiApp 名前空間を導入（windowグローバル汚染の解消）
- ハッシュベースのURLルーティングを実装（戻る/進む/ブックマーク対応）
- 不足していたファイル5つを追加（useGoogleMaps.js, useLogger.js, MapControls.jsx, package.json, vite.config.js）

### 機能追加
- 売上データの localStorage 永続化（Revenue.jsx）
- 売上記録の削除機能
- 本日/累計の売上集計表示
- Service Worker によるオフラインキャッシュ対応（PWA）

### バグ修正
- test-taxi.html の二重宣言構文エラーを修正

### ドキュメント
- ARCHITECTURE.md を実際の実装に合わせて全面改訂
- ANALYSIS_REPORT.md（プロジェクト分析レポート）を追加

## [0.1.0] - 2026-02-16

### 追加
- プロジェクト初期セットアップ (React + Vite)
- サイト構造設計書作成
- Google Maps統合（APIキー設定可能）
- GPS現在地取得機能
- レスポンシブUI（PC/Android対応）
- 開発者ツール（ログビューア、サイト構造ビューア）
- PWA基本設定
