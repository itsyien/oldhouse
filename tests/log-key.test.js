import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareBuilding,doorBlock,floorPassable} from '../src/building.js';
import {Game} from '../src/simulation.js';
import {tr,setLanguage} from '../src/i18n.js';
const building=prepareBuilding(JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/floors.json',import.meta.url))));
function game(){const g=new Game(building,8);g.enterFloor(1);g.player={floor:1,x:32,z:16,y:0};g.state.flashlight=true;g.state.kunWait=g.state.yujieWait=g.state.patrolWait=1e6;return g;}
function survive(g){assert(g.beginPatrol());for(const id of g.floor.shelters[0].doors){const d=g.state.doors.find(d=>d.id===id);d.open=false;d.amount=0;d.block=doorBlock(d);}for(let i=0;i<150;i++)g.updateThreat(.1,{},0);assert(!g.threat);assert(g.state.patrolCleared);}
function dispel(g){g.player={floor:1,x:18,z:28,y:0};g.cooldown=0;g.director(.1);assert.equal(g.threat?.kind,'doubao');g.threat.x=30;g.threat.z=28;g.threat.age=3;for(let i=0;i<62&&g.threat;i++){g.threat.x=30;g.updateThreat(.1,{yaw:-Math.PI/2},0)};assert(!g.threat);}
test('final fire door blocks walking, navigation and interaction before both encounters',()=>{
 const g=game(),d=g.state.doors.find(d=>d.logLock);assert(d.locked);assert(!d.open);assert.equal(g.interact(d.id),false);
 assert.equal(g.nav.path({floor:1,x:9,z:24},{floor:1,x:6.5,z:26},g.doors).length,0);
 for(const z of [23.02,23.3,24,24.7,24.98])assert(!floorPassable(g.floor,{x:8.2,z},.24,g.state.doors.map(d=>d.block)));
 Object.assign(g.player,{x:9,z:24});for(let i=0;i<30;i++)g.tick(.05,{forward:1,yaw:Math.PI/2});assert(g.player.x>8.2);assert(!g.state.exitInspection);
 g.player.x=7.5;g.director(.1);assert(!g.state.exitInspection,'teleporting through the lock does not start the finale');
});
test('only surviving Wang then entering the south corridor starts Gunmu; victory grants the log',()=>{
 const g=game();g.player.x=18;g.player.z=28;g.director(1);assert(!g.threat);g.player.x=32;g.player.z=16;survive(g);
 for(let i=0;i<450;i++)g.director(.1);assert(!g.threat,'east room never starts the armed encounter');assert(!g.state.logKey);
 g.player.x=32;g.player.z=20.9;g.director(.1);assert(!g.threat,'still inside the refuge');dispel(g);assert(g.state.logKey);assert(g.messages.some(m=>m.text.includes('获得滚木')));
 const d=g.state.doors.find(d=>d.logLock);assert(d.locked);assert.equal(g.interact(d.id),false,'key cannot be used remotely');
 Object.assign(g.player,{x:9.5,z:24});assert(g.interact(d.id));assert(!g.state.logKey);assert(!d.locked);assert(d.open);
 for(let i=0;i<20;i++)g.updateDoors(.1);assert(g.nav.path(g.player,{floor:1,x:6.5,z:26},g.doors).length);
 Object.assign(g.player,{x:7.5,z:24});for(let i=0;i<10;i++)g.director(.1);assert(g.threat?.exitInspection);assert(g.interact(d.id));assert(!d.open);assert(g.interact(d.id));assert(d.open,'reopening needs no second key');
});
test('clearing encounters, dying or changing floors never grants the wooden key',()=>{
 const g=game();g.beginPatrol();g.resolveThreat();assert(!g.state.patrolCleared);
 g.beginEncounter('doubao',{floor:1,x:32,z:23});g.resolveThreat();assert(!g.state.logKey);
 const h=game();survive(h);h.beginEncounter('doubao',{floor:1,x:32,z:23});h.resolveThreat();assert(!h.state.logKey);
 h.beginEncounter('doubao',{floor:1,x:32,z:23});h.threat.exposure=5;h.threat.phase='leaving';h.fail('doubao');h.resolveThreat();assert(!h.state.logKey);
 const k=game();survive(k);k.beginEncounter('doubao',{floor:1,x:32,z:23});k.enterFloor(2);assert(!k.states[1].logKey);
});
test('pending encounter, inventory and unlocked gate follow floor and checkpoint state',()=>{
 const g=game();survive(g);g.enterFloor(2);g.enterFloor(1);assert.equal(g.state.doubaoWait,0);dispel(g);g.saveCheckpoint(1);g.state.logKey=false;g.retry();assert(g.state.logKey);
 Object.assign(g.player,{x:9.5,z:24});g.interact('1-B');g.saveCheckpoint(1);g.retry();assert(!g.state.doors.find(d=>d.logLock).locked);assert(!g.state.logKey);
 g.reset();assert(g.states[1].doors.find(d=>d.logLock).locked);assert(!g.states[1].patrolCleared);assert(!g.states[1].logKey);
});
test('wooden-key instructions are translated for the default English mode',()=>{
 setLanguage('en');for(const s of ['防火门 · 滚木锁','使用滚木开锁','防火门已锁 · 需要滚木','棍母终究还是不存在的。获得滚木，前往尽头防火门按 E 开锁。'])assert(!/[\u3400-\u9fff]/.test(tr(s)));
});
