import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Game} from '../src/simulation.js';
import {prepareBuilding,doorBlock,RISE,stairWalls,worldStair,stairPassable,stairGuard} from '../src/building.js';
import {blocked,clearSight,doorBounds} from '../src/logic.js';
const building=prepareBuilding(JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/floors.json',import.meta.url))));
const game=()=>{const g=new Game(building,8);g.cooldown=1e6;return g;};
test('stair guard closes the upper drop without blocking the lower return flight',()=>{
 for(const core of ['A','B']){const p=worldStair(3.125,5.1,core);assert.equal(stairPassable(p,{from:5,core,phase:'upper'}),false);assert.equal(stairPassable(p,{from:5,core,phase:'lower'}),true);const guard=stairGuard(5,core);assert(guard.minY>3*RISE+1.65);}
});
test('looking freezes the frog but does not protect a player who walks into it',()=>{
 const g=game();g.player={floor:5,x:15,z:4,y:4*RISE};g.beginEncounter('naiwa',{floor:5,x:15.6,z:4});g.threat.age=3;
 g.tick(.05,{yaw:-Math.PI/2});assert.equal(g.threat.observed,true);assert.equal(g.mode,'lost');
});
test('a frog approaching an unobservant player catches them after its warning',()=>{
 const g=game();g.player={floor:5,x:15,z:4,y:4*RISE};g.beginEncounter('naiwa',{floor:5,x:18,z:4});
 for(let i=0;i<25;i++)g.tick(.1,{yaw:Math.PI/2});assert.equal(g.mode,'playing');
 for(let i=0;i<60&&g.mode==='playing';i++)g.tick(.1,{yaw:Math.PI/2});assert.equal(g.mode,'lost');
});
test('diagonal door leaves do not fill the empty corners of their bounding box',()=>{
 const d=doorBounds(0,0,0,.5);
 assert.equal(blocked(-.9,-1.25,[d],.24),false);
 assert.equal(clearSight({x:-1.1,z:-1.25},{x:-.7,z:-1.25},[d]),true);
 assert.equal(blocked(-.3,-.65,[d],.24),true);
 assert.equal(clearSight({x:-.3,z:-1.2},{x:-.3,z:0},[d]),false);
});
test('a fire door closes beside a player who has cleared its actual swing',()=>{
 const g=game();g.player={floor:5,x:32,z:12.6,y:4*RISE};const d=g.state.doors.find(d=>d.id==='5-east-12');
 assert.equal(g.interact(d.id),true);for(let i=0;i<60;i++)g.updateDoors(.05);
 assert(d.amount<.01);assert.equal(d.open,false);assert(!blocked(g.player.x,g.player.z,[d.block],.24));
});
test('a fire door pauses on a body, then finishes closing when the player steps away',()=>{
 const g=game();g.player={floor:5,x:32,z:11.45,y:4*RISE};const d=g.state.doors.find(d=>d.id==='5-east-12');
 assert.equal(g.interact(d.id),true);for(let i=0;i<40;i++)g.updateDoors(.05);
 assert(d.amount>.01);assert(!blocked(g.player.x,g.player.z,[d.block],.24));
 g.player.z=12.7;for(let i=0;i<60;i++)g.updateDoors(.05);assert(d.amount<.01);
});
test('stair travellers remain vulnerable at the entrance without being caught through a floor',()=>{
 const g=game();g.player={floor:5,x:7.8,z:24,y:4*RISE};g.travel={from:5,core:'B',phase:'upper'};
 g.beginEncounter('naiwa',{floor:5,x:8.4,z:24,y:4*RISE});g.threat.age=3;g.tick(.05,{yaw:-Math.PI/2});assert.equal(g.mode,'lost');
 const h=game();h.player={floor:4,x:12,z:24,y:3*RISE};h.beginEncounter('naiwa',{floor:5,x:12,z:24,y:4*RISE});h.threat.age=3;h.tick(.05,{yaw:0});assert.equal(h.mode,'playing');assert.equal(h.line(h.threat,h.player),false);
});
test('the stair floor label changing does not erase sight across the shared landing',()=>{
 const g=game();g.player={floor:4,x:4.6,z:27.9,y:4*RISE-1.62};g.travel={from:5,core:'B',phase:'lower'};
 const t={floor:5,x:4.1,z:27.9,y:4*RISE-1.62};assert.equal(g.line(g.player,t),true);assert.equal(g.viewed(t,{yaw:Math.PI/2}),true);
 const behind={floor:5,x:3.6,z:26.5,y:4*RISE-.9};g.player={floor:4,x:5.1,z:26.5,y:4*RISE-2.3};assert.equal(g.line(g.player,behind),false,'central stair wall remains opaque');
});
test('both connected floors remain rendered throughout descent and when looking back at the entrance',()=>{
 const g=game();g.player={floor:5,x:8.8,z:24,y:4*RISE};assert.deepEqual(g.renderFloors().sort(),[4,5]);
 g.travel={from:5,core:'B',phase:'lower'};g.player.floor=4;assert.deepEqual(g.renderFloors().sort(),[4,5]);
 g.travel=null;g.player.x=11;assert.deepEqual(g.renderFloors().sort(),[4,5]);g.player.x=22;assert.deepEqual(g.renderFloors(),[4]);
});
test('stair wall meshes leave the same landing and flight openings as player movement',()=>{
 for(const core of ['A','B'])for(const phase of ['upper','lower']){const walls=stairWalls(5,core),travel={from:5,core,phase};
  for(let x=1.3;x<6.2;x+=.1)assert(stairPassable(worldStair(x,5.7,core),travel),'full landing must stay open');
  for(let x=1;x<6.6;x+=.1)for(let z=1.1;z<6.6;z+=.1){const p=worldStair(x,z,core);if(stairPassable(p,travel))assert(!blocked(p.x,p.z,walls,.23),`${core}/${phase} walkway overlaps a solid wall at ${x.toFixed(1)},${z.toFixed(1)}`);}
 }
});
test('the upper stair landing blocks sight between two vertically stacked doorways',()=>{
 const g=game();assert.equal(g.line({floor:5,x:7,z:24,y:4*RISE},{floor:4,x:7,z:24,y:3*RISE}),false);
});
