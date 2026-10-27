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

  /* 确认弹层的键盘可达性：打开即把焦点移进 role=dialog，Esc 与 Tab 才落在弹层上；
     关闭后把焦点还给触发按钮，不让焦点掉到 body。 */
  function openConfirm(vm) {
    vm._confirmReturnFocus = document.activeElement;
    vm.confirmOpen = true;
    vm.$nextTick(function () { const d = vm.$refs.confirm; if (d && d.focus) d.focus(); });
  }
  function closeConfirm(vm) {
    vm.confirmOpen = false;
    const back = vm._confirmReturnFocus;
    vm._confirmReturnFocus = null;
    if (back && back.focus) back.focus();
  }
  function trapConfirmTab(e) {
    const box = this.$refs.confirm;
    if (!box) return;
    const f = box.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

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
        return this.activeRecords.length;
      },
      activeRecords: function () {
        const terminal = ['done', 'success', 'cancelled', 'failed', 'escalated'];
        return this.records.filter(function (r) { return terminal.indexOf(r.task_status) < 0; });
      },
      feedTitle: function () {
        /* 🔴 2026-10-20 队长改：原来这里把鱼种名**写死**成「许氏平鲉 / 大黄鱼」。
      2 号箱按队-1 告警合理性换成了黑鲷（farm.json 已改），标题却还显示旧名 ——
      改成从 API.farm() 动态读该网箱的 species，以后换种只需改数据一处。 */
      const f = (API.farm && API.farm()) || {};
      const cid = this.cageFilter;
      const me = (f.cages || []).filter(function (c) { return c.cage_id === cid; })[0] || {};
      const no = cid === 'cage_02' ? '2号箱' : '1号箱';
      return '智能 · 自动投喂（' + no + ' · ' + (me.species || '—') + '）';
      },
      feederId: function () { return this.cageFilter === 'cage_02' ? 'feeder_02' : 'feeder_01'; },
      feeder: function () {
        this.tick;
        return API.devices().filter(function (x) { return x.device_id === this.feederId; }, this)[0] || {};
      },
      commands: function () {
        this.tick;
        var id = this.feederId;
        return API.commands().filter(function (c) {
          return c.command_type === 'feed' && c.device_id === id;
        });
      },
      latest: function () { this.tick; return this.commands.length ? this.commands[0] : null; },
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
      },
    },
    methods: {
      load: function () {
        const self = this;
        API.resolve(API.feedDecision(this.cageFilter), function (d) {
          self.dec = Object.assign({}, d, { suggest_kg: d.suggest_kg != null ? d.suggest_kg : d.suggest_kg_h });
        });
        API.resolve(API.feedRecords(this.cageFilter), function (r) {
          self.records = r || [];
        });
      },
      statusCn: function (s) {
        return { created: '已创建', sent: '已发出', acknowledged: '已收到回执', success: '成功',
                 timeout: '超时', retrying: '重试中', failed: '失败', escalated: '升级报警',
                 done: '已完成', cancelled: '已停止' }[s] || s;
      },
      time: function (ts) { return ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '—'; },
      ask: function () { openConfirm(this); },
      cancel: function () { closeConfirm(this); },
      trapConfirmTab: trapConfirmTab,
      confirm: function () {
        closeConfirm(this);
        const self = this;
        API.sendCommand(this.feederId, 'feed',
          { amount_kg: this.targetKg, speed_kg_min: this.speed, duration_s: this.durationSec },
          { inject: this.inject || undefined, cageId: this.cageFilter }).then(function (cmd) {
          if (!cmd || cmd.code) {
            self.stopMsg = '下发失败：' + ((cmd && (cmd.msg || cmd.error)) || '未知原因');
            return;
          }
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
      "<div class=\"show-page show-control\">",
      "  <page-head :title=\"feedTitle\" desc=\"核对投喂量与速度，确认下发后查看后端回执；当前任务可随时停止。\"/>",
      "  <div class=\"show-body\">",
      "    <div class=\"show-row control\">",
      "      <section class=\"card\"><div class=\"card-title\">准备本次投喂</div><div class=\"row\"><button :class=\"{primary:mode==='auto'}\" @click=\"mode='auto'\">自动</button><button :class=\"{primary:mode==='manual'}\" @click=\"mode='manual'\">手动</button></div><div class=\"show-number\">{{targetKg??'—'}} <small>kg</small></div><div class=\"show-form\"><label v-if=\"mode==='manual'\">本次投喂量（kg）<input type=\"number\" min=\"0.1\" step=\"0.1\" v-model.number=\"amount\" aria-label=\"本次投喂量\"></label><label>投喂速度（kg/min）<input type=\"number\" min=\"0.1\" step=\"0.1\" v-model.number=\"speed\" aria-label=\"投喂速度\"></label></div><p class=\"show-note\">预计 {{durationSec}} 秒 · 量 ÷ 速度<br>速度需按实际投饵机标定。</p><button v-if=\"mode==='manual'\" @click=\"useSuggest\">使用建议值</button><div class=\"show-actions\"><button class=\"primary\" @click=\"ask\" :disabled=\"!targetKg || targetKg<=0 || !speed || speed<=0\">核对并下发投喂命令</button><secondary-page title=\"投喂历史记录\"><section class=\"card\"><paged-records :items=\"records\"><template #default=\"{rows}\"><table class=\"dt\"><thead><tr><th>时间</th><th>投喂量</th><th>触发</th><th>状态</th><th>命令号</th><th>操作</th></tr></thead><tbody><tr v-for=\"r in rows\" :key=\"r.command_id\"><td>{{time(r.ts)}}</td><td>{{r.amount_kg}} kg</td><td>{{r.trigger_by==='auto'?'自动':'手动'}}</td><td>{{statusCn(r.task_status)}}</td><td>{{r.command_id}}</td><td><button v-if=\"!['done','success','cancelled','failed','escalated'].includes(r.task_status)\" @click=\"stop(r)\">停止</button></td></tr></tbody></table></template></paged-records><p v-if=\"stopMsg\" role=\"status\">{{stopMsg}}</p></section></secondary-page></div></section>",
      "      <scene-slot focus=\"feed\"/>",
      "      <div class=\"show-stack\">",
      "        <section class=\"card\"><div class=\"card-title\">当前执行</div><template v-if=\"latest\"><command-flow :status=\"latest.command_status\"/><div class=\"show-number\">{{statusCn(latest.command_status)}}</div><p class=\"show-note\">{{latest.command_id}}<br>{{latest.fail_reason||'设备回执与后端状态持续更新。'}}</p><a v-if=\"badEnd\" href=\"#/mgmt/alarm\" class=\"show-error\">失败已升级，进入告警中心</a></template><div v-else class=\"empty\">尚未下发投喂命令</div><div class=\"current-feed-tasks\" v-if=\"activeRecords.length || stopMsg\"><p v-if=\"stopMsg\" role=\"status\" class=\"show-note\">{{stopMsg}}</p><div v-if=\"activeRecords.length\" class=\"show-actions\"><span class=\"small\">{{activeRecords.length}} 条任务执行中</span><button class=\"danger\" @click=\"stop(activeRecords[0])\">停止当前任务</button></div></div></section>",
      "        <section class=\"card\"><div class=\"card-title\">规则与闭环依据</div><p class=\"show-note\">系统建议需由值班人核对，自动与手动均二次确认。无回执将按状态机重试，失败进入告警中心。</p><div class=\"show-actions\"><secondary-page title=\"投喂规则与演示验证\"><show-screens :labels=\"['决策依据','指令回执','故障注入']\"><template #default=\"{screen}\"><section v-if=\"screen===0\" class=\"card\"><div class=\"card-title\">当前投喂决策依据</div><paged-records :items=\"dec.basis||[]\"><template #default=\"{rows}\"><p v-for=\"(b,i) in rows\" :key=\"i\" class=\"show-note\">{{b}}</p></template></paged-records><a href=\"#/fish/growth\">生长模型与预测</a></section><section v-else-if=\"screen===1\" class=\"card\"><div class=\"card-title\">最近命令全链路</div><paged-records :items=\"steps\"><template #default=\"{rows}\"><div v-for=\"(s,i) in rows\" :key=\"i\" class=\"row-item\">{{s.t}} · {{statusCn(s.s)}}</div></template></paged-records><p v-if=\"latest\" class=\"show-note\">超时 {{latest.timeout_ms}} ms · 已重试 {{latest.retry_count}} / {{latest.max_retry}} 次 · {{latest.fail_reason||'无失败原因'}}</p></section><section v-else class=\"card\"><div class=\"card-title\">演示故障链</div><label>下次下发故障 <select v-model=\"inject\"><option value=\"\">正常下发</option value=\"timeout\">命令超时</option><option value=\"offline\">设备离线</option></select></label><p class=\"show-note\">仅用于验证模拟设备指令链；不会改变真实台站历史观测。</p><div class=\"show-actions\"><button @click=\"inject=''\">恢复正常下发</button></div></section></template></show-screens></secondary-page></div></section>",
      "      </div>",
      "    </div>",
      "    <div class=\"show-stats\"><stat-card name=\"当前总体重\" unit=\"kg\" :value=\"dec.biomass_kg\"/><stat-card name=\"摄食强度\" :value=\"dec.feeding_intensity_cn\"/><stat-card name=\"设备状态\" :value=\"feeder.device_state?CN.deviceState(feeder.device_state):null\"/><stat-card name=\"饵料剩余\" unit=\"%\" :value=\"feeder.device_params?.feed_remain_pct\"/></div>",
      "  </div>",
      "  <div v-if=\"confirmOpen\" ref=\"confirm\" tabindex=\"-1\" class=\"show-confirm\" role=\"dialog\" aria-modal=\"true\" aria-label=\"确认投喂命令\" @keydown.esc=\"cancel\" @keydown.tab=\"trapConfirmTab\"><h2>确认下发投喂命令</h2><section class=\"card\"><div class=\"show-kv\"><span>设备</span><span>{{feederId}}</span><span>投喂量</span><span>{{targetKg}} kg</span><span>速度</span><span>{{speed}} kg/min</span><span>预计时长</span><span>{{durationSec}} s</span><span>故障演示</span><span>{{inject==='timeout'?'命令超时':inject==='offline'?'设备离线':'关闭'}}</span></div><p class=\"show-note\">请核对当前网箱及设备。下发后由后端指令状态机记录执行结果。</p><div class=\"show-actions\"><button @click=\"cancel\">取消</button><button class=\"primary\" @click=\"confirm\">确认下发</button></div></section></div>",
      "</div>"
    ].join('\n')
  };

  PAGES['/ai/light'] = {
    data: function () {
      return {
        tick: 0, minutes: 60, series: null, unsub: null,
        dimming: 60, confirmOpen: false, stopMsg: '', cageFilter: localStorage.getItem('deepsea_cage') || 'cage_01'
      };
    },
    computed: {
      lightTitle: function () {
        /* 🔴 2026-10-20 队长改：原来这里把鱼种名**写死**成「许氏平鲉 / 大黄鱼」。
      2 号箱按队-1 告警合理性换成了黑鲷（farm.json 已改），标题却还显示旧名 ——
      改成从 API.farm() 动态读该网箱的 species，以后换种只需改数据一处。 */
      const f = (API.farm && API.farm()) || {};
      const cid = this.cageFilter;
      const me = (f.cages || []).filter(function (c) { return c.cage_id === cid; })[0] || {};
      const no = cid === 'cage_02' ? '2号箱' : '1号箱';
      return '智能 · 智能补光（' + no + ' · ' + (me.species || '—') + '）';
      },
      lightId: function () { return this.cageFilter === 'cage_02' ? 'light_02' : 'light_01'; },
      siteId: function () {
        const f = (API.farm && API.farm()) || {};
        const c = (f.cages || []).filter(function (x) { return x.cage_id === this.cageFilter; }, this)[0] || {};
        return c.site_id || 'site_01';
      },
      lightDev: function () {
        this.tick;
        return API.devices().filter(function (x) { return x.device_id === this.lightId; }, this)[0] || {};
      },
      fast: function () { return this.series ? this.series.fast : []; },
      last: function () { return this.fast.length ? this.fast[this.fast.length - 1] : {}; },
      charts: function () {
        return [
          { name: '环境光照强度', unit: 'lux', data: this.fast.map(function (r) { return [r.ts, r.light_intensity]; }) }
        ];
      },
      commands: function () {
        this.tick;
        var id = this.lightId;
        return API.commands().filter(function (c) {
          return c.command_type === 'light' && c.device_id === id;
        });
      },
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
        API.resolve(API.env(this.siteId, this.minutes, {}), function (d) { self.series = d; });
      },
      ask: function () { openConfirm(this); },
      cancel: function () { closeConfirm(this); },
      trapConfirmTab: trapConfirmTab,
      confirm: function () {
        closeConfirm(this);
        const self = this;
        API.sendCommand(this.lightId, 'light', { light_dimming_pct: this.dimming },
          { cageId: this.cageFilter }).then(function (cmd) {
          if (!cmd || cmd.code) {
            self.stopMsg = '下发失败：' + ((cmd && (cmd.msg || cmd.error)) || '未知原因');
          }
        });
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
      "<div class=\"show-page show-control\">",
      "  <page-head :title=\"lightTitle\" desc=\"目标档位与设备回传分开显示；确认后下发并核查执行结果。\"/>",
      "  <div class=\"show-body\">",
      "    <div class=\"show-row control\">",
      "      <section class=\"card\"><div class=\"card-title\">本次调光</div><div class=\"show-form\"><label>目标档位（%）<input type=\"range\" min=\"0\" max=\"100\" step=\"5\" v-model.number=\"dimming\" aria-label=\"目标补光档位\"></label></div><div class=\"show-number\">{{dimming}} %</div><p class=\"show-note\">{{dimLevel.name}} · {{dimLevel.rel}}<br>{{dimLevel.note}}</p><div class=\"show-kv\"><span>当前回传档位</span><span>{{lightDev.device_params?.light_dimming_pct??'—'}} %</span><span>设备</span><span>{{lightId}}</span></div><p v-if=\"stopMsg\" class=\"show-error\" role=\"status\">{{stopMsg}}</p><time-range v-model=\"minutes\"/><div class=\"show-actions\"><button class=\"primary\" @click=\"ask\">下发补光命令</button><secondary-page title=\"调光档位与标定说明\"><section class=\"card\"><div class=\"card-title\">相对档位对照</div><table class=\"dt\"><thead><tr><th>档位</th><th>名称</th><th>相对出力</th><th>用途</th></tr></thead><tbody><tr v-for=\"lv in [0,25,50,75,100]\" :key=\"lv\"><td>{{lv}} %</td><td>{{levelOf(lv).name}}</td><td>{{levelOf(lv).rel}}</td><td>{{levelOf(lv).note}}</td></tr></tbody></table><p class=\"show-note\">灯具尚未完成额定照度标定，仅显示相对出力；不推算或编造现场lux。</p><a href=\"#/mgmt/calibration\">进入标定与维护</a></section></secondary-page></div></section>",
      "      <scene-slot focus=\"light\"/>",
      "      <div class=\"show-stack\"><section class=\"card\"><div class=\"card-title\">当前执行</div><template v-if=\"latest\"><command-flow :status=\"latest.command_status\"/><div class=\"show-number\">{{statusCn(latest.command_status)}}</div><div class=\"show-kv\"><span>目标档位</span><span>{{latest.params?.light_dimming_pct??'—'}} %</span><span>下发时间</span><span>{{cmdTime(latest)}}</span></div><p class=\"show-note\">{{latest.fail_reason||'回执状态持续从后端刷新。'}}</p></template><div v-else class=\"empty\">尚未下发补光命令</div><div class=\"show-actions\"><secondary-page title=\"补光历史\"><section class=\"card\"><paged-records :items=\"commands\"><template #default=\"{rows}\"><table class=\"dt\"><thead><tr><th>下发时间</th><th>目标档位</th><th>命令号</th><th>执行结果</th></tr></thead><tbody><tr v-for=\"c in rows\" :key=\"c.command_id\"><td>{{cmdTime(c)}}</td><td>{{c.params?.light_dimming_pct??'—'}} %</td><td>{{c.command_id}}</td><td>{{statusCn(c.command_status)}}<br>{{c.fail_reason||''}}</td></tr></tbody></table></template></paged-records></section></secondary-page><a href=\"#/ai/commands\">完整回执</a></div></section><section class=\"card\"><trend-chart title=\"环境光照趋势\" :series=\"charts\" small/></section></div>",
      "    </div>",
      "    <div class=\"show-stats\"><stat-card name=\"环境光照\" unit=\"lux\" :value=\"last.light_intensity\" :ts=\"last.ts\"/><stat-card name=\"当前档位\" unit=\"%\" :value=\"lightDev.device_params?.light_dimming_pct\"/><stat-card name=\"目标档位\" unit=\"%\" :value=\"dimming\"/><stat-card name=\"连接状态\" :value=\"lightDev.device_online==null?null:lightDev.device_online?'在线':'离线'\"/></div>",
      "  </div>",
      "  <div v-if=\"confirmOpen\" ref=\"confirm\" tabindex=\"-1\" class=\"show-confirm\" role=\"dialog\" aria-modal=\"true\" aria-label=\"确认补光命令\" @keydown.esc=\"cancel\" @keydown.tab=\"trapConfirmTab\"><h2>确认下发补光命令</h2><section class=\"card\"><div class=\"show-kv\"><span>设备</span><span>{{lightId}}</span><span>目标档位</span><span>{{dimming}} % · {{dimLevel.name}}</span><span>相对出力</span><span>{{dimLevel.rel}}</span></div><p class=\"show-note\">目标设置不会代替当前设备回传；下发后请核查回执。</p><div class=\"show-actions\"><button @click=\"cancel\">取消</button><button class=\"primary\" @click=\"confirm\">确认下发</button></div></section></div>",
      "</div>"
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
      return { tick: 0, unsub: null, selectedDevice: null, cageFilter: localStorage.getItem('deepsea_cage') || 'cage_01' };
    },
    computed: {
      selectedFocus: function () {
        const d=this.filtered.find(function(x){return x.device_id===this.selectedDevice;},this)||this.filtered[0]||{};
        return {feed_rate:'feed',light_dimming:'light',crane_action:'crane',water_temp:'water',dissolved_oxygen:'water',tilt:'pose',anchor_tension:'tension'}[d.metric]||{feeder:'feed',light:'light',crane:'crane'}[d.device_type]||'water';
      },
      devices: function () { this.tick; return API.devices(); },
      farmList: function () { this.tick; var fd = API.farmDevices(); return (fd && fd.devices) || []; },
      /* 正式台账 + 运行状态：按 device_id 合并；没有状态就留空，不补假值 */
      filtered: function () {
        this.tick;
        var cid = this.cageFilter, status = {};
        this.devices.forEach(function (d) { status[d.device_id] = d; });
        return this.farmList.filter(function (d) { return d.cage_id === cid; }).map(function (d) {
          var s = status[d.device_id] || {};
          return Object.assign({}, d, {
            device_online: s.device_online,
            device_state: s.device_state,
            device_params: s.device_params || {}
          });
        });
      },
      onlineCount: function () {
        return this.filtered.filter(function (d) { return d.device_online === true; }).length;
      },
      unknownCount: function () {
        return this.filtered.filter(function (d) { return d.device_online == null; }).length;
      },
      commands: function () { this.tick; return API.commands(); }
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
      "<div class=\"show-page\">",
      "  <page-head title=\"设备状态\" desc=\"正式设备台账与后端运行状态按设备编号合并；缺资料与离线状态分别显示。\"/>",
      "  <div class=\"show-body\"><div class=\"show-row archive\"><section class=\"card\"><div class=\"card-title\">{{cageCn()}}</div><div class=\"show-kv\"><span>正式台账</span><span>{{filtered.length}} 台</span><span>设备在线</span><span>{{onlineCount}} 台</span><span>状态未接入</span><span>{{unknownCount}} 台</span></div><p class=\"show-note\">选中设备后，在同一网箱场景定位。运行状态由平台模拟器生成，设备型号与校准事实按资料确认情况显示。</p><div class=\"show-actions\"><a href=\"#/mgmt/calibration\">标定与维护</a><secondary-page title=\"设备明细与配置依据\"><show-screens :labels=\"['台账明细','配置依据']\"><template #default=\"{screen}\"><section v-if=\"screen===0\" class=\"card\"><div class=\"card-title\">本箱完整台账</div><paged-records :items=\"filtered\" :size=\"5\"><template #default=\"{rows}\"><table class=\"dt\"><thead><tr><th>设备 / 编号</th><th>位置</th><th>厂商 / 资料状态</th><th>校准</th><th>最近命令</th></tr></thead><tbody><tr v-for=\"d in rows\" :key=\"d.device_id\"><td>{{d.device_name_cn||metricCn(d.metric)}}<br>{{d.device_id}}</td><td>{{d.location||'—'}}</td><td>{{d.vendor||'—'}}<br>{{d.provenance_status==='pending_confirmation'?'待确认':''}}</td><td>{{calText(d)}}</td><td>{{lastCmdSummary(d.device_id)}}</td></tr></tbody></table></template></paged-records></section><section v-else class=\"card\"><div class=\"card-title\">公开配置参考 · 不代表本站实配</div><paged-records :items=\"[['投喂','空气动力自动投饵机、饵料罐与上料装置','1套'],['环境','水温、溶氧、流速流向、盐度与气象监测','1套'],['水下监测','摄像机、ROV与鱼群声呐','1套'],['结构','锚泊张力与倾角传感器','各1'],['网衣作业','提网绞车与水下洗网机','绞车10–20台'],['补光','水下LED灯具','按需'],['通信供电','5G、风光互补供电','1套']]\" :size=\"5\"><template #default=\"{rows}\"><table class=\"dt\"><thead><tr><th>系统</th><th>公开资料配置</th><th>典型数量</th></tr></thead><tbody><tr v-for=\"(r,i) in rows\" :key=\"i\"><td>{{r[0]}}</td><td>{{r[1]}}</td><td>{{r[2]}}</td></tr></tbody></table></template></paged-records><p class=\"show-note\">中集来福士经海系列68×68m坐底式桁架网箱公开资料，仅作为平台设备配置参考。本站厂商、型号与校准待逐项确认。故障验证从自动投喂页进入。</p><div class=\"show-actions\"><a href=\"https://www.cimc-raffles.com/list-17-1.html\" target=\"_blank\" rel=\"noopener\">中集来福士资料</a><a href=\"https://www.jinghaiyuye.com/index.php/Article/show/id/626/sid/636.html\" target=\"_blank\" rel=\"noopener\">经海001号介绍</a></div></section></template></show-screens></secondary-page></div></section><div class=\"show-stack\"><section class=\"card\"><div class=\"card-title\">本箱设备台账</div><paged-records :items=\"filtered\" :size=\"4\"><template #default=\"{rows}\"><table class=\"dt\"><thead><tr><th>设备</th><th>连接 / 状态</th><th>运行参数</th><th>校准</th><th>定位</th></tr></thead><tbody><tr v-for=\"d in rows\" :key=\"d.device_id\"><td>{{d.device_name_cn||metricCn(d.metric)}}<small class=\"muted\"> · {{d.device_id}}</small></td><td>{{d.device_online==null?'状态未接入':d.device_online?'在线':'离线'}} · {{d.device_state?CN.deviceState(d.device_state):'—'}}</td><td>{{paramText(d)}}</td><td>{{calText(d)}}</td><td><button @click=\"selectedDevice=d.device_id\">选中设备</button></td></tr></tbody></table></template></paged-records></section><scene-slot :focus=\"selectedFocus\" note=\"设备定位 · 型号与布点为概念示意\"/></div></div></div>",
      "</div>"
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
      /* 按网箱过滤命令：优先用命令自己的 cage_id；
         老命令没有 cage_id 时按设备台账归属判断，查不到台账的设备**不放行**（不猜归属）。 */
      filteredCommands: function () {
        var cid = this.cageFilter;
        var self = this;
        return this.commands.filter(function (c) {
          if (c.cage_id) return c.cage_id === cid;
          var f = self.farmList.filter(function (x) { return x.device_id === c.device_id; })[0];
          return !!(f && f.cage_id === cid);
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
                 feed_rate: '自动投饵机', light_dimming: '补光灯具',
                 crane_action: '网衣绞车' }[m] || null;
      },
      /* 设备名：优先台账中文名，英文 ID 收进 title 悬停可见 */
      deviceName: function (devId) {
        var f = this.farmList.filter(function (x) { return x.device_id === devId; })[0];
        if (f && f.device_name_cn) return f.device_name_cn;
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
        if (c.command_type === 'crane') {
          return { up: '提升', down: '下放', rotate: '回转', stop: '停止' }[p.action] || '—';
        }
        return '—';
      },
      statusColor: function (c) {
        if (c.command_status === 'success') return '#98d7b8';
        return c.fail_reason ? '#efa19a' : '#a6c2cf';
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
      "<div class=\"show-page\">",
      "  <page-head title=\"指令日志\" desc=\"按当前网箱核查所有命令的下发、回执、重试与失败原因。\"/>",
      "  <div class=\"show-body\"><div class=\"show-row wide\"><section class=\"card\"><div class=\"card-title\">全部指令 · {{filteredCommands.length}} 条</div><paged-records :items=\"filteredCommands\"><template #default=\"{rows}\"><table class=\"dt\"><thead><tr><th>下发时间</th><th>设备 / 类型</th><th>目标参数</th><th>状态</th><th>重试</th><th>回执</th></tr></thead><tbody><tr v-for=\"c in rows\" :key=\"c.command_id\" :class=\"{selected:expandId===c.command_id}\"><td>{{time(c.created_ts||c.ts)}}</td><td>{{deviceName(c.device_id)}}<br>{{CN.commandType(c.command_type)}}</td><td>{{targetText(c)}}</td><td :class=\"{'show-error':c.fail_reason}\">{{statusCn(c.command_status)}}</td><td>{{c.retry_count}} / {{c.max_retry}}</td><td><button @click=\"toggle(c.command_id)\">全链路</button></td></tr></tbody></table></template></paged-records></section><section class=\"card\"><div class=\"card-title\">选中命令与时间线</div><template v-for=\"c in filteredCommands.filter(c=>c.command_id===expandId)\" :key=\"c.command_id\"><div class=\"show-note\">{{c.command_id}}<br>{{deviceName(c.device_id)}} · {{targetText(c)}}<br>超时 {{c.timeout_ms}} ms · {{c.fail_reason||'无失败原因'}}</div><command-flow :status=\"c.command_status\"/><paged-records :items=\"c.history||[]\" :size=\"5\"><template #default=\"{rows}\"><div v-for=\"(h,i) in rows\" :key=\"i\" class=\"row-item\">{{time(h.ts)}} · {{statusCn(h.status)}}</div></template></paged-records><p v-if=\"c.receipt_result\" class=\"show-success\">已收到设备回执 · {{c.receipt_result.error_code==null?'无错误码':c.receipt_result.error_code}}</p></template><div v-if=\"!filteredCommands.some(c=>c.command_id===expandId)\" class=\"empty\">选择一条命令查看全链路</div><div class=\"show-actions\"><a href=\"#/mgmt/alarm\">进入告警中心</a></div></section></div><p class=\"show-note\">无回执不能视为执行成功；失败原因与命令时间线保留，失败升级进入告警中心。</p></div>",
      "</div>"
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
     设备运行状态由平台模拟器生成；型号/厂商/数量/校准记录待确认，
       按"不编数据"原则不填具体值。
     ============================================================ */
  PAGES['/ai/crane'] = {
    data: function () {
      return {
        tick: 0, pendingAction: '', inject: '', confirmOpen: false,
        showSteps: false, unsub: null, sendMsg: '',
        cageFilter: localStorage.getItem('deepsea_cage') || 'cage_01'
      };
    },
    computed: {
      craneId: function () { return this.cageFilter === 'cage_02' ? 'crane_02' : 'crane_01'; },
      commands: function () {
        this.tick;
        var id = this.craneId;
        return API.commands().filter(function (c) {
          return c.command_type === 'crane' && c.device_id === id;
        });
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
      },
      craneInfo: function () {
        this.tick;
        var d = API.devices().filter(function (x) { return x.device_id === this.craneId; }, this)[0] || {};
        return {
          /* 公开资料只支持"配网衣绞车"，具体型号/拉力/速度没有出处 —— 不编 */
          model: '型号待确认',
          pull_t: null,
          speed_m_min: null,
          height_m: null,
          online: d.device_online,
          state: d.device_state ? CN.deviceState(d.device_state) : '状态未接入'
        };
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
      ask: function (a) { this.pendingAction = a; openConfirm(this); },
      cancel: function () { closeConfirm(this); },
      trapConfirmTab: trapConfirmTab,
      confirm: function () {
        closeConfirm(this);
        const self = this;
        this.sendMsg = '';
        API.sendCommand(this.craneId, 'crane', { action: this.pendingAction },
          { inject: this.inject || undefined, cageId: this.cageFilter }).then(function (cmd) {
          if (!cmd || cmd.code) {
            self.sendMsg = '下发失败：' + ((cmd && (cmd.msg || cmd.error)) || '未知原因');
          }
        });
      }
    },
    mounted: function () {
      var self = this;
      this.load();
      this.unsub = API.bind(this, this.load);
      this._cageH = function (e) {
        self.cageFilter = (e && e.detail && e.detail.cage) || localStorage.getItem('deepsea_cage') || 'cage_01';
        self.tick++;
        self.load();
      };
      window.addEventListener('cagechange', this._cageH);
    },
    beforeUnmount: function () {
      if (this.unsub) this.unsub();
      if (this._cageH) window.removeEventListener('cagechange', this._cageH);
    },
    template: [
      "<div class=\"show-page show-control\">",
      "  <page-head title=\"起重作业\" desc=\"选择动作并确认下发，核查回执；设备性能与工程布点仍待确认。\"/>",
      "  <div class=\"show-body\"><div class=\"show-row control\">",
      "    <section class=\"card\"><div class=\"card-title\">本次作业</div><div class=\"show-kv\"><span>动作对象</span><span>{{craneId}}</span><span>设备状态</span><span>{{craneInfo.state}}</span><span>型号</span><span>{{craneInfo.model}}</span></div><p class=\"show-note\">操作当前网箱的网衣绞车。额定拉力、速度与高度尚无确认资料，保持空缺。</p><div class=\"show-form\"><button @click=\"ask('up')\">提升（提网）</button><button @click=\"ask('down')\">下放（放网）</button><button @click=\"ask('rotate')\">回转</button><button class=\"danger\" @click=\"ask('stop')\">停止作业</button></div><p v-if=\"sendMsg\" role=\"status\" class=\"show-error\">{{sendMsg}}</p><div class=\"show-actions\"><secondary-page title=\"起重设备依据与演示验证\"><div class=\"show-row two\"><section class=\"card\"><div class=\"card-title\">设备与性能边界</div><p class=\"show-note\">公开资料支持大型坐底式养殖网箱配置网衣绞车，不能据此确认本站设备型号、厂商与数量。模型为概念示意；现场安装、性能和校准资料待确认。</p><div class=\"show-kv\"><span>额定拉力</span><span>{{craneInfo.pull_t??'—'}} t</span><span>速度</span><span>{{craneInfo.speed_m_min??'—'}} m/min</span><span>高度</span><span>{{craneInfo.height_m??'—'}} m</span></div><a href=\"https://www.cimc-raffles.com/list-17-1.html\" target=\"_blank\" rel=\"noopener\">查看原有公开资料出处</a></section><section class=\"card\"><div class=\"card-title\">演示验证</div><label>下次命令故障 <select v-model=\"inject\"><option value=\"\">正常下发</option><option value=\"timeout\">命令超时</option><option value=\"fail\">命令失败</option><option value=\"offline\">设备离线</option></select></label><p class=\"show-note\">此处只验证模拟设备的指令状态机与失败升级告警。</p></section></div></secondary-page></div></section>",
      "    <scene-slot focus=\"crane\"/>",
      "    <div class=\"show-stack\"><section class=\"card\"><div class=\"card-title\">当前执行</div><template v-if=\"latest\"><command-flow :status=\"latest.command_status\"/><div class=\"show-number\">{{statusCn(latest.command_status)}}</div><div class=\"show-kv\"><span>动作</span><span>{{actionCn(latest.params?.action)}}</span><span>下发时间</span><span>{{cmdTime(latest)}}</span></div><p class=\"show-note\">{{latest.fail_reason||'执行状态持续从后端刷新。'}}</p><a v-if=\"badEnd\" href=\"#/mgmt/alarm\" class=\"show-error\">失败已升级，进入告警中心</a></template><div v-else class=\"empty\">尚未下发起重命令</div><div class=\"show-actions\"><secondary-page title=\"起重命令历史\"><section class=\"card\"><paged-records :items=\"commands\"><template #default=\"{rows}\"><table class=\"dt\"><thead><tr><th>时间</th><th>动作</th><th>命令号</th><th>结果</th></tr></thead><tbody><tr v-for=\"c in rows\" :key=\"c.command_id\"><td>{{cmdTime(c)}}</td><td>{{actionCn(c.params?.action)}}</td><td>{{c.command_id}}</td><td>{{statusCn(c.command_status)}}<br>{{c.fail_reason||''}}</td></tr></tbody></table></template></paged-records></section></secondary-page><a href=\"#/ai/commands\">全链路回执</a></div></section><section class=\"card\"><div class=\"card-title\">作业前核对</div><p class=\"show-note\">核对当前网箱、设备和动作。提升、下放、回转与停止均需确认；未成功回执不视为现场已执行。</p><p v-if=\"inject\" class=\"hint\">故障演示已启用，下次命令将走失败链。</p></section></div>",
      "  </div><div class=\"show-stats\"><stat-card name=\"设备连接\" :value=\"craneInfo.online==null?null:craneInfo.online?'在线':'离线'\"/><stat-card name=\"额定拉力\" unit=\"t\" :value=\"craneInfo.pull_t\" note=\"资料待确认\"/><stat-card name=\"起升速度\" unit=\"m/min\" :value=\"craneInfo.speed_m_min\" note=\"资料待确认\"/><stat-card name=\"起升高度\" unit=\"m\" :value=\"craneInfo.height_m\" note=\"状态未接入\"/></div></div>",
      "  <div v-if=\"confirmOpen\" ref=\"confirm\" tabindex=\"-1\" class=\"show-confirm\" role=\"dialog\" aria-modal=\"true\" aria-label=\"确认起重命令\" @keydown.esc=\"cancel\" @keydown.tab=\"trapConfirmTab\"><h2>确认下发起重命令</h2><section class=\"card\"><div class=\"show-kv\"><span>设备</span><span>{{craneId}}</span><span>动作</span><span>{{actionCn(pendingAction)}}</span><span>故障演示</span><span>{{inject||'关闭'}}</span></div><p class=\"show-note\">确认动作对象与方向，执行结果以设备回执为准。</p><div class=\"show-actions\"><button @click=\"cancel\">取消</button><button class=\"primary\" @click=\"confirm\">确认下发</button></div></section></div>",
      "</div>"
    ].join('\n')
  };

})(window);
