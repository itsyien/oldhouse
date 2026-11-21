import {tr} from './i18n.js';
import {createPhotoTrail} from './photo-trail.js';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {within,RISE,worldStair,stairWalls,stairLandings,stairSurrounds,stairGuard} from './building.js';
const cube=new T.BoxGeometry(1,1,1),cache=new Map();
export function painted(kind){
 if(cache.has(kind))return cache.get(kind);const c=document.createElement('canvas');c.width=c.height=256;const a=c.getContext('2d');
 a.fillStyle=kind==='floor'?'#878476':kind==='wood'?'#6b6049':'#b5b0a0';a.fillRect(0,0,256,256);let seed=991;
 const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<6200;i++){a.fillStyle=`rgba(${rand()>.55?'225,225,201':'31,42,32'},${rand()*.16})`;a.fillRect(rand()*256,rand()*256,kind==='wood'?rand()*50+5:2,kind==='wood'?1:3);}
 if(kind==='floor'){a.strokeStyle='#454e40';a.lineWidth=3;a.strokeRect(1,1,254,254);a.lineWidth=1;a.strokeStyle='#9b9e87';a.strokeRect(7,7,242,242);}
 if(kind==='wall')for(let i=0;i<18;i++){a.fillStyle=`rgba(39,48,31,${rand()*.11})`;a.beginPath();a.ellipse(rand()*256,rand()*256,rand()*19+4,rand()*60+10,0,0,Math.PI*2);a.fill();}
 const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;cache.set(kind,tex);return tex;
}
function label(lines,bg='#233b30',color='#d4d8be',w=512,h=180){
 const c=document.createElement('canvas');c.width=w;c.height=h;const a=c.getContext('2d'),t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;
 t.userData.redraw=()=>{a.fillStyle=bg;a.fillRect(0,0,w,h);a.fillStyle=color;a.textAlign='center';a.textBaseline='middle';for(let i=0;i<lines.length;i++){const text=tr(lines[i]),size=i?22:Math.min(65,h*.40);a.font=`${size}px Microsoft YaHei`;const width=a.measureText?.(text).width||0;if(width>w*.91)a.font=`${size*w*.91/width}px Microsoft YaHei`;a.fillText(text,w/2,h*(lines.length===1?.5:i===0?.40:.79),w*.91);}t.needsUpdate=true;};
 t.userData.redraw();return t;
}

