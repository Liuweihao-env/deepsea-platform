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

  if (global.document && !global.document.getElementById('struct-net-style')) {
    const style = global.document.createElement('style');
    style.id = 'struct-net-style';
    style.textContent = '.struct-net-map{border:1px solid var(--line);background:#c8dce3}.struct-net-map svg{display:block;width:100%;height:auto}.struct-net-scale{display:flex;align-items:center;gap:10px;font-size:12px}.struct-net-scale-bar{height:10px;min-width:80px;flex:1;background:linear-gradient(90deg,#d5eaee,#90c5d6,#176791)}';
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
    if (this.pickedLine) this.pickedLine = '';
    if (this.pickedArea) this.pickedArea = '';
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
      "<div class=\"show-page\">",
      "<page-head title=\"结构安全 · 灾害分级预警\" desc=\"融合当前网箱海况与结构监测，核查风险等级、触发因素和处置建议。\" />",
      "<div class=\"show-body\">",
      "<div class=\"show-actions\">",
      "<time-range v-model=\"minutes\" />",
      "<button :class=\"{danger:stormDemo}\" @click=\"toggleStormDemo\">{{ stormDemo ? '恢复平常场景' : '大风大浪演示' }}</button>",
      "<span class=\"show-note\">{{ cageSiteLabel }} · {{ stormDemo ? '仿真演示站点海况，非当前海域真实观测' : '当前网箱所在海域' }}</span>",
      "<secondary-page title=\"预警口径与其余指标\">",
      "<div class=\"show-body\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">风险判定口径</div>",
      "<p class=\"show-note\">张力 80% / 95%、倾角 5° / 15° 为当前参数；5° 为自设提示线，15° 参考 CCS 完整稳性衡准角，均需现场标定。浪高 > 3 m 且张力占比 > 80% 标记橙色组合条件。</p>",
      "<p class=\"show-note\">网衣试运行线取最近一小时有效拉力中位数。黄色线增加 max(4 × 稳健波动，中位数 × 20%)；红色线增加 max(6 × 稳健波动，中位数 × 35%)。稳健波动 = 1.4826 × 绝对偏差中位数；至少 30 个样本，经验规则未经现场标定。</p>",
      "<p class=\"show-note\">告警按边沿触发：状态升高时记录一次，恢复后再次越限才产生新事件。本页按所选时窗计算，导航角标使用告警中心的独立记录。</p>",
      "</div>",
      "<div class=\"show-stats\">",
      "<stat-card name=\"网衣上报拉力\" :value=\"netValue\" unit=\"kN\"  />",
      "<stat-card name=\"网箱俯仰角\" :value=\"last.tilt_pitch\" unit=\"°\"  />",
      "<stat-card name=\"风速\" :value=\"envLast.wind_speed\" unit=\"m/s\"  />",
      "<stat-card name=\"流速\" :value=\"envLast.current_speed\" unit=\"m/s\"  />",
      "</div>",
      "</div>",
      "</secondary-page>",
      "</div>",
      "<show-screens :labels=\"['分级事件', '触发追溯']\">",
      "<template #default=\"{screen}\">",
      "<div v-if=\"screen===0\" class=\"show-row wide\">",
      "<div class=\"card\">",
      "<paged-records :items=\"hits\" :size=\"6\">",
      "<template #default=\"{rows}\">",
      "<table class=\"dt\" style=\"font-size:11px\"><colgroup><col style=\"width:10%\"><col style=\"width:24%\"><col style=\"width:50%\"><col style=\"width:16%\"></colgroup>",
      "<thead>",
      "<tr>",
      "<th>等级</th>",
      "<th>时间</th>",
      "<th>规则 / 触发值</th>",
      "<th>核查</th>",
      "</tr>",
      "</thead>",
      "<tbody>",
      "<tr v-for=\"h in rows\" :key=\"h.rule_id+h.ts\">",
      "<td style=\"height:42px;padding:4px 8px;line-height:1.3\">",
      "<span class=\"dot\" :class=\"lvCls(h.level)\">",
      "</span>{{ lvCn(h.level) }}</td>",
      "<td style=\"height:42px;padding:4px 8px;line-height:1.3\">{{ time(h.ts) }}</td>",
      "<td style=\"height:42px;padding:4px 8px;line-height:1.3\">{{ h.rule_name }}<br>",
      "<span class=\"small muted\">{{ h.field }} = {{ h.value }} / {{ h.threshold }}</span>",
      "</td>",
      "<td style=\"height:42px;padding:4px 8px;line-height:1.3\">",
      "<button @click=\"pick(h)\">选择</button>",
      "</td>",
      "</tr>",
      "</tbody>",
      "</table>",
      "</template>",
      "</paged-records>",
      "</div>",
      "<div class=\"card\">",
      "<div class=\"card-title\">风险变化与覆盖情况</div>",
      "<trend-chart title=\"结构张力与姿态趋势\" :series=\"charts\" style=\"flex:1;min-height:190px\" />",
      "<p class=\"show-note\">{{ coverageNote }}</p>",
      "<p class=\"show-note\">网衣试运行线和参数含义见「预警口径与其余指标」。</p>",
      "<a href=\"#/struct/detail\">",
      "<button>核查结构测点</button>",
      "</a>",
      "</div>",
      "</div>",
      "<div v-else class=\"show-row two\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">当前选中事件</div>",
      "<template v-if=\"picked\">",
      "<div class=\"show-number\">{{ picked.rule_name }}</div>",
      "<div class=\"kv\">",
      "<span class=\"k\">规则编号 / 时间</span>",
      "<span>{{ picked.rule_id }} · {{ time(picked.ts) }}</span>",
      "<span class=\"k\">触发值 / 阈值</span>",
      "<span>{{ picked.field }} = {{ picked.value }} / {{ picked.threshold }}</span>",
      "<span class=\"k\">触发依据</span>",
      "<span>{{ picked.why }}</span>",
      "<span class=\"k\">处置建议</span>",
      "<span>{{ picked.handling_advice }}</span>",
      "</div>",
      "</template>",
      "<div v-else class=\"empty\">先在分级事件屏选择一条记录</div>",
      "</div>",
      "<div class=\"card\">",
      "<div class=\"card-title\">触发数据快照</div>",
      "<template v-if=\"picked\">",
      "<paged-records :items=\"Object.keys(picked.snapshot || {}).map(key => ({key:key,value:picked.snapshot[key]}))\" :size=\"6\">",
      "<template #default=\"{rows}\">",
      "<table class=\"dt\">",
      "<thead>",
      "<tr>",
      "<th>触发字段</th>",
      "<th>快照值</th>",
      "</tr>",
      "</thead>",
      "<tbody>",
      "<tr v-for=\"r in rows\" :key=\"r.key\">",
      "<td style=\"height:42px;padding:4px 8px;line-height:1.3\">{{ r.key }}</td>",
      "<td style=\"height:42px;padding:4px 8px;line-height:1.3\">{{ r.value === null || r.value === undefined ? '—' : r.value }}</td>",
      "</tr>",
      "</tbody>",
      "</table>",
      "</template>",
      "</paged-records>",
      "</template>",
      "<div v-else class=\"empty\">尚未选择事件</div>",
      "</div>",
      "</div>",
      "</template>",
      "</show-screens>",
      "<div class=\"show-stats\">",
      "<stat-card name=\"当前最高预警等级\" :value=\"worst.text\" unit=\"\"  />",
      "<stat-card name=\"本时段告警条数\" :value=\"hits.length\" unit=\"条\" :digits=\"0\" />",
      "<stat-card name=\"已上报最高张力占比\" :value=\"currentTensionPct\" unit=\"%\"  />",
      "<stat-card name=\"当前海域浪高\" :value=\"envLast.wave_height\" unit=\"m\"  />",
      "</div>",
      "</div>",
      "</div>"
    ].join('\n')
  };

  PAGES['/struct/overview'] = {
    data: function () { return { tick: 0, minutes: 60, series: [], netHistory: [], envSeries: [], cage: null,
      cageId: selectedCageId(), requestId: 0,
      trussModelInfo: TRUSS_MODEL_INFO,
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
      syncCageSpec: function () {
        const farm = API.farm();
        const cages = farm && Array.isArray(farm.cages) ? farm.cages : [];
        const cage = cages.find(function (item) { return item.cage_id === this.cageId; }, this);
        if (this.cage !== cage) this.cage = cage || null;
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
      this.unsub = API.bind(this, this.load);
      const self = this;
      this.unsubFarm = API.subscribe(function () { self.syncCageSpec(); });
      this.syncCageSpec();
      this.load();
    },
    beforeUnmount: function () { unbindCurrentCage(this);
      if (this.unsub) { this.unsub(); this.unsub = null; }
      if (this.unsubFarm) { this.unsubFarm(); this.unsubFarm = null; }
    },
    watch: { minutes: function () { this.load(); } },
    template: [
      "<div class=\"show-page\">",
      "<page-head title=\"结构安全 · 网箱结构总览\" desc=\"汇总锚链、网衣与姿态状态；模型为概念示意，覆盖未知保持待核查。\" />",
      "<div class=\"show-body\">",
      "<div v-if=\"scenarioActive\" class=\"hint\">大风大浪模拟演示中，红色预警来自模拟数据。<a href=\"#/struct/alarm\">恢复平常场景</a>",
      "</div>",
      "<div class=\"show-row three\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">结构子系统</div>",
      "<div v-for=\"item in subsystemItems\" :key=\"item.field\" class=\"show-board-risk\">",
      "<span class=\"dot\" :style=\"{background:lightColor(item.tone)}\">",
      "</span>",
      "<span>{{ item.label }}<small>{{ item.text }}</small>",
      "</span>",
      "</div>",
      "<p class=\"show-note\">{{ coverageNote }}</p>",
      "<div class=\"show-actions\">",
      "<a href=\"#/struct/detail\">",
      "<button>监测详情</button>",
      "</a>",
      "<secondary-page title=\"模型说明与现场画面\">",
      "<div class=\"show-body\">",
      "<show-screens :labels=\"['结构几何', '系泊依据', '现场画面']\">",
      "<template #default=\"{screen}\">",
      "<div v-if=\"screen===0\" class=\"show-row two\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">桁架概念模型</div>",
      "<help-dot :info=\"trussModelInfo\" label=\"模型依据\" />",
      "<p class=\"show-note\">{{ trussModelInfo.text }}</p>",
      "<p class=\"show-note\">{{ trussModelInfo.source }}</p>",
      "<p class=\"show-note\">钢桁架、工作通道与护栏、浮力立柱、四面侧网、底网与系泊线均用于结构说明；杆件比例、立柱数量与现场尺寸须由设计资料确认。</p>",
      "</div>",
      "<div class=\"card\">",
      "<div class=\"card-title\">当前设施档案</div>",
      "<p class=\"show-note\">{{ cageLabel }}</p>",
      "<p class=\"show-note\">主体、网衣、锚链共同构成结构模型。设备布点不代表现场测点坐标。</p>",
      "</div>",
      "</div>",
      "<div v-else-if=\"screen===1\" class=\"show-row two\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">四角系泊与几何依据</div>",
      "<help-dot :info=\"mooringModelInfo\" label=\"系泊依据\" />",
      "<p class=\"show-note\">{{ mooringModelInfo.text }}</p>",
      "<p class=\"show-note\">{{ mooringModelInfo.source }}</p>",
      "<p class=\"show-note\">四角导缆点连接海底锚，链线包含悬垂段与铺底段。俯视关系与海底锚位均为概念示意。</p>",
      "</div>",
      "<div class=\"card\">",
      "<div class=\"card-title\">系泊全貌</div>",
      "<svg viewBox=\"0 0 300 116\" role=\"img\" aria-label=\"网箱四角分别连接四个海底锚的俯视示意\" style=\"display:block;width:100%;height:auto;max-height:380px;background:#eaf1f1;border-radius:5px\">",
      "          <g stroke=\"#ad8753\" stroke-width=\"2\" stroke-dasharray=\"5 3\" fill=\"none\">",
      "            <path d=\"M104 35 L28 17 M196 35 L272 17 M196 81 L272 99 M104 81 L28 99\" />",
      "          </g>",
      "          <rect x=\"104\" y=\"35\" width=\"92\" height=\"46\" rx=\"3\" fill=\"#7899a0\" stroke=\"#304e59\" stroke-width=\"3\" />",
      "          <text x=\"150\" y=\"62\" text-anchor=\"middle\" fill=\"#102e3d\" font-size=\"12\">桁架网箱</text>",
      "          <g fill=\"#9b7546\" stroke=\"#554736\" stroke-width=\"1\">",
      "            <circle cx=\"28\" cy=\"17\" r=\"5\"/><circle cx=\"272\" cy=\"17\" r=\"5\"/>",
      "            <circle cx=\"272\" cy=\"99\" r=\"5\"/><circle cx=\"28\" cy=\"99\" r=\"5\"/>",
      "          </g>",
      "          <g fill=\"#34505a\" font-size=\"10\">",
      "            <text x=\"8\" y=\"34\">锚 1</text><text x=\"263\" y=\"34\">锚 2</text>",
      "            <text x=\"263\" y=\"92\">锚 3</text><text x=\"8\" y=\"92\">锚 4</text>",
      "          </g>",
      "        </svg>",
      "</div>",
      "</div>",
      "<video-slot v-else title=\"桁架式网箱现场画面\" desc=\"桁架式网箱实拍素材待接入；此处为视频预留位，并非实时摄像头画面\" />",
      "</template>",
      "</show-screens>",
      "</div>",
      "</secondary-page>",
      "</div>",
      "</div>",
      "<scene-slot focus=\"overview\" full />",
      "<div class=\"card\">",
      "<div class=\"card-title\">代表读数与趋势</div>",
      "<trend-chart title=\"张力占比与倾斜角\" :series=\"charts\" />",
      "<p class=\"show-note\">{{ netRuleText }}仅提示拉力升高，不代表破损或材料强度极限；试行规则未经现场标定。</p>",
      "<div class=\"show-actions\">",
      "<time-range v-model=\"minutes\" />",
      "<a href=\"#/struct/overview\">",
      "<button>结构总览</button>",
      "</a>",
      "<a href=\"#/struct/rules\">",
      "<button>规则与依据</button>",
      "</a>",
      "</div>",
      "</div>",
      "</div>",
      "<div class=\"show-stats\">",
      "<stat-card name=\"当前风险等级\" :value=\"riskText\" unit=\"\"  />",
      "<stat-card name=\"上报锚泊张力\" :value=\"anchorValue\" unit=\"kN\"  />",
      "<stat-card name=\"上报网衣拉力\" :value=\"netValue\" unit=\"kN\"  />",
      "<stat-card name=\"倾斜角合量\" :value=\"last.tilt_angle\" unit=\"°\"  />",
      "</div>",
      "</div>",
      "</div>"
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
    data: function () { return { tick: 0, minutes: 60, series: [], demoBaseTs: Date.now(), pickedLine: '', pickedArea: '',
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
      selectedAnchorCharts: function () {
        if (!this.pickedLine) return this.charts;
        const id = this.pickedLine;
        return [{ name: id + ' 张力', unit: 'kN', data: this.series.map(function (row) {
          const line = mooringLines(row).find(function (item) { return (item.chainId || item.label) === id; });
          return [row.ts, line ? line.tension : null];
        }) }];
      },
      selectedNetCharts: function () {
        if (!this.pickedArea) return this.netCharts;
        const id = this.pickedArea;
        return [{ name: id + ' 拉力', unit: 'kN', data: this.series.map(function (row) {
          const area = netAreas(row).find(function (item) { return item.label === id; });
          return [row.ts, area ? area.value : null];
        }) }];
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
      "<div class=\"show-page\">",
      "<page-head title=\"结构安全 · 监测详情\" desc=\"按锚链、网衣、姿态分屏核查；点击测点记录查看对应趋势。\" />",
      "<div class=\"show-body\">",
      "<div class=\"show-actions\">",
      "<time-range v-model=\"minutes\" />",
      "<span class=\"show-note\">{{ cageSiteLabel }}</span>",
      "<span v-if=\"last.sim_scenario==='storm'\" class=\"show-note\">大风大浪模拟数据</span>",
      "<secondary-page title=\"完整测点与结构几何\">",
      "<div class=\"show-body\">",
      "<show-screens :labels=\"['逐链记录', '分区记录', '网衣几何', '位移与加速度']\">",
      "<template #default=\"{screen}\">",
      "<div v-if=\"screen===0\" class=\"card\">",
      "<div class=\"card-title\">逐链张力与设计允许值</div>",
      "<paged-records :items=\"anchorLines\" :size=\"6\">",
      "<template #default=\"{rows}\">",
      "<table class=\"dt\">",
      "<thead>",
      "<tr>",
      "<th>系泊线 / 编号</th>",
      "<th>张力 / 允许值</th>",
      "<th>利用率 / 状态</th>",
      "</tr>",
      "</thead>",
      "<tbody>",
      "<tr v-for=\"line in rows\" :key=\"line.chainId || line.label\" @click=\"pickedLine=line.chainId || line.label\" :class=\"{selected:pickedLine===(line.chainId || line.label)}\">",
      "<td>",
      "<button @click=\"pickedLine=line.chainId || line.label\">{{ line.chainId || line.label }}</button>",
      "<br>{{ line.label }}</td>",
      "<td>{{ line.tension === null ? '—' : line.tension.toFixed(1) }} / {{ line.design === null ? '—' : line.design.toFixed(1) }} kN</td>",
      "<td>{{ line.pct === null ? '—' : line.pct.toFixed(1)+'%' }}<br>{{ lineState(line) }}</td>",
      "</tr>",
      "</tbody>",
      "</table>",
      "</template>",
      "</paged-records>",
      "<p class=\"show-note\">{{ mooringNote }}</p>",
      "<p class=\"show-note\">每条线按同一编号匹配允许值；最高利用率取逐链比例最大值，不使用张力总和。现场测点编号、总数、各链允许值需再次核对。</p>",
      "</div>",
      "<div v-else-if=\"screen===1\" class=\"card\">",
      "<div class=\"card-title\">分区拉力与设计允许值</div>",
      "<paged-records :items=\"netRegions\" :size=\"6\">",
      "<template #default=\"{rows}\">",
      "<table class=\"dt\">",
      "<thead>",
      "<tr>",
      "<th>网衣区域 / 网绳</th>",
      "<th>拉力 / 允许值</th>",
      "<th>利用率</th>",
      "</tr>",
      "</thead>",
      "<tbody>",
      "<tr v-for=\"area in rows\" :key=\"area.label\" @click=\"pickedArea=area.label\" :class=\"{selected:pickedArea===area.label}\">",
      "<td>",
      "<button style=\"padding:1px 6px\" @click=\"pickedArea=area.label\">{{ area.modelZone || area.label }}</button> <span class=\"small\">{{ area.label }} · {{ area.ropeId || '网绳待确认' }}</span></td>",
      "<td>{{ area.value === null ? '—' : area.value.toFixed(1) }} / {{ area.allowable === null ? '—' : area.allowable.toFixed(1) }} kN</td>",
      "<td>{{ area.pct === null ? '—' : area.pct.toFixed(1)+'%' }}</td>",
      "</tr>",
      "</tbody>",
      "</table>",
      "</template>",
      "</paged-records>",
      "<p class=\"show-note\">{{ netModelLayout ? 'A1/A2、C1/C2 对应两面长侧网，B/D 对应两端面；底网没有侧网读数。' + ((displayLast._demoFields || []).indexOf('net_tension_dist') >= 0 ? '六区顺序为页面演示，真实测点方位待确认。' : '六区顺序来自接口映射，仍需与现场编号核对。') : '分区数据无可确认的六区方位映射，暂不把读数放到模型具体侧面。' }}色深只比较相对拉力，不代表预警等级。</p>",
      "</div>",
      "<div v-else-if=\"screen===2\" class=\"card\">",
      "<div class=\"card-title\">网衣拉力分布 · 俯视与侧网展开</div>",
      "<div v-if=\"netPanels.length\" class=\"struct-net-map\" style=\"flex:1;min-height:0;display:flex\">",
      "        <svg :viewBox=\"netMapViewBox\" style=\"height:100%;width:100%;min-width:0\" role=\"img\" aria-label=\"桁架式网箱俯视与四面侧网展开，各区域以颜色深浅表示相对拉力\">",
      "          <defs>",
      "<pattern id=\"struct-net-weave\" width=\"16\" height=\"16\" patternUnits=\"userSpaceOnUse\">",
      "            <path d=\"M0 0L16 16M16 0L0 16\" fill=\"none\" stroke=\"#214e61\" stroke-opacity=\".42\" stroke-width=\"1\"/>",
      "          </pattern>",
      "</defs>",
      "          <text x=\"52\" y=\"29\" fill=\"#365468\" font-size=\"14\" font-weight=\"600\">俯视位置 · 两长侧、两端面与底网</text>",
      "          <rect :x=\"netMapWidth / 2 - 160\" y=\"44\" width=\"320\" height=\"108\" rx=\"4\" fill=\"#b3cbd0\" stroke=\"#365d70\" stroke-width=\"3\"/>",
      "          <rect :x=\"netMapWidth / 2 - 134\" y=\"69\" width=\"268\" height=\"62\" fill=\"#d8e8e9\"/>",
      "          <rect :x=\"netMapWidth / 2 - 134\" y=\"69\" width=\"268\" height=\"62\" fill=\"url(#struct-net-weave)\"/>",
      "          <text :x=\"netMapWidth / 2\" y=\"105\" text-anchor=\"middle\" fill=\"#38596a\" font-size=\"12\">底网 · 拉力未接入</text>",
      "          <g v-for=\"zone in netPlanZones\" :key=\"zone.label\">",
      "            <rect :x=\"zone.x\" :y=\"zone.y\" :width=\"zone.width\" :height=\"zone.height\" :fill=\"zone.color\" stroke=\"#ecf4f4\" stroke-width=\"1\"/>",
      "            <text :x=\"zone.x + zone.width / 2\" :y=\"zone.y + zone.height / 2 + 4\" text-anchor=\"middle\" fill=\"#193c4d\" font-size=\"11\" font-weight=\"600\">{{ zone.label }}</text>",
      "          </g>",
      "          <text v-if=\"!netModelLayout\" :x=\"netMapWidth / 2\" y=\"140\" text-anchor=\"middle\" fill=\"#365468\" font-size=\"11\">分区数量未与模型建立对应</text>",
      "          <text x=\"52\" y=\"186\" fill=\"#365468\" font-size=\"14\" font-weight=\"600\">{{ netModelLayout ? '侧网展开 · A 长侧 → B 端面 → C 长侧 → D 端面' : '侧网分区展开 · 方位待核对' }}</text>",
      "          <text :x=\"netMapWidth - 52\" y=\"186\" text-anchor=\"end\" fill=\"#547284\" font-size=\"11\">编号仅作几何示意</text>",
      "          <g v-for=\"panel in netPanels\" :key=\"panel.label\">",
      "            <path :d=\"panel.path\" :fill=\"panel.color\" stroke=\"#edf5f6\" stroke-width=\"1\"/>",
      "            <path :d=\"panel.path\" fill=\"url(#struct-net-weave)\"/>",
      "            <line :x1=\"panel.x\" y1=\"216\" :x2=\"panel.x\" y2=\"350\" stroke=\"#54798b\" stroke-width=\"2\"/>",
      "            <rect :x=\"panel.cx - 39\" y=\"261\" width=\"78\" height=\"52\" rx=\"5\" fill=\"#fff\" fill-opacity=\".88\"/>",
      "            <text :x=\"panel.cx\" y=\"278\" text-anchor=\"middle\" fill=\"#25445a\" font-size=\"12\" font-weight=\"600\">{{ panel.zone }}</text>",
      "            <text :x=\"panel.cx\" y=\"298\" text-anchor=\"middle\" fill=\"#183d54\" font-size=\"12\">{{ panel.valueText }}</text>",
      "          </g>",
      "          <rect x=\"52\" y=\"207\" :width=\"netMapWidth - 104\" height=\"9\" rx=\"3\" fill=\"#365d70\"/>",
      "          <rect x=\"52\" y=\"350\" :width=\"netMapWidth - 104\" height=\"6\" rx=\"3\" fill=\"#2f566a\"/>",
      "          <text x=\"52\" y=\"382\" fill=\"#365468\" font-size=\"12\">上缘挂接桁架 · 下缘连接底网；底网无独立拉力值</text>",
      "        </svg>",
      "      </div>",
      "      <div v-else class=\"muted\">暂无区域拉力数据</div>",
      "      <div v-if=\"netScale.min !== null\" class=\"struct-net-scale\">",
      "        <span>相对较低 {{ netScale.min.toFixed(1) }} kN</span>",
      "        <span class=\"struct-net-scale-bar\" aria-hidden=\"true\">",
      "</span>",
      "        <span>相对较高 {{ netScale.max.toFixed(1) }} kN</span>",
      "      </div>",
      "      <p class=\"show-note\">{{ netModelLayout ? 'A1/A2、C1/C2 对应两面长侧网，B/D 对应两端面；底网没有侧网读数。' + ((displayLast._demoFields || []).indexOf('net_tension_dist') >= 0 ? '六区顺序为页面演示，真实测点方位待确认。' : '六区顺序来自接口映射，仍需与现场编号核对。') : '分区数据无可确认的六区方位映射，暂不把读数放到模型具体侧面。' }}色深只比较相对拉力，不代表预警等级。</p>",
      "</div>",
      "<div v-else class=\"show-row two\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">空间位移与形变趋势</div>",
      "<trend-chart title=\"位移与形变\" :series=\"deformationCharts\" />",
      "<p class=\"show-note\">形变量 {{ displayLast.deformation ?? '—' }} m；X {{ displayLast.displacement_x ?? '—' }} m；Y {{ displayLast.displacement_y ?? '—' }} m；Z {{ displayLast.displacement_z ?? '—' }} m。</p>",
      "</div>",
      "<div class=\"card\">",
      "<div class=\"card-title\">三轴加速度</div>",
      "<div v-for=\"item in acceleration\" :key=\"item.field\" class=\"show-board-risk\">",
      "<span>{{ item.label }}</span>",
      "<strong>{{ item.value === null ? '—' : item.value }}</strong>",
      "<span>m/s²</span>",
      "</div>",
      "<p class=\"show-note\">页面演示字段：{{ demoFieldsText || '无' }}。仅用于布局与趋势，不代表实测或真实破损。模拟器提供对应字段后切换为接口数据。</p>",
      "</div>",
      "</div>",
      "</template>",
      "</show-screens>",
      "</div>",
      "</secondary-page>",
      "</div>",
      "<show-screens :labels=\"['锚链张力', '网衣监测', '姿态与形变']\">",
      "<template #default=\"{screen}\">",
      "<template v-if=\"screen===0\">",
      "<div class=\"show-row wide\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">锚链测点布设</div>",
      "<scene-slot focus=\"tension\" />",
      "<p class=\"show-note\">{{ mooringNote }}</p>",
      "</div>",
      "<div class=\"card\">",
      "<div class=\"card-title\">选中锚链与趋势</div>",
      "<select v-model=\"pickedLine\">",
      "<option value=\"\">全部已上报测点</option>",
      "<option v-for=\"line in anchorLines\" :key=\"line.label\" :value=\"line.chainId || line.label\">{{ line.chainId || line.label }}</option>",
      "</select>",
      "<trend-chart title=\"锚链张力趋势\" :series=\"selectedAnchorCharts\" />",
      "<p class=\"show-note\">按同一编号追踪张力；概念布点不代表现场位置，缺测不补造观测值。</p>",
      "</div>",
      "</div>",
      "<div class=\"show-stats\">",
      "<stat-card name=\"上报锚泊张力\" :value=\"anchorValue\" unit=\"kN\"  />",
      "<stat-card name=\"上报最高张力利用率\" :value=\"currentTensionPct\" unit=\"%\"  />",
      "<stat-card name=\"逐链已上报记录\" :value=\"anchorLines.filter(line=>!line.demo).length\" unit=\"条\" :digits=\"0\" />",
      "<stat-card name=\"观测时间\" :value=\"last.ts ? new Date(last.ts).toLocaleTimeString('zh-CN') : '—'\" unit=\"\"  />",
      "</div>",
      "</template>",
      "<template v-else-if=\"screen===1\">",
      "<div class=\"show-row wide\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">网衣测点布设</div>",
      "<scene-slot focus=\"net\" />",
      "<p class=\"show-note\">{{ netHighText }}{{ netCriticalArea ? '最高利用率：'+netCriticalArea.label+'（'+netCriticalArea.pct.toFixed(1)+'%）。' : '各区允许值未接入，暂不判定承载风险。' }}拉力不能单独确定破损位置，需现场检查或独立破损状态数据。</p>",
      "</div>",
      "<div class=\"card\">",
      "<div class=\"card-title\">选中网衣区域与趋势</div>",
      "<select v-model=\"pickedArea\">",
      "<option value=\"\">全部已上报分区</option>",
      "<option v-for=\"area in netRegions\" :key=\"area.label\" :value=\"area.label\">{{ area.modelZone || area.label }} · {{ area.label }}</option>",
      "</select>",
      "<trend-chart title=\"网衣拉力趋势\" :series=\"selectedNetCharts\" />",
      "<p class=\"show-note\">{{ netModelLayout ? 'A1/A2、C1/C2 对应两面长侧网，B/D 对应两端面；底网没有侧网读数。' + ((displayLast._demoFields || []).indexOf('net_tension_dist') >= 0 ? '六区顺序为页面演示，真实测点方位待确认。' : '六区顺序来自接口映射，仍需与现场编号核对。') : '分区数据无可确认的六区方位映射，暂不把读数放到模型具体侧面。' }}色深只比较相对拉力，不代表预警等级。</p>",
      "</div>",
      "</div>",
      "<div class=\"show-stats\">",
      "<stat-card name=\"上报网衣拉力\" :value=\"netValue\" unit=\"kN\"  />",
      "<stat-card name=\"最高受力区域\" :value=\"netHighArea && (netHighArea.modelZone || netHighArea.label)\" unit=\"\"  />",
      "<stat-card name=\"区域记录数量\" :value=\"netRegions.length\" unit=\"区\" :digits=\"0\" />",
      "<stat-card name=\"数据口径\" :value=\"demoFieldsText ? '含页面演示字段' : '接口上报'\" unit=\"\"  />",
      "</div>",
      "</template>",
      "<template v-else>",
      "<div class=\"show-row wide\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">姿态测点与结构</div>",
      "<scene-slot focus=\"pose\" />",
      "<p class=\"show-note\">页面演示字段：{{ demoFieldsText || '无' }}。仅展示布局与趋势，不代表实测。</p>",
      "</div>",
      "<div class=\"card\">",
      "<div class=\"card-title\">横滚与俯仰变化</div>",
      "<trend-chart title=\"横滚与俯仰趋势\" :series=\"attitudeCharts\" />",
      "<p class=\"show-note\">三轴位移、形变量、加速度及对应趋势见完整测点附页。</p>",
      "</div>",
      "</div>",
      "<div class=\"show-stats\">",
      "<stat-card name=\"横滚角\" :value=\"last.tilt_roll\" unit=\"°\"  />",
      "<stat-card name=\"俯仰角\" :value=\"last.tilt_pitch\" unit=\"°\"  />",
      "<stat-card name=\"倾斜角合量\" :value=\"last.tilt_angle\" unit=\"°\"  />",
      "<stat-card name=\"形变量\" :value=\"displayLast.deformation\" unit=\"m\" :digits=\"3\" />",
      "</div>",
      "</template>",
      "</template>",
      "</show-screens>",
      "</div>",
      "</div>"
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
      "<div class=\"show-page\">",
      "<page-head title=\"结构安全 · 规则与判断依据\" desc=\"规则只读展示；试运行阈值需现场标定，未知覆盖不作完整结构结论。\" />",
      "<div class=\"show-body\">",
      "<show-screens :labels=\"['判断规则', '证据与适用范围']\">",
      "<template #default=\"{screen}\">",
      "<div v-if=\"screen===0\" class=\"show-row archive\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">判断边界</div>",
      "<p class=\"show-note\">当前网箱：{{ cageSiteLabel }}</p>",
      "<p class=\"show-note\">网衣正式风险或破损状态优先于试运行线；样本不足时保持待判定。</p>",
      "<p class=\"show-note\">储能低电量不参与结构总览和灾害预警的风险等级。</p>",
      "<p class=\"show-note\">温度规则按当前网箱鱼种配置取值，由环境板块负责水温预警。</p>",
      "<div v-if=\"!fishRules.length\" class=\"hint\">鱼种配置尚未加载，水温规则暂不展示。</div>",
      "<secondary-page title=\"结构阈值与依据\">",
      "<div class=\"show-body\">",
      "<threshold-table owner=\"结构安全\" />",
      "</div>",
      "</secondary-page>",
      "</div>",
      "<div class=\"card\">",
      "<div class=\"card-title\">当前判断规则</div>",
      "<paged-records :items=\"rows\" :size=\"6\">",
      "<template #default=\"{rows}\">",
      "<table class=\"dt\">",
      "<thead>",
      "<tr>",
      "<th>编号</th>",
      "<th>规则</th>",
      "<th>触发条件</th>",
      "<th>等级</th>",
      "</tr>",
      "</thead>",
      "<tbody>",
      "<tr v-for=\"(r,i) in rows\" :key=\"r.id+i\">",
      "<td>{{ r.id }}</td>",
      "<td>{{ r.name }}</td>",
      "<td>{{ r.condition }}</td>",
      "<td>{{ r.level }}</td>",
      "</tr>",
      "</tbody>",
      "</table>",
      "</template>",
      "</paged-records>",
      "</div>",
      "</div>",
      "<div v-else class=\"card\">",
      "<div class=\"card-title\">规则证据与适用范围</div>",
      "<paged-records :items=\"rows\" :size=\"6\">",
      "<template #default=\"{rows}\">",
      "<table class=\"dt\">",
      "<thead>",
      "<tr>",
      "<th>规则</th>",
      "<th>取数字段与汇总口径</th>",
      "<th>依据与适用范围</th>",
      "</tr>",
      "</thead>",
      "<tbody>",
      "<tr v-for=\"(r,i) in rows\" :key=\"r.id+i\">",
      "<td>{{ r.id }}<br>{{ r.name }}</td>",
      "<td>{{ r.source }}</td>",
      "<td>{{ r.basis }}</td>",
      "</tr>",
      "</tbody>",
      "</table>",
      "</template>",
      "</paged-records>",
      "</div>",
      "</template>",
      "</show-screens>",
      "</div>",
      "</div>"
    ].join('\n')
  };

})(window);
