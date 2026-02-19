# タクシー売上サポートツール - アーキテクチャ設計書

## 1. プロジェクト概要

タクシードライバー向けの売上サポートツール。Google Mapsを活用した地図表示・現在地取得機能を持ち、PC/Android両対応のレスポンシブWebアプリケーション。

## 2. 技術スタック

| カテゴリ | 技術 | バージョン | 備考 |
|---------|------|-----------|------|
| フレームワーク | React | 18.x | CDN経由で読み込み |
| トランスパイラ | Babel Standalone | 7.x | ブラウザ上でJSX変換 |
| 地図 | Google Maps JavaScript API | 3.x | 直接APIを使用 |
| チャート | Recharts | 2.x | CDN経由（archiveの旧版で使用） |
| スタイリング | CSS変数 + グローバルCSS | - | |
| 状態管理 | React Context + useState | - | |
| ルーティング | ハッシュベースルーティング | - | `#/page` 形式、戻る/進む対応 |
| データ永続化 | localStorage | - | 売上・設定・ログを保存 |
| PWA | Service Worker | - | オフラインキャッシュ対応 |
| 名前空間 | TaxiApp | - | windowグローバル整理用 |
| 言語 | 日本語のみ | | |

### 将来の移行準備済み

| カテゴリ | 技術 | 備考 |
|---------|------|------|
| ビルドツール | Vite 5.x | package.json + vite.config.js 作成済み |
| パッケージ | npm | package.json で依存関係定義済み |

## 3. サイト構造（サイトマップ）

```
#/dashboard              → ダッシュボード（ホーム）
├── #/map                → 地図ビュー（Google Maps + GPS）
├── #/revenue            → 売上記録・管理（localStorage永続化）
├── #/analytics          → 売上分析・統計（スケルトン）
├── #/settings           → 設定（APIキー設定含む）
├── #/dev                → 開発者ツール
│   ├── #/dev-structure  → サイト構造ビューア
│   ├── #/dev-logs       → アプリケーションログ
│   └── #/dev-api        → API接続ステータス
```

ハッシュベースルーティングにより、ブラウザの戻る/進む/ブックマークに対応。

## 4. ディレクトリ構造

```
タクシーアプリ/
├── taxi-sales-support/          # メインアプリケーション
│   ├── public/
│   │   ├── manifest.json        # PWAマニフェスト
│   │   └── sw.js                # Service Worker（オフラインキャッシュ）
│   ├── src/
│   │   ├── main.jsx             # エントリーポイント（TaxiApp名前空間登録）
│   │   ├── App.jsx              # ルートコンポーネント・ルーティング
│   │   ├── components/          # 共通コンポーネント
│   │   │   ├── Layout/
│   │   │   │   ├── Header.jsx   # ヘッダー（ナビゲーション）
│   │   │   │   ├── Sidebar.jsx  # サイドバー（PC用）
│   │   │   │   ├── BottomNav.jsx # ボトムナビ（モバイル用）
│   │   │   │   └── Layout.jsx   # レイアウトラッパー
│   │   │   ├── Map/
│   │   │   │   ├── GoogleMap.jsx   # Google Maps本体（TrafficLayer対応）
│   │   │   │   ├── GpsTracker.jsx  # GPS追跡パネル
│   │   │   │   └── MapControls.jsx # 地図操作コントロール＋渋滞凡例
│   │   │   └── common/
│   │   │       ├── Button.jsx
│   │   │       ├── Card.jsx
│   │   │       └── Loading.jsx
│   │   ├── pages/               # ページコンポーネント
│   │   │   ├── Dashboard.jsx    # ダッシュボード
│   │   │   ├── MapView.jsx      # 地図ページ
│   │   │   ├── Revenue.jsx      # 売上記録（localStorage永続化）
│   │   │   ├── Analytics.jsx    # 分析（スケルトン）
│   │   │   ├── Settings.jsx     # 設定
│   │   │   └── dev/
│   │   │       ├── DevTools.jsx   # 開発者ツールハブ
│   │   │       ├── Structure.jsx  # サイト構造ビューア
│   │   │       ├── Logs.jsx       # ログビューア
│   │   │       └── ApiStatus.jsx  # API状態確認
│   │   ├── hooks/               # カスタムフック
│   │   │   ├── useGeolocation.js  # GPS位置情報
│   │   │   ├── useGoogleMaps.js   # Google Maps API状態管理
│   │   │   └── useLogger.js       # ロギング（コンポーネント名プレフィックス付き）
│   │   ├── context/             # React Context
│   │   │   ├── AppContext.jsx   # アプリ全体の状態（ハッシュルーティング、APIキー）
│   │   │   ├── MapContext.jsx   # 地図関連の状態
│   │   │   └── LogContext.jsx   # ログ管理
│   │   ├── utils/               # ユーティリティ
│   │   │   ├── logger.js        # ロガー（localStorage永続化）
│   │   │   ├── storage.js       # localStorage管理
│   │   │   └── constants.js     # 定数定義 + TaxiApp名前空間初期化
│   │   └── styles/              # スタイル
│   │       ├── variables.css    # CSS変数
│   │       ├── global.css       # グローバルスタイル
│   │       └── responsive.css   # レスポンシブ
│   ├── index.html               # エントリーHTML（CDN読み込み）
│   ├── app.html                 # 代替エントリーHTML
│   ├── package.json             # npm依存関係・スクリプト定義
│   └── vite.config.js           # Vite設定（将来のビルド移行用）
├── archive/                     # 旧バージョン（参考用、本番では使用しない）
│   ├── index.html               # v4.0 スタンドアロン版
│   ├── taxi-dashboard.jsx       # v4.0 JSX版
│   └── test-taxi.html           # テスト版
├── docs/
│   ├── ARCHITECTURE.md          # この設計書
│   ├── CHANGELOG.md             # 変更履歴
│   ├── DEV_LOG.md               # 開発ログ
│   └── ANALYSIS_REPORT.md       # プロジェクト分析レポート
```

