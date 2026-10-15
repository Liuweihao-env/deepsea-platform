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
      '    :sources="[\'simulated\']" />',
      '',
      '  <div v-if="msg" class="hint" style="margin-bottom:12px"',
      '       :style="msgOk ? { background: \'#F0FDF4\', borderColor: \'#86EFAC\' } : { background: \'#FEF2F2\', borderColor: \'#FECACA\' }">',
      '    {{ msg }}',
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
      '          {{ s.location_note }} · 水深 {{ s.farming_depth_m }} m · 经 {{ s.longitude }}° 纬 {{ s.latitude }}°',
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
      '                    {{ t.species_cn }}{{ (t.temp_alarm_high === null && t.temp_alarm_low === null) ? \'（数据不足，不可养）\' : \'\' }}',
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
      '    :sources="[\'simulated\']" />',
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
      '            {{ c.cage_name }} · {{ c.species }}</option>',
      '        </select>',
      '        <span v-if="sum.species" class="small">',
      '          {{ sum.species }} · {{ sum.stocking_date }} 放养 {{ sum.init_count }} 尾（{{ sum.init_size_g }} g）',
      '        </span>',
      '      </div>',
      '    </div>',
      '',
      '    <div class="grid-stats">',
      '      <stat-card name="期末存箱量" field="stock" unit="尾" :value="sum.current_count" source="simulated" />',
      '      <stat-card name="放养尾数" field="init" unit="尾" :value="sum.init_count" source="simulated" />',
      '      <stat-card name="累计存活率" field="survival" unit="%" :value="sum.survival_pct" source="simulated" />',
      '      <stat-card name="计划起捕" field="harvest" unit="" :value="sum.plan_harvest" source="simulated" />',
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
      '        而<b>生物量直接喂给投喂决策</b> —— 底数不准，投喂量就是错的。',
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
      '    :sources="[\'simulated\']" />',
      '',
      '  <div v-if="!devices.length" class="card">',
      '    <div class="card-title">需要后端</div>',
      '    <div class="small muted">设备台账住在后端 <b>data/farm.json</b>。请双击 <b>启动平台.bat</b>。</div>',
      '  </div>',
      '',
      '  <template v-else>',
      '    <div class="grid-stats">',
      '      <stat-card name="设备总数" field="devices" unit="台" :value="s.device_count" source="simulated" />',
      '      <stat-card name="标定有效" field="ok" unit="台" :value="s.cal_ok" source="simulated" />',
      '      <stat-card name="即将到期" field="soon" unit="台" :value="s.cal_soon" source="simulated" />',
      '      <stat-card name="已超期" field="overdue" unit="台" :value="s.cal_overdue" source="simulated" />',
      '    </div>',
      '',
      '    <div v-if="msg" class="hint" style="margin-bottom:12px"',
      '         :style="msgOk ? { background: \'#F0FDF4\', borderColor: \'#86EFAC\' } : { background: \'#FEF2F2\', borderColor: \'#FECACA\' }">',
      '      {{ msg }}',
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
      '                {{ dev.cal_status.label }}</span></td>',
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

})(window);
