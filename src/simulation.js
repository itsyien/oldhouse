import {photoTrail} from './photo-trail.js';
import {planPatrol,updatePatrol,sealedShelter} from './patrol.js';
import {Navigator,clearActorTravel} from './navigation.js';
import {floorPassable,doorBlock,stairHeight,stairPassable,localStair,stairPoint,RISE} from './building.js';
import {clearSight,blocked} from './logic.js';
export const FLASHLIGHT_HALF_ANGLE=.48,DISPEL_SECONDS=5;
const NAIWA_START_DELAY=.60,NAIWA_STOP_DELAY=.20;
export function naiwaTravelTime(t,dt){
 if(t.observed){
  t.unseen=0;
  const watched=t.watched??0;
  t.watched=watched+dt;
  if(!t.naiwaMoving)return 0;
  if(t.watched>=NAIWA_STOP_DELAY-1e-8)t.naiwaMoving=false;
  return Math.min(dt,Math.max(0,NAIWA_STOP_DELAY-watched));
 }
 t.watched=0;
 const unseen=t.unseen??0;
 t.unseen=unseen+dt;
 if(t.naiwaMoving)return dt;
 if(t.unseen>=NAIWA_START_DELAY-1e-8)t.naiwaMoving=true;
 return Math.max(0,dt-Math.max(0,NAIWA_START_DELAY-unseen));
}
export function gunmuRise(age){const p=Math.max(0,Math.min(1,age/2));return -2.65*(1-p*p*(3-2*p));}
export const RULES={inspector:{title:'查房者',action:'停住脚步。可以转头。',failure:'它看见你动了。两次检查期间都要停住，转头不会惊动它。'},naiwa:{title:'偷步者',action:'看着它后退，别碰到它；再绕过实体墙。',failure:'它碰到了你。凝视只能阻止它移动，不能保护贴得太近的你。看着它退到拐角，再拉开距离。'},kun:{title:'借路者',action:'按住 Shift 快跑，躲进衣柜或关门绕路。',failure:'它比你跑得快。按住 Shift 快跑，靠近衣柜按 E 躲藏，等它走远再出来；也可以关门争取撤离时间。'}};
RULES.liang={title:'良子 · 播报者',action:'找到两个遥控器，再回到电视按 E 关闭。',failure:'电视里的良子膨胀到了极限。跟随透视标记拿齐两个遥控器，再及时回到电视按 E 关闭。'};
RULES.patrol={title:'汪精卫 · 巡楼者',action:'找蒋介石画像：躲进标记衣柜，或进入标记房间关好门。',failure:'没有画像的门和衣柜挡不住巡楼者。红灯亮起后七秒内，藏进带蒋介石画像的衣柜，或进入画像标记的房间并关好全部门。'};
RULES.yujie={title:'东北雨姐 · 来访者',action:'别看她。低头或转身，把她完全移出视野。',failure:'理智耗尽，她来拜访你了。雨姐不会移动；看到她会掉理智，低头或转开视线才能停止。'};
RULES.doubao={title:'棍母',action:'用强光对准它，累计照射五秒。边退边照。',failure:'棍母追上了你。拿起一楼强光手电筒，对准它累计照射五秒；隔墙、关门或躲柜时照射无效。'};
const d2=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clone=v=>structuredClone(v);
export class Game{
 constructor(building,seed=1,nav=new Navigator(building)){this.building=building;this.nav=nav;this.seed=seed>>>0;this.reset();}
 reset(){this.discoveredPortraits=[];this.sanity=100;this.sanityRest=0;this.sanityExposed=false;this.mode='playing';this.time=0;this.states={};this.threat=null;this.travel=null;this.peek=null;this.hiding=null;this.messages=[];this.resolved=0;this.cooldown=7;this.failure=null;this.pendingCheckpoint=null;this.startedFloors=new Set([5]);for(const f of this.building.floors)this.states[f.id]=this.initialFloor(f);this.player={floor:5,...this.building.byId[5].spawn,y:4*RISE};this.checkpoint={floor:5,states:clone(this.states),resolved:0,sanity:100};this.emit('第五层。地上的旧照片留下了一条通往出口的痕迹。',6);}
 initialFloor(f){return{photoTrail:photoTrail(f,this.nav,this.seed),doors:f.doorSpecs.map(d=>({...d,floor:f.id,amount:d.open?1:0,block:doorBlock({...d,amount:d.open?1:0}),broken:false})),interactions:{},blackout:false,flashlight:false,liangCleared:false,gunmuDefeated:false,yujieFollowup:null,patrolCleared:false,logKey:false,doubaoWait:null,exitInspection:false,exitInspectionWait:null,restoredSwitches:[],events:0,kunWait:30,yujieVisits:0,yujieWait:14+(this.seed+f.id*3)%8,patrols:0,patrolWait:10+(this.seed+f.id)%3,progress:0,propTurns:f.props.map(()=>0),lastAnomaly:0,portraitShift:false};}
 get floor(){return this.building.byId[this.player.floor];}
 beginPatrol(){
  if(this.threat||this.player.floor>2)return false;const plan=planPatrol(this);if(!plan)return false;
  this.beginEncounter('patrol',plan.route[0]);Object.assign(this.threat,plan,{routeIndex:1,exposure:0,blockedTime:0,retreat:0});this.state.patrols++;this.emit('走廊变红了。七秒内躲到蒋介石画像标记的门内或柜内，关好门。',plan.warning);return true;
 }
 get powerSwitchesRequired(){return this.player.floor===2?1:2;}
 get state(){return this.states[this.player.floor];}
 get portraitTotal(){return this.building.floors.reduce((n,f)=>n+f.interactions.filter(i=>i.type==='portrait').length,0);}
 get score(){return this.discoveredPortraits.length*100;}
 get doors(){return Object.values(this.states).flatMap(s=>s.doors);}
 emit(text,duration=3){this.messages.push({text,duration});}
 obstacles(floor,sight=false){const f=this.building.byId[floor];return [...f.obstacles,...f.boundaries].filter(w=>!sight||!w.glass).concat(this.states[floor].doors.filter(d=>d.kind!=='exit'||d.amount<.9).map(d=>d.block));}
 line(a,b){
  if(Math.abs(a.floor-b.floor)>1)return false;
  const p={...a,y:(a.y??(a.floor-1)*RISE)+1.65},q={...b,y:(b.y??(b.floor-1)*RISE)+1.65},lo=Math.min(p.y,q.y),hi=Math.max(p.y,q.y);
  const walls=this.building.floors.filter(f=>f.base<=hi&&f.base+RISE>=lo).flatMap(f=>[...f.sightObstacles.filter(w=>b.floor!==f.id||b.propIndex==null||w.propIndex!==b.propIndex),...this.states[f.id].doors.map(d=>({...d.block,minY:f.base,maxY:f.base+2.6}))]);
  return clearSight(p,q,walls);
 }
 renderFloors(){
  if(this.travel)return[this.travel.from,this.travel.from-1];
  const f=this.floor,p=this.player,core=p.z<11?'A':p.z>21?'B':null,ids=[f.id];
  if(p.x<19.8&&core){if(core===f.departure&&f.id>1)ids.push(f.id-1);else if(core===f.arrival&&f.id<5)ids.push(f.id+1);}return ids;
 }
 viewed(point,input,range=140){
  if(this.hiding)return false;
  if(!this.renderFloors().includes(point.floor)||d2(point,this.player)>range||!this.line(this.player,point))return false;
  const yaw=input.yaw||0,pitch=input.pitch||0,dx=point.x-this.player.x,dz=point.z-this.player.z,dy=(point.y??(point.floor-1)*RISE)+1.325-this.player.y-1.65;
  const horizontal=-Math.sin(yaw)*dx-Math.cos(yaw)*dz,depth=horizontal*Math.cos(pitch)+dy*Math.sin(pitch),side=Math.cos(yaw)*dx-Math.sin(yaw)*dz,up=dy*Math.cos(pitch)-horizontal*Math.sin(pitch);
  const halfHeight=Math.tan((input.verticalFov||72*Math.PI/180)/2),halfWidth=halfHeight*(input.aspect||16/9),radius=point.propIndex==null?.85:.8;
  return depth>-.2&&Math.abs(side)<depth*halfWidth+radius&&Math.abs(up)<depth*halfHeight+1.35;
 }
 interact(id){
  if(this.hiding){if(id!==this.hiding.id)return false;return this.useWardrobe(this.floor.interactions.find(i=>i.id===id));}
  const broadcast=this.threat?.kind==='liang'?this.threat:null,remote=broadcast?.remotes.find(r=>r.id===id);
  if(remote){
   if(remote.collected||this.player.floor!==remote.floor||d2(this.player,remote)>1.8||!this.line(this.player,remote))return false;
   remote.collected=true;this.emit(broadcast.remotes.every(r=>r.collected)?'遥控器已集齐。回到电视按 E 关闭！':'拿到一个遥控器。还有一个，跟着标记走。',4);return true;
  }
  const door=this.state.doors.find(d=>d.id===id);
  if(door){if(door.logLock&&door.locked){
    if(!this.state.logKey){this.emit('防火门锁住了。先躲过巡楼，再到南侧第二走廊驱散棍母，取得滚木。',5);return false;}
    if(d2(this.player,door)>2.65)return false;
    this.state.logKey=false;this.state.exitInspectionWait=1;this.state.yujieFollowup=null;door.locked=false;door.open=true;door.held=false;this.emit('滚木嵌进锁槽，防火门打开了。',4);return true;
   }if(door.locked){this.emit('检修围挡封住了梯段。沿另一侧下楼。');return false;}
   if(door.broken){this.emit('木门已经被撞坏。继续离开。');return false;}
   door.open=!door.open;door.held=false;this.peek=null;this.emit(door.open?'门正在打开。':'门正在合拢。留开门扇的位置。',1.5);return true;
  }
  const item=this.floor.interactions.find(i=>i.id===id);if(!item)return false;
  if(item.type==='flashlight'){
   if(this.state.flashlight||d2(this.player,item.target)>2||!this.line(this.player,{floor:1,...item.target,y:0}))return false;
   this.state.flashlight=true;this.state.interactions[id]=true;this.emit('强光手电已拾取。对准黑影累计照射五秒，边退边照。',6);return true;
  }
  if(item.type==='wardrobe')return this.useWardrobe(item);
  if(item.type==='tv'&&broadcast?.tvId===id){
   if(!broadcast.remotes.every(r=>r.collected)){this.emit('先拿齐两个遥控器。标记会一直显示。',3);return false;}
   if(d2(this.player,item.target)>2.65)return false;
   broadcast.closedByPlayer=true;this.resolveThreat();return true;
  }
  if(item.type==='switch'&&this.state.blackout){
   if(this.threat?.kind==='patrol'){this.emit('巡查尚未结束。等它离开后再恢复供电。',3);return false;}
   const restored=this.state.restoredSwitches;
   if(restored.includes(id)){this.emit('这个开关已经复位。去找另一个位置的开关。',3);return true;}
   restored.push(id);this.state.interactions[id]=false;
   if(restored.length>=this.powerSwitchesRequired){this.state.blackout=false;this.emit(this.powerSwitchesRequired===1?'开关已复位。供电恢复。':'两处开关已复位。供电恢复。',4);}else this.emit('已复位一处开关。还需要另一个位置的开关。',4);
   return true;
  }
  this.state.interactions[id]=!this.state.interactions[id];const on=this.state.interactions[id];
  if(item.type==='peek'){this.peek=on?id:null;this.emit(on?'观察中 · 转头查看，E 或移动退出':'离开观察孔',2);}
  else if(item.type==='switch')this.emit(on?'这一组灯熄灭了。':'灯亮了。故障的灯管仍不稳定。',2);
  else if(item.type==='tv')this.emit(on?'屏幕亮了。画面里的人没有眨眼。':'屏幕暗了。',2.5);
  else if(item.type==='portrait'){if(!this.discoveredPortraits.includes(id)){this.discoveredPortraits.push(id);this.emit(`发现画像 ${this.discoveredPortraits.length} / ${this.portraitTotal} · +100 分`,4);this.state.portraitShift=!this.state.portraitShift;return true;}this.state.portraitShift=!this.state.portraitShift;this.emit(on?'照片下没有名字。玻璃上却留着指印。':'画框恢复了原样。',3);}
  else if(item.type==='washer')this.emit(on?'内筒是空的。':'洗衣机门合上了。',2);
  else this.emit(on?item.type==='curtain'?'遮帘拉开了。':'柜门打开。里面只有旧生活的痕迹。':item.type==='curtain'?'遮帘落下了。':'柜门合上了。',2);
  return true;
 }
 useWardrobe(item){
  if(this.hiding){
   const p={floor:this.player.floor,...item.entry,y:this.floor.base};
   if(!floorPassable(this.floor,p,.24,this.state.doors.map(d=>d.block))||this.threat?.floor===p.floor&&d2(this.threat,p)<.85){this.emit('柜门外有东西挡着。再等一下。',2);return false;}
   this.player=p;this.hiding=null;this.state.interactions[item.id]=false;
   if(this.threat?.kind==='kun'){this.threat.wardrobeAge=0;this.threat.wardrobeRetreat=null;this.threat.pathAge=1;this.threat.lastSeen={...p};}
   this.emit('离开衣柜。继续往出口走。',2);return true;
  }
  if(this.travel||d2(this.player,item.entry)>1.65||(this.player.x-item.x)*Math.sin(item.yaw)+(this.player.z-item.z)*Math.cos(item.yaw)<.48||!this.line(this.player,{floor:this.player.floor,...item.entry}))return false;
  this.hiding={id:item.id,entry:{floor:this.player.floor,...item.entry},yaw:item.yaw};this.peek=null;
  Object.assign(this.player,{x:item.x,z:item.z,y:this.floor.base});this.state.interactions[item.id]=true;
  this.emit(this.threat?.kind==='kun'?'藏好了。坤坤会在外面搜寻，等它离开；按 E 出来。':item.wardPortrait?'画像在柜门上。巡楼者找不到这里，按 E 离开。':'这个柜子没有画像，挡不住巡楼者。按 E 离开。',5);return true;
 }
 enterFloor(floor){
  if(this.hiding)this.states[this.player.floor].interactions[this.hiding.id]=false;this.hiding=null;
  if(floor!==this.player.floor){
   this.state.yujieFollowup=null;const t=this.threat;if(t?.kind==='liang')this.states[t.floor].interactions[t.tvId]=false;
   this.threat=null;this.debugPendingScare=false;this.debugLastCatch=null;this.sanityExposed=false;this.sanityRest=0;this.pendingCheckpoint=null;this.messages=[];this.cooldown=3;this.directorAge=0;
   const s=this.states[floor];s.yujieFollowup=null;s.events=0;s.kunWait=30;s.patrolWait=10+(this.seed+floor)%3;s.yujieWait=14+(this.seed+floor*3)%8;
  }
  this.player.floor=floor;this.peek=null;if(!this.startedFloors.has(floor)){this.startedFloors.add(floor);this.emit(this.building.byId[floor].title,4);}
  if([3,1].includes(floor)&&floor<this.checkpoint.floor){if(this.threat){this.pendingCheckpoint=floor;this.emit('尚未脱险 · 检查点暂未生效',4);}else this.saveCheckpoint(floor);}
 }
 saveCheckpoint(floor){this.pendingCheckpoint=null;this.checkpoint={floor,states:clone(this.states),resolved:this.resolved,sanity:this.sanity};this.emit('已脱险 · 下次从这一层继续',3);}
 retry(){const checkpoint=this.checkpoint;this.states=clone(checkpoint.states);this.sanity=checkpoint.sanity;this.sanityRest=0;this.sanityExposed=false;this.player={floor:checkpoint.floor,...this.building.byId[checkpoint.floor].spawn,y:(checkpoint.floor-1)*RISE};this.threat=null;this.travel=null;this.peek=null;this.hiding=null;this.mode='playing';this.failure=null;this.pendingCheckpoint=null;this.resolved=checkpoint.resolved;this.cooldown=5;this.messages=[];this.emit('回到检查点。同一次异常，仍会在前面等你。',4);}
 fail(kind){if(this.debugMode){if(this.threat&&!this.threat.debugScared){this.threat.debugScared=true;this.debugPendingScare=true;}this.debugLastCatch={kind,time:this.time};return;}this.mode='lost';this.failure=RULES[kind].failure;this.lastCatch=kind;}
 resolveThreat(){if(!this.threat)return;const t=this.threat;if(t.kind==='kun')this.states[t.floor].kunWait=30;if(t.kind==='liang'){const s=this.states[t.floor];s.interactions[t.tvId]=false;if(t.floor===3&&t.closedByPlayer&&this.mode==='playing'){s.liangCleared=true;s.yujieFollowup=2;}}if(t.kind==='yujie'){this.states[t.floor].yujieWait=(t.floor===3?28:35)+(this.seed+t.floor+this.states[t.floor].yujieVisits*7)%(t.floor===3?9:16);this.emit('来访者消失了。可以抬头了。',4);}if(t.kind==='doubao'){const s=this.states[t.floor];s.doubaoWait=null;this.emit('棍母终究还是不存在的。',4);if(this.mode==='playing'&&t.phase==='leaving'&&t.exposure>=DISPEL_SECONDS){s.gunmuDefeated=true;s.yujieFollowup=3;}
   if(this.mode==='playing'&&s.patrolCleared&&t.phase==='leaving'&&t.exposure>=DISPEL_SECONDS&&s.doors.some(d=>d.logLock&&d.locked)&&!s.logKey){s.logKey=true;this.emit('棍母终究还是不存在的。获得滚木，前往尽头防火门按 E 开锁。',6);}
  }if(t.kind==='patrol'){if(t.floor===1){this.states[1].doubaoWait=0;if(this.mode==='playing'&&t.phase==='leaving'&&!t.debugScared)this.states[1].patrolCleared=true;}this.states[t.floor].patrolWait=(t.floor===2?24:28)+(this.seed+t.floor+this.states[t.floor].patrols*(t.floor===2?5:7))%(t.floor===2?7:11);this.emit(t.floor===2?'巡楼结束了。按一个灯开关，恢复本层照明。':'巡楼结束了。找到两处不同的开关，恢复本层照明。',5);}this.threat=null;this.resolved++;this.cooldown=t.kind==='patrol'?8:5+(this.seed+t.floor+this.resolved)%3;if(t.kind!=='patrol'&&t.kind!=='yujie'&&t.kind!=='doubao')this.emit(t.exitInspection?'查房结束。打开外门，走出去。':t.kind==='liang'?'信号消失了。现在可以继续走。':'它暂时离开了。继续下楼。',3);if(this.pendingCheckpoint)this.saveCheckpoint(this.pendingCheckpoint);}
 beginEncounter(kind,position){if(this.threat||kind==='kun'&&(position?.floor??this.player.floor)===2||kind==='doubao'&&((position?.floor??this.player.floor)!==1||!this.states[1].flashlight)||kind==='yujie'&&(position?.floor??this.player.floor)>3)return false;const p=position||this.spawnFor(kind);if(!p)return false;const broadcast=kind==='liang'?this.planBroadcast(p):null;if(kind==='liang'&&!broadcast)return false;
  this.threat={kind,...p,age:0,unseen:0,hidden:0,phase:'warning',checks:0,moving:0,secondChance:false,lastSeen:{...this.player},searchPoints:[],searched:0,path:[],pathAge:1,searchAge:0,distance:Infinity,observed:false,warning:kind==='inspector'?1.6:kind==='kun'&&p.floor===1?6:2.8};
  if(kind==='liang'){Object.assign(this.threat,broadcast,{pressure:0,quiet:0,warning:3});this.states[p.floor].interactions[p.tvId]=true;}
  if(kind==='doubao'){Object.assign(this.threat,{warning:2,exposure:0,retreat:0});this.emit('灯闪了。棍母来了，举起强光对准它！',5);return true;}
  if(kind==='yujie'){if(p.floor===1)this.threat.copies=(p.copies||[{floor:p.floor,x:p.x,z:p.z}]).slice(0,1);this.threat.warning=3;this.threat.retreat=0;this.states[p.floor].yujieVisits++;this.emit('灯光发冷。有人要来拜访了。低头，别看她。',3);}else this.emit(RULES[kind].action,6);return true;
 }
 planBroadcast(p){
  const f=this.building.byId[p.floor],tv=f.interactions.find(i=>i.id===p.tvId&&i.type==='tv');if(!tv)return null;
  const doors=this.states[p.floor].doors,sweeps=doors.flatMap(d=>[0,.5,1].map(amount=>doorBlock({...d,amount})));
  const pool=this.nav.byFloor[p.floor].filter(n=>n.x>10.5&&floorPassable(f,n,.45,sweeps));
  const point=n=>({floor:p.floor,x:n.x,z:n.z}),tvPoint={floor:p.floor,...tv.target,y:f.base};
  const near=pool.filter(n=>d2(n,tv.target)>=1.3&&d2(n,tv.target)<=2.2&&this.line(tvPoint,n)).sort((a,b)=>d2(a,this.player)-d2(b,this.player))[0];if(!near)return null;
  const entry=this.nav.path(this.player,near,this.doors);if(!entry.length||entry.some(n=>n.floor!==p.floor))return null;
  const farCandidates=pool.filter((n,i)=>i%7===0&&d2(n,near)>7&&d2(n,near)<14).sort((a,b)=>((a.x*13+a.z*31+this.seed)%19)-((b.x*13+b.z*31+this.seed)%19));
  for(const far of farCandidates){
   const outward=this.nav.path(near,far,this.doors);if(!outward.length||outward.some(n=>n.floor!==p.floor)||outward.distance>18)continue;
   const duration=Math.max(28,Math.ceil((entry.distance+outward.distance*2)/2.4+12));if(duration>45)continue;
   return{remotes:[near,far].map((n,i)=>({...point(n),id:`${p.tvId}-remote-${i}`,collected:false})),duration};
  }
  return null;
 }
 spawnFor(kind){
  if(kind==='doubao'){
   const candidates=this.nav.byFloor[1].filter((p,i)=>i%3===0&&d2(p,this.player)>=11&&d2(p,this.player)<=16&&this.line(this.player,p)&&floorPassable(this.floor,p,.4,this.state.doors.map(d=>d.block))).sort((a,b)=>Math.abs(d2(a,this.player)-13)-Math.abs(d2(b,this.player)-13));
   return candidates.find(p=>{const path=this.nav.path(p,this.player,this.doors);return path.length&&path.every(n=>n.floor===1);})||null;
  }
  if(kind==='yujie'){
   if(this.player.floor>3)return null;
   const doors=this.state.doors.flatMap(d=>[0,.5,1].map(amount=>doorBlock({...d,amount})));
   const pool=this.nav.byFloor[this.player.floor].filter((p,i)=>i%3===0&&p.x>10.5&&d2(p,this.player)>=7&&floorPassable(this.floor,p,1.4,doors));
   const candidates=pool.filter(p=>d2(p,this.player)<=15&&this.line(this.player,p));
   if(!candidates.length)return null;let n=(this.seed^Math.imul(this.player.floor,73856093)^Math.imul(this.state.yujieVisits+1,19349663))>>>0;
   const pick=list=>{n=Math.imul(n^(n>>>16),0x45d9f3b)>>>0;return list[n%list.length];},point=p=>({floor:p.floor,x:p.x,z:p.z});
   const copies=[point(pick(candidates))];
   while(copies.length<(this.player.floor===1?1:3)){const available=pool.filter(p=>copies.every(q=>d2(p,q)>=4));if(!available.length)break;copies.push(point(pick(available)));}
   return{...copies[0],copies};
  }
  if(kind==='liang'){const tv=this.floor.interactions.find(i=>i.type==='tv'&&d2(i.target,this.player)<10&&this.line({floor:this.player.floor,...i.target,y:this.floor.base},this.player));return tv?{floor:this.player.floor,x:tv.target.x,z:tv.target.z,tvId:tv.id}:null;}
  const path=this.floor.mainRoute;let best=null,score=Infinity,escapePaths;for(const [x,z]of path.flatMap((a,i)=>{if(!i)return[a];const b=path[i-1],n=Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1]));return Array.from({length:n},(_,j)=>[b[0]+(a[0]-b[0])*(j+1)/n,b[1]+(a[1]-b[1])*(j+1)/n]);})){
   const p={x,z,floor:this.player.floor},dist=d2(p,this.player);if(dist<9||dist>16||!this.line(p,this.player)||!floorPassable(this.floor,p,.3,this.state.doors.map(d=>d.block)))continue;
   const spawnDistance=this.nav.distance(p,{...this.floor.spawn,floor:p.floor});
   const ahead=kind==='kun'&&spawnDistance>this.nav.distance(this.player,{...this.floor.spawn,floor:p.floor})-6;
   if(ahead){
    // A frontal fallback must leave a real escape, even if Kun could cut straight across the room.
    escapePaths??=this.floor.interactions.filter(i=>i.type==='wardrobe').map(w=>this.nav.path(this.player,{floor:p.floor,...w.entry},this.doors)).filter(route=>route.length&&route.every(n=>n.floor===p.floor));
    const warning=p.floor===1?6:2.8;
    if(!escapePaths.some(route=>{const first=route.find(n=>d2(n,this.player)>1);if(!first||(first.x-this.player.x)*(p.x-this.player.x)+(first.z-this.player.z)*(p.z-this.player.z)>0)return false;let previous=this.player,travel=0;return route.every(n=>{travel+=d2(previous,n)/3.65;previous=n;return d2(p,n)>=3&&warning+d2(p,n)/4.25>=travel+.8;});}))continue;
   }
   const s=Math.abs(dist-12)+spawnDistance*.002+(ahead?1000:0);if(s<score){best=p;score=s;}}
  return best;
 }
 updateDoors(dt){for(const d of this.doors){const want=d.open?1:0;if(d.amount===want)continue;
   const next=Math.abs(want-d.amount)<.002?want:d.amount+(want-d.amount)*(1-Math.exp(-8*dt)),steps=Math.max(1,Math.ceil(Math.abs(next-d.amount)/.035)),step=(next-d.amount)/steps;
   const base=(d.floor-1)*RISE,bodies=[this.player,...(this.threat?.copies||[this.threat]),this.auxiliary].filter(p=>p&&(p.y??(p.floor-1)*RISE)<base+2.6&&(p.y??(p.floor-1)*RISE)+1.6>base);
   const held=d.held;d.held=false;
   for(let i=0;i<steps;i++){const amount=d.amount+step,b=doorBlock({...d,amount});if(bodies.some(p=>blocked(p.x,p.z,[b],.27))){d.held=true;break;}d.amount=amount;d.block=b;}
   if(d.held&&!held&&d.floor===this.player.floor)this.emit('门扇被挡住了。侧退一步，它会继续转动；E 可反向开关。',3);
   if(!d.held&&Math.abs(d.amount-want)<.001){d.amount=want;d.block=doorBlock(d);if(d.floor===this.player.floor&&!d.falseDoor)this.emit(want?(d.kind==='exit'?'外门开了。走出去。':'门已打开。'):(d.kind==='fire'?'防火门合上了。继续离开门口。':'门已合上。'),1.8);}
  }}
 movePlayer(dt,input){
  if(this.hiding)return 0;
  let f=input.forward||0,r=input.right||0;const len=Math.hypot(f,r);if(!len)return 0;f/=len;r/=len;if(this.peek)this.state.interactions[this.peek]=false;this.peek=null;const speed=input.sprint?3.65:2.4,yaw=input.yaw||0,dx=(-Math.sin(yaw)*f+Math.cos(yaw)*r)*speed*dt,dz=(-Math.cos(yaw)*f-Math.sin(yaw)*r)*speed*dt;
  const old={...this.player},steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.09));
  const valid=p=>{const doors=this.state.doors.map(d=>d.block);
   if(this.travel){const leaving=p.x>8.15&&localStair(p,this.travel.core).z>5;return leaving?floorPassable(this.floor,p,.24,doors):stairPassable(p,this.travel)&&!blocked(p.x,p.z,doors,.24);}
   const entry=this.stairEntry(p);return floorPassable(this.floor,p,.24,doors)&&(!entry||stairPassable(p,entry));
  };
  for(let i=0;i<steps;i++){let p={...this.player,x:this.player.x+dx/steps};if(valid(p))this.player.x=p.x;p={...this.player,z:this.player.z+dz/steps};if(valid(p))this.player.z=p.z;}
  this.updateStairs();this.player.y=stairHeight(this.player,this.player.floor,this.travel);return d2(old,this.player);
 }
 stairEntry(p){
  if(p.x>=8.15||p.z>=11&&p.z<21)return null;const core=p.z<15?'A':'B',f=this.player.floor;
  if(core===this.floor.departure&&f>1)return{from:f,core,phase:'upper'};
  if(core===this.floor.arrival&&f<5)return{from:f+1,core,phase:'lower'};return null;
 }
 updateStairs(){
  if(!this.travel){const entry=this.stairEntry(this.player);if(entry&&stairPassable(this.player,entry))this.travel=entry;}
  if(!this.travel)return;const t=this.travel,q=localStair(this.player,t.core);
  if(q.z<2.4){if(q.x>2.5&&t.phase==='upper'){t.phase='lower';this.enterFloor(t.from-1);}else if(q.x<2.25&&t.phase==='lower'){t.phase='upper';this.enterFloor(t.from);}}
  if(q.x>6.15&&q.z>5){this.enterFloor(t.phase==='lower'?t.from-1:t.from);this.travel=null;}
 }
 director(dt){
  const finale=this.player.floor===1&&this.state.exitInspectionWait!==null;
  if(finale)this.state.exitInspectionWait=Math.max(0,this.state.exitInspectionWait-dt);
  if(this.hiding)return;
  if(finale||this.player.floor===1&&this.player.x<8.1&&this.player.z>=23&&this.player.z<30.1&&!this.travel){
   if(finale&&this.state.exitInspectionWait>1e-6)return;
   if(!this.state.exitInspection&&!this.state.doors.find(d=>d.logLock).locked&&(finale||!this.threat)){
    const candidates=[{x:4.5,z:25.6},{x:6.5,z:26.1},{x:4.5,z:24},{x:6.5,z:29.1},{x:9,z:24},...this.nav.byFloor[1].filter(p=>d2(p,this.player)<8)];
    const position=candidates.map(p=>({floor:1,...p})).find(p=>d2(p,this.player)>=2&&this.line(this.player,p)&&floorPassable(this.floor,p,.3,this.state.doors.map(d=>d.block)));
    if(position){
     // The timed finale replaces the current encounter instead of stacking or waiting for it.
     if(finale){if(this.threat?.kind==='liang')this.state.interactions[this.threat.tvId]=false;this.threat=null;this.sanityExposed=false;this.debugPendingScare=false;}
     if(this.beginEncounter('inspector',position)){this.state.exitInspection=true;this.state.exitInspectionWait=null;this.threat.exitInspection=true;this.threat.warning=2;this.emit('出口前还有一次查房。停住脚步，可以转头。',5);}
    }
   }
   return;
  }
  this.cooldown=Math.max(0,this.cooldown-dt);if(this.travel||this.mode!=='playing')return;
  if(this.player.floor===1&&!this.state.flashlight)return;
  if(this.player.floor===1&&this.state.doubaoWait!==null){
   if(this.player.x<10.5||this.player.z<21)return;
   this.state.doubaoWait=Math.max(0,this.state.doubaoWait-dt);
   if(this.state.doubaoWait===0&&!this.threat){if(!this.beginEncounter('doubao'))this.state.doubaoWait=3;return;}
   return;
  }
  if([1,3].includes(this.player.floor)&&this.state.yujieFollowup!==null){
   if(this.threat)return;
   this.state.yujieFollowup=Math.max(0,this.state.yujieFollowup-dt);
   if(this.state.yujieFollowup<1e-6){if(this.beginEncounter('yujie'))this.state.yujieFollowup=null;else this.state.yujieFollowup=.5;}
   return;
  }
  if([1,4].includes(this.player.floor)&&this.threat?.kind!=='kun')this.state.kunWait=Math.max(0,this.state.kunWait-dt);
  if(this.player.floor<=2&&!this.threat)this.state.patrolWait=Math.max(0,this.state.patrolWait-dt);
  if([1,3].includes(this.player.floor)&&!this.threat)this.state.yujieWait=Math.max(0,this.state.yujieWait-dt);
  const s=this.state,f=this.floor;this.directorAge=(this.directorAge||0)+dt;if(this.directorAge<.35)return;this.directorAge=0;
  const remaining=this.nav.distance(this.player,{floor:f.id,...f.destination}),total=this.nav.distance({floor:f.id,...f.spawn},{floor:f.id,...f.destination});s.progress=Math.max(s.progress,Math.max(0,Math.min(1,1-remaining/total)));
  if([1,4].includes(f.id)&&!this.threat&&this.cooldown===0&&s.kunWait===0&&!(f.id===1&&this.player.x<8&&this.player.z>29.4)&&!(f.id<=2&&s.patrolWait===0)){
   if(!this.beginEncounter('kun'))s.kunWait=3;
   else if(f.id===4&&s.events===0)s.events=1;
   return;
  }
  if((f.id===3&&s.liangCleared||f.id===1&&s.gunmuDefeated)&&!this.threat&&this.cooldown===0&&s.yujieWait===0&&!(f.id===1&&this.player.x<8&&this.player.z>29.4)&&!(f.id<=2&&s.patrolWait===0)){if(!this.beginEncounter('yujie'))s.yujieWait=3;return;}
  if(f.id<=2){
   if(this.threat||this.cooldown>0||f.id===1&&this.player.x<8&&this.player.z>29.4)return;
   if(s.patrolWait===0&&s.doubaoWait===null){if(!this.beginPatrol())s.patrolWait=3;return;}
   if(s.patrols>0&&s.events<1&&s.progress>.55&&s.patrolWait>12){const kind=['naiwa','liang'][(this.seed+f.id)%2];if(this.beginEncounter(kind))s.events++;}return;
  }
  if(!this.threat&&this.cooldown===0&&s.events<2&&s.progress>=[.12,.58][s.events]){
   const tutorial={5:['inspector','naiwa'],4:['kun','naiwa'],3:['liang','naiwa']},pool=['inspector','naiwa','kun','liang'];const kind=tutorial[f.id]?.[s.events]||pool[(this.seed+f.id+s.events*2)%pool.length];if(this.beginEncounter(kind)){s.events++;}}
 }
 planSearch(t){
  const f=this.building.byId[t.lastSeen.floor],candidates=[...f.mainRoute.map(([x,z])=>({x,z,floor:f.id})),...this.nav.nodes.filter((p,i)=>p.floor===t.floor&&i%13===0&&d2(p,t)<12)];
  t.searchPoints=[];
  for(const p of candidates.sort((a,b)=>d2(a,t.lastSeen)-d2(b,t.lastSeen))){
   if(d2(p,t.lastSeen)<2||t.searchPoints.some(q=>d2(p,q)<4))continue;
   const path=this.nav.path(t,p,this.doors),point=path.at(-1);if(!point||path.distance<1)continue;
   t.searchPoints.push({...point});if(t.searchPoints.length===2)break;
  }
  t.searched=0;t.searchAge=0;
 }
 escapeRoute(door){
  if(door.kind!=='wood')return null;
  const other=this.state.doors.find(d=>d.kind==='wood'&&d.id!==door.id&&d.open);if(!other)return null;
  const side=this.player.x<door.x?-1:1,target={floor:this.player.floor,x:other.x+side*1.6,z:other.z};
  const path=this.nav.path(this.player,target,this.doors);
  return path.length&&path.distance>2?path:null;
 }
 travelActor(t,dt,speed,target){
  if(t.link){
   const link=t.link,door=this.states[link.to].doors.find(d=>d.id===`${link.to}-${link.core}`);
   if(link.blocked&&door.amount>.85){link.blocked=false;t.searched=0;t.trail=link.destination;}
   let progress=Math.min(1,link.progress+dt*speed/13);
   if(link.blocked){const observation=t.searched===0?.8:.6;progress=Math.max(observation,link.progress-dt*speed/13);if(progress===observation&&t.searched<2)t.searched++;}
   const p=stairPoint(link.from,link.core,link.down?progress:1-progress),floor=progress>.5?link.to:(link.down?link.from:link.from-1);
   if(this.states[floor].doors.some(d=>blocked(p.x,p.z,[d.block],.27))){
    if(link.progress<.2){t.link=null;t.trail=null;t.path=[];t.pathAge=1;}
    else{link.blocked=true;t.trail=null;t.searchPoints=[];t.searched=0;}
    return;
   }
   link.progress=progress;Object.assign(t,p);t.floor=floor;
   if(progress>=1){Object.assign(t,link.destination);t.link=null;t.path=[];t.pathAge=1;}return;
  }
  const creeper=t.kind==='naiwa';
  t.pathAge+=dt;if(t.pathAge>.5){t.path=this.nav.path(t,target,this.doors,false,creeper?{agent:'naiwa'}:undefined);t.pathAge=0;
   while(t.path.length&&t.path[0].floor===t.floor&&d2(t,t.path[0])<.035)t.path.shift();
   const next=t.path[1];if(t.path.length>1&&d2(t,t.path[0])<.35&&next.floor===t.floor){const steps=Math.ceil(d2(t,next)/.08),blocks=this.states[t.floor].doors.map(d=>d.block);let clear=true;for(let i=1;i<=steps;i++)if(!floorPassable(this.building.byId[t.floor],{x:t.x+(next.x-t.x)*i/steps,z:t.z+(next.z-t.z)*i/steps},.27,blocks)){clear=false;break;}if(clear)t.path.shift();}
   if(creeper&&target.floor===(t.path.at(-1)?.floor??t.floor)){
    const last=t.path.at(-1)??t,blocks=this.states[target.floor].doors.map(d=>d.block);
    if(d2(last,target)<.58&&clearActorTravel(this.building.byId[target.floor],last,target,blocks))t.path.push({x:target.x,z:target.z,floor:target.floor});
   }
  }
  let budget=speed*dt;while(budget>0&&t.path.length){const n=t.path[0];if(n.floor!==t.floor){const down=n.floor<t.floor;t.link={from:Math.max(t.floor,n.floor),to:n.floor,core:n.core,down,progress:0,destination:n};t.path=[];return;}
   const dist=d2(n,t);if(dist<.01){t.path.shift();continue;}const amount=Math.min(budget,dist),p={x:t.x+(n.x-t.x)*amount/dist,z:t.z+(n.z-t.z)*amount/dist};
   const floor=this.building.byId[t.floor],blocks=this.states[t.floor].doors.map(d=>d.block);
   if(!(creeper?clearActorTravel(floor,t,p,blocks):floorPassable(floor,p,.26,blocks))){t.pathAge=1;return;}
   t.x=p.x;t.z=p.z;budget-=amount;if(amount===dist)t.path.shift();}
  t.y=(t.floor-1)*RISE;
 }
 blockedDoor(t){
  const route=this.nav.path(t,t.lastSeen,[],true);for(const n of route){const door=this.states[n.floor].doors.find(d=>!d.open&&!d.locked&&!d.broken&&d2(d,n)<1.5);if(door)return door;}return null;
 }
 updateThreat(dt,input,moved){
  this.sanityExposed=false;const t=this.threat;if(!t)return;t.age+=dt;t.visible=this.line(t,this.player);t.observed=this.viewed(t,input);t.distance=Math.hypot(t.x-this.player.x,t.z-this.player.z,(t.y??(t.floor-1)*RISE)-this.player.y);
  if(t.kind==='patrol')t.sealed=!!sealedShelter(this);
  if(t.age<t.warning&&t.kind!=='doubao')return;
  if(t.kind==='doubao'){
   if(t.phase==='leaving'){t.retreat+=dt;if(t.retreat>=1)this.resolveThreat();return;}
   t.phase=t.age<t.warning?'rising':'pursuing';
   const dx=t.x-this.player.x,dz=t.z-this.player.z,dy=(t.y??0)+Math.max(.08,(2.65+gunmuRise(t.age))/2)-this.player.y-1.65,length=Math.hypot(dx,dy,dz),yaw=input.yaw||0,pitch=input.pitch||0;
   const alignment=((-Math.sin(yaw)*dx-Math.cos(yaw)*dz)*Math.cos(pitch)+dy*Math.sin(pitch))/Math.max(.001,length);
   t.illuminated=this.states[1].flashlight&&!this.hiding&&!this.peek&&this.line(this.player,{...t,y:(t.y??0)+Math.max(.08,(2.65+gunmuRise(t.age))/2)-1.65})&&length<=18&&alignment>=Math.cos(FLASHLIGHT_HALF_ANGLE);
   if(t.illuminated)t.exposure=Math.min(DISPEL_SECONDS,t.exposure+dt);
   if(t.exposure>=DISPEL_SECONDS-1e-6){t.exposure=DISPEL_SECONDS;t.phase='leaving';return;}
   if(t.age<t.warning)return;
   t.lastSeen={...(this.hiding?this.hiding.entry:this.player)};
   const door=this.blockedDoor(t);
   if(door&&door.floor===t.floor&&d2(t,door)<2.5){if(t.doorId!==door.id){t.doorId=door.id;t.doorTime=0;this.emit('门把手动了。准备好强光。',2);}t.doorTime+=dt;if(t.doorTime>=1.2){door.open=true;t.pathAge=1;}}
   // Leave room to exit the wardrobe and aim; waiting inside never dispels this visitor.
   if(!this.hiding||d2(t,this.hiding.entry)>6.5)this.travelActor(t,dt,3.85,t.lastSeen);
   if(!this.hiding&&d2(t,this.player)<.72&&this.line(t,this.player))this.fail('doubao');return;
  }
  if(t.kind==='kun'&&this.hiding){
   t.wardrobeAge=(t.wardrobeAge||0)+dt;t.phase=t.wardrobeAge<6?'wardrobe-search':'wardrobe-leaving';
   if(t.wardrobeAge<6){this.travelActor(t,dt,3.2,this.hiding.entry);}
   else{
    if(!t.wardrobeRetreat){
     const candidates=this.nav.byFloor[t.floor].filter((p,i)=>i%13===0&&d2(p,this.hiding.entry)>6&&d2(p,this.hiding.entry)<10);
     t.wardrobeRetreat=candidates.find(p=>{const path=this.nav.path(t,p,this.doors);return path.length&&path.distance<14;})||{floor:t.floor,x:t.x,z:t.z};t.pathAge=1;
     this.emit('它正在走远。继续待在柜内。',3);
    }
    this.travelActor(t,dt,3.2,t.wardrobeRetreat);
   }
   if(t.wardrobeAge>=8.5)this.resolveThreat();return;
  }
  if(t.kind==='patrol'){updatePatrol(this,t,dt);return;}
  if(t.kind==='yujie'){
   if(t.phase==='warning'){
    t.copies=(t.copies||[{floor:t.floor,x:t.x,z:t.z}]).filter(p=>d2(p,this.player)>=2.4&&floorPassable(this.building.byId[p.floor],p,1.4,this.states[p.floor].doors.map(d=>d.block)));
    if(!t.copies.length){this.resolveThreat();return;}Object.assign(t,t.copies[0]);
   }
   if(t.age>=t.warning+22){t.phase='leaving';t.retreat+=dt;if(t.retreat>=1.3)this.resolveThreat();return;}
   t.phase='watching';t.observed=(t.copies||[t]).some(p=>this.viewed(p,input,32));this.sanityExposed=t.observed;
   if(t.observed){this.sanityRest=0;this.sanity=Math.max(0,this.sanity-dt*44);if(this.sanity<=30&&!t.secondChance){t.secondChance=true;this.emit('别再看了。低头！',2);}if(this.sanity===0)this.fail('yujie');}return;
  }
  if(t.kind==='liang'){
   t.phase='broadcasting';t.pressure=Math.min(1,(t.age-t.warning)/t.duration);
   if(t.pressure>.75&&!t.secondChance){t.secondChance=true;this.emit('画面快撑破了。拿齐遥控器，立即关电视！',4);}
   if(t.pressure>=1)this.fail('liang');return;
  }
  if(t.kind==='inspector'){
   const time=t.age-t.warning,check=this.building.campaign?4.5:3,pause=this.building.campaign?2:1.2;
   const second=check+pause,end=second+check;
   t.phase=time<check?'checking':time<second?'between':time<end?'checking':'leaving';
   t.checks=time<check?0:time<end?1:2;
   if(t.movementLocked&&moved>0){this.fail('inspector');return;}
   if(t.phase==='checking'&&moved>0&&t.moveDeadline==null){t.moveDeadline=t.age+.5;this.emit('它看见你动了。半秒内停住！',2);}
   if(t.moveDeadline!=null){if(moved===0){t.moveDeadline=null;t.movementLocked=true;}else if(t.age>=t.moveDeadline-1e-6){this.fail('inspector');return;}}
   if(t.phase==='leaving'){t.retreat=time-end;if(t.retreat>=1.3)this.resolveThreat();}return;
  }
  t.phase='pursuing';if(t.visible){t.lastSeen={...this.player};t.hidden=0;t.searchPoints=[];t.searched=0;t.trail=null;}else{t.hidden+=dt;if(!t.trail&&!t.link?.blocked&&!t.searchPoints.length&&t.hidden>.8)this.planSearch(t);}
  const travelTime=t.kind==='naiwa'?naiwaTravelTime(t,dt):dt;
  if(t.kind!=='naiwa')t.unseen=t.observed?0:t.unseen+dt;
  const speed=t.kind==='kun'?4.25:2.95;
  const door=t.kind==='kun'?this.blockedDoor(t):null;
  if(door&&door.floor===t.floor&&d2(t,door)<3.1){
   if(t.kind==='kun'){
    if(t.doorId!==door.id){t.doorId=door.id;t.doorTime=0;const escape=this.escapeRoute(door);t.breachAllowed=!!escape;t.breachWarning=Math.max(4,(escape?.distance||0)/3.65+1.5);if(t.breachAllowed)this.emit('木门开始变形。离开门口，从另一边撤离！',t.breachWarning);else this.emit('门外的影子停住了。继续拉开距离。',4);}
    if(t.breachAllowed&&!this.escapeRoute(door)){t.breachAllowed=false;this.emit('门外停了下来。撤离通路被关上了。',3);}
    t.doorTime+=dt;t.phase=t.breachAllowed?'breaching':'held';
    if(t.breachAllowed&&t.doorTime>=t.breachWarning){door.broken=true;door.open=true;t.pathAge=1;t.doorId=null;this.emit('门被撞开了。继续走！',3);}else if(t.doorTime<4||t.breachAllowed)return;
   }
  }
  const target=t.visible?this.player:t.trail|| (t.searched<t.searchPoints.length?t.searchPoints[t.searched]:t.lastSeen);
  if(travelTime>1e-8)this.travelActor(t,travelTime,speed,target);
  if(t.trail){if(t.floor===t.trail.floor&&d2(t,t.trail)<.65){t.lastSeen={...t.trail};t.trail=null;this.planSearch(t);}else if(!t.link&&t.path.length===0){t.trailBlocked=(t.trailBlocked||0)+dt;if(t.trailBlocked>4){t.trail=null;this.planSearch(t);}}else t.trailBlocked=0;}
  else if(!t.visible){t.searchAge+=dt;if(t.searchPoints.length&&t.searched<t.searchPoints.length&&t.floor===target.floor&&d2(t,target)<.65){t.searched++;t.searchAge=0;t.pathAge=1;}else if(t.searchAge>10&&t.path.length===0&&!t.link){this.planSearch(t);}}
  if(t.kind!=='naiwa'&&t.hidden>2&&t.searched>=2){t.rangeAge=(t.rangeAge||0)+dt;if(t.rangeAge>.6){t.rangeAge=0;const distance=this.nav.distance(t,this.player);if(Number.isFinite(distance)&&distance>=(t.kind==='kun'?12:8)){this.resolveThreat();return;}}}
  t.distance=Math.hypot(t.x-this.player.x,t.z-this.player.z,(t.y??(t.floor-1)*RISE)-this.player.y);
  if(t.distance<.72&&this.line(t,this.player))this.fail(t.kind);
 }
 tick(dt,input={}){
  if(this.mode!=='playing')return;dt=Math.min(.1,Math.max(0,dt));this.time+=dt;this.updateDoors(dt);const moved=this.movePlayer(dt,input);
  // Crossing the outside threshold wins before a threat can catch on the same frame.
  if(this.player.floor===1&&this.player.x<7.5&&this.player.z>30.1&&this.state.doors.find(d=>d.kind==='exit').amount>.85){this.mode='won';this.threat=null;return;}
  this.director(dt);this.updateThreat(dt,input,moved);
  if(this.mode==='playing'&&!this.sanityExposed){this.sanityRest+=dt;if(this.sanityRest>2)this.sanity=Math.min(100,this.sanity+dt*6);}
 }
}
