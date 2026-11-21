import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareBuilding} from '../src/building.js';
import {Game} from '../src/simulation.js';
const building=prepareBuilding(JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/floors.json',import.meta.url))));
function game(floor=1){const g=new Game(building,8);g.enterFloor(floor);g.player={floor,x:18,z:28,y:g.floor.base};g.state.flashlight=true;g.state.events=2;g.cooldown=0;g.state.kunWait=g.state.patrolWait=1e6;return g;}
test('Kun on floor one stays harmless and stationary for six seconds; floor four is unchanged',()=>{
 for(const floor of [1,4]){const g=game(floor);assert(g.beginEncounter('kun',{floor,x:28,z:28}));const t=g.threat;assert.equal(t.warning,floor===1?6:2.8);t.age=t.warning-.2;g.updateThreat(.1,{},0);assert.equal(t.x,28);assert.equal(g.mode,'playing');g.updateThreat(.11,{},0);assert.notEqual(t.x,28);}
});
test('floor-one Yujie only follows an actual Gunmu defeat and has one copy',()=>{
 const g=game();g.state.yujieWait=0;for(let i=0;i<100;i++)g.director(.1);assert(!g.threat);
 assert(g.beginEncounter('doubao',{floor:1,x:30,z:28}));g.resolveThreat();assert(!g.state.gunmuDefeated);assert.equal(g.state.yujieFollowup,null);
 g.beginEncounter('doubao',{floor:1,x:30,z:28});g.threat.age=3;for(let i=0;i<62&&g.threat;i++){g.threat.x=30;g.updateThreat(.1,{yaw:-Math.PI/2},0)};assert(g.state.gunmuDefeated);assert.equal(g.state.yujieFollowup,3);
 for(let i=0;i<31;i++)g.director(.1);assert.equal(g.threat?.kind,'yujie');assert.equal(g.threat.copies.length,1);
 g.resolveThreat();g.cooldown=0;g.state.yujieWait=0;g.director(.4);assert.equal(g.threat?.kind,'yujie');assert.equal(g.threat.copies.length,1);
});
test('visitors never replace or overlap a chase, inspection, patrol or TV task',()=>{
 for(const kind of ['naiwa','kun','inspector','patrol','doubao']){const g=game();g.state.gunmuDefeated=true;g.state.yujieFollowup=0;g.beginEncounter(kind,{floor:1,x:30,z:28});const t=g.threat;for(let i=0;i<50;i++)g.director(.1);assert.equal(g.threat,t);assert(!g.beginEncounter('yujie'));}
 const g=game(3),tv=g.floor.interactions.find(i=>i.type==='tv');const start=g.nav.closest({floor:3,x:tv.target.x,z:tv.target.z-2});g.player={floor:3,x:start.x,z:start.z,y:g.floor.base};assert(g.beginEncounter('liang',{floor:3,x:tv.target.x,z:tv.target.z,tvId:tv.id}));const broadcast=g.threat;g.state.yujieWait=0;for(let i=0;i<50;i++)g.director(.1);assert.equal(g.threat,broadcast);assert(!g.beginEncounter('yujie'));g.resolveThreat();g.cooldown=0;g.state.liangCleared=true;g.player={floor:3,x:44,z:8,y:g.floor.base};g.director(.4);assert.equal(g.threat?.kind,'yujie');assert.equal(g.threat.copies.length,3);assert(!g.beginEncounter('inspector'));
});
