import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {createWorld,lampPower} from '../src/world.js';
import {prepareBuilding,doorBlock,worldStair} from '../src/building.js';
import {Game} from '../src/simulation.js';
import {setLanguage} from '../src/i18n.js';
const context=Object.fromEntries(['fillRect','strokeRect','beginPath','ellipse','fill','fillText'].map(k=>[k,()=>{}]));
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context})};
const assets=Object.fromEntries(['liang','inspectorPortrait','laodaPortrait','chiangkaishekPortrait','wangjingwei'].map(k=>[k,new T.Texture({width:300,height:400})]));
const building=prepareBuilding(JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/floors.json',import.meta.url))));
const manifest=JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/runtime-manifest.json',import.meta.url)));for(const f of building.floors)for(const i of f.interactions)if(i.type==='portrait')i.asset=manifest.portraitInteractions[i.id]||i.asset;
function fixture(floor=5){const game=new Game(building,1);game.player.floor=floor;const scene=new T.Scene(),world=createWorld(scene,assets,game.floor,game.state),camera=new T.PerspectiveCamera();camera.position.set(18,game.floor.base+1.65,4);return{game,scene,world,camera};}
test('printed portraits and notice signs use non-emissive lighting materials on every floor',()=>{
 for(const floor of [1,2,3,4,5]){const {world}=fixture(floor);try{let count=0;world.root.traverse(o=>{const m=o.material,tex=m?.map;if(!tex||!(tex.userData.redraw||Object.values(assets).includes(tex)))return;count++;assert(m.isMeshStandardMaterial,`${floor}F printed surface must receive scene light`);assert.equal(m.emissive.getHex(),0);assert.equal(m.metalness,0);assert(m.roughness>=.9);});assert(count>=10);}finally{world.dispose();}}
});
test('expanded wings render solid floors, ceilings and perimeter walls with lit mounted signage',()=>{
 for(const floor of [3,4]){const {game,world,scene,camera}=fixture(floor);try{
  scene.updateMatrixWorld(true);const x=game.floor.bounds.maxX-1.5,z=16,base=game.floor.base;
  for(const dir of [new T.Vector3(0,-1,0),new T.Vector3(0,1,0),new T.Vector3(1,0,0)]){
   const hits=new T.Raycaster(new T.Vector3(x,base+1.65,z),dir,0,2).intersectObject(world.root,true);assert(hits.length,`${floor}F missing annex boundary`);
  }
  let signs=0;world.root.traverse(o=>{if(!o.isMesh||!o.material?.map?.userData.redraw||o.position.x<34)return;signs++;const p=o.getWorldPosition(new T.Vector3()),back=new T.Vector3(0,0,-1).applyQuaternion(o.getWorldQuaternion(new T.Quaternion()));const hits=new T.Raycaster(p.clone().addScaledVector(back,.015),back,0,.3).intersectObject(world.root,true).filter(h=>h.object!==o);assert(hits.length,`${floor}F floating sign at ${p.toArray()}`);});assert(signs>=2);
  camera.position.set(x,base+1.65,z);world.update(.1,camera,2,game,true);assert.equal(world.lights.length,5);assert(world.lights.some(l=>l.position.x>34&&l.intensity>0));
 }finally{world.dispose();}}
});
test('repeated patrol warning lights remain red during blackout then go dark at arrival',()=>{
 for(const reduced of [false,true]){const {game,world,camera}=fixture(2);try{
  game.player={floor:2,x:32,z:16,y:3.24};camera.position.set(32,4.89,16);game.state.blackout=true;assert(game.beginPatrol());game.threat.age=1;world.update(.1,camera,1,game,reduced);
  const tube=world.fixtures.find(l=>l.x===32&&l.z===16);assert(tube.power>0);assert(tube.tube.material.color.r>tube.tube.material.color.g*8);assert(world.lights.some(l=>l.intensity>0&&l.color.r>l.color.g*8));
  game.threat.age=7.1;game.threat.phase='sweeping';world.update(.1,camera,7.1,game,reduced);assert(world.fixtures.every(l=>l.power===0));assert(world.lights.every(l=>l.intensity===0));
 }finally{world.dispose();}}
});
test('protective portraits are attached to the exact marked door leaves and wardrobes',()=>{
 const {game,world}=fixture(2);try{
  for(const d of world.doors){const marks=d.mesh.children.filter(o=>o.userData.wardPortrait);assert.equal(marks.length,d.data.wardPortrait?2:0);for(const p of marks){assert.equal(p.userData.target,d.id);assert(Math.abs(p.position.z)>.055);assert.equal(p.material.map,assets.chiangkaishekPortrait);}}
  for(const r of world.root.userData.interactions.filter(r=>r.wardrobe)){let n=0;r.group.traverse(o=>{if(o.userData.wardPortrait){n++;assert(r.wardrobe.some(d=>d.hinge===o.parent));assert(world.interactables.includes(o));}});assert.equal(n,r.data.wardPortrait?1:0);}
 }finally{world.dispose();}
});
test('flashlight pickup disappears after collection and Doubao warning lights remain visible in blackout',()=>{
 const {game,world,camera}=fixture(1);try{
  const r=world.root.userData.interactions.find(r=>r.torch);assert(r);world.update(.1,camera,0,game,false);assert(r.torch.visible);game.player={floor:1,x:31.8,z:13.8,y:0};assert(game.interact(r.data.id));world.update(.1,camera,0,game,false);assert(!r.torch.visible);
  game.state.blackout=true;game.beginEncounter('doubao',{floor:1,x:31,z:4});game.threat.age=.2;world.update(.1,camera,0,game,false);const bright=world.fixtures.map(l=>l.power);assert(world.lights.some(l=>l.intensity>0));game.threat.age=.5;world.update(.1,camera,0,game,false);assert(world.fixtures.every((l,i)=>l.power<bright[i]));game.threat.age=1;world.update(.1,camera,0,game,true);assert(world.fixtures.every(l=>l.power>.5));game.threat.age=3.1;world.update(.1,camera,0,game,true);assert(world.fixtures.every(l=>l.power===0));assert(world.lights.every(l=>l.intensity===0));
 }finally{world.dispose();}
});
test('wardrobes have paired interactive doors that close after entry and reopen on exit',()=>{
 const {game,world,scene,camera}=fixture(4);try{
  const records=world.root.userData.interactions.filter(r=>r.wardrobe);assert.equal(records.length,4);world.update(.1,camera,0,game,true);
  for(const r of records){assert.equal(r.wardrobe.length,2);for(const d of r.wardrobe){assert(world.interactables.includes(d.hinge.children[0]));assert.equal(d.hinge.children[0].userData.target,r.i.id);}}
  const r=records[0];scene.updateMatrixWorld(true);const ray=new T.Raycaster(new T.Vector3(r.i.x,game.floor.base+1.65,r.i.entry.z),new T.Vector3(0,0,-1));assert(ray.intersectObjects(world.interactables,false).some(h=>h.object.userData.target===r.i.id),'the central door seam must also accept E');Object.assign(game.player,r.i.entry,{y:game.floor.base});assert(game.interact(r.i.id));world.update(.1,camera,.1,game,true);assert(Math.abs(r.wardrobe[0].hinge.rotation.y)>.1);
  for(let i=0;i<30;i++)world.update(.05,camera,.2+i*.05,game,true);assert(Math.abs(r.wardrobe[0].hinge.rotation.y)<.001);scene.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(r.wardrobe[0].hinge);assert(Math.abs(box.min.y-game.floor.base-.05)<.001);assert(game.interact(r.i.id));world.update(.1,camera,2,game,true);assert(Math.abs(r.wardrobe[0].hinge.rotation.y)>.1);
 }finally{world.dispose();}
});
test('language changes redraw signs without replacing geometry, dimming lights or resetting doors',()=>{
 const {game,world,camera}=fixture(),drawn=[],fillText=context.fillText;context.fillText=s=>drawn.push(s);
 try{world.update(.1,camera,2,game,true);const children=[...world.root.children],state=JSON.stringify(game.state),lights=world.lights.map(l=>l.intensity),angles=world.doors.map(d=>d.pivot.rotation.y);
 setLanguage('zh');world.localize();assert(drawn.includes('旧客厅'));drawn.length=0;setLanguage('en');world.localize();assert(drawn.includes('OLD LIVING ROOM'));assert.deepEqual(world.root.children,children);assert.equal(JSON.stringify(game.state),state);assert.deepEqual(world.lights.map(l=>l.intensity),lights);assert.deepEqual(world.doors.map(d=>d.pivot.rotation.y),angles);
 }finally{context.fillText=fillText;setLanguage('en');world.dispose();}
});
test('stair core perimeter has floors and ceilings outside the actual stair opening',()=>{
 for(const floor of [4,5]){const {game,scene,world}=fixture(floor);try{scene.updateMatrixWorld(true);for(const core of ['A','B'])for(const [x,z]of [[.53,4.07],[4.83,7.07],[5.07,3.04],[3.07,.63]]){const p=worldStair(x,z,core),origin=new T.Vector3(p.x,game.floor.base+1.6,p.z);for(const dir of [-1,1]){const hits=new T.Raycaster(origin,new T.Vector3(0,dir,0),0,1.8).intersectObject(world.root,true);assert(hits.length,`floor ${floor} core ${core} missing ${dir<0?'floor':'ceiling'} at ${x},${z}`);assert.equal(hits.filter(h=>Math.abs(h.distance-hits[0].distance)<1e-5).length,1,'no coplanar flashing surfaces');}}}finally{world.dispose();}}
});
test('door hinges stay attached and visual leaves match collision bounds throughout their swing',()=>{
 const {game,scene,world,camera}=fixture();scene.updateMatrixWorld(true);const anchors=world.doors.map(d=>d.mesh.localToWorld(new T.Vector3(-.95,0,0)));
 try{for(let amount=0;amount<=1;amount+=.1){world.doors.forEach(d=>d.data.amount=amount);world.update(.1,camera,1,game,true);scene.updateMatrixWorld(true);world.doors.forEach((d,i)=>{assert(d.mesh.localToWorld(new T.Vector3(-.95,0,0)).distanceTo(anchors[i])<1e-6);d.mesh.geometry.computeBoundingBox();const box=d.mesh.geometry.boundingBox.clone().applyMatrix4(d.mesh.matrixWorld),b=doorBlock(d.data);assert(Math.abs(box.min.x-b.minX)<1e-6);assert(Math.abs(box.max.z-b.maxZ)<1e-6);});}}finally{world.dispose();}
});
test('stair fire doors swing into the core and leave the corridor clear',()=>{
 const {game,scene,world,camera}=fixture();try{world.doors.forEach(d=>d.data.amount=1);world.update(.1,camera,1,game,true);scene.updateMatrixWorld(true);for(const d of world.doors.filter(d=>/-(A|B)$/.test(d.id)))assert(d.mesh.getWorldPosition(new T.Vector3()).x<d.x-.9);}finally{world.dispose();}
});
test('the exterior door opens outward and leaves the exit approach clear',()=>{
 const {game,scene,world,camera}=fixture(1);try{const d=world.doors.find(d=>d.kind==='exit');d.data.amount=1;world.update(.1,camera,1,game,true);scene.updateMatrixWorld(true);assert(d.mesh.getWorldPosition(new T.Vector3()).z>d.z+.9);assert(doorBlock(d.data).minZ>=d.z-.06);}finally{world.dispose();}
});
test('wall upper and lower surfaces never overlap on either side of the main corridor',()=>{
 const {game,scene,world}=fixture();try{scene.updateMatrixWorld(true);const surfaces=world.root.children.filter(o=>o.isMesh&&[world.materials.wall,world.materials.lower].includes(o.material));for(const side of [-1,1])for(const height of [.5,1.45,1.7,2.3]){const ray=new T.Raycaster(new T.Vector3(18.12,game.floor.base+height,4),new T.Vector3(0,0,side),0,2.2);assert.equal(ray.intersectObjects(surfaces,false).length,1);}}finally{world.dispose();}
});
test('five local lights, 10–15% faulty fixtures, and reduced flashes preserve readable dimming',()=>{
 for(let f=1;f<=5;f++){const {world}=fixture(f);try{assert.equal(world.lights.length,5);const faulty=world.fixtures.filter(l=>l.faulty);assert(faulty.length/world.fixtures.length>=.1&&faulty.length/world.fixtures.length<=.15);const lamp=faulty[0];let maxDelta=0,last=lampPower(lamp,0,true);for(let t=.02;t<25;t+=.02){const p=lampPower(lamp,t,true);maxDelta=Math.max(maxDelta,Math.abs(p-last));last=p;}assert(maxDelta<.07);}finally{world.dispose();}}
});

test('patrol dimming travels between fixtures and reduced flicker keeps the same warning',()=>{
 const {game,world,camera}=fixture(2);try{game.player={floor:2,x:32,z:16,y:3.24};assert(game.beginPatrol());for(const lamp of world.fixtures)lamp.faulty=false;
 world.update(.02,camera,0,game,false);const first=world.fixtures.map(l=>l.power);game.threat.age=game.threat.warning*.5;world.update(.02,camera,0,game,false);const second=world.fixtures.map(l=>l.power);assert(first.some((p,i)=>Math.abs(p-second[i])>.15));world.update(.02,camera,0,game,true);assert.deepEqual(world.fixtures.map(l=>l.power),second);assert.equal(world.lights.length,5);
 }finally{world.dispose();}
});

test('warden alarm turns hallway tubes and real light red, then restores their normal color',()=>{
 const {game,world,camera}=fixture(2);try{game.player={floor:2,x:32,z:16,y:3.24};camera.position.set(32,4.89,16);world.update(.1,camera,2,game,true);const normal=world.lights.map(l=>l.color.clone());assert(game.beginPatrol());game.threat.age=1;world.update(.1,camera,2,game,true);const tube=world.fixtures.find(l=>l.x===32&&l.z===16).tube.material.color;assert(tube.r>tube.g*8);assert(world.lights[0].color.r>world.lights[0].color.g*8);game.resolveThreat();world.update(.1,camera,2,game,true);world.lights.forEach((l,i)=>assert(l.color.equals(normal[i])));
 }finally{world.dispose();}
});
test('visitor warning has a distinct cold tint before the harmless warning expires',()=>{
 const {game,world,camera}=fixture(3);try{game.player={floor:3,x:18,z:4,y:6.48};assert(game.beginEncounter('yujie',{floor:3,x:27,z:3.5}));game.threat.age=1.5;world.update(.1,camera,2,game,true);assert(world.lights[0].color.b>world.lights[0].color.r);const tube=world.fixtures[0].tube.material.color;assert(tube.b>tube.r);assert.equal(game.sanity,100);
 }finally{world.dispose();}
});

test('calm debug disables danger lighting and faulty tubes without changing encounter state',()=>{
 const {game,world,camera}=fixture(2);try{game.player={floor:2,x:32,z:16,y:3.24};assert(game.beginPatrol());game.threat.age=1;game.debugCalm=true;const threat=JSON.stringify(game.threat);world.update(.1,camera,10,game,false);assert(world.fixtures.every(l=>l.power===1&&l.alarm===0));assert.equal(JSON.stringify(game.threat),threat);game.debugCalm=false;world.update(.1,camera,10,game,false);assert(world.fixtures.some(l=>l.alarm>0));}finally{world.dispose();}
});

test('blackout switches off tubes and local lights until the second unique reset; calm debug stays readable',()=>{
 const {game,world,camera}=fixture(1);try{
  game.state.blackout=true;world.update(.1,camera,0,game,true);assert(world.fixtures.every(l=>l.power===0));assert(world.lights.every(l=>l.intensity===0));
  const switches=game.floor.interactions.filter(i=>i.type==='switch');game.interact(switches[0].id);world.update(.1,camera,0,game,true);assert(world.lights.every(l=>l.intensity===0));
  game.interact(switches[1].id);world.update(.1,camera,0,game,true);assert(world.lights.some(l=>l.intensity>0));
  game.state.blackout=true;game.debugCalm=true;world.update(.1,camera,0,game,true);assert(world.fixtures.every(l=>l.power===1));
 }finally{world.dispose();}
});

test('Liang screen gradually swells with countdown and resets when switched off',()=>{
 const {game,world,camera}=fixture(3);try{game.player={floor:3,x:26,z:7.22,y:6.48};assert(game.beginEncounter('liang'));const screen=world.interactables.find(o=>o.material.uniforms?.uPressure);game.threat.age=game.threat.warning+game.threat.duration*.5;game.updateThreat(.01,{},0);world.update(.1,camera,8,game,true);assert(screen.scale.x>1.8);assert(screen.position.z>.3);assert(screen.material.uniforms.uPressure.value>.49);game.resolveThreat();world.update(.1,camera,9,game,true);assert.equal(screen.scale.x,1);assert.equal(screen.material.uniforms.uOn.value,0);}finally{world.dispose();}
});

test('final fire door displays the inserted log only after unlocking',()=>{
 const {game,world,camera}=fixture(1);try{const d=world.doors.find(d=>d.data.logLock);assert(d.logSocket);world.update(.1,camera,0,game,false);assert(!d.logSocket.visible);game.player={floor:1,x:9.5,z:24,y:0};game.state.logKey=true;assert(game.interact(d.id));world.update(.1,camera,0,game,false);assert(d.logSocket.visible);assert.equal(d.logSocket.parent,d.mesh);}finally{world.dispose();}
});
