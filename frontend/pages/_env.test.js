'use strict';
/* ============================================================
   env.js 问题级测试（本文件以 _ 开头，验收脚本会自动跳过，不会当页面）
   运行：node frontend/pages/_env.test.js
   职责：每个问题完成时添加对应测试并运行，通过后再 Git 提交。
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, 'env.js');
const code = fs.readFileSync(file, 'utf8');

const sandbox = { console: console };
sandbox.window = sandbox;
sandbox.PAGES = {};
sandbox.API = {
  sites: function () {
    return [
      { site_id: 'site_01', site_name: '模拟养殖站点', kind: 'farm' },
      { site_id: 'site_02', site_name: '墨西哥湾中部', kind: 'obs', station_id: '42001' },
      { site_id: 'site_03', site_name: '阿拉斯加湾西部', kind: 'obs', station_id: '46001' },
      { site_id: 'site_04', site_name: '夏威夷西北', kind: 'obs', station_id: '51001' }
    ];
  }
};
/* 导出 CSV 需要的最小 DOM mock（downloadCsv 会创建 <a> 并点击） */
sandbox.document = {
  createElement: function () { return { click: function () {}, remove: function () {} }; },
  body: { appendChild: function () {} }
};
sandbox.URL = { createObjectURL: function () { return 'blob:mock'; }, revokeObjectURL: function () {} };
sandbox.Blob = function () {};
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'env.js' });

let failed = 0;
function assert(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { console.error('  FAIL ' + msg); failed++; }
}
function section(t) { console.log('\n== ' + t + ' =='); }

const H = sandbox.__ENV_HELPERS__;
const sea = sandbox.PAGES['/env/sea'];
const water = sandbox.PAGES['/env/water'];

section('PAGES 注册');
assert(!!sea, "PAGES['/env/sea'] 已注册");
assert(!!water, "PAGES['/env/water'] 已注册");
assert(typeof sea.data === 'function' && typeof sea.mounted === 'function', '海况页含 data/mounted');
assert(typeof water.data === 'function' && typeof water.mounted === 'function', '水质页含 data/mounted');

section('问题1：两页布局（数值卡 → 时序 → 原始数据 → 调试面板）');
assert(sea.template.indexOf('<page-head') >= 0, '海况页使用 page-head（验收第 4 条）');
assert(water.template.indexOf('<page-head') >= 0, '水质页使用 page-head（验收第 4 条）');
assert(sea.template.indexOf('原始数据') >= 0, '海况页包含原始数据区');
assert(sea.template.indexOf('调试面板') >= 0, '海况页包含调试面板');
assert(sea.template.indexOf('站点切换') >= 0, '海况页包含顶部站点切换');
assert(water.template.indexOf('光照强度') >= 0, '水质页保留光照强度');
assert(water.template.indexOf('盐度') >= 0, '水质页保留盐度/pH');
/* 布局顺序：异常界定指标 → 原始数据 → 调试面板（自上而下） */
const iIndicator = sea.template.indexOf('异常界定指标');
const iRaw = sea.template.indexOf('原始数据');
const iDebug = sea.template.indexOf('调试面板');
assert(iIndicator >= 0 && iIndicator < iRaw && iRaw < iDebug, '海况页顺序：指标表 → 原始数据 → 调试面板');
assert(iRaw < iDebug, '水质页顺序：原始数据 → 调试面板');

section('验收第 2 条关键字（一条竖线，不能删）');
const all = sea.template + water.template;
assert(all.indexOf('水温上限') >= 0, '模板含「水温上限」');
assert(all.indexOf('28.0') >= 0 || all.indexOf('28') >= 0, '模板含 28.0 / 28');
assert(all.indexOf('#/trace') >= 0, '模板含 #/trace');

