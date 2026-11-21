import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GameAudio} from '../src/audio.js';
const param=()=>({value:0,setTargetAtTime(v){this.value=v;},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}});
class Node{constructor(){for(const k of ['gain','pan','playbackRate','threshold','ratio','attack','release'])this[k]=param();}connect(n){return n;}disconnect(){}start(...timing){this.started=true;this.timing=timing;}stop(){this.stopped=true;queueMicrotask(()=>this.onended?.());}}
class Context{constructor(){this.currentTime=0;this.state='suspended';this.destination=new Node();}createGain(){return new Node();}createDynamicsCompressor(){return new Node();}createStereoPanner(){return new Node();}createBufferSource(){return new Node();}async resume(){this.state='running';}async decodeAudioData(a){return{data:a};}}
test('listener steps come from the moving actor, stop at rest, and the warden makes one pass sound',()=>{
 const audio=new GameAudio(),events=[];
 audio.ctx=new Context();audio.master=new Node();audio.ctx.sampleRate=24000;
 audio.ctx.createBuffer=(_,length)=>({getChannelData:()=>new Float32Array(length)});
 audio.play=(id,volume,pan)=>events.push({id,volume,pan});
 const listener={kind:'liang',phase:'patrolling',x:2,z:0};
 const game={building:{campaign:true},player:{x:0,z:0},state:{},threat:listener,line:()=>true};
 const frame=()=>audio.update(game,'playing',35,0);
 frame();assert.equal(events.length,0);
 listener.x=3.3;frame();const step=events.at(-1);
 assert.equal(step.id,'liang-step');assert.equal(step.pan,1);
 frame();assert.equal(events.at(-1),step);
 game.threat={kind:'doubao'};game.auxiliary=listener;game.line=()=>false;listener.x=4.6;frame();
 assert.equal(events.at(-1).id,'liang-step');assert(events.at(-1).volume<step.volume);
 listener.waitingDoor='7-through-door';frame();const knock=events.at(-1);
 assert.equal(knock.id,'power-off');assert.equal(knock.pan,1);frame();assert.equal(events.at(-1),knock);
 events.length=0;
 game.auxiliary=null;game.threat={kind:'patrol',phase:'warning'};frame();
 game.threat.phase='sweeping';frame();frame();assert.equal(events.filter(e=>e.id==='sweep-pass').length,1);
 game.threat=null;game.time=12;game.state.metalAt=12;frame();frame();
 assert.equal(events.filter(e=>e.id==='steel').length,1);
 game.time=14;game.state.metalAt=14;audio.update(game,'playing',0,0);frame();
 assert.equal(events.filter(e=>e.id==='steel').length,1,'unmuting does not replay a previous footfall');
});
test('Liang shifts from heavy footsteps to rushing at a noise without a cue for every pulse',()=>{
 const audio=new GameAudio(),events=[];
 audio.ctx=new Context();audio.master=new Node();audio.ctx.sampleRate=24000;
 audio.ctx.createBuffer=(_,length)=>{const samples=new Float32Array(length);return{getChannelData:()=>samples};};
 const mix={};audio.loop=(id,volume)=>{mix[id]=volume;};
 audio.play=(id,volume,pan,rate=1)=>events.push({id,volume,pan,rate});
 const listener={kind:'liang',phase:'patrolling',x:0,z:-4};
 const game={building:{campaign:true},player:{x:0,z:0},state:{},threat:listener,time:0,line:()=>true};
 const frame=(delta=.1,volume=35)=>{game.time+=delta;audio.update(game,'playing',volume,Math.PI/2);};
 frame();events.length=0;
 listener.z-=.8;frame();assert.equal(events.length,0);
 listener.z-=.2;frame();
 assert.equal(events[0].id,'liang-step');assert.equal(events[0].rate,1);
 listener.phase='investigating';frame();
 assert.equal(events[1].id,'liang-inhale');assert.equal(events[1].pan,1);
 listener.z-=1.9;frame(.33);
 assert.equal(events[2].id,'liang-step');assert(events[2].rate>1);
 listener.phase='listening';frame();
 assert.deepEqual(events.slice(3).map(e=>[e.id,e.pan,e.rate]),[['liang-step',1,.72],['liang-inhale',1,.69]]);
 assert(mix['room-tone']<.05&&mix['background-music']<.07);
 listener.z-=1.5;frame();assert.equal(events.length,5,'the slow probe does not resume the footfall rhythm');
 const pivots=()=>events.filter(e=>e.id==='liang-inhale'&&e.rate===1).length;
 listener.phase='investigating';frame(1);
 assert.equal(pivots(),1);
 frame(.1,0);frame(.1);
 assert.equal(pivots(),1);
 listener.phase='patrolling';frame(4);
 assert.equal(mix['background-music'],.26);
 listener.phase='investigating';frame();
 assert.equal(pivots(),2);
 for(const id of ['liang-step','liang-inhale']){
  const samples=audio.buffers.get(id).getChannelData(0);
  const peak=samples.reduce((max,value)=>Math.max(max,Math.abs(value)),0);
  assert(peak>.1&&peak<=1);
 }
});
test('audio unlock, bounded voices, muted state and repeated pause/resume do not stack loops',async()=>{
 const original={AudioContext:globalThis.AudioContext,fetch:globalThis.fetch};let loads=0;
 globalThis.AudioContext=Context;
 globalThis.fetch=async url=>{loads++;return{ok:true,arrayBuffer:async()=>fs.readFileSync(new URL('../public'+url,import.meta.url))};};
 try{
  const a=new GameAudio();assert(!a.ctx);assert.equal(a.play('click'),false);await a.unlock();await a.loading;assert.equal(loads,18);assert.equal(a.buffers.size,18);
  const g={threat:null,player:{x:0,z:0},state:{blackout:false},line:()=>true};
  a.update(g,'playing',35,0);assert.equal(a.loops.size,2);
  for(let i=0;i<20;i++)a.play('click');assert.equal(a.voices.size,6);await Promise.resolve();assert.equal(a.voices.size,6);
  g.threat={kind:'liang',x:5,z:0,pressure:.5};for(let i=0;i<20;i++)a.update(g,'playing',35,0);assert.equal(a.loops.size,3);
  const open=a.loops.get('tv-static').gain.gain.value;g.line=()=>false;a.update(g,'playing',35,0);assert(Math.abs(a.loops.get('tv-static').gain.gain.value/open-.3)<1e-6);
  a.update(g,'playing',0,0);assert.equal(a.master.gain.value,0);assert.equal(a.play('scare'),false);
  for(let i=0;i<3;i++){a.stop();assert.equal(a.loops.size,0);assert.equal(a.voices.size,0);await a.unlock();a.update(g,'playing',35,0);assert.equal(a.loops.size,3);}
  assert.equal(loads,18);a.stop();a.update(g,'scare',35,0,false,.25);assert.equal(a.loops.size,0);assert.equal(a.voices.size,0);
  assert.equal(a.master.gain.value,35/100*.7*.25);assert(a.play('scare'));assert.equal(a.voices.size,1);a.update(g,'scare',0,0);assert.equal(a.master.gain.value,0);
  a.stop();assert.equal(a.voices.size,0);a.update(g,'paused',35,0);assert.equal(a.master.gain.value,0);a.update(g,'playing',35,0,true);assert.equal(a.master.gain.value,0);a.stop();
 }finally{Object.assign(globalThis,original);}
});
test('stone playback replaces ambience, resumes at the current verse and yields to the room on cutoff',()=>{
 const audio=new GameAudio();
 audio.ctx=new Context();audio.master=new Node();audio.ambience=new Node();audio.sfx=new Node();
 for(const id of ['stone-speak','room-tone','background-music'])audio.buffers.set(id,{});
 const game={time:10,player:{x:0,z:0},state:{}};
 const frame=(mode='playing',background=true)=>audio.update(game,mode,35,0,false,1,background);
 frame();const bed=audio.loops.get('background-music');
 game.state.stonePlayback={site:{x:2,z:0},startedAt:10};
 frame();const first=audio.loops.get('stone-speak');
 assert(!first.source.loop);assert.equal(bed.gain.gain.value,0);assert(first.panner.pan.value>0);
 assert.equal(first.gain.gain.value,1.56/(1+2/13));
 frame('paused');assert(first.source.stopped);
 game.time=14;frame('playing',false);assert.deepEqual(audio.loops.get('stone-speak').source.timing,[0,4]);
 game.state.stonePlayback=null;frame();assert(!audio.loops.has('stone-speak'));assert(bed.gain.gain.value>0);
});
test('audio assets retain their provenance and matching checksums',async()=>{
 const {createHash}=await import('node:crypto');
 const list=JSON.parse(fs.readFileSync(new URL('../public/assets/audio/sources.json',import.meta.url)));
 assert.equal(list.length,18);
 for(const a of list){
  if(a.file.endsWith('.ogg')){assert.equal(a.license,'CC0-1.0');assert(a.source.startsWith('https://'));}
  else {assert.equal(a.source,a.id==='stone-speak'?'User-provided download':'User-provided SFX folder');assert.equal(a.license,null);assert(a.sourceFile.endsWith('.mp3'));}
  const data=fs.readFileSync(new URL('../public/assets/audio/'+a.file,import.meta.url));
  assert.equal(createHash('sha256').update(data).digest('hex'),a.sha256);
 }
});
test('background audio fades separately while Naiwa, the sweeps and jump scare cues stay active',()=>{
 const a=new GameAudio();
 a.ctx=new Context();a.master=new Node();a.ambience=new Node();a.sfx=new Node();
 const ids=['room-tone','background-music','naiwa-spawn','sweep-warning','sweep-pass','actor-scare','scare','sweeper-scare','tenno-return'];
 for(const id of ids)a.buffers.set(id,{id});
 const game={threat:null,player:{x:0,z:0},state:{},line:()=>true};
 const frame=(background=false,volume=35)=>a.update(game,'playing',volume,0,false,1,background);
 const played=()=>[...a.voices].map(s=>s.buffer.id);
 frame();assert.equal(a.loops.size,0);
 frame(true);const bed=a.loops.get('background-music');assert(bed.source.loop);assert(bed.gain.gain.value>0);
 frame();assert.equal(bed.gain.gain.value,0);assert.equal(a.loops.get('room-tone').gain.gain.value,0);assert(a.master.gain.value>0);
 game.threat={kind:'naiwa',phase:'warning'};frame();frame();assert.deepEqual(played(),['naiwa-spawn']);
 game.threat={kind:'rush',phase:'warning',wave:1};frame();frame();
 Object.assign(game.threat,{phase:'sweeping'});frame();frame();
 Object.assign(game.threat,{phase:'return-warning',wave:2});frame();frame();
 Object.assign(game.threat,{phase:'sweeping'});frame(false,0);frame();
 assert.deepEqual(played(),['naiwa-spawn','sweep-warning','sweep-pass','sweep-warning']);
 for(const kind of ['naiwa','doubao','inspector','yujie','liang','kun','patrol','rush']){
  assert(a.playScare(kind));const voice=[...a.voices].at(-1);
  const expected=kind==='kun'?'scare':kind==='patrol'||kind==='rush'?'sweeper-scare':'actor-scare';
  assert.equal(voice.buffer.id,expected);assert.equal(voice.timing[1],expected==='actor-scare'?.35:0);
 }
 frame(true);assert.equal(a.loops.get('background-music'),bed);assert(bed.gain.gain.value>0);a.stop();
});
test('both sweepers use the same dedicated scare recording from its first sample and respect mute',()=>{
 const audio=new GameAudio();
 audio.ctx=new Context();audio.master=new Node();audio.sfx=new Node();
 const game={threat:{kind:'patrol'},player:{x:0,z:0},state:{},line:()=>true};
 const clip={duration:8.098};
 audio.buffers.set('sweeper-scare',clip);
 audio.buffers.set('sweep-pass',{duration:4.101});
 audio.buffers.set('sweep-lunge',{duration:.46});
 assert.equal(audio.playScare('patrol'),false);
 audio.update(game,'scare',35,0);audio.update(game,'scare',35,0);
 assert.equal(audio.voices.size,0);assert.equal(audio.loops.size,0);
 assert(audio.playScare('patrol'));assert.equal(audio.voices.size,1);
 const source=[...audio.voices][0];assert.equal(source.buffer,clip);assert.equal(source.playbackRate.value,1);assert.deepEqual(source.timing,[0,0]);
 audio.update(game,'scare',0,0);assert.equal(audio.playScare('rush'),false);assert.equal(audio.master.gain.value,0);
 assert.equal(audio.voices.size,1);
});
test('Tenno uses the dedicated second-pass recording once after the original return warning',()=>{
 const a=new GameAudio();a.ctx=new Context();a.master=new Node();a.sfx=new Node();
 for(const id of ['sweep-warning','sweep-pass','tenno-return'])a.buffers.set(id,{id,duration:9});
 const threat={kind:'rush',phase:'warning',warning:5.6,age:0,wave:1};
 const game={threat,player:{x:0,z:0},state:{},line:()=>true};
 const frame=()=>a.update(game,'playing',35,0);
 frame();
 Object.assign(threat,{phase:'sweeping',age:5.6});frame();frame();
 Object.assign(threat,{phase:'return-warning',age:8.5,wave:2});frame();frame();
 Object.assign(threat,{phase:'sweeping',age:10.18});frame();frame();
 const voices=[...a.voices];
 assert.deepEqual(voices.map(s=>s.buffer.id),['sweep-warning','sweep-pass','sweep-warning','tenno-return']);
 assert.deepEqual(voices.at(-1).timing,[0,.30]);
});
test('Yujie ambience starts at reveal, fades out after the visit, and follows the background switch',()=>{
 const a=new GameAudio();a.ctx=new Context();a.master=new Node();a.ambience=new Node();
 for(const id of ['background-music','yujie-background'])a.buffers.set(id,{id,duration:26});
 const threat={kind:'yujie',floor:4,age:2.99,warning:3,retreat:0};
 const game={threat,player:{floor:4,x:0,z:0},state:{},line:()=>true};
 const frame=(background=true)=>a.update(game,'playing',35,0,false,1,background);
 frame();
 assert(!a.loops.has('yujie-background'));
 threat.age=3;frame();frame();
 const bed=a.loops.get('yujie-background'),music=a.loops.get('background-music');
 assert(bed.source.loop&&bed.gain.gain.value>.4);
 assert.equal(bed.source.loopEnd,18.1);assert(music.gain.gain.value<.1);
 frame(false);assert.equal(bed.gain.gain.value,0);assert.equal(music.gain.gain.value,0);
 frame();assert.equal(a.loops.get('yujie-background'),bed);assert(bed.gain.gain.value>.4);
 threat.retreat=.65;frame();assert.equal(bed.gain.gain.value,.24);
 game.threat=null;frame();assert.equal(bed.gain.gain.value,0);assert.equal(music.gain.gain.value,.26);
 a.ctx.currentTime=.8;frame();
 assert(bed.source.stopped);assert(!a.loops.has('yujie-background'));
 Object.assign(threat,{retreat:0});game.threat=threat;frame();
 const renewed=a.loops.get('yujie-background');assert.notEqual(renewed,bed);
 a.stop();assert(renewed.source.stopped);assert.equal(a.loops.size,0);
});
test('depot alarm audio plays from the clock only when the timed pulse occurs',()=>{
 const audio=new GameAudio(),events=[];
 audio.ctx=new Context();audio.master=new Node();audio.ctx.sampleRate=24000;
 audio.ctx.createBuffer=(_,length)=>({getChannelData:()=>new Float32Array(length)});
 audio.play=(id,volume,pan)=>events.push({id,volume,pan});
 const clock={id:'clock',x:8,z:0},alarm={ringAt:4,ringEnd:8,lastRingAt:null};
 const game={floor:{listenerDepot:true,interactions:[clock]},player:{x:0,z:0},state:{depotAlarms:{clock:alarm}},line:()=>true,time:3.99};
 const frame=(volume=35)=>audio.update(game,'playing',volume,0);
 frame();assert.equal(events.length,0);
 game.time=alarm.lastRingAt=4;frame();frame();
 assert.equal(events.length,1);assert.equal(events[0].id,'alarm-bell');assert.equal(events[0].pan,1);
 game.time=alarm.lastRingAt=5;frame(0);frame();
 assert.equal(events.length,1,'unmuting cannot replay the bell that already rang');
});
test('depot loudspeaker and chute play distinct sounds from their fixtures rather than the control',()=>{
 const audio=new GameAudio(),events=[];
 audio.ctx=new Context();audio.master=new Node();audio.ctx.sampleRate=24000;
 audio.ctx.createBuffer=(_,length)=>({getChannelData:()=>new Float32Array(length)});
 audio.play=(id,volume,pan)=>events.push({id,pan});
 const intercom={id:'console',mechanism:'intercom',x:-5,z:0,noise:{x:13,z:0}};
 const chute={id:'chute',mechanism:'chute',x:2,z:0,noise:{x:-11,z:0}};
 const game={floor:{listenerDepot:true,interactions:[intercom,chute]},player:{floor:5,x:0,z:0},time:2,
  state:{depotAlarms:{console:{lastRingAt:2},chute:{lastRingAt:2}}},line:()=>true};
 audio.update(game,'playing',35,0);audio.update(game,'playing',35,0);
 assert.deepEqual(events,[{id:'depot-intercom',pan:1},{id:'steel',pan:-1}]);
});
test('Kun ambient scrapes are sparse spatial fixtures, stop for warnings and never replay muted cues',()=>{
 const audio=new GameAudio(),events=[];
 audio.ctx=new Context();audio.master=new Node();audio.ctx.sampleRate=24000;
 audio.ctx.createBuffer=(_,length)=>{const samples=new Float32Array(length);return{getChannelData:()=>samples};};audio.play=(id,volume,pan)=>events.push({id,volume,pan});
 const t={kind:'kun',floor:3,x:0,z:-10,phase:'patrolling',age:5,warning:2};
 const g={floor:{id:3,mode:'chase',chaseMetal:{x:7,z:0,w:2,d:2},chaseLure:{x:-8,z:1}},player:{floor:3,x:0,z:0},state:{},threat:t,time:0,line:()=>true};
 const frame=(seconds=0,volume=35,mode='playing')=>{g.time+=seconds;t.age+=seconds;audio.update(g,mode,volume,0);};
 frame();events.length=0;frame(4);assert.equal(events.length,2);assert.deepEqual(events.map(e=>e.id),['pipe-creak','wall-scrape']);assert(events[0].pan*events[1].pan<0);assert(events[1].volume<events[0].volume);assert(events[0].volume<.3);frame(.1);assert.equal(events.length,2);
 frame(8,0);frame(.1);assert.equal(events.length,2,'unmute does not emit a queued environmental sound');
 t.phase='warning';frame(8);assert.equal(events.length,2);t.phase='patrolling';g.floor.id=5;frame(8);assert.equal(events.length,2);
 g.floor.id=3;Object.assign(g.player,{x:-18,z:1});Object.assign(t,{x:-18,z:-10});frame();frame(4);assert.equal(events.length,3,'one plausible fixture produces only one sound');
 Object.assign(t,{x:-18,z:0});frame(8);assert.equal(events.length,3,'close pursuit takes priority over ambient misdirection');
 frame(8,35,'paused');assert.equal(events.length,3);
 for(const buffer of audio.buffers.values()){const samples=buffer.getChannelData(0);assert(samples.every(Number.isFinite));assert(samples.reduce((peak,s)=>Math.max(peak,Math.abs(s)),0)<=1);}
});
test('the Returner warning cues end with the actual Hide windows on the final floor',()=>{
 const audio=new GameAudio();
 audio.ctx=new Context();audio.master=new Node();audio.sfx=new Node();
 const clip={duration:8.1};audio.buffers.set('sweep-warning',clip);
 const threat={kind:'rush',warning:3.2,age:.02,phase:'warning',wave:1};
 const game={threat,player:{x:0,z:0},state:{},line:()=>true};
 const frame=()=>audio.update(game,'playing',35,0);
 frame();frame();
 Object.assign(threat,{age:6.12,phase:'return-warning',wave:2});
 frame();frame();
 const durations=[...audio.voices].map(source=>source.timing[2]);
 assert.equal(durations.length,2);
 assert(Math.abs(durations[0]-3.18)<1e-8);
 assert(Math.abs(durations[1]-.94)<1e-8);
 game.threat={kind:'patrol',warning:7,age:.02,phase:'warning',wave:1};
 frame();assert.deepEqual([...audio.voices].at(-1).timing,[0,0]);
});
test('falling rack and sealing grille land once in sync with the world and respect mute',()=>{
 const audio=new GameAudio(),events=[];audio.ctx=new Context();audio.master=new Node();
 audio.bridgeStep=(volume,pan,rate)=>events.push({volume,pan,rate});
 const g={floor:{id:3,chaseCollapse:{warning:1.1,fallDuration:.45,footprint:{x:5,z:0,w:2,d:1}},interactions:[{type:'vent',x:-2,z:0}]},state:{chaseCollapseAt:null,ventSealed:false},player:{x:0,z:0},time:0};
 const frame=(time,volume=35)=>{g.time=time;audio.update(g,'playing',volume,0);};
 frame(0);g.state.chaseCollapseAt=1;frame(2.5);assert.equal(events.length,0);frame(2.56);frame(2.58);assert.equal(events.length,1);assert(events[0].pan>0&&events[0].rate<1);
 g.state.ventSealed=true;frame(3);frame(3.1);assert.equal(events.length,1);frame(3.16);frame(3.18);assert.equal(events.length,2);assert(events[1].pan<0);
 g.state={chaseCollapseAt:null,ventSealed:false};frame(4);g.state.chaseCollapseAt=4;frame(5.56,0);frame(5.6);assert.equal(events.length,2,'muted impact is consumed');
 const panel={id:'panel',kind:'panel',warning:.35,fallDuration:.25,footprint:{x:-5,z:0,w:1,d:2}};
 g.floor.chaseHazards=[g.floor.chaseCollapse,panel];g.state.chaseHazardAt={panel:6};
 frame(6.59);assert.equal(events.length,2);frame(6.62);frame(6.67);assert.equal(events.length,3);
 assert(events[2].pan<0&&events[2].rate>.67,'each later collapse gets its own timed positional impact');
});
