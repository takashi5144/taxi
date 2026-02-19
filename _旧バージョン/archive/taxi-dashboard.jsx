import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area
} from "recharts";

// ============================================================
// レスポンシブ対応フック
// ============================================================
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [breakpoint]);
  return isMobile;
}

// ============================================================
// 定数・ユーティリティ
// ============================================================
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const AREAS = [
  { name: "東京駅", lat: 35.6812, lng: 139.7671 },
  { name: "新宿", lat: 35.6896, lng: 139.7006 },
  { name: "渋谷", lat: 35.6580, lng: 139.7016 },
  { name: "池袋", lat: 35.7295, lng: 139.7109 },
  { name: "品川", lat: 35.6284, lng: 139.7387 },
  { name: "六本木", lat: 35.6627, lng: 139.7312 },
  { name: "銀座", lat: 35.6717, lng: 139.7649 },
  { name: "上野", lat: 35.7141, lng: 139.7774 },
  { name: "浅草", lat: 35.7148, lng: 139.7967 },
  { name: "お台場", lat: 35.6267, lng: 139.7756 },
  { name: "秋葉原", lat: 35.7023, lng: 139.7745 },
  { name: "中野", lat: 35.7074, lng: 139.6659 },
  { name: "吉祥寺", lat: 35.7030, lng: 139.5794 },
  { name: "立川", lat: 35.6980, lng: 139.4140 },
  { name: "町田", lat: 35.5421, lng: 139.4465 },
];

const WEATHER_OPTIONS = [
  { value: "sunny", label: "晴れ", icon: "☀️" },
  { value: "cloudy", label: "曇り", icon: "☁️" },
  { value: "rainy", label: "雨", icon: "🌧️" },
  { value: "heavy_rain", label: "大雨", icon: "⛈️" },
  { value: "snow", label: "雪", icon: "❄️" },
  { value: "typhoon", label: "台風", icon: "🌀" },
];

const TRAFFIC_OPTIONS = [
  { value: "smooth", label: "スムーズ", icon: "🟢", color: "#10b981" },
  { value: "normal", label: "通常", icon: "🟡", color: "#f59e0b" },
  { value: "congested", label: "混雑", icon: "🟠", color: "#f97316" },
  { value: "heavy", label: "渋滞", icon: "🔴", color: "#ef4444" },
];

function getWeatherIcon(v) { return WEATHER_OPTIONS.find(w => w.value === v)?.icon || ""; }
function getWeatherLabel(v) { return WEATHER_OPTIONS.find(w => w.value === v)?.label || v; }
function getTrafficIcon(v) { return TRAFFIC_OPTIONS.find(t => t.value === v)?.icon || ""; }
function getTrafficLabel(v) { return TRAFFIC_OPTIONS.find(t => t.value === v)?.label || v; }
function getTrafficColor(v) { return TRAFFIC_OPTIONS.find(t => t.value === v)?.color || "#94a3b8"; }

function getNearestArea(lat, lng) {
  let minD = Infinity, nearest = AREAS[0];
  AREAS.forEach(a => { const d = Math.sqrt((a.lat - lat) ** 2 + (a.lng - lng) ** 2); if (d < minD) { minD = d; nearest = a; } });
  return nearest.name;
}

function formatDateTime(d) {
  const dt = new Date(d);
  return { date: `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}`, time: `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`, weekday: WEEKDAYS[dt.getDay()], hour: dt.getHours() };
}

// ============================================================
// サンプルデータ
// ============================================================
function generateDemandData() {
  const data = [];
  HOURS.forEach(hour => {
    AREAS.forEach(a => {
      let base = 20;
      if (hour >= 7 && hour <= 9) base = 60 + Math.random() * 30;
      else if (hour >= 11 && hour <= 14) base = 40 + Math.random() * 20;
      else if (hour >= 17 && hour <= 19) base = 55 + Math.random() * 35;
      else if (hour >= 21) base = 45 + Math.random() * 40;
      else if (hour <= 5) base = 15 + Math.random() * 25;
      else base = 25 + Math.random() * 20;
      if (["六本木", "渋谷", "新宿"].includes(a.name) && hour >= 21) base = Math.min(100, base * 1.5);
      if (["東京駅", "品川"].includes(a.name) && (hour >= 7 && hour <= 9 || hour >= 17 && hour <= 19)) base = Math.min(100, base * 1.4);
      data.push({ hour, area: a.name, demand: Math.round(Math.min(100, base)) });
    });
  });
  return data;
}

// エリア別リアルタイム交通状況（シミュレーション）
function generateTrafficStatus(hour) {
  return AREAS.map(a => {
    let congestion = 30;
    if (hour >= 7 && hour <= 9) congestion = 60 + Math.random() * 30;
    else if (hour >= 17 && hour <= 19) congestion = 55 + Math.random() * 35;
    else if (hour >= 12 && hour <= 14) congestion = 40 + Math.random() * 20;
    else if (hour >= 21) congestion = 35 + Math.random() * 25;
    else if (hour <= 5) congestion = 10 + Math.random() * 15;
    else congestion = 25 + Math.random() * 20;
    if (["東京駅", "新宿", "渋谷", "池袋"].includes(a.name)) congestion = Math.min(100, congestion * 1.3);
    if (["町田", "立川", "吉祥寺"].includes(a.name)) congestion *= 0.7;
    const level = congestion >= 75 ? "heavy" : congestion >= 50 ? "congested" : congestion >= 30 ? "normal" : "smooth";
    const avgSpeed = Math.round(level === "heavy" ? 8 + Math.random() * 5 : level === "congested" ? 15 + Math.random() * 10 : level === "normal" ? 25 + Math.random() * 10 : 35 + Math.random() * 15);
    const estDelay = level === "heavy" ? Math.round(15 + Math.random() * 20) : level === "congested" ? Math.round(5 + Math.random() * 10) : 0;
    return { ...a, congestion: Math.round(Math.min(100, congestion)), level, avgSpeed, estDelay };
  });
}

function generateRideHistory() {
  const records = [];
  const weathers = ["sunny", "sunny", "sunny", "cloudy", "cloudy", "rainy", "heavy_rain"];
  const traffics = ["smooth", "smooth", "normal", "normal", "congested", "heavy"];
  for (let i = 0; i < 40; i++) {
    const pickup = AREAS[Math.floor(Math.random() * AREAS.length)];
    const dropoff = AREAS[Math.floor(Math.random() * AREAS.length)];
    const hour = Math.floor(Math.random() * 24), min = Math.floor(Math.random() * 60);
    const day = Math.ceil(Math.random() * 14), dt = new Date(2026, 1, day, hour, min);
    const dist = +(1 + Math.random() * 15).toFixed(1);
    const weather = weathers[Math.floor(Math.random() * weathers.length)];
    const traffic = traffics[Math.floor(Math.random() * traffics.length)];
    const fare = Math.round((410 + dist * 280) * (weather.includes("rain") ? 1.1 : 1) * (traffic === "heavy" ? 1.15 : traffic === "congested" ? 1.05 : 1) * (hour >= 22 || hour <= 5 ? 1.25 : 1));
    records.push({ id: `ride-${Date.now()}-${i}`, timestamp: dt.getTime(), 日付: `2026/02/${String(day).padStart(2, "0")}`, 時刻: `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`, 曜日: WEEKDAYS[dt.getDay()], 乗車地: pickup.name, 乗車GPS: { lat: pickup.lat + (Math.random() - 0.5) * 0.005, lng: pickup.lng + (Math.random() - 0.5) * 0.005 }, 降車地: dropoff.name, 降車GPS: { lat: dropoff.lat + (Math.random() - 0.5) * 0.005, lng: dropoff.lng + (Math.random() - 0.5) * 0.005 }, 距離: dist, 運賃: fare, 天気: weather, 交通状況: traffic, 深夜: hour >= 22 || hour <= 5, メモ: "" });
  }
  return records.sort((a, b) => b.timestamp - a.timestamp);
}

function generateMonthlySales() {
  return ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"].map(m => {
    const b = 350000 + Math.random() * 150000, r = Math.round(180 + Math.random() * 80);
    return { month: m, 売上: Math.round(b), 乗車回数: r, 平均単価: Math.round(b / r), 実車率: Math.round(55 + Math.random() * 20) };
  });
}

function generateWeeklySales() { return WEEKDAY_LABELS.map(d => ({ day: d, 売上: Math.round(40000 + Math.random() * 30000) })); }
function generateHourlySales() { return HOURS.map(h => ({ 時間: `${h}時`, 売上: Math.round(h >= 7 && h <= 9 ? 8000 + Math.random() * 5000 : h >= 17 && h <= 20 ? 7000 + Math.random() * 6000 : h >= 21 ? 6000 + Math.random() * 8000 : h <= 5 ? 2000 + Math.random() * 4000 : 3000 + Math.random() * 4000) })); }

const DEMAND_DATA = generateDemandData();
const INITIAL_RIDES = generateRideHistory();
const MONTHLY_SALES = generateMonthlySales();
const WEEKLY_SALES = generateWeeklySales();
const HOURLY_SALES = generateHourlySales();

// ============================================================
// イベント・催事データ
// ============================================================
const EVENTS_DB = [
  { id: "e1", title: "東京ドーム コンサート", area: "上野", date: "2026/02/15", startTime: "17:00", endTime: "21:00", expectedDemand: 95, category: "コンサート", lat: 35.7056, lng: 139.7519, note: "終了後21:00〜22:00が最大需要" },
  { id: "e2", title: "ビッグサイト 展示会", area: "お台場", date: "2026/02/16", startTime: "10:00", endTime: "18:00", expectedDemand: 75, category: "展示会", lat: 35.6299, lng: 139.7946, note: "午前と終了時に需要集中" },
  { id: "e3", title: "国立競技場 サッカー", area: "新宿", date: "2026/02/15", startTime: "19:00", endTime: "21:30", expectedDemand: 90, category: "スポーツ", lat: 35.6784, lng: 139.7136, note: "試合終了後30分がピーク" },
  { id: "e4", title: "東京国際フォーラム 講演会", area: "東京駅", date: "2026/02/17", startTime: "13:00", endTime: "17:00", expectedDemand: 60, category: "講演会", lat: 35.6765, lng: 139.7634, note: "終了後の駅混雑を避ける層が多い" },
  { id: "e5", title: "渋谷ヒカリエ ファッションショー", area: "渋谷", date: "2026/02/15", startTime: "14:00", endTime: "20:00", expectedDemand: 70, category: "イベント", lat: 35.6590, lng: 139.7032, note: "VIP客が多くタクシー利用率高" },
  { id: "e6", title: "武道館 ライブ", area: "秋葉原", date: "2026/02/18", startTime: "18:00", endTime: "21:00", expectedDemand: 88, category: "コンサート", lat: 35.6932, lng: 139.7501, note: "九段下周辺でピックアップ推奨" },
  { id: "e7", title: "横浜アリーナ K-POPライブ", area: "品川", date: "2026/02/16", startTime: "17:00", endTime: "20:30", expectedDemand: 85, category: "コンサート", lat: 35.5092, lng: 139.6178, note: "品川経由で帰る客多数" },
  { id: "e8", title: "幕張メッセ ゲームショー", area: "お台場", date: "2026/02/19", startTime: "10:00", endTime: "17:00", expectedDemand: 80, category: "展示会", lat: 35.6479, lng: 140.0347, note: "夕方の帰宅ラッシュ注意" },
  { id: "e9", title: "六本木ヒルズ アートナイト", area: "六本木", date: "2026/02/15", startTime: "10:00", endTime: "23:00", expectedDemand: 65, category: "イベント", lat: 35.6605, lng: 139.7292, note: "深夜帯も需要あり" },
  { id: "e10", title: "新宿御苑 花見期間", area: "新宿", date: "2026/03/20", startTime: "09:00", endTime: "17:00", expectedDemand: 55, category: "季節行事", lat: 35.6852, lng: 139.7100, note: "家族連れのタクシー需要" },
];

const EVENT_CATEGORIES = [
  { value: "all", label: "すべて", icon: "📋" },
  { value: "コンサート", label: "コンサート", icon: "🎵" },
  { value: "スポーツ", label: "スポーツ", icon: "⚽" },
  { value: "展示会", label: "展示会", icon: "🏛️" },
  { value: "イベント", label: "イベント", icon: "🎪" },
  { value: "講演会", label: "講演会", icon: "🎤" },
  { value: "季節行事", label: "季節行事", icon: "🌸" },
];

