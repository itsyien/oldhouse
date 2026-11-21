import {blocked,doorBounds} from './logic.js';
export const RISE=3.24,PLAYER_RADIUS=.24;
export const rectBounds=r=>({minX:r.x,maxX:r.x+r.w,minZ:r.z,maxZ:r.z+r.d,glass:r.material==='fixed-glass'});
export const within=(p,r,pad=0)=>p.x>=r.x-pad&&p.x<=r.x+r.w+pad&&p.z>=r.z-pad&&p.z<=r.z+r.d+pad;
export function prepareBuilding(plan){
 const floors=plan.floors.map(source=>{
  const f=structuredClone(source);f.base=(f.id-1)*RISE;const east=x=>x+(f.eastExtension||0);
  f.bounds={minX:Math.min(...f.walkableRects.map(r=>r.x)),minZ:Math.min(...f.walkableRects.map(r=>r.z)),maxX:Math.max(...f.walkableRects.map(r=>r.x+r.w)),maxZ:Math.max(...f.walkableRects.map(r=>r.z+r.d))};
  // Trim the unused rear bays; the shared perimeter builder supplies solid walls and collision.
  for(const r of f.walkableRects)if(r.x<8&&r.z>=11&&r.z+r.d<=21){r.w-=8-r.x;r.x=8;}
  f.spawn={x:8.8,z:f.arrival==='A'?8:24};f.destination=f.id===1?{x:6.5,z:30.35}:{x:8.8,z:f.departure==='A'?8:24};
  f.partitions=[...f.walls];f.doorSpecs=[];
  if(f.id<=2){
   if(f.id===1)for(const w of f.partitions)if(w.w>20&&(w.z===5||w.z===27))w.material='plaster';
   if(f.id===1)for(const w of f.partitions)if(w.material==='fixed-glass'&&w.x===10&&w.d===8){const north=w.z===5;w.z+=north?.2:.09;w.d-=north?.29:.09;}
   f.partitions.push({x:28.9,z:12.12,w:.18,d:7.76,material:'plaster'});
   // Open recesses give the long corridors reachable cover without a new interaction.
   for(const z of [5,27]){const index=f.partitions.findIndex(w=>w.z===z&&w.w>20);if(index<0)continue;const w=f.partitions.splice(index,1)[0];f.partitions.push({...w,w:16.5},{...w,x:28.3,w:w.x+w.w-28.3});}
  }
  f.partitions.push({x:2,z:10.82,w:6.1,d:.18},{x:2,z:21,w:6.1,d:.18,material:f.id===1?'fixed-glass':'plaster'});
  const door=(id,x,z,axis,kind,title,open=true,locked=false)=>f.doorSpecs.push({id:`${f.id}-${id}`,x,z,axis,kind,title,angle:axis==='x'?Math.PI/2:0,swing:kind==='exit'?-1:1,open,locked,width:1.9});
  door('A',8.2,8,'x','fire',f.id===5?'检修封闭':'防火门 · A 梯',f.id!==5,f.id===5);
  door('B',8.2,24,'x','fire',f.id===1?'防火门 · 滚木锁':'防火门 · B 梯',f.id!==1,f.id===1);
  if(f.id===1)f.doorSpecs.at(-1).logLock=true;
  if(f.id>=2){door('room',22.1,4,'x','wood','公共区');door('room-back',22.1,9,'x','wood','内侧门');}
  for(const z of [12,20]){
   f.partitions.push({x:east(28.9),z:z-.12,w:2.15,d:.24},{x:east(32.95),z:z-.12,w:1.05,d:.24});
   door(`east-${z}`,east(32),z,'z','fire','防火门 · 缓闭');
  }
  f.shelters=[];
  if(f.id<=2){
   f.shelters.push({x:29.4,z:12.4,w:4.2,d:7.2,doors:[`${f.id}-east-12`,`${f.id}-east-20`]});
   for(const r of f.shelters)for(const id of r.doors)f.doorSpecs.find(d=>d.id===id).wardPortrait=true;
  }
  if(f.id===1){door('exit',6.5,29.9,'z','exit','通向室外',false);f.partitions.push({x:2,z:27,w:4.5,d:.18},{x:5.5,z:28.4,w:2.6,d:.18});f.walkableRects.push({x:5.2,z:29.8,w:2.6,d:1.5});}
  f.interactions.push({id:'f'+f.id+'-wang-north',label:'汪精卫画像',asset:'wangjingwei',x:14+f.id%3,z:9},{id:'f'+f.id+'-wang-south',label:'汪精卫画像',asset:'wangjingwei',x:17+f.id%2*4,z:23});
  f.interactions=f.interactions.map((i,n)=>{const type=/开关|照明|阅览灯|盥洗灯/.test(i.label)?'switch':/观察/.test(i.label)?'peek':/电视/.test(i.label)?'tv':/帘|隔断/.test(i.label)?'curtain':/画像/.test(i.label)?'portrait':/洗衣机/.test(i.label)?'washer':'cabinet';return{...i,type,number:n,zone:Math.min(3,n%4),target:{x:i.x,y:type==='switch'?1.45:type==='tv'?1.25:type==='washer'?.58:1.6,z:i.z+.72},name:i.label};}).filter(i=>!['防火门','外门'].includes(i.label));
  if(f.id===1){f.interactions.push({id:'f1-e6',label:'门厅灯',name:'门厅灯',type:'switch',zone:3,x:17,z:26.4,target:{x:17,y:1.45,z:25.6}},{id:'f1-e7',label:'出口观察窗',name:'出口观察窗',type:'peek',zone:3,x:9,z:26,target:{x:8.4,y:1.65,z:26}});}
  for(const i of f.interactions){
   const t=i.target;
   if(i.type==='washer'){t.x=east(26.47);t.z=7.35;i.x=east(26.47);}
   if(i.type==='switch'){if(i.z<12)t.z=5.25;else if(i.z>21)t.z=26.94;else t.x=east(25.14);}
   if(['portrait','curtain'].includes(i.type)){if(i.z<12)t.z=10.86;else if(i.z>21)t.z=i.type==='portrait'?21.14:26.91;else t.x=east(25.14);}
   if(i.type==='peek'){if(i.label.includes('出口')){t.x=8.4;t.z=26;}else{t.z=5.28;i.z=6.25;}}
   i.yaw=Math.atan2(i.x-t.x,i.z-t.z);
   i.zone=t.z>21?3:t.x>=25&&t.z>10?2:t.x>22?1:0;
  }
  for(const [n,x,z,yaw]of [[0,14,29.86,Math.PI],[1,24,29.86,Math.PI],[2,east(33.86),16,-Math.PI/2]])f.interactions.push({id:`f${f.id}-portrait-${n}`,type:'portrait',label:['新查房者画像','老大画像','蒋介石画像'][n],asset:['inspectorPortrait','laodaPortrait','chiangkaishekPortrait'][n],x,z,zone:3,yaw,target:{x,y:1.65,z}});
  if(f.id===1)f.interactions.push({id:'f1-flashlight',type:'flashlight',label:'强光手电筒',x:33.15,z:13.8,yaw:-Math.PI/2,zone:2,target:{x:33.15,y:.96,z:13.8}});
  if(f.id<=2)for(const z of [12,20])f.interactions.push({id:`f${f.id}-power-${z}`,type:'switch',label:z===12?'北侧配电开关':'南侧配电开关',x:10.1,z,zone:z===12?0:3,yaw:-Math.PI/2,target:{x:9.96,y:1.45,z}});
  // Glass apertures remain solid for movement but transparent to sight checks.
  for(const i of f.interactions.filter(i=>i.type==='peek')){
   const t=i.target,vertical=i.label.includes('出口');
   const index=f.partitions.findIndex(w=>vertical?w.x===8.1&&w.z===25.2:w.z===5&&w.w>20);
   if(index<0)continue;const w=f.partitions.splice(index,1)[0];
   if(vertical)f.partitions.push({...w,d:t.z-.4-w.z},{...w,z:t.z-.4,d:.8,material:'fixed-glass'},{...w,z:t.z+.4,d:w.z+w.d-t.z-.4});
   else f.partitions.push({...w,w:t.x-.4-w.x},{...w,x:t.x-.4,w:.8,material:'fixed-glass'},{...w,x:t.x+.4,w:w.x+w.w-t.x-.4});
  }
  f.obstacles=[...f.partitions.map(rectBounds),...f.furniture.map(p=>({...rectBounds(p),height:/书架|资料柜|储物柜|矮柜|设备柜/.test(p.name)?1.9:/晾衣/.test(p.name)?2.8:/信箱/.test(p.name)?2.1:1.3})),...f.props.map((p,propIndex)=>{const size=Math.max(p.footprint.w,p.footprint.d);return{...rectBounds({x:p.x-size/2,z:p.z-size/2,w:size,d:size}),propIndex,height:2.2};})];
  const inside=(x,z)=>f.walkableRects.some(r=>within({x,z},r));
  f.boundaries=[];
  for(let z=f.bounds.minZ;z<f.bounds.maxZ;z++)for(let x=f.bounds.minX;x<f.bounds.maxX;x++)if(inside(x+.5,z+.5)){
   for(const [dx,dz]of [[-1,0],[1,0],[0,-1],[0,1]])if(!inside(x+.5+dx,z+.5+dz)&&!(f.id===1&&dz===1&&x>=5&&x<8)){const serviceGlass=f.id===1&&dz!==0&&x<11&&[12,19].includes(z);f.boundaries.push({...rectBounds({x:dx?x+.5+dx*.5-.09:x,z:dz?z+.5+dz*.5-.09:z,w:dx?.18:1,d:dz?.18:1}),glass:serviceGlass});}
  }
  for(const i of f.interactions.filter(i=>['tv','cabinet'].includes(i.type))){const size=i.type==='tv'?[1.1,.7]:[.95,.55];const sideways=Math.abs(Math.sin(i.yaw))>.7;f.obstacles.push({...rectBounds({x:i.target.x-size[sideways?1:0]/2,z:i.target.z-size[sideways?0:1]/2,w:size[sideways?1:0],d:size[sideways?0:1]}),height:i.type==='tv'?1.5:1.25});}
  // Place hiding spots against perimeter walls, outside the main walking lane and door sweeps.
  if([1,2,4].includes(f.id))for(const [n,x,z,yaw]of f.wardrobePositions||[[0,14,2.5,0],[1,24,2.5,0],[2,33.5,17.8,-Math.PI/2],[3,27,29.5,Math.PI],[4,14,29.5,Math.PI]]){
   const depth=.6,side=Math.abs(Math.sin(yaw))>.5,w=side?depth:1.3,d=side?1.3:depth;
   const entry={x:x+Math.sin(yaw)*1.3,z:z+Math.cos(yaw)*1.3};
   f.interactions.push({id:`f${f.id}-wardrobe-${n}`,type:'wardrobe',label:'躲藏衣柜',name:'躲藏衣柜',wardPortrait:f.id<=2&&[0,3].includes(n),x,z,yaw,depth,zone:z>21?3:z>11?2:0,target:{x,y:1.4,z},entry});
   f.obstacles.push({...rectBounds({x:x-w/2,z:z-d/2,w,d}),height:2.35,wardrobe:true});
  }
  for(const i of f.interactions.filter(i=>i.type==='flashlight'))f.obstacles.push({...rectBounds({x:i.target.x-.23,z:i.target.z-.23,w:.46,d:.46}),height:.85});
  f.sightObstacles=[...f.obstacles,...f.boundaries].filter(w=>!w.glass).map(w=>({...w,minY:f.base,maxY:f.base+(w.height??3)}));
  for(const r of f.walkableRects){const core=r.x<8&&(r.z<11||r.z>=21),x=core?8:r.x,w=r.x+r.w-x;
   if(w>0){const bounds=rectBounds({...r,x,w});f.sightObstacles.push({...bounds,minY:f.base-.16,maxY:f.base},{...bounds,minY:f.base+3,maxY:f.base+3.16});}
   if(core&&f.id===1&&r.z>=21)f.sightObstacles.push({...rectBounds(r),minY:-.16,maxY:0});
  }
  for(const core of ['A','B'])if(!(f.id===1&&core==='B'))f.sightObstacles.push(...stairSurrounds(f.id,core,core===f.departure));
  if(f.id>1)f.sightObstacles.push(...stairWalls(f.id,f.departure),...stairLandings(f.id,f.departure),stairGuard(f.id,f.departure));
  if(f.id<5)f.sightObstacles.push(...stairWalls(f.id+1,f.arrival),...stairLandings(f.id+1,f.arrival),stairGuard(f.id+1,f.arrival));
  return f;
 });
 return {...plan,floors,byId:Object.fromEntries(floors.map(f=>[f.id,f]))};
}
export function floorPassable(f,p,radius=PLAYER_RADIUS,doors=[],options={}){
 if(!f.campaign&&p.x<7.9&&(p.z<11||p.z>=21)&&!(f.id===1&&p.z>=21))return false;
 const obstacles=options.traversals?f.obstacles.filter(o=>!o.traversalId||!options.traversals[o.traversalId]):f.obstacles;
 const landing=q=>f.campaign&&q.x>=7.5&&q.x<=8.5&&f.stairCores.some(core=>Math.abs(q.z-(core==='A'?8:24))<=1.05);
 if(blocked(p.x,p.z,obstacles,radius)||blocked(p.x,p.z,doors,radius))return false;
 if(f.walkableRects.some(r=>within(p,r,-radius)))return true;
 const probes=[p,{x:p.x-radius,z:p.z},{x:p.x+radius,z:p.z},{x:p.x,z:p.z-radius},{x:p.x,z:p.z+radius}];
 // Around re-entrant corners a body can straddle both aisles while a diagonal still hits the wall.
 if(f.scenes){const d=radius*Math.SQRT1_2;for(const dx of [-d,d])for(const dz of [-d,d])probes.push({x:p.x+dx,z:p.z+dz});}
 return probes.every(q=>landing(q)||f.walkableRects.some(r=>within(q,r)));
}
export const localStair=(p,core)=>({x:p.x-2,z:core==='A'?p.z-2:30-p.z});
export const worldStair=(x,z,core)=>({x:x+2,z:core==='A'?z+2:30-z});
export function stairSurrounds(floor,core,upper=false){
 // The sealed top core has no active landing to fill an expanded doorway bay.
 const back=floor===5&&!upper?6.5:7.1,rectangles=[[0,0,.9,9],[.9,0,5.1,1.13],[.9,back,5.1,9-back],[3.85,1.13,2.15,3.87]],base=(floor-1)*RISE;
 return rectangles.flatMap(([x,z,w,d],i)=>[false,true].filter(ceiling=>!(ceiling&&i===3&&upper)).map(ceiling=>{if(ceiling&&i===1)d=1.03;if(ceiling&&i===2){z=back+.08;d=9-z;}const p=worldStair(x+w/2,z+d/2,core),y=base+(ceiling?3.08:-.08);return{minX:p.x-w/2,maxX:p.x+w/2,minZ:p.z-d/2,maxZ:p.z+d/2,minY:y-.08,maxY:y+.08,ceiling};}));
}
export function stairGuard(from,core){const p=worldStair(3.125,4.96,core),base=(from-1)*RISE;return{minX:p.x-.625,maxX:p.x+.625,minZ:p.z-.06,maxZ:p.z+.06,minY:base,maxY:base+1.05};}
export function stairWalls(from,core){
 // The rear wall runs from the half-landing through both door landings.
 return [[2.375,-.23,3.74,.25,6.1,2.52],[.92,-.24,4.115,.16,6.52,6.29],[3.85,-.24,3.045,.12,6.52,3.91],[3.675,-.24,7.18,5.35,6.52,.16],[5.12,-.24,4.94,2.5,6.52,.12],[2.375,-.24,1.05,3.07,6.52,.16]].map(([x,y,z,w,h,d])=>{const p=worldStair(x,z,core),base=(from-1)*RISE;return{minX:p.x-w/2,maxX:p.x+w/2,minZ:p.z-d/2,maxZ:p.z+d/2,minY:base+y-h/2,maxY:base+y+h/2};});
}
export function stairLandings(from,core){
 return [[2.375,-1.67,1.805,2.75,1.35],[3.675,-.05,6.05,5.35,2.1],[3.675,-3.29,6.05,5.35,2.1]].map(([x,y,z,w,d])=>{const p=worldStair(x,z,core),base=(from-1)*RISE;return{minX:p.x-w/2,maxX:p.x+w/2,minZ:p.z-d/2,maxZ:p.z+d/2,minY:base+y-.05,maxY:base+y+.05};});
}
export function stairHeight(p,floor,travel){
 if(!travel)return(floor-1)*RISE;
 const q=localStair(p,travel.core),base=(travel.from-1)*RISE;
 if(q.z<2.48)return base-1.62;
 if(q.z>=5)return base-(travel.phase==='lower'?RISE:0);
 return base-(travel.phase==='lower'?1.62+1.62*(q.z-2.48)/2.52:1.62*(5-q.z)/2.52);
}
export function stairPassable(p,t,r=PLAYER_RADIUS){
 const q=localStair(p,t.core),regions=[{x:1,z:5,w:5.5,d:2.1},{x:1,z:1.13,w:2.75,d:1.35},t.phase==='lower'?{x:2.5,z:2.48,w:1.25,d:2.52}:{x:1,z:2.48,w:1.25,d:2.52}];
 return [q,{x:q.x-r,z:q.z},{x:q.x+r,z:q.z},{x:q.x,z:q.z-r},{x:q.x,z:q.z+r}].every(v=>regions.some(a=>within(v,a)))&&!blocked(p.x,p.z,stairWalls(t.from,t.core),r)&&(t.phase==='lower'||!blocked(p.x,p.z,[stairGuard(t.from,t.core)],r));
}
const stairRoute=[[6.4,6,0],[1.625,5.7,0],[1.625,2.1,-1.62],[3.125,2.1,-1.62],[3.125,5.7,-3.24],[6.4,6,-3.24]];
export function stairPoint(from,core,progress){
 const scaled=Math.max(0,Math.min(.999999,progress))*(stairRoute.length-1),index=Math.floor(scaled),t=progress===1?1:scaled-index,a=stairRoute[index],b=stairRoute[index+1];
 return {...worldStair(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,core),y:(from-1)*RISE+a[2]+(b[2]-a[2])*t};
}
export function doorBlock(d){
 if(d.kind!=='isolation-gate')return doorBounds(d.x,d.z,d.angle,d.amount*(d.swing||1));
 if(d.amount>=.85)return{minX:Infinity,maxX:Infinity,minZ:Infinity,maxZ:Infinity};
 const width=(d.width??1.9)/2,hx=d.axis==='x'?.11:width,hz=d.axis==='x'?width:.11;
 return{minX:d.x-hx,maxX:d.x+hx,minZ:d.z-hz,maxZ:d.z+hz};
}
