import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createCampaignWorld,patrolCircuitPower} from '../src/campaign-world.js';
import {createCampaignBuilding} from '../src/campaign-layout.js';
import {doorBlock,worldStair} from '../src/building.js';
import {clearSight} from '../src/logic.js';
import {getLanguage,setLanguage} from '../src/i18n.js';
import {listShaftPipes,listShaftSolids} from '../src/gunmu-shaft-geometry.js';
import {moveGunmuPlatforms} from '../src/gunmu-finale.js';
import {chaseHazards,chaseHazardAge,chaseHazardPose} from '../src/chase-hazard-geometry.js';

const drawings=[];
const context=Object.fromEntries(['fillRect','strokeRect','beginPath','ellipse','fill','stroke','moveTo','lineTo','arc','save','restore','translate','rotate','drawImage','putImageData'].map(k=>[k,()=>{}]));
context.fillText=text=>drawings.push(text);
context.measureText=text=>({width:text.length*15});
context.getImageData=()=>({data:new Uint8ClampedArray([210,40,80,255])});
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context})};
const assets=Object.fromEntries(['naiwa','liang','inspector','wangjingwei'].map(k=>[k,new T.Texture({width:300,height:400})]));
function fixture(anomaly=null,overrides={}){
 const rooms=Array.from({length:6},(_,n)=>({id:`r${n}`,number:801+n,bounds:{x:12+n*3,z:2,w:3,d:4},doorId:`door${n}`}));
 const f={id:8,base:22.68,campaign:true,totalFloors:8,mode:'inspection',title:'APARTMENTS',arrival:'A',departure:'B',bounds:{minX:8,maxX:32,minZ:2,maxZ:12},walkableRects:[{x:8,z:2,w:24,d:10}],surfaceRects:[{x:8,z:2,w:24,d:10}],partitions:[],boundaries:[],obstacles:[],furniture:[],props:[],rooms,mainRoute:[[9,8],[30,8]],spawn:{x:9,z:8},destination:{x:9,z:10},judgments:[],anomalySites:{extraDoor:{x:28,z:2.2,yaw:0},ceiling:{x:18,z:8},statue:{x:22,z:8},normalStatue:{x:11,z:5}},interactions:rooms.map((r,n)=>({id:`portrait${n}`,type:'portrait',roomId:r.id,asset:n%2?'liang':'naiwa',x:13+n*3,z:2.2,yaw:0,target:{x:13+n*3,y:1.65,z:2.2}})),doorSpecs:rooms.map((r,n)=>({id:r.doorId,x:13+n*3,z:6,kind:'wood',axis:'z'})),traversals:[],arenas:[],...overrides};
 const state={doors:f.doorSpecs.map(d=>({...d})),interactions:{},anomaly,traversals:{},bossCleared:0};
 const scene=new T.Scene(),world=createCampaignWorld(scene,assets,f,state),camera=new T.PerspectiveCamera();camera.position.set(18,f.base+1.65,8);
 const game={states:{8:state},player:{floor:8},debugCalm:false};return{world,scene,camera,game,state,f};
}

test('physical door leaves carry lit signs and respond to opening',()=>{
 const {world,camera,game,state}=fixture();try{
  assert.equal(world.doors.length,6);state.doors[0].amount=1;world.update(.1,camera,1,game,true);assert.equal(world.doors[0].pivot.rotation.y,Math.PI/2);
  let printed=0;world.root.traverse(o=>{if(!o.material?.map?.userData.campaignPrint)return;printed++;assert(o.material.isMeshStandardMaterial);assert.equal(o.material.emissive.getHex(),0);});assert(printed>=12);
 }finally{world.dispose();}
});

test('source photos stay intact and all printed portraits are monochrome',()=>{
 const {world}=fixture();try{for(const r of world.root.userData.interactions){assert.notEqual(r.photo.material.map,assets[r.data.asset]);assert(r.photo.material.map.userData.grayscale);}}finally{world.dispose();}
});

test('a listener tugs both handles of the actual closed door before opening and lets them return to rest',()=>{
 const {world,f,camera,game,state}=layoutFixture(7);
 try{
  const door=world.doors.find(d=>d.routeDoor),other=world.doors.find(d=>d!==door);door.data.amount=0;
  game.threat={floor:f.id,kind:'liang',age:10,openAfter:10.7,waitingDoor:door.id};
  game.threat.age=10.18;world.update(.05,camera,2,game,false);const first=door.handle.rotation.z;assert(first>.65);assert.equal(other.handle.rotation.z,0);assert.equal(Math.abs(door.pivot.rotation.y),0);
  door.handle.geometry.computeBoundingBox();const b=door.handle.geometry.boundingBox;assert(b.min.z<-.11&&b.max.z>.11);
  game.threat.age=10.36;world.update(.05,camera,2,game,false);assert(door.handle.rotation.z<first*.6);
  game.threat.age=10.6;world.update(.05,camera,2,game,false);assert(door.handle.rotation.z>.65);
  game.threat.waitingDoor=null;state.doors.find(d=>d.id===door.id).amount=.5;for(let i=0;i<6;i++)world.update(.05,camera,2,game,false);
  assert.equal(door.handle.rotation.z,0);assert(Math.abs(door.pivot.rotation.y)>.6);
 }finally{world.dispose();}
});

test('floor surfaces do not overlap',()=>{
 const {world,scene}=fixture();try{scene.updateMatrixWorld(true);const hits=new T.Raycaster(new T.Vector3(18.1,24,8.1),new T.Vector3(0,-1,0),0,3).intersectObject(world.root,true).filter(h=>h.object.material===world.materials.floor);assert.equal(hits.length,1);}finally{world.dispose();}
});

test('the moved sorting island leaves broken tracks seated on the entrance floor and lit by its circuit',()=>{
 const {world,f,scene,game,camera,state}=layoutFixture(8);
 try{
  scene.updateMatrixWorld(true);const marks=world.root.getObjectByName('mailbox-drag-marks'),island=f.furniture.find(p=>p.name==='mailboxes'&&p.d>p.w);
  marks.geometry.computeBoundingBox();const bound=marks.geometry.boundingBox.clone().applyMatrix4(marks.matrixWorld);
  assert(bound.min.y>f.base&&bound.max.y<f.base+.006);assert(bound.max.x>island.x&&bound.max.x<island.x+island.w);
  assert(marks.material.polygonOffset&&!marks.material.depthWrite&&marks.material.lightMap);
  const alpha=marks.material.map.image.data.filter((v,i)=>i%4===3);assert(alpha.some(a=>a>145)&&alpha.filter(a=>a===0).length>alpha.length*.6);
  state.blackout=true;world.update(.05,camera,1,game,false);assert.equal(marks.material.lightMapIntensity,0);assert.equal(marks.material.emissive.getHex(),0);
 }finally{world.dispose();}
});

test('disposing world releases derived textures but preserves source assets',()=>{
 const {world,scene}=fixture();let owned=0,shared=0;const textures=new Set();world.root.traverse(o=>{if(o.material?.map?.userData.grayscale)textures.add(o.material.map);});for(const t of textures)t.addEventListener('dispose',()=>owned++);for(const t of Object.values(assets))t.addEventListener('dispose',()=>shared++);world.dispose();assert.equal(owned,textures.size);assert.equal(shared,0);assert.equal(scene.children.length,0);
});

function layoutFixture(id,overrides={}){const f=Object.assign(createCampaignBuilding().byId[id],overrides),state={doors:f.doorSpecs.map(d=>({...d,amount:d.open?1:0})),interactions:{},anomaly:null,traversals:{},bossCleared:0},scene=new T.Scene(),world=createCampaignWorld(scene,assets,f,state),camera=new T.PerspectiveCamera(),game={states:{[id]:state},player:{floor:id}};camera.position.set(f.spawn.x,f.base+1.65,f.spawn.z);return{f,state,scene,world,camera,game};}

