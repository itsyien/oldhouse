import test from 'node:test';
import assert from 'node:assert/strict';
import {CampaignGame,makeFloorDeck} from '../src/campaign.js';
import {createCampaignBuilding} from '../src/campaign-layout.js';
import {doorBlock,floorPassable} from '../src/building.js';
import {blocked} from '../src/logic.js';
import {interactionHintAvailable} from '../src/interaction-glints.js';

const building=createCampaignBuilding();
function depot(){const g=new CampaignGame(building,32);g.jumpFloor(5);g.immunity=0;return g;}
function elapse(g,t){for(let n=0;n<Math.round(t*10);n++)g.tick(.1);}
function slips(g){return g.floor.interactions.filter(i=>i.type==='depot-slip');}
function collect(g,site){
 Object.assign(g.player,site.approach);assert(g.interact(site.id));
 if(site.crate&&!g.state.depotFinds[site.id]){
  for(let n=0;n<Math.ceil(site.crate.duration*10);n++)g.tick(.1,{interactHeld:true});
  assert(g.interact(site.id));
 }
 assert(g.state.depotFinds[site.id],site.id);
}
function typeCode(g,code){
 const k=g.floor.keypad;Object.assign(g.player,k.approach);assert(g.interact(k.id));
 for(const digit of code)assert(g.keypadKey(digit));
 return g.keypadKey('Enter');
}

test('5F has a continuous Liang patrol until the player enters the departure staircase',()=>{
 const g=depot(),{floor}=g;
 for(let seed=0;seed<20;seed++)assert.equal(makeFloorDeck(seed)[5].monster,'liang');
 assert.deepEqual(g.floorRoster,['liang']);
 for(let n=0;n<10;n++)g.tick(.1,{forward:1,yaw:floor.spawnYaw});
 const actor=g.threat;
 assert.equal(actor?.kind,'liang');assert.equal(g.state.events,1);
 assert.equal(g.beginEncounter('patrol'),false);
 const visited=new Set();
 for(let n=0;n<650;n++){
  g.tick(.1);visited.add(actor.routeIndex);
  assert(floorPassable(floor,actor,.26,g.floorBlocks()));
  assert(!blocked(actor.x,actor.z,floor.obstacles,.58),'the patrol needs room for the rigged model at each rack');
 }
 assert.equal(g.mode,'playing');assert.equal(g.threat,actor);
 assert.equal(actor.phase,'patrolling');assert(visited.size>=6);
 for(const site of slips(g).filter(site=>!site.crate).slice(0,5))collect(g,site);
 assert(typeCode(g,g.knownCode));
 g.tick(.1);assert(g.state.approved);assert.equal(g.threat,actor);
 g.travel={from:5,core:floor.departure,phase:'upper'};g.updateThreat(.1,{},0);
 assert.equal(g.threat,null);assert.equal(g.state.events,1);
});

test('Liang hears movement and interactions but keeps searching the recorded point while the player walks',()=>{
 const g=depot(),site=slips(g)[0];
 const start=g.floor.listenerRoute.find(p=>Math.hypot(p.x-site.approach.x,p.z-site.approach.z)>=7);
 Object.assign(g.player,site.approach);
 assert(g.beginEncounter('liang',start));const actor=g.threat;
 assert(g.interact(site.id));assert.equal(actor.phase,'investigating');
 assert.equal(actor.walkHearingAt,g.time+12);
 const heard={x:g.player.x,z:g.player.z,floor:5};
 assert.deepEqual(actor.lastNoise,heard);
 const walk={forward:1,yaw:site.approach.yaw+Math.PI};
 g.tick(.1,walk);assert(Math.hypot(g.player.x-heard.x,g.player.z-heard.z)>.2);assert.deepEqual(actor.lastNoise,heard);
 g.tick(.1,{...walk,sprint:true});assert.deepEqual(actor.lastNoise,{x:g.player.x,z:g.player.z,floor:5});
 assert.notDeepEqual(actor.lastNoise,heard);
 assert.equal(actor.walkHearingAt,g.time+12);
});

