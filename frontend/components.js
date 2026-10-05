/* ============================================================
   components.js —— 通用组件（前端骨架规范 第三节）
   ============================================================
   规范要求「我做，你不用重复做」。每个组件把 放什么字段 / 有哪些状态 /
   怎么交互 三件事写全 —— 状态没写全就会出现"数据断了页面白屏"。

   建立：2026-10-05
   ============================================================ */
(function (global) {
  'use strict';
  const C = {};

  /* ---------- 3.5 数据来源标签 SourceTag ---------- */
  C.SourceTag = {
    props: { source: { type: String, default: 'simulated' }, multi: { type: Array, default: null } },
    computed: {
      items: function () {
        const list = this.multi && this.multi.length ? this.multi : [this.source];
        return list.map(function (s) { return { key: s, text: API.sourceText[s] || s }; });
      }
    },
    template:
      '<span class="tagline">' +
      '  <span v-for="it in items" :key="it.key" class="tag" :class="\'tag-\' + it.key">{{ it.text }}</span>' +
      '</span>'
  };

  /* ---------- 3.1 数值卡 StatCard ----------
     状态：① 正常 ② 缺失（— + 设备离线）③ 可疑（黄）④ 过期（灰 + 最后更新） */
  C.StatCard = {
    props: {
      name: String, value: [Number, String], unit: { type: String, default: '' },
      source: { type: String, default: 'simulated' },
      quality: { type: String, default: 'good' },   // good | stale | suspect
      ts: { type: Number, default: 0 },
      field: { type: String, default: '' }          // 完整字段名，悬停显示
    },
    computed: {
      missing: function () { return this.value === null || this.value === undefined || this.value === ''; },
      cls: function () {
        if (this.missing) return 'is-missing';
        if (this.quality === 'stale') return 'is-stale';
        if (this.quality === 'suspect') return 'is-suspect';
        return '';
      },
      shown: function () { return this.missing ? '—' : this.value; },
      tip: function () {
        const t = this.ts ? new Date(this.ts).toLocaleTimeString('zh-CN', { hour12: false }) : '—';
        return '字段：' + (this.field || '（未标注）') + '\n更新时间：' + t +
               '\n数据来源：' + (API.sourceText[this.source] || this.source);
      },
      foot: function () {
        if (this.missing) return '设备离线';
        if (this.quality === 'stale') return '最后更新 ' + new Date(this.ts).toLocaleTimeString('zh-CN', { hour12: false });
        if (this.quality === 'suspect') return '疑似异常';
        return '';
      }
    },
    template:
      '<div class="stat" :class="cls" :title="tip">' +
      '  <div class="name"><span>{{ name }}</span><source-tag :source="source" /></div>' +
      '  <div class="val"><span>{{ shown }}</span><span class="unit" v-if="!missing && unit">{{ unit }}</span></div>' +
      '  <div class="foot">{{ foot }}</div>' +
      '</div>'
  };

  /* ---------- 3.2 时序曲线卡 TimeSeriesChart ----------
     状态：① 正常 ② 无数据（"暂无数据"占位，不白屏）③ 单点（散点） */
  C.TrendChart = {
    props: {
      title: { type: String, default: '' },
      series: { type: Array, default: function () { return []; } }, // [{name, unit, data:[[ts,val]]}]
      small: { type: Boolean, default: false },
      thresholds: { type: Array, default: function () { return []; } } // [{value,label,color}]
    },
    data: function () { return { chart: null, alive: true }; },
    computed: { empty: function () { return !this.series.length || !this.series[0].data.length; } },
    mounted: function () { this.alive = true; this.render(); },
    beforeUnmount: function () {
      /* 卸载时把图表彻底收干净。
         曾经的做法是用 v-show 控制画布显隐 —— 容器在 display:none 下宽高为 0，
         ECharts 会以 0×0 初始化，之后在 Vue 触发的重绘里抛
         "Cannot read properties of undefined (reading 'type')"。
         现在画布始终渲染（不显隐），空数据用 graphic 文字表达。 */
      this.alive = false;
      if (this.chart) { this.chart.dispose(); this.chart = null; }
    },
    watch: {
      /* flush: 'post' —— 等 DOM 更新完再渲染 */
      series: { handler: function () { this.render(); }, deep: true, flush: 'post' }
    },
    methods: {
      render: function () {
        const el = this.$refs.canvas;
        if (!el || !this.alive) return;

        /* 同一 DOM 上只允许一个实例；已存在就先复用，避免重复 init */
        let inst = echarts.getInstanceByDom(el);
        if (!inst) inst = echarts.init(el);
        this.chart = inst;

        if (this.empty) {
          inst.clear();
          inst.setOption({
            graphic: {
              type: 'text', left: 'center', top: 'middle',
              style: { text: '暂无数据', fill: '#6B7280', fontSize: 14 }
            },
            xAxis: { show: false }, yAxis: { show: false }, series: []
          }, true);
          return;
        }

        const palette = ['#2F5496', '#C2410C', '#166534', '#92400E', '#6B7280', '#991B1B'];
        const series = this.series.map(function (s, i) {
          const color = palette[i % palette.length];
          return {
            name: s.name + (s.unit ? '（' + s.unit + '）' : ''),
            type: 'line',
            showSymbol: false,
            smooth: true,
            sampling: 'lttb',
            lineStyle: { width: 1.6, color: color },
            itemStyle: { color: color },
            data: s.data
          };
        });

        /* 阈值参考线：用 markLine 挂在第一条曲线上。
           ⚠️ 阈值线不是数据序列，不许 concat 成假 series 塞进去。 */
        if (this.thresholds.length && series.length) {
          series[0].markLine = {
            silent: true,
            symbol: 'none',
            label: { formatter: '{b}', fontSize: 11, position: 'insideEndTop' },
            data: this.thresholds.map(function (t) {
              return {
                yAxis: t.value,
                name: t.label,
                lineStyle: { color: t.color || '#991B1B', type: 'dashed', width: 1 }
              };
            })
          };
        }

        inst.setOption({
          grid: { left: 56, right: 20, top: 36, bottom: 32 },
          tooltip: { trigger: 'axis' },
          legend: { top: 0, textStyle: { fontSize: 12 } },
          xAxis: {
            type: 'time',
            axisLabel: {
              fontSize: 11,
              formatter: function (v) {
                return new Date(v).toLocaleTimeString('zh-CN', { hour12: false }).slice(0, 8);
              }
            },
            splitLine: { show: false }
          },
          yAxis: {
            type: 'value',
            scale: true,
            axisLabel: { fontSize: 11 },
            splitLine: { lineStyle: { color: '#EEF2F6' } }
          },
          series: series
        }, true);

        const self = this;
        this.$nextTick(function () {
          if (self.alive && self.chart && !self.chart.isDisposed()) self.chart.resize();
        });
      }
    },
    template:
      '<div class="card">' +
      '  <div class="card-title" v-if="title">{{ title }}</div>' +
      '  <div ref="canvas" class="chart" :class="{ \'chart-sm\': small }"></div>' +
      '</div>'
  };

  /* ---------- 3.3 事件列表 EventList ---------- */
  C.EventList = {
    props: { items: { type: Array, default: function () { return []; } }, emptyText: { type: String, default: '暂无事件' } },
    methods: {
      lvClass: function (lv) { return 'bg-' + (lv || 'blue'); },
      time: function (ts) { return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false }); },
      click: function (it) { this.$emit('pick', it); }
    },
    template:
      '<div class="events">' +
      '  <div v-if="!items.length" class="empty">{{ emptyText }}</div>' +
      '  <div v-for="it in items" :key="it.id" class="row-item" @click="click(it)">' +
      '    <span class="t">{{ time(it.ts) }}</span>' +
      '    <span class="dot" :class="lvClass(it.level)"></span>' +
      '    <span class="d">{{ it.text }}</span>' +
      '  </div>' +
      '</div>'
  };

  /* ---------- 3.4 时间窗切换器 TimeRangePicker ---------- */
  C.TimeRangePicker = {
    props: { modelValue: { type: Number, default: 60 } },
    emits: ['update:modelValue'],
    data: function () { return { opts: [['当前', 1], ['1 小时', 60], ['6 小时', 360], ['24 小时', 1440]] }; },
    template:
      '<span class="row" style="gap:6px;align-items:center">' +
      '  <span class="small muted">时间窗</span>' +
      '  <button v-for="o in opts" :key="o[1]" :class="{ primary: modelValue === o[1] }"' +
      '          @click="$emit(\'update:modelValue\', o[1])">{{ o[0] }}</button>' +
      '</span>'
  };

  /* ---------- 3.7 指令状态机进度条 CommandFlow（答辩重点） ---------- */
  C.CommandFlow = {
    props: { status: { type: String, default: 'created' } },
    computed: {
      steps: function () {
        const order = ['created', 'sent', 'acknowledged', 'success'];
        const bad = ['timeout', 'retrying', 'failed', 'escalated'];
        const cn = { created: '已创建', sent: '已发出', acknowledged: '已收到回执', success: '成功',
                     timeout: '超时', retrying: '重试中', failed: '失败', escalated: '升级报警' };
        const cur = this.status;
        if (bad.indexOf(cur) >= 0) {
          return bad.map(function (s) {
            const i = bad.indexOf(s), j = bad.indexOf(cur);
            return { key: s, text: cn[s], cls: i < j ? 'done' : (i === j ? 'bad' : '') };
          });
        }
        return order.map(function (s) {
          const i = order.indexOf(s), j = order.indexOf(cur);
          return { key: s, text: cn[s], cls: i < j ? 'done' : (i === j ? 'now' : '') };
        });
      }
    },
    template:
      '<div class="flow">' +
      '  <template v-for="(s, i) in steps" :key="s.key">' +
      '    <span class="arrow" v-if="i">→</span>' +
      '    <span class="step" :class="s.cls">{{ s.text }}</span>' +
      '  </template>' +
      '</div>'
  };

  /* ---------- 网格热力图 HeatGrid（鱼群密度 / 网衣拉力分布） ---------- */
  C.HeatGrid = {
    props: {
      title: { type: String, default: '' },
      grid: { type: Array, default: function () { return []; } },   // [[v,...],...] 行优先
      unit: { type: String, default: '' },
      height: { type: Number, default: 420 }
    },
    data: function () { return { chart: null, alive: true }; },
    mounted: function () { this.alive = true; this.render(); },
    beforeUnmount: function () {
      this.alive = false;
      if (this.chart) { this.chart.dispose(); this.chart = null; }
    },
    watch: { grid: { handler: function () { this.render(); }, deep: true, flush: 'post' } },
    methods: {
      render: function () {
        const el = this.$refs.canvas;
        if (!el || !this.alive || !this.grid.length) return;
        let inst = echarts.getInstanceByDom(el);
        if (!inst) inst = echarts.init(el);
        this.chart = inst;

        const n = this.grid[0].length, m = this.grid.length, unit = this.unit;
        const data = [];
        let max = 0;
        for (let y = 0; y < m; y++) {
          for (let x = 0; x < n; x++) {
            const v = this.grid[y][x];
            data.push([x, y, v]);
            if (v > max) max = v;
          }
        }
        const cat = function (p, i) { return p + (i + 1); };
        const xs = [], ys = [];
        for (let i = 0; i < n; i++) xs.push(cat('X', i));
        for (let i = 0; i < m; i++) ys.push(cat('Y', i));

        inst.setOption({
          tooltip: {
            formatter: function (p) {
              return '网格 ' + xs[p.value[0]] + ' / ' + ys[p.value[1]] +
                     '<br>密度 <b>' + p.value[2] + '</b> ' + unit;
            }
          },
          grid: { left: 46, right: 20, top: 16, bottom: 62 },
          xAxis: { type: 'category', data: xs, splitArea: { show: true }, axisLabel: { fontSize: 11 } },
          yAxis: { type: 'category', data: ys, splitArea: { show: true }, axisLabel: { fontSize: 11 } },
          visualMap: {
            min: 0, max: max, calculable: true, orient: 'horizontal',
            left: 'center', bottom: 6, itemWidth: 12, itemHeight: 100,
            text: ['密', '疏'], textStyle: { fontSize: 11 },
            /* 配色沿用状态色阶语义，不用彩虹色（项目通用规范 第六节） */
            inRange: { color: ['#EFF6FF', '#BFDBFE', '#60A5FA', '#2F5496', '#C2410C'] }
          },
          series: [{
            type: 'heatmap', data: data,
            label: { show: false },
            emphasis: { itemStyle: { borderColor: '#111827', borderWidth: 1 } }
          }]
        }, true);

        const self = this;
        this.$nextTick(function () {
          if (self.alive && self.chart && !self.chart.isDisposed()) self.chart.resize();
        });
      }
    },
    template:
      '<div class="card">' +
      '  <div class="card-title" v-if="title">{{ title }}</div>' +
      '  <div ref="canvas" class="chart" :style="{ height: height + \'px\' }"></div>' +
      '</div>'
  };

  /* ---------- 页头：标题 + 来源标签（纪律 4：每页都要有） ---------- */
  C.PageHead = {
    props: { title: String, desc: { type: String, default: '' }, sources: { type: Array, default: null }, source: { type: String, default: 'simulated' } },
    template:
      '<div class="row" style="justify-content:space-between;align-items:flex-end;margin-bottom:12px">' +
      '  <div>' +
      '    <div style="font-size:18px;font-weight:700">{{ title }}</div>' +
      '    <div class="small muted" v-if="desc" v-html="desc"></div>' +
      '  </div>' +
      '  <source-tag :source="source" :multi="sources" />' +
      '</div>'
  };

  global.C = C;
})(window);