test('adjacent floors reuse the same plaster texture while their light maps and materials remain independent',()=>{
 const first=layoutFixture(8).world,next=layoutFixture(7).world;
 const a=first.materials.watermark,b=next.materials.watermark;
 assert.notEqual(a,b);assert.notEqual(a.lightMap,b.lightMap);assert.equal(a.map,b.map);
 let disposed=false;const onDispose=()=>{disposed=true;};
 b.map.addEventListener('dispose',onDispose);
 try{first.dispose();assert(!disposed);}finally{b.map.removeEventListener('dispose',onDispose);next.dispose();}
});

test('the dark shaft uses the shared encounter light to follow the crawler at different heights',()=>{
 const {f,state,world,camera,game}=layoutFixture(1);
 try{
  const spot=world.root.getObjectByName('NaiWa encounter spotlight');
  state.gunmuStage='pipes';
  const location=f.gunmuFinale.route[8];
  camera.position.set(location.x+3,location.y+1.65,location.z);
  game.threat={...location,floor:1,kind:'doubao',phase:'pursuing',age:10,warning:0};
  world.update(.2,camera,1,game,false);
  assert(spot.visible&&spot.intensity===0,'the shaft starts dark with its crawler shader already active');
  for(const offset of [0,1.3]){
   game.threat.phase='crawling';game.threat.y=location.y+offset;
   world.update(.2,camera,1.2,game,false);
   assert(spot.visible&&spot.intensity>8);
   assert(Math.abs(spot.target.position.y-game.threat.y-.48)<.001);
   assert(Math.abs(spot.position.z-spot.target.position.z)>.4,'side light leaves a dark side on the model');
   assert(world.lights.every(l=>!l.visible),'unpowered bulbs leave the physical shader while the crawler light stays visible');
   assert(world.lights.every(l=>l.intensity===0),'the shaft circuit stays off');
  }
  camera.position.x+=30;
  for(let i=0;i<6;i++)world.update(.1,camera,2,game,false);
  assert(spot.visible&&spot.intensity===0);
  assert(world.lights.every(l=>!l.visible));
  const {route}=f.gunmuFinale;
  camera.position.set(route[13].x,route[13].y+1.65,route[13].z);
  Object.assign(game.threat,route[3],{pipeIndex:3});
  state.gunmuPipeIndex=13;
  world.update(.2,camera,3,game,false);
  assert(spot.visible&&spot.intensity>8,'light stays with the distant crawler across the first turn');
  state.gunmuPipeIndex=17;
  for(let i=0;i<6;i++)world.update(.1,camera,4,game,false);
  assert(spot.visible&&spot.intensity===0,'the wider range is limited to the return-lane reveal');
  game.debugCalm=true;world.update(.1,camera,5,game,true);
  assert.equal(world.lights.filter(l=>l.visible).length,5,'the bright debug lighting still uses its five slots');
 }finally{world.dispose();}
});

test('isolation shutter slides, its lever shows readiness, and no render floor bridges pipe gaps',()=>{
 const {f,state,world,camera,game}=layoutFixture(1);
 const {trap,platforms,sections}=f.gunmuFinale;
 const shutter=world.doors.find(d=>d.id===trap.gateId);
 const record=world.root.userData.interactions.find(r=>r.i.id===trap.leverId);
 assert(world.interactables.some(m=>m.userData.target===trap.leverId));
 assert(shutter.pivot.position.y>2.6);
 state.gunmuStage='lure';game.threat={...f.gunmuFinale.spawn,kind:'doubao',floor:f.id};
 world.update(.1,camera,1,game,false);const waiting=record.isolationLever.pilot.emissiveIntensity;
 Object.assign(game.threat,{x:35.6,z:22});
 world.update(.1,camera,1,game,false);
 assert(record.isolationLever.pilot.emissiveIntensity>waiting);
 state.gunmuStage='trapped';shutter.data.amount=0;
 for(let i=0;i<5;i++)world.update(.1,camera,1+i*.1,game,true);
 assert.equal(shutter.pivot.position.y,0);assert.equal(shutter.pivot.rotation.y,0);
 assert(record.isolationLever.lever.rotation.x>.5);
 assert(!shutter.torn.visible);
 state.gunmuStage='breach';shutter.data.amount=1;shutter.data.broken=true;
 state.gunmuSlides=Object.fromEntries(platforms.filter(p=>p.slide).map(p=>[p.slide.id,0]));
 world.update(.1,camera,1.6,game,true);
 assert(shutter.torn.visible&&shutter.pivot.rotation.x>.1);
 for(const {id} of sections){
  const chunk=world.root.getObjectByName(`shaft-${id}`);
  assert(chunk?.children.length>2,`separate geometry batch for ${id}`);
  const paints=chunk.children.filter(m=>m.isMesh).map(m=>m.material);
  assert.equal(new Set(paints).size,paints.length,'sliding pipes retain a separate transform without splitting the fixed material batches');
  chunk.traverse(m=>{if(m.isMesh)assert.equal(m.material.emissive.getHex(),0,`${id} depends on the flashlight`);});
 }
 world.root.updateMatrixWorld(true);
 const cast=new T.Raycaster(new T.Vector3(),new T.Vector3(0,-1,0),0,3);
 for(let i=0;i<platforms.length-1;i++){
  const p=platforms[i],next=platforms[i+1];
  const edge=(deck,end)=>{const axis=deck.axis??'x',sign=(deck.direction??1)*(end?1:-1);return{x:deck.x+deck.w/2+(axis==='x'?sign*deck.w/2:0),z:deck.z+deck.d/2+(axis==='z'?sign*deck.d/2:0)};};
  const a=edge(p,true),b=edge(next,false),x=(a.x+b.x)/2,z=(a.z+b.z)/2;
  const occupied=platforms.some(deck=>x>=deck.x&&x<=deck.x+deck.w&&z>=deck.z&&z<=deck.z+deck.d);
  if(!occupied){
   cast.ray.origin.set(x,Math.max(p.y,next.y)+1.2,z);
   assert(!cast.intersectObject(world.root,true).some(hit=>hit.point.y>Math.min(p.y,next.y)-.55));
  }
  cast.ray.origin.set(next.x+next.w/2,next.y+1.25,next.z+next.d/2);
  assert(cast.intersectObject(world.root,true).some(hit=>Math.abs(hit.point.y-next.y)<.028));
 }
 world.dispose();
});

test('one shaft shell encloses folded lanes while every round support shares its collision data',()=>{
 const {f,world,state,game,camera}=layoutFixture(1);try{
  const finale=f.gunmuFinale,pipes=listShaftPipes(finale),solids=listShaftSolids(finale),data=world.root.userData.shaftGeometry;
  assert.deepEqual(data,{pipes,solids});assert.equal(world.root.children.filter(g=>g.name==='shaft-shell').length,1);
  assert.equal(new Set(solids.map(s=>s.id)).size,solids.length);
  assert.equal(solids.filter(s=>s.id==='shaft-floor').length,1);assert.equal(solids.filter(s=>s.id==='shaft-roof').length,1);
  assert.equal(pipes.filter(p=>p.role==='main').length,finale.platforms.filter(p=>p.kind==='pipe').length);
  assert(pipes.some(p=>p.role==='recovery'));
  state.gunmuSlides={};
  for(const p of pipes.filter(p=>p.slide)){
   const group=world.root.getObjectByName('shaft-'+p.slide.id);
   assert(group);
   assert.equal(group.position.x,p.slide.offset);
   state.gunmuSlides[p.slide.id]=0;
   world.update(.1,camera,.25,game,true);
   assert(Math.abs(group.position.x-p.slide.offset/2)<.01);
  }
  world.update(.1,camera,.5,game,true);
  world.root.updateMatrixWorld(true);
  const ray=new T.Raycaster(new T.Vector3(),new T.Vector3(0,-1,0),0,2);
  for(const p of pipes){
   assert(['x','z'].includes(p.axis));assert(p.length>0&&p.radius>0);
   const top=p.y+p.radius;ray.ray.origin.set(p.x,top+.35,p.z);
   const hit=ray.intersectObject(world.root,true)[0];assert(hit,`visible pipe ${p.id}`);
   assert(Math.abs(hit.point.y-top)<.015,`pipe top matches the cylinder support: ${p.id}`);
   if(p.role==='recovery'){
    const deck=finale.platforms[p.platformIndex];assert(Math.abs(deck.y-top-.42)<.001);
    assert(p.length<=3.3&&p.radius<.3,'recovery supports are short and visibly thinner');
   }
  }
  for(const p of finale.platforms.filter(p=>p.axis==='z'||p.kind==='beam')){
   ray.ray.origin.set(p.x+p.w/2,p.y+.4,p.z+p.d/2);
   assert(ray.intersectObject(world.root,true).some(h=>Math.abs(h.point.y-p.y)<.02),`${p.kind} has an actual walk surface in ${p.axis}`);
  }
 }finally{world.dispose();}
});

