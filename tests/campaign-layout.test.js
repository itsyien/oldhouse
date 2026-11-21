import test from 'node:test';
import assert from 'node:assert/strict';
import {Navigator} from '../src/navigation.js';
import {floorPassable,doorBlock,within} from '../src/building.js';
import {clearSight} from '../src/logic.js';
import {tenantWalls} from '../src/apartment-placements.js';


const campaign=await import('../src/campaign-layout.js').catch(()=>({}));
const create=()=>{assert.equal(typeof campaign.createCampaignBuilding,'function','campaign building must be implemented');return campaign.createCampaignBuilding();};
const doors=(f,open=false)=>f.doorSpecs.map(d=>({...d,floor:f.id,amount:open?1:d.open?1:0,block:doorBlock({...d,amount:open?1:d.open?1:0})}));
const solo=f=>new Navigator({floors:[f],byId:{[f.id]:f},links:[]});
const point=(f,p)=>({floor:f.id,...p});

const building=create();
test('residents’ belongings stand on solid floor, clear of doors, search approaches and walls',()=>{
 for(const f of building.floors){
  assert(f.belongings.length);
  for(const {kind,bounds:b} of f.belongings){
   const label=f.id+'F '+kind;
   assert(f.obstacles.includes(b),label+' missing collision');
   for(const x of [b.minX,b.maxX])for(const z of [b.minZ,b.maxZ])
    assert(f.walkableRects.some(r=>within({x,z},r)),label+' projects beyond the floor');
   for(const w of [...f.boundaries,...f.obstacles].filter(w=>w!==b))
    assert(w.minX>=b.maxX||w.maxX<=b.minX||w.minZ>=b.maxZ||w.maxZ<=b.minZ,label+' overlaps solid geometry');
   for(const i of f.interactions){
    const approach=i.approach||i.entry;if(!approach)continue;
    assert(approach.x<b.minX-.28||approach.x>b.maxX+.28||approach.z<b.minZ-.28||approach.z>b.maxZ+.28,label+' blocks '+i.id);
   }
  }
  const wall=tenantWalls[f.id];if(!wall)continue;
  for(const u of [-.875,0,.875]){
   const x=wall.x+Math.cos(wall.yaw)*u,z=wall.z-Math.sin(wall.yaw)*u;
   assert(f.boundaries.some(b=>x>=b.minX-.005&&x<=b.maxX+.005&&z>=b.minZ-.005&&z<=b.maxZ+.005),'tenant slip needs a solid wall');
  }
 }
});
const wings=building.floors.filter(f=>f.scenes);
const navs=Object.fromEntries(wings.map(f=>[f.id,solo(f)]));
function openDoors(ds,predicate){
 return ds.map(d=>predicate(d)?{...d,amount:1,block:doorBlock({...d,amount:1})}:d);
}
function walkSamples(route,spacing){
 const out=[];
 for(let i=1;i<route.length;i++){
  const [x,z]=route[i-1],[ex,ez]=route[i],length=Math.hypot(ex-x,ez-z),steps=Math.ceil(length/spacing);
  for(let n=0;n<steps;n++)out.push({x:x+(ex-x)*n/steps,z:z+(ez-z)*n/steps});
 }
 const [x,z]=route.at(-1);return [...out,{x,z}];
}

test('new room doors open into a walkable threshold and close across the opening',()=>{
 for(const f of building.floors){
  const ds=doors(f),rooms=ds.filter(d=>d.roomDoor);
  assert(rooms.length>=(f.id===8?2:f.sweepRoute?1:4));
  assert.equal(ds.some(d=>d.sweepThreshold),f.id!==8);
  for(const d of rooms){
   const open=doorBlock({...d,amount:1}),shut=doorBlock({...d,amount:0});
   const before=[d.x-(d.axis==='x'?.55:0),d.z-(d.axis==='z'?.55:0)];
   const after=[d.x+(d.axis==='x'?.55:0),d.z+(d.axis==='z'?.55:0)];
   for(const p of walkSamples([before,after],.06))assert(floorPassable(f,p,.24,[open]),d.id+' opens into a continuous path');
   assert(!floorPassable(f,d,.24,[shut]),d.id+' closed leaf has collision');
   assert(d.title&&d.titleEn,d.id+' has signs in both languages');
  }
 }
});

