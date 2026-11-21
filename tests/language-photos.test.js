import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {tr,setLanguage,getLanguage} from '../src/i18n.js';
import {prepareBuilding,floorPassable,doorBlock} from '../src/building.js';
import {Navigator} from '../src/navigation.js';
import {Game,RULES} from '../src/simulation.js';
import {photoTrail,createPhotoTrail} from '../src/photo-trail.js';
const building=prepareBuilding(JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/floors.json',import.meta.url))));
const nav=new Navigator(building),hasChinese=s=>/[\u3400-\u9fff]/.test(s);
test('English is the default and all floor labels, interactions and survival rules are translated',()=>{
 assert.equal(getLanguage(),'en');
 for(const f of building.floors)for(const s of [f.title,f.tag,...f.zones.map(z=>z.label),...f.interactions.map(i=>i.label),...f.doorSpecs.map(d=>d.title)])assert(!hasChinese(tr(s)),s);
 for(const r of Object.values(RULES))for(const s of Object.values(r))assert(!hasChinese(tr(s)),s);
 for(const file of ['simulation.js','patrol.js'])for(const [,s]of fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8').matchAll(/'([^'\n]*)'/g))if(hasChinese(s))assert(!hasChinese(tr(s)),`untranslated encounter feedback: ${s}`);
 assert.equal(tr('继续点 · 3 楼'),'CHECKPOINT · FLOOR 3');assert.equal(tr('静止检查 2 / 2 · 可以转头'),'Stand still: check 2 / 2. You may look around.');
 setLanguage('zh');assert.equal(tr('继续点 · 3 楼'),'继续点 · 3 楼');setLanguage('invalid');assert.equal(getLanguage(),'en');
});
test('seeded discarded photos form a repeatable floor route clear of furniture and every door swing',()=>{
 for(const f of building.floors){const photos=photoTrail(f,nav,123);assert.deepEqual(photos,photoTrail(f,nav,123));assert.notDeepEqual(photos,photoTrail(f,nav,456));assert(photos.length>=35&&photos.length<=90);assert(Math.max(...photos.map(p=>p.yaw))-Math.min(...photos.map(p=>p.yaw))>4.5);
 const blocks=f.doorSpecs.flatMap(d=>[0,.25,.5,.75,1].map(amount=>doorBlock({...d,amount})));
 for(const p of photos){assert(floorPassable(f,p,.37,blocks),`${f.id} / ${p.x},${p.z}`);assert(p.y>.008&&p.y<.025);assert(p.width>=.18*1.15&&p.width<=.26*1.15);for(const q of photos)if(q!==p)assert(Math.hypot(p.x-q.x,p.z-q.z)>(Math.hypot(p.width,p.height)+Math.hypot(q.width,q.height))/2,'flat photos must not overlap and flicker');}
 assert(Math.hypot(photos[0].x-f.spawn.x,photos[0].z-f.spawn.z)<6);
 assert(Math.hypot(photos.at(-1).x-f.destination.x,photos.at(-1).z-f.destination.z)<5);
 for(let i=1;i<photos.length;i++)assert(photos[i].distance-photos[i-1].distance<8,'trail cannot leave long unexplained gaps');
 }
});
test('paper keeps depth occlusion, upward faces and one instanced draw; checkpoints preserve the trail',()=>{
 const g=new Game(building,123),saved=structuredClone(g.state.photoTrail);g.retry();assert.deepEqual(g.state.photoTrail,saved);
 const mesh=createPhotoTrail(new T.Texture({width:517,height:483}),saved);assert(mesh.isInstancedMesh);assert.equal(mesh.material.depthTest,true);assert.equal(mesh.material.depthWrite,true);assert.equal(mesh.material.polygonOffset,true);assert(mesh.geometry.attributes.normal.getY(0)>.99);mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();
});
test('Tianhuang is floor-only and every inspector catch uses Kongbu',()=>{
 const m=JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/runtime-manifest.json',import.meta.url)));
 assert(m.textures.floorPhoto.url.endsWith('/sunTianHuang.png'));
 assert(m.textures[m.scares.inspector.asset].url.endsWith('/SunKongBu.png'));
 for(const s of Object.values(m.scares))assert.notEqual(s.asset,'floorPhoto');
 assert.equal(Object.values(m.textures).filter(t=>t.url.endsWith('/sunTianHuang.png')).length,1);
});
test('all four discarded photo types remain available; only Hirohito is explicitly reused by Returner',()=>{
 const m=JSON.parse(fs.readFileSync(new URL('../public/assets/apartment/runtime-manifest.json',import.meta.url)));assert.deepEqual(m.floorPhotos,['floorPhoto','floorCixi','floorHirohito','floorThunder']);
 for(const key of m.floorPhotos){assert(fs.existsSync(new URL('../public'+m.textures[key].url,import.meta.url)));for(const s of Object.values(m.scares))assert.notEqual(s.asset,key);}
 assert.equal(m.billboards.rush.asset,'floorHirohito');
 for(const f of building.floors)for(const seed of [1,123,456])assert.equal(new Set(photoTrail(f,nav,seed).map(p=>p.variant)).size,4);
});
test('photo shader uses a per-image aspect uniform and grayscale printing without stretching portrait sources',()=>{
 for(const [width,height]of [[1350,2160],[864,1269],[371,539],[517,483]]){const mesh=createPhotoTrail(new T.Texture({width,height}),[]),shader={uniforms:{},fragmentShader:'#include <map_fragment>'};mesh.material.onBeforeCompile(shader);assert.equal(shader.uniforms.uPhotoAspect.value,width/height*1.18);assert(shader.fragmentShader.includes('float grey=dot(photo.rgb'));assert(shader.fragmentShader.includes('min(1.,1./uPhotoAspect)'));assert(shader.fragmentShader.includes('vec2(.93)'));assert(shader.fragmentShader.includes('(pow(grey,1./2.2)-.5)*1.25'));mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();}
});
test('guidance and the final inspection have complete English copy',()=>{
 for(const s of ['通行提示','跟随地上散落的旧照片，找到楼梯，继续下楼。','跟随旧照片到外门。按 E 开门，再走到室外。','E 操作 · Shift 快走 · Esc 暂停','沿地上的旧照片找路，目标是一楼外门。遇到异常时，先看屏幕上方的应对提示。','出口前还有一次查房。停住脚步，可以转头。','查房结束。打开外门，走出去。'])assert(!hasChinese(tr(s)),s);
});
