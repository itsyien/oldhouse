import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareBuilding, stairPoint, stairHeight, worldStair,doorBlock } from '../src/building.js';
import { Navigator } from '../src/navigation.js';
import { Game } from '../src/simulation.js';
const plan=JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/floors.json',import.meta.url)));
const building=prepareBuilding(plan);
test('all five real main routes remain connected with doors open; closed doors do not change architectural separation',()=>{
 const nav=new Navigator(building);
 for(const f of building.floors){const a={floor:f.id,...f.spawn},b={floor:f.id,...f.destination};assert(nav.path(a,b,[]).length>5);const d=nav.distance(a,b);assert(d>65&&d<(f.id===4?120:110));assert.equal(nav.distance(a,b),d);}
 assert(nav.distance({floor:5,x:8.7,z:8},{floor:1,x:6.5,z:29.5})>280);
});
test('switchback stairs are local, continuous, and two flights reach the exact next floor',()=>{
 assert.equal(stairHeight({x:20,z:4},5,null),12.96);
 for(const core of ['A','B']){const a=stairPoint(5,core,0),mid=stairPoint(5,core,.5),b=stairPoint(5,core,1);assert(Math.abs(a.y-12.96)<1e-8);assert(Math.abs(b.y-9.72)<1e-8);assert(mid.y<a.y&&mid.y>b.y);}
});
test('inspector grants reaction time, ignores turning, and requires two complete stationary checks',()=>{
 const g=new Game(building,123);g.beginEncounter('inspector',{floor:5,x:14,z:4});
 for(let i=0;i<12;i++)g.tick(.1,{yaw:i*.2,pitch:0});assert.equal(g.mode,'playing');assert(g.threat);
 for(let i=0;i<120;i++)g.tick(.1,{yaw:i*.4,pitch:0});assert.equal(g.mode,'playing');assert.equal(g.threat,null);
 assert.equal(g.resolved,1);
});
test('frog holds when observed, short blinks cannot make it advance, rooms and floor changes do not erase it',()=>{
 const g=new Game(building,8);g.player={floor:5,x:18,z:4,y:12.96};g.beginEncounter('naiwa',{floor:5,x:24,z:4});g.threat.age=3;
 const start=g.threat.x;for(let i=0;i<10;i++)g.tick(.1,{yaw:-Math.PI/2,pitch:0});assert.equal(g.threat.x,start);
 for(let i=0;i<4;i++)g.tick(.1,{yaw:Math.PI/2,pitch:0});assert.equal(g.threat.x,start);
 g.player.floor=4;g.player.x=8.7;g.player.z=24;g.enterFloor(4);assert(g.threat,'changing floors preserves pursuit');
});
test('a moving frog keeps its last step for exactly 0.2 seconds after the player looks back',()=>{
 const g=new Game(building,8);g.player={floor:5,x:18,z:4,y:12.96};g.beginEncounter('naiwa',{floor:5,x:24,z:4});g.threat.age=3;
 const away={yaw:Math.PI/2},toward={yaw:-Math.PI/2};
 for(let i=0;i<8;i++)g.tick(.1,away);
 const before=g.threat.x;assert(before<24);
 g.tick(.08,toward);assert(g.threat.x<before);
 g.tick(.09,toward);g.tick(.08,toward);
 const frozen=g.threat.x;assert(Math.abs(before-frozen-.2*2.95)<1e-6);
 g.tick(.1,toward);assert.equal(g.threat.x,frozen);
 for(let i=0;i<5;i++)g.tick(.1,away);assert.equal(g.threat.x,frozen);
 g.tick(.04,toward);assert.equal(g.threat.x,frozen);
});
test('checkpoint stays pending during danger; retry restores the same seed and block state',()=>{
 const g=new Game(building,919);g.beginEncounter('naiwa',{floor:5,x:24,z:4});g.player.floor=3;g.enterFloor(3);assert.equal(g.checkpoint.floor,5);assert.equal(g.pendingCheckpoint,3);
 g.resolveThreat();assert.equal(g.checkpoint.floor,3);const seed=g.seed;g.states[3].interactions.example=true;g.fail('kun');g.retry();assert.equal(g.seed,seed);assert.equal(g.player.floor,3);assert.equal(g.states[3].interactions.example,undefined);
});
test('reduced flicker does not modify threat visibility or delete interactable state',()=>{
 const g=new Game(building,12);const f=building.floors[0];g.interact(f.interactions[0].id);const val=g.states[5].interactions[f.interactions[0].id];g.enterFloor(4);g.enterFloor(5);assert.equal(g.states[5].interactions[f.interactions[0].id],val);
});
function walk(g,target){
 for(let n=0;n<5000;n++){const dx=target.x-g.player.x,dz=target.z-g.player.z;if(Math.hypot(dx,dz)<.08)return;const before={...g.player};g.movePlayer(Math.min(.03,Math.hypot(dx,dz)/2.4),{forward:1,yaw:Math.atan2(-dx,-dz)});assert(Math.abs(g.player.y-before.y)<.12,'no vertical teleport');if(Math.hypot(g.player.x-before.x,g.player.z-before.z)<.0001)assert.fail(`blocked at ${JSON.stringify(g.player)} going to ${JSON.stringify(target)}`);}assert.fail('walking timed out');
}
test('a player can walk every floor and both flights continuously to the ground-floor exit',()=>{
 const g=new Game(building,10);g.cooldown=1e9;
 for(let f=5;f>=1;f--){assert.equal(g.player.floor,f);if(f===1){const gate=g.state.doors.find(d=>d.logLock);gate.locked=false;gate.open=true;const exit=g.state.doors.find(d=>d.kind==='exit');exit.open=true;for(let i=0;i<20;i++)g.updateDoors(.1);}const path=g.nav.path(g.player,{floor:f,...g.floor.destination},g.doors);assert(path.length);for(const p of path)walk(g,p);
  if(f>1){const core=g.floor.departure;for(const [x,z]of [[5.8,6],[1.625,5.7],[1.625,2.1],[3.125,2.1],[3.125,5.7],[6.9,6]])walk(g,worldStair(x,z,core));assert.equal(g.player.floor,f-1);assert.equal(g.travel,null);assert(Math.abs(g.player.y-(f-2)*3.24)<1e-8);}
 }
 const exit=g.state.doors.find(d=>d.kind==='exit');exit.open=true;for(let i=0;i<20;i++)g.updateDoors(.1);walk(g,g.floor.destination);g.tick(.01);assert.equal(g.mode,'won');
});
test('closed fire door does not count as infinite distance or instant safety',()=>{
 const g=new Game(building,1);g.player={floor:5,x:32,z:16,y:12.96};const door=g.state.doors.find(d=>d.id==='5-east-12');door.open=false;door.amount=0;door.block=doorBlock(door);g.beginEncounter('naiwa',{floor:5,x:32,z:10});g.threat.age=3;
 const d=g.nav.distance(g.threat,g.player);assert(Number.isFinite(d)&&d<15);for(let i=0;i<28;i++)g.tick(.1,{yaw:0});assert(g.threat,'2.8 seconds behind a door does not erase tracking');assert(g.threat.searched<2);
});
test('wood breach requires a reachable second exit and gives at least four seconds plus route margin',()=>{
 const g=new Game(building,4);g.player={floor:5,x:24,z:4,y:12.96};const door=g.state.doors.find(d=>d.id==='5-room');door.open=false;door.amount=0;door.block=doorBlock(door);g.beginEncounter('kun',{floor:5,x:20,z:4});g.threat.age=3;g.threat.lastSeen={...g.player};g.updateThreat(.1,{},0);
 assert.equal(g.threat.breachAllowed,true);assert(g.threat.breachWarning>=4);assert(g.threat.breachWarning>=g.escapeRoute(door).distance/3.65+1.5);for(let i=0;i<38;i++)g.updateThreat(.1,{},0);assert.equal(door.broken,false);
 const back=g.state.doors.find(d=>d.id==='5-room-back');back.open=false;back.amount=0;back.block=doorBlock(back);assert.equal(g.escapeRoute(door),null);
});
test('a frog still visible at the edge of a widescreen camera remains frozen',()=>{
 const g=new Game(building,8);g.player={floor:5,x:15,z:4,y:12.96};g.beginEncounter('naiwa',{floor:5,x:20,z:4});g.threat.age=3;const x=g.threat.x;
 for(let i=0;i<10;i++)g.tick(.1,{yaw:-Math.PI/2+50*Math.PI/180,verticalFov:72*Math.PI/180,aspect:16/9});assert.equal(g.threat.x,x);
});
test('statues cannot rotate in view because their own footprint blocks their sight test',()=>{
 const g=new Game(building,1);g.player={floor:2,x:29,z:24.8,y:3.24};const p=g.building.byId[2].props[1];assert(g.viewed({floor:2,x:p.x,z:p.z,propIndex:1},{yaw:Math.PI/2,aspect:16/9,verticalFov:72*Math.PI/180}));
});
test('a blocked second exit cancels an armed wood-door breach',()=>{
 const g=new Game(building,4);g.player={floor:5,x:24,z:4,y:12.96};const door=g.state.doors.find(d=>d.id==='5-room');door.open=false;door.amount=0;door.block=doorBlock(door);g.beginEncounter('kun',{floor:5,x:20,z:4});g.threat.age=3;g.updateThreat(.1,{},0);assert(g.threat.breachAllowed);
 const back=g.state.doors.find(d=>d.id==='5-room-back');back.open=false;back.amount=0;back.block=doorBlock(back);for(let i=0;i<90;i++)g.updateThreat(.1,{},0);assert.equal(door.broken,false);
});
test('changing floors clears every encounter and resets destination spawn timers',()=>{
 for(const kind of ['inspector','naiwa','kun','liang','patrol','yujie']){const g=new Game(building,8);g.player={floor:3,x:26,z:7.22,y:6.48};g.beginEncounter(kind,{floor:3,x:26,z:9.22,tvId:'f3-e3'});g.states[2].events=2;g.states[2].patrolWait=99;g.states[2].yujieWait=99;g.debugPendingScare=true;g.enterFloor(2);assert.equal(g.threat,null);assert.equal(g.debugPendingScare,false);assert.equal(g.state.events,0);assert(g.state.patrolWait<=12);assert(g.state.yujieWait<=21);if(kind==='liang')assert.equal(g.states[3].interactions['f3-e3'],false);g.player.x=32;g.player.z=16;g.cooldown=0;g.state.patrolWait=0;g.director(.4);assert.equal(g.threat?.kind,'patrol');}
});
test('navigation retains the first grid corner so searchers do not stick on an open door leaf',()=>{
 const g=new Game(building,1);const t={kind:'naiwa',floor:2,x:31.3680076099,z:18.1135492125,pathAge:1,path:[]};const target={floor:2,x:29.5,z:16};for(let i=0;i<120;i++)g.travelActor(t,.05,2.95,target);assert(Math.hypot(t.x-target.x,t.z-target.z)<.6);
});
test('the final vestibule gives real cover from both the lobby glazing and observation window',()=>{
 const g=new Game(building,1);const exit={floor:1,x:6.5,z:30.35,y:0};for(const p of [{x:9.48,z:27.52},{x:6.6,z:20.5},{x:12,z:27.5}])assert.equal(g.line({floor:1,...p},exit),false);
});