test('the shaft pipe banks reach their mountings and are decorative only',()=>{
 const {f,world}=layoutFixture(1);try{
  const finale=f.gunmuFinale;
  const banks=finale.sections.map(({id})=>world.root.getObjectByName('shaft-pipes-'+id));
  world.root.updateMatrixWorld(true);
  for(const [index,bank] of banks.entries()){
   assert(bank&&bank.children.length===3,'each bank uses one colored pipe mesh and two bracket meshes');
   const bounds=new T.Box3().setFromObject(bank);
   assert(bounds.min.y<finale.voidY,'each bank is braced to the shaft floor');
   if(finale.sections[index].id==='pressure')assert(bounds.max.y<-2.3,'central pipes stay below the first turn sightline');
   else assert(bounds.max.y>9,'outer riser sections reach the shaft roof');
  }
  const centerBank=banks[finale.sections.findIndex(s=>s.id==='pressure')];
  for(const [from,to]of [[13,3],[14,4],[15,5],[16,7]]){
   const eye=new T.Vector3(finale.route[from].x,finale.route[from].y+1.65,finale.route[from].z);
   const head=new T.Vector3(finale.route[to].x,finale.route[to].y+.55,finale.route[to].z);
   const ray=new T.Raycaster(eye,head.clone().sub(eye).normalize(),.03,eye.distanceTo(head)-.03);
   assert.equal(ray.intersectObject(centerBank,true).length,0,`Clear view to the other lane from deck ${from}`);
  }
  const x=53,z=14.8,ray=new T.Raycaster(new T.Vector3(x,-5.2,z),new T.Vector3(0,-1,0),0,.75);
  const hit=ray.intersectObject(banks[0],true)[0];
  assert(hit,'the decorative run has a visible pipe crown');
  const game={floor:f,player:{floor:1,x,y:hit.point.y,z},time:1,
   state:{gunmuVelocity:0,gunmuJumpUntil:-Infinity},floorBlocks:()=>[],fallInGunmuShaft:()=>{}};
  moveGunmuPlatforms(game,.3,{});
  assert(game.player.y<hit.point.y-.65,'the pipe crown does not catch a falling player');
 }finally{world.dispose();}
});

test('the ward window must be noticed before its silhouette can disappear offscreen',()=>{
 const {world,camera,game,state,f}=layoutFixture(4);
 try{
  const pane=world.materials.wiredWindow,face=pane.userData.face;assert(face);
  const y=f.base+2.14,initial=pane.map;
  camera.position.set(face.x,f.base+1.65,face.z+2.1);
  function faceWindow(yes){camera.lookAt(face.x,y,yes?face.z:face.z+5);camera.updateMatrixWorld(true);}
  function advance(frames){for(let i=0;i<frames;i++)world.update(.05,camera,i*.05,game,false);}
  faceWindow(false);advance(22);assert.equal(pane.map,initial);
  faceWindow(true);advance(12);assert(state.wardWindow.noticed>=.38);
  advance(25);assert.equal(pane.map,initial);
  game.threat={kind:'rush',floor:4,age:0,warning:8};faceWindow(false);advance(22);assert.equal(pane.map,initial);
  game.threat=null;advance(18);assert(state.wardWindow.gone);assert.notEqual(pane.map,initial);
  assert.equal(pane.emissive.getHex(),0);assert(pane.lightMap);
  faceWindow(true);advance(16);assert.notEqual(pane.map,initial);
 }finally{world.dispose();}
});

test('the first passage names the coming scene from its approach and redraws when language changes',()=>{
 const {world,f}=layoutFixture(7),before=getLanguage();try{
  const door=world.doors.find(d=>d.routeDoor),label=door.mesh.children.find(o=>o.material.map?.userData.campaignPrint);assert(label);assert(label.position.z<0);assert.equal(label.rotation.y,Math.PI);
  for(const lang of ['en','zh']){setLanguage(lang);drawings.length=0;world.localize();assert(drawings.includes(lang==='en'?f.scenes[1].titleEn:f.scenes[1].title));}
 }finally{setLanguage(before);world.dispose();}
});

test('a keypad mounts at the real stair approach and changes its indicator after unlock',()=>{
 const {world,f,state,camera,game}=layoutFixture(8);try{
  const record=world.root.userData.interactions.find(r=>r.i.id===f.keypad.id),gate=state.doors.find(d=>d.id===f.exitGateId);
  assert(record.indicator);assert.equal(record.group.position.x,f.keypad.target.x);assert.equal(record.group.position.z,f.keypad.target.z);
  world.update(.05,camera,1,game,false);const locked=record.indicator.material.color.getHex();gate.locked=false;world.update(.05,camera,1,game,false);assert.notEqual(record.indicator.material.color.getHex(),locked);
  assert(world.interactables.some(o=>o.userData.target===f.keypad.id));
 }finally{world.dispose();}
});
test('depot slips and tabletop clocks have visible interaction meshes and react to their floor state',()=>{
 const {world,f,state,scene,game,camera}=layoutFixture(5);
 try{
  scene.updateMatrixWorld(true);
  const records=world.root.userData.interactions;
  const slips=records.filter(r=>r.depotPaper),alarms=records.filter(r=>r.alarmBody);
  assert.equal(slips.length,9);assert.equal(alarms.length,3);
  const crates=slips.filter(r=>r.depotCrate);
  assert.equal(crates.length,3);assert(crates.every(r=>!r.depotPaper.visible));
  for(const {i} of [...slips,...alarms]){
   const from=new T.Vector3(i.approach.x,f.base+1.65,i.approach.z),to=new T.Vector3(i.target.x,f.base+i.target.y,i.target.z);
   const ray=new T.Raycaster(from,to.clone().sub(from).normalize(),0,2.3);
   assert(ray.intersectObjects(world.interactables).some(h=>h.object.userData.target===i.id),i.id+' receives the interaction ray');
  }
  const slip=slips[1],map=slip.depotPaper.material.map,version=map.version;
  state.depotFinds={[slip.i.id]:{digit:'0',slot:2}};
  const alarm=alarms[0];
  state.depotAlarms={[alarm.i.id]:{ringAt:4,ringEnd:8}};
  game.time=1;world.update(.05,camera,1,game,false);
  assert.equal(slip.depotDigit,'0');assert.equal(slip.depotOrdinal,3);assert(map.version>version);
  const crate=crates[0],{tray,lid}=crate.depotCrate,action={id:crate.i.id,elapsed:.44,duration:1.2};
  game.depotCrateAction=action;
  world.update(.05,camera,1,game,false);
  assert(tray.position.x>0&&tray.position.x<crate.i.crate.slide);assert(!crate.depotPaper.visible);
  game.depotCrateAction=null;state.depotCrates={[crate.i.id]:true};
  state.depotFinds[crate.i.id]={digit:'5',slot:3};
  world.update(.05,camera,1.05,game,false);
  assert.equal(tray.position.x,crate.i.crate.slide);assert(lid.rotation.x<-1);assert(crate.depotPaper.visible);
  assert.equal(crate.depotDigit,'5');assert.equal(crate.depotOrdinal,4);
  assert.equal(alarm.alarmBody.rotation.z,0);assert(alarm.alarmHand.rotation.z<0);
  game.time=4.03;world.update(.05,camera,4.03,game,false);
  assert(Math.abs(alarm.alarmBody.rotation.z)>.03);
  game.time=8.1;world.update(.05,camera,8.1,game,false);
  assert.equal(alarm.alarmBody.rotation.z,0);assert.equal(Math.abs(alarm.alarmHand.rotation.z),0);
 }finally{world.dispose();}
});
test('depot lure controls react immediately and the moving tray and remote speaker mark the actual sound source',()=>{
 const {world,f,state,scene,game,camera}=layoutFixture(5);
 try{
  const [chute,intercom]=world.root.userData.interactions.filter(r=>r.lureLamp);
  for(const record of [chute,intercom]){
   const {i}=record,from=new T.Vector3(i.approach.x,f.base+1.65,i.approach.z),to=new T.Vector3(i.target.x,f.base+i.target.y,i.target.z);
   scene.updateMatrixWorld(true);
   const hit=new T.Raycaster(from,to.clone().sub(from).normalize(),0,2.3).intersectObjects(world.interactables);
   assert(hit.some(h=>h.object.userData.target===i.id),i.id+' has a physical interaction surface');
  }
  const speaker=world.root.getObjectByName('depot-speaker-light').parent;
  assert.equal(speaker.position.x,intercom.i.noise.x);
  assert.equal(speaker.position.z,intercom.i.noise.z);
  state.depotAlarms=Object.fromEntries([chute,intercom].map(r=>[r.i.id,{ringAt:2,ringEnd:4.4}]));
  game.time=1;world.update(.05,camera,1,game,false);
  assert(chute.lureLamp.emissiveIntensity>.2&&intercom.lureLamp.emissiveIntensity>.2);
  assert.equal(intercom.speakerLamp.emissiveIntensity,0);
  assert.equal(chute.chuteTray.position.x,.40);
  game.time=2.59;world.update(.05,camera,2.59,game,true);
  const tray=chute.chuteTray.getWorldPosition(new T.Vector3());
  assert(Math.abs(tray.x-chute.i.noise.x)<.01&&Math.abs(tray.z-chute.i.noise.z)<.01);
  assert.equal(chute.chuteTray.rotation.z,0);
  assert(intercom.speakerLamp.emissiveIntensity>.7);
  game.time=4.5;world.update(.05,camera,4.5,game,false);
  assert.equal(intercom.speakerLamp.emissiveIntensity,0);
  assert(Math.abs(chute.chuteTray.position.x+.42)<.01);
 }finally{world.dispose();}
});

