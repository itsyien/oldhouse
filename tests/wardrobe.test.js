import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareBuilding,floorPassable,doorBlock} from '../src/building.js';
import {Game} from '../src/simulation.js';
const building=prepareBuilding(JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/floors.json',import.meta.url))));
function fixture(){const g=new Game(building,4);g.enterFloor(4);g.cooldown=1000;const w=g.floor.interactions.find(i=>i.type==='wardrobe');g.player={floor:4,...w.entry,y:g.floor.base};return{g,w};}
test('slim wardrobes only appear on Kun/warden floors, with clear exits outside every door swing',()=>{
 const g=new Game(building,1);
 for(const f of building.floors){const ws=f.interactions.filter(i=>i.type==='wardrobe');assert.equal(ws.length,f.id===4?4:[1,2].includes(f.id)?5:0);assert.equal(f.obstacles.filter(o=>o.wardrobe).length,ws.length);for(const o of f.obstacles.filter(o=>o.wardrobe))assert(Math.abs(Math.min(o.maxX-o.minX,o.maxZ-o.minZ)-.6)<1e-6);
  for(const w of ws){const p={floor:f.id,...w.entry};for(const amount of [0,.5,1])assert(floorPassable(f,p,.3,f.doorSpecs.map(d=>doorBlock({...d,amount}))),w.id);assert(g.nav.path({floor:f.id,...f.spawn},p,g.doors).length,w.id);assert(!floorPassable(f,w.target,.24));}
 }
});
test('E enters only from a reachable front, stops movement and exits to clear floor space',()=>{
 const {g,w}=fixture();g.player.z=w.z-1.15;assert.equal(g.interact(w.id),false);g.player={floor:4,x:w.x+8,z:w.entry.z,y:g.floor.base};assert.equal(g.interact(w.id),false);
 Object.assign(g.player,w.entry);assert(g.interact(w.id));assert.equal(g.hiding.id,w.id);assert.equal(g.player.x,w.x);const p={...g.player};g.tick(.1,{forward:1,sprint:true});assert.deepEqual(g.player,p);
 assert.equal(g.interact(g.floor.interactions.find(i=>i.type==='switch').id),false);assert(g.interact(w.id));assert.equal(g.hiding,null);assert(floorPassable(g.floor,g.player,.24,g.state.doors.map(d=>d.block)));
});
test('Kun searches outside an occupied wardrobe, then retreats; leaving early resumes danger',()=>{
 const {g,w}=fixture();g.beginEncounter('kun',{floor:4,x:20,z:4});g.threat.age=3;assert(g.interact(w.id));
 for(let i=0;i<40;i++)g.tick(.1);assert.equal(g.mode,'playing');assert.equal(g.threat.phase,'wardrobe-search');assert.equal(g.resolved,0);
 for(let i=0;i<50;i++)g.tick(.1);assert.equal(g.threat,null);assert.equal(g.resolved,1);assert.equal(g.hiding.id,w.id);assert(g.interact(w.id));
 g.beginEncounter('kun',{floor:4,x:20,z:4});g.threat.age=3;assert(g.interact(w.id));for(let i=0;i<8;i++)g.tick(.1);assert(g.interact(w.id));for(let i=0;i<80&&g.mode==='playing';i++)g.tick(.1);assert.equal(g.mode,'lost');
});
test('wardrobe waiting does not spawn new encounters, and floor/retry changes clear hiding',()=>{
 const {g,w}=fixture();assert(g.interact(w.id));g.cooldown=0;g.state.events=0;g.state.progress=.8;for(let i=0;i<150;i++)g.tick(.1);assert.equal(g.threat,null);assert.equal(g.mode,'playing');g.enterFloor(3);assert.equal(g.hiding,null);
 const f=fixture();f.g.interact(f.w.id);f.g.retry();assert.equal(f.g.hiding,null);
});
