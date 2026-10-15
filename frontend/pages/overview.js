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
      onlineCount: function () {
        return this.devices.filter(function (d) { return d.device_online; }).length;
      }
    },
    methods: {
      load: function () {
        const self = this;
        API.resolve(API.env('site_01', 60, {}), function (d) {
          self.envTrend = [
            { name: '水温', unit: '℃', data: d.fast.map(function (r) { return [r.ts, r.water_temp]; }) },
            { name: '溶解氧', unit: 'mg/L', axis: 1, data: d.fast.map(function (r) { return [r.ts, r.dissolved_oxygen]; }) }
          ];
          self.env = d.fast.length ? d.fast[d.fast.length - 1] : {};
        });
        API.resolve(API.fish(30), function (f) { self.fish = f.length ? f[f.length - 1] : {}; });
        API.resolve(API.struct(30), function (s) { self.st = s.length ? s[s.length - 1] : {}; });
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
      '  <div class="hero-band" :class="{ \'is-critical\': topAlarm || (st.battery_soc != null && st.battery_soc < 20) }">',
      '    <div>',
      '      <div class="hero-label">当前最高未恢复预警</div>',
      '      <div class="hero-value" :class="topAlarm ? \'lv-\' + topAlarm.risk_level : \'\'">{{ topAlarm ? lvCn(topAlarm.risk_level) + \'预警\' : \'暂无未恢复告警\' }}</div>',
      '      <div class="hero-note">{{ topAlarm ? topAlarm.rule_name : \'持续关注各板块监测状态\' }}</div>',
      '      <a href="#/mgmt/alarm">查看告警与追溯 →</a>',
      '    </div>',
      '    <div>',
      '      <div class="hero-label">未恢复告警</div>',
      '      <div class="hero-value">{{ activeCount }} <small>条</small></div>',
      '      <div class="hero-note">包含活跃与已确认告警</div>',
      '    </div>',
      '    <div>',
      '      <div class="hero-label">储能电量 · {{ st.battery_soc == null ? \'状态待判定\' : st.battery_soc < 10 ? \'严重低电量\' : st.battery_soc < 20 ? \'低电量\' : \'电量正常\' }}</div>',
      '      <div class="hero-value" :class="{ \'lv-red\': st.battery_soc != null && st.battery_soc < 10 }">{{ st.battery_soc == null ? \'—\' : st.battery_soc }} <small>%</small></div>',
      '      <div class="hero-note">剩余 {{ st.battery_energy == null ? \'—\' : st.battery_energy }} kWh · <a href="#/mgmt/energy">能源保障 →</a></div>',
      '    </div>',
      '  </div>',
      '  <div class="grid-stats">',
      '    <stat-card name="预估总体重" unit="kg" :value="fish.total_biomass_kg" />',
      '    <stat-card name="现存尾数" unit="尾" :value="fish.fish_count" :digits="0" />',
      '    <stat-card name="水温" unit="℃" :value="env.water_temp" :quality="env.quality" :ts="env.ts" />',
      '    <stat-card name="设备在线" :value="onlineCount + \' / \' + devices.length" />',
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
