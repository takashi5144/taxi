(function() {
// jrTimetable.js - JR旭川駅 到着列車時刻表データ
// 2024年3月ダイヤ改正ベース（定期列車のみ）
// ※ダイヤ改正時に更新が必要

const JR_ASAHIKAWA_ARRIVALS = [
  // === 函館本線（札幌方面から） ===
  // 特急ライラック
  { time: '08:25', type: '特急', name: 'ライラック3号', from: '札幌', line: '函館本線' },
  { time: '09:25', type: '特急', name: 'ライラック5号', from: '札幌', line: '函館本線' },
  { time: '10:25', type: '特急', name: 'カムイ7号', from: '札幌', line: '函館本線' },
  { time: '11:25', type: '特急', name: 'ライラック9号', from: '札幌', line: '函館本線' },
  { time: '12:25', type: '特急', name: 'カムイ11号', from: '札幌', line: '函館本線' },
  { time: '13:25', type: '特急', name: 'ライラック13号', from: '札幌', line: '函館本線' },
  { time: '14:25', type: '特急', name: 'カムイ15号', from: '札幌', line: '函館本線' },
  { time: '15:25', type: '特急', name: 'ライラック17号', from: '札幌', line: '函館本線' },
  { time: '16:25', type: '特急', name: 'カムイ19号', from: '札幌', line: '函館本線' },
  { time: '17:25', type: '特急', name: 'ライラック21号', from: '札幌', line: '函館本線' },
  { time: '18:25', type: '特急', name: 'カムイ23号', from: '札幌', line: '函館本線' },
  { time: '19:25', type: '特急', name: 'ライラック25号', from: '札幌', line: '函館本線' },
  { time: '20:25', type: '特急', name: 'カムイ27号', from: '札幌', line: '函館本線' },
  { time: '21:25', type: '特急', name: 'ライラック29号', from: '札幌', line: '函館本線' },
  { time: '22:25', type: '特急', name: 'カムイ31号', from: '札幌', line: '函館本線' },
  // 函館本線 普通・快速
  { time: '06:42', type: '普通', name: '', from: '滝川', line: '函館本線' },
  { time: '08:00', type: '普通', name: '', from: '岩見沢', line: '函館本線' },
  { time: '10:00', type: '普通', name: '', from: '滝川', line: '函館本線' },
  { time: '12:36', type: '普通', name: '', from: '滝川', line: '函館本線' },
  { time: '15:08', type: '普通', name: '', from: '滝川', line: '函館本線' },
  { time: '17:30', type: '普通', name: '', from: '滝川', line: '函館本線' },
  { time: '19:45', type: '普通', name: '', from: '滝川', line: '函館本線' },
  { time: '21:15', type: '普通', name: '', from: '滝川', line: '函館本線' },

  // === 宗谷本線（稚内方面から） ===
  { time: '12:07', type: '特急', name: 'サロベツ2号', from: '稚内', line: '宗谷本線' },
  { time: '17:43', type: '特急', name: '宗谷', from: '稚内', line: '宗谷本線' },
  { time: '21:27', type: '特急', name: 'サロベツ4号', from: '稚内', line: '宗谷本線' },
  // 宗谷本線 普通
  { time: '06:25', type: '普通', name: '', from: '名寄', line: '宗谷本線' },
  { time: '08:15', type: '普通', name: '', from: '名寄', line: '宗谷本線' },
  { time: '10:42', type: '普通', name: '', from: '名寄', line: '宗谷本線' },
  { time: '14:10', type: '普通', name: '', from: '名寄', line: '宗谷本線' },
  { time: '16:55', type: '普通', name: '', from: '名寄', line: '宗谷本線' },
  { time: '19:30', type: '普通', name: '', from: '名寄', line: '宗谷本線' },

  // === 石北本線（網走方面から） ===
  { time: '12:15', type: '特急', name: '大雪2号', from: '網走', line: '石北本線' },
  { time: '18:06', type: '特急', name: 'オホーツク2号', from: '網走', line: '石北本線' },
  { time: '21:00', type: '特急', name: '大雪4号', from: '網走', line: '石北本線' },
  // 石北本線 普通
  { time: '07:50', type: '普通', name: '', from: '上川', line: '石北本線' },
  { time: '11:35', type: '普通', name: '', from: '上川', line: '石北本線' },
  { time: '15:40', type: '普通', name: '', from: '上川', line: '石北本線' },
  { time: '19:10', type: '普通', name: '', from: '上川', line: '石北本線' },

  // === 富良野線（富良野方面から） ===
  { time: '06:50', type: '普通', name: '', from: '富良野', line: '富良野線' },
  { time: '08:10', type: '普通', name: '', from: '富良野', line: '富良野線' },
  { time: '09:50', type: '普通', name: '', from: '富良野', line: '富良野線' },
  { time: '11:55', type: '普通', name: '', from: '富良野', line: '富良野線' },
  { time: '14:20', type: '普通', name: '', from: '富良野', line: '富良野線' },
  { time: '16:30', type: '普通', name: '', from: '美瑛', line: '富良野線' },
  { time: '17:50', type: '普通', name: '', from: '富良野', line: '富良野線' },
  { time: '19:40', type: '普通', name: '', from: '富良野', line: '富良野線' },
  { time: '21:10', type: '普通', name: '', from: '美瑛', line: '富良野線' },
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

/**
 * 路線別の色を取得
 */
function getLineColor(line) {
  switch (line) {
    case '函館本線': return '#2196F3';
    case '宗谷本線': return '#4CAF50';
    case '石北本線': return '#FF9800';
    case '富良野線': return '#E040FB';
    default: return 'var(--text-secondary)';
  }
}

window.JrTimetable = {
  arrivals: JR_ASAHIKAWA_ARRIVALS,
  getUpcomingArrivals: getUpcomingArrivals,
  getLineColor: getLineColor,
};
})();
