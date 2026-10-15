/* ============================================================
   pages/struct.js —— 结构安全板块
   ============================================================
   负责人：邓宇涵

   【这个文件归谁】
     归上面写的那个人（以及他的 AI）。**别人不要改这个文件。**

   【怎么加页面】
     照抄本文件里已有页面的结构，往 PAGES 上注册一个新路由就行：
         PAGES['/struct/xxx'] = { data: ..., computed: ..., methods: ..., template: [...] };

   【三条硬规矩】
     1. 用 components.js 里已有的公共件（stat-card / trend-chart / event-list …），
        不要自己重写一套 —— 全平台要长一个样。
     2. 数据一律走 API.xxx()，不要直接读别的板块的数据，也不要写死数字。
        拿不到就显示「—」，**不许编**。
     3. 界面上不许出现裸英文（比如 quality='good'），必须经 components.js 的 CN 表转成中文。

   【改完必须做】
     双击 验收检查.bat，8 项全过才能发 PR。全过不了就别发 —— 会把别人的页面一起弄坏。

   建立：2026-10-06（从 pages.js 拆出）
   ============================================================ */
(function (global) {
  'use strict';
  /* 自己初始化，不依赖文件加载顺序 —— 这样谁先谁后都不会出错 */
  const PAGES = global.PAGES || (global.PAGES = {});

  /* 🔴 2026-10-15 队长改：这里原来有一段「用 CSS 把来源徽标藏起来」的 hack
     （.struct-page .tagline{display:none}）。老师第 6 条已经要求**全平台删除来源字样**，
     徽标本身都没了，这个 hack 自然作废 —— 删掉，只保留三维网箱的样式。 */
  if (global.document && !global.document.getElementById('struct-cage-style')) {
    const style = global.document.createElement('style');
    style.id = 'struct-cage-style';
    style.textContent = [
      '.struct-cage-scene{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:8px;',
      'background:#527481;}',
      '.struct-cage-scene canvas{display:block;width:100%;height:320px;cursor:grab;touch-action:none;}',
      '.struct-cage-scene canvas:active{cursor:grabbing;}',
      '.struct-cage-overlay{position:absolute;left:12px;top:10px;padding:5px 8px;border-radius:4px;',
      'background:rgba(8,30,43,.72);color:#f5fbfd;font-size:12px;pointer-events:none;}',
      '.struct-cage-caption{position:absolute;left:12px;bottom:10px;right:12px;display:flex;',
      'justify-content:space-between;gap:8px;color:#f5fbfd;font-size:11px;pointer-events:none;',
      'text-shadow:0 1px 3px #062333;}',
      '.struct-net-map{overflow-x:auto;border:1px solid var(--line);border-radius:8px;',
      'background:linear-gradient(180deg,#f6f9fa,#e9f1f4);}',
      '.struct-net-map svg{display:block;width:100%;height:auto;}',
      '.struct-net-scale{display:flex;align-items:center;gap:10px;margin-top:8px;font-size:12px;}',
      '.struct-net-scale-bar{height:10px;min-width:80px;flex:1;border-radius:5px;',
      'background:linear-gradient(90deg,#d5eaee,#90c5d6,#176791);}',
      '@media(max-width:620px){.struct-cage-scene canvas{height:260px}',
      '.struct-cage-caption{font-size:10px;flex-wrap:wrap}}'
    ].join('');
    global.document.head.appendChild(style);
  }

  // 结构安全规则：网衣试运行线只判断拉力突增，不代表材料强度或破损结论。
  const STRUCT_LIMITS = { tensionWarn: 80, tensionAlarm: 95, tiltWarn: 5, tiltAlarm: 15,
                          waveTilt: 1.5, waveTension: 3 };
  const NET_TRIAL = { windowMs: 3600000, minSamples: 30, warnSigma: 4, alarmSigma: 6,
                      warnRatio: 0.20, alarmRatio: 0.35 };
  const RISK_RANK = { blue: 0, yellow: 1, orange: 2, red: 3 };
  function validNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function tensionPercent(row) {
    const reported = validNumber(row.tension_pct);
    if (reported !== null) return reported;
    const tension = validNumber(row.anchor_tension);
    const design = validNumber(row.design_tension);
    return tension !== null && design !== null && design > 0 ? tension / design * 100 : null;
  }
  function tiltDegrees(row) {
    const direct = validNumber(row.tilt_angle);
    if (direct !== null) return Math.abs(direct);
    const roll = validNumber(row.tilt_roll);
    const pitch = validNumber(row.tilt_pitch);
    return roll === null && pitch === null ? null : Math.max(Math.abs(roll || 0), Math.abs(pitch || 0));
  }
  function higherRisk(a, b) {
    if (!Object.prototype.hasOwnProperty.call(RISK_RANK, b)) return a;
    return !a || RISK_RANK[b] > RISK_RANK[a] ? b : a;
  }
  function median(values) {
    const sorted = values.slice().sort(function (a, b) { return a - b; });
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  function netTrialBaseline(series, endTs) {
    if (!Array.isArray(series) || !series.length) return null;
    const end = validNumber(endTs === undefined ? series[series.length - 1].ts : endTs);
    if (end === null) return null;
    const values = series.filter(function (row) {
      const ts = validNumber(row.ts);
      return ts !== null && ts >= end - NET_TRIAL.windowMs && ts <= end &&
        validNumber(row.net_tension) !== null && Number(row.net_tension) >= 0;
    }).map(function (row) { return Number(row.net_tension); });
    if (values.length < NET_TRIAL.minSamples) return null;
    const center = median(values);
    if (center <= 0) return null;
    const spread = 1.4826 * median(values.map(function (value) { return Math.abs(value - center); }));
    return { center: center, spread: spread, count: values.length,
      warn: center + Math.max(NET_TRIAL.warnSigma * spread, NET_TRIAL.warnRatio * center),
      alarm: center + Math.max(NET_TRIAL.alarmSigma * spread, NET_TRIAL.alarmRatio * center) };
  }
  function assessNet(row, baseline) {
    const measured = validNumber(row.net_tension);
    const trial = baseline && measured !== null ?
      measured >= baseline.alarm ? 'red' : measured >= baseline.warn ? 'yellow' : 'blue' : null;
    let level = Object.prototype.hasOwnProperty.call(RISK_RANK, row.net_risk_level) ?
      row.net_risk_level : null;
    const damage = row.damage_suspect_status;
    if (damage === 'normal') level = higherRisk(level, 'blue');
    else if (damage === 'suspected') level = higherRisk(level, 'yellow');
    else if (damage === 'confirmed') level = higherRisk(level, 'red');
    const official = level !== null;
    if (!official) level = trial;
    return { level: level, trial: trial, official: official, measured: measured };
  }
  function assessStructure(row, env, netBaseline) {
    row = row || {};
    const pct = tensionPercent(row);
    const tilt = tiltDegrees(row);
    const wave = env && env.quality === 'good' ? validNumber(env.wave_height) : null;
    const closeEnv = env && env.quality === 'good' && validNumber(env.ts) !== null && validNumber(row.ts) !== null &&
      Math.abs(Number(env.ts) - Number(row.ts)) <= 3000;
    let tension = pct === null ? null : pct >= STRUCT_LIMITS.tensionAlarm ? 'red' :
      pct >= STRUCT_LIMITS.tensionWarn ? 'yellow' : 'blue';
    let attitude = tilt === null ? null : tilt >= STRUCT_LIMITS.tiltAlarm ? 'red' :
      tilt >= STRUCT_LIMITS.tiltWarn ? 'yellow' : 'blue';
    const netState = assessNet(row, netBaseline);
    const net = netState.level;
    if (row.tension_status === 'abnormal') tension = higherRisk(tension, 'yellow');
    if (row.attitude_status === 'swaying') attitude = higherRisk(attitude, 'yellow');
    if (row.attitude_status === 'tilted') attitude = higherRisk(attitude, 'red');
    if (closeEnv && wave !== null && tilt !== null && wave > STRUCT_LIMITS.waveTilt &&
        tilt >= STRUCT_LIMITS.tiltWarn) attitude = higherRisk(attitude, 'orange');
    if (closeEnv && wave !== null && pct !== null && wave > STRUCT_LIMITS.waveTension &&
        pct > STRUCT_LIMITS.tensionWarn) tension = higherRisk(tension, 'orange');
    const known = [tension, net, attitude].filter(function (v) { return v !== null; });
    const level = known.reduce(higherRisk, null);
    return { tension: tension, net: net, attitude: attitude, level: level,
             incomplete: known.length < 3, pct: pct, tilt: tilt, netState: netState };
  }

  // 三维坐标生成浮圈、网衣和锚泊结构，再投影到本地 Canvas；不依赖联网素材。
  // 此处只展示几何外观，不把演示姿态或示意锚泊数量当作监测数据。
  function cageModelMarkup() {
    return [
      '<div class="struct-cage-scene">',
      '  <canvas ref="cageCanvas" aria-label="可拖动旋转的圆形网箱三维结构模型"></canvas>',
      '  <div class="struct-cage-overlay">{{ cageLabel }}</div>',
      '  <div class="struct-cage-caption"><span>拖动旋转 · 滚轮缩放</span>',
      '    <span>结构外观演示，锚泊布置未核定</span></div>',
      '</div>'
    ].join('\n');
  }

  function mountCageModel(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return { setSpec: function () {}, dispose: function () {} };
    const view = { yaw: 0.65, pitch: 0.42, zoom: 1, depth: 1.85 };
    const reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0, height = 0, raf = 0, previous = 0, dragging = false, lastX = 0, lastY = 0;
    let stillUntil = 0, specKey = '', cy = 1, sy = 0, cp = 1, sp = 0;

    function setSpec(spec) {
      const circumference = validNumber(spec && spec.circumference_m);
      const depth = validNumber(spec && spec.depth_m);
      const key = circumference + ':' + depth;
      if (key === specKey) return;
      specKey = key;
      if (circumference > 0 && depth > 0) {
        const physicalRadius = circumference / (2 * Math.PI);
        view.depth = Math.max(1.2, Math.min(2.5, 2.2 * depth / physicalRadius));
      }
    }
    function resize() {
      width = canvas.clientWidth || 480;
      height = canvas.clientHeight || 320;
      const ratio = Math.min(global.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    function project(p) {
      const x = p[0] * cy - p[2] * sy;
      const z = p[0] * sy + p[2] * cy;
      const y = p[1] + view.depth * 0.5;
      const raised = y * cp - z * sp;
      const forward = y * sp + z * cp;
      const distance = 8.2 / view.zoom - forward;
      const scale = Math.min(width, height) * 2.08 / distance;
      return { x: width * 0.5 + x * scale, y: height * 0.45 - raised * scale, z: distance };
    }
    function trace(points) {
      points.forEach(function (p, i) {
        const q = project(p);
        if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
      });
    }
    function line(points, color, weight) {
      ctx.beginPath(); trace(points); ctx.strokeStyle = color; ctx.lineWidth = weight; ctx.stroke();
    }
    function surface(points, fill) {
      ctx.beginPath(); trace(points); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    }
    function netPoint(angle, fraction) {
      const radius = 2.02 - 0.2 * fraction - 0.045 * Math.sin(Math.PI * fraction);
      return [radius * Math.cos(angle), -0.13 - view.depth * fraction, radius * Math.sin(angle)];
    }
    function drawEnvironment() {
      const backdrop = ctx.createLinearGradient(0, 0, 0, height);
      backdrop.addColorStop(0, '#b9cbd0');
      backdrop.addColorStop(0.42, '#7898a1');
      backdrop.addColorStop(1, '#254657');
      ctx.fillStyle = backdrop; ctx.fillRect(0, 0, width, height);
      const floor = -view.depth - 0.57;
      surface([[-5, floor, -5], [5, floor, -5], [5, floor, 5], [-5, floor, 5]],
              'rgba(19,47,58,.36)');
      for (let d = -4; d <= 4; d += 1) {
        line([[d, floor + 0.01, -4], [d, floor + 0.01, 4]], 'rgba(207,228,226,.13)', 1);
        line([[-4, floor + 0.01, d], [4, floor + 0.01, d]], 'rgba(207,228,226,.13)', 1);
      }
      surface([[-5, 0, -5], [5, 0, -5], [5, 0, 5], [-5, 0, 5]],
              'rgba(175,219,221,.11)');
      for (let d = -4; d <= 4; d += 1) {
        line([[d, 0, -4], [d, 0, 4]], 'rgba(238,248,245,.11)', 1);
        line([[-4, 0, d], [4, 0, d]], 'rgba(238,248,245,.11)', 1);
      }
    }
    function drawMoorings() {
      for (let j = 0; j < 4; j++) {
        const angle = Math.PI * (j * 0.5 + 0.25);
        const start = [2.18 * Math.cos(angle), -0.02, 2.18 * Math.sin(angle)];
        const end = [3.55 * Math.cos(angle), -view.depth - 0.54, 3.55 * Math.sin(angle)];
        line([start, end], 'rgba(22,38,44,.94)', 3);
        line([start, end], 'rgba(210,222,216,.52)', 1);
        const q = project(end);
        ctx.beginPath(); ctx.ellipse(q.x, q.y, 9, 4, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#31484f'; ctx.fill();
      }
    }
    function drawNet() {
      const sections = [];
      for (let j = 0; j < 48; j++) {
        const a = j * Math.PI * 2 / 48, b = (j + 1) * Math.PI * 2 / 48;
        const corners = [netPoint(a, 0), netPoint(b, 0), netPoint(b, 1), netPoint(a, 1)];
        const center = project(netPoint((a + b) / 2, 0.5));
        sections.push({ corners: corners, z: center.z });
      }
      sections.sort(function (a, b) { return b.z - a.z; });
      sections.forEach(function (part) { surface(part.corners, 'rgba(143,195,197,.10)'); });
      for (let j = 0; j < 48; j++) {
        const a = j * Math.PI * 2 / 48, b = (j + 1) * Math.PI * 2 / 48;
        const facing = Math.max(0, Math.sin((a + b) / 2 + view.yaw));
        ctx.strokeStyle = 'rgba(210,235,230,' + (0.21 + facing * 0.35).toFixed(2) + ')';
        ctx.lineWidth = facing > 0.1 ? 0.9 : 0.65;
        ctx.beginPath();
        for (let k = 0; k < 12; k++) {
          const top = k / 12, bottom = (k + 1) / 12;
          const p1 = project(netPoint(a, top)), p2 = project(netPoint(b, top));
          const p3 = project(netPoint(a, bottom)), p4 = project(netPoint(b, bottom));
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p4.x, p4.y);
          ctx.moveTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
        }
        ctx.stroke();
      }
      for (let j = 0; j < 12; j++) {
        const angle = j * Math.PI * 2 / 12, points = [];
        for (let k = 0; k <= 12; k++) points.push(netPoint(angle, k / 12));
        line(points, 'rgba(196,218,211,.47)', 1.4);
      }
      [0, 0.5, 1].forEach(function (fraction) {
        const points = [];
        for (let j = 0; j <= 72; j++) points.push(netPoint(j * Math.PI * 2 / 72, fraction));
        line(points, fraction === 1 ? 'rgba(193,207,198,.82)' : 'rgba(186,213,207,.48)',
             fraction === 1 ? 2 : 1);
      });
    }
    function drawTorus(radius, elevation, tube, pale) {
      const facets = [];
      const ringPoint = function (theta, phi) {
        const outer = radius + tube * Math.cos(phi);
        return [outer * Math.cos(theta), elevation + tube * Math.sin(phi), outer * Math.sin(theta)];
      };
      for (let i = 0; i < 80; i++) {
        const a = i * Math.PI * 2 / 80, b = (i + 1) * Math.PI * 2 / 80;
        for (let j = 0; j < 10; j++) {
          const c = j * Math.PI * 2 / 10, d = (j + 1) * Math.PI * 2 / 10;
          const points = [ringPoint(a, c), ringPoint(b, c), ringPoint(b, d), ringPoint(a, d)];
          const normal = [Math.cos((a + b) / 2) * Math.cos((c + d) / 2),
                          Math.sin((c + d) / 2),
                          Math.sin((a + b) / 2) * Math.cos((c + d) / 2)];
          const lit = Math.max(0, -0.35 * normal[0] + 0.82 * normal[1] + 0.44 * normal[2]);
          const shade = Math.round((pale ? 33 : 21) + lit * (pale ? 36 : 25));
          facets.push({ points: points, z: project(points[0]).z,
                        fill: 'hsl(' + (pale ? 188 : 198) + ',' + (pale ? 16 : 18) + '%,' + shade + '%)' });
        }
      }
      facets.sort(function (a, b) { return b.z - a.z; });
      facets.forEach(function (part) { surface(part.points, part.fill); });
    }
    function draw() {
      if (!width || !height) resize();
      cy = Math.cos(view.yaw); sy = Math.sin(view.yaw);
      cp = Math.cos(view.pitch); sp = Math.sin(view.pitch);
      drawEnvironment();
      drawMoorings();
      drawNet();
      drawTorus(1.82, -0.13 - view.depth, 0.035, false);
      for (let j = 0; j < 12; j++) {
        const angle = j * Math.PI * 2 / 12;
        line([[1.98 * Math.cos(angle), 0.035, 1.98 * Math.sin(angle)],
              [2.16 * Math.cos(angle), 0.035, 2.16 * Math.sin(angle)]],
             'rgba(225,236,230,.65)', 2);
      }
      drawTorus(2.02, 0.05, 0.055, false);
      drawTorus(2.20, 0.05, 0.115, true);
    }
    function frame(now) {
      const elapsed = previous ? Math.min(50, now - previous) : 0;
      previous = now;
      if (!dragging && !reducedMotion && now > stillUntil) view.yaw += elapsed * 0.00012;
      draw();
      raf = global.requestAnimationFrame(frame);
    }
    function onDown(event) {
      dragging = true; lastX = event.clientX; lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    }
    function onMove(event) {
      if (!dragging) return;
      view.yaw += (event.clientX - lastX) * 0.008;
      view.pitch = Math.max(0.12, Math.min(1.05, view.pitch + (event.clientY - lastY) * 0.005));
      lastX = event.clientX; lastY = event.clientY;
      stillUntil = global.performance.now() + 12000;
    }
    function onUp() { dragging = false; }
    function onWheel(event) {
      event.preventDefault();
      view.zoom = Math.max(0.68, Math.min(1.36, view.zoom - event.deltaY * 0.0007));
      stillUntil = global.performance.now() + 12000;
    }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    const observer = global.ResizeObserver ? new global.ResizeObserver(resize) : null;
    if (observer) observer.observe(canvas); else global.addEventListener('resize', resize);
    resize();
    raf = global.requestAnimationFrame(frame);
    return {
      setSpec: setSpec,
      dispose: function () {
        global.cancelAnimationFrame(raf);
        if (observer) observer.disconnect(); else global.removeEventListener('resize', resize);
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        canvas.removeEventListener('wheel', onWheel);
      }
    };
  }

  PAGES['/struct/alarm'] = {
    data: function () { return { minutes: 60, series: [], netHistory: [], envSeries: [], picked: null }; },
    computed: {
      last: function () { return this.series.length ? this.series[this.series.length - 1] : {}; },
      envLast: function () { return this.envSeries.length ? this.envSeries[this.envSeries.length - 1] : {}; },
      netBaseline: function () {
        return netTrialBaseline(this.minutes >= 60 ? this.series : this.netHistory);
      },
      netRuleText: function () {
        const b = this.netBaseline;
        return b ? '网衣试运行线：黄色 ≥ ' + b.warn.toFixed(1) + ' kN，红色 ≥ ' +
          b.alarm.toFixed(1) + ' kN（最近一小时 ' + b.count + ' 个拉力样本）' :
          '网衣试运行线：最近一小时有效拉力样本不足 30 个，暂不计算';
      },
      charts: function () {
        return [
          { name: '锚泊张力占设计值', unit: '%', data: this.series.map(function (r) { return [r.ts, r.tension_pct]; }) },
          { name: '俯仰角', unit: '°', axis: 1, data: this.series.map(function (r) { return [r.ts, r.tilt_pitch]; }) }
        ];
      },
      /* 规则判定：**边沿触发**，不是电平触发。
         ⚠️ 原来写的是「每个采样点只要越限就报一条」——5 秒一个点，一小时报了 1130 条，
            界面上看着像系统坏了；真实告警系统也绝不会这么干。
            现在只在「状态发生变化」时出一条：黄→红 出一条，恢复正常后再越限才再出。 */
      hits: function () {
        const out = [];
        const prev = {};
        const envSeries = this.envSeries;
        const netSeries = this.minutes >= 60 ? this.series : this.netHistory;
        let netBaseline = null;
        let baselineTime = null;
        let envIndex = 0;
        this.series.forEach(function (r) {
          const ts = validNumber(r.ts);
          if (ts !== null && (baselineTime === null || ts - baselineTime >= 60000)) {
            netBaseline = netTrialBaseline(netSeries, ts);
            baselineTime = ts;
          }
          while (envIndex + 1 < envSeries.length &&
                 Math.abs(envSeries[envIndex + 1].ts - r.ts) < Math.abs(envSeries[envIndex].ts - r.ts)) {
            envIndex += 1;
          }
          const env = envSeries[envIndex];
          const combined = !!(env && env.quality === 'good' && Math.abs(env.ts - r.ts) <= 3000 &&
            validNumber(env.wave_height) !== null &&
            tensionPercent(r) !== null &&
            env.wave_height > STRUCT_LIMITS.waveTension && tensionPercent(r) > STRUCT_LIMITS.tensionWarn);
          if (combined && !prev.stormTension) {
            out.push({ ts: r.ts, level: 'orange', type: 'tension', field: '浪高 + 张力占比',
              value: env.wave_height + ' m + ' + tensionPercent(r) + '%', threshold: '浪高 > 3 m 且张力占比 > 80%',
              rule_id: 'R-STORM-TENSION-01', rule_name: '大浪叠加高张力橙色预警',
              why: '浪高超过 3 m 且锚泊张力超过设计值 80%',
              handling_advice: '检查锚链受力，评估海况并按现场规程处置', row: r, envRow: env });
          }
          prev.stormTension = combined;
          const tilt = tiltDegrees(r);
          const tiltWave = !!(env && env.quality === 'good' && Math.abs(env.ts - r.ts) <= 3000 &&
            validNumber(env.wave_height) !== null && tilt !== null &&
            env.wave_height > STRUCT_LIMITS.waveTilt && tilt >= STRUCT_LIMITS.tiltWarn &&
            tilt < STRUCT_LIMITS.tiltAlarm);
          const pct = tensionPercent(r);
          const netState = assessNet(r, netBaseline);
          const damageCn = { normal: '正常', suspected: '疑似破损', confirmed: '已确认破损' };
          const officialRisk = { blue: '蓝色', yellow: '黄色', orange: '橙色', red: '红色' }[r.net_risk_level];
          const netStatus = officialRisk ? officialRisk + '风险' +
            (damageCn[r.damage_suspect_status] ? '／' + damageCn[r.damage_suspect_status] : '') :
            (damageCn[r.damage_suspect_status] || '接口状态');
          const netRed = netState.level === 'red';
          const fams = [
            { fam: 'tension', type: 'tension', field: 'tension_pct', value: pct,
              lv: pct !== null && pct >= STRUCT_LIMITS.tensionAlarm ? 'red' : (pct !== null && pct >= STRUCT_LIMITS.tensionWarn ? 'yellow' : null),
              th: pct !== null && pct >= STRUCT_LIMITS.tensionAlarm ? STRUCT_LIMITS.tensionAlarm : STRUCT_LIMITS.tensionWarn,
              rule: pct !== null && pct >= STRUCT_LIMITS.tensionAlarm
                ? ['R-TENSION-02', '锚泊张力红色预警', '张力超过设计值 95%', '检查系泊系统并按应急规程降低结构受力']
                : ['R-TENSION-01', '锚泊张力黄色预警', '张力超过设计值 80%', '检查锚链受力并持续观察张力变化'] },
            { fam: 'tilt', type: 'tilt', field: 'tilt_angle', value: tilt,
              lv: tilt !== null && tilt >= STRUCT_LIMITS.tiltAlarm ? 'red' :
                (tiltWave ? 'orange' : (tilt !== null && tilt >= STRUCT_LIMITS.tiltWarn ? 'yellow' : null)),
              th: tilt !== null && tilt >= STRUCT_LIMITS.tiltAlarm ? STRUCT_LIMITS.tiltAlarm :
                (tiltWave ? '倾角 ≥ 5° 且浪高 > 1.5 m' : STRUCT_LIMITS.tiltWarn),
              rule: tilt !== null && tilt >= STRUCT_LIMITS.tiltAlarm
                ? ['R-TILT-02', '网箱倾斜红色预警', '横滚或俯仰角达到 15°', '检查网箱姿态和系泊状态，按现场规程处置']
                : tiltWave
                  ? ['R-TILT-01', '大浪叠加倾斜橙色预警', '倾角达到 5° 且浪高超过 1.5 m', '检查网箱姿态和系泊状态，按现场规程处置']
                  : ['R-TILT-01', '网箱倾斜黄色预警', '横滚或俯仰角达到 5°', '持续观察倾角变化并检查传感器'] },
            { fam: 'net', type: 'net_damage',
              field: netState.official ? '网衣状态' : '网绳拉力',
              value: netState.official ? netStatus : netState.measured.toFixed(1) + ' kN',
              lv: netState.level === 'blue' ? null : netState.level,
              th: netState.official ? '接口状态' :
                (netBaseline ? (netRed ? netBaseline.alarm : netBaseline.warn).toFixed(1) + ' kN' : '—'),
              rule: netState.official ?
                ['R-NET-STATUS', '网衣状态预警', '采用接口给出的网衣风险或破损状态', '检查网衣状态并核对传感器与现场情况'] :
                [netRed ? 'R-NET-TRIAL-02' : 'R-NET-TRIAL-01',
                 netRed ? '网衣拉力明显升高（试运行）' : '网衣拉力偏高（试运行）',
                 '网绳拉力超过最近一小时统计基线；仅提示受力异常，不代表破损',
                 '核查网衣拉力传感器与网衣受力；试行阈值需现场标定'] }
          ];
          fams.forEach(function (d) {
            const levelRank = { yellow: 1, orange: 2, red: 3 };
            const oldRank = levelRank[prev[d.fam]] || 0;
            const newRank = levelRank[d.lv] || 0;
            if (!d.lv) prev[d.fam] = null;
            if (d.lv && newRank > oldRank) {
              out.push({ ts: r.ts, level: d.lv, type: d.type, field: d.field,
                         value: d.value, threshold: d.th,
                         rule_id: d.rule[0], rule_name: d.rule[1], why: d.rule[2],
                         handling_advice: d.rule[3] || '检查相关传感器数据并按现场规程处置', row: r,
                         envRow: d.fam === 'tilt' && tiltWave ? env : null });
              prev[d.fam] = d.lv;
            }
          });
        });
        const rank = { red: 3, orange: 2, yellow: 1, blue: 0 };
        return out.sort(function (a, b) { return rank[b.level] - rank[a.level]; });
      },
      worst: function () {
        const result = assessStructure(this.last, this.envLast, this.netBaseline);
        const names = { blue: '蓝色', yellow: '黄色', orange: '橙色', red: '红色' };
        return { level: result.level, text: result.level === null ? '暂无风险数据' :
          result.level === 'blue' ? (result.incomplete ? '已知规则未触发（数据不全）' : '当前无触发预警') :
          names[result.level] + '预警' + (result.incomplete ? '（数据不全）' : '') };
      },
      events: function () {
        const self = this;
        return this.hits.slice(0, 18).map(function (h) {
          return { id: h.rule_id + h.ts, ts: h.ts, level: h.level,
                   text: h.rule_name + '（' + h.field + ' = ' + h.value + '，阈值 ' + h.threshold + '）', hit: h };
        });
      }
    },
    methods: {
      load: function () {
        const self = this;
        API.resolve(API.struct(this.minutes), function (d) { self.series = Array.isArray(d) ? d : []; });
        if (this.minutes < 60) {
          API.resolve(API.struct(60), function (d) { self.netHistory = Array.isArray(d) ? d : []; });
        }
        API.resolve(API.env('site_01', this.minutes), function (d) {
          self.envSeries = d && Array.isArray(d.fast) ? d.fast : [];
        });
      },
      time: function (ts) { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); },
      lvCn: function (l) { return { blue: '蓝色', yellow: '黄色', orange: '橙色', red: '红色' }[l] || l; },
      lvCls: function (l) { return 'bg-' + (l || 'blue'); },
      pick: function (e) { this.picked = e.hit || e; }
    },
    mounted: function () {
      /* API.bind：数据变化重算 + 定时刷新曲线 */
      this.unsub = API.bind(this, this.load);
      this.load();
    },
    beforeUnmount: function () { if (this.unsub) { this.unsub(); this.unsub = null; } },
    watch: { minutes: function () { this.load(); } },
    template: [
      '<div class="struct-page">',
      '  <page-head title="结构安全 · 灾害分级预警"',
      '    desc="融合海况与结构监测数据展示分级事件、触发字段、规则编号、时间和处置建议。"',
      '    />',
      '',
      '  <div class="grid-stats">',
      '    <stat-card name="当前最高预警等级" unit="" :value="worst.text" />',
      '    <stat-card name="本时段告警条数" unit="条" :value="hits.length" :digits="0" />',
      '    <stat-card name="锚泊张力占设计值" field="tension_pct" unit="%" :value="last.tension_pct" />',
      '    <stat-card name="网绳拉力" field="net_tension" unit="kN" :value="last.net_tension" />',
      '    <stat-card name="浪高" field="wave_height" unit="m" :value="envLast.wave_height" :quality="envLast.quality" :ts="envLast.ts" />',
      '    <stat-card name="风速" field="wind_speed" unit="m/s" :value="envLast.wind_speed" :quality="envLast.quality" :ts="envLast.ts" />',
      '    <stat-card name="流速" field="current_speed" unit="m/s" :value="envLast.current_speed" :quality="envLast.quality" :ts="envLast.ts" />',
      '    <stat-card name="网箱横滚角" field="tilt_roll" unit="°" :value="last.tilt_roll" />',
      '    <stat-card name="网箱俯仰角" field="tilt_pitch" unit="°" :value="last.tilt_pitch" />',
      '  </div>',
      '  <div class="small muted" style="margin-top:8px">{{ netRuleText }}。该线按历史数据识别拉力升高，不代表网衣材料极限或破损结论。</div>',
      '',
      '  <div class="split" style="margin-top:12px">',
      '    <trend-chart title="结构张力与姿态趋势" :series="charts"',
      '      :thresholds="[{value:80,label:\'张力黄线 80%\',color:\'#92400E\'},{value:95,label:\'张力红线 95%\',color:\'#991B1B\'}]" />',
      '    <div class="card">',
      '      <div class="card-title">分级预警列表（近 {{ events.length }} 条）</div>',
      '      <div style="max-height:430px;overflow:auto">',
      '        <event-list :items="events" empty-text="本时段无预警" @pick="pick" />',
      '      </div>',
      '      <div v-if="picked" class="hint" style="margin-top:10px">',
      '        <b>{{ picked.rule_name }}</b>',
      '        <span class="tag tag-simulated" style="margin-left:8px">{{ picked.rule_id }}</span>',
      '        <div class="small" style="margin-top:6px">',
      ' {{ picked.field }} = <b>{{ picked.value }}</b>（阈值 {{ picked.threshold }}）<br>',
      '          时间 {{ time(picked.ts) }}<br>',
      '          触发依据：{{ picked.why }}<br>',
      '          快照：<span class="mono">{{ JSON.stringify({anchor_tension: picked.row.anchor_tension, tension_pct: picked.row.tension_pct, tilt_roll: picked.row.tilt_roll, tilt_pitch: picked.row.tilt_pitch, wave_height: picked.envRow ? picked.envRow.wave_height : null, wind_speed: picked.envRow ? picked.envRow.wind_speed : null, current_speed: picked.envRow ? picked.envRow.current_speed : null}) }}</span><br>',
      '          建议：{{ picked.handling_advice }}',
      '        </div>',
      '        <div style="margin-top:8px"><a href="#/mgmt/alarm"><button>查看触发依据（追溯） →</button></a></div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="hint" style="margin-top:12px;background:#FFFBEB;border-color:#FDE68A">',
      '    ⚠️ <b>阈值说明</b>：张力 80% / 95%、倾角 5° / 15° 按当前参数配置展示；',
      '    5° 为自设提示线，15° 参考 CCS 完整稳性衡准角，仍需现场标定。浪高 > 3 m 且张力占比 > 80% 时标记为橙色组合条件。',
      '    网衣试运行阈值取最近一小时网绳拉力中位数，黄色线加上 4 倍稳健波动或中位数的 20%（取较大者）；',
      '    红色线加上 6 倍稳健波动或中位数的 35%（取较大者）。稳健波动 = 1.4826 × 绝对偏差中位数；该经验规则未经现场标定。',
      '    <div style="margin-top:6px">',
      '      <b>告警是边沿触发的</b>：只在状态发生变化时出一条（黄→红 出一条，恢复正常后再越限才再出），',
      '      不是每个采样点都报 —— 否则一小时能刷出上千条，看着像系统坏了。',
      '    </div>',
      '  </div>',
      '',
      '  <div class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <time-range v-model="minutes" />',
      '    <span style="flex:1"></span>',
      '    <a href="#/mgmt/alarm"><button>去追溯查询</button></a>',
      '    <a href="#/mgmt/alarm"><button>去告警中心</button></a>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  PAGES['/struct/overview'] = {
    data: function () { return { minutes: 60, series: [], netHistory: [], cage: null, unsub: null, unsubFarm: null }; },
    computed: {
      last: function () { return this.series.length ? this.series[this.series.length - 1] : {}; },
      netBaseline: function () {
        return netTrialBaseline(this.minutes >= 60 ? this.series : this.netHistory);
      },
      netRuleText: function () {
        const b = this.netBaseline;
        return b ? '网衣试运行线：黄色 ≥ ' + b.warn.toFixed(1) + ' kN，红色 ≥ ' +
          b.alarm.toFixed(1) + ' kN；依据最近一小时 ' + b.count + ' 个网绳拉力样本。' :
          '网衣试运行线：有效历史拉力样本不足 30 个，暂不计算。';
      },
      cageLabel: function () {
        const cage = this.cage, spec = cage && cage.spec;
        if (!spec) return '主养网箱 · 结构参数待加载';
        return (cage.cage_name || '主养网箱') + ' · ' + (spec.shape || '圆形') +
          ' · 周长 ' + (spec.circumference_m ?? '—') + ' m · 网深 ' +
          (spec.depth_m ?? '—') + ' m';
      },
      charts: function () {
        const points = function (field) {
          return this.series.filter(function (r) {
            return r[field] !== null && r[field] !== undefined && Number.isFinite(Number(r[field]));
          }).map(function (r) { return [r.ts, Number(r[field])]; });
        }.bind(this);
        return [
          { name: '锚链张力占设计值', unit: '%', data: points('tension_pct') },
          { name: '网箱倾斜角', unit: '°', axis: 1, data: points('tilt_angle') }
        ];
      },
      assessment: function () { return assessStructure(this.last, null, this.netBaseline); },
      riskText: function () {
        const a = this.assessment;
        if (a.level === null) return '暂无风险数据';
        if (a.level === 'blue') return a.incomplete ? '已知项正常（数据不全）' : '蓝色风险';
        return CN.riskLevel(a.level) + '风险' + (a.incomplete ? '（部分待判定）' : '');
      },
      subsystemItems: function () {
        const a = this.assessment;
        const items = [
          { label: '整体子系统', field: 'risk_level', level: a.level,
            incomplete: a.incomplete },
          { label: '锚泊系统', field: 'tension_status', level: a.tension },
          { label: '网衣系统', field: 'damage_suspect_status', level: a.net,
            trial: a.netState && !a.netState.official && a.netState.trial !== null },
          { label: '姿态系统', field: 'attitude_status', level: a.attitude }
        ];
        return items.map(function (item) {
          const tone = item.level === null ? 'muted' : item.level === 'blue' ? 'green' : item.level;
          const labels = { green: '绿灯', yellow: '黄灯', orange: '橙灯', red: '红灯' };
          const text = tone === 'muted' ? '待判定（缺少数据）' :
            labels[tone] + (item.trial ? '（试运行）' : '') +
            (item.incomplete ? '（数据不全）' : '');
          return { label: item.label, field: item.field, text: text, tone: tone };
        });
      }
    },
    methods: {
      lightColor: function (tone) {
        return { green: '#16A34A', yellow: '#FACC15', orange: '#F97316', red: '#EF4444', muted: '#94A3B8' }[tone] || '#94A3B8';
      },
      syncCageSpec: function () {
        const farm = API.farm();
        const cages = farm && Array.isArray(farm.cages) ? farm.cages : [];
        const cage = cages.find(function (item) { return item.cage_id === 'cage_01'; }) || cages[0];
        if (!cage) return;
        if (this.cage !== cage) this.cage = cage;
        const canvas = this.$refs.cageCanvas;
        if (canvas && canvas.__structViewer) canvas.__structViewer.setSpec(cage.spec);
      },
      load: function () {
        const self = this;
        API.resolve(API.struct(this.minutes), function (d) { self.series = Array.isArray(d) ? d : []; });
        if (this.minutes < 60) {
          API.resolve(API.struct(60), function (d) { self.netHistory = Array.isArray(d) ? d : []; });
        }
      }
    },
    mounted: function () {
      const canvas = this.$refs.cageCanvas;
      if (canvas) canvas.__structViewer = mountCageModel(canvas);
      this.unsub = API.bind(this, this.load);
      const self = this;
      this.unsubFarm = API.subscribe(function () { self.syncCageSpec(); });
      this.syncCageSpec();
      this.load();
    },
    beforeUnmount: function () {
      if (this.unsub) { this.unsub(); this.unsub = null; }
      if (this.unsubFarm) { this.unsubFarm(); this.unsubFarm = null; }
      const canvas = this.$refs.cageCanvas;
      if (canvas && canvas.__structViewer) { canvas.__structViewer.dispose(); canvas.__structViewer = null; }
    },
    watch: { minutes: function () { this.load(); } },
    template: [
      '<div class="struct-page">',
      '  <page-head title="结构安全 · 网箱结构总览"',
      '    desc="汇总锚链、网衣和姿态的代表性状态与趋势；海况数据请查看灾害分级预警页。"',
      '    />',
      '',
      '  <div class="grid-stats">',
      '    <stat-card name="当前风险等级" field="risk_level" unit="" :value="riskText" :ts="last.ts" />',
      '    <stat-card name="锚链张力" field="anchor_tension" unit="kN" :value="last.anchor_tension" :ts="last.ts" />',
      '    <stat-card name="网绳拉力" field="net_tension" unit="kN" :value="last.net_tension" :ts="last.ts" />',
      '    <stat-card name="倾斜角合量" field="tilt_angle" unit="°" :value="last.tilt_angle" :ts="last.ts" />',
      '  </div>',
      '',
      '  <div class="split" style="margin-top:12px">',
      '    <div class="card">',
      '      <div class="card-title">子系统状态灯</div>',
      '      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:10px">',
      '        <div v-for="item in subsystemItems" :key="item.field" style="min-height:116px;padding:12px 8px;border:1px solid var(--line);border-radius:8px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:space-between">',
      '          <div style="font-weight:600">{{ item.label }}</div>',
      '          <span :style="{backgroundColor: lightColor(item.tone)}" style="display:block;width:68px;height:30px;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.16)" :aria-label="item.text"></span>',
      '          <div class="small" :class="{muted:item.tone === \'muted\'}">{{ item.text }}</div>',
      '        </div>',
      '      </div>',
      '    </div>',
      '    <div class="card">',
      '      <div class="card-title">网箱三维模型</div>',
      cageModelMarkup(),
      '    </div>',
      '  </div>',
      '  <div class="small muted" style="margin-top:8px">{{ netRuleText }}仅提示拉力升高，不代表网衣破损或已达到材料强度极限；试行规则未经现场标定。</div>',
      '',
      '  <div style="margin-top:12px">',
      '    <trend-chart title="结构安全关键趋势（张力占比与倾斜角）" :series="charts" />',
      '  </div>',
      '',
      '  <div class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <time-range v-model="minutes" />',
      '    <span style="flex:1"></span>',
      '    <a href="#/struct/detail"><button>查看监测详情</button></a>',
      '    <a href="#/struct/alarm"><button>查看灾害预警</button></a>',
      '  </div>',
      '</div>',
      /* 🔴 视频位（老师意见第 9 条）：结构安全·网箱结构总览 的常驻播放区。
         素材只用开放许可的，**必须标出处** —— 会议纪要第 3 条：
         「全删来源标签」**只对视频开例外**，这块别跟着删。
         走公共组件 <video-slot>（components.js），不各写一份。 */
      '  <video-slot file="struct_cage.webm" title="网箱结构与海上布局" desc="马耳他圣保罗湾海上养殖网箱 —— 网箱结构与布局" license="CC BY-SA 3.0" author="Frank Vincentz" source="https://commons.wikimedia.org/wiki/File:Malta_-_St._Paul%27s_Bay_-_Bay%2BFish_farms_(Keppel)_01_(0)_ies.webm" />',
    ].join('\n')
  };

  // 当前模拟器缺少的高级字段用确定性的页面演示值补位；接口值始终优先。
  function detailDisplayRow(raw, index) {
    raw = raw || {};
    const row = Object.assign({}, raw);
    const demo = [];
    const ts = validNumber(raw.ts);
    const phase = (ts === null ? index * 5000 : ts) / 30000;
    const observedTension = validNumber(raw.net_tension);
    const base = observedTension === null ? 18.3 : observedTension;
    if (!Array.isArray(raw.net_tension_dist) || !raw.net_tension_dist.length) {
      row.net_tension_dist = [0.94, 1.01, 1.06, 0.98, 1.04, 0.96].map(function (factor, i) {
        return +(base * factor + 0.35 * Math.sin(phase + i * 0.8)).toFixed(1);
      });
      demo.push('net_tension_dist');
    }
    if (validNumber(raw.net_area_tension) === null) {
      row.net_area_tension = validNumber(row.net_tension_dist[2]);
      demo.push('net_area_tension');
    }
    if (!Object.prototype.hasOwnProperty.call(raw, 'damage_suspect_pos')) {
      row.damage_suspect_pos = '第 3 区（仅演示）';
      demo.push('damage_suspect_pos');
    } else if (raw.damage_suspect_pos === null || raw.damage_suspect_pos === '') {
      row.damage_suspect_pos = '未发现疑似位置';
    }
    const angle = tiltDegrees(raw);
    const fallback = {
      deformation: 0.052 + 0.009 * Math.sin(phase * 0.7) + (angle === null ? 0 : angle * 0.001),
      displacement_x: 0.028 * Math.sin(phase),
      displacement_y: 0.022 * Math.cos(phase * 0.8),
      displacement_z: 0.015 * Math.sin(phase * 1.1 + 0.5)
    };
    Object.keys(fallback).forEach(function (field) {
      if (validNumber(raw[field]) === null) {
        row[field] = +fallback[field].toFixed(3);
        demo.push(field);
      }
    });
    row._demoFields = demo;
    return row;
  }

  PAGES['/struct/detail'] = {
    data: function () { return { minutes: 60, series: [], demoBaseTs: Date.now(), unsub: null }; },
    computed: {
      last: function () { return this.series.length ? this.series[this.series.length - 1] : {}; },
      displaySeries: function () {
        if (this.series.length) return this.series.map(detailDisplayRow);
        const count = Math.min(240, Math.max(12, Math.floor(this.minutes * 12)));
        const step = this.minutes * 60000 / (count - 1);
        const end = this.demoBaseTs;
        return Array.from({ length: count }, function (_, index) {
          return detailDisplayRow({ ts: Math.round(end - (count - 1 - index) * step) }, index);
        });
      },
      displayLast: function () { return this.displaySeries.length ? this.displaySeries[this.displaySeries.length - 1] : {}; },
      demoFieldsText: function () {
        const names = { net_area_tension: '网衣区域拉力', net_tension_dist: '网衣各区域拉力分布',
          damage_suspect_pos: '破损疑似位置', deformation: '形变量',
          displacement_x: 'X 轴位移', displacement_y: 'Y 轴位移', displacement_z: 'Z 轴位移' };
        return (this.displayLast._demoFields || []).map(function (field) { return names[field]; }).join('、');
      },
      charts: function () {
        const points = function (field) {
          return this.series.filter(function (r) {
            return r[field] !== null && r[field] !== undefined && Number.isFinite(Number(r[field]));
          }).map(function (r) { return [r.ts, Number(r[field])]; });
        }.bind(this);
        return [
          { name: '锚链张力', unit: 'kN', data: points('anchor_tension') }
        ];
      },
      netCharts: function () {
        const points = function (field) {
          return this.series.filter(function (r) {
            return r[field] !== null && r[field] !== undefined && Number.isFinite(Number(r[field]));
          }).map(function (r) { return [r.ts, Number(r[field])]; });
        }.bind(this);
        return [{ name: '网绳拉力', unit: 'kN', data: points('net_tension') }];
      },
      attitudeCharts: function () {
        const points = function (field) {
          return this.series.filter(function (r) {
            return r[field] !== null && r[field] !== undefined && Number.isFinite(Number(r[field]));
          }).map(function (r) { return [r.ts, Number(r[field])]; });
        }.bind(this);
        return [
          { name: '横滚角', unit: '°', data: points('tilt_roll') },
          { name: '俯仰角', unit: '°', data: points('tilt_pitch') }
        ];
      },
      deformationCharts: function () {
        const points = function (field) {
          return this.displaySeries.filter(function (r) {
            return r[field] !== null && r[field] !== undefined && Number.isFinite(Number(r[field]));
          }).map(function (r) { return [r.ts, Number(r[field])]; });
        }.bind(this);
        return [
          { name: '形变量', unit: 'm', data: points('deformation') },
          { name: 'X 轴位移', unit: 'm', data: points('displacement_x') },
          { name: 'Y 轴位移', unit: 'm', data: points('displacement_y') },
          { name: 'Z 轴位移', unit: 'm', data: points('displacement_z') }
        ];
      },
      netRegions: function () {
        const dist = this.displayLast.net_tension_dist;
        if (!Array.isArray(dist)) return [];
        return dist.map(function (value, index) {
          return { label: '第 ' + (index + 1) + ' 区', value: validNumber(value) };
        });
      },
      netScale: function () {
        const values = this.netRegions.map(function (item) { return item.value; })
          .filter(function (value) { return value !== null; });
        return { min: values.length ? Math.min.apply(null, values) : null,
                 max: values.length ? Math.max.apply(null, values) : null };
      },
      netMapWidth: function () { return 104 + Math.max(1, this.netRegions.length) * 92; },
      netMapViewBox: function () { return '0 0 ' + this.netMapWidth + ' 320'; },
      netMapStyle: function () {
        return { minWidth: this.netRegions.length <= 6 ? '100%' : this.netMapWidth + 'px' };
      },
      netBottomPath: function () {
        const right = 52 + Math.max(1, this.netRegions.length) * 92;
        return 'M52 247 Q' + ((52 + right) / 2) + ' 267 ' + right + ' 247';
      },
      netPanels: function () {
        const regions = this.netRegions, scale = this.netScale;
        const count = Math.max(1, regions.length);
        return regions.map(function (item, index) {
          const x = 52 + index * 92, right = x + 92;
          const bottomLeft = 247 + 10 * Math.sin(Math.PI * index / count);
          const bottomRight = 247 + 10 * Math.sin(Math.PI * (index + 1) / count);
          const bottomMid = 247 + 10 * Math.sin(Math.PI * (index + 0.5) / count);
          const value = item.value;
          const ratio = value === null ? null : scale.max === scale.min ? 0.5 :
            (value - scale.min) / (scale.max - scale.min);
          const color = ratio === null ? '#dce2e5' : 'rgb(' +
            Math.round(213 - 190 * ratio) + ',' +
            Math.round(234 - 131 * ratio) + ',' +
            Math.round(238 - 93 * ratio) + ')';
          return { label: item.label, valueText: value === null ? '—' : value.toFixed(1) + ' kN',
            x: x, cx: x + 46, bottomLeft: bottomLeft, color: color,
            path: 'M' + x + ' 78 L' + right + ' 78 L' + right + ' ' + bottomRight +
              ' Q' + (x + 46) + ' ' + bottomMid + ' ' + x + ' ' + bottomLeft + ' Z' };
        });
      },
      acceleration: function () {
        const keys = [
          { key: 'accel_x', label: 'X 轴' },
          { key: 'accel_y', label: 'Y 轴' },
          { key: 'accel_z', label: 'Z 轴' }
        ];
        return keys.map(function (item) {
          const value = this.last[item.key];
          return { label: item.label, field: item.key, value: value === undefined ? null : value };
        }, this);
      }
    },
    methods: {
      sourceFor: function (field) {
        return (this.displayLast._demoFields || []).indexOf(field) >= 0 ? 'demo' : 'simulated';
      },
      load: function () {
        const self = this;
        API.resolve(API.struct(this.minutes), function (d) { self.series = Array.isArray(d) ? d : []; });
      }
    },
    mounted: function () { this.unsub = API.bind(this, this.load); this.load(); },
    beforeUnmount: function () { if (this.unsub) { this.unsub(); this.unsub = null; } },
    watch: { minutes: function () { this.load(); } },
    template: [
      '<div class="struct-page">',
      '  <page-head title="结构安全 · 监测详情"',
      '    desc="分为锚链张力、网衣监测、形变与姿态三个区域；高级字段未接入时展示明确标注的演示数据。"',
      '    />',
      '  <div v-if="demoFieldsText" class="hint" style="margin-bottom:12px;background:#EFF6FF;border-color:#BFDBFE">页面演示数据：{{ demoFieldsText }}。仅用于展示布局与趋势，不代表实测或真实破损；模拟器提供对应字段后自动切换为接口数据。</div>',
      '',
      '  <section class="card">',
      '    <div class="card-title">一、锚链张力监测</div>',
      '    <div class="grid-stats">',
      '      <stat-card name="锚链张力" field="anchor_tension" unit="kN" :value="last.anchor_tension" :ts="last.ts" />',
      '      <stat-card name="张力占设计值" field="tension_pct" unit="%" :value="last.tension_pct" :ts="last.ts" />',
      '    </div>',
      '    <div style="margin-top:10px"><trend-chart title="锚链张力变化趋势" :series="charts" /></div>',
      '    <div class="small muted" style="margin-top:8px">张力占设计值达到 80% / 95% 时，预警页分别标记黄色 / 红色；锚点编号和逐锚点张力尚未由当前接口提供。</div>',
      '  </section>',
      '',
      '  <section class="card" style="margin-top:12px">',
      '    <div class="card-title">二、网衣监测</div>',
      '    <div class="grid-stats">',
      '      <stat-card name="网绳拉力" field="net_tension" unit="kN" :value="last.net_tension" :ts="last.ts" />',
      '      <stat-card name="网衣区域拉力" field="net_area_tension" unit="kN" :value="displayLast.net_area_tension" :ts="displayLast.ts" />',
      '      <stat-card name="破损疑似位置" field="damage_suspect_pos" unit="" :value="displayLast.damage_suspect_pos" :ts="displayLast.ts" />',
      '    </div>',
      '    <div style="margin-top:10px"><trend-chart title="网绳拉力趋势" :series="netCharts" /></div>',
      '    <div class="card" style="margin-top:10px">',
      '      <div class="card-title">网衣各区域拉力分布 · 网衣展开图</div>',
      '      <div v-if="netPanels.length" class="struct-net-map">',
      '        <svg :viewBox="netMapViewBox" :style="netMapStyle" role="img" aria-label="网衣沿周向展开，各区域以颜色深浅表示相对拉力">',
      '          <defs><pattern id="struct-net-weave" width="16" height="16" patternUnits="userSpaceOnUse">',
      '            <path d="M0 0L16 16M16 0L0 16" fill="none" stroke="#214e61" stroke-opacity=".42" stroke-width="1"/>',
      '          </pattern></defs>',
      '          <text x="52" y="49" fill="#365468" font-size="14" font-weight="600">浮圈连接边 · 网衣上缘</text>',
      '          <text :x="netMapWidth - 52" y="49" text-anchor="end" fill="#547284" font-size="12">沿周向展开 →</text>',
      '          <g v-for="panel in netPanels" :key="panel.label">',
      '            <path :d="panel.path" :fill="panel.color" stroke="#edf5f6" stroke-width="1"/>',
      '            <path :d="panel.path" fill="url(#struct-net-weave)"/>',
      '            <line :x1="panel.x" y1="78" :x2="panel.x" :y2="panel.bottomLeft" stroke="#54798b" stroke-width="2"/>',
      '            <rect :x="panel.x + 9" y="142" width="74" height="50" rx="5" fill="#fff" fill-opacity=".86"/>',
      '            <text :x="panel.cx" y="160" text-anchor="middle" fill="#25445a" font-size="12" font-weight="600">{{ panel.label }}</text>',
      '            <text :x="panel.cx" y="179" text-anchor="middle" fill="#183d54" font-size="12">{{ panel.valueText }}</text>',
      '          </g>',
      '          <rect x="52" y="69" :width="netMapWidth - 104" height="10" rx="5" fill="#365d70"/>',
      '          <path :d="netBottomPath" fill="none" stroke="#2f566a" stroke-width="8" stroke-linecap="round"/>',
      '          <text x="52" y="290" fill="#365468" font-size="13">网衣下缘 · 配重绳</text>',
      '        </svg>',
      '      </div>',
      '      <div v-else class="muted">暂无区域拉力数据</div>',
      '      <div v-if="netScale.min !== null" class="struct-net-scale">',
      '        <span>相对较低 {{ netScale.min.toFixed(1) }} kN</span>',
      '        <span class="struct-net-scale-bar" aria-hidden="true"></span>',
      '        <span>相对较高 {{ netScale.max.toFixed(1) }} kN</span>',
      '      </div>',
      '      <div class="small muted" style="margin-top:7px">色深仅表示当前各区拉力的相对大小，不代表预警等级；分区位置暂按接口数组顺序示意，真实方位仍需模拟器提供区域编号对照。</div>',
      '    </div>',
      '  </section>',
      '',
      '  <section class="card" style="margin-top:12px">',
      '    <div class="card-title">三、结构形变与姿态监测</div>',
      '    <div class="grid-stats">',
      '      <stat-card name="横滚角" field="tilt_roll" unit="°" :value="last.tilt_roll" :ts="last.ts" />',
      '      <stat-card name="俯仰角" field="tilt_pitch" unit="°" :value="last.tilt_pitch" :ts="last.ts" />',
      '      <stat-card name="倾斜角合量" field="tilt_angle" unit="°" :value="last.tilt_angle" :ts="last.ts" />',
      '      <stat-card name="形变量" field="deformation" unit="m" :digits="3" :value="displayLast.deformation" :ts="displayLast.ts" />',
      '      <stat-card name="X 轴位移" field="displacement_x" unit="m" :digits="3" :value="displayLast.displacement_x" :ts="displayLast.ts" />',
      '      <stat-card name="Y 轴位移" field="displacement_y" unit="m" :digits="3" :value="displayLast.displacement_y" :ts="displayLast.ts" />',
      '      <stat-card name="Z 轴位移" field="displacement_z" unit="m" :digits="3" :value="displayLast.displacement_z" :ts="displayLast.ts" />',
      '    </div>',
      '    <div class="split" style="margin-top:10px">',
      '      <trend-chart title="横滚与俯仰趋势" :series="attitudeCharts" />',
      '      <trend-chart title="空间位移与形变趋势" :series="deformationCharts" />',
      '    </div>',
      '    <div class="card" style="margin-top:10px">',
      '      <div class="card-title">三轴加速度</div>',
      '      <div v-for="item in acceleration" :key="item.field" class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)">',
      '        <span>{{ item.label }}（{{ item.field }}）</span>',
      '        <b>{{ item.value === null ? \'—\' : item.value }}<span v-if="item.value !== null"> m/s²</span></b>',
      '      </div>',
      '    </div>',
      '  </section>',
      '',
      '  <div class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <time-range v-model="minutes" />',
      '    <span style="flex:1"></span>',
      '    <a href="#/struct/overview"><button>返回结构总览</button></a>',
      '    <a href="#/struct/alarm"><button>查看预警</button></a>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  // 规则页只展示当前判定口径；阈值修改和持久化仍由参数配置负责。
  PAGES['/struct/rules'] = {
    data: function () { return { tick: 0, unsub: null }; },
    computed: {
      fishRules: function () {
        this.tick;
        const farm = API.farm();
        const catalog = API.speciesTemp();
        const cages = farm && Array.isArray(farm.cages) ? farm.cages : [];
        const species = catalog && Array.isArray(catalog.species) ? catalog.species : [];
        return cages.map(function (cage) {
          const entry = species.find(function (item) { return item.species_cn === cage.species; });
          return {
            cage: cage.cage_name || cage.cage_id || '未命名网箱',
            species: cage.species || '鱼种未配置',
            warn: entry ? validNumber(entry.temp_warn_high) : null,
            alarm: entry ? validNumber(entry.temp_alarm_high) : null
          };
        });
      },
      rows: function () {
        const rows = [
          { id: 'R-TENSION-01', name: '锚泊张力提示', condition: '张力占设计值 ≥ 80%', level: '黄色', source: 'tension_pct；缺失时由锚链张力 / 设计张力计算', basis: '80% 为运营提示线，需现场标定' },
          { id: 'R-TENSION-02', name: '锚泊张力告警', condition: '张力占设计值 ≥ 95%', level: '红色', source: 'tension_pct；缺失时由锚链张力 / 设计张力计算', basis: '参考设计张力安全系数，运营线需现场确认' },
          { id: 'R-TILT-01', name: '网箱倾斜提示', condition: '横滚或俯仰绝对值 ≥ 5°；同时浪高 > 1.5 m 升为橙色', level: '黄色／橙色', source: 'tilt_angle 或 tilt_roll、tilt_pitch；wave_height', basis: '5° 为自设提示线；组合条件为演示规则' },
          { id: 'R-TILT-02', name: '网箱倾斜告警', condition: '横滚或俯仰绝对值 ≥ 15°', level: '红色', source: 'tilt_angle 或 tilt_roll、tilt_pitch', basis: '15° 参考 CCS 完整稳性衡准角，实际运营线仍需标定' },
          { id: 'R-STORM-TENSION-01', name: '大浪叠加高张力', condition: '浪高 > 3 m 且张力占设计值 > 80%', level: '橙色', source: 'wave_height + tension_pct', basis: '组合条件为演示规则，需现场确认' },
          { id: 'R-NET-TRIAL-01', name: '网衣拉力偏高（试运行）', condition: '拉力 ≥ 最近一小时中位数 + max(4 × 稳健波动，中位数 × 20%)', level: '黄色', source: 'net_tension', basis: '稳健波动 = 1.4826 × 绝对偏差中位数；至少 30 个样本；未经现场标定，只提示相对升高' },
          { id: 'R-NET-TRIAL-02', name: '网衣拉力明显升高（试运行）', condition: '拉力 ≥ 最近一小时中位数 + max(6 × 稳健波动，中位数 × 35%)', level: '红色', source: 'net_tension', basis: '经验试运行线，未经现场标定；不等于网衣破损或达到材料极限' },
          { id: 'R-NET-STATUS', name: '正式网衣状态', condition: '接口提供网衣风险等级或破损状态时优先采用', level: '随接口等级', source: 'net_risk_level／damage_suspect_status', basis: '正式字段优先于试运行线；如无足够样本或正式状态，保持待判定' }
        ];
        this.fishRules.forEach(function (fish) {
          rows.push({ id: 'R-TEMP-01', name: fish.cage + ' · ' + fish.species + '水温提示',
            condition: fish.warn === null ? '暂无阈值' : '水温 ≥ ' + fish.warn + ' ℃',
            level: '黄色', source: 'water_temp + 鱼种温度参数库', basis: '按该网箱鱼种取值；环境板块负责实际水温预警' });
          rows.push({ id: 'R-TEMP-02', name: fish.cage + ' · ' + fish.species + '水温告警',
            condition: fish.alarm === null ? '暂无阈值' : '水温 ≥ ' + fish.alarm + ' ℃',
            level: '红色', source: 'water_temp + 鱼种温度参数库', basis: '按该网箱鱼种取值；环境板块负责实际水温预警' });
        });
        return rows;
      }
    },
    mounted: function () {
      const self = this;
      this.unsub = API.subscribe(function () { self.tick += 1; });
    },
    beforeUnmount: function () { if (this.unsub) { this.unsub(); this.unsub = null; } },
    template: [
      '<div class="struct-page">',
      '  <page-head title="结构安全 · 规则配置" desc="查看当前结构风险判断规则及其依据。下表为只读说明；阈值已在下方「阈值配置（结构安全）」里列全（原「参数配置」页已按老师意见拆解）。" />',
      '  <div class="hint" style="margin-bottom:12px">网衣目前按最近一小时真实拉力建立试运行线，正式风险或破损状态字段优先；试运行线只表示拉力相对升高，不证明网衣破损。样本不足时仍显示“待判定”。储能低电量规则保留在能源保障页，不参与结构总览和灾害预警的风险等级。</div>',
      '  <div class="card">',
      '    <div class="card-title">当前判断规则</div>',
      '    <div class="dt-wrap">',
      '      <table class="dt">',
      '        <thead><tr><th>编号</th><th>规则</th><th>触发条件</th><th>等级</th><th>取数字段</th><th>依据与说明</th></tr></thead>',
      '        <tbody>',
      '          <tr v-for="(r, i) in rows" :key="r.id + i">',
      '            <td class="mono">{{ r.id }}</td><td>{{ r.name }}</td><td>{{ r.condition }}</td>',
      '            <td>{{ r.level }}</td><td class="small">{{ r.source }}</td><td class="small">{{ r.basis }}</td>',
      '          </tr>',
      '        </tbody>',
      '      </table>',
      '    </div>',
      '  </div>',
      '  <div v-if="!fishRules.length" class="hint" style="margin-top:12px">鱼种配置尚未加载，水温规则暂不展示。</div>',
      '</div>',
      '  <threshold-table owner="结构安全" />',
      /* 🔴 2026-10-15 队长加：结构安全的阈值（锚泊张力 / 网箱倾斜）—— 从「参数配置」按 owner 拆回来。
         数据在 components.js 的 C.THRESHOLDS（单一事实来源），
         本页只按 owner 过滤显示自己那几条。 */
    ].join('\n')
  };

})(window);
