import test from 'node:test';
import assert from 'node:assert/strict';
import {CampaignGame,makeFloorDeck} from '../src/campaign.js';
import {createCampaignBuilding} from '../src/campaign-layout.js';
import {Navigator} from '../src/navigation.js';
const building=createCampaignBuilding(),nav=new Navigator(building);
const rushWarnings=[null,3.2,4,4.8,5.6,6.4,7.2,8];
function game(id=7,seed=17){const g=new CampaignGame(building,seed,nav);g.jumpFloor(id);g.immunity=0;g.cooldown=0;return g;}
test('the five dangerous search floors draw a stable, varied monster roster and 8F is safe',()=>{
 for(let seed=0;seed<100;seed++){
  const deck=makeFloorDeck(seed);assert.equal(deck[8].monster,null);
  const floors=[7,6,5,4,2];assert.equal(new Set(floors.map(id=>deck[id].monster)).size,5);assert.equal(floors.filter(id=>deck[id].quiet).length,2);assert.equal(deck[8].quiet,false);assert.deepEqual(deck,makeFloorDeck(seed));
 }
});
test('sprint is faster, drains only while actually moving, and recovers without exhaustion stutter',()=>{
 const g=game(3);Object.assign(g.player,{x:9,z:24});const start=g.player.x;g.movePlayer(.1,{forward:1,yaw:-Math.PI/2,sprint:true});assert(Math.abs(g.player.x-start-.5)<.001);assert(g.stamina<100);const used=g.stamina;
 g.movePlayer(.1,{sprint:true});assert.equal(g.stamina,used);g.stamina=.5;g.movePlayer(.1,{forward:1,yaw:-Math.PI/2,sprint:true});assert(g.exhausted);assert.equal(g.stamina,0);
 for(let n=0;n<25;n++)g.movePlayer(.1,{});assert(g.stamina>=25);assert(!g.exhausted);assert(!g.sprinting);
 g.retry();assert.equal(g.stamina,100);
});
test('traversal proximity works on either side without aiming and rejects a wall or an already collapsed obstacle',()=>{
 const g=game(3),t=g.floor.traversals[0];Object.assign(g.player,{x:t.a.x-.7,z:t.a.z});assert.equal(g.nearestTraversal()?.traversalId,t.id);assert(g.startTraversal(t.id));g.traversal=null;
 Object.assign(g.player,{x:t.b.x+.7,z:t.b.z});assert.equal(g.nearestTraversal()?.traversalId,t.id);
 g.state.traversals[t.id]=true;assert.equal(g.nearestTraversal(),null);assert.equal(g.startTraversal(t.id),false);delete g.state.traversals[t.id];
 Object.assign(g.player,{x:t.a.x,z:t.a.z+1.6});assert.equal(g.nearestTraversal(),null);
 const vent=g.floor.traversals.find(t=>t.kind==='vent');Object.assign(g.player,vent.b);assert.equal(g.nearestTraversal(),null);
});
test('returner gives eight seconds then a second lethal sweep after the quiet gap; wardrobe protects both',()=>{
 const g=game(),w=g.floor.interactions.find(i=>i.type==='wardrobe');Object.assign(g.player,w.entry);assert(g.beginEncounter('rush'));assert.equal(g.threat.warning,8);assert(g.useWardrobe(w));
 const at=age=>{g.threat.age=age-.01;g.updateThreat(.01,{},0);};
 const end=g.threat.route.at(-1);
 at(8.01);assert.equal(g.threat.wave,1);assert.equal(g.mode,'playing');
 at(9.5);assert.equal(g.threat.phase,'between');assert(g.useWardrobe(w));
 at(10.91);assert.equal(g.threat.phase,'return-warning');assert.equal(g.mode,'playing');
 at(13.29);assert.equal(g.mode,'playing');assert(g.useWardrobe(w));
 at(13.31);assert.equal(g.threat.wave,2);assert.equal(g.threat.phase,'sweeping');
 assert(Math.hypot(g.threat.x-end.x,g.threat.z-end.z)<1);
 assert(g.useWardrobe(w));at(13.35);assert.equal(g.mode,'lost');assert.equal(g.lastCatch,'rush');
 const safe=game();Object.assign(safe.player,w.entry);safe.beginEncounter('rush');safe.useWardrobe(w);for(let n=0;n<160;n++)safe.updateThreat(.1,{},0);assert.equal(safe.mode,'playing');assert.equal(safe.threat,null);
});
test('the two Returner warnings are shorter on each deeper floor and end at forty percent of 7F',()=>{
 for(let floor=7;floor>=1;floor--){
  const g=game(floor),wardrobe=g.floor.interactions.find(i=>i.type==='wardrobe');
  g.debugMode=true;
  Object.assign(g.player,wardrobe.entry);
  assert(g.beginEncounter('rush'));
  assert(g.useWardrobe(wardrobe));
  const first=rushWarnings[floor],secondStart=first+1.3+1.6,second=secondStart+first*.3;
  assert.equal(g.threat.warning,first);
  const at=(age,phase,wave)=>{g.threat.age=age;g.updateThreat(0,{},0);assert.equal(g.threat.phase,phase);assert.equal(g.threat.wave,wave);};
  at(first-.001,'warning',1);at(first+.001,'sweeping',1);
  at(secondStart-.001,'between',1);at(secondStart+.001,'return-warning',2);
  at(second-.001,'return-warning',2);at(second+.001,'sweeping',2);
  at(second+.951,'leaving',2);
  assert(g.useWardrobe(wardrobe));
  g.resolveThreat();g.state.wardrobeReadyAt=0;
  assert(g.beginEncounter('patrol'));assert.equal(g.threat.warning,7);
 }
 assert.equal(rushWarnings[1]/rushWarnings[7],.4);
});
test('scene actors retain their early omen and encounter pacing',()=>{
 for(const id of [7,6,4]){
  const g=game(id);Object.assign(g.player,g.floor.interactions.find(i=>i.type==='wardrobe').entry);
  let warned,first;
  for(let n=0;n<125;n++){
   g.tick(.1);
   if(g.state.omen){assert.equal(g.state.omen.kind,'approach');warned??=g.time;}
   if(g.threat){first=g.time;break;}
  }
  assert(warned>=2.999&&warned<=5.11,`${id}F omen at ${warned}`);
  assert(first>=7.999&&first<=12.11,`${id}F real threat at ${first}`);
  assert.equal(g.threat.kind,g.deck[id].monster);
  assert.equal(g.state.events,1);assert.equal(g.state.omen,null);
 }
});
test('notes can queue the scene actor but never trigger a sweep when its timer is still running',()=>{
 const g=game(7),s=g.state,wardrobe=g.floor.interactions.find(i=>i.type==='wardrobe');
 Object.assign(g.player,wardrobe.entry);for(let n=0;n<130&&!g.threat;n++)g.tick(.1);
 assert(g.threat);const note=g.floor.interactions.find(i=>s.loot[i.id]==='whole');assert(g.takeFind(note));
 g.reserveEncounter('landmark');g.reserveEncounter('empty');assert.equal(s.pendingEncounter,'return');
 s.sweep.wait=30;
 g.resolveThreat();assert.equal(g.cooldown,6);assert(g.useWardrobe(wardrobe));
 for(let n=0;n<90;n++)g.tick(.1);assert.equal(s.events,1);assert.equal(g.cooldown,6);assert.equal(s.pressureAge,0);
 assert(g.useWardrobe(wardrobe));for(let n=0;n<59;n++)g.tick(.1);assert(!g.threat);
 for(let n=0;n<3;n++)g.tick(.1);assert.equal(g.threat?.kind,g.deck[7].monster);assert.equal(s.pendingEncounter,null);
 const real=g.threat;for(let n=0;n<10;n++)g.tick(.1);assert.equal(g.threat,real);assert.equal(s.events,2);
 g.resolveThreat();g.mode='paused';g.tick(.1);g.reserveEncounter('note');assert.equal(s.pendingEncounter,null);assert.equal(g.cooldown,6);
 g.mode='playing';g.travel={from:7,core:g.floor.departure,phase:'upper'};g.reserveEncounter('landmark');g.director(.1);assert.equal(s.pendingEncounter,null);assert.equal(g.cooldown,6);
 g.travel=null;s.approved=true;g.reserveEncounter('empty');for(let n=0;n<100;n++)g.director(.1);
 assert(!g.threat);assert.equal(s.pendingEncounter,null);
});
test('both sweeps can arrive on a timer before entering a scene or finding a note',()=>{
 const times=new Set(),kinds=new Set();
 for(const [id,seed] of [[7,6],[7,23],[7,53],[6,3],[4,11],[2,10]]){
  const g=game(id,seed),spawn={...g.player};
  for(let n=0;n<245&&!g.threat;n++)g.tick(.1);
  assert(g.time>=14&&g.time<=24.1);assert.deepEqual(g.player,spawn);
  assert.equal(g.state.sceneIndex,-1);assert.equal(g.knownCode,null);
  assert.equal(g.threat.phase,'warning');assert.equal(g.threat.warning,g.threat.kind==='rush'?rushWarnings[id]:7);
  if(id===7){times.add(g.time);kinds.add(g.threat.kind);}
 }
 assert.equal(times.size,3);assert.deepEqual(kinds,new Set(['patrol','rush']));
});
test('a timed sweep waits for a reachable wardrobe and existing danger to clear',()=>{
 const plan=createCampaignBuilding(),f=plan.byId[7],g=new CampaignGame(plan,1);
 g.jumpFloor(7);g.cooldown=0;
 const door=g.state.doors.find(d=>d.routeDoor),wardrobe=f.interactions.find(i=>i.type==='wardrobe'&&i.entry.x>door.x);
 f.interactions=f.interactions.filter(i=>i.type!=='wardrobe'||i===wardrobe);
 Object.assign(g.player,{x:door.x-1.4,z:door.z});
 g.director(.1);Object.assign(g.state.sweep,{roll:0,kind:'rush',wait:0});
 for(let n=0;n<10;n++)g.director(.1);
 assert.equal(g.threat,null,'a closed passage separates the only hiding spot');
 assert(g.interact(door.id));for(let n=0;n<15;n++)g.updateDoors(.1);
 assert(g.beginEncounter('inspector',{...g.player,x:g.player.x-2}));
 const active=g.threat;for(let n=0;n<50;n++)g.director(.1);
 assert.equal(g.threat,active);assert.equal(g.state.sweep.visit,0);
 assert.equal(g.beginEncounter('patrol'),false);assert.equal(g.beginEncounter('rush'),false);
 g.resolveThreat();for(let n=0;n<50;n++)g.director(.1);assert.equal(g.threat,null);
 for(let n=0;n<12;n++)g.director(.1);assert.equal(g.threat?.kind,'rush');
 const path=g.nav.path(g.player,{floor:7,...wardrobe.entry},g.doors);
 for(const target of [...path,wardrobe.entry]){
  for(let n=0;n<180&&Math.hypot(g.player.x-target.x,g.player.z-target.z)>.1;n++){
   g.tick(1/60,{forward:1,yaw:Math.atan2(g.player.x-target.x,g.player.z-target.z)});
  }
 }
 assert(g.useWardrobe(wardrobe));assert(g.threat.age<g.threat.warning);
 for(let n=0;n<160&&g.threat;n++)g.tick(.1);
 assert.equal(g.mode,'playing');assert.equal(g.threat,null);
});
test('each timed encounter lowers the next visit chance and draws a fresh delay',()=>{
 for(const [id,seed] of [[7,1],[2,17]]){
  const g=game(id,seed),w=g.floor.interactions.find(i=>i.type==='wardrobe');
  if(id===2)assert.equal(g.deck[id].monster,'patrol');
  Object.assign(g.player,w.entry);g.cooldown=8;assert(g.useWardrobe(w));
  const arrivals=[];
  g.director(0);
  g.state.sweep.roll=0;
  for(let n=0;n<1200&&arrivals.length<3;n++){
   const prior=g.state.sweep;g.tick(.1);
   if(g.state.sweep===prior)continue;
   assert.equal(g.threat.kind,prior.kind);
   assert.equal(g.state.sweep.chance,prior.chance*.8);
   g.state.sweep.roll=0;
   arrivals.push(g.time);
  }
  assert.equal(arrivals.length,3);assert.equal(g.hiding.id,w.id);assert.equal(g.mode,'playing');
  const gaps=[arrivals[1]-arrivals[0],arrivals[2]-arrivals[1]];
  assert(gaps.every(gap=>gap>=16&&gap<22.2));assert(Math.abs(gaps[0]-gaps[1])>=.1);
 }
});
test('retrying the same floor changes sweep timing and keeps its seeded password',()=>{
 const run=()=>{
  const g=game(2,2),password=g.state.code,arrivals=[];
  for(let attempt=0;attempt<3;attempt++){
   const start=g.time;
   g.director(0);assert.equal(g.state.sweep.chance,.14);
   g.state.sweep.roll=0;
   for(let n=0;n<245&&!g.threat;n++)g.tick(.1);
   assert(g.threat);assert.equal(g.threat.phase,'warning');assert.equal(g.state.code,password);
   arrivals.push(Math.round((g.time-start)*10)/10);
   for(let n=0;n<90&&g.mode==='playing';n++)g.tick(.1);
   assert.equal(g.mode,'lost');g.retry();
  }
  assert.equal(new Set(arrivals).size,3);
  return arrivals;
 };
 assert.deepEqual(run(),run());
});
test('only distinct empty searches count; reading either first slip reserves pressure and completing the pair upgrades it',()=>{
 const g=game(4),s=g.state;g.cooldown=999;const sites=g.floor.interactions.filter(i=>i.form);
 function search(site){Object.assign(g.player,site.approach);assert(g.interact(site.id));for(let n=0;n<6;n++)g.updateSearch(.1,{yaw:site.approach.yaw});assert(s.searched[site.id]);if(s.loot[site.id])assert(g.interact(site.id));}
 const empty=sites.filter(i=>s.loot[i.id]===null);assert(empty.length>=2);search(empty[0]);assert.equal(s.emptySearches,1);
 assert.equal(g.interact(empty[0].id),false);assert.equal(s.emptySearches,1);
 search(empty[1]);assert.equal(s.pendingEncounter,'empty');assert.equal(s.emptySearches,0);
 s.pendingEncounter=null;search(sites.find(i=>s.loot[i.id]==='back'));assert.equal(s.pendingEncounter,'note');assert.equal(g.knownCode,null);
 search(sites.find(i=>s.loot[i.id]==='front'));assert.equal(s.pendingEncounter,'return');assert.equal(g.knownCode,s.code);
});
test('the tutorial handle is armed by its sole note and retires after the visible movement',()=>{
 const g=game(8),s=g.state,note=g.floor.interactions.find(i=>s.loot[i.id]==='whole');
 assert(g.takeFind(note));assert.equal(s.omen.kind,'handle');for(let n=0;n<100;n++)g.tick(.1);
 assert.equal(s.omen.seenAt,null);s.omen.seenAt=g.time;for(let n=0;n<15;n++)g.tick(.1);
 assert.equal(s.omen,null);assert.equal(g.takeFind(note),false);assert.equal(s.events,0);assert(!g.threat);
});
test('a settled landing renders only this floor and the upcoming stairs, never the previous passages',()=>{
 for(const id of [7,6,5,4,3,2,1]){const g=game(id);assert(!g.renderFloors().includes(id+1));g.travel={from:id+1,core:g.floor.arrival,phase:'lower'};assert(g.renderFloors().includes(id+1),'both stair halves remain visible while transitioning');}
 const g=game(8);Object.assign(g.player,g.floor.destination);assert.deepEqual(g.renderFloors(),[8]);
 const d=g.state.doors.find(d=>d.id===`8-${g.floor.departure}`);d.locked=false;assert.deepEqual(g.renderFloors(),[8,7]);g.player.z+=16;assert.deepEqual(g.renderFloors(),[8]);
});
test('walking into the first scene seals the incoming stair, clear of the threshold',()=>{
 const g=game(),d=g.state.doors.find(d=>d.id===`7-${g.floor.arrival}`);g.tick(.05);assert(d.open);
 for(let n=0;n<20;n++)g.tick(.1,{forward:1,yaw:g.floor.spawnYaw});assert.equal(g.state.sceneIndex,0);assert(d.locked);assert.equal(d.open,false);assert.equal(d.amount,0,'the one-way arrival shuts before the player can reverse through it');
 Object.assign(g.player,{x:10,z:16});for(let n=0;n<30;n++)g.updateDoors(.1);assert(d.amount<.02);Object.assign(g.player,{x:8.8,z:24});assert.equal(g.interact(d.id),false);for(let n=0;n<40;n++)g.movePlayer(.05,{forward:1,sprint:true,yaw:Math.PI/2});assert.equal(g.player.floor,7);assert.equal(g.travel,null);
});
test('inspector sees interaction displacement when a locked player enters or leaves a wardrobe',()=>{
 for(const leaving of [false,true]){const g=game(),w=g.floor.interactions.find(i=>i.type==='wardrobe');Object.assign(g.player,w.entry);if(leaving)assert(g.useWardrobe(w));g.interactionMovement=0;
  g.beginEncounter('inspector',{floor:7,x:w.entry.x+3,z:w.entry.z});Object.assign(g.threat,{phase:'checking',age:2,warning:1.6,movementLocked:true,checks:0});assert(g.useWardrobe(w));g.tick(.1,{});assert.equal(g.mode,'lost');assert.equal(g.lastCatch,'inspector');}
});

