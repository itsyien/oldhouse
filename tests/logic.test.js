import test from 'node:test';
import assert from 'node:assert/strict';
import { blocked, move, clearSight, doorBounds } from '../src/logic.js';
const wall = { minX:1,maxX:2,minZ:-2,maxZ:2 };
test('player radius blocks wall and diagonal movement slides',()=>{
 assert.equal(blocked(.8,0,[wall]),true);
 assert.equal(blocked(.6,0,[wall]),false);
 const p=move({x:0,z:0},5,1,[wall]); assert.ok(p.x<.8); assert.ok(p.z>.9);
});
test('large frame steps cannot tunnel through thin closed doors',()=>{
 const p=move({x:0,z:0},0,-10,[{minX:-2,maxX:2,minZ:-2.1,maxZ:-2}]);
 assert.ok(p.z>-1.8);
});
test('walls block line of sight including diagonal and parallel segments',()=>{
 assert.equal(clearSight({x:0,z:0},{x:3,z:0},[wall]),false);
 assert.equal(clearSight({x:0,z:3},{x:3,z:3},[wall]),true);
 assert.equal(clearSight({x:0,z:0},{x:0,z:3},[wall]),true);
});
test('a sight line respects the swung leaf, vertical gaps and near-endpoint tolerance',()=>{
 const leaf={...doorBounds(0,0,0,.5),minY:0,maxY:2.6};
 assert(clearSight({x:leaf.minX,z:leaf.minZ,y:1},{x:leaf.minX+.02,z:leaf.minZ+.02,y:1},[leaf]));
 assert(!clearSight({x:leaf.cx-1,z:leaf.cz,y:1},{x:leaf.cx+1,z:leaf.cz,y:1},[leaf]));
 assert(clearSight({x:leaf.cx-1,z:leaf.cz,y:3},{x:leaf.cx+1,z:leaf.cz,y:3},[leaf]));
 assert(clearSight({x:0,z:0},{x:1.0001,z:0},[wall]));
 assert(!clearSight({x:0,z:0},{x:1.01,z:0},[wall]));
});
test('open door panels remain solid at their displayed position',()=>{
 const door=doorBounds(0,0,0,1);
 assert.equal(blocked(-.95,-.95,[door]),true);
 assert.equal(blocked(0,0,[door]),false);
 const side=doorBounds(-2.1,9,Math.PI/2,1);
 assert.equal(blocked(-3.05,9.95,[side]),true);
 assert.equal(blocked(-1.26,8.18,[side]),false);
 const right=doorBounds(2.1,13,-Math.PI/2,1);
 assert.equal(blocked(3.05,12.05,[right]),true);
});
