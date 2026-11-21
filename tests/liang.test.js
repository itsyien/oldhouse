import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Game} from '../src/simulation.js';
import {prepareBuilding,floorPassable,doorBlock} from '../src/building.js';
const building=prepareBuilding(JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/floors.json',import.meta.url))));
function encounter(floor=3,seed=1){const g=new Game(building,seed),tv=building.byId[floor].interactions.find(i=>i.type==='tv');const start=g.nav.closest({floor,x:tv.target.x,z:tv.target.z-2});g.player={floor,x:start.x,z:start.z,y:(floor-1)*3.24};g.cooldown=1e6;assert(g.beginEncounter('liang',{floor,x:tv.target.x,z:tv.target.z,tvId:tv.id}));return g;}
function pick(g,r){g.player.x=r.x;g.player.z=r.z;assert(g.interact(r.id));}
function finishTV(g){const t=g.threat;for(const r of t.remotes)pick(g,r);g.player.x=t.remotes[0].x;g.player.z=t.remotes[0].z;assert(g.interact(t.tvId));}

test('floor three TV success schedules two quiet seconds then three seconds of Yujie warning',()=>{
 const g=encounter();finishTV(g);assert(g.state.liangCleared);assert.equal(g.state.yujieFollowup,2);g.state.events=2;
 for(let i=0;i<19;i++)g.tick(.1,{pitch:-1.15});assert.equal(g.threat,null);g.tick(.1,{pitch:-1.15});assert.equal(g.threat?.kind,'yujie');assert.equal(g.threat.warning,3);assert.equal(g.threat.phase,'warning');assert.equal(g.state.yujieFollowup,null);
 for(let i=0;i<28;i++)g.tick(.1,{pitch:-1.15});assert.equal(g.threat.phase,'warning');for(let i=0;i<2;i++)g.tick(.1,{pitch:-1.15});assert.equal(g.threat.phase,'watching');assert.equal(g.sanity,100);
 const visits=g.state.yujieVisits;g.resolveThreat();assert(g.state.yujieWait>=28&&g.state.yujieWait<=36);for(let i=0;i<50;i++)g.tick(.1);assert.equal(g.state.yujieVisits,visits);
});

test('only a completed floor-three TV task schedules the followup; changing floor cancels it',()=>{
 const unfinished=encounter();unfinished.resolveThreat();assert.equal(unfinished.state.yujieFollowup,null);assert(!unfinished.state.liangCleared);
 for(const floor of [1,2,5]){const g=encounter(floor);finishTV(g);assert.equal(g.state.yujieFollowup,null);}
 const g=encounter();finishTV(g);g.enterFloor(2);assert.equal(g.states[3].yujieFollowup,null);for(let i=0;i<60;i++)g.tick(.1);assert.notEqual(g.threat?.kind,'yujie');
});

test('floor-three random visitors wait for Liang and failed safe spawns retry without stacking threats',()=>{
 const g=encounter();g.threat=null;g.state.events=2;g.state.yujieWait=0;g.cooldown=0;g.director(.4);assert.equal(g.threat,null);
 const h=encounter();finishTV(h);const spawn=h.spawnFor;h.spawnFor=()=>null;for(let i=0;i<20;i++)h.tick(.1);assert.equal(h.threat,null);assert.equal(h.state.yujieFollowup,.5);h.spawnFor=spawn;for(let i=0;i<5;i++)h.tick(.1);assert.equal(h.threat?.kind,'yujie');
});
test('Liang has a grace period, grows steadily, and looking away no longer ends the broadcast',()=>{const g=encounter(),t=g.threat;for(let i=0;i<29;i++)g.tick(.1,{yaw:0});assert.equal(t.pressure,0);for(let i=0;i<100;i++)g.tick(.1,{yaw:0,pitch:-1.15});assert(g.threat);assert(t.pressure>.3);assert.equal(g.mode,'playing');while(g.mode==='playing')g.tick(.1,{yaw:0});assert.equal(g.lastCatch,'liang');});
test('every TV has one nearby and one farther remote on reachable clear ground, with enough return time',()=>{for(const floor of [1,2,3,5])for(const seed of [1,17,91]){const g=encounter(floor,seed),t=g.threat,[a,b]=t.remotes;assert.equal(t.remotes.length,2);assert(Math.hypot(a.x-t.x,a.z-t.z)<=2.2);const entry=g.nav.path(g.player,a,g.doors),trip=g.nav.path(a,b,g.doors);assert(trip.distance>=7&&trip.distance<=18);assert(t.duration>=(entry.distance+trip.distance*2)/2.4+10);for(const r of t.remotes){assert(floorPassable(g.floor,r,.45,g.state.doors.flatMap(d=>[0,.5,1].map(amount=>doorBlock({...d,amount})))));assert(g.line(r,r));}const again=encounter(floor,seed);assert.deepEqual(again.threat.remotes,t.remotes);}});
test('two distinct pickups then a TV interaction complete the task; remotes cannot be collected remotely or twice',()=>{const g=encounter(),t=g.threat;assert.equal(g.interact(t.tvId),false);assert.equal(g.interact(t.remotes[1].id),false);pick(g,t.remotes[0]);assert.equal(g.interact(t.remotes[0].id),false);assert.equal(g.interact(t.tvId),false);pick(g,t.remotes[1]);assert(g.threat);assert.equal(g.interact(t.tvId),false);g.player.x=t.remotes[0].x;g.player.z=t.remotes[0].z;assert(g.interact(t.tvId));assert.equal(g.threat,null);assert.equal(g.resolved,1);assert.equal(g.state.interactions[t.tvId],false);});
test('floor transition and retry remove all remote task state and turn off the old broadcast',()=>{const g=encounter(),t=g.threat;pick(g,t.remotes[0]);g.enterFloor(2);assert.equal(g.threat,null);assert.equal(g.states[3].interactions[t.tvId],false);g.retry();assert.equal(g.threat,null);});
test('checkpoint remains pending until both remotes are collected and the TV is switched off',()=>{const g=encounter(),t=g.threat;g.enterFloor(3);assert.equal(g.pendingCheckpoint,3);for(const r of t.remotes)pick(g,r);assert.equal(g.checkpoint.floor,5);g.player.x=t.remotes[0].x;g.player.z=t.remotes[0].z;g.interact(t.tvId);assert.equal(g.checkpoint.floor,3);assert.equal(g.pendingCheckpoint,null);});
test('expanded scenery range retains nearby floors twice as far from the staircase',()=>{const g=new Game(building,1);g.player={floor:4,x:19,z:24,y:9.72};assert.deepEqual(g.renderFloors().sort(),[4,5]);g.player.x=21;assert.deepEqual(g.renderFloors(),[4]);});
test('Wang portraits have explicit assets and are distributed across all floors',()=>{for(const f of building.floors){const portraits=f.interactions.filter(i=>i.asset==='wangjingwei');assert(portraits.length>=2);assert(portraits.every(i=>i.type==='portrait'));}});
test('real walking, remote pickups and returning to the TV beat the deadline on each supported floor',()=>{for(const floor of [1,2,3,5]){const g=encounter(floor),t=g.threat,[a,b]=t.remotes;for(const destination of [a,b,a]){const path=g.nav.path(g.player,destination,g.doors);assert(path.length);for(const p of path){let steps=0;while(Math.hypot(p.x-g.player.x,p.z-g.player.z)>.13&&++steps<50&&g.mode==='playing')g.tick(.025,{forward:1,yaw:Math.atan2(g.player.x-p.x,g.player.z-p.z)});assert(steps<50,JSON.stringify({floor,p,player:g.player}));}if(!destination.collected)assert(g.interact(destination.id));}assert(g.interact(t.tvId));assert.equal(g.mode,'playing');assert.equal(g.threat,null);}});
