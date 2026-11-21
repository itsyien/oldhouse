import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Game} from '../src/simulation.js';
import {prepareBuilding,doorBlock,RISE} from '../src/building.js';
const building=prepareBuilding(JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/floors.json',import.meta.url))));
function game(floor=3,seed=8){const g=new Game(building,seed);g.player={floor,x:18,z:4,y:(floor-1)*RISE};g.cooldown=1e6;return g;}
function encounter(){const g=game();assert(g.beginEncounter('yujie',{floor:3,x:27,z:3.5}));return g;}
const look={yaw:-Math.PI/2,pitch:0,aspect:16/9,verticalFov:72*Math.PI/180};
test('Yujie warns before harming, stays fixed and prolonged sight causes her own catch',()=>{const g=encounter(),t=g.threat;for(let i=0;i<29;i++)g.tick(.1,look);assert.equal(g.sanity,100);assert.equal(t.phase,'warning');for(let i=0;i<60&&g.mode==='playing';i++)g.tick(.1,look);assert.equal(g.mode,'lost');assert.equal(g.lastCatch,'yujie');assert.equal(g.sanity,0);assert.deepEqual([t.x,t.z],[27,3.5]);});
test('looking down or away stops damage immediately; eyes off recover sanity after a delay',()=>{for(const input of [{...look,pitch:-1.15},{...look,yaw:Math.PI/2}]){const g=encounter();g.threat.age=3;for(let i=0;i<10;i++)g.tick(.1,look);const damaged=g.sanity;assert(damaged<100);g.tick(.1,input);assert.equal(g.sanity,damaged);for(let i=0;i<35;i++)g.tick(.1,input);assert(g.sanity>damaged);assert.equal(g.mode,'playing');}});
test('solid walls and another floor protect sanity; no chase begins when leaving',()=>{const g=encounter(),t=g.threat;t.age=3;g.player={floor:3,x:18,z:8,y:2*RISE};assert(!g.line(t,g.player));g.tick(.1,look);assert.equal(g.sanity,100);g.enterFloor(2);g.player.y=RISE;for(let i=0;i<260&&g.threat;i++)g.tick(.1,look);assert.equal(g.mode,'playing');assert.equal(g.threat,null);assert.deepEqual([t.x,t.z,t.floor],[27,3.5,3]);});
test('seeded random appearances start at floor three and do not overlap other threats',()=>{const spots=[];for(const seed of [8,9,10]){const g=game(3,seed);assert(g.beginEncounter('yujie'));spots.push([g.threat.x,g.threat.z]);const same=game(3,seed);assert(same.beginEncounter('yujie'));assert.deepEqual([same.threat.x,same.threat.z],spots.at(-1));assert(!g.beginEncounter('patrol'));}assert(new Set(spots.map(JSON.stringify)).size>1);for(const floor of [4,5])assert.equal(game(floor).beginEncounter('yujie'),false);for(const floor of [1,3]){const g=game(floor);g.state.gunmuDefeated=true;g.cooldown=0;g.state.flashlight=true;g.state.liangCleared=true;g.state.yujieWait=0;g.state.patrolWait=99;g.director(.4);assert.equal(g.threat?.kind,'yujie');}});
test('sanity follows checkpoint restoration and the two images have separate runtime uses',()=>{const g=game();g.sanity=62;g.saveCheckpoint(3);g.sanity=10;g.retry();assert.equal(g.sanity,62);const m=JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/runtime-manifest.json',import.meta.url)));assert(m.textures.yujie.url.endsWith('dongbeiyubigfeet.png'));assert(m.textures[m.scares.yujie.asset].url.endsWith('dongbeiyubaifang-shadow.png'));});
test('crossing the open exit wins even on a lethal frame; closed exits still block escape',()=>{for(const open of [false,true]){const g=game(1);g.player={floor:1,x:6.5,z:30.35,y:0};g.beginEncounter('naiwa',{floor:1,x:6.5,z:30.4});g.threat.age=3;const d=g.state.doors.find(d=>d.kind==='exit');d.open=open;d.amount=+open;d.block=doorBlock(d);g.tick(.1);assert.equal(g.mode,open?'won':'lost');}});

test('moving onto the planned appearance point cancels that visit instead of materializing inside the player',()=>{const g=encounter();g.player.x=27;g.threat.age=2.95;g.tick(.1,look);assert.equal(g.threat,null);assert.equal(g.sanity,100);assert.equal(g.mode,'playing');});

test('visits place three separated clear copies, with repeatable but changing positions',()=>{
 for(const floor of [1,2,3]){const g=game(floor);assert(g.beginEncounter('yujie'));const first=structuredClone(g.threat.copies);assert.equal(first.length,floor===1?1:3);for(const p of first)for(const q of first)if(p!==q)assert(Math.hypot(p.x-q.x,p.z-q.z)>=4);const same=game(floor);same.beginEncounter('yujie');assert.deepEqual(same.threat.copies,first);g.resolveThreat();g.beginEncounter('yujie');assert.equal(g.threat.copies.length,floor===1?1:3);assert.notDeepEqual(g.threat.copies,first);}
});
test('seeing a non-primary copy drains sanity; multiple visible copies do not multiply damage',()=>{
 for(const copies of [[{floor:3,x:11,z:3.5},{floor:3,x:27,z:3.5}],[{floor:3,x:27,z:3.5},{floor:3,x:31,z:3.5}]]){const g=game();g.beginEncounter('yujie',{...copies[0],copies});g.threat.age=3;g.tick(.1,look);assert.equal(g.sanity,95.6);g.tick(.1,{...look,pitch:-1.15});assert.equal(g.sanity,95.6);assert.equal(g.threat.observed,false);g.enterFloor(2);assert.equal(g.threat,null);}
});
test('floor two keeps recurring patrols without Kun or Yujie',()=>{
 const g=game(2);g.player.x=32;g.player.z=16;g.debugMode=true;g.cooldown=0;g.state.events=1;const events=[];let previous=null;
 for(let i=0;i<3600;i++){if(g.threat?.kind==='kun'&&!g.hiding){const w=g.floor.interactions.find(i=>i.type==='wardrobe');Object.assign(g.player,w.entry);assert(g.interact(w.id));}if(g.hiding&&!g.threat){assert(g.interact(g.hiding.id));g.player.x=32;g.player.z=16;}g.tick(.1,{pitch:-1.15});if(g.state.blackout&&!g.threat){for(const s of g.floor.interactions.filter(i=>i.type==='switch').slice(0,2))g.interact(s.id);}if(g.threat!==previous){if(g.threat)events.push({kind:g.threat.kind,time:g.time});previous=g.threat;}}
 assert.equal(events.filter(e=>e.kind==='kun').length,0,JSON.stringify(events));assert(g.state.patrols>=3,JSON.stringify(events));assert.equal(g.state.yujieVisits,0,JSON.stringify(events));for(let i=1;i<events.length;i++)assert(events[i].time-events[i-1].time>9);
});

test('direct sight drains exactly 44 sanity per second; recovery remains six per second after two seconds',()=>{
 const g=encounter();g.threat.age=3;for(let i=0;i<10;i++)g.tick(.1,look);assert(Math.abs(g.sanity-56)<1e-8);g.sanityRest=3;const before=g.sanity;g.tick(.1,{...look,pitch:-1.15});assert(Math.abs(g.sanity-before-.6)<1e-8);
});
