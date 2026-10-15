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
      return { tick: 0, unsub: null, editing: null, picked: '', msg: '', msgOk: null };
    },
    computed: {
      farm: function () { this.tick; return API.farm(); },
      sites: function () { const f = this.farm; return (f && f.sites) || []; },
      cages: function () { const f = this.farm; return (f && f.cages) || []; },
      speciesList: function () { const s = API.species(); return s || []; },
      tempList: function () { const t = API.speciesTemp(); return (t && t.species) || []; },
      ok: function () { return !!(this.farm && this.cages.length); }
    },
    methods: {
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
      API.reloadFarm();
    },
    beforeUnmount: function () { if (this.unsub) { this.unsub(); this.unsub = null; } },
    template: [
      '<div>',
      '  <page-head title="管理 · 网箱与站点"',
      '    desc="<b>这个网箱养什么鱼，全平台的阈值与参数就跟着变</b> —— 改一处，全平台生效（配置驱动）"',
      '    />',
      '',
      '  <div v-if="msg" class="hint" style="margin-bottom:12px"',
      '       :style="msgOk ? { background: \'#F0FDF4\', borderColor: \'#86EFAC\' } : { background: \'#FEF2F2\', borderColor: \'#FECACA\' }">',
      ' {{ msg }}',
      '  </div>',
      '',
      '  <div v-if="!ok" class="card">',
      '    <div class="card-title">需要后端</div>',
      '    <div class="small muted">',
      '      养殖生产配置住在后端 <b>data/farm.json</b>。纯前端演示模式拿不到 ——',
      '      请双击 <b>启动平台.bat</b> 打开。',
      '    </div>',
      '  </div>',
      '',
      '  <template v-else>',
      '    <div v-for="s in sites" :key="s.site_id" class="card" style="margin-bottom:12px">',
      '      <div class="card-title">{{ s.site_name }}',
      '        <span class="small muted" style="font-weight:400">',
      ' {{ s.location_note }} · 水深 {{ s.farming_depth_m }} m · 经 {{ s.longitude }}° 纬 {{ s.latitude }}°',
      '        </span>',
      '      </div>',
      '      <div class="dt-wrap">',
      '        <table class="dt">',
      '          <thead><tr><th>网箱</th><th>养殖鱼种</th><th>最适水温</th><th>水温告警线</th>',
      '            <th>规格</th><th>放养</th><th>存箱量</th><th>状态</th><th></th></tr></thead>',
      '          <tbody>',
      '            <tr v-for="c in cages.filter(function (x) { return x.site_id === s.site_id; })" :key="c.cage_id">',
      '              <td><b>{{ c.cage_name }}</b><br><span class="small mono muted">{{ c.cage_id }}</span></td>',
      '              <td>',
      '                <template v-if="editing !== c.cage_id">',
      '                  <b>{{ c.species }}</b>',
      '                  <span class="small mono muted">{{ speciesTempOf(c.species).species_latin }}</span>',
      '                </template>',
      '                <select v-else v-model="picked" style="max-width:180px">',
      '                  <option v-for="t in tempList" :key="t.species_cn" :value="t.species_cn"',
      '                          :disabled="t.temp_alarm_high === null && t.temp_alarm_low === null">',
      ' {{ t.species_cn }}{{ (t.temp_alarm_high === null && t.temp_alarm_low === null) ? \'（数据不足，不可养）\' : \'\' }}',
      '                  </option>',
      '                </select>',
      '              </td>',
      '              <td class="small">{{ speciesTempOf(c.species).temp_opt_low }}~{{ speciesTempOf(c.species).temp_opt_high }} ℃</td>',
      '              <td class="small">',
      '                <span v-if="speciesTempOf(c.species).temp_alarm_high !== null">',
      '                  低 {{ speciesTempOf(c.species).temp_alarm_low }} / 高 {{ speciesTempOf(c.species).temp_alarm_high }} ℃',
      '                </span>',
      '                <span v-else class="muted">数据不足</span>',
      '              </td>',
      '              <td class="small">周长 {{ c.spec.circumference_m }} m · 深 {{ c.spec.depth_m }} m<br>',
      '                网目 {{ c.spec.net_mesh_mm }} mm · {{ c.spec.shape }}</td>',
      '              <td class="small">{{ c.stocking.date }}<br>{{ c.stocking.init_count }} 尾 · {{ c.stocking.init_size_g }} g</td>',
      '              <td class="mono">{{ c.current_count }} 尾</td>',
      '              <td><span class="hd-badge" style="background:#F0FDF4;border-color:#86EFAC;color:#166534">{{ statusCn(c.status) }}</span></td>',
      '              <td style="white-space:nowrap">',
      '                <button v-if="editing !== c.cage_id" @click="startEdit(c)">改鱼种</button>',
      '                <template v-else>',
      '                  <button class="primary" @click="save(c)">保存</button>',
      '                  <button @click="cancel">取消</button>',
      '                </template>',
      '              </td>',
      '            </tr>',
      '          </tbody>',
      '        </table>',
      '      </div>',
      '      <div v-if="cages[0]" class="hint small" style="margin-top:10px">',
      '        <b>{{ cages[0].note }}</b>',
      '      </div>',
      '    </div>',
      '',
      '    <div class="card">',
      '      <div class="card-title">为什么「鱼种」要放在管理板块</div>',
      '      <div class="small">',
      '        以前平台把「养什么鱼」写死在代码里，参数散落各处 ——',
      '        实测踩过两次：后端硬编码体长体重参数 <span class="mono">0.0218/3.02</span>；',
      '        水温阈值写死 <span class="mono">20.5℃</span>，导致<b>大黄鱼在长得最好的时候被报警</b>。',
      '        <br><br>',
      '        现在以 <span class="mono">data/farm.json</span> 为唯一事实来源：',
      '        这里改鱼种，<b>水温告警线、体长体重参数、盐度/溶解氧要求全部自动重算</b>。',
      '        两处口径永远一致，不会再出现「改了这处漏了那处」。',
      '      </div>',
      '    </div>',
      '  </template>',
      '</div>'
    ].join('\n')
  };

  /* ---------- ② 鱼种档案 ---------- */

  /* ---------- ③ 存箱量台账 ---------- */
  PAGES['/mgmt/ledger'] = {
    data: function () {
      return { tick: 0, unsub: null, cage: '', form: { type: 'mortality', count: -1, note: '' },
               msg: '', msgOk: null };
    },
    computed: {
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
      setTimeout(function () { if (!self.cage && self.cages.length) self.cage = self.cages[0].cage_id; }, 400);
    },
    beforeUnmount: function () { if (this.unsub) { this.unsub(); this.unsub = null; } },
    watch: { cages: function () { if (!this.cage && this.cages.length) this.cage = this.cages[0].cage_id; } },
    template: [
      '<div>',
      '  <page-head title="管理 · 存箱量台账"',
      '    desc="放养 / 分箱 / 死淘 / 起捕 流水 —— <b>期末存箱量由台账算出，不再靠仿真漂移</b>"',
      '    />',
      '',
      '  <div v-if="!cages.length" class="card">',
      '    <div class="card-title">需要后端</div>',
      '    <div class="small muted">台账住在后端 <b>data/farm.json</b>。请双击 <b>启动平台.bat</b>。</div>',
      '  </div>',
      '',
      '  <template v-else>',
      '    <div class="card" style="margin-bottom:12px">',
      '      <div class="row" style="gap:12px;align-items:center">',
      '        <span class="small muted">网箱</span>',
      '        <select v-model="cage" style="min-width:220px">',
      '          <option v-for="c in cages" :key="c.cage_id" :value="c.cage_id">',
      ' {{ c.cage_name }} · {{ c.species }}</option>',
      '        </select>',
      '        <span v-if="sum.species" class="small">',
      ' {{ sum.species }} · {{ sum.stocking_date }} 放养 {{ sum.init_count }} 尾（{{ sum.init_size_g }} g）',
      '        </span>',
      '      </div>',
      '    </div>',
      '',
      '    <div class="grid-stats">',
      '      <stat-card name="期末存箱量" field="stock" unit="尾" :value="sum.current_count" />',
      '      <stat-card name="放养尾数" field="init" unit="尾" :value="sum.init_count" />',
      '      <stat-card name="累计存活率" field="survival" unit="%" :value="sum.survival_pct" />',
      '      <stat-card name="计划起捕" field="harvest" unit="" :value="sum.plan_harvest" />',
      '    </div>',
      '',
      '    <div class="card" style="margin-bottom:12px">',
      '      <div class="card-title">记一笔</div>',
      '      <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">',
      '        <select v-model="form.type" style="min-width:130px">',
      '          <option v-for="t in types" :key="t.k" :value="t.k">{{ t.cn }}</option>',
      '        </select>',
      '        <input type="number" v-model.number="form.count" style="width:110px" placeholder="数量（死淘填负数）">',
      '        <input type="text" v-model="form.note" style="width:260px" placeholder="备注">',
      '        <button class="primary" @click="submit">记账</button>',
      '        <span v-if="msg" class="small"',
      '              :style="{ color: msgOk === false ? \'#991B1B\' : \'#166534\' }">{{ msg }}</span>',
      '      </div>',
      '    </div>',
      '',
      '    <div class="card">',
      '      <div class="card-title">台账流水</div>',
      '      <div class="dt-wrap" style="max-height:420px">',
      '        <table class="dt">',
      '          <thead><tr><th>日期</th><th>网箱</th><th>类型</th><th>数量</th><th>备注</th></tr></thead>',
      '          <tbody>',
      '            <tr v-for="(r, i) in rows" :key="i">',
      '              <td class="mono small">{{ r.ts }}</td>',
      '              <td class="small">{{ r.cage }}</td>',
      '              <td class="small">{{ r.type }}</td>',
      '              <td class="mono" :style="{ color: r.pos ? \'#166534\' : \'#991B1B\' }">{{ r.count }}</td>',
      '              <td class="small">{{ r.note }}</td>',
      '            </tr>',
      '            <tr v-if="!rows.length"><td colspan="5" class="muted small">还没有台账记录</td></tr>',
      '          </tbody>',
      '        </table>',
      '      </div>',
      '      <div class="hint small" style="margin-top:10px">',
      '        <b>为什么台账重要</b>：以前鱼类页的存箱量是纯仿真漂移的数字，',
      '        而<b>总体重直接喂给投喂决策</b> —— 底数不准，投喂量就是错的。',
      '        现在期末存箱量由这张表算出来，仿真只在它基础上加噪声。',
      '      </div>',
      '    </div>',
      '  </template>',
      '</div>'
    ].join('\n')
  };

  /* ---------- ④ 标定与维护 ---------- */
  PAGES['/mgmt/calibration'] = {
    data: function () {
      return { tick: 0, unsub: null, editing: null, inst: '', cert: '', msg: '', msgOk: null };
    },
    computed: {
      d: function () { this.tick; return API.farmDevices(); },
      devices: function () { const x = this.d; return (x && x.devices) || []; },
      s: function () { const x = this.d; return (x && x.summary) || {}; }
    },
    methods: {
      stColor: function (st) {
        return {
          overdue: { bg: '#FEF2F2', br: '#FECACA', fg: '#991B1B' },
          soon:    { bg: '#FFFBEB', br: '#FDE68A', fg: '#92400E' },
          never:   { bg: '#FEF2F2', br: '#FECACA', fg: '#991B1B' },
          ok:      { bg: '#F0FDF4', br: '#86EFAC', fg: '#166534' },
          na:      { bg: '#F3F4F6', br: '#E5E7EB', fg: '#6B7280' }
        }[st] || { bg: '#F3F4F6', br: '#E5E7EB', fg: '#6B7280' };
      },
      typeCn: function (t) {
        return { sensor: '传感器', feeder: '投饵机', light: '灯具' }[t] || t;
      },
      metricCn: function (m) {
        return { water_temp: '水温', dissolved_oxygen: '溶解氧', tilt: '倾角',
                 anchor_tension: '锚泊张力', feed_rate: '投饵量', light_dimming: '调光' }[m] || m;
      },
      start: function (dev) { this.editing = dev.device_id; this.inst = dev.calibration.institution || ''; this.cert = ''; this.msg = ''; },
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
      '<div>',
      '  <page-head title="管理 · 标定与维护"',
      '    desc="设备台账与<b>计量标定</b>状态 —— 把「未经现场标定」从弱点变成可管理的项"',
      '    />',
      '',
      '  <div v-if="!devices.length" class="card">',
      '    <div class="card-title">需要后端</div>',
      '    <div class="small muted">设备台账住在后端 <b>data/farm.json</b>。请双击 <b>启动平台.bat</b>。</div>',
      '  </div>',
      '',
      '  <template v-else>',
      '    <div class="grid-stats">',
      '      <stat-card name="设备总数" field="devices" unit="台" :value="s.device_count" />',
      '      <stat-card name="标定有效" field="ok" unit="台" :value="s.cal_ok" />',
      '      <stat-card name="即将到期" field="soon" unit="台" :value="s.cal_soon" />',
      '      <stat-card name="已超期" field="overdue" unit="台" :value="s.cal_overdue" />',
      '    </div>',
      '',
      '    <div v-if="msg" class="hint" style="margin-bottom:12px"',
      '         :style="msgOk ? { background: \'#F0FDF4\', borderColor: \'#86EFAC\' } : { background: \'#FEF2F2\', borderColor: \'#FECACA\' }">',
      ' {{ msg }}',
      '    </div>',
      '',
      '    <div class="card">',
      '      <div class="card-title">设备台账与标定状态</div>',
      '      <div class="dt-wrap">',
      '        <table class="dt">',
      '          <thead><tr><th>设备编号</th><th>类型 / 测量量</th><th>安装位置</th><th>投用日期</th>',
      '            <th>上次标定</th><th>周期</th><th>下次到期</th><th>状态</th><th>标定机构 / 证书号</th><th></th></tr></thead>',
      '          <tbody>',
      '            <tr v-for="dev in devices" :key="dev.device_id">',
      '              <td class="mono small">{{ dev.device_id }}</td>',
      '              <td class="small">{{ typeCn(dev.device_type) }} · {{ metricCn(dev.metric) }}</td>',
      '              <td class="small">{{ dev.location }}</td>',
      '              <td class="mono small">{{ dev.installed }}</td>',
      '              <td class="mono small">{{ dev.calibration.last || \'—\' }}</td>',
      '              <td class="small">{{ dev.calibration.cycle_days ? dev.calibration.cycle_days + \' 天\' : \'—\' }}</td>',
      '              <td class="mono small">{{ dev.cal_status.due || \'—\' }}</td>',
      '              <td><span class="hd-badge"',
      '                    :style="{ background: stColor(dev.cal_status.state).bg, borderColor: stColor(dev.cal_status.state).br, color: stColor(dev.cal_status.state).fg }">',
      ' {{ dev.cal_status.label }}</span></td>',
      '              <td class="small">{{ dev.calibration.institution || \'—\' }}<br>',
      '                <span class="mono muted">{{ dev.calibration.cert_no || \'\' }}</span></td>',
      '              <td style="white-space:nowrap">',
      '                <template v-if="editing !== dev.device_id">',
      '                  <button v-if="dev.calibration.cycle_days" @click="start(dev)">记标定</button>',
      '                </template>',
      '                <template v-else>',
      '                  <input type="text" v-model="inst" placeholder="标定机构" style="width:150px">',
      '                  <input type="text" v-model="cert" placeholder="证书号" style="width:120px">',
      '                  <button class="primary" @click="save(dev)">保存</button>',
      '                  <button @click="cancel">取消</button>',
      '                </template>',
      '              </td>',
      '            </tr>',
      '          </tbody>',
      '        </table>',
      '      </div>',
      '      <div class="hint small" style="margin-top:10px">',
      '        <b>这一页解决什么问题</b>：其他页面上写着「经验阈值，<b>未经现场标定</b>」——',
      '        这是我们的弱点。有了标定台账，它就从「<i>我们没标定</i>」变成',
      '        「<b>我们有标定计划与周期，只是还没到现场执行</b>」。',
      '        <br><br>',
      '        <b>注意区分三件事，不能混为一谈</b>：',
      '        ① <b>阈值有没有依据</b>（有，见参数配置页的问号）；',
      '        ② <b>传感器准不准</b>（本页，标定管的就是这个）；',
      '        ③ <b>数据是实测还是仿真</b>（海况页的来源标签）。',
      '        答辩时被问「凭什么定 5°/15°」，答的是 ①；被问「你的传感器准吗」，答的是 ②。',
      '      </div>',
      '    </div>',
      '  </template>',
      '</div>'
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
        });
      },
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
                 deformation: '结构形变', low_battery: '低电量', power_supply: '供电异常' }[t] || t;
      },
      stCn: function (s) { return { active: '活跃', acknowledged: '已确认', recovered: '已恢复' }[s] || s; },
      hdCn: function (s) { return { pending: '待处置', handling: '处置中', handled: '已处置', failed: '处置失败' }[s] || s; },
      time: function (ts) { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); },
      /* 点一行 → 就地展开/收起三段（原来是跳去 /trace 整页） */
      pick: function (a) {
        this.picked = (this.picked && this.picked.alarm_event_id === a.alarm_event_id) ? null : a;
      },
      /* 快照里的 ts 是毫秒数，直接甩原始 JSON 不好看 —— 按通用规范格式化成时间 */
      snapRows: function (a) {
        const snap = (a && a.trigger_snapshot) || {};
        const self = this;
        return Object.keys(snap).map(function (k) {
          let v = snap[k];
          if (typeof v === 'number' && /ts|time/i.test(k) && v > 1e11) v = self.time(v);
          if (v === null || v === undefined) v = '—';
          return { k: k, v: String(v) };
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
      '<div>',
      '  <page-head title="管理 · 告警中心"',
      '    desc="顶层统一做一套（裁定 11 B 案），各板块只提供 <code>alarm_event</code> —— 灾害预警、投喂动作、鱼类异常都进这里"',
      '    />',
      '',
      '  <div class="grid-stats">',
      '    <stat-card name="红色预警" unit="条" :value="counts.red" :digits="0" />',
      '    <stat-card name="橙色预警" unit="条" :value="counts.orange" :digits="0" />',
      '    <stat-card name="黄色预警" unit="条" :value="counts.yellow" :digits="0" />',
      '    <stat-card name="蓝色预警" unit="条" :value="counts.blue" :digits="0" />',
      '  </div>',
      '',
      '  <div class="card" style="margin-top:12px">',
      '    <div class="row" style="align-items:center">',
      '      <span class="small muted">等级</span>',
      '      <select v-model="fLevel"><option value="">全部</option><option value="red">红色</option><option value="orange">橙色</option><option value="yellow">黄色</option><option value="blue">蓝色</option></select>',
      '      <span class="small muted">状态</span>',
      '      <select v-model="fStatus"><option value="">全部</option><option value="active">活跃</option><option value="acknowledged">已确认</option><option value="recovered">已恢复</option></select>',
      '      <span class="small muted">类型</span>',
      '      <select v-model="fType"><option value="">全部</option><option v-for="t in types" :key="t" :value="t">{{ typeCn(t) }}</option></select>',
      '      <span style="flex:1"></span>',
      '      <span class="small muted">共 {{ rows.length }} 条</span>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="card">',
      '    <div class="card-title">告警列表（<b>点一行就地展开追溯三段</b>）</div>',
      '    <div v-if="!rows.length" class="todo">没有符合条件的告警</div>',
      '    <div v-else class="dt-wrap">',
      '      <table class="dt">',
      '        <thead><tr><th>事件编号</th><th>等级</th><th>类型</th><th>规则</th><th>预警时间</th><th>状态</th><th>处置</th><th>追溯</th></tr></thead>',
      '        <tbody>',
      '          <template v-for="a in rows" :key="a.alarm_event_id">',
      '          <tr @click="pick(a)" style="cursor:pointer"',
      '              :style="picked && picked.alarm_event_id === a.alarm_event_id ? { background: \'#EFF6FF\' } : {}">',
      '            <td class="mono">{{ a.alarm_event_id }}</td>',
      '            <td><span class="dot" :class="lvCls(a.risk_level)"></span>{{ lvCn(a.risk_level) }}</td>',
      '            <td>{{ typeCn(a.alarm_type) }}</td>',
      '            <td><span class="mono small">{{ a.rule_id }}</span> {{ a.rule_name }}</td>',
      '            <td>{{ time(a.alarm_ts) }}</td>',
      '            <td>{{ stCn(a.alarm_status) }}</td>',
      '            <td>{{ hdCn(a.handle_status) }}</td>',
      '            <td class="small" style="color:#2F5496">',
      ' {{ picked && picked.alarm_event_id === a.alarm_event_id ? \'收起 ▲\' : \'展开追溯 ▼\' }}',
      '            </td>',
      '          </tr>',
      '',
      '          <!-- 追溯三段：原来 /trace 那一页的能力，就地展开（老师第 3 条） -->',
      '          <tr v-if="picked && picked.alarm_event_id === a.alarm_event_id">',
      '            <td colspan="8" style="background:#F8FAFC;padding:12px 14px">',
      '              <div class="kv" style="margin-bottom:10px">',
      '                <span class="k">规则编号</span><span class="mono">{{ picked.rule_id }}</span>',
      '                <span class="k">规则条件</span><span class="mono">{{ picked.rule_condition }}</span>',
      '                <span class="k">组合条件</span><span class="mono">{{ picked.combine_condition || \'—\' }}</span>',
      '                <span class="k">预警等级</span><span>{{ lvCn(picked.risk_level) }}预警</span>',
      '                <span class="k">预警时间</span><span>{{ time(picked.alarm_ts) }}</span>',
      '              </div>',
      '              <div class="card-title" style="font-size:13px">① 哪条数据触发的</div>',
      '              <div class="kv">',
      '                <span class="k">触发字段</span><span class="mono">{{ picked.trigger_field }}</span>',
      '                <span class="k">触发值</span><span><b>{{ picked.trigger_value }}</b></span>',
      '                <span class="k">触发阈值</span><span>{{ picked.trigger_threshold }}</span>',
      '              </div>',
      '              <div class="card-title" style="font-size:13px;margin-top:10px">② 触发数据快照</div>',
      '              <div class="kv">',
      '                <template v-for="r in snapRows(picked)" :key="r.k">',
      '                  <span class="k mono">{{ r.k }}</span><span>{{ r.v }}</span>',
      '                </template>',
      '              </div>',
      '              <div class="card-title" style="font-size:13px;margin-top:10px">③ 结果如何</div>',
      '              <div class="kv">',
      '                <span class="k">处置建议</span><span>{{ picked.handling_advice }}</span>',
      '                <span class="k">处置状态</span><span>{{ hdCn(picked.handle_status) }}</span>',
      '                <span class="k">确认状态</span><span>{{ cfCn(picked.confirm_status) }}</span>',
      '                <span class="k">恢复时间</span><span>{{ picked.recover_ts ? time(picked.recover_ts) : \'尚未恢复\' }}</span>',
      '              </div>',
      '              <div class="row" style="margin-top:10px">',
      '                <a href="#/mgmt/handle"><button>去处置中心 →</button></a>',
      '              </div>',
      '            </td>',
      '          </tr>',
      '          </template>',
      '        </tbody>',
      '      </table>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="hint" style="margin-top:12px">',
      '    <b>答辩卖点</b>：一个告警中心能看到所有板块的异常。',
      '    告警分级规则由结构安全提供，页面与通用组件由顶层统一维护 —— 避免出现四个告警页。',
      '  </div>',
      '</div>'
    ].join('\n')
  };


/* 🔴 2026-10-15 队长搬：老师意见 2026-10-09 第 3 条 —— 拆掉「跨板块」，
   /handle 从跨板块**挪进管理**（/handle → /mgmt/handle）。源码原样搬过来，只改了路由键。 */
  PAGES['/mgmt/handle'] = {
    data: function () { return { tick: 0, picked: null, unsub: null }; },
    computed: {
      alarms: function () { return API.alarms(); },
      pending: function () {
        return this.alarms.filter(function (a) { return a.handle_status !== 'handled'; });
      },
      commands: function () { this.tick; return API.commands(); }
    },
    methods: {
      time: function (ts) { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); },
      lvCls: function (lv) { return 'bg-' + (lv || 'blue'); },
      statusCn: function (s) {
        return { pending: '待处置', handling: '处置中', handled: '已处置', failed: '处置失败' }[s] || s;
      },
      confirmCn: function (s) { return s === 'confirmed' ? '已确认' : '未确认'; },
      pick: function (a) { this.picked = a; },
      /* 处置动作 = 下发一条命令，走同一套状态机 */
      act: function (a, type) {
        this.picked = a;
        a.handle_status = 'handling';
        API.sendCommand('feeder_01', type, { from_alarm: a.alarm_event_id }, {});
      },
      confirmAlarm: function (a) {
        a.confirm_status = 'confirmed';
        a.confirm_ts = Date.now();
        a.alarm_status = 'acknowledged';
        a.handle_status = 'handled';
      }
    },
    mounted: function () {
      const self = this;
      this.unsub = API.subscribe(function () { self.tick++; });
      if (this.pending.length) this.picked = this.pending[0];
    },
    beforeUnmount: function () { if (this.unsub) this.unsub(); },
    template: [
      '<div>',
      '  <page-head title="跨板块 · 处置中心"',
      '    desc="所有处置动作走智能板块的<b>同一套指令状态机</b>（裁定 11 B 案：顶层统一）"',
      '    />',
      '',
      '  <div class="row" style="align-items:flex-start">',
      '    <div class="card" style="flex:0 0 380px">',
      '      <div class="card-title">待处置（{{ pending.length }} 条）</div>',
      '      <div v-if="!pending.length" class="todo">没有待处置的告警</div>',
      '      <div class="events">',
      '        <div v-for="a in pending" :key="a.alarm_event_id" class="row-item" @click="pick(a)"',
      '             :style="{ background: picked && picked.alarm_event_id === a.alarm_event_id ? \'#F1F5F9\' : \'\' }">',
      '          <span class="dot" :class="lvCls(a.risk_level)"></span>',
      '          <span class="d">',
      '            <span class="mono">{{ a.alarm_event_id }}</span> {{ a.rule_name }}',
      '            <div class="small muted">{{ statusCn(a.handle_status) }} · {{ confirmCn(a.confirm_status) }}</div>',
      '          </span>',
      '        </div>',
      '      </div>',
      '    </div>',
      '',
      '    <div style="flex:1;min-width:0">',
      '      <div v-if="!picked" class="todo">左侧选一条告警</div>',
      '      <div v-else>',
      '        <div class="card">',
      '          <div class="card-title">处置：{{ picked.alarm_event_id }}</div>',
      '          <div class="kv">',
      '            <span class="k">告警</span><span>{{ picked.rule_name }}</span>',
      '            <span class="k">建议</span><span>{{ picked.handling_advice }}</span>',
      '            <span class="k">处置状态</span><span>{{ statusCn(picked.handle_status) }}</span>',
      '            <span class="k">确认状态</span><span>{{ confirmCn(picked.confirm_status) }}</span>',
      '          </div>',
      '          <div class="row" style="margin-top:12px">',
      '            <button class="primary" @click="act(picked, \'feed\')">执行处置（下发命令）</button>',
      '            <button @click="confirmAlarm(picked)">确认告警（人工）</button>',
      '            <a href="#/ai/feed"><button>看状态机详情 →</button></a>',
      '          </div>',
      '          <div class="small muted" style="margin-top:8px">',
      '            处置动作不是"点一下就当做完" —— 它下发一条命令，<b>走状态机、等回执</b>，链路与自动投喂完全一致。',
      '          </div>',
      '        </div>',
      '',
      '        <div class="card">',
      '          <div class="card-title">本次会话下发的命令（{{ commands.length }} 条）</div>',
      '          <div v-if="!commands.length" class="todo">还没有下发过命令</div>',
      '          <div v-else class="dt-wrap" style="max-height:300px">',
      '            <table class="dt">',
      '              <thead><tr><th>命令号</th><th>类型</th><th>状态</th><th>重试</th><th>失败原因</th></tr></thead>',
      '              <tbody>',
      '                <tr v-for="c in commands" :key="c.command_id">',
      '                  <td class="mono">{{ c.command_id }}</td><td>{{ CN.commandType(c.command_type) }}</td>',
      '                  <td>{{ statusCn(c.command_status) }}</td><td>{{ c.retry_count }}</td>',
      '                  <td :style="{ color: c.fail_reason ? \'#991B1B\' : \'#6B7280\' }">{{ c.fail_reason || \'—\' }}</td>',
      '                </tr>',
      '              </tbody>',
      '            </table>',
      '          </div>',
      '        </div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n')
  };