function enterSweepDoor(g){
 const door=g.state.doors.find(d=>(d.roomDoor||d.sweepThreshold)&&d.open);
 const offset=door.axis==='x'?{x:door.x-.16,z:door.z}:{x:door.x,z:door.z-.16};
 const yaw=door.axis==='x'?-Math.PI/2:Math.PI;
 Object.assign(g.player,offset);
 g.tick(.1,{forward:1,yaw});
 return door;
}

test('base sweep odds are sixty percent lower in total and peak around the middle floors',()=>{
 const floors=[[7,.06,15/23],[6,.20,35/55],[4,.24,40/90],[2,.14,.5]];
 assert(Math.abs(floors.reduce((sum,[,chance])=>sum+chance,0)-(.15+.35+.5+.6)*.4)<1e-12);
 for(const [id,rate,wangShare] of floors){
  const g=game(id),count={patrol:0,rush:0},sample=4000;
  g.hiding={id:'test-wardrobe'};
  for(let seed=0;seed<sample;seed++){
   g.seed=seed;g.threat=null;delete g.state.sweep;g.director(0);
   assert.equal(g.state.sweep.chance,rate);
   g.state.sweep.wait=0;g.director(0);
   if(g.threat)count[g.threat.kind]++;
  }
  const total=count.patrol+count.rush;
  assert(Math.abs(total/sample-rate)<.025,`${id}F total ${total/sample}`);
  assert(Math.abs(count.patrol/total-wangShare)<.06,`${id}F Wang's share ${count.patrol/total}`);
 }
});

