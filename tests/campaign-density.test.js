import test from 'node:test';
import assert from 'node:assert/strict';
import {CampaignGame} from '../src/campaign.js';
import {createCampaignBuilding} from '../src/campaign-layout.js';
import {doorBlock} from '../src/building.js';

// Debug prevents a catch from truncating the route; every actor still has to
// spawn and resolve through the game.
function replaySearchRoute(game, floorId) {
 game.jumpFloor(floorId);
 game.debugMode = true;
 const floor = game.floor;
 for (const door of game.state.doors.filter(d => d.routeDoor)) {
  door.open = true;
  door.amount = 1;
  door.block = doorBlock(door);
 }
 function routeIndex(site) {
  let nearest = Infinity, index = 0;
  floor.mainRoute.forEach(([x, z], i) => {
   const d = Math.hypot(x - site.approach.x, z - site.approach.z);
   if (d < nearest) { nearest = d; index = i; }
  });
  return index;
 }
 const sites = floor.interactions.filter(i => i.form).sort((a, b) => routeIndex(a) - routeIndex(b));
 for (const site of [...sites, floor.keypad]) {
  const path = game.nav.path(game.player, {...site.approach, floor: floorId}, game.doors);
  assert(path.length && path.every(node => node.floor === floorId), site.id);
  for (const point of [...path, site.approach]) {
   const {x, z} = game.player;
   const dx = point.x - x, dz = point.z - z;
   const steps = Math.ceil(Math.hypot(dx, dz) / .24);
   for (let k = 1; k <= steps; k++) {
    Object.assign(game.player, {x: x + dx * k / steps, z: z + dz * k / steps});
    game.tick(.1, {yaw: Math.atan2(-dx, -dz), pitch: -.12});
   }
  }
  if (site === floor.keypad) break;
  for (let n = 0; n < 25; n++) {
   if (n === 4 || n === 15) game.interact(site.id);
   game.tick(.1, {yaw: site.approach.yaw});
  }
  assert(game.state.searched[site.id], site.id);
 }
 return {residentStarts: game.state.events - (game.state.sweep?.visit ?? 0), elapsed: game.time};
}

test('resident encounters maintain pressure across complete search routes with or without sweeps', t => {
 const building = createCampaignBuilding();
 const floors = [7, 6, 4, 2];
 let starts = 0, residentSeconds = 0, seconds = 0, nav;
 for (const seed of [17, 779]) {
  for (const floor of floors) {
   const game = new CampaignGame(building, seed, nav);
   nav = game.nav;
   const sample = replaySearchRoute(game, floor);
   seconds += sample.elapsed;
   const kind = game.deck[floor].monster;
   if (kind === 'patrol') {
    assert.equal(sample.residentStarts, 0);
    continue;
   }
   // Naiwa stays active after its initial arrival, while a visit or check can repeat.
   const minimum = kind === 'naiwa' ? 1 : 2;
   assert(sample.residentStarts >= minimum, `${floor}F seed ${seed}: ${sample.residentStarts} ${kind} starts`);
   starts += sample.residentStarts;
   residentSeconds += sample.elapsed;
  }
 }
 assert(Math.abs(seconds - 984) < .1, 'route length or search dwell changed; remeasure pacing');
 assert(starts * 60 / residentSeconds >= 1.45, `${starts} resident starts, ${residentSeconds}s`);
 t.diagnostic(`${starts} resident encounters across ${residentSeconds.toFixed(0)} simulated seconds on floors with a resident`);
});
