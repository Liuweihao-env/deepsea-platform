/* ============================================================
   app.js —— 平台骨架：四区域布局 + 菜单 + 路由
   ============================================================
   依据：
     前端骨架规范.md 2.1 四区域结构 / 2.2 区域归属 / 1.2 菜单树（终版 24 页）
     功能冻结清单-10-05.md 1.1 页面清单（10-09 交 13 页，终版 24 页）

   区域归属（骨架规范 2.2）：
     ① 顶部横条  —— 骨架维护，别人不要改
     ② 左侧菜单  —— 骨架维护
     ③ 主内容区  —— 各页面自己写
     ④ 操作条    —— 各页面自己写

   建立：2026-10-05
   ============================================================ */
(function () {
  'use strict';

  /* 菜单树：ready = 10-09 必交的 13 页；其余为 10-23 终版补齐 */
  const MENU = [
    { group: '平台', items: [
      { path: '/overview', label: '总览大屏', ready: true }
    ]},
    { group: '鱼类', owner: '王浩然', items: [
      { path: '/fish/monitor',  label: '鱼类监测总览', ready: true },
      { path: '/fish/heatmap',  label: '鱼群分布热力图', ready: true },
      { path: '/fish/species',  label: '鱼种档案', ready: true },
      { path: '/fish/growth',   label: '生长模型与预测', ready: false },
      { path: '/fish/records',  label: '原始数据明细', ready: false },
      { path: '/fish/simulator',label: '鱼类仿真控制', ready: false }
    ]},
    { group: '环境', owner: '刘伟豪', items: [
      { path: '/env/sea',    label: '海况', ready: true },
      { path: '/env/water',  label: '水质', ready: true },
      /* 🔴 2026-10-15 队长删：原「原始数据明细 /env/records」与
         「环境仿真控制 /env/simulator」两个菜单项**已移除**。

         这不是临时决定 —— 是**刘伟豪在 2026-10-08 的 PR 说明里提的「问题四」**：
         那两页 env.js 从未注册过（从未实现），功能已并入「海况 / 水质」两页
         （原始明细在页面底部就有，仿真控制就是页面上的造故障入口）。
         他当时注明「删除导航项需要改 app.js，属越权范围，本分支未改动」，请队长删。
         **这正是约定该有的样子** —— 公共骨架文件归队长改，组员提出来就行。
         完整记录见 backend/api/env.py 的 2026-10-08 追加说明第 2 条。 */
    ]},
    { group: '结构安全', owner: '邓宇涵', items: [
      { path: '/struct/overview', label: '结构安全总览', ready: false },
      { path: '/struct/alarm',  label: '灾害分级预警', ready: true },
      { path: '/struct/detail', label: '监测详情', ready: false },
      { path: '/struct/rules',  label: '规则配置', ready: false },
      /* 🔴 2026-10-15 队长删：原「造故障工具 /struct/fault」菜单项**已移除**
         （这一页从未实现，点进去是空白占位页）。

         ⚠️ **删的是"从未存在的统一页面"，不是删能力。** 造故障能力**还在**，
            只是散在各业务页里：
              · 智能·自动投喂页有「造故障（验证闭环用）」卡片（最完整）
              · 海况页有「大风大浪」、投喂页有「水温骤升」
              · 后端 send_command(..., inject=) 支持 offline / timeout
            演示闭环时从**智能·自动投喂页**进就行。

         📌 顺带纠正一处历史描述：多份早期文档曾把「造故障工具」写成
            「答辩重点」「全项目唯一的造故障工具」「断它会断掉整个闭环证据链」。
            那些说法在"这一页从未实现"之后就不成立了，已在相关文档里改成如实口径。 */
    ]},
    { group: '智能', owner: '李志成', items: [
      { path: '/ai/feed',  label: '自动投喂', ready: true },
      { path: '/ai/light', label: '智能补光', ready: true },
      { path: '/ai/devices', label: '设备状态', ready: false },
      { path: '/ai/commands',label: '指令日志', ready: false },
      /* 🔴 2026-10-15 队长挂上菜单。
         李志成按老师意见第 10 条做了这一页 —— 而且**做了查证**：
         「中集来福士（CIMC Raffles）官网载明，经海001/002/003/006、长鲸一号等
           大型坐底式网箱（68×68m）每座配网衣绞车 10–20 台」，指名道姓 + 给了出处。
         但他不能改 app.js（公共文件），所以页面**写完却进不去**。
         这正是约定里"需要改公共文件就写在 PR 描述里、队长来改"的那一步。 */
      { path: '/ai/crane', label: '起重设备', ready: true }
    ]},
    /* 🔴 2026-10-15 队长改：**拆掉「跨板块」**（老师意见 2026-10-09 第 3 条）
         告警中心 / 处置中心  → 挪进「管理」
         追溯查询           → 删除（能力并进告警中心：点一行就地展开三段）
         参数配置           → 整页拆解（阈值按 owner 拆回各板块 / 判断规则已并入
                              /struct/rules / 鱼种参数库已并入 鱼类·鱼种档案）
       原来的「跨板块」组已整组移除。 */
    /* 管理板块 —— 养殖生产视角（场长用）。
       现在它还接管了原来「跨板块」的告警/处置，以及结构安全的能源保障。 */
    { group: '管理', owner: '场长 / 运维', items: [
      { path: '/mgmt/cages',       label: '网箱与站点',   ready: true },
      { path: '/mgmt/ledger',      label: '存箱量台账',   ready: true },
      { path: '/mgmt/calibration', label: '标定与维护',   ready: true },
      { path: '/mgmt/energy',      label: '能源保障',     ready: true },
      { path: '/mgmt/alarm',       label: '告警中心',     ready: true },
      { path: '/mgmt/handle',      label: '处置中心',     ready: true }
    ]}
  ];

  /* ---------- 路由：hash 实现，免构建、无依赖 ---------- */
  const Router = {
    _path: '/overview',
    _subs: [],
    norm: function (h) {
      let p = (h || '').replace(/^#/, '');
      if (!p) p = '/overview';
      if (p.charAt(0) !== '/') p = '/' + p;
      return p.replace(/\/+$/, '') || '/overview';
    },
    get: function () { return this._path; },
    go: function (p) { window.location.hash = p; },
    onChange: function (f) { this._subs.push(f); },
    start: function () {
      const self = this;
      const apply = function () {
        self._path = self.norm(window.location.hash);
        self._subs.forEach(function (f) { f(self._path); });
      };
      window.addEventListener('hashchange', apply);
      if (!window.location.hash) window.location.hash = '/overview';
      apply();
    }
  };

  /* ---------- 顶部大板块切换 ---------- */
  /* ---------- 板块入口的告警小红点（老师意见 2026-10-09 第 2 条）----------
   老师原话：「挂鱼类/环境/结构安全/智能四入口；有未解除告警就亮（**不分等级**）；
               **告警解除才消**（点进去不消）；**纯红点**；管理与跨板块不挂」

   /api/alarms 里**没有** board 字段（这点我核过），所以由 alarm_type 映射到板块。
   低电量 / 供电异常现在归「管理」，按老师要求**管理与跨板块不挂红点**，
   所以这两个类型**不点亮任何点** —— 这是刻意的，不是漏了。 */
const ALARM_BOARD = {
  /* 鱼类 */  feeding: 'fish', feeding_abnormal: 'fish', fish_anomaly: 'fish', density: 'fish',
  /* 环境 */  water_temp: 'env', dissolved_oxygen: 'env', salinity: 'env', ph: 'env', light: 'env',
  /* 结构 */  tension: 'struct', tilt: 'struct', net_damage: 'struct', deformation: 'struct',
  /* 智能 */  command: 'ai', command_timeout: 'ai', feeder: 'ai', light_device: 'ai', device_offline: 'ai'
};
/* 能挂红点的四个板块 —— 总览/管理不挂 */
const DOT_BOARDS = ['fish', 'env', 'struct', 'ai'];

const TABS = [
    { key: 'overview', label: '总览', first: '/overview' },
    { key: 'fish',     label: '鱼类', first: '/fish/monitor' , board: 'fish' },
    { key: 'env',      label: '环境', first: '/env/sea' , board: 'env' },
    { key: 'struct',   label: '结构安全', first: '/struct/overview' , board: 'struct' },
    { key: 'ai',       label: '智能', first: '/ai/feed' , board: 'ai' },
    /* 🔴 2026-10-15 队长删：拆掉「跨板块」（老师第 3 条）。告警/处置已挪进「管理」，
       追溯查询删除，参数配置拆解。侧边菜单里的 MENU 也同步删了那一组。 */
    /* 管理板块 —— 养殖生产视角（场长用）。
       放在最后：它是配置类不是监控类。 */
    { key: 'mgmt',     label: '管理', first: '/mgmt/cages' }
  ];

  const App = {
    data: function () {
      /* tick：给 boardDots 建立响应式依赖用。
         ⚠️ 这是项目里踩过好几次的坑 —— API.alarms() 返回的是**普通数组**，
            「没有响应式依赖的 computed」会被 Vue **永久缓存**：红点第一次算完
            就再也不更新，告警解除了点也不会灭。
         所以这里订阅 API 变化 → tick 自增 → boardDots 里读一下 this.tick 逼它重算。 */
      return { path: '/overview', menu: MENU, tabs: TABS, err: null, tick: 0 };
    },
    computed: {
      /* 每个板块「未解除」的告警条数 —— 顶部红点亮不亮看它。
         「未解除」= alarm_status !== 'recovered'（active 与 acknowledged 都算）。
         ⚠️ 点进去**不消** —— 它读的是告警的实际状态，不是「已读/未读」。 */
      boardDots: function () {
        this.tick;   /* ← 建立响应式依赖，否则永久缓存（见 data 里的说明） */
        const out = {};
        DOT_BOARDS.forEach(function (b) { out[b] = 0; });
        (API.alarms() || []).forEach(function (a) {
          if (a.alarm_status === 'recovered') return;      // 已解除 → 不点亮
          const b = ALARM_BOARD[a.alarm_type];
          if (b && out[b] !== undefined) out[b] += 1;
        });
        return out;
      },

      /* 当前一级板块 */
      tabKey: function () {
        const p = this.path;
        if (p === '/overview') return 'overview';
        if (p.indexOf('/fish') === 0) return 'fish';
        if (p.indexOf('/env') === 0) return 'env';
        if (p.indexOf('/struct') === 0) return 'struct';
        if (p.indexOf('/ai') === 0) return 'ai';
        if (p.indexOf('/mgmt') === 0) return 'mgmt';
        return 'global';
      },
      /* 左侧菜单只显示当前板块。
         🔴 2026-10-06 改：`ready` 不再看菜单里的写死值，改成**按实际注册的路由自动判断** ——
            只要某个组员的页面文件里注册了 PAGES['/fish/growth']，这一项就自动亮起来。
            目的：组员加页面时**完全不用碰 app.js**（这是公共文件，多人改必冲突）。
            菜单里 ready:false 的项仍然留着，作为「计划要做但还没做」的占位。 */
      sideGroups: function () {
        const k = this.tabKey;
        const want = { overview: '平台', fish: '鱼类', env: '环境',
                       struct: '结构安全', ai: '智能', global: '跨板块',
                       mgmt: '管理' }[k];
        /* ready 按**实际注册的路由**判断，不看菜单里的写死值 ——
           这样组员只要注册了 PAGES['/fish/growth']，菜单项就自动从「·待建」变成可点。 */
        const reg = window.PAGES || {};
        return this.menu
          .filter(function (g) { return g.group === want; })
          .map(function (g) {
            return {
              group: g.group,
              owner: g.owner,
              items: g.items.map(function (it) {
                return { path: it.path, label: it.label, ready: !!reg[it.path] };
              })
            };
          });
      },
      /* 当前页面的组件 */
      page: function () {
        const def = (window.PAGES || {})[this.path];
        if (def) return def;
        return {
          template:
            '<div><page-head title="页面待建" desc="这一页排在 10-23 终版补齐（不在 10-09 的 13 页里）"></page-head>' +
            '<div class="todo">本页尚未实现。<br><span class="small">10-09 必交的 13 页见「功能冻结清单-10-05.md」1.1 节。</span></div></div>'
        };
      },
      pathLabel: function () { return this.path; }
    },
    methods: {
      pick: function (p) { Router.go(p); },
      tabPick: function (t) { Router.go(t.first); },
      /* 角标文字：1~99 显示数字，100 及以上显示 99+ —— 微信/iOS 同款约定，
         三位数会把标签挤变形。 */
      dotText: function (b) {
        const n = this.boardDots[b] || 0;
        return n > 99 ? '99+' : String(n);
      }
    },
    mounted: function () {
      const self = this;
      Router.onChange(function (p) {
        self.path = p;
        self.$nextTick(function () { if (self.$refs.content) self.$refs.content.scrollTop = 0; });
      });
      /* 订阅 API 变化 → tick 自增 → boardDots 重算。
         红点跟着**告警的实际状态**走：告警解除（recovered）了，点自动灭；
         点进去是**不会消**的（老师要求）。 */
      this.unsub = (window.API && window.API.subscribe)
        ? window.API.subscribe(function () { self.tick++; })
        : null;
      Router.start();
      window.addEventListener('error', function (e) { self.err = e.message; });
    },
    template: [
      '<div class="shell">',
      '  <!-- ① 顶部横条 56px -->',
      '  <div class="topbar">',
      '    <div class="brand">深远海养殖与海洋牧场智能管控平台</div>',
      '    <div class="tabs">',
      '      <div v-for="t in tabs" :key="t.key" class="tab" ',
      '           :class="{ active: tabKey === t.key }"',
      '           role="button" tabindex="0" :aria-pressed="tabKey === t.key"',
      '           @keydown.enter="tabPick(t)" @keydown.space.prevent="tabPick(t)" @click="tabPick(t)">',
      '        {{ t.label }}',
      '        <!-- 板块入口告警角标：iOS/微信那种带数字的红点，',
      '             数字＝该板块未解除的告警条数；99+ 封顶（微信同款约定）。',
      '             点进去不消、告警解除才消。 -->',
      '        <span v-if="t.board && boardDots[t.board]" class="nav-dot"',
      '              :title="dotText(t.board) + \' 条未解除告警\'">{{ dotText(t.board) }}</span>',
      '      </div>',
      '    </div>',
      '    <div class="spacer"></div>',
      '    ',
      '  </div>',
      '',
      '  <div class="body">',
      '    <!-- ② 左侧菜单 200px -->',
      '    <div class="sidenav">',
      '      <template v-for="g in sideGroups" :key="g.group">',
      '        <div class="group">{{ g.group }}<span v-if="g.owner"> · {{ g.owner }}</span></div>',
      '        <div v-for="it in g.items" :key="it.path" class="item"',
      '             :class="{ active: path === it.path }" role="button" tabindex="0" :aria-current="path === it.path ? \'page\' : null"',
      '             @keydown.enter="pick(it.path)" @keydown.space.prevent="pick(it.path)" @click="pick(it.path)">',
      ' {{ it.label }}<span v-if="!it.ready" class="small muted"> ·待建</span>',
      '        </div>',
      '      </template>',
      '    </div>',
      '',
      '    <!-- ③ 主内容区 -->',
      '    <div class="main">',
      '      <div class="content" ref="content" :data-page="path">',
      '        <div v-if="err" class="hint" style="margin-bottom:12px">页面脚本报错：{{ err }}</div>',
      '        <component :is="page" :key="path"></component>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  const app = Vue.createApp(App);
  /* 模板里要用 API.sites() 之类 —— Vue 模板只能访问组件实例上的东西，
     访问不到 window 全局，所以必须挂到 globalProperties 上。 */
  app.config.globalProperties.API = window.API;
  /* 枚举中文标签（通用规范 第五节）—— 模板里写 {{ CN.deviceState(x) }} */
  app.config.globalProperties.CN = window.CN;
  /* 注册通用组件（骨架规范 第三节） */
  app.component('stat-card', C.StatCard);
  app.component('trend-chart', C.TrendChart);
  app.component('heat-grid', C.HeatGrid);
  app.component('event-list', C.EventList);
  app.component('time-range', C.TimeRangePicker);
  app.component('command-flow', C.CommandFlow);
  app.component('page-head', C.PageHead);
  app.component('help-dot', C.HelpDot);   /* 阈值依据：灰色问号 + 悬停看解释与出处 */
  /* 🔴 2026-10-15 队长加：阈值表从「参数配置」整页拆出来后做成公共组件，
     各板块用 <threshold-table owner="环境" /> 只显示自己那几条。
     数据在 components.js 的 C.THRESHOLDS —— **单一事实来源**，
     避免四个人各抄一份抄歪（这正是老师第 3 条「阈值按 owner 拆回各板块」的落法）。 */
  app.component('threshold-table', C.ThresholdTable);
  /* 视频位（老师意见第 9 条）：三块门面页各一个常驻播放区。
     ⚠️ 视频**必须标出处** —— 「全删来源标签」只对视频开例外。 */
  app.component('video-slot', C.VideoSlot);
  app.mount('#app');

  window.ROUTER = Router;
})();
