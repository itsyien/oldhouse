import * as T from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { floorPassable, RISE } from './building.js';
import { prepareKunChaseFace } from './kun-chase-face.js';
import { bindInspectorExposure, createInspectorExposure } from './inspector-exposure.js';
import { gunmuVisibleAcrossTurn } from './gunmu-finale.js';

const movementCutoff=.055;
const visitorAngles=[0,-.48,.48,-.98,.98,1.57,-1.57];
const visitorKeyPower=.62;
const modelBox=new T.Box3();
const headParent=new T.Quaternion(),headRotation=new T.Quaternion(),headAxis=new T.Vector3();

function kunDormantClip(model,runClip){
 model.updateMatrixWorld(true);
 const frame=model.getWorldQuaternion(new T.Quaternion()),inverse=frame.clone().invert(),bones=[];
 model.traverse(bone=>{if(bone.isBone)bones.push({bone,rotation:bone.quaternion.clone(),position:bone.position.clone(),
  basis:inverse.clone().multiply(bone.getWorldQuaternion(new T.Quaternion())),values:[]});});
 const joints=new Map(bones.map(b=>[b.bone.name,b])),times=[],duration=4.8;
 const grips=['FingersL','FingersR'].map(name=>({joint:joints.get(name),track:runClip?.tracks.find(t=>t.name===name+'.quaternion')}));
 const rotation=new T.Quaternion(),parent=new T.Quaternion(),angles=new T.Euler(0,0,0,'YXZ');
 const pose=(name,x,y,z)=>{
  const joint=joints.get(name);if(!joint)return;
  const bone=joint.bone;
  bone.parent.getWorldQuaternion(parent).invert();
  rotation.setFromEuler(angles.set(x,y,z));
  bone.quaternion.copy(parent).multiply(frame).multiply(rotation).multiply(joint.basis);
  bone.updateMatrixWorld(true);
 };
 for(let i=0;i<=144;i++){
  const time=i*duration/144,phase=(time%duration),breath=Math.sin(time/duration*Math.PI*2);
  const pulse=(at,width)=>Math.exp(-(((phase-at)/width)**2));
  const jerk=pulse(.76,.065)-.55*pulse(.94,.10)+.72*pulse(3.18,.055)-.38*pulse(3.35,.12);
  times.push(time);
  for(const b of bones){b.bone.quaternion.copy(b.rotation);b.bone.position.copy(b.position);}
  model.updateMatrixWorld(true);
  // Only the upper body moves; the bind-pose hips and soles remain fixed on the floor.
  pose('Spine',.12+.008*breath,0,.025);
  pose('Chest',.21+.012*breath+.018*jerk,-.025,.035-.025*jerk);
  pose('Neck',.26+.025*jerk,-.07,-.09-.09*jerk);
  pose('Head',.23-.10*jerk,-.10+.13*jerk,-.13-.12*jerk);
  pose('ClavicleL',.21,-.025,.07+.04*jerk);
  pose('ClavicleR',.21,-.025,-.025);
  pose('UpperArmL',-.09+.035*jerk,-.05,-1.39);
  pose('ForearmL',-.37+.045*jerk,-.05,-1.39);
  pose('HandL',-.39,-.05,-1.39);
  pose('UpperArmR',-.27,-.12,1.28);
  pose('ForearmR',-.85-.025*jerk,-.12,1.28);
  pose('HandR',-.85-.025*jerk,-.12,1.28);
  for(const {joint,track} of grips)if(joint&&track)joint.bone.quaternion.fromArray(track.values);
  for(const b of bones)b.values.push(...b.bone.quaternion.toArray());
 }
 const tracks=bones.flatMap(b=>{
  b.bone.quaternion.copy(b.rotation);b.bone.position.copy(b.position);
  return[new T.QuaternionKeyframeTrack(b.bone.name+'.quaternion',times,b.values),
   new T.VectorKeyframeTrack(b.bone.name+'.position',[0,duration],[...b.position.toArray(),...b.position.toArray()])];
 });
 model.updateMatrixWorld(true);
 return new T.AnimationClip('Dormant_Twitch',duration,tracks);
}

