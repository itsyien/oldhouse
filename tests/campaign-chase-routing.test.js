import test from 'node:test';
import assert from 'node:assert/strict';
import {CampaignGame} from '../src/campaign.js';
import {createCampaignBuilding} from '../src/campaign-layout.js';
import {Navigator,clearActorTravel,crossesDoor} from '../src/navigation.js';
import {blocked} from '../src/logic.js';
import {doorBlock,floorPassable} from '../src/building.js';

const building=createCampaignBuilding(),nav=new Navigator(building);
const normalPace=4.25,fastPace=normalPace*3;
test('a dynamic obstacle grazing Kun between two clear nodes still requires a detour',()=>{
 const a={floor:3,x:38,z:15},b={...a,z:15.5};
 const obstacle={floor:3,block:{minX:38.21,maxX:38.23,minZ:15.24,maxZ:15.26}};
 assert.equal(nav.path(a,b,[],false,{agent:'kun'}).distance,.5);
 const detour=nav.path(a,b,[obstacle],false,{agent:'kun'});
 assert(detour.distance>.5);
 assert(detour.every((to,i)=>!i||clearActorTravel(building.byId[3],detour[i-1],to,[obstacle.block])));
});
function hunt(origin,runner,yaw,seed=17){
 const g=new CampaignGame(building,seed,nav);
 g.jumpFloor(3);
 Object.assign(g.player,runner);
 assert(g.beginEncounter('kun',{floor:3,...origin,yaw}));
 g.immunity=0;
 const t=g.threat;
 Object.assign(t,{age:t.warning,speed:3.25,phase:'investigating'});
 return {g,t};
}

test('a new sound around either closed gate uses the real walkable bypass',()=>{
 for(const fps of [10,30,60])for(const [id,origin,runner,roundTheGate] of [
  ['receiving',{x:29.5,z:24.9},{x:26,z:24},t=>t.z>27.8],
  ['motor-gate',{x:37.08,z:-1.05},{x:38.08,z:2.3},t=>t.x>42],
 ]){
  const {g,t}=hunt(origin,runner,Math.atan2(origin.x-runner.x,origin.z-runner.z));
  const door=g.state.doors.find(d=>d.id===`3-${id}`);
  assert(!door.open&&door.amount===0);
  assert(!g.kunSeesPlayer(t));
  g.kunNoise(g.player,'metal',24);
  assert.deepEqual(t.goal,{...runner,floor:3});
  let detoured=false,hiddenPace=0;
  for(let frame=0;frame<fps*12&&g.mode==='playing';frame++){
   const start={x:t.x,z:t.z};
   g.tick(1/fps);
   const moved=Math.hypot(t.x-start.x,t.z-start.z);
   assert(moved<=(t.fastPursuit?fastPace:normalPace)/fps+1e-8);
   if(moved>0){
    const blocks=g.floorBlocks();
    assert(floorPassable(g.floor,t,.26,blocks));
    if(fps>=30)assert(clearActorTravel(g.floor,start,t,blocks));
   }
   if(!t.fastPursuit&&!t.sightLocked&&t.evidence==='metal')hiddenPace=Math.max(hiddenPace,moved*fps);
   if(frame===fps-1)assert(Math.hypot(t.x-origin.x,t.z-origin.z)>1,`${id}: stuck at a usable starting point`);
   detoured||=roundTheGate(t);
  }
  assert(detoured,`${id}: did not reach the physical loop at ${fps} fps`);
  assert(hiddenPace>=3.25-1e-8&&hiddenPace<=4.25+1e-8,`${id}: close investigation speed ${hiddenPace}`);
  assert.equal(g.lastCatch,'kun');
 }
});

test('Kun immediately triples normal pace only while the runner is more than eight metres away',()=>{
 for(const fps of [30,60])for(const gap of [1.8,8,8.05,14]){
  const {g,t}=hunt({x:38,z:23},{x:38,z:23-gap},0);
  t.speed=normalPace;t.sightTime=.28;
  for(let n=0;n<Math.round(fps*.2);n++){
   const z=t.z,fast=z-g.player.z>8;
   g.tick(1/fps);
   const pace=(z-t.z)*fps;
   assert.equal(t.fastPursuit,fast);
   if(gap>=8)assert(Math.abs(pace-(fast?fastPace:normalPace))<1e-8,`gap ${z-g.player.z}: moved at ${pace}`);
   else assert(pace>=3.8-1e-8&&pace<normalPace);
  }
  assert.equal(t.phase,'pursuing');assert.equal(g.mode,'playing');
 }
});