test('prepared campaign layouts render all eight floors and do not double the stair threshold floor',()=>{
 for(let id=1;id<=8;id++){const {world,f,scene,camera,game}=layoutFixture(id);try{world.update(.1,camera,1,game,true);scene.updateMatrixWorld(true);assert(world.fixtures.length>=2);const point=new T.Vector3(8.15,f.base+1.65,f.spawn.z+.21),ray=new T.Raycaster(point,new T.Vector3(0,-1,0),0,2),hits=ray.intersectObject(world.root,true).filter(h=>h.object.material===world.materials.floor);assert.equal(hits.length,1,`${id}F stair threshold has a single floor`);if(f.keypad)assert.equal(world.root.userData.interactions.filter(r=>r.photo).length,f.interactions.filter(i=>i.type==='portrait').length);}finally{world.dispose();}}
});

test('chase cabinets collapse visibly and the vent has a solid low canopy',()=>{
 const {world,f,scene,camera,game,state}=layoutFixture(3);try{scene.updateMatrixWorld(true);const vent=f.traversals.find(t=>t.kind==='vent'),p=vent.via[0],ray=new T.Raycaster(new T.Vector3(p.x,f.base+.5,p.z),new T.Vector3(0,1,0),0,1);assert(ray.intersectObject(world.root,true).some(h=>h.distance<.6));const barrier=f.traversals.find(t=>t.kind==='vault'),a=barrier.obstacle,origin=new T.Vector3(a.x+a.w/2,f.base+1.4,a.z+a.d/2+.1),down=new T.Raycaster(origin,new T.Vector3(0,-1,0),0,2);const before=down.intersectObject(world.root,true).find(h=>h.object.material===world.materials.wood);assert(before);state.traversals[barrier.id]=true;world.update(.1,camera,1,game,true);scene.updateMatrixWorld(true);const visibleHits=down.intersectObject(world.root,true).filter(h=>h.object.material===world.materials.wood&&h.object.parent.visible);assert(visibleHits[0].distance>before.distance+.5);}finally{world.dispose();}
});

test('adjacent floor previews keep only five point lights attached to the scene',()=>{
 const {world,f,scene,camera,game,state}=layoutFixture(8),otherFloor={...f,id:7,base:f.base-3.24},other=createCampaignWorld(scene,assets,otherFloor,state);game.states[7]=state;
 try{for(const id of [8,7]){game.player.floor=id;world.update(.1,camera,1,game,true);other.update(.1,camera,1,game,true);let count=0;scene.traverse(o=>{if(o.isPointLight)count++;});assert.equal(count,5);}}finally{world.dispose();other.dispose();}
});

test('both stair cores have a solid blue rear wall and steady local lighting across the turn',()=>{
 for(const id of [8,7]){
  const {world,f,camera,game}=layoutFixture(id);try{
   const stairs=world.stairGroups.find(s=>s.from===id);
   world.root.updateMatrixWorld(true);
   for(const [localZ,height] of [[5.8,1.65],[3.4,.7],[2.05,.03],[6.0,-1.59]]){
    const p=worldStair(localZ>5?3.65:1.625,localZ,stairs.core);
    const origin=new T.Vector3(p.x,f.base+height,p.z);
    const wall=new T.Raycaster(origin,new T.Vector3(-1,0,0),0,4).intersectObject(stairs.group,true).find(hit=>hit.object.material===world.materials.stairPaint);
    assert(Math.abs(wall?.point.x-3)<.01,'blue wall meets the stair deck');
    assert(!clearSight(origin,new T.Vector3(1,origin.y,origin.z),f.sightObstacles));
    camera.position.copy(origin);
    for(let i=0;i<15;i++)world.update(.05,camera,1+i*.05,game,false);
    assert(world.lights.some(light=>light.position.x<8&&light.intensity>8),'a stair sconce lights the nearby landing or flight');
   }
  }finally{world.dispose();}
 }
});

test('partition and perimeter rectangles share a single rendered wall face',()=>{
 const {world,f,scene}=fixture(null,{partitions:[{x:14,z:2,w:.2,d:5},{x:14,z:7,w:.2,d:4}],boundaries:[{minX:14,maxX:14.2,minZ:2,maxZ:11}]});try{scene.updateMatrixWorld(true);for(const z of [3,6.9,7.1,10]){const ray=new T.Raycaster(new T.Vector3(14.55,f.base+1.73,z),new T.Vector3(-1,0,0),0,.7),hits=ray.intersectObject(world.root,true).filter(h=>h.object.material===world.materials.wall);assert.equal(hits.length,1);}}finally{world.dispose();}
});

test('local light pools do not illuminate the camera through a closed room wall',()=>{
 const {world,camera,game,f}=fixture(null,{lamps:[{x:17,z:8},{x:22,z:8}],sightObstacles:[{minX:19,maxX:19.2,minZ:5,maxZ:10,minY:22.68,maxY:25.68}]});try{
  camera.position.set(18,f.base+1.65,8);world.update(.1,camera,20,game,true);
  assert(world.lights.every(light=>light.distance<=9));
  assert(world.lights.some(light=>light.intensity>0&&light.position.x===17));
  assert(!world.lights.some(light=>light.intensity>0&&light.position.x===22));
 }finally{world.dispose();}
});