test('each special venue protects both approaches to the first threshold with a reachable wardrobe',()=>{
 for(const id of [5,3,1]){
  const f=building.byId[id],nav=navs[id]??solo(f),ds=doors(f),threshold=ds.find(d=>d.id===`${id}-vestibule`&&d.sweepThreshold);
  const refuge=f.interactions.find(i=>i.sweepWardrobe);
  assert(refuge&&threshold&&threshold.open);
  for(const x of [threshold.x-.6,threshold.x+.5]){
   const entry=point(f,refuge.entry),path=nav.path(point(f,{x,z:threshold.z}),entry,ds);
   assert(path.length&&path.distance<8,`${id}F wardrobe remains reachable from x=${x}`);
  }
  const blocks=ds.map(d=>d.block);
  for(const p of walkSamples(f.sweepRoute,.08))assert(floorPassable(f,p,.24,blocks),`${id}F sweep stays in the real foyer`);
 }
});

test('the tutorial and each search district have enough pre-lock interactive containers for their clue group',()=>{
 assert.equal(building.floors.length,8);assert.equal(building.links.length,7);assert.equal(wings.length,6);
 const targets={8:['mail'],7:['laundry'],6:['projection'],4:['clinic','clinic'],2:['canteen','canteen']};
 for(const f of wings){
  const sites=f.interactions.filter(i=>i.form),groups=f.listenerDepot?[]:f.id>=6?['whole']:['front','back'];
  const ds=openDoors(doors(f),d=>d.routeDoor),blocks=ds.map(d=>d.block),nav=navs[f.id];
  assert.equal(f.scenes.length,f.id===8?2:4);
  assert(!f.interactions.some(i=>['record','inspect'].includes(i.type)));
  assert(sites.some(i=>i.clueGroup===null));assert.equal(new Set(sites.map(i=>i.id)).size,sites.length);
  for(const [index,key]of groups.entries()){
   const eligible=sites.filter(i=>i.clueGroup===key);assert.equal(eligible.length,f.id===8?2:3);
   assert.equal(new Set(eligible.map(i=>i.sceneId)).size,1);
   assert.equal(f.scenes.find(s=>s.id===eligible[0].sceneId).theme,targets[f.id][index]);
   assert.equal(new Set(eligible.map(i=>i.form)).size,eligible.length);
  }
  if(groups.length===2)assert.notEqual(sites.find(i=>i.clueGroup==='front').sceneId,sites.find(i=>i.clueGroup==='back').sceneId);
  for(const s of [...sites,f.keypad]){
   const viewer={...s.approach,y:f.base+1.65},face={...s.target,y:f.base+s.target.y};
   assert(floorPassable(f,viewer,.24,blocks),s.id+' standing space');
   assert(nav.path(point(f,f.spawn),point(f,viewer),ds).length,s.id+' reachable while the lock is shut');
   assert(Math.hypot(viewer.x-face.x,viewer.z-face.z,viewer.y-face.y)<2.65);
   assert(clearSight(viewer,face,[...f.sightObstacles,...blocks]),s.id+' aimed from the front');
   const back=.72,behind={x:s.x-Math.sin(s.yaw)*back,z:s.z-Math.cos(s.yaw)*back};
   assert(!f.walkableRects.some(r=>within(behind,r)),s.id+' has a real backing wall');
  }
  assert(floorPassable(f,f.quietSite,.22),'quiet figure stands inside architecture');
 }
 assert(building.byId[8].interactions.find(i=>i.ajar&&i.form==='drawer'));
 assert(building.byId[8].interactions.find(i=>i.crooked&&i.form==='painting'));
 for(const link of building.links)assert.equal(building.byId[link.from[0]].departure,building.byId[link.to[0]].arrival);
});

test('entrance dividers conceal the corridor ahead while both flanks remain physically open',()=>{
 for(const f of wings){
  if(f.listenerDepot)continue;
  const first=f.scenes[0].bounds,sign=f.arrival==='A'?1:-1;
  const x=f.id===8?16.9:11+first.w*.43+.15,y=f.base+1.65,z=f.spawn.z;
  assert(!clearSight({...f.spawn,y},{x:x+2,y,z},f.sightObstacles),f.id+' entrance cannot see through the screen');
  const ds=openDoors(doors(f),d=>d.routeDoor),nav=navs[f.id];
  for(const side of [-1,1]){
   const way=point(f,{x,z:z+sign*(side<0?-3:2.25)});
   assert(floorPassable(f,way,.26,ds.map(d=>d.block)));
   assert(nav.path(point(f,f.spawn),way,ds).length&&nav.path(way,point(f,{x:x+2,z}),ds).length);
  }
 }
});

