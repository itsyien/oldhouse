import * as T from 'three';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';

const range=5.8;

function edgeLines(mesh){
 const line=new LineSegmentsGeometry(),borders=mesh.userData.interactionBorders;
 if(!borders){
  const contours=new T.EdgesGeometry(mesh.geometry,22);
  line.fromEdgesGeometry(contours);contours.dispose();return line;
 }
 const positions=[];
 for(const [x,y,z,w,h] of borders){
  const left=x-w/2,right=x+w/2,bottom=y-h/2,top=y+h/2;
  positions.push(left,bottom,z,right,bottom,z,right,bottom,z,right,top,z,
   right,top,z,left,top,z,left,top,z,left,bottom,z);
 }
 return line.setPositions(positions);
}

export function interactionHintAvailable(game,item){
 const s=game.state,id=item.id;
 if(item.kind){
  return !item.locked&&!item.vanished&&!item.broken&&item.kind!=='isolation-gate'&&
   !(game.floor.listenerDepot&&id===game.floor.exitGateId);
 }
 if(item.type==='portrait'&&!item.form)return !game.discoveredPortraits?.includes(id);
 if(item.form)return !s.searched?.[id]||!!s.loot?.[id];
 if(item.type==='keypad')return game.keypadAvailable;
 if(item.type==='guide-stone')return !s.stoneSpent||s.stonePlayback?.site===item;
 if(item.type==='flashlight')return !s.flashlight;
 if(item.type==='wardrobe')return !game.wardrobeCooldown;
 if(item.type==='depot-slip')return !s.depotFinds?.[id]&&!game.knownCode;
 if(item.type==='depot-alarm'||item.type==='depot-lure')return !s.depotAlarms?.[id];
 if(item.type==='chase-bell')return !s.interactions?.[id];
 if(item.type==='chase-board')return !!s.chaseStarted&&!s.chaseBoards?.[id];
 if(item.type==='maintenance-lever')return s.gunmuStage==='lure';
 if(item.type==='shaft-switch')return s.gunmuStage==='pipes'&&s.gunmuPipeIndex===item.standing&&s.gunmuSlides?.[id]===undefined;
 if(item.type==='vault'||item.type==='vent')return !s.traversals?.[item.traversalId];
 return true;
}

function surfacesFor(world){
 const largest=new Map();
 for(const mesh of world.interactables){
  if(!mesh.material.visible)continue;
  mesh.geometry.computeBoundingBox();
  const {min,max}=mesh.geometry.boundingBox;
  const x=max.x-min.x,y=max.y-min.y,z=max.z-min.z;
  const area=x*y+y*z+z*x,id=mesh.userData.target;
  if(area>(largest.get(id)?.area??0))largest.set(id,{mesh,area});
 }
 const forms=world.root.userData.interactions.map(record=>{
  const {i,photo,pocket,motion,depotCrate,depotPaper,torch,wardrobe,stoneBase}=record;
  if(wardrobe)return {item:i,sources:wardrobe.map(({hinge})=>hinge.children[0])};
  const front=motion?.children.find(o=>o.isMesh&&(o.material===world.materials.wood||o.material===world.materials.green)&&o.userData.target===i.id);
  const handle=motion?.children.find(o=>o.isMesh&&o.material===world.materials.metal&&o.userData.target===i.id);
  const lid=depotCrate?.lid.children.find(o=>o.isMesh&&o.material===world.materials.wood);
  return {item:i,sources:[stoneBase||photo||front||handle||lid||torch?.children[1]||largest.get(i.id)?.mesh].filter(Boolean),pocket,depotPaper};
 });
 return [...world.doors.filter(d=>d.handle).map(d=>({item:d.data,sources:[d.handle]})),...forms].filter(({sources})=>sources.length);
}

