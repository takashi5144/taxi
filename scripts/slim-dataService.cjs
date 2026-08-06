const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'src', 'utils', 'dataService.js');
let src = fs.readFileSync(file, 'utf8');

const REMOVE = [
  'getAreaBreakdown', 'getWeatherBreakdown', 'getSourceBreakdown', 'getPurposeBreakdown',
  'getPurposeDayAnalysis', 'getAreaTimeBreakdown', 'getUnitPriceAnalysis', 'getBusinessRecommendation',
  'getSourceAreaPriceBreakdown', 'getPriceTierHeatmapData', 'getNearbyEstimate', 'getHeatmapData',
  'getWeeklyBreakdown',
  'getRivalHourlyBreakdown', 'getRivalDayOfWeekBreakdown', 'getRivalLocationBreakdown', 'getRivalWeatherBreakdown',
  'downloadRivalCSV',
  'getGatheringAnalysis', 'downloadGatheringCSV',
  'getUtilizationRate', 'getDailyReport', 'getVacancyCountermeasures', 'getAreaRecommendation',
  'getHourlyOccupancy', 'getTopPickupAreasForNow', 'getGoalProgress', 'getUpcomingEventAlerts',
  'getFrequentPickupSpots', 'getChainSuggestion', 'getTopPickupClusters', 'getPickupClustersByHour',
  'getSmartHeatmapData', 'getHeatmapDataByHour', '_resolveLocationCoords', 'getHospitalScheduleData',
  'getBusArrivalsData', 'getDailyDemandSchedule', 'getDayShiftTimeline', 'getNextOptimalAction',
  'getHotelDemandData', 'getWeatherDemandImpact', 'getWaitingSpotDemandIndex', 'getCruisingAreaDemandIndex',
  'getWaitingSpotRevenueForecast', 'getDayShiftDemandScore', 'getStrategySimulation',
  'getSlowPeriodCruisingRoutes', 'getTransitHeatmapData', 'getWaitingVsCruisingEfficiency',
  'getHotelPriceHistory', 'saveHotelPrices', 'analyzeHotelPrices', 'getShiftProductivity',
  'getWeatherRevenueCorrelation', 'getGatheringRevenueCorrelation', 'getWeatherTimeDemandMatrix',
  'getTemperatureBandAnalysis', 'getAreaOccupancyAnalysis', 'getSourceEfficiencyAnalysis',
  'getDayWeatherCrossAnalysis', 'getShiftOccupancyAnalysis', 'getPassengerWeatherAnalysis',
  'getPurposeWeatherAnalysis', 'getPaymentWeatherAnalysis', 'getRivalWeatherOccupancyAnalysis',
  'getWaitingTimeOccupancyAnalysis',
  'classifyDayType', 'getTodayDayType', 'isHospitalClosedToday', 'getZooStatus', '_matchSpot',
  'getEvents', 'saveEvents', 'addEvent', 'deleteEvent', 'clearAllEvents',
  '_downloadRivalBackup', 'moveRivalToTrash',
  'getRivalEntries', 'saveRivalEntries', 'addRivalEntry', 'deleteRivalEntry', 'updateRivalEntry', 'clearAllRivalEntries',
  'getGatheringMemos', 'saveGatheringMemos', 'addGatheringMemo', 'updateGatheringMemo', 'deleteGatheringMemo', 'clearAllGatheringMemos',
];

const OBJECT_RETURNS = new Set([
  'getBusinessRecommendation', 'getSourceAreaPriceBreakdown', 'getUnitPriceAnalysis', 'getPurposeDayAnalysis',
  'getShiftProductivity', 'getWeatherRevenueCorrelation', 'getGatheringRevenueCorrelation',
  'getWeatherTimeDemandMatrix', 'getTemperatureBandAnalysis', 'getDayWeatherCrossAnalysis',
  'getShiftOccupancyAnalysis', 'getPassengerWeatherAnalysis', 'getRivalWeatherOccupancyAnalysis',
  'getWaitingTimeOccupancyAnalysis', 'getWaitingVsCruisingEfficiency', 'getDailyReport',
  'getVacancyCountermeasures', 'getAreaRecommendation', 'getHourlyOccupancy', 'getGoalProgress',
  'getSmartHeatmapData', 'getDailyDemandSchedule', 'getDayShiftTimeline', 'getNextOptimalAction',
  'getHotelDemandData', 'getWeatherDemandImpact', 'getWaitingSpotDemandIndex', 'getCruisingAreaDemandIndex',
  'getWaitingSpotRevenueForecast', 'getDayShiftDemandScore', 'getStrategySimulation',
  'getSlowPeriodCruisingRoutes', 'getTransitHeatmapData', 'analyzeHotelPrices', 'getZooStatus',
  'getAreaOccupancyAnalysis', 'getSourceEfficiencyAnalysis', 'getPurposeWeatherAnalysis',
  'getPaymentWeatherAnalysis',
]);

function findFunctionRange(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) return null;
  const start = m.index;
  const i = src.indexOf('{', start);
  if (i < 0) return null;
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) {
        let end = j + 1;
        if (src[end] === '\n') end++;
        return { start, end };
      }
    }
  }
  return null;
}

function stubFor(name) {
  if (name === 'classifyDayType' || name === 'getTodayDayType') return `  function ${name}() { return 'weekday'; }\n`;
  if (name === 'isHospitalClosedToday') return `  function ${name}() { return false; }\n`;
  if (name.startsWith('save') || name.startsWith('clear') || name.startsWith('delete') || name.startsWith('move') || name.startsWith('download')) {
    return `  function ${name}() { return false; }\n`;
  }
  if (name.startsWith('add') || name.startsWith('update')) {
    return `  function ${name}() { return { success: false, errors: ['無効'] }; }\n`;
  }
  if (OBJECT_RETURNS.has(name) || name.startsWith('_')) {
    return `  function ${name}() { return ${name.startsWith('_') ? 'null' : '{}'}; }\n`;
  }
  if (name.startsWith('get')) return `  function ${name}() { return []; }\n`;
  return `  function ${name}() { return null; }\n`;
}

const ranges = [];
for (const name of REMOVE) {
  const r = findFunctionRange(src, name);
  if (r) ranges.push({ name, ...r });
  else console.log('not found:', name);
}
ranges.sort((a, b) => b.start - a.start);
let saved = 0;
for (const r of ranges) {
  const before = r.end - r.start;
  src = src.slice(0, r.start) + stubFor(r.name) + src.slice(r.end);
  saved += before;
  console.log('stubbed', r.name, before);
}
fs.writeFileSync(file, src);
console.log('saved ~', Math.round(saved / 1024), 'KB; new size', Math.round(fs.statSync(file).size / 1024), 'KB');