export function lampPower(light,time,reduced,on=true){
 if(!on)return .025;if(!light.faulty)return 1;const period=8+(light.index*7%13),phase=(time+light.index*2.31)%period;
 const distance=Math.min(Math.abs(phase-.9),period-Math.abs(phase-.9));
 const dip=reduced?.62*Math.exp(-((distance/.53)**2)):phase<.15+(light.index%3)*.1?.91:0;
 return (1-dip)*(.94+Math.sin(time*.8+light.index)*.06);
}
export function createWorld(scene,assets,f,state,models={}){
 const east=x=>x+(f.eastExtension||0);
 const root=new T.Group();root.position.y=f.base;scene.add(root);let batches=new Map(),container=root;const owned=[],labels=[],doors=[],interactables=[],fixtures=[],props=[],photos=[],tvs=[],stairGroups=[];
 const mat=(color,map=null,roughness=.95)=>{const m=new T.MeshStandardMaterial({color,map,roughness});owned.push(m);return m;};const bright=f.id===2;
 const mats={wall:mat(bright?0xcec8b2:0xa3aa92,painted('wall')),lower:mat(bright?0x858e7e:0x40594b,painted('wall')),floor:mat(bright?0xa9aa94:0x737e6c,painted('floor')),wood:mat(0x82745a,painted('wood')),metal:mat(0x697d72,null,.55),trim:mat(0x273d33),dark:mat(0x121e1a),cream:mat(0xb4b5a0),red:mat(0x6f4638),paper:mat(0xc0b68f),ceiling:mat(bright?0xc6c8b4:0x7b8774),green:mat(0x526b51)};
 const wardMaterial=new T.MeshStandardMaterial({roughness:.95,metalness:0,map:assets.chiangkaishekPortrait,color:0xc3c2aa});owned.push(wardMaterial);
 function wardPhoto(parent,x,y,z,h,id,rotation=0){const texture=assets.chiangkaishekPortrait,p=new T.Mesh(new T.PlaneGeometry(h*texture.image.width/texture.image.height,h),wardMaterial);p.position.set(x,y,z);p.rotation.y=rotation;p.userData.target=id;p.userData.wardPortrait=true;parent.add(p);interactables.push(p);return p;}
 const glass=new T.MeshBasicMaterial({color:0x7b988a,transparent:true,opacity:.18,depthWrite:false});owned.push(glass);
 const worn=mat(bright?0xb6b5a0:0x939781,painted('floor'),.82);
 function box(x,y,z,w,h,d,m=mats.wall){const g=cube.clone();g.scale(w,h,d);g.translate(x,y,z);if(m.map&&m!==mats.floor&&m!==worn){const p=g.attributes.position,n=g.attributes.normal,u=g.attributes.uv;for(let i=0;i<p.count;i++)u.setXY(i,(Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i))*.65,(Math.abs(n.getY(i))>.5?p.getZ(i):p.getY(i))*.65);}if(!batches.has(m))batches.set(m,[]);batches.get(m).push(g);}
 function geom(g,x,y,z,sx,sy,sz,m,rot=0){g.scale(sx,sy,sz);g.rotateX(rot);g.translate(x,y,z);if(!batches.has(m))batches.set(m,[]);batches.get(m).push(g);}
 function wall(x,z,w,d,glazed=false){if(glazed){box(x,.4,z,w,.8,d,mats.lower);const vertical=d>w;box(x,1.85,z,vertical?.016:w-.06,2.1,vertical?d-.06:.016,glass);for(const side of [-1,1])box(x+(vertical?0:side*(w/2-.025)),1.85,z+(vertical?side*(d/2-.025):0),vertical?w:.05,2.1,vertical?.05:d,mats.metal);box(x,.82,z,w,.04,d,mats.metal);box(x,2.96,z,w,.08,d,mats.metal);return;}box(x,.7,z,w,1.4,d,mats.lower);box(x,2.2,z,w,1.6,d,mats.wall);box(x,.085,z,w+.015,.17,d+.015,mats.trim);box(x,1.43,z,w+.018,.035,d+.018,mats.wood);}
 function sign(x,y,z,w,h,lines,rotation=0,bg,color){const tex=label(lines,bg,color);labels.push(tex);const m=new T.MeshStandardMaterial({roughness:.95,metalness:0,map:tex,side:T.DoubleSide});owned.push(m);const p=new T.Mesh(new T.PlaneGeometry(w,h),m);p.position.set(x,y,z);p.rotation.y=rotation;container.add(p);return p;}
 function flush(){for(const [m,gs]of batches){const g=mergeGeometries(gs);gs.forEach(g=>g.dispose());container.add(new T.Mesh(g,m));}}
 const has=(x,z)=>f.walkableRects.some(r=>within({x,z},r));
 for(let z=f.bounds.minZ;z<f.bounds.maxZ;z++)for(let x=f.bounds.minX;x<f.bounds.maxX;x++)if(has(x+.5,z+.5)){
  const core=x<8&&(z<11||z>=21),flatCore=f.id===1&&z>=21;
  if(!core||flatCore)box(x+.5,-.08,z+.5,1,.16,1,mats.floor);if(!core)box(x+.5,3.08,z+.5,1,.16,1,mats.ceiling);
  if(!has(x-.5,z+.5))wall(x,z+.5,.18,1);if(!has(x+1.5,z+.5))wall(x+1,z+.5,.18,1);
  if(!has(x+.5,z-.5))wall(x+.5,z,1,.18,f.id===1&&x<11&&z===19);if(!has(x+.5,z+1.5)&&!(f.id===1&&x>=5&&x<8))wall(x+.5,z+1,1,.18,f.id===1&&x<11&&z===12);
 }
 for(const w of f.partitions)wall(w.x+w.w/2,w.z+w.d/2,w.w,w.d,w.material==='fixed-glass');
 if(f.id<=2)for(const z of [5,27]){box(27.4,2.75,z+.1,1.8,.5,.2,mats.wall);sign(27.4,2.72,z===5?4.99:27.21,1.1,.25,['公共区'],z===5?Math.PI:0,'#364139','#bdc1ae');}
 box(18+(f.eastExtension||0)/2,-.18,16,14+(f.eastExtension||0),.2,10,mats.dark);
 for(const z of [12,15,18,20]){box(11.13,1.7,z,.05,1.2,1.5,mats.dark);box(11.17,1.7,z,.04,1.05,1.3,mats.metal);box(11.2,1.7,z,.04,1.05,.05,mats.trim);}
 for(const x of [13,17,21,24]){box(x,1.8,11.14,1.5,1.4,.06,mats.dark);box(x,1.8,11.18,1.3,1.2,.04,mats.metal);}
 const titles=f.zones.map(z=>z.label);sign(8.37,2.4,f.arrival==='A'?9.9:22,1.3,.36,[`0${f.id} F`,f.title],Math.PI/2);
 for(const [x,z,yaw,text]of [[18,2.12,0,titles[0]],[east(33.86),9,-Math.PI/2,titles[1]],[east(25.12),16,Math.PI/2,titles[2]],[18,29.86,Math.PI,titles[3]]])sign(x,2.35,z,2.0,.43,[text],yaw);
 for(const [x,z,yaw,text]of [[east(30),2.14,0,'公共通道'],[east(33.85),18,-Math.PI/2,'楼梯间连廊'],[18,29.85,Math.PI,'公共通道']])sign(x,2.6,z,1.4,.28,[text],yaw,'#173b2a','#b9dba4');
 if(f.eastExtension){
  sign(f.id===4?35:33,2.25,4.97,2.4,.4,[f.id===4?'洗衣设备间':'旧档案库'],Math.PI);
  sign(east(33.85),2.5,14,2.2,.4,[f.id===4?'晾晒通道':'画像长廊'],-Math.PI/2);
  const opening=f.id===4?45:39;box(opening,2.78,27.1,2,.44,.2,mats.wall);sign(opening,2.73,27.22,1.7,.24,[f.id===4?'洗衣设备间':'旧档案库']);
  // Pipe drops and inset tile thresholds make the service-wing turns readable without arrows.
  for(const x of f.id===4?[32.4,39.4]:[30.4,36.4]){box(x,2.83,3.5,.14,.16,3,mats.metal);box(x,.008,3.5,.24,.016,2.7,mats.trim);}
 }
 sign(8.37,2.84,f.id===1?24:f.destination.z,1.4,.32,[f.id===1?'室外门厅':`${f.departure} 梯 · 下层通行`],Math.PI/2);
 sign(8.37,1.85,f.arrival==='A'?6:26,1.15,.35,['楼道通行'],Math.PI/2,'#173b2a','#c8d9ae');
 if(f.id<=2){for(const z of [11.83,20.17])sign(32,2.84,z,1.7,.24,['避险房间'],z<16?Math.PI:0,'#173b2a','#c8d9ae');}
 if(f.id===1){sign(6.7,2.3,28.35,1.5,.32,['室外 / EXIT'],Math.PI,'#173b2a','#c8d9ae');sign(6.8,2.2,26.95,1.3,.3,['门厅外廊'],Math.PI,'#173b2a','#c8d9ae');}
 // Scattered polished tiles follow everyday foot traffic without painting a route line.
 for(let i=1;i<f.mainRoute.length;i++){const a=f.mainRoute[i-1],b=f.mainRoute[i],n=Math.floor(Math.hypot(b[0]-a[0],b[1]-a[1])/2.4);for(let j=0;j<n;j++){const t=(j+.5)/n,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;if(x<8.5||f.id===1&&x<9&&z>24)continue;const offset=j%3===0?-.35:.1,tx=Math.floor(x+(a[0]===b[0]?offset:0))+.5,tz=Math.floor(z+(a[1]===b[1]?offset:0))+.5;box(tx,.004,tz,.985,.008,.985,worn);}}
 for(const d of state.doors){
  const frame=new T.Group();frame.position.set(d.x,0,d.z);frame.rotation.y=d.angle;root.add(frame);const pivot=new T.Group();pivot.position.x=-.95;frame.add(pivot);
  const dm=mat(d.kind==='wood'?0x76634b:d.locked?0x454d42:0x556b5c,d.kind==='wood'?painted('wood'):null,.8);
  const mesh=new T.Mesh(new T.BoxGeometry(1.9,2.6,.11),dm);mesh.position.set(.95,1.3,0);pivot.add(mesh);mesh.userData.target=d.id;
  const handle=new T.Mesh(new T.BoxGeometry(.28,.06,.1),mats.metal);handle.position.set(.66,-.06,.09);mesh.add(handle);
  const tex=label([d.title,d.logLock?'使用滚木开锁':d.kind==='wood'?'木门 · 不能久留':d.kind==='exit'?'走到室外':'闭门后离开门口'],'#25372e','#d1d6be',512,200);labels.push(tex);const pm=new T.MeshStandardMaterial({roughness:.95,metalness:0,map:tex,side:T.DoubleSide});owned.push(pm);const plate=new T.Mesh(new T.PlaneGeometry(1.25,.46),pm);plate.position.set(0,.55,.061);mesh.add(plate);plate.userData.target=d.id;
  let logSocket;
  if(d.logLock){
   const socket=new T.Mesh(new T.TorusGeometry(.095,.025,6,12),mats.metal);socket.position.set(0,-.32,.085);socket.userData.target=d.id;mesh.add(socket);interactables.push(socket);
   const hole=new T.Mesh(new T.CircleGeometry(.075,12),mats.dark);hole.position.set(0,-.32,.063);mesh.add(hole);
   logSocket=new T.Mesh(new T.CylinderGeometry(.07,.075,.25,10),mats.wood);logSocket.rotation.x=Math.PI/2;logSocket.position.set(0,-.32,.13);logSocket.visible=!d.locked;mesh.add(logSocket);
  }
  doors.push({...d,pivot,mesh,handle,dm,logSocket,data:d});interactables.push(mesh,plate);
  if(d.wardPortrait){wardPhoto(mesh,0,-.22,.062,.62,d.id);wardPhoto(mesh,0,-.22,-.062,.62,d.id,Math.PI);}
  if(d.axis==='x'){box(d.x,2.84,d.z,.32,.46,2.3,mats.trim);for(const s of [-1,1])box(d.x,1.3,d.z+s*1.06,.32,2.6,.16,mats.trim);}else{box(d.x,2.84,d.z,2.3,.46,.32,mats.trim);for(const s of [-1,1])box(d.x+s*1.06,1.3,d.z,.16,2.6,.32,mats.trim);}
 }
 const chair=(x,z)=>{box(x,.46,z,.52,.09,.55,mats.cream);box(x,.86,z+.24,.52,.75,.08,mats.cream);for(const dx of [-.21,.21])for(const dz of [-.21,.21])box(x+dx,.22,z+dz,.045,.44,.045,mats.metal);};
 for(const o of f.furniture){const x=o.x+o.w/2,z=o.z+o.d/2;
  if(o.name.includes('沙发')){box(x,.42,z,o.w,.55,o.d,mats.green);box(x,.9,z+o.d*.38,o.w,.65,.22,mats.green);for(const s of [-1,1])box(x+s*(o.w/2-.15),.7,z,.3,.6,o.d,mats.wood);for(let j=0;j<3;j++)box(x+(j-1)*1.12,.73,z-.1,1.08,.09,.75,mats.green);}
  else if(o.name.includes('推车')){box(x,.35,z,o.w,.1,o.d,mats.metal);for(const side of [-1,1]){box(x+side*(o.w/2-.04),.73,z,.06,.7,o.d,mats.metal);box(x,.73,z+side*(o.d/2-.04),o.w,.7,.06,mats.metal);}for(const dx of [-1,1])for(const dz of [-1,1])box(x+dx*(o.w/2-.15),.16,z+dz*(o.d/2-.14),.18,.3,.14,mats.dark);for(let j=0;j<3;j++)box(x+(j-1)*.33,.6+j*.08,z,.3,.32,o.d*.66,o.name.includes('档案')?mats.paper:mats.cream);}
  else if(o.name.includes('椅列'))for(let i=0;i<7;i++)chair(o.x+.5+i*.95,z);
  else if(o.name.includes('洗衣机'))for(let i=0;i<4;i++){const px=o.x+.47+i;box(px,.56,z,.9,1.12,o.d,mats.cream);geom(new T.CylinderGeometry(1,1,1,16),px,.58,z+o.d/2+.02,.28,.045,.28,mats.dark,Math.PI/2);box(px,.99,z+o.d/2+.03,.65,.12,.05,mats.metal);}
  else if(/书架|资料柜|储物柜|矮柜|设备柜/.test(o.name)){box(x,.95,z,o.w,1.9,o.d,mats.wood);for(let y=.35;y<1.8;y+=.45){box(x,y,z+o.d/2+.015,o.w-.08,.055,.035,mats.trim);for(let n=0;n<Math.min(12,o.w/.14);n++)box(o.x+.13+n*.14,y+.17,z+o.d/2+.035,.095,.28,.04,n%3?mats.paper:mats.red);}}
  else if(o.name.includes('信箱')){box(x,.3,z,o.w,.6,o.d,mats.trim);box(x,1.35,z,o.w,1.5,o.d,mats.metal);for(let i=0;i<7;i++)for(let j=0;j<3;j++){box(o.x+.3+i*.52,.9+j*.43,z+o.d/2+.02,.46,.36,.04,mats.green);box(o.x+.3+i*.52,.96+j*.43,z+o.d/2+.047,.28,.025,.02,mats.dark);}}
  else if(/台|桌/.test(o.name)){box(x,.85,z,o.w,.16,o.d,/灶|洗|前台|接待/.test(o.name)?mats.cream:mats.wood);if(/台/.test(o.name))box(x,.4,z,o.w-.08,.8,o.d-.08,mats.green);else for(const dx of [-1,1])for(const dz of [-1,1])box(x+dx*(o.w/2-.12),.4,z+dz*(o.d/2-.12),.09,.8,.09,mats.trim);if(o.name.includes('灶'))for(const dx of [-1.4,0,1.4])geom(new T.CylinderGeometry(1,1,1,12),x+dx,.95,z,.22,.03,.22,mats.dark);}
  else if(o.name.includes('晾衣')){for(const s of [-1,1])box(x,1.4,z+s*1.4,.05,2.8,.05,mats.metal);box(x,2.75,z,.05,.06,3,mats.metal);for(let j=0;j<4;j++)box(x,1.8,z-1.2+j*.7,.04,1.6,.55,j%2?mats.cream:mats.paper);}
  else if(o.name.includes('护栏')){for(let j=0;j<9;j++)box(o.x+.2+j*.4,.65,z,.045,1.3,.08,mats.cream);box(x,1.3,z,o.w,.08,.1,mats.red);}
  else if(o.name.includes('长椅')){box(x,.48,z,o.w,.12,o.d,mats.wood);box(x+.4,.85,z,.12,.7,o.d,mats.wood);}
  else {box(x,.45,z,o.w,.9,o.d,mats.wood);box(x-.15,.99,z,o.w*.66,.19,o.d*.8,mats.paper);}
 }
 for(const i of f.interactions){
  const {x,z}=i.target;
  const group=new T.Group();group.position.set(x,0,z);group.rotation.y=i.yaw;root.add(group);
  const attach=(geometry,material,px,py,pz)=>{const o=new T.Mesh(geometry,material);o.position.set(px,py,pz);o.userData.target=i.id;group.add(o);interactables.push(o);return o;};const record={i,group};
  if(i.type==='wardrobe'){
   const half=i.depth/2;
   const hitMaterial=new T.MeshBasicMaterial({visible:false});owned.push(hitMaterial);attach(new T.BoxGeometry(1.25,2.3,.03),hitMaterial,0,1.175,half-.01);
   const sideways=Math.abs(Math.sin(i.yaw))>.5;
   const shell=(px,py,pz,w,h,d)=>box(x+Math.cos(i.yaw)*px+Math.sin(i.yaw)*pz,py,z-Math.sin(i.yaw)*px+Math.cos(i.yaw)*pz,sideways?d:w,h,sideways?w:d,mats.wood);
   shell(0,1.175,-half+.03,1.3,2.35,.06);for(const side of [-1,1])shell(side*.62,1.175,0,.06,2.35,i.depth);shell(0,.04,0,1.3,.08,i.depth);shell(0,2.28,0,1.3,.14,i.depth);
   record.wardrobe=[];
   for(const side of [-1,1]){
    const hinge=new T.Group();hinge.position.set(side*.62,0,half-.02);group.add(hinge);
    const pieces=[[.46,1.98],[1.46,.78],[.035,1.61]].map(([h,y])=>{const g=new T.BoxGeometry(.6,h,.045);g.translate(-side*.31,y,0);return g;});
    const handle=new T.BoxGeometry(.035,.18,.055);handle.translate(-side*.53,1.21,.047);pieces.push(handle);
    const mesh=new T.Mesh(mergeGeometries(pieces),mats.wood);pieces.forEach(g=>g.dispose());mesh.userData.target=i.id;hinge.add(mesh);interactables.push(mesh);record.wardrobe.push({hinge,side});
    if(i.wardPortrait&&side===-1)wardPhoto(hinge,.31,1.98,.029,.43,i.id);
   }
  }
  else if(i.type==='flashlight'){
   attach(new T.BoxGeometry(.46,.85,.46),mats.wood,0,.425,0);
   const torch=new T.Group();group.add(torch);record.torch=torch;
   for(const [radius,length,z]of [[.055,.3,0],[.095,.12,.18]]){const o=new T.Mesh(new T.CylinderGeometry(radius,radius,length,12),mats.metal);o.rotation.x=Math.PI/2;o.position.set(0,.95,z);o.userData.target=i.id;torch.add(o);interactables.push(o);}
   const lensMat=new T.MeshBasicMaterial({color:0xe4efcc});owned.push(lensMat);const lens=new T.Mesh(new T.CircleGeometry(.082,16),lensMat);lens.position.set(0,.95,.242);lens.userData.target=i.id;torch.add(lens);interactables.push(lens);
  }
  else if(i.type==='switch'){const indicatorMat=new T.MeshBasicMaterial({color:0x719471});owned.push(indicatorMat);record.indicator=attach(new T.PlaneGeometry(.045,.035),indicatorMat,.055,1.55,.067);attach(new T.BoxGeometry(.19,.29,.07),mats.cream,0,1.45,.025);record.toggle=attach(new T.BoxGeometry(.09,.13,.035),mats.red,0,1.45,.075);}
  else if(i.type==='tv'){
   attach(new T.BoxGeometry(1.1,.7,.62),mats.wood,0,.4,0);attach(new T.BoxGeometry(.95,.73,.5),mats.dark,0,1.12,0);
   const sm=new T.ShaderMaterial({uniforms:{uTime:{value:0},uOn:{value:0},uIntrusion:{value:0},uPressure:{value:0},uPhotoAspect:{value:assets.liang.image.width/assets.liang.image.height},uPhoto:{value:assets.liang}},vertexShader:'varying vec2 vUv;uniform float uPressure;void main(){vUv=uv;vec3 p=position;p.z+=sin(uv.x*3.14159)*sin(uv.y*3.14159)*uPressure*.18;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',fragmentShader:'varying vec2 vUv;uniform float uTime;uniform float uOn;uniform float uIntrusion;uniform float uPressure;uniform float uPhotoAspect;uniform sampler2D uPhoto;void main(){float n=fract(sin(dot(floor(vUv*190.),vec2(12.98,78.23))+floor(uTime*7.))*43758.5);vec2 uv=vUv-.5;if(uPhotoAspect<1.453)uv.y*=uPhotoAspect/1.453;else uv.x*=1.453/uPhotoAspect;uv=uv/(1.+uPressure*.8)+vec2(.5,.65);vec3 p=texture2D(uPhoto,clamp(uv,0.,1.)).rgb;float g=dot(p,vec3(.299,.587,.114));float reveal=max(uIntrusion,step(.86,fract(uTime*.027)));gl_FragColor=vec4(mix(vec3(.009,.02,.017),mix(vec3(n*.18),vec3(g*(.38+uIntrusion*.3)),reveal),uOn),1.);}'});owned.push(sm);const screen=attach(new T.PlaneGeometry(.77,.53,12,8),sm,0,1.13,.256);tvs.push({...record,sm,screen});
  }else if(i.type==='portrait'){
   const tex=assets[i.asset],h=.9,w=h*(tex.image.width/tex.image.height);attach(new T.BoxGeometry(w+.12,h+.12,.07),mats.wood,0,1.65,0);if(i.asset==='wangjingwei')attach(new T.PlaneGeometry(w,h),mats.paper,0,1.65,.037);const pm=new T.MeshStandardMaterial({roughness:.95,metalness:0,map:tex,color:0x8e9b88,transparent:i.asset==='wangjingwei',alphaTest:.1});owned.push(pm);record.photo=attach(new T.PlaneGeometry(w,h),pm,0,1.65,.042);photos.push(record);
  }else if(i.type==='curtain'){
   const wm=new T.MeshBasicMaterial({color:f.id===2?0xb8c8bb:0x354941});owned.push(wm);attach(new T.PlaneGeometry(1.9,1.65),wm,0,1.75,0);
   if(f.id===4&&assets.wangjingwei){const pm=new T.MeshStandardMaterial({roughness:.95,metalness:0,map:assets.wangjingwei,transparent:true,alphaTest:.1,color:0x52605b});owned.push(pm);const h=1.7,w=h*assets.wangjingwei.image.width/assets.wangjingwei.image.height;attach(new T.PlaneGeometry(w,h),pm,-.2,1.73,.015);}
   for(const dx of [-.93,0,.93])attach(new T.BoxGeometry(.045,1.7,.025),mats.trim,dx,1.75,.025);
   record.curtain=attach(new T.BoxGeometry(2,1.8,.065),mats.cream,0,1.72,.08);attach(new T.BoxGeometry(2.2,.055,.12),mats.metal,0,2.67,.1);
  }else if(i.type==='washer'){
   const hinge=new T.Group();hinge.position.set(-.29,.58,0);group.add(hinge);record.cabinet=hinge;
   const ring=new T.Mesh(new T.TorusGeometry(.29,.045,6,16),mats.metal);ring.position.x=.29;ring.userData.target=i.id;hinge.add(ring);interactables.push(ring);
   const disk=new T.Mesh(new T.CircleGeometry(.26,16),glass);disk.position.set(.29,0,.012);disk.userData.target=i.id;hinge.add(disk);interactables.push(disk);
  }else if(i.type==='peek'){
   attach(new T.PlaneGeometry(.61,.51),glass,0,1.65,.045);
   for(const side of [-1,1]){attach(new T.BoxGeometry(.07,.66,.08),mats.wood,side*.34,1.65,0);attach(new T.BoxGeometry(.68,.07,.08),mats.wood,0,1.65+side*.295,0);}
  }else {attach(new T.BoxGeometry(.9,1.25,.05),mats.dark,0,.625,-.18);for(const side of [-1,1])attach(new T.BoxGeometry(.05,1.25,.4),mats.wood,side*.425,.625,0);for(const y of [.04,.62,1.23])attach(new T.BoxGeometry(.9,.05,.4),mats.wood,0,y,0);const hinge=new T.Group();hinge.position.set(-.45,0,.23);group.add(hinge);const p=new T.Mesh(new T.BoxGeometry(.88,1.18,.04),mats.green);p.position.set(.44,.64,0);p.userData.target=i.id;hinge.add(p);interactables.push(p);record.cabinet=hinge;attach(new T.BoxGeometry(.55,.025,.2),mats.paper,0,.66,.02);}
  i.renderTarget={x,z,y:i.target.y};record.data=i;root.userData.interactions??=[];root.userData.interactions.push(record);
 }
 for(const [index,p]of f.props.entries()){const template=models[p.model];if(!template)continue;const obj=template.clone(true);obj.position.set(p.x,0,p.z);obj.rotation.y=p.yaw;obj.userData.sharedModel=true;root.add(obj);props.push({obj,p,index});}
 for(const core of ['A','B'])if(!(f.id===1&&core==='B'))for(const w of stairSurrounds(f.id,core,core===f.departure))box((w.minX+w.maxX)/2,(w.minY+w.maxY)/2-f.base,(w.minZ+w.maxZ)/2,w.maxX-w.minX,w.maxY-w.minY,w.maxZ-w.minZ,w.ceiling?mats.ceiling:mats.floor);
 if(assets.floorPhoto&&state.photoTrail?.length){const textures=assets.floorPhotos||[assets.floorPhoto];textures.forEach((texture,n)=>{const placements=state.photoTrail.filter(p=>(p.variant??0)%textures.length===n);if(!placements.length)return;const trail=createPhotoTrail(texture,placements);root.add(trail);owned.push(trail.material);});}
 const stairs=[];if(f.id>1)stairs.push({from:f.id,core:f.departure});if(f.id<5)stairs.push({from:f.id+1,core:f.arrival});
 for(const s of stairs){const floorBatches=batches;batches=new Map();container=new T.Group();root.add(container);stairGroups.push({from:s.from,core:s.core,group:container});const base=(s.from-f.id)*RISE,pos=(x,y,z)=>({...worldStair(x,z,s.core),y:y+base});const sb=(x,y,z,w,h,d,m)=>{const q=pos(x,y,z);box(q.x,q.y,q.z,w,h,d,m);};
  for(let k=0;k<9;k++){sb(1.625,-(k+1)*.18-.09,5-(k+.5)*.28,1.25,.18,.28,mats.floor);sb(3.125,-1.62-(k+1)*.18-.09,2.48+(k+.5)*.28,1.25,.18,.28,mats.floor);sb(1.625,-(k+1)*.18+.005,5-(k+1)*.28+.02,.95,.01,.035,worn);sb(3.125,-1.62-(k+1)*.18+.005,2.48+(k+1)*.28-.02,.95,.01,.035,worn);}
  for(const w of stairLandings(s.from,s.core))box((w.minX+w.maxX)/2,(w.minY+w.maxY)/2-f.base,(w.minZ+w.maxZ)/2,w.maxX-w.minX,w.maxY-w.minY,w.maxZ-w.minZ,mats.floor);
  sb(3.675,3.08,4.105,5.35,.16,6.15,mats.ceiling);sb(3.675,-3.4,4.105,5.35,.16,6.15,mats.floor);
  for(const w of stairWalls(s.from,s.core))box((w.minX+w.maxX)/2,(w.minY+w.maxY)/2-f.base,(w.minZ+w.maxZ)/2,w.maxX-w.minX,w.maxY-w.minY,w.maxZ-w.minZ,mats.lower);
  const guard=stairGuard(s.from,s.core);box((guard.minX+guard.maxX)/2,(guard.minY+guard.maxY)/2-f.base,(guard.minZ+guard.maxZ)/2,1.25,1.05,.12,mats.lower);sb(3.125,1.065,4.96,1.29,.03,.16,mats.metal);
  for(const [x,y1,y2]of [[1.06,-.62,1],[3.69,-.62,-2.24]]){const a=pos(x,y1,2.48),b=pos(x,y2,5),start=new T.Vector3(a.x,a.y,a.z),end=new T.Vector3(b.x,b.y,b.z),delta=end.clone().sub(start);const rail=new T.CylinderGeometry(.025,.025,delta.length(),8);rail.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.clone().normalize()));const mid=start.add(end).multiplyScalar(.5);rail.translate(mid.x,mid.y,mid.z);if(!batches.has(mats.metal))batches.set(mats.metal,[]);batches.get(mats.metal).push(rail);}
  const q=pos(2.35,-.45,1.22);sign(q.x,q.y,q.z,1.1,.4,[`0${s.from-1} F`],s.core==='A'?0:Math.PI,'#234332','#d2dec4');const g=new T.MeshBasicMaterial({color:0xb1c7a0});owned.push(g);sb(2.4,.6,1.75,1.2,.04,.2,g);flush();batches=floorBatches;container=root;
 }
 const locations=[[9,3.7],[16,3],[21,3],[26,3],[31,3.7],[13,8],[19,8],[26,8],[32,8],[32,12],[32,16],[32,20],[32,25],[32,28],[27,13],[27,18],[26,24],[19,24],[13,24],[9,28],[16,29],[22,29],[28,29],f.id===1?[6.5,29.1]:[8.9,f.destination.z]].map(([x,z])=>[x>=25?east(x):x,z]).concat(f.wingLights||[]);
 for(let index=0;index<locations.length;index++){const [x,z]=locations[index],zone=z>21?3:x>=25&&z>10?2:x>22?1:0;box(x,2.96,z,1.2,.1,.28,mats.trim);const m=new T.MeshBasicMaterial({color:0xc8dac0});owned.push(m);const tube=new T.Mesh(new T.BoxGeometry(.98,.025,.14),m);tube.position.set(x,2.897,z);root.add(tube);fixtures.push({x,z,zone,index,guide:[0,4,13,19,23].includes(index),faulty:[3,12,20].includes(index)||index>=24&&(index-24)%9===0,tube,power:1});}
 const alarmTube=new T.Color(1,.045,.025),coldTube=new T.Color(.58,.73,1),alarmLight=new T.Color(0xff1408),coldLight=new T.Color(0xa5c7ff);
 const lightColor={5:0xc2d3ae,4:0xc5d9e6,3:0xd6c9ad,2:0xe3e8da,1:0xb5cbc6}[f.id];
 const lights=Array.from({length:5},()=>{const l=new T.PointLight(lightColor,0,11,2);root.add(l);return l;});
 for(const z of [3,29])for(const offset of [0,.28])box(18,2.82,z+offset,31,.045,.045,mats.metal);
 if(f.id===5)for(const x of [12,16,20,25,29]){box(x,1.2,2.12,1.15,2.4,.06,mats.wood);box(x+.4,1.15,2.17,.12,.07,.04,mats.metal);}
 if(f.id===2){sign(18,2.2,21.13,3,.6,['今晚不安排活动'],0,'#b5b59f','#505d50');box(25.8,.05,7.9,2.5,.08,1.5,mats.red);for(const x of [12,17,22,27,32])box(x,2.78,25, .22,.3,8,mats.ceiling);}
 if(f.id===1){const m=new T.MeshBasicMaterial({color:0x168dff});owned.push(m);box(6.5,1.5,30.95,2,3,.5,m);box(6.5,-.08,31,2.8,.16,2.5,mats.floor);}
 flush();
 function update(dt,camera,time,game,reduced){
  const s=game.states[f.id],threat=game.debugCalm?null:game.threat,localThreat=threat?.floor===f.id?threat:null;
  const alarm=localThreat?.kind==='patrol'&&threat.age<threat.warning?T.MathUtils.smoothstep(threat.age,0,.8)*(threat.phase==='leaving'?Math.max(0,1-threat.retreat/1.3):1):0,visit=localThreat?.kind==='yujie'?T.MathUtils.smoothstep(threat.age,0,1)*(threat.phase==='leaving'?Math.max(0,1-threat.retreat/1.3):1):0;
  for(const d of doors){d.pivot.rotation.y=d.data.amount*Math.PI/2*d.data.swing;if(d.logSocket)d.logSocket.visible=!d.data.locked;d.handle.rotation.z=threat?.doorId===d.id?Math.sin(time*14)*.18:0;d.dm.emissive.setHex(threat?.doorId===d.id?0x27110a:0);}
  for(const r of root.userData.interactions||[]){const on=!!s.interactions[r.data.id];if(r.torch)r.torch.visible=!s.flashlight;if(r.wardrobe){if(r.wasHidden!==on){if(r.wasHidden!==undefined)r.doorPulse=.45;r.wasHidden=on;}r.doorPulse=Math.max(0,(r.doorPulse||0)-dt);for(const {hinge,side}of r.wardrobe)hinge.rotation.y=T.MathUtils.damp(hinge.rotation.y,r.doorPulse>0?side*.65:0,12,dt);}if(r.toggle){r.toggle.rotation.x=on?.25:-.25;r.indicator.material.color.setHex(s.blackout?(s.restoredSwitches.includes(r.data.id)?0x8fd9b3:0xe3b864):0x719471);}if(r.curtain)r.curtain.scale.x=T.MathUtils.damp(r.curtain.scale.x,on?.09:1,7,dt);if(r.cabinet)r.cabinet.rotation.y=T.MathUtils.damp(r.cabinet.rotation.y,on?-1.4:0,7,dt);}
  for(const tv of tvs){tv.sm.uniforms.uTime.value=time;const active=threat?.kind==='liang'&&threat.floor===f.id&&threat.tvId===tv.i.id;tv.sm.uniforms.uOn.value=active?1:game.debugCalm?0:s.interactions[tv.i.id]?1:0;tv.screen.scale.setScalar(active?1+threat.pressure*1.8:1);tv.screen.position.z=.256+(active?threat.pressure*.25:0);tv.sm.uniforms.uIntrusion.value=active?1:0;tv.sm.uniforms.uPressure.value=active?threat.pressure:0;}
  for(const photo of photos){const on=s.portraitShift&&Math.sin(time*.09+f.id)>0;photo.photo.material.color.setScalar(on?.40:.72);photo.photo.rotation.z=T.MathUtils.damp(photo.photo.rotation.z,on?.035:0,3,dt);}
  for(const lamp of fixtures){const switched=f.interactions.some(i=>i.type==='switch'&&i.zone===lamp.zone&&s.interactions[i.id]);let p=game.debugCalm?1:lampPower(lamp,time,reduced,!switched);if(threat&&threat.floor===f.id){if(threat.kind==='inspector')p*=threat.phase==='checking'?.38:.7;else if(threat.kind==='patrol'){const lead=threat.age<threat.warning?threat.route[Math.min(threat.route.length-1,Math.floor(threat.age/threat.warning*(threat.route.length-1)))]:threat;const dist=Math.hypot(lamp.x-lead.x,lamp.z-lead.z),fade=threat.phase==='leaving'?Math.max(0,1-threat.retreat/1.3):1;p*=1-.88*fade*(1-T.MathUtils.smoothstep(dist,2,10));}else if(threat.kind==='yujie'){p*=1-visit*.5;}else if(threat.age<threat.warning){const dist=Math.hypot(lamp.x-threat.x,lamp.z-threat.z);p*=.2+.8*T.MathUtils.smoothstep(dist,threat.age*8,threat.age*8+4);}}const corridor=lamp.z<5||lamp.z>27||lamp.x>=31||lamp.x<10;lamp.alarm=corridor?alarm:0;lamp.visit=visit;if(s.blackout&&!game.debugCalm)p=0;if(lamp.alarm)p=Math.max(p,.42*lamp.alarm);if(threat?.kind==='doubao'&&threat.floor===f.id&&threat.age<threat.warning&&!game.debugCalm){const a=threat.age;p=reduced?.12+.5*Math.sin(Math.PI*a/2)**2:(a<.3||a>.65&&a<.9?.7:.06);}lamp.power=p;lamp.tube.material.color.setRGB(lamp.guide?.95:.70,.82,lamp.guide?.56:.64).lerp(alarmTube,lamp.alarm).lerp(coldTube,visit).multiplyScalar(p);}
  const nearest=[...fixtures].sort((a,b)=>(a.x-camera.position.x)**2+(a.z-camera.position.z)**2-((b.x-camera.position.x)**2+(b.z-camera.position.z)**2)).slice(0,5);lights.forEach((l,i)=>{const p=nearest[i];l.position.set(p.x,2.6,p.z);l.color.setHex(p.guide?0xe5d3a1:lightColor).lerp(alarmLight,p.alarm).lerp(coldLight,p.visit);l.intensity=p.power*(bright?24:19)*(p.guide?1.25:1);});
  for(const prop of props){const point={floor:f.id,x:prop.p.x,z:prop.p.z,propIndex:prop.index};if(time-s.lastAnomaly>14&&game.player.floor===f.id&&!game.debugCalm&&!game.viewed(point,game.lastInput||{})&&!game.threat){s.propTurns[prop.index]=(s.propTurns[prop.index]+1)%4;s.lastAnomaly=time;}prop.obj.rotation.y=prop.p.yaw+s.propTurns[prop.index]*Math.PI/2;}
 }
 return{root,doors,interactables,fixtures,lights,stairGroups,update,materials:mats,localize(){labels.forEach(t=>t.userData.redraw());},dispose(){scene.remove(root);root.traverse(o=>{if(o.isMesh&&!hasSharedAncestor(o)){o.geometry.dispose();if(o.isInstancedMesh)o.dispose();}});owned.forEach(m=>m.dispose());labels.forEach(t=>t.dispose());}};
}
function hasSharedAncestor(o){for(let p=o;p;p=p.parent)if(p.userData.sharedModel)return true;return false;}
