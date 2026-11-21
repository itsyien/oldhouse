import {assetUrl} from './asset-url.js';
import {chaseHazards,chaseHazardAge} from './chase-hazard-geometry.js';
import {sweepTiming} from './sweep-timing.js';
const FILES=['room-tone.ogg','tv-static.ogg','warning.ogg','scare.ogg','power-off.ogg',
 'click.ogg','pickup.ogg','switch.ogg','sweep-lunge.ogg','background-music.mp3',
 'actor-scare.mp3','naiwa-spawn.mp3','sweep-pass.mp3','sweep-warning.mp3',
 'sweeper-scare.mp3','yujie-background.mp3','tenno-return.mp3','stone-speak.mp3'];
export class GameAudio{
 constructor(){this.buffers=new Map();this.loops=new Map();this.voices=new Set();this.alarmPulses=new WeakMap();this.previousThreat=null;this.volume=0;}
 async unlock(){
  if(!this.ctx){
   this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.gain.value=0;const compressor=this.ctx.createDynamicsCompressor();compressor.threshold.value=-16;compressor.ratio.value=5;compressor.attack.value=.008;compressor.release.value=.2;this.master.connect(compressor).connect(this.ctx.destination);
   this.ambience=this.ctx.createGain();this.sfx=this.ctx.createGain();this.ambience.connect(this.master);this.sfx.connect(this.master);
   this.loading=Promise.allSettled(FILES.map(async file=>{try{const r=await fetch(assetUrl(`/assets/audio/${file}`));if(!r.ok)throw new Error(r.status);this.buffers.set(file.slice(0,-4),await this.ctx.decodeAudioData(await r.arrayBuffer()));}catch(e){console.warn(`Audio unavailable: ${file}`,e.message);}}));
  }
  if(this.ctx.state==='suspended')await this.ctx.resume();
 }
 play(id,volume=.3,pan,rate=1,offset=0,limit){
  if(!this.ctx||!this.volume||!this.buffers.has(id))return false;
  if(this.voices.size>=6){const oldest=this.voices.values().next().value;this.voices.delete(oldest);oldest.stop();}
  const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();source.buffer=this.buffers.get(id);source.playbackRate.value=rate;
  const level=volume*({warning:4.7,scare:7.5,'power-off':9.5}[id]??1);
  gain.gain.value=level;source.connect(gain);
  const panner=pan===undefined?null:this.ctx.createStereoPanner();if(panner){panner.pan.value=pan;gain.connect(panner).connect(this.sfx);}else gain.connect(this.sfx);
  if(offset){
   gain.gain.setValueAtTime(0,this.ctx.currentTime);
   gain.gain.setTargetAtTime(level,this.ctx.currentTime,.003);
  }
  this.voices.add(source);source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();panner?.disconnect();};
  if(limit>0&&limit<(source.buffer.duration-offset)/rate){
   const end=this.ctx.currentTime+limit;
   gain.gain.setValueAtTime(level,end-Math.min(.12,limit/2));
   gain.gain.linearRampToValueAtTime(0,end);
   source.start(0,offset,limit*rate);
  }else source.start(0,offset);
  return true;
 }
 sweepWarning(threat,volume){
  const timing=threat.kind==='rush'?sweepTiming(threat):null;
  const limit=timing&&timing.duration-timing.elapsed;
  if(!this.play('sweep-warning',volume,undefined,1,0,limit))this.play('warning',.2,undefined,1,0,limit);
 }
 playScare(kind){
  if(kind==='patrol'||kind==='rush')return this.play('sweeper-scare',.98)||this.play('sweep-lunge',.98);
  // Skip the shared clip's quiet lead-in so the hit lands on the visual cut.
  if(['naiwa','doubao','inspector','yujie','liang'].includes(kind)&&this.play('actor-scare',.78,undefined,1,.35))return true;
  return this.play('scare',.55);
 }
 pursuitSteps(actor,game,yaw){
  if(!actor||!this.volume){this.lastStep=null;return;}
  const liang=actor.kind==='liang',rushing=actor.phase==='investigating',listening=liang&&actor.phase==='listening';
  if(this.lastStep?.actor!==actor){this.lastStep={actor,x:actor.x,z:actor.z,travel:0,rushing,listening};return;}
  const step=this.lastStep,stride=liang?(rushing?1.86:.96):1.8;
  const pivot=liang&&rushing&&!step.rushing&&game.time-(step.lastPivot??-Infinity)>=4.4;
  const drawsBreath=listening&&!step.listening;
  step.rushing=rushing;step.listening=listening;
  if(pivot)step.lastPivot=game.time;
  step.travel=listening?0:step.travel+Math.hypot(actor.x-step.x,actor.z-step.z);step.x=actor.x;step.z=actor.z;
  const doorThump=actor.waitingDoor&&actor.waitingDoor!==step.door;
  step.door=actor.waitingDoor;
  const landed=step.travel>=stride;
  if(!pivot&&!drawsBreath&&!doorThump&&!landed)return;
  if(doorThump||landed)step.travel=doorThump?0:step.travel%stride;
  const dx=actor.x-game.player.x,dz=actor.z-game.player.z,distance=Math.hypot(dx,dz);
  const range=liang?19:15;
  if(distance>=range)return;
  const volume=(1-distance/range)**1.3*(game.line(game.player,actor)?1:.48);
  const pan=distance?(Math.cos(yaw)*dx-Math.sin(yaw)*dz)/distance:0;
  if(pivot)this.playLiangInhale(volume*.48,pan);
  if(doorThump){this.play('power-off',volume*.25,pan);return;}
  const brake=drawsBreath&&distance<8;
  if(!landed&&!brake)return;
  const id=liang?'liang-step':'heel';
  if(!this.buffers.has(id)){
   // A dull heel strike followed by a sole scuff. Generate once, then reuse the mono buffer for positional steps.
   const rate=this.ctx.sampleRate,duration=liang?.32:.22,buffer=this.ctx.createBuffer(1,Math.ceil(rate*duration),rate),samples=buffer.getChannelData(0);
   let seed=11,grit=0;
   for(let i=0;i<samples.length;i++){
    const t=i/rate,scuff=Math.max(0,t-(liang?.073:.055));
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;grit=grit*.87+(seed/2147483648-1)*.13;
    const heel=.66*Math.sin(t*360+5*(1-Math.exp(-t*45)))*Math.exp(-t*34);
    const weight=liang?.20*Math.sin(2*Math.PI*111*t)*Math.exp(-t*44):0;
    samples[i]=Math.min(1,t*360)*(heel+weight+grit*scuff*(liang?94:65)*Math.exp(-scuff*(liang?23:35)));
   }
   this.buffers.set(id,buffer);
  }
  this.play(id,volume*(brake?.47:liang?.57:.44),pan,brake?.72:liang&&rushing?1.17:1);
  if(brake)this.playLiangInhale(volume*.31,pan,.69);
 }
 playLiangInhale(volume,pan,rate=1){
  if(!this.buffers.has('liang-inhale')){
   const rate=this.ctx.sampleRate,buffer=this.ctx.createBuffer(1,Math.ceil(rate*.39),rate),samples=buffer.getChannelData(0);
   let seed=63,air=0,chest=0;
   for(let i=0;i<samples.length;i++){
    const t=i/rate;
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const noise=seed/2147483648-1;
    air=air*.68+noise*.32;chest=chest*.96+noise*.04;
    const breath=Math.min(1,t*23,Math.max(0,(.39-t)*8))**2;
    const catchAt=Math.max(0,t-.14),catchGain=Math.min(1,catchAt*32)*Math.exp(-catchAt*22);
    samples[i]=(air-chest)*breath*.95+catchGain*.24*Math.sin(2*Math.PI*(72*catchAt-20*catchAt**2));
   }
   this.buffers.set('liang-inhale',buffer);
  }
  this.play('liang-inhale',volume,pan,rate);
 }
 bridgeStep(volume=.5,pan,rate=1){
  if(!this.buffers.has('steel')){
   const rate=this.ctx.sampleRate,buffer=this.ctx.createBuffer(1,Math.ceil(rate*.45),rate),samples=buffer.getChannelData(0);
   for(let i=0;i<samples.length;i++){
    const t=i/rate;
    samples[i]=Math.min(1,t*650)*(.42*Math.sin(2*Math.PI*123*t)*Math.exp(-t*13)+.25*Math.sin(2*Math.PI*338*t)*Math.exp(-t*18)+.16*Math.sin(2*Math.PI*587*t)*Math.exp(-t*24));
   }
   this.buffers.set('steel',buffer);
  }
  this.play('steel',volume,pan,rate);
 }
 chaseImpacts(game,yaw,audible){
  const f=game.floor,s=game.state;
  if(f?.id!==3)return;
  this.chaseImpactStates??=new WeakMap();
  let cues=this.chaseImpactStates.get(s);
  if(!cues){cues={landed:new Set(),sealed:!!s.ventSealed,sealAt:null};this.chaseImpactStates.set(s,cues);}
  const impact=(source,volume,rate)=>{
   if(!audible||!this.volume)return;
   const dx=source.x-game.player.x,dz=source.z-game.player.z,distance=Math.hypot(dx,dz);
   this.bridgeStep(volume/(1+distance/12),distance?(Math.cos(yaw)*dx-Math.sin(yaw)*dz)/distance:0,rate);
  };
  for(const hazard of chaseHazards(f)){
   const since=chaseHazardAge(f,s,hazard,game.time)-hazard.warning-hazard.fallDuration;
   if(since<0){cues.landed.delete(hazard);continue;}
   if(cues.landed.has(hazard))continue;
   cues.landed.add(hazard);
   if(since>=.24)continue;
   const r=hazard.footprint;
   impact({x:r.x+r.w/2,z:r.z+r.d/2},.73,hazard.kind==='panel'?.88:.67);
  }
  if(s.ventSealed&&!cues.sealed)cues.sealAt=game.time+.15;
  cues.sealed=!!s.ventSealed;
  if(cues.sealAt!==null&&game.time>=cues.sealAt){
   if(game.time-cues.sealAt<.24)impact(f.interactions?.find(i=>i.type==='vent')??{x:14.8,z:15},.58,.83);
   cues.sealAt=null;
  }
 }
 chaseAmbience(game,yaw,audible){
  const actor=game.threat,floor=game.floor;
  if(floor?.id!==3||actor?.kind!=='kun'||actor.floor!==3||game.state.chaseEscaped){this.chaseNoise=null;return;}
  if(this.chaseNoise?.actor!==actor){this.chaseNoise={actor,next:game.time+3.2,index:0};return;}
  const cue=this.chaseNoise;
  if(game.time<cue.next)return;
  cue.next=game.time+4.3+(cue.index%3)*.8;
  const sequence=cue.index++;
  // These are building noises, never a substitute for footsteps, door warnings or interaction feedback.
  if(!audible||!this.volume||actor.age<=actor.warning||['warning','stunned'].includes(actor.phase)||game.chaseAction||game.state.ventSealed||Math.hypot(actor.x-game.player.x,actor.z-game.player.z)<4.5)return;
  const collapsing=chaseHazards(floor).some(hazard=>{
   const age=chaseHazardAge(floor,game.state,hazard,game.time);
   return age>=0&&age<hazard.warning+hazard.fallDuration+.2;
  });
  if(collapsing||game.time-(game.state.bellAt??-Infinity)<.6||game.time-(game.state.metalAt??-Infinity)<.35)return;
  const metal=floor.chaseMetal;
  const sources=[metal&&{x:metal.x+metal.w/2,z:metal.z+metal.d/2},floor.chaseLure,{x:26,z:14.5},{x:14.8,z:15}]
   .filter(Boolean).map(p=>({...p,floor:3,distance:Math.hypot(p.x-game.player.x,p.z-game.player.z)})).filter(p=>p.distance>4&&p.distance<19);
  if(!sources.length)return;
  const source=sources[sequence%sources.length];
  const bearing=p=>(Math.cos(yaw)*(p.x-game.player.x)-Math.sin(yaw)*(p.z-game.player.z))/p.distance;
  const answer=sources.find(p=>p!==source&&Math.abs(bearing(p)-bearing(source))>.65);
  // A quieter answer from the other side unsettles orientation without pointing at the pursuer.
  for(const [index,point] of [source,answer].filter(Boolean).entries()){
   const id=(sequence+index)%2?'wall-scrape':'pipe-creak';
   if(!this.buffers.has(id)){
    const rate=this.ctx.sampleRate,duration=id==='pipe-creak'?.64:.49;
    const buffer=this.ctx.createBuffer(1,Math.ceil(rate*duration),rate),samples=buffer.getChannelData(0);
    let seed=83,air=0,body=0;
    for(let i=0;i<samples.length;i++){
     const t=i/rate;
     seed=(Math.imul(seed,1664525)+1013904223)>>>0;
     const noise=seed/2147483648-1;air=air*.53+noise*.47;body=body*.94+noise*.06;
     const envelope=Math.sin(Math.PI*t/duration)**1.6;
     samples[i]=envelope*(id==='pipe-creak'?
      .23*Math.sin(2*Math.PI*(238*t-29*t*t))+.13*Math.sin(2*Math.PI*617*t)+.2*(air-body):
      (air-body)*(.42+.12*Math.sin(2*Math.PI*19*t))+.11*Math.sin(2*Math.PI*151*t));
    }
    this.buffers.set(id,buffer);
   }
   this.play(id,.24*(index?.52:1)*(1-point.distance/24)*(game.line(game.player,point)?1:.48),bearing(point),index?.84:1);
  }
 }
 depotAlarms(game,yaw,audible){
  if(!game.floor?.listenerDepot)return;
  for(const device of game.floor.interactions){
   const alarm=game.state.depotAlarms[device.id],pulse=alarm?.lastRingAt;
   if(pulse==null||this.alarmPulses.get(alarm)===pulse)continue;
   this.alarmPulses.set(alarm,pulse);
   const source={floor:game.player.floor,...(device.noise??device)};
   const dx=source.x-game.player.x,dz=source.z-game.player.z,distance=Math.hypot(dx,dz);
   if(!audible||!this.volume||game.time-pulse>.24||distance>=34)continue;
   const pan=distance?(Math.cos(yaw)*dx-Math.sin(yaw)*dz)/distance:0;
   const gain=(1-distance/34)*(game.line(game.player,source)?1:.42);
   if(device.mechanism==='chute'){this.bridgeStep(gain*.74,pan);continue;}
   const intercom=device.mechanism==='intercom',id=intercom?'depot-intercom':'alarm-bell';
   if(!this.buffers.has(id)){
    const rate=this.ctx.sampleRate,duration=intercom?.60:.84;
    const buffer=this.ctx.createBuffer(1,Math.ceil(rate*duration),rate),samples=buffer.getChannelData(0);
    let seed=29,slow=0,fast=0;
    for(let i=0;i<samples.length;i++){
     const t=i/rate;
     if(intercom){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const noise=seed/2147483648-1;
      fast=.69*fast+.31*noise;slow=.94*slow+.06*noise;
      const carrier=Math.sin(2*Math.PI*(430*t-42*t*t))+.42*Math.sin(2*Math.PI*891*t);
      const gate=Math.min(1,t*90,(duration-t)*45)*(.38+.62*Math.sin(2*Math.PI*3.75*t)**2);
      samples[i]=gate*((fast-slow)*.58+.28*carrier);
     }else{
      const strike=Math.floor(t*7),age=t-strike/7,freq=strike%2?1180:1420;
      samples[i]=Math.min(1,age*800)*Math.min(1,(.84-t)*18)*Math.exp(-age*26)*
       (.52*Math.sin(2*Math.PI*freq*age)+.24*Math.sin(2*Math.PI*freq*1.71*age));
     }
    }
    this.buffers.set(id,buffer);
   }
   this.play(id,(intercom?.74:.62)*gain,pan);
  }
 }
 loop(id,volume,pan=0,rate=1,offset=0){
  let l=this.loops.get(id);if(!l&&volume>0&&this.buffers.has(id)){
   const source=this.ctx.createBufferSource(),gain=this.ctx.createGain(),panner=this.ctx.createStereoPanner();source.buffer=this.buffers.get(id);
   if(id==='yujie-background')source.loopEnd=18.1; // The supplied recording has a long silent tail.
   source.loop=id!=='stone-speak';
   gain.gain.value=0;source.connect(gain).connect(panner).connect(this.ambience);source.start(0,offset);l={source,gain,panner};this.loops.set(id,l);
  }
  if(l){l.gain.gain.setTargetAtTime(volume,this.ctx.currentTime,.18);l.panner.pan.setTargetAtTime(pan,this.ctx.currentTime,.15);l.source.playbackRate.setTargetAtTime(rate,this.ctx.currentTime,.2);}
 }
 stopLoop(id,l){
  l.source.stop();l.source.disconnect();l.gain.disconnect();l.panner.disconnect();this.loops.delete(id);
 }
 update(game,mode,volume,yaw,hidden=false,fade=1,background=true){
  if(!this.ctx)return;
  const active=!hidden&&(mode==='playing'||mode==='scare');this.volume=active?volume:0;this.master.gain.setTargetAtTime(this.volume/100*.7*fade,this.ctx.currentTime,.04);
  const audible=mode==='playing'&&!hidden&&!game.debugCalm;
  const t=game.threat,sweeper=t?.kind==='patrol'||t?.kind==='rush';
  if(t!==this.previousThreat){
   if(t&&audible&&t.kind!=='naiwa'&&!(t.kind==='liang'&&game.building?.campaign)){
    if(sweeper)this.sweepWarning(t,.72);
    else this.play('warning',.2);
   }
   this.previousThreat=t;
  }
  const naiwa=t?.kind==='naiwa'?t:game.auxiliary?.kind==='naiwa'?game.auxiliary:null;
  if(naiwa!==this.previousNaiwa){
   if(naiwa&&audible&&!this.play('naiwa-spawn',.84))this.play('warning',.2);
   this.previousNaiwa=naiwa;
  }
  this.chaseImpacts(game,yaw,audible);
  const stone=mode==='playing'&&!hidden?game.state.stonePlayback:null;
  if(stone!==this.previousStone){
   const old=this.loops.get('stone-speak');if(old)this.stopLoop('stone-speak',old);
   this.previousStone=stone;
  }
  if(stone){
   const dx=stone.site.x-game.player.x,dz=stone.site.z-game.player.z,d=Math.hypot(dx,dz);
   this.loop('stone-speak',1.56/(1+d/13),(Math.cos(yaw)*dx-Math.sin(yaw)*dz)/Math.max(1,d)*.7,1,game.time-stone.startedAt);
  }
  this.chaseAmbience(game,yaw,audible&&background&&!stone);
  this.depotAlarms(game,yaw,audible);
  const strike=game.state.metalAt;
  if(this.lastMetalAt!==strike){
   this.lastMetalAt=strike;
   if(audible&&this.volume&&Number.isFinite(strike)&&game.time-strike<.15)this.bridgeStep();
  }
  const bell=game.state.bellAt,source=game.floor?.chaseLure;
  if(this.lastBellAt!==bell){
   this.lastBellAt=bell;
   if(audible&&this.volume&&source&&game.time-bell<.15){
    const dx=source.x-game.player.x,dz=source.z-game.player.z,distance=Math.hypot(dx,dz);
    this.bridgeStep(.68*Math.max(0,1-distance/22),distance?(Math.cos(yaw)*dx-Math.sin(yaw)*dz)/distance:0);
   }
  }
  if(sweeper&&t.phase==='return-warning'&&this.returnWarning!==t){
   this.returnWarning=t;if(audible)this.sweepWarning(t,.60);
  }
  if(sweeper&&t.phase==='sweeping'&&(this.blackoutThreat!==t||this.blackoutWave!==t.wave)){
   this.blackoutThreat=t;this.blackoutWave=t.wave;
   const returning=t.kind==='rush'&&t.wave===2&&this.buffers.has('tenno-return');
   if(audible&&!this.play(returning?'tenno-return':'sweep-pass',.74,undefined,1,returning?.30:0))this.play('power-off',.22);
  }
  if(!t)this.blackoutThreat=null;
  const impact=game.state.gunmuGateImpactAt;
  if(impact!==this.lastGunmuImpact){
   this.lastGunmuImpact=impact;
   const gate=game.state.doors?.find(d=>d.id===game.floor?.gunmuFinale?.trap.gateId);
   if(audible&&this.volume&&gate&&Number.isFinite(impact)&&game.time-impact<.15){
    const dx=gate.x-game.player.x,dz=gate.z-game.player.z,distance=Math.hypot(dx,dz);
    this.bridgeStep(.82/(1+distance/24),distance?(Math.cos(yaw)*dx-Math.sin(yaw)*dz)/distance:0);
   }
  }
  const pursuer=game.building?.campaign&&(['liang','kun'].includes(t?.kind)?t:game.auxiliary?.kind==='liang'?game.auxiliary:t?.kind==='doubao'?t:null);
  this.pursuitSteps(audible&&pursuer,game,yaw);
  const closeThreat=pursuer?.phase==='investigating'||pursuer?.sightLocked;
  const listenMix=pursuer?.kind==='liang'&&pursuer.phase==='listening'
   ?1-.9*Math.max(0,Math.min(1,(11-Math.hypot(pursuer.x-game.player.x,pursuer.z-game.player.z))/5)):1;
  const backgroundAudible=audible&&background&&!stone;
  const visitor=t?.kind==='yujie'&&t.floor===game.player.floor&&t.age>=t.warning
   ?Math.max(0,1-(t.retreat??0)/1.3):0;
  const visitBed=this.loops.get('yujie-background');
  if(backgroundAudible&&visitor){
   this.loop('yujie-background',.48*visitor);
   if(visitBed)visitBed.retireAt=null;
  }else if(visitBed){
   if(visitBed.retireAt==null){this.loop('yujie-background',0);visitBed.retireAt=this.ctx.currentTime+.72;}
   if(this.ctx.currentTime>=visitBed.retireAt)this.stopLoop('yujie-background',visitBed);
  }
  this.loop('room-tone',backgroundAudible?(game.state.blackout?.025:closeThreat?.055:.12*listenMix):0);
  this.loop('background-music',backgroundAudible?(game.state.blackout?.032:closeThreat?.07:.26*listenMix*(1-.75*visitor)):0);
  const tv=mode==='playing'&&t?.kind==='liang'&&!game.building?.campaign&&!game.debugCalm&&!hidden;
  const dx=tv?t.x-game.player.x:0,dz=tv?t.z-game.player.z:0,distance=Math.hypot(dx,dz),pan=distance?(Math.cos(yaw)*dx-Math.sin(yaw)*dz)/distance:0;
  this.loop('tv-static',tv?(.10+t.pressure*.17)/(1+distance/5)*(game.line(game.player,t)?1:.3):0,pan,tv?.85+t.pressure*.3:1);
 }
 stop(){
  if(this.master)this.master.gain.setValueAtTime(0,this.ctx.currentTime);this.volume=0;this.lastStep=null;this.chaseNoise=null;
  for(const [id,l] of this.loops)this.stopLoop(id,l);
  for(const s of [...this.voices])s.stop();this.voices.clear();
 }
}
