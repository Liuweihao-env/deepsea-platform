/* Approved exhibition layout: persistent scene and fixed-screen navigation. */
(function (global) {
  'use strict';
  const links={feed:['投喂机','/ai/feed'],water:['水质探头','/env/water'],light:['补光灯具','/ai/light'],crane:['网衣绞车','/ai/crane'],camera:['观测相机','/fish/monitor'],energy:['光伏与储能','/mgmt/energy'],pose:['姿态测点','/struct/detail']};
  let viewer=null,slot=null,lastFocus=null,lastCage=null,lastSpec=null,lastRect=null,scheduled=0,poll=null,request=0,unsub=null;
  const screenGroups=new Set();
  function visibleScreens(){return Array.from(screenGroups).filter(vm=>vm.$el&&vm.$el.offsetWidth>0&&getComputedStyle(vm.$el).visibility!=='hidden').pop()||null;}
  if(global.echarts)global.echarts.registerTheme('marine',{color:['#9bdce6','#dfc195','#98c6b0','#b8a8cf'],backgroundColor:'transparent',textStyle:{color:'#abc7d6',fontFamily:'Microsoft YaHei'},title:{textStyle:{color:'#d5eaf3'}},legend:{textStyle:{color:'#b0cad7'}},tooltip:{backgroundColor:'#0c2e43',borderColor:'#557d92',textStyle:{color:'#deeff6'}},categoryAxis:{axisLine:{lineStyle:{color:'#4a7087'}},axisLabel:{color:'#a9c4d3'},splitLine:{lineStyle:{color:'#294c62'}}},valueAxis:{axisLine:{lineStyle:{color:'#4a7087'}},axisLabel:{color:'#a9c4d3'},splitLine:{lineStyle:{color:'#294c62'}}}});
  function fit(){
    document.documentElement.style.setProperty('--show-fit',String(Math.min(innerWidth/1600,innerHeight/900)));
    schedule();
  }
  function labels(){
    if(!viewer||!slot)return;
    const parent=document.querySelector('#show-scene'),anchors=viewer.getAnchors(),wide=slot.dataset.focus==='overview',placed=[];
    for(const button of parent.querySelectorAll('[data-equipment]')){
      const p=anchors[button.dataset.equipment];if(!p)continue;
      const w=button.offsetWidth,h=button.offsetHeight,minX=wide?330:12,maxX=parent.clientWidth-(wide?330:12);
      let x=Math.max(minX,Math.min(maxX-w,p.x-w/2)),y=Math.max(wide?135:36,Math.min(parent.clientHeight-(wide?145:40),p.y-40));
      for(const r of placed)if(x<r.x+r.w+8&&x+w+8>r.x&&y<r.y+r.h+6&&y+h+6>r.y)y=r.y+r.h+6;
      y=Math.min(parent.clientHeight-h-12,y);placed.push({x,y,w,h});button.style.transform='translate('+x+'px,'+y+'px)';
    }
    parent.dataset.moving=String(viewer.getCameraState().moving);
  }
  function init(){
    if(viewer)return;
    const canvas=document.querySelector('#show-model');if(!canvas)return;
    viewer=global.ExhibitCage.mount(canvas);viewer.setAnchorListener(labels);
    fit();window.addEventListener('resize',fit);window.addEventListener('hashchange',schedule);
    unsub=global.CurrentCage.subscribe(function(){request++;if(viewer)viewer.setPointCloud(null);schedule();fetchCloud();});
    global.API.subscribe(schedule);
    poll=setInterval(fetchCloud,3000);
    schedule();
  }
  function schedule(){if(scheduled)cancelAnimationFrame(scheduled);scheduled=requestAnimationFrame(refresh);}
  function refresh(){
    scheduled=0;init();if(!viewer)return;
    const parent=document.querySelector('#show-scene'),overlay=document.querySelector('.secondary-surface.is-open,.show-confirm');
    const next=overlay?null:Array.from(document.querySelectorAll('.show-scene-slot')).find(el=>el.offsetWidth>0&&el.offsetHeight>0);
    if(!next){slot=null;parent.dataset.visible='false';return;}
    const changedSlot=slot!==next,visible=parent.dataset.visible==='true';slot=next;
    const stage=document.querySelector('.shell').getBoundingClientRect(),r=slot.getBoundingClientRect(),scale=Number(getComputedStyle(document.documentElement).getPropertyValue('--show-fit'))||1;
    const full=slot.dataset.full==='true',rect=full?[0,116,1600,722]:[(r.left-stage.left)/scale,(r.top-stage.top)/scale,r.width/scale,r.height/scale];
    const cage=global.CurrentCage.cage(),id=global.CurrentCage.get(),focus=slot.dataset.focus||'overview',spec=JSON.stringify(cage&&cage.spec);
    const rectChanged=!lastRect||rect.some((n,i)=>Math.abs(n-lastRect[i])>1);
    parent.dataset.visible='true';viewer.setSpec(cage&&cage.spec,id);
    if(focus!==lastFocus||id!==lastCage||spec!==lastSpec||changedSlot||rectChanged)viewer.setFocus(focus,visible&&lastFocus!==null,rect);
    const cageChanged=id!==lastCage;lastFocus=focus;lastCage=id;lastSpec=spec;lastRect=rect;
    if(slot.__pointCloud!==undefined)viewer.setPointCloud(slot.__pointCloud);
    const keys=focus==='overview'?['feed','water','light','crane','camera','energy','pose']:links[focus]?[focus]:[];
    const labelHost=document.querySelector('#show-equipment'),labelKey=focus+':'+keys.join(',');
    if(labelHost.dataset.key!==labelKey){labelHost.dataset.key=labelKey;labelHost.innerHTML=keys.map(k=>'<a data-equipment="'+k+'" href="#'+links[k][1]+'" aria-current="'+(k===focus?'true':'false')+'">'+links[k][0]+'</a>').join('');}
    labels();if(changedSlot||cageChanged)fetchCloud();
  }
  function fetchCloud(){
    if(!viewer||!slot||slot.__pointCloud!==undefined||typeof global.__API_BASE__==='undefined')return;
    const ticket=++request,id=global.CurrentCage.get();
    fetch((global.__API_BASE__||'')+'/api/fish/positions3d?cage_id='+encodeURIComponent(id)).then(r=>{if(!r.ok)throw Error('cloud');return r.json();}).then(d=>{
      if(ticket!==request||id!==global.CurrentCage.get()||!slot||slot.__pointCloud!==undefined)return;
      viewer.setPointCloud(!d.offline&&d.data?d.data:null);
    }).catch(()=>{if(ticket===request&&viewer)viewer.setPointCloud(null);});
  }
  global.Exhibit={init,schedule,viewer:function(){init();return viewer;},screenState:function(){const vm=visibleScreens();return vm?{index:vm.screen,count:vm.labels.length}:{index:0,count:1};},step:function(delta){const vm=visibleScreens();if(!vm)return false;const next=vm.screen+delta;if(next<0||next>=vm.labels.length)return false;vm.pick(next);return true;}};
  global.C.SceneSlot={
    props:{focus:{type:String,default:'overview'},full:Boolean,pointCloud:{type:Object,default:undefined}},
    mounted:function(){this.sync();},updated:function(){this.sync();},beforeUnmount:function(){schedule();},
    methods:{sync:function(){this.$el.__pointCloud=this.pointCloud;schedule();},reset:function(){const v=global.Exhibit.viewer();if(v)v.setFocus(this.focus,true);},mooring:function(){const v=global.Exhibit.viewer();if(v)v.setFocus('mooring',true);}},
    template:'<div class="show-scene-slot" :data-focus="focus" :data-full="full"><div class="show-model-actions"><button @click="reset">重置视角</button><button @click="mooring">系泊全貌</button></div></div>'
  };
  global.C.ShowScreens={
    props:{labels:{type:Array,default:function(){return[];}}},data:function(){return{screen:0};},
    mounted:function(){screenGroups.add(this);window.dispatchEvent(new Event('show-screen-change'));},beforeUnmount:function(){screenGroups.delete(this);},
    methods:{pick:function(i){this.screen=i;this.$nextTick(function(){schedule();window.dispatchEvent(new Event('show-screen-change'));});}},
    template:'<section class="show-screens"><nav class="show-screen-tabs" aria-label="页内分屏"><button v-for="(label,i) in labels" :key="i" :aria-pressed="screen===i" @click="pick(i)">{{label}}</button></nav><div class="show-screen-body" :data-screen="screen"><slot :screen="screen"></slot></div></section>'
  };
  global.C.PagedRecords={
    props:{items:{type:Array,default:function(){return[];}},size:{type:Number,default:6}},data:function(){return{page:0};},
    computed:{pages:function(){return Math.max(1,Math.ceil(this.items.length/this.size));},rows:function(){const p=Math.min(this.page,this.pages-1);return this.items.slice(p*this.size,(p+1)*this.size);}},
    watch:{pages:function(n){this.page=Math.min(this.page,n-1);}},
    template:'<div class="show-records"><div class="show-record-table"><slot :rows="rows"></slot><div v-if="!items.length" class="empty">暂无符合条件的记录</div></div><div class="show-record-pager"><span>共 {{items.length}} 条</span><div><button :disabled="page===0" @click="page--">上一页</button><span>{{page+1}} / {{pages}}</span><button :disabled="page>=pages-1" @click="page++">下一页</button></div></div></div>'
  };
})(window);
