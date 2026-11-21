import * as T from 'three';
import {tr} from './i18n.js';
export function createBroadcast(scene,texture){
 const root=new T.Group();scene.add(root);
 const body=new T.MeshStandardMaterial({color:0x292e2a,roughness:.8}),button=new T.MeshStandardMaterial({color:0xb2ac8c}),red=new T.MeshStandardMaterial({color:0x873d2b});
 const outline=new T.LineBasicMaterial({color:0xf3dca5,depthTest:false,transparent:true,opacity:.85});
 const remotes=Array.from({length:2},()=>{
  const group=new T.Group();root.add(group);
  const box=(w,h,d,m,x=0,y=0,z=0)=>{const a=new T.Mesh(new T.BoxGeometry(w,h,d),m);a.position.set(x,y,z);group.add(a);};
  box(.16,.045,.34,body);box(.045,.015,.045,red,0,.027,-.1);
  for(const x of [-.04,.04])for(const z of [-.02,.045,.11])box(.032,.012,.035,button,x,.027,z);
  const edge=new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(.21,.07,.39)),outline);edge.renderOrder=15;group.add(edge);return group;
 });
 const particles=new T.InstancedMesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:texture,transparent:true,opacity:.5,depthWrite:false,side:T.DoubleSide,color:0xc8c8bd}),12);particles.frustumCulled=false;root.add(particles);
 const labels=Array.from({length:3},()=>{const el=document.createElement('div');el.className='remote-marker';el.hidden=true;document.body.append(el);return el;});
 const v=new T.Vector3(),dummy=new T.Object3D();
 function mark(el,p,text,camera){
  v.set(p.x,(p.floor-1)*3.24+(p.y??.55),p.z).project(camera);const behind=v.z>1;
  if(behind){v.x=-Math.sign(v.x||1)*2;v.y=0;}
  el.style.left=`${T.MathUtils.clamp((v.x+1)*50,12,88)}%`;el.style.top=`${T.MathUtils.clamp((1-v.y)*50,19,80)}%`;
  el.classList.toggle('offscreen',behind||Math.abs(v.x)>1||Math.abs(v.y)>1);el.textContent=text;el.hidden=false;
 }
 function update(game,camera,time,mode){
  labels.forEach(el=>el.hidden=true);const t=game.threat;root.visible=t?.kind==='liang'&&mode==='playing';if(!root.visible)return;
  const tv=game.building.byId[t.floor].interactions.find(i=>i.id===t.tvId),base=(t.floor-1)*3.24,growth=t.pressure;
  remotes.forEach((mesh,i)=>{const r=t.remotes[i];mesh.visible=!r.collected;mesh.position.set(r.x,base+.04,r.z);mesh.rotation.y=i*.7;
   if(!r.collected)mark(labels[i],r,tr(`遥控器 ${i+1}`)+` · ${Math.round(Math.hypot(r.x-game.player.x,r.z-game.player.z))} m`,camera);
  });
  if(t.remotes.every(r=>r.collected))mark(labels[2],{floor:t.floor,...tv.target},tr('回到电视 · E 关闭'),camera);
  particles.visible=t.age>=t.warning;particles.material.opacity=.2+growth*.25;
  for(let i=0;i<12;i++){
   const life=(time*.32+i/12)%1,angle=i*2.399,side=Math.sin(angle)*life*(1.1+growth),forward=.3+life*(.9+growth*.65),size=Math.sin(life*Math.PI)*(.35+growth*.65);
   dummy.position.set(t.x+Math.sin(tv.yaw)*forward+Math.cos(tv.yaw)*side,base+1.15+Math.sin(life*Math.PI)*(.5+(i%3)*.3),t.z+Math.cos(tv.yaw)*forward-Math.sin(tv.yaw)*side);
   const nearFade=T.MathUtils.smoothstep(dummy.position.distanceTo(camera.position),.8,1.6);
   dummy.quaternion.copy(camera.quaternion);dummy.rotateZ(Math.sin(angle+life)*.3);dummy.scale.set(size*nearFade*texture.image.width/texture.image.height,size*nearFade,1);dummy.updateMatrix();particles.setMatrixAt(i,dummy.matrix);
  }
  particles.instanceMatrix.needsUpdate=true;
 }
 return{root,remotes,particles,labels,update,dispose(){scene.remove(root);labels.forEach(el=>el.remove());root.traverse(o=>o.geometry?.dispose());for(const m of [body,button,red,outline,particles.material])m.dispose();particles.dispose();}};
}