test('one keypad controls the actual downstairs passage and the eighth floor teaches it on a short walk',()=>{
 for(const f of wings){
  const nav=navs[f.id],ds=openDoors(doors(f),d=>d.routeDoor),gate=ds.find(d=>d.id===f.exitGateId);
  assert.equal(f.interactions.filter(i=>i.type==='keypad').length,1);assert.equal(f.keypad.gateId,gate.id);
  assert(!f.doorSpecs.some(d=>d.kind==='judgment'));assert(gate.locked&&!gate.open&&gate.keypadLock);
  if(!f.listenerDepot)assert(Math.hypot(f.keypad.x-gate.x,f.keypad.z-gate.z)<2.4);
  assert(ds.find(d=>d.id===f.id+'-'+f.arrival).open===(f.id<8));
  const blocks=ds.map(d=>d.block),slope={x:7.9,z:gate.z};
  for(let dz=-1.54;dz<=1.54;dz+=.08)assert(!floorPassable(f,{x:gate.x,z:gate.z+dz},.24,blocks),f.id+' no gap around the locked leaf');
  assert(floorPassable(f,slope,.24,openDoors(ds,d=>d.id===gate.id).map(d=>d.block)));
  const walk=nav.path(point(f,f.spawn),point(f,f.keypad.approach),ds);
  assert(walk.length);if(!f.listenerDepot)assert(f.id===8?walk.distance<40:walk.distance>110);
  for(const p of walkSamples(f.mainRoute,.29))assert(floorPassable(f,p,.24,blocks),f.id+' walk trace at '+JSON.stringify(p));
  if(f.id<8){
   const reveal=doors(f).find(d=>d.routeDoor);assert(reveal&&!reveal.open&&!reveal.locked);
   assert.equal(nav.path(point(f,f.spawn),point(f,f.keypad.approach),doors(f)).length,0,'closed interior door controls the reveal');
   assert(doorBlock({...reveal,amount:1}).maxX>reveal.x+1.5,'interior leaf opens away from arrival');
  }
 }
});

test('offset service spines and usable balconies physically change the route through the narrow wings',()=>{
 for(const f of wings.filter(f=>f.id<8&&!f.listenerDepot)){
  const ds=openDoors(doors(f),d=>d.routeDoor),nav=navs[f.id],[a,b]=f.loopPorts;
  assert(nav.path(point(f,f.spawn),point(f,f.loopMid),ds).length,f.id+' reach the balcony from the actual floor entrance');
  const area=f.surfaceRects.reduce((sum,r)=>sum+r.w*r.d,0);
  assert(area>850&&area<1200);
  const serviceLine=[f.mainRoute[11],f.mainRoute[14]];
  assert(walkSamples(serviceLine,.3).some(p=>!floorPassable(f,p,.24)),f.id+' direct cut across the service bends is physically obstructed');
  const mid=(a.z+f.loopMid.z)/2,block={floor:f.id,block:{minX:f.loopMid.x-.18,maxX:f.loopMid.x+.18,minZ:f.loopMid.z<a.z?mid:f.bounds.minZ-1,maxZ:f.loopMid.z>a.z?mid:f.bounds.maxZ+1}};
  const path=nav.path(point(f,a),point(f,b),[...ds,block]);
  assert(path.some(n=>Math.hypot(n.x-f.loopMid.x,n.z-f.loopMid.z)<1.3),f.id+' balcony reconnects');
 }
});

