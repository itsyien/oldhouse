import test from 'node:test';
import assert from 'node:assert/strict';
import {CampaignGame,CHASE_BOARD_STUN} from '../src/campaign.js';
import {createCampaignBuilding} from '../src/campaign-layout.js';
import {Navigator,clearActorTravel} from '../src/navigation.js';
import {doorBlock,floorPassable} from '../src/building.js';

const building=createCampaignBuilding(),navigation=new Navigator(building);
function game(){
 const g=new CampaignGame(building,17,navigation);
 g.jumpFloor(3);
 return g;
}
function spawn(g,x,z,yaw){
 assert(g.beginEncounter('kun',{floor:3,x,z,yaw}));
 g.threat.age=g.threat.warning;
 g.immunity=0;
 return g.threat;
}
function advance(g,seconds,input={},fps=60){
 for(let n=0;n<Math.round(seconds*fps);n++)g.tick(1/fps,input);
}

test('the entry push can be cancelled safely and the three chase goals follow actual progress',()=>{
 for(const fps of [30,60]){
  const g=game(),gate=g.state.doors.find(d=>d.id===g.floor.chaseEntryDoorId);
  assert.equal(g.chaseStage,'entry');Object.assign(g.player,{x:gate.x-1.4,z:gate.z});
  assert(g.interact(gate.id));advance(g,.3,{interactHeld:true},fps);assert(!gate.open);assert.equal(g.threat,null);
  g.tick(1/fps,{interactHeld:false});assert.equal(g.chaseAction,null);assert(g.standbyKun);
  assert(g.interact(gate.id));advance(g,.6,{interactHeld:true},fps);assert(gate.open);assert.equal(g.threat,null);
  advance(g,.4,{},fps);assert.equal(g.threat?.kind,'kun');assert.equal(g.chaseStage,'corridor');
  g.threat=null;Object.assign(g.player,{x:28.9,z:8.5});g.tick(1/fps);assert.equal(g.chaseStage,'escape');
  Object.assign(g.player,{x:38,z:8.5});g.tick(1/fps);assert.equal(g.chaseStage,'escape');
  g.jumpFloor(4);assert.equal(g.chaseStage,null);g.jumpFloor(3);assert.equal(g.chaseStage,'entry');
 }
});

test('the pipe-rack collapse warns before blocking, leaves a real outer route, and settles without a soft lock',()=>{
 for(const fps of [30,60]){
  const g=game(),c=g.floor.chaseCollapse,above={floor:3,x:38,z:22.5},below={floor:3,x:38,z:17.8};
  Object.assign(g.player,{x:35,z:24});g.state.chaseStarted=true;g.tick(1/fps);
  const started=g.state.chaseCollapseAt;assert(Number.isFinite(started));
  advance(g,c.warning*.5,{},fps);assert(clearActorTravel(g.floor,above,below,g.floorBlocks()));
  advance(g,c.warning*.5+c.fallDuration*.73,{},fps);
  assert(g.time<started+c.warning+c.fallDuration);
  assert(!clearActorTravel(g.floor,above,below,g.floorBlocks()),'the descending rack already stops movement before it lands');
  const blockers=g.doors.concat(g.chaseBoardBlocks.map(block=>({floor:3,block})));
  const route=g.nav.path(above,below,blockers,false,{agent:'kun'});assert(route.length);assert(route.some(p=>p.x>44));
  const pause=g.time;g.mode='paused';advance(g,2,{},fps);assert.equal(g.time,pause);g.mode='playing';
  advance(g,c.hold+c.settle+.1,{},fps);assert(clearActorTravel(g.floor,above,below,g.floorBlocks()));
  assert.equal(g.state.chaseCollapseAt,started,'the collapse fires only once per attempt');
  g.retry();assert.equal(g.state.chaseCollapseAt,null);assert.equal(g.chaseStage,'entry');
 }
});

test('one vent interaction starts crossing immediately and the final stage ends on the safe landing',()=>{
 const g=game(),v=g.floor.traversals.find(t=>t.kind==='vent');g.state.chaseStarted=true;Object.assign(g.player,v.a);
 assert(g.interact(v.id));assert(g.traversal);assert.equal(g.chaseAction,null);assert.equal(g.state.ventOpen,true);
 advance(g,.4);assert(g.traversal.inside);assert.equal(g.state.ventSealed,true);
 advance(g,3.5);assert.equal(g.state.chaseEscaped,true);assert.equal(g.chaseStage,'complete');
 assert.equal(g.startTraversal(v.id),false,'a finished vent traversal cannot be repeated');
});