function shadeListener(mesh){
 const geometry=mesh.geometry.clone(),position=geometry.getAttribute('position');
 const tint=new Uint8Array(position.count*3);
 for(let i=0;i<position.count;i++){
  const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
  // The shading follows the skinned eye sockets while the face's shape and base texture stay intact.
  const eye=T.MathUtils.smoothstep(z,.035,.098)*Math.exp(-(((Math.abs(x)-.050)/.034)**2+((y-1.652)/.026)**2));
  const face=T.MathUtils.smoothstep(y,1.47,1.58);
  tint[i*3]=255*(1-.70*eye-.16*face);
  tint[i*3+1]=255*(1-.66*eye-.09*face);
  tint[i*3+2]=255*(1-.61*eye-.025*face);
 }
 geometry.setAttribute('color',new T.Uint8BufferAttribute(tint,3,true));
 mesh.geometry=geometry;
}

export function createCharacterActor(gltf,kind,definition){
 const model=clone(gltf.scene), actor=new T.Group();
 const {height,yaw=0,walk,run,listen,crawl,walkSpeed=1,runSpeed=1,crawlSpeed=1}=definition;
 modelBox.setFromObject(model);
 const scale=height/Math.max(.01,modelBox.max.y-modelBox.min.y);
 const halfWidth=(modelBox.max.x-modelBox.min.x)*scale/2;
 const halfDepth=(modelBox.max.z-modelBox.min.z)*scale/2;
 model.position.y=-modelBox.min.y;model.rotation.y=yaw;actor.add(model);
 actor.name='Character/'+kind;actor.visible=false;
 const exposure=kind==='inspector'?createInspectorExposure():null;
 const shaftReveal=kind==='doubao'?{value:0}:null;
 const materials=new Set(),clones=new Map();
 model.traverse(object=>{
  if(!object.isMesh)return;
  if(object.isSkinnedMesh)object.frustumCulled=false;
  if(kind==='liang')shadeListener(object);
  const useMaterial=original=>{
   if(clones.has(original))return clones.get(original);
   const m=original.clone();
   if(['inspector','rush','yujie','doubao'].includes(kind))m.alphaHash=true;
   if(exposure)bindInspectorExposure(m,exposure);
   if(m.isMeshStandardMaterial&&kind==='yujie'){
    m.emissiveMap=m.map;
    m.emissive.setHex(0x91b9e0);
    m.emissiveIntensity=visitorKeyPower;
    // Paint the eye openings in bind coordinates so the black follows the face from every angle.
    m.onBeforeCompile=shader=>{
     shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vVisitorPoint;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvVisitorPoint = position;');
     shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vVisitorPoint;')
      .replace('#include <emissivemap_fragment>',`
      #include <emissivemap_fragment>
      vec3 visitorNormal = inverseTransformDirection( normal, viewMatrix );
      float visitorKey = smoothstep( -.43, .89, dot( visitorNormal, normalize( vec3( -.52, .79, -.32 ) ) ) );
      totalEmissiveRadiance *= mix( .22, 1.03, visitorKey );
     `).replace('#include <opaque_fragment>',`
      vec2 eyeL = ( vVisitorPoint.xy - vec2( -.1281, .4204 ) ) / vec2( .0095, .0040 );
      vec2 eyeR = ( vVisitorPoint.xy - vec2( -.0808, .4256 ) ) / vec2( .0090, .0039 );
      eyeL.y -= .32 * eyeL.x;
      float eyeOpening = ( 1. - smoothstep( .71, 1.08, min( dot( eyeL, eyeL ), dot( eyeR, eyeR ) ) ) )
       * smoothstep( -.403, -.379, vVisitorPoint.z );
      float face = smoothstep( .368, .400, vVisitorPoint.y ) * smoothstep( -.435, -.39, vVisitorPoint.z );
      float faceShade = mix( .62, .86, smoothstep( -.163, -.080, vVisitorPoint.x ) );
      outgoingLight *= ( 1. - eyeOpening ) * mix( 1., faceShade, face );
      #include <opaque_fragment>
     `).replace('#include <fog_fragment>',T.ShaderChunk.fog_fragment.replace('fogColor, fogFactor','fogColor, fogFactor * .49'));
    };
   }
   if(m.isMeshStandardMaterial&&kind==='doubao'){
    m.emissiveMap=m.map;m.emissive.setHex(0x627069);m.emissiveIntensity=0;
    m.onBeforeCompile=shader=>{
     shader.uniforms.uShaftReveal=shaftReveal;
     shader.fragmentShader=shader.fragmentShader.replace('#include <fog_pars_fragment>','#include <fog_pars_fragment>\nuniform float uShaftReveal;')
      .replace('#include <fog_fragment>',T.ShaderChunk.fog_fragment.replace('fogColor, fogFactor','fogColor, fogFactor * (1. - .77 * uShaftReveal)'));
    };
   }
   if(kind==='liang'&&m.isMeshStandardMaterial){
    m.color.multiply(new T.Color(0xa6b5ae));
    m.vertexColors=true;
    m.metalness=0;
    m.roughness=.90;
    m.roughnessMap=null;
    m.normalScale.multiplyScalar(.48);
    if(m.isMeshPhysicalMaterial)m.specularIntensity*=.4;
   }
   clones.set(original,m);materials.add(m);return m;
  };
  object.material=Array.isArray(object.material)?object.material.map(useMaterial):useMaterial(object.material);
 });
 const mixer=(walk||run)?new T.AnimationMixer(model):null;
 const getClip=name=>name&&gltf.animations.find(c=>c.name===name);
 const walkClip=getClip(walk),runClip=getClip(run),listenClip=getClip(listen),crawlClip=getClip(crawl);
 const dormantClip=kind==='kun'?kunDormantClip(model,runClip):null;
 const action=(mixer&&(walkClip||runClip))?mixer.clipAction(dormantClip||listenClip||walkClip||runClip).play():null;
 const face=kind==='kun'?prepareKunChaseFace(model):null;
 const head=kind==='liang'?model.getObjectByName('Head'):null,chest=head?model.getObjectByName('Chest'):null;
 actor.userData.character={kind,scale,halfWidth,halfDepth,mixer,action,walkClip,runClip,listenClip,crawlClip,dormantClip,walkSpeed,runSpeed,crawlSpeed,materials,face,head,
  headPose:head?.quaternion.clone(),headAngle:0,headTilt:0,headPitch:0,
  chest,chestPose:chest?.quaternion.clone(),chestLean:0,listenAge:0,earSide:-1,exposure,shaftReveal,occurrence:null};
 return actor;
}

