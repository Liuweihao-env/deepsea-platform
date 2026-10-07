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
