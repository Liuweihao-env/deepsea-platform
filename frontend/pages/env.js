/* ============================================================
   pages/env.js —— 环境板块
   ============================================================
   负责人：刘伟豪

   【这个文件归谁】
     归上面写的那个人（以及他的 AI）。**别人不要改这个文件。**

   【怎么加页面】
     照抄本文件里已有页面的结构，往 PAGES 上注册一个新路由就行：
         PAGES['/env/xxx'] = { data: ..., computed: ..., methods: ..., template: [...] };

   【三条硬规矩】
     1. 用 components.js 里已有的公共件（stat-card / trend-chart / event-list …），
        不要自己重写一套 —— 全平台要长一个样。
     2. 数据一律走 API.xxx()，不要直接读别的板块的数据，也不要写死数字。
        拿不到就显示「—」，**不许编**。
     3. 界面上不许出现裸英文（比如 quality='good'），必须经 components.js 的 CN 表转成中文。

   【改完必须做】
     双击 验收检查.bat，8 项全过才能发 PR。全过不了就别发 —— 会把别人的页面一起弄坏。

   建立：2026-10-06（从 pages.js 拆出）
   重构：2026-10-07（两页布局 = 站点切换 → 数值卡 → 时序 → 事件 → 异常界定指标 →
                   原始数据 → 调试面板；站点按站点独立，互不影响）
   ============================================================ */
