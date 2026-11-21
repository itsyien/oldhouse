import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareBuilding,floorPassable,doorBlock} from '../src/building.js';
import {Game} from '../src/simulation.js';
const building=prepareBuilding(JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/floors.json',import.meta.url))));
test('using the log starts the final Inspector after one second outside the doorway, replacing a visitor',()=>{
 const g=new Game(building,9);g.enterFloor(1);g.player={floor:1,x:9.8,z:24,y:0};g.state.logKey=true;g.state.flashlight=true;g.cooldown=999;g.state.yujieFollowup=3;
 assert(g.beginEncounter('yujie',{floor:1,x:18,z:28}));const visitor=g.threat;assert(g.interact('1-B'));assert.equal(g.state.yujieFollowup,null);
 for(let i=0;i<9;i++)g.tick(.1);assert.equal(g.threat,visitor);assert(!g.state.exitInspection);
 g.tick(.1);assert.equal(g.threat.kind,'inspector');assert(g.threat.exitInspection);assert.equal(g.threat.warning,2);assert.equal(g.player.x,9.8);assert(g.line(g.player,g.threat));assert.equal(g.resolved,0,'replacement must not award a defeated enemy');
 const inspector=g.threat;g.interact('1-B');g.interact('1-B');for(let i=0;i<15;i++)g.tick(.1);assert.equal(g.threat,inspector);assert.equal(g.state.exitInspectionWait,null);
});
function fixture(){const g=new Game(building,9);g.enterFloor(1);g.player={floor:1,x:7.5,z:24,y:0};g.cooldown=999;const d=g.state.doors.find(d=>d.logLock);d.locked=false;d.open=true;d.amount=1;d.block=doorBlock(d);g.saveCheckpoint(1);return g;}
test('the exit vestibule starts a single final inspection with reaction time and clear placement',()=>{
 const g=fixture();g.tick(.1);assert.equal(g.threat?.kind,'inspector');assert(g.threat.exitInspection);assert(g.threat.warning>=1.6);assert(g.line(g.player,g.threat));assert(floorPassable(g.floor,g.threat,.3,g.state.doors.map(d=>d.block)));assert(Math.hypot(g.player.x-g.threat.x,g.player.z-g.threat.z)>=2);
 for(let i=0;i<120;i++)g.tick(.1,{yaw:i*.1});assert.equal(g.mode,'playing');assert.equal(g.threat,null);assert.equal(g.resolved,1);for(let i=0;i<300;i++)g.tick(.1);assert.equal(g.threat,null);assert.equal(g.resolved,1);
});
test('final inspection waits for another encounter, works after blackout, and returns after retry',()=>{
 const g=fixture();g.beginEncounter('naiwa',{floor:1,x:9,z:28});g.tick(.1);assert.equal(g.threat.kind,'naiwa');assert.equal(g.state.exitInspection,false);g.resolveThreat();g.state.blackout=true;g.tick(.1);assert.equal(g.threat.kind,'inspector');g.fail('inspector');g.retry();assert.equal(g.state.exitInspection,false);Object.assign(g.player,{x:7.5,z:24});g.tick(.1);assert(g.threat.exitInspection);
});
test('final inspection does not affect earlier hallways or lock an open exterior exit',()=>{
 const g=fixture();g.player.x=18;g.player.z=28;g.tick(.1);assert.equal(g.threat,null);g.player.x=7.5;g.player.z=24;g.tick(.1);assert(g.threat.exitInspection);
 const d=g.state.doors.find(d=>d.kind==='exit');d.open=true;d.amount=1;d.block=doorBlock(d);g.player={floor:1,x:6.5,z:30.35,y:0};g.tick(.1);assert.equal(g.mode,'won');
});
