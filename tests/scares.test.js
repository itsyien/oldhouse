import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createCutoutActor,scareKey,scareFrame,SCARE_IMPACT,SCARE_DURATION} from '../src/actors.js';
import {createSweeperScare} from '../src/sweeper-scare.js';
test('new Kun pursuit PNG is the supplied unchanged RGBA image',()=>{const bytes=fs.readFileSync(new URL('../public/assets/apartment/kun-chase.png',import.meta.url));assert.equal(bytes.readUInt32BE(16),474);assert.equal(bytes.readUInt32BE(20),526);assert.equal(bytes[25],6);assert.equal(createHash('sha256').update(bytes).digest('hex'),'b2ec2baa51f455e59969803a9ba24e64fc9d8b078197a5a0a351281cc28f2a93');});
test('Kun has a chase model, a fallback cutout and a dedicated catch image',()=>{const m=JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/runtime-manifest.json',import.meta.url)));assert.equal(m.characterModels.kun.run,'Chase_Run');assert.equal(m.textures.kun.url,'/assets/apartment/kun-chase.png');assert.notEqual(m.scares.kun.asset,'kun');assert.equal(m.textures[m.scares.kun.asset].url,'/assets/apartment/scares/kunKunKongBu.png');assert.deepEqual(m.billboards.kun.bounds,[51,0,372,526]);});
test('inspector keeps its dedicated catch image in both inspections; other identities stay distinct',()=>{assert.equal(scareKey({kind:'inspector',checks:0}),'inspector');assert.equal(scareKey({kind:'inspector',checks:1}),'inspector');assert.equal(scareKey({kind:'kun',checks:0}),'kun');assert.equal(scareKey({kind:'naiwa'}),'naiwa');assert.equal(scareKey({kind:'liang'}),'liang');});
test('pre-cut character keeps full alpha and uses the supplied crop without stretching',()=>{const t=new T.Texture({width:597,height:332}),a=createCutoutActor(t,{bounds:[225,22,457,332]});a.geometry.computeBoundingBox();const b=a.geometry.boundingBox;assert(Math.abs((b.max.x-b.min.x)/(b.max.y-b.min.y)-232/310)<1e-6);assert.equal(a.material.uniforms.uMap.value,t);assert.equal(a.material.uniforms.uKind.value,4);const uv=a.geometry.attributes.uv;assert(Math.abs(uv.getX(0)-225/597)<1e-6);assert(Math.abs(uv.getY(0)-(1-22/332))<1e-6);a.geometry.dispose();a.material.dispose();});
test('every dedicated scare explicitly references a shipped texture and framing',()=>{const m=JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/runtime-manifest.json',import.meta.url)));for(const k of ['inspector','kun']){const s=m.scares[k];assert(s.offset.length===2);assert(s.scale>0);assert(fs.existsSync(new URL('../public'+m.textures[s.asset].url,import.meta.url)));}});
test('sweeper scares use the supplied portraits at impact, separate from world art',()=>{
 const m=JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/runtime-manifest.json',import.meta.url)));
 for(const [kind,art,width,height,hash] of [
  ['patrol','wangjingwei',433,577,'a5d5ed279038df9a631e099dffe1db6c6a33b8b4ac26cdfd2f6ccfb1f4c2cdf2'],
  ['rush','floorHirohito',1086,1448,'cf6b48b538746158e87e5f1e6513255ee093e6c93c3c25985a64ae6646299e0b'],
 ]){
  const s=m.scares[kind];
  assert.equal(m.billboards[kind].asset,art);
  assert.equal(new Set([s.asset,s.impactAsset,art]).size,3);
  const images=[s.asset,s.impactAsset].map(key=>fs.readFileSync(new URL('../public'+m.textures[key].url,import.meta.url)));
  assert.equal(images[0].toString('ascii',8,12),'WEBP');
  assert.equal(images[1].readUInt32BE(16),width);assert.equal(images[1].readUInt32BE(20),height);
  if(kind==='patrol')assert.equal(images[1][25],6,'Wang portrait is RGBA');
  assert.equal(createHash('sha256').update(images[1]).digest('hex'),hash);
  assert.notDeepEqual(...images);
  assert.deepEqual(s.bounds,[0,0,1024,1024]);
 }
 assert.notEqual(m.scares.patrol.asset,m.scares.rush.asset);
 assert.notEqual(m.scares.patrol.impactAsset,m.scares.rush.impactAsset);
 assert(Object.entries(m.scares).every(([kind,s])=>['patrol','rush'].includes(kind)||!s.impactAsset));
 const alternate=m.textures[m.scares.patrol.alternateImpact.asset],bytes=fs.readFileSync(new URL('../public'+alternate.url,import.meta.url));
 assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20),bytes[25]],[1312,1199,6]);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'0b162846a722f4858c3c4dc0b3ef52b89ae2fd545a83f9e26fd382818bfac31e');
 assert.equal(m.scares.rush.alternateImpact,undefined);
});

