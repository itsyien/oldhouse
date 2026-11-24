import test from 'node:test';
import assert from 'node:assert/strict';
import {CampaignGame} from '../src/campaign.js';
import {createCampaignBuilding} from '../src/campaign-layout.js';
import {floorPassable} from '../src/building.js';
import {blocked} from '../src/logic.js';
import {caughtInGunmuShaft,crawlGunmu,gunmuCrawlSpeed,moveGunmuPlatforms} from '../src/gunmu-finale.js';
import {listShaftPipes,shaftSlideOffset,shaftSlideProgress} from '../src/gunmu-shaft-geometry.js';

const building=createCampaignBuilding();
const clamp=(x,a,b)=>Math.max(a,Math.min(x,b));

function run(fps){
 const game=new CampaignGame(building,32);
 game.jumpFloor(1);
 const dt=1/fps,finale=game.floor.gunmuFinale;
 const door=id=>game.state.doors.find(d=>d.id===id);
 function go(x,z,{jump=false,walking=false}={}){
  for(let frame=0;frame<fps*9;frame++){
   if(game.mode==='won'||Math.hypot(game.player.x-x,game.player.z-z)<.085)return;
   const yaw=Math.atan2(game.player.x-x,game.player.z-z);
   game.tick(dt,{yaw,forward:1,sprint:!walking,jump:jump&&frame===0});
   assert.notEqual(game.mode,'lost',`caught by ${game.lastCatch} at ${JSON.stringify(game.player)}`);
  }
  assert.fail(`stuck going to ${x}, ${z} from ${JSON.stringify(game.player)}`);
 }
 function wait(seconds,condition=()=>false){
  for(let frame=0;frame<seconds*fps&&game.mode==='playing'&&!condition();frame++)game.tick(dt,{});
 }
 return {game,finale,door,go,wait,dt};
}

function latch({game,finale,door,go,wait}){
 for(const [x,z] of [[16.4,24],[16.3,20.8],[21.1,20.9],[25.8,22],[29.55,22],[31.15,21.9]])go(x,z);
 wait(2,()=>game.threat?.x>29.7);
 for(const [x,z] of [[35,21.8],[35,26.1],[29.6,26],[27,25.6]])go(x,z);
 const lever=game.floor.interactions.find(i=>i.id===finale.trap.leverId);
 go(lever.approach.x,lever.approach.z);
 assert(game.canTrapGunmu());assert(game.interact(lever.id));
 assert.equal(game.state.gunmuStage,'trapped');
 const trap=door(finale.trap.gateId);
 wait(.45,()=>trap.amount<.1);
 assert(blocked(trap.x,trap.z,[trap.block],.24));
 wait(.5,()=>door(finale.pipeGateId).amount>.85);
 assert(door(finale.pipeGateId).open&&!door(finale.pipeGateId).locked);
 assert(!trap.broken,'the exit opens while Gunmu is still trapped');
}

function enterPipes(trace){
 const {game,finale,door,go}=trace;
 latch(trace);
 for(const [x,z] of [[26.88,16.6],[40.7,16.6],[41.7,18]])go(x,z);
 assert.equal(game.stamina,100);
 const trap=door(finale.trap.gateId),entry=door(finale.pipeGateId),foe=game.threat;
 assert(entry.open&&!entry.locked);assert(!trap.open&&trap.locked);
 assert.equal(game.threat,foe,'the same actor travels all the way from the service bay');
 assert.equal(game.mode,'playing');
 go(finale.pipeEntry.x+.18,finale.pipeEntry.z);assert.equal(game.state.gunmuStage,'pipes');
 assert(door(game.floor.exitGateId).open);
 assert(!trap.broken,'successful lure buys real time in the shaft');
}