test('Kun follows an observed cart landing by a usable route through both gallery bends',()=>{
 for(const fps of [30,60]){
  const {g,t}=hunt({x:32.5,z:-5.5},{x:32.5,z:-1.25},Math.PI);
  const cart=g.floor.traversals.find(link=>link.id==='f3-vault-cart');
  t.sightTime=.28;assert(g.startTraversal(cart.id));
  while(g.traversal){
   g.tick(1/fps);
   assert.equal(t.goal.floor,3);assert(Math.hypot(t.goal.x-cart.b.x,t.goal.z-cart.b.z)<1e-8);
   assert(t.path.length>0,'the observed landing should remain on the nav graph');
  }
  let crossedCart=false,detouredCart=false,followedBend=false,fastEvidence=false;
  for(const [x,z] of [[32.5,8.5],[28.9,8.5],[28.9,16.85],[24.6,16.85]]){
   for(let frame=0;frame<fps*6&&Math.hypot(x-g.player.x,z-g.player.z)>.14;frame++){
    const start={x:t.x,z:t.z};
    const vaulting=t.vault;
    g.tick(1/fps,{forward:1,sprint:true,yaw:Math.atan2(g.player.x-x,g.player.z-z)});
    assert(Math.hypot(t.x-start.x,t.z-start.z)<=(t.fastPursuit?fastPace:normalPace)/fps+1e-8);
    if(t.vault?.id===cart.id&&t.z>.1&&t.z<.65){
     assert(t.y>=g.floor.base+cart.obstacle.height);crossedCart=true;
    }
    if(!vaulting&&!t.vault)assert(clearActorTravel(g.floor,start,t,g.floorBlocks(),.26,{traversals:g.state.traversals}));
    if(t.x<30.2&&t.z>=.2&&t.z<=4.9)detouredCart=true;
    if(!t.sightLocked&&t.phase==='investigating'&&t.speed>3.95)fastEvidence=true;
    if(t.x<31&&t.z>8.4)followedBend=true;
   }
   assert(Math.hypot(x-g.player.x,z-g.player.z)<=.14);
  }
  assert((crossedCart||detouredCart)&&followedBend&&fastEvidence,JSON.stringify({crossedCart,detouredCart,followedBend,fastEvidence}));
  assert.equal(g.mode,'playing');
 }
});

test('when sight breaks at the cart, motor and outer bends, a search follows the last observed direction',()=>{
 for(const [origin,runner,direction] of [
  [{x:32.5,z:8.5},{x:28.9,z:13.5},-1],
  [{x:38,z:-7.35},{x:41,z:-12.4},1],
  [{x:45.9,z:8.1},{x:39.4,z:5.65},-1],
 ]){
  const yaw=-direction*Math.PI/2,{g,t}=hunt(origin,runner,yaw,16);
  assert(!g.kunSeesPlayer(t));
  Object.assign(t,{phase:'searching',searchHeading:yaw,searchUntil:t.age+.02,speed:0});
  for(let frame=0;frame<12;frame++)g.tick(1/60);
  assert.equal(t.phase,'patrolling');assert.equal(t.sightLocked,false);
  assert((t.goal.x-origin.x)*direction>1,'search should follow the observed direction instead of going back');
  assert.notDeepEqual(t.goal,{...runner,floor:3});
 }
});

test('fast-route planning prices a door crossing once and will choose the quicker bypass',()=>{
 const {g}=hunt({x:38,z:2.7},{x:38,z:-3},Math.PI);
 const door=g.state.doors.find(d=>d.id===g.floor.chaseGateId),a={floor:3,x:38,z:2.7},b={floor:3,x:38,z:-3};
 const open=g.listenerDoors(),short=nav.path(a,b,open,false,{agent:'kun',speed:fastPace});
 const crosses=route=>route.some((p,i)=>i>0&&crossesDoor(route[i-1],p,door));
 assert(crosses(short));
 const quick=nav.path(a,b,open,false,{agent:'kun',speed:fastPace,doorOpeningCosts:[{...door,wait:.3}]});
 assert(crosses(quick));assert(Math.abs(quick.duration-short.duration-.3)<1e-8);
 const detour=nav.path(a,b,open,false,{agent:'kun',speed:fastPace,doorOpeningCosts:[{...door,wait:10}]});
 assert(detour.length&&!crosses(detour));assert(detour.duration<short.duration+10);
});