test('a runner under the rack when it lands can step out, but cannot enter the blocked lane again',()=>{
 const g=game(),c=g.floor.chaseCollapse;g.state.chaseStarted=true;g.state.chaseCollapseAt=0;g.time=c.warning+c.fallDuration;
 Object.assign(g.player,{x:38,z:c.footprint.z+c.footprint.d*.72});
 const start=g.player.z;advance(g,.2,{forward:1,yaw:0});assert.equal(g.player.z,start,'running inward cannot cross the obstacle');
 advance(g,.5,{forward:1,yaw:Math.PI});assert(g.player.z>c.footprint.z+c.footprint.d+.24);
 advance(g,.6,{forward:1,yaw:0});assert(g.player.z>=c.footprint.z+c.footprint.d+.24-1e-9);
});

test('a full sprint from the receiving corridor cannot slip through the first falling rack',()=>{
 for(const fps of [10,30,60]){
  const g=game(),rack=g.floor.chaseCollapse.footprint;
  Object.assign(g.player,{x:31.5,z:24});g.state.chaseStarted=true;
  while(g.player.x<37.9)g.tick(1/fps,{forward:1,sprint:true,yaw:-Math.PI/2});
  advance(g,1.6,{forward:1,sprint:true,yaw:0},fps);
  assert(Number.isFinite(g.state.chaseCollapseAt));
  assert(g.player.z>=rack.z+rack.d+.24-1e-9,`${fps} Hz sprint crossed to ${g.player.z}`);
  assert(g.player.z<rack.z+rack.d+.82,'the runner reached the physical obstruction');
 }
});

test('both maintenance partitions strike along their sweep while the player keeps running',()=>{
 for(const fps of [30,60])for(const index of [0,1]){
  const g=game(),board=g.floor.interactions.filter(i=>i.type==='chase-board')[index];
  const yaw=-board.direction*Math.PI/2;
  const t=spawn(g,board.x-1.75*board.direction,board.z,yaw);
  t.speed=4.55;t.sightTime=.28;t.seenAt=t.age;
  Object.assign(g.player,{x:board.x-.7*board.direction,z:board.z});
  assert(!g.interact(board.id),'approaching side cannot operate the board');
  Object.assign(g.player,{x:board.x+.7*board.direction,z:board.z});
  const start=g.player.x;
  assert(g.interact(board.id));assert(!g.interact(board.id));
  advance(g,.35,{forward:1,sprint:true,yaw},fps);
  assert((g.player.x-start)*board.direction>1.5);
  assert.equal(t.phase,'stunned');assert.equal(t.evidence,'sight');
  assert.equal(g.state.chaseBoards[board.id].hit,true);
  assert(Math.abs(t.stunnedUntil-t.stunnedAt-CHASE_BOARD_STUN)<1e-8);
  assert(!floorPassable(g.floor,board,.24,g.floorBlocks()));
  const fixed={x:t.x,z:t.z};
  advance(g,.75,{},fps);assert.deepEqual({x:t.x,z:t.z},fixed);
  advance(g,.65,{},fps);assert.notEqual(t.phase,'stunned');
  assert(floorPassable(g.floor,board,.24,g.floorBlocks()));
  assert(!g.interact(board.id));
 }
});

test('an early maintenance partition briefly blocks the route without stunning Kun',()=>{
 const g=game(),board=g.floor.interactions.find(i=>i.type==='chase-board');
 Object.assign(g.player,{x:board.x+.7,z:board.z});
 const t=spawn(g,board.x-4.4,board.z,-Math.PI/2);
 t.speed=4.55;t.sightTime=.28;t.seenAt=t.age;
 assert(g.interact(board.id));advance(g,.35,{forward:1,sprint:true,yaw:-Math.PI/2});
 assert.equal(g.state.chaseBoards[board.id].hit,false);
 assert.notEqual(t.phase,'stunned');
 assert(!floorPassable(g.floor,board,.24,g.floorBlocks()));
 advance(g,.69);assert(floorPassable(g.floor,board,.24,g.floorBlocks()));
});