function crossPipes({game,finale,go,wait,door}){
 for(let i=1;i<finale.platforms.length;i++){
  const previous=finale.platforms[i-1],next=finale.platforms[i];
  if(next.slide)assert(game.interact(next.slide.id),'operate the nearby switch from the stable landing');
  const {axis,direction}=previous.turn??previous,cross=axis==='x'?'z':'x',size=axis==='x'?'w':'d',width=cross==='x'?'w':'d';
  const landCross=next[cross]+next[width]/2;
  const launchCross=previous.kind==='pipe'?previous[cross]+previous[width]/2:clamp(landCross,previous[cross]+.31,previous[cross]+previous[width]-.31);
  const launch=axis==='x'?{x:0,z:launchCross}:{x:launchCross,z:0};
  launch[axis]=previous[axis]+(direction===1?previous[size]-.34:.34);
  go(launch.x,launch.z);
  if(next.slide)wait(.56,()=>shaftSlideProgress(next.slide,game.state,game.time)===1);
  const flight=(6.4+Math.sqrt(6.4**2-32*(next.y-previous.y)))/16;
  const run=Math.sqrt((5*flight)**2-(landCross-game.player[cross])**2);
  const landing=axis==='x'?{x:0,z:landCross}:{x:landCross,z:0};
  landing[axis]=clamp(game.player[axis]+direction*(run-.18),next[axis]+.52,next[axis]+next[size]-.52);
  go(landing.x,landing.z,{jump:true});
  wait(.35,()=>game.state.gunmuVelocity===0);
  assert.equal(game.state.gunmuPipeIndex,i,`land on section ${i} (${axis}${direction}) at ${JSON.stringify(game.player)}`);
  assert(Math.abs(game.player.y-next.y)<.025,`land on the physical surface of section ${i}`);
 }
 assert(door(finale.trap.gateId).broken&&game.state.gunmuGateImpactAt>=game.state.gunmuBreachAt);
}

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
test('two shaft switches shift actual collision sideways over half a second and reset at the checkpoint',()=>{
 const {game,finale}=run(60);
 const slidePipes=listShaftPipes(finale).filter(p=>p.slide);
 assert.equal(slidePipes.length,2);
 for(const pipe of slidePipes){
  const {slide,platformIndex}=pipe,plate=game.floor.interactions.find(i=>i.id===slide.id);
  const corner=finale.platforms[platformIndex-1],parked=pipe.x+slide.offset;
  const lateralGap=slide.offset>0?parked-pipe.radius-corner.x-corner.w:corner.x-parked-pipe.radius;
  const flightFromCorner=(6.4+Math.sqrt(6.4**2-32*(pipe.y-corner.y)))/16;
  assert(lateralGap>5*(flightFromCorner+.095),'even the parked pipe’s lowest accessible shoulder is beyond a sprint jump');
  game.rehearseGunmuPipes();
  Object.assign(game.player,plate.approach,{y:plate.platformY});
  assert(!game.interact(slide.id),'a switch cannot be used from a nearby different lane');
  game.state.gunmuPipeIndex=platformIndex-1;
  assert.equal(shaftSlideOffset(slide,game.state,game.time),slide.offset);
  assert(game.interact(slide.id));
  const start=game.time;
  assert(!game.interact(slide.id),'a second press does not reset the move');
  assert.equal(shaftSlideProgress(slide,game.state,start+.5),1);
  assert(shaftSlideProgress(slide,game.state,start+.49)<1);
  for(const elapsed of [.25,.5]){
   game.time=start+elapsed;
   const x=pipe.x+shaftSlideOffset(slide,game.state,game.time);
   const crown=pipe.y+pipe.radius;
   Object.assign(game.player,{x,z:pipe.z,y:crown+.01});
   game.state.gunmuVelocity=0;
   moveGunmuPlatforms(game,.09,{});
   assert.equal(game.player.y,crown,'the current pipe supports the player at its rendered position');
   assert.equal(game.state.gunmuPipeIndex,platformIndex);
   Object.assign(game.player,{x:x+(elapsed===.25?-slide.offset/2:slide.offset),z:pipe.z,y:crown+.01});
   moveGunmuPlatforms(game,.09,{});
   assert(game.player.y<crown-.025,'no collision lingers at the previous position');
  }
 }
 game.rehearseGunmuPipes();
 assert.deepEqual(game.state.gunmuSlides,{});
});

test('the crawler reaches the blue door in about 39 seconds',t=>{
 const floor=building.byId[1],finale=floor.gunmuFinale,{route}=finale;
 const exit={...route.at(-1),x:floor.exit.x};
 const path=[...route,exit];
 const length=path.slice(1).reduce((d,p,i)=>d+distance(p,path[i]),0);
 for(const fps of [30,60]){
  const actor={...route[0],pipeIndex:0,pipeNext:0};
  let frames=0;
  while(distance(actor,exit)>1e-6&&frames<45*fps){
   crawlGunmu(actor,finale,exit,route.length-1,1/fps);frames++;
  }
  assert(distance(actor,exit)<1e-6);
  assert(Math.abs(frames/fps-39)<.05);
  t.diagnostic(`${fps} Hz: ${length.toFixed(2)}m to the blue door in ${(frames/fps).toFixed(2)}s`);
 }
});