test('walking within seven metres is heard only once per twelve seconds and needs actual movement',()=>{
 const g=depot();g.travelCampaignActor=()=>{};
 Object.assign(g.player,{x:18.5,z:8});assert(g.beginEncounter('liang',{x:11,z:8}));
 const actor=g.threat,walk={forward:1,yaw:Math.PI/2};
 g.tick(.1,walk);assert.equal(actor.lastNoise,null);
 Object.assign(g.player,{x:17.4,z:8});g.tick(.1);assert.equal(actor.lastNoise,null);
 g.tick(.1,walk);assert.deepEqual(actor.lastNoise,{x:g.player.x,z:g.player.z,floor:5});
 const first=actor.lastNoise,ready=actor.walkHearingAt;
 assert.equal(ready,g.time+12);assert.equal(actor.phase,'investigating');
 g.tick(.1,walk);assert.deepEqual(actor.lastNoise,first);assert.equal(actor.walkHearingAt,ready);
 g.time=ready-.2;g.tick(.1,walk);assert.deepEqual(actor.lastNoise,first);
 g.tick(.1,walk);assert.deepEqual(actor.lastNoise,{x:g.player.x,z:g.player.z,floor:5});
 assert.notDeepEqual(actor.lastNoise,first);assert.equal(actor.walkHearingAt,g.time+12);
});

test('the depot patrol moves forty percent faster; its investigation still uses the chase pace',()=>{
 const g=depot();Object.assign(g.player,{x:17,z:8});assert(g.beginEncounter('liang',{x:11,z:8}));
 const speeds=[];g.travelCampaignActor=(_t,_dt,speed)=>speeds.push(speed);
 g.tick(.1);assert(Math.abs(speeds.at(-1)-1.55*1.4)<1e-8);
 assert(g.hearNoise(g.player));g.tick(.1);assert.equal(speeds.at(-1),5.6);
});

test('after a heard sprint, Liang follows a visible walker for one second then keeps only the last point',()=>{
 const g=depot();Object.assign(g.player,{x:17,z:8});
 assert(g.beginEncounter('liang',{x:11,z:8}));const actor=g.threat;
 const walk={forward:1,yaw:-Math.PI/2};
 g.tick(.1,{...walk,sprint:true});const sprintPoint=actor.lastNoise;
 g.tick(.1,walk);const deadline=actor.sprintPursuitUntil;
 assert.equal(deadline,g.time+1);assert(actor.lastNoise.x>sprintPoint.x);assert.equal(actor.phase,'investigating');
 for(let n=0;n<9;n++)g.tick(.1,walk);
 assert.equal(actor.lastNoise.x,g.player.x);assert.equal(actor.sprintPursuitUntil,deadline);
 const lastVisible=actor.lastNoise;
 g.tick(.1,walk);assert(g.player.x>lastVisible.x);assert.deepEqual(actor.lastNoise,lastVisible);
});

test('the sprint pursuit remembers the last point through cover and cannot follow a silent wardrobe entry',()=>{
 const g=depot();Object.assign(g.player,{x:17,z:8});
 assert(g.beginEncounter('liang',{x:11,z:8}));const actor=g.threat;
 g.tick(.1,{forward:1,yaw:-Math.PI/2,sprint:true});const heard=actor.lastNoise;
 const cover={x:19,z:14.5,floor:5};Object.assign(g.player,cover);
 assert(floorPassable(g.floor,cover));assert.equal(g.line(actor,g.player),false);
 g.tick(.1,{forward:1,yaw:-Math.PI/2});assert.equal(actor.phase,'investigating');assert.deepEqual(actor.lastNoise,heard);
 const wardrobe=g.floor.interactions.find(i=>i.type==='wardrobe');Object.assign(g.player,wardrobe.entry);
 assert(g.interact(wardrobe.id));
 assert(g.hiding);g.tick(.1);assert.deepEqual(actor.lastNoise,heard);
});

test('ignoring Liang after a loud interaction leads to a catch at the actual source',()=>{
 const g=depot(),site=slips(g)[0];
 Object.assign(g.player,site.approach);
 assert(g.beginEncounter('liang',g.floor.listenerRoute[0]));
 assert(g.interact(site.id));
 elapse(g,10);
 assert.equal(g.mode,'lost');assert.equal(g.lastCatch,'liang');
});

