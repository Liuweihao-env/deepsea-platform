/* 程序海面：共用场景相机，波浪法线、天空反射和视角反光；不代表现场海况。 */
window.createMarineWater=function(){
  const surface=document.createElement('canvas');
  const gl=surface.getContext('webgl',{alpha:false,antialias:false,depth:false,preserveDrawingBuffer:true});
  if(!gl)return null;
  const vertex='attribute vec2 aPosition;void main(){gl_Position=vec4(aPosition,0.0,1.0);}';
  const fragment=`precision highp float;
  uniform vec2 uResolution;
  uniform vec2 uSize;
  uniform vec4 uCamera;
  uniform vec3 uTarget;
  uniform float uTime;
  uniform vec2 uCage;
  uniform float uFishView;
  uniform sampler2D uSubmerged;
  uniform sampler2D uReflection;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
  float sea(vec2 p){
    vec2 distort=vec2(noise(p*.8+uTime*.025),noise(p*.8+17.0))*1.2;
    p+=distort;
    return sin(dot(p,vec2(1.,.4))*3.2+uTime*.65)*.035
      +sin(dot(p,vec2(-.4,.9))*7.1-uTime*.9)*.016
      +sin(dot(p,vec2(.7,.8))*17.0+uTime*1.3)*.008
      +sin(dot(p,vec2(-.8,.3))*42.0-uTime*1.7+sin(p.x*3.0))*.0035
      +sin(dot(p,vec2(.6,-.8))*85.0+uTime*1.9)*.0017;
  }
  vec3 sky(vec3 direction){
    float h=clamp(direction.y,0.,1.);
    vec3 color=mix(vec3(.22,.34,.43),vec3(.075,.20,.32),pow(h,.6));
    float cloud=smoothstep(.45,.8,noise(direction.xz/(abs(direction.y)+.3)*2.0+uTime*.003));
    return color+cloud*.055;
  }
  void main(){
    vec2 uv=gl_FragCoord.xy/uResolution;uv.y=1.-uv.y;
    float cy=cos(uCamera.x),sy=sin(uCamera.x),cp=cos(uCamera.y),sp=sin(uCamera.y);
    float scale=min(uSize.x,uSize.y)*1.4*uCamera.z;
    float nx=(uv.x-.5)*uSize.x/scale,ny=(uCamera.w-uv.y)*uSize.y/scale;
    vec3 eye=uTarget+vec3(9.2*cp*sy,9.2*sp,9.2*cp*cy);
    float dz=-ny*sp-cp;
    vec3 ray=normalize(vec3(nx*cy+dz*sy,ny*cp-sp,-nx*sy+dz*cy));
    if(ray.y>-.012){gl_FragColor=vec4(sky(ray)*.7,1.);return;}
    float travel=-eye.y/ray.y;
    vec3 hit=eye+ray*travel;
    for(int i=0;i<2;i++){travel=(sea(hit.xz)-eye.y)/ray.y;hit=eye+ray*travel;}
    float e=.018+min(max(travel,0.)*.0015,.08);
    vec3 normal=normalize(vec3(sea(hit.xz-vec2(e,0.))-sea(hit.xz+vec2(e,0.)),2.*e,sea(hit.xz-vec2(0.,e))-sea(hit.xz+vec2(0.,e))));
    vec3 light=normalize(vec3(-.45,.72,-.36));
    float fresnel=.06+.78*pow(1.-clamp(dot(normal,-ray),0.,1.),4.);
    float diffuse=.55+.45*max(dot(normal,light),0.);
    vec3 reflected=reflect(ray,normal);
    vec3 deep=vec3(.018,.105,.155),shallow=vec3(.035,.205,.255);
    vec3 water=mix(deep,shallow,clamp(normal.y*.7+sea(hit.xz)*1.8,0.,1.))*diffuse;
    vec3 color=mix(water,sky(reflected),fresnel);
    float floatDistance=length(max(vec2(abs(hit.x)-uCage.x*.5,abs(abs(hit.z)-uCage.y*.5)-.055),0.));
    float contact=exp(-floatDistance*15.0);
    color*=1.-contact*.24;
    vec2 distortion=normal.xz*vec2(.002,.0015)/(1.+max(travel,0.)*.02);
    vec4 reflection=texture2D(uReflection,clamp(uv+distortion*1.2,vec2(0.),vec2(1.)));
    color=mix(color,reflection.rgb*vec3(.36,.54,.65),reflection.a*(.06+fresnel*.12));
    vec4 under=texture2D(uSubmerged,clamp(uv+distortion,vec2(0.),vec2(1.)));
    vec3 submerged=under.rgb*vec3(.57,.80,.88)+vec3(.006,.022,.027);
    float clarity=(.82+uFishView*.10)*(1.-fresnel*.55);
    color=mix(color,submerged,under.a*clarity);
    float spec=max(dot(reflect(-light,normal),-ray),0.);
    color+=vec3(.72,.83,.85)*(pow(spec,160.)*.38+pow(spec,24.)*.04);
    float distanceFog=1.-exp(-max(travel,0.)*.018);
    color=mix(color,vec3(.075,.17,.24),distanceFog*.65);
    gl_FragColor=vec4(pow(color,vec3(.86)),1.);
  }`;
  function compile(type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){gl.deleteShader(shader);return null}return shader}
  const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
  if(!vs||!fs)return null;
  const program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))return null;
  gl.deleteShader(vs);gl.deleteShader(fs);gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const attribute=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
  const locations={};['uResolution','uSize','uCamera','uTarget','uTime','uCage','uFishView','uSubmerged','uReflection'].forEach(key=>locations[key]=gl.getUniformLocation(program,key));
  function texture(){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t}
  const submergedTexture=texture(),reflectionTexture=texture();
  let lastKey='';
  return {draw:function(ctx,width,height,view,time,underCanvas,reflectionCanvas,sceneKey){
    if(gl.isContextLost())return false;
    const rw=Math.round(Math.min(width,1100)),rh=Math.max(1,Math.round(height*rw/width));
    if(surface.width!==rw||surface.height!==rh){surface.width=rw;surface.height=rh;lastKey=''}
    const key=[rw,rh,view.yaw,view.pitch,view.zoom,view.centerY,view.tx,view.ty,view.tz,view.context,view.length,view.breadth,sceneKey,time].join(':');
    if(key!==lastKey){
      gl.viewport(0,0,rw,rh);gl.useProgram(program);
      gl.uniform2f(locations.uResolution,rw,rh);gl.uniform2f(locations.uSize,width,height);
      gl.uniform4f(locations.uCamera,view.yaw,view.pitch,view.zoom,view.centerY);gl.uniform3f(locations.uTarget,view.tx,view.ty,view.tz);gl.uniform1f(locations.uTime,time);
      gl.uniform2f(locations.uCage,view.length,view.breadth);gl.uniform1f(locations.uFishView,sceneKey.startsWith('stock:')?1:0);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,submergedTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,underCanvas);gl.uniform1i(locations.uSubmerged,0);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,reflectionTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,reflectionCanvas);gl.uniform1i(locations.uReflection,1);
      gl.drawArrays(gl.TRIANGLES,0,6);lastKey=key;
    }
    ctx.drawImage(surface,0,0,width,height);return true;
  },dispose:function(){gl.deleteBuffer(buffer);gl.deleteTexture(submergedTexture);gl.deleteTexture(reflectionTexture);gl.deleteProgram(program);}};
};