(function (global) {
  'use strict';
  /* 自己初始化，不依赖文件加载顺序 —— 这样谁先谁后都不会出错 */
  const PAGES = global.PAGES || (global.PAGES = {});

  /* ============================================================
     共享纯函数（挂 global.__ENV_HELPERS__ 供页面与测试使用）
     ============================================================ */
  const pad = function (n) { return String(n).padStart(2, '0'); };

  /* 时间显示统一为「年/月/日 时:分:秒」，不带字母（用户要求：不可字母和汉字混用） */
  function fmtTs(ts) {
    if (ts == null) return '—';
    const d = new Date(ts);
    return d.getFullYear() + '年' + pad(d.getMonth() + 1) + '月' + pad(d.getDate()) + '日 ' +
           pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  /* 图表坐标轴短标签：MM-DD HH:mm（跨天也能看清日期） */
  function fmtShort(ts) {
    const d = new Date(ts);
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
           pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* CSV 单元格转义：含逗号 / 引号 / 换行时加引号并转义内部引号 */
  function csvCell(v) {
    const s = (v == null) ? '' : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /* 生成 CSV 文本（带 UTF-8 BOM，Excel 打开不乱码） */
  function toCsv(headers, rows) {
    return '\ufeff' + headers.map(csvCell).join(',') + '\n' +
           rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n');
  }

  /* 两个时间戳之间的分钟数（至少 1 分钟） */
  function minutesBetween(aTs, bTs) {
    return Math.max(1, Math.round(Math.abs((bTs || 0) - (aTs || 0)) / 60000));
  }

  /* 每个站点的独立状态（站点独立性：对一个站点的操作不影响其他站点） */
  function defaultPer() {
    return { minutes: 60, paused: false, storm: false, heat: false, offline: false, stormType: 'all' };
  }
  function buildPer(sites) {
    const per = {};
    (sites || []).forEach(function (s) { per[s.site_id] = defaultPer(); });
    return per;
  }

  /* 已暂停站点聚合文本：site_01、site_03（共2个） */
  function pausedText(per) {
    const ids = Object.keys(per || {}).filter(function (k) { return per[k].paused; });
    return ids.length ? ids.join('、') + '（共' + ids.length + '个）' : '';
  }

  global.__ENV_HELPERS__ = {
    fmtTs: fmtTs, fmtShort: fmtShort, toCsv: toCsv, csvCell: csvCell,
    minutesBetween: minutesBetween, defaultPer: defaultPer,
    buildPer: buildPer, pausedText: pausedText
  };

  /* ============================================================
     海况页 /env/sea
     布局（自上而下）：
       站点切换（顶部） → 数据来源（NDBC 直连） → 数值卡 → 时序 + 事件 →
       异常界定指标 → 原始数据 → 调试面板（仿真控制）→ 底部操作条
     ============================================================ */
  PAGES['/env/sea'] = {
    data: function () {
      return { site: 'site_01', picked: null, series: null,
               tick: 0, unsub: null, timer: null,
               refreshing: false, refreshMsg: '', refreshOk: null,
               per: null, loadSeq: 0, chart: null };
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
      /* 当前站点的独立状态（默认给一个，防止模板取到 undefined） */
      activePer: function () {
        return (this.per && this.per[this.site]) || global.__ENV_HELPERS__.defaultPer();
      },
      /* 已暂停站点聚合文本（调试面板顶部红字） */
      pauseText: function () { return global.__ENV_HELPERS__.pausedText(this.per); },
      /* 数据来源：观测站点实时读的是本地缓存，不是每次渲染去联网 */
      srcLabel: function () {
        if (this.isObs) return 'NOAA NDBC 公开浮标实测（读本地缓存）';
        return '仿真生成（模拟养殖站点）';
      },
      events: function () {
        /* 由真实数据算出的事件：越限即列为事件（不做假数据）。
           🔴 2026-10-06 浪高阈值对齐国标（GB/T 19721.2 / 海浪警报级别）：
              蓝色 2.5~3.9 m / 黄色 4.0~5.9 / 橙色 6.0~8.9 / 红色 ≥9.0 m。
           ⚠️ 2026-10-06 教训：这段当时漏了 `const out = [];` 一行，
              结果 events 计算属性每次都抛 ReferenceError。
              **Vue 会把计算属性里的异常吞掉**，页面照常渲染、只是事件列表永远是空的 ——
              验收也照样过。所以「页面能打开」不等于「这段逻辑是对的」。
              这类错只能靠浏览器控制台（Errors 数）和逐页人工看抓。 */
        const out = [];
        this.fast.forEach(function (r) {
          const w = r.wave_height;
          if (w == null) return;
          let lv = null, note = '';
          if (w >= 9.0)      { lv = 'red';    note = '红色警报级（≥9.0 m）'; }
          else if (w >= 6.0) { lv = 'orange'; note = '橙色警报级（≥6.0 m）'; }
          else if (w >= 4.0) { lv = 'yellow'; note = '黄色警报级 · 灾害性海浪（≥4.0 m）'; }
          else if (w >= 2.5) { lv = 'blue';   note = '蓝色警报级 · 国家海浪警报起始（≥2.5 m）'; }
          if (lv) {
            out.push({ id: 'w' + r.ts, ts: r.ts, level: lv,
                       text: '浪高 ' + w + ' m —— ' + note });
          }
        });
        return out.slice(-20).reverse();
      },
      /* 浪高异常点（问题 2）：命中异常界定指标的点用圆点标记，颜色与指标表一致 */
      waveDots: function () {
        const out = [];
        this.fast.forEach(function (r) {
          const w = r.wave_height;
          if (w == null) return;
          let color = null;
          if (w >= 9.0)      { color = '#991B1B'; }
          else if (w >= 6.0) { color = '#EA580C'; }
          else if (w >= 4.0) { color = '#D97706'; }
          else if (w >= 2.5) { color = '#1D4ED8'; }
          if (color) out.push({ coord: [r.ts, w], value: w, itemStyle: { color: color } });
        });
        return out;
      },
      /* 风速异常点：≥17.2 m/s（8 级及以上大风） */
      windDots: function () {
        const out = [];
        this.fast.forEach(function (r) {
          const w = r.wind_speed;
          if (w == null) return;
          if (w >= 17.2) out.push({ coord: [r.ts, w], value: w, itemStyle: { color: '#991B1B' } });
        });
        return out;
      },
      waveLines: function () {
        return [
          { yAxis: 2.5, name: '蓝色警报 2.5m', lineStyle: { color: '#1D4ED8', type: 'dashed', width: 1 } },
          { yAxis: 4.0, name: '黄色警报 4.0m', lineStyle: { color: '#D97706', type: 'dashed', width: 1 } },
          { yAxis: 9.0, name: '红色警报 9.0m', lineStyle: { color: '#991B1B', type: 'dashed', width: 1 } }
        ];
      },
      windLines: function () {
        return [{ yAxis: 17.2, name: '8 级大风 17.2m/s', lineStyle: { color: '#991B1B', type: 'dashed', width: 1 } }];
      }
    },
    methods: {
      /* 站点独立状态兜底：API.sites() 可能晚于 data() 返回，这里补齐 */
      ensurePer: function () {
        if (!this.per) this.per = {};
        const H = global.__ENV_HELPERS__;
        API.sites().forEach(function (s) {
          if (!this.per[s.site_id]) this.per[s.site_id] = H.defaultPer();
        }.bind(this));
      },
      load: function () {
        const self = this;
        this.ensurePer();
        const p = this.activePer;
        const seq = ++this.loadSeq;
        API.resolve(API.env(this.site, p.minutes, { storm: p.storm }),
                    function (d) { if (seq === self.loadSeq) self.series = d; });
      },
      siteName: function () {
        const sid = this.site;
        const s = API.sites().filter(function (x) { return x.site_id === sid; })[0];
        return s ? s.site_name : sid;
      },
      time: function (ts) {
        return new Date(ts).toLocaleString('zh-CN', { hour12: false });
      },
      fmtTs: function (ts) { return global.__ENV_HELPERS__.fmtTs(ts); },
      /* 界面不许裸英文（硬规矩 3）：来源 / 质量统一转中文 */
      srcCn: function (src) { return global.__ENV_CN__.srcCn(src); },
      qCn: function (q) { return global.__ENV_CN__.qCn(q); },
      /* 顶部站点切换 */
      setSite: function (sid) { this.site = sid; },
      /* 时间窗（公共件 / 自定义分钟数）—— 只改当前站点自己的窗口 */
      onMinutes: function (v) {
        this.ensurePer();
        this.activePer.minutes = v;
        this.load();
      },
      onCustomMin: function (e) {
        this.ensurePer();
        const v = parseInt(e.target.value, 10);
        if (v >= 5 && v <= 1440) { this.activePer.minutes = v; this.load(); }
      },
      /* 调试面板：暂停 / 恢复 —— 只影响被操作的站点，其他站点不受任何影响 */
      togglePause: function (sid) {
        const per = this.per[sid];
        if (!per) return;
        per.paused = !per.paused;
        if (sid === this.site && !per.paused) this.load();
      },
      toggleStorm: function (sid) {
        const per = this.per[sid];
        if (!per) return;
        per.storm = !per.storm;
        if (sid === this.site) this.load();
      },
      /* 原始数据导出 CSV（UTF-8 BOM，Excel 打开不乱码） */
      exportCsv: function () {
        const H = global.__ENV_HELPERS__;
        const rows = this.fast.map(function (r) {
          return [H.fmtTs(r.ts), r.site_id, srcCn(r.source), qCn(r.quality),
                  r.wave_height, r.wind_speed, r.current_speed, r.air_temp];
        });
        const csv = H.toCsv(['时间', '站点', '来源', '质量', '浪高 (m)', '风速 (m/s)', '流速 (m/s)', '气温 (℃)'], rows);
        downloadCsv('海况原始数据_' + this.site + '.csv', csv);
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
      },
      /* 可交互时序（问题 2）：缩放 / 框选 / 异常点标记。
         ⚠️ 公共 trend-chart 无 dataZoom / markPoint，这里在页面内自绘 ECharts 增强版；
            后续若公共件补上这两项，可换回公共件保持全平台一致。 */
      renderChart: function () {
        const el = this.$refs.chartEl;
        if (!el) return;
        const E = global.echarts;
        if (!E) return;
        let inst = E.getInstanceByDom(el);
        if (!inst) inst = E.init(el);
        this.chart = inst;
        const fast = this.fast;
        if (!fast.length) {
          inst.clear();
          inst.setOption({
            graphic: { type: 'text', left: 'center', top: 'middle',
                       style: { text: '暂无数据', fill: '#6B7280', fontSize: 14 } },
            xAxis: { show: false }, yAxis: { show: false }, series: []
          }, true);
          return;
        }
        const H = global.__ENV_HELPERS__;
        inst.setOption({
          grid: { left: 56, right: 20, top: 44, bottom: 44 },
          tooltip: { trigger: 'axis' },
          legend: { top: 0, textStyle: { fontSize: 12 } },
          xAxis: {
            type: 'time',
            axisLabel: { fontSize: 11, formatter: function (v) { return H.fmtShort(v); } },
            splitLine: { show: false }
          },
          yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 11 },
                   splitLine: { lineStyle: { color: '#EEF2F6' } } },
          /* 缩放 / 框选：inside 滚轮缩放，slider 拖拽框选时间轴 */
          dataZoom: [
            { type: 'inside', start: 0, end: 100 },
            { type: 'slider', height: 16, bottom: 0, start: 0, end: 100 }
          ],
          series: [
            {
              name: '浪高（m）', type: 'line', showSymbol: false, smooth: true,
              lineStyle: { width: 1.6, color: '#2F5496' }, itemStyle: { color: '#2F5496' },
              data: fast.map(function (r) { return [r.ts, r.wave_height]; }),
              markLine: { silent: true, symbol: 'none',
                label: { formatter: '{b}', fontSize: 10, position: 'insideEndTop' },
                data: this.waveLines },
              markPoint: { symbol: 'circle', symbolSize: 7, data: this.waveDots }
            },
            {
              name: '风速（m/s）', type: 'line', showSymbol: false, smooth: true,
              lineStyle: { width: 1.6, color: '#C2410C' }, itemStyle: { color: '#C2410C' },
              data: fast.map(function (r) { return [r.ts, r.wind_speed]; }),
              markLine: { silent: true, symbol: 'none',
                label: { formatter: '{b}', fontSize: 10, position: 'insideEndTop' },
                data: this.windLines },
              markPoint: { symbol: 'circle', symbolSize: 7, data: this.windDots }
            }
          ]
        }, true);
        inst.resize();
      }
    },
    mounted: function () {
      const self = this;
      this.ensurePer();
      this.unsub = API.subscribe(function () { self.tick++; });
      this.load();
      this.$nextTick(function () { self.renderChart(); });
    },
    beforeUnmount: function () {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      if (this.unsub) { this.unsub(); this.unsub = null; }
      if (this.chart) { this.chart.dispose(); this.chart = null; }
    },
    watch: {
      site: function () { this.load(); },
      /* 数据一更新就重绘增强图（缩放 / 红点跟着最新数据走） */
      fast: { handler: function () { this.renderChart(); }, deep: true }
    },
    template: [
      '<div>',
      '  <page-head title="环境 · 海况"',
      '    desc="浪高 / 风速 / 流速 / 气温。观测站点为 NOAA NDBC 公开浮标实测，养殖站点为仿真生成"',
      '    :sources="isObs ? [\'public\'] : [\'simulated\']" />',
      '',
      '  <!-- 站点切换（顶部）：每个站点独立，切换互不影响 -->',
      '  <div class="card" style="margin-bottom:12px">',
      '    <div class="row" style="align-items:center;gap:8px">',
      '      <span class="small muted">站点：</span>',
      '      <button v-for="s in API.sites()" :key="s.site_id"',
      '              :class="{ primary: site === s.site_id }" style="padding:3px 10px"',
      '              @click="setSite(s.site_id)">{{ s.site_name }}</button>',
      '      <span style="flex:1"></span>',
      '      <span class="small" :style="{ color: isObs ? \'#166534\' : \'#92400E\' }">{{ srcLabel }}</span>',
      '    </div>',
      '  </div>',
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
      '        <b>想看真实浮标数据？</b>点下面任意一个浮标行，或点上方任意一个 <b>NDBC 观测站点</b>。',
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
      '    <div class="card">',
      '      <div class="card-title">海况时序（可缩放 / 框选 · 异常点标记）',
      '        <help-dot :info="{ level: \'间接支持\', text: \'滚轮缩放、拖拽底部滑条框选时间轴查看细节；曲线上圆点 = 命中「异常界定指标」的数据点，颜色与指标表一致。\' }" :label="\'操作说明\'" />',
      '      </div>',
      '      <div ref="chartEl" class="chart" style="height:340px"></div>',
      '    </div>',
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
      '  <!-- 异常界定指标：让人一眼看出「数据到什么程度会被标记/告警」（问题 3） -->',
      '  <div class="card" style="margin-top:12px">',
      '    <div class="card-title">异常界定指标（红点 / 事件标记依据）',
      '      <help-dot :info="{ level: \'间接支持\', text: \'浪高分级依据 GB/T 19721.2《海洋预报和警报发布 第 2 部分：海浪警报发布》的海浪警报级别；风速异常参考蒲福风级（≥17.2 m/s 为 8 级及以上大风）。触发「大风大浪」时，仿真将浪高抬至约 4.6 m、风速抬至约 19 m/s（风暴模式）。\', source: \'GB/T 19721.2 ／ 蒲福风级\' }" :label="\'界定依据说明\'" />',
      '    </div>',
      '    <div class="dt-wrap">',
      '      <table class="dt">',
      '        <thead><tr><th>指标</th><th>单位</th><th>正常参考</th><th>异常界定</th><th>依据</th></tr></thead>',
      '        <tbody>',
      '          <tr>',
      '            <td class="small"><b>浪高</b></td><td class="small">m</td><td class="small">＜2.5</td>',
      '            <td class="small"><span class="dot bg-blue"></span>≥2.5 蓝色 ／ <span class="dot bg-yellow"></span>≥4.0 黄色 ／ <span class="dot bg-orange"></span>≥6.0 橙色 ／ <span class="dot bg-red"></span>≥9.0 红色</td>',
      '            <td class="small">GB/T 19721.2 海浪警报级别</td>',
      '          </tr>',
      '          <tr>',
      '            <td class="small"><b>风速</b></td><td class="small">m/s</td><td class="small">＜17.2</td>',
      '            <td class="small"><span class="dot bg-red"></span>≥17.2（8 级及以上大风）</td>',
      '            <td class="small">蒲福风级</td>',
      '          </tr>',
      '          <tr>',
      '            <td class="small"><b>海水流速</b></td><td class="small">m/s</td><td class="small">—</td>',
      '            <td class="small muted">暂无界定规则</td><td class="small muted">—</td>',
      '          </tr>',
      '          <tr>',
      '            <td class="small"><b>环境气温</b></td><td class="small">℃</td><td class="small">—</td>',
      '            <td class="small muted">暂无界定规则</td><td class="small muted">—</td>',
      '          </tr>',
      '        </tbody>',
      '      </table>',
      '    </div>',
      '  </div>',
      '',
      '  <!-- 原始数据：放在海况时序下方；可自定义时间窗、可导出；切观测站点即见公开历史数据 -->',
      '  <div class="card" style="margin-top:12px">',
      '    <div class="card-title">原始数据（最近 {{ activePer.minutes }} 分钟窗口 · {{ fast.length }} 条）</div>',
      '    <div class="row" style="align-items:center">',
      '      <time-range :model-value="activePer.minutes" @update:model-value="onMinutes" />',
      '      <input type="number" min="5" max="1440" :value="activePer.minutes" @change="onCustomMin"',
      '             class="mono" style="width:88px" />',
      '      <span class="small muted">自定义分钟数（5–1440）</span>',
      '      <span style="flex:1"></span>',
      '      <button class="primary" @click="exportCsv">导出 CSV</button>',
      '    </div>',
      '    <div class="hint" style="margin-top:8px">',
      '      时间显示为「年/月/日 时:分:秒」。切换「观测站点」后，本表即为 NOAA NDBC 公开历史实测数据；',
      '      养殖站点为仿真数据。精确历史日期（年/月/日）区间查询接口已随 backend/api/env.py 提交，',
      '      队长挂载后本区将支持按日期区间查看历史。',
      '    </div>',
      '    <div class="dt-wrap" style="margin-top:8px">',
      '      <table class="dt">',
      '        <thead><tr><th>时间</th><th>站点</th><th>来源</th><th>质量</th>',
      '                <th>浪高 (m)</th><th>风速 (m/s)</th><th>流速 (m/s)</th><th>气温 (℃)</th></tr></thead>',
      '        <tbody>',
      '          <tr v-for="r in fast" :key="r.ts">',
      '            <td class="mono small">{{ fmtTs(r.ts) }}</td>',
      '            <td class="small">{{ r.site_id }}</td>',
      '            <td class="small">{{ srcCn(r.source) }}</td>',
      '            <td class="small">{{ qCn(r.quality) }}</td>',
      '            <td class="mono">{{ r.wave_height == null ? \'—\' : r.wave_height }}</td>',
      '            <td class="mono">{{ r.wind_speed == null ? \'—\' : r.wind_speed }}</td>',
      '            <td class="mono">{{ r.current_speed == null ? \'—\' : r.current_speed }}</td>',
      '            <td class="mono">{{ r.air_temp == null ? \'—\' : r.air_temp }}</td>',
      '          </tr>',
      '          <tr v-if="!fast.length"><td colspan="8" class="muted small">暂无数据</td></tr>',
      '        </tbody>',
      '      </table>',
      '    </div>',
      '  </div>',
      '',
      '  <!-- 调试面板（仿真控制）：放在页面最下方 -->',
      '  <div class="card" style="margin-top:12px">',
      '    <div class="card-title">调试面板 · 仿真控制</div>',
      '    <div v-if="pauseText" class="hint" style="background:#FEF2F2;border-color:#FECACA">',
      '      <b>已暂停生成：</b>{{ pauseText }}',
      '    </div>',
      '    <div class="dt-wrap">',
      '      <table class="dt">',
      '        <thead><tr><th>站点</th><th>类型</th><th>状态</th><th>当前模式</th><th>操作</th></tr></thead>',
      '        <tbody>',
      '          <tr v-for="s in API.sites()" :key="s.site_id">',
      '            <td class="small"><b>{{ s.site_name }}</b> <span class="muted mono">{{ s.site_id }}</span></td>',
      '            <td class="small">{{ s.kind === \'obs\' ? \'观测\' : \'养殖\' }}</td>',
      '            <td class="small">',
      '              <span :style="{ color: per[s.site_id] && per[s.site_id].paused ? \'#991B1B\' : \'#166534\' }">',
      '                {{ per[s.site_id] && per[s.site_id].paused ? \'已暂停\' : \'运行中\' }}',
      '              </span>',
      '            </td>',
      '            <td class="small">',
      '              <span v-if="per[s.site_id] && per[s.site_id].storm" style="color:#991B1B">大风大浪</span>',
      '              <span v-else class="muted">正常</span>',
      '            </td>',
      '            <td class="small">',
      '              <button class="primary" style="padding:2px 8px" @click="togglePause(s.site_id)">',
      '                {{ per[s.site_id] && per[s.site_id].paused ? \'恢复生成\' : \'暂停生成\' }}',
      '              </button>',
      '              <button style="padding:2px 8px;margin-left:6px" @click="toggleStorm(s.site_id)">',
      '                {{ per[s.site_id] && per[s.site_id].storm ? \'恢复平常\' : \'触发大风大浪\' }}',
      '              </button>',
      '            </td>',
      '          </tr>',
      '        </tbody>',
      '      </table>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <time-range :model-value="activePer.minutes" @update:model-value="onMinutes" />',
      '    <span style="width:12px"></span>',
      '    <span class="small muted">站点</span>',
      '    <select v-model="site">',
      '      <option v-for="s in API.sites()" :key="s.site_id" :value="s.site_id">{{ s.site_name }}</option>',
      '    </select>',
      '    <span style="flex:1"></span>',
      '    <span class="small muted">口径：{{ API.disclaimer }}</span>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  /* ============================================================
     水质页 /env/water
     布局（自上而下）：
       站点切换（顶部） → 告警横幅 → 数值卡（含光照强度） → 时序 + 事件 →
       异常界定指标 → 原始数据（快变量 + 慢变量） → 调试面板（仿真控制）→ 底部操作条
     ============================================================ */
  PAGES['/env/water'] = {
    data: function () {
      return { site: 'site_01', picked: null, series: null,
               per: null, loadSeq: 0, chart: null,
               show: { water_temp: true, dissolved_oxygen: true, light_intensity: false } };
    },
    computed: {
      fast: function () { return this.series ? this.series.fast : []; },
      slow: function () { return this.series ? this.series.slow : []; },
      last: function () { return this.fast.length ? this.fast[this.fast.length - 1] : {}; },
      lastSlow: function () { return this.slow.length ? this.slow[this.slow.length - 1] : {}; },
      activePer: function () {
        return (this.per && this.per[this.site]) || global.__ENV_HELPERS__.defaultPer();
      },
      pauseText: function () { return global.__ENV_HELPERS__.pausedText(this.per); },
      isObs: function () {
        const sid = this.site;
        const s = API.sites().filter(function (x) { return x.site_id === sid; })[0];
        return !!(s && s.kind === 'obs');
      },
      srcLabel: function () {
        if (this.isObs) return 'NOAA NDBC 公开浮标实测（读本地缓存）';
        return '仿真生成（模拟养殖站点）';
      },
      /* 水温异常点（问题 2）：黄 ≥25.5（R-TEMP-02 偏高提示），红 ≥28.0（R-TEMP-01 水温上限告警） */
      waterDots: function () {
        const out = [];
        this.fast.forEach(function (r) {
          const w = r.water_temp;
          if (w == null) return;
          let color = null;
          if (w >= 28.0)      { color = '#991B1B'; }
          else if (w >= 25.5) { color = '#D97706'; }
          if (color) out.push({ coord: [r.ts, w], value: w, itemStyle: { color: color } });
        });
        return out;
      },
      waterLines: function () {
        return [
          { yAxis: 28.0, name: '水温上限 28.0℃', lineStyle: { color: '#991B1B', type: 'dashed', width: 1 } },
          { yAxis: 25.5, name: '偏高提示 25.5℃', lineStyle: { color: '#D97706', type: 'dashed', width: 1 } }
        ];
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
      ensurePer: function () {
        if (!this.per) this.per = {};
        const H = global.__ENV_HELPERS__;
        API.sites().forEach(function (s) {
          if (!this.per[s.site_id]) this.per[s.site_id] = H.defaultPer();
        }.bind(this));
      },
      load: function () {
        const self = this;
        this.ensurePer();
        const p = this.activePer;
        const seq = ++this.loadSeq;
        API.resolve(API.env(this.site, p.minutes, { heat: p.heat, offline: p.offline }),
                    function (d) { if (seq === self.loadSeq) self.series = d; });
      },
      setSite: function (sid) { this.site = sid; },
      time: function (ts) { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); },
      fmtTs: function (ts) { return global.__ENV_HELPERS__.fmtTs(ts); },
      srcCn: function (src) { return global.__ENV_CN__.srcCn(src); },
      qCn: function (q) { return global.__ENV_CN__.qCn(q); },
      togglePause: function (sid) {
        const per = this.per[sid];
        per.paused = !per.paused;
        if (sid === this.site && !per.paused) this.load();
      },
      toggleHeat: function (sid) {
        const per = this.per[sid];
        per.heat = !per.heat;
        if (sid === this.site) this.load();
      },
      toggleOffline: function (sid) {
        const per = this.per[sid];
        per.offline = !per.offline;
        if (sid === this.site) this.load();
      },
      onMinutes: function (v) {
        this.ensurePer();
        this.activePer.minutes = v;
        this.load();
      },
      onCustomMin: function (e) {
        this.ensurePer();
        const v = parseInt(e.target.value, 10);
        if (v >= 5 && v <= 1440) { this.activePer.minutes = v; this.load(); }
      },
      exportCsv: function () {
        const H = global.__ENV_HELPERS__;
        const rows = this.fast.map(function (r) {
          return [H.fmtTs(r.ts), r.site_id, srcCn(r.source), qCn(r.quality),
                  r.water_temp, r.dissolved_oxygen, r.light_intensity];
        });
        const csv = H.toCsv(['时间', '站点', '来源', '质量', '水温 (℃)', '溶解氧 (mg/L)', '光照 (lux)'], rows);
        downloadCsv('水质原始数据_' + this.site + '.csv', csv);
      },
      /* 可交互时序（问题 2）：缩放 / 框选 / 异常点标记；光照强度走右轴（量级差太大） */
      renderChart: function () {
        const el = this.$refs.chartEl;
        if (!el) return;
        const E = global.echarts;
        if (!E) return;
        let inst = E.getInstanceByDom(el);
        if (!inst) inst = E.init(el);
        this.chart = inst;
        const fast = this.fast;
        if (!fast.length) {
          inst.clear();
          inst.setOption({
            graphic: { type: 'text', left: 'center', top: 'middle',
                       style: { text: '暂无数据', fill: '#6B7280', fontSize: 14 } },
            xAxis: { show: false }, yAxis: { show: false }, series: []
          }, true);
          return;
        }
        const H = global.__ENV_HELPERS__;
        const s = this.show;
        const series = [];
        const pushS = function (name, unit, key, color, axis) {
          if (!s[key]) return;
          series.push({
            name: name + '（' + unit + '）', type: 'line', showSymbol: false, smooth: true,
            yAxisIndex: axis || 0,
            lineStyle: { width: 1.6, color: color }, itemStyle: { color: color },
            data: fast.map(function (r) { return [r.ts, r[key]]; })
          });
        };
        pushS('水温', '℃', 'water_temp', '#2F5496', 0);
        pushS('溶解氧', 'mg/L', 'dissolved_oxygen', '#166534', 0);
        pushS('光照强度', 'lux', 'light_intensity', '#C2410C', 1);
        const needAxis2 = !!s.light_intensity;
        /* 阈值线 + 异常点只挂在水温曲线上（水温有界定规则） */
        let idx = -1;
        for (let i = 0; i < series.length; i++) {
          if (series[i].name.indexOf('水温') >= 0) { idx = i; break; }
        }
        if (idx >= 0) {
          series[idx].markLine = { silent: true, symbol: 'none',
            label: { formatter: '{b}', fontSize: 10, position: 'insideEndTop' },
            data: this.waterLines };
          series[idx].markPoint = { symbol: 'circle', symbolSize: 7, data: this.waterDots };
        }
        inst.setOption({
          grid: { left: 56, right: 20, top: 44, bottom: 44 },
          tooltip: { trigger: 'axis' },
          legend: { top: 0, textStyle: { fontSize: 12 } },
          xAxis: {
            type: 'time',
            axisLabel: { fontSize: 11, formatter: function (v) { return H.fmtShort(v); } },
            splitLine: { show: false }
          },
          yAxis: needAxis2
            ? [
                { type: 'value', scale: true, axisLabel: { fontSize: 11 },
                  splitLine: { lineStyle: { color: '#EEF2F6' } } },
                { type: 'value', scale: true, position: 'right', axisLabel: { fontSize: 11 },
                  splitLine: { show: false } }
              ]
            : { type: 'value', scale: true, axisLabel: { fontSize: 11 },
                splitLine: { lineStyle: { color: '#EEF2F6' } } },
          dataZoom: [
            { type: 'inside', start: 0, end: 100 },
            { type: 'slider', height: 16, bottom: 0, start: 0, end: 100 }
          ],
          series: series
        }, true);
        inst.resize();
      }
    },
    mounted: function () {
      const self = this;
      this.ensurePer();
      this.load();
      this.$nextTick(function () { self.renderChart(); });
    },
    beforeUnmount: function () {
      if (this.chart) { this.chart.dispose(); this.chart = null; }
    },
    watch: {
      site: function () { this.load(); },
      /* 数据一更新就重绘增强图（缩放 / 红点跟着最新数据走） */
      fast: { handler: function () { this.renderChart(); }, deep: true },
      show: { handler: function () { this.renderChart(); }, deep: true }
    },
    template: [
      '<div>',
      '  <page-head title="环境 · 水质"',
      '    desc="水温 / 溶解氧 5 秒；盐度 / pH 30 秒慢变量；光照强度 5 秒"',
      '    :sources="[\'public\',\'simulated\']" />',
      '',
      '  <!-- 站点切换（顶部）：每个站点独立，切换互不影响 -->',
      '  <div class="card" style="margin-bottom:12px">',
      '    <div class="row" style="align-items:center;gap:8px">',
      '      <span class="small muted">站点：</span>',
      '      <button v-for="s in API.sites()" :key="s.site_id"',
      '              :class="{ primary: site === s.site_id }" style="padding:3px 10px"',
      '              @click="setSite(s.site_id)">{{ s.site_name }}</button>',
      '      <span style="flex:1"></span>',
      '      <span class="small" :style="{ color: isObs ? \'#166534\' : \'#92400E\' }">{{ srcLabel }}</span>',
      '    </div>',
      '  </div>',
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
      '      <div class="card">',
      '        <div class="card-title">水质时序（可缩放 / 框选 · 异常点标记）',
      '          <help-dot :info="{ level: \'间接支持\', text: \'滚轮缩放、拖拽底部滑条框选时间轴查看细节；水温曲线上圆点 = 命中「异常界定指标」的数据点（黄 ≥25.5 偏高提示，红 ≥28.0 水温上限告警）。\' }" :label="\'操作说明\'" />',
      '        </div>',
      '        <div ref="chartEl" class="chart" style="height:340px"></div>',
      '      </div>',
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
      '  <!-- 异常界定指标（水质）：红点 / 告警标记依据 -->',
      '  <div class="card" style="margin-top:12px">',
      '    <div class="card-title">异常界定指标（红点 / 告警标记依据）',
      '      <help-dot :info="{ level: \'间接支持\', text: \'水温阈值与前端规则 R-TEMP-01 / R-TEMP-02 同口径（大黄鱼高告警线 28.0 ℃、高提示线 25.5 ℃）；不同网箱养不同鱼时，阈值按鱼种温度库自动取值（见管理板块）。溶解氧 / 盐度 / pH / 光照暂未配置界定规则，仅作监测展示。\', source: \'鱼种温度库 · 大黄鱼\' }" :label="\'界定依据说明\'" />',
      '    </div>',
      '    <div class="dt-wrap">',
      '      <table class="dt">',
      '        <thead><tr><th>指标</th><th>单位</th><th>正常参考</th><th>异常界定</th><th>依据</th></tr></thead>',
      '        <tbody>',
      '          <tr>',
      '            <td class="small"><b>水温</b></td><td class="small">℃</td><td class="small">＜25.5</td>',
      '            <td class="small"><span class="dot bg-yellow"></span>≥25.5 偏高提示（R-TEMP-02）／ <span class="dot bg-red"></span>≥28.0 水温上限告警（R-TEMP-01）</td>',
      '            <td class="small">鱼种温度库 · 大黄鱼</td>',
      '          </tr>',
      '          <tr>',
      '            <td class="small"><b>溶解氧</b></td><td class="small">mg/L</td><td class="small">—</td>',
      '            <td class="small muted">暂无界定规则</td><td class="small muted">—</td>',
      '          </tr>',
      '          <tr>',
      '            <td class="small"><b>盐度</b></td><td class="small">‰</td><td class="small">—</td>',
      '            <td class="small muted">暂无界定规则</td><td class="small muted">—</td>',
      '          </tr>',
      '          <tr>',
      '            <td class="small"><b>pH 值</b></td><td class="small">—</td><td class="small">—</td>',
      '            <td class="small muted">暂无界定规则</td><td class="small muted">—</td>',
      '          </tr>',
      '          <tr>',
      '            <td class="small"><b>光照强度</b></td><td class="small">lux</td><td class="small">—</td>',
      '            <td class="small muted">暂无界定规则</td><td class="small muted">—</td>',
      '          </tr>',
      '        </tbody>',
      '      </table>',
      '    </div>',
      '  </div>',
      '',
      '  <!-- 原始数据：快变量 + 慢变量两张表；可自定义时间窗、可导出 -->',
      '  <div class="card" style="margin-top:12px">',
      '    <div class="card-title">原始数据（最近 {{ activePer.minutes }} 分钟窗口）</div>',
      '    <div class="row" style="align-items:center">',
      '      <time-range :model-value="activePer.minutes" @update:model-value="onMinutes" />',
      '      <input type="number" min="5" max="1440" :value="activePer.minutes" @change="onCustomMin"',
      '             class="mono" style="width:88px" />',
      '      <span class="small muted">自定义分钟数（5–1440）</span>',
      '      <span style="flex:1"></span>',
      '      <button class="primary" @click="exportCsv">导出 CSV</button>',
      '    </div>',
      '    <div class="hint" style="margin-top:8px">',
      '      时间显示为「年/月/日 时:分:秒」。快变量（水温 / 溶解氧 / 光照）5 秒一条，',
      '      慢变量（盐度 / pH）30 秒一条。切换「观测站点」后即为 NOAA NDBC 公开历史实测数据。',
      '    </div>',
      '    <div class="card-title" style="margin-top:10px;font-size:13px">快变量</div>',
      '    <div class="dt-wrap">',
      '      <table class="dt">',
      '        <thead><tr><th>时间</th><th>站点</th><th>来源</th><th>质量</th>',
      '                <th>水温 (℃)</th><th>溶解氧 (mg/L)</th><th>光照 (lux)</th></tr></thead>',
      '        <tbody>',
      '          <tr v-for="r in fast" :key="r.ts">',
      '            <td class="mono small">{{ fmtTs(r.ts) }}</td>',
      '            <td class="small">{{ r.site_id }}</td>',
      '            <td class="small">{{ srcCn(r.source) }}</td>',
      '            <td class="small">{{ qCn(r.quality) }}</td>',
      '            <td class="mono">{{ r.water_temp == null ? \'—\' : r.water_temp }}</td>',
      '            <td class="mono">{{ r.dissolved_oxygen == null ? \'—\' : r.dissolved_oxygen }}</td>',
      '            <td class="mono">{{ r.light_intensity == null ? \'—\' : r.light_intensity }}</td>',
      '          </tr>',
      '          <tr v-if="!fast.length"><td colspan="7" class="muted small">暂无数据</td></tr>',
      '        </tbody>',
      '      </table>',
      '    </div>',
      '    <div class="card-title" style="margin-top:10px;font-size:13px">慢变量（盐度 / pH）</div>',
      '    <div class="dt-wrap">',
      '      <table class="dt">',
      '        <thead><tr><th>时间</th><th>站点</th><th>质量</th><th>盐度 (‰)</th><th>pH 值</th></tr></thead>',
      '        <tbody>',
      '          <tr v-for="r in slow" :key="r.ts">',
      '            <td class="mono small">{{ fmtTs(r.ts) }}</td>',
      '            <td class="small">{{ r.site_id }}</td>',
      '            <td class="small">{{ qCn(r.quality) }}</td>',
      '            <td class="mono">{{ r.salinity == null ? \'—\' : r.salinity }}</td>',
      '            <td class="mono">{{ r.ph == null ? \'—\' : r.ph }}</td>',
      '          </tr>',
      '          <tr v-if="!slow.length"><td colspan="5" class="muted small">暂无数据</td></tr>',
      '        </tbody>',
      '      </table>',
      '    </div>',
      '  </div>',
      '',
      '  <!-- 调试面板（仿真控制）：放在页面最下方 -->',
      '  <div class="card" style="margin-top:12px">',
      '    <div class="card-title">调试面板 · 仿真控制</div>',
      '    <div v-if="pauseText" class="hint" style="background:#FEF2F2;border-color:#FECACA">',
      '      <b>已暂停生成：</b>{{ pauseText }}',
      '    </div>',
      '    <div class="dt-wrap">',
      '      <table class="dt">',
      '        <thead><tr><th>站点</th><th>类型</th><th>状态</th><th>当前模式</th><th>操作</th></tr></thead>',
      '        <tbody>',
      '          <tr v-for="s in API.sites()" :key="s.site_id">',
      '            <td class="small"><b>{{ s.site_name }}</b> <span class="muted mono">{{ s.site_id }}</span></td>',
      '            <td class="small">{{ s.kind === \'obs\' ? \'观测\' : \'养殖\' }}</td>',
      '            <td class="small">',
      '              <span :style="{ color: per[s.site_id] && per[s.site_id].paused ? \'#991B1B\' : \'#166534\' }">',
      '                {{ per[s.site_id] && per[s.site_id].paused ? \'已暂停\' : \'运行中\' }}',
      '              </span>',
      '            </td>',
      '            <td class="small">',
      '              <span v-if="per[s.site_id] && (per[s.site_id].heat || per[s.site_id].offline)" style="color:#991B1B">',
      '                {{ per[s.site_id].heat ? \'水温骤升\' : \'设备离线\' }}',
      '              </span>',
      '              <span v-else class="muted">正常</span>',
      '            </td>',
      '            <td class="small">',
      '              <button class="primary" style="padding:2px 8px" @click="togglePause(s.site_id)">',
      '                {{ per[s.site_id] && per[s.site_id].paused ? \'恢复生成\' : \'暂停生成\' }}',
      '              </button>',
      '              <button style="padding:2px 8px;margin-left:6px" @click="toggleHeat(s.site_id)">',
      '                {{ per[s.site_id] && per[s.site_id].heat ? \'恢复正常水温\' : \'触发水温骤升\' }}',
      '              </button>',
      '              <button style="padding:2px 8px;margin-left:6px" @click="toggleOffline(s.site_id)">',
      '                {{ per[s.site_id] && per[s.site_id].offline ? \'恢复设备在线\' : \'模拟设备离线\' }}',
      '              </button>',
      '            </td>',
      '          </tr>',
      '        </tbody>',
      '      </table>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <time-range :model-value="activePer.minutes" @update:model-value="onMinutes" />',
      '    <span style="width:12px"></span>',
      '    <span class="small muted">站点</span>',
      '    <select v-model="site">',
      '      <option v-for="s in API.sites()" :key="s.site_id" :value="s.site_id">{{ s.site_name }}</option>',
      '    </select>',
      '    <span style="flex:1"></span>',
      '    <span class="small muted">口径：{{ API.disclaimer }}</span>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  /* ============================================================
     两页共用的来源 / 质量中文映射（界面不许裸英文，硬规矩 3）
     ============================================================ */
  function srcCn(src) {
    return { simulated: '仿真数据', public: '公开数据', real: '真实数据', demo: '演示数据' }[src] || src || '—';
  }
  function qCn(q) {
    return { good: '良好', stale: '超时未更新', suspect: '疑似异常' }[q] || q || '—';
  }
  function downloadCsv(name, csv) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }
  /* 供模板与 methods 共用（页面作用域内可直接引用） */
  global.__ENV_CN__ = { srcCn: srcCn, qCn: qCn, downloadCsv: downloadCsv };

})(window);