function wardrobeWithNearbyLiang(g){
 const wardrobe=g.floor.interactions.find(i=>i.type==='wardrobe');
 Object.assign(g.player,wardrobe.entry);
 const start=g.nav.byFloor[5].find(p=>{
  const gap=Math.hypot(p.x-g.player.x,p.z-g.player.z);
  return gap>1.2&&gap<2.6&&g.line(p,g.player);
 });
 assert(start);assert(g.beginEncounter('liang',start));g.threat.age=1;
 return {wardrobe,start,actor:g.threat};
}

test('Liang can investigate the exact wardrobe during a pursuit but cannot attack while the player is inside',()=>{
 const g=depot(),{wardrobe,actor}=wardrobeWithNearbyLiang(g);
 assert(g.hearNoise(g.player));actor.sprintPursuitUntil=g.time+1;actor.running=true;
 assert(g.interact(wardrobe.id));assert.deepEqual(actor.lastNoise,{floor:5,...wardrobe.entry});
 let closest=Infinity;
 for(let frame=0;frame<120;frame++){
  g.tick(1/60);assert.equal(g.mode,'playing');assert.equal(g.hiding.id,wardrobe.id);
  closest=Math.min(closest,Math.hypot(actor.x-wardrobe.entry.x,actor.z-wardrobe.entry.z));
 }
 assert(closest<.72,'Liang must reach striking distance of the cabinet');
});

test('manual and timed wardrobe exits leave Liang with his previous evidence; a new interaction is audible',()=>{
 for(const timeout of [false,true]){
  const g=depot(),{wardrobe,actor,start}=wardrobeWithNearbyLiang(g);g.immunity=100;
  assert(g.hearNoise(g.player));actor.sprintPursuitUntil=g.time+1;actor.running=true;
  assert(g.interact(wardrobe.id));
  g.tick(.1);const previous={x:start.x,z:start.z,floor:5};assert(g.hearNoise(previous));
  const heardAt=actor.heardAt,hearingReady=actor.walkHearingAt;
  if(timeout){g.time=g.hiding.leaveAt-.1;g.tick(.1);}
  else{assert(g.interact(wardrobe.id));g.tick(.1);}
  assert.equal(g.hiding,null);assert(g.wardrobeCooldown>14.8);
  assert.deepEqual(actor.lastNoise,previous);assert.equal(actor.heardAt,heardAt);assert.equal(actor.walkHearingAt,hearingReady);
  g.tick(.1,{forward:1,yaw:wardrobe.yaw+Math.PI,sprint:true});assert(g.sprinting);
  assert.deepEqual(actor.lastNoise,{floor:5,x:g.player.x,z:g.player.z});
  const paper=slips(g).find(site=>!site.crate);Object.assign(g.player,paper.approach);
  assert(g.interact(paper.id));assert.deepEqual(actor.lastNoise,{floor:5,x:paper.approach.x,z:paper.approach.z});
 }
});

test('depot wardrobes eject at five seconds and share a cooldown across all wardrobes',()=>{
 const g=depot();g.director=()=>{};
 const [first,other]=g.floor.interactions.filter(i=>i.type==='wardrobe');
 Object.assign(g.player,first.entry);assert(g.interact(first.id));assert.equal(g.wardrobeSecondsLeft,5);
 elapse(g,4.9);assert.equal(g.hiding.id,first.id);assert(g.wardrobeSecondsLeft>0);
 elapse(g,.1);assert.equal(g.hiding,null);assert.equal(g.state.interactions[first.id],false);
 assert.equal(g.wardrobeCooldown,15);assert(floorPassable(g.floor,g.player,.24,g.floorBlocks()));
 Object.assign(g.player,other.entry);assert.equal(g.interact(other.id),false);
 elapse(g,14.9);assert.equal(g.interact(other.id),false);
 elapse(g,.1);assert(g.interact(other.id));assert.equal(g.wardrobeSecondsLeft,5);
 elapse(g,2);assert(g.interact(other.id));assert.equal(g.hiding,null);assert.equal(g.wardrobeCooldown,15);
 g.retry();assert.equal(g.wardrobeCooldown,0);assert.equal(g.wardrobeSecondsLeft,0);
});

