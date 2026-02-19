// holidays.js - 日本の祝日判定ユーティリティ
// 固定祝日・ハッピーマンデー・春分/秋分の日・振替休日・国民の休日に対応

window.JapaneseHolidays = (() => {
  // 曜日名
  const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

  // 曜日を取得
  function getDayOfWeek(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return DAY_NAMES[d.getDay()];
  }

  // 曜日インデックスを取得 (0=日, 6=土)
  function getDayIndex(dateStr) {
    return new Date(dateStr + 'T00:00:00').getDay();
  }

  // 春分の日を計算（1900-2099年対応）
  function getVernalEquinox(year) {
    if (year < 1900 || year > 2099) return 21;
    if (year <= 1979) return Math.floor(20.8357 + 0.242194 * (year - 1980) - Math.floor((year - 1983) / 4));
    if (year <= 2099) return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
    return 21;
  }

  // 秋分の日を計算（1900-2099年対応）
  function getAutumnalEquinox(year) {
    if (year < 1900 || year > 2099) return 23;
    if (year <= 1979) return Math.floor(23.2588 + 0.242194 * (year - 1980) - Math.floor((year - 1983) / 4));
    if (year <= 2099) return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
    return 23;
  }

  // 第N月曜日の日付を取得
  function getNthMonday(year, month, n) {
    const firstDay = new Date(year, month - 1, 1);
    let dayOfWeek = firstDay.getDay();
    let firstMonday = dayOfWeek <= 1 ? (1 + (1 - dayOfWeek)) : (1 + (8 - dayOfWeek));
    return firstMonday + (n - 1) * 7;
  }

  // その年の祝日一覧を生成（日付文字列 → 祝日名のMap）
  function getHolidaysForYear(year) {
    const holidays = new Map();
    const pad = (n) => String(n).padStart(2, '0');
    const key = (m, d) => `${year}-${pad(m)}-${pad(d)}`;

    // === 固定祝日 ===
    holidays.set(key(1, 1), '元日');
    holidays.set(key(2, 11), '建国記念の日');
    if (year >= 2020) holidays.set(key(2, 23), '天皇誕生日');
    else if (year >= 1989 && year <= 2018) holidays.set(key(12, 23), '天皇誕生日');
    holidays.set(key(4, 29), year >= 2007 ? '昭和の日' : 'みどりの日');
    holidays.set(key(5, 3), '憲法記念日');
    holidays.set(key(5, 4), year >= 2007 ? 'みどりの日' : '国民の休日');
    holidays.set(key(5, 5), 'こどもの日');
    if (year >= 2016) holidays.set(key(8, 11), '山の日');
    holidays.set(key(11, 3), '文化の日');
    holidays.set(key(11, 23), '勤労感謝の日');

    // === ハッピーマンデー ===
    if (year >= 2000) {
      holidays.set(key(1, getNthMonday(year, 1, 2)), '成人の日');
    } else {
      holidays.set(key(1, 15), '成人の日');
    }

    if (year >= 2003) {
      holidays.set(key(7, getNthMonday(year, 7, 3)), '海の日');
    } else if (year >= 1996) {
      holidays.set(key(7, 20), '海の日');
    }

    if (year >= 2003) {
      holidays.set(key(9, getNthMonday(year, 9, 3)), '敬老の日');
    } else if (year >= 1966) {
      holidays.set(key(9, 15), '敬老の日');
    }

    if (year >= 2000) {
      holidays.set(key(10, getNthMonday(year, 10, 2)), 'スポーツの日');
    } else {
      holidays.set(key(10, 10), '体育の日');
    }

    // === 春分の日・秋分の日 ===
    holidays.set(key(3, getVernalEquinox(year)), '春分の日');
    holidays.set(key(9, getAutumnalEquinox(year)), '秋分の日');

    // === 特例（オリンピック等） ===
    if (year === 2020) {
      holidays.delete(key(7, getNthMonday(year, 7, 3)));
      holidays.set(key(7, 23), '海の日');
      holidays.set(key(7, 24), 'スポーツの日');
      holidays.delete(key(10, getNthMonday(year, 10, 2)));
      holidays.delete(key(8, 11));
      holidays.set(key(8, 10), '山の日');
    }
    if (year === 2021) {
      holidays.delete(key(7, getNthMonday(year, 7, 3)));
      holidays.set(key(7, 22), '海の日');
      holidays.set(key(7, 23), 'スポーツの日');
      holidays.delete(key(10, getNthMonday(year, 10, 2)));
      holidays.delete(key(8, 11));
      holidays.set(key(8, 8), '山の日');
    }

    // === 振替休日 ===
    // 祝日が日曜の場合、翌月曜が振替休日
    const baseHolidays = new Map(holidays);
    for (const [dateStr] of baseHolidays) {
      const d = new Date(dateStr + 'T00:00:00');
      if (d.getDay() === 0) { // 日曜日
        let next = new Date(d);
        next.setDate(next.getDate() + 1);
        let nextStr = next.toISOString().split('T')[0];
        // 翌日も祝日なら更に翌日へ
        while (holidays.has(nextStr)) {
          next.setDate(next.getDate() + 1);
          nextStr = next.toISOString().split('T')[0];
        }
        holidays.set(nextStr, '振替休日');
      }
    }

    // === 国民の休日（祝日に挟まれた平日） ===
    const sortedDates = Array.from(holidays.keys()).sort();
    for (let i = 0; i < sortedDates.length - 1; i++) {
      const curr = new Date(sortedDates[i] + 'T00:00:00');
      const next = new Date(sortedDates[i + 1] + 'T00:00:00');
      const diff = (next - curr) / 86400000;
      if (diff === 2) {
        const between = new Date(curr);
        between.setDate(between.getDate() + 1);
        const betweenStr = between.toISOString().split('T')[0];
        if (!holidays.has(betweenStr) && between.getDay() !== 0) {
          holidays.set(betweenStr, '国民の休日');
        }
      }
    }

    return holidays;
  }

  // キャッシュ
  const _cache = {};

  // 指定日が祝日かチェック（祝日名を返す、祝日でなければnull）
  function getHolidayName(dateStr) {
    if (!dateStr) return null;
    const year = parseInt(dateStr.split('-')[0]);
    if (!_cache[year]) {
      _cache[year] = getHolidaysForYear(year);
    }
    return _cache[year].get(dateStr) || null;
  }

  // 日付情報をまとめて取得
  function getDateInfo(dateStr) {
    if (!dateStr) return { dayOfWeek: '', holiday: null, isHoliday: false, isSunday: false, isSaturday: false };
    const dayOfWeek = getDayOfWeek(dateStr);
    const dayIndex = getDayIndex(dateStr);
    const holiday = getHolidayName(dateStr);
    return {
      dayOfWeek,
      holiday,
      isHoliday: !!holiday,
      isSunday: dayIndex === 0,
      isSaturday: dayIndex === 6,
    };
  }

  return {
    getDayOfWeek,
    getHolidayName,
    getDateInfo,
    getHolidaysForYear,
  };
})();
