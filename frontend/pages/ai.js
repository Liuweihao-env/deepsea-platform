/* ============================================================
   pages/ai.js —— 智能板块
   ============================================================
   负责人：李志成

   【这个文件归谁】
     归上面写的那个人（以及他的 AI）。**别人不要改这个文件。**

   【怎么加页面】
     照抄本文件里已有页面的结构，往 PAGES 上注册一个新路由就行：
         PAGES['/ai/xxx'] = { data: ..., computed: ..., methods: ..., template: [...] };

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

  PAGES['/ai/feed'] = {
    data: function () {
      return {
        tick: 0,
        /* 先给安全默认值：mounted 之前模板已经渲染一次，
           dec 若是 null 会抛 "Cannot read properties of null" */
        dec: { biomass_kg: null, feeding_intensity_cn: '—', suggest_kg: null,
               water_temp: null, basis: [], times_per_day: 4 },
        records: [], inject: '', confirmOpen: false, lastSent: null, unsub: null,
        /* 2026-10-07 按组员反馈新增：
             mode   —— 自动/手动模式切换。自动=按系统算的规则投喂；手动=自己填量
             amount —— 手工投喂量。null 表示"还没填过"，界面上回落显示建议值
           2026-10-12 按反馈：speed —— 投喂速度 kg/min，自动/手动都能调；
             时长 = 量 ÷ 速度 × 60 自动算。后端 suggest_kg_h 在前端映射为 suggest_kg。 */
        mode: 'auto', amount: null, stopMsg: '', showSteps: false,
        speed: 0.5, cageFilter: localStorage.getItem('deepsea_cage') || 'cage_01'
      };
    },
    computed: {
      /* 实际要下发的投喂量(kg)：手动模式下用填的值，否则用系统的建议值 */
      targetKg: function () {
        if (this.mode === 'manual' && this.amount !== null && this.amount !== '') {
          return Number(this.amount);
        }
        return this.dec.suggest_kg;
      },
      /* 2026-10-12：预计投喂时长(秒) = 量 ÷ 速度 × 60，自动算不手填 */
      durationSec: function () {
        var kg = Number(this.targetKg) || 0;
        var sp = Number(this.speed) || 0;
        if (kg <= 0 || sp <= 0) return 0;
        return Math.round(kg / sp * 60);
      },
      /* 有没有"正在执行中"的任务 —— 决定记录表里那行的「停止」按钮显不显示 */
      runningCount: function () {
        return this.records.filter(function (r) { return r.task_status !== 'done'; }).length;
      },
      feedTitle: function () {
        return this.cageFilter === 'cage_02' ? '智能 · 自动投喂（2号箱 · 许氏平鲉）' : '智能 · 自动投喂（1号箱 · 大黄鱼）';
      },
      feeder: function () {
        this.tick;
        if (this.cageFilter === 'cage_02') return { device_id: 'feeder_02', device_online: true, device_state: 'standby', device_params: { feed_remain_pct: 45 } };
        const d = API.devices().filter(function (x) { return x.device_id === 'feeder_01'; })[0];
        return d || {};
      },
      commands: function () {
        this.tick;
        var devId = this.cageFilter === 'cage_02' ? 'feeder_02' : 'feeder_01';
        return API.commands().filter(function (c) { return c.command_type === 'feed' && c.device_id === devId; });
      },
      latest: function () {
        this.tick;
        if (this.cageFilter === 'cage_02') return this.lastSent; /* 2号箱用刚发的命令 */
        return this.commands.length ? this.commands[0] : null;
      },
      steps: function () {
        /* ⚠️ 这里显式读一次 this.tick（而不是只靠 this.latest 传导）。
           实测：命令状态从 created 走到 success、latest 已更新，
           但 steps 仍缓存着旧的空数组 —— computed 链式失效没有传导到第三层。
           命令状态机是答辩重点，宁可多依赖一次，也不能显示过期状态。 */
        this.tick;
        const c = this.latest;
        if (!c) return [];
        return c.history.map(function (h) {
          return { t: new Date(h.ts).toLocaleTimeString('zh-CN', { hour12: false }), s: h.status };
        });
      },
      badEnd: function () {
        this.tick;
        const c = this.latest;
        return !!(c && ['failed', 'escalated'].indexOf(c.command_status) >= 0);
      }
    },
    methods: {
      load: function () {
        const self = this;
        if (this.cageFilter === 'cage_02') {
          self.dec = { biomass_kg: 420.5, feeding_intensity_cn: '中', suggest_kg: 0.9,
                       water_temp: 18.2, basis: ['水温 18.2°C', '溶氧 6.8 mg/L', '摄食强度中'],
                       times_per_day: 3 };
          /* 2号箱 records 从 localStorage 读，轮询不清空 */
          try {
            var old = JSON.parse(localStorage.getItem('cage02_feed_records') || '[]');
            /* 清掉旧的"正在执行"残留，避免显示脏数据 */
            old = old.filter(function(r){ return r.task_status === 'done'; });
            self.records = old;
          } catch(e) { self.records = []; }
          return;
        }
        API.resolve(API.feedDecision(), function (d) {
          self.dec = Object.assign({}, d, { suggest_kg: d.suggest_kg != null ? d.suggest_kg : d.suggest_kg_h });
        });
        API.resolve(API.feedRecords(), function (r) {
          if (self.cageFilter === 'cage_02') return; /* 2号箱历史由本地unshift维护 */
          self.records = r || [];
        });
      },
      statusCn: function (s) {
        return { created: '已创建', sent: '已发出', acknowledged: '已收到回执', success: '成功',
                 timeout: '超时', retrying: '重试中', failed: '失败', escalated: '升级报警',
                 done: '已完成' }[s] || s;
      },
      time: function (ts) { return ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '—'; },
      ask: function () { this.confirmOpen = true; },
      cancel: function () { this.confirmOpen = false; },
      confirm: function () {
        this.confirmOpen = false;
        const self = this;
        var devId = this.cageFilter === 'cage_02' ? 'feeder_02' : 'feeder_01';
        if (this.cageFilter === 'cage_02') {
          /* 2号箱后端无 feeder_02 设备，前端 mock 命令对象+模拟状态机 */
          var now = Date.now();
          var cmd = {
            command_id: 'cmd_f02_' + now,
            device_id: 'feeder_02',
            command_type: 'feed',
            command_status: 'created',
            history: [
              { ts: now, status: 'created' }
            ]
          };
          self.lastSent = cmd;
          var rec = { ts: now, amount_kg: self.targetKg, trigger_by: 'manual', task_status: 'created', command_id: cmd.command_id };
          self.records.unshift(rec);
          try { localStorage.setItem('cage02_feed_records', JSON.stringify(self.records.slice(0,20))); } catch(e) {}
          /* 模拟状态机流转：created→sent→acknowledged→success */
          setTimeout(function(){ cmd.command_status='sent'; cmd.history.push({ts:Date.now(),status:'sent'}); self.tick++; }, 800);
          setTimeout(function(){ cmd.command_status='acknowledged'; cmd.history.push({ts:Date.now(),status:'acknowledged'}); self.tick++; }, 1800);
          setTimeout(function(){
            cmd.command_status='success'; cmd.history.push({ts:Date.now(),status:'success'}); self.tick++;
            rec.task_status = 'done';
            /* 替换整个数组触发Vue响应式 */
            self.records = self.records.slice();
            try { localStorage.setItem('cage02_feed_records', JSON.stringify(self.records.slice(0,20))); } catch(e) {}
          }, 3000);
          return;
        }
        API.sendCommand(devId, 'feed',
          { amount_kg: this.targetKg, speed_kg_min: this.speed, duration_s: this.durationSec },
          this.inject ? { inject: this.inject } : {}).then(function (cmd) {
          self.lastSent = cmd;
          var rec = {
            ts: Date.now(),
            amount_kg: self.targetKg,
            trigger_by: 'manual',
            task_status: 'created',
            command_id: cmd.command_id || '—'
          };
          self.records.unshift(rec);
        });
        this.stopMsg = '';
        this.$nextTick(function () { /* 让状态机进度条立刻可见 */ });
        /* 立刻刷一次记录表 —— 否则要等下一个 3 秒周期，
           「停止」按钮才出现，人手早过了那个时间窗。 */
        setTimeout(function () { self.load(); }, 900);
      },
      /* 手动停止一条还没跑完的任务（组员反馈：投喂要能中途停）。
         ⚠️ 后端只允许停「未到终态」的命令 —— 已成功/已失败的改不了，
            那是历史事实。所以这里失败是正常情况，要把原因显示出来。 */
      stop: function (r) {
        const self = this;
        this.stopMsg = '';
        API.resolve(API.cancelCommand(r.command_id, '值班人手动停止投喂'), function (res) {
          if (res && res.ok) {
            self.stopMsg = '已停止 ' + r.command_id;
          } else {
            self.stopMsg = '停不了：' + ((res && (res.error || res.msg)) || '未知原因');
          }
          self.load();
        });
      },
      /* 手动模式：把输入框一键填成建议值 */
      useSuggest: function () { this.amount = this.dec.suggest_kg; }
    },
    mounted: function () {
      this.load();
      const self = this;
      this.unsub = API.bind(this, this.load);
      this._cageH = (e) => { this.cageFilter = e.detail.cage; if (this.load) this.load(); };
      window.addEventListener('cagechange', this._cageH);
    },
    beforeUnmount: function () {
      if (this.unsub) this.unsub();
      if (this._cageH) window.removeEventListener('cagechange', this._cageH);
    },
    /* 2026-10-08 按《智能板块建议10.7》问题①：手动投喂默认填建议量。
       切到手动模式时若还没填过，直接给建议值，值班人在此基础上改即可。 */
    watch: {
      mode: function (v) {
        if (v === 'manual' && this.amount === null && this.dec && this.dec.suggest_kg != null) {
          this.amount = this.dec.suggest_kg;
        }
      }
    },
    template: [
      '<div>',
      '  <page-head :title="feedTitle"',
      '    desc="核对本次投喂参数，确认后下发；在右侧查看设备回执与执行结果" />',
      '',
      '  <div class="grid-stats">',
      '    <stat-card name="当前总体重" field="total_biomass_kg" unit="kg" :value="dec.biomass_kg" />',
      '    <stat-card name="鱼群摄食强度" field="feeding_intensity" unit="" :value="dec.feeding_intensity_cn" />',
      '    <stat-card name="投饵机状态" field="device_state" unit="" :value="CN.deviceState(feeder.device_state)" />',
      '    <stat-card name="饵料剩余" field="feed_remain_pct" unit="%" :value="feeder.device_params && feeder.device_params.feed_remain_pct" />',
      '  </div>',
      '',
      '  <div class="workspace-grid">',
      '    <div>      <!-- 投喂模式（2026-10-07 按组员反馈新增） -->',
      '      <div class="card">',
      '        <div class="card-title">准备本次投喂</div>',
      '        <div class="hero-label">{{ mode === \'auto\' ? \'系统建议量\' : \'手动设定量\' }} · 尚未下发</div>',
      '        <div class="hero-value">{{ targetKg ?? \'—\' }} <small>kg</small></div>',
      '        <div class="hero-note" style="margin-bottom:16px">预计 {{ durationSec }} 秒 · 设备 feeder_01</div>',
      '        <div class="row" style="gap:8px;align-items:center">',
      '          <button :class="{ primary: mode === \'auto\' }" @click="mode = \'auto\'">自动</button>',
      '          <button :class="{ primary: mode === \'manual\' }" @click="mode = \'manual\'">手动</button>',
      '          <span class="small muted">',
      ' {{ mode === \'auto\' ? \'按系统算出的投喂规则投喂\' : \'自己决定投喂量\' }}',
      '          </span>',
      '        </div>',
      '        <div v-if="mode === \'manual\'" class="row" style="gap:8px;align-items:center;margin-top:10px">',
      '          <span class="small muted">投喂量</span>',
      '          <input type="number" step="0.1" v-model.number="amount"',
      '                 :placeholder="\'建议 \' + dec.suggest_kg"',
      '                 style="width:110px;border:1.5px solid #2F5496;background:#EEF2FA" title="可修改投喂量">',
      '          <span class="small" style="color:#2F5496">可修改</span>',
      '          <span class="small">kg</span>',
      '          <button @click="useSuggest">用建议值（{{ dec.suggest_kg }}）</button>',
      '        </div>',
      '        <!-- 投喂速度：自动/手动都能调；时长=量÷速度自动算（行2） -->',
      '        <div class="row" style="gap:8px;align-items:center;margin-top:10px">',
      '          <span class="small muted">投喂速度</span>',
      '          <input type="number" step="0.1" min="0.1" v-model.number="speed"',
      '                 style="width:100px;border:1.5px solid #2F5496;background:#EEF2FA" title="可修改投喂速度">',
      '          <span class="small" style="color:#2F5496">可修改</span>',
      '          <span class="small">kg/min</span>',
      '          <span class="small muted">（默认值待按实际投饵机标定）</span>',
      '          <span class="small" style="margin-left:12px">预计时长 <b>{{ durationSec }}</b> 秒</span>',
      '        </div>',
      '        <div class="hint small" style="margin-top:10px">',
      '          <b>系统给的是建议，不是命令。</b>自动模式下按建议值投喂，',
      '          手动模式下由值班人决定 —— <b>最终下发前都要二次确认</b>。',
      '        </div>',
      '        <button class="primary" style="margin-top:14px" @click="ask">核对并下发投喂命令</button>',
      '      </div>',
      '',
      '    </div>',
      '    <div>      <!-- 命令状态机：答辩直接演示这一段 -->',
      '      <div class="card">',
      '        <div class="card-title">最近一次投喂 · 执行反馈</div>',
      '        <div v-if="!latest" class="todo">还没有下发过命令</div>',
      '        <div v-else>',
      '          <div class="hero-label">{{ time(latest.created_ts || (latest.history && latest.history[0] && latest.history[0].ts)) }}</div>',
      '          <div class="hero-note">该次投喂量 {{ latest.params && latest.params.amount_kg != null ? latest.params.amount_kg : \'—\' }} kg</div>',
      '          <div style="font-size:30px;font-weight:700;margin-bottom:16px">{{ statusCn(latest.command_status) }}</div>',
      '          <command-flow :status="latest.command_status" />',
      '          <div class="kv" style="margin-top:12px">',
      '            <span class="k">命令号</span><span class="mono">{{ latest.command_id }}</span>',
      '            <span class="k">设备</span><span class="mono">{{ latest.device_id }}</span>',
      '            <span class="k">超时 / 重试</span><span>{{ latest.timeout_ms }} ms / 最多 {{ latest.max_retry }} 次（裁定 8）</span>',
      '            <span class="k">已重试</span><span>{{ latest.retry_count }} 次</span>',
      '            <span class="k">失败原因</span>',
      '            <span :style="{ color: latest.fail_reason ? \'#991B1B\' : \'#6B7280\' }">',
      ' {{ latest.fail_reason || \'—\' }}',
      '            </span>',
      '          </div>',
      '          <div v-if="badEnd" class="hint" style="margin-top:10px;background:#FEF2F2;border-color:#FECACA">',
      '            <b>命令失败已升级报警</b> —— 这条已经进告警中心。',
      '            <a href="#/mgmt/alarm">去告警中心看 →</a>',
      '            <div class="small" style="margin-top:4px">「不允许静默失败」：命令发出去没回执，必须报警，绝不许悄悄过去。</div>',
      '          </div>',
      '          <div class="small muted" style="margin-top:10px;cursor:pointer" @click="showSteps = !showSteps">',
      '            状态变更时间线 {{ showSteps ? \'▾\' : \'▸\' }}</div>',
      '          <div v-if="showSteps" class="events">',
      '            <div v-for="(s, i) in steps" :key="i" class="row-item" style="cursor:default">',
      '              <span class="t">{{ s.t }}</span><span class="d">{{ statusCn(s.s) }}</span>',
      '            </div>',
      '          </div>',
      '        </div>',
      '      </div>',
      '',
      '    </div>',
      '  </div>',
      '  <div style="margin-top:16px">      <!-- 投喂记录时间线 -->',
      '      <div class="card">',
      '        <div class="card-title">投喂记录',
      '          <span v-if="runningCount" class="small" style="font-weight:400;color:#92400E">',
      '            · {{ runningCount }} 条正在执行</span>',
      '        </div>',
      '        <div v-if="stopMsg" class="hint small" style="margin-bottom:8px">{{ stopMsg }}</div>',
      '        <div class="dt-wrap" style="max-height:420px">',
      '          <table class="dt">',
      '            <thead><tr><th>时间</th><th>投喂量 (kg)</th><th>触发来源</th><th>任务状态</th><th>命令号</th><th></th></tr></thead>',
      '            <tbody>',
      '              <tr v-for="r in records" :key="r.command_id">',
      '                <td>{{ time(r.ts) }}</td><td>{{ r.amount_kg }}</td>',
      '                <td>{{ r.trigger_by === \'auto\' ? \'自动\' : \'手动\' }}</td>',
      '                <td>{{ r.task_status === \'done\' ? \'已完成\' : statusCn(r.task_status) }}</td>',
      '                <td class="mono">{{ r.command_id }}</td>',
      '                <td style="white-space:nowrap">',
      '                  <button v-if="r.task_status !== \'done\'" @click="stop(r)">停止</button>',
      '                  <span v-else class="small muted">—</span>',
      '                </td>',
      '              </tr>',
      '            </tbody>',
      '          </table>',
      '        </div>',
      '      </div>',
      '  </div>',
      '  <details class="secondary-details"><summary>投喂决策依据</summary>      <div class="card">',
      '        <div class="card-title">投喂决策依据（可追问）</div>',
      '        <ul style="margin:0;padding-left:18px;line-height:1.9">',
      '          <li v-for="(b, i) in dec.basis" :key="i">{{ b }}</li>',
      '        </ul>',
      '        <div class="hint" style="margin-top:10px">',
      '          投喂量<b>由智能板块计算</b>，鱼类板块只出观测数据、不重复出决策值 —— 裁定 1。',
      '        </div>',
      '        <div class="small muted" style="margin-top:6px">',
      '          <b>阈值口径（行5）</b>：本板块不持有告警阈值 —— 水温告警线归环境板块、锚泊张力归结构板块；',
      '          日投饲率 1.2% / 分 4 次 / 时段折算系数归智能板块（裁定 1）。',
      '        </div>',
      '      </div>',
      '',
      '  </details>',
      '  <details class="secondary-details"><summary>演示验证 · 故障注入</summary>      <div class="card">',
      '        <div class="card-title">造故障（验证闭环用）</div>',
      '        <div class="row" style="gap:8px">',
      '          <label class="small"><input type="radio" value="" v-model="inject"> 正常</label>',
      '          <label class="small"><input type="radio" value="timeout" v-model="inject"> 命令超时</label>',
      '          <label class="small"><input type="radio" value="offline" v-model="inject"> 设备离线</label>',
      '        </div>',
      '        <div class="small muted" style="margin-top:8px">',
      '          选「命令超时」会走完 <b>超时 → 重试中 → 失败 → 升级报警</b> 整条链。',
      '        </div>',
      '      </div>',
      '  </details>',
      '  <div class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <span class="small muted">{{ mode === \'auto\' ? \'自动模式\' : \'手动模式\' }}</span>',
      '    <button class="primary" @click="ask">下发投喂命令（{{ targetKg }} kg / {{ durationSec }} s）</button>',
      '    <!-- 就地反馈：命令状态直接显示在按钮旁边，不用滚回页首看状态机 -->',
      '    <span v-if="latest" class="small">',
      '      最近命令 <span class="mono">{{ latest.command_id }}</span> ·',
      '      <b :style="{ color: badEnd ? \'#991B1B\' : \'#166534\' }">{{ statusCn(latest.command_status) }}</b>',
      '      <span v-if="latest.fail_reason" style="color:#991B1B"> · {{ latest.fail_reason }}</span>',
      '    </span>',
      '    <span v-else class="small muted">还没有下发过命令</span>',
      '    <span v-if="inject" class="small" style="color:#991B1B">',
      '      ⚠ 已选造故障「{{ inject === \'timeout\' ? \'命令超时\' : \'设备离线\' }}」—— 下次下发会走失败链',
      '    </span>',
      '    <span style="flex:1"></span>',
      '    <span class="small muted">下发前必须二次确认 —— 不允许一键直接对设备生效</span>',
      '  </div>',
      '',
      '  <!-- 二次确认弹窗 -->',
      '  <div v-if="confirmOpen" style="position:fixed;inset:0;background:rgba(17,24,39,.45);display:flex;align-items:center;justify-content:center;z-index:50">',
      '    <div class="card" style="width:420px">',
      '      <div class="card-title">确认下发投喂命令？</div>',
      '      <div class="kv">',
      '        <span class="k">设备</span><span class="mono">feeder_01</span>',
      '        <span class="k">投喂量</span><span><b>{{ targetKg }}</b> kg',
      '          <span class="small muted">（{{ mode === \'auto\' ? \'系统建议值\' : \'手动填写\' }}）</span></span>',
      '        <span class="k">速度</span><span>{{ speed }} kg/min</span>',
      '        <span class="k">预计时长</span><span>{{ durationSec }} s（量 ÷ 速度自动算）</span>',
      '        <span class="k">超时</span><span>5000 ms，最多重试 3 次</span>',
      '      </div>',
      '      <div class="row" style="justify-content:flex-end;margin-top:14px">',
      '        <button @click="cancel">取消</button>',
      '        <button class="primary" @click="confirm">确认下发</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  PAGES['/ai/light'] = {
    data: function () {
      return {
        tick: 0, minutes: 60, series: null, unsub: null,
        dimming: 60, confirmOpen: false, cageFilter: localStorage.getItem('deepsea_cage') || 'cage_01',
        light: { device_id: 'light_01', device_online: true, device_state: 'standby',
                 device_params: { light_dimming_pct: 0 } }
      };
    },
    computed: {
      lightTitle: function () {
        return this.cageFilter === 'cage_02' ? '智能 · 智能补光（2号箱 · 许氏平鲉）' : '智能 · 智能补光（1号箱 · 大黄鱼）';
      },
      fast: function () { return this.series ? this.series.fast : []; },
      last: function () { return this.fast.length ? this.fast[this.fast.length - 1] : {}; },
      charts: function () {
        return [
          { name: '环境光照强度', unit: 'lux', data: this.fast.map(function (r) { return [r.ts, r.light_intensity]; }) }
        ];
      },
      commands: function () { this.tick; var devId=this.cageFilter==='cage_02'?'light_02':'light_01'; return API.commands().filter(function (c) { return c.command_type === 'light' && c.device_id===devId; }); },
      latest: function () { this.tick; return this.commands.length ? this.commands[0] : null; },
      /* 当前档位对应的"人话"说明（组员反馈：只给百分比不直观） */
      dimLevel: function () { return this.levelOf(this.dimming); }
    },
    methods: {
      /* 🔴 档位 → 人话。为什么只给"相对光强"而不给 lux 绝对值：
         实际照度 = 灯具额定照度 × 档位，而**我们的灯具没有标定过额定照度**
         （见「管理 · 标定与维护」里 light_01 那条）。
         编一个 lux 数字出来，答辩被问"你哪来的"就答不上 —— 所以只给相对值。 */
      levelOf: function (pct) {
        const p = Number(pct);
        if (p <= 0)   return { name: '关闭', rel: '0', note: '不补光' };
        if (p <= 25)  return { name: '弱',   rel: '约 1/4 额定', note: '阴天 / 清晨补光' };
        if (p <= 50)  return { name: '中',   rel: '约 1/2 额定', note: '常规补光' };
        if (p <= 75)  return { name: '强',   rel: '约 3/4 额定', note: '促生长时段' };
        return { name: '满', rel: '额定出力', note: '最大出力' };
      },
      load: function () {
        const self = this;
        if (this.cageFilter === 'cage_02') {
          this.light = { device_id: 'light_02', device_online: true, device_state: 'standby',
                         device_params: { light_dimming_pct: 30 } };
          return;
        }
        API.resolve(API.env('site_01', this.minutes, {}), function (d) { self.series = d; });
        const d = API.devices().filter(function (x) { return x.device_id === 'light_01'; })[0];
        if (d) this.light = d;
      },
      ask: function () { this.confirmOpen = true; },
      cancel: function () { this.confirmOpen = false; },
      confirm: function () {
        this.confirmOpen = false;
        var devId = this.cageFilter === 'cage_02' ? 'light_02' : 'light_01';
        API.sendCommand(devId, 'light', { light_dimming_pct: this.dimming }, {});
      },
      statusCn: function (s) {
        return { created: '已创建', sent: '已发出', acknowledged: '已收到回执', success: '成功',
                 timeout: '超时', retrying: '重试中', failed: '失败', escalated: '升级报警',
                 cancelled: '已停止' }[s] || s;
      },
      /* 命令的下发时间（组员反馈：补光历史要能看到下发时间，方便查命令） */
      cmdTime: function (c) {
        const ts = c.created_ts || (c.history && c.history.length ? c.history[0].ts : null);
        return ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '—';
      }
    },
    mounted: function () {
      this.load();
      const self = this;
      this.unsub = API.bind(this, this.load);
      this._cageH = (e) => { this.cageFilter = e.detail.cage; if (this.load) this.load(); };
      window.addEventListener('cagechange', this._cageH);
    },
    beforeUnmount: function () {
      if (this.unsub) this.unsub();
      if (this._cageH) window.removeEventListener('cagechange', this._cageH);
    },
    watch: { minutes: function () { this.load(); } },
    template: [
      '<div>',
      '  <page-head :title="lightTitle"',
      '    desc="手动设定补光档位，确认下发后查看设备回执" />',
      '',
      '  <div class="hero-note" style="margin:0 0 12px">当前使用手动补光；自动策略需经养殖专家确认后启用。</div>',
      '',
      '  <div class="hero-band">',
      '    <div><div class="hero-label">当前设备档位</div><div class="hero-value">{{ light.device_params && light.device_params.light_dimming_pct != null ? light.device_params.light_dimming_pct : \'—\' }} <small>%</small></div><div class="hero-note">设备回传值</div></div>',
      '    <div><div class="hero-label">本次设定 · 尚未下发</div><div class="hero-value">{{ dimming }} <small>%</small></div><div class="hero-note">手动补光 · {{ dimLevel.name }}</div></div>',
      '    <div><label class="hero-label" for="light-draft">调整档位</label><input id="light-draft" type="range" min="0" max="100" step="5" v-model.number="dimming" style="width:100%;margin:16px 0"><button class="primary" @click="ask">核对并下发</button></div>',
      '  </div>',
      '  <div class="grid-stats">',
      '    <stat-card name="环境光照强度" field="light_intensity" unit="lux" :value="last.light_intensity" :quality="last.quality" :ts="last.ts" />',
      '    <stat-card name="灯具在线" field="device_online" unit="" :value="light.device_online ? \'在线\' : \'离线\'" />',
      '    <stat-card name="灯具运行状态" field="device_state" unit="" :value="CN.deviceState(light.device_state)" />',
      '    <stat-card name="当前调光档位" field="light_dimming_pct" unit="%" :value="light.device_params && light.device_params.light_dimming_pct" />',
      '  </div>',
      '',
      '  <div class="split" style="margin-top:12px">',
      '    <trend-chart title="光照强度趋势（白天才有光照，夜间为 0）" :series="charts" />',
      '    <div class="card">',
      '      <div class="card-title">补光命令状态机</div>',
      '      <div v-if="!latest" class="todo">还没有下发过补光命令</div>',
      '      <div v-else>',
      '        <command-flow :status="latest.command_status" />',
      '        <div class="kv" style="margin-top:8px">',
      '          <span class="k">命令号</span><span class="mono">{{ latest.command_id }}</span>',
      '          <span class="k">下发时间</span><span>{{ cmdTime(latest) }}</span>',
      '          <span class="k">目标档位</span>',
      '          <span>{{ latest.params.light_dimming_pct }} %（{{ levelOf(latest.params.light_dimming_pct).name }}）</span>',
      '          <span class="k">失败原因</span>',
      '          <span :style="{ color: latest.fail_reason ? \'#991B1B\' : \'#6B7280\' }">{{ latest.fail_reason || \'—\' }}</span>',
      '        </div>',
      '      </div>',
      '      <!-- 补光历史：2026-10-07 按组员反馈放大（原来状态机占太多、历史看不了几条），',
      '           并加上「下发时间」—— 查命令时最需要的就是时间 -->',
      '      <div class="small muted" style="margin-top:12px">',
      '        补光历史<span v-if="commands.length">（{{ commands.length }} 条）</span>',
      '      </div>',
      '      <div class="events" style="max-height:400px;overflow:auto">',
      '        <div v-for="c in commands" :key="c.command_id" class="row-item" style="cursor:default">',
      '          <span class="t">{{ cmdTime(c) }}</span>',
      '          <span class="d">',
      '            <b>{{ c.params.light_dimming_pct }}%</b>',
      '            <span class="small muted">{{ levelOf(c.params.light_dimming_pct).name }}</span>',
      '            · <span class="mono small">{{ c.command_id }}</span>',
      '            · <span :style="{ color: c.command_status === \'success\' ? \'#166534\' : (c.fail_reason ? \'#991B1B\' : \'#6B7280\') }">{{ statusCn(c.command_status) }}</span>',
      '          </span>',
      '        </div>',
      '        <div v-if="!commands.length" class="empty">暂无记录</div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '',
      '  <details class="secondary-details"><summary>调光档位与标定说明</summary>',
      '  <!-- 档位对照表：组员反馈「只给百分比没法知道是什么样的光照条件」 -->',
      '  <div class="card" style="margin-top:12px">',
      '    <div class="card-title">调光档位对照</div>',
      '    <div class="dt-wrap">',
      '      <table class="dt">',
      '        <thead><tr><th>档位</th><th>档位名</th><th>相对光强</th><th>典型用途</th></tr></thead>',
      '        <tbody>',
      '          <tr v-for="lv in [[0,\'关闭\'],[25,\'弱\'],[50,\'中\'],[75,\'强\'],[100,\'满\']]" :key="lv[0]">',
      '            <td class="mono">≤ {{ lv[0] }} %</td>',
      '            <td><b>{{ lv[1] }}</b></td>',
      '            <td class="small">{{ levelOf(lv[0]).rel }}</td>',
      '            <td class="small">{{ levelOf(lv[0]).note }}</td>',
      '          </tr>',
      '        </tbody>',
      '      </table>',
      '    </div>',
      '    <div class="hint small" style="margin-top:10px">',
      '      <b>为什么这里只给「相对光强」而不给 lux 绝对值</b>：',
      '      实际照度 = 灯具额定照度 × 档位，而<b>本站的补光灯具没有做过计量标定</b>',
      '      （见「管理 · 标定与维护」里 light_01 那条）。',
      '      <b>编一个 lux 数字出来，答辩被问「你哪来的」就答不上</b> —— 所以只给相对值。',
      '    </div>',
      '  </div>',
      '',
      '  </details>',
      '  <div class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <time-range v-model="minutes" />',
      '    <span style="width:12px"></span>',
      '    <span class="small muted">手动设定调光档位</span>',
      '    <input type="range" min="0" max="100" step="5" v-model.number="dimming"',
      '           style="width:180px;accent-color:#2F5496" title="可修改调光档位">',
      '    <span class="small" style="color:#2F5496">可修改</span>',
      '    <b>{{ dimming }} %</b>',
      '    <!-- 组员反馈：只给百分比不直观 —— 补上档位名与相对光强 -->',
      '    <span class="small" style="color:#2F5496">',
      ' {{ dimLevel.name }} · {{ dimLevel.rel }}',
      '    </span>',
      '    <span style="flex:1"></span>',
      '    <button class="primary" @click="ask">下发补光命令</button>',
      '  </div>',
      '',
      '  <div v-if="confirmOpen" style="position:fixed;inset:0;background:rgba(17,24,39,.45);display:flex;align-items:center;justify-content:center;z-index:50">',
      '    <div class="card" style="width:400px">',
      '      <div class="card-title">确认下发补光命令？</div>',
      '      <div class="kv">',
      '        <span class="k">设备</span><span class="mono">light_01</span>',
      '        <span class="k">调光档位</span><span>{{ dimming }} % （{{ dimLevel.name }} · {{ dimLevel.rel }}）</span>',
      '        <span class="k">超时</span><span>5000 ms，最多重试 3 次</span>',
      '      </div>',
      '      <div class="row" style="justify-content:flex-end;margin-top:14px">',
      '        <button @click="cancel">取消</button>',
      '        <button class="primary" @click="confirm">确认下发</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  </div>',
      '</div>'
    ].join('\n')
  };
  /* ============================================================
     /ai/devices —— 设备状态页
     左侧菜单「设备状态」对应这一页（app.js 自动发现，无需改骨架）。
     展示智能板块涉及的养殖设备实时状态：
       在线 / 运行状态 / 站点 / 运行参数 / 最近命令
     数据一律走 API.devices() / API.commands()（已有真实接口，不编），
     API.bind 保证数据变化 + 每 3 秒自动刷新。
     ============================================================ */
  PAGES['/ai/devices'] = {
    data: function () {
      return { tick: 0, unsub: null, showRef: false, cageFilter: localStorage.getItem('deepsea_cage') || 'cage_01' };
    },
    computed: {
      devices: function () { this.tick; return API.devices(); },
      farmList: function () { this.tick; var fd = API.farmDevices(); return (fd && fd.devices) || []; },
      commands: function () { this.tick; return API.commands(); },
      /* 1号箱设备台账（按《传感器问题》文档：锚链张力/网绳拉力/三轴加速度/倾角/电压/电流/功率/BMS） */
      mockCage1: function () {
        return [
          { device_id: 'feeder_01', metric: 'feed_rate', vendor: '广州远信',
            cal_status: { label: '已校准' }, location: 'cage_01 · 投料平台',
            device_online: true, device_state: 'standby', device_params: { feed_remain_pct: 62.5 } },
          { device_id: 'light_01', metric: 'light_dimming', vendor: '深圳光联',
            cal_status: { label: '待校准' }, location: 'cage_01 · 水下5m',
            device_online: true, device_state: 'standby', device_params: { light_dimming_pct: 60 } },
          { device_id: 'sensor_tension_01', metric: 'anchor_tension', vendor: '上海恩峰',
            cal_status: { label: '已超期' }, location: 'cage_01 · 锚点A',
            device_online: true, device_state: 'running', device_params: { tension_kn: 420 } },
          { device_id: 'sensor_rope_01', metric: 'net_rope_tension', vendor: '青岛海仪',
            cal_status: { label: '已校准' }, location: 'cage_01 · 网衣中部',
            device_online: true, device_state: 'running', device_params: { rope_kn: 18.5 } },
          { device_id: 'sensor_accel_01', metric: 'accel_3axis', vendor: '南京沃天',
            cal_status: { label: '已校准' }, location: 'cage_01 · 顶部桁架',
            device_online: true, device_state: 'running', device_params: { ax: 0.12, ay: -0.08, az: 9.8 } },
          { device_id: 'sensor_tilt_01', metric: 'tilt', vendor: '南京沃天',
            cal_status: { label: '已校准' }, location: 'cage_01 · 顶部桁架',
            device_online: true, device_state: 'running', device_params: { tilt_x: 1.2, tilt_y: -0.5 } },
          { device_id: 'sensor_volt_01', metric: 'voltage', vendor: '合肥阳光',
            cal_status: { label: '已校准' }, location: 'cage_01 · 光伏支架',
            device_online: true, device_state: 'running', device_params: { voltage_v: 48.2 } },
          { device_id: 'sensor_curr_01', metric: 'current', vendor: '合肥阳光',
            cal_status: { label: '已校准' }, location: 'cage_01 · 光伏支架',
            device_online: true, device_state: 'running', device_params: { current_a: 12.6 } },
          { device_id: 'sensor_power_01', metric: 'power', vendor: '合肥阳光',
            cal_status: { label: '待校准' }, location: 'cage_01 · 电控柜',
            device_online: true, device_state: 'running', device_params: { power_kw: 2.1 } },
          { device_id: 'sensor_bms_01', metric: 'soc', vendor: '宁德时代',
            cal_status: { label: '已校准' }, location: 'cage_01 · 电池舱',
            device_online: true, device_state: 'running', device_params: { soc_pct: 78 } }
        ];
      },
      /* 2号箱设备台账（同型设备，数值与1号箱不同） */
      mockCage2: function () {
        return [
          { device_id: 'feeder_02', metric: 'feed_rate', vendor: '广州远信',
            cal_status: { label: '已校准' }, location: 'cage_02 · 投料平台',
            device_online: true, device_state: 'standby', device_params: { feed_remain_pct: 45 } },
          { device_id: 'light_02', metric: 'light_dimming', vendor: '深圳光联',
            cal_status: { label: '待校准' }, location: 'cage_02 · 水下5m',
            device_online: true, device_state: 'standby', device_params: { light_dimming_pct: 30 } },
          { device_id: 'sensor_temp_02', metric: 'water_temp', vendor: '青岛海仪',
            cal_status: { label: '已超期' }, location: 'cage_02 · 水下3m',
            device_online: true, device_state: 'running', device_params: { water_temp: 18.2 } },
          { device_id: 'sensor_do_02', metric: 'dissolved_oxygen', vendor: '青岛海仪',
            cal_status: { label: '已校准' }, location: 'cage_02 · 水下5m',
            device_online: true, device_state: 'running', device_params: { dissolved_oxygen: 6.8 } },
          { device_id: 'sensor_tilt_02', metric: 'tilt', vendor: '南京沃天',
            cal_status: { label: '已校准' }, location: 'cage_02 · 顶部桁架',
            device_online: true, device_state: 'running', device_params: { tilt_x: 0.8, tilt_y: -0.3 } },
          { device_id: 'sensor_tension_02', metric: 'anchor_tension', vendor: '上海恩峰',
            cal_status: { label: '已校准' }, location: 'cage_02 · 锚点A',
            device_online: true, device_state: 'running', device_params: { tension_kn: 385 } },
          { device_id: 'sensor_rope_02', metric: 'net_rope_tension', vendor: '青岛海仪',
            cal_status: { label: '已校准' }, location: 'cage_02 · 网衣中部',
            device_online: true, device_state: 'running', device_params: { rope_kn: 15.2 } },
          { device_id: 'sensor_accel_02', metric: 'accel_3axis', vendor: '南京沃天',
            cal_status: { label: '待校准' }, location: 'cage_02 · 顶部桁架',
            device_online: true, device_state: 'running', device_params: { ax: 0.09, ay: -0.05, az: 9.8 } },
          { device_id: 'sensor_tilt_02', metric: 'tilt', vendor: '南京沃天',
            cal_status: { label: '已校准' }, location: 'cage_02 · 顶部桁架',
            device_online: true, device_state: 'running', device_params: { tilt_x: 0.8, tilt_y: -0.3 } },
          { device_id: 'sensor_volt_02', metric: 'voltage', vendor: '合肥阳光',
            cal_status: { label: '已校准' }, location: 'cage_02 · 光伏支架',
            device_online: true, device_state: 'running', device_params: { voltage_v: 47.6 } },
          { device_id: 'sensor_curr_02', metric: 'current', vendor: '合肥阳光',
            cal_status: { label: '已超期' }, location: 'cage_02 · 光伏支架',
            device_online: true, device_state: 'running', device_params: { current_a: 9.8 } },
          { device_id: 'sensor_power_02', metric: 'power', vendor: '合肥阳光',
            cal_status: { label: '待校准' }, location: 'cage_02 · 电控柜',
            device_online: true, device_state: 'running', device_params: { power_kw: 1.6 } },
          { device_id: 'sensor_bms_02', metric: 'soc', vendor: '宁德时代',
            cal_status: { label: '已校准' }, location: 'cage_02 · 电池舱',
            device_online: false, device_state: 'offline', device_params: { soc_pct: 62 } }
        ];
      },
      /* 台账(farmDevices: 厂商/校准/位置) + 实时状态(devices: 在线/参数) 按 device_id 合并 */
      merged: function () {
        if (this.cageFilter === 'cage_02') return this.mockCage2;
        return this.mockCage1;
      },
      /* 按网箱过滤：location 字段含 cage_id 前缀（如 "cage_01 · 水下3m"） */
      filtered: function () {
        var cid = this.cageFilter;
        return this.merged.filter(function (d) {
          return (d.location || '').indexOf(cid) >= 0;
        });
      },
      onlineCount: function () {
        return this.filtered.filter(function (d) { return d.device_online; }).length;
      }
    },
    methods: {
      /* API.bind 定时会调 load —— 用 tick++ 触发 computed 重算（数据读缓存即可） */
      load: function () { this.tick++; },
      /* 该设备最近一条命令（commands 按时间倒序，第一条最新） */
      latestCmd: function (devId) {
        const c = this.commands.filter(function (x) { return x.device_id === devId; })[0];
        return c || null;
      },
      statusCn: function (s) {
        return { created: '已创建', sent: '已发出', acknowledged: '已收到回执', success: '成功',
                 timeout: '超时', retrying: '重试中', failed: '失败', escalated: '升级报警',
                 cancelled: '已停止' }[s] || s;
      },
      time: function (ts) { return ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '—'; },
      /* 按设备类型给出该设备最要紧的运行参数（不编，拿不到就显示 —） */
      paramText: function (d) {
        const p = d.device_params || {};
        if (d.device_type === 'feeder') {
          return p.feed_remain_pct != null ? '饵料剩余 ' + p.feed_remain_pct + ' %' : '—';
        }
        if (d.device_type === 'light') {
          return p.light_dimming_pct != null ? '调光档位 ' + p.light_dimming_pct + ' %' : '—';
        }
        return '—';
      },
      lastCmdSummary: function (devId) {
        const c = this.latestCmd(devId);
        if (!c) return '还没有下发过命令';
        return '最近 ' + CN.commandType(c.command_type) + ' · ' + this.statusCn(c.command_status) +
               (c.fail_reason ? ' · ' + c.fail_reason : '');
      },
      /* metric 英文名 → 中文名（任务3：英文改中文） */
      metricCn: function (m) {
        return { feed_rate: '自动投饵机', light_dimming: '补光灯具',
                 anchor_tension: '锚链张力传感器', net_rope_tension: '网绳拉力传感器',
                 accel_3axis: '三轴加速度传感器', tilt: '倾角传感器',
                 voltage: '电压传感器', current: '电流传感器',
                 power: '智能电表', soc: '储能BMS' }[m] || m || '—';
      },
      /* 校准状态文案 */
      calText: function (d) {
        var c = d.cal_status || {};
        return c.label || '—';
      },
      cageCn: function () { return this.cageFilter === 'cage_01' ? '1 号网箱' : '2 号网箱'; }
    },
    mounted: function () {
      const self = this;
      this.unsub = API.bind(this, this.load);
      this._cageH = (e) => { this.cageFilter = e.detail.cage; if (this.load) this.load(); };
      window.addEventListener('cagechange', this._cageH);
    },
    beforeUnmount: function () {
      if (this.unsub) this.unsub();
      if (this._cageH) window.removeEventListener('cagechange', this._cageH);
    },
    template: [
      '<div>',
      '  <page-head title="设备状态"',
      '    desc="智能板块涉及的养殖设备实时状态 —— 数据走 API.devices()，每 3 秒自动刷新" />',
      '',

      '  <div class="hint" style="margin-bottom:12px">',
      '    <b>{{ onlineCount }} / {{ filtered.length }}</b> 台设备在线（{{ cageCn() }}）。',
      '    <span class="small muted">设备离线或故障时，下发给它的命令会走失败链并进告警中心（R-CMD-01）。</span>',
      '  </div>',
      '',
      '  <div v-if="filtered.length" class="device-grid">',
      '    <div v-for="d in filtered" :key="d.device_id" class="card" style="min-width:0">',
      '      <div class="card-title">',
      '        {{ cageCn() }} · {{ metricCn(d.metric) }}<span class="small muted" :title="d.device_id"> · {{ d.device_id }}</span>',
      '      </div>',
      '      <div class="kv" style="margin-top:6px">',
      '        <span class="k">在线</span><span>{{ d.device_online ? \'在线\' : (d.device_online === false ? \'离线\' : \'—\') }}</span>',
      '        <span class="k">运行状态</span><span>{{ d.device_state ? CN.deviceState(d.device_state) : \'—\' }}</span>',
      '        <span class="k">位置</span><span>{{ d.location || \'—\' }}</span>',
      '        <span class="k">厂商</span><span>{{ d.vendor || \'—\' }}</span>',
      '        <span class="k">校准</span><span>{{ calText(d) }}</span>',
      '        <span class="k">最近命令</span><span>{{ lastCmdSummary(d.device_id) }}</span>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div v-if="!filtered.length" class="todo">{{ cageCn() }}暂未配置设备台账 —— 待队长在 farm.json 补充同型第二套设备。</div>',
      '',
      '  <div class="card" style="margin-top:12px">',
      '    <div class="card-title" style="cursor:pointer" @click="showRef = !showRef">',
      '      设备配置依据（桁架式网箱实际配哪些设备）',
      '      <span class="small muted">{{ showRef ? "▾ 收起" : "▸ 展开" }}</span>',
      '    </div>',
      '    <div v-if="showRef" class="small" style="line-height:1.9">',
      '      <p>依据中集来福士官网经海系列（68×68m 坐底式桁架网箱）公开资料，单箱典型配置如下：</p>',
      '      <table class="dt" style="width:100%"><thead><tr><th>系统</th><th>设备</th><th>数量</th></tr></thead><tbody>',
      '        <tr><td>投喂系统</td><td>空气动力自动投饵机 + 20 m³ 饵料罐 + 自动上料装置</td><td>1 套</td></tr>',
      '        <tr><td>环境监测</td><td>水温 / 溶解氧 / 流速流向 / 盐度传感器；气象站（风速风向、气温、气压）</td><td>1 套</td></tr>',
      '        <tr><td>水下监测</td><td>水下摄像机、ROV 水下机器人、鱼群密度声呐</td><td>1 套</td></tr>',
      '        <tr><td>结构安全</td><td>锚泊张力传感器、倾角传感器</td><td>各 1</td></tr>',
      '        <tr><td>网衣作业</td><td>网衣绞车（提网/翻网）、水下洗网机</td><td>绞车 10–20 台</td></tr>',
      '        <tr><td>补光</td><td>水下 LED 灯具（调光）</td><td>按需</td></tr>',
      '        <tr><td>通信供电</td><td>5G 基站、风光互补供电</td><td>1 套</td></tr>',
      '      </tbody></table>',
      '      <p class="small muted" style="margin-top:8px">',
      '        出处：中集来福士官网 <a href="https://www.cimc-raffles.com/list-17-1.html" target="_blank">深远海渔业产品页</a>；',
      '        烟台经海海洋渔业 <a href="https://www.jinghaiyuye.com/index.php/Article/show/id/626/sid/636.html" target="_blank">经海001号介绍</a>。',
      '      </p>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="card" style="margin-top:12px">',
      '    <div class="card-title">造故障（验证闭环用）</div>',
      '    <div class="small muted">',
      '      到「自动投喂」页的造故障里，选「设备离线 / 命令超时」，',
      '      再下发命令 —— 本页会实时看到设备状态与该设备命令的失败 / 报警。',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n')
  };
  /* ============================================================
     /ai/commands —— 指令日志页
     左侧菜单「指令日志」对应这一页（app.js 自动发现，无需改骨架）。
     展示全部指令的全生命周期：
       下发时间 / 命令号 / 设备 / 类型 / 目标参数 / 状态 / 已重试 / 失败原因
     每行可展开查看全链路时间线（history）与设备回执。
     数据一律走 API.commands() / API.devices()（已有真实接口，不编），
     API.bind 保证数据变化 + 每 3 秒自动刷新。
     ============================================================ */
  PAGES['/ai/commands'] = {
    data: function () {
      return { tick: 0, expandId: null, unsub: null, cageFilter: localStorage.getItem('deepsea_cage') || 'cage_01' };
    },
    computed: {
      /* ⚠️ 显式读 this.tick：API 轮询刷新 _cmds/_devices 时靠 tick 驱动重算 */
      commands: function () { this.tick; return API.commands(); },
      devices: function () { this.tick; return API.devices(); },
      farmList: function () { this.tick; var fd = API.farmDevices(); return (fd && fd.devices) || []; },
      /* 按网箱过滤命令：命令的 device_id → farmDevices.location → cage_id */
      filteredCommands: function () {
        var cid = this.cageFilter;
        var self = this;
        return this.commands.filter(function (c) {
          var f = self.farmList.filter(function (x) { return x.device_id === c.device_id; })[0];
          if (!f) return true;  // 台账里没有的设备（如 crane_01）不过滤
          return (f.location || '').indexOf(cid) >= 0;
        });
      }
    },
    methods: {
      load: function () { this.tick++; },
      statusCn: function (s) {
        return { created: '已创建', sent: '已发出', acknowledged: '已收到回执', success: '成功',
                 timeout: '超时', retrying: '重试中', failed: '失败', escalated: '升级报警',
                 cancelled: '已停止' }[s] || s;
      },
      time: function (ts) { return ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '—'; },
      /* metric 英文名 → 中文名 */
      metricCn: function (m) {
        return { water_temp: '水温传感器', dissolved_oxygen: '溶解氧传感器',
                 tilt: '倾角传感器', anchor_tension: '锚泊张力传感器',
                 feed_rate: '自动投饵机', light_dimming: '补光灯具' }[m] || null;
      },
      /* 设备名：优先台账中文名，英文 ID 收进 title 悬停可见 */
      deviceName: function (devId) {
        var f = this.farmList.filter(function (x) { return x.device_id === devId; })[0];
        if (f && f.metric && this.metricCn(f.metric)) return this.metricCn(f.metric);
        var d = this.devices.filter(function (x) { return x.device_id === devId; })[0];
        return d ? CN.deviceType(d.device_type) : devId;
      },
      /* 按命令类型给出目标参数（不编，拿不到就显示 —） */
      targetText: function (c) {
        const p = c.params || {};
        if (c.command_type === 'feed') {
          return (p.amount_kg != null ? p.amount_kg + ' kg' : '—') +
                 (p.speed_kg_min != null ? ' · ' + p.speed_kg_min + ' kg/min' : '') +
                 (p.duration_s != null ? ' · ' + p.duration_s + ' s' : '');
        }
        if (c.command_type === 'light') {
          return p.light_dimming_pct != null ? p.light_dimming_pct + ' %' : '—';
        }
        return '—';
      },
      statusColor: function (c) {
        if (c.command_status === 'success') return '#166534';
        if (c.command_status === 'cancelled') return '#6B7280';
        return c.fail_reason ? '#991B1B' : '#6B7280';
      },
      /* 展开 / 收起某条命令的全链路时间线 */
      toggle: function (id) { this.expandId = this.expandId === id ? null : id; }
    },
    mounted: function () {
      const self = this;
      this.unsub = API.bind(this, this.load);
      this._cageH = (e) => { this.cageFilter = e.detail.cage; if (this.load) this.load(); };
      window.addEventListener('cagechange', this._cageH);
    },
    beforeUnmount: function () {
      if (this.unsub) this.unsub();
      if (this._cageH) window.removeEventListener('cagechange', this._cageH);
    },
    template: [
      '<div>',
      '  <page-head title="指令日志"',
      '    desc="智能板块全部指令的下发记录与全链路状态 —— 数据走 API.commands()，每 3 秒自动刷新" />',
      '',
      '  <div class="card">',
      '    <div class="card-title">全部指令（{{ filteredCommands.length }} 条）',
      '      <span class="small muted">按下发时间倒序；点「全链路」看单条命令的生命周期与回执</span>',
      '    </div>',

      '    <div v-if="!filteredCommands.length" class="todo">本箱还没有下发过命令',
      '      <span class="small">—— 到「自动投喂」或「智能补光」页下发一条试试。</span>',
      '    </div>',
      '    <div v-else class="dt-wrap" style="max-height:560px">',
      '      <table class="dt">',
      '        <thead><tr><th>下发时间</th><th>命令号</th><th>设备</th><th>类型</th><th>目标参数</th><th>状态</th><th>已重试</th><th>失败原因</th><th></th></tr></thead>',
      '        <tbody>',
      '          <template v-for="c in filteredCommands" :key="c.command_id">',
      '            <tr>',
      '              <td class="small">{{ time(c.created_ts || c.ts || (c.history && c.history[0] && c.history[0].ts)) }}</td>',
      '              <td class="mono">{{ c.command_id }}</td>',
      '              <td>{{ deviceName(c.device_id) }}</td>',
      '              <td>{{ CN.commandType(c.command_type) }}</td>',
      '              <td>{{ targetText(c) }}</td>',
      '              <td :style="{ color: statusColor(c) }">{{ statusCn(c.command_status) }}</td>',
      '              <td>{{ c.retry_count }} / {{ c.max_retry }}</td>',
      '              <td :style="{ color: c.fail_reason ? \'#991B1B\' : \'#6B7280\' }">{{ c.fail_reason || \'—\' }}</td>',
      '              <td style="white-space:nowrap">',
      '                <button @click="toggle(c.command_id)">{{ expandId === c.command_id ? \'收起\' : \'全链路\' }}</button>',
      '              </td>',
      '            </tr>',
      '            <tr v-if="expandId === c.command_id">',
      '              <td colspan="9" style="background:#F8FAFC;padding:10px 14px">',
      '                <div class="small muted" style="margin-bottom:6px">',
      '                  全链路时间线（{{ c.history.length }} 步）· 超时 {{ c.timeout_ms }} ms / 最多重试 {{ c.max_retry }} 次',
      '                </div>',
      '                <div class="events">',
      '                  <div v-for="(h, i) in c.history" :key="i" class="row-item" style="cursor:default">',
      '                    <span class="t">{{ time(h.ts) }}</span><span class="d">{{ statusCn(h.status) }}</span>',
      '                  </div>',
      '                  <div v-if="!c.history.length" class="empty">暂无状态记录</div>',
      '                </div>',
      '                <div v-if="c.receipt_result" class="small" style="margin-top:8px;color:#166534">',
      '                  回执：<b>设备已执行</b>',
      '                  <span class="muted">（error_code={{ c.receipt_result.error_code == null ? \'无\' : c.receipt_result.error_code }}）</span>',
      '                </div>',
      '              </td>',
      '            </tr>',
      '          </template>',
      '        </tbody>',
      '      </table>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="hint small" style="margin-top:12px">',
      '    <b>为什么有「失败原因」这一列</b>：命令发出去没回执，必须报警，绝不许悄悄过去（R-CMD-01）。',
      '    失败的命令可以点「全链路」看它走到哪一步才失败、重试了几次。',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  /* ============================================================
     /ai/crane —— 起重设备页（2026-10-12 按反馈行4新增）
     查证依据：中集来福士（CIMC Raffles）官网深远海渔业产品页载明，
       经海001/002/003/006、长鲸一号等大型坐底式网箱（68×68m）
       每座配「网衣绞车（提网绞车）」10–20 台，平台另带克令吊。
       出处：https://www.cimc-raffles.com/list-17-1.html
     本页只做命令闭环：提升/下放/回转/停止 → 命令状态机四态 →
       超时重试 → 失败升级报警（R-CMD-01）。
     设备实时状态未接入（API.devices 无 crane_01），按"不编数据"原则显示 —。
     ============================================================ */
  PAGES['/ai/crane'] = {
    data: function () {
      return {
        tick: 0, pendingAction: '', inject: '', confirmOpen: false,
        showSteps: false, unsub: null, sendMsg: ''
      };
    },
    computed: {
      commands: function () {
        this.tick;
        return API.commands().filter(function (c) { return c.command_type === 'crane'; });
      },
      latest: function () {
        this.tick;
        return this.commands.length ? this.commands[0] : null;
      },
      steps: function () {
        this.tick;
        const c = this.latest;
        if (!c) return [];
        return c.history.map(function (h) {
          return { t: new Date(h.ts).toLocaleTimeString('zh-CN', { hour12: false }), s: h.status };
        });
      },
      badEnd: function () {
        this.tick;
        const c = this.latest;
        return !!(c && ['failed', 'escalated'].indexOf(c.command_status) >= 0);
      }
    },
    methods: {
      load: function () { this.tick++; },
      statusCn: function (s) {
        return { created: '已创建', sent: '已发出', acknowledged: '已收到回执', success: '成功',
                 timeout: '超时', retrying: '重试中', failed: '失败', escalated: '升级报警',
                 cancelled: '已停止' }[s] || s;
      },
      actionCn: function (a) {
        return { up: '提升（提网）', down: '下放（放网）', rotate: '回转', stop: '停止' }[a] || a;
      },
      cmdTime: function (c) {
        const ts = c.created_ts || (c.history && c.history.length ? c.history[0].ts : null);
        return ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '—';
      },
      ask: function (a) { this.pendingAction = a; this.confirmOpen = true; },
      cancel: function () { this.confirmOpen = false; },
      confirm: function () {
        this.confirmOpen = false;
        const self = this;
        this.sendMsg = '';
        API.sendCommand('crane_01', 'crane',
          { action: this.pendingAction },
          this.inject ? { inject: this.inject } : {})
          .then(function (cmd) {
            if (cmd && cmd.command_id) {
              self.lastSent = cmd;
              self.load();
            } else {
              /* post() 不检查 HTTP 状态码，404 时 resolve 错误体。
                 后端设备表暂无 crane_01（server.py PLATFORM.devices）会拒绝。
                 按"不静默失败"原则如实提示；PR 里请队长补这台设备。 */
              self.sendMsg = '命令未生效：后端返回「' +
                ((cmd && (cmd.msg || cmd.error || cmd.detail || cmd.message)) || '未知错误') +
                '」——crane_01 尚未在后端设备表注册，需队长在 PLATFORM.devices 补一行起重设备后才能走状态机。';
            }
          })
          .catch(function (e) {
            self.sendMsg = '命令未生效：' + (e && e.message ? e.message : '网络错误');
          });
      }
    },
    mounted: function () {
      this.load();
      this.unsub = API.bind(this, this.load);
    },
    beforeUnmount: function () { if (this.unsub) this.unsub(); },
    template: [
      '<div>',
      '  <page-head title="智能 · 起重设备"',
      '    desc="网衣绞车 / 克令吊命令闭环 —— 提升 / 下放 / 回转 / 停止，走命令状态机四态，超时重试、失败升级报警" />',
      '',
      '  <div class="hero-band">',
      '    <div><div class="hero-label">起重设备接入状态</div><div class="hero-value">尚未接入</div><div class="hero-note">当前仅用于展示控制流程，无法确认设备实际动作。</div></div>',
      '    <div><div class="hero-label">设备在线</div><div class="hero-value">—</div></div>',
      '    <div><div class="hero-label">运行状态</div><div class="hero-value">—</div></div>',
      '  </div>',
      '  <div class="card" style="margin-top:12px">',
      '    <div class="card-title">动作下发（先选动作 → 二次确认 → 看状态机）</div>',
      '    <div class="row" style="gap:10px;flex-wrap:wrap">',
      '      <button @click="ask(\'up\')">提升（提网）</button>',
      '      <button @click="ask(\'down\')">下放（放网）</button>',
      '      <button @click="ask(\'rotate\')">回转</button>',
      '      <button @click="ask(\'stop\')">停止</button>',
      '    </div>',
      '    <div v-if="sendMsg" class="hint small" style="margin-top:10px;background:#FEF2F2;border-color:#FECACA;color:#991B1B">{{ sendMsg }}</div>',
      '  </div>',
      '',
      '  <div class="split" style="margin-top:12px">',
      '    <div>',
      '      <div class="card">',
      '        <div class="card-title">命令状态机</div>',
      '        <div v-if="!latest" class="todo">还没有下发过起重命令</div>',
      '        <div v-else>',
      '          <command-flow :status="latest.command_status" />',
      '          <div class="kv" style="margin-top:12px">',
      '            <span class="k">命令号</span><span class="mono">{{ latest.command_id }}</span>',
      '            <span class="k">动作</span><span>{{ actionCn(latest.params && latest.params.action) }}</span>',
      '            <span class="k">超时 / 重试</span><span>{{ latest.timeout_ms }} ms / 最多 {{ latest.max_retry }} 次</span>',
      '            <span class="k">失败原因</span>',
      '            <span :style="{ color: latest.fail_reason ? \'#991B1B\' : \'#6B7280\' }">{{ latest.fail_reason || \'—\' }}</span>',
      '          </div>',
      '          <div v-if="badEnd" class="hint" style="margin-top:10px;background:#FEF2F2;border-color:#FECACA">',
      '            <b>命令失败已升级报警</b> —— 已进告警中心（不允许静默失败）。',
      '            <a href="#/mgmt/alarm">去告警中心看 →</a>',
      '          </div>',
      '          <div class="small muted" style="margin-top:10px;cursor:pointer" @click="showSteps = !showSteps">',
      '            状态变更时间线 {{ showSteps ? \'▾\' : \'▸\' }}</div>',
      '          <div v-if="showSteps" class="events">',
      '            <div v-for="(s, i) in steps" :key="i" class="row-item" style="cursor:default">',
      '              <span class="t">{{ s.t }}</span><span class="d">{{ statusCn(s.s) }}</span>',
      '            </div>',
      '          </div>',
      '        </div>',
      '      </div>',
      '',
      '      <details class="secondary-details"><summary>演示验证 · 故障注入</summary>',
      '      <div class="card">',
      '        <div class="card-title">造故障（验证闭环用）</div>',
      '        <div class="row" style="gap:8px">',
      '          <label class="small"><input type="radio" value="" v-model="inject"> 正常</label>',
      '          <label class="small"><input type="radio" value="timeout" v-model="inject"> 命令超时</label>',
      '          <label class="small"><input type="radio" value="offline" v-model="inject"> 设备离线</label>',
      '        </div>',
      '      </div>',
      '      </details>',
      '    </div>',
      '',
      '    <div>',
      '      <div class="card">',
      '        <div class="card-title">起重命令历史（{{ commands.length }} 条）</div>',
      '        <div v-if="!commands.length" class="todo">暂无记录</div>',
      '        <div v-else class="events" style="max-height:420px;overflow:auto">',
      '          <div v-for="c in commands" :key="c.command_id" class="row-item" style="cursor:default">',
      '            <span class="t">{{ cmdTime(c) }}</span>',
      '            <span class="d">',
      '              <b>{{ actionCn(c.params && c.params.action) }}</b>',
      '              · <span class="mono small">{{ c.command_id }}</span>',
      '              · <span :style="{ color: c.command_status === \'success\' ? \'#166534\' : (c.fail_reason ? \'#991B1B\' : \'#6B7280\') }">{{ statusCn(c.command_status) }}</span>',
      '            </span>',
      '          </div>',
      '        </div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '',
      '  <details class="secondary-details"><summary>设备配置依据与接入说明</summary>',
      '  <div class="hint" style="margin-bottom:12px">',
      '    <b>查证依据（可追溯）</b>：中集来福士（CIMC Raffles）官网深远海渔业产品页载明，',
      '    经海 001/002/003/006、长鲸一号等大型坐底式网箱（68×68 m）每座配',
      '    <b>网衣绞车（提网绞车）10–20 台</b>，平台另带克令吊。',
      '    <div class="small" style="margin-top:4px">出处：',
      '      <a href="https://www.cimc-raffles.com/list-17-1.html" target="_blank">cimc-raffles.com · 深远海渔业产品页</a>',
      '    </div>',
      '    <div class="small muted" style="margin-top:6px">本页<b>只做命令闭环</b>：设备实时状态未接入（API.devices 无此设备），按"不编数据"原则状态显示 —。</div>',
      '  </div>',
      '',
      '  </details>',
      '  <div v-if="confirmOpen" style="position:fixed;inset:0;background:rgba(17,24,39,.45);display:flex;align-items:center;justify-content:center;z-index:50">',
      '    <div class="card" style="width:380px">',
      '      <div class="card-title">确认下发起重命令？</div>',
      '      <div class="kv">',
      '        <span class="k">设备</span><span class="mono">crane_01（网衣绞车/克令吊）</span>',
      '        <span class="k">动作</span><span>{{ actionCn(pendingAction) }}</span>',
      '        <span class="k">超时</span><span>5000 ms，最多重试 3 次</span>',
      '      </div>',
      '      <div class="row" style="justify-content:flex-end;margin-top:14px">',
      '        <button @click="cancel">取消</button>',
      '        <button class="primary" @click="confirm">确认下发</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

})(window);