// ============================================================
// スタイル定数
// ============================================================
const C = { primary: "#2563eb", secondary: "#7c3aed", accent: "#f59e0b", success: "#10b981", danger: "#ef4444", bg: "#0a0e1a", card: "rgba(30,41,59,0.7)", cardSolid: "#1e293b", cardHover: "#334155", text: "#f1f5f9", textMuted: "#94a3b8", border: "rgba(51,65,85,0.5)", glow1: "#2563eb", glow2: "#7c3aed" };
const PIE_COLORS = ["#2563eb", "#7c3aed", "#f59e0b", "#10b981", "#ef4444", "#06b6d4", "#ec4899"];
const getDemandColor = v => v >= 80 ? "#ef4444" : v >= 60 ? "#f59e0b" : v >= 40 ? "#22c55e" : v >= 20 ? "#3b82f6" : "#334155";
const tooltipStyle = { background: "rgba(15,23,42,0.95)", border: `1px solid rgba(37,99,235,0.3)`, borderRadius: 10, color: C.text, backdropFilter: "blur(12px)" };
const btnBase = { border: "none", borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 16, padding: "16px 32px", transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)", display: "flex", alignItems: "center", gap: 8 };

// ============================================================
// アニメーション背景コンポーネント
// ============================================================
function AnimatedBackground() {
  // 動的パーティクル（都市の灯りイメージ）
  const particles = useMemo(() => Array.from({ length: 50 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 1 + Math.random() * 3,
    opacity: 0.1 + Math.random() * 0.4,
    dur: 3 + Math.random() * 7,
    delay: Math.random() * 5,
    color: ["#2563eb", "#7c3aed", "#f59e0b", "#10b981"][Math.floor(Math.random() * 4)],
  })), []);

  // 道路グリッドライン
  const gridLines = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    id: i,
    isVertical: i < 6,
    pos: 10 + (i % 6) * 18,
    dur: 15 + Math.random() * 10,
    delay: Math.random() * 8,
  })), []);

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
      {/* メインのグラデーション背景 */}
      <div style={{
        position: "absolute", inset: 0,
        background: `
          radial-gradient(ellipse 80% 50% at 20% 20%, rgba(37,99,235,0.12) 0%, transparent 60%),
          radial-gradient(ellipse 60% 40% at 80% 80%, rgba(124,58,237,0.10) 0%, transparent 60%),
          radial-gradient(ellipse 50% 50% at 50% 50%, rgba(245,158,11,0.05) 0%, transparent 50%),
          linear-gradient(180deg, #0a0e1a 0%, #0d1323 30%, #0f172a 60%, #0a0e1a 100%)
        `,
      }} />

      {/* SVGパーティクル + グリッド */}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id="particleGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <filter id="bgBlur">
            <feGaussianBlur stdDeviation="1.5" />
          </filter>
        </defs>

        {/* 道路風グリッドライン（流れるアニメーション） */}
        {gridLines.map(line => (
          <g key={`grid-${line.id}`} opacity="0.04">
            {line.isVertical ? (
              <line x1={`${line.pos}%`} y1="0%" x2={`${line.pos}%`} y2="100%" stroke="#94a3b8" strokeWidth="1" strokeDasharray="8 16">
                <animate attributeName="stroke-dashoffset" values="0;-48" dur={`${line.dur}s`} repeatCount="indefinite" />
              </line>
            ) : (
              <line x1="0%" y1={`${line.pos}%`} x2="100%" y2={`${line.pos}%`} stroke="#94a3b8" strokeWidth="1" strokeDasharray="8 16">
                <animate attributeName="stroke-dashoffset" values="0;-48" dur={`${line.dur}s`} repeatCount="indefinite" />
              </line>
            )}
          </g>
        ))}

        {/* パーティクル（都市の灯り） */}
        {particles.map(p => (
          <circle key={p.id} cx={`${p.x}%`} cy={`${p.y}%`} r={p.size} fill={p.color} filter="url(#bgBlur)">
            <animate attributeName="opacity" values={`${p.opacity};${p.opacity * 0.2};${p.opacity}`} dur={`${p.dur}s`} begin={`${p.delay}s`} repeatCount="indefinite" />
            <animate attributeName="r" values={`${p.size};${p.size * 1.5};${p.size}`} dur={`${p.dur}s`} begin={`${p.delay}s`} repeatCount="indefinite" />
          </circle>
        ))}

        {/* 移動する光点（タクシーイメージ） */}
        {[0, 1, 2, 3, 4].map(i => {
          const startX = Math.random() * 100;
          const startY = Math.random() * 100;
          const endX = Math.random() * 100;
          const endY = Math.random() * 100;
          return (
            <circle key={`taxi-${i}`} r="2" fill="#f59e0b" opacity="0.6" filter="url(#bgBlur)">
              <animate attributeName="cx" values={`${startX}%;${endX}%;${startX}%`} dur={`${20 + i * 5}s`} repeatCount="indefinite" />
              <animate attributeName="cy" values={`${startY}%;${endY}%;${startY}%`} dur={`${20 + i * 5}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;0.6;0.6;0" dur={`${20 + i * 5}s`} repeatCount="indefinite" />
            </circle>
          );
        })}
      </svg>

      {/* 上部グロー効果 */}
      <div style={{
        position: "absolute", top: -200, left: "50%", transform: "translateX(-50%)",
        width: 800, height: 400, borderRadius: "50%",
        background: "radial-gradient(ellipse, rgba(37,99,235,0.08) 0%, transparent 70%)",
        filter: "blur(40px)",
      }} />

      {/* ノイズテクスチャオーバーレイ */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`,
        opacity: 0.5,
      }} />
    </div>
  );
}

// ============================================================
// 共通コンポーネント
// ============================================================
const glassCard = {
  background: "rgba(30,41,59,0.55)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(148,163,184,0.08)",
  boxShadow: "0 4px 30px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)",
};

const glassCardHover = {
  ...glassCard,
  boxShadow: "0 8px 40px rgba(37,99,235,0.15), inset 0 1px 0 rgba(255,255,255,0.08)",
};

function StatCard({ label, value, sub, icon, trend }) {
  const [hovered, setHovered] = useState(false);
  const mob = useIsMobile();
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...(hovered ? glassCardHover : glassCard),
        borderRadius: mob ? 10 : 14,
        padding: mob ? "10px 12px" : "16px 18px",
        display: "flex",
        alignItems: "center",
        gap: mob ? 8 : 12,
        flex: 1,
        minWidth: mob ? 0 : 170,
        transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
      }}
    >
      <div style={{
        width: mob ? 32 : 44, height: mob ? 32 : 44, borderRadius: mob ? 8 : 12,
        background: `linear-gradient(135deg, ${C.primary}33, ${C.secondary}22)`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: mob ? 15 : 20,
        boxShadow: `0 0 20px ${C.primary}22`,
        flexShrink: 0,
      }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.textMuted, fontSize: mob ? 9 : 11, marginBottom: 1, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
        <div style={{ color: C.text, fontSize: mob ? 15 : 20, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
        {sub && <div style={{ fontSize: mob ? 9 : 11, color: trend === "up" ? C.success : trend === "down" ? C.danger : C.textMuted, fontWeight: 600 }}>{trend === "up" ? "▲ " : trend === "down" ? "▼ " : ""}{sub}</div>}
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  const mob = useIsMobile();
  return (
    <h2 style={{
      color: C.text, fontSize: mob ? 14 : 16, fontWeight: 800, margin: mob ? "18px 0 10px" : "28px 0 14px",
      display: "flex", alignItems: "center", gap: 8,
      background: "linear-gradient(90deg, rgba(37,99,235,0.1) 0%, transparent 100%)",
      padding: mob ? "8px 12px" : "10px 16px", borderRadius: 10,
      borderLeft: `3px solid ${C.primary}`,
    }}>{children}</h2>
  );
}

function Badge({ children, color }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: `${color}18`, color,
      padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
      border: `1px solid ${color}30`,
      backdropFilter: "blur(8px)",
    }}>{children}</span>
  );
}

// ============================================================
// GPS Hook
// ============================================================
function useGPS() {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const watchRef = useRef(null);
  const getCurrentPosition = useCallback(() => {
    if (!navigator.geolocation) { setError("GPS非対応"); return; }
    setLoading(true); setError(null);
    navigator.geolocation.getCurrentPosition(p => { setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); setLoading(false); }, e => { setError(e.code === 1 ? "位置情報の許可が必要です" : "位置取得エラー"); setLoading(false); }, { enableHighAccuracy: true, timeout: 10000 });
  }, []);
  const startWatching = useCallback(() => { if (!navigator.geolocation) return; watchRef.current = navigator.geolocation.watchPosition(p => setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), () => {}, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }); }, []);
  const stopWatching = useCallback(() => { if (watchRef.current !== null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; } }, []);
  return { position, error, loading, getCurrentPosition, startWatching, stopWatching };
}

// ============================================================
// 天気 Hook (Open-Meteo)
// ============================================================
function useWeather(lat, lng) {
  const [weather, setWeather] = useState(null);
  const fetchWeather = useCallback(async (la, ln) => {
    if (!la || !ln) return;
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${ln}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Asia/Tokyo`);
      const data = await res.json(); const code = data.current?.weather_code;
      let condition = "sunny";
      if (code >= 80) condition = "heavy_rain"; else if (code >= 51) condition = "rainy"; else if (code >= 71) condition = "snow"; else if (code >= 2) condition = "cloudy";
      setWeather({ condition, temp: data.current?.temperature_2m, windSpeed: data.current?.wind_speed_10m });
    } catch { setWeather(null); }
  }, []);
  useEffect(() => { if (lat && lng) fetchWeather(lat, lng); }, [lat, lng, fetchWeather]);
  return { weather, fetchWeather };
}

// ============================================================
// Google Maps 交通状況マップ（JavaScript API + TrafficLayer）
// ============================================================
const GOOGLE_MAPS_API_KEY = "AIzaSyD0VgoHMT5XdVUgJKygrjpxAU87hjRBEZw";

// Google Maps スクリプトローダー
const gmapScriptState = { loaded: false, loading: false, callbacks: [] };
function loadGoogleMapsScript() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) { gmapScriptState.loaded = true; resolve(); return; }
    if (gmapScriptState.loaded) { resolve(); return; }
    gmapScriptState.callbacks.push({ resolve, reject });
    if (gmapScriptState.loading) return;
    gmapScriptState.loading = true;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&language=ja&region=JP`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      gmapScriptState.loaded = true;
      gmapScriptState.loading = false;
      gmapScriptState.callbacks.forEach(cb => cb.resolve());
      gmapScriptState.callbacks = [];
    };
    script.onerror = (err) => {
      gmapScriptState.loading = false;
      gmapScriptState.callbacks.forEach(cb => cb.reject(err));
      gmapScriptState.callbacks = [];
    };
    document.head.appendChild(script);
  });
}

