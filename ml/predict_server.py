#!/usr/bin/env python3
"""
ローカル推論サーバー（開発・テスト用）
同一ネットワークのスマホからアクセス可能。

使い方:
  python predict_server.py ml_output/

ブラウザで http://192.168.x.x:8080/predict?hour=10&weekday=1&weather=0&temp=3
"""

import sys
import os
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

import numpy as np
import pandas as pd
import lightgbm as lgb


class PredictHandler(BaseHTTPRequestHandler):
    models = {}
    meta = {}

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/predict':
            self._handle_predict(parse_qs(parsed.query))
        elif parsed.path == '/health':
            self._json_response({'status': 'ok', 'models': list(self.models.keys())})
        else:
            self._json_response({'error': 'Not found'}, 404)

    def _handle_predict(self, params):
        try:
            hour = int(params.get('hour', [str(pd.Timestamp.now().hour)])[0])
            weekday = int(params.get('weekday', [str(pd.Timestamp.now().dayofweek)])[0])
            is_holiday = int(params.get('holiday', ['0'])[0])
            month = int(params.get('month', [str(pd.Timestamp.now().month)])[0])
            weather = int(params.get('weather', ['0'])[0])
            temp = float(params.get('temp', ['5'])[0])
            is_payday = int(params.get('payday', ['0'])[0])
        except (ValueError, IndexError):
            self._json_response({'error': 'Invalid parameters'}, 400)
            return

        area_master = self.meta.get('area_master', [])
        results = []

        for area in area_master:
            area_code = area.get('_code', 0)
            features = {
                'hour': hour, 'weekday': weekday, 'is_holiday': is_holiday,
                'is_payday_period': is_payday, 'month': month,
                'weather_code': weather, 'temperature': temp,
                'pickup_area_code': area_code, 'dispatch_code': -1,
                'passengers': 1, 'duration_min': 15, 'dropoff_area_code': -1,
                'vacant_duration_min': 15,
            }

            rph = rev = vac = None
            for key, label in [('revenue_per_hour', 'rph'), ('revenue', 'rev'), ('vacant_time', 'vac')]:
                model_info = self.meta.get('models', {}).get(key)
                if key in self.models and model_info:
                    feat_names = model_info['features']
                    X = pd.DataFrame([{k: features.get(k, 0) for k in feat_names}])
                    pred = float(self.models[key].predict(X)[0])
                    if label == 'rph': rph = pred
                    elif label == 'rev': rev = pred
                    elif label == 'vac': vac = pred

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
        self._json_response({
            'conditions': {
                'hour': hour, 'weekday': weekday, 'is_holiday': is_holiday,
                'month': month, 'weather_code': weather, 'temperature': temp,
            },
            'ranking': results,
        })

    def _json_response(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8'))

    def log_message(self, format, *args):
        pass  # Suppress default logging


def load_models(model_dir):
    meta_path = os.path.join(model_dir, 'model_meta.json')
    with open(meta_path, 'r', encoding='utf-8') as f:
        meta = json.load(f)

    models = {}
    for key, info in meta.get('models', {}).items():
        model_path = os.path.join(model_dir, f'model_{key}.txt')
        if os.path.exists(model_path):
            models[key] = lgb.Booster(model_file=model_path)
            print(f"  モデル読み込み: {key} ({len(info['features'])}特徴量)")

    return models, meta


def main():
    if len(sys.argv) < 2:
        print("使い方: python predict_server.py <ml_output_dir>")
        sys.exit(1)

    model_dir = sys.argv[1]
    print("モデル読み込み中...")
    models, meta = load_models(model_dir)

    PredictHandler.models = models
    PredictHandler.meta = meta

    port = 8080
    server = HTTPServer(('0.0.0.0', port), PredictHandler)
    print(f"\n推論サーバー起動: http://0.0.0.0:{port}")
    print(f"  GET /predict?hour=10&weekday=1&weather=0&temp=3")
    print(f"  GET /health")
    print("Ctrl+C で停止\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nサーバー停止")


if __name__ == '__main__':
    main()