test('a blocked wardrobe threshold ejects into adjoining clear space',()=>{
 const g=depot();g.director=()=>{};
 const w=g.floor.interactions.find(i=>i.type==='wardrobe');
 Object.assign(g.player,w.entry);assert(g.interact(w.id));
 const {x,z}=w.entry,block={minX:x-.08,maxX:x+.08,minZ:z-.08,maxZ:z+.08};
 g.floorBlocks=()=>[block];
 assert.equal(floorPassable(g.floor,w.entry,.24,g.floorBlocks()),false);
 elapse(g,5);
 assert.equal(g.hiding,null);assert.equal(g.wardrobeCooldown,15);
 assert(Math.hypot(g.player.x-x,g.player.z-z)<1);
 assert(floorPassable(g.floor,g.player,.24,g.floorBlocks()));
});

test('any five of nine slips assemble the same code in pickup order, including across retries',()=>{
 const g=depot(),papers=slips(g),code=g.state.code;g.director=()=>{};
 assert.equal(papers.length,9);assert.equal(g.codeLength,5);assert.match(code,/^\d{5}$/);
 const order=[8,1,5,3,7];
 for(const [slot,index]of order.slice(0,4).entries()){
  collect(g,papers[index]);assert.deepEqual(g.state.depotFinds[papers[index].id],{slot,digit:code[slot]});
 }
 assert.equal(g.interact(papers[3].id),false);
 assert.deepEqual(g.state.depotDigits,[...code.slice(0,4),null]);
 assert.equal(g.depotCollected,4);assert.equal(g.knownCode,null);
 assert.equal(typeCode(g,code),false);assert(!g.state.approved);assert(g.keypadKey('Escape'));
 g.retry();assert.equal(g.depotCollected,4);assert.equal(g.knownCode,null);
 assert.deepEqual(Object.keys(g.state.depotFinds),order.slice(0,4).map(index=>papers[index].id));
 assert(g.state.depotCrates[papers[8].id]);
 collect(g,papers[7]);assert.equal(g.depotCollected,5);assert.equal(g.knownCode,code);
 Object.assign(g.player,papers[0].approach);assert(!g.interact(papers[0].id));
 assert(typeCode(g,code));assert(g.state.approved);
 g.retry();assert.equal(g.depotExitSeconds,0);assert.equal(g.knownCode,code);
 assert(g.state.doors.find(d=>d.id===g.floor.exitGateId).locked);
});

test('moving or releasing cancels a crate push; a completed hold exposes paper for a separate pickup',()=>{
 const g=depot(),site=slips(g).filter(site=>site.crate).at(-1);g.director=()=>{};
 Object.assign(g.player,site.approach);
 const start=g.floor.listenerRoute.find(p=>{
  const gap=Math.hypot(p.x-g.player.x,p.z-g.player.z);
  return gap>=10&&gap<=site.crate.noise;
 });
 assert(start);assert(g.beginEncounter('liang',start));const actor=g.threat;
 assert(g.interact(site.id));assert(!g.interact(site.id));
 g.tick(.1,{interactHeld:true});g.tick(.1,{interactHeld:false});
 assert.equal(g.depotCrateAction,null);assert.equal(actor.lastNoise,null);
 assert(g.interact(site.id));g.tick(.1,{interactHeld:true,forward:1,yaw:site.approach.yaw});
 assert.equal(g.depotCrateAction,null);assert.equal(g.depotCollected,0);
 const position={...site.approach,floor:5};Object.assign(g.player,position);
 assert(g.interact(site.id));g.tick(.1,{interactHeld:true});g.tick(.1,{interactHeld:true});
 const heard=actor.heardAt;
 assert.deepEqual(actor.lastNoise,{x:position.x,z:position.z,floor:5});
 assert.equal(actor.walkHearingAt,g.time+12);assert.equal(g.depotCollected,0);
 for(let n=0;n<Math.ceil(site.crate.duration*10)-2;n++)g.tick(.1,{interactHeld:true});
 assert.equal(g.depotCrateAction,null);assert(g.state.depotCrates[site.id]);assert.equal(g.depotCollected,0);
 assert.equal(actor.heardAt,heard);assert(g.interact(site.id));assert.equal(g.depotCollected,1);assert(!g.interact(site.id));
});

