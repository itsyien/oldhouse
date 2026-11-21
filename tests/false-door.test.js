import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignBuilding} from '../src/campaign-layout.js';
import {CampaignGame} from '../src/campaign.js';
import {floorPassable} from '../src/building.js';
import {FALSE_DOOR_IMPACT} from '../src/false-door.js';

const building=createCampaignBuilding();
test('two seeded false doors spare the campaign routes and other candidate recesses are sealed',()=>{
 for(const seed of [0,1,2,3]){
  const game=new CampaignGame(building,seed);
  const doors=[7,6,4,2].map(floor=>game.states[floor].doors.find(door=>door.falseDoor));
  assert.equal(doors.filter(door=>!door.vanished).length,2);
  for(const door of doors){
   const floor=building.byId[door.floor];
   assert(floorPassable(floor,{x:door.x,z:door.z-door.inward*1.05},.24));
   assert(!floorPassable(floor,{x:door.x,z:door.z},.24,[door.block]));
  }
 }
});

test('opening is safe but entering subtracts 50, interrupts movement, seals on blackout and never triggers twice',()=>{
 const game=new CampaignGame(building,0);
 game.jumpFloor(7);
 game.cooldown=300;
 const door=game.state.doors.find(door=>door.falseDoor);
 const inward={forward:1,yaw:door.inward===-1?0:Math.PI};
 Object.assign(game.player,{x:door.x,z:door.z-door.inward*1.26});
 assert(game.interact(door.id));
 for(let i=0;i<15;i++)game.tick(.1);
 assert(door.amount>.95);
 assert.equal(game.sanity,100);
 assert.equal(game.falseDoorAttack,null);
 for(let i=0;i<20&&!game.falseDoorAttack;i++)game.tick(.05,inward);
 assert.equal(game.falseDoorAttack?.doorId,door.id);
 assert.equal(game.sanity,50);
 const inside=game.player.z;
 game.tick(.1,inward);
 assert.equal(game.player.z,inside);
 assert.equal(door.vanished,undefined);
 while(game.falseDoorAttack.age<FALSE_DOOR_IMPACT)game.tick(.045,inward);
 assert(door.vanished);
 assert.equal(game.player.z,door.z-door.inward*1.05);
 assert(!game.interact(door.id));
 while(game.falseDoorAttack)game.tick(.1,inward);
 assert.equal(game.mode,'playing');
 assert.equal(game.sanity,50);
 for(let i=0;i<20;i++)game.tick(.05,inward);
 assert.equal(game.falseDoorAttack,null);
 assert(!floorPassable(game.floor,{x:door.x,z:door.z},.24,[door.block]));
 game.retry();
 assert(game.state.doors.find(d=>d.id===door.id).vanished);
});

test('a false-door lunge can leave sanity at zero without triggering a defeat screen',()=>{
 const game=new CampaignGame(building,0);
 game.jumpFloor(4);
 game.cooldown=150;
 const door=game.state.doors.find(door=>door.falseDoor);
 Object.assign(game.player,{x:door.x,z:door.z-1.26});
 game.sanity=23;
 assert(game.interact(door.id));
 for(let i=0;i<15;i++)game.tick(.1);
 for(let i=0;i<20&&!game.falseDoorAttack;i++)game.tick(.05,{forward:1,yaw:Math.PI});
 assert(game.falseDoorAttack);
 while(game.falseDoorAttack)game.tick(.1);
 assert.equal(game.sanity,0);
 assert.equal(game.mode,'playing');
 assert(!game.debugPendingScare);
});
