import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createInteractionGlints,interactionHintAvailable} from '../src/interaction-glints.js';

test('hints fade with distance, follow moving geometry and stop showing spent searches',()=>{
 const scene=new T.Scene(),root=new T.Group(),camera=new T.PerspectiveCamera(72,1,.055,140);
 scene.add(root);
 const item={id:'drawer',type:'search',form:'drawer',x:0,z:-2};
 const mesh=new T.Mesh(new T.BoxGeometry(1.1,.25,.08),new T.MeshStandardMaterial());
 mesh.userData.target=item.id;mesh.position.z=-2;root.add(mesh);
 root.userData.interactions=[{i:item}];
 const world={root,interactables:[mesh],doors:[],materials:{}};
 const game={state:{searched:{},loot:{}},floor:{}};
 const glints=createInteractionGlints(scene),line=scene.getObjectByName('interaction-glints').children[0];
 glints.update(world,camera,game);
 assert(line.visible&&line.material.depthTest&&!line.material.depthWrite);
 const ambient=line.material.opacity;
 mesh.position.x=.24;
 glints.update(world,camera,game,item.id);
 assert(line.material.opacity>ambient);
 assert.equal(line.matrix.elements[12],mesh.position.x);
 camera.position.z=2.2;
 glints.update(world,camera,game);
 assert(line.visible&&line.material.opacity<ambient);
 game.state.searched[item.id]=true;
 glints.update(world,camera,game);
 assert.equal(line.visible,false);
});

test('used devices, coded doors and already discovered photos are not marked',()=>{
 const game={floor:{},state:{depotAlarms:{clock:{ringAt:4}}},discoveredPortraits:['photo']};
 assert(!interactionHintAvailable(game,{id:'clock',type:'depot-alarm'}));
 assert(!interactionHintAvailable(game,{id:'exit',kind:'fire',locked:true}));
 assert(!interactionHintAvailable(game,{id:'photo',type:'portrait'}));
 assert(interactionHintAvailable(game,{id:'false-door',kind:'wood',falseDoor:true}));
});

test('both wardrobe leaves earn warm outlines with ordinary depth testing',()=>{
 const scene=new T.Scene(),root=new T.Group(),camera=new T.PerspectiveCamera(72,1,.055,140);
 scene.add(root);
 const i={id:'wardrobe',type:'wardrobe',x:0,z:-2};
 const wardrobe=[-.62,.62].map(x=>{
  const hinge=new T.Group(),leaf=new T.Mesh(new T.BoxGeometry(.58,1.6,.07),new T.MeshStandardMaterial());
  leaf.userData.interactionBorders=[[0,0,.035,.58,1.6],[.2,-.1,.08,.03,.11]];
  hinge.position.set(x,0,-2);hinge.add(leaf);root.add(hinge);return{hinge};
 });
 root.userData.interactions=[{i,wardrobe}];
 const world={root,interactables:wardrobe.map(d=>d.hinge.children[0]),doors:[],materials:{}};
 const game={state:{},floor:{}};
 createInteractionGlints(scene).update(world,camera,game,i.id);
 const lines=scene.getObjectByName('interaction-glints').children.filter(l=>l.visible);
 assert.equal(lines.length,2);
 assert.deepEqual(lines.map(l=>l.matrix.elements[12]),[-.62,.62]);
 assert(lines.every(l=>l.geometry.instanceCount===8),'Only the outside and handle are outlined');
 assert(lines.every(l=>l.material.depthTest&&!l.material.depthWrite&&l.material.color.r>l.material.color.g&&l.material.color.g>l.material.color.b));
});