test('returner warning is a cold light cue and remains visible with reduced flicker',()=>{
 const {world,camera,game,f}=layoutFixture(7);try{
  camera.position.set(f.spawn.x,f.base+1.65,f.spawn.z);game.threat={kind:'rush',floor:7,age:6,warning:8,phase:'warning'};
  world.update(.1,camera,20,game,true);const lit=world.lights.filter(light=>light.intensity>0);assert(lit.length);
  assert(lit.every(light=>light.color.b>light.color.r),'returner warning uses cold white, distinct from the neutral patrol dips');
  const powers=world.fixtures.map(lamp=>lamp.power);game.threat=null;world.update(.1,camera,20,game,true);
  assert(powers.some((power,n)=>power<world.fixtures[n].power-.05),'approaching cold warning also darkens a band of the passage');
 }finally{world.dispose();}
});

test('drawers, cupboards and portraits animate at half search, stay open and can retain uncollected loot',()=>{
 const f=createCampaignBuilding().byId[8],sites=f.interactions.filter(i=>i.form),scene=new T.Scene(),state={doors:[],searched:{},interactions:{},loot:{}};
 for(const i of sites)state.loot[i.id]=i.form==='drawer'?'whole':i.form==='painting'?'mint':'glowstick';
 const world=createCampaignWorld(scene,assets,f,state),camera=new T.PerspectiveCamera(),game={states:{8:state},player:{floor:8}};
 try{for(const r of world.root.userData.interactions.filter(r=>r.motion)){
  const amount=()=>r.i.form==='drawer'?r.motion.position.z:-r.motion.rotation.y;
  game.searching={id:r.i.id,elapsed:.25,duration:.5};world.update(.05,camera,1,game,false);const half=amount();assert(half>0);assert(r.pocket.visible);
  state.searched[r.i.id]=true;game.searching=null;world.update(.05,camera,1,game,false);assert(amount()>half);assert(r.pocket.visible);
  world.root.updateMatrixWorld(true);
  const {approach,target}=r.i;
  const eye=new T.Vector3(approach.x,f.base+1.65,approach.z);
  const direction=new T.Vector3(target.x,f.base+target.y,target.z).sub(eye).normalize();
  const hits=new T.Raycaster(eye,direction,0,2.65).intersectObjects(world.interactables);
  assert(hits.some(({object})=>object.userData.target===r.i.id),r.i.form+' can be picked up at the same aim after opening');
  if(r.i.form!=='drawer'){
   const original=state.loot[r.i.id],shape=r.pocket.children[0];
   state.loot[r.i.id]='energy';world.update(.05,camera,1,game,false);
   const can=r.pocket.getObjectByName('energy-can');
   assert(!shape.visible&&can.visible&&world.interactables.includes(can));
   state.loot[r.i.id]=original;world.update(.05,camera,1,game,false);
   assert(shape.visible&&!can.visible&&r.pocket.children[0]===shape);
  }
  state.loot[r.i.id]=null;world.update(.05,camera,1,game,false);assert(!r.pocket.visible);assert(amount()>half);
 }}finally{world.dispose();}
});

test('physical code slips preserve leading zeroes and only the assigned half is printed',()=>{
 const f=createCampaignBuilding().byId[8],sites=f.interactions.filter(i=>i.form),state={code:'0042',loot:{},doors:[],searched:{},interactions:{}},scene=new T.Scene(),camera=new T.PerspectiveCamera();
 for(const [index,site] of sites.entries())state.loot[site.id]=['whole','front','back'][index];
 const world=createCampaignWorld(scene,assets,f,state),game={states:{8:state},player:{floor:8}};
 try{for(const r of world.root.userData.interactions.filter(r=>r.slip)){
  const expected={whole:'0042',front:'00__',back:'__42'}[state.loot[r.i.id]];
  assert.equal(r.slip.userData.printedCode,expected);assert(drawings.includes(expected));assert(!r.pocket.visible);
  assert(r.slip.material.isMeshStandardMaterial);assert.equal(r.slip.material.emissive.getHex(),0);
  game.searching={id:r.i.id,elapsed:.38,duration:.5};world.update(.03,camera,1,game,false);assert(r.pocket.visible);
 }}finally{world.dispose();}
});

test('collision footprints contain modeled installations in every scene and fluorescent tubes share one draw batch',()=>{
 const inspected=new Set();
 for(const id of [8,7,6,5,4,2]){const {world,scene,f}=layoutFixture(id);try{
  scene.updateMatrixWorld(true);
  for(const wing of f.scenes){
   const r=wing.bounds,prop=f.furniture.find(p=>p.x>=r.x&&p.z>=r.z&&p.x+p.w<=r.x+r.w&&p.z+p.d<=r.z+r.d);if(!prop)continue;
   if(inspected.has(prop.name))continue;inspected.add(prop.name);
   const hits=new Set();for(const x of [.17,.44,.65,.8])for(const z of [.15,.48,.81]){
    const ray=new T.Raycaster(new T.Vector3(prop.x+prop.w*x,f.base+2.75,prop.z+prop.d*z),new T.Vector3(0,-1,0),0,2.65);
    for(const h of ray.intersectObject(world.root,true))if(h.point.y>f.base+.10&&h.point.y<=f.base+prop.height+.04)hits.add(h.object.material);
   }
   for(const side of [-1,1])for(const x of [.19,.37,.62])for(const y of [.28,.52,.8]){
    const ray=new T.Raycaster(new T.Vector3(prop.x+prop.w*x,f.base+prop.height*y,prop.z+prop.d/2+side*(prop.d/2+.2)),new T.Vector3(0,0,-side),0,prop.d+.21);
    for(const h of ray.intersectObject(world.root,true))hits.add(h.object.material);
   }
   assert(hits.size>=2,`${prop.name} has a silhouette and details inside its collision footprint`);
  }
  let batches=0;world.root.traverse(o=>{if(o.isInstancedMesh&&o.count===world.fixtures.length)batches++;});assert.equal(batches,1);
 }finally{world.dispose();}}
 assert(inspected.size>=8);
});

test('light spilling from scene passages and indirect illumination both follow the floor circuit',()=>{
 const {world,f,state,game,camera}=layoutFixture(7);
 try{
  const pools=world.root.children.find(o=>o.userData.thresholdLighting);assert(pools);assert.equal(f.scenePassages.length,3);
  assert(world.materials.floor.lightMap?.isDataTexture);assert(world.materials.floor.lightMap.image.width<128);
  for(const blackout of [false,true,false]){
   state.blackout=blackout;world.update(.1,camera,10,game,true);
   assert.equal(pools.material.opacity>0,!blackout);assert.equal(world.materials.floor.lightMapIntensity>0,!blackout);
   assert.equal(world.lights.some(l=>l.intensity>0),!blackout);
  }
 }finally{world.dispose();}
});

test('neutral warning changes three times per second before a three-second outage and gradual restoration',()=>{
 const {world,camera,game,f}=layoutFixture(7);
 try{const spill=world.root.children.find(o=>o.userData.thresholdLighting),lamp=world.fixtures.find(l=>l.guide);
  const values=reduced=>[0,.38,.72,1.04,1.39,1.72,2.04,7,8.4,9.99,10.65,11.31,null].map(age=>{
   game.states[f.id].blackout=age>=7;game.threat=age===null?null:{kind:'patrol',floor:f.id,warning:7,age};for(let n=0;n<24;n++)world.update(1/60,camera,2,game,reduced);
   const source=world.lights.find(light=>light.parent);assert(source.color.r<source.color.g*1.5);
   assert(Math.abs(world.materials.floor.lightMapIntensity/.72-spill.material.opacity)<.0001);
   const bulbs=world.root.children.find(o=>o.isInstancedMesh),sample=new T.Color();bulbs.getColorAt(lamp.index,sample);
   return [spill.material.opacity,sample.g,source.intensity];
  });
  const normal=values(false),reduced=values(true);
  for(let n=0;n<3;n++){
   for(const cut of [1,3,5]){assert(normal[cut][n]<normal[cut-1][n]*.35);assert(normal[cut+1][n]>normal[cut][n]*2.8);}
   for(const phase of [normal,reduced]){assert(phase.slice(7,10).every(values=>values[n]===0));assert(phase[10][n]>0&&phase[10][n]<phase[11][n]);assert(Math.abs(phase[11][n]-phase[12][n])<.001);}
  }
  let previous=1;
  for(let step=0;step<=70;step++){const value=patrolCircuitPower({kind:'patrol',age:step/10,warning:7},false,true);assert(value<=previous&&previous-value<.024);previous=value;}
 }finally{world.dispose();}
});