test('the records depot has two physical ways around its racks, nine reachable slips and a separate stair release',()=>{
 const f=building.byId[5],nav=navs[5],ds=openDoors(doors(f),d=>d.routeDoor),blocks=ds.map(d=>d.block);
 const path=(a,b,extra=[])=>nav.path(point(f,a),point(f,b),[...ds,...extra]);
 const y=f.base+1.65,see=(x,z,a,b)=>clearSight({x,z,y},{x:a,z:b,y},f.sightObstacles);
 assert(f.listenerDepot);
 assert.equal(f.doorSpecs.filter(d=>d.routeDoor).length,1);
 assert(!f.doorSpecs.some(d=>d.liminal));
 assert(!see(16,24,20,24),'the intake rack breaks sight from the entrance');
 assert(see(16,24,18.45,27)&&see(16,24,18.45,21.1),'the intake rack has two open flanks');
 const aisle=[{x:34.5,z:20.5},{x:35,z:17}];
 assert(!see(aisle[0].x,aisle[0].z,aisle[1].x,aisle[1].z),'tall central storage interrupts sight');
 for(const [minX,maxX]of [[15,32],[42.1,56]]){
  const obstruction={floor:5,block:{minX,maxX,minZ:18.07,maxZ:19.71}};
  assert(path(...aisle,[obstruction]).length,'the second crossover stays usable if Liang cuts off one flank');
 }
 const route=f.listenerRoute.map(({x,z})=>[x,z]);
 assert(route.length>=10);
 for(const p of walkSamples([...route,route[0]],.24))
  assert(floorPassable(f,p,.27,blocks),'clear patrol at '+JSON.stringify(p));
 const slips=f.interactions.filter(i=>i.type==='depot-slip'),alarms=f.interactions.filter(i=>i.type==='depot-alarm');
 const lures=f.interactions.filter(i=>i.type==='depot-lure');
 assert.deepEqual(slips.map(i=>i.slot),[0,1,2,3,4,5,6,7,8]);
 assert.equal(new Set(slips.map(i=>i.color)).size,9);
 const crates=slips.filter(i=>i.crate);
 assert.equal(crates.length,3);
 for(const {x,z,yaw,crate} of crates){
  const at=offset=>({x:x-Math.sin(yaw)*.11+Math.cos(yaw)*offset,z:z-Math.cos(yaw)*.11-Math.sin(yaw)*offset});
  const host=f.furniture.find(r=>r.name==='record-rack'&&within(at(0),r));
  assert([-.39,.39,crate.slide-.39,crate.slide+.39].every(offset=>within(at(offset),host)),'crate remains mounted to its rack throughout the slide');
 }
 assert.equal(alarms.length,3);
 assert(!f.interactions.some(i=>i.clueGroup));
 for(const [sites,kind] of [[slips,'record-rack'],[alarms,'sorting-bench']]){
  const hosts=sites.map(i=>{
   const back={x:i.x-Math.sin(i.yaw)*.11,z:i.z-Math.cos(i.yaw)*.11};
   return f.furniture.find(r=>(r.name===kind||kind==='sorting-bench'&&r.name==='dispatch-scale')&&within(back,r));
  });
  assert(hosts.every(Boolean)&&new Set(hosts).size===sites.length,`${kind} mounts are distinct`);
 }
 for(const i of [...slips,...alarms,...lures,f.keypad]){
  const a={...i.approach,y},target={...i.target,y:f.base+i.target.y};
  assert(floorPassable(f,a,.27,blocks)&&path(f.spawn,a).length,i.id+' pre-lock access');
  assert(clearSight(a,target,[...f.sightObstacles,...blocks]),i.id+' direct sight from approach');
 }
 assert.deepEqual(lures.map(i=>i.mechanism),['chute','intercom']);
 for(const i of lures){
  assert(floorPassable(f,i.noiseApproach,.27,blocks),i.id+' listener can stop at the source');
  const distance=path(i.approach,i.noiseApproach).distance;
  assert(i.mechanism==='intercom'?distance>25:distance<3,i.id+' source corresponds to the physical device');
 }
 assert(within(f.keypad.approach,f.scenes.at(-1).bounds));
 const exitDoors=openDoors(ds,d=>d.id===f.exitGateId);
 const run=nav.path(point(f,f.keypad.approach),point(f,f.destination),exitDoors);
 assert(run.distance>32&&run.distance<37,`stair sprint is ${Math.round(run.distance)} m`);
});

