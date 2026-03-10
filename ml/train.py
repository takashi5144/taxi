#!/usr/bin/env python3
"""
タクシー売上最大化 LightGBM 学習スクリプト
===========================================
アプリからエクスポートしたJSON (taxi_ml_data_*.json) を読み込み、
3つのLightGBMモデルを学習・保存する。

使い方:
  pip install -r requirements.txt
  python train.py taxi_ml_data_2026-03-11.json
"""

import sys
import json
import os
import warnings
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

warnings.filterwarnings('ignore', category=UserWarning)

# =================================================================
# 1. データ読み込みと前処理
# =================================================================

def load_data(json_path):
    """アプリからエクスポートしたJSONを読み込む"""
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"バージョン: {data.get('version', '?')}")
    print(f"エクスポート日時: {data.get('exported_at', '?')}")
    stats = data.get('stats', {})
    print(f"乗車記録: {stats.get('total_trips', 0)}件")
    print(f"空車区間: {stats.get('total_vacant_periods', 0)}件")
    print(f"シフト: {stats.get('total_shifts', 0)}件")
    print(f"GPS日数: {stats.get('total_gps_days', 0)}日")
    dr = stats.get('date_range')
    if dr:
        print(f"期間: {dr['from']} 〜 {dr['to']}")
    print()

    return data


def prepare_trips_df(data):
    """tripsデータをDataFrameに変換し特徴量を作成"""
    trips = pd.DataFrame(data['trips'])
    if trips.empty:
        print("警告: 乗車記録がありません")
        return trips

    # 天候カテゴリ変換
    weather_map = {'晴れ': 0, '曇り': 1, '雨': 2, '雪': 3, '暴風雪': 4}
    trips['weather_code'] = trips['weather'].map(weather_map).fillna(-1).astype(int)

    # 配車方法カテゴリ
    dispatch_map = {'Go': 0, 'Uber': 1, 'DIDI': 2, '電話': 3, '流し': 4, '待機': 5}
    trips['dispatch_code'] = trips['dispatch_type'].map(dispatch_map).fillna(-1).astype(int)

    # 支払方法カテゴリ
    payment_map = {'cash': 0, 'uncollected': 1, 'didi': 2, 'uber': 3}
    trips['payment_code'] = trips['payment_method'].map(payment_map).fillna(0).astype(int)

    # 性別
    gender_map = {'M': 0, 'F': 1, '不明': 2, 'mixed': 3}
    trips['gender_code'] = trips['gender'].map(gender_map).fillna(2).astype(int)

    # 用途
    purpose_map = {'通勤': 0, '通院': 1, '買物': 2, '観光': 3, '出張': 4,
                   '送迎': 5, '空港': 6, '飲食': 7, 'パチンコ': 8, '駅移動': 9}
    trips['purpose_code'] = trips['purpose'].map(purpose_map).fillna(-1).astype(int)

    # エリアID → 数値
    area_ids = sorted(trips['pickup_area_id'].unique())
    area_map = {a: i for i, a in enumerate(area_ids)}
    trips['pickup_area_code'] = trips['pickup_area_id'].map(area_map).fillna(-1).astype(int)
    trips['dropoff_area_code'] = trips['dropoff_area_id'].map(area_map).fillna(-1).astype(int)

    # 時間帯ビニング
    trips['hour_bin'] = pd.cut(trips['hour'].fillna(12), bins=[-1, 6, 9, 12, 15, 18, 21, 24],
                               labels=[0, 1, 2, 3, 4, 5, 6]).astype(int)

    # 欠損値補完
    trips['temperature'] = trips['temperature'].fillna(trips['temperature'].median() if trips['temperature'].notna().any() else 0)
    trips['duration_min'] = trips['duration_min'].fillna(trips['duration_min'].median() if trips['duration_min'].notna().any() else 15)

    return trips