test('both sweepers ship skinned rigs with their authored claw animations',()=>{
 const m=JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/runtime-manifest.json',import.meta.url)));
 for(const [kind,expectedClip] of [['patrol','WangClawLunge'],['rush','TennoClawLunge']]){
  const data=fs.readFileSync(new URL('../public'+m.scares[kind].model.url,import.meta.url));
  assert.equal(data.toString('ascii',0,4),'glTF');
  const doc=JSON.parse(data.toString('utf8',20,20+data.readUInt32LE(12)));
  const animation=doc.animations.find(clip=>clip.name===expectedClip);
  assert(doc.skins.some(skin=>skin.joints.length>=10));assert(animation.channels.length>=6);
 }
});

test('Wang sustains a longer approach, reaches, then cuts to a dark distorted portrait at impact',()=>{
 const f=age=>scareFrame(age,false,'patrol'),opening=f(.11),glimpse=f(.64),close=f(2.32),reach=f(3.11),hit=f(3.2),end=f(hit.duration);
 assert(!opening.world&&!opening.visible&&opening.figure.reveal===0);
 assert(glimpse.figure.reveal>0&&glimpse.figure.x>.4&&!glimpse.impactPhoto);
 assert(close.figure.distance+1.5<glimpse.figure.distance&&close.figure.x<0);
 assert(reach.figure.reach>.9&&reach.figure.distance<1.4&&reach.figure.poseTime>2.2);
 assert(hit.figure===null&&hit.visible&&hit.impactPhoto&&hit.impact===3.2&&hit.black===0);
 assert(hit.light<.5&&hit.distortion>0&&hit.grain>0);
 assert(!end.visible&&end.black===1&&end.fade===1);
 const reduced=scareFrame(3.11,true,'patrol');
 assert.equal(reduced.figure.x,0);assert(reduced.figure.distance>reach.figure.distance);assert(reduced.figure.poseTime<reach.figure.poseTime);
 for(let age=0;age<hit.duration;age+=.025){const s=scareFrame(age,true,'patrol');assert([s.x,s.y,s.roll,s.grain,s.distortion].every(n=>n===0));}
});

test('Wang stage preserves the photo aspect, samples the rig at shot time, and resets after a catch',()=>{
 const portrait=new T.Texture({width:433,height:577}),old=new T.Texture({width:1024,height:1024});
 const shot=createSweeperScare(old,portrait,{bounds:[0,0,1024,1024]},'patrol');
 shot.begin();shot.update(scareFrame(.8,false,'patrol'),16/9);
 assert(shot.scene.children.some(child=>child.isMesh&&child.visible),'the fallback renders while the model is unavailable');
 const model=new T.Group(),hand=new T.Mesh(new T.BoxGeometry(.5,1.85,.3));hand.name='Hand';model.add(hand);
 const clip=new T.AnimationClip('WangClawLunge',2.35,[new T.NumberKeyframeTrack('Hand.rotation[z]',[0,2.35],[0,1])]);
 shot.setModel({scene:model,animations:[clip]});shot.update(scareFrame(1,false,'patrol'),16/9);
 assert(!shot.model.visible,'loading mid-shot does not switch from the fallback');
 shot.begin();shot.update(scareFrame(3.0,false,'patrol'),16/9);
 assert(shot.model.visible&&hand.rotation.z>.9&&!shot.portrait.visible);
 shot.update(scareFrame(3.25,false,'patrol'),21/9);
 assert(!shot.model.visible&&shot.portrait.visible);assert.equal(shot.portrait.material.uniforms.uMap.value,portrait);
 assert(shot.portrait.material.uniforms.uScareWarp.value>0);
 const {width,height}=shot.portrait.geometry.parameters;assert(Math.abs(width/height-433/577)<1e-7);
 shot.update(scareFrame(3.35,false,'patrol'),390/844);shot.scene.updateMatrixWorld(true);
 for(const edge of [.3,.62])assert(Math.abs(shot.portrait.localToWorld(new T.Vector3((edge-.5)*width,0,0)).project(shot.camera).x)<.95);
 shot.update(scareFrame(3.35,true,'patrol'),390/844);assert.equal(shot.portrait.material.uniforms.uScareWarp.value,0);
 shot.clear();assert(!shot.model.visible&&!shot.portrait.visible);
 shot.begin();shot.update(scareFrame(.4,false,'patrol'),16/9);assert(hand.rotation.z<.2);
});

