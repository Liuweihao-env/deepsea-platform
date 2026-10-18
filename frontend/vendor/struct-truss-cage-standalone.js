/*
 * 桁架式网箱模型 · 独立分享版
 * 来源：邓宇涵负责的 frontend/pages/struct.js（2026-10-18）
 * 供总览页、鱼类板块接入。无需第三方库；离线可用。
 *
 * 接入方式：
 * 1. 把本文件放到项目中，由队长在 frontend/index.html 的 pages/struct.js
 *    之后（如已加载该文件）、app.js 之前加载：
 *    <script src="vendor/struct-truss-cage-standalone.js"></script>
 *    也可把本文件内容放进各自负责的页面文件（不要重复加载）。
 * 2. 页面中放一个 <canvas ref="cageCanvas"></canvas>。
 * 3. Vue mounted 中：
 *      this.cageViewer = window.StructTrussCage.mount(this.$refs.cageCanvas);
 *      this.cageViewer.setSpec(null, 'cage_01'); // 或 cage_02
 *    若有经过确认的桁架尺寸，可传含 shape、length_m、width_m、depth_m
 *    的配置对象；不要自行填写现场尺寸。
 * 4. Vue beforeUnmount 中：
 *      if (this.cageViewer) this.cageViewer.dispose();
 *    查看系泊全貌：this.cageViewer.setMooringView(true);
 *
 * 提醒：现有 farm.json 的两箱规格仍记为圆形，不能直接据此计算桁架长宽；
 * 默认模型是结构概念示意，比例、锚位和设计载荷都不是现场施工数据。
 */