test('an eligible doorway starts the floor-selected Returner early and cannot retrigger on backtracking',t=>{
 for(const [floor,seed] of [[7,6],[6,3],[4,11],[2,10]]){
  const g=game(floor,seed),door=enterSweepDoor(g);
  assert.equal(g.threat?.kind,'rush',`no Returner after crossing ${door.id}`);
  const wardrobe=g.floor.interactions.filter(i=>i.type==='wardrobe').sort((a,b)=>Math.hypot(a.entry.x-g.player.x,a.entry.z-g.player.z)-Math.hypot(b.entry.x-g.player.x,b.entry.z-g.player.z))[0];
  const path=g.nav.path(g.player,{...wardrobe.entry,floor},g.doors);
  for(const target of [...path,wardrobe.entry])for(let n=0;n<90;n++){
   const dx=g.player.x-target.x,dz=g.player.z-target.z,d=Math.hypot(dx,dz);
   if(d<.03)break;
   g.tick(Math.min(.05,d/2.4),{forward:1,yaw:Math.atan2(dx,dz)});
  }
  assert(g.useWardrobe(wardrobe));
  assert(g.threat.age<g.threat.warning);
  t.diagnostic(`${floor}F seed ${g.seed}: hid in ${g.threat.age.toFixed(2)}s of ${g.threat.warning}s`);
  for(let n=0;n<160&&g.threat;n++){
   assert.equal(g.threat.kind,'rush');
   assert.equal(g.hiding.id,wardrobe.id);
   assert.equal(g.wardrobeSecondsLeft,0);
   g.tick(.1);
  }
  assert.equal(g.mode,'playing');
  assert.equal(g.threat,null);
  assert(g.useWardrobe(wardrobe));g.cooldown=0;enterSweepDoor(g);
  assert.equal(g.threat,null);
 }
});