test('closed wardrobes have a real view of the hallway at eye level and opaque boards above and below it',()=>{
 const {world,f,scene}=layoutFixture(7);
 try{
  scene.updateMatrixWorld(true);const wardrobe=world.root.userData.interactions.find(r=>r.wardrobe),leaf=wardrobe.wardrobe[0].hinge;
  const hits=y=>{const o=wardrobe.group.localToWorld(new T.Vector3(-.25,y,0)),toward=new T.Vector3(0,0,1).transformDirection(wardrobe.group.matrixWorld);return new T.Raycaster(o,toward,0,.55).intersectObject(leaf,true);};
  assert.equal(hits(1.67).length,0);assert(hits(1.615).length);assert(hits(1.35).length);assert(hits(2).length);
  const window=world.materials.wiredWindow;assert(window.userData.placed);assert.equal(window.emissive.getHex(),0);assert(window.lightMap);
 }finally{world.dispose();}
});

test('wardrobe warning lamps stay lit through Wang’s flicker and expire shortly after the sweep starts',()=>{
 const {world,camera,game,f,state}=layoutFixture(7);
 try{
  const wash=world.root.getObjectByName('wardrobe-warning-wash');
  assert(wash.material.depthTest&&!wash.material.depthWrite);
  const bulb=world.root.children.find(o=>o.material?.emissive?.getHex()===0xffb565).material;
  function step(kind,age){
   game.threat=kind?{kind,floor:f.id,age,warning:7}:null;
   world.update(.1,camera,age+1,game,false);
  }
  step(null,0);assert(!wash.visible);assert.equal(bulb.emissiveIntensity,0);
  step('patrol',.05);const power=bulb.emissiveIntensity;
  assert(wash.visible&&power>0);assert.equal(world.lights.length,5);
  step('patrol',.42);assert.equal(bulb.emissiveIntensity,power);
  state.blackout=true;step('patrol',7.17);assert(wash.visible&&bulb.emissiveIntensity<power);
  step('patrol',7.65);assert(!wash.visible);assert.equal(bulb.emissiveIntensity,0);
  step('rush',1.2);assert(!wash.visible);
 }finally{world.dispose();}
});

test('a physical light slot changes fixtures only after the outgoing light reaches zero',()=>{
 const lamps=Array.from({length:9},(_,i)=>({x:10+i*2,z:8,steady:true})),{world,camera,game}=fixture(null,{lamps});let switches=0;
 try{for(let frame=0;frame<180;frame++){
  const before=world.lights.map(l=>({x:l.position.x,p:l.intensity}));
  camera.position.x=11+Math.max(0,frame-30)*.09;world.update(1/60,camera,frame/60,game,true);
  world.lights.forEach((l,i)=>{if(l.position.x!==before[i].x){assert.equal(before[i].p,0);if(before[i].x!==0)switches++;}});
 }assert(switches>=2);}finally{world.dispose();}
});

test('glowstick arcs from the throwing position, settles and fades without an extra scene light',()=>{
 const {world,game,state,camera}=layoutFixture(8);try{
  const glow=world.root.getObjectByName('tossed-glowstick');state.glowstick={x:18,z:8,fromX:12,fromZ:8,age:0,life:12};
  world.update(.05,camera,1,game,false);assert(glow.visible);assert.equal(glow.position.x,12);const initial=glow.children[0].position.y;
  state.glowstick.age=.08;world.update(.05,camera,1,game,false);assert(glow.children[0].position.y>initial);assert(glow.position.x>12);
  state.glowstick.age=1;world.update(.05,camera,1,game,false);assert.equal(glow.position.x,18);assert(glow.children[0].position.y<.05);
  state.glowstick.age=12;world.update(.05,camera,1,game,false);assert(!glow.visible);assert.equal(world.lights.length,5);
 }finally{world.dispose();}
});

test('a chemical glow borrows a bounded light during blackout and cannot shine through a closed wall',()=>{
 const wall={minX:19,maxX:19.2,minZ:4,maxZ:12,minY:22.68,maxY:25.68};
 const {world,game,state,camera,f}=fixture(null,{sightObstacles:[wall]});try{
  state.blackout=true;state.glowstick={x:18,z:8,fromX:16,fromZ:8,age:1,life:12};camera.position.set(16,f.base+1.65,8);
  for(let n=0;n<8;n++)world.update(.05,camera,1,game,true);
  const chemical=world.lights.find(l=>l.position.x===18&&l.position.z===8);
  assert(chemical&&chemical.intensity>20&&chemical.distance===5.8);assert.equal(world.lights.length,5);
  const patch=world.root.getObjectByName('tossed-glowstick').children.find(o=>o.isMesh);assert(patch.geometry.parameters.width>4);
  camera.position.x=21;world.update(.05,camera,1,game,true);assert.equal(chemical.intensity,0);
  state.glowstick.age=12;world.update(.05,camera,1,game,true);assert.equal(chemical.intensity,0);
 }finally{world.dispose();}
});

test('thrown talisman follows its actual arc and disperses at the landing without a flash or extra light',()=>{
 const {world,game,state,camera}=fixture();try{
  const ward=world.root.getObjectByName('thrown-ward'),paper=ward.getObjectByName('ward-paper'),burst=ward.getObjectByName('ward-dispersal');
  state.wardThrow={fromX:12,fromZ:8,x:16,z:8,age:0,flight:.55,life:1.55,hit:false};
  world.update(.05,camera,1,game,false);assert(ward.visible&&paper.visible&&!burst.visible);assert.equal(ward.position.x,12);
  state.wardThrow.age=.20;world.update(.05,camera,1,game,false);assert(ward.position.x>12&&ward.position.x<16);assert(paper.position.y>1.8);
  state.wardThrow.age=.70;state.wardThrow.hit=true;world.update(.05,camera,1,game,false);
  assert(!paper.visible&&burst.visible);assert.equal(ward.position.x,16);assert.equal(burst.count,12);assert(burst.material.depthTest&&!burst.material.depthWrite);
  const positions=Array.from(burst.instanceMatrix.array);world.update(0,camera,100,game,false);assert.deepEqual(Array.from(burst.instanceMatrix.array),positions);
  const normalOpacity=burst.material.opacity;world.update(.05,camera,1,game,true);assert.equal(burst.material.opacity,normalOpacity);
  state.wardThrow.age=1.55;world.update(.05,camera,1,game,true);assert(!ward.visible);assert.equal(world.lights.length,5);
 }finally{world.dispose();}
});

test('energy loot is a small cylindrical can and code slips remain actual tagged pickup surfaces',()=>{
 const f=createCampaignBuilding().byId[8],sites=f.interactions.filter(i=>i.form),state={code:'1234',loot:{},doors:[],searched:{},interactions:{}},scene=new T.Scene();
 for(const [i,site] of sites.entries())state.loot[site.id]=i===0?'energy':'whole';
 const world=createCampaignWorld(scene,assets,f,state);try{
  const can=world.root.getObjectByName('energy-can');assert(can.geometry.isBufferGeometry&&can.geometry.type==='CylinderGeometry');
  assert.equal(can.userData.target,sites[0].id);assert(can.geometry.parameters.height<.25);
  for(const r of world.root.userData.interactions.filter(r=>r.slip))assert.equal(r.slip.userData.target,r.i.id);
 }finally{world.dispose();}
});

