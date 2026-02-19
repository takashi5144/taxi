# 開発ログ (DEV_LOG)

## 2026-02-16 - プロジェクト開始

### 決定事項
- 技術スタック: React 18 + Vite 5
- 地図: Google Maps JavaScript API（@vis.gl/react-google-maps）
- UIデザイン: レスポンシブ（PC + Android）
- 言語: 日本語のみ
- APIキー: 設定画面から入力、localStorage保存
- 開発者ツール: サイト構造・ログ・API状態を確認可能

### 作業内容
- [x] ARCHITECTURE.md 作成
- [x] CHANGELOG.md 作成
- [x] DEV_LOG.md 作成
- [x] React + Vite プロジェクト初期化
- [x] コアコンポーネント実装
- [x] Google Maps統合
- [x] GPS機能実装
- [x] 開発者ツールページ実装

### メモ
- Google Maps APIキーがない場合はデモモードで動作
- PWAとしてAndroidのホーム画面に追加可能にする
- 開発者ツールは /dev パスでアクセス