function crawlerLead(game){
 const {threat,player}=game,{route}=game.floor.gunmuFinale;
 if(threat.pipeIndex>=route.length-1)return distance(player,threat);
 const tail=[threat,...route.slice(threat.pipeNext??threat.pipeIndex+1)];
 return tail.slice(1).reduce((length,point,i)=>length+distance(point,tail[i]),0)+player.x-route.at(-1).x;
}

test('win the five-part Gunmu finale through real collisions, lever and jumps at 30 and 60 Hz',t=>{
 for(const fps of [30,60]){
  const trace=run(fps),{game,go,finale}=trace;
  assert.equal(finale.sections.length,5);
  const routeLength=finale.route.slice(1).reduce((d,p,i)=>d+distance(p,finale.route[i]),0);
  assert(routeLength>=245&&routeLength<=265);assert(finale.shaft.w<100);
  assert(finale.platforms.some(deck=>deck.axis==='z'));assert(finale.platforms.some(deck=>deck.direction===-1));
  assert(finale.platforms.some(deck=>deck.kind==='pipe'&&deck.slip));
  enterPipes(trace);crossPipes(trace);
  assert.equal(game.threat.phase,'crawling');assert.equal(game.auxiliary,null);
  const lead=crawlerLead(game);
  assert(lead<20,'a clean route still puts the faster crawler close behind');
  t.diagnostic(`${fps} Hz at ${game.time.toFixed(2)}s, crawler ${lead.toFixed(2)}m behind at last landing, ${gunmuCrawlSpeed}m/s`);
  go(game.floor.destination.x,game.floor.destination.z);
  assert.equal(game.mode,'won');assert.equal(game.state.gunmuStage,'escaped');
 }
});

test('a brief hesitation leaves a narrow escape at the blue door',t=>{
 const trace=run(60),{game,go,wait}=trace;
 enterPipes(trace);wait(1.3);crossPipes(trace);
 go(game.floor.exit.x-.22,game.floor.destination.z);
 const lead=crawlerLead(game);
 t.diagnostic(`crawler ${lead.toFixed(2)}m behind before exiting`);
 assert(lead>.82&&lead<6);
 go(game.floor.destination.x,game.floor.destination.z);assert.equal(game.mode,'won');
});

test('an early lever pull leaves the shutter open, with a chance to lure Gunmu again',()=>{
 const {game,finale,go,door}=run(60);
 const lever=game.floor.interactions.find(i=>i.id===finale.trap.leverId);
 for(const [x,z] of [[16.4,24],[16.3,20.8],[21.1,20.9],[25.8,22],[27.0,25.6],[lever.approach.x,lever.approach.z]])go(x,z);
 assert.equal(game.threat.kind,'doubao');assert(!game.canTrapGunmu());
 assert(!game.interact(lever.id));assert(door(finale.trap.gateId).open);assert.equal(game.state.gunmuStage,'lure');
 assert(door(finale.pipeGateId).locked);
 assert(game.messages.some(message=>message.text==='等她完全进维修间，再拉闸。'));
});

test('Gunmu catches a walking player who rounds the first boiler without stopping',()=>{
 for(const fps of [30,60]){
  const {game,dt,go}=run(fps);
  go(16.4,24,{walking:true});
  assert.equal(game.threat?.kind,'doubao');
  for(const [x,z] of [[16.3,20.8],[21.1,20.9],[21.5,22.1],[29.55,22.1],[35,21.8]]){
   const remaining=()=>Math.hypot(game.player.x-x,game.player.z-z);
   for(let frame=0;frame<6*fps&&game.mode==='playing'&&remaining()>.11;frame++){
    const before=remaining();
    game.tick(dt,{forward:1,yaw:Math.atan2(game.player.x-x,game.player.z-z)});
    if(game.mode==='lost')assert(remaining()<before,'the player was still moving when caught');
   }
   if(game.mode==='lost')break;
   assert(remaining()<=.11,`walking route should reach ${x}, ${z}`);
  }
  assert.equal(game.mode,'lost',`the walking player escaped Gunmu at ${fps} Hz`);
  assert.equal(game.lastCatch,'doubao');
 }
});

