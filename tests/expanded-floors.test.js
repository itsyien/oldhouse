import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareBuilding,floorPassable} from '../src/building.js';
import {Navigator} from '../src/navigation.js';
import {Game} from '../src/simulation.js';
const building=prepareBuilding(JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/floors.json',import.meta.url))));
const nav=new Navigator(building);
test('new wings lengthen actual traversal while untouched floors keep their geometry',()=>{
 for(const [floor,min,max] of [[4,108,120],[3,95,105],[5,74,75],[2,66,67],[1,75,76]]){
  const f=building.byId[floor],path=nav.path({floor,...f.spawn},{floor,...f.destination},[],true);
  assert(path.distance>=min&&path.distance<=max,`${floor}: ${path.distance}`);
  if(floor===3||floor===4){assert(f.bounds.maxX>34);assert(path.some(p=>p.x>34));}
 }
});
test('fourth-floor refuge nodes require traversal and retain clear connected exits',()=>{
 const f=building.byId[4],closets=f.interactions.filter(i=>i.type==='wardrobe');
 assert(closets.length>=3&&closets.length<=4);
 const route=nav.path({floor:4,...f.spawn},{floor:4,...f.destination},[],true);let furthest=0;
 for(const c of closets){assert(floorPassable(f,c.entry,.27));assert(nav.path({floor:4,...c.entry},{floor:4,...f.destination}).length);}
 for(let i=0;i<route.length;i+=6){const distance=Math.min(...closets.map(c=>nav.distance(route[i],{floor:4,...c.entry})));assert(distance<36,'even the arrival is less than ten seconds from refuge');furthest=Math.max(furthest,distance);}
 assert(furthest>14,'some route positions require movement beyond the 2.8 s warning');
});
test('furnished wing room has two independent exits and the photograph route passes through it',()=>{
 for(const floor of [3,4]){const f=building.byId[floor],x=floor===4?39:36,east=f.bounds.maxX-2;
  const room={floor,x:east-4,z:24.5},inner={floor,x:east-5,z:28},outer={floor,x:east,z:28};
  assert(nav.path(room,inner).length);assert(nav.path(room,outer).length);
  const blocked=[{id:'sealed-one-exit',floor,block:{minX:east-6.1,maxX:east-3.9,minZ:26.8,maxZ:27.4}}];assert(nav.path(room,outer,blocked).length,'closing one passage leaves the outside route');
  const other=[{id:'sealed-other-exit',floor,block:{minX:east-1.1,maxX:east+2,minZ:26.8,maxZ:27.4}}];assert(nav.path(room,inner,other).length,'closing outside passage leaves the inside route');
  assert(f.mainRoute.some(([px,pz])=>px>34&&pz===24.5),'trail enters the furnished room');
  assert(f.furniture.some(o=>o.name.includes('推车')&&o.x>34));
  assert(!floorPassable(f,{x,z:4.2},.27),'partial corridor wall interrupts a straight sprint');
 }
});
test('third-floor television remains accessible from early photo trail with both remote deadlines reachable',()=>{
 for(const seed of [1,4,9,17]){const g=new Game(building,seed);g.player={floor:3,x:25.5,z:4,y:6.48};assert(g.beginEncounter('liang'),'TV must start before reaching the far wing');const t=g.threat;
  assert(t.duration<=45);assert(g.nav.path(t.remotes[0],t.remotes[1],g.doors).distance<=18);
 }
});