test('revealed uncollected loot takes priority over nearer furniture and stops immediately on pickup',()=>{
 const scene=new T.Scene(),root=new T.Group(),camera=new T.PerspectiveCamera(72,1,.055,140);scene.add(root);
 const interactions=[],interactables=[],searched={},loot={};
 for(let i=0;i<6;i++){
  const item={id:'drawer-'+i,type:'search',form:'drawer',x:(i-2)*.16,z:i===5?-4:-2};
  const face=new T.Mesh(new T.BoxGeometry(.24,.30,.07),new T.MeshStandardMaterial());face.position.set(item.x,0,item.z);face.userData.target=item.id;root.add(face);interactables.push(face);
  const pocket=new T.Group(),paper=new T.Mesh(new T.BoxGeometry(.18,.016,.12),new T.MeshStandardMaterial());pocket.position.set(item.x,0,item.z+.08);pocket.add(paper);root.add(pocket);pocket.visible=i===5;
  if(i===5){searched[item.id]=true;loot[item.id]='whole';}
  interactions.push({i:item,pocket});
 }
 root.userData.interactions=interactions;
 const world={root,interactables,doors:[],materials:{}},game={state:{searched,loot},floor:{}};
 const glints=createInteractionGlints(scene);glints.update(world,camera,game,'drawer-0');
 const shown=()=>scene.getObjectByName('interaction-glints').children.filter(o=>o.visible);
 assert.equal(shown()[0].userData.target,'drawer-5');assert(shown()[0].userData.loot);
 assert(shown()[0].material.depthTest&&shown()[0].children[0].material.depthTest);
 const paper=interactions[5].pocket.children[0];assert.equal(shown()[0].children[0].geometry,paper.geometry);
 const can=new T.Mesh(new T.CylinderGeometry(.065,.065,.23,12),paper.material);
 paper.visible=false;interactions[5].pocket.add(can);game.state.loot['drawer-5']='energy';
 glints.update(world,camera,game);assert.equal(shown()[0].children[0].geometry,can.geometry);
 interactions[5].pocket.visible=false;glints.update(world,camera,game);assert(!shown().some(o=>o.userData.loot));
 interactions[5].pocket.visible=true;game.state.loot['drawer-5']=null;glints.update(world,camera,game);assert(!shown().some(o=>o.userData.target==='drawer-5'));
});

test('an opened depot crate highlights its exposed code paper, not its old lid',()=>{
 const scene=new T.Scene(),root=new T.Group(),camera=new T.PerspectiveCamera(72,1,.055,140);scene.add(root);
 const i={id:'crate',type:'depot-slip',x:0,z:-2},lid=new T.Group(),material=new T.MeshStandardMaterial();
 const face=new T.Mesh(new T.BoxGeometry(.7,.3,.05),material);face.userData.target=i.id;lid.add(face);lid.position.z=-2;root.add(lid);
 const paper=new T.Mesh(new T.PlaneGeometry(.25,.30),new T.MeshStandardMaterial());paper.position.set(0,0,-1.9);paper.userData.target=i.id;paper.visible=false;root.add(paper);
 root.userData.interactions=[{i,depotCrate:{lid},depotPaper:paper}];
 const world={root,interactables:[face,paper],doors:[],materials:{wood:material}},game={state:{depotFinds:{}},floor:{}};
 const glints=createInteractionGlints(scene);glints.update(world,camera,game);
 const line=scene.getObjectByName('interaction-glints').children[0];assert(!line.userData.loot);
 paper.visible=true;glints.update(world,camera,game);assert(line.userData.loot);assert.equal(line.children[0].geometry,paper.geometry);
 game.state.depotFinds.crate={digit:'2'};glints.update(world,camera,game);assert(!line.visible);
});

test('a complete code reveals only its floor keypad through walls until the gate is released',()=>{
 const scene=new T.Scene(),root=new T.Group(),camera=new T.PerspectiveCamera(72,1,.055,140);
 scene.add(root);
 const i={id:'keypad',type:'keypad',x:0,z:-24};
 const panel=new T.Mesh(new T.BoxGeometry(.28,.42,.06),new T.MeshStandardMaterial());
 panel.position.z=i.z;panel.userData.target=i.id;root.add(panel);
 const world={root,interactables:[panel],doors:[],materials:{}},game={state:{},floor:{},keypadAvailable:true,knownCode:null};
 root.userData.interactions=[{i}];
 const glints=createInteractionGlints(scene),line=scene.getObjectByName('interaction-glints').children[0];
 assert.equal(glints.update(world,camera,game),undefined);
 assert(!line.visible);
 game.knownCode='03185';
 const marker=glints.update(world,camera,game);
 assert.equal(marker.metres,24);
 assert.equal(marker.anchor.x,0);
 assert(line.visible&&!line.material.depthTest&&!line.children[0].material.depthTest);
 game.keypadOpen=true;
 assert.equal(glints.update(world,camera,game),undefined);
 assert(!line.visible);
 game.keypadOpen=false;game.keypadAvailable=false;
 assert.equal(glints.update(world,camera,game),undefined);
 assert(!line.visible);
 game.knownCode=null;game.keypadAvailable=true;camera.position.z=-21;
 assert.equal(glints.update(world,camera,game),undefined);
 assert(line.visible&&line.material.depthTest&&line.children[0].material.depthTest);
});