test('search routes have usable wardrobes within walking distance',()=>{
 for(const f of wings.filter(f=>f.id<8)){
  const nav=navs[f.id],wardrobes=f.interactions.filter(i=>i.type==='wardrobe');
  const ds=openDoors(doors(f),d=>d.routeDoor),blocks=ds.map(d=>d.block);
  for(const w of wardrobes)assert(floorPassable(f,w.entry,.27,blocks),w.id+' clear entry');
  if(f.listenerDepot)for(const w of wardrobes)for(const side of [-.55,.55]){
   const x=w.entry.x+Math.cos(w.yaw)*side,z=w.entry.z-Math.sin(w.yaw)*side;
   assert(floorPassable(f,{x,z},.27,blocks),w.id+' timed exit has a free flank');
  }
  const extra=f.listenerDepot?f.listenerRoute:[...f.loopPorts,f.loopMid];
  const samples=[...walkSamples(f.mainRoute,3),...extra,...f.interactions.filter(i=>i.approach).map(i=>i.approach)];
  for(const p of samples){
   const nearest=wardrobes.toSorted((a,b)=>Math.hypot(a.entry.x-p.x,a.entry.z-p.z)-Math.hypot(b.entry.x-p.x,b.entry.z-p.z)).slice(0,4);
   assert(nearest.some(w=>{const path=nav.path(point(f,p),point(f,w.entry),ds);return path.length&&path.distance/2.4+1.2<=7;}),f.id+' refuge for '+JSON.stringify(p));
  }
 }
 for(const id of [3,1])assert.deepEqual(building.byId[id].interactions.filter(i=>i.type==='wardrobe').map(i=>i.id),[`f${id}-sweep-wardrobe`]);
});

test('the receiving gate is a real shortcut while the cart corridor stays open around it',()=>{
 const f=building.byId[3],nav=solo(f),a=point(f,{x:23.5,z:24}),b=point(f,{x:35,z:24});
 const closed=doors(f),open=openDoors(closed,d=>d.id===f.chaseDoorId);
 const detour=nav.path(a,b,closed),shortcut=nav.path(a,b,open);
 assert(shortcut.length&&detour.length);assert(detour.distance>shortcut.distance+5);
 assert(detour.some(p=>p.z>28)&&shortcut.every(p=>p.z<25.5));
 const vault=f.traversals.find(t=>t.kind==='vault'),vent=f.traversals.find(t=>t.kind==='vent');
 const entered=openDoors(closed,d=>d.id===f.chaseEntryDoorId);
 const escape=nav.path(point(f,f.spawn),point(f,vent.b),entered,false,{agent:'player'});
 assert.deepEqual(escape.filter(p=>p.traversalId).map(p=>p.traversalId),[vault.id,'f3-vault-cart',vent.id]);
 assert(nav.path(point(f,f.chaseSpawn),point(f,vent.a),entered,false,{agent:'kun'}).length,'the pursuer leaves the cage and reaches the fan room');
 assert.equal(nav.path(point(f,f.chaseSpawn),point(f,vent.b),entered,false,{agent:'kun'}).length,0);
 assert(within(vent.b,f.ventSafe));assert(!clearSight({...vent.a,y:f.base+.55},{...vent.b,y:f.base+.55},f.sightObstacles));
});

test('the added service wing requires a real detour and keeps the gate and cart optional',()=>{
 const f=building.byId[3],nav=solo(f),vent=f.traversals.find(t=>t.kind==='vent');
 const start=point(f,f.spawn),finish=point(f,vent.a),closed=doors(f),open=openDoors(closed,()=>true);
 const shortest=nav.path(start,finish,open,false,{agent:'player'});
 assert(shortest.distance>=135&&shortest.distance<150); // The two service loops add roughly 43 m after the motor door.
 assert(shortest.some(p=>p.z<-6)&&shortest.some(p=>p.traversalId==='f3-vault-cart'));
 const gateEntry=point(f,{x:38.08,z:4.6}),gateExit=point(f,{x:38.08,z:-2.8});
 const direct=nav.path(gateEntry,gateExit,open),bypass=nav.path(gateEntry,gateExit,closed);
 assert(bypass.some(p=>p.x>42.5)&&bypass.distance>direct.distance+9);
 const cart=f.traversals.find(t=>t.id==='f3-vault-cart');
 const onFoot=solo({...f,traversals:f.traversals.filter(t=>t!==cart)}).path(point(f,cart.a),point(f,cart.b),closed);
 assert(onFoot.some(p=>p.x<30.15)&&!onFoot.some(p=>p.traversalId===cart.id));
});

