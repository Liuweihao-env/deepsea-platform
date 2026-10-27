/*
 * 桁架式网箱模型 · 独立分享版
 * 来源：邓宇涵负责的 frontend/pages/struct.js（2026-10-18）
 * 供总览页、鱼类板块接入。无需第三方库；离线可用。
 *
 * 接入方式：
 * 1. 在 frontend/index.html 的 pages/struct.js、pages/fish.js、app.js 之前加载：
 *    <script src="vendor/struct-truss-cage-standalone.js"></script>
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
 * 提醒：外廓比例采用台账桁架长宽深；构件、锚位和设计载荷仍为结构概念示意。
 */
(function (global) {
  'use strict';
  function validNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function geometry(spec, cageId) {
    const length = validNumber(spec && spec.length_m);
    const breadth = validNumber(spec && spec.width_m);
    const depth = validNumber(spec && spec.depth_m);
    const confirmed = spec && spec.shape === '桁架式' && length > 0 && breadth > 0 && depth > 0;
    const second = cageId === 'cage_02';
    return { length: 5, breadth: confirmed ? 5 * breadth / length : second ? 2.55 : 2,
      depth: confirmed ? 5 * depth / length : second ? 1.48 : 1.65 };
  }
  // 接口 X/Y 为水平坐标、Z 为向下水深；映射到同一内侧网衣，不改变状态颜色。
  function mapPoint(point, dims, size) {
    if (!point || !dims || !['x', 'y', 'z'].every(function (key) {
      return validNumber(point[key]) !== null && validNumber(dims[key]) > 0;
    })) return null;
    function fraction(key) { return Math.max(0, Math.min(1, point[key] / dims[key])); }
    return [(fraction('x') * 2 - 1) * (size.length / 2 - 0.35),
      -0.24 - fraction('z') * (size.depth - 0.24),
      (fraction('y') * 2 - 1) * (size.breadth / 2 - 0.32)];
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
    let ctx = canvas.getContext('2d');
    const mainContext=ctx,underCanvas=document.createElement('canvas'),reflectionCanvas=document.createElement('canvas');
    const underContext=underCanvas.getContext('2d'),reflectionContext=reflectionCanvas.getContext('2d');
    let mirrorProjection=false;
    const waterRenderer=global.createMarineWater?global.createMarineWater():null;
    if (!ctx) return { setSpec: function () {}, setPointCloud: function () {},
      setMooringView: function () {}, dispose: function () {} };
    const view = { yaw: 0.65, pitch: 0.46, zoom: 1, mooring: false,
                   length: 5, breadth: 2, depth: 1.65, variant: 'cage_01' };
    const reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0, height = 0, raf = 0, previous = 0, dragging = false, lastX = 0, lastY = 0;
    let specKey = '', cy = 1, sy = 0, cp = 1, sp = 0;
    Object.assign(view,{tx:0,ty:-view.depth*.46,tz:0,centerY:.46,context:1});
    let flight=null, focusName='overview',layerCounts={above:0,submerged:0};
    let emphasisFlight=null,paintEmphasis=0;
    const emphasis={};
    let cloud = [], cloudData = null,anchorListener=null,equipmentCounts={};

    function setPointCloud(data) {
      cloudData = data;
      cloud = data && Array.isArray(data.points) ? data.points.map(function (point, index) {
        const target = mapPoint(point, data.dims, view);
        return target ? { target: target, position: cloud[index] ? cloud[index].position : target.slice(),
          state: point.s } : null;
      }).filter(Boolean) : [];
    }

    function setSpec(spec, cageId) {
      const length = validNumber(spec && spec.length_m);
      const breadth = validNumber(spec && spec.width_m);
      const depth = validNumber(spec && spec.depth_m);
      const key = [cageId, spec && spec.shape, length, breadth, depth].join(':');
      if (key === specKey) return;
      specKey = key;
      view.variant = cageId === 'cage_02' ? 'cage_02' : 'cage_01';
      Object.assign(view, geometry(spec, cageId));
      cloud = [];
      setPointCloud(cloudData);
    }
    function resize() {
      const nextWidth=canvas.clientWidth||480,nextHeight=canvas.clientHeight||320;
      if(width===nextWidth&&height===nextHeight)return;
      width = nextWidth;
      height = nextHeight;
      const ratio = Math.min(global.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      mainContext.setTransform(ratio,0,0,ratio,0,0);
      underCanvas.width=Math.round(width);underCanvas.height=Math.round(height);
      reflectionCanvas.width=Math.round(width);reflectionCanvas.height=Math.round(height);
    }
    function project(p) {
      const px=p[0]-view.tx, pz=p[2]-view.tz;
      const x=px*cy-pz*sy, z=px*sy+pz*cy;
      const y=(mirrorProjection?-p[1]:p[1])-view.ty;
      const raised=y*cp-z*sp, forward=y*sp+z*cp;
      const distance=Math.max(2.4,9.2-forward);
      const scale=Math.min(width,height)*1.4*view.zoom/distance;
      return {x:width*.5+x*scale,y:height*view.centerY-raised*scale,z:distance};
    }
    function devicePositions() {
      const edge=view.breadth/2-.17;
      return {water:[-1.35,-.1,edge],feed:[1.35,.95,edge],stock:[0,-.85,0],light:[-1.15,1.26,-edge],crane:[1.85,.65,-edge],camera:[.1,-.48,-edge+.12],energy:[.10,.83,edge],battery:[.84,.66,edge],tension:[-view.length/2-.07,-.32,-view.breadth/2-.07],pose:[-view.length/2+.11,.76,0],net:[view.length/2-.35,-.8,0]};
    }
    function preset(name) {
      const source=devicePositions()[name]||[0,-view.depth*.46,0],point=source.slice();if(name==='light'){point[1]-=.36;point[2]+=.24}
      const settings={overview:[.65,.46,1,.46,1],water:[.18,.30,1.55,.34,.17],feed:[2.45,.30,3.2,.40,.16],stock:[.65,.40,1.1,.46,.8],light:[.5,.28,2.25,.53,.30],crane:[2.70,.42,3.1,.52,.30],camera:[.55,.27,3.3,.52,.25],energy:[2.2,.45,2.6,.52,.32],tension:[.65,.34,3,.51,.3],pose:[.65,.30,3.6,.52,.3],net:[2.7,.25,2.6,.5,.35],mooring:[.65,1.02,.60,.46,1]}[name]||[.65,.46,1,.46,1];
      return {tx:point[0],ty:point[1],tz:point[2],yaw:settings[0],pitch:settings[1],zoom:settings[2],centerY:settings[3],context:settings[4]};
    }
    function viewportRect() {
      const element=canvas.parentElement;
      return [element.offsetLeft,element.offsetTop,element.clientWidth,element.clientHeight];
    }
    function applyViewport(rect) {
      const style=canvas.parentElement.style;
      ['left','top','width','height'].forEach((key,i)=>style[key]=rect[i]+'px');
      resize();
    }
    function setFocus(name,animate,rect) {
      const now=performance.now();updateCamera(now);
      const rectTo=rect||(flight?flight.rectTo:viewportRect());
      focusName=name;view.mooring=name==='mooring';
      const to=preset(name),from={};Object.keys(to).forEach(k=>from[k]=view[k]);
      // Rotate along the nearest arc, including after manual orbiting.
      to.yaw=from.yaw+Math.atan2(Math.sin(to.yaw-from.yaw),Math.cos(to.yaw-from.yaw));
      const focused=Object.prototype.hasOwnProperty.call(emphasis,name),levels={};
      Object.keys(emphasis).forEach(key=>levels[key]=focused?(key===name?1:-1):0);
      if(reducedMotion||animate===false){Object.assign(view,to);Object.assign(emphasis,levels);applyViewport(rectTo);flight=null;emphasisFlight=null;return}
      emphasisFlight={from:{...emphasis},to:levels,started:now,duration:420};
      flight={from:from,to:to,rectFrom:viewportRect(),rectTo:rectTo,started:now,duration:1600,cameraCancelled:false};
    }
    function updateCamera(now) {
      if(emphasisFlight){
        const t=Math.min(1,Math.max(0,(now-emphasisFlight.started)/emphasisFlight.duration)),ease=1-Math.pow(1-t,3);
        Object.keys(emphasis).forEach(k=>emphasis[k]=emphasisFlight.from[k]+(emphasisFlight.to[k]-emphasisFlight.from[k])*ease);
        if(t===1)emphasisFlight=null;
      }
      if(!flight)return;
      const t=Math.min(1,Math.max(0,(now-flight.started)/flight.duration));
      const ease=t*t*t*(t*(t*6-15)+10);
      if(!flight.cameraCancelled)Object.keys(flight.to).forEach(k=>view[k]=flight.from[k]+(flight.to[k]-flight.from[k])*ease);
      applyViewport(flight.rectFrom.map((value,i)=>value+(flight.rectTo[i]-value)*ease));
      if(t===1){if(!flight.cameraCancelled)Object.assign(view,flight.to);flight=null}
    }
    Object.keys(devicePositions()).filter(k=>!['stock','battery'].includes(k)).concat(['light-secondary','crane-secondary']).forEach(k=>emphasis[k]=0);
    function equipmentColor(color) {
      if(!paintEmphasis||!/^#[\da-f]{6}$/i.test(color))return color;
      const target=paintEmphasis>0?[190,247,244]:[15,43,57],amount=Math.abs(paintEmphasis)*(paintEmphasis>0?.32:.72);
      const values=[1,3,5].map((i,j)=>Math.round(parseInt(color.slice(i,i+2),16)*(1-amount)+target[j]*amount));
      return 'rgb('+values.join(',')+')';
    }
    function trace(points) {
      points.forEach(function (p, i) {
        const q = project(p);
        if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
      });
    }
    function line(points, color, weight) {
      ctx.beginPath(); trace(points); ctx.strokeStyle = equipmentColor(color); ctx.lineWidth = weight; ctx.stroke();
    }
    function surface(points, fill) {
      ctx.beginPath(); trace(points); ctx.closePath(); ctx.fillStyle = equipmentColor(fill); ctx.fill();
    }
    // 海洋环境仅改场景呈现，沿用原网箱构件与系泊几何。
    function drawEnvironment() {
      if(waterRenderer&&waterRenderer.draw(ctx,width,height,view,reducedMotion?0:previous*.001,underCanvas,reflectionCanvas,focusName+":"+cloud.length))return true;
      const bg = ctx.createLinearGradient(0, 0, width*.15, height);
      bg.addColorStop(0,'#16475e'); bg.addColorStop(.4,'#0a3048'); bg.addColorStop(1,'#031522');
      ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
      const glow=ctx.createRadialGradient(width*.66,0,0,width*.56,height*.15,width*.63);
      glow.addColorStop(0,'rgba(103,190,208,.22)');glow.addColorStop(1,'rgba(103,190,208,0)');
      ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
      const phase=reducedMotion?0:previous*.0001;
      for(let row=0;row<49;row++){
        const t=row/49,y=height*(.04+Math.pow(t,1.55)*.57),span=12+t*24;
        for(let col=0;col<20;col++){
          const x=(col/20)*width+Math.sin(row*3.7+col)*span;
          const len=span*(.4+(Math.sin(row*2.3+col*7)+1)*.85);
          ctx.beginPath();ctx.moveTo(x,y);
          ctx.quadraticCurveTo(x+len*.45,y+Math.sin(col*1.8+row+phase)*(1+t*3),x+len,y-1-t*2);
          ctx.strokeStyle='rgba(134,205,218,'+(.018+(Math.sin(col*5.7+row*3.2+phase)+1)*.028*(1-t*.5))+')';
          ctx.lineWidth=.6+t*1.4;ctx.stroke();
        }
      }
      const fog=ctx.createLinearGradient(0,height*.4,0,height);
      fog.addColorStop(0,'rgba(3,21,34,0)');fog.addColorStop(1,'rgba(3,18,30,.75)');
      ctx.fillStyle=fog;ctx.fillRect(0,0,width,height);return false;
    }
    function mix(a, b, t) {
      return a.map(function (value, i) { return value + (b[i] - value) * t; });
    }
    function drawTube(a,b,kind){
      ctx.save();ctx.globalAlpha*=Math.exp(-Math.max(0,-(a[1]+b[1])*.5)*.28);drawTubeRaw(a,b,kind);ctx.restore();
    }
    function drawTubeRaw(a, b, kind) {
      const pa = project(a), pb = project(b);
      const factor = 8 / ((pa.z + pb.z) / 2);
      if (kind === 'netMesh') {
        line([a, b], 'rgba(167,209,217,.32)', Math.max(0.55, factor * 0.75));
        return;
      }
      const size = (kind === 'floatColumn' ? 12 : kind === 'float' ? 10 :
                    kind === 'main' ? 5.5 :
                    kind === 'brace' ? 3.2 : kind === 'chain' ? 2.8 : 2) * factor;
      ctx.lineCap = 'round';
      line([a, b], kind === 'chain' ? '#4b3e32' : '#1a3038', size + 2);
      line([a, b], kind === 'float' || kind === 'floatColumn' ? '#8ba6b3' :
           kind === 'chain' ? '#c8a970' : kind === 'netEdge' ? '#adc8c3' :
           kind === 'netTie' ? '#c2d1cb' : '#c0d1d8', size);
      if (kind !== 'chain' && kind !== 'netEdge') {
        line([a, b], 'rgba(236,246,248,.85)', Math.max(0.8, size * 0.18));
      }
    }
    function fishHeading(index,time){
      const base=(index*2.399963229728653)%(Math.PI*2);
      return base+Math.sin(time*(.18+(index%5)*.025)+index*1.37)*.22;
    }
    function drawFish(point,index) {
      const origin=point.position,time=reducedMotion?0:previous*.001;
      const heading=fishHeading(index,time);
      const sh=Math.sin(heading),ch=Math.cos(heading),size=.85+(Math.sin(index*1.7)+1)*.15;
      const tail=Math.sin(time*3.4+index*1.71)*.025;
      function local(p){return [origin[0]+(p[0]*ch-p[2]*sh)*size,origin[1]+p[1]*size,origin[2]+(p[0]*sh+p[2]*ch)*size]}
      const rings=[[-.105,.007],[-.065,.034],[0,.046],[.065,.030],[.11,.003]],faces=[];
      const body=rings.map(r=>[0,1,2,3].map(i=>local([r[0],Math.cos(i*Math.PI/2)*r[1],Math.sin(i*Math.PI/2)*r[1]*.6])));
      function face(points,color){faces.push({points:points,color:color,z:points.reduce((n,p)=>n+project(p).z,0)/points.length})}
      const silver=point.state===2?['#c36b65','#efb5a3','#d68c7c','#984f52']:point.state===1?['#b99a62','#e8d0a4','#cfb77b','#927b50']:['#779da9','#c4d9d5','#93bbc3','#567e8e'];
      for(let r=0;r<body.length-1;r++)for(let j=0;j<4;j++)face([body[r][j],body[r+1][j],body[r+1][(j+1)%4],body[r][(j+1)%4]],silver[j]);
      // Forked tail, dorsal and pectoral fins are geometry, not point sprites.
      face([local([-.10,0,0]),local([-.185,.064,tail]),local([-.158,0,tail*.6])],'#8db6c1');
      face([local([-.10,0,0]),local([-.158,0,tail*.6]),local([-.185,-.064,tail])],'#6b98a9');
      face([local([-.045,.031,0]),local([-.012,.084,0]),local([.037,.037,0])],'#6e98a7');
      [-1,1].forEach(side=>face([local([.037,-.005,side*.021]),local([-.015,-.031,side*.074]),local([-.025,-.008,side*.024])],'#9abec8'));
      faces.sort((a,b)=>b.z-a.z);faces.forEach(f=>surface(f.points,f.color));
      const eyeSide=Math.cos(view.yaw-heading)>=0?1:-1;
      const eye=project(local([.076,.012,eyeSide*.016]));
      const reference=project(local([.082,.012,eyeSide*.016]));
      ctx.beginPath();ctx.arc(eye.x,eye.y,Math.max(.45,Math.hypot(reference.x-eye.x,reference.y-eye.y)*.65),0,Math.PI*2);ctx.fillStyle='#183542';ctx.fill();
    }
    function draw() {
      if (!width || !height) resize();
      cy = Math.cos(view.yaw); sy = Math.sin(view.yaw);
      cp = Math.cos(view.pitch); sp = Math.sin(view.pitch);
      const halfL = view.length / 2, halfB = view.breadth / 2;
      const innerL = halfL - 0.35, innerB = halfB - 0.32;
      const top = 0.34, lower = -0.24, bottom = -view.depth;
      const outer = [[-halfL, -halfB], [halfL, -halfB], [halfL, halfB], [-halfL, halfB]];
      const inner = [[-innerL, -innerB], [innerL, -innerB], [innerL, innerB], [-innerL, innerB]];
      const parts = [];
      function clipAtWater(points,below){
        const result=[];
        for(let i=0;i<points.length;i++){
          const a=points[i],b=points[(i+1)%points.length];
          const inside=below?a[1]<0:a[1]>=0,nextInside=below?b[1]<0:b[1]>=0;
          if(inside)result.push(a);
          if(inside!==nextInside)result.push(mix(a,b,-a[1]/(b[1]-a[1])));
        }
        return result;
      }
      function polygonPart(points,fill,equipment,border){
        [true,false].forEach(below=>{
          const clipped=clipAtWater(points,below);if(clipped.length<3)return;
          parts.push({equipment:equipment,submerged:below,z:clipped.reduce((n,p)=>n+project(p).z,0)/clipped.length,draw:function(){
            surface(clipped,fill);if(border){ctx.beginPath();trace(clipped);ctx.closePath();ctx.strokeStyle=equipmentColor(paintEmphasis>0?'#b4e9e8':border);ctx.lineWidth=.8;ctx.stroke()}
          }});
        });
      }
      function member(a,b,kind,equipment){
        function segment(p,q){parts.push({equipment:equipment,submerged:(p[1]+q[1])<0,z:(project(p).z+project(q).z)/2,draw:function(){drawTube(p,q,kind)}})}
        if((a[1]<0)!==(b[1]<0)){const contact=mix(a,b,-a[1]/(b[1]-a[1]));segment(a,contact);segment(contact,b)}else segment(a,b);
      }
      function panel(corners,fill){polygonPart(corners,fill,null,null)}
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
        parts.push({ submerged:true,z: project(fairlead).z, draw: function () {
          const q = project(fairlead);
          ctx.beginPath(); ctx.arc(q.x, q.y, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = '#e8c887'; ctx.fill();
          ctx.strokeStyle = '#293943'; ctx.lineWidth = 1.2; ctx.stroke();
        } });
        parts.push({ submerged:true,z: project(anchor).z, draw: function () {
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
      let deviceKind="feed";
      function equipmentBox(cx,cy,cz,dx,dy,dz,accent) {
        const corners=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(p=>[cx+p[0]*dx/2,cy+p[1]*dy/2,cz+p[2]*dz/2]);
        const fills=accent==='opening'?['#102834','#112c36','#102834','#284754','#173541','#173541']:accent?['#357b85','#84d1db','#276b78','#b7edf0','#4fa0ad','#448c99']:['#7397a9','#9cbdcc','#587a8e','#d9eaf0','#8eafc0','#638797'];
        [[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[1,5,6,2],[0,3,7,4]].forEach((face,i)=>{
          const points=face.map(n=>corners[n]);
          polygonPart(points,fills[i],deviceKind,'#416475');
        });
      }
      const devices=devicePositions(),f=devices.feed,w=devices.water;
      // Conceptual placement on the walkway; dimensions are visual proportions only.
      equipmentBox(f[0],.95,f[2],.55,.54,.50);
      equipmentBox(f[0],1.25,f[2],.62,.06,.57);
      equipmentBox(f[0],.61,f[2],.25,.15,.26);
      [-.21,.21].forEach(x=>[-.18,.18].forEach(z=>equipmentBox(f[0]+x,.49,f[2]+z,.045,.27,.045)));
      equipmentBox(f[0],.39,f[2],.63,.055,.57);
      equipmentBox(f[0],.59,f[2]-.34,.18,.11,.40);
      equipmentBox(f[0],.59,f[2]-.545,.14,.07,.006,"opening");
      equipmentBox(f[0],.98,f[2]-.255,.20,.09,.018,true);
      deviceKind="water";
      equipmentBox(w[0],-.12,w[2],.14,.80,.14);
      equipmentBox(w[0],.32,w[2],.19,.065,.19,true);
      equipmentBox(w[0],.54,w[2],.025,.38,.025);
      equipmentBox(w[0],-.59,w[2],.06,.17,.06,true);
      equipmentBox(w[0],.35,w[2]+.08,.28,.04,.04);
      global.addMarineEquipment({positions:devices,box:equipmentBox,tube:(a,b,kind)=>member(a,b,kind||'rail',deviceKind),face:(points,fill)=>polygonPart(points,fill,deviceKind,null),kind:name=>deviceKind=name});
      cloud.forEach(function (point,index) {
        point.position.forEach(function(value,i){point.position[i]+=(point.target[i]-value)*.08});
        const q=project(point.position);
        parts.push({fish:true,submerged:true,z:q.z,draw:function(){drawFish(point,index)}});
      });
      equipmentCounts={};parts.forEach(p=>{if(p.equipment)equipmentCounts[p.equipment]=(equipmentCounts[p.equipment]||0)+1});
      parts.sort(function (a, b) { return b.z - a.z; });
      layerCounts={above:parts.filter(p=>!p.submerged).length,submerged:parts.filter(p=>p.submerged).length};
      function paint(part){paintEmphasis=part.equipment?(emphasis[part.equipment]||0):0;ctx.globalAlpha=part.fish?.9*Math.max(.3,view.context):part.equipment?1+Math.min(0,paintEmphasis)*.58:view.context;part.draw();paintEmphasis=0}
      ctx=underContext;ctx.clearRect(0,0,width,height);parts.filter(p=>p.submerged).forEach(paint);ctx.globalAlpha=1;
      ctx=reflectionContext;ctx.clearRect(0,0,width,height);mirrorProjection=true;parts.filter(p=>!p.submerged).forEach(paint);mirrorProjection=false;ctx.globalAlpha=1;
      ctx=mainContext;ctx.globalAlpha=1;
      const opticalWater=drawEnvironment();
      if(!opticalWater){ctx.globalAlpha=.12;ctx.drawImage(reflectionCanvas,0,0,width,height);ctx.globalAlpha=.62;ctx.drawImage(underCanvas,0,0,width,height);ctx.globalAlpha=1}
      parts.filter(p=>!p.submerged).forEach(paint);ctx.globalAlpha=1;
      if(anchorListener)anchorListener();

    }
    function frame(now) {
      previous = now;
      updateCamera(now);
      // 静置时只缓慢变化水纹；保留用户选择的视角。
      if(canvas.parentElement.dataset.visible!=='false'&&!document.hidden&&canvas.clientWidth>0&&canvas.clientHeight>0)draw();
      raf = global.requestAnimationFrame(frame);
    }
    function onDown(event) {
      if(flight)flight.cameraCancelled=true;dragging = true; lastX = event.clientX; lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    }
    function onMove(event) {
      if (!dragging) return;
      view.yaw += (event.clientX - lastX) * 0.008;
      view.pitch = Math.max(0.12, Math.min(1.05, view.pitch + (event.clientY - lastY) * 0.005));
      lastX = event.clientX; lastY = event.clientY;
    }
    function onUp() { dragging = false; }
    function onWheel(event) {
      event.preventDefault();if(flight)flight.cameraCancelled=true;
      view.zoom=Math.max(.45,Math.min(4.8,view.zoom-event.deltaY*.001));
    }
    function onKey(event) {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();if(flight)flight.cameraCancelled=true;
      view.yaw += event.key === 'ArrowLeft' ? -0.12 : event.key === 'ArrowRight' ? 0.12 : 0;
      view.pitch = Math.max(0.12, Math.min(1.05, view.pitch + (event.key === 'ArrowUp' ? 0.08 : event.key === 'ArrowDown' ? -0.08 : 0)));
    }
    canvas.addEventListener('keydown', onKey);
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
      setFocus:setFocus,
      setAnchorListener:fn=>anchorListener=fn,
      getEquipmentState:()=>({positions:devicePositions(),parts:{...equipmentCounts},emphasis:{...emphasis},opacity:Object.fromEntries(Object.keys(emphasis).map(k=>[k,1+Math.min(0,emphasis[k])*.58]))}),
      getMarineState:function(){const f=devicePositions().feed;return {water:waterRenderer?'wave-shader':'canvas-fallback',fishCount:cloud.length,fishHeadings:cloud.map((p,i)=>fishHeading(i,reducedMotion?0:previous*.001)),waterLayers:true,layers:{...layerCounts},feeder:{position:f.slice(),outlet:[f[0],.59,f[2]-.545]}}},
      getCameraState:function(){return {focus:focusName,moving:!!flight&&!flight.cameraCancelled,layoutMoving:!!flight,emphasisMoving:!!emphasisFlight,viewport:viewportRect(),transitionFrom:flight?{tx:flight.from.tx,zoom:flight.from.zoom,yaw:flight.from.yaw}:null,yaw:view.yaw,pitch:view.pitch,zoom:view.zoom,tx:view.tx,ty:view.ty,tz:view.tz,context:view.context}},
      getAnchors:function(){const positions=devicePositions(),out={};Object.keys(positions).forEach(k=>out[k]=project(positions[k]));return out},
      resetView:function(){setFocus(focusName==='mooring'?'overview':focusName,true)},
      setSpec: setSpec,
      setPointCloud: setPointCloud,
      setMooringView:function(enabled){setFocus(enabled?'mooring':'overview',true)},
      dispose: function () {
        cloud = []; cloudData = null;if(waterRenderer)waterRenderer.dispose();
        global.cancelAnimationFrame(raf);
        if (observer) observer.disconnect(); else global.removeEventListener('resize', resize);
        canvas.removeEventListener('keydown', onKey);
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        canvas.removeEventListener('wheel', onWheel);
      }
    };
  }
  global.ExhibitCage = {
    geometry: geometry,
    mapPoint: mapPoint,
    mount: function (canvas) {
      canvas.classList.add('struct-truss-share-canvas');
      return mountCageModel(canvas);
    }
  };
})(window);
