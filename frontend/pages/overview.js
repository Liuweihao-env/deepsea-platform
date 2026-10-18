/* ============================================================
   pages/overview.js —— 总览大屏
   ============================================================
   负责人：队长（顶层统一）

   【这个文件归谁】
     归上面写的那个人（以及他的 AI）。**别人不要改这个文件。**

   【怎么加页面】
     照抄本文件里已有页面的结构，往 PAGES 上注册一个新路由就行：
         PAGES['/overview/xxx'] = { data: ..., computed: ..., methods: ..., template: [...] };

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

  PAGES['/overview'] = {
    data: function () {
      return { tick: 0, env: {}, fish: {}, st: {}, envTrend: [], unsub: null };
    },
    computed: {
      alarms: function () { this.tick; return API.alarms(); },
      activeCount: function () {
        return this.unresolved.length;
      },
      unresolved: function () {
        const rank = { red: 4, orange: 3, yellow: 2, blue: 1 };
        return this.alarms.filter(function (a) { return a.alarm_status !== 'recovered'; }).slice().sort(function (a, b) { return (rank[b.risk_level] || 0) - (rank[a.risk_level] || 0); });
      },
      topAlarm: function () {
        const rank = { red: 4, orange: 3, yellow: 2, blue: 1 };
        return this.unresolved.slice().sort(function (a, b) { return rank[b.risk_level] - rank[a.risk_level]; })[0] || null;
      },
      devices: function () { this.tick; return API.devices(); },
      /* 按在线 / 离线分组，并直接列设备名（2026-10-16 会上定第 1 条：
         「设备在线」卡改成**分在线 / 离线两行、直接列设备名**）。
         ⚠️ 现在只能显示 device_id（英文）；《设备状态》页那条
            「设备名改中文」是李志成的活，他加了 device_name_cn 之后这里跟着显示中文。 */
      onlineDevices: function () {
        return this.devices.filter(function (d) { return d.device_online; });
      },
      offlineDevices: function () {
        return this.devices.filter(function (d) { return !d.device_online; });
      },
      deviceName: function () {
        /* 占位：等 device_name_cn 上线后自动变成中文 */
        return function (d) { return d.device_name_cn || d.device_id; };
      },
      /* 三张板块卡（鱼类 / 环境 / 结构安全）—— 智能不进横幅，只在入口亮红点。
         每条告警按 alarm_type 归到板块（和顶栏红点用的是同一套映射）。 */
      boardCards: function () {
        const self = this;
        const MAP = {
          feeding: 'fish', feeding_abnormal: 'fish', fish_anomaly: 'fish', density: 'fish',
          water_temp: 'env', dissolved_oxygen: 'env', salinity: 'env', ph: 'env', light: 'env',
          tension: 'struct', tilt: 'struct', net_damage: 'struct', deformation: 'struct'
        };
        const BOARDS = [
          { key: 'fish',   name: '鱼类监测',     href: '#/fish/monitor' },
          { key: 'env',    name: '环境监测',     href: '#/env/sea' },
          { key: 'struct', name: '结构安全预警', href: '#/struct/alarm' }
        ];
        const rank = { red: 4, orange: 3, yellow: 2, blue: 1 };
        const acc = {};
        BOARDS.forEach(function (b) { acc[b.key] = { count: 0, level: null }; });
        self.unresolved.forEach(function (a) {
          const b = MAP[a.alarm_type];
          if (!b || !acc[b]) return;
          acc[b].count += 1;
          if (!acc[b].level || (rank[a.risk_level] || 0) > (rank[acc[b].level] || 0)) {
            acc[b].level = a.risk_level;
          }
        });
        return BOARDS.map(function (b) {
          const v = acc[b.key];
          return {
            key: b.key, name: b.name, href: b.href,
            count: v.count, level: v.level,
            note: v.count ? self.lvCn(v.level) + '预警 ' + v.count + ' 条' : '无未恢复告警'
          };
        });
      },
      onlineCount: function () {
        return this.devices.filter(function (d) { return d.device_online; }).length;
      }
    },
    methods: {
      load: function () {
        const self = this;
        /* 🔴 2026-10-18 队长改：原来写死 site_01。
           改成读全局「当前网箱」所在海域 —— 环境数据仍然来自**真实台站**，
           只是换成该网箱那片海的那个站，不往台站里塞任何值。 */
        const cs = (global.CurrentCage && global.CurrentCage.site)
          ? global.CurrentCage.site() : null;
        API.resolve(API.env(cs || 'site_01', 60, {}), function (d) {
          self.envTrend = [
            { name: '水温', unit: '℃', data: d.fast.map(function (r) { return [r.ts, r.water_temp]; }) },
            { name: '溶解氧', unit: 'mg/L', axis: 1, data: d.fast.map(function (r) { return [r.ts, r.dissolved_oxygen]; }) }
          ];
          self.env = d.fast.length ? d.fast[d.fast.length - 1] : {};
        });
        /* 鱼类/结构按当前网箱出数（后端接 cage_id） */
        API.resolve(API.fish(30, this.cageArg()), function (f) { self.fish = f.length ? f[f.length - 1] : {}; });
        API.resolve(API.struct(30, this.cageArg()), function (s) { self.st = s.length ? s[s.length - 1] : {}; });
      },
      /* 当前网箱 id —— 传给 fish/struct 让它按网箱出数 */
      /* 当前网箱的尺寸，给 3D 模型用（桁架式：长 × 宽 × 养殖水深）。
         没有 farm 数据时退回会上的默认值 20×20×6。 */
      cageDim: function () {
        this.tick;
        const c = (window.CurrentCage && window.CurrentCage.cage) ? window.CurrentCage.cage() : null;
        const sp = (c && c.spec) || {};
        return {
          length: sp.length_m || 20,
          width: sp.width_m || 20,
          depth: sp.depth_m || 6
        };
      },
      cageArg: function () {
        return (global.CurrentCage && global.CurrentCage.get) ? global.CurrentCage.get() : null;
      },
      lvCls: function (l) { return 'bg-' + (l || 'blue'); },
      lvCn: function (l) { return { red: '红色', orange: '橙色', yellow: '黄色', blue: '蓝色' }[l] || '—'; }
    },
    mounted: function () {
      this.load();
      const self = this;
      /* API.bind = 数据变化时重算 + 每 3 秒自动刷新曲线（见 api-remote.js 的说明）。
         🔴 2026-10-07 加：之前曲线只在进页面时拉一次，是张静止的快照。 */
      this.unsub = API.bind(this, this.load);
    },
    beforeUnmount: function () { if (this.unsub) this.unsub(); },
    template: [
      '<div>',
      '  <page-head title="养殖运行总览" desc="先看当前风险，再查看环境、鱼群与设备运行情况" />',
      '  <!-- ===== 横幅：两层（2026-10-16 会上定第 4 条）=====',
      '       上层 = 三张板块卡（鱼类 / 环境 / 结构安全，各带最高等级色点）；',
      '       下层 = 网箱模型 + 未恢复告警总数 + 储能。',
      '       ⚠️ 智能不进横幅 —— 它没有告警类型，只在顶部入口亮红点。 -->',
      '  <div class="hero-band hero-2layer" :class="{ \'is-critical\': topAlarm || (st.battery_soc != null && st.battery_soc < 20) }">',
      '    <div class="hero-row-top">',
      '      <a v-for="b in boardCards" :key="b.key" class="hero-tile" :href="b.href"',
      '         :class="{ \'is-quiet\': !b.count }">',
      '        <span class="dot" :class="b.level ? lvCls(b.level) : \'bg-blue\'"></span>',
      '        <span class="ht-name">{{ b.name }}</span>',
      '        <span class="ht-count">{{ b.count }}<small> 条</small></span>',
      '        <span class="ht-note">{{ b.note }}</span>',
      '      </a>',
      '    </div>',
      '    <div class="hero-row-bottom">',
      '      <cage-model :length-m="cageDim().length" :width-m="cageDim().width" :depth-m="cageDim().depth"',
      '                  :height="190" :cage-id="cageArg() || \'cage_01\'" />',
      '      <div class="hero-cell">',
      '        <div class="hero-label">未恢复告警</div>',
      '        <div class="hero-value">{{ activeCount }} <small>条</small></div>',
      '        <div class="hero-note">包含活跃与已确认 · <a href="#/mgmt/alarm">告警与追溯 →</a></div>',
      '      </div>',
      '      <div class="hero-cell">',
      '        <div class="hero-label">储能电量 · {{ st.battery_soc == null ? \'状态待判定\' : st.battery_soc < 10 ? \'严重低电量\' : st.battery_soc < 20 ? \'低电量\' : \'电量正常\' }}</div>',
      '        <div class="hero-value" :class="{ \'lv-red\': st.battery_soc != null && st.battery_soc < 10 }">{{ st.battery_soc == null ? \'—\' : st.battery_soc }} <small>%</small></div>',
      '        <div class="hero-note">剩余 {{ st.battery_energy == null ? \'—\' : st.battery_energy }} kWh · <a href="#/mgmt/energy">能源保障 →</a></div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="grid-stats">',
      '    <stat-card name="预估总体重" unit="kg" :value="fish.total_biomass_kg" />',
      '    <stat-card name="现存尾数" unit="尾" :value="fish.fish_count" :digits="0" />',
      '    <stat-card name="水温" unit="℃" :value="env.water_temp" :quality="env.quality" :ts="env.ts" />',
      '    <!-- 设备卡：分「在线 / 离线」两行，直接列设备名（会上定第 1 条） -->',
      '    <div class="card stat-card-devices">',
      '      <div class="sc-title">设备在线 · {{ onlineCount }} / {{ devices.length }}</div>',
      '      <div class="sc-row"><span class="k sc-on">在线</span>',
      '        <span class="v">{{ onlineDevices.length ? onlineDevices.map(deviceName).join(\'、\') : \'—\' }}</span></div>',
      '      <div class="sc-row"><span class="k sc-off">离线</span>',
      '        <span class="v">{{ offlineDevices.length ? offlineDevices.map(deviceName).join(\'、\') : \'—\' }}</span></div>',
      '    </div>',
      '  </div>',
      '  <div class="workspace-grid">',
      '    <trend-chart title="水温与溶解氧趋势（左右轴分单位）" :series="envTrend" />',
      '    <div class="card">',
      '      <div class="card-title">优先关注 · 未恢复告警</div>',
      '      <div class="events">',
      '        <a v-for="a in unresolved" :key="a.alarm_event_id" class="row-item" href="#/mgmt/alarm">',
      '          <span class="dot" :class="lvCls(a.risk_level)"></span>',
      '          <span class="d"><b>{{ a.rule_name }}</b><div class="small muted">{{ a.alarm_event_id }} · {{ CN.alarmStatus(a.alarm_status) }}</div></span>',
      '        </a>',
      '        <div v-if="!unresolved.length" class="empty">暂无未恢复告警</div>',
      '      </div>',
      '      <div class="hero-note">告警已确认不等于已恢复，请核查监测值与恢复时间。</div>',
      '      <a href="#/mgmt/handle">进入处置中心 →</a>',
      '    </div>',
      '  </div>',
      '  <div class="workspace-grid">',
      '    <div class="card">',
      '      <div class="card-title">设备运行</div>',
      '      <div class="dt-wrap"><table class="dt">',
      '        <thead><tr><th>设备</th><th>类型</th><th>连接</th><th>运行状态</th></tr></thead>',
      '        <tbody><tr v-for="d in devices" :key="d.device_id"><td class="mono">{{ d.device_id }}</td><td>{{ CN.deviceType(d.device_type) }}</td><td>{{ d.device_online ? \'在线\' : \'离线\' }}</td><td>{{ CN.deviceState(d.device_state) }}</td></tr></tbody>',
      '      </table></div>',
      '    </div>',
      '    <div class="card">',
      '      <div class="card-title">结构与能源摘要</div>',
      '      <div class="kv">',
      '        <span class="k">锚泊张力</span><span>{{ st.anchor_tension ?? \'—\' }} kN</span>',
      '        <span class="k">横滚 / 俯仰</span><span>{{ st.tilt_roll ?? \'—\' }}° / {{ st.tilt_pitch ?? \'—\' }}°</span>',
      '        <span class="k">光伏功率</span><span>{{ st.pv_power ?? \'—\' }} kW</span>',
      '        <span class="k">总功耗</span><span>{{ st.total_power ?? \'—\' }} kW</span>',
      '      </div>',
      '      <div class="hero-note"><a href="#/struct/overview">查看结构监测 →</a></div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

})(window);