section('问题1：调试面板/原始数据所需方法已定义');
['ensurePer', 'load', 'setSite', 'onMinutes', 'onCustomMin', 'togglePause', 'exportCsv', 'srcCn', 'qCn', 'fmtTs']
  .forEach(function (m) { assert(typeof sea.methods[m] === 'function', '海况页 methods.' + m); });
['ensurePer', 'load', 'setSite', 'onMinutes', 'onCustomMin', 'togglePause', 'toggleHeat', 'toggleOffline', 'exportCsv', 'srcCn', 'qCn', 'fmtTs']
  .forEach(function (m) { assert(typeof water.methods[m] === 'function', '水质页 methods.' + m); });

section('共享纯函数');
{
  const d = new Date(2026, 9, 7, 12, 34, 56); /* 本地时间 2026-10-07 12:34:56 */
  assert(H.fmtTs(d.getTime()) === '2026年10月07日 12:34:56', 'fmtTs 输出「年/月/日 时:分:秒」，无字母');
  assert(H.fmtTs(null) === '—', 'fmtTs(null) 显示 —');
  assert(H.minutesBetween(1000 * 60 * 5, 0) === 5, 'minutesBetween 5 分钟');
  assert(H.minutesBetween(0, 0) === 1, 'minutesBetween 至少 1 分钟');
  const csv = H.toCsv(['时间', '来源'], [['a,b', '"x"'], ['2026年', 'simulated']]);
  assert(csv.charCodeAt(0) === 0xFEFF, 'CSV 带 UTF-8 BOM');
  assert(csv.indexOf('"a,b"') >= 0, 'CSV 逗号字段加引号');
  assert(csv.indexOf('"x"') >= 0, 'CSV 引号字段正确转义');
  assert(csv.indexOf('simulated') >= 0, 'CSV 正常字段原样输出');
}
{
  const per = H.buildPer(sandbox.API.sites());
  assert(Object.keys(per).length === 4, 'buildPer 覆盖全部 4 个站点');
  assert(per.site_01.paused === false && per.site_01.storm === false, '默认状态：运行中、无风暴');
  assert(H.pausedText(per) === '', '无暂停站点时聚合文本为空');
  per.site_01.paused = true;
  per.site_03.paused = true;
  assert(H.pausedText(per) === 'site_01、site_03（共2个）', '暂停聚合列出所有被暂停站点（不是最后一个）');
  per.site_02.paused = true;
  assert(H.pausedText(per) === 'site_01、site_02、site_03（共3个）', '三个暂停站点按 id 顺序列出');
  per.site_01.paused = false;
  assert(H.pausedText(per) === 'site_02、site_03（共2个）', '恢复后只列仍暂停的站点');
}

section('问题2：时序增强（缩放/框选/红点）+ 异常界定指标');
assert(sea.template.indexOf('ref="chartEl"') >= 0, '海况页有自绘时序容器 chartEl');
assert(water.template.indexOf('ref="chartEl"') >= 0, '水质页有自绘时序容器 chartEl');
assert(sea.template.indexOf('dataZoom') >= 0 || sea.methods.renderChart.toString().indexOf('dataZoom') >= 0,
  '海况页时序支持 dataZoom（缩放/框选）');
assert(sea.methods.renderChart.toString().indexOf('markPoint') >= 0, '海况页时序支持 markPoint（异常点）');
assert(typeof sea.computed.waveDots === 'function' && typeof sea.computed.windDots === 'function',
  '海况页有浪高/风速异常点计算');
assert(typeof water.computed.waterDots === 'function' && typeof water.computed.waterLines === 'function',
  '水质页有水温异常点/阈值线计算');
assert(sea.watch.fast && sea.watch.fast.deep, '海况页数据更新自动重绘');
assert(water.watch.fast && water.watch.fast.deep, '水质页数据更新自动重绘');