function clearance(game,t,px,pz,heading,width,depth){
 const floor=game.building.byId[t.floor];
 if(!floor)return false;
 const doors=game.states[t.floor].doors.flatMap(d=>d.block?[d.block]:[]);
 const sin=Math.sin(heading),cos=Math.cos(heading);
 return [-depth,0,depth].every(offset=>floorPassable(floor,{x:px+sin*offset,z:pz+cos*offset},width,doors));
}

function startPose(a,d,t,game,camera){
 d.occurrence=t;d.lastX=t.x;d.lastZ=t.z;d.speed=0;
 const bearing=Math.atan2(camera.position.x-t.x,camera.position.z-t.z);
 a.rotation.y=bearing;
 if(d.kind==='liang'){
  const ahead=t.route?.[((t.routeIndex||0)+(t.direction||1)+t.route.length)%t.route.length];
  if(ahead)a.rotation.y=Math.atan2(ahead.x-t.x,ahead.z-t.z);
  d.headAngle=0;d.headTilt=0;d.headPitch=0;d.chestLean=0;d.listenAge=0;d.earSide=-1;
  d.head?.quaternion.copy(d.headPose);
  d.chest?.quaternion.copy(d.chestPose);
  d.mixer.stopAllAction();
  const clip=d.listenClip||d.walkClip||d.runClip;
  if(clip)d.action=d.mixer.clipAction(clip).reset().play();
 }
 if(d.kind==='yujie'){
  // A visitor faces the approach once. It never swivels to follow the player.
  a.rotation.y=visitorAngles.map(delta=>bearing+delta).find(yaw=>
   clearance(game,t,t.x,t.z,yaw,d.halfWidth*.92,d.halfDepth*.71))??bearing;
 }
 if(d.kind==='kun'&&d.action){
  d.mixer.stopAllAction();
  d.action=d.mixer.clipAction(t.phase==='dormant'?d.dormantClip:d.runClip||d.walkClip).reset().play();
 }
 if(d.action){d.action.reset().play();d.mixer.update(0);}
}

