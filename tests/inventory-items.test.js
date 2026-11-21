import test from 'node:test';
import assert from 'node:assert/strict';
import {CampaignGame,ITEM_NAMES} from '../src/campaign.js';
import {createCampaignBuilding} from '../src/campaign-layout.js';
import {doorBlock} from '../src/building.js';

const building=createCampaignBuilding();
function game(id=6){const g=new CampaignGame(building,17);g.jumpFloor(id);g.cooldown=999;g.immunity=999;Object.assign(g.player,{x:9,z:8,y:g.floor.base});return g;}
const actor=(kind,floor=6,x=13,z=8)=>({kind,floor,x,z,phase:'watching',age:4,warning:1});

test('both impacts pull the depot listener away from the thrower even during another lure',()=>{
 for(const kind of ['ward','glowstick']){
  const g=game(5);Object.assign(g.player,{x:17,z:8});
  assert(g.beginEncounter('liang',{x:11,z:8}));
  const t=g.threat;t.alarmFocusUntil=60;
  g.inventory[0]=kind;assert(g.useItem(0,-Math.PI/2));
  const shot=g.state[kind==='ward'?'wardThrow':'glowstick'];
  for(let i=0;i<3;i++)g.tick(.1);
  assert.notEqual(t.noiseMechanism,'impact');
  for(let i=0;i<3;i++)g.tick(.1);
  assert.equal(t.noiseMechanism,'impact');assert.deepEqual(t.noiseGoal,{floor:5,x:shot.x,z:shot.z});
  assert(t.noiseGoal.x>g.player.x+2);assert.equal(t.phase,'investigating');
 }
});

test('energy is a two-slot supply and mint fully restores sanity without refilling stamina',()=>{
 const g=game();assert.equal(ITEM_NAMES.energy,'能量饮料');assert.equal(g.inventory.length,2);
 g.inventory=['mint','energy'];g.sanity=8;g.stamina=12;g.exhausted=true;
 assert(g.useItem(0));assert.equal(g.sanity,100);assert.equal(g.stamina,12);assert(g.exhausted);
 g.inventory[0]='mint';assert(!g.useItem(0));assert.equal(g.inventory[0],'mint');
 assert(g.useItem(1));assert.equal(g.energySecondsLeft,10);assert.equal(g.inventory[1],null);
 assert([...Array(30).keys()].some(seed=>{
  const run=new CampaignGame(building,seed,g.nav);
  run.jumpFloor(6);
  return Object.values(run.state.loot).includes('energy');
 }));
});

test('energy lasts ten active play seconds at 30 and 60 fps and ordinary stamina drain resumes',()=>{
 for(const fps of [30,60]){
  const g=game();g.inventory[0]='energy';g.stamina=0;g.exhausted=true;assert(g.useItem(0));
  g.mode='paused';for(let n=0;n<fps;n++)g.tick(1/fps);assert.equal(g.energySecondsLeft,10);g.mode='playing';
  for(let n=0;n<10*fps;n++){Object.assign(g.player,{x:9,z:8});g.tick(1/fps,{right:1,sprint:true});assert(g.sprinting);assert.equal(g.stamina,100);}
  assert(g.energySecondsLeft<1e-8);Object.assign(g.player,{x:9,z:8});g.tick(1/fps,{right:1,sprint:true});assert(g.stamina<100);assert(g.sprinting);
 }
});

test('energy carries across ordinary floors but retry and new run clear its timer',()=>{
 const g=game();g.inventory[0]='energy';assert(g.useItem(0));g.tick(.1);g.enterFloor(7);assert(Math.abs(g.energySecondsLeft-9.9)<1e-6);
 g.retry();assert.equal(g.energySecondsLeft,0);g.inventory[0]='energy';assert(g.useItem(0));g.reset();assert.equal(g.energySecondsLeft,0);
});

test('boss floor blocks all supplies without consuming them or changing state',()=>{
 const g=game(1);assert.equal(g.itemsAvailable,false);g.sanity=12;g.stamina=8;
 for(const kind of Object.keys(ITEM_NAMES)){g.inventory[0]=kind;assert(!g.useItem(0));assert.equal(g.inventory[0],kind);}
 assert.equal(g.sanity,12);assert.equal(g.stamina,8);assert.equal(g.energySecondsLeft,0);assert.equal(g.state.wardThrow,null);assert.equal(g.state.glowstick,null);
 g.jumpFloor(6);assert.equal(g.itemsAvailable,true);
});