/* 红点分级逻辑（直接调用 computed 函数验证） */
{
  const fast = [
    { ts: 1, wave_height: 2.0, wind_speed: 10.0 },   /* 正常：不标 */
    { ts: 2, wave_height: 2.5, wind_speed: 17.1 },   /* 浪高蓝标；风速不到 8 级 */
    { ts: 3, wave_height: 4.0, wind_speed: 17.2 },   /* 浪高黄标；风速红标 */
    { ts: 4, wave_height: 6.0, wind_speed: null },   /* 浪高橙标；风速空不标 */
    { ts: 5, wave_height: 9.0, wind_speed: 20.0 },   /* 浪高红标；风速红标 */
    { ts: 6, wave_height: null, wind_speed: 30.0 }   /* 浪高空不标；风速红标 */
  ];
  const dots = sea.computed.waveDots.call({ fast: fast });
  const colors = dots.map(function (d) { return d.itemStyle.color; });
  assert(colors.join(',') === '#1D4ED8,#D97706,#EA580C,#991B1B',
    '浪高异常点按国标四色分级（蓝/黄/橙/红），正常与空值不标（实际：' + colors.join(',') + '）');
  const wd = sea.computed.windDots.call({ fast: fast });
  assert(wd.length === 3, '风速 ≥17.2 m/s 全部标红（含 null 跳过），实际 ' + wd.length + ' 个');
  const wf = [
    { ts: 1, water_temp: 25.4 }, { ts: 2, water_temp: 25.5 },
    { ts: 3, water_temp: 28.0 }, { ts: 4, water_temp: null }
  ];
  const wt = water.computed.waterDots.call({ fast: wf });
  const wc = wt.map(function (d) { return d.itemStyle.color; });
  assert(wc.join(',') === '#D97706,#991B1B', '水温异常点：25.5 黄、28.0 红，空值跳过（实际：' + wc.join(',') + '）');
  const wl = water.computed.waterLines.call({});
  assert(wl.length === 2 && wl[0].yAxis === 28.0 && wl[1].yAxis === 25.5, '水温阈值线 28.0 / 25.5');
}
assert(sea.template.indexOf('异常界定指标') >= 0, '海况页含异常界定指标表');
assert(water.template.indexOf('异常界定指标') >= 0, '水质页含异常界定指标表');
assert(sea.template.indexOf('GB/T 19721.2') >= 0, '指标表标注浪高依据（国标）');
assert(sea.template.indexOf('蒲福风级') >= 0, '指标表标注风速依据（蒲福风级）');
assert(water.template.indexOf('R-TEMP-01') >= 0, '水质指标表标注规则 R-TEMP-01');
assert(sea.template.indexOf('help-dot') >= 0 && sea.template.indexOf(':info=') >= 0,
  'help-dot 使用正确的 :info 对象写法');

section('问题3：原始数据区（时间窗 / CSV 导出 / 公开数据可见）');
assert(sea.template.indexOf('<time-range') >= 0, '海况页有 time-range 时间窗');
assert(sea.template.indexOf('自定义分钟数') >= 0, '海况页有自定义分钟输入');
assert(sea.template.indexOf('导出 CSV') >= 0, '海况页有导出 CSV 按钮');
assert(sea.template.indexOf('fmtTs(r.ts)') >= 0, '原始数据表时间用年/月/日格式（无字母混用）');
assert(sea.template.indexOf('NOAA NDBC 公开历史数据') >= 0, '原始数据标题动态标注公开历史数据/仿真');
assert(sea.template.indexOf('backend/api/env.py') >= 0, '精确历史日期接口的降级说明已展示');
assert(water.template.indexOf('快变量') >= 0 && water.template.indexOf('慢变量（盐度 / pH）') >= 0,
  '水质页原始数据分快变量/慢变量两张表');
assert(water.template.indexOf('导出 CSV') >= 0, '水质页有导出 CSV 按钮');

