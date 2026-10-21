/* Deferred history responses and real Vue metadata-reactivity regression. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const pending = [], subscriptions = new Set(), cageSubscriptions = new Set();
let sites = [], cage = 'cage_01';
const sandbox = {
  console, setInterval: () => 1, clearInterval() {},
  CurrentCage: { get: () => cage, site: () => 'site_03',
    subscribe(cb) { cageSubscriptions.add(cb); return () => cageSubscriptions.delete(cb); } },
  API: { sites: () => sites,
    subscribe(cb) { subscriptions.add(cb); return () => subscriptions.delete(cb); } },
  fetch: url => new Promise((resolve, reject) => pending.push({ url, reject,
    reply: data => resolve({ ok: true, json: () => data }) }))
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'frontend/vendor/vue.global.prod.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'frontend/pages/env.js'), 'utf8'), sandbox);
const tick = () => new Promise(resolve => setImmediate(resolve));
function instance(page) {
  return Object.assign(page.data(), { site: 'site_03', rangeStart: '2026-01-01T00:00',
    rangeEnd: '2026-01-02T00:00', load() {}, loadRanges() {}, renderChart() {},
    $nextTick: cb => cb() });
}
const result = marker => ({ count: 1, records: [{ ts: 1767225600000, marker }] });
async function main() {
  for (const name of ['sea', 'water']) {
    const page = sandbox.PAGES['/env/' + name];
    for (const action of ['site', 'cage', 'exit', 'unmount', 'newer', 'invalid']) {
      const data = instance(page);
      page.methods.queryRange.call(data);
      const old = pending[pending.length - 1];
      if (action === 'site') {
        data.site = 'site_04'; page.watch.site.call(data);
        data.site = 'site_03'; page.watch.site.call(data);
      } else if (action === 'cage') cage = 'cage_02';
      else if (action === 'exit') page.methods.exitRange.call(data);
      else if (action === 'unmount') page.beforeUnmount.call(data);
      else if (action === 'invalid') {
        data.rangeEnd = data.rangeStart; page.methods.queryRange.call(data);
      } else {
        page.methods.queryRange.call(data);
        pending[pending.length - 1].reply(result('new')); await tick();
      }
      old.reply(result('old')); await tick();
      if (action === 'newer') assert.equal(data.rangeSeries[0].marker, 'new', name + ' newest response wins');
      else assert.equal(data.rangeMode, false, name + ' ignores old success after ' + action);
      cage = 'cage_01';
    }
    const data = instance(page);
    page.methods.queryRange.call(data);
    const old = pending[pending.length - 1];
    page.methods.exitRange.call(data);
    old.reject(Error('late network failure')); await tick();
    assert.equal(data.rangeMsg, '', name + ' ignores obsolete failure');
    // A hand-built component without rangeSeq must still accept its current request.
    const manual = { site: 'site_03', rangeStart: '2026-01-01T00:00', rangeEnd: '2026-01-02T00:00',
      loadRanges() {}, $nextTick: cb => cb(), renderChart() {} };
    page.methods.queryRange.call(manual);
    pending[pending.length - 1].reply(result('current')); await tick();
    assert.equal(manual.rangeMode, true);
  }
  const page = sandbox.PAGES['/env/water'], Vue = sandbox.Vue;
  const base = Object.assign(page.data(), { $nextTick: cb => cb(), load() {}, renderChart() { renders++; } });
  let renders = 0;
  const data = Vue.reactive(base);
  for (const [name, method] of Object.entries(page.methods)) {
    if (name !== 'load' && name !== 'renderChart') base[name] = method.bind(data);
  }
  for (const [name, fn] of Object.entries(page.computed)) {
    const computed = Vue.computed(() => fn.call(data));
    Object.defineProperty(base, name, { configurable: true, get: () => computed.value });
  }
  const stop = Vue.watch(() => data.tick, () => page.watch.tick.call(data));
  assert.equal(data.tick, 0, 'water tick must be declared reactive');
  assert.equal(data.isObs, false); assert.equal(data.waterLines.length, 0);
  page.mounted.call(data);
  sites = [{ site_id: 'site_03', kind: 'obs', species: '黑鲷', temp_warn_high: 25.5,
    temp_alarm_high: 30, temp_warn_low: 16.5, temp_alarm_low: 4.3 }];
  subscriptions.forEach(cb => cb()); await Vue.nextTick();
  assert.equal(data.isObs, true, 'metadata arrival reclassifies cached isObs');
  assert.deepEqual(Array.from(data.waterLines, line => line.yAxis), [30, 25.5, 4.3, 16.5]);
  assert(renders > 1, 'metadata arrival redraws chart configuration');
  assert(data.waterThresholdInfo.text.includes('黑鲷'));
  for (const value of ['30', '25.5', '16.5', '4.3']) assert(data.waterThresholdInfo.text.includes(value));
  sites = [{ site_id: 'site_03', kind: 'obs' }]; subscriptions.forEach(cb => cb()); await Vue.nextTick();
  assert.equal(data.waterLines.length, 0);
  assert(data.waterThresholdInfo.text.includes('—'), 'missing thresholds display a dash');
  assert(!data.waterThresholdInfo.text.includes('大黄鱼'), 'missing species does not invent a species');
  data.queryRange();
  const stale = pending[pending.length - 1];
  cage = 'cage_02'; cageSubscriptions.forEach(cb => cb());
  cage = 'cage_01'; cageSubscriptions.forEach(cb => cb());
  stale.reply(result('old cage')); await tick();
  assert.equal(data.rangeMode, false, 'cage changes invalidate even after returning to the same cage/site');
  stop(); page.beforeUnmount.call(data);
  assert.equal(subscriptions.size, 0); assert.equal(cageSubscriptions.size, 0);
  console.log('PASS env: deferred historical requests, site/cage/exit/unmount/new-query invalidation, manual instances and real Vue metadata/threshold reactivity');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