test('wardrobe sides and back intercept interaction rays at the visible near enclosure',()=>{
 const {world,scene}=layoutFixture(2);try{
  const r=world.root.userData.interactions.find(r=>r.wardrobe),back=r.group.children.find(o=>o.userData.wardrobeSurface==='back');
  assert(back&&!back.material.visible&&world.interactables.includes(back));scene.updateMatrixWorld(true);
  const origin=new T.Vector3(0,1.16,-1.5).applyMatrix4(r.group.matrixWorld),direction=new T.Vector3(0,0,1).transformDirection(r.group.matrixWorld);
  const hit=new T.Raycaster(origin,direction,0,3).intersectObjects(world.interactables,false).find(h=>h.object.userData.target===r.i.id);
  assert.equal(hit.object.userData.wardrobeSurface,'back');assert(hit.distance<1.5);
 }finally{world.dispose();}
});

test('Kun floor glow follows heading, clips to walls and current doors, and stops after the pursuit',()=>{
 const wall={minX:8,maxX:24,minZ:5,maxZ:5.2,minY:22.68,maxY:25.68};
 const {world,game,state,camera,f}=fixture(null,{sightObstacles:[wall]});try{
  const fan=world.root.getObjectByName('kun-directional-glow');
  game.threat={kind:'kun',floor:f.id,x:18,z:8,heading:0,phase:'chasing'};world.update(.05,camera,1,game,false);
  assert(fan.visible&&fan.material.depthTest&&!fan.material.depthWrite);assert.equal(world.lights.length,5);
  const p=fan.geometry.attributes.position,middle=13;assert(Math.abs(p.getX(middle)-18)<1e-6);assert(p.getZ(middle)>5.2&&p.getZ(middle)<5.3);
  game.threat.heading=-Math.PI/2;world.update(.05,camera,1,game,false);assert(p.getX(middle)>23&&Math.abs(p.getZ(middle)-8)<1e-6);
  state.doors=[{block:{minX:20,maxX:20.2,minZ:6,maxZ:10}}];world.update(.05,camera,1,game,false);assert(p.getX(middle)<20&&p.getX(middle)>19.9);
  state.doors=[];world.update(.05,camera,1,game,true);const steady=fan.material.opacity;game.threat.fastPursuit=true;world.update(.05,camera,2,game,true);assert(fan.material.opacity>steady&&fan.material.opacity-steady<.1);
  game.mode='lost';world.update(.05,camera,3,game,false);assert(!fan.visible);
  game.mode='playing';game.standbyKun=game.threat;game.threat=null;world.update(.05,camera,3,game,false);assert(!fan.visible);
 }finally{world.dispose();}
});

test('visitor copies get one batched cold spill regardless of range, hidden by walls and warning',()=>{
 const wall={minX:12,maxX:12.2,minZ:7,maxZ:9,minY:22.68,maxY:25.28};
 const {world,camera,game,f}=fixture(null,{sightObstacles:[wall]});
 try{
  const pool=world.root.getObjectByName('visitor-light-pools');
  const copies=[{x:24,z:8},{x:52,z:9},{x:10,z:8}].map(p=>({...p,floor:f.id}));
  game.threat={...copies[0],kind:'yujie',age:2,warning:3,copies};
  world.update(.1,camera,2,game,false);assert(!pool.visible);
  game.threat.age=4;world.update(.1,camera,4,game,false);
  assert(pool.visible);assert.equal(pool.count,2);
  const pose=new T.Matrix4();pool.getMatrixAt(1,pose);
  assert.equal(pose.elements[12],52,'Distant figures keep their own light spill');
  assert(pool.material.depthTest&&!pool.material.depthWrite);
  assert(pool.material.color.b>pool.material.color.r);
  assert.equal(world.lights.filter(l=>l.visible).length,5);
  wall.minZ=10;wall.maxZ=11;world.update(.1,camera,4,game,false);assert.equal(pool.count,3);
  game.threat=null;world.update(.1,camera,5,game,false);assert(!pool.visible);
 }finally{world.dispose();}
});

test('the visitor fades the room into white lamps and restores its warm bounce after leaving',()=>{
 const {world,camera,game,f}=layoutFixture(4);
 try{
  camera.position.set(12.5,f.base+1.65,8);
  const wall=world.materials.wall;
  const draw=()=>world.update(.2,camera,4,game,true);
  draw();
  const normal=world.fixtures.map(l=>l.tint),warmBounce=wall.lightMapIntensity;
  game.threat={kind:'yujie',floor:f.id,x:14.3,z:8,age:2.75,warning:3};
  draw();
  assert(wall.lightMapIntensity<warmBounce&&wall.lightMapIntensity>warmBounce*.34);
  game.threat.age=3.5;
  draw();
 assert(world.fixtures.every(l=>l.tint===0xe2efff));
 assert(world.lights.some(l=>l.intensity>0&&l.color.getHex()===0xe2efff));
  assert(wall.lightMapIntensity<warmBounce*.35);
  game.threat.retreat=1.3;
  draw();
  assert.deepEqual(world.fixtures.map(l=>l.tint),normal);
  assert.equal(wall.lightMapIntensity,warmBounce);
 }finally{world.dispose();}
});

test('the quiet figure waits until seen, then vanishes only behind a physical sight block',()=>{
 const site={x:11,z:8,yaw:0},occluder={minX:13.9,maxX:14.1,minZ:6,maxZ:10,minY:22.68,maxY:25.68};
 const {world,game,f,state,camera}=fixture(null,{quietSite:site,sightObstacles:[occluder]});game.time=5;
 try{const figure=world.root.getObjectByName('quiet-figure'),observe=(x,z)=>{
   camera.position.set(x,f.base+1.6,z);camera.lookAt(site.x,f.base+1.1,site.z);camera.updateMatrixWorld(true);
   for(let n=0;n<12;n++)world.update(.05,camera,10,game,false);
  };
  state.quietEnabled=false;observe(11,11);assert(!figure.visible);assert.equal(state.quietEvent,undefined);state.quietEnabled=true;
  observe(18,8);assert(figure.visible);assert.equal(state.quietEvent.seen,0);observe(11,11);assert(figure.visible);assert(state.quietEvent.seen>.18);
  camera.rotateY(Math.PI);camera.updateMatrixWorld(true);for(let n=0;n<12;n++)world.update(.05,camera,10,game,false);assert(figure.visible);
  observe(18,8);assert(state.quietEvent.gone);observe(11,11);assert(!figure.visible);
 }finally{world.dispose();}
});

test('the stuck push bar responds to held input while the vent mouth is already open for direct entry',()=>{
 const {world,camera,game,state,f}=layoutFixture(3);
 try{
  const door=world.doors.find(d=>d.id===f.chaseDoorId),grate=world.root.getObjectByName('vent-grate'),fan=world.root.getObjectByName('exhaust-fan');
  world.update(.05,camera,1,game,false);const resting=door.pivot.rotation.y;
  game.chaseAction={kind:'push',id:door.id,elapsed:.75,duration:.9};world.update(.1,camera,2,game,false);
  assert(door.pivot.rotation.y<resting-.12);game.chaseAction=null;
  for(let i=0;i<8;i++)world.update(.05,camera,2,game,false);assert(Math.abs(door.pivot.rotation.y-resting)<.002);
  assert(grate.visible&&grate.rotation.x<-1.4);assert.equal(state.ventOpen,undefined);
  state.ventOpen=true;game.time=3;world.update(.2,camera,4,game,false);const angle=fan.rotation.z;
  assert(grate.rotation.x<-1.4);world.update(0,camera,44,game,false);assert.equal(fan.rotation.z,angle);
  assert.equal(world.lights.length,5);
 }finally{world.dispose();}
});

