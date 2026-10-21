'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.message); }
}
function context(stored, loaded = true) {
  const memory = new Map(Object.entries(stored || {})), listeners = {}, subs = [];
  const cages = [
    {cage_id:'cage_01',site_id:'site_04',site_name:'嵊山',spec:{length_m:20,width_m:20,depth_m:6}},
    {cage_id:'cage_02',site_id:'site_03',site_name:'小麦岛',spec:{length_m:18,width_m:18,depth_m:6}}
  ];
  const s = {console, setInterval:()=>1,clearInterval:()=>{},location:{hash:'#/overview'},
    localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v))},
    addEventListener:(n,f)=>(listeners[n]||(listeners[n]=[])).push(f),
    removeEventListener:(n,f)=>{listeners[n]=(listeners[n]||[]).filter(x=>x!==f);},
    dispatchEvent:e=>(listeners[e.type]||[]).forEach(f=>f(e)),
    CustomEvent:function(type,options){this.type=type;this.detail=options.detail;},
    C:{}, PAGES:{},CN:{deviceType:t=>({feeder:'投饵机',light:'补光灯',sensor:'传感器'}[t]||'设备')},
    Vue:{createApp:app=>{s.App=app;return {config:{globalProperties:{}},component:()=>{},mount:()=>{}};}}
  };
  s.API={farm:()=>loaded?{cages}:null,sites:()=>[{site_id:'site_01',kind:'farm'},{site_id:'site_03',kind:'obs'},{site_id:'site_04',kind:'obs'}],
    _bump:()=>subs.slice().forEach(f=>f()),subscribe:f=>{subs.push(f);return()=>{const i=subs.indexOf(f);if(i>=0)subs.splice(i,1);};},
    resolve:(v,cb)=>v&&v.then?v.then(cb):cb(v),devices:()=>[],alarms:()=>[],farmDevices:()=>({devices:[]}),
    bind:(instance,load)=>s.API.subscribe(()=>{instance.tick++;load.call(instance);})};
  s.window=s;vm.createContext(s);
  for(const file of ['frontend/pages/env.js','frontend/pages/overview.js','frontend/app.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),s,{filename:file});
  s.ready=()=>{loaded=true;s.API._bump();};s.subs=subs;s.memory=memory;
  return s;
}
function instance(def) {
  const obj=Object.assign({},def.data());
  Object.entries(def.methods||{}).forEach(([k,f])=>obj[k]=f.bind(obj));
  Object.entries(def.computed||{}).forEach(([k,f])=>Object.defineProperty(obj,k,{get:()=>f.call(obj)}));
  obj.$nextTick=f=>f();obj.$refs={};return obj;
}
test('stored cage synchronizes legacy key on reload',()=>{
  const s=context({'deepsea.currentCage':'cage_02','deepsea_cage':'cage_01'});
  assert.equal(s.CurrentCage.get(),'cage_02');assert.equal(s.memory.get('deepsea_cage'),'cage_02');
});
test('legacy-only storage migrates to the canonical key',()=>{
  const s=context({'deepsea_cage':'cage_02'});
  assert.equal(s.CurrentCage.get(),'cage_02');assert.equal(s.memory.get('deepsea.currentCage'),'cage_02');
});
test('unknown current cage cannot replace a configured cage',()=>{
  const s=context();s.CurrentCage.set('not-a-cage');assert.equal(s.CurrentCage.get(),'cage_01');
});
test('invalid stored cage normalizes all state when farm arrives late',()=>{
  const s=context({'deepsea.currentCage':'invalid','deepsea_cage':'invalid'},false);
  s.ready();assert.equal(s.CurrentCage.site(),'site_04');assert.equal(s.CurrentCage.get(),'cage_01');
  assert.equal(s.memory.get('deepsea.currentCage'),'cage_01');
  assert.equal(s.memory.get('deepsea_cage'),'cage_01');assert.equal(s.__currentCage,'cage_01');
});
test('switching from a page synchronizes the topbar',()=>{
  const s=context(),app=instance(s.App);s.App.mounted.call(app);
  s.CurrentCage.set('cage_02');assert.equal(app.curCageId,'cage_02');
});
test('API.bind reloads on cage/site readiness rather than every alarm poll',()=>{
  const s=context({},false),code=fs.readFileSync(path.join(root,'frontend/api-remote.js'),'utf8');
  const start=code.indexOf('  M.bind = function');
  s.M=s.API;s.global=s;s.API.onSeriesRefresh=()=>()=>{};
  vm.runInContext(code.slice(start,code.indexOf('\n  };',start)+5),s);
  let calls=0;const p={tick:0};const stop=s.API.bind(p,()=>calls++);
  s.ready();assert.equal(calls,1);s.API._bump();assert.equal(calls,1);
  s.CurrentCage.set('cage_02');assert.equal(calls,2);stop();s.API._bump();assert.equal(calls,2);
});
for(const route of ['/env/sea','/env/water']){
  test(route+' initially follows cage and changes with it',()=>{
    const s=context(),def=s.PAGES[route],p=instance(def);p.load=()=>{};p.renderChart=()=>{};
    def.mounted.call(p);assert.equal(p.site,'site_04');
    s.CurrentCage.set('cage_02');assert.equal(p.site,'site_03');
    p.setSite('site_04');assert.equal(s.CurrentCage.get(),'cage_02');assert.equal(p.followCage,false);
    s.CurrentCage.set('cage_01');assert.equal(p.site,'site_04');assert.equal(p.followCage,true);
    def.beforeUnmount.call(p);const old=p.site;
    s.CurrentCage.set('cage_02');assert.equal(p.site,old);
  });
  test(route+' resolves asynchronous farm without overriding manual selection',()=>{
    const s=context({},false),def=s.PAGES[route],p=instance(def);p.load=()=>{};p.renderChart=()=>{};
    def.mounted.call(p);s.ready();assert.equal(p.site,'site_04');
    p.setSite('site_03');s.API._bump();assert.equal(p.site,'site_03');def.beforeUnmount.call(p);
    assert.equal(s.subs.length,0);
  });
}
test('overview device and alarm summaries use current cage and Chinese names',()=>{
  const s=context();
  s.API.devices=()=>[{device_id:'feeder_01',device_type:'feeder',device_online:true},{device_id:'feeder_02',device_type:'feeder',device_online:false}];
  s.API.farmDevices=()=>({devices:[{device_id:'feeder_01',cage_id:'cage_01',metric:'feed_rate'},{device_id:'feeder_02',cage_id:'cage_02',metric:'feed_rate'}]});
  s.API.alarms=()=>[{alarm_event_id:'one',cage_id:'cage_01',alarm_type:'feeding',risk_level:'red',alarm_status:'active'},
    {alarm_event_id:'two',site_id:'site_03',alarm_type:'water_temp',risk_level:'yellow',alarm_status:'active'}];
  const p=instance(s.PAGES['/overview']);
  assert.equal(p.devices.length,1);assert.equal(p.activeCount,1);assert(!/[a-z]_\d/.test(p.deviceName(p.devices[0])));
  s.CurrentCage.set('cage_02');assert.equal(p.devices[0].device_id,'feeder_02');assert.equal(p.unresolved[0].alarm_event_id,'two');
});
test('overview reads monthly oxygen and ignores old-cage async responses',()=>{
  const s=context(),pending=[];
  s.API.env=site=>({then:cb=>pending.push({site,cb})});s.API.fish=()=>[];s.API.struct=()=>[];
  const p=instance(s.PAGES['/overview']);p.load();s.CurrentCage.set('cage_02');p.load();
  pending[1].cb({fast:[{ts:2,water_temp:18}],slow:[{ts:1,dissolved_oxygen:7.2,cadence:'monthly'}]});
  assert.equal(p.env.dissolved_oxygen,7.2);
  pending[0].cb({fast:[{ts:2,water_temp:99}],slow:[]});assert.equal(p.env.water_temp,18);
});
test('browser temperature rules use species and both lower and upper limits',()=>{
  const s=context();vm.runInContext(fs.readFileSync(path.join(root,'frontend/mock.js'),'utf8'),s);
  s.API.remote=true;
  s.API.sites=()=>[{site_id:'site_03',temp_warn_high:25.5,temp_alarm_high:30,temp_warn_low:16.5,temp_alarm_low:4.3}];
  assert.equal(s.API.ruleCheck({site_id:'site_03',water_temp:28}).risk_level,'yellow');
  assert.equal(s.API.ruleCheck({site_id:'site_03',water_temp:3}).rule_id,'R-TEMP-03');
  assert.equal(s.API.ruleCheck({site_id:'site_03',water_temp:21}),null);
});
console.log(passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