test('Wang samples one portrait per scare and frames both pairs of eyes without stretching',t=>{
 const still=new T.Texture({width:1024,height:1024}),original=new T.Texture({width:433,height:577});
 const green=new T.Texture({width:1312,height:1199}),eyes=[.44,.367];
 const shot=createSweeperScare(still,original,{bounds:[0,0,1024,1024],alternateImpact:{eyes,scale:.82}},'patrol',green);
 let roll=.19;
 const random=t.mock.method(Math,'random',()=>roll);
 const uniforms=shot.portrait.material.uniforms;
 const aspect=390/844;
 const photos=[
  {texture:green,eyeY:eyes[1],eyeX:[.331,.544],chroma:true},
  {texture:original,eyeY:.293,eyeX:[.3,.62],chroma:false}
 ];
 for(const photo of photos){
  shot.begin();roll=.81;
  shot.update(scareFrame(.85,false,'patrol'),16/9);
  assert(!shot.portrait.visible&&shot.scene.children.some(mesh=>mesh.isMesh&&mesh.visible&&mesh.material.uniforms.uMap.value===still));
  for(const age of [3.24,3.63,5.3]){
   shot.update(scareFrame(age,true,'patrol'),aspect);
   shot.scene.updateMatrixWorld(true);
   assert(shot.portrait.visible);
   assert.equal(uniforms.uMap.value,photo.texture);
   assert.equal(uniforms.uScareChroma.value,photo.chroma);
   const {width,height}=shot.portrait.geometry.parameters;
   assert(Math.abs(width/height-photo.texture.image.width/photo.texture.image.height)<1e-7);
   for(const u of photo.eyeX){
    const point=shot.portrait.localToWorld(new T.Vector3((u-.5)*width,(.5-photo.eyeY)*height,0)).project(shot.camera);
    assert(Math.abs(point.x)<.95&&Math.abs(point.y)<.3);
   }
  }
  shot.clear();
 }
 assert.equal(random.mock.callCount(),2);
});

