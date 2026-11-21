import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareBuilding,RISE,doorBlock,floorPassable} from '../src/building.js';
import {Game} from '../src/simulation.js';
import {sealedShelter} from '../src/patrol.js';
const building=prepareBuilding(JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/floors.json',import.meta.url))));
function game(floor=2,x=32,z=16){const g=new Game(building,8);g.player={floor,x,z,y:(floor-1)*RISE};g.cooldown=0;g.state.yujieWait=1e6;return g;}
function close(g,ids){for(const id of ids){const d=g.state.doors.find(d=>d.id===id);d.open=false;d.amount=0;d.block=doorBlock(d);}}
function hide(g){const t=g.threat;g.player={...t.refuge,y:(t.floor-1)*RISE};close(g,t.doors);if(t.wardrobe)assert(g.interact(t.wardrobe));assert(sealedShelter(g));}
test('both lower floors offer reachable sealed shelters within the fixed seven second warning',()=>{
 for(const f of [1,2])for(const [x,z]of [[18,4],[32,16],[18,28]]){const g=game(f,x,z);assert(g.beginPatrol());const t=g.threat;assert.equal(t.warning,7);assert(t.refugeDistance/3.65+t.doors.length*.7+1.2<=7);hide(g);assert(floorPassable(g.floor,g.hiding?.entry||g.player,.24,g.state.doors.map(d=>d.block)));}
});
test('warning is harmless, then any exposed player dies in the very first active frame regardless of range',()=>{
 for(const [x,z]of [[18,4],[18,28],[25,23]]){const g=game(2,x,z);assert(g.beginPatrol());g.threat.age=6.8;g.updateThreat(.1,{},0);assert.equal(g.mode,'playing');assert(!g.state.blackout);g.updateThreat(.11,{},0);assert.equal(g.mode,'lost');assert.equal(g.lastCatch,'patrol');assert(g.state.blackout);}
});
test('all doors must be actually closed; incomplete and broken closures do not protect',()=>{
 for(const unsafe of ['open','ajar','broken']){const g=game(2,32,16);g.beginPatrol();hide(g);const d=g.state.doors.find(d=>d.id==='2-east-20');if(unsafe==='open')d.open=true;if(unsafe==='ajar')d.amount=.2;if(unsafe==='broken')d.broken=true;g.threat.age=7;g.updateThreat(.01,{},0);assert.equal(g.mode,'lost',unsafe);}
});
test('a sealed refuge survives; opening a door during inspection is immediately fatal',()=>{
 const g=game();g.beginPatrol();hide(g);g.threat.age=7;g.updateThreat(.1,{},0);assert.equal(g.mode,'playing');g.interact(g.threat.doors[0]);g.updateThreat(.01,{},0);assert.equal(g.mode,'lost');
});
test('every refuge protects on both floors and power stays off after the inspection ends',()=>{
 for(const floor of [1,2])for(const room of building.byId[floor].shelters){const g=game(floor,room.x+room.w/2,room.z+room.d/2);g.beginPatrol();close(g,room.doors);for(let i=0;i<160&&g.threat;i++)g.updateThreat(.1,{},0);assert.equal(g.mode,'playing');assert.equal(g.threat,null);assert.equal(g.resolved,1);assert(g.state.blackout);}
});
test('floor one needs two distinct switches; duplicates and presses during danger cannot bypass the task',()=>{
 const g=game(1);g.beginPatrol();hide(g);g.threat.age=7;g.updateThreat(.1,{},0);const ids=g.floor.interactions.filter(i=>i.type==='switch').map(i=>i.id);g.interact(ids[0]);assert.deepEqual(g.state.restoredSwitches,[]);g.resolveThreat();g.interact(ids[0]);g.interact(ids[0]);assert.equal(g.state.restoredSwitches.length,1);assert(g.state.blackout);g.interact(ids[1]);assert(!g.state.blackout);assert.equal(g.state.restoredSwitches.length,2);
});

test('floor two restores power with any one switch after the patrol, but never during it',()=>{
 for(const index of [0,1]){const g=game(2);g.beginPatrol();hide(g);g.threat.age=7;g.updateThreat(.1,{},0);const id=g.floor.interactions.filter(i=>i.type==='switch')[index].id;
  assert.equal(g.powerSwitchesRequired,1);assert.equal(g.interact(id),false);assert(g.state.blackout);assert.equal(g.state.restoredSwitches.length,0);
  g.resolveThreat();assert(g.interact(id));assert(!g.state.blackout);assert.deepEqual(g.state.restoredSwitches,[id]);assert(g.messages.some(m=>m.text==='开关已复位。供电恢复。'));
 }
});
test('patrols return after an interval even when the player leaves power off',()=>{
 const g=game();g.beginPatrol();hide(g);g.threat.age=7;g.updateThreat(.1,{},0);g.resolveThreat();g.state.events=1;const delay=g.state.patrolWait;for(let i=0;i<Math.floor((delay-.5)*10);i++)g.director(.1);assert.equal(g.threat,null);assert(g.state.blackout);for(let i=0;i<10&&!g.threat;i++)g.director(.1);assert.equal(g.threat?.kind,'patrol');assert.equal(g.state.patrols,2);assert.equal(g.threat.warning,7);
});

test('patrol does not appear on upper floors or at the final threshold; danger does not block the exit',()=>{
 const upper=game(3);upper.state.events=2;upper.state.patrolWait=0;upper.director(.4);assert.equal(upper.threat,null);
 const lower=game(1,6.5,30.35);lower.state.patrolWait=0;lower.director(.4);assert.equal(lower.threat,null);
 const g=game(1);g.beginPatrol();g.threat.age=7;g.player={floor:1,x:6.5,z:30.35,y:0};const exit=g.state.doors.find(d=>d.kind==='exit');exit.open=true;exit.amount=1;exit.block=doorBlock(exit);g.tick(.1);assert.equal(g.mode,'won');
});
test('portraits reward each physical frame once, survive retries, and reset for a new run',()=>{
 const g=game();assert.equal(g.portraitTotal,28);const portraits=g.floor.interactions.filter(i=>i.type==='portrait');g.interact(portraits[0].id);g.interact(portraits[0].id);assert.equal(g.score,100);g.interact(portraits[1].id);assert.equal(g.score,200);g.saveCheckpoint(2);g.retry();g.interact(portraits[0].id);assert.equal(g.score,200);g.reset();assert.equal(g.score,0);assert.equal(g.discoveredPortraits.length,0);
});

test('a player can sprint to each planned refuge and close its doors before seven seconds',()=>{
 for(const floor of [1,2])for(const [x,z]of [[18,4],[32,16],[18,28]]){
  const g=game(floor,x,z);assert(g.beginPatrol());const t=g.threat,path=g.nav.path(g.player,t.refuge,g.doors);
  assert(path.length);for(const p of path){let count=0;while(Math.hypot(p.x-g.player.x,p.z-g.player.z)>.13&&++count<40&&g.mode==='playing')g.tick(.025,{sprint:true,forward:1,yaw:Math.atan2(g.player.x-p.x,g.player.z-p.z)});assert(count<40,JSON.stringify({floor,p,player:g.player}));}
  for(const id of t.doors)g.interact(id);if(t.wardrobe)assert(g.interact(t.wardrobe));for(let i=0;i<40;i++)g.tick(.025);
  assert(sealedShelter(g),JSON.stringify({floor,x,z,player:g.player,doors:t.doors}));assert(t.age<7);assert.equal(g.mode,'playing');assert.equal(g.travel,null);
 }
});