test('ward is consumed on a real throw and only resolves its eligible encounter on landing',()=>{
 for(const kind of ['inspector','naiwa']){
  const g=game();g.threat=actor(kind);g.inventory=['ward','ward'];const target=g.threat;
  assert(g.useItem(0,-Math.PI/2));const thrown=g.state.wardThrow;assert(thrown.flight>0);assert.equal(thrown.age,0);assert.equal(thrown.hit,false);assert.equal(g.threat,target);assert.equal(g.inventory[0],null);
  assert(!g.useItem(1));assert.equal(g.inventory[1],'ward','an airborne throw is not silently replaced');
  g.updateWardThrow(thrown.flight-.01);assert.equal(g.threat,target);g.updateWardThrow(.011);assert.equal(g.threat,null);assert.equal(thrown.hit,true);
  const resolved=g.resolved;g.updateWardThrow(.1);assert.equal(g.resolved,resolved);g.updateWardThrow(thrown.life);assert.equal(g.state.wardThrow,null);
 }
});

test('wards can miss, never target other monsters or another floor, and never erase a future encounter',()=>{
 for(const kind of ['yujie','kun','patrol','rush','liang','doubao']){
  const g=game();g.threat=actor(kind);g.inventory[0]='ward';assert(g.useItem(0,-Math.PI/2));const t=g.threat;g.updateWardThrow(.6);assert.equal(g.threat,t);assert.equal(g.state.wardThrow.hit,false);
 }
 const far=game();far.threat=actor('inspector',5);far.inventory[0]='ward';assert(far.useItem(0,-Math.PI/2));far.updateWardThrow(.6);assert(far.threat);
 const miss=game();miss.threat=actor('naiwa');miss.inventory[0]='ward';assert(miss.useItem(0,-Math.PI/2));miss.threat.x=22;miss.updateWardThrow(.6);assert(miss.threat);assert.equal(miss.state.wardThrow.hit,false);
 miss.threat=actor('inspector',6,miss.state.wardThrow.x,miss.state.wardThrow.z);miss.updateWardThrow(.1);assert(miss.threat,'a landed miss is not a lingering trap');
});

test('an untargeted ward lands within eight metres and closed doors block both its path and landing pulse',()=>{
 const g=game();g.inventory[0]='ward';assert(g.useItem(0,-Math.PI/2));assert(Math.hypot(g.state.wardThrow.x-g.player.x,g.state.wardThrow.z-g.player.z)<=8.001);g.updateWardThrow(.6);assert.equal(g.state.wardThrow.hit,false);
 g.inventory[0]='ward';assert(g.useItem(0,-Math.PI/2,-Math.PI/4));assert(Math.abs(g.state.wardThrow.x-g.player.x-1.65)<1e-8);
 const closed=game(),gate=closed.state.doors.find(d=>d.id===closed.floor.keypad.gateId);gate.open=false;gate.amount=0;gate.block=doorBlock(gate);
 Object.assign(closed.player,{x:gate.x+1.6,z:gate.z});closed.threat=actor('inspector',6,gate.x-.6,gate.z);closed.inventory[0]='ward';assert(closed.useItem(0,Math.PI/2));
 assert(closed.state.wardThrow.x>gate.x);assert(Math.hypot(closed.state.wardThrow.x-closed.threat.x,closed.state.wardThrow.z-closed.threat.z)<1.75);closed.updateWardThrow(.6);assert(closed.threat);assert.equal(closed.state.wardThrow.hit,false);
});

test('ward can remove auxiliary NaiWa without touching the main visitor',()=>{
 const g=game();g.threat=actor('yujie',6,17,8);g.auxiliary=actor('naiwa');g.inventory[0]='ward';assert(g.useItem(0,-Math.PI/2));g.updateWardThrow(.6);assert.equal(g.auxiliary,null);assert.equal(g.threat.kind,'yujie');
});

test('active ticks land the ward, and a door closed during its flight stops the projectile',()=>{
 const active=game();assert(active.beginEncounter('naiwa',{floor:6,x:13,z:8}));active.inventory[0]='ward';assert(active.useItem(0,-Math.PI/2));
 for(let n=0;n<5;n++)active.tick(.1);assert(active.threat);active.tick(.1);assert.equal(active.threat,null);assert(active.state.wardThrow.hit);
 const g=game(),gate=g.state.doors.find(d=>d.id===g.floor.keypad.gateId);
 gate.open=true;gate.amount=1;gate.block=doorBlock(gate);Object.assign(g.player,{x:gate.x+1.6,z:gate.z});g.threat=actor('inspector',6,gate.x-.6,gate.z);g.inventory[0]='ward';
 assert(g.useItem(0,Math.PI/2));g.updateWardThrow(.1);gate.open=false;gate.amount=0;gate.block=doorBlock(gate);
 g.updateWardThrow(.46);assert(g.threat);assert.equal(g.state.wardThrow.hit,false);assert(g.state.wardThrow.x>gate.x);
});