test('the motor-room maze has two independent short routes and longer bypasses before the cart',()=>{
 const f=building.byId[3],nav=solo(f),ds=doors(f,true),start=point(f,{x:38,z:-7.5}),finish=point(f,{x:32.5,z:-7.5});
 assert.equal(f.chaseHazards.length,3);assert.equal(f.chaseHazards[0],f.chaseCollapse);
 assert.equal(new Set(f.chaseHazards.map(h=>h.id)).size,3);
 const block=(id,r)=>({id,floor:f.id,block:{minX:r.x,maxX:r.x+r.w,minZ:r.z,maxZ:r.z+r.d}});
 const direct=nav.path(start,finish,ds),hazards=f.chaseHazards.slice(1);
 assert(direct.distance>=42&&direct.distance<49,'the former five-metre connector is now an actual maze');
 assert(direct.some(p=>p.x>49)&&direct.some(p=>p.z<-15),'no near-side shortcut skips either decision');
 const bypassCuts=[{x:39.2,z:-10.3,w:2.6,d:.55},{x:45.2,z:-19,w:2.6,d:.55}];
 for(let mask=0;mask<4;mask++){
  const blocks=hazards.map((h,i)=>block(h.id,mask&(1<<i)?h.footprint:bypassCuts[i]));
  const route=nav.path(start,finish,[...ds,...blocks]);
  assert(route.length,`route choice ${mask} remains connected`);
  assert(route.some(p=>p.x>49)&&route.some(p=>p.z<-15));
  if(mask&1)assert(route.some(p=>p.x>40&&p.x<46.5&&p.z<=-12));
  if(mask&2)assert(route.some(p=>p.x>39&&p.x<47&&p.z<=-20));
  if(mask)assert(route.distance>direct.distance+4,'bypassing a collapse has a real distance cost');
 }
 for(const h of hazards){
  assert(floorPassable(f,h.cue,.27));
  assert(['panel','duct'].includes(h.kind));
  assert(h.warning>=1&&h.fallDuration>0&&h.hold>=4);
 }
 const allFallen=f.chaseHazards.map(h=>block(h.id,h.footprint)),vent=f.traversals.find(t=>t.kind==='vent');
 assert(nav.path(point(f,f.spawn),point(f,vent.b),[...ds,...allFallen],false,{agent:'player'}).some(p=>p.traversalId===vent.id),'simultaneous collapses cannot seal the escape route');
});

test('all collapse warnings start before a full sprint can pass their landing footprints',()=>{
 const f=building.byId[3],nav=solo(f),ds=doors(f,true);
 const approaches=[{x:30.75,z:24},{x:34.4,z:29.1},{x:38.08,z:-3.35},{x:50.5,z:-10.25}];
 for(const [i,p]of approaches.entries()){
  const h=f.chaseHazards[i<2?0:i-1];
  assert(within(p,h.trigger),'both receiving approaches and both maze legs trigger their warning');
  const impact={x:h.footprint.x+h.footprint.w/2,z:h.footprint.z+h.footprint.d/2};
  const route=nav.path(point(f,p),point(f,impact),ds);
  assert(route.length&&route.distance/5>h.warning+h.fallDuration+.15,h.id+' cannot be outrun at sprint speed');
 }
});

test('steel, laundry crossovers and both fan-room entrances present navigable choices with actual eye-level occlusion',()=>{
 const f=building.byId[3],nav=solo(f),doorsClosed=doors(f),entry=point(f,{x:38,z:23}),end=point(f,{x:38,z:8});
 const bridge=nav.path(entry,end,doorsClosed);assert(bridge.some(p=>within(p,f.chaseMetal)));
 const avoidMetal={id:'cover-iron',floor:3,block:{minX:f.chaseMetal.x,maxX:f.chaseMetal.x+f.chaseMetal.w,minZ:f.chaseMetal.z,maxZ:f.chaseMetal.z+f.chaseMetal.d}};
 const cloth=nav.path(entry,end,[...doorsClosed,avoidMetal]);assert(cloth.length&&cloth.distance>bridge.distance+8);
 assert(f.chaseCloth.slice(0,2).every(c=>cloth.some(p=>within(p,c))),'both laundry curtain gaps lie on the quiet route');
 const height=f.base+1.65,see=(x,z,tx,tz)=>clearSight({x,z,y:height},{x:tx,z:tz,y:height},f.sightObstacles);
 assert(see(24,24,14.6,15),'the running fan behind the receiving cage is visible in advance');
 assert(see(22,9.79,22,11.9));assert(!floorPassable(f,{x:22,z:10.51}),'observation mesh stops bodies');
 assert(!see(22,9.79,22,16.5),'the solid machine hides its far side');
 assert(floorPassable(f,f.chaseSpawn,.27),'set dressing leaves the resident room clear');
 for(const opening of [17.6,28.8])assert(floorPassable(f,{x:opening,z:10.5},.32));
 for(const p of f.chaseSearchPoints)assert(floorPassable(f,p,.25));
});

