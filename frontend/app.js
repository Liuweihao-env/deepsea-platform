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
    { group: '总览', items: [
      { path: '/overview', label: '总览大屏', ready: true }
    ]},
    { group: '鱼类监测', owner: '王浩然', items: [
      /* 🔴 2026-10-18 队长按「重要 × 常用」复核过，**顺序保持不变**：
         监测总览 → 热力图 → 鱼种档案 → 生长模型 → 原始明细 → 仿真控制。
         鱼种档案排第 3 不是因为它常用（改一次鱼种用很久），
         而是老师 10-09 点名把它从「管理」挪进「鱼类」当卖点，重要性高。 */
      { path: '/fish/monitor',  label: '鱼类监测总览', ready: true },
      { path: '/fish/heatmap',  label: '鱼群分布热力图', ready: true },
      { path: '/fish/species',  label: '鱼种档案', ready: true },
      { path: '/fish/growth',   label: '生长模型与预测', ready: false },
      { path: '/fish/records',  label: '原始数据明细', ready: false },
      { path: '/fish/simulator',label: '鱼类仿真控制', ready: false }
    ]},
    { group: '环境监测', owner: '刘伟豪', items: [
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
    { group: '结构安全预警', owner: '邓宇涵', items: [
      /* 🔴 2026-10-18 队长按「重要 × 常用」重排：**灾害分级预警提到第 1**。
         原来「结构安全总览」在第 1 —— 但值班的人打开这个板块，
         第一眼要看的是"现在有没有告警、几级"，不是先看总览再点进来。
         顶部 tab 的入口（TABS 的 first）也一起改成了 /struct/alarm，两处保持一致。 */
      { path: '/struct/alarm',  label: '灾害分级预警', ready: true },
      { path: '/struct/overview', label: '结构安全总览', ready: false },
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
    { group: '智能管控', owner: '李志成', items: [
      /* 🔴 2026-10-18 队长按「重要 × 常用」复核过，**顺序保持不变**：
         自动投喂 → 智能补光 → 设备状态 → 指令日志 → 起重设备。
         控制类在前（投喂/补光每天操作）、查询类居中（设备/日志排查用）、
         工具类最后（起重设备是特殊作业，一星期也用不上一次）。 */
      { path: '/ai/feed',  label: '自动投喂', ready: true },
      { path: '/ai/light', label: '智能补光', ready: true },
      /* 🔴 2026-10-15 队长挂上菜单。
         李志成按老师意见第 10 条做了这一页 —— 而且**做了查证**：
         「中集来福士（CIMC Raffles）官网载明，经海001/002/003/006、长鲸一号等
           大型坐底式网箱（68×68m）每座配网衣绞车 10–20 台」，指名道姓 + 给了出处。 */
      { path: '/ai/crane', label: '起重设备', ready: true },
      { path: '/ai/devices', label: '设备状态', ready: false },
      { path: '/ai/commands',label: '指令日志', ready: false }
    ]},
    /* 🔴 2026-10-15 队长改：**拆掉「跨板块」**（老师意见 2026-10-09 第 3 条）
         告警中心 / 处置中心  → 挪进「管理」
         追溯查询           → 删除（能力并进告警中心：点一行就地展开三段）
         参数配置           → 整页拆解（阈值按 owner 拆回各板块 / 判断规则已并入
                              /struct/rules / 鱼种参数库已并入 鱼类·鱼种档案）
       原来的「跨板块」组已整组移除。 */
    /* 管理板块 —— 养殖生产视角（场长用）。
       现在它还接管了原来「跨板块」的告警/处置，以及结构安全的能源保障。 */
    { group: '生产管理', owner: '场长 / 运维', items: [
      /* 🔴 2026-10-18 队长按「重要 × 常用」重排。原来顺序是
         网箱 / 台账 / 标定 / 能源 / 告警 / 处置 —— **告警和处置排在第 5、6**，
         可值班的人每天点的是告警中心，位置明显不对。现在：
           网箱与站点   场长配置的核心，也是"配置驱动"的落点 → 第 1
           告警中心     值班每天看 → 第 2
           处置中心     告警之后紧接着的动作 → 第 3
           存箱量台账   场长定期看 → 第 4
           能源保障     运维定期看 → 第 5
           标定与维护   周期最长，一个月看一次 → 沉底 */
      { path: '/mgmt/cages',       label: '网箱与站点',   ready: true },
      { path: '/mgmt/alarm',       label: '告警中心',     ready: true },
      { path: '/mgmt/handle',      label: '处置中心',     ready: true },
      { path: '/mgmt/ledger',      label: '存箱量台账',   ready: true },
      { path: '/mgmt/energy',      label: '能源保障',     ready: true },
      { path: '/mgmt/calibration', label: '标定与维护',   ready: true }
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
  /* ---------- 全局「当前网箱」（2026-10-16 会上定 第 10 条）----------
     老师要求：全局**只存一个**"当前网箱"，**切一次所有页面跟着变**
     （首页、设备状态、投喂、指令日志…），归队长管（骨架级）。

     为什么做成全局单例而不是各页面自己存：
       各页面自己存就会出现"首页选了 2 号箱、投喂页还是 1 号箱"这种事 ——
       这正是老师这次提的问题。**只有一个真相源**才不会对不上。

     机制：
       · set() 时写 localStorage（刷新/重开浏览器后还记得）→
       · 通知自己的订阅者 → 调 API._bump() ——各页面都订阅了 _bump，
         **一 bump 全部重算重取**，这就是"切一次全变"的实现方式。
       · 不动各页面的取数逻辑，只让它们多读一个参数。

     ⚠️ 与"环境数据"的关系（刘伟豪问的那个）：
       环境数据**永远来自真实台站**（嵊山 / 小麦岛，NMDC 历史实测），
       "当前网箱"只决定**用哪片海的数据**，**绝不往台站里塞模拟值**。
       网箱 → 海域的对应关系写在 farm.json 里（cage.site_id）。 */
  const CurrentCage = (function () {
    const KEY = 'deepsea.currentCage';
    let id = 'cage_01';
    try {
      const v = window.localStorage && window.localStorage.getItem(KEY);
      if (v) {
        id = v;
      } else {
        /* 没有我们的键时，看看有没有他那个旧键（deepsea_cage），有就迁过来 ——
           免得组员浏览器里已经切过的网箱设置丢掉。 */
        const old = window.localStorage && window.localStorage.getItem('deepsea_cage');
        if (old) { id = old; }
      }
    } catch (e) { /* 隐私模式下 localStorage 可能报错，忽略 */ }
    const subs = [];

    function cages() {
      const f = (window.API && window.API.farm && window.API.farm()) || {};
      /* 按 cage_id 排序：后端 /api/farm 的顺序不保证（实测 2 号箱排前面），
         界面上要稳定是「1 号网箱 | 2 号网箱」。 */
      return (f.cages || []).slice().sort(function (a, b) {
        return String(a.cage_id) < String(b.cage_id) ? -1 : 1;
      });
    }
    function get() {
      const list = cages();
      if (list.length && !list.some(function (c) { return c.cage_id === id; })) {
        id = list[0].cage_id;
        try {
          window.localStorage.setItem(KEY, id);
          window.localStorage.setItem('deepsea_cage', id);
          window.__currentCage = id;
          window.dispatchEvent(new CustomEvent('cagechange', { detail: { cage: id } }));
        } catch (e) { /* 存储不可用时仍返回有效网箱 */ }
        subs.slice().forEach(function (f) { try { f(id); } catch (e) { /* 不影响其余订阅者 */ } });
      }
      return id;
    }
    function cage() {
      const list = cages();
      const current = get();
      for (let i = 0; i < list.length; i++) if (list[i].cage_id === current) return list[i];
      return null;
    }
    function site() { const c = cage(); return c ? c.site_id : null; }
    function siteName() { const c = cage(); return c ? (c.site_name || '') : ''; }

    function set(v) {
      const list = cages();
      if (!v || (list.length && !list.some(function (c) { return c.cage_id === v; })) || v === id) return;
      id = v;
      try { if (window.localStorage) window.localStorage.setItem(KEY, id); } catch (e) { /* 忽略 */ }
      for (let i = 0; i < subs.length; i++) {
        try { subs[i](id); } catch (e) { /* 单个订阅者出错不影响别人 */ }
      }
      /* 🔴 2026-10-18 合并李志成 PR #9 时加的兼容层。
         他的 30 个提交是按 window.__currentCage + cagechange 自定义事件写的，
         我们这边是 CurrentCage 单例 + subscribe。
         **状态源统一成 CurrentCage，但把他的两个接口都喂上** ——
         他的页面一行不用改，照样跑。
         （他原来还有个 localStorage 键 deepsea_cage，下面初始化时会读一次并迁移。） */
      try {
        window.__currentCage = id;
        /* ⚠️ **必须同时写他的 localStorage 键**（deepsea_cage）。
           他的 ai.js 有 6 处是在 data() 里 localStorage.getItem('deepsea_cage')
           做**初始值**的 —— 只派发事件不够：事件只通知已经挂载的页面，
           而新打开的页面会在挂载时读这个键。不写就会出现
           「顶栏切到 2 号箱，但新打开的设备状态页还显示 1 号箱」。 */
        if (window.localStorage) window.localStorage.setItem('deepsea_cage', id);
        window.dispatchEvent(new CustomEvent('cagechange', { detail: { cage: id } }));
      } catch (e) { /* CustomEvent / localStorage 出错就算了，不影响主流程 */ }
      /* 关键一步：一 bump，所有订阅了 API 的页面全部重算 */
      if (window.API && window.API._bump) window.API._bump();
    }
    function subscribe(f) {
      subs.push(f);
      return function () {
        const i = subs.indexOf(f);
        if (i >= 0) subs.splice(i, 1);
      };
    }
    return { get: get, set: set, cage: cage, site: site, siteName: siteName,
             cages: cages, subscribe: subscribe };
  })();
  window.CurrentCage = CurrentCage;
  /* 刷新后即同步旧页面读取的键，避免两种存储各指向一个网箱。 */
  try {
    window.__currentCage = CurrentCage.get();
    window.localStorage.setItem('deepsea.currentCage', CurrentCage.get());
    window.localStorage.setItem('deepsea_cage', CurrentCage.get());
  } catch (e) { /* 隐私模式下继续使用内存状态 */ }

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
    { key: 'fish',     label: '鱼类监测', first: '/fish/monitor' , board: 'fish' },
    { key: 'env',      label: '环境监测', first: '/env/sea' , board: 'env' },
    { key: 'struct',   label: '结构安全预警', first: '/struct/alarm' , board: 'struct' },
    { key: 'ai',       label: '智能管控', first: '/ai/feed' , board: 'ai' },
    /* 🔴 2026-10-15 队长删：拆掉「跨板块」（老师第 3 条）。告警/处置已挪进「管理」，
       追溯查询删除，参数配置拆解。侧边菜单里的 MENU 也同步删了那一组。 */
    /* 管理板块 —— 养殖生产视角（场长用）。
       放在最后：它是配置类不是监控类。 */
    { key: 'mgmt',     label: '生产管理', first: '/mgmt/cages' }
  ];

  const App = {
    data: function () {
      /* tick：给 boardDots 建立响应式依赖用。
         ⚠️ 这是项目里踩过好几次的坑 —— API.alarms() 返回的是**普通数组**，
            「没有响应式依赖的 computed」会被 Vue **永久缓存**：红点第一次算完
            就再也不更新，告警解除了点也不会灭。
         所以这里订阅 API 变化 → tick 自增 → boardDots 里读一下 this.tick 逼它重算。 */
      /* 🔴 2026-10-18 合并李志成 PR #9 时手工解冲突。
         他那边 App.data 里加了 currentCage / showCage（给侧边栏那个 picker 用的），
         我们这版用的是 window.CurrentCage 单例 + 顶栏切换器。
         **取舍：状态源统一走 CurrentCage**（他的 30 个提交靠兼容层照常跑），
         所以他的 currentCage / showCage 两个字段不要了。 */
      return { path: '/overview', menu: MENU, tabs: TABS, err: null, tick: 0,
               /* 当前网箱（跟随全局单例；页面里改动都走 pickCage） */
               curCageId: CurrentCage.get() };
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

      /* 顶栏网箱切换器的数据源 */
      cageList: function () {
        this.tick;                       /* 跟着数据变（farm 是异步拉的） */
        return CurrentCage.cages();
      },
      curCageSite: function () {
        this.tick;
        const list = CurrentCage.cages();
        for (let i = 0; i < list.length; i++) {
          if (list[i].cage_id === this.curCageId) return list[i].site_name || '';
        }
        return '';
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
        /* 🔴 2026-10-18 队长修：这张表原来写的是**旧分组名**（平台/鱼类/环境/结构安全/智能/管理），
           而 10-16 会上定把一级菜单改名成（总览/鱼类监测/环境监测/结构安全预警/智能管控/生产管理），
           MENU 里的 group 也跟着改了 —— 这张表没跟上，导致 `g.group === want` 永远不成立，
           **侧边栏整块变空，所有小页面都进不去了**。
           以后改一级菜单名，**必须同时改这里**（这两处是同一个名字的两个副本）。 */
        const want = { overview: '总览', fish: '鱼类监测', env: '环境监测',
                       struct: '结构安全预警', ai: '智能管控',
                       mgmt: '生产管理' }[k];
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
      /* 切网箱 —— 走全局单例，切完所有页面自动重算 */
      pickCage: function (id) {
        this.curCageId = id;
        CurrentCage.set(id);
      },
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
        ? window.API.subscribe(function () { self.tick++; self.curCageId = CurrentCage.get(); })
        : null;
      this.cageUnsub = CurrentCage.subscribe(function (id) { self.curCageId = id; });
      Router.start();
      window.addEventListener('error', function (e) { self.err = e.message; });
    },
    beforeUnmount: function () {
      if (this.unsub) this.unsub();
      if (this.cageUnsub) this.cageUnsub();
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
      '    <!-- 全局「当前网箱」切换器（2026-10-16 会上定 第 10 条）：',
      '         切一次所有页面跟着变。放在顶栏是为了任何页面都能切。',
      '         右边显示该网箱所在海域，让人知道"这个网箱在哪片海"。 -->',
      '    <div class="cage-switch" v-if="cageList.length">',
      '      <span class="cs-label">当前网箱</span>',
      '      <button v-for="c in cageList" :key="c.cage_id"',
      '              :class="{ active: c.cage_id === curCageId }"',
      '              @click="pickCage(c.cage_id)">{{ c.cage_name }}</button>',
      '      <span class="cs-site" v-if="curCageSite">{{ curCageSite }}</span>',
      '    </div>',
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
      '  <div class="project-signature" aria-label="中国海洋大学水产学院 · 世界小中海大队">',
      '    <img class="signature-university" src="assets/ouc-emblem.png" alt="中国海洋大学校徽" />',
      '    <img class="signature-college" src="assets/ouc-fisheries-official-mark.png" alt="中国海洋大学水产学院官方组合标" />',
      '    <span>世界小中海大队</span>',
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
  /* 网箱三维模型（桁架式，可拖动旋转）—— 首页横幅下层左 */
  app.component('cage-model', C.CageModel);
  app.mount('#app');

  window.ROUTER = Router;
})();