(function (global) {
  'use strict';
  function validNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (global.document && !global.document.getElementById('struct-truss-standalone-style')) {
    const style = global.document.createElement('style');
    style.id = 'struct-truss-standalone-style';
    style.textContent = '.struct-truss-share-canvas{display:block;width:100%;height:320px;' +
      'border-radius:8px;cursor:grab;touch-action:none;background:#527481;}' +
      '.struct-truss-share-canvas:active{cursor:grabbing;}';
    global.document.head.appendChild(style);
  }
  function mountCageModel(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return { setSpec: function () {}, dispose: function () {} };
    const view = { yaw: 0.65, pitch: 0.46, zoom: 1, mooring: false,
                   length: 5, breadth: 2, depth: 1.65, variant: 'cage_01' };
    const reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0, height = 0, raf = 0, previous = 0, dragging = false, lastX = 0, lastY = 0;
    let stillUntil = 0, specKey = '', cy = 1, sy = 0, cp = 1, sp = 0;

    function setSpec(spec, cageId) {
      const length = validNumber(spec && spec.length_m);
      const breadth = validNumber(spec && spec.width_m);
      const depth = validNumber(spec && spec.depth_m);
      const key = [cageId, spec && spec.shape, length, breadth, depth].join(':');
      if (key === specKey) return;
      specKey = key;
      view.variant = cageId === 'cage_02' ? 'cage_02' : 'cage_01';
      // 旧配置仍是圆形周长，不能把它换算成桁架式网箱的长和宽。
      if (spec && spec.shape === '桁架式' && length > 0 && breadth > 0 && depth > 0) {
        view.breadth = Math.max(1.7, Math.min(3.4, 5 * breadth / length));
        view.depth = Math.max(1.25, Math.min(2.6, 5 * depth / length));
      } else {
        // 两箱的桁架比例仅作概念区分；farm.json 目前仍是旧圆形规格。
        view.breadth = view.variant === 'cage_02' ? 2.55 : 2;
        view.depth = view.variant === 'cage_02' ? 1.48 : 1.65;
      }
    }
    function resize() {
      width = canvas.clientWidth || 480;
      height = canvas.clientHeight || 320;
      const ratio = Math.min(global.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    function project(p) {
      const x = p[0] * cy - p[2] * sy;
      const z = p[0] * sy + p[2] * cy;
      const y = p[1] + view.depth * 0.46;
      const raised = y * cp - z * sp;
      const forward = y * sp + z * cp;
      const distance = 9.2 / view.zoom - forward;
      const scale = Math.min(width, height) * 1.4 / distance;
      return { x: width * 0.5 + x * scale, y: height * 0.46 - raised * scale, z: distance };
    }
    function trace(points) {
      points.forEach(function (p, i) {
        const q = project(p);
        if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
      });
    }
    function line(points, color, weight) {
      ctx.beginPath(); trace(points); ctx.strokeStyle = color; ctx.lineWidth = weight; ctx.stroke();
    }
    function surface(points, fill) {
      ctx.beginPath(); trace(points); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    }
    function drawEnvironment() {
      const backdrop = ctx.createLinearGradient(0, 0, 0, height);
      backdrop.addColorStop(0, '#becdd1');
      backdrop.addColorStop(0.38, '#7798a1');
      backdrop.addColorStop(1, '#183b4a');
      ctx.fillStyle = backdrop; ctx.fillRect(0, 0, width, height);
      const floor = -view.depth - 0.62;
      surface([[-5, floor, -5], [5, floor, -5], [5, floor, 5], [-5, floor, 5]],
              'rgba(19,47,58,.36)');
      for (let d = -4; d <= 4; d += 1) {
        line([[d, floor + 0.01, -4], [d, floor + 0.01, 4]], 'rgba(207,228,226,.13)', 1);
        line([[-4, floor + 0.01, d], [4, floor + 0.01, d]], 'rgba(207,228,226,.13)', 1);
      }
      surface([[-5, 0, -5], [5, 0, -5], [5, 0, 5], [-5, 0, 5]],
              'rgba(175,219,221,.11)');
      for (let d = -4; d <= 4; d += 1) {
        line([[d, 0, -4], [d, 0, 4]], 'rgba(238,248,245,.11)', 1);
        line([[-4, 0, d], [4, 0, d]], 'rgba(238,248,245,.11)', 1);
      }
    }
    function mix(a, b, t) {
      return a.map(function (value, i) { return value + (b[i] - value) * t; });
    }
    function drawTube(a, b, kind) {
      const pa = project(a), pb = project(b);
      const factor = 8 / ((pa.z + pb.z) / 2);
      if (kind === 'netMesh') {
        line([a, b], 'rgba(189,226,220,.44)', Math.max(0.55, factor * 0.75));
        return;
      }
      const size = (kind === 'floatColumn' ? 12 : kind === 'float' ? 10 :
                    kind === 'main' ? 5.5 :
                    kind === 'brace' ? 3.2 : kind === 'chain' ? 2.8 : 2) * factor;
      ctx.lineCap = 'round';
      line([a, b], kind === 'chain' ? '#4b3e32' : '#1a3038', size + 2);
      line([a, b], kind === 'float' || kind === 'floatColumn' ? '#506c77' :
           kind === 'chain' ? '#c8a970' : kind === 'netEdge' ? '#adc8c3' :
           kind === 'netTie' ? '#c2d1cb' : '#637d85', size);
      if (kind !== 'chain' && kind !== 'netEdge') {
        line([a, b], 'rgba(204,222,221,.72)', Math.max(0.8, size * 0.18));
      }
    }
    function draw() {
      if (!width || !height) resize();
      cy = Math.cos(view.yaw); sy = Math.sin(view.yaw);
      cp = Math.cos(view.pitch); sp = Math.sin(view.pitch);
      drawEnvironment();
      const halfL = view.length / 2, halfB = view.breadth / 2;
      const innerL = halfL - 0.35, innerB = halfB - 0.32;
      const top = 0.34, lower = -0.24, bottom = -view.depth;
      const outer = [[-halfL, -halfB], [halfL, -halfB], [halfL, halfB], [-halfL, halfB]];
      const inner = [[-innerL, -innerB], [innerL, -innerB], [innerL, innerB], [-innerL, innerB]];
      const parts = [];
      function member(a, b, kind) {
        parts.push({ z: (project(a).z + project(b).z) / 2,
          draw: function () { drawTube(a, b, kind); } });
      }
      function panel(corners, fill) {
        const z = corners.reduce(function (sum, p) { return sum + project(p).z; }, 0) / corners.length;
        parts.push({ z: z, draw: function () { surface(corners, fill); } });
      }
      function mesh(corners, across, down) {
        panel(corners, 'rgba(111,174,177,.13)');
        for (let i = 0; i <= across; i++) {
          const t = i / across;
          member(mix(corners[0], corners[1], t), mix(corners[3], corners[2], t),
                 i === 0 || i === across ? 'netEdge' : 'netMesh');
        }
        for (let j = 0; j <= down; j++) {
          const t = j / down;
          member(mix(corners[0], corners[3], t), mix(corners[1], corners[2], t),
                 j === 0 || j === down ? 'netEdge' : 'netMesh');
        }
      }
      // 网衣挂在内侧框架上，四个侧面各成一片，底面封闭。
      for (let side = 0; side < 4; side++) {
        const a = inner[side], b = inner[(side + 1) % 4];
        mesh([[a[0], lower, a[1]], [b[0], lower, b[1]],
              [b[0], bottom, b[1]], [a[0], bottom, a[1]]], side % 2 ? 7 : 11, 9);
      }
      mesh(inner.map(function (p) { return [p[0], bottom, p[1]]; }), 11, 7);

      // 上下弦、立杆、斜撑构成连续的空间钢桁架，不再使用圆形浮圈算法。
      for (let side = 0; side < 4; side++) {
        const a = outer[side], b = outer[(side + 1) % 4];
        const ia = inner[side], ib = inner[(side + 1) % 4];
        const bays = side % 2 ? (view.variant === 'cage_02' ? 4 : 3) :
          (view.variant === 'cage_02' ? 6 : 5);
        panel([[a[0], top, a[1]], [b[0], top, b[1]],
               [ib[0], top, ib[1]], [ia[0], top, ia[1]]], 'rgba(54,78,87,.82)');
        for (let bay = 0; bay < bays; bay++) {
          const p = [mix(a, b, bay / bays), mix(a, b, (bay + 1) / bays)];
          const x = p[0], y = p[1];
          const netAtBay = mix(ia, ib, bay / bays);
          member([x[0], top, x[1]], [y[0], top, y[1]], 'main');
          member([x[0], lower, x[1]], [y[0], lower, y[1]], 'main');
          member([x[0], bottom, x[1]], [y[0], bottom, y[1]], 'brace');
          member([x[0], top, x[1]], [x[0], bottom, x[1]], 'main');
          member([x[0], top, x[1]], [y[0], lower, y[1]], 'brace');
          if (bay % 2 === 0) member([x[0], lower, x[1]], [y[0], bottom, y[1]], 'brace');
          // 工作通道外缘的护栏，以及网衣边纲与内框之间的连接线。
          member([x[0], top, x[1]], [x[0], top + 0.34, x[1]], 'rail');
          member([x[0], top + 0.34, x[1]], [y[0], top + 0.34, y[1]], 'rail');
          member([x[0], lower, x[1]],
                 [netAtBay[0], lower - 0.05, netAtBay[1]], 'netTie');
        }
        member([b[0], top, b[1]], [b[0], bottom, b[1]], 'main');
        member([b[0], top, b[1]], [b[0], top + 0.34, b[1]], 'rail');
        member([ia[0], top, ia[1]], [ib[0], top, ib[1]], 'main');
        member([a[0], top, a[1]], [ia[0], top, ia[1]], 'brace');
      }
      // 两侧浮力构件和立柱只表达构造，不代表真实浮力参数。
      [-halfB, halfB].forEach(function (z) {
        member([-halfL, 0.08, z], [halfL, 0.08, z], 'float');
        [-halfL, -halfL / 3, halfL / 3, halfL].forEach(function (x) {
          member([x, top, z], [x, -0.64, z], 'floatColumn');
        });
      });
      // 四角导缆点 → 悬垂段 → 海床着地点 → 铺底段 → 锚；曲线只是几何示意。
      outer.forEach(function (corner, index) {
        const sx = Math.sign(corner[0]), sz = Math.sign(corner[1]);
        const floor = bottom - 0.6;
        const fairlead = [corner[0], lower, corner[1]];
        const touchdown = [corner[0] + sx * 1.0, floor, corner[1] + sz * 0.64];
        const anchor = [corner[0] + sx * 1.42, floor, corner[1] + sz * 0.91];
        let previousPoint = fairlead;
        for (let i = 1; i <= 14; i++) {
          const t = i / 14;
          const horizontal = mix([fairlead[0], fairlead[2]],
                                 [touchdown[0], touchdown[2]], t);
          const nextPoint = [horizontal[0], floor + (fairlead[1] - floor) * (1 - t) * (1 - t),
                             horizontal[1]];
          member(previousPoint, nextPoint, 'chain');
          previousPoint = nextPoint;
        }
        member(touchdown, anchor, 'chain');
        parts.push({ z: project(fairlead).z, draw: function () {
          const q = project(fairlead);
          ctx.beginPath(); ctx.arc(q.x, q.y, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = '#e8c887'; ctx.fill();
          ctx.strokeStyle = '#293943'; ctx.lineWidth = 1.2; ctx.stroke();
        } });
        parts.push({ z: project(anchor).z, draw: function () {
          const q = project(anchor);
          ctx.fillStyle = '#2b4148';
          ctx.beginPath();
          ctx.moveTo(q.x - 8, q.y + 2); ctx.lineTo(q.x + 8, q.y + 2);
          ctx.lineTo(q.x + 4, q.y - 5); ctx.lineTo(q.x - 4, q.y - 5);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#b6c8c5'; ctx.lineWidth = 1; ctx.stroke();
          if (view.mooring) {
            ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#f0f8f5';
            ctx.shadowColor = '#102b35'; ctx.shadowBlur = 3;
            ctx.fillText('锚 ' + (index + 1), q.x + 7, q.y - 7);
            ctx.shadowBlur = 0;
          }
        } });
      });
      parts.sort(function (a, b) { return b.z - a.z; });
      parts.forEach(function (part) { part.draw(); });
    }
    function frame(now) {
      const elapsed = previous ? Math.min(50, now - previous) : 0;
      previous = now;
      if (!dragging && !reducedMotion && now > stillUntil) view.yaw += elapsed * 0.00012;
      draw();
      raf = global.requestAnimationFrame(frame);
    }
    function onDown(event) {
      dragging = true; lastX = event.clientX; lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    }
    function onMove(event) {
      if (!dragging) return;
      view.yaw += (event.clientX - lastX) * 0.008;
      view.pitch = Math.max(0.12, Math.min(1.05, view.pitch + (event.clientY - lastY) * 0.005));
      lastX = event.clientX; lastY = event.clientY;
      stillUntil = global.performance.now() + 12000;
    }
    function onUp() { dragging = false; }
    function onWheel(event) {
      event.preventDefault();
      view.zoom = Math.max(0.68, Math.min(1.36, view.zoom - event.deltaY * 0.0007));
      stillUntil = global.performance.now() + 12000;
    }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    const observer = global.ResizeObserver ? new global.ResizeObserver(resize) : null;
    if (observer) observer.observe(canvas); else global.addEventListener('resize', resize);
    resize();
    raf = global.requestAnimationFrame(frame);
    return {
      setSpec: setSpec,
      setMooringView: function (enabled) {
        view.mooring = !!enabled;
        view.zoom = enabled ? 0.6 : 1;
        view.pitch = enabled ? 1.02 : 0.46;
        stillUntil = global.performance.now() + 12000;
      },
      dispose: function () {
        global.cancelAnimationFrame(raf);
        if (observer) observer.disconnect(); else global.removeEventListener('resize', resize);
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        canvas.removeEventListener('wheel', onWheel);
      }
    };
  }
  global.StructTrussCage = {
    mount: function (canvas) {
      canvas.classList.add('struct-truss-share-canvas');
      return mountCageModel(canvas);
    }
  };
})(window);