test('traversal routing keeps actor permissions and collapsed state out of the architectural cache',()=>{
 const f=create().byId[3],nav=solo(f),vent=f.traversals.find(t=>t.kind==='vent'),a=point(f,{x:f.chaseRoute[0][0],z:f.chaseRoute[0][1]}),b=point(f,vent.b);
 assert(nav.path(a,b,[],true,{agent:'player'}).length);assert.equal(nav.path(a,b,[],true,{agent:'kun'}).length,0);
 const t=f.traversals.find(t=>t.kind==='vault'),normal=nav.path(point(f,t.a),point(f,t.b),[],true,{agent:'kun'}),collapsed=nav.path(point(f,t.a),point(f,t.b),[],true,{agent:'kun',traversals:{[t.id]:true}});
 assert.equal(normal.find(p=>p.traversalId===t.id).duration,3.2);assert.equal(collapsed.find(p=>p.traversalId===t.id).duration,0);
});

test('Kun takes the faster detour instead of a short slow vault while distance remains metres',()=>{
 const f={id:1,campaign:true,stairCores:[],bounds:{minX:0,maxX:12,minZ:0,maxZ:7},walkableRects:[{x:0,z:0,w:12,d:7}],obstacles:[{minX:5.5,maxX:6.5,minZ:0,maxZ:5.5}],traversals:[{id:'slow-vault',kind:'vault',a:{x:4.5,z:2},b:{x:7.5,z:2},playerDuration:.55,enemyDuration:10}]},nav=solo(f),a={floor:1,x:3,z:2},b={floor:1,x:9,z:2};
 const kun=nav.path(a,b,[],false,{agent:'kun'}),player=nav.path(a,b,[],false,{agent:'player'});
 assert(!kun.some(p=>p.traversalId),'the detour takes less than the ten-second vault');assert(player.some(p=>p.traversalId));assert(kun.distance>player.distance);assert(kun.duration<10);
 assert.equal(nav.path(a,b,[],true,{agent:'kun'}).filter(p=>p.traversalId).length,1,'architectural distance remains shortest physical route');
});

test('campaign landing thresholds admit entry into the existing real stairs',()=>{
 for(const f of create().floors)for(const core of f.stairCores){const p={x:8.1,z:core==='A'?8:24};assert(floorPassable(f,p,.24,doors(f,true).map(d=>d.block)),`${f.id}-${core} doorway`);}
});

test('sealed service shortcuts cannot accidentally lock the shared stair navigation link',()=>{
 const b=create(),nav=new Navigator(b),ds=b.floors.flatMap(f=>doors(f).map(d=>d.id===`${f.id}-${f.departure}`?{...d,amount:1,block:doorBlock({...d,amount:1})}:d));
 const path=nav.path({floor:8,x:8.8,z:24},{floor:7,x:8.8,z:24},ds);assert(path.some(p=>p.core==='B'),'opened stair doors connect the adjacent prepared floors');
});

test('the final isolation bay has two lanes and seals completely, with a gated bypass to the shaft',()=>{
 const f=create().byId[1],nav=solo(f),finale=f.gunmuFinale,ds=doors(f);
 const lever=f.interactions.find(i=>i.id===finale.trap.leverId);
 const bay={x:35.65,z:24};
 const closed=ds.map(d=>d.id===finale.trap.gateId?{...d,block:doorBlock({...d,amount:0}),amount:0}:d);
 assert(nav.path(point(f,finale.spawn),point(f,bay),ds).length,'lure starts outside the repair bay');
 for(const z of [21.65,26.35]){
  const entry={x:31,z};
  assert(floorPassable(f,entry));
  assert(nav.path(point(f,entry),point(f,bay),ds).length,'each side of the repair island has an exit lane');
 }
 assert(floorPassable(f,lever.approach));
 assert.equal(nav.path(point(f,bay),point(f,lever.approach),closed).length,0,'a lowered shutter isolates both lanes');
 assert.equal(nav.path(point(f,lever.approach),point(f,finale.pipeEntry),ds).length,0);
 const bypass=openDoors(closed,d=>d.id===finale.pipeGateId);
 assert(nav.path(point(f,lever.approach),point(f,finale.pipeEntry),bypass).length,'the open shaft remains reachable around the isolated bay');
});

