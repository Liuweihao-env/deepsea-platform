/* ============================================================
   pages/mgmt.js —— 管理板块
   ============================================================
   负责人：队长（顶层统一）

   【这个文件归谁】
     归上面写的那个人（以及他的 AI）。**别人不要改这个文件。**

   【怎么加页面】
     照抄本文件里已有页面的结构，往 PAGES 上注册一个新路由就行：
         PAGES['/mgmt/xxx'] = { data: ..., computed: ..., methods: ..., template: [...] };

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

  /* ---------- ① 网箱与站点 ---------- */
  PAGES['/mgmt/cages'] = {
    data: function () {
      return { tick: 0, unsub: null, unsubCage: null, editing: null, picked: '', msg: '', msgOk: null };
    },
    computed: {
      farm: function () { this.tick; return API.farm(); },
      sites: function () { const f = this.farm; return (f && f.sites) || []; },
      cages: function () { const f = this.farm; return (f && f.cages) || []; },
      currentCage: function () { this.tick; return this.cages.find(function (c) { return c.cage_id === global.CurrentCage.get(); }) || null; },
      speciesList: function () { const s = API.species(); return s || []; },
      tempList: function () { const t = API.speciesTemp(); return (t && t.species) || []; },
      ok: function () { return !!(this.farm && this.cages.length); }
    },
    methods: {
      selectCage: function (id) { global.CurrentCage.set(id); },
      /* 可养的鱼种 = 两个库里都有参数的。没温度参数的鱼不给养 ——
         否则设不出水温阈值，等于给自己挖坑（后端也会拦）。 */
      canRaise: function (cn) {
        return this.tempList.some(function (t) { return t.species_cn === cn; });
      },
      startEdit: function (c) { this.editing = c.cage_id; this.picked = c.species; this.msg = ''; },
      cancel: function () { this.editing = null; this.msg = ''; },
      save: function (c) {
        const self = this;
        if (!this.picked || this.picked === c.species) { this.editing = null; return; }
        API.resolve(API.setCageSpecies(c.cage_id, this.picked), function (r) {
          if (r && r.ok) {
            self.msgOk = true;
            const a = r.applied || {};
            self.msg = '已把 ' + c.cage_name + ' 改养「' + r.new_species + '」—— ' +
              '全平台阈值已重算：水温告警 ' + a.temp_alarm_high + '℃（最适 ' +
              (a.temp_opt || []).join('~') + '℃）';
          } else {
            self.msgOk = false;
            self.msg = (r && r.error) || '改不了（可能是纯前端演示模式）';
          }
          self.editing = null;
        });
      },
      speciesTempOf: function (cn) {
        return this.tempList.filter(function (t) { return t.species_cn === cn; })[0] || {};
      },
      statusCn: function (s) {
        return { in_use: '在用', idle: '空置', maintenance: '维修' }[s] || s || '—';
      }
    },
    mounted: function () {
      const self = this;
      this.unsub = API.subscribe(function () { self.tick++; });
      this.unsubCage = global.CurrentCage.subscribe(function () { self.tick++; self.editing = null; });
      API.reloadFarm();
    },
    beforeUnmount: function () { if (this.unsub) this.unsub(); if (this.unsubCage) this.unsubCage(); },
    template: [
      "<div class=\"show-page\">",
      "<page-head title=\"生产管理 · 网箱与站点\" desc=\"核对站点、网箱与养殖配置；鱼种变更由后端保存并同步全平台阈值。\" />",
      "<div class=\"show-body\">",
      "<div v-if=\"msg\" class=\"hint\">{{ msg }}</div>",
      "<div v-if=\"!ok\" class=\"card\">",
      "<div class=\"empty\">养殖生产配置尚未加载，请确认后端服务已启动。</div>",
      "</div>",
      "<template v-else>",
      "<show-screens :labels=\"['站点与网箱关系', '养殖生产配置']\">",
      "<template #default=\"{screen}\">",
      "<div v-if=\"screen===0\" class=\"show-row archive\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">当前网箱设施档案</div>",
      "<template v-if=\"currentCage\">",
      "<div class=\"show-number\">{{ currentCage.cage_name }}</div>",
      "<div class=\"kv\">",
      "<span class=\"k\">网箱编号</span>",
      "<span>{{ currentCage.cage_id }}</span>",
      "<span class=\"k\">站点归属</span>",
      "<span>{{ sites.find(s=>s.site_id===currentCage.site_id)?.site_name || '待配置' }}</span>",
      "<span class=\"k\">当前鱼种</span>",
      "<span>{{ currentCage.species }}</span>",
      "<span class=\"k\">状态</span>",
      "<span>{{ statusCn(currentCage.status) }}</span>",
      "</div>",
      "<p class=\"show-note\">{{ currentCage.note }}</p>",
      "</template>",
      "<secondary-page title=\"鱼种配置与生效范围\">",
      "<div class=\"show-body\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">配置驱动的生效范围</div>",
      "<p class=\"show-note\">鱼种保存在后端 data/farm.json。变更后水温告警线、体长体重参数、盐度与溶解氧要求统一重算。</p>",
      "<p class=\"show-note\">此前体长体重参数 0.0218/3.02、水温 20.5℃ 被硬编码，造成大黄鱼最适生长阶段报警；现在按鱼种参数库取值。</p>",
      "</div>",
      "</div>",
      "</secondary-page>",
      "</div>",
      "<div class=\"card\">",
      "<div class=\"card-title\">站点目录与网箱关联</div>",
      "<paged-records :items=\"sites\" :size=\"6\">",
      "<template #default=\"{rows}\">",
      "<table class=\"dt\">",
      "<thead>",
      "<tr>",
      "<th>站点</th>",
      "<th>位置 / 经纬度</th>",
      "<th>养殖水深</th>",
      "<th>关联网箱</th>",
      "</tr>",
      "</thead>",
      "<tbody>",
      "<tr v-for=\"s in rows\" :key=\"s.site_id\">",
      "<td>{{ s.site_name }}<br>",
      "<span class=\"small muted\">{{ s.site_id }}</span>",
      "</td>",
      "<td>{{ s.location_note }}<br>{{ s.longitude }}° / {{ s.latitude }}°</td>",
      "<td>{{ s.farming_depth_m ?? '—' }} m</td>",
      "<td>",
      "<button v-for=\"c in cages.filter(c=>c.site_id===s.site_id)\" :key=\"c.cage_id\" @click=\"selectCage(c.cage_id)\">{{ c.cage_name }}</button>",
      "<span v-if=\"!cages.some(c=>c.site_id===s.site_id)\" class=\"muted\">暂无养殖网箱关联</span>",
      "</td>",
      "</tr>",
      "</tbody>",
      "</table>",
      "</template>",
      "</paged-records>",
      "</div>",
      "</div>",
      "<div v-else class=\"show-row wide\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">养殖网箱配置</div>",
      "<paged-records :items=\"cages\" :size=\"6\">",
      "<template #default=\"{rows}\">",
      "<table class=\"dt\">",
      "<thead>",
      "<tr>",
      "<th>网箱 / 状态</th>",
      "<th>鱼种 / 温度要求</th>",
      "<th>规格</th>",
      "<th>放养 / 存箱量</th>",
      "<th>配置</th>",
      "</tr>",
      "</thead>",
      "<tbody>",
      "<tr v-for=\"c in rows\" :key=\"c.cage_id\">",
      "<td>",
      "<button @click=\"selectCage(c.cage_id)\">{{ c.cage_name }}</button>",
      "<br>{{ statusCn(c.status) }} · {{ c.cage_id }}</td>",
      "<td>",
      "<b>{{ c.species }}</b>",
      "<br>",
      "<span class=\"small\">{{ speciesTempOf(c.species).species_latin }}<br>最适 {{ speciesTempOf(c.species).temp_opt_low ?? '—' }}~{{ speciesTempOf(c.species).temp_opt_high ?? '—' }} ℃<br>告警低 {{ speciesTempOf(c.species).temp_alarm_low ?? '—' }} / 高 {{ speciesTempOf(c.species).temp_alarm_high ?? '—' }} ℃</span>",
      "</td>",
      "<td>{{ c.spec.shape }}<br>周长 {{ c.spec.circumference_m }} m · 深 {{ c.spec.depth_m }} m<br>网目 {{ c.spec.net_mesh_mm }} mm</td>",
      "<td>{{ c.stocking.date }}<br>{{ c.stocking.init_count }} 尾 / {{ c.stocking.init_size_g }} g<br>现存 {{ c.current_count }} 尾</td>",
      "<td>",
      "<button @click=\"selectCage(c.cage_id);startEdit(c)\">改鱼种</button>",
      "</td>",
      "</tr>",
      "</tbody>",
      "</table>",
      "</template>",
      "</paged-records>",
      "</div>",
      "<div class=\"card\">",
      "<div class=\"card-title\">当前网箱 · 鱼种编辑</div>",
      "<template v-if=\"currentCage\">",
      "<div class=\"show-number\">{{ currentCage.cage_name }}</div>",
      "<p class=\"show-note\">{{ currentCage.note }}</p>",
      "<template v-if=\"editing===currentCage.cage_id\">",
      "<label class=\"show-form\">养殖鱼种<select v-model=\"picked\">",
      "<option v-for=\"t in tempList\" :key=\"t.species_cn\" :value=\"t.species_cn\" :disabled=\"t.temp_alarm_high===null && t.temp_alarm_low===null\">{{ t.species_cn }}{{ t.temp_alarm_high===null && t.temp_alarm_low===null ? '（数据不足，不可养）' : '' }}</option>",
      "</select>",
      "</label>",
      "<div class=\"show-actions\">",
      "<button class=\"primary\" @click=\"save(currentCage)\">保存鱼种</button>",
      "<button @click=\"cancel\">取消</button>",
      "</div>",
      "</template>",
      "<button v-else @click=\"startEdit(currentCage)\">编辑当前网箱鱼种</button>",
      "<p class=\"show-note\">保存前核对当前网箱。后端校验鱼种温度参数，配置成功后全平台重算阈值。</p>",
      "</template>",
      "</div>",
      "</div>",
      "</template>",
      "</show-screens>",
      "</template>",
      "</div>",
      "</div>"
    ].join('\n')
  };

  /* ---------- ② 鱼种档案 ---------- */

  /* ---------- ③ 存箱量台账 ---------- */
  PAGES['/mgmt/ledger'] = {
    data: function () {
      return { tick: 0, unsub: null, form: { type: 'mortality', count: -1, note: '' },
               msg: '', msgOk: null };
    },
    computed: {
      cage: {
        get: function () { this.tick; return global.CurrentCage.get(); },
        set: function (value) { global.CurrentCage.set(value); }
      },
      data_: function () { this.tick; return API.farmLedger(); },
      farm: function () { this.tick; return API.farm(); },
      cages: function () { const f = this.farm; return (f && f.cages) || []; },
      ledger: function () { const d = this.data_; return (d && d.ledger) || []; },
      sums: function () { const d = this.data_; return (d && d.summaries) || []; },
      typeCn: function () { const d = this.data_; return (d && d.type_cn) || {}; },
      sum: function () {
        const c = this.cage;
        return this.sums.filter(function (x) { return x.cage_id === c; })[0] || {};
      },
      rows: function () {
        const c = this.cage;
        const self = this;
        return this.ledger.filter(function (r) { return !c || r.cage_id === c; })
          .slice().reverse().map(function (r) {
            const signed = r.count > 0 ? '+' + r.count : '' + r.count;
            return { ts: r.ts, cage: r.cage_id, type: r.type_cn || self.typeCn[r.type] || r.type,
                     count: signed, note: r.note, pos: r.count > 0 };
          });
      },
      types: function () {
        const m = this.typeCn;
        return Object.keys(m).map(function (k) { return { k: k, cn: m[k] }; });
      }
    },
    methods: {
      submit: function () {
        const self = this;
        if (!this.cage) { this.msgOk = false; this.msg = '先选一个网箱'; return; }
        const body = { cage_id: this.cage, type: this.form.type,
                       count: Number(this.form.count), note: this.form.note };
        API.resolve(API.addLedger(body), function (r) {
          if (r && r.current_count != null) {
            self.msgOk = true;
            self.msg = '已记账：期末存箱量 ' + r.current_count + ' 尾（存活率 ' + r.survival_pct + '%）';
            self.form.note = '';
          } else {
            self.msgOk = false;
            self.msg = (r && (r.error || r.msg)) || '记账失败（可能是纯前端演示模式）';
          }
        });
      }
    },
    mounted: function () {
      const self = this;
      this.unsub = API.subscribe(function () { self.tick++; });
      API.reloadFarm();
    },
    beforeUnmount: function () { if (this.unsub) { this.unsub(); this.unsub = null; } },
    template: [
      "<div class=\"show-page\">",
      "<page-head title=\"生产管理 · 存箱量台账\" desc=\"核对当前数量，记录放养、分箱、死淘与起捕；期末存箱量由台账计算。\" />",
      "<div class=\"show-body\">",
      "<show-screens :labels=\"['数量核对与记账', '生产变动流水']\">",
      "<template #default=\"{screen}\">",
      "<template v-if=\"screen===0\"><div class=\"show-stats\">",
      "<stat-card name=\"期末存箱量\" :value=\"sum.current_count\" unit=\"尾\" :digits=\"0\" />",
      "<stat-card name=\"放养尾数\" :value=\"sum.init_count\" unit=\"尾\" :digits=\"0\" />",
      "<stat-card name=\"累计存活率\" :value=\"sum.survival_pct\" unit=\"%\"  />",
      "<stat-card name=\"计划起捕\" :value=\"sum.plan_harvest\" unit=\"\"  />",
      "</div><div class=\"show-row two\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">当前生产底数</div>",
      "<div class=\"show-number\">{{ sum.species || '鱼种待配置' }} · {{ sum.current_count ?? '—' }} 尾</div>",
      "<div class=\"kv\">",
      "<span class=\"k\">当前网箱</span>",
      "<span>{{ cages.find(c=>c.cage_id===cage)?.cage_name || '—' }}</span>",
      "<span class=\"k\">放养日期</span>",
      "<span>{{ sum.stocking_date || '—' }}</span>",
      "<span class=\"k\">初始规格</span>",
      "<span>{{ sum.init_size_g ?? '—' }} g</span>",
      "<span class=\"k\">放养量</span>",
      "<span>{{ sum.init_count ?? '—' }} 尾</span>",
      "</div>",
      "<p class=\"show-note\">总体重影响投喂决策，期末存箱量由生产流水计算；仿真以该底数为基础加噪声。</p>",
      "</div>",
      "<div class=\"card\">",
      "<div class=\"card-title\">记录生产变动</div>",
      "<div class=\"show-form\">",
      "<label>变动类型<select v-model=\"form.type\">",
      "<option v-for=\"t in types\" :key=\"t.k\" :value=\"t.k\">{{ t.cn }}</option>",
      "</select>",
      "</label>",
      "<label>数量（死淘填负数）<input type=\"number\" v-model.number=\"form.count\">",
      "</label>",
      "<label>备注<input type=\"text\" v-model=\"form.note\" placeholder=\"本次生产变动依据\">",
      "</label>",
      "</div>",
      "<div v-if=\"msg\" class=\"hint\">{{ msg }}</div>",
      "<div class=\"show-actions\">",
      "<button class=\"primary\" @click=\"submit\">记账</button>",
      "</div>",
      "</div>",
      "</div>",
      "</template><div v-else class=\"card\">",
      "<div class=\"card-title\">当前网箱生产变动流水</div>",
      "<paged-records :items=\"rows\" :size=\"6\">",
      "<template #default=\"{rows}\">",
      "<table class=\"dt\">",
      "<thead>",
      "<tr>",
      "<th>日期</th>",
      "<th>网箱</th>",
      "<th>类型</th>",
      "<th>数量</th>",
      "<th>备注</th>",
      "</tr>",
      "</thead>",
      "<tbody>",
      "<tr v-for=\"(r,i) in rows\" :key=\"i\">",
      "<td>{{ r.ts }}</td>",
      "<td>{{ r.cage }}</td>",
      "<td>{{ r.type }}</td>",
      "<td :class=\"r.pos ? 'show-success' : 'show-error'\">{{ r.count }}</td>",
      "<td>{{ r.note }}</td>",
      "</tr>",
      "</tbody>",
      "</table>",
      "</template>",
      "</paged-records>",
      "</div>",
      "</template>",
      "</show-screens>",
      "<div class=\"show-actions\">",
      "<secondary-page title=\"完整台账流水\">",
      "<div class=\"show-body\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">当前网箱全部流水</div>",
      "<paged-records :items=\"rows\" :size=\"6\">",
      "<template #default=\"{rows}\">",
      "<table class=\"dt\">",
      "<thead>",
      "<tr>",
      "<th>日期</th>",
      "<th>网箱</th>",
      "<th>类型</th>",
      "<th>数量</th>",
      "<th>备注</th>",
      "</tr>",
      "</thead>",
      "<tbody>",
      "<tr v-for=\"(r,i) in rows\" :key=\"i\">",
      "<td>{{ r.ts }}</td>",
      "<td>{{ r.cage }}</td>",
      "<td>{{ r.type }}</td>",
      "<td :class=\"r.pos ? 'show-success' : 'show-error'\">{{ r.count }}</td>",
      "<td>{{ r.note }}</td>",
      "</tr>",
      "</tbody>",
      "</table>",
      "</template>",
      "</paged-records>",
      "<p class=\"show-note\">期末存箱量从台账计算，总体重影响投喂决策。放养、分箱、死淘和起捕都应留存生产依据。</p>",
      "</div>",
      "</div>",
      "</secondary-page>",
      "</div>",
      "</div>",
      "</div>"
    ].join('\n')
  };

  /* ---------- ④ 标定与维护 ---------- */
  PAGES['/mgmt/calibration'] = {
    data: function () {
      return { tick: 0, unsub: null, editing: null, selectedDevice: '', inst: '', cert: '', msg: '', msgOk: null };
    },
    computed: {
      device: function () { return this.devices.find(function (dev) { return dev.device_id === this.selectedDevice; }, this) || this.devices[0] || null; },
      d: function () { this.tick; return API.farmDevices(); },
      devices: function () { const x = this.d; const rank = { overdue: 0, never: 1, soon: 2, ok: 3, na: 4, unconfirmed: 0 }; return ((x && x.devices) || []).slice().sort(function (a, b) { return (rank[a.cal_status.state] ?? 5) - (rank[b.cal_status.state] ?? 5); }); },
      s: function () { const x = this.d; return (x && x.summary) || {}; }
    },
    methods: {
      stColor: function (st) {
        return {
          overdue: { bg: '#FEF2F2', br: '#FECACA', fg: '#991B1B' },
          soon:    { bg: '#FFFBEB', br: '#FDE68A', fg: '#92400E' },
          never:   { bg: '#FEF2F2', br: '#FECACA', fg: '#991B1B' },
          ok:      { bg: '#F0FDF4', br: '#86EFAC', fg: '#166534' },
          na:      { bg: '#F3F4F6', br: '#E5E7EB', fg: '#6B7280' },
          unconfirmed: { bg: '#FFFBEB', br: '#FDE68A', fg: '#92400E' }
        }[st] || { bg: '#F3F4F6', br: '#E5E7EB', fg: '#6B7280' };
      },
      typeCn: function (t) {
        return { sensor: '传感器', feeder: '投饵机', light: '灯具', crane: '网衣绞车' }[t] || t;
      },
      metricCn: function (m) {
        return { water_temp: '水温', dissolved_oxygen: '溶解氧', tilt: '倾角',
                 anchor_tension: '锚泊张力', feed_rate: '投饵量', light_dimming: '调光',
                 crane_action: '起重动作' }[m] || m;
      },
      start: function (dev) { this.editing = dev.device_id; this.inst = (dev.calibration || {}).institution || ''; this.cert = ''; this.msg = ''; },
      cancel: function () { this.editing = null; },
      save: function (dev) {
        const self = this;
        API.resolve(API.calibrate(dev.device_id, this.inst, this.cert), function (r) {
          if (r && r.cal_status) {
            self.msgOk = true;
            self.msg = dev.device_id + ' 已记录标定：' + r.cal_status.label + '（' + r.cal_status.detail + '）';
          } else {
            self.msgOk = false;
            self.msg = (r && (r.error || r.msg)) || '记录失败（可能是纯前端演示模式）';
          }
          self.editing = null;
        });
      }
    },
    mounted: function () {
      const self = this;
      this.unsub = API.subscribe(function () { self.tick++; });
      API.reloadFarm();
    },
    beforeUnmount: function () { if (this.unsub) { this.unsub(); this.unsub = null; } },
    template: [
      "<div class=\"show-page\">",
      "<page-head title=\"生产管理 · 标定与维护\" desc=\"优先处理超期、临期和未确认设备，保留完整设备档案与标定记录。\" />",
      "<div class=\"show-body\">",
      "<div class=\"show-stats\">",
      "<stat-card name=\"已超期\" :value=\"s.cal_overdue\" unit=\"台\" :digits=\"0\" />",
      "<stat-card name=\"即将到期\" :value=\"s.cal_soon\" unit=\"台\" :digits=\"0\" />",
      "<stat-card name=\"标定有效\" :value=\"s.cal_ok\" unit=\"台\" :digits=\"0\" />",
      "<stat-card name=\"待确认出处\" :value=\"s.cal_unconfirmed\" unit=\"台\" :digits=\"0\" />",
      "</div>",
      "<show-screens :labels=\"['维护队列', '标定记录与设备档案']\">",
      "<template #default=\"{screen}\">",
      "<div v-if=\"screen===0\" class=\"show-row wide\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">设备台账 · 共 {{ s.device_count ?? devices.length }} 台</div>",
      "<paged-records :items=\"devices\" :size=\"6\">",
      "<template #default=\"{rows}\">",
      "<table class=\"dt\" style=\"font-size:11px\">",
      "<thead>",
      "<tr>",
      "<th>设备</th>",
      "<th>类型 / 测量量</th>",
      "<th>安装位置</th>",
      "<th>有效性 / 到期</th>",
      "<th>维护</th>",
      "</tr>",
      "</thead>",
      "<tbody>",
      "<tr v-for=\"dev in rows\" :key=\"dev.device_id\">",
      "<td style=\"height:42px;padding:4px 8px;line-height:1.4\">{{ dev.device_name_cn || dev.device_id }}<br>",
      "<span class=\"small muted\">{{ dev.device_id }}</span>",
      "</td>",
      "<td style=\"height:42px;padding:4px 8px;line-height:1.4\">{{ typeCn(dev.device_type) }}<br>{{ metricCn(dev.metric) }}</td>",
      "<td style=\"height:42px;padding:4px 8px;line-height:1.4\">{{ dev.location }}</td>",
      "<td style=\"height:42px;padding:4px 8px;line-height:1.4\">{{ dev.cal_status.label }}<br>{{ dev.cal_status.due || '—' }}</td>",
      "<td style=\"height:42px;padding:4px 8px;line-height:1.4\">",
      "<button @click=\"selectedDevice=dev.device_id\">选择档案</button>",
      "",
      "</td>",
      "</tr>",
      "</tbody>",
      "</table>",
      "</template>",
      "</paged-records>",
      "</div>",
      "<div class=\"card\">",
      "<div class=\"card-title\">当前设备有效性</div>",
      "<template v-if=\"device\">",
      "<div class=\"show-number\">{{ device.device_name_cn || device.device_id }}</div>",
      "<div class=\"kv\">",
      "<span class=\"k\">编号 / 安装位置</span>",
      "<span>{{ device.device_id }} · {{ device.location }}</span>",
      "<span class=\"k\">投用日期</span>",
      "<span>{{ device.installed || '—' }}</span>",
      "<span class=\"k\">上次标定</span>",
      "<span>{{ device.calibration?.last || '—' }}</span>",
      "<span class=\"k\">标定周期</span>",
      "<span>{{ device.calibration?.cycle_days ? device.calibration.cycle_days+' 天' : '—' }}</span>",
      "<span class=\"k\">下次到期</span>",
      "<span>{{ device.cal_status.due || '—' }}</span>",
      "<span class=\"k\">有效性状态</span>",
      "<span>{{ device.cal_status.label }} · {{ device.cal_status.detail }}</span>",
      "<span class=\"k\">机构 / 证书号</span>",
      "<span>{{ device.calibration?.institution || '—' }} / {{ device.calibration?.cert_no || '—' }}</span>",
      "</div>",
      "</template>",
      "<div v-else class=\"empty\">请选择设备</div>",
      "</div>",
      "</div>",
      "<div v-else class=\"show-row two\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">设备档案与依据</div>",
      "<select v-model=\"selectedDevice\">",
      "<option v-for=\"dev in devices\" :key=\"dev.device_id\" :value=\"dev.device_id\">{{ dev.device_name_cn || dev.device_id }}</option>",
      "</select>",
      "<template v-if=\"device\">",
      "<div class=\"show-number\">{{ device.device_name_cn || device.device_id }}</div>",
      "<div class=\"kv\">",
      "<span class=\"k\">编号 / 安装位置</span>",
      "<span>{{ device.device_id }} · {{ device.location }}</span>",
      "<span class=\"k\">投用日期</span>",
      "<span>{{ device.installed || '—' }}</span>",
      "<span class=\"k\">上次标定</span>",
      "<span>{{ device.calibration?.last || '—' }}</span>",
      "<span class=\"k\">标定周期</span>",
      "<span>{{ device.calibration?.cycle_days ? device.calibration.cycle_days+' 天' : '—' }}</span>",
      "<span class=\"k\">下次到期</span>",
      "<span>{{ device.cal_status.due || '—' }}</span>",
      "<span class=\"k\">有效性状态</span>",
      "<span>{{ device.cal_status.label }} · {{ device.cal_status.detail }}</span>",
      "<span class=\"k\">机构 / 证书号</span>",
      "<span>{{ device.calibration?.institution || '—' }} / {{ device.calibration?.cert_no || '—' }}</span>",
      "</div>",
      "</template>",
      "<div v-else class=\"empty\">请选择设备</div>",
      "</div>",
      "<div class=\"card\">",
      "<div class=\"card-title\">记录本次标定</div>",
      "<template v-if=\"device && editing===device.device_id\">",
      "<div class=\"show-form\">",
      "<label>标定机构<input type=\"text\" v-model=\"inst\" placeholder=\"标定机构\">",
      "</label>",
      "<label>证书号<input type=\"text\" v-model=\"cert\" placeholder=\"证书号\">",
      "</label>",
      "</div>",
      "<div class=\"show-actions\">",
      "<button class=\"primary\" @click=\"save(device)\">保存标定记录</button>",
      "<button @click=\"cancel\">取消</button>",
      "</div>",
      "</template>",
      "<button v-else-if=\"device && device.calibration && device.calibration.cycle_days\" @click=\"start(device)\">记录当前设备标定</button>",
      "<div v-else class=\"empty\">当前设备未配置周期标定要求</div>",
      "<div v-if=\"msg\" class=\"hint\">{{ msg }}</div>",
      "<p class=\"show-note\">记录提交到原设备台账接口，保存后核对有效性、机构和证书号。</p>",
      "</div>",
      "</div>",
      "</template>",
      "</show-screens>",
      "</div>",
      "</div>"
    ].join('\n')
  };