def prepare_vacant_df(data):
    """空車データをDataFrameに変換"""
    vacant = pd.DataFrame(data['vacant_periods'])
    if vacant.empty:
        return vacant

    weather_map = {'晴れ': 0, '曇り': 1, '雨': 2, '雪': 3, '暴風雪': 4}
    vacant['weather_code'] = vacant['weather'].map(weather_map).fillna(-1).astype(int)

    area_ids = sorted(vacant['waiting_area_id'].unique())
    area_map = {a: i for i, a in enumerate(area_ids)}
    vacant['waiting_area_code'] = vacant['waiting_area_id'].map(area_map).fillna(-1).astype(int)

    vacant['temperature'] = vacant['temperature'].fillna(0)

    return vacant


# =================================================================
# 2. モデル学習
# =================================================================

FEATURE_COLS = [
    'hour', 'weekday', 'is_holiday', 'is_payday_period', 'month',
    'weather_code', 'temperature', 'pickup_area_code',
    'dispatch_code', 'passengers',
]

FEATURE_COLS_REVENUE = FEATURE_COLS + ['duration_min', 'dropoff_area_code']

FEATURE_COLS_RPH = FEATURE_COLS + ['vacant_duration_min', 'duration_min']


def train_model(X, y, model_name, params=None):
    """LightGBMモデルの学習と評価"""
    if len(X) < 10:
        print(f"  ⚠ {model_name}: データが少なすぎます ({len(X)}件)")
        return None

    default_params = {
        'objective': 'regression',
        'metric': 'mae',
        'boosting_type': 'gbdt',
        'num_leaves': 31,
        'learning_rate': 0.05,
        'feature_fraction': 0.8,
        'bagging_fraction': 0.8,
        'bagging_freq': 5,
        'verbose': -1,
        'n_estimators': 500,
        'early_stopping_rounds': 50,
    }
    if params:
        default_params.update(params)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    model = lgb.LGBMRegressor(**default_params)
    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
    )

    y_pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)

    print(f"  {model_name}:")
    print(f"    学習データ: {len(X_train)}件 / テストデータ: {len(X_test)}件")
    print(f"    MAE: {mae:.1f} / RMSE: {rmse:.1f} / R²: {r2:.3f}")

    return model


def train_all_models(trips, vacant):
    """3つのモデルを学習"""
    models = {}

    print("=" * 50)
    print("モデル学習開始")
    print("=" * 50)

    # モデル1: 待機時間予測
    print("\n[1] 待機時間予測モデル")
    if not vacant.empty and len(vacant) >= 10:
        v_features = [c for c in ['hour', 'weekday', 'is_holiday', 'month',
                                   'weather_code', 'temperature', 'waiting_area_code']
                      if c in vacant.columns]
        X_v = vacant[v_features].copy()
        y_v = vacant['vacant_duration_min'].clip(upper=120)
        models['vacant_time'] = train_model(X_v, y_v, '待機時間予測')
        models['vacant_time_features'] = v_features
    else:
        print("  ⚠ 空車データが不足しています")

    # モデル2: 乗車運賃予測
    print("\n[2] 乗車運賃予測モデル")
    valid_rev = trips.dropna(subset=['revenue'])
    valid_rev = valid_rev[valid_rev['revenue'] > 0]
    if len(valid_rev) >= 10:
        available_cols = [c for c in FEATURE_COLS_REVENUE if c in valid_rev.columns]
        X_r = valid_rev[available_cols].copy()
        y_r = valid_rev['revenue']
        models['revenue'] = train_model(X_r, y_r, '乗車運賃予測')
        models['revenue_features'] = available_cols
    else:
        print("  ⚠ 売上データが不足しています")

    # モデル3: 時間あたり売上予測（★メイン）
    print("\n[3] 時間あたり売上予測モデル（★メイン）")
    valid_rph = trips.dropna(subset=['revenue_per_hour'])
    valid_rph = valid_rph[valid_rph['revenue_per_hour'] > 0]
    if len(valid_rph) >= 10:
        available_cols = [c for c in FEATURE_COLS_RPH if c in valid_rph.columns]
        X_rph = valid_rph[available_cols].copy()
        y_rph = valid_rph['revenue_per_hour'].clip(upper=20000)
        models['revenue_per_hour'] = train_model(X_rph, y_rph, '時間あたり売上予測')
        models['revenue_per_hour_features'] = available_cols
    else:
        print("  ⚠ 時間あたり売上データが不足しています")

    return models