test('Gunmu can round the stack and reach a player in either narrow gap',()=>{
 for(const route of [[[37.6,29.655]],[[37.7,29.655],[37.7,28]]]){
  const {game,dt,go}=run(60);
  Object.assign(game.player,{x:36.2,z:29.655});
  assert(game.beginGunmu({x:35.5,z:28.3}));
  for(const [x,z] of route)go(x,z,{walking:true});
  assert(!game.line(game.threat,game.player),'the storage stack separates the player and Gunmu');
  for(let frame=0;frame<240&&game.mode==='playing';frame++){
   game.tick(dt);
   assert(floorPassable(game.floor,game.threat,.26,game.floorBlocks()),'Gunmu stays clear of the stack and walls');
  }
  assert.equal(game.mode,'lost',`Gunmu should reach the player at ${route.at(-1)}`);
  assert.equal(game.lastCatch,'doubao');
 }
});

test('Gunmu reaches a player tucked beside the entry alcove wardrobe',()=>{
 const {game,wait}=run(60);
 Object.assign(game.player,{x:12.6875,z:28.45});
 assert(floorPassable(game.floor,game.player));
 assert(game.beginGunmu());
 wait(8,()=>game.mode==='lost');
 assert.equal(game.mode,'lost');
 assert.equal(game.lastCatch,'doubao');
});

test('bypassing the repair bay leaves the pipe-room door locked with Gunmu still hunting',()=>{
 const {game,finale,go,wait,door}=run(60);
 for(const [x,z] of [[16.4,24],[16.3,20.8],[21.1,20.9],[25.8,22],[26.88,16.6],[40.7,16.6],[41.65,18]])go(x,z);
 const gate=door(finale.pipeGateId);
 assert(gate.locked&&!gate.open);
 assert.equal(game.state.gunmuBreachAt,null);
 wait(6,()=>game.mode==='lost');
 assert.equal(game.mode,'lost');assert.equal(game.lastCatch,'doubao');
});

test('wet round pipes on both axes are stable at the crown and slide downhill across their own axis',()=>{
 const {game,finale,wait}=run(60);
 for(const axis of ['x','z']){
  game.retry();game.rehearseGunmuPipes();game.threat=null;
  const pipe=listShaftPipes(finale).find(p=>p.axis===axis&&p.slip);
  if(pipe.slide)game.state.gunmuSlides[pipe.slide.id]=game.time-1;
  const cross=axis==='x'?'z':'x';
  Object.assign(game.player,{x:pipe.x,z:pipe.z,y:pipe.y+pipe.radius});wait(.65);
  assert.equal(game.player[cross],pipe[cross]);
  const side=listShaftPipes(finale).some(p=>p.role==='recovery'&&p.platformIndex===pipe.platformIndex&&p[cross]>pipe[cross])?-1:1;
  const offset=pipe.radius*.74;
  game.player[cross]=pipe[cross]+side*offset;
  game.player.y=pipe.y+Math.sqrt(pipe.radius**2-offset**2);wait(.3);
  assert(side*(game.player[cross]-pipe[cross])>offset+.1);assert.equal(game.player[axis],pipe[axis]);
  wait(3);assert.equal(game.mode,'lost');assert.equal(game.lastCatch,'fall');
 }
});

