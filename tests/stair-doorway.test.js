import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import{prepareBuilding,RISE,doorBlock,localStair,stairPassable}from'../src/building.js';import{Game}from'../src/simulation.js';
const building=prepareBuilding(JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/floors.json',import.meta.url))));
test('the full clear stair doorway supports entering and reversing on both landings at walk and sprint speeds',()=>{
 for(const from of [5,4,3,2])for(const phase of ['upper','lower'])for(const offset of [-.6,0,.6])for(const sprint of [false,true]){
  const g=new Game(building,8),core=building.byId[from].departure,floor=phase==='upper'?from:from-1,z=(core==='A'?8:24)+offset;g.player={floor,x:8.9,z,y:(floor-1)*RISE};
  const dt=sprint?.1:1/60,frames=Math.ceil(2/(sprint?3.65:2.4)/dt);for(let i=0;i<frames;i++)g.movePlayer(dt,{forward:1,yaw:Math.PI/2,sprint});
  assert(g.player.x<7.4,JSON.stringify({from,phase,offset,sprint,p:g.player,travel:g.travel}));assert(g.travel);assert(stairPassable(g.player,g.travel));assert.equal(g.player.y,(floor-1)*RISE);
  for(let i=0;i<frames;i++)g.movePlayer(dt,{forward:1,yaw:-Math.PI/2,sprint});assert(g.player.x>8.7,'must be able to reverse through the same doorway');assert.equal(g.travel,null);
 }
});
test('brushing outside the doorway never strands the player in an invalid stair mode',()=>{
 for(const from of [5,4])for(const offset of [-1.05,1.05]){const g=new Game(building,8),core=g.building.byId[from].departure,z=(core==='A'?8:24)+offset;g.player={floor:from,x:8.9,z,y:(from-1)*RISE};for(let i=0;i<12;i++)g.movePlayer(.1,{forward:1,yaw:Math.PI/2,sprint:true});assert(!g.travel||stairPassable(g.player,g.travel));for(let i=0;i<12;i++)g.movePlayer(.1,{forward:1,yaw:-Math.PI/2,sprint:true});assert(g.player.x>8.8);}
});

test('closed stair doors still block passage after the landing is widened',()=>{for(const from of [5,4]){const g=new Game(building,8),core=building.byId[from].departure,z=core==='A'?8:24;g.player={floor:from,x:8.9,z,y:(from-1)*RISE};const door=g.state.doors.find(d=>d.id===`${from}-${core}`);door.open=false;door.amount=0;door.block=doorBlock(door);for(let i=0;i<25;i++)g.movePlayer(.1,{forward:1,yaw:Math.PI/2,sprint:true});assert(g.player.x>8.45);assert.equal(g.travel,null);}});
