import test from 'node:test';
import assert from 'node:assert/strict';
import {CampaignGame,makeFloorDeck} from '../src/campaign.js';
import {createCampaignBuilding} from '../src/campaign-layout.js';
import {blocked} from '../src/logic.js';
const building=createCampaignBuilding();
const game=(seed=17)=>new CampaignGame(building,seed);
function floor(g,id){g.enterFloor(id);Object.assign(g.player,g.floor.spawn,{y:g.floor.base});g.cooldown=0;g.immunity=0;return g;}
function search(g,i,pickup=true){
 Object.assign(g.player,i.approach);const yaw=Math.atan2(g.player.x-i.target.x,g.player.z-i.target.z);
 const loot=g.state.loot[i.id];
 assert(g.interact(i.id),i.id);assert(!g.interact(i.id),'cannot collect during opening');
 for(let n=0;n<6;n++)g.tick(.1,{yaw});assert(g.state.searched[i.id]);assert.equal(g.state.loot[i.id],loot);
 if(pickup&&loot)assert(g.interact(i.id));
}
test('each required part has a guaranteed drop and a seeded 70% chance of a second copy',()=>{
 const g=game();let zero=false,copies=0,rolls=0;
 for(let seed=0;seed<256;seed++){g.seed=seed;for(const f of building.floors.filter(f=>f.scenes&&!f.listenerDepot)){
  const s=g.initialFloor(f),drops=Object.values(s.loot);
  assert.match(s.code,/^\d{4}$/);zero ||= s.code[0]==='0';
  const groups=f.id>=6?['whole']:['front','back'];
  for(const group of groups){
   const count=drops.filter(v=>v===group).length;
   assert(count===1||count===2);
   copies+=count-1;rolls++;
  }
  for(const [id,drop] of Object.entries(s.loot))if(['whole','front','back'].includes(drop)){
   assert(groups.includes(drop));
   assert.equal(f.interactions.find(i=>i.id===id).clueGroup,drop);
  }
  assert.deepEqual(g.initialFloor(f).loot,s.loot);
 }}assert(zero);assert(copies/rolls>.66&&copies/rolls<.74);
});
test('a spare copy assembles the same code and can be picked up without rearming floor pressure',()=>{
 const g=floor(game(),4);g.cooldown=999;
 while(Object.values(g.state.loot).filter(kind=>kind==='front').length<2){
  g.seed++;g.states[4]=g.initialFloor(g.floor);
  assert(g.seed<40,'the floor should have duplicate front slips for some seeds');
 }
 const [first,spare]=g.floor.interactions.filter(i=>g.state.loot[i.id]==='front');
 const expected=g.state.code.slice(0,2);
 search(g,spare);
 assert.equal(g.state.codeParts.front,expected);
 assert.equal(g.state.pendingEncounter,'note');
 g.retry();g.cooldown=999;
 assert(g.state.searched[spare.id]);assert.equal(g.state.loot[spare.id],null);
 assert(!g.state.searched[first.id]);assert.equal(g.state.loot[first.id],'front');
 assert.equal(g.codeHint.group,'back');
 search(g,first);
 assert.equal(g.state.loot[first.id],null);assert.equal(g.state.paperNotice,null);
 assert.equal(g.state.pendingEncounter,null);
 search(g,g.floor.interactions.find(i=>g.state.loot[i.id]==='back'));
 assert.equal(g.knownCode,g.state.code);assert.equal(g.codeHint,null);
});
test('turning away interrupts search; reading a painting also records its portrait once',()=>{
 const g=game(),i=g.floor.interactions.find(i=>i.form==='painting');Object.assign(g.player,i.approach);
 assert(g.interact(i.id));g.tick(.1,{yaw:Math.atan2(i.target.x-g.player.x,i.target.z-g.player.z)});assert(!g.searching);assert(!g.state.searched[i.id]);
 search(g,i);assert(g.discoveredPortraits.includes(i.id));g.interact(i.id);assert.equal(g.discoveredPortraits.filter(id=>id===i.id).length,1);
});
test('codes picked up back first survive death; supplies and swaps roll back to entry',()=>{
 const g=floor(game(),4),s=g.state;g.cooldown=999;g.inventory=['mint','glowstick'];
 const site=kind=>g.floor.interactions.find(i=>g.state.loot[i.id]===kind);
 const back=site('back'),front=site('front');search(g,back);assert.equal(g.knownCode,null);assert.equal(s.codeParts.back,s.code.slice(2));
 const extra=g.floor.interactions.find(i=>i.form&&!['whole','front','back'].includes(s.loot[i.id])&&i!==back);
 s.loot[extra.id]='ward';search(g,extra,false);
 assert(!g.interact(extra.id,5));assert.equal(s.loot[extra.id],'ward');
 assert(g.interact(extra.id,1));assert.deepEqual(g.inventory,['mint','ward']);assert.equal(s.loot[extra.id],'glowstick');
 assert(g.interact(extra.id,1));assert.deepEqual(g.inventory,['mint','glowstick']);assert.equal(s.loot[extra.id],'ward');
 s.loot[extra.id]='mint';assert(!g.interact(extra.id,0));assert.equal(s.loot[extra.id],'mint');
 g.stamina=12;g.sanity=65;assert(g.useItem(0,0));assert.equal(g.stamina,12);assert.equal(g.sanity,100);
 assert(g.interact(extra.id));assert.equal(g.inventory[0],'mint');assert.equal(s.loot[extra.id],null);
 g.immunity=0;g.fail('naiwa');g.retry();assert.equal(g.inventory[0],null);assert(g.state.searched[back.id]);assert.equal(g.state.loot[back.id],null);assert(!g.state.searched[extra.id]);search(g,front);assert.equal(g.knownCode,g.state.code);
});
test('interaction range and wardrobe face use the same rejection for prompts and input',()=>{
 const g=floor(game(),7),w=g.floor.interactions.find(i=>i.type==='wardrobe');
 const dx=w.entry.x-w.x,dz=w.entry.z-w.z;
 Object.assign(g.player,{x:w.x-dx,z:w.z-dz});assert.equal(g.interactionReach(w),'front');assert(!g.interact(w.id));
 Object.assign(g.player,{x:w.entry.x+dx*2,z:w.entry.z+dz*2});assert.equal(g.interactionReach(w),'near');assert(!g.interact(w.id));
 Object.assign(g.player,w.entry);assert.equal(g.interactionReach(w),null);assert(g.interact(w.id));assert(g.hiding);
 assert(g.interact(w.id));assert(!g.hiding);
 const i=g.floor.interactions.find(i=>i.form==='drawer');
 Object.assign(g.player,{x:i.target.x+(i.approach.x-i.target.x)*3,z:i.target.z+(i.approach.z-i.target.z)*3});
 assert.equal(g.interactionReach(i),'near');assert(!g.interact(i.id));
});
test('physical keypad accepts leading zero, rejects a guess without death, unlocks only after reading the note',()=>{
 const g=game(),s=g.state,k=g.floor.keypad,d=s.doors.find(d=>d.id===k.gateId);
 assert(d.locked);Object.assign(g.player,k.approach);assert(g.interact(k.id));
 for(const n of s.code)g.keypadKey(n);g.keypadKey('Enter');assert(d.locked);g.keypadKey('Escape');
 s.code='0318';const paper=g.floor.interactions.find(i=>s.loot[i.id]==='whole');search(g,paper);assert.equal(g.knownCode,'0318');
 Object.assign(g.player,k.approach);assert(g.interact(k.id));for(const n of '0754')g.keypadKey(n);g.keypadKey('Enter');assert(d.locked);assert(s.keypadError>0);assert.equal(g.mode,'playing');
 for(let n=0;n<12;n++)g.tick(.1);
 g.keypadKey('0');g.keypadKey('9');g.keypadKey('Backspace');for(const n of '318')g.keypadKey(n);g.keypadKey('Enter');assert(s.approved);assert(!d.locked);assert(d.open);assert(!g.keypadOpen);
});
test('a warning releases the keypad once and reopening it leaves the danger active',()=>{
 const g=floor(game(),7),k=g.floor.keypad;Object.assign(g.player,k.approach);assert(g.interact(k.id));g.keypadKey('0');
 assert(g.beginEncounter('inspector',{...g.player,x:g.player.x+4}));assert(!g.keypadOpen);assert.equal(g.state.keypadInput,'0');assert(g.interact(k.id));g.tick(.1);assert(g.keypadOpen);assert(g.threat.age>0);
 g.resolveThreat();assert(g.beginPatrol());assert(!g.keypadOpen);assert(g.interact(k.id));g.threat.age=6.99;g.tick(.05);
 assert.equal(g.mode,'lost');assert.equal(g.lastCatch,'patrol');assert(!g.keypadOpen);
});
test('a visitor can drain sanity while the keypad is open; unlocking does not dispel her',()=>{
 const g=floor(game(),7),k=g.floor.keypad,visitor={floor:7,x:k.approach.x+3,z:k.approach.z};
 Object.assign(g.player,k.approach);g.state.codeParts.whole=g.state.code;
 assert(g.beginEncounter('yujie',{...visitor,copies:[visitor]}));g.threat.age=4;g.viewed=()=>true;
 assert(g.interact(k.id));g.tick(.1,{pitch:0});assert(g.sanity<100);assert(g.keypadOpen);
 for(const digit of g.knownCode)g.keypadKey(digit);assert(g.keypadKey('Enter'));assert(g.state.approved);assert.equal(g.threat.kind,'yujie');
});
test('a slip found during a warning shows its digits after the all-clear',()=>{
 const g=floor(game(),7),site=g.floor.interactions.find(i=>g.state.loot[i.id]==='whole');
 Object.assign(g.player,site.approach);assert(g.beginEncounter('inspector',{...g.player,x:g.player.x+4}));
 search(g,site);assert.equal(g.knownCode,g.state.code);assert(!g.messages.some(m=>m.text.startsWith('纸条 · ')));
 g.resolveThreat();assert.equal(g.messages.at(-1).text,'走。');for(let n=0;n<22;n++)g.tick(.1);
 assert.equal(g.messages.at(-1).text,'纸条 · '+g.state.code);
});
test('a pursuer survives a valid code until the player has crossed into the departure stair',()=>{
 const g=floor(game(),7),k=g.floor.keypad;g.state.codeParts.whole=g.state.code;
 const visitor={floor:7,x:k.approach.x+3,z:k.approach.z};assert(g.beginEncounter('yujie',{...visitor,copies:[visitor]}));
 Object.assign(g.player,k.approach);assert(g.interact(k.id));for(const digit of g.knownCode)g.keypadKey(digit);assert(g.keypadKey('Enter'));
 for(let n=0;n<20;n++)g.tick(.1,{pitch:-1});assert(g.threat);Object.assign(g.player,g.floor.destination);
 for(let n=0;n<30&&!g.travel;n++)g.tick(.05,{forward:1,yaw:Math.PI/2,pitch:-1});
 assert.equal(g.travel?.core,g.floor.departure);assert.equal(g.threat,null);assert.equal(g.mode,'playing');
});
test('entering a floor snapshots carried supplies, while a new run shares only the static navigation',()=>{
 const g=game();g.inventory[0]='mint';g.jumpFloor(7);g.stamina=10;g.sanity=90;assert(g.useItem(0));
 g.immunity=0;g.fail('naiwa');g.retry();assert.equal(g.inventory[0],'mint');
 const fresh=new CampaignGame(building,18,g.nav);assert.equal(fresh.nav,g.nav);assert.equal(fresh.inventory[0],null);
 assert.equal(fresh.knownCode,null);assert.notEqual(fresh.state.doors[0],g.states[8].doors[0]);assert.deepEqual(fresh.deck,makeFloorDeck(18));
});
test('thrown glowstick stops before a closed door, expires and cannot be spent through the keypad',()=>{
 const g=game(),k=g.floor.keypad,d=g.state.doors.find(d=>d.id===k.gateId);g.inventory[0]='glowstick';Object.assign(g.player,k.approach);assert(g.interact(k.id));assert(!g.useItem(0,0));g.keypadKey('Escape');
 Object.assign(g.player,{x:d.x+1.6,z:d.z});assert(g.useItem(0,Math.PI/2));assert(g.state.glowstick.x>d.x);assert.equal(g.inventory[0],null);
 for(let n=0;n<122;n++)g.tick(.1);assert.equal(g.state.glowstick,null);
});
test('Wang ignores closed rooms but every wardrobe protects, for exact seven second warning',()=>{
 const g=floor(game(),7),w=g.floor.interactions.find(i=>i.type==='wardrobe');Object.assign(g.player,w.entry);assert(g.beginEncounter('patrol'));assert.equal(g.threat.warning,7);g.threat.age=6.98;g.updateThreat(.01,{},0);assert.equal(g.mode,'playing');g.updateThreat(.02,{},0);assert.equal(g.mode,'lost');
 const safe=floor(game(),7);Object.assign(safe.player,w.entry);assert(safe.beginEncounter('patrol'));assert(safe.useWardrobe(w));safe.threat.age=7;safe.updateThreat(.1,{},0);assert.equal(safe.mode,'playing');assert(safe.threat.sealed);
});
test('Liang hears the first running step and resumes a normal investigation after a short pursuit',()=>{
 const g=floor(game(),7);Object.assign(g.player,{x:17,z:23});assert(g.beginEncounter('liang',{floor:7,x:23,z:25}));
 const t=g.threat;assert.equal(t.phase,'patrolling');assert(t.route.length>=3);
 g.tick(.1,{sprint:true});g.tick(.1,{right:1});assert.equal(t.lastNoise,null);
 g.tick(.1,{right:1,sprint:true});assert.equal(t.phase,'investigating');assert.deepEqual(t.lastNoise,{x:g.player.x,z:g.player.z,floor:7});
 for(let i=0;i<10;i++)g.tick(.1,{forward:1});const heard={...t.lastNoise};
 for(let i=0;i<3;i++)g.tick(.1,{forward:1});assert.deepEqual(t.lastNoise,heard);
 for(let i=0;i<100&&t.phase!=='listening';i++)g.tick(.1);
 assert.equal(t.phase,'listening');assert(Math.hypot(t.x-heard.x,t.z-heard.z)<.75);
 for(let i=0;i<30;i++)g.tick(.1);
 assert.equal(t.phase,'patrolling');assert.equal(g.mode,'playing');
});
test('3F has no investigation and Kun never resolves by wardrobe or search timeout',()=>{
 const g=floor(game(),3);assert.equal(g.floor.mode,'chase');assert.equal(g.floor.rooms.length,0);assert(g.beginEncounter('kun',{floor:3,...g.floor.chaseSpawn}));g.threat.age=4;g.threat.hidden=99;g.threat.searched=2;g.updateThreat(.1,{},0);assert(g.threat);assert.equal(g.state.chaseEscaped,false);
});
test('low gaze prevents Yujie sanity drain; multiple copies never stack drain',()=>{
 const g=floor(game(),4);g.beginEncounter('yujie',{floor:4,x:15,z:4,copies:[{floor:4,x:15,z:4},{floor:4,x:16,z:4}]});g.threat.age=4;g.viewed=()=>true;g.updateThreat(.1,{pitch:-1},0);assert.equal(g.sanity,100);g.updateThreat(.1,{pitch:0},0);assert(Math.abs(g.sanity-96.7)<.00001);
});
test('campaign sanity persists, has no passive recovery, and mint restores it at full stamina',()=>{
 const g=game();g.sanity=42;g.enterFloor(7);g.cooldown=999;
 assert.equal(g.sanity,42);
 for(let i=0;i<45;i++)g.tick(.1,{});
 assert.equal(g.sanity,42);
 g.inventory[0]='mint';assert(g.useItem(0));assert.equal(g.sanity,100);assert.equal(g.inventory[0],null);
 g.enterFloor(1);assert(g.beginGunmu());assert.equal(g.sanity,100);
 g.sanity=30;g.retry();assert.equal(g.sanity,100);
});
test('the two slots accept duplicate supplies and retain their key after the other slot is used',()=>{
 const g=game(),items=g.floor.interactions.filter(i=>i.form).slice(0,3);
 assert(Object.values(g.state.loot).includes('ward'),'the starter floor offers a ward without replacing the code');
 for(const item of items)g.state.loot[item.id]='mint';
 assert(g.takeFind(items[0]));assert(g.takeFind(items[1]));
 assert.deepEqual(g.inventory,['mint','mint']);assert(!g.takeFind(items[2]));assert.equal(g.state.loot[items[2].id],'mint');
 g.sanity=50;assert(g.useItem(0));assert.deepEqual(g.inventory,[null,'mint']);
 assert(g.takeFind(items[2]));assert.deepEqual(g.inventory,['mint','mint']);
});
test('ward aim assistance only selects visible NaiWa or the current inspector',()=>{
 for(const kind of ['inspector','naiwa','yujie']){
  const g=floor(game(),6);Object.assign(g.player,{x:9,z:8});g.inventory=['mint','ward'];
  const p={floor:6,x:13,z:8};if(kind==='yujie')p.copies=[{...p},{...p,z:10}];
  assert(g.beginEncounter(kind,p));
  assert.equal(g.wardTarget(Math.PI/2,0),null);assert.equal(g.inventory[1],'ward');
  if(kind==='yujie'){assert.equal(g.wardTarget(-Math.PI/2,0),null);g.threat.age=g.threat.warning+.1;}
  const visible=g.line;g.line=()=>false;
  assert.equal(g.wardTarget(-Math.PI/2,0),null);assert.equal(g.inventory[1],'ward');
  g.line=visible;assert.equal(g.wardTarget(-Math.PI/2,0),kind==='yujie'?null:g.threat);
  assert.deepEqual(g.inventory,['mint','ward']);
 }
});
test('wards leave Gunmu active and preserve an untargeted charge',()=>{
 const g=floor(game(),1);Object.assign(g.player,{x:17.8,z:24});assert(g.beginGunmu());
 const boss=g.threat,yaw=Math.atan2(g.player.x-boss.x,g.player.z-boss.z);g.inventory[0]='ward';
 assert(!g.useItem(0,yaw));assert.equal(g.inventory[0],'ward');assert.equal(g.threat,boss);
});
test('the inspector approaches on an S path, holds between checks, and stops at one and a half metres',()=>{
 const g=floor(game(),6);Object.assign(g.player,{x:9,z:8});
 assert(g.beginEncounter('inspector',{floor:6,x:16,z:8}));
 const t=g.threat;
 let min=8,max=8,pause=0,closeStare=0;
 const dt=1/60;
 for(let i=0;i<870&&g.threat;i++){
  const x=t.x,z=t.z;
  g.updateThreat(dt,{yaw:-Math.PI/2+i*.003},0);
  const travel=Math.hypot(t.x-x,t.z-z),gap=Math.hypot(t.x-g.player.x,t.z-g.player.z);
  assert(travel<=1.13*dt);
  if(t.phase==='between'){pause+=dt;assert.equal(travel,0);}
  if(t.phase==='checking'&&gap<1.501)closeStare+=dt;
  min=Math.min(min,t.z);max=Math.max(max,t.z);
  assert(gap>=1.49999);
 }
 assert(min<7.45&&max>8.55);
 assert(Math.abs(t.x-10.5)<1e-6&&Math.abs(t.z-8)<1e-6);
 assert(pause>1.95&&pause<2.05);
 assert(closeStare>.4,'the inspector remains in place after reaching the stopping line');
 assert.equal(g.threat,null);
 assert.equal(g.mode,'playing');
});
test('opening the maintenance gate wakes the resident Kun and collapsed cabinets cannot be vaulted repeatedly',()=>{
 const g=floor(game(),3),resident=g.standbyKun;g.immunity=8;
 const door=g.state.doors.find(d=>d.id===g.floor.chaseEntryDoorId);
 Object.assign(g.player,{x:door.x-1.4,z:door.z});g.tick(.1);
 assert(resident&&resident.phase==='dormant');assert.equal(g.threat,null);
 assert(g.interact(door.id));for(let i=0;i<6;i++){g.tick(.1,{interactHeld:true});assert.equal(g.threat,null);}
 for(let i=0;i<3;i++)g.tick(.1);
 assert(door.amount>=.85);assert.equal(g.threat,resident);assert.equal(g.standbyKun,null);
 const v=g.floor.traversals[0];Object.assign(g.player,v.a);g.state.traversals[v.id]=true;assert.equal(g.startTraversal(v.id),false);
});
test('chase can be retriggered at the maintenance gate after revisiting its floor',()=>{
 const g=floor(game(),3);
 function trigger(){
  const gate=g.state.doors.find(d=>d.id===g.floor.chaseEntryDoorId);
  assert(g.standbyKun&&!gate.open);Object.assign(g.player,{x:gate.x-1.4,z:gate.z});
  assert(g.interact(gate.id));for(let i=0;i<9;i++)g.tick(.1,{interactHeld:true});
  assert.equal(g.threat?.kind,'kun');
 }
 trigger();g.jumpFloor(4);g.jumpFloor(3);trigger();
});
test('Gunmu seals the entrance, holding the pipe shaft and exit locked until the route is earned',()=>{
 const g=floor(game(),1),f=g.floor.gunmuFinale;assert(g.beginGunmu());
 for(const id of [`1-${g.floor.arrival}`,f.pipeGateId,g.floor.exitGateId]){
  const gate=g.state.doors.find(d=>d.id===id);assert(gate.locked);assert.equal(gate.open,false);
 }
 assert.deepEqual(g.floorRoster,['doubao']);assert.equal(g.auxiliary,null);
});
test('a real drawer click redirects Liang immediately and staying at the drawer is lethal',()=>{
 const g=floor(game(),7),i=g.floor.interactions.find(i=>i.form==='drawer');Object.assign(g.player,i.approach);
 assert(g.beginEncounter('liang'));const t=g.threat;
 assert.equal(g.interact('missing-site'),false);assert.equal(t.lastNoise,null);
 assert(g.interact(i.id));assert.equal(t.phase,'investigating');assert.deepEqual(t.lastNoise,{x:g.player.x,z:g.player.z,floor:7});
 for(let k=0;k<400&&g.mode==='playing';k++)g.tick(.1);
 assert.equal(g.mode,'lost');assert.equal(g.lastCatch,'liang');
});
test('Liang opens an unlocked passage to reach the sound and never unlocks a sealed passage',()=>{
 for(const locked of [false,true]){
  const g=floor(game(),7),d=g.state.doors.find(d=>d.routeDoor);d.locked=locked;
  Object.assign(g.player,{x:d.x+3,z:d.z});assert(g.beginEncounter('liang',{floor:7,x:d.x-3,z:d.z}));const t=g.threat;
  g.tick(.1,{right:1,sprint:true});for(let i=0;i<80&&g.mode==='playing';i++)g.tick(.1);
  assert.equal(d.open,!locked);assert.equal(g.mode,locked?'playing':'lost');if(locked)assert(t.x<d.x);
 }
});
test('the listener clears both sides of a swinging leaf and never flips its hinge during motion',()=>{
 const g=game();
 for(const [id,position,spawn] of [[7,null,{x:38.1,z:24.6}],[5,{x:31.5,z:22},{x:24.85,z:24}],[2,{x:35.5,z:12},{x:28.85,z:8}]]){
  g.jumpFloor(id);g.immunity=0;
  const wardrobe=g.floor.interactions.filter(i=>i.type==='wardrobe')[1],d=g.state.doors.find(d=>d.routeDoor);
  Object.assign(g.player,position??wardrobe.entry);assert(g.beginEncounter('liang',spawn));const t=g.threat;
  if(!position)assert(g.interact(wardrobe.id));else g.hearNoise(g.player);
  let swing=d.swing,changes=0,closest=Infinity;
  for(let frame=0;frame<350&&g.mode==='playing';frame++){
   g.tick(1/60);if(d.swing!==swing){changes++;assert.equal(d.amount,0);swing=d.swing;}
   assert(!blocked(t.x,t.z,[d.block],.24));
   closest=Math.min(closest,Math.hypot(t.x-wardrobe.entry.x,t.z-wardrobe.entry.z));
  }
  assert(changes<=1);assert.equal(g.mode,position?'lost':'playing',id+'F');
  if(!position)assert(closest<.72,'Liang reaches the wardrobe after opening the door');
  g.retry();
 }
});
test('an expired patrol still finishes its rush, searches one nearby spot, and ignores a silent change of direction',()=>{
 const g=floor(game(),7);Object.assign(g.player,{x:11.5,z:24});
 assert(g.beginEncounter('liang',{floor:7,x:25,z:24}));const t=g.threat;t.age=27;
 const noise={x:18,z:24};g.hearNoise(noise);g.tick(.1);assert.equal(g.threat,t);assert.equal(t.phase,'investigating');
 for(let n=0;n<35&&t.phase!=='listening';n++)g.tick(.1);assert(t.probe);
 const probe={...t.probe},heardAt=t.heardAt;
 Object.assign(g.player,{x:24,z:22});assert.deepEqual(g.searchBesideNoise(t),probe);
 g.seed++;assert.notDeepEqual(g.searchBesideNoise(t),probe);g.seed--;
 for(let n=0;n<45&&g.threat;n++)g.tick(.1);assert.equal(t.heardAt,heardAt);assert.equal(g.threat,null);
});
test('the listener can reach a sounding search site or keypad on every ordinary floor, including inside bends',()=>{
 const g=game();
 for(const id of [7,6,5,4,2])for(const site of building.byId[id].interactions.filter(i=>i.form||i.type==='keypad')){
  g.jumpFloor(id);g.retry();g.immunity=0;g.cooldown=999;Object.assign(g.player,site.approach);
  assert(g.beginEncounter('liang'),site.id);assert(g.interact(site.id),site.id);
  if(site.type==='keypad'){assert(g.keypadKey('0'));assert.equal(g.state.keypadInput,'0');assert(g.keypadKey('Escape'));}
  for(let n=0;n<240&&g.mode==='playing';n++)g.tick(.05);
  assert.equal(g.mode,'lost',site.id);assert.equal(g.lastCatch,'liang',site.id);
 }
});
test('Liang investigates a closed wardrobe safely and still hears a thrown glowstick',()=>{
 const g=floor(game(),7),w=g.floor.interactions.find(i=>i.type==='wardrobe');Object.assign(g.player,w.entry);
 assert(g.beginEncounter('liang'));let t=g.threat;assert(g.interact(w.id));assert.deepEqual(t.lastNoise,{floor:7,...w.entry});
 for(let k=0;k<180&&g.mode==='playing';k++)g.tick(.05);assert.equal(g.mode,'playing');assert.equal(g.hiding.id,w.id);
 g.retry();g.immunity=0;Object.assign(g.player,w.entry);assert(g.interact(w.id));assert(g.beginEncounter('liang'));t=g.threat;
 for(let k=0;k<45;k++)g.tick(.05);assert.equal(g.mode,'playing');assert.equal(t.lastNoise,null);
 assert(g.interact(w.id));assert.equal(t.lastNoise,null);
 g.inventory[0]='glowstick';assert(g.useItem(0,-Math.PI/2));
 assert.equal(t.lastNoise,null);for(let i=0;i<4;i++)g.tick(.1);
 assert.equal(t.lastNoise.x,g.state.glowstick.x);assert(t.lastNoise.x>g.player.x+2);
 g.jumpFloor(6);assert.equal(g.threat,null);assert.equal(g.auxiliary,null);
});
