/* ============================================================
   pages/fish.js —— 鱼类板块
   ============================================================
   负责人：王浩然

   【这个文件归谁】
     归上面写的那个人（以及他的 AI）。**别人不要改这个文件。**

   【怎么加页面】
     照抄本文件里已有页面的结构，往 PAGES 上注册一个新路由就行：
         PAGES['/fish/xxx'] = { data: ..., computed: ..., methods: ..., template: [...] };

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

  /* 本板块专用的 GET/POST（共享 API 模块没有导出通用 get/post，按"只改本板块文件"的规矩在这里就地实现）。
     走后端托管时 __API_BASE__ 为空字符串；无后端时调用失败，由调用方显示「—」。 */
  function fishGet(path, params) {
    let q = '';
    if (params) {
      q = '?' + Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }).join('&');
    }
    return fetch((global.__API_BASE__ || '') + path + q).then(function (r) { return r.json(); });
  }
  function fishPost(path, body) {
    return fetch((global.__API_BASE__ || '') + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json(); });
  }

  PAGES['/fish/monitor'] = {
    data: function () {
      return {
        minutes: 60, series: [],
        cameras: [], camOffline: false, selectedCam: 0, cameraGrid: false,
        camRaf: null, camPoll: null, tileState: null
      };
    },
    computed: {
      last: function () { return this.series.length ? this.series[this.series.length - 1] : {}; },
      charts: function () {
        return [
          { name: '现存尾数', unit: '尾', data: this.series.map(function (r) { return [r.ts, r.fish_count]; }) },
          { name: '平均体重', unit: 'g', axis: 1, data: this.series.map(function (r) { return [r.ts, r.avg_weight_g]; }) }
        ];
      },
      biomassCharts: function () {
        return [{ name: '预估总体重', unit: 'kg', data: this.series.map(function (r) { return [r.ts, r.total_biomass_kg]; }) }];
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
      time: function (ts) { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); },
      loadCams: function () {
        const self = this;
        fishGet('/api/fish/cameras').then(function (d) {
          self.cameras = (d && d.cameras) || [];
          self.camOffline = !!(d && d.offline);
        }).catch(function () { self.cameras = []; self.camOffline = true; });
      },
      /* 四路仿真画面：每路 canvas 按角度画不同场景，让"多角度"名副其实。
         后期接入真实视频时，把对应 canvas 换成 <video :src="c.stream_url"> 即可。 */
      startTiles: function () {
        const self = this;
        const mk = function (n, r) {
          const a = [];
          for (let i = 0; i < n; i++) {
            a.push({ x: r(), y: r(), vx: (Math.random() - 0.5) * 0.5,
                     vy: (Math.random() - 0.5) * 0.4, s: 1 + Math.random() * 2.4 });
          }
          return a;
        };
        const R = function () { return 0.1 + Math.random() * 0.8; };
        this.tileState = {
          top: mk(42, R), side: mk(28, R), under: mk(22, R), pan: mk(46, R),
          bubbles: mk(18, R), t: 0
        };
        const draw = function () {
          const canvases = self.$refs.camCanvas;
          if (canvases && canvases.length) {
            const st = self.tileState;
            st.t += 0.02;
            for (let idx = 0; idx < canvases.length; idx++) {
              const cv = canvases[idx];
              const cam = self.cameras[idx];
              if (!cam) continue;
              const ctx = cv.getContext('2d');
              const w = cv.width, h = cv.height;
              const g = ctx.createLinearGradient(0, 0, 0, h);
              g.addColorStop(0, '#0a1b30'); g.addColorStop(1, '#07101e');
              ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
              const dot = function (p) {
                p.x += p.vx * 0.003; p.y += p.vy * 0.003;
                if (p.x < 0.05 || p.x > 0.95) p.vx *= -1;
                if (p.y < 0.05 || p.y > 0.95) p.vy *= -1;
                ctx.beginPath();
                ctx.arc(p.x * w, p.y * h, p.s, 0, Math.PI * 2);
                ctx.fill();
              };
              ctx.fillStyle = 'rgba(140,190,255,.85)';
              if (cam.angle === '俯视') {
                st.top.forEach(dot);
              } else if (cam.angle === '侧视') {
                /* 水面线 + 鱼只在中下部 */
                ctx.strokeStyle = 'rgba(120,180,255,.35)';
                ctx.beginPath();
                ctx.moveTo(0, h * 0.22); ctx.lineTo(w, h * 0.22); ctx.stroke();
                st.side.forEach(function (p) {
                  if (p.y < 0.3) p.y = 0.3 + Math.random() * 0.5;
                  dot(p);
                });
              } else if (cam.angle === '水下') {
                /* 气泡上升 */
                ctx.fillStyle = 'rgba(160,210,255,.45)';
                st.bubbles.forEach(function (p) {
                  p.y -= 0.002;
                  if (p.y < 0.05) p.y = 0.95;
                  ctx.beginPath();
                  ctx.arc(p.x * w, p.y * h, p.s * 0.7, 0, Math.PI * 2);
                  ctx.fill();
                });
                ctx.fillStyle = 'rgba(170,210,255,.9)';
                st.under.forEach(dot);
              } else {
                /* 全景：四角取景框 + 小点 */
                ctx.strokeStyle = 'rgba(255,255,255,.25)';
                const L = 14;
                [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]]
                  .forEach(function (q) {
                    ctx.beginPath();
                    ctx.moveTo(q[0] + L * q[2], q[1]);
                    ctx.lineTo(q[0], q[1]);
                    ctx.lineTo(q[0], q[1] + L * q[3]);
                    ctx.stroke();
                  });
                st.pan.forEach(dot);
              }
            }
          }
          self.camRaf = requestAnimationFrame(draw);
        };
        draw();
      },
      stopTiles: function () {
        if (this.camRaf) { cancelAnimationFrame(this.camRaf); this.camRaf = null; }
        if (this.camPoll) { clearInterval(this.camPoll); this.camPoll = null; }
      }
    },
    mounted: function () {
      /* API.bind：数据变化重算 + 定时刷新曲线 */
      this.unsub = API.bind(this, this.load);
      this.load();
      const self = this;
      this.loadCams();
      this.$nextTick(function () { self.startTiles(); });
      this.camPoll = setInterval(function () { self.loadCams(); }, 5000);
    },
    beforeUnmount: function () {
      if (this.unsub) { this.unsub(); this.unsub = null; }
      this.stopTiles();
    },
    watch: { minutes: function () { this.load(); } },
    template: [
      '<div>',
      '  <page-head title="鱼类 · 鱼类监测总览"',
      '    desc="先看摄食状态与总体重，再查看多角度仿真画面和行为变化"',
      '    />',
      '',
      '  <div class="grid-stats">',
      '    <stat-card class="is-primary" name="鱼群摄食强度" :value="cn(last.feeding_intensity)" />',
      '    <stat-card class="is-primary" name="预估总体重" unit="kg" :value="last.total_biomass_kg" />',
      '    <stat-card name="现存总尾数" unit="尾" :value="last.fish_count" :digits="0" />',
      '    <stat-card name="平均体重" unit="g" :value="last.avg_weight_g" />',
      '  </div>',
      '',
      '  <div class="camera-layout">',
      '  <div class="card">',
      '    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px">',
      '      <div class="card-title" style="margin:0">网箱视角 · 仿真画面</div>',
      '      <button @click="cameraGrid = !cameraGrid">{{ cameraGrid ? \'主视角布局\' : \'四宫格布局\' }}</button>',
      '    </div>',
      '    <div class="grid-cam" :class="{ \'camera-focus\': !cameraGrid }">',
      '      <div v-for="(c, i) in cameras" :key="c.camera_id" class="cam-tile" :class="{ \'is-selected\': selectedCam === i }" role="button" tabindex="0" :aria-label="c.name + \'，切换主视角\'" :aria-pressed="selectedCam === i" @click="selectedCam = i" @keydown.enter="selectedCam = i" @keydown.space.prevent="selectedCam = i">',
      '        <canvas ref="camCanvas" width="340" height="190" class="cam-canvas"',
      '          :class="{ off: !c.online }"></canvas>',
      '        <div class="cam-top">',
      '          <span class="cam-name">{{ c.name }}</span>',
      '          <span class="cam-live" :class="{ off: !c.online }">',
      '            <i class="cam-dot"></i>{{ c.online ? \'仿真画面\' : \'已离线\' }}</span>',
      '        </div>',
      '        <div v-if="!c.online" class="cam-no">',
      '          <div class="cam-no-text">信号中断</div>',
      '          <div class="cam-no-sub">视觉链路不可用，不显示上一个画面</div>',
      '        </div>',
      '        <div class="cam-meta">',
      '          <span>{{ c.resolution }} · {{ c.fps }}fps</span>',
      '          <span>{{ c.online ? time(c.ts) : \'—\' }}</span>',
      '        </div>',
      '      </div>',
      '    </div>',
      '    <div v-if="camOffline" class="muted small" style="margin-top:8px">',
      '      视觉链路不可用（生成器已停止或摄像头离线）—— 全部画面显示「信号中断」，不显示上一个值。',
      '    </div>',
      '    <div class="hero-note">画面为角度仿真，点击缩略图切换主视角。</div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-title">摄食行为变化</div>',
      '    <event-list :items="events" empty-text="本时段摄食强度无变化" />',
      '    <div class="hero-note"><a href="#/ai/feed">查看投喂建议 →</a></div>',
      '    <div class="kv" style="margin-top:16px"><span class="k">平均体长</span><span>{{ last.avg_length_cm ?? \'—\' }} cm</span><span class="k">活动密度</span><span>{{ last.fish_density ?? \'—\' }} 尾/m³</span></div>',
      '  </div>',
      '  </div>',
      '  <div class="split" style="margin-top:16px">',
      '    <trend-chart title="数量与生长趋势（按单位分轴）" :series="charts" small />',
      '    <trend-chart title="预估总体重趋势" :series="biomassCharts" small />',
      '  </div>',
      '  <details class="secondary-details"><summary>观测与模型口径</summary>',
      '  <div class="hint" style="margin-top:12px">',
      '    <b>口径说明</b>：投喂量<b>不在这里算</b> —— 按裁定 1，投喂决策归智能板块，',
      '    鱼类只出观测类指标。鱼类不再提供 <code>suggest_feed_kg_h</code>。',
      '    生长参数用 <code>W = lw_a · L^lw_b</code>，公式参数 <code>lw_a</code> / <code>lw_b</code> 来源须标注公开文献。',
      '  </div>',
      '',
      '  </details>',
      '  <div class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <time-range v-model="minutes" />',
      '    <span style="flex:1"></span>',
      '    <span class="small muted">本期不做：FCR / 活跃度 / 体长离散度 / 死亡个体数（裁定 5）</span>',
      '  </div>',
      '</div>',
      '  <video-slot title="鱼类养殖现场" desc="奇努克鲑在养殖池中 —— 真实养殖环境" />'
    ].join('\n')
  };

  PAGES['/fish/heatmap'] = {
    data: function () {
      return {
        grid: [], picked: null, offline: false,
        view: '2d', offline3d: false, pointCount: 0, lastUpdate: '',
        three: null, scene3d: null, camera3d: null, renderer3d: null,
        points3d: null, curPos: null, tgtPos: null, curCol: null,
        raf: null, poll3d: null,
        theta: Math.PI * 0.25, phi: Math.PI * 0.38, radius: 17,
        dragging: false, lastX: 0, lastY: 0
      };
    },
    computed: {
      peak: function () {
        let best = { x: 0, y: 0, v: null }, sum = 0, n = 0;
        this.grid.forEach(function (row, y) {
          row.forEach(function (v, x) {
            if (v > best.v) best = { x: x, y: y, v: v };
            sum += v; n++;
          });
        });
        return { best: best, avg: n ? +(sum / n).toFixed(1) : null };
      }
    },
    methods: {
      load: function () {
        const self = this;
        fishGet('/api/heatmap').then(function (d) {
          self.grid = (d && d.grid) || [];
          self.offline = !!(d && d.offline);
        }).catch(function () { self.grid = []; self.offline = true; });
      },
      switchView: function (v) {
        if (v === this.view) return;
        this.view = v;
        const self = this;
        if (v === '3d') {
          this.destroy3d();
          this.$nextTick(function () {
            self.ensureThree(function () {
              self.init3d();
              self.fetch3d();
            });
          });
        }
      },
      /* three.js 只在切到 3D 时才加载，不改 index.html、不增加其他页面负担 */
      ensureThree: function (cb) {
        if (global.THREE) { cb(); return; }
        const s = document.createElement('script');
        s.src = (global.__API_BASE__ || '') + '/vendor/three.min.js';
        s.onload = function () { cb(); };
        s.onerror = function () { cb(); };
        document.head.appendChild(s);
      },
      init3d: function () {
        const THREE = global.THREE;
        const box = this.$refs.box3d;
        const w = Math.max(300, box.clientWidth), h = 480;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0b1626);
        const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        box.appendChild(renderer.domElement);

        /* 网箱边框 10×10×8（X/Y 平面，Z 为水深） */
        const center = new THREE.Vector3(5, 5, 4);
        const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(10, 10, 8));
        const cageLine = new THREE.LineSegments(
          edges, new THREE.LineBasicMaterial({ color: 0x4a7bb8 }));
        cageLine.position.copy(center);
        scene.add(cageLine);

        /* 底部网格线，帮助判断位置 */
        const grid = new THREE.GridHelper(10, 10, 0x27405f, 0x1a2c44);
        grid.rotation.x = Math.PI / 2;
        grid.position.set(5, 5, 0.02);
        scene.add(grid);

        /* 点云：固定 1000 个点，按数据条数设置 drawRange */
        const MAX = 1000;
        const geom = new THREE.BufferGeometry();
        const pos = new Float32Array(MAX * 3);
        const col = new Float32Array(MAX * 3);
        for (let i = 0; i < MAX; i++) { pos[i * 3] = 5; pos[i * 3 + 1] = 5; pos[i * 3 + 2] = 4; }
        geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const mat = new THREE.PointsMaterial({
          size: 0.16, vertexColors: true, transparent: true, opacity: 0.9,
          sizeAttenuation: true, depthWrite: false
        });
        const points = new THREE.Points(geom, mat);
        scene.add(points);

        this.scene3d = scene; this.camera3d = camera; this.renderer3d = renderer;
        this.points3d = points;
        this.curPos = pos; this.curCol = col;

        /* 拖拽旋转 / 滚轮缩放（自己实现，不依赖 OrbitControls） */
        const self = this;
        this._onDown = function (e) {
          self.dragging = true; self.lastX = e.clientX; self.lastY = e.clientY;
        };
        this._onMove = function (e) {
          if (!self.dragging) return;
          const dx = e.clientX - self.lastX, dy = e.clientY - self.lastY;
          self.lastX = e.clientX; self.lastY = e.clientY;
          self.theta -= dx * 0.008;
          self.phi -= dy * 0.008;
          self.phi = Math.max(0.12, Math.min(Math.PI - 0.12, self.phi));
        };
        this._onUp = function () { self.dragging = false; };
        this._onWheel = function (e) {
          e.preventDefault();
          self.radius *= (1 + e.deltaY * 0.0012);
          self.radius = Math.max(8, Math.min(40, self.radius));
        };
        renderer.domElement.addEventListener('mousedown', this._onDown);
        window.addEventListener('mousemove', this._onMove);
        window.addEventListener('mouseup', this._onUp);
        renderer.domElement.addEventListener('wheel', this._onWheel, { passive: false });

        const render = function () {
          /* 点位向目标平滑过渡（每帧走 8%），鱼群看起来是"游动"而非"跳变" */
          const tp = self.tgtPos;
          if (tp) {
            for (let i = 0; i < pos.length; i++) {
              pos[i] += (tp[i] - pos[i]) * 0.08;
            }
            geom.attributes.position.needsUpdate = true;
          }
          const c = new THREE.Vector3(
            center.x + self.radius * Math.sin(self.phi) * Math.sin(self.theta),
            center.y + self.radius * Math.cos(self.phi),
            center.z + self.radius * Math.sin(self.phi) * Math.cos(self.theta));
          camera.position.copy(c);
          camera.lookAt(center);
          renderer.render(scene, camera);
          self.raf = requestAnimationFrame(render);
        };
        render();
      },
      fetch3d: function () {
        const self = this;
        const one = function () {
          if (self.view !== '3d') return;
          fishGet('/api/fish/positions3d').then(function (d) {
            if (d.offline || !d.data) {
              self.offline3d = true; self.pointCount = 0;
              return;
            }
            self.offline3d = false;
            const pts = d.data.points;
            self.pointCount = pts.length;
            self.lastUpdate = new Date().toLocaleTimeString('zh-CN', { hour12: false });
            if (!self.tgtPos) {
              self.tgtPos = new Float32Array(1000 * 3);
            }
            const tp = self.tgtPos;
            const col = self.curCol;
            /* 颜色：0 正常=浅蓝、1 摄食活跃=暖橙、2 异常=红 */
            const CC = [[0.35, 0.75, 1.0], [1.0, 0.62, 0.22], [1.0, 0.28, 0.28]];
            for (let i = 0; i < 1000; i++) {
              if (i < pts.length) {
                const p = pts[i];
                tp[i * 3] = p.x; tp[i * 3 + 1] = p.y; tp[i * 3 + 2] = p.z;
                const cc = CC[p.s] || CC[0];
                col[i * 3] = cc[0]; col[i * 3 + 1] = cc[1]; col[i * 3 + 2] = cc[2];
              } else {
                /* 多余点收到中心，drawRange 不画它们 */
                tp[i * 3] = 5; tp[i * 3 + 1] = 5; tp[i * 3 + 2] = 4;
                col[i * 3] = 0; col[i * 3 + 1] = 0; col[i * 3 + 2] = 0;
              }
            }
            if (self.points3d) {
              self.points3d.geometry.setDrawRange(0, pts.length);
              self.points3d.geometry.attributes.color.needsUpdate = true;
            }
          }).catch(function () { self.offline3d = true; });
        };
        one();
        this.poll3d = setInterval(one, 3000); /* 每 3 秒更新一次 */
      },
      destroy3d: function () {
        if (this.poll3d) { clearInterval(this.poll3d); this.poll3d = null; }
        if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
        if (this.renderer3d) {
          this.renderer3d.domElement.removeEventListener('mousedown', this._onDown);
          window.removeEventListener('mousemove', this._onMove);
          window.removeEventListener('mouseup', this._onUp);
          this.renderer3d.domElement.removeEventListener('wheel', this._onWheel);
          this.renderer3d.dispose();
          if (this.renderer3d.domElement.parentNode) {
            this.renderer3d.domElement.parentNode.removeChild(this.renderer3d.domElement);
          }
        }
        this.scene3d = null; this.camera3d = null; this.renderer3d = null;
        this.points3d = null; this.tgtPos = null;
      }
    },
    mounted: function () {
      /* API.bind：数据变化重算 + 定时刷新曲线 */
      this.unsub = API.bind(this, this.load);
      this.load();
    },
    beforeUnmount: function () {
      if (this.unsub) { this.unsub(); this.unsub = null; }
      this.destroy3d();
    },
    template: [
      '<div>',
      '  <page-head title="鱼类 · 鱼群分布热力图"',
      '    desc="支持二维网格与三维点云切换：三维画面每隔 3 秒更新，鱼体简化为点，可拖拽旋转、滚轮缩放"',
      '    />',
      '',
      '  <div class="grid-stats">',
      '    <stat-card class="is-primary" name="最高密度网格" unit="尾/m³" :value="peak.best.v" />',
      '    <stat-card name="最高密度位置" unit="" :value="peak.best.v == null ? \'—\' : \'X\' + (peak.best.x + 1) + \' / Y\' + (peak.best.y + 1)" />',
      '    <stat-card name="网格平均密度" unit="尾/m³" :value="peak.avg" />',
      '  </div>',
      '',
      '  <div class="card" style="margin-top:12px">',
      '    <div class="row" style="gap:8px;align-items:center">',
      '      <div class="seg">',
      '        <button :class="{ primary: view === \'2d\' }" @click="switchView(\'2d\')">二维网格</button>',
      '        <button :class="{ primary: view === \'3d\' }" @click="switchView(\'3d\')">三维点云</button>',
      '      </div>',
      '      <span v-if="view === \'3d\' && !offline3d" class="small muted">',
      '        共 {{ pointCount }} 个点 · 每 3 秒更新 · 最近更新 {{ lastUpdate || \'—\' }}</span>',
      '      <span class="small muted" style="margin-left:auto">拖拽旋转 · 滚轮缩放</span>',
      '    </div>',
      '',
      '    <div v-if="offline" class="muted small" style="margin-top:10px">',
      '      视觉链路不可用（生成器已停止或摄像头离线）—— 密度数据显示「—」，不显示上一个值。',
      '    </div>',
      '    <div v-else-if="view === \'2d\'">',
      '      <heat-grid title="鱼群密度分布（颜色表示相对密度）" :grid="grid" unit="尾/m³" :height="430" />',
      '    </div>',
      '    <div v-else style="position:relative;margin-top:10px">',
      '      <div ref="box3d" style="width:100%;height:480px;border-radius:6px;overflow:hidden"></div>',
      '      <div v-if="offline3d" class="card" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(11,22,38,.82)">',
      '        <span class="muted">视觉链路不可用（生成器已停止或摄像头离线）—— 不显示上一个值</span>',
      '      </div>',
      '    </div>',
      '',
      '    <div class="hint small" style="margin-top:10px">',
      '      <b>两种视角的用途</b>：二维网格用于值班时<b>一眼看密度分布</b>；三维点云用于直观判断',
      '      <b>鱼群在水中的空间聚集</b>（例如上浮、扎堆）。二维红色表示相对高密度，不代表告警；三维点色按仿真场景标注。',
      '    </div>',
      '  </div>',
      '',
      '  <div class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <button @click="load">重新采样</button>',
      '    <span style="flex:1"></span>',
      '    <span class="small muted">三维点云每 3 秒从后端接口拉取一次，离线下显示「—」</span>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  PAGES['/fish/growth'] = {
    data: function () {
      return { tick: 0, unsub: null, cageId: '', farm: null, live: [], gChart: null };
    },
    computed: {
      cages: function () {
        this.tick;
        const f = this.farm;
        return (f && f.cages) || [];
      },
      cage: function () {
        const self = this;
        return this.cages.filter(function (c) { return c.cage_id === self.cageId; })[0] || null;
      },
      liveLast: function () {
        this.tick;
        return this.live.length ? this.live[this.live.length - 1] : null;
      },
      /* 生长模型结果：全部由台账真实配置 + 当前观测推导，不编数字 */
      m: function () {
        const c = this.cage;
        const DAY = 86400000;
        const out = { ok: false };
        if (!c || !c.stocking) return out;
        const st = c.stocking;
        let t0, t1, w0, wT;
        t0 = Date.parse(st.date);
        t1 = Date.parse(st.plan_harvest);
        w0 = +st.init_size_g;
        wT = +st.target_size_g;
        if (!(t1 > t0) || !(wT > w0)) return out;
        const now = Date.now();
        const totalDays = (t1 - t0) / DAY;
        const elapsed = Math.max(0, (now - t0) / DAY);
        const planRate = (wT - w0) / totalDays;
        const planToday = w0 + planRate * elapsed;
        const hasObs = c.site_id === 'site_01' && this.liveLast && this.liveLast.avg_weight_g != null;
        const obs = hasObs ? this.liveLast.avg_weight_g : null;
        let etaTs = null, etaDays = null, obsRate = null;
        if (obs != null) {
          obsRate = elapsed > 0 ? (obs - w0) / elapsed : null;
          if (obsRate > 0) {
            etaDays = (wT - obs) / obsRate;
            etaTs = now + etaDays * DAY;
          }
        }
        /* 计划曲线：放养 → 计划起捕，约 80 个采样点 */
        const planPts = [];
        const step = Math.max(1, Math.round(totalDays / 80));
        for (let d = 0; d <= totalDays; d += step) {
          const t = t0 + d * DAY;
          planPts.push([t, Math.round((w0 + planRate * d) * 10) / 10]);
        }
        planPts.push([t1, wT]);
        /* 实测段：近 5 分钟数据，在全周期尺度上相当于今天的位置 */
        const obsPts = obs != null
          ? this.live.map(function (r) { return [r.ts, r.avg_weight_g]; })
          : [];
        return {
          ok: true,
          elapsedDays: Math.round(elapsed),
          planToday: Math.round(planToday * 10) / 10,
          planRate: Math.round(planRate * 100) / 100,
          daysToPlan: Math.max(0, Math.round((t1 - now) / DAY)),
          obs: obs,
          obsRate: obsRate != null ? Math.round(obsRate * 100) / 100 : null,
          dev: obs != null ? Math.round((obs - planToday) * 10) / 10 : null,
          etaDays: etaDays != null ? Math.round(etaDays) : null,
          etaTs: etaTs,
          planPts: planPts,
          obsPts: obsPts,
          t1: t1, wT: wT
        };
      },
      charts: function () {
        const x = this.m;
        if (!x.ok) return [];
        const list = [{ name: '计划体重', unit: 'g', data: x.planPts }];
        if (x.obsPts && x.obsPts.length) list.push({ name: '当前实测', unit: 'g', data: x.obsPts });
        return list;
      },
      thresholds: function () {
        const x = this.m;
        if (!x.ok) return [];
        return [{ value: x.wT, label: '上市规格 ' + x.wT + ' g', color: '#166534' }];
      },
      etaText: function () {
        const x = this.m;
        if (!x.ok || x.etaTs == null) return '';
        return new Date(x.etaTs).toLocaleDateString('zh-CN');
      }
    },
    methods: {
      load: function () {
        const self = this;
        API.resolve(API.farm(), function (f) { self.farm = f; });
        API.resolve(API.fish(5), function (d) { self.live = (d && d.slice) ? d.slice() : []; });
      },
      fmtDate: function (ts) { return ts ? new Date(ts).toLocaleDateString('zh-CN') : ''; },
      /* 生长曲线（跨数月，公共 TrendChart 的横轴只格式化为时分，故在此按日期轴渲染） */
      renderChart: function () {
        const self = this;
        const x = this.m;
        this.$nextTick(function () {
          const el = self.$refs.growthCanvas;
          if (!el || !x.ok) return;
          let inst = echarts.getInstanceByDom(el);
          if (!inst) inst = echarts.init(el);
          self.gChart = inst;
          const palette = ['#2F5496', '#C2410C'];
          const series = self.charts.map(function (s, i) {
            const color = palette[i % palette.length];
            const line = {
              name: s.name + (s.unit ? '（' + s.unit + '）' : ''),
              type: 'line', showSymbol: false, sampling: 'lttb',
              lineStyle: { width: 1.8, color: color },
              itemStyle: { color: color },
              data: s.data
            };
            if (i === 0) {
              line.markLine = {
                silent: true, symbol: 'none',
                label: { formatter: '{b}', fontSize: 11, position: 'insideEndTop' },
                data: [{ yAxis: x.wT, name: '上市规格 ' + x.wT + ' g',
                         lineStyle: { color: '#166534', type: 'dashed', width: 1 } }]
              };
            }
            return line;
          });
          inst.setOption({
            grid: { left: 56, right: 20, top: 36, bottom: 32 },
            tooltip: { trigger: 'axis' },
            legend: { top: 0, textStyle: { fontSize: 12 } },
            xAxis: {
              type: 'time',
              axisLabel: {
                fontSize: 11,
                formatter: function (v) {
                  const d = new Date(v);
                  return (d.getMonth() + 1) + '/' + d.getDate();
                }
              },
              splitLine: { show: false }
            },
            yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 11 },
                     splitLine: { lineStyle: { color: '#EEF2F6' } } },
            series: series
          }, true);
          if (!inst.isDisposed()) inst.resize();
        });
      }
    },
    mounted: function () {
      this.unsub = API.bind(this, this.load);
      this.load();
    },
    beforeUnmount: function () {
      if (this.unsub) { this.unsub(); this.unsub = null; }
      if (this.gChart) { this.gChart.dispose(); this.gChart = null; }
    },
    watch: {
      cages: function () { if (!this.cageId && this.cages.length) this.cageId = this.cages[0].cage_id; },
      m: function () { this.renderChart(); }
    },
    template: [
      '<div>',
      '  <page-head title="鱼类 · 生长模型与预测"',
      '    desc="由放养台账与当前观测推导生长曲线，预测达到上市规格的时间"',
      '    />',
      '',
      '  <div v-if="!cages.length" class="card">',
      '    <div class="muted small">暂无数据 —— 生长模型需要养殖配置。请双击 <b>启动平台.bat</b>。</div>',
      '  </div>',
      '',
      '  <template v-else-if="m.ok">',
      '  <div class="hero-band">',
      '    <div><div class="hero-label">按当前实测速率 · 预计起捕日期</div><div class="hero-value">{{ m.etaDays != null ? etaText : \'暂无法预测\' }}</div><div class="hero-note">线性生长估算，需结合后续观测更新</div></div>',
      '    <div><div class="hero-label">预计还需</div><div class="hero-value">{{ m.etaDays ?? \'—\' }} <small>天</small></div><div class="hero-note">达到上市规格 {{ m.wT }} g</div></div>',
      '    <div><div class="hero-label">计划起捕</div><div style="font-size:24px;font-weight:700">{{ fmtDate(m.t1) }}</div><div class="hero-note">距计划 {{ m.daysToPlan }} 天 · 当前体重偏差 {{ m.dev ?? \'—\' }} g</div></div>',
      '  </div>',
      '  <div class="grid-stats">',
      '    <stat-card name="当前实测体重" field="avg_weight_g" unit="g" :value="m.obs" />',
      '    <stat-card name="今日计划体重" unit="g" :value="m.planToday" />',
      '    <stat-card name="计划偏差" unit="g" :value="m.dev" />',
      '    <stat-card name="计划日均增重" unit="g/天" :value="m.planRate" />',
      '  </div>',
      '',
      '  <div class="split" style="margin-top:12px">',
      '    <div class="card">',
      '      <div class="card-title">生长曲线（放养 → 计划起捕；虚线为上市规格）</div>',
      '      <div ref="growthCanvas" class="chart" style="height:330px"></div>',
      '    </div>',
      '    <div class="card">',
      '      <div class="card-title">预测结论</div>',
      '      <div v-if="m.obs == null" class="muted small">',
      '        该网箱暂无实时体重观测，<br>无法推算实际进度（不编数据）。<br><br>',
      '        按计划：<b>{{ m.daysToPlan }}</b> 天后起捕（{{ fmtDate(m.t1) }}）。',
      '      </div>',
      '      <div v-else-if="m.etaDays != null" class="small">',
      '        <b>{{ cage.cage_name }} · {{ cage.species }}</b><hr>',
      '        已养 <b>{{ m.elapsedDays }}</b> 天，实测 <b>{{ m.obs }} g</b>；<br>',
      '        按当前实测速率（<b>{{ m.obsRate }} g/天</b>），<br>',
      '        预计再 <b>{{ m.etaDays }}</b> 天达到上市规格 {{ m.wT }} g，<br>',
      '        即 <b>{{ etaText }}</b> 前后起捕。<br><br>',
      '        计划起捕日：{{ fmtDate(m.t1) }}',
      '      </div>',
      '      <div v-else class="muted small">实测体重未增长，暂无法预测。</div>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="hint" style="margin-top:12px">',
      '    <b>模型口径</b>：计划曲线为线性 W(t)=W0+r·t，W0 取放养台账的初始规格、',
      '    r 由「目标规格 − 初始规格」÷ 计划养殖天数得出；预测速率由「当前实测体重 − 初始规格」÷ 已养天数得出。',
      '    体长体重换算 W=lw_a·L^lw_b 的参数按鱼种自动取值，出处见「鱼种档案」页。',
      '  </div>',
      '  </template>',
      '',
      '  <div v-if="cages.length" class="opbar" style="margin:12px -16px -16px; border-radius:0">',
      '    <select v-model="cageId" style="min-width:230px">',
      '      <option v-for="c in cages" :key="c.cage_id" :value="c.cage_id">',
      ' {{ c.cage_name }} · {{ c.species }}</option>',
      '    </select>',
      '    <button @click="load">重新计算</button>',
      '    <span style="flex:1"></span>',
      '    <span class="small muted">本页只做生长模型与预测；不做 FCR / 体长离散度 / 死亡数</span>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  PAGES['/fish/records'] = {
    data: function () {
      return { tick: 0, unsub: null, minutes: 60, quality: 'all', rows: [], page: 1, pageSize: 25 };
    },
    computed: {
      filtered: function () {
        const q = this.quality;
        if (q === 'all') return this.rows;
        return this.rows.filter(function (r) { return (r.quality || 'good') === q; });
      },
      /* 最新在前，每页 25 行，保留完整查询结果。 */
      viewRows: function () {
        const list = this.filtered.slice().reverse();
        return list.slice((this.currentPage - 1) * this.pageSize, this.currentPage * this.pageSize);
      },
      pageCount: function () { return Math.max(1, Math.ceil(this.filtered.length / this.pageSize)); },
      currentPage: function () { return Math.min(this.page, this.pageCount); },
      counts: function () {
        this.tick;
        const c = { total: this.rows.length, suspect: 0, stale: 0 };
        this.rows.forEach(function (r) {
          if (r.quality === 'suspect') c.suspect += 1;
          if (r.quality === 'stale') c.stale += 1;
        });
        return c;
      }
    },
    methods: {
      load: function () {
        const self = this;
        API.resolve(API.fish(this.minutes), function (d) {
          self.rows = (d && d.slice) ? d.slice() : [];
        });
      },
      fmtTs: function (ts) {
        return ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '';
      },
      feedCn: function (v) { return CN.feedingIntensity(v); },
      srcCn: function (v) { return (API.sourceText && API.sourceText[v]) || v; },
      qualCn: function (v) { return CN.quality(v || 'good'); },
      dash: function (v) {
        return (v === null || v === undefined || v === '') ? '—' : v;
      }
    },
    watch: { minutes: function () { this.page = 1; this.load(); }, quality: function () { this.page = 1; } },
    mounted: function () {
      this.unsub = API.bind(this, this.load);
      this.load();
    },
    beforeUnmount: function () { if (this.unsub) { this.unsub(); this.unsub = null; } },
    template: [
      '<div>',
      '  <page-head title="鱼类 · 原始数据明细"',
      '    desc="鱼类视觉识别数据的逐条原始记录，供追溯查询与核验"',
      '    />',
      '',
      '  <div class="card" style="margin-bottom:12px">',
      '    <div class="row" style="gap:16px;flex-wrap:wrap;align-items:center">',
      '      <time-range v-model="minutes" />',
      '      <span class="row" style="gap:6px;align-items:center">',
      '        <span class="small muted">质量</span>',
      '        <select v-model="quality" style="min-width:130px">',
      '          <option value="all">全部</option>',
      '          <option value="good">良好</option>',
      '          <option value="suspect">疑似异常</option>',
      '          <option value="stale">超时未更新</option>',
      '        </select>',
      '      </span>',
      '      <button @click="load">重新拉取</button>',
      '      <span style="flex:1"></span>',
      '      <span class="small muted">共 {{ counts.total }} 条；',
      '        <span style="color:#92400E">疑似异常 {{ counts.suspect }}</span>；',
      '        <span style="color:#6B7280">超时 {{ counts.stale }}</span>',
      '      </span>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="card">',
      '    <div class="table-scroll"><table class="dt">',
      '      <thead><tr>',
      '        <th>时间</th><th>站点</th><th>现存尾数</th><th>密度</th>',
      '        <th>平均体长</th><th>平均体重</th><th>总体重</th>',
      '        <th>摄食强度</th><th>数据状态</th>',
      '      </tr></thead>',
      '      <tbody>',
      '        <tr v-for="r in viewRows" :key="r.ts">',
      '          <td class="small">{{ fmtTs(r.ts) }}</td>',
      '          <td>{{ r.site_id }}</td>',
      '          <td>{{ dash(r.fish_count) }}</td>',
      '          <td>{{ dash(r.fish_density) }}<span class="unit">尾/m³</span></td>',
      '          <td>{{ dash(r.avg_length_cm) }}<span class="unit">cm</span></td>',
      '          <td>{{ dash(r.avg_weight_g) }}<span class="unit">g</span></td>',
      '          <td>{{ dash(r.total_biomass_kg) }}<span class="unit">kg</span></td>',
      '          <td>{{ r.feeding_intensity ? feedCn(r.feeding_intensity) : "—" }}</td>',
      '          <td><span class="small">{{ qualCn(r.quality) }}</span></td>',
      '        </tr>',
      '        <tr v-if="!viewRows.length">',
      '          <td colspan="10" class="muted small">当前条件下没有记录</td>',
      '        </tr>',
      '      </tbody>',
      '    </table>',
      '    </div>',
      '    <div class="pagination">',
      '      <span class="small muted">{{ filtered.length }} 条 · 第 {{ currentPage }} / {{ pageCount }} 页</span>',
      '      <button :disabled="currentPage === 1" @click="page = currentPage - 1">上一页</button>',
      '      <button :disabled="currentPage === pageCount" @click="page = currentPage + 1">下一页</button>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="hint" style="margin-top:12px">',
      '    <b>口径</b>：本页为鱼类视觉识别接口的原始秒级记录；设备离线时对应字段为',
      '    <code>null</code>、显示「—」，不显示上一个值。公开数据集（TFBID / DeepFish）与文献参数',
      '    的引用见「数据来源说明」与「鱼种档案」页。',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  PAGES['/fish/simulator'] = {
    data: function () {
      return { tick: 0, unsub: null, state: null, busy: false, feedback: '' };
    },
    computed: {
      scenarioList: function () {
        return [
          { mode: 'normal', cn: '正常', desc: '所有指标恢复常态' },
          { mode: 'feeding_abnormal', cn: '摄食异常', desc: '摄食强度长时间无、偶发骤增' },
          { mode: 'cluster', cn: '鱼群聚集', desc: '热力图出现局部高密度红区' },
          { mode: 'density_drop', cn: '密度骤降/分散', desc: '现存尾数与密度渐降约 35%' },
          { mode: 'camera_off', cn: '摄像头离线', desc: '视觉指标全部置空、显示「—」' },
        ];
      },
      genList: function () {
        return [
          { action: 'start', cn: '启动' },
          { action: 'pause', cn: '暂停' },
          { action: 'resume', cn: '恢复' },
          { action: 'stop', cn: '停止' },
        ];
      },
      logs: function () {
        this.tick;
        return (this.state && this.state.log) || [];
      }
    },
    methods: {
      load: function () {
        const self = this;
        fishGet('/api/fish/sim').then(function (s) { self.state = s; })
          .catch(function () { self.state = null; });
      },
      send: function (body, msg) {
        const self = this;
        if (this.busy) return;
        this.busy = true;
        fishPost('/api/fish/sim', body).then(function (s) {
          self.state = s;
          self.feedback = msg;
          self.busy = false;
        }).catch(function () { self.busy = false; });
      },
      gen: function (a) {
        const cn = { start: '启动', pause: '暂停', resume: '恢复', stop: '停止' }[a];
        this.send({ action: a }, '已' + cn + '生成器');
      },
      setMode: function (sc) {
        this.send({ mode: sc.mode }, '已切换场景：' + sc.cn);
      },
      resetAll: function () {
        this.send({ action: 'resume', mode: 'normal' },
                  '已一键恢复：生成器运行 + 正常场景');
      },
      fmtTs: function (ts) {
        return ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '';
      },
      genColor: function (g) {
        return { running: '#166534', paused: '#92400E', stopped: '#991B1B' }[g] || '#6B7280';
      }
    },
    mounted: function () {
      this.unsub = API.bind(this, this.load);
      this.load();
    },
    beforeUnmount: function () { if (this.unsub) { this.unsub(); this.unsub = null; } },
    template: [
      '<div>',
      '  <page-head title="鱼类 · 仿真控制"',
      '    desc="控制鱼类数据生成器与内容场景，用于演示与联调"',
      '    />',
      '',
      '  <div v-if="feedback" class="card" style="margin-bottom:12px; border-color:#93C5FD">',
      '    <span class="small" style="color:#1D4ED8">{{ feedback }} —— 监测 / 热力图 / 生长 / 明细四页同步变化</span>',
      '  </div>',
      '',
      '  <div class="split" style="margin-bottom:12px">',
      '    <div class="card">',
      '      <div class="card-title">当前仿真状态</div>',
      '      <div v-if="state" class="small">',
      '        运行状态：<span class="tag" style="font-size:24px;padding:8px 12px" :style="{ color: genColor(state.gen_status) }">{{ state.gen_status_cn }}</span>',
      '        <br><br>',
      '        内容模式：<span class="tag tag-simulated">{{ state.sim_mode_cn }}</span>',
      '        <br><br>',
      '        <span class="muted">更新于 {{ fmtTs(state.updated_ts) }}</span>',
      '      </div>',
      '      <div v-else class="muted small">读取状态中…</div>',
      '    </div>',
      '    <div class="card">',
      '      <div class="card-title">生成器控制（运行状态）</div>',
      '      <button v-for="g in genList" :key="g.action" @click="gen(g.action)"',
      '              :disabled="busy">{{ g.cn }}</button>',
      '      <div class="hint" style="margin-top:10px">',
      '        停止：视觉指标全部置空、显示「—」；暂停：数据冻结在计划值上。',
      '      </div>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="card" style="margin-bottom:12px">',
      '    <div class="card-title">内容场景（内容模式）</div>',
      '    <div class="grid-stats">',
      '      <button v-for="s in scenarioList" :key="s.mode"',
      '              :class="{ primary: state && state.sim_mode === s.mode }"',
      '              @click="setMode(s)" :disabled="busy"',
      '              style="text-align:left; padding:10px 12px">',
      '        <b>{{ s.cn }}</b><br>',
      '        <span class="small muted">{{ s.desc }}</span>',
      '      </button>',
      '    </div>',
      '  </div>',
      '',
      '  <div>',
      '    <div class="card">',
      '      <div class="card-title">一键恢复</div>',
      '      <div class="small">演示结束后点这里：</div>',
      '      <button class="primary" @click="resetAll" :disabled="busy">恢复运行 + 正常场景</button>',
      '      <div class="hint" style="margin-top:10px">',
      '        只影响鱼类板块的仿真数据；不写回 farm.json，不影响其他板块。',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <details class="secondary-details"><summary>操作日志 · 最近 30 条</summary>    <div class="card">',
      '      <div class="card-title">操作日志（最近 30 条）</div>',
      '      <table class="dt">',
      '        <thead><tr><th>时间</th><th>操作</th><th>对象</th></tr></thead>',
      '        <tbody>',
      '          <tr v-for="(l, i) in logs" :key="i">',
      '            <td class="small">{{ fmtTs(l.ts) }}</td>',
      '            <td>{{ l.action_cn }}</td>',
      '            <td>{{ l.target }}</td>',
      '          </tr>',
      '          <tr v-if="!logs.length"><td colspan="3" class="muted small">暂无操作记录</td></tr>',
      '        </tbody>',
      '      </table>',
      '    </div>',
      '  </details>',
      '',
      '</div>'
    ].join('\n')
  };

  /* ---------- 鱼种档案 ----------
   🔴 2026-10-15 队长改：老师意见第 4 条要求「鱼种档案从管理挪进鱼类，领域归属转王浩然」。
      这里原来是**复制**了一份 /mgmt/species，导致全平台两个一模一样的页面。
      现在 /mgmt/species 已删除，**这就是唯一的鱼种档案页**，归鱼类板块。
      （内容本来就是从管理板块搬过来的，归属转移后不再有重复。）
     数据仍来自后端两个参数库（/api/species、/api/species/temp），内容与管理页完全一致；
     管理板块原页面不动。 */
  PAGES['/fish/species'] = {
    data: function () { return { tick: 0, unsub: null, kw: '', onlyOk: false, picked: null }; },
    computed: {
      tempAll: function () { this.tick; const t = API.speciesTemp(); return (t && t.species) || []; },
      lwrAll: function () { this.tick; return API.species() || []; },
      rows: function () {
        const lwr = {};
        this.lwrAll.forEach(function (x) { lwr[x.species_cn] = x; });
        return this.tempAll.map(function (t) {
          const l = lwr[t.species_cn] || {};
          return {
            cn: t.species_cn, latin: t.species_latin,
            opt: (t.temp_opt_low != null ? t.temp_opt_low + '~' + t.temp_opt_high : '—'),
            tol: (t.temp_tol_low != null ? t.temp_tol_low + '~' + t.temp_tol_high : '—'),
            warnH: t.temp_warn_high, alarmH: t.temp_alarm_high,
            warnL: t.temp_warn_low, alarmL: t.temp_alarm_low,
            evidence: t.evidence, source: t.source, note: t.note,
            a: l.lw_a, b: l.lw_b, lenType: l.length_type,
            lwrEvidence: l.evidence_cn || l.evidence
          };
        });
      },
      list: function () {
        const k = this.kw.trim();
        let r = this.rows;
        if (k) {
          r = r.filter(function (x) {
            return (x.cn && x.cn.indexOf(k) >= 0) || (x.latin && x.latin.toLowerCase().indexOf(k.toLowerCase()) >= 0);
          });
        }
        if (this.onlyOk) {
          r = r.filter(function (x) { return x.alarmH !== null || x.alarmL !== null; });
        }
        return r;
      },
      stat: function () {
        const r = this.rows;
        const cnt = {};
        r.forEach(function (x) { cnt[x.evidence] = (cnt[x.evidence] || 0) + 1; });
        return {
          total: r.length,
          withAlarm: r.filter(function (x) { return x.alarmH !== null || x.alarmL !== null; }).length,
          both: r.filter(function (x) { return x.a != null && x.alarmH !== null; }).length,
          byEvidence: cnt
        };
      }
    },
    methods: {
      evColor: function (lv) {
        return {
          '官方/标准': { bg: '#F0FDF4', br: '#86EFAC', fg: '#166534' },
          '学术文献': { bg: '#EFF6FF', br: '#BFDBFE', fg: '#1D4ED8' },
          '技术手册/科普': { bg: '#FFFBEB', br: '#FDE68A', fg: '#92400E' },
          '没找到': { bg: '#FEF2F2', br: '#FECACA', fg: '#991B1B' }
        }[lv] || { bg: '#F3F4F6', br: '#E5E7EB', fg: '#6B7280' };
      },
      info: function (r) {
        return { level: r.evidence, text: r.note || '（这一条没有补充说明）', source: r.source, url: '' };
      },
      lenTypeCn: function (t) {
        return {
          TL: '全长', SL: '标准长', FL: '叉长',
          'total length': '全长', 'standard length': '标准长', 'fork length': '叉长'
        }[t] || t || '—';
      }
    },
    mounted: function () {
      const self = this;
      this.unsub = API.subscribe(function () { self.tick++; });
    },
    beforeUnmount: function () { if (this.unsub) { this.unsub(); this.unsub = null; } },
    template: [
      '<div>',
      '  <page-head title="鱼类 · 鱼种档案"',
      '    desc="海水养殖鱼种的<b>温度参数</b>与<b>体长体重参数</b>，每条都带出处 —— 本页参数与管理板块鱼种档案一致"',
      '    />',
      '',
      '  <div v-if="!rows.length" class="card">',
      '    <div class="card-title">需要后端</div>',
      '    <div class="small muted">鱼种档案住在后端 <b>data/</b> 下的两个参数库。请双击 <b>启动平台.bat</b>。</div>',
      '  </div>',
      '',
      '  <template v-else>',
      '    <div class="grid-stats">',
      '      <stat-card name="鱼种总数" field="species" unit="种" :digits="0" :value="stat.total" />',
      '      <stat-card name="有温度告警线" field="alarm" unit="种" :digits="0" :value="stat.withAlarm" />',
      '      <stat-card name="两库齐备" field="both" unit="种" :digits="0" :value="stat.both" />',
      '      <stat-card name="证据：官方/标准" field="official" unit="种" :digits="0"',
      '                 :value="stat.byEvidence[\'官方/标准\'] || 0" />',
      '    </div>',
      '',
      '    <div class="card">',
      '      <div class="card-title">鱼种参数总表</div>',
      '      <div class="row" style="gap:10px;margin-bottom:8px;align-items:center">',
      '        <input type="text" v-model="kw" placeholder="搜中文名或拉丁名" style="width:220px">',
      '        <label class="small" style="display:flex;align-items:center;gap:4px">',
      '          <input type="checkbox" v-model="onlyOk"> 只看有告警线的',
      '        </label>',
      '        <span class="small muted">共 {{ list.length }} 条</span>',
      '      </div>',
      '      <div class="dt-wrap" style="max-height:560px">',
      '        <table class="dt">',
      '          <thead><tr><th>鱼种</th><th>拉丁学名</th><th>最适水温</th><th>耐受范围</th>',
      '            <th>建议告警线</th><th>体长体重 a / b</th><th>体长类型</th><th>证据强度</th><th>依据</th></tr></thead>',
      '          <tbody>',
      '            <tr v-for="r in list" :key="r.cn" :style="r.evidence === \'没找到\' ? { opacity: .55 } : {}">',
      '              <td><b>{{ r.cn }}</b></td>',
      '              <td class="small" style="font-style:italic">{{ r.latin }}</td>',
      '              <td class="mono small">{{ r.opt }} ℃</td>',
      '              <td class="mono small">{{ r.tol }} ℃</td>',
      '              <td class="mono small">',
      '                <span v-if="r.alarmH !== null || r.alarmL !== null">',
      '                  低 {{ r.alarmL != null ? r.alarmL : \'—\' }} / 高 {{ r.alarmH != null ? r.alarmH : \'—\' }} ℃',
      '                </span>',
      '                <span v-else class="muted">数据不足</span>',
      '              </td>',
      '              <td class="mono small">',
      '                <span v-if="r.a != null">{{ r.a }} / {{ r.b }}</span>',
      '                <span v-else class="muted">—</span>',
      '              </td>',
      '              <td class="small">{{ lenTypeCn(r.lenType) }}</td>',
      '              <td><span class="hd-badge"',
      '                    :style="{ background: evColor(r.evidence).bg, borderColor: evColor(r.evidence).br, color: evColor(r.evidence).fg }">',
      ' {{ r.evidence }}</span></td>',
      '              <td><help-dot :info="info(r)" :label="r.cn + \' · 温度参数依据\'" /></td>',
      '            </tr>',
      '            <tr v-if="!list.length"><td colspan="9" class="muted small">没有匹配的鱼种</td></tr>',
      '          </tbody>',
      '        </table>',
      '      </div>',
      '      <div class="hint small" style="margin-top:10px">',
      '        <b>为什么「没找到」也留在表里</b>：查不到就是查不到，留空比编一个数字有用 ——',
      '        它明确告诉我们<b>哪几个种还需要补文献</b>。',
      '      </div>',
      '    </div>',
      '  </template>',
      '</div>'
    ].join('\n')
  };

})(window);