/* 🔴 2026-10-15 队长搬：老师意见 2026-10-09 第 3 条 —— 拆掉「跨板块」，
   /alarm 从跨板块**挪进管理**（/alarm → /mgmt/alarm）。源码原样搬过来，只改了路由键。 */
  PAGES['/mgmt/alarm'] = {
    data: function () { return { tick: 0, fLevel: '', fStatus: '', fType: '', unsub: null,
      /* 🔴 2026-10-15 队长加：追溯查询并进来了 —— 点一行就地展开三段，不再跳页。
         原来 /trace 是一整页，老师第 3 条要求删除，能力并入告警中心。 */
      picked: null }; },
    computed: {
      all: function () { this.tick; return API.alarms(); },
      types: function () {
        const s = {};
        this.all.forEach(function (a) { s[a.alarm_type] = 1; });
        return Object.keys(s);
      },
      rows: function () {
        const self = this;
        return this.all.filter(function (a) {
          if (self.fLevel && a.risk_level !== self.fLevel) return false;
          if (self.fStatus && a.alarm_status !== self.fStatus) return false;
          if (self.fType && a.alarm_type !== self.fType) return false;
          return true;
        }).sort(function (a, b) {
          const rank = { red: 4, orange: 3, yellow: 2, blue: 1 };
          return Number(a.alarm_status === 'recovered') - Number(b.alarm_status === 'recovered') || (rank[b.risk_level] || 0) - (rank[a.risk_level] || 0) || b.alarm_ts - a.alarm_ts;
        });
      },
      unresolved: function () { return this.all.filter(function (a) { return a.alarm_status !== 'recovered'; }); },
      counts: function () {
        const c = { red: 0, orange: 0, yellow: 0, blue: 0 };
        this.all.forEach(function (a) { if (c[a.risk_level] !== undefined) c[a.risk_level]++; });
        return c;
      }
    },
    methods: {
      lvCn: function (l) { return { blue: '蓝色', yellow: '黄色', orange: '橙色', red: '红色' }[l] || l; },
      lvCls: function (l) { return 'bg-' + (l || 'blue'); },
      typeCn: function (t) {
        return { tension: '锚泊张力', tilt: '网箱倾斜', net_damage: '网衣破损',
                 deformation: '结构形变', low_battery: '低电量', power_supply: '供电异常',
                 command: '指令异常' }[t] || t;
      },
      stCn: function (s) { return { active: '活跃', acknowledged: '已确认', recovered: '已恢复' }[s] || s; },
      hdCn: function (s) { return { pending: '待处置', handling: '处置中', handled: '已处置', failed: '处置失败' }[s] || s; },
      time: function (ts) { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); },
      /* 点一行 → 就地展开/收起三段（原来是跳去 /trace 整页） */
      pick: function (a) {
        this.picked = (this.picked && this.picked.alarm_event_id === a.alarm_event_id) ? null : a;
      },
      /* 快照里的 ts 是毫秒数，直接甩原始 JSON 不好看 —— 按通用规范格式化成时间 */
      fieldText: function (field) {
        return { tension_pct: '张力占设计值（%）', anchor_tension: '锚泊张力（kN）',
          tilt_roll: '横滚角（°）', tilt_pitch: '俯仰角（°）', tilt_angle: '倾斜角（°）',
          battery_soc: '储能电量（%）', battery_energy: '剩余能量（kWh）',
          wave_height: '浪高（m）', wind_speed: '风速（m/s）', water_temp: '水温（℃）',
          net_tension: '网绳拉力（kN）', dissolved_oxygen: '溶解氧（mg/L）',
          ts: '观测时间', site_id: '站点', device_id: '设备' }[field] || field;
      },
      snapRows: function (a) {
        const snap = (a && a.trigger_snapshot) || {};
        const self = this;
        return Object.keys(snap).map(function (k) {
          let v = snap[k];
          if (typeof v === 'number' && /ts|time/i.test(k) && v > 1e11) v = self.time(v);
          if (v === null || v === undefined) v = '—';
          return { k: k, label: self.fieldText(k), v: String(v) };
        });
      },
      cfCn: function (s2) { return { unconfirmed: '未确认', confirmed: '已确认' }[s2] || s2 || '—'; }
    },
    mounted: function () {
      const self = this;
      this.unsub = API.subscribe(function () { self.tick++; });
    },
    beforeUnmount: function () { if (this.unsub) this.unsub(); },
    template: [
      "<div class=\"show-page\">",
      "<page-head title=\"生产管理 · 告警中心\" desc=\"未恢复事件优先，选择告警后核查触发数据、规则与处置结果。\" />",
      "<div class=\"show-body\">",
      "<div class=\"show-stats\">",
      "<stat-card name=\"未恢复告警\" :value=\"unresolved.length\" unit=\"条\" :digits=\"0\" />",
      "<stat-card name=\"活跃\" :value=\"all.filter(a=>a.alarm_status==='active').length\" unit=\"条\" :digits=\"0\" />",
      "<stat-card name=\"已确认 · 未恢复\" :value=\"all.filter(a=>a.alarm_status==='acknowledged').length\" unit=\"条\" :digits=\"0\" />",
      "<stat-card name=\"历史记录总数\" :value=\"all.length\" unit=\"条\" :digits=\"0\" />",
      "</div>",
      "<show-screens :labels=\"['告警列表', '触发数据追溯', '人工与恢复结果']\">",
      "<template #default=\"{screen}\">",
      "<div v-if=\"screen===0\" class=\"card\">",
      "<div class=\"show-actions\">",
      "<label>等级 <select v-model=\"fLevel\">",
      "<option value=\"\">全部</option>",
      "<option value=\"red\">红色</option>",
      "<option value=\"orange\">橙色</option>",
      "<option value=\"yellow\">黄色</option>",
      "<option value=\"blue\">蓝色</option>",
      "</select>",
      "</label>",
      "<label>状态 <select v-model=\"fStatus\">",
      "<option value=\"\">全部</option>",
      "<option value=\"active\">活跃</option>",
      "<option value=\"acknowledged\">已确认</option>",
      "<option value=\"recovered\">已恢复</option>",
      "</select>",
      "</label>",
      "<label>类型 <select v-model=\"fType\">",
      "<option value=\"\">全部</option>",
      "<option v-for=\"t in types\" :key=\"t\" :value=\"t\">{{ typeCn(t) }}</option>",
      "</select>",
      "</label>",
      "</div>",
      "<paged-records :items=\"rows\" :size=\"6\">",
      "<template #default=\"{rows}\">",
      "<table class=\"dt\">",
      "<thead>",
      "<tr>",
      "<th>事件 / 等级</th>",
      "<th>类型 / 规则</th>",
      "<th>预警时间</th>",
      "<th>状态 / 处置</th>",
      "<th>追溯</th>",
      "</tr>",
      "</thead>",
      "<tbody>",
      "<tr v-for=\"a in rows\" :key=\"a.alarm_event_id\" @click=\"pick(a)\" :class=\"{selected:picked && picked.alarm_event_id===a.alarm_event_id}\">",
      "<td>{{ a.alarm_event_id }}<br>",
      "<span class=\"dot\" :class=\"lvCls(a.risk_level)\">",
      "</span>{{ lvCn(a.risk_level) }}</td>",
      "<td>{{ typeCn(a.alarm_type) }}<br>{{ a.rule_id }} · {{ a.rule_name }}</td>",
      "<td>{{ time(a.alarm_ts) }}</td>",
      "<td>{{ stCn(a.alarm_status) }}<br>{{ hdCn(a.handle_status) }}</td>",
      "<td>",
      "<button @click.stop=\"pick(a)\">选择追溯</button>",
      "</td>",
      "</tr>",
      "</tbody>",
      "</table>",
      "</template>",
      "</paged-records>",
      "</div>",
      "<div v-else-if=\"screen===1\" class=\"show-row two\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">哪条数据触发</div>",
      "<template v-if=\"picked\">",
      "<div class=\"card-title\">{{ picked.alarm_event_id }} · {{ picked.rule_name }}</div>",
      "<div class=\"kv\">",
      "<span class=\"k\">规则条件</span>",
      "<span>{{ picked.rule_condition }}</span>",
      "<span class=\"k\">组合条件</span>",
      "<span>{{ picked.combine_condition || '—' }}</span>",
      "<span class=\"k\">预警等级 / 时间</span>",
      "<span>{{ lvCn(picked.risk_level) }} · {{ time(picked.alarm_ts) }}</span>",
      "<span class=\"k\">触发指标</span>",
      "<span>{{ fieldText(picked.trigger_field) }}</span>",
      "<span class=\"k\">触发值 / 阈值</span>",
      "<span>{{ picked.trigger_value }} / {{ picked.trigger_threshold }}</span>",
      "</div>",
      "</template>",
      "<div v-else class=\"empty\">先在事件列表选择一条告警，再切换到追溯屏</div>",
      "</div>",
      "<div class=\"card\">",
      "<div class=\"card-title\">触发数据快照</div>",
      "<template v-if=\"picked\">",
      "<paged-records :items=\"snapRows(picked)\" :size=\"6\">",
      "<template #default=\"{rows}\">",
      "<table class=\"dt\">",
      "<thead>",
      "<tr>",
      "<th>触发字段</th>",
      "<th>快照值</th>",
      "</tr>",
      "</thead>",
      "<tbody>",
      "<tr v-for=\"r in rows\" :key=\"r.k\">",
      "<td :title=\"r.k\">{{ r.label }}</td>",
      "<td>{{ r.v }}</td>",
      "</tr>",
      "</tbody>",
      "</table>",
      "</template>",
      "</paged-records>",
      "</template>",
      "<div v-else class=\"empty\">尚未选择告警</div>",
      "</div>",
      "</div>",
      "<div v-else class=\"show-row two\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">当前事件</div>",
      "<template v-if=\"picked\">",
      "<div class=\"card-title\">{{ picked.alarm_event_id }} · {{ picked.rule_name }}</div>",
      "<div class=\"kv\">",
      "<span class=\"k\">规则条件</span>",
      "<span>{{ picked.rule_condition }}</span>",
      "<span class=\"k\">组合条件</span>",
      "<span>{{ picked.combine_condition || '—' }}</span>",
      "<span class=\"k\">预警等级 / 时间</span>",
      "<span>{{ lvCn(picked.risk_level) }} · {{ time(picked.alarm_ts) }}</span>",
      "<span class=\"k\">触发指标</span>",
      "<span>{{ fieldText(picked.trigger_field) }}</span>",
      "<span class=\"k\">触发值 / 阈值</span>",
      "<span>{{ picked.trigger_value }} / {{ picked.trigger_threshold }}</span>",
      "</div>",
      "</template>",
      "<div v-else class=\"empty\">先在事件列表选择一条告警，再切换到追溯屏</div>",
      "</div>",
      "<div class=\"card\">",
      "<div class=\"card-title\">处置与恢复分别核查</div>",
      "<template v-if=\"picked\">",
      "<div class=\"kv\">",
      "<span class=\"k\">处置建议</span>",
      "<span>{{ picked.handling_advice }}</span>",
      "<span class=\"k\">处置状态</span>",
      "<span>{{ hdCn(picked.handle_status) }}</span>",
      "<span class=\"k\">确认状态</span>",
      "<span>{{ cfCn(picked.confirm_status) }}</span>",
      "<span class=\"k\">恢复时间</span>",
      "<span>{{ picked.recover_ts ? time(picked.recover_ts) : '尚未恢复' }}</span>",
      "</div>",
      "<div class=\"show-actions\">",
      "<a href=\"#/mgmt/handle\">",
      "<button class=\"primary\">去处置中心</button>",
      "</a>",
      "</div>",
      "</template>",
      "</div>",
      "</div>",
      "</template>",
      "</show-screens>",
      "</div>",
      "</div>"
    ].join('\n')
  };