export function createInteractionGlints(scene){
 const root=new T.Group();root.name='interaction-glints';scene.add(root);
 const empty=new T.BufferGeometry(),emptyLine=new LineSegmentsGeometry(),edges=new Map();
 const center=new T.Vector3(),clip=new T.Vector3(),size=new T.Vector3(),keypadAnchor=new T.Vector3();
 const slots=Array.from({length:4},()=>{
  const material=new LineMaterial({color:0xffa95b,linewidth:1.85,toneMapped:false,transparent:true,depthWrite:false,opacity:0});
  material.onBeforeCompile=shader=>{
   // Keep the lines on the object's own edge without pulling them in front of scenery.
   shader.vertexShader=shader.vertexShader.replace('gl_Position = clip;',
    'gl_Position = clip;\ngl_Position.z -= 0.000014 * gl_Position.w;');
  };
  const line=new LineSegments2(emptyLine,material);
  const sheen=new T.Mesh(empty,new T.MeshBasicMaterial({
   color:0xb46531,toneMapped:false,transparent:true,depthWrite:false,opacity:0,
   polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1
  }));
  sheen.renderOrder=3;line.add(sheen);
  line.matrixAutoUpdate=false;line.visible=false;line.renderOrder=4;root.add(line);return line;
 });
 let shownWorld,forms=[];
 function hide(){
  for(const line of slots){line.visible=false;line.userData.target=null;}
 }
 function update(world,camera,game,focusedId){
  if(shownWorld!==world){
   hide();
   for(const line of slots){line.geometry=emptyLine;line.children[0].geometry=empty;}
   for(const e of edges.values())e.dispose();
   edges.clear();shownWorld=world;forms=world?surfacesFor(world):[];
  }
  if(!world||game.hiding||game.peek||game.keypadOpen||game.falseDoorAttack||game.travel||game.traversal||game.searching||game.chaseAction||game.depotCrateAction){hide();return;}
  camera.updateMatrixWorld();
  const nearby=[];
  const codeReady=game.keypadAvailable&&!!game.knownCode;
  let keypadDistance=null;
  for(const {item,sources,pocket,depotPaper} of forms){
   const distance=Math.hypot(item.x-camera.position.x,item.z-camera.position.z);
   const xray=item.type==='keypad'&&codeReady;
   if(!xray&&(distance>=range||!interactionHintAvailable(game,item)))continue;
   const fade=xray?1:1-T.MathUtils.smoothstep(distance,2.2,range);
   if(fade<.04)continue;
   const meshes=[];
   let offCenter=Infinity;
   const loot=pocket?.children.find(o=>o.isMesh&&o.visible)||depotPaper;
   const revealedLoot=!!(loot?.visible&&loot.parent.visible&&(item.type==='depot-slip'?
    !game.state.depotFinds?.[item.id]&&!game.knownCode:game.state.searched?.[item.id]&&game.state.loot?.[item.id]));
   for(const mesh of revealedLoot?[loot]:sources){
    let hidden=false;
    for(let parent=mesh;parent;parent=parent.parent)if(!parent.visible){hidden=true;break;}
    if(hidden)continue;
    mesh.updateWorldMatrix(true,false);
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
    mesh.geometry.boundingBox.getCenter(center).applyMatrix4(mesh.matrixWorld);
    clip.copy(center).project(camera);
    if(clip.z<=-1||clip.z>=1||Math.abs(clip.x)>1.12||Math.abs(clip.y)>1.12)continue;
    meshes.push(mesh);offCenter=Math.min(offCenter,Math.hypot(clip.x,clip.y));
    if(xray){
     keypadDistance=distance;
     keypadAnchor.copy(center);keypadAnchor.y+=.29;keypadAnchor.project(camera);
    }
   }
   if(!meshes.length)continue;
   const focused=item.id===focusedId,isWardrobe=item.type==='wardrobe';
   const strength=revealedLoot?(focused?1:.88):isWardrobe?(focused?.64:.44):(focused?.85:.61);
   nearby.push({meshes,id:item.id,loot:revealedLoot,xray,opacity:xray?.94:strength*fade,rank:xray?-20:revealedLoot?-12+distance*.25+offCenter*.25:focused?-1:distance+offCenter*1.4});
  }
  nearby.sort((a,b)=>a.rank-b.rank);
  hide();
  let slot=0;
  for(const {meshes,id,loot,xray,opacity} of nearby){
   if(slot+meshes.length>slots.length)continue;
   for(const mesh of meshes){
    const line=slots[slot++],source=mesh.geometry;
    if(!edges.has(source))edges.set(source,edgeLines(mesh));
    line.geometry=edges.get(source);line.matrix.copy(mesh.matrixWorld);line.matrixWorldNeedsUpdate=true;
    line.material.opacity=opacity;line.material.linewidth=xray||loot?2.3:1.85;
    line.material.depthTest=!xray;line.material.color.setHex(xray?0xf5d595:0xffa95b);
    line.userData.target=id;line.userData.loot=loot;line.visible=true;
    const sheen=line.children[0];
    source.boundingBox.getSize(size);
    const border=!!mesh.userData.interactionBorders;
    sheen.visible=border||Math.max(size.x,size.y,size.z)<1.6&&Math.min(size.x,size.y,size.z)>.002;
    sheen.geometry=source;sheen.material.depthTest=!xray;sheen.material.opacity=opacity*(xray?.12:border?.14:.43);
   }
  }
  if(keypadDistance!==null)return {anchor:keypadAnchor,metres:Math.round(keypadDistance)};
 }
 return {update,hide};
}