test('spare searches stock supplies at 55%, with 72% in depot drawers and cupboards',()=>{
 const g=depot();
 for(const [floor,expected]of [[5,.72],[6,.55]]){
  const f=g.building.byId[floor],cabinets=f.interactions.filter(i=>['drawer','cupboard'].includes(i.form));
  let stocked=0,rolls=0;
  for(let seed=0;seed<256;seed++){
   g.seed=seed;const state=g.initialFloor(f);
   for(const i of cabinets){
    const find=state.loot[i.id];
    if(['whole','front','back'].includes(find))continue;
    stocked+=Number(Boolean(find));rolls++;
   }
  }
  const fraction=stocked/rolls;
  assert(Math.abs(fraction-expected)<.045,`${floor}F stocked ${(fraction*100).toFixed(1)}% of spare cabinet searches`);
 }
});

test('a real sprint gives the player time to leave the crate before Liang reaches it',()=>{
 for(const retreat of [false,true]){
  const g=depot(),site=slips(g).find(i=>i.id==='f5-depot-slip-9'),dt=1/60;
  Object.assign(g.player,site.approach);
  assert(g.beginEncounter('liang',g.floor.listenerRoute[1]));
  assert(g.interact(site.id));
  while(g.depotCrateAction&&g.mode==='playing')g.tick(dt,{interactHeld:true});
  assert(g.interact(site.id));
  assert.equal(g.depotCollected,1);
  if(!retreat){
   elapse(g,5);assert.equal(g.lastCatch,'liang');continue;
  }
  const cover={x:41.6,z:7.8,floor:5},path=g.nav.path(g.player,cover,g.doors);
  assert(path.length);
  for(const stop of [...path,cover])for(let frame=0;frame<300;frame++){
   const dx=stop.x-g.player.x,dz=stop.z-g.player.z;
   if(Math.hypot(dx,dz)<.09)break;
   g.tick(dt,{yaw:Math.atan2(-dx,-dz),forward:1,sprint:true});
   assert.equal(g.mode,'playing');
  }
  assert(Math.hypot(g.player.x-cover.x,g.player.z-cover.z)<.09);
 }
});

test('a clock arms quietly, then rings at its own position four times and is spent until retry',()=>{
 const g=depot(),clock=g.floor.interactions.find(i=>i.type==='depot-alarm');
 Object.assign(g.player,clock.approach);
 assert(g.beginEncounter('liang',g.floor.listenerRoute[4]));const actor=g.threat;
 assert(g.interact(clock.id));const alarm=g.state.depotAlarms[clock.id];
 assert.deepEqual(alarm,{ringAt:4,ringEnd:8,lastRingAt:null});
 assert.equal(actor.lastNoise,null);assert.equal(g.interact(clock.id),false);
 Object.assign(g.player,g.floor.spawn);
 elapse(g,3.9);assert.equal(actor.lastNoise,null);assert.equal(alarm.lastRingAt,null);
 elapse(g,.1);
 assert.deepEqual(actor.lastNoise,{floor:5,x:clock.target.x,z:clock.target.z});
 assert.deepEqual(actor.noiseGoal,{floor:5,x:clock.approach.x,z:clock.approach.z});
 assert.equal(alarm.lastRingAt,4);assert(actor.noiseFromAlarm);
 assert.equal(actor.noiseMechanism,'clock');
 g.hearNoise({x:actor.x-7,z:actor.z});assert(actor.noiseFromAlarm);
 g.hearNoise({x:actor.x-2,z:actor.z});assert.equal(actor.noiseFromAlarm,false);
 assert.equal(actor.noiseMechanism,null);
 for(const pulse of [5,6,7]){elapse(g,1);assert.equal(alarm.lastRingAt,pulse);}
 assert(actor.noiseFromAlarm);elapse(g,2);assert.equal(alarm.lastRingAt,7);
 g.hearNoise({x:actor.x-7,z:actor.z});assert.equal(actor.noiseFromAlarm,false);
 g.retry();assert.deepEqual(g.state.depotAlarms,{});
});