/* 🔴 2026-10-15 队长搬：老师意见 2026-10-09 第 3 条 —— 拆掉「跨板块」，
   /handle 从跨板块**挪进管理**（/handle → /mgmt/handle）。源码原样搬过来，只改了路由键。 */
  PAGES['/mgmt/handle'] = {
    data: function () { return { tick: 0, picked: null, unsub: null, actionMsg: '' }; },
    computed: {
      alarms: function () { this.tick; return API.alarms(); },
      pending: function () {
        return this.alarms.filter(function (a) { return a.handle_status !== 'handled'; }).sort(function (a, b) { const rank = { red: 4, orange: 3, yellow: 2, blue: 1 }; return (rank[b.risk_level] || 0) - (rank[a.risk_level] || 0); });
      },
      commands: function () {
        this.tick;
        const id = this.picked && this.picked.alarm_event_id;
        return id ? API.commands().filter(function (c) { return c.params && c.params.from_alarm === id; }) : [];
      }
    },
    methods: {
      time: function (ts) { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); },
      lvCls: function (lv) { return 'bg-' + (lv || 'blue'); },
      statusCn: function (s) {
        return { pending: '待处置', handling: '处置中', handled: '已处置', failed: '处置失败' }[s] || s;
      },
      confirmCn: function (s) { return s === 'confirmed' ? '已确认' : '未确认'; },
      pick: function (a) { this.picked = a; },
      /* 先进入所属网箱的作业页核对参数，不能从通用告警直接发设备命令。 */
      act: function (a) {
        this.picked = a;
        const f = API.farm() || {}, cages = f.cages || [], location = (a.location || '').match(/cage_\d+/);
        const cid = a.cage_id || (location && location[0]) || (cages.find(function (c) { return c.site_id === a.site_id; }) || {}).cage_id;
        if (!cid || !cages.some(function (c) { return c.cage_id === cid; })) { this.actionMsg = '告警网箱归属尚未确认，请先核查位置与台账。'; return; }
        this.actionMsg = '';
        if (global.CurrentCage) global.CurrentCage.set(cid);
        const t = a.alarm_type || '';
        const route = /tension|tilt|net|deformation/.test(t) ? '/struct/detail' : /battery|power/.test(t) ? '/mgmt/energy' : /water|oxygen|salinity|ph/.test(t) ? '/env/water' : /command|device/.test(t) ? '/ai/commands' : '/ai/feed';
        global.location.hash = route;
      },
      confirmAlarm: function (a) {
        const self = this;
        if (!API.confirmAlarm) { this.actionMsg = '当前未接后端，无法登记人工处置。'; return; }
        API.confirmAlarm(a.alarm_event_id).then(function (res) {
          if (!res || !res.alarm_event_id) { self.actionMsg = '登记失败：' + ((res && (res.msg || res.error)) || '请重试'); return; }
          self.picked = res; self.actionMsg = '已登记人工处置；告警恢复仍以监测值与恢复时间为准。'; self.tick++;
        }).catch(function () { self.actionMsg = '登记失败，请检查连接后重试。'; });
      }
    },
    mounted: function () {
      const self = this;
      this.unsub = API.subscribe(function () { self.tick++; if (self.picked) self.picked = (API.alarms() || []).find(function (a) { return a.alarm_event_id === self.picked.alarm_event_id; }) || self.picked; });
      if (this.pending.length) this.picked = this.pending[0];
    },
    beforeUnmount: function () { if (this.unsub) this.unsub(); },
    template: [
      "<div class=\"show-page\">",
      "<page-head title=\"生产管理 · 告警处置\" desc=\"人工确认、设备执行和事件恢复分别核查；命令沿用现有状态机与回执。\" />",
      "<div class=\"show-body\"><p v-if=\"actionMsg\" class=\"show-note\" role=\"status\">{{actionMsg}}</p>",
      "<show-screens :labels=\"['告警处置', '关联指令']\">",
      "<template #default=\"{screen}\">",
      "<div v-if=\"screen===0\" class=\"show-row two\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">待处置队列 · {{ pending.length }} 条</div>",
      "<paged-records :items=\"pending\" :size=\"6\">",
      "<template #default=\"{rows}\">",
      "<table class=\"dt\">",
      "<thead>",
      "<tr>",
      "<th>待处置事件</th>",
      "<th>规则</th>",
      "<th>当前状态</th>",
      "</tr>",
      "</thead>",
      "<tbody>",
      "<tr v-for=\"a in rows\" :key=\"a.alarm_event_id\" @click=\"pick(a)\" :class=\"{selected:picked && picked.alarm_event_id===a.alarm_event_id}\">",
      "<td>",
      "<button @click=\"pick(a)\">{{ a.alarm_event_id }}</button>",
      "</td>",
      "<td>{{ a.rule_name }}</td>",
      "<td>{{ statusCn(a.handle_status) }}<br>{{ confirmCn(a.confirm_status) }}</td>",
      "</tr>",
      "</tbody>",
      "</table>",
      "</template>",
      "</paged-records>",
      "</div>",
      "<div class=\"card\">",
      "<div class=\"card-title\">当前事件与处置建议</div>",
      "<template v-if=\"picked\">",
      "<div class=\"show-number\">{{ picked.rule_name }}</div>",
      "<div class=\"kv\">",
      "<span class=\"k\">当前事件</span>",
      "<span>{{ picked.alarm_event_id }}</span>",
      "<span class=\"k\">建议核查</span>",
      "<span>{{ picked.handling_advice }}</span>",
      "<span class=\"k\">人工确认</span>",
      "<span>{{ confirmCn(picked.confirm_status) }}</span>",
      "<span class=\"k\">处置状态</span>",
      "<span>{{ statusCn(picked.handle_status) }}</span>",
      "<span class=\"k\">告警恢复</span>",
      "<span>{{ picked.recover_ts ? time(picked.recover_ts) : '尚未恢复' }}</span>",
      "</div>",
      "<div class=\"show-actions\">",
      "<button class=\"primary\" @click=\"act(picked)\">去所属网箱核查处置</button>",
      "<button @click=\"confirmAlarm(picked)\">确认已人工处置</button>",
      "<a href=\"#/ai/feed\">",
      "<button>状态机详情</button>",
      "</a>",
      "</div>",
      "<p class=\"show-note\">处置中心只按告警归属切换网箱并打开对应作业页；设备命令须在作业页核对参数后经状态机下发，人工确认不代表设备执行或告警恢复。</p>",
      "</template>",
      "<div v-else class=\"empty\">从左侧队列选择告警</div>",
      "</div>",
      "</div>",
      "<div v-else class=\"card\">",
      "<div class=\"card-title\">当前告警关联命令 · {{ picked ? picked.alarm_event_id : '未选择事件' }}</div>",
      "<paged-records :items=\"commands\" :size=\"6\">",
      "<template #default=\"{rows}\">",
      "<table class=\"dt\">",
      "<thead>",
      "<tr>",
      "<th>命令号</th>",
      "<th>类型</th>",
      "<th>状态</th>",
      "<th>重试</th>",
      "<th>失败原因</th>",
      "</tr>",
      "</thead>",
      "<tbody>",
      "<tr v-for=\"c in rows\" :key=\"c.command_id\">",
      "<td>{{ c.command_id }}</td>",
      "<td>{{ CN.commandType(c.command_type) }}</td>",
      "<td>{{ CN.commandStatus(c.command_status) }}</td>",
      "<td>{{ c.retry_count }}</td>",
      "<td>{{ c.fail_reason || '—' }}</td>",
      "</tr>",
      "</tbody>",
      "</table>",
      "</template>",
      "</paged-records>",
      "<p class=\"show-note\">仅展示 params.from_alarm 明确关联当前事件的命令。无关联记录保持空态。</p>",
      "</div>",
      "</template>",
      "</show-screens>",
      "</div>",
      "</div>"
    ].join('\n')
  };