# =================================================================
# 3. 特徴量重要度の可視化
# =================================================================

def plot_feature_importance(models, output_dir):
    """特徴量重要度のグラフを出力"""
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        try:
            import japanize_matplotlib
        except ImportError:
            pass
    except ImportError:
        print("matplotlibが未インストールのため、グラフ出力をスキップ")
        return

    model_names = {
        'vacant_time': '待機時間予測',
        'revenue': '乗車運賃予測',
        'revenue_per_hour': '時間あたり売上予測',
    }

    for key, display_name in model_names.items():
        model = models.get(key)
        features = models.get(f'{key}_features', [])
        if model is None:
            continue

        importance = model.feature_importances_
        sorted_idx = np.argsort(importance)

        fig, ax = plt.subplots(figsize=(10, max(6, len(features) * 0.4)))
        ax.barh(range(len(sorted_idx)), importance[sorted_idx], align='center')
        ax.set_yticks(range(len(sorted_idx)))
        ax.set_yticklabels([features[i] for i in sorted_idx])
        ax.set_title(f'{display_name} - 特徴量重要度')
        ax.set_xlabel('Importance')
        plt.tight_layout()
        path = os.path.join(output_dir, f'importance_{key}.png')
        plt.savefig(path, dpi=150)
        plt.close()
        print(f"  保存: {path}")


# =================================================================
# 4. 予測関数の生成
# =================================================================

def predict_best_area(models, area_master, hour, weekday, is_holiday, month,
                      weather_code, temperature, is_payday=0):
    """
    現在の条件で各エリアの予測時間あたり売上をランキング表示。
    結果はJSON形式で返す（Webアプリ連携用）。
    """
    rph_model = models.get('revenue_per_hour')
    rev_model = models.get('revenue')
    vac_model = models.get('vacant_time')

    if not rph_model and not rev_model:
        return []

    results = []
    for area in area_master:
        area_code = area.get('_code', 0)
        features = {
            'hour': hour, 'weekday': weekday, 'is_holiday': is_holiday,
            'is_payday_period': is_payday, 'month': month,
            'weather_code': weather_code, 'temperature': temperature,
            'pickup_area_code': area_code, 'dispatch_code': -1,
            'passengers': 1, 'duration_min': 15, 'dropoff_area_code': -1,
            'vacant_duration_min': 15,
        }

        # 時間あたり売上予測
        rph = None
        if rph_model:
            rph_features = models.get('revenue_per_hour_features', [])
            X = pd.DataFrame([{k: features.get(k, 0) for k in rph_features}])
            rph = float(rph_model.predict(X)[0])

        # 運賃予測
        rev = None
        if rev_model:
            rev_features = models.get('revenue_features', [])
            X = pd.DataFrame([{k: features.get(k, 0) for k in rev_features}])
            rev = float(rev_model.predict(X)[0])

        # 待機時間予測
        vac = None
        if vac_model:
            vac_features = models.get('vacant_time_features', [])
            X = pd.DataFrame([{k: features.get(k, 0) for k in vac_features}])
            vac = float(vac_model.predict(X)[0])

        results.append({
            'area_id': area['area_id'],
            'area_name': area['area_name'],
            'revenue_per_hour': round(rph) if rph else None,
            'predicted_revenue': round(rev) if rev else None,
            'predicted_wait_min': round(vac, 1) if vac else None,
            'lat': area.get('lat'),
            'lng': area.get('lng'),
        })

    results.sort(key=lambda x: x['revenue_per_hour'] or 0, reverse=True)
    return results


# =================================================================
# 5. モデルとメタデータの保存
# =================================================================