/* 🔴 2026-10-15 队长搬：老师意见 2026-10-09 第 7 条 ——
   能源保障页从结构安全**挪进管理**（/struct/energy → /mgmt/energy），
   储能阈值 battery_soc 20%/10% 与 R-BAT-01/02 规则随页面一并转出。
   源码原样搬过来，只改了路由键。 */
  PAGES['/mgmt/energy'] = {
    data: function () { return { minutes: 60, series: [] }; },
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
        if (s === undefined) return 'blue';
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
        API.resolve(API.struct(this.minutes), function (d) { self.series = d; });
      },
      lvCn: function (l) { return { blue: '正常', yellow: '低电量', red: '严重低电量' }[l] || l; }
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
      '  <page-head title="结构安全 · 能源保障"',
      '    desc="光伏 / 储能 / 功耗。<b>kWh 是能量、kW 是功率</b> —— 两者差一个时间维度（裁定 N3）"',
      '    />',
      '',
      '  <div class="grid-stats">',
      '    <stat-card name="光伏发电功率" field="pv_power" unit="kW" :value="last.pv_power" />',
      '    <stat-card name="今日发电量" field="pv_energy_today" unit="kWh" :value="last.pv_energy_today" />',
      '    <stat-card name="储能电量百分比" field="battery_soc" unit="%" :value="last.battery_soc" />',
      '    <stat-card name="储能电量（能量）" field="battery_energy" unit="kWh" :value="last.battery_energy" />',
      '    <stat-card name="电池总容量" field="battery_capacity_kwh" unit="kWh" :value="last.battery_capacity_kwh" source="demo" />',
      '    <stat-card name="总功耗" field="total_power" unit="kW" :value="last.total_power" />',
      '    <stat-card name="能源自给率" field="energy_self_sufficiency" unit="%" :value="last.energy_self_sufficiency" :digits="0" />',
      '    <stat-card name="低电量状态" field="low_battery_status" unit="" :value="lvCn(socLevel)" />',
      '  </div>',
      '',
      '  <div class="split" style="margin-top:12px">',
      '    <trend-chart title="光伏发电与总功耗" :series="charts" />',
      '    <trend-chart title="储能电量变化" :series="socCharts"',
      '      :thresholds="[{value:20,label:\'低电量黄线 20%\',color:\'#92400E\'},{value:10,label:\'严重低电量红线 10%\',color:\'#991B1B\'}]" />',
      '  </div>',
      '',
      '  <div class="card" style="margin-top:12px">',
      '    <div class="card-title">关键设备供电优先级</div>',
      '    <div class="grid-stats">',
      '      <stat-card name="关键设备与优先级" field="critical_device_id / power_priority" unit="" :value="powerPriorityText" :ts="last.ts" />',
      '      <stat-card name="关键设备供电状态" field="critical_device_power_status" unit="" :value="criticalPowerText" :ts="last.ts" />',
      '    </div>',
      '    <div v-if="!last.critical_device_id || last.power_priority === undefined" class="small muted" style="margin-top:8px">当前结构接口尚未提供关键设备编号和优先级配置，因此暂显示 —。</div>',
      '  </div>',
      '',
      '  <div class="hint" style="margin-top:12px">',
      '    换算关系：<code>battery_energy = battery_soc / 100 × battery_capacity_kwh</code>。',
      '    有容量的好处是能源保障页能显示「<b>还剩 x kWh</b>」，而不是只有「剩 y%」—— 后者说不出还剩多少电。',
      '  </div>',
      '',
      '  <div class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <time-range v-model="minutes" />',
      '    <span style="flex:1"></span>',
      '    <span class="small muted">低电量两条线：20% 黄、10% 红</span>',
      '  </div>',
      '</div>',
      '  <threshold-table owner="管理" />',
      /* 🔴 2026-10-15 队长加：能源保障的阈值（储能电量）—— 随能源保障页从结构安全转入管理。
         数据在 components.js 的 C.THRESHOLDS（单一事实来源），
         本页只按 owner 过滤显示自己那几条。 */
    ].join('\n')
  };

})(window);