test('independent falling hazards share collision height throughout descent and leave no invisible full-height barrier',()=>{
 const first={...createCampaignBuilding().byId[3].chaseCollapse,id:'rack',kind:'rack'},hazards=[first,
  {...first,id:'panel',kind:'panel',footprint:{x:43.6,z:-8.9,w:.55,d:2.8},cue:{x:38.08,z:-6.2}},
  {...first,id:'duct',kind:'duct',footprint:{x:42.8,z:-17.9,w:.55,d:2.8},cue:{x:50.5,z:-14.8}}];
 const {world,scene,camera,game,state,f}=layoutFixture(3,{chaseCollapse:first,chaseHazards:hazards});
 try{
  const records=world.root.userData.chaseHazards;assert.equal(records.length,3);
  assert.deepEqual(records.map(r=>r.body.userData.kind),['rack','panel','duct']);
  state.chaseCollapseAt=10;state.chaseHazardAt={panel:11,duct:12};game.time=11.6;world.update(.05,camera,11.6,game,true);
  assert.deepEqual(records.map(r=>r.body.userData.phase),['blocking','warning','idle']);
  assert.equal(records[1].body.rotation.y,Math.PI/2);assert(records[1].signal.userData.material.emissiveIntensity>.3);
  assert(Math.abs(chaseHazardAge(f,state,{...first},11.6)-1.6)<1e-10);
  for(const age of [-1,.5,1.15,1.25,1.40,1.60,5.9,6.12,6.35,7]){
   state.chaseCollapseAt=20-age;state.chaseHazardAt={panel:20-age,duct:20-age};game.time=20;world.update(.05,camera,20,game,false);scene.updateMatrixWorld(true);
   for(const {hazard,body} of records){
    const pose=chaseHazardPose(hazard,age),bounds=new T.Box3().setFromObject(body),r=hazard.footprint;
    assert(bounds.min.x>=r.x-1e-5&&bounds.max.x<=r.x+r.w+1e-5,`${hazard.id} X footprint at ${age}`);
    assert(bounds.min.z>=r.z-1e-5&&bounds.max.z<=r.z+r.d+1e-5,`${hazard.id} Z footprint at ${age}`);
    assert(Math.abs(bounds.min.y-f.base-pose.bottom)<1e-5);assert(Math.abs(bounds.max.y-f.base-pose.top)<1e-5);
    assert.equal(body.userData.pose.solid,pose.solid);
    if(pose.solid)assert(bounds.min.y<=f.base+1.65&&bounds.max.y>f.base+.24);
    if(age>hazard.warning+hazard.fallDuration+hazard.hold+hazard.settle)assert(bounds.max.y<f.base+.24);
   }
  }
  assert(records.every(r=>!r.dust.visible&&!r.lit));
  assert.equal(chaseHazards({chaseCollapse:first})[0],first);assert.deepEqual(chaseHazards({}),[]);
 }finally{world.dispose();}
});

test('iron strikes and touched sheets animate only their physical source',()=>{
 const {world,camera,game,state}=layoutFixture(3);try{
  const bridge=world.root.getObjectByName('iron-bridge'),sheets=[0,1].map(i=>world.root.getObjectByName('laundry-sheet-'+i));
  state.clothIndex=1;state.clothAt=3;state.metalAt=3;game.time=3.10;world.update(.1,camera,3,game,false);
  assert(Math.abs(bridge.rotation.z)>.0001);assert(Math.abs(sheets[1].rotation.x)>.1);assert.equal(sheets[0].rotation.x,0);
  game.time=6;world.update(.1,camera,6,game,false);assert.equal(bridge.rotation.z,0);assert.equal(sheets[1].rotation.x,0);
 }finally{world.dispose();}
});

test('the pipe rack warns over the bridge, lands within its collision footprint, and finishes flat',()=>{
 const {world,scene,camera,game,state,f}=layoutFixture(3);try{
  const rack=world.root.getObjectByName('bridge-pipe-collapse'),signal=world.root.getObjectByName('bridge-collapse-warning'),dust=world.root.getObjectByName('bridge-collapse-dust');
  state.chaseCollapseAt=5;game.time=5.5;world.update(.05,camera,5.5,game,false);
  assert.equal(rack.userData.phase,'warning');assert(rack.position.y>2.6);assert(signal.userData.material.emissiveIntensity>.3);
  const nearby=world.fixtures.find(l=>Math.hypot(l.x-f.chaseCollapse.cue.x,l.z-f.chaseCollapse.cue.z)<3),remote=world.fixtures.find(l=>l.x===12);
  assert.equal(nearby.tint,0xe8ad69);assert.equal(remote.tint,remote.normalTint);
  game.time=6.7;world.update(.05,camera,6.7,game,false);scene.updateMatrixWorld(true);
  assert.equal(rack.userData.phase,'blocking');assert(dust.visible);
  const bounds=new T.Box3().setFromObject(rack),r=f.chaseCollapse.footprint;
  assert(bounds.min.x>=r.x&&bounds.max.x<=r.x+r.w);assert(bounds.min.z>=r.z&&bounds.max.z<=r.z+r.d);
  assert(bounds.min.y>f.base&&bounds.max.y>f.base+1.2);
  const y=rack.position.y,angle=rack.rotation.x;world.update(0,camera,99,game,false);assert.equal(rack.position.y,y);assert.equal(rack.rotation.x,angle);
  game.time=12;world.update(.05,camera,12,game,true);scene.updateMatrixWorld(true);
  assert.equal(rack.userData.phase,'settled');assert(!dust.visible);assert(new T.Box3().setFromObject(rack).max.y<f.base+.3);
  assert.equal(nearby.tint,nearby.normalTint);
 }finally{world.dispose();}
});

test('the intake grille closes behind a crawled-in player instead of remaining suspended open',()=>{
 const {world,camera,game,state}=layoutFixture(3);try{
  const grate=world.root.getObjectByName('vent-grate');state.ventOpen=true;world.update(.3,camera,1,game,false);assert(grate.rotation.x<-1.4);
  state.ventSealed=true;for(let n=0;n<10;n++)world.update(.05,camera,1+n*.05,game,false);assert(Math.abs(grate.rotation.x)<.002);
 }finally{world.dispose();}
});

test('the tutorial lever waits for a real view from the landing and depresses only once',()=>{
 const {world,camera,game,state,f,scene}=layoutFixture(8);try{
  const gate=world.doors.find(d=>d.id===f.exitGateId),lever=new T.Vector3();
  scene.updateMatrixWorld(true);gate.handle.getWorldPosition(lever);camera.position.set(gate.x+3,f.base+1.65,gate.z);camera.lookAt(gate.x+8,f.base+1.65,gate.z);camera.updateMatrixWorld(true);
  state.omen={kind:'handle',seenAt:null,started:0};game.time=1;world.update(.05,camera,1,game,false);assert.equal(state.omen.seenAt,null);
  camera.lookAt(lever);camera.updateMatrixWorld(true);world.update(.05,camera,1,game,false);assert.equal(state.omen.seenAt,1);
  game.time=1.4;world.update(.05,camera,1.4,game,false);assert(gate.handle.rotation.z>.9);
  game.time=3;world.update(.05,camera,3,game,false);assert.equal(gate.handle.rotation.z,0);
 }finally{world.dispose();}
});

test('ordinary approach projects a brief moving shadow on a visible wall without changing a lamp',()=>{
 const {world,camera,game,state,f}=layoutFixture(7);try{
  const room=f.scenes[0].bounds,shadow=world.root.getObjectByName('passing-shadow');
  camera.position.set(room.x+1.5,f.base+1.65,room.z+2);camera.lookAt(room.x+1.5,f.base+1.4,room.z);camera.updateMatrixWorld(true);
  game.time=2;world.update(.05,camera,2,game,true);const powers=world.fixtures.map(l=>l.power);
  state.omen={kind:'approach',started:2,seenAt:null};world.update(.05,camera,2,game,true);
  assert.equal(state.omen.seenAt,2);game.time=2.65;world.update(.05,camera,2,game,true);assert(shadow.visible&&shadow.material.opacity>.6);
  assert(Math.abs(shadow.position.z-room.z)<.2,'shadow is seated on the actual facing wall');assert.deepEqual(world.fixtures.map(l=>l.power),powers);
  game.time=4;world.update(.05,camera,2,game,true);assert.equal(shadow.visible,false);
 }finally{world.dispose();}
});