def save_models(models, area_master, trips, output_dir):
    """モデルと推論に必要なメタデータを保存"""
    os.makedirs(output_dir, exist_ok=True)

    # エリアコードマッピング
    area_ids = sorted(trips['pickup_area_id'].unique())
    area_code_map = {a: i for i, a in enumerate(area_ids)}
    for area in area_master:
        area['_code'] = area_code_map.get(area['area_id'], -1)

    # モデル保存
    model_data = {
        'models': {},
        'area_master': area_master,
        'area_code_map': area_code_map,
    }
    for key in ['vacant_time', 'revenue', 'revenue_per_hour']:
        if key in models:
            model_path = os.path.join(output_dir, f'model_{key}.txt')
            models[key].booster_.save_model(model_path)
            model_data['models'][key] = {
                'path': f'model_{key}.txt',
                'features': models.get(f'{key}_features', []),
            }
            print(f"  モデル保存: {model_path}")

    # メタデータ保存
    meta_path = os.path.join(output_dir, 'model_meta.json')
    meta = {
        'area_master': area_master,
        'area_code_map': area_code_map,
        'models': {k: {'features': v['features']} for k, v in model_data['models'].items()},
    }
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"  メタデータ保存: {meta_path}")

    # 予測結果サンプル出力（テスト用）
    sample_conditions = [
        {'hour': 8, 'weekday': 1, 'is_holiday': 0, 'month': 3, 'weather_code': 0, 'temperature': 3},
        {'hour': 12, 'weekday': 1, 'is_holiday': 0, 'month': 3, 'weather_code': 2, 'temperature': 1},
        {'hour': 18, 'weekday': 5, 'is_holiday': 0, 'month': 3, 'weather_code': 0, 'temperature': -2},
        {'hour': 10, 'weekday': 0, 'is_holiday': 1, 'month': 7, 'weather_code': 0, 'temperature': 25},
    ]
    predictions = []
    for cond in sample_conditions:
        result = predict_best_area(models, area_master, **cond)
        predictions.append({'conditions': cond, 'ranking': result[:5]})

    pred_path = os.path.join(output_dir, 'sample_predictions.json')
    with open(pred_path, 'w', encoding='utf-8') as f:
        json.dump(predictions, f, ensure_ascii=False, indent=2)
    print(f"  サンプル予測: {pred_path}")


# =================================================================
# メイン
# =================================================================

def main():
    if len(sys.argv) < 2:
        print("使い方: python train.py <taxi_ml_data_*.json>")
        print("  アプリの開発者ツール → 「ML用データをエクスポート」でJSONを取得してください")
        sys.exit(1)

    json_path = sys.argv[1]
    if not os.path.exists(json_path):
        print(f"ファイルが見つかりません: {json_path}")
        sys.exit(1)

    output_dir = os.path.join(os.path.dirname(json_path) or '.', 'ml_output')

    # 1. データ読み込み
    print("=" * 50)
    print("データ読み込み")
    print("=" * 50)
    data = load_data(json_path)

    # 2. DataFrame変換
    trips = prepare_trips_df(data)
    vacant = prepare_vacant_df(data)

    if trips.empty:
        print("エラー: 乗車記録がありません。データを蓄積してから再実行してください。")
        sys.exit(1)

    print(f"\n前処理後: 乗車記録 {len(trips)}件 / 空車区間 {len(vacant)}件")

    # 3. モデル学習
    models = train_all_models(trips, vacant)

    # 4. モデル保存
    print(f"\n{'=' * 50}")
    print("モデル保存")
    print("=" * 50)
    area_master = data.get('area_master', [])
    save_models(models, area_master, trips, output_dir)

    # 5. 特徴量重要度
    print(f"\n{'=' * 50}")
    print("特徴量重要度グラフ")
    print("=" * 50)
    plot_feature_importance(models, output_dir)

    # 6. サマリー
    print(f"\n{'=' * 50}")
    print("完了!")
    print("=" * 50)
    print(f"出力ディレクトリ: {output_dir}")
    print(f"  - model_*.txt: LightGBMモデル")
    print(f"  - model_meta.json: メタデータ（エリアマスタ・特徴量情報）")
    print(f"  - importance_*.png: 特徴量重要度グラフ")
    print(f"  - sample_predictions.json: サンプル予測結果")
    print()
    print("次のステップ:")
    print("  1. sample_predictions.json で予測結果を確認")
    print("  2. データが増えたら再学習 (python train.py <新しいJSON>)")
    print("  3. Vercel API に model_meta.json と model_*.txt を配置して推論API化")


if __name__ == '__main__':
    main()
