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

  /* ============================================================
     枚举中文标签（通用规范 第五节）
     ============================================================
     为什么集中放一处：枚举的中文说法在规范里定死了，界面**必须**显示中文。
     每页各写一份映射，迟早有人写歪（实测就漏了 5 处：设备状态、设备类型、
     预警类型、预警状态、处置状态直接把 tension / standby / pending 甩到界面上，
     而旁边的「预警等级」却显示中文 —— 自相矛盾）。

     用法：模板里写 {{ CN.deviceState(d.device_state) }}
     （已在 app.js 挂到 globalProperties，模板才够得着）
     ============================================================ */
  global.CN = {
    deviceState: function (v) {
      return { online: '在线', offline: '离线', running: '运行中', standby: '待机', fault: '故障' }[v] || v;
    },
    deviceType: function (v) {
      return { feeder: '投喂设备', light: '补光灯具', sensor: '传感器' }[v] || v;
    },
    commandType: function (v) { return { feed: '投喂', light: '补光' }[v] || v; },
    commandStatus: function (v) {
      return { created: '已创建', sent: '已发出', acknowledged: '已收到回执', success: '成功',
               timeout: '超时', retrying: '重试中', failed: '失败', escalated: '升级报警' }[v] || v;
    },
    taskStatus: function (v) {
      return { pending: '待执行', running: '正在执行', done: '已完成',
               paused: '已暂停', cancelled: '已取消', failed: '任务失败' }[v] || v;
    },
    riskLevel: function (v) {
      return { blue: '蓝色', yellow: '黄色', orange: '橙色', red: '红色' }[v] || v;
    },
    alarmType: function (v) {
      return { tension: '锚泊张力', tilt: '网箱倾斜', net_damage: '网衣破损',
               deformation: '结构形变', low_battery: '低电量', power_supply: '供电异常' }[v] || v;
    },
    alarmStatus: function (v) {
      return { active: '活跃', acknowledged: '已确认', recovered: '已恢复' }[v] || v;
    },
    handleStatus: function (v) {
      return { pending: '待处置', handling: '处置中', handled: '已处置', failed: '处置失败' }[v] || v;
    },
    confirmStatus: function (v) { return { unconfirmed: '未确认', confirmed: '已确认' }[v] || v; },
    quality: function (v) {
      return { good: '良好', stale: '超时未更新', suspect: '疑似异常' }[v] || v;
    },
    triggerBy: function (v) { return { auto: '自动', manual: '手动' }[v] || v; },
    feedingIntensity: function (v) {
      return { none: '无', weak: '弱', mid: '中', strong: '强' }[v] || v;
    }
  };

  /* ---------- 让 ECharts 跟着容器尺寸走 ----------
     ⚠️ 没有这个，图表会冻在「首次渲染那一刻」的宽度上。
        实测：视口 1920 时卡片宽 1688px，而图还是 1018px ——
        在答辩用的大屏上右边会空出一大片，很难看。
        ECharts 不会自己监听尺寸变化，必须显式 resize。

     用 ResizeObserver 监听容器（窗口变化、侧栏伸缩都能覆盖），
     再挂一个 window.resize 兜底（老浏览器没有 ResizeObserver）。 */
  function attachAutoResize(vm) {
    const el = vm.$refs.canvas;
    if (!el) return null;

    let raf = 0;
    const doResize = function () {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        raf = 0;
        if (vm.alive && vm.chart && !vm.chart.isDisposed()) vm.chart.resize();
      });
    };

    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(doResize);
      ro.observe(el);
    }
    window.addEventListener('resize', doResize);

    return function () {
      if (raf) cancelAnimationFrame(raf);
      if (ro) { ro.disconnect(); ro = null; }
      window.removeEventListener('resize', doResize);
    };
  }

  /* 🔴 2026-10-15 队长删：老师意见第 6 条「全平台删除来源字样 + 数据质量标记」。
     这里原来是 C.SourceTag（仿真数据 / 公开数据 … 的小徽标），整块删除。
     ⚠️ 注意区分：删的是**来源徽标**；`quality`（离线/可疑的状态标记）与
        `ts`（观测时间）都保留 —— 验收第 4 条仍守「离线给 null、显示设备离线」。 */

  /* ---------- 3.1 数值卡 StatCard ----------
     状态：① 正常 ② 缺失（— + 设备离线）③ 可疑（黄）④ 过期（灰 + 最后更新）
     digits：小数位。默认 1 位 —— 通用规范 第十节规定
             温度/溶氧/盐度/pH/浪高/风速/张力/倾角/重量 都是 1 位小数。
             计数类（尾数、条数）传 :digits="0"；字符串值不受影响。 */
  C.StatCard = {
    props: {
      name: String, value: [Number, String], unit: { type: String, default: '' },
      quality: { type: String, default: 'good' },   // good | stale | suspect
      ts: { type: Number, default: 0 },
      field: { type: String, default: '' },         // 完整字段名，悬停显示
      digits: { type: Number, default: 1 },         // null = 原样显示
      /* 值为空时脚注写什么。默认「设备离线」；
         如果是因为**数据源不提供这一项**，调用方传「数据源不提供」。 */
      note: { type: String, default: '' }
    },
    computed: {
      missing: function () { return this.value === null || this.value === undefined || this.value === ''; },
      cls: function () {
        if (this.missing) return 'is-missing';
        if (this.quality === 'stale') return 'is-stale';
        if (this.quality === 'suspect') return 'is-suspect';
        return '';
      },
      shown: function () {
        if (this.missing) return '—';
        if (typeof this.value !== 'number' || this.digits === null || this.digits === undefined) return this.value;
        return this.value.toFixed(this.digits);
      },
      tip: function () {
        const t = this.ts ? new Date(this.ts).toLocaleTimeString('zh-CN', { hour12: false }) : '—';
        return '字段：' + (this.field || '（未标注）') + '\n更新时间：' + t +
               '\n来源标注已按老师意见删除';
      },
      foot: function () {
        if (this.missing) {
          /* ⚠️ missing 有两种原因，**不能都写「设备离线」**：
               · 设备离线 / 无数据 —— 默认就是这个
               · 数据源压根不提供这一项 —— 由调用方用 note 传进来
             2026-10-15 踩到：中国近海台站不测「海水流速」，卡片却显示
             「设备离线」，等于把一个"数据源没有"的事说成了"设备坏了"。 */
          return this.note || '设备离线';
        }
        if (this.quality === 'stale') return '最后更新 ' + new Date(this.ts).toLocaleTimeString('zh-CN', { hour12: false });
        if (this.quality === 'suspect') return '疑似异常';
        return '';
      }
    },
    template:
      '<div class="stat" :class="cls" :title="tip">' +
      '  <div class="name"><span>{{ name }}</span></div>' +
      '  <div class="val"><span>{{ shown }}</span><span class="unit" v-if="!missing && unit">{{ unit }}</span></div>' +
      '  <div class="foot">{{ foot }}</div>' +
      '</div>'
  };

  /* ---------- 阈值表（从「参数配置」整页拆出来，2026-10-15 队长做） ----------
     老师意见 2026-10-09 第 3 条：「参数配置整页拆解（阈值配置按 owner 拆回各板块）」。
     所以阈值数据集中放在这里（**单一事实来源**），各板块用
     <threshold-table owner="环境" /> 只显示自己那几条 —— 避免四个人各抄一份抄歪。
     每条都带「依据」，页面上显示为数值旁的灰色问号，悬停可看。 */
  C.THRESHOLDS = [
          { field: 'tension_pct', name: '锚泊张力占设计值', warn: 80, alarm: 95, unit: '%', owner: '结构安全',
            basis: {
              level: '间接支持',
              text: '标准给的是【设计安全系数】，不是运营预警线，两者层次不同。本平台定义 张力利用率 R = T_max / T_design，其中 T_design = PB / F，F 按 CCS《海上单点系泊装置入级规范》(2021) 表4.4.4.3「完整自存工况·动力分析法」取 1.67，即 T_design = 60% PB。据此 R=80% 对应 48% PB、R=95% 对应 57% PB，均低于 60% PB 的许用上限，逻辑自洽。另：CCS《海上渔业养殖设施检验指南》4.4.1.2 明确「定位系泊系统在业主/设计者规定的作业限制和程序的基础上考虑入级」—— 运营限值由业主定义是有规范依据的。',
              source: 'CCS《海上单点系泊装置入级规范》(2021) 表4.4.4.3；CCS《海上渔业养殖设施检验指南》(初稿2023) 4.4.1.2；王斌等. 养殖网箱锚泊系统结构设计与性能分析研究进展. 上海海洋大学学报, 2025, 34(1):176-187 (表4 给出极限张力 50/60/70/80 %MBS)',
              url: 'https://www.ccs.org.cn/ccswz//file/download?fileid=202310130967039404'
            } },
          { field: 'tilt_pitch', name: '网箱俯仰角', warn: 5, alarm: 15, unit: '°', owner: '结构安全',
            basis: {
              level: '间接支持',
              text: '⚠️ 原用 2°/3°，查不到任何标准或文献出处，而且量级偏小 —— 波浪作用下网箱常态横摇就可能超过 2°，会持续误报，现场一定会把告警关掉（"狼来了"）。2026-10-06 改为 5°/15°：① 15° 有规范出处 —— CCS《海上渔业养殖设施检验指南》(初稿2023) 3.2.1.7 完整稳性衡准「复原力臂从正浮至 15 度内，应均为正值」；② 5° 为自设提示线，取在常态横摇之上、稳性衡准角之下的合理位置，可现场标定。中间 10° 可作为「关注」档（平台目前只有两档）。参考：可查到的网箱角度量级是 15°/45°/90°（渔业现代化 2023,50(6):33-40 的控制系统效果分档）。',
              source: 'CCS《海上渔业养殖设施检验指南》(初稿2023) 3.2.1.7（15° 稳性衡准角，官方 PDF）；《沉浮式养殖网箱自动化控制与管理系统研究》渔业现代化 2023,50(6):33-40（15/45/90° 分档）；5° 为自设，待现场标定',
              url: 'https://www.ccs.org.cn/ccswz/file/download?fileid=202305310555635104'
            } },
          { field: 'tilt_roll', name: '网箱横滚角', warn: 5, alarm: 15, unit: '°', owner: '结构安全',
            basis: {
              level: '间接支持',
              text: '同俯仰角 —— 横滚与俯仰共用同一组阈值（同一个完整稳性衡准，不区分横滚与俯仰）。见俯仰角那一条的说明。',
              source: '同俯仰角',
              url: 'https://www.ccs.org.cn/ccswz/file/download?fileid=202305310555635104'
            } },
          { field: 'battery_soc', name: '储能电量', warn: 20, alarm: 10, unit: '%', owner: '管理',
            basis: {
              level: '间接支持',
              text: '红色线 <10% 有据：① JFPA 0007—2021《电化学储能电站消防安全评估》附录示例中，镇江新坝储能电站的 SOC 下限阈值就取 10%；② 阳光电源储能 EMS 用户手册明确写「It is advised to define the discharge cut-off SOC higher than 10% to prevent the battery from harm caused by over-discharge」。黄色线 <20% 没找到出处 —— 更站得住的做法是按【剩余续航时间】定义（如「低于可支撑 2 小时关键负荷的 SOC」），这是可解释、可现场标定的自设值。',
              source: 'JFPA 0007—2021《电化学储能电站消防安全评估》（江苏省消防协会团体标准）附录；阳光电源 Sungrow 储能 EMS 用户手册',
              url: 'https://www.ttbz.org.cn/upload/file/20211231/6377655856356791481341645.pdf'
            } },
          { field: 'water_temp', name: '水温上限（按鱼种）', warn: 25.5, alarm: 28.0, unit: '℃', owner: '环境',
            basis: {
              level: '官方/标准',
              text: '🔴 原用统一阈值 20.5/21.5℃ —— 这是错的：大黄鱼「最适生长水温为 18～25℃」，20.5℃ 正落在最适区间中间，拿它当上限告警，等于鱼长得最好的时候平台一直报警；对大菱鲆（最适 15~18℃）更是常年误报。现已改为**按网箱养殖鱼种取值**，数据见 data/鱼种温度参数.json（30 个种，22 个给出告警线）。当前站点主养大黄鱼，取高提示 25.5℃ / 高告警 28.0℃（最适上限 25℃ 外推 0.5℃，告警线在 30℃ 摄食明显下降点前留 2℃ 余量）。各鱼种差异极大：大菱鲆 22.0℃、虹鳟 22.0℃、罗非鱼 36.0℃ —— 统一的阈值在物理上不可能对。',
              source: '《温岭市坞根镇养殖片区整体海域使用论证报告表》p.44（引 DB3303/T 019—2020《大黄鱼生态养殖技术规范》）—— 原文「大黄鱼对水温的适应范围为 10～32℃，最适生长水温为 18～25℃…而当温度上升到 30℃ 时又明显下降」',
              url: ''
            } },
          { field: 'dissolved_oxygen', name: '溶解氧下限', warn: 5.0, alarm: 4.0, unit: 'mg/L', owner: '环境',
            basis: {
              level: '直接支持',
              text: '六项里证据最强。① GB 11607—1989《渔业水质标准》表1：「溶解氧 连续24h中，16h以上必须大于5，其余任何时候不得低于3」——直接支持 5.0 提示线；② GB 3097—1997《海水水质标准》表1 序号9：第二类（适用于水产养殖区）溶解氧 >5 mg/L——跌破即不再满足养殖区水质；③ 大黄鱼「对溶解氧的要求较高，一般在 4mg/L 以上，幼鱼的溶解氧临界值为 3mg/L 左右」——直接支持 4.0 告警线，并提示可再加一档 <3.0 紧急。注意措辞：GB 3097 的 5 mg/L 是【水质类别标准值】，不是告警阈值，引用时写「参照…设定」。',
              source: 'GB 11607—1989《渔业水质标准》表1 序号5；GB 3097—1997《海水水质标准》表1 序号9；浙江省温岭市养殖水域滩涂规划 1.4.3.2.5（大黄鱼）',
              url: 'http://www.scsio.ac.cn/gczx/xzzx_197139/xgxyjszlk/hp/202309/P020230921577460708530.pdf'
            } }
  ];

  C.ThresholdTable = {
    props: { owner: { type: String, required: true } },
    computed: {
      rows: function () {
        const o = this.owner;
        return C.THRESHOLDS.filter(function (t) { return t.owner === o; });
      }
    },
    template:
      '<div class="card">' +
      '  <div class="card-title">阈值配置（{{ owner }}）</div>' +
      '  <div v-if="!rows.length" class="todo">本板块暂无阈值</div>' +
      '  <div v-else class="dt-wrap">' +
      '    <table class="dt">' +
      '      <thead><tr><th>字段</th><th>含义</th><th>黄色阈值</th><th>红色阈值</th><th>单位</th><th>依据</th></tr></thead>' +
      '      <tbody>' +
      '        <tr v-for="t in rows" :key="t.field">' +
      '          <td class="mono">{{ t.field }}</td>' +
      '          <td>{{ t.name }}</td>' +
      '          <td>{{ t.warn }}</td>' +
      '          <td>{{ t.alarm }}</td>' +
      '          <td>{{ t.unit }}</td>' +
      '          <td><help-dot :info="t.why" :label="\'阈值依据\'" /></td>' +
      '        </tr>' +
      '      </tbody>' +
      '    </table>' +
      '  </div>' +
      '  <div class="hint" style="margin-top:10px">' +
      '    这些阈值一律是 <b>「经验阈值，未经现场标定」</b>，出处为「参考文献区间 + 经验设定」。' +
      '    阈值归各板块自己管 —— 原来集中在「参数配置」一页，老师要求按 owner 拆回来。' +
      '  </div>' +
      '</div>'
  };

  /* ---------- 视频位 VideoSlot（老师意见 2026-10-09 第 9 条）----------
     老师原话：「鱼类、水质、结构各加一个放视频的接口（真实养殖环境视频）」，
     三块**门面页**各加**常驻播放区**；素材**只用开放许可**的并**标出处**。

     方案 C（队长 2026-10-15 拍板）：短视频 + 静态托管
       · 单条 < 3 MB、三段合计 < 6 MB（实际 4.12 MB）
       · 文件放 frontend/vendor/video/，**随包走** —— 断网也能演示
       · 静音自动循环，演示时不需要人点

     ⚠️ **必须标出处** —— 会议纪要第 3 条：承诺书写明「不侵犯任何第三方著作权」，
        所以「全平台删除来源字样」**只对视频开例外**，视频的许可/作者/来源必须留在页面上。
        这一块**不要**跟着删来源标签一起删。

     做成公共组件而不是三份拷贝：这个项目已经反复吃过
     「四个人各写一份、抄歪了」的亏（来源标签、阈值表都是）。 */
  C.VideoSlot = {
    props: {
      /* 🔴 file **可选** —— 空着就渲染「待接入」占位区（2026-10-15 用户要求：
         先把接口留出来，素材找好再填）。填的时候把文件丢进
         frontend/vendor/video/，这里写文件名即可，**不用改结构**。 */
      file:    { type: String, default: '' },
      title:   { type: String, default: '现场视频' },
      desc:    { type: String, default: '' },
      license: { type: String, default: '' },   /* 许可，如 Public domain（素材定了再填） */
      author:  { type: String, default: '' },   /* 作者 / 机构（素材定了再填） */
      source:  { type: String, default: '' }    /* 来源页 URL（素材定了再填） */
    },
    computed: {
      src: function () { return 'vendor/video/' + this.file; },
      hasVideo: function () { return !!this.file; }
    },
    mounted: function () {
      /* 🔴 必须在这里手动 muted + play() —— 这是 Vue 的一个坑：
         模板里写 muted 属性**不可靠**。Vue 是「先创建元素、再设属性」，
         而浏览器的自动播放判定发生在元素创建的那一刻 —— 那一刻还没静音，
         于是 autoplay 被策略拦掉，视频停在第一帧不动。
         实测：只写 muted 属性时 paused=true；在这里显式设 muted 并 play() 才行。 */
      const v = this.$refs.v;
      if (!v) return;
      v.muted = true;
      const go = function () {
        const pr = v.play();
        if (pr && pr.catch) pr.catch(function () { /* 策略仍拦就让它停在首帧，不报错 */ });
      };
      go();
      v.addEventListener('loadeddata', go);   /* 有些浏览器要等数据到了才让播 */
    },
    template:
      '<div class="card">' +
      '  <div class="card-title">{{ title }}</div>' +
      '  <div class="small muted" v-if="desc" style="margin:-4px 0 8px">{{ desc }}</div>' +
      '  <video v-if="hasVideo" ref="v" class="vslot" :src="src" autoplay muted loop playsinline' +
      '         preload="metadata"></video>' +
      '  <!-- 素材还没接入时显示占位区，而不是破图/黑框 -->' +
      '  <div v-else class="vslot-empty">' +
      '    <div class="vslot-empty-icon">▶</div>' +
      '    <div><b>视频位已预留，素材待接入</b></div>' +
      '    <div class="small muted" style="margin-top:6px;line-height:1.7">' +
      '      把视频文件放进 <code>frontend/vendor/video/</code>，<br>' +
      '      再在本页给 <code>&lt;video-slot&gt;</code> 填上 ' +
      '      <code>file</code> / <code>license</code> / <code>author</code> / <code>source</code> 四个参数即可。' +
      '    </div>' +
      '    <div class="small muted" style="margin-top:6px">' +
      '      要求：单条 &lt; 3 MB、合计 &lt; 6 MB、mp4 或 webm、**只用开放许可素材**。' +
      '    </div>' +
      '  </div>' +
      '  <div v-if="hasVideo" class="vslot-credit">' +
      '    <b>素材出处</b>（承诺书要求标注，此处不适用「全平台删来源字样」）：' +
      '    许可 <b>{{ license }}</b> ｜ 作者 {{ author }} ｜' +
      '    <a :href="source" target="_blank" rel="noopener">来源页</a>' +
      '  </div>' +
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
    mounted: function () {
      this.alive = true;
      this.render();
      this._detach = attachAutoResize(this);
    },
    beforeUnmount: function () {
      /* 卸载时把图表彻底收干净。
         曾经的做法是用 v-show 控制画布显隐 —— 容器在 display:none 下宽高为 0，
         ECharts 会以 0×0 初始化，之后在 Vue 触发的重绘里抛
         "Cannot read properties of undefined (reading 'type')"。
         现在画布始终渲染（不显隐），空数据用 graphic 文字表达。 */
      this.alive = false;
      if (this._detach) { this._detach(); this._detach = null; }
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
        /* 双 Y 轴：序列上标 axis: 1 就走右轴。
           为什么必须支持：把「锚泊张力（0–100%）」和「俯仰角（0–3°）」画在同一个 Y 轴上，
           俯仰角会被压成贴底的一条直线，等于没画。骨架规范模板 A 也写明可用双 Y 轴。 */
        const needAxis2 = this.series.some(function (s) { return s.axis === 1; });

        const series = this.series.map(function (s, i) {
          const color = palette[i % palette.length];
          return {
            name: s.name + (s.unit ? '（' + s.unit + '）' : ''),
            type: 'line',
            yAxisIndex: (needAxis2 && s.axis === 1) ? 1 : 0,
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
          yAxis: needAxis2
            ? [
                { type: 'value', scale: true, axisLabel: { fontSize: 11 },
                  splitLine: { lineStyle: { color: '#EEF2F6' } } },
                { type: 'value', scale: true, position: 'right', axisLabel: { fontSize: 11 },
                  splitLine: { show: false } }
              ]
            : { type: 'value', scale: true, axisLabel: { fontSize: 11 },
                splitLine: { lineStyle: { color: '#EEF2F6' } } },
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
    mounted: function () {
      this.alive = true;
      this.render();
      this._detach = attachAutoResize(this);
    },
    beforeUnmount: function () {
      this.alive = false;
      if (this._detach) { this._detach(); this._detach = null; }
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
    props: { title: String, desc: { type: String, default: '' }, source: { type: String, default: 'simulated' } },
    template:
      '<div class="row" style="justify-content:space-between;align-items:flex-end;margin-bottom:12px">' +
      '  <div>' +
      '    <div style="font-size:18px;font-weight:700">{{ title }}</div>' +
      '    <div class="small muted" v-if="desc" v-html="desc"></div>' +
      '  </div>' +
      '</div>'
  };

  /* ============================================================
     阈值依据提示：数值旁边一个灰色问号，悬停显示解释与出处
     ============================================================
     为什么不用纯 CSS 的 :hover 弹层：
       阈值都放在表格里，而表格容器是 overflow:auto 的 ——
       CSS 绝对定位的弹层会被容器**裁掉**，鼠标一移过去就没了。
     所以弹层用 position:fixed（teleport 到 body）由 JS 按问号位置定位，能逃出任何 overflow。

     为什么必须做这个：
       任务书要求逐项说明「阈值从哪来（标准？文献？自己设的？）」。
       以前页面上只有一行小字「经验阈值，未经现场标定」，
       答辩时评委问「凭什么定 3°」答不出细节。现在悬停就能看到每一条的依据。
     ============================================================ */
  C.HelpDot = {
    name: 'help-dot',
    props: {
      /* { level, text, source, url } —— level 取值见下面 lvStyle */
      info: { type: Object, default: null },
      label: { type: String, default: '阈值依据' }
    },
    data: function () { return { open: false, top: 0, left: 0, placement: 'top' }; },
    beforeUnmount: function () { if (this._t) clearTimeout(this._t); },
    computed: {
      lv: function () { return (this.info && this.info.level) || '未标注'; },
      /* 证据强度配色：越硬越绿，找不到越红 —— 一眼看出哪几项底气不足 */
      lvStyle: function () {
        const m = {
          '直接支持': { bg: '#F0FDF4', br: '#86EFAC', fg: '#166534' },
          '间接支持': { bg: '#EFF6FF', br: '#BFDBFE', fg: '#1D4ED8' },
          '仅类比':   { bg: '#FFFBEB', br: '#FDE68A', fg: '#92400E' },
          '没找到':   { bg: '#FEF2F2', br: '#FECACA', fg: '#991B1B' }
        };
        return m[this.lv] || { bg: '#F3F4F6', br: '#E5E7EB', fg: '#6B7280' };
      }
    },
    methods: {
      show: function (e) {
        if (this._t) { clearTimeout(this._t); this._t = null; }
        if (!this.info) return;
        const r = e.currentTarget.getBoundingClientRect();
        const W = 380;
        this.left = Math.max(8, Math.min(r.left - W / 2 + 8, window.innerWidth - W - 8));
        this.top = r.top - 10;
        this.placement = r.top < 280 ? 'bottom' : 'top';
        this.open = true;
      },
      /* 延迟关闭：弹层被 teleport 到 body，不在 .hd-wrap 里，
         鼠标从问号移到弹层上会触发 mouseleave。给 260ms 宽限，
         期间移到弹层上就被 cancelHide 取消 —— 否则里面的链接根本点不到。 */
      hide: function () {
        const self = this;
        if (this._t) clearTimeout(this._t);
        this._t = setTimeout(function () { self.open = false; self._t = null; }, 260);
      },
      cancelHide: function () {
        if (this._t) { clearTimeout(this._t); this._t = null; }
      }
    },
    template: [
      '<span class="hd-wrap" @mouseenter="show" @mouseleave="hide" @focusin="show" @focusout="hide" tabindex="0">',
      '  <span class="hd-dot" :class="{ \'hd-open\': open }">?</span>',
      '  <teleport to="body">',
      '    <div v-if="open" class="hd-pop"',
      '         :class="placement === \'top\' ? \'hd-pop-top\' : \'hd-pop-bottom\'"',
      '         :style="{ top: top + \'px\', left: left + \'px\' }"',
      '         @mouseenter="cancelHide" @mouseleave="hide">',
      '      <div class="hd-head">',
      '        <span class="hd-badge"',
      '              :style="{ background: lvStyle.bg, borderColor: lvStyle.br, color: lvStyle.fg }">',
      '          证据强度：{{ lv }}',
      '        </span>',
      '        <span class="hd-title">{{ label }}</span>',
      '      </div>',
      '      <div v-if="info.text" class="hd-text">{{ info.text }}</div>',
      '      <div v-if="info.source" class="hd-src"><b>出处</b>：{{ info.source }}</div>',
      '      <div v-if="info.url" class="hd-src">',
      '        <a :href="info.url" target="_blank" rel="noopener">{{ info.url }} ↗</a>',
      '      </div>',
      '      <div v-if="!info.text && !info.source" class="hd-text muted">',
      '        这一项还没有找到依据 —— 页面上标注为「经验阈值，未经现场标定」。',
      '      </div>',
      '    </div>',
      '  </teleport>',
      '</span>'
    ].join('\n')
  };

  global.C = C;
})(window);
