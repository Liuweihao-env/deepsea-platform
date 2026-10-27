'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
(async()=>{let changed=false;const requests=[];
const s={console,setInterval:()=>1,clearInterval:()=>{},__API_BASE__:'',API:{},fetch:(url,options)=>{requests.push({url,options});let data=[];if(url==='/api/farm/cage/species'){changed=true;data={ok:true};}else if(url==='/api/farm')data={cages:[{cage_id:'cage_01',species:changed?'大黄鱼':'旧鱼种'}]};return Promise.resolve({ok:true,json:()=>Promise.resolve(data)});}};
s.window=s;vm.createContext(s);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../frontend/api-remote.js'),'utf8'),s);
const result=await s.API.setCageSpecies('cage_01','大黄鱼');assert.equal(result.ok,true);assert.equal(s.API.farm().cages[0].species,'大黄鱼');assert.equal(JSON.parse(requests.find(r=>r.url==='/api/farm/cage/species').options.body).cage_id,'cage_01');console.log('PASS farm mutation refresh resolves and retains saved species response');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
