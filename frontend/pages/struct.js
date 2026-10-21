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
      '.struct-overview-grid{grid-template-columns:repeat(2,minmax(0,1fr));}',
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
      '.struct-cage-switch{display:flex;align-items:center;flex-wrap:wrap;gap:8px;',
      'padding:10px 12px;margin:0 0 12px;border:1px solid var(--line);border-radius:8px;background:#f5f9fb;}',
      '.struct-cage-switch .struct-switch-label{margin-right:8px;font-weight:600;color:#25475a;}',
      '@media(max-width:760px){.struct-overview-grid{grid-template-columns:minmax(0,1fr)}}',
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
  function stormDemoActive() {
    try { return global.sessionStorage.getItem('struct-storm-demo') === '1'; }
    catch (e) { return false; }
  }
  function setStormDemo(active) {
    try { global.sessionStorage.setItem('struct-storm-demo', active ? '1' : '0'); }
    catch (e) { /* 无会话存储时仅当前页面保持状态 */ }
  }
  function selectedCageId() {
    if (global.CurrentCage && global.CurrentCage.get) return global.CurrentCage.get();
    try { return global.sessionStorage.getItem('struct-cage-id') === 'cage_02' ? 'cage_02' : 'cage_01'; }
    catch (e) { return 'cage_01'; }
  }
  function selectCage(id) {
    if (id !== 'cage_01' && id !== 'cage_02' || this.cageId === id) return;
    this.cageId = id;
    if (global.CurrentCage && global.CurrentCage.set) global.CurrentCage.set(id);
    try { global.sessionStorage.setItem('struct-cage-id', id); } catch (e) { /* 当前页面仍可切换 */ }
    if (this.series) this.series = [];
    if (this.netHistory) this.netHistory = [];
    if (this.envSeries) this.envSeries = [];
    if (this.picked) this.picked = null;
    if (this.syncCageSpec) this.syncCageSpec();
    if (this.load) this.load();
  }
  function bindCurrentCage(page) {
    const current = global.CurrentCage;
    if (!current || !current.subscribe) return;
    page.unsubCage = current.subscribe(function (id) { selectCage.call(page, id); });
    selectCage.call(page, current.get());
  }
  function unbindCurrentCage(page) {
    if (page.unsubCage) { page.unsubCage(); page.unsubCage = null; }
    if (Number.isFinite(page.requestId)) page.requestId++;
  }
  function cageSiteLabel() {
    this.tick;
    const farm = (global.API && global.API.farm && global.API.farm()) || {};
    const cage = (farm.cages || []).find(function (item) { return item.cage_id === this.cageId; }, this);
    const site = cage && (farm.sites || []).find(function (item) { return item.site_id === cage.site_id; });
    return (cage && cage.site_name) || (site && site.site_name) || '海域待配置';
  }
  function cageEnvironment(page, storm) {
    if (storm) return API.env('site_01', page.minutes, { storm: true });
    const farm = API.farm() || {};
    const cage = (farm.cages || []).find(function (item) { return item.cage_id === page.cageId; });
    const current = global.CurrentCage;
    const site = (cage && cage.site_id) || (current && current.get() === page.cageId && current.site && current.site());
    return site ? API.env(site, page.minutes, { storm: false }) : { fast: [] };
  }
  function cageSwitchMarkup() {
    return '<div class="struct-cage-switch" role="group" aria-label="养殖网箱切换">' +
      /* 🔴 2026-10-20 队长修：这里原来写死「模拟养殖站点」。
       但 10-16 会上定 site_01 已改名「仿真演示站点」，两个养殖网箱也迁到了
       site_04 嵊山 / site_03 小麦岛 —— 页面还显示旧名，和「生产管理·网箱与站点」
       以及顶栏切换器对不上。改成显示该网箱的**实际所在海域**。 */
'<span class="struct-switch-label">{{ cageSiteLabel }} · 当前网箱</span>' +
      '<button type="button" :class="{primary:cageId === \'cage_01\'}" :aria-pressed="cageId === \'cage_01\'" @click="selectCage(\'cage_01\')">1 号网箱</button>' +
      '<button type="button" :class="{primary:cageId === \'cage_02\'}" :aria-pressed="cageId === \'cage_02\'" @click="selectCage(\'cage_02\')">2 号网箱</button>' +
      '<span class="small muted">当前网箱所在海域海况，结构数据分别展示</span></div>';
  }
  // 以下数组是逐测点的前端接入格式；只有数组存在时才计算已上报测点的最大值。
  // mooring_lines: [{chain_id, anchor_id, anchor_tension, design_tension}]
  // net_areas: [{net_area_id, net_rope_id, net_area_tension, allowable_tension}]
  function mooringLines(row) {
    return row && Array.isArray(row.mooring_lines) ? row.mooring_lines.map(function (line, index) {
      line = line || {};
      const tension = (!row.quality || row.quality === 'good') &&
        (!line.quality || line.quality === 'good') ? validNumber(line.anchor_tension) : null;
      const design = validNumber(line.design_tension);
      return { label: '系泊线 ' + (index + 1), chainId: line.chain_id || null,
        anchorId: line.anchor_id || null, tension: tension, design: design,
        pct: tension !== null && design !== null && design > 0 ? tension / design * 100 : null,
        demo: false };
    }) : [];
  }
  function maxLineUtilization(row) {
    const known = mooringLines(row).filter(function (line) { return line.pct !== null; });
    return known.length ? known.reduce(function (max, line) {
      return !max || line.pct > max.pct ? line : max;
    }, null) : null;
  }
  function maxLineTension(row) {
    const known = mooringLines(row).filter(function (line) { return line.tension !== null; });
    return known.length ? Math.max.apply(null, known.map(function (line) { return line.tension; })) : null;
  }
  function displayMooringLines(row) {
    const reported = mooringLines(row);
    if (reported.length) return reported;
    const base = validNumber(row && row.anchor_tension);
    // 仅用于让四角概念图展示负荷不均；不参与风险计算，也不假定旧值为平均或最大值。
    const factors = [0.92, 1.08, 0.81, 0.98];
    return factors.map(function (factor, index) {
      return { label: '示意系泊线 ' + (index + 1), chainId: null, anchorId: null,
        tension: base === null ? null : +(base * factor).toFixed(1),
        design: null, pct: null, demo: true };
    });
  }
  function netAreas(row) {
    if (row && row.quality && row.quality !== 'good') return [];
    if (row && Array.isArray(row.net_areas) && row.net_areas.length) {
      return row.net_areas.map(function (area, index) {
        area = area || {};
        const value = (!row.quality || row.quality === 'good') &&
          (!area.quality || area.quality === 'good') ? validNumber(area.net_area_tension) : null;
        const allowable = validNumber(area.allowable_tension);
        return { label: area.net_area_id || '第 ' + (index + 1) + ' 区',
          ropeId: area.net_rope_id || null, zone: area.net_zone || null,
          value: value, allowable: allowable,
          pct: value !== null && allowable !== null && allowable > 0 ? value / allowable * 100 : null };
      });
    }
    if (row && Array.isArray(row.net_tension_dist) && row.net_tension_dist.length) {
      const ids = Array.isArray(row.net_area_ids) && row.net_area_ids.length === row.net_tension_dist.length ?
        row.net_area_ids : [];
      return row.net_tension_dist.map(function (value, index) {
        return { label: ids[index] || '第 ' + (index + 1) + ' 区', ropeId: null,
          value: validNumber(value), allowable: null, pct: null };
      });
    }
    if (row && row.net_area_id && validNumber(row.net_area_tension) !== null) {
      return [{ label: row.net_area_id, ropeId: row.net_rope_id || null,
        value: validNumber(row.net_area_tension), allowable: null, pct: null }];
    }
    return [];
  }
  function sensorCoverage(row) {
    const lines = mooringLines(row);
    const areas = netAreas(row);
    const lineExpected = validNumber(row && row.mooring_expected_count);
    const areaExpected = validNumber(row && row.net_expected_count);
    const lineValid = lines.filter(function (line) {
      return line.chainId && line.tension !== null && line.pct !== null;
    }).length;
    const areaValid = areas.filter(function (area) {
      return area.label && area.value !== null;
    }).length;
    const lineIds = lines.map(function (line) { return line.chainId; });
    const areaIds = areas.map(function (area) { return area.label; });
    return { lineValid: lineValid, areaValid: areaValid,
      lineExpected: lineExpected, areaExpected: areaExpected,
      linesComplete: lineExpected > 0 && lineValid === lineExpected &&
        lines.length === lineExpected && new Set(lineIds).size === lineExpected,
      areasComplete: areaExpected > 0 && areaValid === areaExpected &&
        areas.length === areaExpected && new Set(areaIds).size === areaExpected };
  }
  function coverageText(row) {
    const c = sensorCoverage(row);
    const areas = netAreas(row);
    if (!c.lineExpected && !c.areaExpected && !c.lineValid && !c.areaValid) {
      return '接口尚无逐链和分区测点，仅有单值时不能判断整体覆盖情况。';
    }
    const lineText = c.lineExpected ? c.lineValid + '/' + c.lineExpected : c.lineValid + ' 条（目标数未配置）';
    const areaText = c.areaExpected ? c.areaValid + '/' + c.areaExpected : c.areaValid + ' 区（目标数未配置）';
    return '有效测点：锚泊 ' + lineText + '，网衣 ' + areaText + '。' +
      (c.linesComplete && c.areasComplete ? '当前配置的测点已全部上报。' : '缺失或未配置的测点不参与判断。') +
      (row && row.source === 'simulated' ? '数据由模拟器生成，真实布置和允许值仍需现场核对。' : '') +
      (areas.length && areas.every(function (area) { return area.allowable === null; }) ?
        '网衣设计允许值尚未接入，不能判断承载裕度。' : '') +
      (row && row.sim_scenario === 'storm' ? '当前为大风大浪演示场景。' : '');
  }
  function maxNetArea(row) {
    const known = netAreas(row).filter(function (area) { return area.value !== null; });
    return known.length ? known.reduce(function (max, area) {
      return !max || area.value > max.value ? area : max;
    }, null) : null;
  }
  function netTrialValue(row) {
    if (row && row.quality && row.quality !== 'good') return null;
    if (row && ((Array.isArray(row.net_areas) && row.net_areas.length) ||
      (Array.isArray(row.net_tension_dist) && row.net_tension_dist.length) ||
      (row.net_area_id && validNumber(row.net_area_tension) !== null))) {
      const highest = maxNetArea(row);
      return highest ? highest.value : null;
    }
    return validNumber(row && row.net_tension);
  }
  function anchorDisplayValue(row) {
    if (row && row.quality && row.quality !== 'good') return null;
    return row && Array.isArray(row.mooring_lines) && row.mooring_lines.length ?
      maxLineTension(row) : validNumber(row && row.anchor_tension);
  }
  function netDisplayValue(row) {
    return netTrialValue(row);
  }
  function anchorDisplayLabel(row) {
    return row && Array.isArray(row.mooring_lines) && row.mooring_lines.length ?
      '已上报逐链最高张力' : '上报锚泊张力';
  }
  function netDisplayLabel(row) {
    return row && ((Array.isArray(row.net_areas) && row.net_areas.length) ||
      (Array.isArray(row.net_tension_dist) && row.net_tension_dist.length) ||
      (row.net_area_id && validNumber(row.net_area_tension) !== null)) ?
      '已上报分区最高拉力' : '上报网绳拉力';
  }
  function tensionPercent(row) {
    if (row && row.quality && row.quality !== 'good') return null;
    if (row && Array.isArray(row.mooring_lines) && row.mooring_lines.length) {
      const highest = maxLineUtilization(row);
      return highest ? highest.pct : null;
    }
    const reported = validNumber(row.tension_pct);
    if (reported !== null) return reported;
    const tension = validNumber(row.anchor_tension);
    const design = validNumber(row.design_tension);
    return tension !== null && design !== null && design > 0 ? tension / design * 100 : null;
  }
  function tiltDegrees(row) {
    if (row && row.quality && row.quality !== 'good') return null;
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
        netTrialValue(row) !== null && netTrialValue(row) >= 0;
    }).map(function (row) { return netTrialValue(row); });
    if (values.length < NET_TRIAL.minSamples) return null;
    const center = median(values);
    if (center <= 0) return null;
    const spread = 1.4826 * median(values.map(function (value) { return Math.abs(value - center); }));
    return { center: center, spread: spread, count: values.length,
      warn: center + Math.max(NET_TRIAL.warnSigma * spread, NET_TRIAL.warnRatio * center),
      alarm: center + Math.max(NET_TRIAL.alarmSigma * spread, NET_TRIAL.alarmRatio * center) };
  }
  function assessNet(row, baseline) {
    const measured = netTrialValue(row);
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
    const coverage = sensorCoverage(row);
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
             incomplete: known.length < 3 || !coverage.linesComplete || !coverage.areasComplete,
             coverage: coverage, pct: pct, tilt: tilt, netState: netState };
  }

  // 桁架式网箱概念模型：钢管桁架、内侧分片网衣、底网与系泊线。
  // 几何比例仅用于结构说明；现场尺寸、杆件规格和锚位须由设计资料确认。
  const TRUSS_MODEL_INFO = {
    level: '间接支持',
    text: '参考半潜式桁架网箱的长条形主体、浮力立柱与四角锚泊实例，以及公开专利中的工作通道、护栏和网衣纲绳连接方式，缩简为一个养殖空间。立柱数量、杆件比例、系泊位置均为示意，不代表任何具体网箱的施工图。',
    source: '广东海威农业集团「海威2号」产品介绍；公开专利 CN112806290A「适用于深远海的大型漂浮式钢结构智能化渔业养殖网箱」；南方水产科学《船型桁架结构网箱单点系泊受力试验研究》',
    url: 'https://m.havwii.com/hw2h.html'
  };
  const MOORING_MODEL_INFO = {
    level: '仅类比',
    text: '海威2号公开资料说明采用四角锚泊。海上网箱系泊研究中存在锚链形成悬链线、接近海床后铺底的布置。本图把两项资料合成四角悬链线示意，用于看清导缆点、悬垂段、着地点和海底锚的关系；不是海威2号的实际链型、链长或锚位。',
    source: '广东海威农业集团「海威2号」产品介绍；Ocean Engineering, Fish cage and mooring system dynamics using physical and numerical models with field measurements (2003)',
    url: 'https://www.sciencedirect.com/science/article/abs/pii/S0144860902000432'
  };
  function cageModelMarkup() {
    return [
      '<div class="struct-cage-scene">',
      '  <canvas ref="cageCanvas" aria-label="可拖动旋转的桁架式网箱三维结构模型"></canvas>',
      '  <div class="struct-cage-overlay">{{ cageLabel }}</div>',
      '  <div v-if="!mooringView" class="struct-cage-caption"><span>拖动旋转 · 滚轮缩放</span>',
      '    <span>结构概念示意 · 不按现场尺寸与锚位绘制</span></div>',
      '</div>',
      '<div class="small muted" style="margin-top:8px">钢桁架 · 工作通道与护栏 · 浮力立柱 · 四面侧网与底网 · 系泊示意</div>'
    ].join('\n');
  }

  PAGES['/struct/alarm'] = {
    data: function () { return { tick: 0, minutes: 60, series: [], netHistory: [], envSeries: [],
      stormDemo: stormDemoActive(), picked: null, cageId: selectedCageId(), requestId: 0 }; },
    computed: {
      cageSiteLabel: cageSiteLabel,
      last: function () { return this.series.length ? this.series[this.series.length - 1] : {}; },
      envLast: function () { return this.envSeries.length ? this.envSeries[this.envSeries.length - 1] : {}; },
      netValue: function () { return netDisplayValue(this.last); },
      netLabel: function () { return netDisplayLabel(this.last); },
      currentTensionPct: function () { return tensionPercent(this.last); },
      tensionLabel: function () {
        return mooringLines(this.last).length ? '已上报逐链最高利用率' : '上报张力占设计值';
      },
      coverageNote: function () {
        return coverageText(this.last);
      },
      netBaseline: function () {
        return netTrialBaseline(this.minutes >= 60 ? this.series : this.netHistory);
      },
      netRuleText: function () {
        const b = this.netBaseline;
        return b ? '网衣试运行线：黄色 ≥ ' + b.warn.toFixed(1) + ' kN，红色 ≥ ' +
          b.alarm.toFixed(1) + ' kN（最近一小时 ' + b.count + ' 个已上报拉力样本）' :
          '网衣试运行线：最近一小时有效拉力样本不足 30 个，暂不计算';
      },
      charts: function () {
        return [
          { name: '已上报张力利用率', unit: '%', data: this.series.map(function (r) { return [r.ts, tensionPercent(r)]; }) },
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
          const highestLine = maxLineUtilization(r);
          const highestArea = maxNetArea(r);
          const lineName = highestLine && (highestLine.chainId || highestLine.label) || '上报测点';
          const areaName = highestArea && highestArea.label || '上报区域';
          const pct = tensionPercent(r);
          const pctShown = pct === null ? null : +pct.toFixed(1);
          const snapshot = {
            '数据来源': r.source === 'simulated' ? '设备模拟器' : '接口上报',
            '演示场景': r.sim_scenario === 'storm' ? '大风大浪' : '平常',
            '锚链编号': highestLine && highestLine.chainId || null,
            '锚链张力（kN）': highestLine ? highestLine.tension : null,
            '设计允许值（kN）': highestLine ? highestLine.design : null,
            '最高利用率（%）': pctShown,
            '网衣分区': highestArea && highestArea.label || null,
            '分区拉力（kN）': highestArea ? highestArea.value : null,
            '横滚角（°）': r.tilt_roll,
            '俯仰角（°）': r.tilt_pitch,
            '浪高（m）': env && env.quality === 'good' ? env.wave_height : null
          };
          const combined = !!(env && env.quality === 'good' && Math.abs(env.ts - r.ts) <= 3000 &&
            validNumber(env.wave_height) !== null &&
            pct !== null &&
            env.wave_height > STRUCT_LIMITS.waveTension && pct > STRUCT_LIMITS.tensionWarn);
          if (combined && !prev.stormTension) {
            out.push({ ts: r.ts, level: 'orange', type: 'tension', field: '浪高 + ' + lineName + ' 张力占比',
              value: env.wave_height + ' m + ' + pctShown + '%', threshold: '浪高 > 3 m 且张力占比 > 80%',
              rule_id: 'R-STORM-TENSION-01', rule_name: '大浪叠加高张力橙色预警',
              why: '浪高超过 3 m，且' + lineName + '张力利用率超过 80%',
              handling_advice: '检查锚链受力，评估海况并按现场规程处置', row: r, envRow: env,
              snapshot: snapshot });
          }
          prev.stormTension = combined;
          const tilt = tiltDegrees(r);
          const tiltWave = !!(env && env.quality === 'good' && Math.abs(env.ts - r.ts) <= 3000 &&
            validNumber(env.wave_height) !== null && tilt !== null &&
            env.wave_height > STRUCT_LIMITS.waveTilt && tilt >= STRUCT_LIMITS.tiltWarn &&
            tilt < STRUCT_LIMITS.tiltAlarm);
          const netState = assessNet(r, netBaseline);
          const damageCn = { normal: '正常', suspected: '疑似破损', confirmed: '已确认破损' };
          const officialRisk = { blue: '蓝色', yellow: '黄色', orange: '橙色', red: '红色' }[r.net_risk_level];
          const netStatus = officialRisk ? officialRisk + '风险' +
            (damageCn[r.damage_suspect_status] ? '／' + damageCn[r.damage_suspect_status] : '') :
            (damageCn[r.damage_suspect_status] || '接口状态');
          const netRed = netState.level === 'red';
          const fams = [
            { fam: 'tension', type: 'tension', field: lineName + ' 张力利用率',
              value: pctShown === null ? '—' : pctShown + '%',
              lv: pct !== null && pct >= STRUCT_LIMITS.tensionAlarm ? 'red' : (pct !== null && pct >= STRUCT_LIMITS.tensionWarn ? 'yellow' : null),
              th: pct !== null && pct >= STRUCT_LIMITS.tensionAlarm ? '95%' : '80%',
              rule: pct !== null && pct >= STRUCT_LIMITS.tensionAlarm
                ? ['R-TENSION-02', '锚泊张力红色预警', lineName + '张力利用率达到 95%', '检查系泊系统并按应急规程降低结构受力']
                : ['R-TENSION-01', '锚泊张力黄色预警', lineName + '张力利用率达到 80%', '检查锚链受力并持续观察张力变化'] },
            { fam: 'tilt', type: 'tilt', field: '倾斜角合量',
              value: tilt === null ? '—' : tilt.toFixed(1) + '°',
              lv: tilt !== null && tilt >= STRUCT_LIMITS.tiltAlarm ? 'red' :
                (tiltWave ? 'orange' : (tilt !== null && tilt >= STRUCT_LIMITS.tiltWarn ? 'yellow' : null)),
              th: tilt !== null && tilt >= STRUCT_LIMITS.tiltAlarm ? '15°' :
                (tiltWave ? '倾角 ≥ 5° 且浪高 > 1.5 m' : '5°'),
              rule: tilt !== null && tilt >= STRUCT_LIMITS.tiltAlarm
                ? ['R-TILT-02', '网箱倾斜红色预警', '横滚或俯仰角达到 15°', '检查网箱姿态和系泊状态，按现场规程处置']
                : tiltWave
                  ? ['R-TILT-01', '大浪叠加倾斜橙色预警', '倾角达到 5° 且浪高超过 1.5 m', '检查网箱姿态和系泊状态，按现场规程处置']
                  : ['R-TILT-01', '网箱倾斜黄色预警', '横滚或俯仰角达到 5°', '持续观察倾角变化并检查传感器'] },
            { fam: 'net', type: 'net_damage',
              field: netState.official ? '网衣状态' : areaName + ' 拉力',
              value: netState.official ? netStatus :
                (netState.measured === null ? '—' : netState.measured.toFixed(1) + ' kN'),
              lv: netState.level === 'blue' ? null : netState.level,
              th: netState.official ? '接口状态' :
                (netBaseline ? (netRed ? netBaseline.alarm : netBaseline.warn).toFixed(1) + ' kN' : '—'),
              rule: netState.official ?
                ['R-NET-STATUS', '网衣状态预警', '采用接口给出的网衣风险或破损状态', '检查网衣状态并核对传感器与现场情况'] :
                [netRed ? 'R-NET-TRIAL-02' : 'R-NET-TRIAL-01',
                 netRed ? '网衣拉力明显升高（试运行）' : '网衣拉力偏高（试运行）',
                 areaName + '拉力超过最近一小时统计基线；仅提示受力异常，不代表破损',
                 '核查网衣拉力传感器与网衣受力；试行阈值需现场标定'] }
          ];
          fams.forEach(function (d) {
            const levelRank = { yellow: 1, orange: 2, red: 3 };
            const oldRank = levelRank[prev[d.fam]] || 0;
            const newRank = levelRank[d.lv] || 0;
            if (d.lv && newRank > oldRank) {
              out.push({ ts: r.ts, level: d.lv, type: d.type, field: d.field,
                         value: d.value, threshold: d.th,
                         rule_id: d.rule[0], rule_name: d.rule[1], why: d.rule[2],
                         handling_advice: d.rule[3] || '检查相关传感器数据并按现场规程处置', row: r,
                         envRow: d.fam === 'tilt' && tiltWave ? env : null,
                         snapshot: snapshot });
            }
            prev[d.fam] = d.lv || null;
          });
        });
        return out.sort(function (a, b) { return b.ts - a.ts; });
      },
      worst: function () {
        const result = assessStructure(this.last, this.envLast, this.netBaseline);
        const names = { blue: '蓝色', yellow: '黄色', orange: '橙色', red: '红色' };
        return { level: result.level, text: result.level === null ? '暂无风险数据' :
          result.level === 'blue' ? (result.incomplete ? '已知指标无预警' : '当前无预警') :
          names[result.level] + '预警' };
      },
      events: function () {
        return this.hits.slice(0, 18).map(function (h) {
          return { id: h.rule_id + h.ts, ts: h.ts, level: h.level,
                   text: h.rule_name + '（' + h.field + ' = ' + h.value + '，阈值 ' + h.threshold + '）', hit: h };
        });
      }
    },
    methods: {
      selectCage: selectCage,
      load: function () {
        const self = this;
        const requestId = ++this.requestId;
        API.resolve(API.struct(this.minutes, { storm: this.stormDemo, cageId: this.cageId }), function (d) {
          if (requestId !== self.requestId) return;
          self.series = Array.isArray(d) ? d : [];
        });
        if (this.minutes < 60) {
          API.resolve(API.struct(60, { storm: this.stormDemo, cageId: this.cageId }), function (d) {
            if (requestId !== self.requestId) return;
            self.netHistory = Array.isArray(d) ? d : [];
          });
        }
        API.resolve(cageEnvironment(this, this.stormDemo), function (d) {
          if (requestId !== self.requestId) return;
          self.envSeries = d && Array.isArray(d.fast) ? d.fast : [];
        });
      },
      toggleStormDemo: function () {
        this.stormDemo = !this.stormDemo;
        setStormDemo(this.stormDemo);
        this.picked = null;
        this.series = [];
        this.envSeries = [];
        this.netHistory = [];
        this.load();
      },
      time: function (ts) { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); },
      lvCn: function (l) { return { blue: '蓝色', yellow: '黄色', orange: '橙色', red: '红色' }[l] || l; },
      lvCls: function (l) { return 'bg-' + (l || 'blue'); },
      pick: function (e) { this.picked = e.hit || e; }
    },
    mounted: function () {
      bindCurrentCage(this);
      /* API.bind：数据变化重算 + 定时刷新曲线 */
      this.unsub = API.bind(this, this.load);
      this.load();
    },
    beforeUnmount: function () { unbindCurrentCage(this); if (this.unsub) { this.unsub(); this.unsub = null; } },
    watch: { minutes: function () { this.picked = null; this.load(); } },
    template: [
      '<div class="struct-page">',
      '  <page-head title="结构安全 · 灾害分级预警"',
      '    desc="融合海况与结构监测数据展示分级事件、触发字段、规则编号、时间和处置建议。"',
      '    />',
      cageSwitchMarkup(),
      '  <div class="hint" style="margin-bottom:12px"><button type="button" @click="toggleStormDemo">{{ stormDemo ? \'恢复平常\' : \'演示大风大浪\' }}</button><span class="small" style="margin-left:10px">仅切换本地模拟器数据；下方预警由返回的浪高、逐链张力和倾角重新计算。</span></div>',
      '  <div v-if="stormDemo" class="hint" style="margin-bottom:12px">大风大浪模拟演示中：海况来自仿真演示站点，不代表当前网箱所在海域的真实观测。</div>',
      '',
      '  <div class="grid-stats">',
      '    <stat-card class="is-primary is-status" name="当前最高预警等级" unit="" :value="worst.text" />',
      '    <stat-card name="本时段告警条数" unit="条" :value="hits.length" :digits="0" />',
      '    <stat-card :name="tensionLabel" field="tension_pct" unit="%" :value="currentTensionPct" />',
      '    <stat-card name="网箱横滚角" field="tilt_roll" unit="°" :value="last.tilt_roll" />',
      '  </div>',
      '  <div class="hero-note">本页按所选时间窗的结构与海况数据计算触发事件；无越限时显示 0 条。导航角标使用平台告警中心的独立记录。</div>',
      '  <div class="small muted" style="margin-top:8px">{{ coverageNote }}</div>',
      '  <div class="small muted" style="margin-top:8px">{{ netRuleText }}。该线按历史数据识别拉力升高，不代表网衣材料极限或破损结论。</div>',
      '',
      '  <div class="card" style="margin-top:12px">',
      '    <div class="card-title">{{ stormDemo ? \'仿真演示站点海况\' : \'当前网箱所在海域海况\' }}</div>',
      '    <div class="grid-stats">',
      '      <stat-card name="浪高" field="wave_height" unit="m" :value="envLast.wave_height" :quality="envLast.quality" :ts="envLast.ts" />',
      '      <stat-card name="风速" field="wind_speed" unit="m/s" :value="envLast.wind_speed" :quality="envLast.quality" :ts="envLast.ts" />',
      '      <stat-card name="流速" field="current_speed" unit="m/s" :value="envLast.current_speed" :quality="envLast.quality" :ts="envLast.ts" />',
      '    </div>',
      '  </div>',
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
      '          触发数据快照：<div v-for="(value, key) in picked.snapshot" :key="key" class="row" style="justify-content:space-between;padding:2px 0"><span>{{ key }}</span><b>{{ value === null || value === undefined ? \'—\' : value }}</b></div>',
      '          建议：{{ picked.handling_advice }}',
      '        </div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="hint" style="margin-top:12px;background:#FFFBEB;border-color:#FDE68A">',
      '    ⚠️ <b>阈值说明</b>：张力 80% / 95%、倾角 5° / 15° 按当前参数配置展示；',
      '    5° 为自设提示线，15° 参考 CCS 完整稳性衡准角，仍需现场标定。浪高 > 3 m 且张力占比 > 80% 时标记为橙色组合条件。',
      '    网衣试运行阈值取最近一小时已上报拉力中位数，黄色线加上 4 倍稳健波动或中位数的 20%（取较大者）；',
      '    红色线加上 6 倍稳健波动或中位数的 35%（取较大者）。稳健波动 = 1.4826 × 绝对偏差中位数；该经验规则未经现场标定。',
      '    <div style="margin-top:6px">',
      '      <b>告警是边沿触发的</b>：只在状态发生变化时出一条（黄→红 出一条，恢复正常后再越限才再出），',
      '      不是每个采样点都报 —— 否则一小时能刷出上千条，看着像系统坏了。',
      '    </div>',
      '  </div>',
      '',
      '  <details class="secondary-details"><summary>其余结构指标</summary><div class="grid-stats">',
      '    <stat-card :name="netLabel" field="net_tension" unit="kN" :value="netValue" />',
      '    <stat-card name="网箱俯仰角" field="tilt_pitch" unit="°" :value="last.tilt_pitch" />',
      '</div></details>',
      '  <div class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <time-range v-model="minutes" />',
      '    <span style="flex:1"></span>',
      '    <a href="#/struct/overview"><button>返回结构总览</button></a>',
      '    <a href="#/struct/detail"><button>查看监测详情</button></a>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  PAGES['/struct/overview'] = {
    data: function () { return { tick: 0, minutes: 60, series: [], netHistory: [], envSeries: [], cage: null,
      cageId: selectedCageId(), requestId: 0,
      mooringView: false, trussModelInfo: TRUSS_MODEL_INFO,
      mooringModelInfo: MOORING_MODEL_INFO, unsub: null, unsubFarm: null }; },
    computed: {
      cageSiteLabel: cageSiteLabel,
      last: function () { return this.series.length ? this.series[this.series.length - 1] : {}; },
      envLast: function () { return this.envSeries.length ? this.envSeries[this.envSeries.length - 1] : {}; },
      scenarioActive: function () { return this.last.sim_scenario === 'storm'; },
      anchorValue: function () { return anchorDisplayValue(this.last); },
      anchorLabel: function () { return anchorDisplayLabel(this.last); },
      netValue: function () { return netDisplayValue(this.last); },
      netLabel: function () { return netDisplayLabel(this.last); },
      coverageNote: function () {
        return coverageText(this.last);
      },
      netBaseline: function () {
        return netTrialBaseline(this.minutes >= 60 ? this.series : this.netHistory);
      },
      netRuleText: function () {
        const b = this.netBaseline;
        return b ? '网衣试运行线：黄色 ≥ ' + b.warn.toFixed(1) + ' kN，红色 ≥ ' +
          b.alarm.toFixed(1) + ' kN；依据最近一小时 ' + b.count + ' 个已上报拉力样本。' :
          '网衣试运行线：有效历史拉力样本不足 30 个，暂不计算。';
      },
      cageLabel: function () {
        const cage = this.cage, spec = cage && cage.spec;
        const name = cage && cage.cage_name || '主养网箱';
        if (!spec || spec.shape !== '桁架式') return name + ' · 桁架式结构概念模型';
        const length = validNumber(spec.length_m), width = validNumber(spec.width_m);
        const depth = validNumber(spec.depth_m);
        return name + ' · 桁架式' + (length > 0 && width > 0 && depth > 0 ?
          ' · ' + length + ' × ' + width + ' × ' + depth + ' m' : ' · 概念模型（无现场尺寸）');
      },
      charts: function () {
        const points = function (field) {
          return this.series.filter(function (r) {
            return r[field] !== null && r[field] !== undefined && Number.isFinite(Number(r[field]));
          }).map(function (r) { return [r.ts, Number(r[field])]; });
        }.bind(this);
        return [
          { name: '已上报张力利用率', unit: '%', data: this.series.map(function (r) { return [r.ts, tensionPercent(r)]; }) },
          { name: '网箱倾斜角', unit: '°', axis: 1, data: points('tilt_angle') }
        ];
      },
      assessment: function () { return assessStructure(this.last, this.envLast, this.netBaseline); },
      riskText: function () {
        const a = this.assessment;
        if (a.level === null) return '暂无风险数据';
        if (a.level === 'blue') return a.incomplete ? '已知指标无预警' : '当前无预警';
        return CN.riskLevel(a.level) + '预警';
      },
      subsystemItems: function () {
        const a = this.assessment;
        const coverage = a.coverage;
        const items = [
          { label: '锚泊系统', field: 'tension_status', level: a.tension,
            scopePending: !coverage.linesComplete },
          { label: '网衣系统', field: 'damage_suspect_status', level: a.net,
            trial: a.netState && !a.netState.official && a.netState.trial !== null,
            scopePending: !coverage.areasComplete },
          { label: '姿态系统', field: 'attitude_status', level: a.attitude }
        ];
        return items.map(function (item) {
          const tone = item.level === null || (item.level === 'blue' && item.scopePending) ?
            'muted' : item.level === 'blue' ? 'green' : item.level;
          const labels = { green: '正常', yellow: '黄色提示', orange: '橙色预警', red: '红色预警' };
          const text = item.level === 'blue' && item.scopePending ? '已报值正常，覆盖未知' :
            tone === 'muted' ? '数据不足' : labels[tone] +
            (item.scopePending ? '，测点未齐' : '');
          return { label: item.label, field: item.field, text: text, tone: tone };
        });
      }
    },
    methods: {
      selectCage: selectCage,
      lightColor: function (tone) {
        return { green: '#16A34A', yellow: '#FACC15', orange: '#F97316', red: '#EF4444', muted: '#94A3B8' }[tone] || '#94A3B8';
      },
      toggleMooringView: function () {
        this.mooringView = !this.mooringView;
        const canvas = this.$refs.cageCanvas;
        if (canvas && canvas.__structViewer) canvas.__structViewer.setMooringView(this.mooringView);
      },
      syncCageSpec: function () {
        const farm = API.farm();
        const cages = farm && Array.isArray(farm.cages) ? farm.cages : [];
        const cage = cages.find(function (item) { return item.cage_id === this.cageId; }, this);
        if (this.cage !== cage) this.cage = cage || null;
        const canvas = this.$refs.cageCanvas;
        if (canvas && canvas.__structViewer) canvas.__structViewer.setSpec(cage && cage.spec, this.cageId);
      },
      load: function () {
        const self = this;
        const requestId = ++this.requestId;
        API.resolve(API.struct(this.minutes, { storm: stormDemoActive(), cageId: this.cageId }), function (d) {
          if (requestId !== self.requestId) return;
          self.series = Array.isArray(d) ? d : [];
        });
        API.resolve(cageEnvironment(this, stormDemoActive()), function (d) {
          if (requestId !== self.requestId) return;
          self.envSeries = d && Array.isArray(d.fast) ? d.fast : [];
        });
        if (this.minutes < 60) {
          API.resolve(API.struct(60, { storm: stormDemoActive(), cageId: this.cageId }), function (d) {
            if (requestId !== self.requestId) return;
            self.netHistory = Array.isArray(d) ? d : [];
          });
        }
      }
    },
    mounted: function () {
      bindCurrentCage(this);
      const canvas = this.$refs.cageCanvas;
      if (canvas) canvas.__structViewer = global.StructTrussCage.mount(canvas);
      this.unsub = API.bind(this, this.load);
      const self = this;
      this.unsubFarm = API.subscribe(function () { self.syncCageSpec(); });
      this.syncCageSpec();
      this.load();
    },
    beforeUnmount: function () { unbindCurrentCage(this);
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
      cageSwitchMarkup(),
      '  <div v-if="scenarioActive" class="hint" style="margin-bottom:12px;background:#FFF7ED;border-color:#FDBA74">大风大浪模拟演示中：海况来自仿真演示站点，红色预警来自模拟数据，不代表当前海域真实观测。<a href="#/struct/alarm">到预警页恢复平常</a></div>',
      '',
      '  <div class="grid-stats">',
      '    <stat-card class="is-primary is-status" name="当前风险等级" field="risk_level" unit="" :value="riskText" :ts="last.ts" />',
      '    <stat-card :name="anchorLabel" field="anchor_tension" unit="kN" :value="anchorValue" :ts="last.ts" />',
      '    <stat-card :name="netLabel" field="net_tension" unit="kN" :value="netValue" :ts="last.ts" />',
      '    <stat-card name="倾斜角合量" field="tilt_angle" unit="°" :value="last.tilt_angle" :ts="last.ts" />',
      '  </div>',
      '  <div class="small muted" style="margin-top:7px">{{ coverageNote }}</div>',
      '',
      '  <div class="workspace-grid struct-overview-grid">',
      '  <div style="margin-top:12px">',
      '    <trend-chart title="结构安全关键趋势（张力占比与倾斜角）" :series="charts" />',
      '  </div>',
      '',
      '    <div class="card">',
      '      <div class="card-title">桁架式网箱结构示意 <help-dot :info="trussModelInfo" label="模型依据" /></div>',
      cageModelMarkup(),
      '      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px">',
      '        <button type="button" @click="toggleMooringView">{{ mooringView ? \'返回结构视角\' : \'查看系泊全貌\' }}</button>',
      '        <span class="small muted">四角系泊曲线示意 <help-dot :info="mooringModelInfo" label="系泊依据" /></span>',
      '      </div>',
      '      <div v-if="mooringView" class="small muted" style="margin-top:8px">',
      '        <div>俯视关系示意，非现场锚位图</div>',
      '        <svg viewBox="0 0 300 116" role="img" aria-label="网箱四角分别连接四个海底锚的俯视示意" style="display:block;width:100%;height:auto;max-height:116px;background:#eaf1f1;border-radius:5px">',
      '          <g stroke="#ad8753" stroke-width="2" stroke-dasharray="5 3" fill="none">',
      '            <path d="M104 35 L28 17 M196 35 L272 17 M196 81 L272 99 M104 81 L28 99" />',
      '          </g>',
      '          <rect x="104" y="35" width="92" height="46" rx="3" fill="#7899a0" stroke="#304e59" stroke-width="3" />',
      '          <text x="150" y="62" text-anchor="middle" fill="#102e3d" font-size="12">桁架网箱</text>',
      '          <g fill="#9b7546" stroke="#554736" stroke-width="1">',
      '            <circle cx="28" cy="17" r="5"/><circle cx="272" cy="17" r="5"/>',
      '            <circle cx="272" cy="99" r="5"/><circle cx="28" cy="99" r="5"/>',
      '          </g>',
      '          <g fill="#34505a" font-size="10">',
      '            <text x="8" y="34">锚 1</text><text x="263" y="34">锚 2</text>',
      '            <text x="263" y="92">锚 3</text><text x="8" y="92">锚 4</text>',
      '          </g>',
      '        </svg>',
      '        <div style="margin-top:5px">黄线：导缆点至海底锚。立体图可查看下垂段与铺底段。</div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '    <div class="card">',
      '      <div class="card-title">子系统状态灯</div>',
      '      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:10px">',
      '        <div v-for="item in subsystemItems" :key="item.field" style="min-height:82px;padding:10px 8px;border:1px solid var(--line);border-radius:8px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:space-between">',
      '          <div style="font-weight:600">{{ item.label }}</div>',
      '          <span :style="{backgroundColor: lightColor(item.tone)}" style="display:block;width:22px;height:16px;border-radius:3px;box-shadow:0 2px 8px rgba(0,0,0,.16)" :aria-label="item.text"></span>',
      '          <div class="small" :class="{muted:item.tone === \'muted\'}">{{ item.text }}</div>',
      '        </div>',
      '      </div>',
      '    </div>',
      '  <div class="small muted" style="margin-top:8px">{{ netRuleText }}仅提示拉力升高，不代表网衣破损或已达到材料强度极限；试行规则未经现场标定。</div>',
      '',
      '  <div class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <time-range v-model="minutes" />',
      '    <span style="flex:1"></span>',
      '    <a href="#/struct/detail"><button>查看监测详情</button></a>',
      '    <a href="#/struct/alarm"><button>查看灾害预警</button></a>',
      '  </div>',
      '</div>',
      '  <video-slot title="桁架式网箱现场画面" desc="桁架式网箱实拍素材待接入；此处为视频预留位，并非实时摄像头画面" />'
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
    if (!netAreas(raw).length) {
      row.net_tension_dist = [0.94, 1.01, 1.06, 0.98, 1.04, 0.96].map(function (factor, i) {
        return +(base * factor + 0.35 * Math.sin(phase + i * 0.8)).toFixed(1);
      });
      demo.push('net_tension_dist');
    }
    if (validNumber(raw.net_area_tension) === null) {
      const highest = maxNetArea(row);
      row.net_area_tension = highest ? highest.value : null;
      if (!netAreas(raw).length) demo.push('net_area_tension');
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
    data: function () { return { tick: 0, section: 'anchor', minutes: 60, series: [], demoBaseTs: Date.now(),
      cageId: selectedCageId(), requestId: 0, unsub: null }; },
    computed: {
      cageSiteLabel: cageSiteLabel,
      last: function () { return this.series.length ? this.series[this.series.length - 1] : {}; },
      anchorLines: function () { return displayMooringLines(this.last); },
      anchorValue: function () { return anchorDisplayValue(this.last); },
      anchorLabel: function () { return anchorDisplayLabel(this.last); },
      netValue: function () { return netDisplayValue(this.last); },
      netLabel: function () { return netDisplayLabel(this.last); },
      currentTensionPct: function () { return tensionPercent(this.last); },
      tensionLabel: function () {
        return mooringLines(this.last).length ? '已上报逐链最高利用率' : '上报张力占设计值';
      },
      mooringNote: function () {
        return mooringLines(this.last).length ?
          '逐链值来自接口；当前由模拟器生成，设计允许值沿用演示配置。只汇总有有效允许值的已上报系泊线，真实数量、方位和允许值仍需核对。' :
          '四条线对应当前概念模型，实际布置待确认。下表的数字由页面按单个上报值生成，仅演示不同系泊线受力可能不均；未给出各链允许值，不能据此预警。';
      },
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
          deformation: '形变量',
          displacement_x: 'X 轴位移', displacement_y: 'Y 轴位移', displacement_z: 'Z 轴位移' };
        const fields = (this.displayLast._demoFields || []).map(function (field) { return names[field]; });
        if (!mooringLines(this.last).length) fields.unshift('四条系泊线张力');
        return fields.join('、');
      },
      charts: function () {
        return [
          { name: '已上报锚泊张力', unit: 'kN', data: this.series.map(function (r) { return [r.ts, anchorDisplayValue(r)]; }) }
        ];
      },
      netCharts: function () {
        return [{ name: '已上报网衣拉力', unit: 'kN', data: this.series.map(function (r) { return [r.ts, netDisplayValue(r)]; }) }];
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
        const areas = netAreas(this.displayLast);
        const zones = ['A1', 'A2', 'B', 'C1', 'C2', 'D'];
        const demo = (this.displayLast._demoFields || []).indexOf('net_tension_dist') >= 0;
        const hasZones = areas.length === 6 && zones.every(function (zone) {
          return areas.some(function (area) { return area.zone === zone; });
        });
        if (hasZones) return zones.map(function (zone) {
          return Object.assign({}, areas.filter(function (area) { return area.zone === zone; })[0],
            { modelZone: zone });
        });
        const confirmed = this.displayLast.net_layout === 'truss_six_side_v1' ||
          areas.every(function (area, index) { return area.label === zones[index]; });
        const mapped = areas.length === 6 && (demo || confirmed);
        return areas.map(function (area, index) {
          return Object.assign({}, area, { modelZone: mapped ? zones[index] : null });
        });
      },
      netHighArea: function () {
        return this.netRegions.filter(function (area) { return area.value !== null; })
          .reduce(function (max, area) { return !max || area.value > max.value ? area : max; }, null);
      },
      netCriticalArea: function () {
        return this.netRegions.filter(function (area) { return area.pct !== null; })
          .reduce(function (max, area) { return !max || area.pct > max.pct ? area : max; }, null);
      },
      netHighText: function () {
        if (!this.netHighArea) return '暂无分区值。';
        return ((this.displayLast._demoFields || []).indexOf('net_tension_dist') >= 0 ?
          '演示图' : '已上报区域') + '中最高：' +
          (this.netHighArea.modelZone ? this.netHighArea.modelZone + '（' + this.netHighArea.label + '）' :
            this.netHighArea.label) + '。';
      },
      netScale: function () {
        const values = this.netRegions.map(function (item) { return item.value; })
          .filter(function (value) { return value !== null; });
        return { min: values.length ? Math.min.apply(null, values) : null,
                 max: values.length ? Math.max.apply(null, values) : null };
      },
      netModelLayout: function () {
        return this.netRegions.length === 6 && this.netRegions[0].modelZone !== null;
      },
      netMapWidth: function () {
        return this.netModelLayout ? 104 + 108 * 4 + 86 * 2 :
          Math.max(620, 104 + Math.max(1, this.netRegions.length) * 92);
      },
      netMapViewBox: function () { return '0 0 ' + this.netMapWidth + ' 405'; },
      netMapStyle: function () {
        return { minWidth: this.netRegions.length <= 6 ? '100%' : this.netMapWidth + 'px' };
      },
      netPanels: function () {
        const regions = this.netRegions, scale = this.netScale;
        const widths = this.netModelLayout ? [108, 108, 86, 108, 108, 86] :
          regions.map(function () { return 92; });
        const zones = ['A1', 'A2', 'B', 'C1', 'C2', 'D'];
        const matched = this.netModelLayout;
        let left = 52;
        return regions.map(function (item, index) {
          const x = left, width = widths[index], right = x + width;
          left = right;
          const value = item.value;
          const ratio = value === null ? null : scale.max === scale.min ? 0.5 :
            (value - scale.min) / (scale.max - scale.min);
          const color = ratio === null ? '#dce2e5' : 'rgb(' +
            Math.round(213 - 190 * ratio) + ',' +
            Math.round(234 - 131 * ratio) + ',' +
            Math.round(238 - 93 * ratio) + ')';
          return { label: item.label, zone: matched ? zones[index] : '第 ' + (index + 1) + ' 区',
            valueText: value === null ? '—' : value.toFixed(1) + ' kN',
            x: x, cx: x + width / 2, width: width, color: color,
            path: 'M' + x + ' 216 L' + right + ' 216 L' + right + ' 350 L' + x + ' 350 Z' };
        });
      },
      netPlanZones: function () {
        if (!this.netModelLayout) return [];
        const x = this.netMapWidth / 2 - 160, p = this.netPanels;
        return [
          { x: x + 24, y: 50, width: 136, height: 17, label: 'A1', color: p[0].color },
          { x: x + 160, y: 50, width: 136, height: 17, label: 'A2', color: p[1].color },
          { x: x + 298, y: 67, width: 18, height: 66, label: 'B', color: p[2].color },
          { x: x + 160, y: 133, width: 136, height: 17, label: 'C1', color: p[3].color },
          { x: x + 24, y: 133, width: 136, height: 17, label: 'C2', color: p[4].color },
          { x: x + 4, y: 67, width: 18, height: 66, label: 'D', color: p[5].color }
        ];
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
      selectCage: selectCage,
      sourceFor: function (field) {
        return (this.displayLast._demoFields || []).indexOf(field) >= 0 ? 'demo' : 'simulated';
      },
      lineState: function (line) {
        if (line.demo) return '页面演示';
        if (line.tension === null) return '张力缺失';
        if (line.pct === null) return '允许值待配';
        if (line.pct >= STRUCT_LIMITS.tensionAlarm) return '红色预警';
        if (line.pct >= STRUCT_LIMITS.tensionWarn) return '黄色提示';
        return '该线未越线';
      },
      load: function () {
        const self = this;
        const requestId = ++this.requestId;
        API.resolve(API.struct(this.minutes, { storm: stormDemoActive(), cageId: this.cageId }), function (d) {
          if (requestId !== self.requestId) return;
          self.series = Array.isArray(d) ? d : [];
        });
      }
    },
    mounted: function () { bindCurrentCage(this); this.unsub = API.bind(this, this.load); this.load(); },
    beforeUnmount: function () { unbindCurrentCage(this); if (this.unsub) { this.unsub(); this.unsub = null; } },
    watch: { minutes: function () { this.load(); } },
    template: [
      '<div class="struct-page">',
      '  <page-head title="结构安全 · 监测详情"',
      '    desc="分为锚链张力、网衣监测、形变与姿态三个区域；高级字段未接入时展示明确标注的演示数据。"',
      '    />',
      cageSwitchMarkup(),
      '  <div v-if="last.sim_scenario === \'storm\'" class="hint" style="margin-bottom:12px;background:#FFF7ED;border-color:#FDBA74">大风大浪模拟演示中：张力和姿态异常来自模拟数据。<a href="#/struct/alarm">到预警页恢复平常</a></div>',
      '  <div v-if="demoFieldsText" class="hint" style="margin-bottom:12px;background:#EFF6FF;border-color:#BFDBFE">页面演示数据：{{ demoFieldsText }}。仅用于展示布局与趋势，不代表实测或真实破损；模拟器提供对应字段后自动切换为接口数据。</div>',
      '',
      '  <div class="section-tabs" role="group" aria-label="监测分组">',
      '    <button :class="{primary: section === \'anchor\'}" :aria-pressed="section === \'anchor\'" @click="section = \'anchor\'">锚链张力</button>',
      '    <button :class="{primary: section === \'net\'}" :aria-pressed="section === \'net\'" @click="section = \'net\'">网衣监测</button>',
      '    <button :class="{primary: section === \'posture\'}" :aria-pressed="section === \'posture\'" @click="section = \'posture\'">形变与姿态</button>',
      '  </div>',
      '  <section v-if="section === \'anchor\'" class="card">',
      '    <div class="card-title">一、锚链张力监测</div>',
      '    <div class="grid-stats">',
      '      <stat-card :name="anchorLabel" field="anchor_tension" unit="kN" :value="anchorValue" :ts="last.ts" />',
      '      <stat-card :name="tensionLabel" field="tension_pct" unit="%" :value="currentTensionPct" :ts="last.ts" />',
      '    </div>',
      '    <div class="small muted" style="margin-top:8px">{{ mooringNote }}</div>',
      '    <div class="card" style="margin-top:10px">',
      '      <div class="card-title">逐链张力与设计允许值</div>',
      '      <div style="overflow-x:auto"><div style="min-width:560px">',
      '        <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:8px;padding:7px 0;border-bottom:1px solid var(--line);font-weight:600" class="small">',
      '          <span>系泊线／编号</span><span>张力</span><span>设计允许值</span><span>利用率／状态</span>',
      '        </div>',
      '        <div v-for="line in anchorLines" :key="line.label" style="display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line)">',
      '          <span>{{ line.label }}<span v-if="line.chainId" class="small muted">（{{ line.chainId }}）</span></span>',
      '          <b>{{ line.tension === null ? \'—\' : line.tension.toFixed(1) + \' kN\' }}</b>',
      '          <span>{{ line.design === null ? \'—\' : line.design.toFixed(1) + \' kN\' }}</span>',
      '          <span>{{ line.pct === null ? \'—\' : line.pct.toFixed(1) + \'%\' }} · {{ lineState(line) }}</span>',
      '        </div>',
      '      </div></div>',
      '      <div class="small muted" style="margin-top:8px">每条线的张力和允许值必须按同一编号配对。已上报最高利用率 = max(逐链张力 ÷ 各自设计允许值)，不能用四条张力之和判断单链风险。</div>',
      '      <div class="small muted" style="margin-top:5px">当前四条逐链记录由模拟器生成；现场测点编号、总数和各链设计允许值接入后需再次核对。</div>',
      '    </div>',
      '    <div style="margin-top:10px"><trend-chart title="上报锚泊张力趋势" :series="charts" /></div>',
      '  </section>',
      '',
      '  <section v-if="section === \'net\'" class="card" style="margin-top:12px">',
      '    <div class="card-title">二、网衣监测</div>',
      '    <div class="grid-stats">',
      '      <stat-card :name="netLabel" field="net_tension" unit="kN" :value="netValue" :ts="last.ts" />',
      '      <stat-card name="最高受力区域" field="net_area_id" unit="" :value="netHighArea && (netHighArea.modelZone || netHighArea.label)" :ts="displayLast.ts" />',
      '    </div>',
      '    <div class="small muted" style="margin-top:8px">{{ netHighText }}{{ netCriticalArea ? \'最高利用率：\' + netCriticalArea.label + \'（\' + netCriticalArea.pct.toFixed(1) + \'%）。\' : \'各区允许值未接入，暂不判定承载风险。\' }}当前分区数据由模拟器生成；试运行预警使用每时刻的最高分区拉力。拉力不能单独确定破损位置，需现场检查或独立破损状态数据。</div>',
      '    <div class="card" style="margin-top:10px">',
      '      <div class="card-title">网衣拉力分布 · 桁架网箱四面侧网</div>',
      '      <div v-if="netPanels.length" class="struct-net-map">',
      '        <svg :viewBox="netMapViewBox" :style="netMapStyle" role="img" aria-label="桁架式网箱俯视与四面侧网展开，各区域以颜色深浅表示相对拉力">',
      '          <defs><pattern id="struct-net-weave" width="16" height="16" patternUnits="userSpaceOnUse">',
      '            <path d="M0 0L16 16M16 0L0 16" fill="none" stroke="#214e61" stroke-opacity=".42" stroke-width="1"/>',
      '          </pattern></defs>',
      '          <text x="52" y="29" fill="#365468" font-size="14" font-weight="600">俯视位置 · 两长侧、两端面与底网</text>',
      '          <rect :x="netMapWidth / 2 - 160" y="44" width="320" height="108" rx="4" fill="#b3cbd0" stroke="#365d70" stroke-width="3"/>',
      '          <rect :x="netMapWidth / 2 - 134" y="69" width="268" height="62" fill="#d8e8e9"/>',
      '          <rect :x="netMapWidth / 2 - 134" y="69" width="268" height="62" fill="url(#struct-net-weave)"/>',
      '          <text :x="netMapWidth / 2" y="105" text-anchor="middle" fill="#38596a" font-size="12">底网 · 拉力未接入</text>',
      '          <g v-for="zone in netPlanZones" :key="zone.label">',
      '            <rect :x="zone.x" :y="zone.y" :width="zone.width" :height="zone.height" :fill="zone.color" stroke="#ecf4f4" stroke-width="1"/>',
      '            <text :x="zone.x + zone.width / 2" :y="zone.y + zone.height / 2 + 4" text-anchor="middle" fill="#193c4d" font-size="11" font-weight="600">{{ zone.label }}</text>',
      '          </g>',
      '          <text v-if="!netModelLayout" :x="netMapWidth / 2" y="140" text-anchor="middle" fill="#365468" font-size="11">分区数量未与模型建立对应</text>',
      '          <text x="52" y="186" fill="#365468" font-size="14" font-weight="600">{{ netModelLayout ? \'侧网展开 · A 长侧 → B 端面 → C 长侧 → D 端面\' : \'侧网分区展开 · 方位待核对\' }}</text>',
      '          <text :x="netMapWidth - 52" y="186" text-anchor="end" fill="#547284" font-size="11">编号仅作几何示意</text>',
      '          <g v-for="panel in netPanels" :key="panel.label">',
      '            <path :d="panel.path" :fill="panel.color" stroke="#edf5f6" stroke-width="1"/>',
      '            <path :d="panel.path" fill="url(#struct-net-weave)"/>',
      '            <line :x1="panel.x" y1="216" :x2="panel.x" y2="350" stroke="#54798b" stroke-width="2"/>',
      '            <rect :x="panel.cx - 39" y="261" width="78" height="52" rx="5" fill="#fff" fill-opacity=".88"/>',
      '            <text :x="panel.cx" y="278" text-anchor="middle" fill="#25445a" font-size="12" font-weight="600">{{ panel.zone }}</text>',
      '            <text :x="panel.cx" y="298" text-anchor="middle" fill="#183d54" font-size="12">{{ panel.valueText }}</text>',
      '          </g>',
      '          <rect x="52" y="207" :width="netMapWidth - 104" height="9" rx="3" fill="#365d70"/>',
      '          <rect x="52" y="350" :width="netMapWidth - 104" height="6" rx="3" fill="#2f566a"/>',
      '          <text x="52" y="382" fill="#365468" font-size="12">上缘挂接桁架 · 下缘连接底网；底网无独立拉力值</text>',
      '        </svg>',
      '      </div>',
      '      <div v-else class="muted">暂无区域拉力数据</div>',
      '      <div v-if="netScale.min !== null" class="struct-net-scale">',
      '        <span>相对较低 {{ netScale.min.toFixed(1) }} kN</span>',
      '        <span class="struct-net-scale-bar" aria-hidden="true"></span>',
      '        <span>相对较高 {{ netScale.max.toFixed(1) }} kN</span>',
      '      </div>',
      '      <div style="overflow-x:auto;margin-top:9px"><div style="min-width:560px">',
      '        <div class="small" style="display:grid;grid-template-columns:1.3fr 1fr 1fr 1fr;gap:8px;padding:7px 0;border-bottom:1px solid var(--line);font-weight:600">',
      '          <span>网衣区域／网绳</span><span>拉力</span><span>设计允许值</span><span>利用率</span>',
      '        </div>',
      '        <div v-for="area in netRegions" :key="area.label" style="display:grid;grid-template-columns:1.3fr 1fr 1fr 1fr;gap:8px;padding:7px 0;border-bottom:1px solid var(--line)">',
      '          <span>{{ area.modelZone ? area.modelZone + \' · \' : \'\' }}{{ area.label }}<span v-if="area.ropeId" class="small muted">（{{ area.ropeId }}）</span></span>',
      '          <b>{{ area.value === null ? \'—\' : area.value.toFixed(1) + \' kN\' }}</b>',
      '          <span>{{ area.allowable === null ? \'—\' : area.allowable.toFixed(1) + \' kN\' }}</span>',
      '          <span>{{ area.pct === null ? \'—\' : area.pct.toFixed(1) + \'%\' }}</span>',
      '        </div>',
      '      </div></div>',
      '      <div class="small muted" style="margin-top:7px">{{ netModelLayout ? \'A1/A2、C1/C2 对应模型的两面长侧网，B/D 对应两端面；底网未分配侧网读数。\' + ((displayLast._demoFields || []).indexOf(\'net_tension_dist\') >= 0 ? \'六区顺序仅是页面演示，真实测点方位待确认。\' : \'六区顺序来自接口映射，仍需与现场编号核对。\') : \'分区数据没有可确认的六区方位映射，暂不把读数放到模型的具体侧面。\' }}色深只比较拉力，不代表预警等级。</div>',
      '    </div>',
      '    <div style="margin-top:10px"><trend-chart title="上报网绳拉力趋势" :series="netCharts" /></div>',
      '  </section>',
      '',
      '  <section v-if="section === \'posture\'" class="card" style="margin-top:12px">',
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
    data: function () { return { tick: 0, cageId: selectedCageId(), unsub: null }; },
    computed: {
      cageSiteLabel: cageSiteLabel,
      fishRules: function () {
        this.tick;
        const farm = API.farm();
        const catalog = API.speciesTemp();
        const cages = farm && Array.isArray(farm.cages) ? farm.cages : [];
        const species = catalog && Array.isArray(catalog.species) ? catalog.species : [];
        return cages.filter(function (cage) { return cage.cage_id === this.cageId; }, this).map(function (cage) {
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
          { id: 'R-TENSION-01', name: '锚泊张力提示', condition: '已上报张力利用率 ≥ 80%', level: '黄色', source: '有逐链数据时取各链张力 / 各自允许值的最高比例；否则用现有单值', basis: '只判已上报测点；80% 为运营提示线，需现场标定' },
          { id: 'R-TENSION-02', name: '锚泊张力告警', condition: '已上报张力利用率 ≥ 95%', level: '红色', source: '有逐链数据时取各链张力 / 各自允许值的最高比例；否则用现有单值', basis: '只判已上报测点；95% 为运营告警线，需现场确认' },
          { id: 'R-TILT-01', name: '网箱倾斜提示', condition: '横滚或俯仰绝对值 ≥ 5°；同时浪高 > 1.5 m 升为橙色', level: '黄色／橙色', source: 'tilt_angle 或 tilt_roll、tilt_pitch；wave_height', basis: '5° 为自设提示线；组合条件为演示规则' },
          { id: 'R-TILT-02', name: '网箱倾斜告警', condition: '横滚或俯仰绝对值 ≥ 15°', level: '红色', source: 'tilt_angle 或 tilt_roll、tilt_pitch', basis: '15° 参考 CCS 完整稳性衡准角，实际运营线仍需标定' },
          { id: 'R-STORM-TENSION-01', name: '大浪叠加高张力', condition: '浪高 > 3 m 且张力占设计值 > 80%', level: '橙色', source: 'wave_height + tension_pct', basis: '组合条件为演示规则，需现场确认' },
          { id: 'R-NET-TRIAL-01', name: '网衣拉力偏高（试运行）', condition: '已上报拉力 ≥ 最近一小时中位数 + max(4 × 稳健波动，中位数 × 20%)', level: '黄色', source: '有分区数据时取已上报分区最高拉力；否则用现有单值', basis: '稳健波动 = 1.4826 × 绝对偏差中位数；至少 30 个样本；仅提示相对升高' },
          { id: 'R-NET-TRIAL-02', name: '网衣拉力明显升高（试运行）', condition: '已上报拉力 ≥ 最近一小时中位数 + max(6 × 稳健波动，中位数 × 35%)', level: '红色', source: '有分区数据时取已上报分区最高拉力；否则用现有单值', basis: '经验试运行线，未经现场标定；不等于网衣破损或达到材料极限' },
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
    methods: { selectCage: selectCage },
    mounted: function () {
      bindCurrentCage(this);
      const self = this;
      this.unsub = API.subscribe(function () { self.tick += 1; });
    },
    beforeUnmount: function () { unbindCurrentCage(this); if (this.unsub) { this.unsub(); this.unsub = null; } },
    template: [
      '<div class="struct-page">',
      '  <page-head title="结构安全 · 规则配置" desc="查看规则的触发条件、等级与依据；当前为只读说明，试运行规则需现场标定。" />',
      cageSwitchMarkup(),
      '  <div class="hint" style="margin-bottom:12px">网衣按最近一小时有效拉力建立试运行线，正式风险或破损状态字段优先；试运行线只表示拉力相对升高，不证明网衣破损。样本不足时不作网衣判断。储能低电量不参与结构总览和灾害预警的风险等级。</div>',
      '  <div class="card">',
      '    <div class="card-title">当前判断规则</div>',
      '    <div class="dt-wrap" style="max-height:580px">',
      '      <table class="dt">',
      '        <thead><tr><th>编号</th><th>规则</th><th>触发条件</th><th>等级</th><th>依据与取数字段</th></tr></thead>',
      '        <tbody>',
      '          <tr v-for="(r, i) in rows" :key="r.id + i">',
      '            <td class="mono">{{ r.id }}</td><td>{{ r.name }}</td><td>{{ r.condition }}</td>',
      '            <td>{{ r.level }}</td><td class="small"><details><summary>查看依据</summary><p>{{ r.basis }}</p><span class="mono">{{ r.source }}</span></details></td>',
      '          </tr>',
      '        </tbody>',
      '      </table>',
      '    </div>',
      '  </div>',
      '  <div v-if="!fishRules.length" class="hint" style="margin-top:12px">鱼种配置尚未加载，水温规则暂不展示。</div>',
      '</div>',
      '  <threshold-table owner="结构安全" />'
    ].join('\n')
  };

})(window);
