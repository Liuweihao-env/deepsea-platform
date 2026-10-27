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
      return { tick: 0, env: {}, fish: {}, st: {}, envTrend: [], unsub: null, requestId: 0 };
    },
    computed: {
      alarms: function () { this.tick; return API.alarms(); },
      activeCount: function () {
        return this.unresolved.length;
      },
      unresolved: function () {
        const rank = { red: 4, orange: 3, yellow: 2, blue: 1 };
        return this.alarms.filter(function (a) { return a.alarm_status !== 'recovered' && this.matchesCage(a); }, this).slice().sort(function (a, b) { return (rank[b.risk_level] || 0) - (rank[a.risk_level] || 0); });
      },
      /* 横幅只放鱼类 / 环境 / 结构三块；智能告警只进入口红点（2026-10-16 会上定） */
      bannerAlarms: function () {
        const MAP = {
          feeding: 'fish', feeding_abnormal: 'fish', fish_anomaly: 'fish', density: 'fish',
          water_temp: 'env', dissolved_oxygen: 'env', salinity: 'env', ph: 'env', light: 'env',
          tension: 'struct', tilt: 'struct', net_damage: 'struct', deformation: 'struct'
        };
        return this.unresolved.filter(function (a) {
          const b = MAP[a.alarm_type];
          /* 没有 alarm_type 的历史/测试告警仍按横幅告警处理；有类型的智能告警只进红点 */
          return a.alarm_type === undefined || b === 'fish' || b === 'env' || b === 'struct';
        });
      },
      topAlarm: function () {
        const rank = { red: 4, orange: 3, yellow: 2, blue: 1 };
        return this.bannerAlarms.slice().sort(function (a, b) { return rank[b.risk_level] - rank[a.risk_level]; })[0] || null;
      },
      devices: function () {
        this.tick;
        const fd = API.farmDevices();
        const ledger = (fd && fd.devices) || [];
        return (API.devices() || []).map(function (d) {
          const detail = ledger.find(function (x) { return x.device_id === d.device_id; }) || {};
          return Object.assign({}, detail, d);
        }).filter(this.matchesCage);
      },
      /* 设备名优先读台账；尚未提供中文名的旧设备按现有类型表显示。 */
      onlineDevices: function () {
        return this.devices.filter(function (d) { return d.device_online; });
      },
      offlineDevices: function () {
        return this.devices.filter(function (d) { return !d.device_online; });
      },
      deviceName: function () {
        const names = { water_temp: '水温传感器', dissolved_oxygen: '溶氧传感器',
          anchor_tension: '锚泊张力传感器', tilt: '倾角传感器', feed_rate: '投饵机', light_dimming: '补光灯' };
        const legacy = { tension_01: '锚泊张力传感器', pv_01: '光伏监测设备' };
        return function (d) { return d.device_name_cn || names[d.metric] || legacy[d.device_id] || CN.deviceType(d.device_type); };
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
        const requestId = ++this.requestId;
        this.env = {}; this.fish = {}; this.st = {}; this.envTrend = [];
        /* 🔴 2026-10-18 队长改：原来写死 site_01。
           改成读全局「当前网箱」所在海域 —— 环境数据仍然来自**真实台站**，
           只是换成该网箱那片海的那个站，不往台站里塞任何值。 */
        const cs = (global.CurrentCage && global.CurrentCage.site)
          ? global.CurrentCage.site() : null;
        API.resolve(API.env(cs || 'site_01', 60, {}), function (d) {
          if (requestId !== self.requestId) return;
          const fast = (d && d.fast) || [], slow = (d && d.slow) || [];
          const latest = fast.length ? fast[fast.length - 1] : {};
          const monthly = slow.length ? slow[slow.length - 1] : {};
          self.envTrend = [
            { name: '水温', unit: '℃', data: fast.map(function (r) { return [r.ts, r.water_temp]; }) },
            { name: '溶解氧', unit: 'mg/L', axis: 1, data: fast.map(function (r) { return [r.ts, r.dissolved_oxygen]; }) }
          ];
          self.env = Object.assign({}, latest, {
            dissolved_oxygen: latest.dissolved_oxygen == null ? monthly.dissolved_oxygen : latest.dissolved_oxygen,
            oxygenTs: latest.dissolved_oxygen == null ? monthly.ts : latest.ts,
            oxygenCadence: latest.dissolved_oxygen == null ? monthly.cadence : null
          });
        });
        /* 鱼类/结构按当前网箱出数（后端接 cage_id） */
        API.resolve(API.fish(30, this.cageArg()), function (f) { if (requestId === self.requestId) self.fish = f.length ? f[f.length - 1] : {}; });
        API.resolve(API.struct(30, { cageId: this.cageArg() }), function (s) { if (requestId === self.requestId) self.st = s.length ? s[s.length - 1] : {}; });
      },
      matchesCage: function (item) {
        const id = this.cageArg();
        if (!id) return true;
        if (item.cage_id) return item.cage_id === id;
        const location = (item.location || '').match(/cage_\d+/);
        if (location) return location[0] === id;
        if (item.device_id && /_\d+$/.test(item.device_id)) return item.device_id.match(/_\d+$/)[0] === id.slice(4);
        if (item.site_id) return item.site_id === global.CurrentCage.site();
        return true;
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
    beforeUnmount: function () { this.requestId++; if (this.unsub) this.unsub(); },
    template: [
      "<div class=\"show-page show-overview\">",
      "  <page-head title=\"养殖运行总览\" desc=\"当前网箱的风险、环境、鱼群与设备，按需进入对应作业。\" />",
      "  <div class=\"show-body\">",
      "    <div class=\"show-row three\">",
      "      <div class=\"show-stack\">",
      "        <section class=\"card\"><div class=\"card-title\">当前养殖</div><div class=\"show-kv\"><span class=\"muted\">养殖鱼种</span><span>{{ (API.farm()?.cages || []).find(c=>c.cage_id===cageArg())?.species || '—' }}</span><span class=\"muted\">未恢复告警</span><span :class=\"{'show-error':activeCount}\">{{activeCount}} 条</span><span class=\"muted\">储能电量</span><span>{{st.battery_soc ?? '—'}} %</span><span class=\"muted\">剩余能量</span><span>{{st.battery_energy ?? '—'}} kWh</span></div><div class=\"show-actions\"><a href=\"#/mgmt/cages\">网箱与站点</a><a href=\"#/mgmt/energy\">能源保障</a></div></section>",
      "        <section class=\"card\"><div class=\"card-title\">环境趋势</div><trend-chart :series=\"envTrend\" small/><p class=\"show-note\">{{env.oxygenCadence==='monthly'?'溶氧为监测点月度均值，非现场实时读数。':'历史观测按原始时标展示。'}}</p><a href=\"#/env/water\">查看水质与完整记录</a></section>",
      "      </div>",
      "      <scene-slot focus=\"overview\" full />",
      "      <div class=\"show-stack\">",
      "        <section class=\"card\"><div class=\"card-title\">板块预警</div><a v-for=\"b in boardCards\" :key=\"b.key\" :href=\"b.href\" class=\"show-board-risk\"><span class=\"dot\" :class=\"lvCls(b.level)\"></span><span>{{b.name}}<small>{{b.note}}</small></span><strong>{{b.count}}</strong></a><div class=\"show-actions\"><a href=\"#/mgmt/alarm\">告警与追溯</a><a href=\"#/mgmt/handle\">处置中心</a></div></section>",
      "        <section class=\"card\"><div class=\"card-title\">设备运行 · {{onlineCount}} / {{devices.length}} 在线</div><p class=\"show-note\"><span class=\"show-success\">在线</span>　{{onlineDevices.length?onlineDevices.map(deviceName).join('、'):'—'}}</p><p class=\"show-note\"><span class=\"show-error\">离线</span>　{{offlineDevices.length?offlineDevices.map(deviceName).join('、'):'—'}}</p><div class=\"show-actions\"><secondary-page title=\"本箱设备与结构摘要\"><div class=\"show-row two\"><section class=\"card\"><div class=\"card-title\">设备状态</div><paged-records :items=\"devices\"><template #default=\"{rows}\"><table class=\"dt\"><thead><tr><th>设备</th><th>类型</th><th>连接</th><th>状态</th></tr></thead><tbody><tr v-for=\"d in rows\" :key=\"d.device_id\"><td>{{deviceName(d)}}</td><td>{{CN.deviceType(d.device_type)}}</td><td>{{d.device_online?'在线':'离线'}}</td><td>{{CN.deviceState(d.device_state)}}</td></tr></tbody></table></template></paged-records></section><section class=\"card\"><div class=\"card-title\">结构与能源摘要</div><div class=\"show-kv\"><span>锚泊张力</span><span>{{st.anchor_tension??'—'}} kN</span><span>横滚 / 俯仰</span><span>{{st.tilt_roll??'—'}}° / {{st.tilt_pitch??'—'}}°</span><span>光伏 / 功耗</span><span>{{st.pv_power??'—'}} / {{st.total_power??'—'}} kW</span></div><a href=\"#/struct/overview\">进入结构安全总览</a></section></div></secondary-page></div></section>",
      "      </div>",
      "    </div>",
      "    <div class=\"show-stats\"><stat-card name=\"预估总体重\" unit=\"kg\" :value=\"fish.total_biomass_kg\"/><stat-card name=\"现存尾数\" unit=\"尾\" :value=\"fish.fish_count\" :digits=\"0\"/><stat-card name=\"水温\" unit=\"℃\" :value=\"env.water_temp\" :quality=\"env.quality\" :ts=\"env.ts\"/><stat-card name=\"溶解氧\" unit=\"mg/L\" :value=\"env.dissolved_oxygen\" :ts=\"env.oxygenTs\"/></div>",
      "  </div>",
      "</div>"
    ].join('\n')
  };

})(window);
