import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareBuilding} from '../src/building.js';
import {Game} from '../src/simulation.js';
const building=prepareBuilding(JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/floors.json',import.meta.url))));
function game(floor=2,seed=8){const g=new Game(building,seed);g.enterFloor(floor);g.player={floor,x:32,z:16,y:g.floor.base};g.cooldown=0;g.state.events=2;g.state.flashlight=true;g.state.kunWait=g.state.yujieWait=1e6;return g;}
function wait(g,seconds){for(let i=0;i<Math.round(seconds*10);i++)g.director(.1);}

test('ordinary recovery is seeded between five and seven seconds and protects the full interval',()=>{
 const durations=[];
 for(const seed of [8,9,10]){const g=game(4,seed);g.beginEncounter('inspector',{floor:4,x:18,z:4});g.resolveThreat();const duration=g.cooldown;durations.push(duration);assert(duration>=5&&duration<=7);g.state.kunWait=0;g.player.x=18;g.player.z=4;wait(g,duration-.2);assert.equal(g.threat,null);wait(g,.7);assert.equal(g.threat?.kind,'kun');const same=game(4,seed);same.beginEncounter('inspector',{floor:4,x:18,z:4});same.resolveThreat();assert.equal(same.cooldown,duration);}
 assert(new Set(durations).size>1);
});

test('floor-two patrol repeats through un-restored blackout, retaining seven-second warning and recovery',()=>{
 const g=game();assert(g.beginPatrol());g.state.blackout=true;g.resolveThreat();assert(g.cooldown>=8);assert(g.state.patrolWait>=24&&g.state.patrolWait<=30);g.state.patrolWait=0;wait(g,7.8);assert.equal(g.threat,null);wait(g,.7);assert.equal(g.threat?.kind,'patrol');assert.equal(g.threat.warning,7);assert.equal(g.state.blackout,true);assert.equal(g.state.patrols,2);
});

test('floor-one patrol timing and floor-three visitor timing preserve separate pacing',()=>{
 for(let seed=8;seed<17;seed++){
  for(const floor of [1,2]){const g=game(floor,seed);assert(g.beginPatrol());g.resolveThreat();assert(g.state.patrolWait>=(floor===1?28:24)&&g.state.patrolWait<=(floor===1?38:30));}
  const g=game(3,seed);g.beginEncounter('yujie',{floor:3,x:27,z:4});g.resolveThreat();assert(g.state.yujieWait>=28&&g.state.yujieWait<=36);
 }
});

test('blackout continues Kun return clocks while stairs and wardrobe hiding remain safe',()=>{
 const g=game(4);g.player.x=18;g.player.z=4;g.state.blackout=true;g.state.kunWait=30;wait(g,29.5);assert.equal(g.threat,null);wait(g,.9);assert.equal(g.threat?.kind,'kun');assert.equal(g.threat.warning,2.8);
 for(const flag of ['travel','hiding']){const h=game(4);h.state.kunWait=30;h[flag]={};wait(h,40);assert.equal(h.threat,null);assert.equal(h.state.kunWait,30);}
});