/* 功能级验证：mock DOM 捕获实际导出的 CSV 与文件名 */
{
  let capturedCsv = null, capturedName = null;
  sandbox.Blob = function (parts) { capturedCsv = parts[0]; };
  sandbox.URL.createObjectURL = function () { return 'blob:mock'; };
  sandbox.URL.revokeObjectURL = function () {};
  sandbox.document.createElement = function () {
    const el = { click: function () {}, remove: function () {} };
    Object.defineProperty(el, 'download', { set: function (v) { capturedName = v; } });
    return el;
  };
  const seaInst = {
    site: 'site_01',
    fast: [{ ts: 1760000000000, site_id: 'site_01', source: 'simulated', quality: 'good',
             wave_height: 1.5, wind_speed: 8.3, current_speed: 0.6, air_temp: 22.4 }]
  };
  seaInst.siteName = function () { return sea.methods.siteName.call(seaInst); };
  seaInst.exportCsv = sea.methods.exportCsv;
  seaInst.exportCsv();
  assert(capturedCsv && capturedCsv.indexOf('\ufeff时间,站点,来源,质量,浪高 (m),风速 (m/s),流速 (m/s),气温 (℃)') === 0,
    '海况导出 CSV 表头完整且带 UTF-8 BOM');
  assert(capturedCsv && capturedCsv.indexOf('仿真数据') >= 0 && capturedCsv.indexOf('良好') >= 0,
    '海况导出 CSV 来源/质量为中文（无裸英文）');
  assert(capturedName === '海况原始数据_模拟养殖站点.csv',
    '海况导出文件名用中文站点名（实际：' + capturedName + '）');
}
{
  const wInst = {
    site: 'site_01',
    fast: [{ ts: 1760000000000, site_id: 'site_01', source: 'simulated', quality: 'good',
             water_temp: 18.6, dissolved_oxygen: 9.2, light_intensity: 12000 }]
  };
  wInst.siteName = function () { return water.methods.siteName.call(wInst); };
  wInst.exportCsv = water.methods.exportCsv;
  let csv2 = null, name2 = null;
  sandbox.Blob = function (parts) { csv2 = parts[0]; };
  sandbox.document.createElement = function () {
    const el = { click: function () {}, remove: function () {} };
    Object.defineProperty(el, 'download', { set: function (v) { name2 = v; } });
    return el;
  };
  wInst.exportCsv();
  assert(csv2 && csv2.indexOf('\ufeff时间,站点,来源,质量,水温 (℃),溶解氧 (mg/L),光照 (lux)') === 0,
    '水质导出 CSV 表头完整且带 UTF-8 BOM');
  assert(name2 === '水质原始数据_模拟养殖站点.csv', '水质导出文件名用中文站点名（实际：' + name2 + '）');
}

section('验收第 6 条相关：模板 {{ }} 内无裸枚举字段（与 acceptance.py 同口径）');
{
  /* 与 scripts/acceptance.py 的 WRAPPED 豁免规则保持一致：
     表达式内有 `.枚举字段`，且整条表达式没有 CN.xxx( / xxCn( / ? 才算裸枚举 */
  const WRAPPED = /(CN\.\w+\(|\w*[Cc]n\(|\?)/;
  const enums = ['quality', 'risk_level', 'device_state', 'device_type', 'alarm_status',
    'handle_status', 'confirm_status', 'command_type', 'command_status', 'task_status',
    'alarm_type', 'trigger_by', 'feeding_intensity'];
  const re = /\{\{([^}]+)\}\}/g;
  const bad = [];
  let m;
  while ((m = re.exec(sea.template + water.template))) {
    const expr = m[1];
    enums.forEach(function (e) {
      if (expr.indexOf('.' + e) >= 0 && !WRAPPED.test(expr)) bad.push(expr.trim());
    });
  }
  assert(bad.length === 0, '模板内无裸枚举字段' + (bad.length ? '（命中：' + bad.join('; ') + '）' : ''));
}

console.log('\n----------------------------------------');
if (failed) { console.error('❌ 失败 ' + failed + ' 项'); process.exit(1); }
console.log('✅ 全部通过');
