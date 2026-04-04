(function() {
// jrTimetable.js - JR旭川駅 到着列車時刻表データ
// 2026年4月ダイヤベース（JR北海道公式・NAVITIME参照）
// ※ダイヤ改正時に更新が必要

const JR_ASAHIKAWA_ARRIVALS = [
  // === 函館本線（札幌方面から）特急 ===
  { time: '07:56', type: '特急', name: 'ライラック1号', from: '札幌', line: '函館本線' },
  { time: '08:28', type: '特急', name: 'オホーツク1号', from: '札幌', line: '函館本線' },
  { time: '08:40', type: '特急', name: 'ライラック3号', from: '札幌', line: '函館本線' },
  { time: '08:58', type: '特急', name: '宗谷', from: '札幌', line: '函館本線' },
  { time: '09:25', type: '特急', name: 'ライラック5号', from: '札幌', line: '函館本線' },
  { time: '10:25', type: '特急', name: 'カムイ7号', from: '札幌', line: '函館本線' },
  { time: '11:25', type: '特急', name: 'ライラック11号', from: '札幌', line: '函館本線' },
  { time: '12:25', type: '特急', name: 'ライラック13号', from: '札幌', line: '函館本線' },
  { time: '13:25', type: '特急', name: 'ライラック17号', from: '札幌', line: '函館本線' },
  { time: '14:25', type: '特急', name: 'カムイ19号', from: '札幌', line: '函館本線' },
  { time: '15:25', type: '特急', name: 'カムイ21号', from: '札幌', line: '函館本線' },
  { time: '15:55', type: '特急', name: 'ライラック23号', from: '札幌', line: '函館本線' },
  { time: '16:25', type: '特急', name: 'ライラック25号', from: '札幌', line: '函館本線' },
  { time: '17:05', type: '特急', name: 'オホーツク3号', from: '札幌', line: '函館本線' },
  { time: '17:25', type: '特急', name: 'ライラック27号', from: '札幌', line: '函館本線' },
  { time: '17:55', type: '特急', name: 'カムイ29号', from: '札幌', line: '函館本線' },
  { time: '18:25', type: '特急', name: 'カムイ31号', from: '札幌', line: '函館本線' },
  { time: '18:55', type: '特急', name: 'ライラック33号', from: '札幌', line: '函館本線' },
  { time: '19:25', type: '特急', name: 'カムイ35号', from: '札幌', line: '函館本線' },
  { time: '19:55', type: '特急', name: 'ライラック37号', from: '札幌', line: '函館本線' },
  { time: '20:25', type: '特急', name: 'ライラック39号', from: '札幌', line: '函館本線' },
  { time: '21:25', type: '特急', name: 'ライラック41号', from: '札幌', line: '函館本線' },
  { time: '22:25', type: '特急', name: 'カムイ43号', from: '札幌', line: '函館本線' },
  { time: '23:25', type: '特急', name: 'カムイ45号', from: '札幌', line: '函館本線' },
  // 函館本線 普通
  { time: '08:51', type: '普通', name: '', from: '岩見沢', line: '函館本線' },

  // === 宗谷本線（稚内・名寄方面から） ===
  { time: '08:08', type: '普通', name: '', from: '名寄', line: '宗谷本線' },
  { time: '12:06', type: '普通', name: '', from: '名寄', line: '宗谷本線' },

  // === 石北本線（網走・上川方面から） ===
  { time: '07:01', type: '普通', name: '', from: '上川', line: '石北本線' },
  { time: '08:31', type: '普通', name: '', from: '上川', line: '石北本線' },
  { time: '10:01', type: '普通', name: '', from: '上川', line: '石北本線' },
  { time: '12:38', type: '普通', name: '', from: '上川', line: '石北本線' },
  { time: '13:48', type: '普通', name: '', from: '上川', line: '石北本線' },
  { time: '15:08', type: '普通', name: '', from: '上川', line: '石北本線' },
  { time: '16:31', type: '普通', name: '', from: '上川', line: '石北本線' },
  { time: '17:31', type: '普通', name: '', from: '上川', line: '石北本線' },
  { time: '18:32', type: '普通', name: '', from: '上川', line: '石北本線' },
  { time: '19:05', type: '普通', name: '', from: '上川', line: '石北本線' },
  { time: '19:54', type: '普通', name: '', from: '上川', line: '石北本線' },
  { time: '21:57', type: '普通', name: '', from: '上川', line: '石北本線' },

  // === 富良野線（富良野・美瑛方面から） ===
  { time: '07:12', type: '普通', name: '', from: '富良野', line: '富良野線' },
  { time: '07:30', type: '普通', name: '', from: '美瑛', line: '富良野線' },
  { time: '08:14', type: '普通', name: '', from: '富良野', line: '富良野線' },
  { time: '08:34', type: '普通', name: '', from: '富良野', line: '富良野線' },
  { time: '09:13', type: '普通', name: '', from: '富良野', line: '富良野線' },
  { time: '10:26', type: '普通', name: '', from: '美瑛', line: '富良野線' },
  { time: '11:11', type: '普通', name: '', from: '富良野', line: '富良野線' },
  { time: '12:21', type: '普通', name: '', from: '美瑛', line: '富良野線' },
  { time: '13:02', type: '普通', name: '', from: '富良野', line: '富良野線' },
  { time: '13:43', type: '普通', name: '', from: '美瑛', line: '富良野線' },
  { time: '14:33', type: '普通', name: '', from: '富良野', line: '富良野線' },
  { time: '16:05', type: '普通', name: '', from: '美瑛', line: '富良野線' },
  { time: '17:01', type: '普通', name: '', from: '富良野', line: '富良野線' },
  { time: '18:19', type: '普通', name: '', from: '富良野', line: '富良野線' },
  { time: '18:37', type: '普通', name: '', from: '美瑛', line: '富良野線' },
  { time: '19:13', type: '普通', name: '', from: '富良野', line: '富良野線' },
  { time: '20:27', type: '普通', name: '', from: '富良野', line: '富良野線' },
  { time: '21:47', type: '普通', name: '', from: '富良野', line: '富良野線' },
];

// 時刻順にソート
JR_ASAHIKAWA_ARRIVALS.sort((a, b) => a.time.localeCompare(b.time));

/**
 * 現在時刻以降の到着列車を取得
 * @param {number} count - 取得件数（デフォルト5）
 * @param {string} shiftMode - 'day'=日勤(5:00-19:00) / 'night'=夜勤(17:00以降すべて)
 * @returns {Array} 到着列車リスト（minsLeft付き）
 */
function getUpcomingArrivals(count, shiftMode) {
  count = count || 5;
  shiftMode = shiftMode || 'day';
  const now = new Date();
  const nowHH = String(now.getHours()).padStart(2, '0');
  const nowMM = String(now.getMinutes()).padStart(2, '0');
  const nowTime = nowHH + ':' + nowMM;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // 日勤: 05:00〜19:00 / 夜勤: 17:00〜終電
  const rangeStart = shiftMode === 'night' ? '17:00' : '05:00';
  const rangeEnd = shiftMode === 'night' ? '23:59' : '19:00';

  const upcoming = [];
  for (let i = 0; i < JR_ASAHIKAWA_ARRIVALS.length; i++) {
    const train = JR_ASAHIKAWA_ARRIVALS[i];
    // 時間帯フィルタ
    if (train.time < rangeStart || train.time > rangeEnd) continue;
    if (train.time >= nowTime) {
      const parts = train.time.split(':');
      const trainMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      upcoming.push({
        ...train,
        minsLeft: trainMin - nowMin,
      });
      if (upcoming.length >= count) break;
    }
  }
  return upcoming;
}

// === 都市間バス 旭川駅前 到着時刻表（2026年4月ダイヤベース） ===
const BUS_ASAHIKAWA_ARRIVALS = [
  // 高速あさひかわ号（札幌→旭川）
  { time: '09:05', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '中央バス' },
  { time: '09:35', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: 'JR北海道バス' },
  { time: '10:05', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '中央バス' },
  { time: '10:35', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '中央バス' },
  { time: '11:05', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '中央バス' },
  { time: '11:35', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: 'JR北海道バス' },
  { time: '12:05', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '中央バス' },
  { time: '12:35', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '中央バス' },
  { time: '13:05', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '道北バス' },
  { time: '13:35', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '道北バス' },
  { time: '14:05', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '中央バス' },
  { time: '14:35', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '道北バス' },
  { time: '15:05', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '中央バス' },
  { time: '15:35', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '中央バス' },
  { time: '16:05', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '道北バス' },
  { time: '16:35', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: 'JR北海道バス' },
  { time: '17:05', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '中央バス' },
  { time: '17:25', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '中央バス' },
  { time: '17:45', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '道北バス' },
  { time: '18:05', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '道北バス' },
  { time: '18:25', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: 'JR北海道バス' },
  { time: '18:45', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '中央バス' },
  { time: '19:05', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '中央バス' },
  { time: '19:25', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '中央バス' },
  { time: '19:45', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '道北バス' },
  { time: '20:05', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '中央バス' },
  { time: '20:35', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '中央バス' },
  { time: '20:50', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: 'JR北海道バス' },
  { time: '21:05', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '道北バス' },
  { time: '21:35', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '道北バス' },
  { time: '21:55', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '中央バス' },
  { time: '22:15', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '中央バス' },
  { time: '22:55', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '道北バス' },
  { time: '23:35', type: '高速', name: '高速あさひかわ号', from: '札幌', line: '高速あさひかわ号', company: '中央バス' },
  // 特急オホーツク号（紋別→旭川）
  { time: '09:45', type: '特急', name: '特急オホーツク号', from: '紋別', line: '特急オホーツク号', company: '道北バス' },
  { time: '14:45', type: '特急', name: '特急オホーツク号', from: '紋別', line: '特急オホーツク号', company: '道北バス' },
  { time: '18:30', type: '特急', name: '特急オホーツク号', from: '紋別', line: '特急オホーツク号', company: '道北バス' },
  // ノースライナー号（帯広→旭川）
  { time: '11:30', type: '特急', name: 'ノースライナー号', from: '帯広', line: 'ノースライナー号', company: '道北バス' },
  { time: '18:00', type: '特急', name: 'ノースライナー号', from: '帯広', line: 'ノースライナー号', company: '道北バス' },
  // サンライズ号（釧路→北見→旭川）
  { time: '12:40', type: '特急', name: 'サンライズ号', from: '釧路', line: 'サンライズ号', company: '道北バス' },
  { time: '19:00', type: '特急', name: 'サンライズ号', from: '釧路', line: 'サンライズ号', company: '道北バス' },
];

BUS_ASAHIKAWA_ARRIVALS.sort((a, b) => a.time.localeCompare(b.time));

/**
 * 現在時刻以降のバス到着を取得
 */
function getUpcomingBusArrivals(count, shiftMode) {
  count = count || 5;
  shiftMode = shiftMode || 'day';
  const now = new Date();
  const nowHH = String(now.getHours()).padStart(2, '0');
  const nowMM = String(now.getMinutes()).padStart(2, '0');
  const nowTime = nowHH + ':' + nowMM;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const rangeStart = shiftMode === 'night' ? '17:00' : '05:00';
  const rangeEnd = shiftMode === 'night' ? '23:59' : '19:00';

  const upcoming = [];
  for (let i = 0; i < BUS_ASAHIKAWA_ARRIVALS.length; i++) {
    const bus = BUS_ASAHIKAWA_ARRIVALS[i];
    if (bus.time < rangeStart || bus.time > rangeEnd) continue;
    if (bus.time >= nowTime) {
      const parts = bus.time.split(':');
      const busMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      upcoming.push({ ...bus, minsLeft: busMin - nowMin });
      if (upcoming.length >= count) break;
    }
  }
  return upcoming;
}

/**
 * 路線別の色を取得
 */
function getLineColor(line) {
  switch (line) {
    case '函館本線': return '#2196F3';
    case '宗谷本線': return '#4CAF50';
    case '石北本線': return '#FF9800';
    case '富良野線': return '#E040FB';
    case '高速あさひかわ号': return '#ef5350';
    case '特急オホーツク号': return '#ff7043';
    case 'ノースライナー号': return '#66bb6a';
    case 'サンライズ号': return '#ffa726';
    default: return 'var(--text-secondary)';
  }
}

window.JrTimetable = {
  arrivals: JR_ASAHIKAWA_ARRIVALS,
  busArrivals: BUS_ASAHIKAWA_ARRIVALS,
  getUpcomingArrivals: getUpcomingArrivals,
  getUpcomingBusArrivals: getUpcomingBusArrivals,
  getLineColor: getLineColor,
};
})();
