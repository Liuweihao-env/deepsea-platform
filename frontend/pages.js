/* ============================================================
   pages.js —— 页面组件
   ============================================================
   10-09 必交 13 页（功能冻结清单-10-05.md 1.1 阶段一）。
   本文件先交「环境 2 页」为样板页，其余 11 页给可点的结构化占位。
   样板页的作用：其余板块照它的结构做，不去各造一套。

   页面自检（前端骨架规范 第六节）：
     ☑ 用四个模板之一，不另起布局
     ☑ 页面顶部有数据来源标签
     ☑ 每个数值带单位与来源
     ☑ 数据缺失显示 — 而不是白屏
     ☑ 时间窗切换后所有图表一起刷
     ☑ 不直接读别人板块的数据（一律走 API）

   建立：2026-10-05
   ============================================================ */
(function (global) {
  'use strict';
  const P = {};

  /* ---------- 未实现页的公共占位（不白屏、说明它要做什么） ---------- */
  function todoPage(title, desc, bullets) {
    return {
      props: {},
      template:
        '<div>' +
        '  <page-head :title="\'' + title + '\'" :desc="\'' + desc + '\'"></page-head>' +
        '  <div class="card">' +
        '    <div class="card-title">本页计划包含</div>' +
        '    <ul style="margin:0;padding-left:20px;line-height:1.9">' +
        bullets.map(function (b) { return '<li>' + b + '</li>'; }).join('') +
        '    </ul>' +
        '  </div>' +
        '  <div class="hint" style="margin-top:12px">' +
        '    本页排在 <b>10-23 终版</b>补齐，不在 10-09 的 13 页里。' +
        '    10-09 必交页见 <b>功能冻结清单-10-05.md</b> 1.1 节。' +
        '  </div>' +
        '</div>'
    };
  }

  /* ============================================================
     环境 · 海况  /env/sea        —— 样板页 A（总览型模板）
     模板 A：数值卡区 + 主图区(62%) + 侧栏(38%) + 操作条
     ============================================================ */
  P['/env/sea'] = {
    data: function () {
      return { minutes: 60, site: 'site_01', storm: false, picked: null, series: null };
    },
    computed: {
      fast: function () { return this.series ? this.series.fast : []; },
      last: function () { return this.fast.length ? this.fast[this.fast.length - 1] : {}; },
      charts: function () {
        return [
          { name: '浪高', unit: 'm', data: this.fast.map(function (r) { return [r.ts, r.wave_height]; }) },
          { name: '风速', unit: 'm/s', data: this.fast.map(function (r) { return [r.ts, r.wind_speed]; }) }
        ];
      },
      events: function () {
        /* 由真实数据算出的事件：越限即列为事件（不做假数据） */
        const out = [];
        const self = this;
        this.fast.forEach(function (r) {
          if (r.wave_height != null && r.wave_height >= 2.5) {
            out.push({ id: 'w' + r.ts, ts: r.ts, level: r.wave_height >= 3 ? 'red' : 'orange',
                       text: '浪高 ' + r.wave_height + ' m 超阈值（≥2.5 m）' });
          }
        });
        return out.slice(-20).reverse();
      }
    },
    methods: {
      load: function () {
        this.series = API.env(this.site, this.minutes, { storm: this.storm });
      },
      siteName: function () {
        const sid = this.site;
        const s = API.sites().filter(function (x) { return x.site_id === sid; })[0];
        return s ? s.site_name : sid;
      },
      time: function (ts) {
        return new Date(ts).toLocaleString('zh-CN', { hour12: false });
      }
    },
    mounted: function () { this.load(); },
    watch: {
      minutes: function () { this.load(); },
      site: function () { this.load(); },
      storm: function () { this.load(); }
    },
    template: [
      '<div>',
      '  <page-head title="环境 · 海况"',
      '    desc="浪高 / 风速 / 流速 / 气温。数据来源：公开浮标 + 仿真生成"',
      '    :sources="[\'public\',\'simulated\']" />',
      '',
      '  <div class="grid-stats">',
      '    <stat-card name="浪高" field="wave_height" unit="m" :value="last.wave_height"',
      '               :quality="last.quality" :ts="last.ts" source="simulated" />',
      '    <stat-card name="风速" field="wind_speed" unit="m/s" :value="last.wind_speed"',
      '               :quality="last.quality" :ts="last.ts" source="simulated" />',
      '    <stat-card name="海水流速" field="current_speed" unit="m/s" :value="last.current_speed"',
      '               :quality="last.quality" :ts="last.ts" source="simulated" />',
      '    <stat-card name="环境气温" field="air_temp" unit="℃" :value="last.air_temp"',
      '               :quality="last.quality" :ts="last.ts" source="simulated" />',
      '  </div>',
      '',
      '  <div class="split" style="margin-top:12px">',
      '    <trend-chart title="浪高 / 风速 趋势" :series="charts"',
      '                 :thresholds="[{value:2.5,label:\'浪高阈值 2.5 m\',color:\'#991B1B\'}]" />',
      '    <div class="card">',
      '      <div class="card-title">海况事件（由数据实时判定）</div>',
      '      <event-list :items="events" empty-text="本时段无越限事件" @pick="picked = $event" />',
      '      ',
      '      <div v-if="picked" class="hint" style="margin-top:10px">',
      '        <b>已选事件</b><br>{{ picked.text }}<br>',
      '        <span class="small">时间：{{ time(picked.ts) }}</span>',
      '      </div>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <time-range v-model="minutes" />',
      '    <span style="width:12px"></span>',
      '    <span class="small muted">站点</span>',
      '    <select v-model="site">',
      '      <option v-for="s in API.sites()" :key="s.site_id" :value="s.site_id">{{ s.site_name }}</option>',
      '    </select>',
      '    <span style="flex:1"></span>',
      '    <button :class="{ primary: storm }" @click="storm = !storm">',
      '      {{ storm ? \'恢复平常海况\' : \'触发大风大浪（造故障）\' }}',
      '    </button>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  /* ============================================================
     环境 · 水质  /env/water      —— 样板页 B（总览型模板）
     这一页承载「一条竖线」：水温 → 曲线 → 越限 → 告警
     ============================================================ */
  P['/env/water'] = {
    data: function () {
      return { minutes: 60, site: 'site_01', heat: false, picked: null, series: null,
               show: { water_temp: true, dissolved_oxygen: true, light_intensity: false } };
    },
    computed: {
      fast: function () { return this.series ? this.series.fast : []; },
      slow: function () { return this.series ? this.series.slow : []; },
      last: function () { return this.fast.length ? this.fast[this.fast.length - 1] : {}; },
      lastSlow: function () { return this.slow.length ? this.slow[this.slow.length - 1] : {}; },
      charts: function () {
        const s = this.show, out = [];
        const add = function (name, unit, key) {
          if (s[key]) out.push({ name: name, unit: unit, data: this.fast.map(function (r) { return [r.ts, r[key]]; }) });
        }.bind(this);
        add('水温', '℃', 'water_temp');
        add('溶解氧', 'mg/L', 'dissolved_oxygen');
        add('光照强度', 'lux', 'light_intensity');
        return out;
      },
      /* ★ 一条竖线：水温越限 → 出告警（判定规则在 API.ruleCheck，与后端同口径） */
      alarms: function () {
        const out = [];
        this.fast.forEach(function (r) {
          const hit = API.ruleCheck(r);
          if (hit) out.push({ id: 'a' + r.ts, ts: r.ts, level: hit.risk_level, hit: hit, row: r });
        });
        return out;
      },
      events: function () {
        return this.alarms.slice(-20).reverse().map(function (a) {
          return { id: a.id, ts: a.ts, level: a.level,
                   text: '水温 ' + a.hit.trigger_value + ' ℃ 触发「' + a.hit.rule_name + '」' };
        });
      },
      topAlarm: function () { return this.alarms.length ? this.alarms[this.alarms.length - 1] : null; }
    },
    methods: {
      load: function () { this.series = API.env(this.site, this.minutes, { heat: this.heat }); },
      time: function (ts) { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); }
    },
    mounted: function () { this.load(); },
    watch: {
      minutes: function () { this.load(); },
      site: function () { this.load(); },
      heat: function () { this.load(); }
    },
    template: [
      '<div>',
      '  <page-head title="环境 · 水质"',
      '    desc="水温 / 溶解氧 5 秒；盐度 / pH 30 秒慢变量；光照强度 5 秒"',
      '    :sources="[\'public\',\'simulated\']" />',
      '',
      '  <!-- 一条竖线的可视化：命中规则时当场显示，点得开、看得见依据 -->',
      '  <div v-if="topAlarm" class="hint" style="margin-bottom:12px;background:#FEF2F2;border-color:#FECACA">',
      '    <b>⚠ 本时段命中规则：{{ topAlarm.hit.rule_name }}</b>',
      '    <span class="tag tag-simulated" style="margin-left:8px">规则 {{ topAlarm.hit.rule_id }}</span>',
      '    <div class="small" style="margin-top:6px">',
      '      {{ topAlarm.hit.trigger_field }} = <b>{{ topAlarm.hit.trigger_value }}</b>',
      '      （阈值 {{ topAlarm.hit.trigger_threshold }}）· 时间 {{ time(topAlarm.ts) }}',
      '      · <a href="#/trace">去追溯查询看完整链路 →</a>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="grid-stats">',
      '    <stat-card name="水温" field="water_temp" unit="℃" :value="last.water_temp"',
      '               :quality="last.quality" :ts="last.ts" source="simulated" />',
      '    <stat-card name="溶解氧" field="dissolved_oxygen" unit="mg/L" :value="last.dissolved_oxygen"',
      '               :quality="last.quality" :ts="last.ts" source="simulated" />',
      '    <stat-card name="盐度" field="salinity" unit="‰" :value="lastSlow.salinity"',
      '               quality="good" :ts="lastSlow.ts" source="simulated" />',
      '    <stat-card name="pH 值" field="ph" unit="" :value="lastSlow.ph"',
      '               quality="good" :ts="lastSlow.ts" source="simulated" />',
      '    <stat-card name="光照强度" field="light_intensity" unit="lux" :value="last.light_intensity"',
      '               :quality="last.quality" :ts="last.ts" source="simulated" />',
      '  </div>',
      '',
      '  <div class="split" style="margin-top:12px">',
      '    <div>',
      '      <trend-chart title="水质趋势（可勾选参数）" :series="charts"',
      '                   :thresholds="[{value:21.5,label:\'水温上限 21.5 ℃\',color:\'#991B1B\'}]" />',
      '      <div class="card" style="margin-top:12px">',
      '        <span class="small muted">曲线显示：</span>',
      '        <label class="small" style="margin-left:10px"><input type="checkbox" v-model="show.water_temp"> 水温</label>',
      '        <label class="small" style="margin-left:10px"><input type="checkbox" v-model="show.dissolved_oxygen"> 溶解氧</label>',
      '        <label class="small" style="margin-left:10px"><input type="checkbox" v-model="show.light_intensity"> 光照强度</label>',
      '      </div>',
      '    </div>',
      '    <div class="card">',
      '      <div class="card-title">水质事件 / 告警（由规则实时判定）</div>',
      '      <event-list :items="events" empty-text="本时段无越限事件" @pick="picked = $event" />',
      '      <div v-if="picked" class="hint" style="margin-top:10px">',
      '        <b>已选</b><br>{{ picked.text }}<br>',
      '        <span class="small">时间：{{ time(picked.ts) }}</span>',
      '      </div>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <time-range v-model="minutes" />',
      '    <span style="width:12px"></span>',
      '    <span class="small muted">站点</span>',
      '    <select v-model="site">',
      '      <option v-for="s in API.sites()" :key="s.site_id" :value="s.site_id">{{ s.site_name }}</option>',
      '    </select>',
      '    <span style="flex:1"></span>',
      '    <button :class="{ primary: heat }" @click="heat = !heat">',
      '      {{ heat ? \'恢复正常水温\' : \'触发水温骤升（造故障）\' }}',
      '    </button>',
      '    <span style="width:12px"></span>',
      '    <span class="small muted">口径：{{ API.disclaimer }}</span>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  /* ============================================================
     其余 11 页：可点的结构化占位（10-09 前补齐为真页面）
     ============================================================ */
  P['/overview'] = todoPage('总览大屏',
    '全板块汇总，默认落地页', [
      '全板块顶部指标条（每板块 1–2 个关键值）',
      '左：结构安全风险等级 ｜ 中：鱼群与环境趋势 ｜ 右：告警计数 + 最新',
      '底：设备状态汇总 + 能源保障摘要',
      '<b>取数一律走接口，不直接读别人内部数据</b>'
    ]);

  P['/fish/monitor'] = todoPage('鱼类 · 鱼类监测总览',
    '行为识别 + 生物量统计（覆盖项目记录 1.1 的鱼类 4 项功能里的 2 项）', [
      '数值卡：现存尾数 / 平均体重 / 预估总生物量 / 摄食强度',
      '曲线：生物量趋势 + 摄食强度',
      '侧栏：鱼类异常事件',
      '指标口径：<code>fish_count</code> <code>avg_weight_g</code> <code>total_biomass_kg</code> <code>feeding_intensity</code>',
      '<b>投喂量不算</b>（裁定 1：归智能）'
    ]);

  P['/fish/heatmap'] = todoPage('鱼类 · 鱼群分布热力图',
    '答辩视觉亮点', [
      '10×10 网格热力图（拍板问题单 问题 5）',
      '接口字段 <code>grid[][]</code>',
      '配色沿用状态色阶，不用彩虹色'
    ]);

  P['/struct/alarm'] = todoPage('结构安全 · 灾害分级预警',
    '答辩必答题：每条预警能点开看到「哪条数据触发的、命中了哪条规则」', [
      '数值卡：当前最高预警等级 / 活跃预警数 / 网箱健康评分',
      '分级预警列表（蓝/黄/橙/红 色阶）',
      '「查看触发依据」按钮 → 跳 <code>/trace</code>',
      '阈值一律标「<b>经验阈值，未经现场标定</b>」（裁定 2）'
    ]);

  P['/struct/energy'] = todoPage('结构安全 · 能源保障',
    '光伏 / 储能 / 功耗', [
      '数值卡：光伏发电功率、储能电量（kWh）、储能 SOC、总功耗、能源自给率',
      '<b>量 vs 功率要分清</b>：kWh 是能量、kW 是功率（裁定 N3）',
      '低电量两条线：20% 黄、10% 红',
      '曲线：发电 / 功耗 / SOC 趋势'
    ]);

  /* ============================================================
     智能 · 自动投喂  /ai/feed   —— 答辩重点：命令状态机
     验收标准 3：一条投喂命令走完 created → sent → acknowledged → success
     ============================================================ */
  P['/ai/feed'] = {
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
      load: function () { this.dec = API.feedDecision(); this.records = API.feedRecords(); },
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
      '    <stat-card name="投饵机状态" field="device_state" unit="" :value="feeder.device_state" source="simulated" />',
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

  /* ============================================================
     跨板块 · 追溯查询  /trace   —— 答辩必答题
     验收标准 2 的闭环：哪条数据 → 命中哪条规则 → 结果如何
     ============================================================ */
  P['/trace'] = {
    data: function () { return { id: '', picked: null }; },
    computed: {
      alarms: function () { return API.alarms(); },
      list: function () { return this.alarms; }
    },
    methods: {
      time: function (ts) { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); },
      lvCn: function (lv) { return { blue: '蓝色', yellow: '黄色', orange: '橙色', red: '红色' }[lv] || lv; },
      lvCls: function (lv) { return 'bg-' + (lv || 'blue'); },
      pick: function (a) { this.picked = a; this.id = a.alarm_event_id; },
      find: function () {
        const a = API.alarm(this.id.trim());
        this.picked = a;
        if (!a) this.picked = null;
      }
    },
    mounted: function () { if (this.list.length) this.pick(this.list[0]); },
    template: [
      '<div>',
      '  <page-head title="跨板块 · 追溯查询"',
      '    desc="答辩必答题：<b>哪条数据 → 命中哪条规则 → 结果如何</b>。抽 20 条要 100% 能反查"',
      '    :sources="[\'simulated\']" />',
      '',
      '  <div class="card">',
      '    <div class="row" style="align-items:center">',
      '      <span class="small muted">告警事件编号</span>',
      '      <input type="text" v-model="id" placeholder="ALM-0001" style="width:200px" @keyup.enter="find">',
      '      <button class="primary" @click="find">反查全链路</button>',
      '      <span v-if="id && !picked" class="small" style="color:#991B1B">查不到这个编号</span>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="row" style="margin-top:12px;align-items:flex-start">',
      '    <div class="card" style="flex:0 0 340px">',
      '      <div class="card-title">现有告警（点一条直接追溯）</div>',
      '      <div class="events">',
      '        <div v-for="a in list" :key="a.alarm_event_id" class="row-item" @click="pick(a)"',
      '             :style="{ background: picked && picked.alarm_event_id === a.alarm_event_id ? \'#F1F5F9\' : \'\' }">',
      '          <span class="dot" :class="lvCls(a.risk_level)"></span>',
      '          <span class="d"><span class="mono">{{ a.alarm_event_id }}</span> · {{ a.rule_name }}</span>',
      '        </div>',
      '      </div>',
      '    </div>',
      '',
      '    <div style="flex:1;min-width:0">',
      '      <div v-if="!picked" class="todo">左侧点一条告警，或输入编号反查</div>',
      '      <div v-else>',
      '        <div class="card">',
      '          <div class="card-title">',
      '            <span class="dot" :class="lvCls(picked.risk_level)"></span>',
      '            {{ picked.alarm_event_id }} · {{ picked.rule_name }}',
      '          </div>',
      '          <div class="kv">',
      '            <span class="k">规则编号</span><span class="mono">{{ picked.rule_id }}</span>',
      '            <span class="k">规则条件</span><span class="mono">{{ picked.rule_condition }}</span>',
      '            <span class="k">组合条件</span><span class="mono">{{ picked.combine_condition || \'—\' }}</span>',
      '            <span class="k">预警类型</span><span>{{ picked.alarm_type }}</span>',
      '            <span class="k">预警等级</span><span>{{ lvCn(picked.risk_level) }}预警</span>',
      '            <span class="k">预警时间</span><span>{{ time(picked.alarm_ts) }}</span>',
      '            <span class="k">预警状态</span><span>{{ picked.alarm_status }}</span>',
      '          </div>',
      '        </div>',
      '',
      '        <div class="card">',
      '          <div class="card-title">① 哪条数据触发的</div>',
      '          <div class="kv">',
      '            <span class="k">触发字段</span><span class="mono">{{ picked.trigger_field }}</span>',
      '            <span class="k">触发值</span><span><b>{{ picked.trigger_value }}</b></span>',
      '            <span class="k">触发阈值</span><span>{{ picked.trigger_threshold }}</span>',
      '          </div>',
      '        </div>',
      '',
      '        <div class="card">',
      '          <div class="card-title">② 触发数据快照（trigger_snapshot）</div>',
      '          <pre class="mono small" style="margin:0;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:10px;overflow:auto">{{ JSON.stringify(picked.trigger_snapshot, null, 2) }}</pre>',
      '        </div>',
      '',
      '        <div class="card">',
      '          <div class="card-title">③ 结果如何</div>',
      '          <div class="kv">',
      '            <span class="k">处置建议</span><span>{{ picked.handling_advice }}</span>',
      '            <span class="k">处置状态</span><span>{{ picked.handle_status }}</span>',
      '            <span class="k">确认状态</span><span>{{ picked.confirm_status }}</span>',
      '            <span class="k">恢复时间</span><span>{{ picked.recover_ts ? time(picked.recover_ts) : \'尚未恢复\' }}</span>',
      '          </div>',
      '          <div class="row" style="margin-top:12px">',
      '            <a href="#/handle"><button>去处置中心 →</button></a>',
      '            <a href="#/alarm"><button>去告警中心 →</button></a>',
      '          </div>',
      '        </div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  /* ============================================================
     跨板块 · 处置中心  /handle
     所有处置动作走智能板块的指令状态机
     ============================================================ */
  P['/handle'] = {
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
      '    :sources="[\'simulated\']" />',
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
      '                  <td class="mono">{{ c.command_id }}</td><td>{{ c.command_type }}</td>',
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

  P['/ai/light'] = todoPage('智能 · 智能补光',
    '本期<b>只做手工模式</b>（裁定 7：自动补光依据查不到出处，不编）', [
      '数值卡：当前光照 / 灯具状态 / 调光档位',
      '曲线：光照强度 + 补光记录',
      '<code>light_dimming_pct</code> 单位 <b>%</b>（裁定 N2）',
      '「下发补光命令」按钮 + 二次确认弹窗',
      '答辩口径：补光接口已定义并可用，自动决策依据待养殖专家确认'
    ]);

  P['/alarm'] = todoPage('跨板块 · 告警中心',
    '顶层统一做一套（裁定 11 B 案），各板块只提供数据', [
      '各板块 <code>alarm_event</code> 汇总到一个入口',
      '按 类型 / 等级 / 状态 筛选',
      '答辩卖点：<b>「一个告警中心能看到所有板块的异常」</b>',
      '告警分级规则由结构安全（邓宇涵）提供'
    ]);

  P['/config'] = todoPage('跨板块 · 参数配置',
    '阈值与规则配置', [
      '环境阈值（由环境板块提）',
      '判断规则挂在结构安全的规则引擎上',
      '改完 <b>要能看到生效</b>（10 分钟内能加一条规则）'
    ]);

  global.PAGES = P;
})(window);