test('visible lower pipes stop the body at their side and can catch a missed landing',()=>{
 const trace=run(60),{game,finale,go,wait,dt}=trace;
 game.rehearseGunmuPipes();game.threat=null;
 const recovery=listShaftPipes(finale).find(p=>p.role==='recovery'&&p.axis==='x');
 const main=listShaftPipes(finale).find(p=>p.role==='main'&&p.platformIndex===recovery.platformIndex);
 const top=recovery.y+recovery.radius,side=Math.sign(recovery.z-main.z);
 const outside=recovery.z+side*(recovery.radius+.52),inward=side===1?0:Math.PI;
 Object.assign(game.player,{x:recovery.x,y:top-.18,z:outside});
 for(let frame=0;frame<9;frame++)game.tick(dt,{yaw:inward,forward:1,sprint:true});
 const gap=side*(game.player.z-recovery.z);
 assert(gap>=recovery.radius+.22&&gap<recovery.radius+.30,'the mesh tube stops the swept body before the centre enters');

 Object.assign(game.player,{x:recovery.x,y:top+.35,z:recovery.z+side*(recovery.radius+.045)});
 game.state.gunmuVelocity=0;wait(.65);
 assert(game.player.y<top-.45,'feet outside the tube shape are not supported by the body padding');

 Object.assign(game.player,{x:recovery.x,y:top+.56,z:recovery.z});
 game.state.gunmuVelocity=0;wait(.55);
 assert(Math.abs(game.player.y-top)<1e-6);assert.equal(game.state.gunmuPipeIndex,recovery.platformIndex);
 go(main.x,main.z,{jump:true});wait(.8,()=>game.state.gunmuVelocity===0);
 assert(Math.abs(game.player.y-(main.y+main.radius))<.025,'the lower pipe allows a real jump back to the course');
});

test('jumping under a real overhead pipe hits the underside with the head',()=>{
 const floor={gunmuFinale:{
  shaft:{x:0,z:0,w:14,d:10},voidY:-9,
  platforms:[{x:1,z:2,w:11,d:6,y:0,kind:'catwalk'},{x:4,z:4.55,w:4,d:.9,y:2.94,kind:'pipe',axis:'x'}]
 }};
 const game={floor,player:{x:6,y:0,z:5},time:0,state:{gunmuVelocity:0,gunmuGroundedAt:0,gunmuJumpUntil:-Infinity},
  floorBlocks:()=>[],fallInGunmuShaft:()=>assert.fail('solid ground should remain below the pipe')};
 let highest=0;
 for(let frame=0;frame<60;frame++){
  game.time+=1/60;moveGunmuPlatforms(game,1/60,{jump:frame===0});
  highest=Math.max(highest,game.player.y);
 }
 assert(highest>.25&&highest<.32,`overhead pipe allowed ${highest} m of jump`);
 assert.equal(game.player.y,0);
});

test('a nearby crawler on a different folded lane cannot grab across route progress',()=>{
 const {finale}=run(60),player={...finale.route[8]};
 const actor={...player,x:player.x-.4,pipeIndex:23};
 assert(!caughtInGunmuShaft(actor,player,finale,8));
 actor.pipeIndex=8;
 assert(caughtInGunmuShaft(actor,player,finale,8));
});

test('the crawler does not sink into the deck before reaching a descending jump',()=>{
 const {finale,dt}=run(60),actor={...finale.route[0],pipeIndex:0,pipeNext:0};
 const first=finale.platforms[0],far=finale.route[4];
 let sawLowerDeck=false;
 for(let frame=0;frame<120;frame++){
  crawlGunmu(actor,finale,far,4,dt);
  if(actor.x<=first.x+first.w)assert(actor.y>=first.y-1e-7);
  if(actor.pipeIndex===1){sawLowerDeck=true;break;}
 }
 assert(sawLowerDeck);
});

test('a missed jump and a slow escape both lose, with enough room to replay from the pipe checkpoint',()=>{
 const trace=run(60),{game,finale,wait,go,dt}=trace;
 enterPipes(trace);
 for(let i=0;i<160&&game.mode==='playing';i++)game.tick(dt,{yaw:-Math.PI/2,forward:1,sprint:true});
 assert.equal(game.mode,'lost');assert.equal(game.lastCatch,'fall');
 game.retry();assert.equal(game.mode,'playing');assert.equal(game.state.gunmuStage,'pipes');
 assert.equal(game.player.x,finale.pipeEntry.x);assert.equal(game.threat.kind,'doubao');
 const entry=finale.platforms[0];
 go(entry.x+entry.w-.5,entry.z+.28,{walking:true});
 wait(18,()=>game.mode==='lost');
 assert.equal(game.mode,'lost');assert.equal(game.lastCatch,'doubao');
 game.fail('doubao');
 assert.deepEqual(game.run.deaths,[{floor:1,kind:'fall'},{floor:1,kind:'doubao'}]);
 game.retry();crossPipes(trace);go(game.floor.destination.x,game.floor.destination.z);
 assert.equal(game.mode,'won');
});
