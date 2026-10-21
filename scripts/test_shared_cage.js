/* Shared truss geometry, fish point mapping, current-cage and lifecycle regressions. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = ['frontend/vendor/struct-truss-cage-standalone.js', 'frontend/pages/struct.js',
  'frontend/pages/fish.js', 'frontend/components.js'];
const source = file => process.env.SHARED_CAGE_BASELINE
  ? execFileSync('git', ['show', 'HEAD:' + file], { cwd: root, encoding: 'utf8' })
  : fs.readFileSync(path.join(root, file), 'utf8');
const frames = new Map(), timers = new Map(), subscribers = new Set(), farmSubscribers = new Set();
const requests = [];
const envRequests = [];
let sequence = 0, currentId = 'cage_01', disposedObservers = 0, mountCount = 0;
const farm = { cages: [
  { cage_id: 'cage_01', site_id: 'site_04', site_name: '嵊山',
    spec: { shape: '桁架式', length_m: 20, width_m: 20, depth_m: 6 } },
  { cage_id: 'cage_02', site_id: 'site_03', site_name: '小麦岛',
    spec: { shape: '桁架式', length_m: 18, width_m: 18, depth_m: 6 } }
] };
const global = {
  console, performance: { now: () => 100 }, devicePixelRatio: 1,
  matchMedia: () => ({ matches: true }),
  document: { getElementById: () => true },
  sessionStorage: { getItem: () => 'cage_01', setItem() {} },
  requestAnimationFrame: cb => { const id = ++sequence; frames.set(id, cb); return id; },
  cancelAnimationFrame: id => frames.delete(id),
  ResizeObserver: class { observe() {} disconnect() { disposedObservers++; } },
  setInterval: cb => { const id = ++sequence; timers.set(id, cb); return id; },
  clearInterval: id => timers.delete(id),
  fetch: url => new Promise(resolve => requests.push({ url, reply: data => resolve({ json: () => data }) })),
  CurrentCage: {
    get: () => currentId,
    set(id) { if (id === currentId) return; currentId = id; [...subscribers].forEach(cb => cb(id)); },
    subscribe(cb) { subscribers.add(cb); return () => subscribers.delete(cb); }
  },
  API: {
    farm: () => farm, struct: () => [],
    env: (site, minutes, options) => { envRequests.push({ site, options }); return { fast: [] }; },
    resolve: (data, cb) => cb(data), bind: () => () => {},
    subscribe(cb) { farmSubscribers.add(cb); return () => farmSubscribers.delete(cb); }
  }
};
global.window = global;
const context = vm.createContext(global);
function canvas() {
  const listeners = new Map(), fills = [], arcs = [];
  const ctx = {
    setTransform() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {},
    fillRect() {}, fillText() {}, arc(...args) { arcs.push(args); },
    fill() { fills.push(this.fillStyle); },
    createLinearGradient: () => ({ addColorStop() {} })
  };
  return { clientWidth: 640, clientHeight: 480, style: {}, classList: { add() {} },
    listeners, fills, arcs, getContext: () => ctx, setPointerCapture() {},
    addEventListener: (name, cb) => listeners.set(name, cb),
    removeEventListener: name => listeners.delete(name) };
}
function instance(page, refs = {}) {
  const result = Object.assign(page.data(), { $refs: refs, $nextTick: cb => cb() });
  for (const [name, method] of Object.entries(page.methods || {})) result[name] = method.bind(result);
  return result;
}
function flushFrame() {
  const [id, cb] = frames.entries().next().value;
  frames.delete(id); cb(100);
}
async function settle() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
async function main() {
  vm.runInContext(source(files[0]), context);
  const model = global.StructTrussCage;
  vm.runInContext(source(files[1]), context);
  assert.equal(global.StructTrussCage, model, 'loading struct page must not overwrite the shared model');
  assert.equal(typeof model.geometry, 'function', 'shared model must expose its canonical dimensions');
  const size = model.geometry(farm.cages[0].spec, 'cage_01');
  assert.equal(size.breadth / size.length, 1, 'square cage must not be clamped into a narrow cage');
  assert.equal(size.depth / size.length, 6 / 20);
  assert(Math.abs(model.geometry(farm.cages[1].spec, 'cage_02').depth / 5 - 6 / 18) < 1e-12);
  const dims = { x: 10, y: 10, z: 8 };
  const point = (x, y, z) => Array.from(model.mapPoint({ x, y, z }, dims, size));
  assert.deepEqual(point(0, 0, 0), [-2.15, -0.24, -2.18]);
  assert.deepEqual(point(10, 10, 8), [2.15, -1.5, 2.18]);
  assert.deepEqual(point(5, 5, 4), [0, -0.87, 0]);
  assert.equal(model.mapPoint({ x: null, y: 1, z: 1 }, dims, size), null);
  assert.equal(model.mapPoint({ x: 1, y: 1, z: 1 }, { x: 0, y: 10, z: 8 }, size), null);
  const c = canvas(), viewer = model.mount(c);
  viewer.setSpec(farm.cages[0].spec, 'cage_01');
  viewer.setPointCloud({ dims, points: [0, 1, 2].map(s => ({ x: 5, y: 5, z: 4, s })) });
  flushFrame();
  for (const color of ['#59bfff', '#ff9e38', '#ff4747']) assert(c.fills.includes(color));
  const before = c.arcs[c.arcs.length - 1][0];
  c.listeners.get('pointerdown')({ clientX: 0, clientY: 0, pointerId: 1 });
  c.listeners.get('pointermove')({ clientX: 50, clientY: 20 });
  c.listeners.get('pointerup')();
  flushFrame();
  assert.notEqual(c.arcs[c.arcs.length - 1][0], before, 'drag must rotate the shared projection');
  let prevented = false;
  c.listeners.get('wheel')({ deltaY: 100, preventDefault() { prevented = true; } });
  assert(prevented);
  viewer.dispose();
  assert.equal(frames.size, 0); assert.equal(c.listeners.size, 0); assert.equal(disposedObservers, 1);

  vm.runInContext(source(files[2]), context);
  vm.runInContext(source(files[3]), context);
  const originalMount = model.mount;
  model.mount = c => { mountCount++; return originalMount(c); };
  // Homepage CageModel, structure overview, and fish heatmap must all mount that same object.
  const component = global.C.CageModel;
  const home = { $refs: { canvas: canvas() }, height: 280, ready: false,
    spec: farm.cages[0].spec, cageId: 'cage_01' };
  home.applySpec = component.methods.applySpec.bind(home);
  component.mounted.call(home); component.beforeUnmount.call(home);
  for (const route of ['alarm', 'overview', 'detail', 'rules']) {
    global.CurrentCage.set('cage_02');
    const page = global.PAGES['/struct/' + route], data = instance(page, { cageCanvas: canvas() });
    page.mounted.call(data);
    assert.equal(data.cageId, 'cage_02', route + ' must mount with global current cage');
    assert.equal(page.computed.cageSiteLabel.call(data), '小麦岛');
    if (route === 'alarm' || route === 'overview') {
      assert.equal(envRequests[envRequests.length - 1].site, 'site_03');
      assert.equal(envRequests[envRequests.length - 1].options.storm, false);
    }
    data.selectCage('cage_01'); assert.equal(currentId, 'cage_01');
    if (route === 'alarm' || route === 'overview') assert.equal(envRequests[envRequests.length - 1].site, 'site_04');
    global.CurrentCage.set('cage_02'); assert.equal(data.cageId, 'cage_02');
    if (route === 'alarm') {
      data.toggleStormDemo();
      assert.equal(envRequests[envRequests.length - 1].site, 'site_01');
      assert.equal(envRequests[envRequests.length - 1].options.storm, true);
      data.toggleStormDemo();
      assert.equal(envRequests[envRequests.length - 1].site, 'site_03');
    }
    page.beforeUnmount.call(data);
    assert.equal(subscribers.size, 0); assert.equal(farmSubscribers.size, 0);
  }
  const page = global.PAGES['/fish/heatmap'], data = instance(page, { cloudCanvas: canvas() });
  page.mounted.call(data); data.switchView('3d');
  assert.equal(mountCount, 3);
  assert.equal(timers.size, 1);
  let request = requests.filter(r => r.url.includes('positions3d')).pop();
  request.reply({ offline: false, data: { dims, points: [{ x: 5, y: 5, z: 4, s: 2 }] } });
  await settle(); assert.equal(data.pointCount, 1);
  // Ignore a response from the previous cage, and clear old points immediately.
  [...timers.values()][0]();
  const stale = requests.filter(r => r.url.includes('positions3d')).pop();
  global.CurrentCage.set('cage_01'); assert.equal(data.pointCount, 0);
  stale.reply({ offline: false, data: { dims, points: [{ x: 1, y: 1, z: 1 }] } });
  await settle(); assert.equal(data.pointCount, 0);
  request = requests.filter(r => r.url.includes('positions3d')).pop();
  request.reply({ offline: true, data: null }); await settle();
  assert.equal(data.offline3d, true); assert.equal(data.pointCount, 0);
  data.switchView('2d'); assert.equal(timers.size, 0); assert.equal(frames.size, 0);
  data.switchView('3d');
  const late = requests.filter(r => r.url.includes('positions3d')).pop();
  page.beforeUnmount.call(data);
  late.reply({ offline: false, data: { dims, points: [{ x: 1, y: 1, z: 1 }] } }); await settle();
  assert.equal(data.pointCount, 0); assert.equal(timers.size, 0); assert.equal(frames.size, 0);
  assert.equal(subscribers.size, 0); assert.equal(farmSubscribers.size, 0);
  assert.equal(data.$refs.cloudCanvas.listeners.size, 0);
  console.log('PASS shared cage: true proportions, point bounds/colors, three mount consumers, four-page cage sync, drag, offline/stale responses and disposal');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
