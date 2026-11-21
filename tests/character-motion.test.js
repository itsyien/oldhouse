import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {readFileSync} from 'node:fs';
import {createCharacterActor,updateCharacterActor} from '../src/character-models.js';

test('Liang blends walk, pursuit, and planted listening without accumulating a head turn',()=>{
 const scene=new T.Group(),chest=new T.Bone(),head=new T.Bone();
 chest.name='Chest';chest.add(head);
 head.name='Head';
 head.position.y=1.7;
 const body=new T.Mesh(new T.BoxGeometry(.9,1.8,.4),new T.MeshStandardMaterial());
 body.position.y=.9;scene.add(chest,body);
 const clips=['Heavy_Walk','Pursuit_Run','Listen'].map((name,i)=>new T.AnimationClip(name,1,[
  new T.NumberKeyframeTrack('Head.position[y]',[0,.5,1],[1.7,1.72+i*.01,1.7])
 ]));
 const actor=createCharacterActor({scene,animations:clips},'liang',{
  height:1.8,walk:clips[0].name,run:clips[1].name,listen:clips[2].name
 });
 const d=actor.userData.character,camera=new T.PerspectiveCamera();
 camera.position.z=4;
 const t={kind:'liang',floor:5,x:0,z:0,phase:'patrolling',route:[{x:0,z:0},{x:0,z:4}],routeIndex:0,direction:1};
 const frame=(reduced=false)=>updateCharacterActor(actor,t,{game:{},camera,dt:.05,opacity:1,reduced});
 frame();
 for(let i=0;i<12;i++){t.z+=.0775;frame();}
 assert.equal(d.action.getClip().name,'Heavy_Walk');
 assert(d.action.time>0);
 t.phase='investigating';t.noiseGoal={x:4,z:9};
 for(let i=0;i<12;i++){t.z+=.28;frame();}
 assert.equal(d.action.getClip().name,'Pursuit_Run');
 t.phase='listening';t.lastNoise={x:4,z:t.z};t.probe={x:-4,z:t.z};
 for(let i=0;i<6;i++)frame();
 assert(d.headTilt<-.35&&d.chestLean>.20,'the ear and the chest change abruptly at the stop');
 for(let i=0;i<40;i++)frame();
 assert.equal(d.action.getClip().name,'Listen');
 assert.equal(d.action.getEffectiveTimeScale(),0);
 assert(d.headAngle>.77&&d.headAngle<=.84);
 assert(d.headTilt<-.35);
 assert(d.headPitch>.10);
 const resting=d.head.quaternion.clone();
 const planted=d.chest.quaternion.clone();
 camera.position.x=-8;
 for(let i=0;i<40;i++)frame();
 assert(resting.angleTo(d.head.quaternion)<.002);
 assert(planted.angleTo(d.chest.quaternion)<.002);
 t.lastNoise={x:-4,z:t.z};
 for(let i=0;i<20;i++)frame();
 assert(d.headAngle<-.77&&d.headTilt>.35);
 for(let i=0;i<40;i++)frame(true);
 assert(Math.abs(d.headTilt)<.001);
 assert(Math.abs(d.headPitch)<.001);
 assert(d.chestLean<.081);
});

test('Liang darkens the eye area while preserving the mesh and the rest of the outfit',()=>{
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute([.05,1.652,.11, .05,1.652,-.11, .15,.95,.11],3));
 const material=new T.MeshStandardMaterial(),scene=new T.Group();
 scene.add(new T.Mesh(geometry,material));
 const actor=createCharacterActor({scene,animations:[]},'liang',{height:2.15});
 const shaded=actor.children[0].children[0],colors=shaded.geometry.getAttribute('color');
 assert(shaded.material.vertexColors);
 assert.equal(geometry.getAttribute('color'),undefined);
 assert.deepEqual(shaded.geometry.getAttribute('position').array,geometry.getAttribute('position').array);
 assert(colors.getX(0)<.25);
 assert(colors.getX(1)>.8);
 assert.equal(colors.getX(2),1);
});

