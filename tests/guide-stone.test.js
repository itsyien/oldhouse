import test from 'node:test';
import assert from 'node:assert/strict';
import {CampaignGame} from '../src/campaign.js';
import {createCampaignBuilding} from '../src/campaign-layout.js';
import {floorPassable} from '../src/building.js';
import {scatterFloorPhotos} from '../src/photo-trail.js';

const building=createCampaignBuilding();
function approach(game,id){
 game.jumpFloor(id);
 const stone=game.floor.interactions.find(i=>i.type==='guide-stone');
 Object.assign(game.player,stone.approach);
 assert.equal(game.interactionReach(stone),null);
 return stone;
}
test('the depot recording draws Liang from his patrol and is spent even after retry',()=>{
 const game=new CampaignGame(building,23),stone=approach(game,5);
 assert(game.interact(stone.id));
 Object.assign(game.player,game.floor.spawn);
 assert(game.beginEncounter('liang'));
 game.tick(.1);assert.equal(game.threat.noiseMechanism,'stone');
 for(let i=0;i<220&&game.state.stonePlayback;i++)game.tick(.1);
 assert(!game.state.stonePlayback);assert(Math.hypot(game.threat.x-stone.approach.x,game.threat.z-stone.approach.z)<.65);
 game.retry();Object.assign(game.player,stone.approach);assert(!game.interact(stone.id));
});
test('other stones replay after a full track or a monster entrance and stay silent on floor changes',()=>{
 const game=new CampaignGame(building,14),tutorial=approach(game,8);
 assert(game.interact(tutorial.id));game.time+=68;game.tick(.1);
 assert(!game.state.stonePlayback);assert(game.interact(tutorial.id));
 const stone=approach(game,6);assert(!game.states[8].stonePlayback);
 assert(game.interact(stone.id));assert(game.beginEncounter('inspector',{floor:6,x:18,z:8}));
 assert(!game.state.stonePlayback);assert(game.interact(stone.id));
});
test('stop cuts the current recording; only the depot spends its use',()=>{
 const game=new CampaignGame(building,14);
 for(const id of [8,6,5]){
  const stone=approach(game,id);
  assert(game.interact(stone.id));assert(game.interact(stone.id));
  assert.equal(game.state.stonePlayback,null);
  assert.equal(game.interact(stone.id),id!==5);
 }
});
test('scattered prints stay on usable floor and keep their positions across rebuilds',()=>{
 for(const f of building.floors){
  const photos=scatterFloorPhotos(f,97);
  assert.equal(photos.length,16);assert.deepEqual(photos,scatterFloorPhotos(f,97));
  assert.notDeepEqual(photos,scatterFloorPhotos(f,49));
  for(const p of photos){assert(floorPassable(f,p,.33));assert(p.y>0&&p.y<.025);}
 }
});