test('the receiving gate requires a full stationary hold and can be closed behind the player',()=>{
 for(const fps of [30,60]){
  const g=game(),d=g.state.doors.find(d=>d.id===g.floor.chaseDoorId);
  Object.assign(g.player,{x:d.x-1.4,z:d.z});
  for(const cancel of [{interactHeld:false},{forward:1,interactHeld:true}]){
   assert(g.interact(d.id));advance(g,.6,{interactHeld:true},fps);assert(!d.open);
   g.tick(1/fps,cancel);assert.equal(g.chaseAction,null);assert(!d.open);
  }
  assert(g.interact(d.id));advance(g,.8,{interactHeld:true},fps);assert(!d.open);
  advance(g,.1,{interactHeld:true},fps);assert(d.open);assert.equal(g.chaseAction,null);
  advance(g,1);Object.assign(g.player,{x:d.x+2.15,z:d.z});
  assert(g.interact(d.id));advance(g,1);assert.equal(d.amount,0);
 }
});

test('a closed receiving gate cuts vision, dampens nearby sounds, and takes Kun time to open',()=>{
 const g=game(),d=g.state.doors.find(d=>d.id===g.floor.chaseDoorId);
 Object.assign(g.player,{x:d.x+2,z:d.z});
 const t=spawn(g,d.x-2,d.z,-Math.PI/2);
 assert.equal(g.kunSeesPlayer(t),false);
 g.kunNoise(g.player,'grate',6);assert.equal(t.lastNoise,null);
 g.kunNoise(g.player,'door',12);assert.equal(t.evidence,'door');
 advance(g,1);assert(!d.open);assert(t.x<d.x);
 advance(g,4);assert(d.open);assert.equal(g.lastCatch,'kun');
});

test('a glowstick targets its actual landing point after losing sight, never overrides a visible player',()=>{
 const g=game();Object.assign(g.player,{x:38,z:16});
 const t=spawn(g,38,12,Math.PI);
 advance(g,.32);assert(t.sightLocked);assert.equal(t.evidence,'sight');
 g.inventory[0]='glowstick';assert(g.useItem(0,Math.PI));assert.equal(t.lastNoise,null);
 advance(g,.36);
 Object.assign(g.player,{x:42.6,z:15.5});t.heading=0;
 assert(!g.kunSeesPlayer(t));
 g.inventory[0]='glowstick';assert(g.useItem(0,Math.PI/2));
 const stick=g.state.glowstick;
 assert.deepEqual(t.goal,{floor:3,x:stick.x,z:stick.z});assert.equal(t.evidence,'glowstick');
 assert(Math.hypot(stick.x-g.player.x,stick.z-g.player.z)>2);
});

test('the maintenance call box rings once in the side aisle after the player can leave',()=>{
 const g=game(),lever=g.floor.interactions.find(i=>i.type==='chase-bell');
 assert(lever);
 assert(g.beginEncounter('kun',{floor:3,x:38.04,z:6.7,yaw:Math.PI}));
 const t=g.threat;
 assert(!g.interact(lever.id));
 Object.assign(g.player,{x:38.04,z:2.85});
 assert(!g.kunSeesPlayer(t));assert(g.interact(lever.id));
 assert(!g.interact(lever.id));
 advance(g,.5);assert(!g.state.bellAt);assert.equal(t.lastNoise,null);
 advance(g,.1);assert(Number.isFinite(g.state.bellAt));assert.equal(t.evidence,'bell');
 assert.deepEqual(t.goal,{floor:3,...g.floor.chaseLure});
 const ring=g.state.bellAt;advance(g,.4);
 assert(!g.interact(lever.id));assert.equal(g.state.bellAt,ring);
});

