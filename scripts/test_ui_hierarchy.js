/* 无浏览器依赖的展示逻辑回归：分页边界、风险排序、缺数与关联关系。 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..', 'frontend');
let alarms = [], commands = [];
const context = { console, Date, Math, Number, API: {
  alarms: () => alarms, commands: () => commands
} };
context.window = context;
vm.createContext(context);
['components.js', 'pages/overview.js', 'pages/fish.js', 'pages/mgmt.js'].forEach(file => {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
});
function model(route, data) {
  const page = context.PAGES[route];
  const instance = Object.assign(page.data(), page.methods, data);
  Object.keys(page.computed).forEach(key => {
    Object.defineProperty(instance, key, { get: () => page.computed[key].call(instance) });
  });
  return instance;
}

const records = model('/fish/records', { rows: Array.from({ length: 51 }, (_, i) => ({ ts: i, quality: 'good' })) });
assert.equal(records.viewRows.length, 25);
assert.equal(records.viewRows[0].ts, 50);
records.page = 3;
assert.equal(records.viewRows.length, 1);
assert.equal(records.viewRows[0].ts, 0);
records.quality = 'suspect';
assert.equal(records.currentPage, 1);
assert.equal(records.viewRows.length, 0);
assert.equal(records.feedCn('strong'), '强');
assert.equal(records.qualCn('stale'), '超时未更新');

alarms = [
  { alarm_event_id: 'yellow', alarm_status: 'active', risk_level: 'yellow' },
  { alarm_event_id: 'recovered', alarm_status: 'recovered', risk_level: 'red' },
  { alarm_event_id: 'orange', alarm_status: 'acknowledged', risk_level: 'orange' }
];
const overview = model('/overview');
assert.equal(overview.activeCount, 2);
assert.equal(overview.topAlarm.alarm_event_id, 'orange');
assert.equal(model('/mgmt/alarm').rows.map(a => a.alarm_event_id).join(','), 'orange,yellow,recovered');

const energy = model('/mgmt/energy', { series: [{ battery_soc: null }] });
assert.equal(energy.socLevel, 'unknown');
energy.series = [{ battery_soc: 8 }];
assert.equal(energy.lvCn(energy.socLevel), '严重低电量');

commands = [{ command_id: 'unrelated', params: { amount_kg: 2 } },
  { command_id: 'related', params: { from_alarm: 'orange' } }];
assert.equal(model('/mgmt/handle', { picked: alarms[2] }).commands.map(c => c.command_id).join(','), 'related');
assert.equal(model('/mgmt/handle', { picked: null }).commands.length, 0);
console.log('PASS: pagination, Chinese labels, unresolved risk priority, missing energy, command association');