test('Naiwa keeps its normal image and uses the newly supplied transparent thinking pose only for capture',()=>{const m=JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/runtime-manifest.json',import.meta.url)));assert.equal(m.textures.naiwa.url,'/assets/naiwa.jpg');const s=m.scares.naiwa;assert.equal(s.asset,'naiwaScare');const bytes=fs.readFileSync(new URL('../public'+m.textures[s.asset].url,import.meta.url));assert.equal(bytes.readUInt32BE(16),1254);assert.equal(bytes.readUInt32BE(20),1254);assert(s.bounds[2]<=1254&&s.bounds[3]<=1254);});
test('capture has a dark intake, fast arrival, readable hold and black ending without flashing',()=>{
 const before=scareFrame(SCARE_IMPACT-.01),hit=scareFrame(SCARE_IMPACT+.13),hold=scareFrame(.8),end=scareFrame(SCARE_DURATION);
 assert.equal(before.visible,false);assert.equal(before.black,1);assert(hit.visible);assert(hit.distance<1.1);assert.equal(hit.black,0);assert.equal(hold.black,0);assert(Math.abs(hold.roll)<.001);assert.equal(end.visible,false);assert.equal(end.black,1);assert.equal(end.fade,1);
 for(let a=0;a<2;a+=.01){const s=scareFrame(a);assert(s.black>=0&&s.black<=1);assert(s.light<=1.04);assert(s.distance>.9);}
});
test('reduced motion removes all shake, roll and scan noise, keeps a slower reveal and the same end time',()=>{
 for(let a=0;a<2;a+=.01){const s=scareFrame(a,true);assert.equal(s.x,0);assert.equal(s.y,0);assert.equal(s.roll,0);assert.equal(s.grain,0);}
 assert(scareFrame(.25,true).black>scareFrame(.25).black);assert(scareFrame(.3,true).distance>scareFrame(.3).distance);assert.equal(scareFrame(SCARE_DURATION,true).visible,false);
});
test('Tenno glides in from the left and cuts from its reach to the photograph at 2.51 seconds',()=>{
 const frame=t=>scareFrame(t,false,'rush');
 const opening=frame(.12),stare=frame(.48),approach=frame(1.8),reach=frame(2.48),hit=frame(2.51),end=frame(hit.duration);
 assert(!opening.world&&!opening.visible&&opening.figure.reveal===0);
 assert(stare.figure.x<-.6&&stare.figure.reveal>0&&!stare.impactPhoto);
 assert(approach.figure.x>0&&approach.figure.distance+1.5<stare.figure.distance);
 assert(reach.figure.reach>.95&&reach.figure.distance<1.3&&!reach.visible);
 assert(hit.visible&&hit.figure===null&&hit.impactPhoto&&hit.impact===2.51);
 assert(!end.visible&&end.black===1&&end.fade===1);
 const reduced=scareFrame(2.48,true,'rush');
 assert.equal(reduced.figure.x,0);assert(reduced.figure.distance>reach.figure.distance&&reduced.figure.poseTime<reach.figure.poseTime);
 for(let age=0;age<hit.duration;age+=.025){const s=scareFrame(age,true,'rush');assert.deepEqual([s.x,s.y,s.roll,s.grain],[0,0,0,0]);}
});

test('both sweeper closeups hold for nearly two seconds before fading',()=>{
 for(const kind of ['patrol','rush'])for(const reduced of [false,true]){
  const {impact,duration}=scareFrame(0,reduced,kind);
  assert(Math.abs(duration-impact-2.7)<1e-8);
  const hold=scareFrame(impact+1.9,reduced,kind),fade=scareFrame(impact+2.3,reduced,kind);
  assert(hold.visible&&hold.black===0);
  assert(fade.visible&&fade.black>0&&fade.black<1);
  assert.equal(scareFrame(duration,reduced,kind).visible,false);
 }
});

test('Tenno stage uses green lighting and retains both eyes in frame on a narrow display',()=>{
 const still=new T.Texture({width:1024,height:1024}),photo=new T.Texture({width:1086,height:1448});
 const shot=createSweeperScare(still,photo,{bounds:[0,0,1024,1024],model:{clip:'TennoClawLunge'}},'rush');
 assert(shot.scene.background.g>shot.scene.background.r);
 const keys=shot.scene.children.filter(light=>light.isDirectionalLight);
 assert(keys.every(key=>key.color.g>key.color.r&&key.color.g>key.color.b));
 shot.begin();shot.update(scareFrame(.8,false,'rush'),16/9);
 assert(!shot.portrait.visible&&shot.scene.children.some(child=>child.isMesh&&child.visible&&child.material.uniforms.uMap.value===photo));
 shot.update(scareFrame(2.65,false,'rush'),390/844);shot.scene.updateMatrixWorld(true);
 assert(shot.portrait.visible&&shot.portrait.material.uniforms.uMap.value===photo);
 const {width,height}=shot.portrait.geometry.parameters;
 assert(Math.abs(width/height-.75)<1e-7);
 for(const u of [.32,.59]){
  const point=shot.portrait.localToWorld(new T.Vector3((u-.5)*width,(.5-.260)*height,0)).project(shot.camera);
  assert(Math.abs(point.x)<.95&&Math.abs(point.y)<.3);
 }
});
test('Naiwa holds a dim stare before lunging and holds close after the strike',()=>{
 const still=scareFrame(.28,false,'naiwa'),hit=scareFrame(.43,false,'naiwa'),hold=scareFrame(.95,false,'naiwa');
 assert(still.visible&&still.distance>2.3&&still.light<.35);
 assert(hit.distance<1.1&&hit.light>.8&&hit.impact===.315);
 assert.equal(hold.distance,hit.distance);
 for(let a=0;a<SCARE_DURATION;a+=.01){
  const s=scareFrame(a,true,'naiwa');
  assert.deepEqual([s.x,s.y,s.roll,s.grain],[0,0,0,0]);
  if(a>=.28&&a<1.13)assert(s.black<.01);
 }
});