function moveListener(actor,d,t,dt,scale,reduced){
 const moving=d.speed>movementCutoff;
 const listening=t.phase==='listening';
 d.listenAge=listening?d.listenAge+dt:0;
 const running=moving&&t.phase==='investigating'&&d.speed>2.25;
 const clip=!moving&&d.listenClip?d.listenClip:running&&d.runClip?d.runClip:d.walkClip||d.runClip;
 const previous=d.action;
 d.head?.quaternion.copy(d.headPose);
 d.chest?.quaternion.copy(d.chestPose);
 if(clip!==previous.getClip()){
  const next=d.mixer.clipAction(clip).reset().play();
  if(clip!==d.listenClip&&previous.getClip()!==d.listenClip)next.time=previous.time/previous.getClip().duration*clip.duration;
  d.action=next.crossFadeFrom(previous,.20,false);
 }
 const authored=clip===d.runClip?d.runSpeed:d.walkSpeed;
 // Hold the planted pose on arrival, then let the rig carry any physical search steps.
 d.action.setEffectiveTimeScale(clip===d.listenClip?(listening?0:1):moving?T.MathUtils.clamp(d.speed/(authored*scale),.1,2.7):0);
 d.mixer.update(dt);
 if(!d.head)return;
 d.headPose.copy(d.head.quaternion);
 const sound=t.lastNoise??t.noiseGoal;
 const atSound=sound&&Math.hypot(sound.x-t.x,sound.z-t.z)<=.45;
 const noise=listening?(atSound?t.probe:sound??t.probe):t.phase==='investigating'?sound:null;
 const dx=(noise?.x??t.x)-t.x,dz=(noise?.z??t.z)-t.z;
 const turn=Math.hypot(dx,dz)>.45?Math.atan2(dx,dz)-actor.rotation.y:0;
 const limit=listening&&!reduced?.84:.62;
 const angle=T.MathUtils.clamp(Math.atan2(Math.sin(turn),Math.cos(turn)),-limit,limit);
 if(listening&&Math.abs(angle)>.14)d.earSide=Math.sign(angle);
 const cock=1-.20*T.MathUtils.smoothstep(d.listenAge,.19,.34);
 d.headAngle=T.MathUtils.damp(d.headAngle,angle,listening&&!reduced?15:8,dt);
 d.headTilt=T.MathUtils.damp(d.headTilt,listening&&!reduced?-.49*cock*d.earSide:0,listening?15:7,dt);
 d.headPitch=T.MathUtils.damp(d.headPitch,reduced?0:listening?.16:running?.095:0,10,dt);
 if(d.chest){
  d.chestPose.copy(d.chest.quaternion);
  d.chestLean=T.MathUtils.damp(d.chestLean,listening?(reduced?.08:.25):0,9,dt);
  d.chest.parent.getWorldQuaternion(headParent).invert();
  headAxis.set(Math.cos(actor.rotation.y),0,-Math.sin(actor.rotation.y)).applyQuaternion(headParent);
  d.chest.quaternion.premultiply(headRotation.setFromAxisAngle(headAxis,d.chestLean));
 }
 d.head.parent.getWorldQuaternion(headParent).invert();
 headAxis.set(0,1,0).applyQuaternion(headParent);
 d.head.quaternion.premultiply(headRotation.setFromAxisAngle(headAxis,d.headAngle));
 headAxis.set(Math.sin(actor.rotation.y),0,Math.cos(actor.rotation.y)).applyQuaternion(headParent);
 d.head.quaternion.premultiply(headRotation.setFromAxisAngle(headAxis,d.headTilt));
 headAxis.set(Math.cos(actor.rotation.y),0,-Math.sin(actor.rotation.y)).applyQuaternion(headParent);
 d.head.quaternion.premultiply(headRotation.setFromAxisAngle(headAxis,d.headPitch));
}

