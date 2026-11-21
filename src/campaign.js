import {Game,RULES as legacyRules,naiwaTravelTime} from './simulation.js';
import {RISE,within,floorPassable,doorBlock,localStair,stairPassable,stairHeight} from './building.js';
import {blocked,clearSight} from './logic.js';
import {falseDoorStartsSealed,sealFalseDoor,springFalseDoor,updateFalseDoorAttack} from './false-door.js';
import {approachInspector} from './inspector-approach.js';
import {clearActorTravel,crossesDoor} from './navigation.js';
import {rushWarningSeconds,sweepTiming} from './sweep-timing.js';
import {caughtInGunmuShaft,crawlGunmu,moveGunmuPlatforms} from './gunmu-finale.js';
import {chaseHazards,chaseHazardAge,chaseHazardPose} from './chase-hazard-geometry.js';

export {FLASHLIGHT_HALF_ANGLE,DISPEL_SECONDS,gunmuRise} from './simulation.js';
export const ITEM_NAMES={glowstick:'荧光棒',mint:'薄荷糖',ward:'清怪符',energy:'能量饮料'};
const supplyKinds=Object.keys(ITEM_NAMES),emptyInventory=()=>[null,null];
const wardHeights={inspector:1.32,naiwa:1.08};
export const RULES={...legacyRules,
 kun:{title:'借路者',action:'利用门和布帘甩开坤坤，钻进通风口。',failure:'坤坤追上了你。关门争取时间，绕过布帘后轻步离开最后的声源。'},
 patrol:{title:'汪精卫 · 巡楼者',action:'躲好！',failure:'巡楼覆盖整层。任何衣柜都能保护你，关门或躲在房间内没有用。'},
 rush:{title:'折返客',action:'躲好！',failure:'它会折返。第一次经过后的安静不是结束，留在衣柜直到第二次经过并退去。'},
 liang:{title:'良子 · 听声者',action:'轻步。',failure:'它听见了奔跑和翻找声。走开，别在最后出声的地方停留。'},
 doubao:{title:'棍母',action:'把棍母引进维修间，再从外面拉闸。',failure:'棍母追上了你。利用拐角拉开距离。'}
};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const naiwaOutOfRange=(a,p)=>a?.kind==='naiwa'&&Math.hypot(a.x-p.x,a.z-p.z,(a.y??(a.floor-1)*RISE)-p.y)>50;
const point=(p,floor)=>({x:p.x,z:p.z,floor:floor??p.floor});
const isSweep=kind=>kind==='patrol'||kind==='rush';
function hazardExit(block,p){
 const axis=block.maxX-block.minX<block.maxZ-block.minZ?'x':'z';
 const middle=axis==='x'?(block.minX+block.maxX)/2:(block.minZ+block.maxZ)/2;
 return {axis,direction:p[axis]<middle?-1:1};
}
const searchFloors=[7,6,5,4,2],listenerFloor=5;
const wardrobeLimit=5,wardrobeRecovery=15;
const depotCodeLength=5,depotAlarmDelay=4,depotAlarmDuration=4;
const depotExitPace=3,depotAlarmMaskDistance=6;
const listenerSprintHold=1;
const playerSprintSpeed=5,kunChaseSpeed=playerSprintSpeed*.85,kunFastSpeed=kunChaseSpeed*3,kunDoorWait=1.45;
const listenerPatrolPace=1.55,depotWalkRange=7,depotWalkCooldown=12;
const gunmuGateHold=15.5,gunmuPursuitSpeed=4.55;
export const CHASE_BOARD_DROP=.28,CHASE_BOARD_STUN=1.35;
const kunResident=f=>({kind:'kun',floor:f.id,y:f.base,...f.chaseSpawn,heading:f.chaseSpawn.yaw,phase:'dormant',age:0,warning:.9});
const partNames=['whole','front','back'];
function random(seed){let value=seed>>>0;return()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};}
const sweepOdds={
 7:{chance:.06,wang:15/23},6:{chance:.20,wang:35/55},
 4:{chance:.24,wang:40/90},2:{chance:.14,wang:.5}
};
function scheduleSweep(seed,floor,attempt,previous){
 const visit=previous?previous.visit+1:0;
 const key=seed^Math.imul(floor,0x9e3779b1)^Math.imul(attempt,0x165667b1)^Math.imul(visit,0x85ebca6b);
 const draw=random(Math.imul(key,0x27d4eb2f));
 const chance=previous?previous.chance*.8:sweepOdds[floor].chance;
 return {visit,chance,roll:draw(),kind:draw()<sweepOdds[floor].wang?'patrol':'rush',wait:visit?16+draw()*6:14+draw()*10};
}
export function makeFloorDeck(seed){
 const rng=random(seed^0x793d82b1),monsters=['naiwa','inspector','yujie','patrol','liang'];
 const shuffle=items=>{for(let i=items.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;};
 shuffle(monsters);
 const quietFloors=shuffle([...searchFloors]).filter(id=>id!==listenerFloor).slice(0,2),deck={8:{monster:null,quiet:false}};
 const originalLiang=monsters.indexOf('liang'),depot=searchFloors.indexOf(listenerFloor);
 [monsters[depot],monsters[originalLiang]]=[monsters[originalLiang],monsters[depot]];
 for(const [i,id]of searchFloors.entries())deck[id]={monster:monsters[i],quiet:quietFloors.includes(id)};
 return deck;
}

// Each clue group guarantees a slip; a second stash can hold the same digits.
function fillSearchSites(f,seed){
 const sites=f.interactions.filter(i=>i.form),loot={};
 if(!sites.length&&!f.listenerDepot)return{code:null,loot};
 const mixed=Math.imul(seed^Math.imul(f.id,0x9e3779b1),0x85ebca6b);
 const length=f.listenerDepot?depotCodeLength:4,draw=random(mixed^(mixed>>>16));
 const code=Math.floor(draw()*10**length).toString().padStart(length,'0');
 const extra=random(mixed^0x9e3779b9);
 for(const group of partNames){
  const choices=sites.filter(i=>i.clueGroup===group);
  if(!choices.length)continue;
  const [primary]=choices.splice(Math.floor(draw()*choices.length),1);
  loot[primary.id]=group;
  if(choices.length&&extra()<.7)loot[choices[Math.floor(extra()*choices.length)].id]=group;
 }
 const spare=sites.filter(i=>!(i.id in loot));
 for(const i of spare){
  const supplyChance=f.listenerDepot&&['drawer','cupboard'].includes(i.form) ? .72 : .55;
  loot[i.id]=draw()<supplyChance?supplyKinds[Math.floor(draw()*supplyKinds.length)]:null;
 }
 if(f.id===8&&spare.length&&!Object.values(loot).includes('ward')){
  const slot=spare.find(i=>!loot[i.id])??spare[0];
  loot[slot.id]='ward';
 }
 return{code,loot};
}

export class CampaignGame extends Game{
 reset(){
  this.run={selectedFloor:null,deaths:[],seconds:0};
  this.nextInspectorAt=0;this.falseDoorAttack=null;this.falseDoorsSpent=new Set();
  this.deck=makeFloorDeck(this.seed);this.states={};this.inventory=emptyInventory();this.energyUntil=0;this.searching=null;this.keypadOpen=false;
  for(const f of this.building.floors)this.states[f.id]=this.initialFloor(f);
  this.discoveredPortraits=[];this.sanity=100;this.sanityRest=0;this.sanityExposed=false;this.restoreStamina();
  this.mode='playing';this.time=0;this.threat=null;this.auxiliary=null;this.travel=null;this.traversal=null;this.peek=null;this.hiding=null;
  this.messages=[];this.resolved=0;this.cooldown=8;this.immunity=8;this.failure=null;this.pendingCheckpoint=null;
  this.startedFloors=new Set([8]);this.player={floor:8,...this.building.byId[8].spawn,y:7*RISE};this.checkpoint={floor:8};
  this.state.entryInventory=this.inventory.slice();this.state.entrySanity=this.sanity;this.emit('找密码。',3);
 }
 initialFloor(f){
  const doors=f.doorSpecs.map(d=>({...d,floor:f.id,amount:d.open?1:0,block:doorBlock({...d,amount:d.open?1:0}),broken:false}));
  for(const door of doors)if(door.falseDoor&&(falseDoorStartsSealed(f.id,this.seed)||this.falseDoorsSpent.has(door.id)))sealFalseDoor(door);
  return{doors,photoSeed:this.seed,
   ...(f.listenerDepot?{depotDigits:Array(depotCodeLength).fill(null),depotFinds:{},depotCrates:{},depotCrateAction:null,depotAlarms:{},depotExitAt:null}:{}),
   ...(f.gunmuFinale?{gunmuStage:'lure',gunmuBreachAt:null,gunmuPipeCheckpoint:false,gunmuSlides:{}}:{}),
   ...(f.mode==='chase'?{chaseResident:kunResident(f),chaseBoards:{},chaseStage:'entry',chaseCollapseAt:null,chaseHazardAt:{},ventSealed:false,chaseGuardSeen:false}:{}),
   interactions:{},blackout:false,flashlight:false,events:0,quietEnabled:this.deck[f.id]?.quiet??false,
   pendingEncounter:null,emptySearches:0,lastEncounterKind:null,omen:null,
   ...fillSearchSites(f,this.seed),codeParts:{whole:null,front:null,back:null},searched:{},entryInventory:null,keypadInput:'',keypadError:0,glowstick:null,wardThrow:null,paperNotice:null,
    sceneIndex:-1,approved:false,traversals:{},chaseStarted:false,chaseEscaped:false,ventOpen:false,metalAt:-Infinity,clothAt:-Infinity,encounterWait:0,pressureAge:0,wardrobeReadyAt:0};
 }
 restoreStamina(){this.maxStamina=100;this.stamina=100;this.staminaDelay=0;this.sprinting=false;this.exhausted=false;this.interactionMovement=0;}
 get itemsAvailable(){return this.floor.mode!=='boss';}
 get energySecondsLeft(){const left=Math.min(10,Math.max(0,(this.energyUntil??0)-this.time));return left>1e-8?left:0;}
 get powerSwitchesRequired(){return 1;}
 get currentScene(){
  if(this.travel)return null;
  return this.floor.scenes?.find(scene=>within(this.player,scene.bounds))||null;
 }
 get floorRoster(){
  const f=this.floor;
  if(f.id===8)return [];
  if(f.mode==='chase')return ['kun','naiwa'];
  if(f.mode==='boss')return ['doubao'];
  const resident=this.deck[f.id].monster;
  const roster=isSweep(resident)?[]:[resident];
  if(sweepOdds[f.id])roster.push('patrol','rush');
  return roster;
 }
 get wardrobeSecondsLeft(){return isSweep(this.threat?.kind)?0:Math.min(wardrobeLimit,Math.max(0,(this.hiding?.leaveAt??this.time)-this.time));}
 get wardrobeCooldown(){
  if(!this.floor.listenerDepot)return 0;
  const left=this.state.wardrobeReadyAt-this.time;
  return left>1e-8?Math.min(wardrobeRecovery,left):0;
 }
 get chaseAction(){return this.state.chaseAction??null;}
 get chaseStage(){return this.floor.mode==='chase'?this.state.chaseStage??'entry':null;}
 get standbyKun(){return !this.state.chaseStarted&&!this.state.chaseEscaped?this.state.chaseResident:null;}
 get ventReturnBlocks(){
  if(!this.state.chaseEscaped)return [];
  const vent=this.floor.traversals?.find(t=>t.kind==='vent');if(!vent)return [];
  const from=vent.via?.at(-1)??vent.a,to=vent.b,length=distance(from,to),width=(vent.width??1.2)/2;
  // Fill the last duct leg behind the safe landing, so the wider room cannot bypass a thin end wall.
  const start={x:to.x+(from.x-to.x)*.42/length,z:to.z+(from.z-to.z)*.42/length};
  return [{minX:Math.min(start.x,from.x)-(from.x===to.x?width:0),maxX:Math.max(start.x,from.x)+(from.x===to.x?width:0),
   minZ:Math.min(start.z,from.z)-(from.z===to.z?width:0),maxZ:Math.max(start.z,from.z)+(from.z===to.z?width:0)}];
 }
 get chaseBoardBlocks(){
  if(!this.state.chaseBoards)return [];
  const blocks=this.floor.interactions.filter(i=>{
   const board=this.state.chaseBoards[i.id];
   return board&&this.time>=board.startedAt+CHASE_BOARD_DROP&&board.blockUntil>this.time;
  }).map(i=>i.barrier);
  for(const hazard of chaseHazards(this.floor)){
   if(!chaseHazardPose(hazard,chaseHazardAge(this.floor,this.state,hazard,this.time)).solid)continue;
   const r=hazard.footprint;
   blocks.push({minX:r.x,maxX:r.x+r.w,minZ:r.z,maxZ:r.z+r.d,chaseCollapse:true,hazardId:hazard.id});
  }
  return blocks;
 }
 floorBlocks(){
  const doors=this.state.doors.map(d=>d.block);
  if(this.state.chaseBoards)doors.push(...this.chaseBoardBlocks);
  doors.push(...this.ventReturnBlocks);
  return doors;
 }
 get codeLength(){return this.floor.listenerDepot?depotCodeLength:4;}
 get depotCollected(){return this.state.depotDigits?.filter(digit=>digit!==null).length??0;}
 get depotCrateAction(){return this.state.depotCrateAction??null;}
 get depotExitDuration(){
  const f=this.floor;if(!f.listenerDepot)return 0;
  // The landing's last step is beyond the route marker. Average pace must exceed walking speed.
  return this.cachedDepotExitDuration??=Math.ceil((this.nav.distance(point(f.keypad.approach,f.id),point(f.destination,f.id))+.65)/depotExitPace);
 }
 get depotExitSeconds(){return this.floor.listenerDepot&&this.state.approved&&!this.travel?Math.min(this.depotExitDuration,Math.max(0,this.state.depotExitAt-this.time)):0;}
 get knownCode(){
  if(this.floor.listenerDepot)return this.depotCollected===depotCodeLength?this.state.depotDigits.join(''):null;
  const p=this.state.codeParts;return p.whole??(p.front!==null&&p.back!==null?p.front+p.back:null);
 }
 get keypadAvailable(){return !!this.floor.keypad&&!this.state.approved;}
 get codeHint(){
  if(this.floor.listenerDepot||this.knownCode!==null)return null;
  const s=this.state,group=Object.values(s.loot).includes('whole')?'whole':s.codeParts.front===null?'front':'back';
  const site=this.floor.interactions.find(i=>s.loot[i.id]===group);
  return site?{group,scene:this.floor.scenes.find(scene=>scene.id===site.sceneId)}:null;
 }
 get objective(){
  const s=this.state;
  if(this.floor.mode==='chase')return this.traversal?.kind==='vent'?'正在穿过通风管。':{entry:'翻过倒柜，按住 E 推开检修门。',corridor:'穿过分岔走廊，绕到风机房。',escape:'绕过障碍找到通风口，按 E 钻入。',complete:'追逐结束。前往楼梯离开本层。'}[this.chaseStage];
  if(this.floor.gunmuFinale){
   if(s.gunmuStage==='pipes')return '跟着手电跑。转弯前用开关移入水管。';
   if(s.gunmuStage==='trapped')return '沿标记跑向管道房。闸门撑不了多久。';
   if(s.gunmuStage==='breach')return '棍母破开了闸门。快跑！';
   return RULES.doubao.action;
  }
  if(this.floor.listenerDepot)return s.approved?'冲向楼梯！':this.knownCode?'输入密码。':'找齐五张纸条。';
  return s.approved?'锁开了。':this.knownCode?'输入密码。':'找密码。';
 }
 jumpFloor(id){
  if(!this.building.byId[id])return;
  this.state.stonePlayback=null;
  if(this.hiding)this.state.interactions[this.hiding.id]=false;
  this.enterFloor(id);this.state.chaseAction=null;this.state.wardrobeReadyAt=0;
  this.resetChaseEntry();
  if(this.floor.listenerDepot){this.relockDepotExit();this.state.depotExitAt=null;this.state.depotAlarms={};this.state.depotCrateAction=null;this.state.keypadInput='';}
  if(this.floor.gunmuFinale){
   this.states[id]=this.initialFloor(this.floor);
   this.state.entryInventory=this.inventory.slice();this.state.entrySanity=this.sanity;
  }
  this.keypadOpen=false;this.searching=null;Object.assign(this.player,this.floor.spawn,{y:this.floor.base});this.travel=null;this.threat=null;this.auxiliary=null;this.traversal=null;this.hiding=null;this.peek=null;this.debugPendingScare=false;this.cooldown=8;this.immunity=8;
 }
 enterFloor(id){
  if(!this.building.byId[id]||id===this.player.floor)return;
  this.falseDoorAttack=null;
  this.state.wardThrow=null;
  this.state.stonePlayback=null;
  if(this.hiding)this.state.interactions[this.hiding.id]=false;
  this.state.chaseAction=null;
  if(this.floor.listenerDepot)this.state.depotCrateAction=null;
  this.searching=null;this.keypadOpen=false;this.player.floor=id;this.state.entryInventory??=this.inventory.slice();this.state.entrySanity??=this.sanity;this.player.y=this.floor.base;this.threat=null;this.auxiliary=null;this.hiding=null;this.peek=null;this.traversal=null;
  this.resetChaseEntry();
  this.restoreStamina();
  this.debugPendingScare=false;this.debugLastCatch=null;this.sanityExposed=false;this.cooldown=8;this.immunity=8;this.messages=[];this.checkpoint={floor:id};this.startedFloors.add(id);
  this.emit(this.objective,7);
 }
 resetChaseEntry(){
  if(this.floor.mode!=='chase'||this.state.chaseEscaped)return;
  const s=this.state,gate=s.doors.find(d=>d.id===this.floor.chaseEntryDoorId);
  if(!s.chaseStarted&&!gate.open&&!gate.amount)return;
  s.chaseHazardAt={};s.chaseGuardSeen=false;
  s.chaseStarted=false;s.chaseResident=kunResident(this.floor);s.chaseBoards={};s.chaseStage='entry';s.chaseCollapseAt=null;s.ventOpen=false;s.ventSealed=false;
  gate.open=false;gate.amount=0;gate.held=false;gate.block=doorBlock(gate);
 }
 retry(){
  this.falseDoorAttack=null;
  this.energyUntil=0;
  const id=this.player.floor;
  const previous=this.state,fresh=this.initialFloor(this.floor),entry=previous.entryInventory??emptyInventory();
  fresh.sweepAttempt=(previous.sweepAttempt??0)+1;
  this.inventory=entry.slice();fresh.entryInventory=entry.slice();fresh.entrySanity=previous.entrySanity??100;fresh.codeParts={...previous.codeParts};
  if(this.floor.listenerDepot){
   fresh.depotDigits=previous.depotDigits.slice();
   fresh.stoneSpent=previous.stoneSpent;
   fresh.depotFinds={...previous.depotFinds};
   fresh.depotCrates={...previous.depotCrates};
  }
  for(const [site,kind]of Object.entries(fresh.loot))if(partNames.includes(kind)&&fresh.codeParts[kind]!==null&&previous.loot[site]===null){fresh.searched[site]=true;fresh.loot[site]=null;}
  this.states={...this.states,[id]:fresh};this.searching=null;this.keypadOpen=false;
  this.player={floor:id,...this.floor.spawn,y:this.floor.base};
  this.threat=null;this.auxiliary=null;this.travel=null;this.traversal=null;this.hiding=null;this.peek=null;this.failure=null;this.mode='playing';this.sanity=fresh.entrySanity;this.sanityExposed=false;
  this.cooldown=8;this.immunity=8;this.messages=[];this.checkpoint={floor:id};this.debugPendingScare=false;
  this.restoreStamina();
  if(this.floor.gunmuFinale&&previous.gunmuPipeCheckpoint)this.rehearseGunmuPipes();
  this.emit(this.floor.mode==='chase'?RULES.kun.action:this.depotCollected||Object.values(fresh.codeParts).some(v=>v!==null)?'纸条还在。':this.objective,5);
 }
 fail(kind){
  if(this.mode!=='playing')return;
  if(this.debugMode){const actor=this.auxiliary?.kind===kind?this.auxiliary:this.threat;this.debugLastCatch={kind,time:this.time};if(!actor?.debugScared&&this.time-(this.lastDebugScare??-10)>3){this.lastDebugScare=this.time;this.lastCatch=kind;this.debugPendingScare=true;if(actor)actor.debugScared=true;}return;}
  if(this.immunity>0)return;
  this.endAttempt(kind,RULES[kind]?.failure||'回到本层入口。');
 }
 endAttempt(kind,message){
  if(this.mode!=='playing')return;
  this.run.deaths.push({kind,floor:this.player.floor});
  this.keypadOpen=false;this.searching=null;this.mode='lost';this.failure=message;this.lastCatch=kind;
 }
 renderFloors(){
  if(this.travel)return[this.travel.from,this.travel.from-1];
  const f=this.floor;
  if(f.id===1||distance(this.player,f.destination)>7)return[f.id];
  const door=this.state.doors.find(d=>d.id===`${f.id}-${f.departure}`);
  return door&&!door.locked?[f.id,f.id-1]:[f.id];
 }
 stairEntry(p){
  if(p.x>=8.15||p.z>=11&&p.z<21)return null;
  const core=p.z<15?'A':'B',f=this.floor;
  if(core===f.departure&&f.id>1){if(f.mode==='inspection'&&!this.state.approved||f.mode==='chase'&&!this.state.chaseEscaped)return null;return{from:f.id,core,phase:'upper'};}
  if(core===f.arrival&&f.id<8)return{from:f.id+1,core,phase:'lower'};return null;
 }
 interact(id,selectedSlot){
  const before=this.hiding,stopping=this.state.stonePlayback?.site.id===id,used=this.interactTarget(id,selectedSlot);
  if(used&&(before&&!this.hiding||this.depotCrateAction?.id===id||stopping||this.state.stonePlayback?.site.id===id))return true;
  if(used&&this.threat?.kind==='kun'){
   const door=this.state.doors.find(d=>d.id===id);
   if(door)this.kunNoise(this.player,'door',12);
  }else if(used&&(!this.floor.listenerDepot||this.hiding===before&&!this.state.depotAlarms[id]))this.hearNoise(this.hiding?.entry??this.player);
  return used;
 }
 interactTarget(id,selectedSlot){
  if(this.mode!=='playing'||this.keypadOpen||this.travel||this.searching||this.chaseAction||this.depotCrateAction||this.falseDoorAttack)return false;
  const s=this.state,i=this.floor.interactions.find(i=>i.id===id),door=s.doors.find(d=>d.id===id);
  if(this.hiding)return i?.type==='wardrobe'?this.useWardrobe(i):false;
  if(door){
   if(door.vanished||this.interactionReach(door))return false;
   if(door.kind==='isolation-gate')return false;
   if(door.locked){this.emit(door.id===`${this.floor.id}-${this.floor.arrival}`?'上层楼梯已封闭':'需要密码。',3);return false;}
   if(this.floor.listenerDepot&&door.id===this.floor.exitGateId)return false;
   if(door.chasePush&&!door.open){
    this.state.chaseAction={kind:'push',id,elapsed:0,duration:door.pushDuration??.9};return true;
   }
   door.open=!door.open;door.held=false;
   if(door.open&&door.sweepThreshold&&sweepOdds[this.floor.id]&&!s.sweepDoors?.has(id))s.sweepOpenedDoor=id;
   return true;
  }
  if(!i||this.traversal)return false;
  if(i.type==='wardrobe')return this.useWardrobe(i);
  if(['vault','vent'].includes(i.type))return this.startTraversal(i.traversalId);
  if(i.type==='chase-board'){
   if(!this.canDropChaseBoard(i))return false;
   s.chaseBoards[i.id]={startedAt:this.time,blockUntil:this.time+CHASE_BOARD_DROP+.72,hit:false};
   this.kunNoise(i,'board',12);
   return true;
  }
  if(this.interactionReach(i))return false;
  if(i.type==='guide-stone'){
   if(s.stonePlayback?.site===i){this.stopGuideStone();return true;}
   if(s.stoneSpent)return false;
   s.stonePlayback={site:i,startedAt:this.time,endsAt:this.time+67.32};
   if(this.floor.listenerDepot)s.stoneSpent=true;
   this.updateGuideStone();
   return true;
  }
  if(i.type==='maintenance-lever')return this.pullGunmuLever(i);
  if(i.type==='shaft-switch'){
   if(s.gunmuSlides[id]!==undefined)return false;
   s.gunmuSlides[id]=this.time;
   this.emit('水管正在移入。',.8);
   return true;
  }
  if(i.type==='depot-slip'){
   if(this.depotCollected===depotCodeLength||s.depotFinds[id])return false;
   if(i.crate&&!s.depotCrates[id]){
    s.depotCrateAction={id,elapsed:0,duration:i.crate.duration??1.2};return true;
   }
   return this.collectDepotSlip(id);
  }
  if(i.type==='depot-alarm'||i.type==='depot-lure'){
   if(s.depotAlarms[id])return false;
   const ringAt=this.time+(i.delay??depotAlarmDelay);
   s.depotAlarms[id]={ringAt,ringEnd:ringAt+(i.duration??depotAlarmDuration),lastRingAt:null};return true;
  }
  if(i.type==='chase-bell'){
   if(s.interactions[id])return false;
   s.interactions[id]=true;s.bellPending=this.time+.55;
   return true;
  }
  if(i.form||i.type==='keypad'){
   if(i.type==='keypad'){if(!this.keypadAvailable)return false;this.searching=null;this.keypadOpen=true;return true;}
   if(s.searched[id])return this.takeFind(i,selectedSlot);
   this.searching={id,elapsed:0,duration:.5};return true;
  }
  if(i.type==='flashlight'){if(s.flashlight)return false;s.flashlight=true;s.interactions[id]=true;this.emit('强光手电已拾取。进入前方区域开始第一阶段。',6);return true;}
  if(i.type==='portrait'){
   if(!this.discoveredPortraits.includes(id)){this.discoveredPortraits.push(id);this.emit(`发现画像 ${this.discoveredPortraits.length} / ${this.portraitTotal} · +100 分`,3);}return true;
  }
  s.interactions[id]=!s.interactions[id];return true;
 }
 useWardrobe(item){
  if(!item||this.floor.mode!=='inspection'&&!item.sweepWardrobe)return false;
  const limited=this.floor.listenerDepot;
  if(this.hiding){
   if(item.id!==this.hiding.id)return false;
   return this.leaveWardrobe(item);
  }
  if(this.travel||this.wardrobeCooldown>1e-8||this.interactionReach(item))return false;
  this.hiding={id:item.id,entry:{floor:this.player.floor,...item.entry},yaw:item.yaw};this.peek=null;this.interactionMovement+=distance(this.player,item);Object.assign(this.player,{x:item.x,z:item.z});this.state.interactions[item.id]=true;
  const listener=this.threat?.kind==='liang'?this.threat:this.auxiliary;
  if(listener?.kind==='liang'){listener.sprintPursuitUntil=0;listener.running=false;}
  if(limited){this.hiding.leaveAt=this.time+wardrobeLimit;this.hearNoise(this.hiding.entry,5);}
  else this.emit('藏好了。巡楼者经过时留在柜内，按 E 离开。',4);
  return true;
 }
 leaveWardrobe(item){
  const blocks=this.floorBlocks();let exit=item.entry;
  if(!floorPassable(this.floor,exit,.24,blocks)){
   if(!this.floor.listenerDepot)return false;
   // Stay in front of the cabinet. A partly moved door must not pin the player inside.
   const nx=Math.sin(item.yaw),nz=Math.cos(item.yaw),walls=[...this.floor.boundaries,...this.floor.obstacles.filter(o=>!o.wardrobe||!blocked(item.x,item.z,[o],.01)),...blocks];
   exit=[.12,.35,.6].flatMap(depth=>[0,-.45,.45,-.8,.8].map(side=>({x:item.entry.x+nx*depth+nz*side,z:item.entry.z+nz*depth-nx*side})))
    .find(p=>floorPassable(this.floor,p,.24,blocks)&&clearSight(item,p,walls));
   if(!exit)return false;
  }
  this.interactionMovement+=distance(this.player,exit);Object.assign(this.player,exit,{y:this.floor.base});this.state.interactions[item.id]=false;this.hiding=null;
  if(this.floor.listenerDepot)this.state.wardrobeReadyAt=this.time+wardrobeRecovery;
  else this.emit('离开衣柜。继续前进。',2);
  return true;
 }
 updateRoute(){
  const floor=this.floor;
  if(!floor.scenes||this.travel||this.player.x<10.5||this.state.approved)return;
  const index=floor.scenes.indexOf(this.currentScene);
  if(index<=this.state.sceneIndex)return;
  if(this.state.sceneIndex===-1){
   const entrance=this.state.doors.find(d=>d.id===`${floor.id}-${floor.arrival}`);
   entrance.open=false;entrance.locked=true;entrance.amount=0;entrance.block=doorBlock(entrance);
  }
  if(index>0)this.reserveEncounter('landmark');
  this.state.sceneIndex=index;
 }
 reserveEncounter(reason){
  const s=this.state;
  if(!this.floor.keypad||this.floor.id===8||this.floor.listenerDepot||s.approved||this.hiding||this.travel||this.mode!=='playing')return;
  if(!s.pendingEncounter||reason==='return')s.pendingEncounter=reason;
 }
 interactionReach(i){
  const p=this.player;
  if(i.type==='shaft-switch'&&(this.state.gunmuStage!=='pipes'||this.state.gunmuPipeIndex!==i.standing||
    Math.abs(p.y-i.platformY)>.28))return 'blocked';
  if(i.type==='wardrobe'){
   if(this.hiding?.id===i.id)return null;
   const x=i.entry.x-i.x,z=i.entry.z-i.z;
   if((p.x-i.x)*x+(p.z-i.z)*z<(i.depth??.6)*.5*Math.hypot(x,z))return 'front';
   if(distance(p,i.entry)>1.65)return 'near';
   return this.line(p,{floor:p.floor,...i.entry})?null:'blocked';
  }
  if(i.type==='vault'||i.type==='vent'){
   const t=this.floor.traversals.find(t=>t.id===i.traversalId);
   if(this.traversalEntry(i.traversalId))return null;
   if(!t||Math.min(distance(p,t.a),distance(p,t.b))>1.8)return 'near';
   return i.type==='vent'&&distance(p,t.b)<distance(p,t.a)?'front':'blocked';
  }
  const t=i.target??i,dx=p.x-t.x,dz=p.z-t.z,r=Math.hypot(dx,dz);
  if(r>2.65)return 'near';
  if(!i.approach)return null;
  if(i.form&&dx*(i.approach.x-t.x)+dz*(i.approach.z-t.z)<=.02)return 'front';
  if(r<.01)return 'blocked';
  // End just in front of the handle rather than inside its own frame.
  const eye={x:p.x,y:p.y+1.65,z:p.z};
  const end={x:t.x+dx/r*.08,y:this.floor.base+t.y,z:t.z+dz/r*.08};
  return clearSight(eye,end,this.floor.sightObstacles)&&clearSight(eye,end,this.floorBlocks())?null:'blocked';
 }
 siteReachable(i){return !!i&&!this.interactionReach(i);}
 takeFind(i,selectedSlot){
  const s=this.state,kind=s.loot[i.id];if(!kind)return false;
  if(partNames.includes(kind)){
   if(s.codeParts[kind]===null){
    s.codeParts[kind]=kind==='whole'?s.code:kind==='front'?s.code.slice(0,2):s.code.slice(2);
    const digits=this.knownCode??(kind==='front'?s.codeParts.front+'––':'––'+s.codeParts.back);
    s.paperNotice={text:'纸条 · '+digits,delay:0};
    if(this.floor.id===8)s.omen={kind:'handle',started:this.time,seenAt:null};
    else this.reserveEncounter(this.knownCode?'return':'note');
   }
  }else{
   if(!this.itemsAvailable)return false;
   const empty=this.inventory.indexOf(null),slot=empty===-1?selectedSlot:empty;
   if(!Number.isInteger(slot)||slot<0||slot>=this.inventory.length){this.emit('道具栏已满。',2);return false;}
   const previous=this.inventory[slot];
   if(previous===kind)return false;
   this.inventory[slot]=kind;s.loot[i.id]=previous;this.emit(ITEM_NAMES[kind],2);return true;
  }
  s.loot[i.id]=null;return true;
 }
 updateSearch(dt,input){
  const opening=this.searching;if(!opening)return;
  const i=this.floor.interactions.find(i=>i.id===opening.id),t=i?.target;
  if(!t||this.travel||this.hiding||input.forward||input.right||!this.siteReachable(i)){this.searching=null;return;}
  if(Number.isFinite(input.yaw)){
   const dx=t.x-this.player.x,dz=t.z-this.player.z,dy=t.y-1.65,pitch=input.pitch??0;
   const dot=(-dx*Math.sin(input.yaw)-dz*Math.cos(input.yaw))*Math.cos(pitch)+dy*Math.sin(pitch);
   if(dot<Math.hypot(dx,dy,dz)*.63){this.searching=null;return;}
  }
  opening.elapsed+=dt;if(opening.elapsed+.00001<opening.duration)return;
  this.searching=null;this.state.searched[i.id]=true;
  this.state.emptySearches=this.state.loot[i.id]?0:this.state.emptySearches+1;
  if(this.state.emptySearches===2){this.reserveEncounter('empty');this.state.emptySearches=0;}
  if(i.type==='portrait'&&!this.discoveredPortraits.includes(i.id)){
   this.discoveredPortraits.push(i.id);this.emit(`发现画像 ${this.discoveredPortraits.length} / ${this.portraitTotal} · +100 分`,2);
  }
 }
 keypadKey(key){
  if(!this.keypadOpen||this.mode!=='playing')return false;
  if(key==='Escape'){this.keypadOpen=false;return true;}
  const s=this.state;if(s.keypadError>0)return false;
  if(/^\d$/.test(key)&&typeof key==='string'){s.keypadInput=(s.keypadInput+key).slice(0,this.codeLength);this.hearNoise(this.player);return true;}
  if(key==='Backspace'){s.keypadInput=s.keypadInput.slice(0,-1);this.hearNoise(this.player);return true;}
  if(key!=='Enter'||s.keypadInput.length!==this.codeLength)return false;
  this.hearNoise(this.player);
  if(this.knownCode===null||s.keypadInput!==s.code){
   s.keypadInput='';s.keypadError=1;this.emit(this.knownCode===null?'需要密码。':'不对',1);return false;
  }
  const door=s.doors.find(d=>d.id===this.floor.exitGateId);
  if(!door)return false;
  s.approved=true;s.pendingEncounter=null;door.locked=false;door.open=true;this.keypadOpen=false;
  if(this.floor.listenerDepot){s.depotExitAt=this.time+this.depotExitDuration;s.keypadInput='';}
  this.emit(this.floor.listenerDepot?'冲向楼梯！':'锁开了。',2);return true;
 }
 updateDepotExit(){
  const s=this.state;if(!s.approved||this.travel||this.time+1e-8<s.depotExitAt)return;
  this.relockDepotExit();
  this.emit('门已关闭。重新输入密码。',3);
 }
 relockDepotExit(){
  const door=this.state.doors.find(d=>d.id===this.floor.exitGateId);
  this.state.approved=false;door.locked=true;door.open=false;
 }
 collectDepotSlip(id){
  const s=this.state,slot=this.depotCollected;
  if(slot>=depotCodeLength||s.depotFinds[id])return false;
  const digit=s.code[slot];
  s.depotDigits[slot]=digit;s.depotFinds[id]={slot,digit};return true;
 }
 updateDepotCrate(dt,input){
  const action=this.depotCrateAction;if(!action)return;
  const site=this.floor.interactions.find(i=>i.id===action.id);
  if(!input.interactHeld||input.forward||input.right||this.travel||!this.siteReachable(site)){
   this.state.depotCrateAction=null;return;
  }
  const previous=action.elapsed;action.elapsed+=dt;
  if(previous<.16&&action.elapsed>=.16)this.hearNoise(this.player,site.crate.noise??15);
  if(action.elapsed+1e-8<action.duration)return;
  this.state.depotCrateAction=null;this.state.depotCrates[site.id]=true;
 }
 updateDepotAlarms(){
  if(this.travel)return;
  const alarms=this.state.depotAlarms,now=this.time+1e-8;
  for(const [id,alarm]of Object.entries(alarms)){
   if(now<alarm.ringAt)continue;
   const site=this.floor.interactions.find(i=>i.id===id);
   if(now>=alarm.ringEnd){
    if(site.mechanism==='intercom')delete alarms[id];
    continue;
   }
   const interval=site.pulseInterval??1;
   const pulse=alarm.ringAt+Math.floor((now-alarm.ringAt)/interval)*interval;
   if(alarm.lastRingAt===pulse)continue;
   alarm.lastRingAt=pulse;
   this.hearNoise(site.noise??site.target,Infinity,{approach:site.noiseApproach??site.approach,ringEnd:alarm.ringEnd,mechanism:site.mechanism??'clock'});
  }
 }
 wardActors(){
  return [this.threat,this.auxiliary?.kind==='naiwa'?this.auxiliary:null].filter(actor=>
   actor&&actor.floor===this.player.floor&&wardHeights[actor.kind]&&actor.phase!=='leaving');
 }
 wardTarget(yaw,pitch){
  const player=this.player,horizontal=Math.cos(pitch),vertical=Math.sin(pitch);
  const forwardX=-Math.sin(yaw)*horizontal,forwardZ=-Math.cos(yaw)*horizontal;
  let target=null,best=Math.cos(Math.PI/8);
  for(const actor of this.wardActors()){
   for(const p of [actor]){
    const height=(p.y??this.floor.base)+wardHeights[actor.kind],dx=p.x-player.x,dz=p.z-player.z,dy=height-player.y-1.65;
    const distance=Math.hypot(dx,dy,dz);
    if(distance>8)continue;
    const aim=(dx*forwardX+dz*forwardZ+dy*vertical)/Math.max(.01,distance);
    if(aim<=best||!this.line(player,{...p,y:height-1.65}))continue;
    target=actor;best=aim;
   }
  }
  return target;
 }
 advanceThrow(thrown,dt){
  const before=thrown.age;thrown.age+=dt;
  if(before<thrown.flight){
   const from={x:thrown.fromX+(thrown.x-thrown.fromX)*before/thrown.flight,z:thrown.fromZ+(thrown.z-thrown.fromZ)*before/thrown.flight};
   const progress=Math.min(1,thrown.age/thrown.flight),to={x:thrown.fromX+(thrown.x-thrown.fromX)*progress,z:thrown.fromZ+(thrown.z-thrown.fromZ)*progress};
   const steps=Math.max(1,Math.ceil(distance(from,to)/.08)),blocks=this.floorBlocks();let last=from;
   for(let step=1;step<=steps;step++){
    const next={x:from.x+(to.x-from.x)*step/steps,z:from.z+(to.z-from.z)*step/steps};
    if(!floorPassable(this.floor,next,.12,blocks)){
     thrown.x=last.x;thrown.z=last.z;thrown.flight=Math.min(thrown.age,thrown.flight);break;
    }
    last=next;
   }
  }
  return before<thrown.flight&&thrown.age>=thrown.flight;
 }
 hearThrowLanding(landing){
  this.hearNoise(landing,32,{mechanism:'impact',ringEnd:this.time+1.4});
 }
 updateWardThrow(dt){
  const thrown=this.state.wardThrow;if(!thrown)return;
  if(this.advanceThrow(thrown,dt)){
   const landing={floor:this.player.floor,x:thrown.x,z:thrown.z,y:this.floor.base};
   for(const actor of this.wardActors()){
    if(distance(landing,actor)>1.75||!this.line(landing,actor))continue;
    thrown.hit=true;
    if(actor===this.threat)this.resolveThreat();else this.auxiliary=null;
   }
   this.hearThrowLanding(landing);
   thrown.life=thrown.flight+1;
  }
  if(thrown.age>=thrown.life)this.state.wardThrow=null;
 }
 useItem(slot,yaw=0,pitch=0){
  const kind=this.inventory[slot];
  if(this.mode!=='playing'||!this.itemsAvailable||this.falseDoorAttack||this.keypadOpen||this.hiding||this.travel||this.traversal||!kind)return false;
  if(kind==='mint'){
   if(this.sanity>=100)return false;
   this.sanity=100;
  }else if(kind==='energy'){
   this.energyUntil=this.time+10;this.stamina=this.maxStamina;this.exhausted=false;this.staminaDelay=0;
  }else if(kind==='glowstick'){
   if(this.state.gunmuStage==='pipes'||this.state.glowstick?.age<this.state.glowstick?.flight)return false;
   const {x:fromX,z:fromZ}=this.player,blocks=this.floorBlocks();let x=fromX,z=fromZ;
   for(let step=1;step<=60;step++){
    const next={x:fromX-Math.sin(yaw)*step*.1,z:fromZ-Math.cos(yaw)*step*.1};
    if(!floorPassable(this.floor,next,.12,blocks))break;
    x=next.x;z=next.z;
   }
   this.state.glowstick={fromX,fromZ,x,z,age:0,flight:.35,life:12};
   if(this.threat?.kind==='kun')this.kunNoise(this.state.glowstick,'glowstick',18);
  }else if(kind==='ward'){
   if(this.state.wardThrow?.age<this.state.wardThrow?.flight)return false;
   const target=this.wardTarget(yaw,pitch);
   const ground=pitch<-.1?1.65/-Math.tan(pitch):8;
   const {x:fromX,z:fromZ}=this.player,reach=Math.min(8,target?distance(this.player,target):ground);
   const dx=target?(target.x-fromX)/Math.max(.001,reach):-Math.sin(yaw),dz=target?(target.z-fromZ)/Math.max(.001,reach):-Math.cos(yaw);
   const blocks=this.floorBlocks();let x=fromX,z=fromZ;
   for(let step=1;step<=Math.ceil(reach/.1);step++){
    const d=Math.min(reach,step*.1),next={x:fromX+dx*d,z:fromZ+dz*d};
    if(!floorPassable(this.floor,next,.12,blocks))break;
    x=next.x;z=next.z;
   }
   this.state.wardThrow={fromX,fromZ,x,z,age:0,flight:.55,life:1.55,hit:false};
  }else return false;
  this.inventory[slot]=null;
  if(kind!=='ward'&&kind!=='glowstick'&&this.threat?.kind!=='kun')this.hearNoise(this.player);
  return true;
 }
 traversalEntry(id){
  const t=this.floor.traversals?.find(t=>t.id===id);if(!t||this.traversal||this.travel||this.hiding||this.state.traversals[id])return null;
  if(t.kind==='vent'&&this.state.chaseEscaped)return null;
  const reverse=distance(this.player,t.b)<distance(this.player,t.a),from=reverse?t.b:t.a,to=reverse?t.a:t.b;
  if(distance(this.player,from)>1.8||t.kind==='vent'&&reverse||!floorPassable(this.floor,this.player,.24,this.floorBlocks(),{traversals:this.state.traversals})||!clearSight(this.player,from,[...this.floor.boundaries,...this.floor.obstacles.filter(o=>o.traversalId!==id),...this.floorBlocks()]))return null;
  return{t,reverse,from,to};
 }
 canDropChaseBoard(i){
  if(!i||this.floor.mode!=='chase'||!this.state.chaseStarted||!this.threat||this.travel||this.traversal||this.chaseAction||this.state.chaseBoards[i.id])return false;
  const ahead=(this.player.x-i.x)*i.direction;
  return ahead>=.52&&ahead<=1.45&&Math.abs(this.player.z-i.z)<i.width/2-.23;
 }
 nearestTraversal(){return this.floor.interactions.filter(i=>i.type==='chase-board'?this.canDropChaseBoard(i):['vault','vent'].includes(i.type)&&this.traversalEntry(i.traversalId)).sort((a,b)=>distance(this.player,a)-distance(this.player,b))[0]||null;}
 startTraversal(id){
  if(this.chaseAction)return false;
  const entry=this.traversalEntry(id);if(!entry)return false;const {t,reverse,to}=entry;
  if(t.kind==='vent'){this.state.ventOpen=true;this.kunNoise(this.player,'vent',6);}
  if(t.kind==='vault')this.kunNoise(this.player,'vault',10);
  this.traversal={id,kind:t.kind,elapsed:0,duration:t.playerDuration,from:{...this.player},to:point(to,this.player.floor),via:reverse?[...(t.via||[])].reverse():t.via||[]};
  if(t.kind==='vent'){
   const toward=t.via?.[0]??t.b,o=t.obstacle;
   this.traversal.mouth={x:o.x+o.w/2,z:o.z+o.d/2,dx:toward.x-t.a.x,dz:toward.z-t.a.z,approach:point(t.a,this.player.floor)};
  }
  return true;
 }
 updateChaseAction(dt,input){
  const action=this.chaseAction;if(!action)return;
  if(input.interactHeld===false||input.forward||input.right){this.state.chaseAction=null;return;}
  action.elapsed+=dt;if(action.elapsed+1e-8<action.duration)return;
  this.state.chaseAction=null;
  if(action.kind==='push'){
   const door=this.state.doors.find(d=>d.id===action.id);
   if(door&&!door.locked&&distance(this.player,door)<=2.65){door.open=true;door.held=false;}
  }
 }
 updateChaseEvents(){
  const f=this.floor,s=this.state;if(f.mode!=='chase'||!s.chaseStarted)return;
  const stage=s.chaseEscaped?'complete':this.chaseStage==='escape'||within(this.player,f.chaseEscapeArea)?'escape':'corridor';
  if(stage!==this.chaseStage){s.chaseStage=stage;if(stage!=='complete')this.emit(this.objective,4);}
  if(this.traversal?.kind==='vent'||s.chaseEscaped)return;
  const guard=!s.chaseGuardSeen&&!this.auxiliary&&this.threat?.kind==='kun'&&f.chaseGuards?.find(g=>within(this.player,g.trigger));
  if(guard){
   s.chaseGuardSeen=true;
   this.auxiliary={kind:'naiwa',...point(guard.position,f.id),y:f.base,age:0,warning:.25,phase:'guarding',reach:guard.reach};
   this.emit('奶娃堵路了。绕到另一边！',2);
  }
  for(const hazard of chaseHazards(f)){
   if(Number.isFinite(chaseHazardAge(f,s,hazard,this.time))||!within(this.player,hazard.trigger))continue;
   if(hazard===f.chaseCollapse)s.chaseCollapseAt=this.time;
   else s.chaseHazardAt[hazard.id]=this.time;
  }
 }
 movePlayer(dt,input){
  this.sprinting=false;
  const pursuer=this.threat,yawNow=input.yaw||0;
  if(this.floor.id===3&&pursuer?.kind==='kun'&&pursuer.floor===3&&pursuer.age>=pursuer.warning&&!this.travel&&!this.traversal&&!this.hiding){
   let turn=this.chaseTurn;
   if(turn?.actor!==pursuer)turn=this.chaseTurn={actor:pursuer,yaw:yawNow,left:0,window:0,angle:0,direction:0};
   turn.left=Math.max(0,turn.left-dt);turn.window=Math.max(0,turn.window-dt);
   const delta=Math.atan2(Math.sin(yawNow-turn.yaw),Math.cos(yawNow-turn.yaw));turn.yaw=yawNow;
   if(Math.abs(delta)>.004){
    const direction=Math.sign(delta);
    if(!turn.window||direction!==turn.direction){turn.angle=0;turn.window=.36;turn.direction=direction;}
    turn.angle+=Math.abs(delta);
    // Only a fast look behind costs a brief step; ordinary corners and slow inspection stay responsive.
    if(turn.angle>2.3){turn.left=.38;turn.angle=0;turn.window=0;}
   }
  }else this.chaseTurn=null;
  // Use the interval's start so the final active tick still receives its full sprint allowance.
  const unlimited=!!this.floor.gunmuFinale||this.energyUntil>0&&this.energyUntil>this.time-dt+1e-8;
  if(unlimited){
   this.stamina=this.maxStamina;this.exhausted=false;this.staminaDelay=0;
   if(this.state.gunmuStage==='pipes'&&!this.travel)return moveGunmuPlatforms(this,dt,input);
  }
  const recover=()=>{this.staminaDelay=Math.max(0,this.staminaDelay-dt);if(!this.staminaDelay)this.stamina=Math.min(this.maxStamina,this.stamina+dt*30);if(this.stamina>=25)this.exhausted=false;};
  if(!this.traversal){
   if(this.hiding){recover();return 0;}let f=input.forward||0,r=input.right||0;const len=Math.hypot(f,r);if(!len){recover();return 0;}if(len>1){f/=len;r/=len;}
   const sprint=input.sprint&&!this.exhausted&&this.stamina>0,speed=(sprint?playerSprintSpeed:2.4)*(this.chaseTurn?.left>0?.72:1),yaw=input.yaw||0,dx=(-Math.sin(yaw)*f+Math.cos(yaw)*r)*speed*dt,dz=(-Math.cos(yaw)*f-Math.sin(yaw)*r)*speed*dt,old={...this.player},steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));
   const closed=this.floorBlocks(),hazards=closed.filter(b=>b.chaseCollapse);
   const valid=p=>{
    let doors=closed;
    for(const block of hazards){
     if(!blocked(this.player.x,this.player.z,[block],.24))continue;
     // A falling obstruction can be stepped out of on its nearer side.
     const {axis,direction}=hazardExit(block,this.player);
     if((p[axis]-this.player[axis])*direction>=0)doors=doors.filter(b=>b!==block);
    }
    const flat=()=>floorPassable(this.floor,p,.24,doors,{traversals:this.state.traversals});
    if(this.travel)return p.x>8.15&&localStair(p,this.travel.core).z>5?flat():stairPassable(p,this.travel)&&!blocked(p.x,p.z,doors,.24);
    const entry=this.stairEntry(p);return flat()&&(!entry||stairPassable(p,entry));
   };
   for(let i=0;i<steps;i++){if(valid({...this.player,x:this.player.x+dx/steps}))this.player.x+=dx/steps;if(valid({...this.player,z:this.player.z+dz/steps}))this.player.z+=dz/steps;}
   const moved=distance(old,this.player);this.sprinting=!!sprint&&moved>.001;
   if(this.sprinting&&!unlimited){this.stamina=Math.max(0,this.stamina-dt*100/7);this.staminaDelay=.8;if(this.stamina===0)this.exhausted=true;}else recover();
   this.updateStairs();this.player.y=stairHeight(this.player,this.player.floor,this.travel);if(this.state.chaseEscaped&&this.floor.ventSafe&&within(this.player,this.floor.ventSafe))this.player.y-=.8;return moved;
  }
  recover();
  const t=this.traversal,old={...this.player};t.elapsed=Math.min(t.duration,t.elapsed+dt);
  const route=[t.from,...t.via,t.to],lengths=route.slice(1).map((p,i)=>distance(p,route[i])),total=lengths.reduce((a,b)=>a+b,0);let d=total*t.elapsed/t.duration;
  for(let i=0;i<lengths.length;i++){if(d<=lengths[i]||i===lengths.length-1){const a=route[i],b=route[i+1],p=Math.min(1,d/Math.max(.001,lengths[i]));this.player.x=a.x+(b.x-a.x)*p;this.player.z=a.z+(b.z-a.z)*p;break;}d-=lengths[i];}
  if(t.mouth){
   const m=t.mouth;t.inside=(this.player.x-m.x)*m.dx+(this.player.z-m.z)*m.dz>0;
   if(t.inside){
    this.state.ventSealed=true;
    if(this.auxiliary?.phase==='guarding')this.auxiliary=null;
   }
  }
  this.player.y=this.floor.base+(t.kind==='vault'?Math.sin(Math.PI*t.elapsed/t.duration)*.42:-.8*Math.min(1,t.elapsed/.34));
  if(t.elapsed>=t.duration){this.traversal=null;this.player.y=this.floor.base-(t.kind==='vent'?.8:0);if(t.kind==='vent'&&within(this.player,this.floor.ventSafe)){this.state.chaseEscaped=true;this.resolveThreat();const door=this.state.doors.find(d=>d.id===`${this.floor.id}-${this.floor.departure}`);if(door){door.locked=false;door.open=true;}this.emit('它跟不过来。前往楼梯，不能再进入风管。',4);}}
  return distance(old,this.player);
 }
 spawnFor(kind){
  const f=this.floor,doors=this.floorBlocks();
  if(kind==='kun'&&f.mode==='chase'){
   return{floor:f.id,...f.chaseSpawn};
  }
  let candidates=this.nav.byFloor[f.id].filter((p,i)=>i%5===0&&distance(p,this.player)>7&&distance(p,this.player)<16&&floorPassable(f,p,kind==='yujie'?.7:.3,doors));
  const preferred=kind==='inspector'?7.7:11;
  const yaw=this.lastInput?.yaw;
  const order=p=>{
   const d=distance(p,this.player);
   if(kind!=='inspector'||!Number.isFinite(yaw))return Math.abs(d-preferred);
   const ahead=(-(p.x-this.player.x)*Math.sin(yaw)-(p.z-this.player.z)*Math.cos(yaw))/d;
   return Math.abs(d-preferred)+6*Math.max(0,.65-ahead);
  };
  candidates.sort((a,b)=>order(a)-order(b));
  if(kind==='yujie'){
   const first=candidates.find(p=>this.line(this.player,p));if(!first)return null;const copies=[point(first)];
   for(const p of candidates)if(copies.length<3&&copies.every(q=>distance(p,q)>5))copies.push(point(p));return{...copies[0],copies};
  }
  const activeDoors=this.doors;
  return candidates.find(p=>this.line(this.player,p)&&this.nav.path(p,this.player,activeDoors).length)||null;
 }
 beginEncounter(kind,position){
  const cover=isSweep(kind),warning=kind==='rush'?rushWarningSeconds(this.floor.id):7;
  if(this.threat||this.floor.listenerDepot&&kind!=='liang'&&!cover)return false;
  if(!this.debugMode&&kind==='inspector'&&this.time<this.nextInspectorAt)return false;
  if(!this.debugMode&&(this.floor.id===8||cover&&!sweepOdds[this.floor.id]||kind==='inspector'&&this.floor.mode==='chase'))return false;
  if(cover&&!this.hiding){
   if(this.wardrobeCooldown>0)return false;
   const reach=(warning-1.2)*2.4,doors=this.state.doors,blocks=this.floorBlocks();
   const nearby=this.floor.interactions.filter(i=>i.type==='wardrobe'&&distance(i.entry,this.player)<=reach+.75);
   nearby.sort((a,b)=>distance(a.entry,this.player)-distance(b.entry,this.player));
   const reachable=nearby.some(w=>{
    const end=point(w.entry,this.player.floor);
    if(kind==='rush'&&distance(this.player,end)<=reach&&clearActorTravel(this.floor,this.player,end,blocks,.24))return true;
    const path=this.nav.path(this.player,end,doors);
    if(!path.length||path.some(n=>n.floor!==end.floor))return false;
    let from=this.player,length=0;
    for(const to of [...path,end]){
     length+=distance(from,to);
     if(length>reach||!clearActorTravel(this.floor,from,to,blocks,.24))return false;
     from=to;
    }
    return true;
   });
   if(!reachable)return false;
  }
  const p=kind==='liang'?this.spawnListener(position):position||(cover?{floor:this.player.floor,...this.floor.spawn}:this.spawnFor(kind));if(!p)return false;
  const resident=kind==='kun'&&this.floor.mode==='chase'?this.state.chaseResident:null;
  const t=this.threat=kind==='liang'?p:Object.assign(resident??{},{kind,...p,age:0,unseen:0,hidden:0,phase:'warning',checks:0,moving:0,secondChance:false,lastSeen:{...this.player},searchPoints:[],searched:0,path:[],pathAge:1,searchAge:0,distance:Infinity,observed:false,retreat:0,warning:kind==='yujie'?3:kind==='inspector'?1.6:2.8});
  if(cover){t.warning=warning;t.route=(this.floor.sweepRoute??this.floor.mainRoute).map(([x,z])=>({floor:this.player.floor,x,z}));t.wave=0;}
  if(kind==='kun'){
   this.state.chaseStarted=true;t.warning=resident ? .9 : 2.25;this.immunity=Math.min(this.immunity,t.warning);t.heading=p.yaw??-Math.PI/2;t.lastSeen=null;t.lastNoise=null;t.evidence=null;t.sightLocked=false;t.speed=0;
   t.stunnedUntil=0;t.fastPursuit=false;
   t.goal=point(this.floor.chaseSearchPoints[0],t.floor);t.patrolIndex=0;t.nextStep=0;
   const entrance=this.state.doors.find(d=>d.id===`${this.floor.id}-${this.floor.arrival}`);if(entrance){entrance.open=false;entrance.locked=true;}
  }
  if(!this.floor.listenerDepot){this.keypadOpen=false;this.searching=null;}
  if(kind==='inspector')this.nextInspectorAt=this.time+80;
  if(!cover)this.state.pressureAge=0;
  if(!this.floor.listenerDepot)this.state.stonePlayback=null;
  return true;
 }
 stopGuideStone(){
  this.state.stonePlayback=null;
  const t=this.threat?.kind==='liang'?this.threat:this.auxiliary;
  if(t?.noiseMechanism==='stone')t.alarmFocusUntil=0;
 }
 updateGuideStone(){
  const s=this.state,play=s.stonePlayback;if(!play)return;
  const t=this.threat?.kind==='liang'?this.threat:this.auxiliary?.kind==='liang'?this.auxiliary:null;
  const reached=t&&distance(t,play.site.approach)<.58;
  if(this.time>=play.endsAt||reached){
   this.stopGuideStone();
   if(reached)this.emit('良子切断了讲解。',2);
  }else if(t&&(t.noiseMechanism!=='stone'||t.phase!=='investigating')&&this.time>=(play.nextPulse??0)){
   this.hearNoise(play.site,Infinity,{approach:play.site.approach,ringEnd:play.endsAt,mechanism:'stone'});
   play.nextPulse=this.time+.7;
  }
 }
 beginPatrol(){return this.beginEncounter('patrol');}
 sweepThreshold(before){
  const s=this.state,opened=s.sweepOpenedDoor;s.sweepOpenedDoor=null;
  if(this.hiding||this.traversal||!opened&&!before)return null;
  const door=s.doors.find(d=>d.sweepThreshold&&!s.sweepDoors?.has(d.id)&&
   (d.id===opened&&d.open||before&&d.amount>.05&&crossesDoor(before,this.player,d,0)));
  if(!door)return null;
  (s.sweepDoors??=new Set()).add(door.id);
  return door.id===opened?'opened':'crossed';
 }
 director(dt,before){
  if(this.travel||this.mode!=='playing')return;
  this.immunity=Math.max(0,this.immunity-dt);
  if(!this.hiding)this.cooldown=Math.max(0,this.cooldown-dt);
  const s=this.state,f=this.floor;
  if(s.omen?.kind==='handle'&&s.omen.seenAt!==null&&this.time-s.omen.seenAt>=1.3)s.omen=null;
  if(f.id===8)return;
  const busy=this.threat||this.auxiliary||this.falseDoorAttack;
  const searching=f.keypad&&!f.listenerDepot&&!s.approved;
  const odds=sweepOdds[f.id],attempt=s.sweepAttempt??0,sweep=searching&&odds?(s.sweep??=scheduleSweep(this.seed,f.id,attempt)):null;
  if(sweep){
   sweep.wait=Math.max(busy?3.6:0,sweep.wait-dt);
   const doorway=this.sweepThreshold(before);
   const ready=!busy&&!this.traversal&&(!s.events||this.cooldown<=0||this.hiding);
   const timed=ready&&sweep.wait<=1e-8&&(this.hiding||this.cooldown<=0);
   // A door and the timer share one roll until an encounter actually starts.
   const kind=sweep.roll<sweep.chance?sweep.kind:null;
   if(kind&&ready&&(doorway||timed)&&this.beginEncounter(kind)){
    this.immunity=Math.min(this.immunity,this.threat.warning);
    s.sweep=scheduleSweep(this.seed,f.id,attempt,sweep);
    s.events++;s.lastEncounterKind=kind;s.omen=null;
    return;
   }
   if(doorway==='opened'){
    sweep.chance=Math.min(1,sweep.chance*1.3);
    if(!kind&&sweep.roll<sweep.chance)sweep.wait=Math.max(sweep.wait,3.6);
   }
   if(timed&&kind)sweep.wait=.5;
  }
  if(f.gunmuFinale){
   if(!this.threat&&s.gunmuStage==='lure'&&within(this.player,f.gunmuFinale.trigger))this.beginGunmu();
   return;
  }
  if(f.mode==='chase'){
   const entry=s.doors.find(d=>d.id===f.chaseEntryDoorId);
   if(this.standbyKun&&entry.open&&entry.amount>=.85)this.beginEncounter('kun');
   return;
  }
  if(f.listenerDepot){
   if(!this.threat&&this.player.x>=10.5&&this.beginEncounter('liang')){s.events++;s.lastEncounterKind='liang';}
   return;
  }
  if(!searching)return;
  const kind=this.deck[f.id].monster;
  if(this.threat||this.hiding||s.sceneIndex<0||isSweep(kind))return;
  const sceneEncounters=s.events-(sweep?.visit??0),first=sceneEncounters===0,variation=(this.seed+f.id*7+sceneEncounters*13)>>>0;
  s.pressureAge+=dt;
  if(first&&!s.omen&&s.pressureAge>=3+variation%3)s.omen={kind:'approach',started:this.time,seenAt:null};
  if(this.cooldown>0)return;
  if(first?s.pressureAge<8+variation%5:!s.pendingEncounter&&s.pressureAge<8+variation%3)return;
  s.encounterWait=Math.max(0,s.encounterWait-dt);if(s.encounterWait>0)return;
  if(!this.beginEncounter(kind)){s.encounterWait=.5;return;}
  s.events++;s.lastEncounterKind=kind;s.omen=null;
  if(!first||s.pendingEncounter!=='return')s.pendingEncounter=null;
 }
 resolveThreat(){
  const t=this.threat;if(!t)return;
  if(t.kind==='doubao'&&this.floor.gunmuFinale)return;
  if(t.kind==='kun'&&this.floor.mode==='chase'&&!this.state.chaseEscaped)return;
  this.threat=null;this.state.blackout=false;
  if(t.kind!=='patrol'&&t.kind!=='rush')this.state.pressureAge=0;
  this.resolved++;this.cooldown=this.floor.keypad?(t.kind==='rush'?3.6:6):9+(this.seed+this.resolved)%3;
  this.emit('走。',2);
 }
 updateThreat(dt,input,moved,inputMovement=moved){
  this.sanityExposed=false;
  if(naiwaOutOfRange(this.threat,this.player))this.resolveThreat();
  if(naiwaOutOfRange(this.auxiliary,this.player))this.auxiliary=null;
  if(this.auxiliary?.kind==='naiwa'&&this.auxiliary.phase!=='guarding')this.updateAuxiliary(dt,input);
  const t=this.threat;if(!t||this.mode!=='playing')return;
  if(t.kind!=='naiwa'&&this.state.approved&&this.travel?.from===this.player.floor&&this.travel.core===this.floor.departure){
   this.threat=null;this.state.blackout=false;return;
  }
  if(t.kind==='naiwa'||t.kind==='inspector'){
   super.updateThreat(dt,input,moved);
   if(t.kind==='inspector'&&this.threat===t&&this.mode==='playing')approachInspector(this,t,dt,moved);
   return;
  }
  t.age+=dt;t.visible=this.line(t,this.player);t.observed=this.viewed(t,input);t.distance=distance(t,this.player);
  if(t.kind==='doubao'){this.updateGunmu(t,dt);return;}
  if(t.kind==='patrol'||t.kind==='rush'){
   const sweep=sweepTiming(t);
   if(!this.floor.listenerDepot&&sweep.phase!==t.phase&&(sweep.phase==='return-warning'||sweep.phase==='sweeping'))this.state.stonePlayback=null;
   t.sealed=!!this.hiding;t.phase=sweep.phase;t.wave=sweep.wave;
   if(sweep.phase==='warning')return;
   this.state.blackout=sweep.phase==='sweeping'||sweep.phase==='leaving';
   if(sweep.phase==='sweeping'){
    const route=t.route,last=route.length-1,progress=Math.min(.999,sweep.elapsed/sweep.duration)*last;
    const i=Math.floor(progress),a=route[sweep.wave===2?last-i:i],b=route[sweep.wave===2?last-i-1:i+1];
    if(a&&b){const u=progress%1;t.x=a.x+(b.x-a.x)*u;t.z=a.z+(b.z-a.z)*u;}
    if(!t.sealed)this.fail(t.kind);
   }else if(sweep.phase==='leaving'){
    t.retreat=sweep.elapsed;
    if(sweep.elapsed>=sweep.duration)this.resolveThreat();
   }
   return;
  }
  if(t.kind==='yujie'){
   if(t.age<t.warning)return;
   if(t.age>=t.warning+22){t.phase='leaving';t.retreat=t.age-t.warning-22;if(t.age>=t.warning+23.3)this.resolveThreat();return;}
   t.phase='watching';t.observed=(input.pitch??0)>-.75&&(t.copies||[t]).some(p=>this.viewed(p,input,32));this.sanityExposed=t.observed;
   if(t.observed){this.sanity=Math.max(0,this.sanity-dt*33);if(this.sanity===0)this.fail('yujie');}return;
  }
  if(t.kind==='liang'){this.updateListener(t,dt,inputMovement);return;}
  if(t.kind==='kun'){
   this.updateKun(t,dt,moved);
   const guard=this.auxiliary;
   if(guard?.phase==='guarding'){
    guard.age+=dt;
    if(distance(t,guard)<.88&&this.line(t,guard)&&clearSight(t,guard,this.chaseBoardBlocks))this.auxiliary=null;
    else if(this.mode==='playing'&&guard.age>=guard.warning&&within(this.player,guard.reach)&&this.line(guard,this.player))this.fail('naiwa');
   }
  }
 }
 kunSeesPlayer(t){
  if(this.traversal?.inside||t.floor!==this.player.floor)return false;
  const dx=this.player.x-t.x,dz=this.player.z-t.z,d=Math.hypot(dx,dz);
  return d<=20&&(d<1.3||(-Math.sin(t.heading)*dx-Math.cos(t.heading)*dz)/d>.43)&&this.line(t,this.player)&&clearSight(t,this.player,this.chaseBoardBlocks);
 }
 kunNoise(source,evidence,range){
  const t=this.threat;if(t?.kind!=='kun'||t.stunnedUntil>this.time||distance(t,source)>range||this.kunSeesPlayer(t))return;
  const p=point(source,t.floor),route=this.nav.path(t,p,[],true,{agent:'kun',speed:kunChaseSpeed,traversals:this.state.traversals});
  if(!route.length||route.some(n=>n.floor!==t.floor))return;
  let length=route.distance;
  for(const door of this.state.doors){
   if(door.amount>.75)continue;
   if(route.some((n,i)=>i>0&&!clearSight(route[i-1],n,[door.block])))length+=6;
  }
  if(length>range)return;
  t.lastNoise=p;t.heardAt=t.age;t.evidence=evidence;t.goal=p;t.pathAge=1;t.sightLocked=false;
  if(t.age>=t.warning)t.phase='investigating';
 }
 updateChaseBoards(t){
  if(!this.state.chaseBoards)return;
  for(const i of this.floor.interactions){
   const board=this.state.chaseBoards[i.id];
   if(!board||board.landed)continue;
   const progress=Math.min(1,(this.time-board.startedAt)/CHASE_BOARD_DROP);
   const turn=(1-progress*progress*(3-2*progress))*Math.PI/2;
   const startZ=i.z-i.direction*i.width/2;
   const dx=-i.direction*i.width*Math.sin(turn),dz=i.direction*i.width*Math.cos(turn);
   const along=Math.max(0,Math.min(1,((t.x-i.x)*dx+(t.z-startZ)*dz)/i.width**2));
   // Test the actual sweep of the panel from the mounting post toward the opposite wall.
   if(!board.hit&&progress>0&&Math.hypot(t.x-i.x-dx*along,t.z-startZ-dz*along)<.46){
    board.hit=true;board.blockUntil=t.stunnedUntil=this.time+CHASE_BOARD_STUN;
    t.phase='stunned';t.stunnedAt=this.time;t.speed=0;t.sightLocked=false;t.path=[];t.pathAge=1;
    t.goal=point(this.player);t.lastSeen=t.goal;
   }
   board.landed=progress===1;
  }
 }
 updateKun(t,dt,moved){
  const f=this.floor,s=this.state,metal=f.chaseMetal&&within(this.player,f.chaseMetal);
  this.updateChaseBoards(t);
  if(t.stunnedUntil>this.time)return;
  if(t.phase==='stunned'){t.phase='investigating';t.pathAge=1;}
  if(s.bellPending!=null&&this.time>=s.bellPending){
   s.bellPending=null;s.bellAt=this.time;this.kunNoise(f.chaseLure,'bell',24);
  }
  if(!this.traversal&&moved>.001){
   if(metal&&(!t.onMetal||t.age>=t.nextStep)){s.metalAt=this.time;this.kunNoise(this.player,'metal',21);t.nextStep=t.age+(this.sprinting?.38:.64);}
   else if(!metal&&this.sprinting&&(!t.running||t.age>=t.nextStep)){this.kunNoise(this.player,'sprint',12);t.nextStep=t.age+.42;}
   const curtain=f.chaseCloth?.findIndex(r=>within(this.player,r))??-1;
   if(curtain!==-1&&curtain!==t.curtain){s.clothAt=this.time;s.clothIndex=curtain;}
   t.curtain=curtain;
  }
  t.running=this.sprinting;t.onMetal=!!metal;
  const inView=this.kunSeesPlayer(t);
  t.sightTime=inView?(t.sightTime||0)+dt:0;
  const seen=inView&&(t.sightTime>=.28||t.age-(t.seenAt??-Infinity)<.18||distance(t,this.player)<2);
  if(seen){
   const vault=this.traversal?.kind==='vault'?this.traversal:null;
   const observed=this.traversal?.mouth?.approach??vault?.to??point(this.player);
   if(!t.sightAnchor||t.age-(t.seenAt??-Infinity)>.18){t.sightAnchor=observed;t.seenBearing=null;}
   if(distance(t.sightAnchor,observed)>.12){
    t.seenBearing=Math.atan2(t.sightAnchor.x-observed.x,t.sightAnchor.z-observed.z);
    t.sightAnchor=observed;
   }
   if(vault&&distance(t.lastSeen??observed,observed)>.1)t.pathAge=1;
   t.lastSeen=observed;t.seenAt=t.age;t.goal=observed;t.evidence='sight';
  }
  if(t.age<t.warning)return;
  const beforeX=t.x,beforeZ=t.z,spots=f.chaseSearchPoints;
  t.sightLocked=seen;
  const fast=!this.traversal?.inside&&distance(t,this.player)>8;
  if(fast!==t.fastPursuit){t.fastPursuit=fast;t.pathAge=1;}
  if(fast){
   const passage=this.traversal?.kind==='vault'?this.traversal.to:this.traversal?.mouth?.approach;
   t.goal=point(passage??this.player);t.phase=seen?'pursuing':'investigating';
  }else if(seen){
   t.phase='pursuing';
  }else if(t.phase==='pursuing'){
   t.phase='investigating';t.goal=t.lastSeen;t.pathAge=1;
  }else if(t.phase==='warning')t.phase=t.lastNoise||t.lastSeen?'investigating':'patrolling';
  if(t.phase==='searching'){
   if(t.age<t.searchUntil){
    // He looks across the junction before choosing one of its real exits.
    const look=t.searchHeading+Math.sin((t.searchUntil-t.age)*4)*.8-t.heading;
    const turn=Math.atan2(Math.sin(look),Math.cos(look));
    t.heading+=Math.sign(turn)*Math.min(Math.abs(turn),dt*4.6);
    return;
   }
   const doors=[...s.doors,...this.chaseBoardBlocks.map(block=>({floor:t.floor,block}))];
   const exits=[],ahead=[];
   const nearby=spots.map((p,i)=>({p,i,d:distance(t,p)})).sort((a,b)=>a.d-b.d);
   for(const {p,i} of nearby){
    const route=this.nav.path(t,point(p,t.floor),doors,false,{agent:'kun',speed:kunChaseSpeed,traversals:s.traversals});
    const step=route.find(node=>distance(t,node)>1.1);
    if(!step||route.distance<=1.6||route.some(node=>node.floor!==t.floor))continue;
    const exit={i,d:route.distance};exits.push(exit);
    const forward=-Math.sin(t.searchHeading)*(step.x-t.x)-Math.cos(t.searchHeading)*(step.z-t.z);
    if(forward>.25)ahead.push(exit);
    if(ahead.length>=2||exits.length>=5)break;
   }
   const nearest=(ahead.length?ahead:exits).sort((a,b)=>a.d-b.d).slice(0,2);
   t.patrolIndex=nearest[(this.seed+(t.searches||0))%nearest.length]?.i??0;
   t.searches=(t.searches||0)+1;t.goal=point(spots[t.patrolIndex],t.floor);t.phase='patrolling';t.evidence=null;
  }
  const fold=f.chaseCloth.findIndex(r=>within(t,r));
  if(fold>=0&&fold!==t.brushing){s.clothAt=this.time;s.clothIndex=fold;}
  t.brushing=fold;
  const gap=distance(t,t.goal);
  let pace=2.7;
  if(t.phase==='pursuing'){
   const closeEase=Math.max(0,Math.min(.45,(2.6-gap)*.3));
   pace=kunChaseSpeed-closeEase;
  }else if(t.phase==='investigating'){
   // Recent sight keeps the chase hot around the corner. Older leads only get a normal investigation.
   pace=t.age-(t.seenAt??-Infinity)<2?4:3.35;
  }
  if(fold>=0)pace=1.05;
  t.speed=fast?kunFastSpeed:Math.min(kunChaseSpeed,t.speed+Math.min(Math.abs(pace-t.speed),dt*4)*Math.sign(pace-t.speed));
  this.travelCampaignActor(t,dt,fold>=0?Math.min(t.speed,pace):t.speed,t.goal,'kun');
  if(distance(t,{x:beforeX,z:beforeZ})>.001){
   const angle=Math.atan2(beforeX-t.x,beforeZ-t.z)-t.heading,turn=Math.atan2(Math.sin(angle),Math.cos(angle));
   t.heading+=Math.sign(turn)*Math.min(Math.abs(turn),dt*4.6);
  }
  if(distance(t,this.player)<.72&&!this.traversal?.inside&&this.line(t,this.player)&&clearSight(t,this.player,this.chaseBoardBlocks)){this.fail('kun');return;}
  if(t.vault||t.phase==='pursuing')return;
  if(!t.progressPoint||distance(t,t.progressPoint)>.22){t.progressPoint=point(t);t.stalled=0;}
  else t.stalled=(t.stalled||0)+dt;
  if(distance(t,t.goal)>.45&&t.stalled<3)return;
  t.stalled=0;t.pathAge=1;
  if(t.phase==='investigating'){
   t.phase='searching';t.searchHeading=t.evidence==='sight'?t.seenBearing??t.heading:t.heading;t.searchUntil=t.age+1.5;
  }else{
   t.patrolIndex=(t.patrolIndex+1)%spots.length;t.goal=point(spots[t.patrolIndex],t.floor);
  }
 }
 travelCampaignActor(t,dt,speed,target,agent='kun'){
  if(t.vault){
   const v=t.vault;v.elapsed+=dt;const a=Math.min(1,v.elapsed/v.duration);t.x=v.from.x+(v.to.x-v.from.x)*a;t.z=v.from.z+(v.to.z-v.from.z)*a;t.y=this.floor.base+Math.sin(Math.PI*a)*(v.lift??.4);
   if(a>=1){this.state.traversals[v.id]=true;t.vault=null;t.path=[];t.pathAge=1;t.y=this.floor.base;}return;
  }
  const listener=agent==='liang',kun=agent==='kun',opensDoors=listener||kun&&!!this.floor.chaseDoorId;
  const options={agent,traversals:this.state.traversals,speed:kun?t.fastPursuit?kunFastSpeed:kunChaseSpeed:undefined};
  const blocks=this.floorBlocks();
  const enclosingDoor=kun&&this.state.doors.find(d=>blocked(t.x,t.z,[d.block],.26));
  if(enclosingDoor){
   // A leaf closed over the hunter must leave him on the same side with a usable route again.
   const withoutLeaf=blocks.filter(b=>b!==enclosingDoor.block),axis=enclosingDoor.axis;
   const sameSide=node=>(t[axis]<enclosingDoor[axis])===(node[axis]<enclosingDoor[axis]);
   const exit=this.nav.closest(t,blocks,(node,d2)=>d2<1.21&&sameSide(node)&&clearActorTravel(this.floor,t,node,withoutLeaf,.26,options));
   if(exit){const portion=Math.min(1,speed*dt/distance(t,exit));t.x+=(exit.x-t.x)*portion;t.z+=(exit.z-t.z)*portion;}
   t.pathAge=1;return;
  }
  const rack=kun&&blocks.find(b=>b.chaseCollapse&&blocked(t.x,t.z,[b],.26));
  if(rack){
   const {axis,direction}=hazardExit(rack,t),step={x:t.x,z:t.z};
   step[axis]+=direction*speed*dt;
   if(clearActorTravel(this.floor,t,step,blocks.filter(b=>b!==rack),.26,options)){t.x=step.x;t.z=step.z;}
   t.pathAge=1;return;
  }
  if(kun&&(t.sightLocked||t.fastPursuit)&&target.floor===t.floor){
   // Follow a visible runner between navigation nodes. Keep the graph for doors, corners and vaults.
   const gap=distance(t,target),run=gap-.42;
   if(run>0){
    const dx=(target.x-t.x)/gap,dz=(target.z-t.z)/gap;
    const approach={x:t.x+dx*run,z:t.z+dz*run};
    if(clearActorTravel(this.floor,t,approach,blocks,.26,options)){
     const step=Math.min(run,speed*dt);
     t.x+=dx*step;t.z+=dz*step;t.y=this.floor.base;
     t.path=[];t.pathAge=1;t.waitingDoor=null;return;
    }
   }
  }
  if(kun){
   const doors=this.state.doors.reduce((mask,d)=>(mask<<2)|(d.locked?2:Number(d.open)),0);
   const hazards=blocks.filter(b=>b.chaseCollapse).map(b=>b.hazardId).join('|');
   if(doors!==t.plannedDoorState||hazards!==t.plannedHazards){t.plannedDoorState=doors;t.plannedHazards=hazards;t.pathAge=1;}
  }
  if(!listener&&(!t.pathGoal||!t.path.length||distance(t.pathGoal,target)>.7))t.pathAge=(t.pathAge||0)+dt;
  if(t.pathAge>.4){
   const boards=kun?this.chaseBoardBlocks.map(block=>({floor:t.floor,block})):[];
   let doors=opensDoors?this.listenerDoors():this.doors;
   if(kun)doors.push(...boards);
   const planned=kun&&opensDoors?{...options,startBlocks:blocks,doorOpeningCosts:this.state.doors.filter(d=>!d.locked&&d.amount<.9).map(d=>{
    const wait=d.open?0:t.waitingDoor===d.id?Math.max(0,t.openAfter-t.age):kunDoorWait;
    return {...d,wait:wait+Math.log((1-d.amount)/.1)/8};
   })}:options;
   t.path=this.nav.path(t,target,doors,false,planned);t.pathAge=0;
   if(kun)t.usingLiveDoors=!t.path.length;
   if(kun&&t.usingLiveDoors){
    // Opening a leaf on the nav graph can overlap Kun's current position. Route around the real closed door.
    doors=[...this.state.doors,...boards];
    t.path=this.nav.path(t,target,doors,false,options);t.usingLiveDoors=true;
   }
   const last=t.path.at(-1);
    if((!listener||this.floor.listenerDepot)&&last&&last.floor===target.floor&&distance(last,target)<=.57&&
    clearActorTravel(this.floor,last,target,doors.filter(d=>d.floor===t.floor).map(d=>d.block),.26,options))t.path.push(point(target,t.floor));
   t.pathGoal=point(target);
   while(t.path.length&&distance(t,t.path[0])<.05)t.path.shift();
  }
  if(opensDoors&&!(kun&&t.usingLiveDoors)){
   const door=this.state.doors.find(d=>!d.locked&&d.amount<.9&&distance(t,d)<3.25&&
    t.path.slice(0,9).some((node,index)=>{
     if(!kun)return blocked(node.x,node.z,[doorBlock({...d,amount:0})],.35);
     const from=index?t.path[index-1]:t;
     // A moving leaf may block the approach without the path crossing the closed doorway plane.
     return crossesDoor(from,node,d)||blocked(node.x,node.z,[d.block],.27)||!clearSight(from,node,[d.block]);
    }));
   if(door){
    if(!door.open){
     if(t.waitingDoor!==door.id){t.waitingDoor=door.id;t.openAfter=t.age+(listener?.7:kunDoorWait);}
     if(t.age>=t.openAfter){
      if((door.routeDoor||door.chasePush)&&door.amount===0){
       const hitsBody=swing=>{
        for(let i=1;i<=12;i++){const leaf=doorBlock({...door,swing,amount:i/12});if([t,this.player].some(p=>blocked(p.x,p.z,[leaf],.29)))return true;}
        return false;
       };
       if(hitsBody(door.swing)&&!hitsBody(-door.swing)){door.swing*=-1;t.pathAge=1;}
      }
      door.open=true;t.waitingDoor=null;
     }
    }
    if(!door.open||!door.held)return;
   }
   t.waitingDoor=null;
  }
  let budget=speed*dt;
  while(t.path?.length&&budget>0){
   const n=t.path[0];if(n.floor!==t.floor)return;
   if(n.traversalId&&!n.collapsed){const link=this.floor.traversals.find(v=>v.id===n.traversalId);if(!link||link.kind==='vent')return;
    const from=n.from||link.a;
    if(distance(t,from)>.025){
     const d=distance(t,from),amount=Math.min(d,budget),p={x:t.x+(from.x-t.x)*amount/d,z:t.z+(from.z-t.z)*amount/d};
     if(!clearActorTravel(this.floor,t,p,blocks,.26,options)){t.pathAge=1;return;}
     t.x=p.x;t.z=p.z;budget-=amount;continue;
    }
    t.vault={id:link.id,elapsed:0,duration:n.duration??link.enemyDuration,from:point(t),to:point(n),lift:kun?link.obstacle.height+.1:undefined};return;
   }
   const d=distance(t,n);if(d<.02){t.path.shift();continue;}const amount=Math.min(d,budget),p={x:t.x+(n.x-t.x)*amount/d,z:t.z+(n.z-t.z)*amount/d};
    if(!(listener&&!this.floor.listenerDepot?floorPassable(this.floor,p,.26,blocks,options):clearActorTravel(this.floor,t,p,blocks,.26,options))){t.pathAge=1;return;}
   t.x=p.x;t.z=p.z;budget-=amount;if(amount>=d)t.path.shift();
  }
  t.y=this.floor.base;
 }
 listenerDoors(){
  // Plan through operable doors in their open pose. The actual leaf still blocks each movement step.
  return this.doors.map(d=>d.floor===this.floor.id&&!d.locked&&d.amount!==1&&!(d.open&&d.held)?{...d,amount:1,block:doorBlock({...d,amount:1})}:d);
 }
 spawnListener(position){
  const f=this.floor,points=f.mainRoute.slice(1,-1);
  const route=(f.listenerRoute??points.map(([x,z])=>({x,z}))).map(p=>point(p,f.id)).filter(p=>floorPassable(f,p,.27));
  if(route.length<2)return null;
  const blocks=this.floorBlocks();
  let start=position&&point(position,f.id);
  if(start&&!floorPassable(f,start,.27,blocks))start=this.nav.closest(start,blocks);
  if(!start){
   const doors=this.listenerDoors(),view=this.lastInput??{yaw:f.spawnYaw??0};
   const preferred=f.listenerDepot?17:10;
   const candidates=route.filter(p=>distance(p,this.player)>=(f.listenerDepot?10:6)&&floorPassable(f,p,.27,blocks)).map(p=>({p,visible:this.viewed(p,view),distance:distance(p,this.player)}));
   candidates.sort((a,b)=>Number(a.visible)-Number(b.visible)||Math.abs(a.distance-preferred)-Math.abs(b.distance-preferred));
   start=candidates.find(({p,visible,distance})=>{
    if(visible&&distance<8)return false;
    const path=this.nav.path(this.player,p,doors);
    return path.length&&path.distance<=(f.listenerDepot?37:24)&&path.every(n=>n.floor===f.id);
   })?.p;
   if(!start)return null;
  }
  const routeIndex=route.indexOf(route.reduce((a,b)=>distance(b,start)<distance(a,start)?b:a));
  return{kind:'liang',...point(start,f.id),y:f.base,age:0,warning:.85,phase:'patrolling',route,routeIndex,
   direction:(this.seed^f.id)&1?1:-1,lastNoise:null,noiseMechanism:null,sprintPursuitUntil:0,heardAt:-Infinity,lastStepAt:-Infinity,walkHearingAt:0,path:[],pathAge:1};
 }
 hearNoise(source,range=32,alarm=null){
  const t=this.threat?.kind==='liang'?this.threat:this.auxiliary;
  if(t?.kind!=='liang'||this.travel||t.floor!==this.player.floor)return;
  if(this.floor.listenerDepot){
   const gap=distance(t,source);
   if(gap>range||!alarm&&t.alarmFocusUntil>this.time&&gap>depotAlarmMaskDistance)return;
   if(alarm){t.alarmFocusUntil=alarm.ringEnd;t.sprintPursuitUntil=0;}
   else t.walkHearingAt=this.time+depotWalkCooldown;
  }
  t.phase='investigating';t.lastNoise=point(source,t.floor);t.noiseGoal=point(alarm?.approach??source,t.floor);t.noiseFromAlarm=!!alarm;
  t.noiseMechanism=alarm?.mechanism??null;
  t.heardAt=t.age;t.probe=null;t.pathAge=1;
  return true;
 }
 searchBesideNoise(t){
  // Choose from walkable cover around the sound. The search never samples the silent player's location.
  const bias=(this.seed+3*Math.round(t.lastNoise.x*2)+Math.round(t.lastNoise.z*2))>>>0;
  const offsets=[[2.25,0],[0,2.25],[-2.25,0],[0,-2.25]],blocks=this.floorBlocks();
  for(let i=0;i<4;i++){
   const [dx,dz]=offsets[(bias+i)%4],p={x:t.x+dx,z:t.z+dz,floor:t.floor};
   if(floorPassable(this.floor,p,.27,blocks)&&this.line(t,p)&&this.nav.path(t,p,this.state.doors).distance<=3)return p;
  }
  return null;
 }
 trackListenerSprint(t){
  const wasRunning=t.running;
  if(this.sprinting&&(!wasRunning||t.age-t.lastStepAt>=.42)){
   if(this.hearNoise(this.player))t.sprintPursuitUntil=this.time+listenerSprintHold;
   t.lastStepAt=t.age;
  }
  t.running=this.sprinting;
  if(this.travel||t.noiseFromAlarm||this.time+1e-8>=t.sprintPursuitUntil)return false;
  if(wasRunning||this.sprinting)t.sprintPursuitUntil=this.time+listenerSprintHold;
  const gap=distance(t,this.player);
  const masked=this.floor.listenerDepot&&(gap>32||this.time<t.alarmFocusUntil&&gap>depotAlarmMaskDistance);
  if(!masked&&!this.hiding&&this.line(t,this.player)){
   t.noiseGoal=t.lastNoise=point(this.player);
   if(!t.pathGoal||distance(t.pathGoal,t.noiseGoal)>.55)t.pathAge=1;
  }
  return true;
 }
 updateDepotWalking(t,moved){
  if(!(moved>=.001)||this.sprinting||this.hiding||this.travel||this.time+1e-8<t.walkHearingAt||distance(t,this.player)>depotWalkRange)return;
  if(!this.line(t,this.player)){
   if(this.time<(t.walkProbeAt??0))return;
   t.walkProbeAt=this.time+.16;
   const path=this.nav.path(t,this.player,this.state.doors);
   if(!path.length||path.distance>depotWalkRange)return;
  }
  this.hearNoise(this.player,depotWalkRange);
 }
 updateListener(t,dt,moved=0,auxiliary=false){
  const depot=this.floor.listenerDepot,holdingSprint=this.trackListenerSprint(t);
  if(depot)this.updateDepotWalking(t,moved);
  if(!depot&&t.age>(auxiliary?12:26)&&t.phase==='patrolling'){
   if(auxiliary)this.auxiliary=null;else this.resolveThreat();return;
  }
  if(t.phase==='listening'){
   if(t.age>=t.listenUntil){t.phase='patrolling';t.pathAge=1;}
   else if(t.probe&&t.age>=t.listenUntil-2.35&&distance(t,t.probe)>.38)this.travelCampaignActor(t,dt,1.45,t.probe,'liang');
  }else{
   const investigating=t.phase==='investigating',target=investigating?(t.noiseGoal??t.lastNoise):t.route[t.routeIndex];
   const speed=investigating?5.6:listenerPatrolPace*(depot?1.4:1);
   this.travelCampaignActor(t,dt,speed,target,'liang');
   if(!t.progressPoint||distance(t,t.progressPoint)>.35){t.progressPoint=point(t);t.stalled=0;}
   else t.stalled=(t.stalled||0)+dt;
   if(!holdingSprint&&(distance(t,target)<.42||(!t.path.length&&!t.pathAge)||t.stalled>3)){
    t.stalled=0;
    if(investigating){t.phase='listening';t.listenUntil=t.age+2.95;t.probe=this.searchBesideNoise(t);t.pathAge=1;}
    else{
     if(!depot&&(t.routeIndex+t.direction<0||t.routeIndex+t.direction>=t.route.length))t.direction*=-1;
     t.routeIndex=(t.routeIndex+t.direction+t.route.length)%t.route.length;t.pathAge=1;
    }
   }
  }
  if(t.age<t.warning||this.travel||this.hiding)return;
  if(distance(t,this.player)<.72&&this.line(t,this.player))this.fail('liang');
 }
 beginGunmu(position=this.floor.gunmuFinale?.spawn){
  if(!position||!this.floor.gunmuFinale||this.threat)return false;
  const entrance=this.state.doors.find(d=>d.id===`1-${this.floor.arrival}`);
  if(entrance){entrance.open=false;entrance.locked=true;}
  this.immunity=0;
  this.threat={kind:'doubao',floor:1,...position,y:0,age:0,warning:.9,phase:'pursuing',
   path:[],pathAge:1,lastSeen:point(this.player)};
  if(this.state.gunmuStage==='lure')this.emit(RULES.doubao.action,5);
  return true;
 }
 canTrapGunmu(){
  const trap=this.floor.gunmuFinale?.trap;
  return !!trap&&this.state.gunmuStage==='lure'&&this.threat?.kind==='doubao'&&
   this.player.x<this.state.doors.find(d=>d.id===trap.gateId).x-.34&&within(this.threat,trap.bounds,-.34);
 }
 pullGunmuLever(lever){
  const s=this.state,f=this.floor.gunmuFinale;
  if(!f||s.gunmuStage!=='lure'||!this.siteReachable(lever))return false;
  const gate=s.doors.find(d=>d.id===f.trap.gateId);
  if(this.player.x>=gate.x-.34){this.emit('到维修间外侧拉闸。',2.5);return false;}
  if(!this.canTrapGunmu()){this.emit('等她完全进维修间，再拉闸。',2.5);return false;}
  gate.open=false;gate.locked=true;
  s.interactions[lever.id]=true;s.gunmuStage='trapped';s.gunmuBreachAt=this.time+gunmuGateHold;
  Object.assign(this.threat,{phase:'trapped',path:[],pathAge:1});
  this.emit(this.objective,4);
  return true;
 }
 enterGunmuPipes(){
  const s=this.state,finale=this.floor.gunmuFinale;
  s.gunmuStage='pipes';s.gunmuPipeCheckpoint=true;
  s.gunmuPipeIndex=0;
  s.gunmuSlides={};
  s.gunmuGroundedAt=this.time;s.gunmuJumpDown=false;s.gunmuJumpUntil=-Infinity;s.gunmuVelocity=0;
  s.glowstick=null;
  this.player.y=finale.pipeEntry.y;
  const exit=s.doors.find(d=>d.id===this.floor.exitGateId);
  exit.locked=false;exit.open=true;
  this.emit(this.objective,6);
 }
 rehearseGunmuPipes(){
  const s=this.state,f=this.floor.gunmuFinale;
  for(const d of s.doors.filter(d=>[f.trap.gateId,f.pipeGateId,this.floor.exitGateId].includes(d.id))){
   const trapped=d.id===f.trap.gateId;
   d.open=!trapped;d.locked=trapped;d.amount=trapped?0:1;d.block=doorBlock(d);d.broken=false;
  }
  s.interactions[f.trap.leverId]=true;s.gunmuBreachAt=this.time+gunmuGateHold-6;
  Object.assign(this.player,f.pipeEntry);
  this.enterGunmuPipes();
  const gate=s.doors.find(d=>d.id===f.trap.gateId);
  this.threat=null;this.beginGunmu({x:gate.x+.75,z:gate.z});
  this.threat.phase='trapped';
 }
 stageGunmuDebug(stage){
  const f=this.floor.gunmuFinale;
  if(!this.debugMode||!f)return;
  let look=f.spawn;
  if(stage==='boss2'){
   const gate=this.state.doors.find(d=>d.id===f.trap.gateId);
   const lever=this.floor.interactions.find(i=>i.id===f.trap.leverId);
   Object.assign(this.player,lever.approach);look=lever.target;
   this.beginGunmu({x:gate.x+1.42,z:gate.z});
  }else if(stage==='boss3'||stage==='exit'){
   this.rehearseGunmuPipes();
   if(stage==='exit'){Object.assign(this.player,f.route.at(-1));this.state.gunmuPipeIndex=f.route.length-1;look=this.floor.destination;this.threat=null;}
   else look=f.route[1];
  }else{
   Object.assign(this.player,{x:f.trigger.x+.9,z:f.spawn.z});
   this.beginGunmu();
  }
  return Math.atan2(this.player.x-look.x,this.player.z-look.z);
 }
 fallInGunmuShaft(){
  if(this.debugMode){this.rehearseGunmuPipes();return;}
  this.endAttempt('fall','你坠入了管道井。');
 }
 updateGunmu(t,dt){
  const s=this.state,f=this.floor.gunmuFinale,p=this.player;
  if(!f)return;
  if(s.gunmuBreachAt!==null){
   const gate=s.doors.find(d=>d.id===f.trap.gateId),access=s.doors.find(d=>d.id===f.pipeGateId);
   const left=s.gunmuBreachAt-this.time;
   if(access.locked&&gate.amount<.2){access.open=true;access.locked=false;}
   if(!gate.broken&&left>0){
    if(left<=2&&t.phase!=='breaching'){t.phase='breaching';s.gunmuGateImpactAt=this.time;}
    this.travelCampaignActor(t,dt,2.5,{x:gate.x+.75,z:gate.z,floor:1},'doubao');
    return;
   }
   if(!gate.broken){
    gate.broken=true;gate.open=true;gate.locked=false;
    s.gunmuGateImpactAt=this.time;
    if(s.gunmuStage!=='pipes')s.gunmuStage='breach';
    Object.assign(t,{phase:'pursuing',path:[],pathAge:1});
    this.emit('棍母破开了闸门。快跑！',4);
   }
  }
  if(t.age<t.warning)return;
  if(s.gunmuStage==='pipes'){
   if(t.phase!=='crawling'){
    this.travelCampaignActor(t,dt,gunmuPursuitSpeed,{...f.pipeEntry,floor:1},'doubao');
    if(distance(t,f.pipeEntry)>.58)return;
    t.phase='crawling';t.pipeIndex=0;t.pipeNext=0;
   }
   crawlGunmu(t,f,p,s.gunmuPipeIndex,dt,s,this.time);
   if(caughtInGunmuShaft(t,p,f,s.gunmuPipeIndex,s,this.time))this.fail('doubao');
   return;
  }
  if(this.line(t,p)||this.sprinting&&distance(t,p)<=13)t.lastSeen=point(p);
  this.travelCampaignActor(t,dt,gunmuPursuitSpeed,t.lastSeen,'doubao');
  if(distance(p,t)<.72&&this.line(t,p))this.fail('doubao');
 }
 updateAuxiliary(dt,input){
  const t=this.auxiliary;if(!t)return;t.age+=dt;
  if(t.kind==='liang'){this.updateListener(t,dt,0,true);return;}
  if(t.age<t.warning)return;
  t.phase='pursuing';t.observed=this.viewed(t,input);
  const travelTime=naiwaTravelTime(t,dt);
  if(travelTime>1e-8)this.travelActor(t,travelTime,2.6,this.player);
  if(distance(t,this.player)<.72&&this.line(t,this.player))this.fail('naiwa');
 }
 tick(dt,input={}){
  if(this.mode!=='playing')return;dt=Math.min(.1,Math.max(0,dt));this.time+=dt;
  if(this.falseDoorAttack){if(this.energyUntil>this.time-dt)this.energyUntil+=dt;updateFalseDoorAttack(this,dt);return;}
  if(this.floor.listenerDepot){this.updateDepotExit();this.updateDepotCrate(dt,input);}
  if(this.hiding?.leaveAt!==undefined){
   if(isSweep(this.threat?.kind))this.hiding.leaveAt+=dt;
   else if(this.wardrobeSecondsLeft<=1e-8)this.leaveWardrobe(this.floor.interactions.find(i=>i.id===this.hiding.id));
  }
  if(this.keypadOpen)input={...input,forward:0,right:0,sprint:false};this.lastInput=input;this.updateDoors(dt);
  this.state.keypadError=Math.max(0,this.state.keypadError-dt);
  const stick=this.state.glowstick;
  if(stick){
   if(this.advanceThrow(stick,dt))this.hearThrowLanding(stick);
   if(stick.age>=stick.life)this.state.glowstick=null;
  }
  this.updateWardThrow(dt);
  const before={...this.player};
  this.updateChaseAction(dt,input);const inputMovement=this.movePlayer(dt,input),moved=inputMovement+this.interactionMovement;this.interactionMovement=0;
  this.updateChaseEvents();
  if(springFalseDoor(this,before)){this.state.stonePlayback=null;return;}
  this.updateRoute();
  this.updateSearch(dt,input);
  if(this.mode!=='playing')return;
  const finale=this.floor.gunmuFinale;
  if(finale&&!this.travel){
   const stage=this.state.gunmuStage;
   if(stage==='pipes'&&this.state.gunmuPipeIndex===finale.platforms.length-1&&within(this.player,this.floor.exit)&&Math.abs(this.player.y-finale.platforms.at(-1).y)<.13){
    this.state.gunmuStage='escaped';this.mode='won';this.threat=null;this.auxiliary=null;this.resolved++;return;
   }
   if((stage==='trapped'||stage==='breach')&&this.player.x>=finale.pipeEntry.x&&within(this.player,finale.platforms[0],-.13)){
    this.enterGunmuPipes();return;
   }
  }
  this.director(dt,inputMovement>1e-8?before:null);
  if(this.floor.listenerDepot)this.updateDepotAlarms();
  this.updateGuideStone();
  this.updateThreat(dt,input,moved,inputMovement);
  const note=this.state.paperNotice;
  if(note&&this.mode==='playing'){
   if(this.threat&&!this.floor.listenerDepot)note.delay=2;
   else if((note.delay-=dt)<=0){this.emit(note.text,2.6);this.state.paperNotice=null;}
  }
 }
}