function GoogleTrafficMap({ center, zoom = 13, selectedArea, rides, trafficData, userPosition }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const trafficLayerRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [showTraffic, setShowTraffic] = useState(true);

  // マップ初期化
  useEffect(() => {
    let cancelled = false;
    loadGoogleMapsScript()
      .then(() => {
        if (cancelled || !mapRef.current) return;
        const map = new window.google.maps.Map(mapRef.current, {
          center: { lat: center.lat, lng: center.lng },
          zoom,
          mapTypeId: "roadmap",
          styles: [
            { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#8892b0" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#2d2d44" }] },
            { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1a1a2e" }] },
            { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a3a5c" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1a2b" }] },
            { featureType: "poi", elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
            { featureType: "transit", elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
            { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
          ],
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: "greedy",
        });
        mapInstanceRef.current = map;

        // 交通レイヤー追加
        const trafficLayer = new window.google.maps.TrafficLayer();
        trafficLayer.setMap(map);
        trafficLayerRef.current = trafficLayer;

        setMapReady(true);
      })
      .catch(err => {
        if (!cancelled) setMapError("Google Maps の読み込みに失敗しました");
        console.error("Google Maps load error:", err);
      });
    return () => { cancelled = true; };
  }, []);

  // center/zoom 変更時にマップを更新
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.panTo({ lat: center.lat, lng: center.lng });
    mapInstanceRef.current.setZoom(zoom);
  }, [center.lat, center.lng, zoom]);

  // 交通レイヤーの表示/非表示
  useEffect(() => {
    if (!trafficLayerRef.current || !mapInstanceRef.current) return;
    trafficLayerRef.current.setMap(showTraffic ? mapInstanceRef.current : null);
  }, [showTraffic]);

  // エリアマーカー表示
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !trafficData) return;
    // 既存マーカーをクリア
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    trafficData.forEach(area => {
      const color = area.level === "heavy" ? "#ef4444" : area.level === "congested" ? "#f97316" : area.level === "normal" ? "#f59e0b" : "#10b981";
      const marker = new window.google.maps.Marker({
        position: { lat: area.lat, lng: area.lng },
        map: mapInstanceRef.current,
        title: `${area.name} - ${getTrafficLabel(area.level)} (${area.congestion}%)`,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10 + (area.congestion / 100) * 8,
          fillColor: color,
          fillOpacity: 0.7,
          strokeColor: "#fff",
          strokeWeight: area.name === selectedArea ? 3 : 1.5,
        },
        label: {
          text: area.name,
          color: "#fff",
          fontSize: "11px",
          fontWeight: "bold",
        },
        zIndex: area.name === selectedArea ? 100 : 10,
      });

      const infoContent = `
        <div style="background:#1e293b;color:#f1f5f9;padding:12px;border-radius:8px;min-width:180px;font-family:sans-serif;">
          <div style="font-size:15px;font-weight:700;margin-bottom:6px;">${area.name}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};"></span>
            <span>${getTrafficIcon(area.level)} ${getTrafficLabel(area.level)} (${area.congestion}%)</span>
          </div>
          <div style="font-size:12px;color:#94a3b8;">平均速度: ${area.avgSpeed} km/h</div>
          ${area.estDelay > 0 ? `<div style="font-size:12px;color:#f97316;">推定遅延: +${area.estDelay}分</div>` : ""}
        </div>
      `;
      const infoWindow = new window.google.maps.InfoWindow({ content: infoContent });
      marker.addListener("click", () => { infoWindow.open(mapInstanceRef.current, marker); });
      markersRef.current.push(marker);
    });
  }, [trafficData, selectedArea, mapReady]);

  // ユーザー位置マーカー
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;
    if (userMarkerRef.current) userMarkerRef.current.setMap(null);
    if (userPosition) {
      userMarkerRef.current = new window.google.maps.Marker({
        position: { lat: userPosition.lat, lng: userPosition.lng },
        map: mapInstanceRef.current,
        title: "現在地",
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#2563eb",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 3,
        },
        zIndex: 200,
      });
    }
  }, [userPosition, mapReady]);

  if (mapError) {
    return (
      <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(148,163,184,0.08)", background: C.card, padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ color: C.danger, fontWeight: 700, marginBottom: 8 }}>{mapError}</div>
        <div style={{ color: C.textMuted, fontSize: 13 }}>APIキーを確認してください</div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(148,163,184,0.08)", boxShadow: "0 4px 30px rgba(0,0,0,0.2)" }}>
      {/* マップコンテナ */}
      <div ref={mapRef} style={{ width: "100%", height: 450 }} />

      {/* ローディング */}
      {!mapReady && !mapError && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, zIndex: 10 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8, animation: "spin 1.5s linear infinite" }}>🗺️</div>
            <div style={{ color: C.textMuted, fontSize: 13 }}>Google Maps を読み込み中...</div>
          </div>
        </div>
      )}

      {/* コントロールオーバーレイ */}
      <div style={{ position: "absolute", top: 12, right: 12, display: "flex", flexDirection: "column", gap: 6, zIndex: 5 }}>
        {/* 交通レイヤートグル */}
        <button
          onClick={() => setShowTraffic(prev => !prev)}
          style={{
            background: showTraffic ? C.danger : "rgba(30,41,59,0.9)",
            color: "#fff", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            border: showTraffic ? "none" : `1px solid ${C.border}`,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)", backdropFilter: "blur(8px)",
          }}>
          🚦 渋滞情報 {showTraffic ? "ON" : "OFF"}
        </button>
        {/* Google Mapsで開く */}
        <a href={`https://www.google.com/maps/@${center.lat},${center.lng},${zoom}z/data=!5m1!1e1`}
          target="_blank" rel="noreferrer"
          style={{ background: "rgba(30,41,59,0.9)", color: "#fff", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 2px 8px rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, backdropFilter: "blur(8px)" }}>
          🗺️ Google Mapsで開く
        </a>
      </div>

      {/* 凡例 */}
      <div style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(15,23,42,0.9)", borderRadius: 8, padding: "8px 12px", display: "flex", gap: 12, alignItems: "center", backdropFilter: "blur(8px)", zIndex: 5 }}>
        <span style={{ color: C.textMuted, fontSize: 11, fontWeight: 600 }}>渋滞レベル:</span>
        {[{ c: "#10b981", l: "スムーズ" }, { c: "#f59e0b", l: "やや混雑" }, { c: "#f97316", l: "混雑" }, { c: "#ef4444", l: "渋滞" }].map(item => (
          <span key={item.l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ display: "inline-block", width: 20, height: 4, borderRadius: 2, background: item.c }} />
            <span style={{ color: C.textMuted, fontSize: 10 }}>{item.l}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// エリア別交通状況ビジュアルマップ (SVG)
// ============================================================
function AreaTrafficMap({ trafficData, selectedArea, onSelectArea, rides, userPosition }) {
  // 座標をSVG空間にマッピング
  const minLat = 35.52, maxLat = 35.75, minLng = 139.39, maxLng = 139.82;
  const svgW = 700, svgH = 450;
  const toSvg = (lat, lng) => ({
    x: ((lng - minLng) / (maxLng - minLng)) * svgW,
    y: svgH - ((lat - minLat) / (maxLat - minLat)) * svgH,
  });

  const congestionColor = (level) => level === "heavy" ? "#ef4444" : level === "congested" ? "#f97316" : level === "normal" ? "#f59e0b" : "#10b981";
  const congestionRadius = (congestion) => 18 + (congestion / 100) * 22;

  // 乗車記録の線をプロット
  const rideLines = rides.slice(0, 20).filter(r => r.乗車GPS && r.降車GPS);

  return (
    <div style={{ ...glassCard, borderRadius: 14, padding: 16, position: "relative" }}>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", height: "auto", minHeight: 350 }}>
        {/* 背景グリッド */}
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke={C.border} strokeWidth="0.5" opacity="0.3" />
          </pattern>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="glow" />
            <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="shadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" />
          </filter>
        </defs>
        <rect width={svgW} height={svgH} fill={C.bg} rx="8" />
        <rect width={svgW} height={svgH} fill="url(#grid)" rx="8" />

        {/* 乗車ルート線 */}
        {rideLines.map((r, i) => {
          const from = toSvg(r.乗車GPS.lat, r.乗車GPS.lng);
          const to = toSvg(r.降車GPS.lat, r.降車GPS.lng);
          return <line key={`line-${i}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={C.primary} strokeWidth="1" opacity="0.2" strokeDasharray="4 2" />;
        })}

        {/* エリア接続線（主要路線風） */}
        {[
          ["東京駅", "銀座"], ["東京駅", "上野"], ["東京駅", "品川"], ["新宿", "渋谷"],
          ["新宿", "池袋"], ["新宿", "中野"], ["渋谷", "六本木"], ["上野", "浅草"],
          ["上野", "秋葉原"], ["中野", "吉祥寺"], ["吉祥寺", "立川"], ["品川", "お台場"],
        ].map(([a, b], i) => {
          const aData = trafficData.find(t => t.name === a);
          const bData = trafficData.find(t => t.name === b);
          if (!aData || !bData) return null;
          const from = toSvg(aData.lat, aData.lng), to = toSvg(bData.lat, bData.lng);
          const avgCong = (aData.congestion + bData.congestion) / 2;
          const lineColor = avgCong >= 75 ? "#ef4444" : avgCong >= 50 ? "#f97316" : avgCong >= 30 ? "#f59e0b" : "#10b981";
          return <line key={`road-${i}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={lineColor} strokeWidth={avgCong >= 50 ? 3 : 2} opacity="0.6" strokeLinecap="round" />;
        })}

        {/* エリアポイント */}
        {trafficData.map(area => {
          const pos = toSvg(area.lat, area.lng);
          const r = congestionRadius(area.congestion);
          const color = congestionColor(area.level);
          const isSelected = selectedArea === area.name;
          return (
            <g key={area.name} onClick={() => onSelectArea(area.name)} style={{ cursor: "pointer" }}>
              {/* 混雑度の円（パルスアニメーション風） */}
              <circle cx={pos.x} cy={pos.y} r={r + 8} fill={color} opacity="0.1">
                <animate attributeName="r" values={`${r + 5};${r + 15};${r + 5}`} dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.15;0.05;0.15" dur="3s" repeatCount="indefinite" />
              </circle>
              <circle cx={pos.x} cy={pos.y} r={r} fill={color} opacity="0.25" filter="url(#glow)" />
              <circle cx={pos.x} cy={pos.y} r={12} fill={isSelected ? "#fff" : color} stroke={isSelected ? color : "#fff"} strokeWidth={isSelected ? 3 : 2} filter="url(#shadow)" />

              {/* ラベル */}
              <text x={pos.x} y={pos.y - 18} textAnchor="middle" fill={C.text} fontSize="11" fontWeight="700">{area.name}</text>

              {/* 混雑度数値 */}
              <text x={pos.x} y={pos.y + 4} textAnchor="middle" fill={isSelected ? color : "#fff"} fontSize="9" fontWeight="800">{area.congestion}</text>

              {/* 速度表示 */}
              <text x={pos.x} y={pos.y + 30} textAnchor="middle" fill={C.textMuted} fontSize="9">{area.avgSpeed}km/h</text>
            </g>
          );
        })}

        {/* 現在位置マーカー */}
        {userPosition && (() => {
          const p = toSvg(userPosition.lat, userPosition.lng);
          if (p.x >= 0 && p.x <= svgW && p.y >= 0 && p.y <= svgH) {
            return (
              <g>
                <circle cx={p.x} cy={p.y} r="20" fill="#2563eb" opacity="0.12">
                  <animate attributeName="r" values="15;25;15" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.15;0.05;0.15" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle cx={p.x} cy={p.y} r="7" fill="#2563eb" stroke="#fff" strokeWidth="2.5" />
                <text x={p.x} y={p.y - 14} textAnchor="middle" fill="#2563eb" fontSize="10" fontWeight="800">現在地</text>
              </g>
            );
          }
          return null;
        })()}

        {/* 凡例 */}
        <g transform={`translate(${svgW - 140}, 15)`}>
          <rect x="0" y="0" width="130" height="105" rx="6" fill={C.card} opacity="0.9" stroke={C.border} />
          <text x="10" y="18" fill={C.text} fontSize="10" fontWeight="700">交通状況</text>
          {[{ c: "#10b981", l: "スムーズ" }, { c: "#f59e0b", l: "通常" }, { c: "#f97316", l: "混雑" }, { c: "#ef4444", l: "渋滞" }].map((item, i) => (
            <g key={i} transform={`translate(10, ${30 + i * 18})`}>
              <circle cx="6" cy="0" r="5" fill={item.c} /><text x="18" y="4" fill={C.textMuted} fontSize="10">{item.l}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

// ============================================================
// エリア詳細パネル
// ============================================================
function AreaDetailPanel({ area, trafficData, rides, demandData, currentHour }) {
  const areaTraffic = trafficData.find(t => t.name === area);
  const areaRides = rides.filter(r => r.乗車地 === area || r.降車地 === area);
  const areaDemand = demandData.filter(d => d.area === area && d.hour === currentHour)[0];
  const areaCoord = AREAS.find(a => a.name === area);

  if (!areaTraffic || !areaCoord) return null;

  const hourlyTraffic = HOURS.map(h => {
    const t = generateTrafficStatus(h).find(t => t.name === area);
    return { 時間: `${h}時`, 混雑度: t?.congestion || 0, 平均速度: t?.avgSpeed || 0 };
  });

  return (
    <div style={{ ...glassCard, borderRadius: 14, padding: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ color: C.text, fontSize: 18, fontWeight: 800, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              📍 {area}
              <Badge color={getTrafficColor(areaTraffic.level)}>{getTrafficIcon(areaTraffic.level)} {getTrafficLabel(areaTraffic.level)}</Badge>
            </div>
            <div style={{ color: C.textMuted, fontSize: 11, marginTop: 4 }}>
              {areaCoord.lat.toFixed(4)}, {areaCoord.lng.toFixed(4)}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href={`https://www.google.com/maps/@${areaCoord.lat},${areaCoord.lng},15z/data=!5m1!1e1`}
            target="_blank" rel="noreferrer"
            style={{ background: C.danger, color: "#fff", padding: "7px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, textDecoration: "none", flex: 1, textAlign: "center" }}>
            🚦 交通情報
          </a>
          <a href={`https://www.google.com/maps/search/タクシー乗り場/@${areaCoord.lat},${areaCoord.lng},15z`}
            target="_blank" rel="noreferrer"
            style={{ background: C.primary, color: "#fff", padding: "7px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, textDecoration: "none", flex: 1, textAlign: "center" }}>
            🚕 タクシー乗り場
          </a>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 16 }}>
        <div style={{ background: C.bg, borderRadius: 10, padding: 12, textAlign: "center" }}>
          <div style={{ color: C.textMuted, fontSize: 11 }}>混雑度</div>
          <div style={{ color: getTrafficColor(areaTraffic.level), fontSize: 24, fontWeight: 800 }}>{areaTraffic.congestion}%</div>
        </div>
        <div style={{ background: C.bg, borderRadius: 10, padding: 12, textAlign: "center" }}>
          <div style={{ color: C.textMuted, fontSize: 11 }}>平均速度</div>
          <div style={{ color: C.text, fontSize: 24, fontWeight: 800 }}>{areaTraffic.avgSpeed}<span style={{ fontSize: 12 }}>km/h</span></div>
        </div>
        <div style={{ background: C.bg, borderRadius: 10, padding: 12, textAlign: "center" }}>
          <div style={{ color: C.textMuted, fontSize: 11 }}>推定遅延</div>
          <div style={{ color: areaTraffic.estDelay > 0 ? C.danger : C.success, fontSize: 24, fontWeight: 800 }}>{areaTraffic.estDelay > 0 ? `+${areaTraffic.estDelay}` : "0"}<span style={{ fontSize: 12 }}>分</span></div>
        </div>
        <div style={{ background: C.bg, borderRadius: 10, padding: 12, textAlign: "center" }}>
          <div style={{ color: C.textMuted, fontSize: 11 }}>需要スコア</div>
          <div style={{ color: C.accent, fontSize: 24, fontWeight: 800 }}>{areaDemand?.demand || "—"}</div>
        </div>
      </div>

      {/* 時間帯別混雑予測 */}
      <div style={{ color: C.textMuted, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>📊 時間帯別混雑予測</div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={hourlyTraffic}>
          <defs>
            <linearGradient id="congGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={C.danger} stopOpacity={0.3} /><stop offset="95%" stopColor={C.danger} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis dataKey="時間" stroke={C.textMuted} fontSize={10} />
          <YAxis stroke={C.textMuted} fontSize={10} domain={[0, 100]} />
          <Tooltip contentStyle={tooltipStyle} />
          <Area type="monotone" dataKey="混雑度" stroke={C.danger} fill="url(#congGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>

      {/* このエリアの乗車履歴 */}
      {areaRides.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: C.textMuted, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>🚕 このエリアの乗車記録 ({areaRides.length}件)</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {areaRides.slice(0, 6).map(r => (
              <div key={r.id} style={{ background: C.bg, borderRadius: 8, padding: "8px 12px", fontSize: 12, minWidth: 140 }}>
                <div style={{ color: C.text, fontWeight: 600 }}>{r.乗車地} → {r.降車地}</div>
                <div style={{ color: C.textMuted }}>{r.日付} {r.時刻}</div>
                <div style={{ color: C.accent, fontWeight: 700 }}>¥{r.運賃.toLocaleString()} {getWeatherIcon(r.天気)} {getTrafficIcon(r.交通状況)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 乗車記録フォーム
// ============================================================
function RideRecorder({ onSave }) {
  const gps = useGPS();
  const [phase, setPhase] = useState("idle");
  const [pickupData, setPickupData] = useState(null);
  const [dropoffData, setDropoffData] = useState(null);
  const [manualFare, setManualFare] = useState("");
  const [manualDist, setManualDist] = useState("");
  const [traffic, setTraffic] = useState("normal");
  const [weatherOverride, setWeatherOverride] = useState("");
  const [memo, setMemo] = useState("");
  const [currentWeather, setCurrentWeather] = useState(null);
  const wh = useWeather(gps.position?.lat, gps.position?.lng);
  useEffect(() => { if (wh.weather) setCurrentWeather(wh.weather); }, [wh.weather]);

  const handlePickup = () => {
    gps.getCurrentPosition();
    setTimeout(() => {
      const pos = gps.position || { lat: 35.6812 + (Math.random() - 0.5) * 0.02, lng: 139.7671 + (Math.random() - 0.5) * 0.02 };
      const now = new Date();
      setPickupData({ gps: pos, area: getNearestArea(pos.lat, pos.lng), time: now, ...formatDateTime(now) });
      setPhase("riding"); gps.startWatching();
    }, 500);
  };

  const handleDropoff = () => {
    gps.stopWatching();
    const pos = gps.position || { lat: 35.6580 + (Math.random() - 0.5) * 0.02, lng: 139.7016 + (Math.random() - 0.5) * 0.02 };
    const now = new Date();
    setDropoffData({ gps: pos, area: getNearestArea(pos.lat, pos.lng), time: now, ...formatDateTime(now) });
    setPhase("confirm");
  };

  const handleSave = () => {
    if (!pickupData) return;
    const dist = manualDist ? parseFloat(manualDist) : +(1 + Math.random() * 12).toFixed(1);
    const fare = manualFare ? parseInt(manualFare) : Math.round(410 + dist * 280 * (pickupData.hour >= 22 || pickupData.hour <= 5 ? 1.25 : 1));
    onSave({ id: `ride-${Date.now()}`, timestamp: pickupData.time.getTime(), 日付: pickupData.date, 時刻: pickupData.time, 曜日: pickupData.weekday, 乗車地: pickupData.area, 乗車GPS: pickupData.gps, 降車地: dropoffData?.area || "—", 降車GPS: dropoffData?.gps || null, 距離: dist, 運賃: fare, 天気: weatherOverride || currentWeather?.condition || "sunny", 気温: currentWeather?.temp, 交通状況: traffic, 深夜: pickupData.hour >= 22 || pickupData.hour <= 5, メモ: memo });
    setPhase("idle"); setPickupData(null); setDropoffData(null); setManualFare(""); setManualDist(""); setTraffic("normal"); setWeatherOverride(""); setMemo("");
  };

  const handleCancel = () => { gps.stopWatching(); setPhase("idle"); setPickupData(null); setDropoffData(null); };

  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 14, boxSizing: "border-box" };

  return (
    <div style={{ ...glassCard, borderRadius: 16, padding: 20, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>📍</span>
          <div><div style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>乗車記録</div><div style={{ color: C.textMuted, fontSize: 11 }}>GPS・天気・交通を自動記録</div></div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {gps.position && <Badge color={C.success}>📡 GPS</Badge>}
          {currentWeather && <Badge color={C.primary}>{getWeatherIcon(currentWeather.condition)} {currentWeather.temp}°C</Badge>}
          {gps.loading && <Badge color={C.accent}>取得中...</Badge>}
        </div>
      </div>

      {phase === "idle" && (
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          <button onClick={handlePickup} style={{ ...btnBase, background: C.success, color: "#fff", fontSize: 18, padding: "18px 44px", borderRadius: 14, boxShadow: "0 4px 20px rgba(16,185,129,0.3)", margin: "0 auto" }}>🚕 乗車開始</button>
          <div style={{ color: C.textMuted, fontSize: 12, marginTop: 10 }}>GPSで現在地を取得し記録を開始します</div>
          {gps.error && <div style={{ color: C.danger, fontSize: 12, marginTop: 6 }}>⚠️ {gps.error}</div>}
        </div>
      )}

      {phase === "riding" && (
        <div>
          <div style={{ background: `${C.success}15`, border: `1px solid ${C.success}40`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ color: C.success, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>🟢 乗車中</div>
            <div style={{ display: "flex", gap: 20, fontSize: 13, flexWrap: "wrap" }}>
              <span><span style={{ color: C.textMuted }}>乗車地：</span><span style={{ color: C.text, fontWeight: 600 }}>{pickupData.area}</span></span>
              <span><span style={{ color: C.textMuted }}>時刻：</span><span style={{ color: C.text, fontWeight: 600 }}>{pickupData.time} ({pickupData.weekday})</span></span>
              <span><span style={{ color: C.textMuted }}>GPS：</span><span style={{ color: C.text, fontSize: 11 }}>{pickupData.gps.lat.toFixed(4)}, {pickupData.gps.lng.toFixed(4)}</span></span>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: C.textMuted, fontSize: 12, marginBottom: 6 }}>交通状況：</div>
            <div style={{ display: "flex", gap: 6 }}>
              {TRAFFIC_OPTIONS.map(t => (
                <button key={t.value} onClick={() => setTraffic(t.value)} style={{ ...btnBase, fontSize: 12, padding: "8px 14px", borderRadius: 8, background: traffic === t.value ? `${t.color}22` : C.cardHover, color: traffic === t.value ? t.color : C.textMuted, border: traffic === t.value ? `2px solid ${t.color}` : `2px solid transparent` }}>{t.icon} {t.label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleDropoff} style={{ ...btnBase, background: C.danger, color: "#fff", flex: 1, justifyContent: "center", fontSize: 16, padding: "16px" }}>🏁 降車記録</button>
            <button onClick={handleCancel} style={{ ...btnBase, background: C.cardHover, color: C.textMuted, padding: "16px 20px" }}>取消</button>
          </div>
        </div>
      )}

      {phase === "confirm" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, marginBottom: 16 }}>
            <div style={{ background: `${C.success}10`, borderRadius: 10, padding: 14 }}>
              <div style={{ color: C.success, fontWeight: 700, fontSize: 12, marginBottom: 4 }}>🟢 乗車</div>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>{pickupData.area}</div>
              <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>{pickupData.date} {pickupData.time} ({pickupData.weekday})</div>
              <div style={{ color: C.textMuted, fontSize: 10 }}>📍 {pickupData.gps.lat.toFixed(4)}, {pickupData.gps.lng.toFixed(4)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", fontSize: 20, color: C.textMuted }}>→</div>
            <div style={{ background: `${C.danger}10`, borderRadius: 10, padding: 14 }}>
              <div style={{ color: C.danger, fontWeight: 700, fontSize: 12, marginBottom: 4 }}>🔴 降車</div>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>{dropoffData?.area || "—"}</div>
              <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>{dropoffData?.date} {dropoffData?.time} ({dropoffData?.weekday})</div>
              <div style={{ color: C.textMuted, fontSize: 10 }}>📍 {dropoffData?.gps.lat.toFixed(4)}, {dropoffData?.gps.lng.toFixed(4)}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div><label style={{ color: C.textMuted, fontSize: 11, display: "block", marginBottom: 3 }}>距離 (km)</label><input type="number" step="0.1" placeholder="自動" value={manualDist} onChange={e => setManualDist(e.target.value)} style={inputStyle} /></div>
            <div><label style={{ color: C.textMuted, fontSize: 11, display: "block", marginBottom: 3 }}>運賃 (円)</label><input type="number" placeholder="自動" value={manualFare} onChange={e => setManualFare(e.target.value)} style={inputStyle} /></div>
            <div><label style={{ color: C.textMuted, fontSize: 11, display: "block", marginBottom: 3 }}>天気</label><select value={weatherOverride || currentWeather?.condition || ""} onChange={e => setWeatherOverride(e.target.value)} style={inputStyle}>{WEATHER_OPTIONS.map(w => <option key={w.value} value={w.value}>{w.icon} {w.label}</option>)}</select></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ color: C.textMuted, fontSize: 11, display: "block", marginBottom: 3 }}>交通状況</label>
              <div style={{ display: "flex", gap: 4 }}>{TRAFFIC_OPTIONS.map(t => (
                <button key={t.value} onClick={() => setTraffic(t.value)} style={{ border: traffic === t.value ? `2px solid ${t.color}` : `2px solid transparent`, borderRadius: 6, padding: "6px 8px", cursor: "pointer", fontSize: 10, fontWeight: 600, background: traffic === t.value ? `${t.color}22` : C.cardHover, color: traffic === t.value ? t.color : C.textMuted, flex: 1 }}>{t.icon} {t.label}</button>
              ))}</div>
            </div>
            <div><label style={{ color: C.textMuted, fontSize: 11, display: "block", marginBottom: 3 }}>メモ</label><input type="text" placeholder="任意" value={memo} onChange={e => setMemo(e.target.value)} style={inputStyle} /></div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleSave} style={{ ...btnBase, background: C.primary, color: "#fff", flex: 1, justifyContent: "center" }}>💾 保存</button>
            <button onClick={handleCancel} style={{ ...btnBase, background: C.cardHover, color: C.textMuted }}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 記録テーブル
// ============================================================
function RideTable({ records }) {
  const [sortKey, setSortKey] = useState("timestamp");
  const [sortDir, setSortDir] = useState(-1);
  const [filter, setFilter] = useState({ weather: "", traffic: "" });
  const filtered = useMemo(() => records.filter(r => (!filter.weather || r.天気 === filter.weather) && (!filter.traffic || r.交通状況 === filter.traffic)), [records, filter]);
  const sorted = useMemo(() => [...filtered].sort((a, b) => { const va = a[sortKey], vb = b[sortKey]; return (typeof va === "number" ? va - vb : String(va).localeCompare(String(vb))) * sortDir; }), [filtered, sortKey, sortDir]);
  const handleSort = k => { if (sortKey === k) setSortDir(d => d * -1); else { setSortKey(k); setSortDir(-1); } };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ color: C.textMuted, fontSize: 12 }}>絞込：</span>
        <select value={filter.weather} onChange={e => setFilter(f => ({ ...f, weather: e.target.value }))} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }}><option value="">天気：全</option>{WEATHER_OPTIONS.map(w => <option key={w.value} value={w.value}>{w.icon} {w.label}</option>)}</select>
        <select value={filter.traffic} onChange={e => setFilter(f => ({ ...f, traffic: e.target.value }))} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }}><option value="">交通：全</option>{TRAFFIC_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}</select>
        <span style={{ color: C.textMuted, fontSize: 11, marginLeft: "auto" }}>{sorted.length}件</span>
      </div>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr>{["日付","時刻","曜日","乗車地","降車地","距離","運賃","天気","交通","地図"].map(c => <th key={c} onClick={() => handleSort(c)} style={{ padding: "6px 6px", textAlign: "left", color: C.textMuted, borderBottom: `1px solid ${C.border}`, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", fontSize: 10 }}>{c} {sortKey === c ? (sortDir === 1 ? "▲" : "▼") : ""}</th>)}</tr></thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "8px", color: C.text }}>{r.日付}</td>
                <td style={{ padding: "8px", color: C.text }}>{r.時刻}</td>
                <td style={{ padding: "8px", color: C.text }}>{r.曜日}</td>
                <td style={{ padding: "8px", color: C.text }}><div>{r.乗車地}</div>{r.乗車GPS && <div style={{ fontSize: 9, color: C.textMuted }}>{r.乗車GPS.lat.toFixed(4)},{r.乗車GPS.lng.toFixed(4)}</div>}</td>
                <td style={{ padding: "8px", color: C.text }}><div>{r.降車地}</div>{r.降車GPS && <div style={{ fontSize: 9, color: C.textMuted }}>{r.降車GPS.lat.toFixed(4)},{r.降車GPS.lng.toFixed(4)}</div>}</td>
                <td style={{ padding: "8px", color: C.text }}>{r.距離}km</td>
                <td style={{ padding: "8px", color: C.accent, fontWeight: 600 }}>¥{r.運賃.toLocaleString()}</td>
                <td style={{ padding: "8px" }}><Badge color={C.primary}>{getWeatherIcon(r.天気)} {getWeatherLabel(r.天気)}</Badge></td>
                <td style={{ padding: "8px" }}><Badge color={getTrafficColor(r.交通状況)}>{getTrafficIcon(r.交通状況)} {getTrafficLabel(r.交通状況)}</Badge></td>
                <td style={{ padding: "8px" }}>{r.乗車GPS && <a href={`https://www.google.com/maps/dir/${r.乗車GPS.lat},${r.乗車GPS.lng}/${r.降車GPS ? `${r.降車GPS.lat},${r.降車GPS.lng}` : ""}`} target="_blank" rel="noreferrer" style={{ color: C.primary, fontSize: 10, textDecoration: "none" }}>ルート表示</a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// エクスポート
// ============================================================
function ExportPanel({ rides }) {
  const exportCSV = () => {
    const h = ["日付","時刻","曜日","乗車地","乗車緯度","乗車経度","降車地","降車緯度","降車経度","距離km","運賃","天気","交通状況","深夜","メモ"];
    const rows = rides.map(r => [r.日付,r.時刻,r.曜日,r.乗車地,r.乗車GPS?.lat?.toFixed(6)||"",r.乗車GPS?.lng?.toFixed(6)||"",r.降車地,r.降車GPS?.lat?.toFixed(6)||"",r.降車GPS?.lng?.toFixed(6)||"",r.距離,r.運賃,getWeatherLabel(r.天気),getTrafficLabel(r.交通状況),r.深夜?"○":"",r.メモ||""]);
    const csv = "\uFEFF" + [h.join(","), ...rows.map(r => r.join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" })); a.download = `taxi_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };
  return (
    <button onClick={exportCSV} style={{ padding: "8px 18px", borderRadius: 10, border: `1px solid ${C.primary}40`, background: `linear-gradient(135deg, ${C.primary}15, ${C.secondary}10)`, color: C.primary, cursor: "pointer", fontWeight: 700, fontSize: 12, backdropFilter: "blur(8px)", transition: "all 0.3s" }}>📄 CSV出力</button>
  );
}

// ============================================================
// AI売上アドバイザー
// ============================================================
function AIAdvisor({ rides, trafficData, selectedArea, selectedHour, userPosition, weather }) {
  const mob = useIsMobile();

  // 現在のコンテキストに基づいてアドバイスを生成
  const advice = useMemo(() => {
    const now = new Date();
    const hour = selectedHour;
    const day = WEEKDAYS[now.getDay()];
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    const isLateNight = hour >= 22 || hour <= 5;
    const isRushMorning = hour >= 7 && hour <= 9;
    const isRushEvening = hour >= 17 && hour <= 19;
    const isLunchTime = hour >= 11 && hour <= 14;

    // 需要上位エリアを算出
    const topDemand = DEMAND_DATA
      .filter(d => d.hour === hour)
      .sort((a, b) => b.demand - a.demand)
      .slice(0, 5);

    // 混雑が少なく需要が高いエリア（効率的なエリア）
    const efficient = trafficData
      .filter(t => t.level !== "heavy")
      .map(t => {
        const demand = DEMAND_DATA.find(d => d.area === t.name && d.hour === hour);
        return { ...t, demand: demand?.demand || 0, score: (demand?.demand || 0) * (1 - t.congestion / 200) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    // 今日のイベント
    const todayStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;
    const todayEvents = EVENTS_DB.filter(e => e.date === todayStr);
    const upcomingEvents = todayEvents.filter(e => {
      const endH = parseInt(e.endTime.split(":")[0]);
      return endH >= hour && endH <= hour + 3;
    });

    // 過去データからの洞察
    const areaRides = rides.filter(r => r.曜日 === day);
    const avgFare = areaRides.length > 0 ? Math.round(areaRides.reduce((s, r) => s + r.運賃, 0) / areaRides.length) : 0;
    const bestArea = (() => {
      const m = {};
      areaRides.forEach(r => {
        m[r.乗車地] = (m[r.乗車地] || 0) + r.運賃;
      });
      const sorted = Object.entries(m).sort((a, b) => b[1] - a[1]);
      return sorted[0] ? sorted[0][0] : null;
    })();

    // アドバイス構築
    const tips = [];

    // メインアドバイス
    if (upcomingEvents.length > 0) {
      const ev = upcomingEvents[0];
      tips.push({
        type: "event", priority: "high",
        title: `🎯 ${ev.title}が間もなく終了`,
        text: `${ev.area}周辺で${ev.endTime}頃に大量の需要が見込めます。${ev.note}`,
      });
    }

    if (isRushMorning) {
      tips.push({
        type: "timing", priority: "high",
        title: "🌅 朝ラッシュタイム",
        text: `${efficient[0]?.name || "東京駅"}・${efficient[1]?.name || "品川"}方面のビジネス街で需要大。駅周辺のタクシー乗り場が効率的です。`,
      });
    } else if (isRushEvening) {
      tips.push({
        type: "timing", priority: "high",
        title: "🌆 夕方ラッシュタイム",
        text: `オフィス街から住宅地への帰宅需要がピーク。${efficient[0]?.name || "新宿"}方面がおすすめ。`,
      });
    } else if (isLateNight) {
      tips.push({
        type: "timing", priority: "high",
        title: "🌙 深夜割増タイム",
        text: `繁華街（六本木・渋谷・新宿）で深夜割増の高単価客が見込めます。特に${topDemand[0]?.area}の需要スコア${topDemand[0]?.demand}。`,
      });
    } else if (isLunchTime) {
      tips.push({
        type: "timing", priority: "medium",
        title: "🍱 ランチタイム",
        text: `ビジネス街での短距離移動需要あり。銀座・東京駅周辺で回転率重視の営業が効果的。`,
      });
    }

    // 効率エリア提案
    if (efficient[0]) {
      tips.push({
        type: "area", priority: "medium",
        title: "📍 最効率エリア提案",
        text: `${efficient.map(e => `${e.name}(需要${e.demand}/渋滞${e.congestion}%)`).join("、")}が効率的です。`,
      });
    }

    // 天気による提案
    const weatherCondition = weather?.condition;
    if (weatherCondition === "rainy" || weatherCondition === "heavy_rain") {
      tips.push({
        type: "weather", priority: "high",
        title: "🌧️ 雨天ボーナスチャンス",
        text: "雨天時はタクシー需要が1.3〜1.5倍に増加。駅前・商業施設周辺での待機が特に有効です。",
      });
    } else if (weatherCondition === "snow" || weatherCondition === "typhoon") {
      tips.push({
        type: "weather", priority: "high",
        title: "⚠️ 悪天候・需要急増",
        text: "交通機関の遅延や運休でタクシー需要が急増。安全運転を心がけつつ、駅前待機が最も効率的です。",
      });
    }

    // 過去データの洞察
    if (bestArea && avgFare > 0) {
      tips.push({
        type: "data", priority: "low",
        title: `📊 ${day}曜日の傾向`,
        text: `過去データでは${day}曜日は${bestArea}が最も売上が高く、平均単価¥${avgFare.toLocaleString()}です。`,
      });
    }

    // 週末
    if (isWeekend && !isLateNight && !isRushMorning) {
      tips.push({
        type: "weekend", priority: "medium",
        title: "🗓️ 週末パターン",
        text: "商業・観光エリア（渋谷・浅草・お台場）での需要増。家族連れの中距離移動が多い傾向です。",
      });
    }

    return tips.sort((a, b) => {
      const pri = { high: 0, medium: 1, low: 2 };
      return (pri[a.priority] || 2) - (pri[b.priority] || 2);
    });
  }, [rides, trafficData, selectedHour, weather]);

  const priorityColors = { high: C.danger, medium: C.accent, low: C.primary };
  const priorityLabels = { high: "重要", medium: "推奨", low: "参考" };

  return (
    <div>
      {/* メイン推奨アクション */}
      {advice[0] && (
        <div style={{
          ...glassCard, borderRadius: 14, padding: mob ? 14 : 20, marginBottom: 16,
          borderLeft: `4px solid ${priorityColors[advice[0].priority]}`,
          background: `linear-gradient(135deg, ${priorityColors[advice[0].priority]}10, rgba(30,41,59,0.55))`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Badge color={priorityColors[advice[0].priority]}>{priorityLabels[advice[0].priority]}</Badge>
            <div style={{ color: C.text, fontWeight: 800, fontSize: mob ? 14 : 16 }}>{advice[0].title}</div>
          </div>
          <div style={{ color: C.text, fontSize: mob ? 12 : 14, lineHeight: 1.7 }}>{advice[0].text}</div>
        </div>
      )}

      {/* その他のアドバイス */}
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 12 }}>
        {advice.slice(1).map((tip, i) => (
          <div key={i} style={{
            ...glassCard, borderRadius: 12, padding: mob ? 12 : 16,
            borderLeft: `3px solid ${priorityColors[tip.priority]}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Badge color={priorityColors[tip.priority]}>{priorityLabels[tip.priority]}</Badge>
              <div style={{ color: C.text, fontWeight: 700, fontSize: mob ? 12 : 13 }}>{tip.title}</div>
            </div>
            <div style={{ color: C.textMuted, fontSize: mob ? 11 : 12, lineHeight: 1.6 }}>{tip.text}</div>
          </div>
        ))}
      </div>

      {advice.length === 0 && (
        <div style={{ ...glassCard, borderRadius: 14, padding: 30, textAlign: "center" }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🤖</div>
          <div style={{ color: C.textMuted, fontSize: 13 }}>データを蓄積中です。乗車記録が増えるとアドバイスの精度が向上します。</div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// イベント・催事カレンダー
// ============================================================
function EventCalendar({ onSelectArea }) {
  const mob = useIsMobile();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all"); // "all" | "today" | "week"

  const now = new Date();
  const todayStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;

  const filteredEvents = useMemo(() => {
    let events = [...EVENTS_DB];
    if (categoryFilter !== "all") events = events.filter(e => e.category === categoryFilter);
    if (dateFilter === "today") events = events.filter(e => e.date === todayStr);
    else if (dateFilter === "week") {
      const weekLater = new Date(now.getTime() + 7 * 86400000);
      events = events.filter(e => {
        const [y, m, d] = e.date.split("/").map(Number);
        const eDate = new Date(y, m - 1, d);
        return eDate >= now && eDate <= weekLater;
      });
    }
    return events.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.startTime.localeCompare(b.startTime);
    });
  }, [categoryFilter, dateFilter, todayStr]);

  const demandColor = (d) => d >= 85 ? C.danger : d >= 65 ? C.accent : C.success;
  const getCategoryIcon = (cat) => EVENT_CATEGORIES.find(c => c.value === cat)?.icon || "📋";

  return (
    <div>
      {/* フィルター */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, background: "rgba(15,23,42,0.5)", borderRadius: 8, padding: 3 }}>
          {[{ v: "all", l: "すべて" }, { v: "today", l: "今日" }, { v: "week", l: "今週" }].map(f => (
            <button key={f.v} onClick={() => setDateFilter(f.v)} style={{
              ...btnBase, fontSize: 11, padding: "5px 10px", borderRadius: 6,
              background: dateFilter === f.v ? C.primary : "transparent",
              color: dateFilter === f.v ? "#fff" : C.textMuted,
            }}>{f.l}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {EVENT_CATEGORIES.map(cat => (
            <button key={cat.value} onClick={() => setCategoryFilter(cat.value)} style={{
              ...btnBase, fontSize: 10, padding: "4px 8px", borderRadius: 6,
              background: categoryFilter === cat.value ? `${C.secondary}22` : "transparent",
              color: categoryFilter === cat.value ? C.secondary : C.textMuted,
              border: categoryFilter === cat.value ? `1px solid ${C.secondary}40` : "1px solid transparent",
            }}>{cat.icon} {cat.label}</button>
          ))}
        </div>
      </div>

      {/* イベントリスト */}
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 12 }}>
        {filteredEvents.map(ev => {
          const isToday = ev.date === todayStr;
          const endH = parseInt(ev.endTime.split(":")[0]);
          const currentH = now.getHours();
          const isSoon = isToday && endH >= currentH && endH <= currentH + 2;

          return (
            <div key={ev.id} onClick={() => onSelectArea && onSelectArea(ev.area)} style={{
              ...glassCard, borderRadius: 12, padding: mob ? 12 : 16, cursor: "pointer",
              transition: "all 0.3s",
              borderLeft: `4px solid ${isSoon ? C.danger : isToday ? C.accent : C.primary}`,
              background: isSoon ? `linear-gradient(135deg, ${C.danger}08, rgba(30,41,59,0.55))` : glassCard.background,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 16 }}>{getCategoryIcon(ev.category)}</span>
                    <span style={{ color: C.text, fontWeight: 700, fontSize: mob ? 12 : 14 }}>{ev.title}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {isToday && <Badge color={C.accent}>今日</Badge>}
                    {isSoon && <Badge color={C.danger}>まもなく終了</Badge>}
                    <Badge color={C.primary}>{ev.area}</Badge>
                    <Badge color={C.secondary}>{ev.category}</Badge>
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                  <div style={{ color: demandColor(ev.expectedDemand), fontSize: 22, fontWeight: 800 }}>{ev.expectedDemand}</div>
                  <div style={{ color: C.textMuted, fontSize: 9 }}>需要予測</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.textMuted, marginBottom: 6 }}>
                <span>📅 {ev.date}</span>
                <span>🕐 {ev.startTime}〜{ev.endTime}</span>
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5, background: `${C.primary}08`, padding: "6px 10px", borderRadius: 6 }}>
                💡 {ev.note}
              </div>
            </div>
          );
        })}
      </div>

      {filteredEvents.length === 0 && (
        <div style={{ ...glassCard, borderRadius: 14, padding: 30, textAlign: "center" }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>📅</div>
          <div style={{ color: C.textMuted, fontSize: 13 }}>該当するイベントがありません</div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 売上目標トラッカー
// ============================================================
function GoalTracker({ rides }) {
  const mob = useIsMobile();
  const [goals, setGoals] = useState({
    daily: 50000,
    weekly: 300000,
    monthly: 1200000,
  });
  const [editingGoal, setEditingGoal] = useState(null);
  const [tempValue, setTempValue] = useState("");

  const now = new Date();
  const todayStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;

  // 今日の売上
  const todaySales = useMemo(() => rides.filter(r => r.日付 === todayStr).reduce((s, r) => s + r.運賃, 0), [rides, todayStr]);
  const todayRides = useMemo(() => rides.filter(r => r.日付 === todayStr).length, [rides, todayStr]);

  // 今週の売上（月曜始まり）
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const weekStartStr = `${weekStart.getFullYear()}/${String(weekStart.getMonth() + 1).padStart(2, "0")}/${String(weekStart.getDate()).padStart(2, "0")}`;
  const weeklySales = useMemo(() => rides.filter(r => r.日付 >= weekStartStr).reduce((s, r) => s + r.運賃, 0), [rides, weekStartStr]);

  // 今月の売上
  const monthStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthlySales = useMemo(() => rides.filter(r => r.日付.startsWith(monthStr)).reduce((s, r) => s + r.運賃, 0), [rides, monthStr]);

  const handleSaveGoal = (key) => {
    const val = parseInt(tempValue);
    if (val > 0) setGoals(g => ({ ...g, [key]: val }));
    setEditingGoal(null); setTempValue("");
  };

  const goalData = [
    { key: "daily", label: "日次目標", icon: "📅", current: todaySales, goal: goals.daily, sub: `${todayRides}回乗車` },
    { key: "weekly", label: "週次目標", icon: "📊", current: weeklySales, goal: goals.weekly, sub: `${weekStartStr}〜` },
    { key: "monthly", label: "月次目標", icon: "🗓️", current: monthlySales, goal: goals.monthly, sub: `${now.getMonth() + 1}月` },
  ];

  // 時間帯別の今日の売上推移
  const todayHourly = useMemo(() => {
    const todayRidesData = rides.filter(r => r.日付 === todayStr);
    return HOURS.map(h => {
      const hourRides = todayRidesData.filter(r => {
        const rHour = parseInt(r.時刻.split(":")[0]);
        return rHour === h;
      });
      return { 時間: `${h}時`, 売上: hourRides.reduce((s, r) => s + r.運賃, 0), 累計: 0 };
    });
  }, [rides, todayStr]);

  // 累計を計算
  let cumulative = 0;
  todayHourly.forEach(h => { cumulative += h.売上; h.累計 = cumulative; });

  return (
    <div>
      {/* 目標カード */}
      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        {goalData.map(g => {
          const pct = Math.min(100, Math.round((g.current / g.goal) * 100));
          const remaining = Math.max(0, g.goal - g.current);
          const isAchieved = g.current >= g.goal;
          const barColor = isAchieved ? C.success : pct >= 75 ? C.accent : C.primary;

          return (
            <div key={g.key} style={{
              ...glassCard, borderRadius: 14, padding: mob ? 14 : 18, position: "relative", overflow: "hidden",
              borderTop: `3px solid ${barColor}`,
            }}>
              {isAchieved && (
                <div style={{
                  position: "absolute", top: 10, right: 10, fontSize: 24,
                  animation: "none", opacity: 0.8,
                }}>🎉</div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>{g.icon}</span>
                <div>
                  <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{g.label}</div>
                  <div style={{ color: C.textMuted, fontSize: 10 }}>{g.sub}</div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                <span style={{ color: C.text, fontSize: 24, fontWeight: 800 }}>¥{g.current.toLocaleString()}</span>
                <span style={{ color: C.textMuted, fontSize: 12 }}>/ ¥{g.goal.toLocaleString()}</span>
              </div>

              {/* プログレスバー */}
              <div style={{ width: "100%", height: 8, borderRadius: 4, background: C.bg, marginBottom: 8 }}>
                <div style={{
                  width: `${pct}%`, height: "100%", borderRadius: 4,
                  background: `linear-gradient(90deg, ${barColor}, ${barColor}cc)`,
                  transition: "width 0.5s ease",
                  boxShadow: `0 0 10px ${barColor}44`,
                }} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 11 }}>
                  {isAchieved ? (
                    <span style={{ color: C.success, fontWeight: 700 }}>目標達成! +¥{(g.current - g.goal).toLocaleString()}</span>
                  ) : (
                    <span style={{ color: C.textMuted }}>あと <span style={{ color: barColor, fontWeight: 700 }}>¥{remaining.toLocaleString()}</span></span>
                  )}
                </div>
                <span style={{ color: barColor, fontWeight: 800, fontSize: 16 }}>{pct}%</span>
              </div>

              {/* 目標編集 */}
              {editingGoal === g.key ? (
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input type="number" value={tempValue} onChange={e => setTempValue(e.target.value)}
                    placeholder={`¥${g.goal.toLocaleString()}`}
                    style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }}
                  />
                  <button onClick={() => handleSaveGoal(g.key)} style={{ ...btnBase, fontSize: 10, padding: "6px 10px", borderRadius: 6, background: C.success, color: "#fff" }}>保存</button>
                  <button onClick={() => setEditingGoal(null)} style={{ ...btnBase, fontSize: 10, padding: "6px 10px", borderRadius: 6, background: C.cardHover, color: C.textMuted }}>×</button>
                </div>
              ) : (
                <button onClick={() => { setEditingGoal(g.key); setTempValue(String(g.goal)); }} style={{
                  ...btnBase, fontSize: 10, padding: "4px 10px", borderRadius: 6, marginTop: 8,
                  background: "transparent", color: C.textMuted, border: `1px solid ${C.border}`,
                }}>✏️ 目標変更</button>
              )}
            </div>
          );
        })}
      </div>

      {/* 今日の売上推移グラフ */}
      <SectionTitle>📈 今日の売上推移</SectionTitle>
      <div style={{ ...glassCard, borderRadius: 14, padding: mob ? 10 : 16 }}>
        <ResponsiveContainer width="100%" height={mob ? 180 : 220}>
          <AreaChart data={todayHourly}>
            <defs>
              <linearGradient id="goalGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.primary} stopOpacity={0.3} />
                <stop offset="95%" stopColor={C.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="時間" stroke={C.textMuted} fontSize={10} />
            <YAxis stroke={C.textMuted} fontSize={10} tickFormatter={v => `¥${(v / 1000).toFixed(0)}k`} width={mob ? 40 : 50} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => [`¥${v.toLocaleString()}`, ""]} />
            <Area type="monotone" dataKey="累計" stroke={C.primary} fill="url(#goalGrad)" strokeWidth={2} name="累計売上" />
            <Line type="monotone" dataKey="売上" stroke={C.accent} strokeWidth={1} dot={false} name="時間帯売上" />
          </AreaChart>
        </ResponsiveContainer>
        {/* 目標ライン表示 */}
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8, fontSize: 11 }}>
          <span style={{ color: C.textMuted }}>日次目標: <span style={{ color: C.accent, fontWeight: 700 }}>¥{goals.daily.toLocaleString()}</span></span>
          <span style={{ color: C.textMuted }}>現在: <span style={{ color: C.primary, fontWeight: 700 }}>¥{todaySales.toLocaleString()}</span></span>
          <span style={{ color: C.textMuted }}>達成率: <span style={{ color: todaySales >= goals.daily ? C.success : C.accent, fontWeight: 700 }}>{Math.round((todaySales / goals.daily) * 100)}%</span></span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ヒートマップ
// ============================================================
function HeatmapView({ selectedHour }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(105px, 1fr))", gap: 6 }}>
      {[...DEMAND_DATA.filter(d => d.hour === selectedHour)].sort((a, b) => b.demand - a.demand).map(item => (
        <div key={item.area} style={{ background: getDemandColor(item.demand), borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{item.area}</div>
          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 20, fontWeight: 800, marginTop: 2 }}>{item.demand}</div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 10 }}>需要</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// メインApp
// ============================================================
export default function TaxiDashboard() {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("map");
  const [selectedHour, setSelectedHour] = useState(new Date().getHours());
  const [rides, setRides] = useState(INITIAL_RIDES);
  const [selectedArea, setSelectedArea] = useState("新宿");
  const [mapCenter, setMapCenter] = useState({ lat: 35.6812, lng: 139.7671 });
  const [userPosition, setUserPosition] = useState(null);
  const [gpsStatus, setGpsStatus] = useState("loading"); // "loading" | "ok" | "error"
  const gpsInitRef = useRef(false);

  // 起動時にGPS位置を自動取得し、地図を現在地に移動
  useEffect(() => {
    if (gpsInitRef.current) return;
    gpsInitRef.current = true;

    if (!navigator.geolocation) {
      setGpsStatus("error");
      return;
    }

    setGpsStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserPosition({ lat, lng, accuracy: pos.coords.accuracy });
        setMapCenter({ lat, lng });
        // 最も近いエリアを自動選択
        const nearest = getNearestArea(lat, lng);
        setSelectedArea(nearest);
        setGpsStatus("ok");
      },
      () => {
        // GPS拒否・エラー時はデフォルト（東京駅）のまま
        setGpsStatus("error");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );

    // 位置を継続的に追跡（バックグラウンド更新）
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserPosition({ lat, lng, accuracy: pos.coords.accuracy });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // リアルタイム交通データ（時間帯で更新）
  const trafficData = useMemo(() => generateTrafficStatus(selectedHour), [selectedHour]);

  // エリア選択時に地図中心を更新
  const handleSelectArea = (name) => {
    setSelectedArea(name);
    const area = AREAS.find(a => a.name === name);
    if (area) setMapCenter({ lat: area.lat, lng: area.lng });
  };

  // 現在地に戻るボタン
  const goToMyLocation = useCallback(() => {
    if (userPosition) {
      setMapCenter({ lat: userPosition.lat, lng: userPosition.lng });
      const nearest = getNearestArea(userPosition.lat, userPosition.lng);
      setSelectedArea(nearest);
    }
  }, [userPosition]);

  const totalSales = MONTHLY_SALES.reduce((s, m) => s + m.売上, 0);
  const totalRides = MONTHLY_SALES.reduce((s, m) => s + m.乗車回数, 0);
  const avgRate = Math.round(MONTHLY_SALES.reduce((s, m) => s + m.実車率, 0) / 12);
  const areaSales = useMemo(() => { const m = {}; rides.forEach(r => { m[r.乗車地] = (m[r.乗車地] || 0) + r.運賃; }); return Object.entries(m).map(([n, v]) => ({ name: n, value: v })).sort((a, b) => b.value - a.value).slice(0, 7); }, [rides]);

  const tabs = [
    { id: "map", label: "🗺️ 交通マップ" },
    { id: "ai", label: "🤖 AI" },
    { id: "event", label: "🎪 イベント" },
    { id: "goal", label: "🎯 目標" },
    { id: "record", label: "📍 記録" },
    { id: "dashboard", label: "📊 統計" },
    { id: "heatmap", label: "🔥 需要予測" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Segoe UI', 'Hiragino Sans', 'Noto Sans JP', sans-serif", position: "relative" }}>
      {/* アニメーション背景 */}
      <AnimatedBackground />

      <header style={{
        ...glassCard,
        borderBottom: `1px solid rgba(37,99,235,0.15)`,
        borderRadius: 0,
        padding: isMobile ? "10px 12px" : "12px 24px",
        display: "flex", flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "space-between",
        gap: isMobile ? 8 : 0,
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(10,14,26,0.8)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: isMobile ? "center" : "flex-start" }}>
          <div style={{
            width: isMobile ? 32 : 40, height: isMobile ? 32 : 40, borderRadius: 10,
            background: "linear-gradient(135deg, #f59e0b, #f97316)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: isMobile ? 16 : 20, boxShadow: "0 4px 15px rgba(245,158,11,0.3)",
          }}>🚕</div>
          <div>
            <div style={{
              fontWeight: 900, fontSize: isMobile ? 15 : 18, letterSpacing: 2,
              background: "linear-gradient(135deg, #f1f5f9, #94a3b8)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>TaxiBoost</div>
            {!isMobile && <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 0.5 }}>GPS × Google Maps × リアルタイム交通</div>}
          </div>
          {/* GPSステータスインジケーター */}
          <div style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 20, fontSize: 10, fontWeight: 600,
            background: gpsStatus === "ok" ? "rgba(16,185,129,0.15)" : gpsStatus === "loading" ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)",
            color: gpsStatus === "ok" ? C.success : gpsStatus === "loading" ? C.accent : C.danger,
            border: `1px solid ${gpsStatus === "ok" ? C.success : gpsStatus === "loading" ? C.accent : C.danger}30`,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: gpsStatus === "ok" ? C.success : gpsStatus === "loading" ? C.accent : C.danger,
              animation: gpsStatus === "loading" ? "none" : "none",
            }} />
            {gpsStatus === "ok" ? "GPS" : gpsStatus === "loading" ? "GPS..." : "GPS OFF"}
          </div>
        </div>
        <div style={{
          display: "flex", gap: 2,
          background: "rgba(15,23,42,0.5)", borderRadius: 10, padding: 3,
          justifyContent: "center",
        }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: isMobile ? "6px 8px" : "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: isMobile ? 11 : 12, fontWeight: 700, transition: "all 0.3s",
              flex: isMobile ? 1 : "none",
              background: tab === t.id ? `linear-gradient(135deg, ${C.primary}, ${C.secondary})` : "transparent",
              color: tab === t.id ? "#fff" : C.textMuted,
              boxShadow: tab === t.id ? `0 2px 12px ${C.primary}44` : "none",
            }}>{isMobile ? t.label.replace(/^.+\s/, "") : t.label}</button>
          ))}
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: isMobile ? "12px 10px" : "20px 22px", position: "relative", zIndex: 1 }}>

        {/* =============== 交通マップ =============== */}
        {tab === "map" && (
          <>
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", marginBottom: 8, gap: isMobile ? 6 : 0 }}>
              <SectionTitle>🗺️ リアルタイム交通状況マップ</SectionTitle>
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: isMobile ? "center" : "flex-end", flexWrap: "wrap" }}>
                {userPosition && (
                  <button onClick={goToMyLocation} style={{
                    ...btnBase, fontSize: 11, padding: "6px 12px", borderRadius: 8,
                    background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})`,
                    color: "#fff", boxShadow: `0 2px 10px ${C.primary}44`,
                  }}>📍 現在地</button>
                )}
                <span style={{ color: C.textMuted, fontSize: 12 }}>時間帯：</span>
                <input type="range" min={0} max={23} value={selectedHour} onChange={e => setSelectedHour(+e.target.value)} style={{ width: isMobile ? 80 : 140, accentColor: C.primary }} />
                <span style={{ color: C.primary, fontWeight: 800, fontSize: 16, minWidth: 45 }}>{selectedHour}:00</span>
              </div>
            </div>

            {/* 交通サマリーカード */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 8 : 12, marginBottom: 16 }}>
              <StatCard icon="🚦" label="渋滞エリア" value={`${trafficData.filter(t => t.level === "heavy").length}箇所`} sub={trafficData.filter(t => t.level === "heavy").map(t => t.name).join(", ") || "なし"} trend={trafficData.filter(t => t.level === "heavy").length > 3 ? "down" : "up"} />
              <StatCard icon="🟢" label="スムーズ" value={`${trafficData.filter(t => t.level === "smooth").length}箇所`} />
              <StatCard icon="⏱️" label="平均速度" value={`${Math.round(trafficData.reduce((s, t) => s + t.avgSpeed, 0) / trafficData.length)}km/h`} />
              <StatCard icon="📍" label="選択中" value={selectedArea} />
            </div>

            {/* マップ（モバイルは縦並び、PCは横並び） */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <div style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>📡 エリア別混雑状況（クリックで詳細）</div>
                <AreaTrafficMap trafficData={trafficData} selectedArea={selectedArea} onSelectArea={handleSelectArea} rides={rides} userPosition={userPosition} />
              </div>
              <div>
                <div style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>🗺️ Google Maps — {selectedArea}周辺</div>
                <GoogleTrafficMap center={mapCenter} zoom={13} selectedArea={selectedArea} rides={rides} trafficData={trafficData} userPosition={userPosition} />
              </div>
            </div>

            {/* エリア詳細 */}
            <AreaDetailPanel area={selectedArea} trafficData={trafficData} rides={rides} demandData={DEMAND_DATA} currentHour={selectedHour} />

            {/* エリア一覧テーブル */}
            <SectionTitle>📋 全エリア交通状況一覧</SectionTitle>
            <div style={{ ...glassCard, borderRadius: 14, padding: isMobile ? 10 : 16, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", minWidth: 650, borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr>{["エリア","混雑度","状態","平均速度","推定遅延","需要スコア","Maps"].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: C.textMuted, borderBottom: `1px solid ${C.border}`, fontSize: 10, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {[...trafficData].sort((a, b) => b.congestion - a.congestion).map(t => {
                    const demand = DEMAND_DATA.find(d => d.area === t.name && d.hour === selectedHour);
                    return (
                      <tr key={t.name} onClick={() => handleSelectArea(t.name)} style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: selectedArea === t.name ? `${C.primary}11` : "transparent" }}>
                        <td style={{ padding: "8px 10px", color: C.text, fontWeight: 600 }}>{t.name}</td>
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 60, height: 6, borderRadius: 3, background: C.border }}>
                              <div style={{ width: `${t.congestion}%`, height: "100%", borderRadius: 3, background: getTrafficColor(t.level) }} />
                            </div>
                            <span style={{ color: C.text, fontWeight: 600, fontSize: 11 }}>{t.congestion}%</span>
                          </div>
                        </td>
                        <td style={{ padding: "8px 10px" }}><Badge color={getTrafficColor(t.level)}>{getTrafficIcon(t.level)} {getTrafficLabel(t.level)}</Badge></td>
                        <td style={{ padding: "8px 10px", color: C.text }}>{t.avgSpeed} km/h</td>
                        <td style={{ padding: "8px 10px", color: t.estDelay > 0 ? C.danger : C.success }}>{t.estDelay > 0 ? `+${t.estDelay}分` : "遅延なし"}</td>
                        <td style={{ padding: "8px 10px", color: C.accent, fontWeight: 600 }}>{demand?.demand || "—"}</td>
                        <td style={{ padding: "8px 10px" }}>
                          <a href={`https://www.google.com/maps/@${t.lat},${t.lng},15z/data=!5m1!1e1`} target="_blank" rel="noreferrer" style={{ color: C.primary, fontSize: 11, textDecoration: "none" }}>🚦 交通情報</a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* =============== AIアドバイザー =============== */}
        {tab === "ai" && (
          <>
            <SectionTitle>🤖 AI売上アドバイザー</SectionTitle>
            <div style={{ ...glassCard, borderRadius: 14, padding: isMobile ? 12 : 18, marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: "linear-gradient(135deg, #7c3aed, #2563eb)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
                boxShadow: "0 4px 20px rgba(124,58,237,0.3)", flexShrink: 0,
              }}>🤖</div>
              <div>
                <div style={{ color: C.text, fontWeight: 800, fontSize: isMobile ? 14 : 16 }}>リアルタイム分析中</div>
                <div style={{ color: C.textMuted, fontSize: 11 }}>
                  現在時刻・天気・交通状況・過去データ・イベント情報を総合的に分析して最適な行動を提案します
                </div>
              </div>
            </div>
            <AIAdvisor
              rides={rides}
              trafficData={trafficData}
              selectedArea={selectedArea}
              selectedHour={selectedHour}
              userPosition={userPosition}
              weather={null}
            />
          </>
        )}

        {/* =============== イベント =============== */}
        {tab === "event" && (
          <>
            <SectionTitle>🎪 イベント・催事カレンダー</SectionTitle>
            <div style={{ ...glassCard, borderRadius: 14, padding: isMobile ? 12 : 18, marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: "linear-gradient(135deg, #f59e0b, #ef4444)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
                boxShadow: "0 4px 20px rgba(245,158,11,0.3)", flexShrink: 0,
              }}>🎪</div>
              <div>
                <div style={{ color: C.text, fontWeight: 800, fontSize: isMobile ? 14 : 16 }}>イベント情報で需要を先読み</div>
                <div style={{ color: C.textMuted, fontSize: 11 }}>
                  コンサート・スポーツ・展示会の終了時刻に合わせて最適なポジションを確保しましょう
                </div>
              </div>
            </div>
            <EventCalendar onSelectArea={handleSelectArea} />
          </>
        )}

        {/* =============== 目標トラッカー =============== */}
        {tab === "goal" && (
          <>
            <SectionTitle>🎯 売上目標トラッカー</SectionTitle>
            <GoalTracker rides={rides} />
          </>
        )}

        {/* =============== 記録 =============== */}
        {tab === "record" && (
          <>
            <RideRecorder onSave={r => setRides(prev => [r, ...prev])} />
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", marginBottom: 6, gap: isMobile ? 6 : 0 }}>
              <SectionTitle>📋 乗車記録（{rides.length}件）</SectionTitle>
              <ExportPanel rides={rides} />
            </div>
            <div style={{ ...glassCard, borderRadius: 14, padding: isMobile ? 10 : 16, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 8 : 12, marginBottom: 14 }}>
                <StatCard icon="🚕" label="総乗車" value={`${rides.length}回`} />
                <StatCard icon="💰" label="総売上" value={`¥${rides.reduce((s, r) => s + r.運賃, 0).toLocaleString()}`} />
                <StatCard icon="📏" label="総走行" value={`${rides.reduce((s, r) => s + r.距離, 0).toFixed(1)}km`} />
                <StatCard icon="🌧️" label="雨天" value={`${rides.filter(r => r.天気 === "rainy" || r.天気 === "heavy_rain").length}回`} />
              </div>
              <RideTable records={rides} />
            </div>
          </>
        )}

        {/* =============== 統計 =============== */}
        {tab === "dashboard" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 8 : 14, marginBottom: 6 }}>
              <StatCard icon="💰" label="年間売上" value={`¥${totalSales.toLocaleString()}`} sub="+8.3%" trend="up" />
              <StatCard icon="🚗" label="年間乗車" value={`${totalRides}回`} sub="+5.1%" trend="up" />
              <StatCard icon="📏" label="平均単価" value={`¥${Math.round(totalSales/totalRides).toLocaleString()}`} sub="+3.0%" trend="up" />
              <StatCard icon="⏱️" label="実車率" value={`${avgRate}%`} sub="+2.4pt" trend="up" />
            </div>
            <SectionTitle>📈 月別売上</SectionTitle>
            <div style={{ ...glassCard, borderRadius: 14, padding: 16 }}>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={MONTHLY_SALES}><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.primary} stopOpacity={0.3}/><stop offset="95%" stopColor={C.primary} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke={C.border}/><XAxis dataKey="month" stroke={C.textMuted} fontSize={11}/><YAxis stroke={C.textMuted} fontSize={11} tickFormatter={v=>`¥${(v/10000).toFixed(0)}万`}/><Tooltip contentStyle={tooltipStyle} formatter={v=>[`¥${v.toLocaleString()}`,""]}/><Area type="monotone" dataKey="売上" stroke={C.primary} fill="url(#sg)" strokeWidth={2}/></AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginTop: 6 }}>
              <div><SectionTitle>📅 曜日別</SectionTitle><div style={{ ...glassCard, borderRadius: 14, padding: isMobile ? 10 : 16 }}><ResponsiveContainer width="100%" height={isMobile ? 180 : 220}><BarChart data={WEEKLY_SALES}><CartesianGrid strokeDasharray="3 3" stroke={C.border}/><XAxis dataKey="day" stroke={C.textMuted} fontSize={11}/><YAxis stroke={C.textMuted} fontSize={10} tickFormatter={v=>`¥${(v/10000).toFixed(0)}万`} width={isMobile ? 40 : 60}/><Tooltip contentStyle={tooltipStyle} formatter={v=>[`¥${v.toLocaleString()}`,""]}/><Bar dataKey="売上" fill={C.primary} radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></div>
              <div><SectionTitle>📍 エリア別</SectionTitle><div style={{ ...glassCard, borderRadius: 14, padding: isMobile ? 10 : 16 }}><ResponsiveContainer width="100%" height={isMobile ? 200 : 220}><PieChart><Pie data={areaSales} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={isMobile ? 65 : 80} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} fontSize={isMobile ? 9 : 10}>{areaSales.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}</Pie><Tooltip contentStyle={tooltipStyle} formatter={v=>[`¥${v.toLocaleString()}`,""]} /></PieChart></ResponsiveContainer></div></div>
            </div>
            <SectionTitle>🕐 時間帯別</SectionTitle>
            <div style={{ ...glassCard, borderRadius: 14, padding: 16 }}><ResponsiveContainer width="100%" height={240}><BarChart data={HOURLY_SALES}><CartesianGrid strokeDasharray="3 3" stroke={C.border}/><XAxis dataKey="時間" stroke={C.textMuted} fontSize={10}/><YAxis stroke={C.textMuted} fontSize={11} tickFormatter={v=>`¥${(v/1000).toFixed(0)}k`}/><Tooltip contentStyle={tooltipStyle} formatter={v=>[`¥${v.toLocaleString()}`,""]} /><Bar dataKey="売上" fill={C.secondary} radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>

            {/* 天気・交通分析 */}
            <SectionTitle>🌤️ 天気×交通 分析</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
              <div style={{ ...glassCard, borderRadius: 14, padding: 16 }}>
                <div style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>天気別 平均運賃</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={WEATHER_OPTIONS.map(w => { const wr = rides.filter(r => r.天気 === w.value); return { name: `${w.icon}${w.label}`, 平均運賃: wr.length ? Math.round(wr.reduce((s,r)=>s+r.運賃,0)/wr.length) : 0 }; }).filter(d => d.平均運賃 > 0)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border}/><XAxis dataKey="name" stroke={C.textMuted} fontSize={11}/><YAxis stroke={C.textMuted} fontSize={11} tickFormatter={v=>`¥${v.toLocaleString()}`}/><Tooltip contentStyle={tooltipStyle} formatter={v=>[`¥${v.toLocaleString()}`,""]} /><Bar dataKey="平均運賃" fill={C.primary} radius={[6,6,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ ...glassCard, borderRadius: 14, padding: 16 }}>
                <div style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>交通状況別 平均運賃</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={TRAFFIC_OPTIONS.map(t => { const tr = rides.filter(r => r.交通状況 === t.value); return { name: `${t.icon}${t.label}`, 平均運賃: tr.length ? Math.round(tr.reduce((s,r)=>s+r.運賃,0)/tr.length) : 0, color: t.color }; }).filter(d => d.平均運賃 > 0)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border}/><XAxis dataKey="name" stroke={C.textMuted} fontSize={11}/><YAxis stroke={C.textMuted} fontSize={11} tickFormatter={v=>`¥${v.toLocaleString()}`}/><Tooltip contentStyle={tooltipStyle} formatter={v=>[`¥${v.toLocaleString()}`,""]} /><Bar dataKey="平均運賃" radius={[6,6,0,0]}>{TRAFFIC_OPTIONS.map((t,i)=><Cell key={i} fill={t.color}/>)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {/* =============== 需要予測 =============== */}
        {tab === "heatmap" && (
          <>
            <SectionTitle>🔥 エリア別需要ヒートマップ</SectionTitle>
            <div style={{ ...glassCard, borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                <span style={{ color: C.textMuted, fontSize: 13 }}>時間帯：</span>
                <input type="range" min={0} max={23} value={selectedHour} onChange={e => setSelectedHour(+e.target.value)} style={{ flex: 1, minWidth: 180, accentColor: C.primary }} />
                <span style={{ fontSize: 18, fontWeight: 800, color: C.primary, minWidth: 45 }}>{selectedHour}:00</span>
              </div>
              <div style={{ display: "flex", gap: 10, marginBottom: 12, fontSize: 11 }}>
                {[{c:"#ef4444",l:"高(80+)"},{c:"#f59e0b",l:"中高(60)"},{c:"#22c55e",l:"中(40)"},{c:"#3b82f6",l:"低(20)"},{c:"#334155",l:"極低"}].map(l=><div key={l.l} style={{ display:"flex",alignItems:"center",gap:4 }}><div style={{ width:10,height:10,borderRadius:3,background:l.c }}/><span style={{ color:C.textMuted }}>{l.l}</span></div>)}
              </div>
              <HeatmapView selectedHour={selectedHour} />
            </div>
            <div style={{ background: `linear-gradient(135deg, rgba(37,99,235,0.12), rgba(124,58,237,0.08))`, border: `1px solid ${C.primary}30`, borderRadius: 14, padding: 18, marginBottom: 16, backdropFilter: "blur(12px)" }}>
              <div style={{ color: C.primary, fontWeight: 800, fontSize: 14, marginBottom: 6 }}>💡 {selectedHour}時台アドバイス</div>
              <div style={{ color: C.text, fontSize: 13, lineHeight: 1.7 }}>
                <strong>需要上位：</strong>{DEMAND_DATA.filter(d => d.hour === selectedHour).sort((a, b) => b.demand - a.demand).slice(0, 3).map(a => `${a.area}(${a.demand})`).join("、")}
              </div>
            </div>
            <SectionTitle>📊 主要エリア需要推移</SectionTitle>
            <div style={{ ...glassCard, borderRadius: 14, padding: 16 }}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={HOURS.map(h => { const row = { hour: `${h}時` }; ["東京駅","新宿","渋谷","六本木","品川"].forEach(a => { row[a] = DEMAND_DATA.find(d => d.hour === h && d.area === a)?.demand || 0; }); return row; })}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border}/><XAxis dataKey="hour" stroke={C.textMuted} fontSize={10}/><YAxis stroke={C.textMuted} fontSize={11}/>
                  <Tooltip contentStyle={tooltipStyle}/><Legend/>
                  {["東京駅","新宿","渋谷","六本木","品川"].map((a,i)=><Line key={a} type="monotone" dataKey={a} stroke={PIE_COLORS[i]} strokeWidth={2} dot={false}/>)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </main>

      <footer style={{
        textAlign: "center", padding: "20px 16px",
        color: C.textMuted, fontSize: 10,
        borderTop: `1px solid rgba(37,99,235,0.1)`,
        position: "relative", zIndex: 1,
        background: "rgba(10,14,26,0.5)",
        backdropFilter: "blur(8px)",
      }}>
        <div style={{ marginBottom: 4, letterSpacing: 1 }}>
          <span style={{ background: "linear-gradient(90deg, #2563eb, #7c3aed, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontWeight: 800, fontSize: 12 }}>TaxiBoost</span>
          <span style={{ marginLeft: 6 }}>v4.0</span>
        </div>
        <div>GPS × Google Maps × AI × イベント × 目標管理</div>
      </footer>
    </div>
  );
}