export function updateCharacterActor(a,t,{game,camera,dt,time,opacity,auxiliary,reduced}){
 const d=a.userData.character;
 const fresh=d.occurrence!==t;
 if(fresh){startPose(a,d,t,game,camera);d.exposure?.reset();}
 const {x,z}=t;
 const base=t.y??(t.floor-1)*RISE;
 const dx=x-d.lastX,dz=z-d.lastZ;
 const distance=Math.hypot(dx,dz);
 d.lastX=x;d.lastZ=z;
 const speed=!fresh&&dt>0&&distance<5?distance/dt:0;
 d.speed=speed>movementCutoff?T.MathUtils.damp(d.speed,speed,15,dt):0;
 a.position.set(x,base,z);
 const scale=d.scale*(auxiliary?.86:1);
 a.scale.setScalar(scale);
 let target=a.rotation.y;
 if(d.kind==='inspector'){
  target=Math.atan2(game.player.x-x,game.player.z-z);
  if(speed>movementCutoff){
   const difference=Math.atan2(dx,dz)-target;
   target+=.36*T.MathUtils.clamp(Math.atan2(Math.sin(difference),Math.cos(difference)),-1.2,1.2);
  }
 }
 else if(d.kind!=='yujie'&&d.kind!=='inspector'&&speed>movementCutoff)target=Math.atan2(dx,dz);
 else if(d.kind==='kun'&&Number.isFinite(t.heading))target=t.heading+Math.PI;
 const turn=Math.atan2(Math.sin(target-a.rotation.y),Math.cos(target-a.rotation.y));
 a.rotation.y+=turn*(fresh?1:1-Math.exp(-dt*(d.kind==='liang'?5.8:12)));
 if(d.kind==='liang'&&d.action&&(dt>0||fresh))moveListener(a,d,t,dt,scale,reduced);
 else if(d.kind==='kun'&&d.action&&(dt>0||fresh)){
  const dormant=t.phase==='dormant',clip=dormant?d.dormantClip:d.runClip||d.walkClip;
  if(d.action.getClip()!==clip){
   const previous=d.action;
   d.action=d.mixer.clipAction(clip).reset().setEffectiveWeight(1).play().crossFadeFrom(previous,.18,false);
  }
  if(dormant&&reduced)d.action.time=0;
  // Keep the run readable through slow navigation, but never animate through an actual stop or stun.
  d.action.setEffectiveTimeScale(dormant?reduced?0:1:t.phase!=='stunned'&&d.speed>movementCutoff?T.MathUtils.clamp(d.speed/(d.runSpeed*scale),.85,2.7):0);
  d.mixer.update(dt);
 }
 else if(d.action&&(dt>0||fresh)){
  const crawling=t.phase==='crawling'&&d.crawlClip;
  const want=crawling?d.crawlClip:d.runClip&&(!d.walkClip||d.speed>1.8)?d.runClip:d.walkClip||d.runClip;
  if(d.action.getClip()!==want&&(crawling||speed>movementCutoff)){
   const previous=d.action,phase=previous.time/previous.getClip().duration;
   previous.stop();d.action=d.mixer.clipAction(want).reset().play();d.action.time=phase*want.duration;
  }
  const authored=crawling?d.crawlSpeed:d.action.getClip()===d.runClip?d.runSpeed:d.walkSpeed;
  const rate=speed>movementCutoff?T.MathUtils.clamp(d.speed/(authored*scale),.1,2.7):0;
  if(d.kind==='inspector'){
   const weight=speed>movementCutoff?1:0;
   d.action.setEffectiveWeight(fresh?0:T.MathUtils.damp(d.action.getEffectiveWeight(),weight,16,dt));
  }
  d.mixer.update(dt*rate*(d.kind==='doubao'&&crawling?.65:1));
 }
 if(d.face)d.face.setTime(reduced?0:time);
 d.exposure?.update(dt,reduced,t.age,t.warning);
 if(d.shaftReveal){
  const turn=gunmuVisibleAcrossTurn(game.floor?.gunmuFinale,game.state?.gunmuPipeIndex,t);
  d.shaftReveal.value=T.MathUtils.damp(d.shaftReveal.value,+turn,9,dt);
 }
 for(const material of d.materials){
  material.opacity=opacity;
  if(d.kind==='yujie'&&material.isMeshStandardMaterial)material.emissiveIntensity=game.debugCalm?.16:visitorKeyPower;
  if(d.shaftReveal&&material.isMeshStandardMaterial)material.emissiveIntensity=t.phase==='crawling'?.08+.24*d.shaftReveal.value:0;
 }
}