test('a negative floor draw, tutorial, depot, chase and finale stay clear of both sweepers',()=>{
 for(const [id,seed] of [[8,17],[7,17],[5,17],[3,17],[1,17]]){
  const g=game(id,seed);
  enterSweepDoor(g);
  for(let n=0;n<450;n++){
   g.director(.1);
   assert(!['patrol','rush'].includes(g.threat?.kind),`${id}F started a sweep after crossing an eligible door`);
  }
  if([8,5,3,1].includes(id)){
   assert.equal(g.state.sweep,undefined);
   assert(!g.floorRoster.includes('rush'));assert(!g.floorRoster.includes('patrol'));
   g.threat=null;
   assert.equal(g.beginEncounter('patrol'),false);assert.equal(g.beginEncounter('rush'),false);
  }
 }
 const chase=game(3);assert.equal(chase.beginEncounter('inspector',chase.player),false);
});

test('opening a fresh door raises a missed draw once, and the timer uses that same draw',()=>{
 const g=game(4),s=g.state,door=s.doors.find(d=>d.roomDoor&&d.open);
 Object.assign(g.player,{x:door.x-1,z:door.z});
 g.director(0);
 Object.assign(s.sweep,{roll:.27,kind:'rush',wait:0});
 assert(g.interact(door.id));assert(g.interact(door.id));
 g.director(0);
 assert.equal(g.threat,null);
 assert.equal(s.sweep.chance,.24*1.3);
 assert.equal(s.sweep.roll,.27);
 assert.equal(s.sweep.wait,3.6);
 g.director(.016);assert.equal(g.threat,null);
 assert(g.interact(door.id));assert(g.interact(door.id));g.director(0);
 assert.equal(s.sweep.chance,.24*1.3);
 assert.equal(s.sweep.visit,0);
 g.hiding={id:'test-wardrobe'};s.sweep.wait=0;g.director(0);
 assert.equal(g.threat.kind,'rush');
 assert.equal(s.sweep.visit,1);
 assert.equal(s.sweep.chance,.24*1.3*.8);
});