## 5. コンポーネント設計

### 5.1 レイアウト構造
```
┌──────────────────────────────────┐
│           Header                 │  ← PC/モバイル共通
├────────┬─────────────────────────┤
│        │                         │
│ Side   │      メインコンテンツ     │  ← PC: サイドバー表示
│ bar    │                         │  ← モバイル: 非表示
│        │                         │
│        │                         │
├────────┴─────────────────────────┤
│        BottomNav                 │  ← モバイルのみ表示
└──────────────────────────────────┘
```

### 5.2 状態管理フロー
```
AppContext (グローバル状態)
├── currentPage: string          ← ハッシュルーティングで管理
├── apiKey: string               ← Google Maps APIキー
├── navigate(page)               ← window.location.hash を更新
├── MapContext (地図・GPS状態)
│   ├── currentPosition: {lat, lng}
│   ├── mapCenter: {lat, lng}
│   ├── zoom: number
│   └── isTracking: boolean
└── LogContext (ログ状態)
    ├── logs: Log[]
    └── addLog(level, message)
```

### 5.3 TaxiApp 名前空間

全コンポーネント・フック・ユーティリティを `window.TaxiApp` に整理：
```
window.TaxiApp = {
  components: { Loading, Card, Button, Header, Sidebar, BottomNav,
                Layout, GoogleMapView, GpsTracker, MapControls, TrafficLegend },
  pages:      { Dashboard, MapView, Revenue, Analytics, Settings,
                DevTools, Logs, Structure, ApiStatus },
  hooks:      { useAppContext, useMapContext, useLogContext,
                useGeolocation, useGoogleMaps, useLogger },
  contexts:   { AppContext, AppProvider, MapContext, MapProvider,
                LogContext, LogProvider },
  utils:      { constants, logger, storage },
  App:        App
}
```

後方互換のため `window.XXX` も維持しているが、正規の参照先は `TaxiApp`。

### 5.4 ナビゲーション方式（ハッシュベースルーティング）

ハッシュベースのルーティングを実装済み：
```
1. ユーザーがナビゲーション操作
2. navigate(page) → window.location.hash = '#/page'
3. hashchange イベントが発火
4. AppContext が currentPage を更新
5. App.jsx の useMemo で対応コンポーネントをレンダリング
```

ブラウザの戻る/進む/ブックマークに完全対応。カスタムイベント（`navigate`）による遷移も引き続きサポート。

## 6. Google Maps統合

- APIキーはユーザーが設定画面から入力・localStorage に保存
- ハードコードされたAPIキーは使用しない（セキュリティ対策）
- APIキー未設定時はデモモード（東京駅中心の情報パネル表示）
- Google Maps JavaScript API を直接使用（scriptタグ動的挿入）
- シングルトンローダーで重複読み込み防止
- Traffic Layer（交通渋滞情報）をデフォルト有効
- GPS（Geolocation API）による現在地取得・追跡

## 7. レスポンシブ対応ブレークポイント

| 名称 | 幅 | 対象 |
|------|-----|------|
| mobile | ～767px | Android スマホ |
| tablet | 768px～1023px | タブレット |
| desktop | 1024px～ | PC |

## 8. PWA設定

- ✅ manifest.json 作成済み
- ✅ Service Worker 実装済み（public/sw.js）
- ✅ オフラインキャッシュ対応（ネットワークファースト戦略）
- ✅ SPA対応（HTML リクエスト時に index.html にフォールバック）
- ✅ Google Maps API はキャッシュ対象外（常にネットワークから取得）
- ❌ vite-plugin-pwa 未導入（将来のVite移行時に対応予定）

## 9. データ永続化

| データ | ストレージキー | 説明 |
|--------|--------------|------|
| APIキー | `taxi_api_key` | Google Maps APIキー |
| 売上データ | `taxi_revenue_data` | 売上記録の配列（JSON） |
| ログ | `taxi_logs` | アプリケーションログ |
| 設定 | `taxi_settings` | ユーザー設定 |

## 10. 既知の制限事項

- ビルドツール（Vite）未導入のため、CDN + Babel Standalone で動作（package.json/vite.config.jsは準備済み）
- 全コンポーネントが window グローバルに割り当て（ES6モジュール未使用、TaxiApp名前空間で整理済み）
- Analytics ページはスケルトン（未実装）
- テストフレームワーク未導入

---
最終更新: 2026-02-17（v0.2.0）
