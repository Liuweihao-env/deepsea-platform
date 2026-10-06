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
      return { minutes: 60, site: 'site_01', storm: false, picked: null, series: null,
               tick: 0, unsub: null, refreshing: false, refreshMsg: '', refreshOk: null };
    },
    computed: {
      fast: function () { return this.series ? this.series.fast : []; },
      /* 「当前值」：观测站点用后端挑好的「四字段齐全的那条」，
         养殖站点直接用最后一条。卡片上的 ts 就是这条记录的真实观测时间。 */
      last: function () {
        const s = this.series;
        if (s && s.current) return s.current;
        return this.fast.length ? this.fast[this.fast.length - 1] : {};
      },
      /* 当前站点是不是 NDBC 观测站点 —— 决定页面显示"实测"还是"仿真" */
      isObs: function () {
        const sid = this.site;
        const s = API.sites().filter(function (x) { return x.site_id === sid; })[0];
        return !!(s && s.kind === 'obs');
      },
      /* NDBC 直连状态（读后端缓存，不联网） */
      ndbc: function () { this.tick; return API.ndbcStatus(); },
      ndbcList: function () { const n = this.ndbc; return (n && n.stations) || []; },
      ndbcAny: function () {
        return this.ndbcList.filter(function (s) { return s.has_cache; }).length;
      },
      /* 数据来源：观测站点实时读的是本地缓存，不是每次渲染去联网 */
      srcLabel: function () {
        if (this.isObs) {
          return 'NOAA NDBC 公开浮标实测（读本地缓存）';
        }
        return '仿真生成（模拟养殖站点）';
      },
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
        const self = this;
        API.resolve(API.env(this.site, this.minutes, { storm: this.storm }),
                    function (d) { self.series = d; });
      },
      siteName: function () {
        const sid = this.site;
        const s = API.sites().filter(function (x) { return x.site_id === sid; })[0];
        return s ? s.site_name : sid;
      },
      time: function (ts) {
        return new Date(ts).toLocaleString('zh-CN', { hour12: false });
      },
      /* 显式拉取最新 —— 全平台唯一的联网动作 */
      doRefresh: function () {
        const self = this;
        this.refreshing = true;
        this.refreshMsg = '正在从 NOAA NDBC 拉取…';
        this.refreshOk = null;
        API.resolve(API.ndbcRefresh(), function (r) {
          self.refreshing = false;
          if (r && r.ok_count > 0) {
            self.refreshOk = true;
            self.refreshMsg = '已更新 ' + r.ok_count + ' 个浮标' +
              (r.fail_count ? '（' + r.fail_count + ' 个失败）' : '') + ' —— 页面数据已刷新';
          } else if (r && r.results && r.results.length) {
            self.refreshOk = false;
            const e = r.results[0].error || '未知错误';
            self.refreshMsg = '拉取失败：' + e + '（不影响演示，页面仍读本地缓存）';
          } else {
            self.refreshOk = false;
            self.refreshMsg = (r && r.error) || '拉取失败（不影响演示，页面仍读本地缓存）';
          }
          self.load();
        });
      },
      ageText: function (m) {
        if (m == null) return '—';
        if (m < 1) return '刚刚';
        if (m < 60) return Math.round(m) + ' 分钟前';
        return (m / 60).toFixed(1) + ' 小时前';
      },
      /* 这一行浮标就是当前正在看的站点吗（用于高亮 + 「正在看」标记） */
      isCurrentStation: function (s) {
        const cur = API.sites().filter(function (x) { return x.site_id === this.site; }.bind(this))[0];
        return !!(cur && cur.station_id === s.station_id);
      },
      /* 点浮标行直接切到该站点 —— 让「真实数据」一眼可及，不用去底部找下拉框 */
      gotoStation: function (s) {
        const hit = API.sites().filter(function (x) { return x.station_id === s.station_id; })[0];
        if (hit) this.site = hit.site_id;
      }
    },
    mounted: function () {
      const self = this;
      this.unsub = API.subscribe(function () { self.tick++; });
      this.load();
    },
    beforeUnmount: function () { if (this.unsub) { this.unsub(); this.unsub = null; } },
    watch: {
      minutes: function () { this.load(); },
      site: function () { this.load(); },
      storm: function () { this.load(); }
    },
    template: [
      '<div>',
      '  <page-head title="环境 · 海况"',
      '    desc="浪高 / 风速 / 流速 / 气温。观测站点为 NOAA NDBC 公开浮标实测，养殖站点为仿真生成"',
      '    :sources="isObs ? [\'public\'] : [\'simulated\']" />',
      '',
      '  <!-- NDBC 直连面板：说明数据从哪来、缓存新不新、一键拉最新 -->',
      '  <div class="card" style="margin-bottom:12px">',
      '    <div class="card-title">数据来源 · NOAA NDBC 直连</div>',
      '',
      '    <!-- ⚠️ 这块提示是必须的：默认站点是「模拟养殖站点」，数据本来就是仿真；',
      '         真实浮标数据要切站点才有。不提示的话用户会以为"直连没生效"。 -->',
      '    <div class="hint" style="margin-bottom:10px"',
      '         :style="isObs ? { background: \'#F0FDF4\', borderColor: \'#86EFAC\' } : { background: \'#FFFBEB\', borderColor: \'#FDE68A\' }">',
      '      <div style="font-size:14px">',
      '        当前站点：<b>{{ siteName() }}</b>',
      '        <span v-if="isObs" style="color:#166534"> —— ✅ 正在显示 <b>NOAA NDBC 真实浮标实测数据</b></span>',
      '        <span v-else style="color:#92400E"> —— ⚠️ 这是<b>模拟养殖站点，数据是仿真生成的</b></span>',
      '      </div>',
      '      <div v-if="!isObs" style="margin-top:6px">',
      '        <b>想看真实浮标数据？</b>点下面任意一个浮标行，或把底部「站点」切到 <b>NDBC 观测站点</b>。',
      '      </div>',
      '    </div>',
      '',
      '    <div class="dt-wrap" style="max-height:220px">',
      '      <table class="dt">',
      '        <thead><tr><th>浮标</th><th>海域</th><th>缓存条数</th><th>数据到</th><th>抓取于</th><th></th></tr></thead>',
      '        <tbody>',
      '          <tr v-for="s in ndbcList" :key="s.station_id"',
      '              :style="{ background: isCurrentStation(s) ? \'#EFF6FF\' : \'\', cursor: \'pointer\' }"',
      '              @click="gotoStation(s)">',
      '            <td class="mono">{{ s.station_id }}</td>',
      '            <td class="small">{{ s.station.cn }}</td>',
      '            <td>{{ s.count }}</td>',
      '            <td class="small mono">{{ s.latest_ts_utc || \'—\' }} UTC</td>',
      '            <td class="small">{{ ageText(s.age_minutes) }}</td>',
      '            <td class="small">',
      '              <span v-if="isCurrentStation(s)" style="color:#166534;font-weight:600">正在看</span>',
      '              <span v-else class="muted">点此切换 →</span>',
      '            </td>',
      '          </tr>',
      '          <tr v-if="!ndbcList.length">',
      '            <td colspan="6" class="muted small">',
      '              NDBC 状态需要后端 —— 请双击 <b>启动平台.bat</b> 打开。',
      '            </td>',
      '          </tr>',
      '        </tbody>',
      '      </table>',
      '    </div>',
      '    <div class="hint" style="margin-top:10px">',
      '      <b>页面读的是本地缓存，不是每次渲染去联网</b> —— 所以<b>拔掉网线也能演示</b>。',
      '      只有点下面这个按钮才会联网。',
      '    </div>',
      '    <div style="margin-top:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">',
      '      <button class="primary" :disabled="refreshing" @click="doRefresh">',
      '        {{ refreshing ? \'正在拉取…\' : \'立即拉取最新（联网）\' }}',
      '      </button>',
      '      <span v-if="refreshMsg" class="small"',
      '            :style="{ color: refreshOk === false ? \'#991B1B\' : (refreshOk ? \'#166534\' : \'#6B7280\') }">',
      '        {{ refreshMsg }}',
      '      </span>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="grid-stats">',
      '    <stat-card name="浪高" field="wave_height" unit="m" :value="last.wave_height"',
      '               :quality="last.quality" :ts="last.ts" :source="isObs ? \'public\' : \'simulated\'" />',
      '    <stat-card name="风速" field="wind_speed" unit="m/s" :value="last.wind_speed"',
      '               :quality="last.quality" :ts="last.ts" :source="isObs ? \'public\' : \'simulated\'" />',
      '    <stat-card name="海水流速" field="current_speed" unit="m/s" :value="last.current_speed"',
      '               :quality="last.quality" :ts="last.ts" :source="isObs ? \'public\' : \'simulated\'" />',
      '    <stat-card name="环境气温" field="air_temp" unit="℃" :value="last.air_temp"',
      '               :quality="last.quality" :ts="last.ts" :source="isObs ? \'public\' : \'simulated\'" />',
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
      return { minutes: 60, site: 'site_01', heat: false, offline: false, picked: null, series: null,
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
      load: function () {
        const self = this;
        API.resolve(API.env(this.site, this.minutes, { heat: this.heat, offline: this.offline }),
                    function (d) { self.series = d; });
      },
      time: function (ts) { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); }
    },
    mounted: function () { this.load(); },
    watch: {
      minutes: function () { this.load(); },
      site: function () { this.load(); },
      heat: function () { this.load(); },
      offline: function () { this.load(); }
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
      '               :quality="lastSlow.quality" :ts="lastSlow.ts" source="simulated" />',
      '    <stat-card name="pH 值" field="ph" unit="" :value="lastSlow.ph"',
      '               :quality="lastSlow.quality" :ts="lastSlow.ts" source="simulated" />',
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
      '    <button :class="{ primary: offline }" @click="offline = !offline">',
      '      {{ offline ? \'恢复设备在线\' : \'模拟设备离线（造故障）\' }}',
      '    </button>',
      '    <!-- 就地反馈：效果显示在你点的地方，不用滚回页首去看 -->',
      '    <span v-if="offline" class="small" style="color:#991B1B">',
      '      已触发：设备离线 —— 上方 5 张数值卡应变「— / 设备离线」',
      '    </span>',
      '    <span v-else-if="heat" class="small" style="color:#991B1B">',
      '      已触发：水温骤升 —— 当前水温 <b>{{ last.water_temp }}</b> ℃',
      '      <span v-if="topAlarm">，命中「{{ topAlarm.hit.rule_name }}」</span>',
      '    </span>',
      '    <span style="width:12px"></span>',
      '    <span class="small muted">口径：{{ API.disclaimer }}</span>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  /* ============================================================
     其余 11 页：可点的结构化占位（10-09 前补齐为真页面）
     ============================================================ */
  /* ============================================================
     总览大屏  /overview   —— 模板 C「总览大屏型」
     取数一律走接口，不直接读别人内部数据（前端骨架规范 第五节）
     ============================================================ */
  P['/overview'] = {
    data: function () {
      return { tick: 0, env: {}, fish: {}, st: {}, envTrend: [], unsub: null };
    },
    computed: {
      alarms: function () { this.tick; return API.alarms(); },
      activeCount: function () {
        return this.alarms.filter(function (a) { return a.alarm_status === 'active'; }).length;
      },
      topAlarm: function () {
        const rank = { red: 4, orange: 3, yellow: 2, blue: 1 };
        return this.alarms.slice().sort(function (a, b) { return rank[b.risk_level] - rank[a.risk_level]; })[0] || null;
      },
      devices: function () { return API.devices(); },
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
            { name: '溶解氧', unit: 'mg/L', data: d.fast.map(function (r) { return [r.ts, r.dissolved_oxygen]; }) }
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
      this.unsub = API.subscribe(function () { self.tick++; });
    },
    beforeUnmount: function () { if (this.unsub) this.unsub(); },
    template: [
      '<div>',
      '  <page-head title="总览大屏"',
      '    desc="全板块汇总。取数一律走接口，不直接读别人内部数据"',
      '    :sources="[\'real\',\'public\',\'simulated\']" />',
      '',
      '  <!-- 全板块顶部指标条 -->',
      '  <div class="grid-stats">',
      '    <stat-card name="水温（环境）" field="water_temp" unit="℃" :value="env.water_temp" :quality="env.quality" :ts="env.ts" :sources="null" source="simulated" />',
      '    <stat-card name="现存尾数（鱼类）" field="fish_count" unit="尾" :value="fish.fish_count" :digits="0" source="public" />',
      '    <stat-card name="总生物量（鱼类）" field="total_biomass_kg" unit="kg" :value="fish.total_biomass_kg" source="simulated" />',
      '    <stat-card name="锚泊张力（结构）" field="anchor_tension" unit="kN" :value="st.anchor_tension" source="simulated" />',
      '    <stat-card name="储能电量（结构）" field="battery_soc" unit="%" :value="st.battery_soc" source="simulated" />',
      '    <stat-card name="活跃告警" unit="条" :value="activeCount" :digits="0" source="simulated" />',
      '  </div>',
      '',
      '  <div class="row" style="margin-top:12px;align-items:flex-start">',
      '    <!-- 左：结构安全风险等级 -->',
      '    <div class="card" style="flex:1 1 300px">',
      '      <div class="card-title">结构安全风险等级</div>',
      '      <div style="font-size:34px;font-weight:700" :style="{ color: topAlarm ? ({red:\'#991B1B\',orange:\'#C2410C\',yellow:\'#92400E\',blue:\'#2F5496\'}[topAlarm.risk_level]) : \'#166534\' }">',
      '        {{ topAlarm ? lvCn(topAlarm.risk_level) + \'预警\' : \'正常\' }}',
      '      </div>',
      '      <div class="kv" style="margin-top:12px">',
      '        <span class="k">网箱健康评分</span><span>{{ st.health_score !== undefined ? 86 : \'—\' }}</span>',
      '        <span class="k">横滚 / 俯仰</span><span>{{ st.tilt_roll }}° / {{ st.tilt_pitch }}°</span>',
      '        <span class="k">能源自给率</span><span>{{ st.energy_self_sufficiency }} %</span>',
      '      </div>',
      '      <div style="margin-top:12px"><a href="#/struct/alarm"><button>看灾害预警 →</button></a></div>',
      '    </div>',
      '',
      '    <!-- 中：鱼群与环境趋势 -->',
      '    <div style="flex:2 1 460px;min-width:0">',
      '      <trend-chart title="鱼群与环境趋势（水温 / 溶解氧）" :series="envTrend" small />',
      '    </div>',
      '',
      '    <!-- 右：告警计数 + 最新 -->',
      '    <div class="card" style="flex:1 1 300px">',
      '      <div class="card-title">告警（活跃 {{ activeCount }} 条）</div>',
      '      <div class="events">',
      '        <div v-for="a in alarms" :key="a.alarm_event_id" class="row-item" @click="$root.$el && null">',
      '          <span class="dot" :class="lvCls(a.risk_level)"></span>',
      '          <span class="d"><span class="mono">{{ a.alarm_event_id }}</span> {{ a.rule_name }}</span>',
      '        </div>',
      '      </div>',
      '      <div style="margin-top:10px"><a href="#/alarm"><button>去告警中心 →</button></a></div>',
      '    </div>',
      '  </div>',
      '',
      '  <!-- 底：设备状态汇总 + 能源保障摘要 -->',
      '  <div class="row" style="margin-top:12px;align-items:flex-start">',
      '    <div class="card" style="flex:1 1 420px">',
      '      <div class="card-title">设备状态汇总（在线 {{ onlineCount }} / {{ devices.length }}）</div>',
      '      <table class="dt">',
      '        <thead><tr><th>设备</th><th>类型</th><th>在线</th><th>状态</th></tr></thead>',
      '        <tbody>',
      '          <tr v-for="d in devices" :key="d.device_id">',
      '            <td class="mono">{{ d.device_id }}</td><td>{{ CN.deviceType(d.device_type) }}</td>',
      '            <td>{{ d.device_online ? \'在线\' : \'离线\' }}</td>',
      '            <td>{{ CN.deviceState(d.device_state) }}</td>',
      '          </tr>',
      '        </tbody>',
      '      </table>',
      '    </div>',
      '    <div class="card" style="flex:1 1 320px">',
      '      <div class="card-title">能源保障摘要</div>',
      '      <div class="kv">',
      '        <span class="k">光伏发电功率</span><span>{{ st.pv_power }} kW</span>',
      '        <span class="k">今日发电量</span><span>{{ st.pv_energy_today }} kWh</span>',
      '        <span class="k">储能电量</span><span>{{ st.battery_energy }} kWh / 容量 {{ st.battery_capacity_kwh }} kWh</span>',
      '        <span class="k">总功耗</span><span>{{ st.total_power }} kW</span>',
      '      </div>',
      '      <div class="small muted" style="margin-top:8px">',
      '        注意区分：<b>kWh 是能量、kW 是功率</b>（裁定 N3）。',
      '      </div>',
      '      <div style="margin-top:10px"><a href="#/struct/energy"><button>看能源保障 →</button></a></div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  /* ============================================================
     鱼类 · 鱼类监测总览  /fish/monitor
     覆盖项目记录 1.1 的鱼类功能：行为识别 + 生物量统计
     ============================================================ */
  P['/fish/monitor'] = {
    data: function () { return { minutes: 60, series: [] }; },
    computed: {
      last: function () { return this.series.length ? this.series[this.series.length - 1] : {}; },
      charts: function () {
        return [
          { name: '现存尾数', unit: '尾', data: this.series.map(function (r) { return [r.ts, r.fish_count]; }) },
          { name: '平均体重', unit: 'g', data: this.series.map(function (r) { return [r.ts, r.avg_weight_g]; }) },
          { name: '预估总生物量', unit: 'kg', data: this.series.map(function (r) { return [r.ts, r.total_biomass_kg]; }) }
        ];
      },
      /* 摄食强度变化即"事件"——由数据实时判定，不造假事件 */
      events: function () {
        const out = [];
        let prev = null;
        this.series.forEach(function (r) {
          if (prev !== null && r.feeding_intensity !== prev) {
            out.push({ id: 'f' + r.ts, ts: r.ts,
                       level: r.feeding_intensity === 'strong' ? 'blue'
                            : r.feeding_intensity === 'none' ? 'yellow' : 'orange',
                       text: '摄食强度由「' + this.cn(prev) + '」变为「' + this.cn(r.feeding_intensity) + '」',
                       row: r });
          }
          prev = r.feeding_intensity;
        }, this);
        return out.slice(-15).reverse();
      }
    },
    methods: {
      load: function () {
        const self = this;
        API.resolve(API.fish(this.minutes), function (d) { self.series = d; });
      },
      cn: function (v) { return { none: '无', weak: '弱', mid: '中', strong: '强' }[v] || v; },
      time: function (ts) { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); }
    },
    mounted: function () { this.load(); },
    watch: { minutes: function () { this.load(); } },
    template: [
      '<div>',
      '  <page-head title="鱼类 · 鱼类监测总览"',
      '    desc="行为识别 + 生物量统计。数据来源：公开数据集（TFBID / DeepFish）+ 仿真"',
      '    :sources="[\'public\',\'simulated\']" />',
      '',
      '  <div class="grid-stats">',
      '    <stat-card name="现存总尾数" field="fish_count" unit="尾" :value="last.fish_count" :digits="0" source="public" />',
      '    <stat-card name="平均体重" field="avg_weight_g" unit="g" :value="last.avg_weight_g" source="simulated" />',
      '    <stat-card name="平均体长" field="avg_length_cm" unit="cm" :value="last.avg_length_cm" source="simulated" />',
      '    <stat-card name="预估总生物量" field="total_biomass_kg" unit="kg" :value="last.total_biomass_kg" source="simulated" />',
      '    <stat-card name="鱼群摄食强度" field="feeding_intensity" unit="" :value="cn(last.feeding_intensity)" source="public" />',
      '    <stat-card name="活动鱼群密度" field="fish_density" unit="尾/m³" :value="last.fish_density" source="simulated" />',
      '  </div>',
      '',
      '  <div class="split" style="margin-top:12px">',
      '    <trend-chart title="数量与生长趋势" :series="charts" />',
      '    <div class="card">',
      '      <div class="card-title">摄食行为变化（行为识别输出）</div>',
      '      <event-list :items="events" empty-text="本时段摄食强度无变化" />',
      '    </div>',
      '  </div>',
      '',
      '  <div class="hint" style="margin-top:12px">',
      '    <b>口径说明</b>：投喂量<b>不在这里算</b> —— 按裁定 1，投喂决策归智能板块，',
      '    鱼类只出观测类指标。鱼类不再提供 <code>suggest_feed_kg_h</code>。',
      '    生长参数用 <code>W = lw_a · L^lw_b</code>，公式参数 <code>lw_a</code> / <code>lw_b</code> 来源须标注公开文献。',
      '  </div>',
      '',
      '  <div class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <time-range v-model="minutes" />',
      '    <span style="flex:1"></span>',
      '    <span class="small muted">本期不做：FCR / 活跃度 / 体长离散度 / 死亡个体数（裁定 5）</span>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  /* ============================================================
     鱼类 · 鱼群分布热力图  /fish/heatmap
     ============================================================ */
  P['/fish/heatmap'] = {
    data: function () { return { grid: [], picked: null }; },
    computed: {
      peak: function () {
        let best = { x: 0, y: 0, v: -1 }, sum = 0, n = 0;
        this.grid.forEach(function (row, y) {
          row.forEach(function (v, x) {
            if (v > best.v) best = { x: x, y: y, v: v };
            sum += v; n++;
          });
        });
        return { best: best, avg: n ? +(sum / n).toFixed(1) : 0 };
      }
    },
    methods: {
      load: function () {
        const self = this;
        API.resolve(API.heatGrid(), function (g) { self.grid = g; });
      }
    },
    mounted: function () { this.load(); },
    template: [
      '<div>',
      '  <page-head title="鱼类 · 鱼群分布热力图"',
      '    desc="10 × 10 网格累加密度（拍板问题单 问题 5 建议 A）。接口字段 <code>grid[][]</code>"',
      '    :sources="[\'simulated\']" />',
      '',
      '  <div class="grid-stats">',
      '    <stat-card name="最高密度网格" unit="尾/m³" :value="peak.best.v" source="simulated" />',
      '    <stat-card name="最高密度位置" unit="" :value="\'X\' + (peak.best.x + 1) + \' / Y\' + (peak.best.y + 1)" source="simulated" />',
      '    <stat-card name="网格平均密度" unit="尾/m³" :value="peak.avg" source="simulated" />',
      '    <stat-card name="网格分辨率" unit="" value="10 × 10" source="simulated" />',
      '  </div>',
      '',
      '  <div style="margin-top:12px">',
      '    <heat-grid title="鱼群密度分布（颜色越红越密）" :grid="grid" unit="尾/m³" :height="430" />',
      '  </div>',
      '',
      '  <div class="hint" style="margin-top:12px">',
      '    <b>为什么是 10 × 10</b>：热力图是给值班人<b>一眼看趋势</b>用的，不是科研分析。',
      '    10×10 已经能清楚显示鱼群集中在哪个区域；20×20 单格在网页上小于可读尺寸，收益不明显。',
      '  </div>',
      '',
      '  <div class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <button @click="load">重新采样</button>',
      '    <span style="flex:1"></span>',
      '    <span class="small muted">配色沿用状态色阶语义，未使用彩虹色</span>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  /* ============================================================
     结构安全 · 灾害分级预警  /struct/alarm
     答辩必答题：每条预警能点开看到「哪条数据触发的、命中了哪条规则」
     ============================================================ */
  P['/struct/alarm'] = {
    data: function () { return { minutes: 60, series: [], picked: null }; },
    computed: {
      last: function () { return this.series.length ? this.series[this.series.length - 1] : {}; },
      charts: function () {
        return [
          { name: '锚泊张力占设计值', unit: '%', data: this.series.map(function (r) { return [r.ts, r.tension_pct]; }) },
          /* axis: 1 → 走右轴。俯仰角是 0–3° 量级，跟 0–100% 的张力共用左轴会被压成一条贴底的直线。 */
          { name: '俯仰角', unit: '°', axis: 1, data: this.series.map(function (r) { return [r.ts, r.tilt_pitch]; }) }
        ];
      },
      /* 规则判定：**边沿触发**，不是电平触发。
         ⚠️ 原来写的是「每个采样点只要越限就报一条」——5 秒一个点，一小时报了 1130 条，
            界面上看着像系统坏了；真实告警系统也绝不会这么干。
            现在只在「状态发生变化」时出一条：黄→红 出一条，恢复正常后再越限才再出。 */
      hits: function () {
        const out = [];
        const prev = {};
        this.series.forEach(function (r) {
          const fams = [
            { fam: 'tension', type: 'tension', field: 'tension_pct', value: r.tension_pct,
              lv: r.tension_pct >= 95 ? 'red' : (r.tension_pct >= 80 ? 'yellow' : null),
              th: r.tension_pct >= 95 ? 95 : 80,
              rule: r.tension_pct >= 95
                ? ['R-TENSION-02', '锚泊张力红色预警', '张力超过设计值 95%']
                : ['R-TENSION-01', '锚泊张力黄色预警', '张力超过设计值 80%'] },
            { fam: 'tilt', type: 'tilt', field: 'tilt_pitch', value: r.tilt_pitch,
              lv: Math.abs(r.tilt_pitch) >= 3 ? 'red' : (Math.abs(r.tilt_pitch) >= 2 ? 'orange' : null),
              th: Math.abs(r.tilt_pitch) >= 3 ? 3 : 2,
              rule: Math.abs(r.tilt_pitch) >= 3
                ? ['R-TILT-02', '网箱倾斜红色预警', '俯仰角超过 3°']
                : ['R-TILT-01', '网箱倾斜橙色预警', '俯仰角超过 2°'] },
            { fam: 'battery', type: 'low_battery', field: 'battery_soc', value: r.battery_soc,
              lv: r.battery_soc < 10 ? 'red' : (r.battery_soc < 20 ? 'yellow' : null),
              th: r.battery_soc < 10 ? 10 : 20,
              rule: r.battery_soc < 10
                ? ['R-BAT-02', '储能严重低电量预警', '储能电量低于 10%']
                : ['R-BAT-01', '储能低电量黄色预警', '储能电量低于 20%'] }
          ];
          fams.forEach(function (d) {
            if (d.lv && prev[d.fam] !== d.lv) {
              out.push({ ts: r.ts, level: d.lv, type: d.type, field: d.field,
                         value: d.value, threshold: d.th,
                         rule_id: d.rule[0], rule_name: d.rule[1], why: d.rule[2], row: r });
            }
            prev[d.fam] = d.lv;
          });
        });
        const rank = { red: 3, orange: 2, yellow: 1, blue: 0 };
        return out.sort(function (a, b) { return rank[b.level] - rank[a.level]; });
      },
      worst: function () {
        if (!this.hits.length) return { level: 'blue', text: '无预警' };
        const rank = { red: 4, orange: 3, yellow: 2, blue: 1 };
        const top = this.hits.slice().sort(function (a, b) { return rank[b.level] - rank[a.level]; })[0];
        return { level: top.level, text: { red: '红色', orange: '橙色', yellow: '黄色', blue: '蓝色' }[top.level] + '预警' };
      },
      events: function () {
        const self = this;
        return this.hits.slice(0, 18).map(function (h) {
          return { id: h.rule_id + h.ts, ts: h.ts, level: h.level,
                   text: h.rule_name + '（' + h.field + ' = ' + h.value + '，阈值 ' + h.threshold + '）', hit: h };
        });
      }
    },
    methods: {
      load: function () {
        const self = this;
        API.resolve(API.struct(this.minutes), function (d) { self.series = d; });
      },
      time: function (ts) { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); },
      lvCn: function (l) { return { blue: '蓝色', yellow: '黄色', orange: '橙色', red: '红色' }[l] || l; },
      lvCls: function (l) { return 'bg-' + (l || 'blue'); },
      pick: function (e) { this.picked = e.hit || e; }
    },
    mounted: function () { this.load(); },
    watch: { minutes: function () { this.load(); } },
    template: [
      '<div>',
      '  <page-head title="结构安全 · 灾害分级预警"',
      '    desc="每条预警都能点开看到「哪条数据触发的、命中了哪条规则」—— 答辩必答题"',
      '    :sources="[\'simulated\']" />',
      '',
      '  <div class="grid-stats">',
      '    <stat-card name="当前最高预警等级" unit="" :value="worst.text" source="simulated" />',
      '    <stat-card name="本时段告警条数" unit="条" :value="hits.length" :digits="0" source="simulated" />',
      '    <stat-card name="锚泊张力占设计值" field="tension_pct" unit="%" :value="last.tension_pct" source="simulated" />',
      '    <stat-card name="储能电量" field="battery_soc" unit="%" :value="last.battery_soc" source="simulated" />',
      '    <stat-card name="网箱横滚角" field="tilt_roll" unit="°" :value="last.tilt_roll" source="simulated" />',
      '    <stat-card name="网箱俯仰角" field="tilt_pitch" unit="°" :value="last.tilt_pitch" source="simulated" />',
      '  </div>',
      '',
      '  <div class="split" style="margin-top:12px">',
      '    <trend-chart title="张力与姿态趋势" :series="charts"',
      '      :thresholds="[{value:80,label:\'张力黄线 80%\',color:\'#92400E\'},{value:95,label:\'张力红线 95%\',color:\'#991B1B\'}]" />',
      '    <div class="card">',
      '      <div class="card-title">分级预警列表（近 {{ events.length }} 条）</div>',
      '      <div style="max-height:430px;overflow:auto">',
      '        <event-list :items="events" empty-text="本时段无预警" @pick="pick" />',
      '      </div>',
      '      <div v-if="picked" class="hint" style="margin-top:10px">',
      '        <b>{{ picked.rule_name }}</b>',
      '        <span class="tag tag-simulated" style="margin-left:8px">{{ picked.rule_id }}</span>',
      '        <div class="small" style="margin-top:6px">',
      '          {{ picked.field }} = <b>{{ picked.value }}</b>（阈值 {{ picked.threshold }}）<br>',
      '          时间 {{ time(picked.ts) }}<br>',
      '          快照：<span class="mono">{{ JSON.stringify({anchor_tension: picked.row.anchor_tension, tilt_pitch: picked.row.tilt_pitch, battery_soc: picked.row.battery_soc}) }}</span>',
      '        </div>',
      '        <div style="margin-top:8px"><a href="#/trace"><button>查看触发依据（追溯） →</button></a></div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="hint" style="margin-top:12px;background:#FFFBEB;border-color:#FDE68A">',
      '    ⚠️ <b>阈值来源</b>：张力 80% / 95%、倾角 2° / 3°、电量 20% / 10% 一律标注为',
      '    <b>「经验阈值，未经现场标定」</b>，出处写「参考文献区间 + 经验设定」。',
      '    文档、页面、答辩口径三处必须一致 —— <b>查不到出处就不编</b>（裁定 2）。',
      '    <div style="margin-top:6px">',
      '      <b>告警是边沿触发的</b>：只在状态发生变化时出一条（黄→红 出一条，恢复正常后再越限才再出），',
      '      不是每个采样点都报 —— 否则一小时能刷出上千条，看着像系统坏了。',
      '    </div>',
      '  </div>',
      '',
      '  <div class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <time-range v-model="minutes" />',
      '    <span style="flex:1"></span>',
      '    <a href="#/trace"><button>去追溯查询</button></a>',
      '    <a href="#/alarm"><button>去告警中心</button></a>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  /* ============================================================
     结构安全 · 能源保障  /struct/energy
     ============================================================ */
  P['/struct/energy'] = {
    data: function () { return { minutes: 60, series: [] }; },
    computed: {
      last: function () { return this.series.length ? this.series[this.series.length - 1] : {}; },
      charts: function () {
        return [
          { name: '光伏发电功率', unit: 'kW', data: this.series.map(function (r) { return [r.ts, r.pv_power]; }) },
          { name: '总功耗', unit: 'kW', data: this.series.map(function (r) { return [r.ts, r.total_power]; }) },
          { name: '储能 SOC', unit: '%', data: this.series.map(function (r) { return [r.ts, r.battery_soc]; }) }
        ];
      },
      socLevel: function () {
        const s = this.last.battery_soc;
        if (s === undefined) return 'blue';
        return s < 10 ? 'red' : s < 20 ? 'yellow' : 'blue';
      }
    },
    methods: {
      load: function () {
        const self = this;
        API.resolve(API.struct(this.minutes), function (d) { self.series = d; });
      },
      lvCn: function (l) { return { blue: '正常', yellow: '低电量', red: '严重低电量' }[l] || l; }
    },
    mounted: function () { this.load(); },
    watch: { minutes: function () { this.load(); } },
    template: [
      '<div>',
      '  <page-head title="结构安全 · 能源保障"',
      '    desc="光伏 / 储能 / 功耗。<b>kWh 是能量、kW 是功率</b> —— 两者差一个时间维度（裁定 N3）"',
      '    :sources="[\'simulated\']" />',
      '',
      '  <div class="grid-stats">',
      '    <stat-card name="光伏发电功率" field="pv_power" unit="kW" :value="last.pv_power" source="simulated" />',
      '    <stat-card name="今日发电量" field="pv_energy_today" unit="kWh" :value="last.pv_energy_today" source="simulated" />',
      '    <stat-card name="储能电量百分比" field="battery_soc" unit="%" :value="last.battery_soc" source="simulated" />',
      '    <stat-card name="储能电量（能量）" field="battery_energy" unit="kWh" :value="last.battery_energy" source="simulated" />',
      '    <stat-card name="电池总容量" field="battery_capacity_kwh" unit="kWh" :value="last.battery_capacity_kwh" source="demo" />',
      '    <stat-card name="总功耗" field="total_power" unit="kW" :value="last.total_power" source="simulated" />',
      '    <stat-card name="能源自给率" field="energy_self_sufficiency" unit="%" :value="last.energy_self_sufficiency" :digits="0" source="simulated" />',
      '    <stat-card name="低电量状态" field="low_battery_status" unit="" :value="lvCn(socLevel)" source="simulated" />',
      '  </div>',
      '',
      '  <div style="margin-top:12px">',
      '    <trend-chart title="发电 / 功耗 / 储能趋势" :series="charts"',
      '      :thresholds="[{value:20,label:\'低电量黄线 20%\',color:\'#92400E\'},{value:10,label:\'严重低电量红线 10%\',color:\'#991B1B\'}]" />',
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
      '</div>'
    ].join('\n')
  };

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

  /* ============================================================
     跨板块 · 追溯查询  /trace   —— 答辩必答题
     验收标准 2 的闭环：哪条数据 → 命中哪条规则 → 结果如何
     ============================================================ */
  P['/trace'] = {
    data: function () { return { id: '', picked: null }; },
    computed: {
      alarms: function () { return API.alarms(); },
      list: function () { return this.alarms; },
      /* 快照不要直接甩原始 JSON —— 里面的 ts 是毫秒数，
         通用规范第三节要求「界面显示 2026-10-02 12:00:00，精确到秒」。
         拆成键值行，时间字段一律格式化。 */
      snapRows: function () {
        const s = this.picked && this.picked.trigger_snapshot;
        if (!s) return [];
        const self = this;
        return Object.keys(s).map(function (k) {
          let v = s[k];
          if (typeof v === 'number' && (k === 'ts' || /_ts$/.test(k))) {
            v = new Date(v).toLocaleString('zh-CN', { hour12: false });
          }
          return { k: k, v: v };
        });
      }
    },
    methods: {
      time: function (ts) { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); },
      lvCn: function (lv) { return { blue: '蓝色', yellow: '黄色', orange: '橙色', red: '红色' }[lv] || lv; },
      lvCls: function (lv) { return 'bg-' + (lv || 'blue'); },
      /* 枚举一律显示中文（通用规范 第五节给了每个枚举的中文标签）——
         不许把 tension / active / pending 这种原始值漏到界面上。 */
      typeCn: function (t) {
        return { tension: '锚泊张力', tilt: '网箱倾斜', net_damage: '网衣破损',
                 deformation: '结构形变', low_battery: '低电量', power_supply: '供电异常' }[t] || t;
      },
      stCn: function (s) { return { active: '活跃', acknowledged: '已确认', recovered: '已恢复' }[s] || s; },
      hdCn: function (s) { return { pending: '待处置', handling: '处置中', handled: '已处置', failed: '处置失败' }[s] || s; },
      cfCn: function (s) { return { unconfirmed: '未确认', confirmed: '已确认' }[s] || s; },
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
      '            <span class="k">预警类型</span><span>{{ typeCn(picked.alarm_type) }}</span>',
      '            <span class="k">预警等级</span><span>{{ lvCn(picked.risk_level) }}预警</span>',
      '            <span class="k">预警时间</span><span>{{ time(picked.alarm_ts) }}</span>',
      '            <span class="k">预警状态</span><span>{{ stCn(picked.alarm_status) }}</span>',
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
      '          <div class="kv">',
      '            <template v-for="r in snapRows" :key="r.k">',
      '              <span class="k mono">{{ r.k }}</span><span>{{ r.v }}</span>',
      '            </template>',
      '          </div>',
      '          <div class="small muted" style="margin-top:8px">',
      '            时间字段已按通用规范第三节格式化显示（原值为毫秒数）。',
      '          </div>',
      '        </div>',
      '',
      '        <div class="card">',
      '          <div class="card-title">③ 结果如何</div>',
      '          <div class="kv">',
      '            <span class="k">处置建议</span><span>{{ picked.handling_advice }}</span>',
      '            <span class="k">处置状态</span><span>{{ hdCn(picked.handle_status) }}</span>',
      '            <span class="k">确认状态</span><span>{{ cfCn(picked.confirm_status) }}</span>',
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

  /* ============================================================
     智能 · 智能补光  /ai/light
     裁定 7：依据查不到出处 → 本期只做手工模式，只留接口，不编
     ============================================================ */
  P['/ai/light'] = {
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

  /* ============================================================
     跨板块 · 告警中心  /alarm
     裁定 11 B 案：顶层统一做一套，各板块只提供数据
     ============================================================ */
  P['/alarm'] = {
    data: function () { return { tick: 0, fLevel: '', fStatus: '', fType: '', unsub: null }; },
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
      go: function (a) { window.location.hash = '/trace'; }
    },
    mounted: function () {
      const self = this;
      this.unsub = API.subscribe(function () { self.tick++; });
    },
    beforeUnmount: function () { if (this.unsub) this.unsub(); },
    template: [
      '<div>',
      '  <page-head title="跨板块 · 告警中心"',
      '    desc="顶层统一做一套（裁定 11 B 案），各板块只提供 <code>alarm_event</code> —— 灾害预警、投喂动作、鱼类异常都进这里"',
      '    :sources="[\'simulated\']" />',
      '',
      '  <div class="grid-stats">',
      '    <stat-card name="红色预警" unit="条" :value="counts.red" :digits="0" source="simulated" />',
      '    <stat-card name="橙色预警" unit="条" :value="counts.orange" :digits="0" source="simulated" />',
      '    <stat-card name="黄色预警" unit="条" :value="counts.yellow" :digits="0" source="simulated" />',
      '    <stat-card name="蓝色预警" unit="条" :value="counts.blue" :digits="0" source="simulated" />',
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
      '    <div class="card-title">告警列表（点一行去追溯查询）</div>',
      '    <div v-if="!rows.length" class="todo">没有符合条件的告警</div>',
      '    <div v-else class="dt-wrap">',
      '      <table class="dt">',
      '        <thead><tr><th>事件编号</th><th>等级</th><th>类型</th><th>规则</th><th>预警时间</th><th>状态</th><th>处置</th><th></th></tr></thead>',
      '        <tbody>',
      '          <tr v-for="a in rows" :key="a.alarm_event_id">',
      '            <td class="mono">{{ a.alarm_event_id }}</td>',
      '            <td><span class="dot" :class="lvCls(a.risk_level)"></span>{{ lvCn(a.risk_level) }}</td>',
      '            <td>{{ typeCn(a.alarm_type) }}</td>',
      '            <td><span class="mono small">{{ a.rule_id }}</span> {{ a.rule_name }}</td>',
      '            <td>{{ time(a.alarm_ts) }}</td>',
      '            <td>{{ stCn(a.alarm_status) }}</td>',
      '            <td>{{ hdCn(a.handle_status) }}</td>',
      '            <td><a href="#/trace">追溯 →</a></td>',
      '          </tr>',
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

  /* ============================================================
     跨板块 · 参数配置  /config
     ============================================================ */
  P['/config'] = {
    data: function () {
      return {
        /* 每个阈值都带一份「依据」—— 页面上显示为数值旁的灰色问号，悬停可看。
           任务书要求逐项说明"阈值从哪来（标准？文献？自己设的？）"，
           所以 basis.level 必须如实标注证据强度，不许含糊。
           ⚠️ 改这里的依据时，必须同步改 项目记录.md 与 统一数据接口文档，
              三处口径不一致是答辩硬伤（裁定 2）。 */
        thresholds: [
          { field: 'tension_pct', name: '锚泊张力占设计值', warn: 80, alarm: 95, unit: '%', owner: '结构安全',
            basis: { level: '没找到', text: '待补：正从锚泊系统设计规范与网箱标准中查证。', source: '', url: '' } },
          { field: 'tilt_pitch', name: '网箱俯仰角', warn: 2, alarm: 3, unit: '°', owner: '结构安全',
            basis: { level: '没找到', text: '待补：正从网箱稳性与倾覆判定文献中查证。', source: '', url: '' } },
          { field: 'tilt_roll', name: '网箱横滚角', warn: 2, alarm: 3, unit: '°', owner: '结构安全',
            basis: { level: '没找到', text: '待补：同俯仰角，横滚与俯仰共用同一组阈值。', source: '', url: '' } },
          { field: 'battery_soc', name: '储能电量', warn: 20, alarm: 10, unit: '%', owner: '结构安全',
            basis: { level: '没找到', text: '待补：正从锂电池储能放电深度（DoD）常规做法中查证。', source: '', url: '' } },
          { field: 'water_temp', name: '水温上限', warn: 20.5, alarm: 21.5, unit: '℃', owner: '环境',
            basis: { level: '没找到', text: '待补：正从养殖鱼种温度耐受区间中查证。', source: '', url: '' } },
          { field: 'dissolved_oxygen', name: '溶解氧下限', warn: 5.0, alarm: 4.0, unit: 'mg/L', owner: '环境',
            basis: { level: '没找到', text: '待补：正从鱼类低氧耐受阈值文献中查证。', source: '', url: '' } }
        ],
        rules: [],
        saved: '',
        /* ⚠️ tick 必须显式声明并读一次（见下面 species 计算属性）。
           原因：参数库是后端异步拉来的，而 Vue 对「没有响应式依赖的 computed」会永久缓存 ——
           不读一次 tick，拉回来也不会重算，页面上永远是 0 个鱼种。这个坑踩过两次了。 */
        tick: 0,
        unsub: null
      };
    },
    computed: {
      /* 鱼种体长体重参数库（后端 data/鱼种体长体重参数.json）。
         全项目唯一一处硬编码参数原来藏在后端 `(avg_w / 0.0218) ** (1/3.02)`
         —— 没鱼种、没出处。现在参数连同出处一起显示在这里，答辩能当场翻。 */
      species: function () { this.tick; return API.species() || []; },
      /* 有几个种的参数不是按全长拟合的 —— 页面上要显式警告，不能让人误用 */
      diffLenType: function () {
        return (this.species || []).filter(function (s) {
          return s.length_type && s.length_type !== 'total length';
        }).length;
      },
      primaryCount: function () {
        const s = this.species;
        return s.filter(function (r) { return r.source && r.source !== 'FishBase'; }).length;
      },
      ruleList: function () {
        return [
          { id: 'R-TENSION-01', name: '锚泊张力黄色预警', cond: 'tension_pct > 80', level: 'yellow', from: 'tension_pct' },
          { id: 'R-TENSION-02', name: '锚泊张力红色预警', cond: 'tension_pct > 95', level: 'red', from: 'tension_pct' },
          { id: 'R-TILT-01', name: '网箱倾斜橙色预警', cond: 'tilt_pitch > 2 且 wave_height > 1.5', level: 'orange', from: 'tilt_pitch + wave_height' },
          { id: 'R-TILT-02', name: '网箱倾斜红色预警', cond: 'tilt_pitch > 3', level: 'red', from: 'tilt_pitch' },
          { id: 'R-BAT-01', name: '储能低电量黄色预警', cond: 'battery_soc < 20', level: 'yellow', from: 'battery_soc' },
          { id: 'R-BAT-02', name: '储能严重低电量预警', cond: 'battery_soc < 10', level: 'red', from: 'battery_soc' },
          { id: 'R-TEMP-01', name: '水温上限告警', cond: 'water_temp >= 21.5', level: 'red', from: 'water_temp' }
        ];
      }
    },
    methods: {
      lvCls: function (l) { return 'bg-' + (l || 'blue'); },
      lvCn: function (l) { return { blue: '蓝色', yellow: '黄色', orange: '橙色', red: '红色' }[l] || l; },
      /* 证据强度配色 —— 与 HelpDot 里的配色保持一致，一眼看出哪几项底气不足 */
      basisColor: function (t) {
        const lv = (t.basis && t.basis.level) || '未标注';
        return {
          '直接支持': { bg: '#F0FDF4', br: '#86EFAC', fg: '#166534' },
          '间接支持': { bg: '#EFF6FF', br: '#BFDBFE', fg: '#1D4ED8' },
          '仅类比':   { bg: '#FFFBEB', br: '#FDE68A', fg: '#92400E' },
          '没找到':   { bg: '#FEF2F2', br: '#FECACA', fg: '#991B1B' }
        }[lv] || { bg: '#F3F4F6', br: '#E5E7EB', fg: '#6B7280' };
      },
      /* 体长类型必须显示中文 —— 界面不许出现裸英文枚举（通用规范第五节）。
         但缩写要留着：TL/FL/SL 是行业通用符号，去掉反而不好交流。 */
      lenTypeCn: function (t) {
        return { 'total length': '全长 TL', 'fork length': '叉长 FL',
                 'standard length': '标准长 SL' }[t] || t || '—';
      },
      save: function () {
        this.saved = '已保存（' + new Date().toLocaleTimeString('zh-CN', { hour12: false }) +
                     '）—— 规则引擎下一轮生效。真实系统此处会写配置并通知各板块。';
      }
    },
    mounted: function () {
      const self = this;
      this.unsub = API.subscribe(function () { self.tick++; });
    },
    beforeUnmount: function () {
      if (this.unsub) { this.unsub(); this.unsub = null; }
    },
    template: [
      '<div>',
      '  <page-head title="跨板块 · 参数配置"',
      '    desc="阈值由各板块提，判断规则挂在结构安全的规则引擎上（裁定 11 B 案）"',
      '    :sources="[\'demo\']" />',
      '',
      '  <div class="hint" style="margin-bottom:12px;background:#FFFBEB;border-color:#FDE68A">',
      '    ⚠️ 下面这些阈值一律是 <b>「经验阈值，未经现场标定」</b>，出处为「参考文献区间 + 经验设定」。',
      '    <b>查不到出处就不编</b> —— 页面、文档、答辩口径三处必须一致（裁定 2）。',
      '  </div>',
      '',
      '  <div class="card">',
      '    <div class="card-title">阈值配置</div>',
      '    <div class="dt-wrap">',
      '      <table class="dt">',
      '        <thead><tr><th>字段</th><th>含义</th><th>拥有者</th><th>黄色阈值</th><th>红色阈值</th><th>单位</th><th>来源标注</th></tr></thead>',
      '        <tbody>',
      '          <tr v-for="t in thresholds" :key="t.field">',
      '            <td class="mono">{{ t.field }}</td><td>{{ t.name }}</td><td>{{ t.owner }}</td>',
      '            <td style="white-space:nowrap">',
      '              <input type="text" v-model.number="t.warn" style="width:64px">',
      '              <help-dot :info="t.basis" :label="t.name + \' · 黄色预警线 \' + t.warn + t.unit" />',
      '            </td>',
      '            <td style="white-space:nowrap">',
      '              <input type="text" v-model.number="t.alarm" style="width:64px">',
      '              <help-dot :info="t.basis" :label="t.name + \' · 红色预警线 \' + t.alarm + t.unit" />',
      '            </td>',
      '            <td>{{ t.unit }}</td>',
      '            <td class="small">',
      '              <span class="hd-badge"',
      '                    :style="{ background: basisColor(t).bg, borderColor: basisColor(t).br, color: basisColor(t).fg }">',
      '                {{ (t.basis && t.basis.level) || \'未标注\' }}',
      '              </span>',
      '            </td>',
      '          </tr>',
      '        </tbody>',
      '      </table>',
      '    </div>',
      '    <div class="row" style="margin-top:12px;align-items:center">',
      '      <button class="primary" @click="save">保存阈值</button>',
      '      <span class="small muted">{{ saved }}</span>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="card">',
      '    <div class="card-title">判断规则（挂在结构安全的规则引擎上）</div>',
      '    <div class="dt-wrap">',
      '      <table class="dt">',
      '        <thead><tr><th>规则编号</th><th>规则名称</th><th>条件</th><th>等级</th><th>取数字段</th></tr></thead>',
      '        <tbody>',
      '          <tr v-for="r in ruleList" :key="r.id">',
      '            <td class="mono">{{ r.id }}</td><td>{{ r.name }}</td>',
      '            <td class="mono small">{{ r.cond }}</td>',
      '            <td><span class="dot" :class="lvCls(r.level)"></span>{{ lvCn(r.level) }}</td>',
      '            <td class="mono small">{{ r.from }}</td>',
      '          </tr>',
      '        </tbody>',
      '      </table>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="card">',
      '    <div class="card-title">鱼种体长体重参数库（{{ species.length }} 个鱼种）</div>',
      '    <div class="hint" style="margin-bottom:10px">',
      '      生长估算用的是水产界标准幂函数 <b>W(g) = a × L(cm)<sup>b</sup></b>。',
      '      每条参数都有出处 —— <b>用前必须核对「体长类型」</b>：',
      '      全长 TL / 叉长 FL / 标准长 SL 之间能差 10~20%，口径不一致算出来的体重会系统性偏掉。',
      '      <div v-if="diffLenType" style="margin-top:6px;color:#991B1B">',
      '        🔴 表里有 <b>{{ diffLenType }}</b> 个种的参数是<b>按标准长 SL 拟合</b>的（标了「⚠ 口径不同」）——',
      '        拿全长代入这些公式会算错，必须先换算或另找按 TL 拟合的参数。',
      '      </div>',
      '    </div>',
      '    <div class="dt-wrap" style="max-height:320px">',
      '      <table class="dt">',
      '        <thead><tr>',
      '          <th>鱼种</th><th>拉丁学名</th><th>a</th><th>b</th>',
      '          <th>体长类型</th><th>证据等级</th><th>出处</th>',
      '        </tr></thead>',
      '        <tbody>',
      '          <tr v-for="s in species" :key="s.species_cn">',
      '            <td><b>{{ s.species_cn }}</b></td>',
      '            <td class="small" style="font-style:italic">{{ s.species_latin }}</td>',
      '            <td class="mono">{{ s.lw_a }}</td>',
      '            <td class="mono">{{ s.lw_b }}</td>',
      '            <td class="small">{{ lenTypeCn(s.length_type) }}',
      '              <b v-if="s.length_type && s.length_type !== \'total length\'"',
      '                 style="color:#991B1B" title="该参数按标准长/叉长拟合，不能直接代全长">',
      '                ⚠ 口径不同',
      '              </b>',
      '            </td>',
      '            <td class="small" :style="{ color: s.used_source === \'原始研究\' ? \'#166534\' : \'#92400E\', fontWeight: s.used_source === \'原始研究\' ? 600 : 400 }">',
      '              {{ s.evidence_cn || \'—\' }}',
      '            </td>',
      '            <td class="small">',
      '              <a v-if="s.source_url" :href="s.source_url" target="_blank" rel="noopener">',
      '                {{ s.source_ref || \'FishBase\' }} ↗',
      '              </a>',
      '              <span v-else>{{ s.source_ref || \'FishBase\' }}</span>',
      '            </td>',
      '          </tr>',
      '          <tr v-if="!species.length">',
      '            <td colspan="7" class="muted small">',
      '              参数库需要后端 —— 请双击 <b>启动平台.bat</b> 打开。',
      '              纯前端演示模式下不提供，因为参数必须带文献出处，不能凭空生成。',
      '            </td>',
      '          </tr>',
      '        </tbody>',
      '      </table>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  global.PAGES = P;
})(window);