test('cloth footsteps are quiet, normal sprints and metal steps reveal their actual source only within earshot',()=>{
 const g=game(),t=spawn(g,38,19.5,Math.PI);
 Object.assign(g.player,{x:43.15,z:17.4});assert(!g.kunSeesPlayer(t));
 g.tick(1/60,{forward:1});assert.equal(t.lastNoise,null);assert.equal(g.state.clothIndex,0);assert.equal(g.state.clothAt,g.time);
 Object.assign(t,{x:42.7,z:15.7,heading:Math.PI/2});
 Object.assign(g.player,{x:45.9,z:19.3});
 g.tick(1/60,{forward:1,sprint:true});assert.equal(t.evidence,'sprint');
 const sprintSource={...t.lastNoise};g.tick(1/60,{forward:1});assert.deepEqual(t.lastNoise,sprintSource);
 Object.assign(t,{x:38,z:20.5,heading:Math.PI});
 Object.assign(g.player,{x:38,z:16});g.tick(1/60,{forward:1});
 assert.equal(t.evidence,'metal');assert.deepEqual(t.lastNoise,{floor:3,x:g.player.x,z:g.player.z});assert.equal(g.state.metalAt,g.time);
 const behindIsland={x:14.8,z:15};g.kunNoise(behindIsland,'grate',6);assert.equal(t.evidence,'metal');
});

test('a real sight break preserves the last seen point and permits a silent direction change',()=>{
 const g=game();Object.assign(g.player,{x:27,z:13.3});
 const t=spawn(g,29,13.3,Math.PI/2);t.age=t.warning-.33;advance(g,.4);assert.equal(t.phase,'pursuing');
 const observed={...t.lastSeen};Object.assign(g.player,{x:22,z:16.2});assert(!g.line(t,g.player));
 g.tick(1/60,{forward:1});assert.equal(t.phase,'investigating');
 assert.deepEqual(t.goal,observed);assert.deepEqual(t.lastSeen,observed);
 assert.equal(t.lastNoise,null);
 for(let frame=0;frame<240&&t.phase!=='searching';frame++)g.tick(1/60);
 assert.equal(t.phase,'searching');assert(Math.hypot(t.x-observed.x,t.z-observed.z)<.6);
});

test('Kun closes a straight visible gap while walking and loses ground against a full sprint',()=>{
 for(const fps of [30,60])for(const sprint of [false,true]){
  const g=game();Object.assign(g.player,{x:38,z:20});
  const t=spawn(g,38,23,0);t.speed=4.25;t.sightTime=.28;
  for(let frame=0;frame<fps*(sprint?1:1.8)&&g.mode==='playing';frame++){
   const before=t.z;
   g.tick(1/fps,{forward:1,sprint,yaw:0});
   assert(t.sightLocked);
   const traveled=before-t.z;
   assert(traveled>0&&traveled<=4.25/fps+1e-8,'visible pursuit must advance without pausing or returning to an old node');
   if(sprint)assert(Math.abs(traveled-4.25/fps)<1e-8);
  }
  if(sprint){assert.equal(g.mode,'playing');assert(Math.abs(t.z-g.player.z-3.75)<1e-8);}
  else assert.equal(g.lastCatch,'kun');
 }
});

test('a tap crosses the whole duct without holding and only nearby Kun hears entry',()=>{
 for(const fps of [30,60]){
  const g=game(),v=g.floor.traversals.find(t=>t.kind==='vent');
  Object.assign(g.player,v.a);const t=spawn(g,17.7,16.9,-Math.PI/2);
  assert(g.interact(v.id));assert.equal(t.evidence,'vent');assert(g.traversal);assert.equal(g.chaseAction,null);
  advance(g,.3,{interactHeld:false,forward:1},fps);assert(g.traversal,'releasing E or the touch button does not cancel entry');
  advance(g,v.playerDuration,{},fps);assert(g.state.chaseEscaped);assert.equal(g.mode,'playing');
  g.retry();Object.assign(g.player,v.a);const far=spawn(g,38,24,0);
  assert(g.interact(v.id));assert.equal(far.lastNoise,null);assert(g.state.ventOpen);assert(g.traversal);assert(!g.state.chaseEscaped);
  advance(g,v.playerDuration+.2,{},fps);
  assert(g.state.chaseEscaped);assert.equal(g.threat,null);assert(g.player.y<g.floor.base);
  assert.equal(g.player.x,v.b.x);assert(Math.abs(g.player.z-v.b.z)<.001);
 }
});

test('instant vent entry offers no immunity while the player is still outside its mouth',()=>{
 const g=game(),v=g.floor.traversals.find(t=>t.kind==='vent');
 Object.assign(g.player,{x:v.a.x+1.1,z:v.a.z});assert(g.startTraversal(v.id));
 assert(g.traversal);assert(!g.traversal.inside);
 spawn(g,g.player.x+.6,g.player.z,Math.PI/2);g.tick(1/60);
 assert.equal(g.mode,'lost');assert.equal(g.lastCatch,'kun');
});