test('the intercom and chute are quiet to arm and lure Liang to separate physical sources',()=>{
 const g=depot(),lures=g.floor.interactions.filter(i=>i.type==='depot-lure');
 assert.deepEqual(lures.map(i=>i.mechanism).sort(),['chute','intercom']);
 for(const lure of lures){
  g.retry();const start=g.floor.listenerRoute[4];Object.assign(g.player,lure.approach);
  assert(g.beginEncounter('liang',start));const actor=g.threat,armedAt=g.time;
  assert(g.interact(lure.id));assert.equal(g.interact(lure.id),false);
  const alarm=g.state.depotAlarms[lure.id];
  assert.equal(alarm.ringAt,armedAt+lure.delay);
  assert.equal(alarm.ringEnd,armedAt+lure.delay+lure.duration);
  assert.equal(actor.lastNoise,null);
  Object.assign(g.player,g.floor.spawn);
  elapse(g,lure.delay-.1);assert.equal(alarm.lastRingAt,null);assert.equal(actor.lastNoise,null);
  elapse(g,.1);assert.equal(alarm.lastRingAt,alarm.ringAt);
  assert.deepEqual(actor.lastNoise,{floor:5,...lure.noise});
  assert.deepEqual(actor.noiseGoal,{floor:5,...lure.noiseApproach});
  assert.notDeepEqual(actor.lastNoise,{floor:5,x:lure.target.x,z:lure.target.z});
  assert.equal(actor.noiseMechanism,lure.mechanism);
  elapse(g,lure.pulseInterval);assert.equal(alarm.lastRingAt,alarm.ringAt+lure.pulseInterval);
 }
 g.retry();assert.deepEqual(g.state.depotAlarms,{});
});

test('the intercom becomes available after each complete burst while the other lures stay spent',()=>{
 const g=depot();
 g.director=()=>{};
 for(const item of g.floor.interactions.filter(i=>['depot-lure','depot-alarm'].includes(i.type))){
  Object.assign(g.player,item.approach);
  const repeatable=item.mechanism==='intercom';
  for(let use=0;use<(repeatable?3:1);use++){
   assert(interactionHintAvailable(g,item));
   assert(g.interact(item.id));
   const active=g.state.depotAlarms[item.id];
   assert(!interactionHintAvailable(g,item));
   assert(!g.interact(item.id));
   elapse(g,(item.delay??4)+(item.duration??4)-.1);
   assert(active.lastRingAt>=active.ringAt);
   assert(!g.interact(item.id));
   elapse(g,.1);
   assert.equal(interactionHintAvailable(g,item),repeatable);
   assert.equal(g.state.depotAlarms[item.id],repeatable?undefined:active);
  }
 }
});

test('the timed stair gate requires a sprint, relocks on expiry, and accepts the same code again',()=>{
 const g=depot();g.director=()=>{};
 for(const site of slips(g).filter(site=>!site.crate).slice(0,5))collect(g,site);
 const code=g.knownCode,gate=g.state.doors.find(d=>d.id===g.floor.exitGateId);
 assert(typeCode(g,code));assert.equal(g.depotExitSeconds,g.depotExitDuration);
 const activeUntil=g.state.depotExitAt,keypadPosition={...g.player};
 Object.assign(g.player,g.floor.destination);assert.equal(g.interact(gate.id),false);assert(gate.open);
 Object.assign(g.player,keypadPosition);
 const doors=g.doors.map(door=>door===gate?{...gate,amount:1,block:doorBlock({...gate,amount:1})}:door);
 const route=g.nav.path(g.player,{floor:5,...g.floor.destination},doors);
 assert(route.distance>=30);assert(route.distance/2.4>g.depotExitDuration);
 const endpoint={x:7.95,z:g.floor.destination.z};
 function cross(sprintSeconds){
  const start=g.time;
  for(const node of [...route,g.floor.destination,endpoint]){
   for(let tries=0;;tries++){
    if(!g.state.approved||g.travel)return !!g.travel;
    const dx=node.x-g.player.x,dz=node.z-g.player.z,d=Math.hypot(dx,dz);
    if(d<.014)break;
    assert(tries<200,`movement blocked towards ${node.x}, ${node.z}`);
    const sprint=g.time-start<sprintSeconds;
    g.tick(Math.min(.05,d/(sprint?5:2.4)),{forward:1,yaw:Math.atan2(-dx,-dz),sprint});
   }
  }
  return !!g.travel;
 }
 assert.equal(cross(0),false);assert(gate.locked);assert(!gate.open);
 assert.equal(g.depotExitSeconds,0);assert.equal(g.state.depotExitAt,activeUntil);assert.equal(g.knownCode,code);
 assert(typeCode(g,code));assert(cross(4.5));
 assert(g.state.approved);assert.equal(g.depotExitSeconds,0);
 elapse(g,4.5);assert(g.time>=g.state.depotExitAt);assert(!gate.locked);assert.equal(g.travel.from,5);
});
