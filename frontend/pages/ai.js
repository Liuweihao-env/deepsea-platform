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
        dec: { biomass_kg: null, feeding_intensity_cn: '—', suggest_kg_h: null,
               water_temp: null, basis: [], times_per_day: 4 },
        records: [], inject: '', confirmOpen: false, lastSent: null, unsub: null
      };
    },
    computed: {
      feeder: function () {
        const d = API.devices().filter(function (x) { return x.device_id === 'feeder_01'; })[0];
        return d || {};
      },
      commands: function () { this.tick; return API.commands(); },
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
      }
    },
    methods: {
      load: function () {
        const self = this;
        API.resolve(API.feedDecision(), function (d) { self.dec = d; });
        API.resolve(API.feedRecords(), function (r) { self.records = r; });
      },
      statusCn: function (s) {
        return { created: '已创建', sent: '已发出', acknowledged: '已收到回执', success: '成功',
                 timeout: '超时', retrying: '重试中', failed: '失败', escalated: '升级报警' }[s] || s;
      },
      time: function (ts) { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); },
      ask: function () { this.confirmOpen = true; },
      cancel: function () { this.confirmOpen = false; },
      confirm: function () {
        this.confirmOpen = false;
        const self = this;
        const cmd = API.sendCommand('feeder_01', 'feed',
          { amount_kg: this.dec.suggest_kg_h, duration_s: 60 },
          this.inject ? { inject: this.inject } : {});
        this.lastSent = cmd;
        this.$nextTick(function () { /* 让状态机进度条立刻可见 */ });
      }
    },
    mounted: function () {
      this.load();
      const self = this;
      this.unsub = API.subscribe(function () { self.tick++; });
    },
    beforeUnmount: function () { if (this.unsub) this.unsub(); },
    template: [
      '<div>',
      '  <page-head title="智能 · 自动投喂"',
      '    desc="投喂决策归智能（裁定 1）；命令状态机是全项目卖点载体 —— <b>我知道设备到底动没动</b>"',
      '    :sources="[\'simulated\',\'public\']" />',
      '',
      '  <div class="grid-stats">',
      '    <stat-card name="当前生物量" field="total_biomass_kg" unit="kg" :value="dec.biomass_kg" source="public" />',
      '    <stat-card name="鱼群摄食强度" field="feeding_intensity" unit="" :value="dec.feeding_intensity_cn" source="public" />',
      '    <stat-card name="建议投喂量" field="suggest_kg_h" unit="kg/h" :value="dec.suggest_kg_h" source="simulated" />',
      '    <stat-card name="投饵机状态" field="device_state" unit="" :value="CN.deviceState(feeder.device_state)" source="simulated" />',
      '    <stat-card name="饵料剩余" field="feed_remain_pct" unit="%" :value="feeder.device_params && feeder.device_params.feed_remain_pct" source="simulated" />',
      '  </div>',
      '',
      '  <div class="split" style="margin-top:12px">',
      '    <div>',
      '      <!-- 命令状态机：答辩直接演示这一段 -->',
      '      <div class="card">',
      '        <div class="card-title">命令状态机</div>',
      '        <div v-if="!latest" class="todo">还没有下发过命令</div>',
      '        <div v-else>',
      '          <command-flow :status="latest.command_status" />',
      '          <div class="kv" style="margin-top:12px">',
      '            <span class="k">命令号</span><span class="mono">{{ latest.command_id }}</span>',
      '            <span class="k">设备</span><span class="mono">{{ latest.device_id }}</span>',
      '            <span class="k">超时 / 重试</span><span>{{ latest.timeout_ms }} ms / 最多 {{ latest.max_retry }} 次（裁定 8）</span>',
      '            <span class="k">已重试</span><span>{{ latest.retry_count }} 次</span>',
      '            <span class="k">失败原因</span>',
      '            <span :style="{ color: latest.fail_reason ? \'#991B1B\' : \'#6B7280\' }">',
      '              {{ latest.fail_reason || \'—\' }}',
      '            </span>',
      '          </div>',
      '          <div v-if="badEnd" class="hint" style="margin-top:10px;background:#FEF2F2;border-color:#FECACA">',
      '            <b>命令失败已升级报警</b> —— 这条已经进告警中心。',
      '            <a href="#/alarm">去告警中心看 →</a>',
      '            <div class="small" style="margin-top:4px">「不允许静默失败」：命令发出去没回执，必须报警，绝不许悄悄过去。</div>',
      '          </div>',
      '          <div class="small muted" style="margin-top:10px">状态变更时间线</div>',
      '          <div class="events">',
      '            <div v-for="(s, i) in steps" :key="i" class="row-item" style="cursor:default">',
      '              <span class="t">{{ s.t }}</span><span class="d">{{ statusCn(s.s) }}</span>',
      '            </div>',
      '          </div>',
      '        </div>',
      '      </div>',
      '',
      '      <!-- 投喂记录时间线 -->',
      '      <div class="card">',
      '        <div class="card-title">投喂记录</div>',
      '        <div class="dt-wrap" style="max-height:260px">',
      '          <table class="dt">',
      '            <thead><tr><th>时间</th><th>投喂量 (kg)</th><th>触发来源</th><th>任务状态</th><th>命令号</th></tr></thead>',
      '            <tbody>',
      '              <tr v-for="r in records" :key="r.command_id">',
      '                <td>{{ time(r.ts) }}</td><td>{{ r.amount_kg }}</td>',
      '                <td>{{ r.trigger_by === \'auto\' ? \'自动\' : \'手动\' }}</td>',
      '                <td>{{ r.task_status === \'done\' ? \'已完成\' : \'正在执行\' }}</td>',
      '                <td class="mono">{{ r.command_id }}</td>',
      '              </tr>',
      '            </tbody>',
      '          </table>',
      '        </div>',
      '      </div>',
      '    </div>',
      '',
      '    <div>',
      '      <div class="card">',
      '        <div class="card-title">投喂决策依据（可追问）</div>',
      '        <ul style="margin:0;padding-left:18px;line-height:1.9">',
      '          <li v-for="(b, i) in dec.basis" :key="i">{{ b }}</li>',
      '        </ul>',
      '        <div class="hint" style="margin-top:10px">',
      '          投喂量<b>由智能板块计算</b>，鱼类只出观测类指标 —— 裁定 1。',
      '          鱼类不再提供 <code>suggest_feed_kg_h</code>。',
      '        </div>',
      '      </div>',
      '',
      '      <div class="card">',
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
      '    </div>',
      '  </div>',
      '',
      '  <div class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <button class="primary" @click="ask">下发投喂命令（{{ dec.suggest_kg_h }} kg/h）</button>',
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
      '        <span class="k">投喂量</span><span>{{ dec.suggest_kg_h }} kg/h</span>',
      '        <span class="k">时长</span><span>60 s</span>',
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
        dimming: 60, confirmOpen: false,
        light: { device_id: 'light_01', device_online: true, device_state: 'standby',
                 device_params: { light_dimming_pct: 0 } }
      };
    },
    computed: {
      fast: function () { return this.series ? this.series.fast : []; },
      last: function () { return this.fast.length ? this.fast[this.fast.length - 1] : {}; },
      charts: function () {
        return [
          { name: '环境光照强度', unit: 'lux', data: this.fast.map(function (r) { return [r.ts, r.light_intensity]; }) }
        ];
      },
      commands: function () { this.tick; return API.commands().filter(function (c) { return c.command_type === 'light'; }); },
      latest: function () { this.tick; return this.commands.length ? this.commands[0] : null; }
    },
    methods: {
      load: function () {
        const self = this;
        API.resolve(API.env('site_01', this.minutes, {}), function (d) { self.series = d; });
        const d = API.devices().filter(function (x) { return x.device_id === 'light_01'; })[0];
        if (d) this.light = d;
      },
      ask: function () { this.confirmOpen = true; },
      cancel: function () { this.confirmOpen = false; },
      confirm: function () {
        this.confirmOpen = false;
        API.sendCommand('light_01', 'light', { light_dimming_pct: this.dimming }, {});
      },
      statusCn: function (s) {
        return { created: '已创建', sent: '已发出', acknowledged: '已收到回执', success: '成功',
                 timeout: '超时', retrying: '重试中', failed: '失败', escalated: '升级报警' }[s] || s;
      }
    },
    mounted: function () {
      this.load();
      const self = this;
      this.unsub = API.subscribe(function () { self.tick++; });
    },
    beforeUnmount: function () { if (this.unsub) this.unsub(); },
    watch: { minutes: function () { this.load(); } },
    template: [
      '<div>',
      '  <page-head title="智能 · 智能补光"',
      '    desc="当前光照 <code>light_intensity</code>（环境提供，lux）；调光档位 <code>light_dimming_pct</code>（%，裁定 N2）"',
      '    :sources="[\'simulated\']" />',
      '',
      '  <div class="hint" style="margin-bottom:12px">',
      '    ⚠️ <b>本期只做手工模式</b>。补光依据（促生长 / 调控繁殖 / 抑制藻类）<b>查不到出处</b>，',
      '    按规矩不编 —— 保留字段、保留接口、保留手工开关，<b>不做自动决策</b>（裁定 7）。',
      '    <div class="small" style="margin-top:4px">',
      '      答辩口径：<i>补光接口已定义并可用，自动决策依据待养殖专家确认，本期只做手动控制。</i>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="grid-stats">',
      '    <stat-card name="环境光照强度" field="light_intensity" unit="lux" :value="last.light_intensity" :quality="last.quality" :ts="last.ts" source="simulated" />',
      '    <stat-card name="灯具在线" field="device_online" unit="" :value="light.device_online ? \'在线\' : \'离线\'" source="simulated" />',
      '    <stat-card name="灯具运行状态" field="device_state" unit="" :value="CN.deviceState(light.device_state)" source="simulated" />',
      '    <stat-card name="当前调光档位" field="light_dimming_pct" unit="%" :value="light.device_params && light.device_params.light_dimming_pct" source="simulated" />',
      '  </div>',
      '',
      '  <div class="split" style="margin-top:12px">',
      '    <trend-chart title="光照强度趋势（白天才有光照，夜间为 0）" :series="charts" />',
      '    <div class="card">',
      '      <div class="card-title">补光命令状态机</div>',
      '      <div v-if="!latest" class="todo">还没有下发过补光命令</div>',
      '      <div v-else>',
      '        <command-flow :status="latest.command_status" />',
      '        <div class="kv" style="margin-top:12px">',
      '          <span class="k">命令号</span><span class="mono">{{ latest.command_id }}</span>',
      '          <span class="k">目标档位</span><span>{{ latest.params.light_dimming_pct }} %</span>',
      '          <span class="k">失败原因</span>',
      '          <span :style="{ color: latest.fail_reason ? \'#991B1B\' : \'#6B7280\' }">{{ latest.fail_reason || \'—\' }}</span>',
      '        </div>',
      '      </div>',
      '      <div class="small muted" style="margin-top:12px">补光历史</div>',
      '      <div class="events">',
      '        <div v-for="c in commands" :key="c.command_id" class="row-item" style="cursor:default">',
      '          <span class="t">{{ c.params.light_dimming_pct }}%</span>',
      '          <span class="d mono small">{{ c.command_id }} · {{ statusCn(c.command_status) }}</span>',
      '        </div>',
      '        <div v-if="!commands.length" class="empty">暂无记录</div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <time-range v-model="minutes" />',
      '    <span style="width:12px"></span>',
      '    <span class="small muted">手动设定调光档位</span>',
      '    <input type="range" min="0" max="100" step="5" v-model.number="dimming" style="width:180px">',
      '    <b>{{ dimming }} %</b>',
      '    <span style="flex:1"></span>',
      '    <button class="primary" @click="ask">下发补光命令</button>',
      '  </div>',
      '',
      '  <div v-if="confirmOpen" style="position:fixed;inset:0;background:rgba(17,24,39,.45);display:flex;align-items:center;justify-content:center;z-index:50">',
      '    <div class="card" style="width:400px">',
      '      <div class="card-title">确认下发补光命令？</div>',
      '      <div class="kv">',
      '        <span class="k">设备</span><span class="mono">light_01</span>',
      '        <span class="k">调光档位</span><span>{{ dimming }} %</span>',
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
