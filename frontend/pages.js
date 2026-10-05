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

  P['/ai/feed'] = todoPage('智能 · 自动投喂',
    '<b>答辩重点：命令状态机</b>', [
      '数值卡：当前生物量 / 上次投喂量 / 投饵机状态',
      '投喂记录时间线',
      '<b>命令状态机进度条</b>：created → sent → acknowledged → success',
      '失败路径：超时 → 重试中 → 失败 → 升级报警（<b>绝不允许悄悄失败</b>）',
      '「下发投喂命令」按钮 + <b>二次确认弹窗</b>'
    ]);

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

  P['/handle'] = todoPage('跨板块 · 处置中心',
    '所有处置动作走智能板块的指令状态机', [
      '处置动作 → 命令状态机（复用 <code>/ai/feed</code> 同一套）',
      '处置状态 <code>handle_status</code>：待处置 / 处置中 / 已处置 / 处置失败',
      '确认状态 <code>confirm_status</code> + 确认时间'
    ]);

  P['/trace'] = todoPage('跨板块 · 追溯查询',
    '<b>答辩必答题</b>：哪条数据 → 命中哪条规则 → 结果如何', [
      '输入一个告警事件编号，反查全链路',
      '<code>trigger_field</code> / <code>trigger_value</code> / <code>trigger_threshold</code>',
      '<code>trigger_snapshot</code> 触发数据快照',
      '<code>rule_id</code> / <code>rule_condition</code> / <code>combine_condition</code>',
      '验收：<b>抽 20 条 100% 能反查</b>'
    ]);

  P['/config'] = todoPage('跨板块 · 参数配置',
    '阈值与规则配置', [
      '环境阈值（由环境板块提）',
      '判断规则挂在结构安全的规则引擎上',
      '改完 <b>要能看到生效</b>（10 分钟内能加一条规则）'
    ]);

  global.PAGES = P;
})(window);
