import test from 'node:test';
import assert from 'node:assert/strict';
import {CampaignGame} from '../src/campaign.js';
import {createCampaignBuilding} from '../src/campaign-layout.js';
import {worldStair} from '../src/building.js';
const building=createCampaignBuilding();
function walk(g,target,tick=false,fps=60){
 for(let i=0;i<4000;i++){
  const dx=target.x-g.player.x,dz=target.z-g.player.z,d=Math.hypot(dx,dz);if(d<.025)return;
  const input={forward:1,sprint:true,yaw:Math.atan2(-dx,-dz)},before={...g.player},dt=Math.min(1/fps,d/5);
  const door=g.state.doors.find(d=>d.routeDoor&&!d.open&&Math.hypot(g.player.x-d.x,g.player.z-d.z)<2.3&&target.x>d.x);
  if(door){assert(g.interact(door.id));for(let n=0;n<15;n++)g.tick(.05);}
  if(tick)g.tick(dt,input);else g.movePlayer(dt,input);
  assert.equal(g.mode,'playing',`caught by ${g.lastCatch} at ${JSON.stringify(g.player)}`);
  assert(Math.hypot(g.player.x-before.x,g.player.z-before.z)>.00001,`stuck ${JSON.stringify(g.player)} → ${JSON.stringify(target)}`);
 }assert.fail('movement timeout');
}
function route(g,target){const path=g.nav.path(g.player,{floor:g.player.floor,...target},g.doors);assert(path.length,`no path to ${JSON.stringify(target)}`);for(const p of path){assert.equal(p.floor,g.player.floor);walk(g,p);}walk(g,target);}
test('every search floor can be walked, looted, unlocked and descended via both real staircase flights',()=>{
 const g=new CampaignGame(building,32),director=g.director;
 for(const id of [8,7,6,5,4,2]){
  g.jumpFloor(id);g.cooldown=9999;const s=g.state,f=g.floor,visited=new Set();
  g.director=f.listenerDepot?()=>{}:dt=>director.call(g,dt);
  for(const [x,z]of f.mainRoute){walk(g,{x,z},true,30);if(g.currentScene)visited.add(g.currentScene.id);}
  assert.equal(visited.size,f.scenes.length);assert.equal(s.approved,false);assert.equal(g.stairEntry({x:8,z:f.destination.z}),null);
  const slips=f.interactions.filter(i=>i.type==='depot-slip');
  for(const i of [...slips.filter(i=>i.crate).slice(0,2),...slips.filter(i=>!i.crate).slice(0,3)]){
   route(g,i.approach);assert(g.interact(i.id));
   if(i.crate){for(let n=0;n<Math.ceil(i.crate.duration*10);n++)g.tick(.1,{interactHeld:true});assert(!s.depotFinds[i.id]);assert(g.interact(i.id));}
   assert(s.depotFinds[i.id],i.id);
  }
  for(const i of f.interactions.filter(i=>['whole','front','back'].includes(s.loot[i.id]))){
   route(g,i.approach);assert(g.interact(i.id));for(let n=0;n<6;n++)g.tick(.1,{yaw:i.approach.yaw});assert(s.searched[i.id]);assert(g.interact(i.id));
  }
  assert.equal(g.knownCode,s.code);route(g,f.keypad.approach);assert(g.interact(f.keypad.id));
  for(const digit of g.knownCode)assert(g.keypadKey(digit));assert(g.keypadKey('Enter'));assert(s.approved);
  for(let i=0;i<30;i++)g.updateDoors(.1);route(g,f.destination);
  for(const [x,z]of [[5.8,6],[1.625,5.7],[1.625,2.1],[3.125,2.1],[3.125,5.7],[6.9,6]])walk(g,worldStair(x,z,f.departure));
  assert.equal(g.player.floor,id-1);assert.equal(g.travel,null);assert(Math.abs(g.player.y-(id-2)*3.24)<1e-8);
 }
});
test('moving into the next scene naturally starts the seeded encounter without any E input',()=>{
 const g=new CampaignGame(building,32);g.jumpFloor(7);
 for(const [x,z]of g.floor.mainRoute){walk(g,{x,z},true,30);if(g.threat)break;}
 assert.equal(g.threat?.kind,g.deck[7].monster);assert(g.state.events>0);
});
function playChase(seed,fps,{push,bridge,alwaysSprint=false,tired=false,useBoard=false}){
 const g=new CampaignGame(building,seed);g.jumpFloor(3);
 if(tired){g.stamina=12;g.exhausted=true;g.staminaDelay=.8;}
 const phases=new Set();let fastFrames=0;
 function step(input={}){
  g.tick(1/fps,input);
  if(g.threat)phases.add(g.threat.phase);
  if(g.threat?.fastPursuit)fastFrames++;
 }
 function move(x,z,dash=false){
  const openSprint=dash||(z>=22&&x>=23)||(x<=38&&z<9);
  for(let n=0;n<fps*20;n++){
   if(g.mode!=='playing')return;
   const dx=x-g.player.x,dz=z-g.player.z;
   if(Math.hypot(dx,dz)<.1)return;
   const maze=g.player.z<-3.2||z<-3.2;
   const closeChase=g.threat&&Math.hypot(g.threat.x-g.player.x,g.threat.z-g.player.z)<5.5&&
    (push||bridge||g.line(g.threat,g.player));
   const sprint=alwaysSprint||(!maze&&openSprint)||closeChase;
   step({forward:1,sprint,yaw:Math.atan2(-dx,-dz)});
  }
  assert.fail(`blocked at ${g.player.x}, ${g.player.z} walking to ${x}, ${z}`);
 }
 move(12.4,24);assert(g.startTraversal('f3-vault-1'));while(g.traversal)step();
 move(17.75,24);assert(g.standbyKun);assert(g.interact(g.floor.chaseEntryDoorId));
 while(g.chaseAction)step({interactHeld:true});
 while(!g.threat)step();
 if(push){
  move(27.3,24);assert(g.interact(g.floor.chaseDoorId));
  while(g.chaseAction&&g.mode==='playing')step({interactHeld:true});
  if(!alwaysSprint&&!useBoard){move(30.7,24);assert(g.interact(g.floor.chaseDoorId));}
 }else{
  for(const [x,z]of [[24.3,24],[24.3,29.35],[34.4,29.35],[34.4,24]])move(x,z);
 }
 if(useBoard){
  const board=g.floor.interactions.find(i=>i.id==='f3-board-1');
  move(board.x+.68,board.z);
  for(let n=0;n<fps*3&&g.mode==='playing';n++){
   const gap=board.x-g.threat.x;
   if(gap>1.15&&gap<2.35&&Math.abs(g.threat.z-board.z)<.65){assert(g.interact(board.id));break;}
   step();
  }
 }
 move(38,24);
 if(bridge)move(38,8.55);
 else {
  const loop=push?[[42,15.7],[42,11.1],[46,11.1],[46,7.9],[38,7.9]]:[[38,15.7],[38,7.9]];
  for(const [x,z]of [[38,22.8],[45.9,22.8],[45.9,18.8],[43.15,18.8],[43.15,15.7],...loop])move(x,z);
 }
 if(g.mode==='playing'){
  // Stay at a full sprint on both sides of the exposed shutter.
  move(38.08,push?2.3:2.8,true);
  assert(g.interact(g.floor.chaseGateId));
  while(g.chaseAction&&g.mode==='playing')step({interactHeld:true});
  move(38.08,-.95,true);
  if(!alwaysSprint&&g.mode==='playing')assert(g.interact(g.floor.chaseGateId));
 }
 // Use both adjoining service aisles when the short passages collapse.
 for(const [x,z]of [[38,-7.5],[40.5,-7.5],[40.5,-12.7],[45.45,-12.7],[45.45,-7.5],
  [50.5,-7.5],[50.5,-16.5],[46.95,-16.5],[46.95,-21],[39.5,-21],[39.5,-16.5],[32.5,-16.5],[32.5,-3.05]])move(x,z);
 if(g.mode==='playing'){
  move(32.50,-1.27);
  assert(g.startTraversal('f3-vault-cart'));while(g.mode==='playing'&&g.traversal)step();
 }
 move(32.5,8.5);
 // Take whichever fan-room opening is clear from the runner's approach.
 const fan=push?[[28.9,8.5],[28.9,16.85],[24.4,18.5],[18.8,18.5],[16.6,16.85]]:
  [[27.4,8.5],[23.45,9.79],[19.2,9.79],[17.6,8.5],[17.6,14.85]];
 for(const [x,z]of [...fan,[14.8,15]])move(x,z,z>12);
 if(g.mode==='playing'){
  assert(g.startTraversal('f3-vent'));
  while(g.mode==='playing'&&g.traversal)step();
 }
 return {game:g,phases,fastFrames};
}
test('the receiving bypass and the push door each allow a no-item escape under fast pursuit at 30 and 60 fps',()=>{
 for(const fps of [30,60])for(const [seed,push]of [[1,false],[2,true]]){
  const {game:g,phases,fastFrames}=playChase(seed,fps,{push,bridge:false});
  assert(g.state.chaseEscaped,`caught by ${g.lastCatch} at ${JSON.stringify(g.player)} on seed ${seed} at ${fps} fps`);
  assert.equal(g.threat,null);assert.equal(g.state.ventOpen,true);
  assert.equal(g.state.chaseGuardSeen,true);assert.equal(g.auxiliary,null);
  assert.equal(Object.keys(g.state.chaseHazardAt).length,2,'the chase also triggers both later collapses');
  assert(phases.has('pursuing'));assert(phases.has('investigating'));assert(fastFrames>0);
  assert.equal(Number.isFinite(g.state.metalAt),!push);assert(Number.isFinite(g.state.clothAt));
 }
});
test('the identical start with the fastest inner route exposes a runner to a real catch',()=>{
 for(const fps of [30,60]){
  const {game:g,phases}=playChase(1,fps,{push:true,bridge:true,alwaysSprint:true});
  assert.equal(g.lastCatch,'kun');assert.equal(g.mode,'lost');assert.equal(g.state.chaseEscaped,false);
  assert(Number.isFinite(g.state.metalAt));assert(phases.has('pursuing'));
 }
});
test('a timed maintenance partition buys a real no-item dash from the receiving shortcut to the vent',()=>{
 for(const fps of [30,60]){
  const {game:g,phases}=playChase(2,fps,{push:true,bridge:false,useBoard:true});
  assert(g.state.chaseBoards['f3-board-1']?.hit);
  assert(phases.has('stunned'));
  assert(g.state.chaseEscaped);
 }
});
test('an exhausted arrival can recover through the receiving bypass without a mint',()=>{
 for(const fps of [30,60]){
  const {game:g}=playChase(1,fps,{push:false,bridge:false,tired:true});
  assert(g.state.chaseEscaped);assert.equal(g.inventory[0],null);assert.equal(g.mode,'playing');
 }
});