test('a fresh opening during Inspector cannot start a sweep or repeat its boost',()=>{
 const g=game(6),s=g.state,door=s.doors.find(d=>d.roomDoor&&d.open);
 Object.assign(g.player,{x:door.x-1,z:door.z});
 assert(g.beginEncounter('inspector',{...g.player,x:g.player.x-2}));
 const inspector=g.threat;
 g.director(0);Object.assign(s.sweep,{roll:0,kind:'patrol',wait:0});
 assert(g.interact(door.id));assert(g.interact(door.id));g.director(0);
 assert.equal(g.threat,inspector);
 assert.equal(s.sweep.visit,0);
 assert.equal(s.sweep.chance,.20*1.3);
 assert(g.interact(door.id));assert(g.interact(door.id));g.director(0);
 assert.equal(g.threat,inspector);
 assert.equal(s.sweep.chance,.20*1.3);
});

test('natural inspections have at least eighty seconds between successful appearances',()=>{
 const g=game(7),pos={floor:7,x:15,z:8};
 assert(g.beginEncounter('inspector',pos));
 g.resolveThreat();g.state.pendingEncounter='return';
 g.time=79.99;assert.equal(g.beginEncounter('inspector',pos),false);
 g.time=80;assert(g.beginEncounter('inspector',pos));
 g.resolveThreat();g.time=159;assert.equal(g.beginEncounter('inspector',pos),false);
});