/* 🔴 2026-10-15 队长搬：老师意见 2026-10-09 第 7 条 ——
   能源保障页从结构安全**挪进管理**（/struct/energy → /mgmt/energy），
   储能阈值 battery_soc 20%/10% 与 R-BAT-01/02 规则随页面一并转出。
   源码原样搬过来，只改了路由键。 */
  PAGES['/mgmt/energy'] = {
    data: function () { return { minutes: 60, series: [], energyView: 'equipment', energyTrend: 'soc', requestId: 0, unsub: null, unsubCage: null }; },
    computed: {
      last: function () { return this.series.length ? this.series[this.series.length - 1] : {}; },
      charts: function () {
        return [
          { name: '光伏发电功率', unit: 'kW', data: this.series.map(function (r) { return [r.ts, r.pv_power]; }) },
          { name: '总功耗', unit: 'kW', data: this.series.map(function (r) { return [r.ts, r.total_power]; }) }
        ];
      },
      socCharts: function () {
        return [{ name: '储能电量', unit: '%', data: this.series.map(function (r) { return [r.ts, r.battery_soc]; }) }];
      },
      socLevel: function () {
        const s = this.last.battery_soc;
        if (s === undefined || s === null) return 'unknown';
        return s < 10 ? 'red' : s < 20 ? 'yellow' : 'blue';
      },
      powerPriorityText: function () {
        if (!this.last.critical_device_id || this.last.power_priority === undefined || this.last.power_priority === null) return '—';
        return this.last.critical_device_id + ' · 优先级 ' + this.last.power_priority;
      },
      criticalPowerText: function () {
        const v = this.last.critical_device_power_status;
        return typeof CN.powerSupplyStatus === 'function' ? CN.powerSupplyStatus(v) : '—';
      }
    },
    methods: {
      load: function () {
        const self = this;
        const requestId = ++this.requestId;
        API.resolve(API.struct(this.minutes, { cageId: global.CurrentCage.get() }), function (d) {
          if (requestId === self.requestId) self.series = Array.isArray(d) ? d : [];
        });
      },
      lvCn: function (l) { return { blue: '正常', yellow: '低电量', red: '严重低电量', unknown: '待判定' }[l] || l; }
    },
    mounted: function () {
      /* API.bind：数据变化重算 + 定时刷新曲线 */
      const self = this;
      this.unsubCage = global.CurrentCage.subscribe(function () { self.series = []; self.load(); });
      this.unsub = API.bind(this, this.load);
      this.load();
    },
    beforeUnmount: function () { this.requestId++; if (this.unsub) this.unsub(); if (this.unsubCage) this.unsubCage(); },
    watch: { minutes: function () { this.load(); } },
    template: [
      "<div class=\"show-page\">",
      "<page-head title=\"生产管理 · 能源保障\" desc=\"判断可用电量、发用电收支与关键设备保障；设备布点为概念示意。\" />",
      "<div class=\"show-body\">",
      "<div class=\"show-actions\">",
      "<time-range v-model=\"minutes\" />",
      "<button :class=\"{primary:energyView==='equipment'}\" @click=\"energyView='equipment'\">设备布设</button>",
      "<button :class=\"{primary:energyView==='relation'}\" @click=\"energyView='relation'\">供能关系</button>",
      "<secondary-page title=\"完整能源记录\">",
      "<div class=\"show-body\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">当前网箱能源记录</div>",
      "<paged-records :items=\"series.slice().reverse()\" :size=\"6\">",
      "<template #default=\"{rows}\">",
      "<table class=\"dt\">",
      "<thead>",
      "<tr>",
      "<th>时间</th>",
      "<th>光伏 / 用电</th>",
      "<th>储能比例 / 能量</th>",
      "<th>今日发电 / 自给率</th>",
      "</tr>",
      "</thead>",
      "<tbody>",
      "<tr v-for=\"r in rows\" :key=\"r.ts\">",
      "<td>{{ new Date(r.ts).toLocaleString('zh-CN',{hour12:false}) }}</td>",
      "<td>{{ r.pv_power ?? '—' }} / {{ r.total_power ?? '—' }} kW</td>",
      "<td>{{ r.battery_soc ?? '—' }} % / {{ r.battery_energy ?? '—' }} kWh</td>",
      "<td>{{ r.pv_energy_today ?? '—' }} kWh / {{ r.energy_self_sufficiency ?? '—' }} %</td>",
      "</tr>",
      "</tbody>",
      "</table>",
      "</template>",
      "</paged-records>",
      "</div>",
      "</div>",
      "</secondary-page>",
      "<secondary-page title=\"能源阈值与依据\">",
      "<div class=\"show-body\">",
      "<threshold-table owner=\"管理\" />",
      "</div>",
      "</secondary-page>",
      "</div>",
      "<div class=\"show-row wide\">",
      "<div class=\"card\">",
      "<div class=\"card-title\">发电、储能与用电关系</div>",
      "<scene-slot v-if=\"energyView==='equipment'\" focus=\"energy\" />",
      "<template v-else>",
      "<div style=\"flex:1;display:flex;flex-direction:column;justify-content:center;gap:30px\">",
      "<div class=\"show-row two\" style=\"flex:0\">",
      "<div class=\"hint\">光伏发电<br>",
      "<strong>{{ last.pv_power ?? '—' }} kW</strong>",
      "</div>",
      "<div class=\"hint\">总用电<br>",
      "<strong>{{ last.total_power ?? '—' }} kW</strong>",
      "</div>",
      "</div>",
      "<div style=\"text-align:center\" class=\"show-number\">↓ 发电 / 用电收支 ↓</div>",
      "<div class=\"hint\" style=\"align-self:center;min-width:240px;text-align:center\">储能电池<br>{{ last.battery_energy ?? '—' }} kWh · {{ last.battery_soc ?? '—' }} %<br>容量 {{ last.battery_capacity_kwh ?? '—' }} kWh</div>",
      "</div>",
      "</template>",
      "<p class=\"show-note\">电量保障：{{ lvCn(socLevel) }}；今日发电 {{ last.pv_energy_today ?? '—' }} kWh；自给率 {{ last.energy_self_sufficiency ?? '—' }}%。</p>",
      "<p class=\"show-note\">剩余能量 = 储能比例 / 100 × 电池容量。低电量提示 20%，严重低电量 10%。</p>",
      "</div>",
      "<div class=\"card\">",
      "<div class=\"card-title\">保障趋势与设备优先级</div>",
      "<div class=\"show-actions\" style=\"margin-top:0\">",
      "<button :class=\"{primary:energyTrend==='soc'}\" @click=\"energyTrend='soc'\">储能</button>",
      "<button :class=\"{primary:energyTrend==='power'}\" @click=\"energyTrend='power'\">发电 / 用电</button>",
      "</div>",
      "<trend-chart v-if=\"energyTrend==='soc'\" title=\"储能电量变化\" :series=\"socCharts\" :thresholds=\"[{value:20,label:'低电量 20%',color:'#e7c08d'},{value:10,label:'严重低电量 10%',color:'#efa19a'}]\" />",
      "<trend-chart v-else title=\"光伏发电与总功耗\" :series=\"charts\" />",
      "<div class=\"kv\">",
      "<span class=\"k\">关键设备 / 优先级</span>",
      "<span>{{ powerPriorityText }}</span>",
      "<span class=\"k\">关键设备供电状态</span>",
      "<span>{{ criticalPowerText }}</span>",
      "</div>",
      "<p class=\"show-note\">关键设备编号或优先级未提供时保持 —；不根据概念布点推定现场保障状态。</p>",
      "</div>",
      "</div>",
      "<div class=\"show-stats\">",
      "<stat-card name=\"光伏发电功率\" :value=\"last.pv_power\" unit=\"kW\"  />",
      "<stat-card name=\"总功耗\" :value=\"last.total_power\" unit=\"kW\"  />",
      "<stat-card name=\"剩余能量\" :value=\"last.battery_energy\" unit=\"kWh\"  />",
      "<stat-card name=\"储能比例\" :value=\"last.battery_soc\" unit=\"%\"  />",
      "</div>",
      "</div>",
      "</div>"
    ].join('\n')
  };

})(window);
