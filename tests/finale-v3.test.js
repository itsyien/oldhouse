import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareBuilding,doorBlock,floorPassable,within} from '../src/building.js';
import {Game} from '../src/simulation.js';
import {sealedShelter} from '../src/patrol.js';
import {tr,setLanguage} from '../src/i18n.js';
const building=prepareBuilding(JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/floors.json',import.meta.url))));
function game(floor=1){const g=new Game(building,8);g.enterFloor(floor);g.player={floor,x:18,z:4,y:g.floor.base};g.cooldown=0;g.state.events=2;g.state.kunWait=1e6;g.state.yujieWait=1e6;g.state.patrolWait=1e6;return g;}
function equipped(){const g=game();g.player.x=31.8;g.player.z=13.8;assert(g.interact('f1-flashlight'));g.player.x=18;g.player.z=4;return g;}
function wait(g,s){for(let n=0;n<Math.round(s*10);n++)g.director(.1);}
function enemy(g){assert(g.beginEncounter('doubao',{floor:1,x:31,z:4}));g.threat.age=3;return g.threat;}
test('Gunmu rises for two stationary seconds but accepts flashlight exposure throughout',()=>{
 const g=equipped(),t=enemy(g);t.age=0;
 for(let i=0;i<19;i++)g.updateThreat(.1,{yaw:-Math.PI/2,pitch:-.08},0);
 assert.equal(t.phase,'rising');assert.equal(t.x,31);assert(t.exposure>1.8);assert.equal(g.mode,'playing');
 g.updateThreat(.11,{yaw:-Math.PI/2},0);assert.equal(t.phase,'pursuing');assert(t.x<31);assert(t.exposure>2);
});
test('Gunmu triggers on entering the south corridor even during the post-patrol cooldown',()=>{
 const g=equipped();g.state.doubaoWait=0;g.cooldown=9;g.player.x=32;g.player.z=20.9;g.director(.1);assert.equal(g.threat,null);g.player.z=21.4;g.director(.1);assert.equal(g.threat?.kind,'doubao');assert.equal(g.threat.warning,2);
});
test('wider beam accepts targets outside the old cone but rejects targets outside the new cone',()=>{
 for(const [angle,hit]of [[.4,true],[.6,false]]){const g=equipped(),t=enemy(g);g.updateThreat(.1,{yaw:-Math.PI/2+angle},0);assert.equal(t.illuminated,hit);assert.equal(t.exposure,hit?.1:0);}
});
test('Gunmu needs exactly five accumulated seconds and announces the requested ending',()=>{
 const g=equipped(),t=enemy(g);for(let n=0;n<49;n++){t.x=31;g.updateThreat(.1,{yaw:-Math.PI/2},0);}assert.equal(t.phase,'pursuing');assert(Math.abs(t.exposure-4.9)<1e-6);g.updateThreat(.1,{yaw:-Math.PI/2},0);assert.equal(t.phase,'leaving');assert.equal(t.exposure,5);for(let n=0;n<11;n++)g.updateThreat(.1,{},0);assert.equal(g.threat,null);assert(g.messages.some(m=>m.text==='棍母终究还是不存在的。'));
});

test('only portrait-marked sealed rooms and occupied marked wardrobes stop Wang',()=>{
 for(const floor of [1,2]){
  const g=game(floor),r=g.floor.shelters[0];g.player.x=r.x+r.w/2;g.player.z=r.z+r.d/2;
  for(const id of r.doors){const d=g.state.doors.find(d=>d.id===id);assert(d.wardPortrait);d.open=false;d.amount=0;d.block=doorBlock(d);}assert(sealedShelter(g));
  g.state.doors.find(d=>d.id===r.doors[0]).wardPortrait=false;assert(!sealedShelter(g));
  for(const marked of [true,false]){const h=game(floor),w=h.floor.interactions.find(i=>i.type==='wardrobe'&&i.wardPortrait===marked);Object.assign(h.player,w.entry);assert(h.beginPatrol());assert(h.interact(w.id));assert.equal(!!sealedShelter(h),marked);h.threat.age=10;h.updateThreat(.1,{},0);assert.equal(h.mode,marked?'playing':'lost');}
 }
});
test('floor two rejects Kun directly and throughout the recurring director',()=>{
 const g=game(2);g.state.kunWait=0;assert.equal(g.beginEncounter('kun',{floor:2,x:30,z:4}),false);wait(g,100);assert.equal(g.threat,null);
});
test('Inspector detects movement immediately, catches after half a second, and allows stopping and turning',()=>{
 for(const stop of [false,true]){const g=game(5);g.beginEncounter('inspector',{floor:5,x:30,z:4});g.threat.age=2;
  g.updateThreat(.1,{},.1);assert.equal(g.threat.moveDeadline,2.6);for(let n=0;n<4;n++)g.updateThreat(.1,{yaw:n},.1);assert.equal(g.mode,'playing');g.updateThreat(.1,{yaw:2},stop?0:.1);assert.equal(g.mode,stop?'playing':'lost');
  if(stop){assert.equal(g.threat.moveDeadline,null);for(let n=0;n<80;n++)g.updateThreat(.1,{yaw:n*.2},0);assert.equal(g.mode,'playing');assert.equal(g.threat,null);}}
 const g=game(5);g.beginEncounter('inspector',{floor:5,x:30,z:4});g.threat.age=g.threat.warning+2.8;for(let n=0;n<6;n++)g.updateThreat(.1,{},.1);assert.equal(g.mode,'lost','crossing between checks must not cancel a movement warning');
});
test('ground floor guides pickup before threats; remote pickups fail and checkpoints restore the tool',()=>{
 const g=game();g.state.patrolWait=0;wait(g,35);assert.equal(g.threat,null);assert.equal(g.interact('f1-flashlight'),false);assert.equal(g.beginEncounter('doubao'),false);
 g.player.x=31.8;g.player.z=13.8;assert(g.nav.path({floor:1,...g.floor.spawn},g.player,g.doors).length);assert(floorPassable(g.floor,g.player));assert(g.interact('f1-flashlight'));assert.equal(g.interact('f1-flashlight'),false);g.saveCheckpoint(1);g.state.flashlight=false;g.retry();assert(g.state.flashlight);g.reset();assert(!g.states[1].flashlight);
});
test('each ground-floor Wang retreat arms Gunmu for the second corridor, including during blackout',()=>{
 const g=equipped();for(let visit=0;visit<2;visit++){g.player.x=18;g.player.z=4;assert(g.beginPatrol());g.state.blackout=true;g.resolveThreat();assert.equal(g.state.doubaoWait,0);wait(g,45);assert.equal(g.threat,null);g.player.z=28;wait(g,.5);assert.equal(g.threat?.kind,'doubao');assert.equal(g.threat.warning,2);g.resolveThreat();assert.equal(g.state.doubaoWait,null);}
 const h=game(2);h.beginPatrol();h.resolveThreat();assert.equal(h.state.doubaoWait,null);
});
test('Gunmu warning is harmless, movement is capped, five real beam seconds dispel it while backing away',()=>{
 const g=equipped(),t=enemy(g);t.age=0;const p={x:t.x,z:t.z};for(let n=0;n<19;n++)g.updateThreat(.1,{yaw:0},0);assert.deepEqual({x:t.x,z:t.z},p);assert.equal(t.exposure,0);
 t.age=3;g.updateThreat(.1,{yaw:0},0);assert(Math.hypot(t.x-p.x,t.z-p.z)<=.386);assert.equal(t.exposure,0);
 for(let n=0;n<51&&t.phase!=='leaving';n++)g.tick(.1,{yaw:-Math.PI/2,pitch:0,forward:-1});assert.equal(g.mode,'playing');assert.equal(t.exposure,5);assert.equal(t.phase,'leaving');for(let n=0;n<12;n++)g.tick(.1);assert.equal(g.threat,null);assert.equal(g.resolved,1);
});
test('Gunmu beam needs aim, range and clear sight; exposure persists when gaze breaks',()=>{
 const g=equipped(),t=enemy(g);g.updateThreat(.1,{yaw:-Math.PI/2},0);assert(t.exposure>0);const exposure=t.exposure;for(const input of [{yaw:Math.PI/2},{yaw:-Math.PI/2,pitch:-1.15}])g.updateThreat(.1,input,0);assert.equal(t.exposure,exposure);
 g.hiding={id:'f1-wardrobe-0',entry:{floor:1,x:14,z:3.8}};g.updateThreat(.1,{yaw:-Math.PI/2},0);assert.equal(t.exposure,exposure);g.hiding=null;g.state.flashlight=false;g.updateThreat(.1,{yaw:-Math.PI/2},0);assert.equal(t.exposure,exposure);
 const h=equipped(),v=enemy(h);h.player={floor:1,x:18,z:28,y:0};h.updateThreat(.1,{yaw:Math.atan2(18-31,28-4)},0);assert.equal(v.exposure,0,'the atrium walls block the beam');
});
test('scheduled Gunmu reserves the encounter slot; doors block the beam and wardrobes leave a usable exit',()=>{
 const g=equipped();g.beginPatrol();g.resolveThreat();g.state.patrolWait=0;g.state.yujieWait=0;g.state.kunWait=0;wait(g,45);assert.equal(g.threat,null);g.player.z=28;wait(g,.5);assert.equal(g.threat?.kind,'doubao');
 const h=equipped();h.player.x=32;h.player.z=10.5;assert(h.beginEncounter('doubao',{floor:1,x:32,z:14}));const d=h.state.doors.find(d=>d.id==='1-east-12');d.open=false;d.amount=0;d.block=doorBlock(d);h.threat.age=3;h.updateThreat(.1,{yaw:Math.PI},0);assert.equal(h.threat.exposure,0);
 const w=equipped(),t=enemy(w),cabinet=w.floor.interactions.find(i=>i.type==='wardrobe');Object.assign(w.player,cabinet.entry);assert(w.interact(cabinet.id));for(let n=0;n<130;n++)w.tick(.1);assert.equal(w.threat,t);assert.equal(t.exposure,0);assert(w.interact(cabinet.id));assert.equal(w.hiding,null);
});
test('Gunmu catches normally, debug stays alive, floor changes clear it, and the exterior exit still wins',()=>{
 for(const debug of [false,true]){const g=equipped();g.debugMode=debug;const t=enemy(g);g.player.x=t.x-.5;g.updateThreat(.1,{yaw:0},0);assert.equal(g.mode,debug?'playing':'lost');if(debug)assert(g.debugPendingScare);}
 const g=equipped();enemy(g);g.enterFloor(2);assert.equal(g.threat,null);const h=equipped();enemy(h);const d=h.state.doors.find(d=>d.kind==='exit');d.open=true;d.amount=1;d.block=doorBlock(d);h.player.x=6.5;h.player.z=30.35;h.tick(.1);assert.equal(h.mode,'won');
});
test('new encounter prompts and dynamic progress have English translations and a dedicated shipped image',()=>{
 setLanguage('en');for(const s of ['强光手电筒','灯闪了 · 强光对准即将出现的黑影','强光命中 · 照射 2.3 / 5 秒','巡楼将至 · 7 秒 · 找蒋介石画像的门或柜','它看见你动了。半秒内停住！'])assert(!/[\u3400-\u9fff]/.test(tr(s)),tr(s));
 const m=JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/runtime-manifest.json',import.meta.url)));assert.equal(m.billboards.doubao.asset,'gunmu');assert.equal(m.scares.doubao.asset,'gunmuScare');assert(fs.existsSync(new URL('../public'+m.textures.gunmu.url,import.meta.url)));
});

test('rear non-game bays are solid and absent from navigation on every floor',()=>{
 const g=game();
 for(const f of building.floors)for(const z of [12,20]){
  assert(!floorPassable(f,{x:6,z}));assert(!floorPassable(f,{x:8.1,z}));
  assert(!g.nav.byFloor[f.id].some(n=>n.x<8&&n.z>=11&&n.z<=21));
  assert(!f.doorSpecs.some(d=>d.id===`${f.id}-shelter-${z}`));
  assert(!g.line({floor:f.id,x:9,z},{floor:f.id,x:6,z}));
 }
});
test('lobby flashlight sits inside the remaining protected room without blocking either exit',()=>{
 const g=game(),r=g.floor.shelters[0],torch=g.floor.interactions.find(i=>i.type==='flashlight');
 assert(within(torch.target,r));assert(torch.target.x>29);g.player.x=31.8;g.player.z=13.8;
 for(const id of r.doors){const d=g.state.doors.find(d=>d.id===id);d.open=false;d.amount=0;d.block=doorBlock(d);}
 assert(floorPassable(g.floor,g.player,.24,g.state.doors.map(d=>d.block)));assert(sealedShelter(g));assert(g.interact(torch.id));
 for(const id of r.doors){const d=g.state.doors.find(d=>d.id===id);d.open=true;d.amount=1;d.block=doorBlock(d);assert(g.nav.path(g.player,{floor:1,x:32,z:d.z===12?10:22},g.doors).length);d.open=false;d.amount=0;d.block=doorBlock(d);}
});