test('a closing motor door cannot pin Kun inside its leaf',()=>{
 const {g,t}=hunt({x:38,z:.41},{x:38,z:-7.4},0);
 const door=g.state.doors.find(d=>d.id===g.floor.chaseGateId);
 assert(blocked(t.x,t.z,[door.block],.26));
 for(let n=0;n<30;n++)g.travelCampaignActor(t,1/60,4.25,{...g.player},'kun');
 assert(t.z<door.z-.5);assert(!blocked(t.x,t.z,[door.block],.26));
});

test('Kun reopens a half-closed leaf obstructing the next route segment on his side',()=>{
 const {g,t}=hunt({x:38,z:.42626},{x:38.07,z:-7.4},0);
 const door=g.state.doors.find(d=>d.id===g.floor.chaseGateId);
 door.open=false;door.amount=.438721;door.block=doorBlock(door);
 for(let n=0;n<180;n++){
  t.age+=1/60;g.updateDoors(1/60);g.travelCampaignActor(t,1/60,4.25,{...g.player},'kun');
 }
 assert(door.open);assert(t.z<-1.5);
});

test('Kun can step out if the pipe rack falls over him, then routes around it',()=>{
 const {g,t}=hunt({x:38,z:19.3},{x:38,z:21},Math.PI);
 const rack=g.floor.chaseCollapse,target={...g.player};
 g.state.chaseCollapseAt=g.time-rack.warning-rack.fallDuration-.01;
 for(let frame=0;frame<30;frame++)g.travelCampaignActor(t,1/60,4,target,'kun');
 assert(t.z>rack.footprint.z+rack.footprint.d+.26);
 const exit={x:t.x,z:t.z},opposite={floor:3,x:38,z:17};
 t.pathAge=1;
 for(let frame=0;frame<45;frame++){
  const from={x:t.x,z:t.z};
  g.travelCampaignActor(t,1/60,4,opposite,'kun');
  assert(clearActorTravel(g.floor,from,t,g.floorBlocks()));
 }
 assert(Math.hypot(t.x-exit.x,t.z-exit.z)>1);
});

test('the final fan-room ambush guards one lane and Kun clears it without standing still',()=>{
 const {g,t}=hunt({x:26.5,z:16.92},{x:28,z:16.92},-Math.PI/2);
 t.stunnedUntil=20;
 g.tick(.1);
 const guard=g.auxiliary;
 assert.equal(guard?.phase,'guarding');
 assert(g.line(g.player,guard),'there is a clear warning view before committing to the lane');
 assert(Math.hypot(g.player.x-guard.x,g.player.z-guard.z)>4.9);
 const floor=g.floor,around=[g.player,{x:24.4,z:18.5},{x:18.8,z:18.5},{x:16.6,z:16.85},{x:14.8,z:15}];
 for(let i=1;i<around.length;i++)assert(clearActorTravel(floor,around[i-1],around[i],g.floorBlocks()),JSON.stringify([around[i-1],around[i]]));
 for(let i=0;i<12&&g.mode==='playing';i++)g.tick(.1,{forward:1,sprint:true,yaw:Math.PI/2});
 assert.equal(g.lastCatch,'naiwa');
 g.retry();
 assert.equal(g.auxiliary,null);assert.equal(g.state.chaseGuardSeen,false);
 const {g:next,t:kun}=hunt({x:25.4,z:16.66},{x:28,z:16.66},Math.PI/2);
 next.tick(.1);assert(next.auxiliary);
 Object.assign(next.player,{x:18,z:16.66});
 next.kunNoise(next.player,'sprint',24);
 for(let i=0;i<35&&next.mode==='playing';i++)next.tick(.1);
 assert.equal(next.auxiliary,null);assert(kun.x<21, `Kun moves past the former guard from ${kun.x}, ${kun.z}`);
 assert.equal(next.state.chaseGuardSeen,true);
});

test('Naiwa despawns beyond fifty metres as either encounter actor',()=>{
 for(const role of ['threat','auxiliary'])for(const floor of [2,3,4,6,7]){
  const g=new CampaignGame(building,17,nav);g.jumpFloor(floor);g.cooldown=999;
  const actor={kind:'naiwa',floor,x:g.player.x,z:g.player.z,y:g.player.y+50,age:0,warning:1};
  g[role]=actor;
  g.updateThreat(.1,{},0);
  assert.equal(g[role],actor);
  actor.y+=.01;
  g.updateThreat(.1,{},0);
  assert.equal(g[role],null);
 }
});
