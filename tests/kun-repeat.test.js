import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareBuilding} from '../src/building.js';
import {Game} from '../src/simulation.js';
const building=prepareBuilding(JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/floors.json',import.meta.url))));
function game(floor=4){const g=new Game(building,8);g.enterFloor(floor);g.player={floor,x:18,z:4,y:g.floor.base};g.cooldown=0;g.state.flashlight=true;g.state.events=2;g.state.patrolWait=1e6;g.state.yujieWait=1e6;return g;}
function wait(g,seconds){for(let n=0;n<Math.round(seconds*10);n++)g.director(.1);}

test('Kun returns after thirty seconds on floors 4 and 1, repeatedly',()=>{
 for(const floor of [4,1]){const g=game(floor);for(let visit=0;visit<3;visit++){wait(g,29.5);assert.equal(g.threat,null);wait(g,.9);assert.equal(g.threat?.kind,'kun');assert(g.nav.path(g.threat,g.player,g.doors).length);g.resolveThreat();assert.equal(g.state.kunWait,30);}}
});
test('due Kun waits for active encounters and recovery cooldown; Wang keeps arrival priority',()=>{
 const g=game(1);g.beginEncounter('inspector',{floor:1,x:18,z:4});wait(g,31);assert.equal(g.threat.kind,'inspector');assert.equal(g.state.kunWait,0);g.resolveThreat();wait(g,g.cooldown-.2);assert.equal(g.threat,null);wait(g,.7);assert.equal(g.threat?.kind,'kun');
 const h=game(2);h.state.kunWait=0;h.state.patrolWait=0;h.director(.4);assert.equal(h.threat?.kind,'patrol');
});
test('stairs and wardrobes suspend the return clock; other floors never schedule Kun',()=>{
 for(const flag of ['travel','hiding']){const g=game();g[flag]={};wait(g,40);assert.equal(g.threat,null);assert.equal(g.state.kunWait,30);}
 for(const floor of [5,3,2]){const g=game(floor);g.state.kunWait=0;wait(g,40);assert.equal(g.threat,null);}
 const g=game();g.state.kunWait=0;g.enterFloor(2);assert.equal(g.state.kunWait,30);g.saveCheckpoint(2);g.state.kunWait=1;g.retry();assert.equal(g.state.kunWait,30);
});
test('a recurring Kun still travels physically, gives warning and can be escaped in a wardrobe',()=>{
 const g=game();g.state.kunWait=0;g.director(.4);const t=g.threat,p={x:t.x,z:t.z};g.updateThreat(.1,{},0);assert.equal(t.x,p.x);assert.equal(t.z,p.z);t.age=t.warning;g.updateThreat(.1,{},0);assert(Math.hypot(t.x-p.x,t.z-p.z)<=.426);assert.equal(g.mode,'playing');
 const w=g.floor.interactions.find(i=>i.type==='wardrobe');Object.assign(g.player,w.entry);assert(g.interact(w.id));for(let n=0;n<100&&g.threat;n++)g.updateThreat(.1,{},0);assert.equal(g.threat,null);assert.equal(g.mode,'playing');assert.equal(g.state.kunWait,30);
});
test('a clear approach ahead is usable when there is no room behind the player',()=>{
 const g=game(4);g.player.x=28;g.state.kunWait=0;g.director(.4);assert.equal(g.threat?.kind,'kun');const d=Math.hypot(g.threat.x-g.player.x,g.threat.z-g.player.z);assert(d>=9&&d<=16);assert(g.line(g.player,g.threat));assert(g.nav.path(g.threat,g.player,g.doors).length);assert.equal(g.threat.age,0);
 reachWardrobe(g,g.floor.interactions.find(i=>i.id==='f4-wardrobe-1'));
});

function sprintTo(g,target){
 const path=g.nav.path(g.player,{floor:g.player.floor,...target},g.doors);assert(path.length);
 for(const p of path)for(let n=0;n<200;n++){
  const dx=p.x-g.player.x,dz=p.z-g.player.z,d=Math.hypot(dx,dz);if(d<.05)break;
  g.tick(Math.min(.05,d/3.65),{yaw:Math.atan2(-dx,-dz),forward:1,sprint:true});assert.equal(g.mode,'playing');if(n===199)assert.fail('blocked escape route');
 }
}
function reachWardrobe(g,w){sprintTo(g,w.entry);assert(g.interact(w.id));for(let i=0;i<240&&g.threat;i++)g.tick(.05);assert.equal(g.mode,'playing');assert.equal(g.threat,null);}

test('Kun cannot appear ahead in the southern entrance corridor when every refuge lies beyond it',()=>{
 const g=game(4);g.player.x=15;g.player.z=27.5;g.state.kunWait=0;g.director(.4);assert.equal(g.threat,null);
 sprintTo(g,{x:20,z:27.5});for(let i=0;i<80&&!g.threat;i++)g.tick(.05);assert.equal(g.threat?.kind,'kun');
 assert(g.threat.x<g.player.x,'waiting for a legal trailing spawn keeps the route open');
 reachWardrobe(g,g.floor.interactions.find(i=>i.id==='f4-wardrobe-3'));
});
