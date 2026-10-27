// Shared cage coordinates; visual placement, not surveyed installation dimensions.
window.addMarineEquipment=function(g){
 const {positions:p,box,tube,face,kind}=g;
 [p.light,[1.25,p.light[1],p.light[2]]].forEach((a,i)=>{
  kind(i?'light-secondary':'light');
  const [x,y,z]=a;
  box(x,.38,z,.20,.08,.24);tube([x,.42,z],[x,y,z]);
  tube([x,y,z],[x,y,z+.48]);box(x,y-.08,z+.43,.44,.12,.28);
  face([[x-.17,y-.15,z+.32],[x+.17,y-.15,z+.32],[x+.17,y-.15,z+.54],[x-.17,y-.15,z+.54]],'#b4dadd');
 });
 [p.crane,[-p.crane[0],p.crane[1],p.crane[2]]].forEach((a,i)=>{
  kind(i?'crane-secondary':'crane');
  const [x,y,z]=a;
  box(x,.39,z,.60,.09,.34);
  [-.21,.21].forEach(dx=>box(x+dx,.59,z,.08,.34,.30));
  // Drum axis along X, cable runs inboard to the net edge.
  for(let i=0;i<16;i++){
   const a=i*Math.PI/8,b=(i+1)*Math.PI/8;
   face([[x-.18,y+Math.sin(a)*.15,z+Math.cos(a)*.15],[x+.18,y+Math.sin(a)*.15,z+Math.cos(a)*.15],[x+.18,y+Math.sin(b)*.15,z+Math.cos(b)*.15],[x-.18,y+Math.sin(b)*.15,z+Math.cos(b)*.15]],i%2?'#90adb9':'#607e8c');
  }
  [-.22,.22].forEach(dx=>face(Array.from({length:16},(_,i)=>[x+dx,y+Math.sin(i*Math.PI/8)*.18,z+Math.cos(i*Math.PI/8)*.18]),'#9bb8c3'));
  box(x+.34,.57,z,.17,.20,.23,true);
  tube([x,y+.15,z],[x,.63,z+.18],'chain');
  tube([x,.63,z+.18],[x,-.30,z+.18],'chain');
 });
 kind('camera');
 const c=p.camera;
 box(c[0],.40,c[2]-.18,.18,.08,.24);tube([c[0],.38,c[2]-.18],[c[0],c[1],c[2]-.18]);
 box(c[0],c[1],c[2],.22,.17,.30);box(c[0],c[1],c[2]+.16,.15,.12,.02,'opening');
 box(c[0]-.08,c[1]+.04,c[2]+.16,.025,.025,.02,true);
 kind('energy');
 const e=p.energy;
 [-.30,.30].forEach(dx=>tube([e[0]+dx,.35,e[2]],[e[0]+dx,.80,e[2]]));
 box(e[0],.83,e[2],1.08,.06,.35);
 for(let i=0;i<6;i++)for(let j=0;j<2;j++)box(e[0]-.44+i*.176,.867,e[2]-.08+j*.16,.153,.012,.132,'opening');
 const b=p.battery;
 box(b[0],.66,b[2],.36,.60,.29);box(b[0],.97,b[2],.41,.04,.34);
 box(b[0],.75,b[2]+.153,.12,.08,.015,true);
 [0,1,2].forEach(i=>box(b[0],.49+i*.06,b[2]+.15,.20,.012,.012,'opening'));
 kind('tension');const t=p.tension;
 tube([t[0],t[1]+.09,t[2]],[t[0],t[1]-.09,t[2]],'chain');
 box(t[0],t[1],t[2],.15,.17,.10,true);
 kind('pose');const s=p.pose;
 tube([s[0],.34,s[2]],[s[0],s[1]-.06,s[2]]);
 box(s[0],s[1],s[2],.21,.12,.20);box(s[0],s[1]+.07,s[2],.12,.025,.11,true);
 kind('net');const n=p.net;
 box(n[0],n[1],n[2],.13,.20,.08,true);
 tube([n[0],n[1]+.1,n[2]],[n[0],-.24,n[2]],'netTie');
};