test('the folded pipe course has four safe corners, real gaps and a grounded exit',()=>{
 const f=create().byId[1],finale=f.gunmuFinale,{platforms,sections,route,groundEdge,shaft}=finale,gate=f.doorSpecs.find(d=>d.id===f.exitGateId);
 assert.equal(platforms[0].y,0);assert.equal(platforms.at(-1).y,0);
 assert(floorPassable(f,finale.pipeEntry));
 const walk=[...route,{...f.destination,y:0}];
 const length=walk.reduce((sum,p,i)=>i?sum+Math.hypot(p.x-walk[i-1].x,p.y-walk[i-1].y,p.z-walk[i-1].z):sum,0);
 assert(length>=250&&length<=260&&shaft.w<100,'folding the shaft preserves the full running distance');
 assert.equal(sections.length,5);
 assert(platforms.some(p=>p.kind==='beam'&&p.d<1));
 assert(platforms.filter(p=>p.kind==='pipe'&&p.slip&&Math.min(p.w,p.d)<=1.2).length>=5);
 const directions=platforms.map(p=>p.axis+String(p.direction));
 assert.deepEqual(directions.filter((s,i)=>!i||s!==directions[i-1]),['x1','z1','x-1','z1','x1']);
 assert.equal(platforms.filter(p=>p.turn).length,4);
 const heights=platforms.map(p=>p.y),lowest=Math.min(...heights),highest=Math.max(...heights);
 assert(lowest< -4&&highest>5&&heights.indexOf(lowest)<heights.indexOf(highest));
 assert(finale.voidY<lowest-5);
 for(const [i,{first,last}] of sections.entries()){
  assert(last-first>=5);
  assert.equal(first,i===0?0:sections[i-1].last+1);
 }
 assert.equal(sections.at(-1).last,platforms.length-1);
 assert(!f.lamps.some(l=>l.x>=groundEdge));
 const separation=(p,q,axis,span,inset=0)=>Math.max(0,
  q[axis]-(p[axis]+p[span])+inset,p[axis]-(q[axis]+q[span])+inset);
 const jumpReach=(p,q)=>5*(6.4+Math.sqrt(6.4**2-32*(q.y-p.y)))/16;
 for(const [i,p]of platforms.entries()){
  assert(within(route[i],p));assert(within(route[i],finale.shaft));
  const next=platforms[i+1];if(!next)continue;
  const {axis,direction}=p.turn??p,span=axis==='x'?'w':'d',across=axis==='x'?'z':'x',crossSpan=axis==='x'?'d':'w';
  const launch=direction>0?p[axis]+p[span]:p[axis],land=direction>0?next[axis]:next[axis]+next[span];
  const gap=(land-launch)*direction,lateral=separation(p,next,across,crossSpan,.6);
  assert(gap>=.9&&Math.hypot(gap+1.05,lateral)<jumpReach(p,next)*.85,`jump ${i+1} leaves a landing margin`);
  assert(next.axis===axis&&next.direction===direction);
  if(p.turn)assert(p.kind==='catwalk'&&Math.min(p.w,p.d)>3.8,'an actual landing supports the quarter turn');
  const midpoint={...route[i],[axis]:(launch+land)/2};
  assert(!f.surfaceRects.some(r=>within(midpoint,r)),'ordinary floor does not bridge the gap');
  for(const later of platforms.slice(i+2)){
   const gap=Math.hypot(separation(p,later,'x','w'),separation(p,later,'z','d'));
   assert(!(gap<jumpReach(p,later)+.59),'even a late sprint jump cannot skip to another lane');
  }
 }
 assert(within(gate,platforms.at(-1)));assert(within(f.destination,f.exit));assert(within(f.destination,platforms.at(-1)));
 assert(!f.boundaries.some(b=>b.minX<groundEdge&&b.maxX>groundEdge&&b.minZ<finale.pipeEntry.z&&b.maxZ>finale.pipeEntry.z));
});
