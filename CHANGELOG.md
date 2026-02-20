# 変更履歴 (CHANGELOG)

## [0.7.2] - 2026-02-21

### クラウド同期の自動化
- DataServiceに`autoSync()`関数を追加（revenue/rivalを並行取得・マージ）
- アプリ起動時にクラウドから自動同期（SYNC_SECRET設定時のみ）
- タブ復帰時（visibilitychange）に自動同期
- 5分間隔の定期同期
- Settings画面に自動同期ステータス表示（有効/無効）

## [0.7.1] - 2026-02-21

### 修正
- 地図ピッカーの逆ジオコーディング改善: 日本語住所の階層（都道府県/市区/町名/丁目/番地）を正しく抽出する`_extractAddress`関数追加
- Geocoder結果からstreet_address/premise等の最も詳細な結果を優先選択
- Nominatimフォールバックにquarter・house_numberを追加

### GPS精度改善
- GPS初回取得に`getAccuratePosition`使用（複数回測位から最良を選択）
- `maximumAge: 0`でキャッシュ済み位置を使わないよう変更
- 精度に応じたマーカー色変更（青=高精度/黄=中精度/赤=低精度）
- 精度圏の色・透明度も精度レベルに連動
- 低精度時のズームレベル自動調整（1km超→zoom13）
- 地図上に精度低下警告オーバーレイ表示（1km超）
- GPSパネルに精度レベル表記（高精度/中精度/低精度）追加
- PC環境での低精度時に案内メッセージ表示

## [0.7.0] - 2026-02-21

### バグ修正
- `_gmapLoader`スコープ修正（Settings画面でのReferenceError解消）
- CSS変数 `--bg-secondary`/`--bg-tertiary` 追加（DataManage背景透過修正）
- `.btn--ghost` CSSクラス追加
- `saveEdit` transitタブ対応（未定義result参照クラッシュ修正）
- ID生成を`Date.now()+random`化（ミリ秒衝突防止）
- DataServiceの`useMemo`化（Revenue/RivalRide/Eventsの毎レンダーJSON.parse防止）

### セキュリティ
- API診断ログ削除・エラー詳細漏洩防止
- セキュリティヘッダー追加（HSTS, X-Frame-Options, X-Content-Type-Options等）

### UX改善
- 他社乗車フォームに送信ボタン追加
- バージョン番号を全ファイルで統一

### 保守
- SW簡素化（index.html+アイコンのみキャッシュ）
- obsoleteファイル削除（public/sw.js, public/manifest.json）
- src/ファイル同期（dataService 9関数追加, gemini export修正）

## [0.6.5] - 2026-02-21

### 機能追加
- 売上記録に配車方法（source）フィールド追加: Go, Uber, DIDI, 電話, 流し
- マップピッカーにGPS現在地自動表示
- マップピッカーの高さを拡大（660px）・標準スタイルに変更

## [0.6.4] - 2026-02-21

### 機能追加
- データ管理の手動入力にマップピッカー追加（乗車地・降車地）
- 地図クリックで逆ジオコーディングにより住所を自動取得
- GPS座標もaddEntryに渡してヒートマップデータに反映

## [0.6.3] - 2026-02-21

### 機能追加
- データ管理に売上手動入力フォーム追加
- 金額・日付・天候・乗車地/時刻・降車地/時刻・人数・性別・目的・メモを手入力可能

## [0.6.2] - 2026-02-21

### UI改善
- ヘッダーナビを非表示にしサイドバーのみに統一

## [0.6.1] - 2026-02-21

### 機能追加
- DataManagePageコンポーネント新規追加（3タブ構成: 売上・他社・交通情報）
- 売上記録: 検索・インライン編集・個別削除・全削除
- 他社記録: 検索・インライン編集・個別削除・全削除
- 交通情報: カテゴリ別表示・個別削除・全削除
- DataServiceにupdateEntry/updateRivalEntry関数追加

## [0.6.0] - 2026-02-21

### 機能追加
- リアルタイム時給表示（Dashboard）
- 天候×売上相関分析（Analytics天候別タブ）
- プッシュ通知（Settings + TransitInfo遅延アラート）
- 他社乗車分析（Analytics他社分析タブ）
- 需要ヒートマップ（GPS座標永続化 + visualization API）
- LightGBM-style GBDT: ブラウザ内で学習・推論、AI需要予測ヒートマップ

## [0.5.3] - 2026-02-20

### 機能追加
- 公共交通機関情報をGPS現在地の地域に基づいて取得
- 交通情報を「公共交通機関情報」サブフォルダに自動保存（日時付きファイル名）

### バグ修正
- 売上記録GPS取得時のクラッシュを修正

## [0.5.2] - 2026-02-20

### 改善
- TransitInfo新UI + GeminiService拡張をindex.htmlにインライン反映
- STORAGE_KEYS.TRANSIT_INFO追加（localStorage保存対応）

## [0.5.1] - 2026-02-20

### 機能追加
- 公共交通機関情報UIを大幅改善
- 4カテゴリタブ + Geminiレスポンス整形表示
- localStorage保存・取得済みインジケーター

## [0.5.0] - 2026-02-20

### 機能追加
- 公共交通機関情報ページをリニューアル
- GeminiService: fetchTrainInfo/fetchBusInfo/fetchFlightInfo/fetchTroubleInfo追加
- 大容量レスポンス用callGeminiLarge追加

## [0.4.1] - 2026-02-20

### 改善
- 公共交通機関ページを簡素化（Gemini AI検索のみに）

### セキュリティ
- CORS設定を自ドメイン限定に変更
- クラウド同期にAuthorization Bearer認証を必須化
- Google Maps APIキー入力をtype="password"に変更
- Gemini APIキーをURLパラメータからx-goog-api-keyヘッダーに移動

## [0.4.0] - 2026-02-19

### 機能追加
- 他社乗車情報ページ追加
- 保存フォルダをサブフォルダ構成に変更
- Gemini AI API統合（交通情報・イベントのAI検索）
- Android PWA対応（インストール・オフライン利用可能）
- GPS精度改善（enableHighAccuracy, getAccuratePosition）

## [0.3.3] - 2026-02-19

### 初回コミット
- タクシー売上サポートアプリ初回コミット

## [0.2.0] - 2026-02-17

### セキュリティ修正
- ハードコードされたGoogle Maps APIキーを削除

### 構造改善
- TaxiApp名前空間を導入
- ハッシュベースのURLルーティングを実装
- Service Workerによるオフラインキャッシュ対応（PWA）

### 機能追加
- 売上データのlocalStorage永続化
- 売上記録の削除機能
- 本日/累計の売上集計表示

## [0.1.0] - 2026-02-16

### 追加
- プロジェクト初期セットアップ (React + Vite)
- Google Maps統合
- GPS現在地取得機能
- レスポンシブUI（PC/Android対応）
- 開発者ツール（ログビューア、サイト構造ビューア）
- PWA基本設定