test('the cleared vent blocks walking back in, including a side approach, and retry restores entry',()=>{
 for(const fps of [30,60]){
  const g=game(),v=g.floor.traversals.find(t=>t.kind==='vent');
  Object.assign(g.player,v.a);spawn(g,38,24,0);assert(g.interact(v.id));advance(g,v.playerDuration+.1,{},fps);
  assert(g.state.chaseEscaped);assert(g.ventReturnBlocks.length);
  advance(g,1,{forward:1,sprint:true,yaw:Math.PI},fps);assert(g.player.z<v.b.z+.25,'returning straight into the duct is blocked');
  Object.assign(g.player,{x:11.4,z:9.6});advance(g,.6,{forward:1,yaw:Math.PI/2},fps);assert(g.player.x>10.8,'the exit landing cannot bypass the barrier from the side');
  Object.assign(g.player,{...v.b});advance(g,.4,{forward:1,yaw:0},fps);assert(g.player.z<v.b.z-.8,'the stair landing stays freely reachable');
  g.retry();assert.equal(g.state.chaseEscaped,false);assert.equal(g.ventReturnBlocks.length,0);assert.equal(g.chaseAction,null);
  Object.assign(g.player,v.a);assert(g.interact(v.id));assert(g.traversal);assert.equal(g.chaseAction,null);
 }
});

test('debug roster matches the actual actors available on each floor',()=>{
 const g=game();assert.deepEqual(g.floorRoster,['kun','naiwa']);g.jumpFloor(8);assert.deepEqual(g.floorRoster,[]);
 g.jumpFloor(7);assert.deepEqual(new Set(g.floorRoster),new Set([g.deck[7].monster,'patrol','rush']));assert.equal(g.threat,null);
 g.jumpFloor(1);assert.deepEqual(g.floorRoster,['doubao']);
});

test('Kun and Naiwa connect to a reachable route point beside a swung door',()=>{
 for(const [kind,floor,x,z,doorId,target] of [
  ['kun',3,37.08,1.05,'3-motor-gate',{x:8.8,z:24}],
  ['naiwa',4,21.65,11.8,'4-side-door',{x:8.8,z:8}],
 ]){
  const g=game();g.jumpFloor(floor);
  if(kind==='kun'){
   const entrance=g.state.doors.find(d=>d.id===g.floor.chaseEntryDoorId);
   Object.assign(entrance,{open:true,amount:1});entrance.block=doorBlock(entrance);
  }
  const door=g.state.doors.find(d=>d.id===doorId);
  Object.assign(door,{amount:.35,open:true,held:true,vanished:false});door.block=doorBlock(door);
  const t={floor,x,z,kind,path:[],pathAge:1,heading:0};
  const goal={floor,...target},blocks=g.floorBlocks();
  const nearest=g.nav.closest(t,blocks);
  assert(!clearActorTravel(g.floor,t,nearest,blocks));
  const route=g.nav.path(t,goal,g.doors,false,{agent:kind});
  assert(route.length>3);
  assert(clearActorTravel(g.floor,t,route[0],blocks));
  if(kind==='kun')g.travelCampaignActor(t,.1,3,goal,kind);
  else g.travelActor(t,.1,3,goal);
  assert(Math.hypot(x-t.x,z-t.z)>.2);
  assert(clearActorTravel(g.floor,{x,z},t,blocks));
 }
});

test('a completed search cannot expire Naiwa on the same floor',()=>{
 const g=game();g.jumpFloor(6);
 assert(g.beginEncounter('naiwa',{floor:6,x:20,z:8}));
 const t=g.threat;
 const lastSeen={floor:6,x:20,z:8};
 Object.assign(t,{age:60,hidden:20,searched:2,searchPoints:[lastSeen,lastSeen],rangeAge:1,pathAge:0,lastSeen});
 g.line=()=>false;g.nav={distance:()=>15};
 g.updateThreat(.1,{},0);
 assert.equal(g.threat,t);
 g.enterFloor(5);assert.equal(g.threat,null);
});