test('Kun twitches immediately with planted feet, then blends straight into pursuit',()=>{
 const bytes=readFileSync(new URL('../public/assets/apartment/characters/Kun.glb',import.meta.url));
 const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
 const joints=new Set(gltf.skins.flatMap(s=>s.joints));
 const nodes=gltf.nodes.map((n,i)=>{
  const o=joints.has(i)?new T.Bone():new T.Group();o.name=T.PropertyBinding.sanitizeNodeName(n.name||'');
  if(n.translation)o.position.fromArray(n.translation);
  if(n.rotation)o.quaternion.fromArray(n.rotation);
  return o;
 });
 gltf.nodes.forEach((n,i)=>n.children?.forEach(child=>nodes[i].add(nodes[child])));
 const scene=new T.Group();gltf.scenes[gltf.scene||0].nodes.forEach(i=>scene.add(nodes[i]));
 const body=new T.Mesh(new T.BoxGeometry(.7,1.8,.4),new T.MeshStandardMaterial());
 body.position.y=.9;scene.add(body);
 const grip=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),.5).toArray();
 const run=new T.AnimationClip('Chase_Run',1,[
  new T.QuaternionKeyframeTrack('Head.quaternion',[0,1],[0,0,0,1,0,0,0,1]),
  new T.QuaternionKeyframeTrack('FingersR.quaternion',[0,1],[...grip,...grip])
 ]);
 const actor=createCharacterActor({scene,animations:[run]},'kun',{height:1.8,run:run.name,runSpeed:3.85});
 const d=actor.userData.character,camera=new T.PerspectiveCamera();camera.position.z=4;
 const t={kind:'kun',floor:1,x:0,z:0,phase:'dormant',heading:0};
 const frame=(dt=.025,reduced=false)=>{updateCharacterActor(actor,t,{game:{},camera,dt,time:0,opacity:1,reduced});actor.updateMatrixWorld(true);};
 const bone=name=>actor.getObjectByName(name),point=name=>bone(name).getWorldPosition(new T.Vector3());
 const axe=bone('Kun_FireAxe'),axeLocal=axe.matrix.clone();
 frame(0);
 assert.equal(d.action.getClip().name,'Dormant_Twitch');
 for(const track of d.action.getClip().tracks){
  const stride=track.getValueSize();
  assert.deepEqual(Array.from(track.values.slice(0,stride)),Array.from(track.values.slice(-stride)),'The loop must close without a pose jump');
 }
 assert(bone('FingersR').quaternion.angleTo(new T.Quaternion().fromArray(grip))<.001,'Keep the authored axe grip');
 assert(point('HandL').y<point('ClavicleL').y-.3,'Arms must already hang below the shoulders on the first visible frame');
 const feet=['FootL','FootR'].map(point),initial=bone('Head').quaternion.clone();
 let movement=0;
 for(let i=0;i<256;i++){
  frame();movement=Math.max(movement,initial.angleTo(bone('Head').quaternion));
  feet.forEach((p,j)=>assert(p.distanceTo(point(['FootL','FootR'][j]))<1e-6,'Dormant feet must stay planted'));
  assert.equal(axe.parent.name,'HandR');assert(axe.matrix.equals(axeLocal),'The axe grip must not change');
 }
 assert(movement>.06,'A visible recurrent head twitch must occur');
 frame(.025,true);const still=bone('Head').quaternion.clone();
 for(let i=0;i<30;i++)frame(.025,true);
 assert.deepEqual(bone('Head').quaternion.toArray(),still.toArray(),'Reduced motion uses a fixed planted pose');
 const before=bone('Head').quaternion.clone();
 t.phase='pursuing';t.z+=.1;frame(.025);
 assert.equal(d.action.getClip(),run);
 assert(d.action.time>0,'Locomotion starts on activation without an idle delay');
 assert(before.angleTo(bone('Head').quaternion)<.15,'Activation must blend instead of snapping');
 for(let i=0;i<20;i++){t.z+=.1;frame();}
 assert(bone('Head').quaternion.angleTo(new T.Quaternion())<1e-6,'The dormant pose must release the active rig');
 t.phase='patrolling';
 for(let i=0;i<20;i++){t.z+=1.05*.025;frame();}
 assert(d.action.getEffectiveTimeScale()>=.85,'Slow navigation must still read as a jog, not slow-motion walking');
 assert.equal(actor.position.z,t.z,'Presentation must not change physical movement');
 const blocked=d.action.time;frame();
 assert.equal(d.action.time,blocked,'A real stop must not run in place');
 t.phase='stunned';t.z+=.01;frame();
 assert.equal(d.action.time,blocked,'Stun must suppress locomotion even on its final displacement frame');
 t.phase='investigating';t.z+=.03;frame();
 assert(d.action.getEffectiveTimeScale()>=.85,'Running resumes after the obstacle releases');
});

test('Gunmu crawls at 65 percent cadence without changing movement or upright animation',()=>{
 const scene=new T.Group(),hips=new T.Bone();hips.name='Hips';scene.add(hips);
 const body=new T.Mesh(new T.BoxGeometry(.8,2,.5),new T.MeshStandardMaterial());body.position.y=1;scene.add(body);
 const run=new T.AnimationClip('Beast_Locomotion',8,[new T.NumberKeyframeTrack('Hips.position[y]',[0,4,8],[0,.02,0])]);
 const crawl=new T.AnimationClip('Pipe_Crawl',8,[new T.NumberKeyframeTrack('Hips.position[y]',[0,4,8],[0,.01,0])]);
 const create=kind=>createCharacterActor({scene,animations:[run,crawl]},kind,{height:2,run:run.name,crawl:crawl.name,runSpeed:4.05,crawlSpeed:1.9});
 const actor=create('doubao'),reference=create('reference'),camera=new T.PerspectiveCamera();
 const t={kind:'doubao',floor:1,x:0,z:0,y:0,phase:'crawling'},options={game:{},camera,dt:.025,time:0,opacity:1,reduced:false};
 const frame=()=>{updateCharacterActor(actor,t,options);updateCharacterActor(reference,t,options);};
 frame();
 for(let i=0;i<40;i++){t.z+=.06;frame();}
 const d=actor.userData.character,control=reference.userData.character;
 assert.equal(d.action.getClip(),crawl);
 assert(Math.abs(d.action.time/control.action.time-.65)<1e-8,'Only crawl playback is slowed by 35 percent');
 assert.deepEqual(actor.position.toArray(),reference.position.toArray());
 assert.equal(actor.position.y,0,'Do not introduce a root bob or height offset');
 const stopped=d.action.time;frame();assert.equal(d.action.time,stopped);
 t.phase='pursuing';t.z+=.1;frame();
 const active=d.action.time,normal=control.action.time;
 for(let i=0;i<10;i++){t.z+=.1;frame();}
 assert.equal(d.action.getClip(),run);
 assert(Math.abs((d.action.time-active)-(control.action.time-normal))<1e-8,'Upright run cadence stays unchanged');
});
