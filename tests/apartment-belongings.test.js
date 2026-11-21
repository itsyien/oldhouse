import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {buildBelongings} from '../src/apartment-belongings.js';
import {BELONGINGS_SIZE} from '../src/apartment-placements.js';

test('abandoned belongings fit their reserved footprints and merge into the existing material batches',()=>{
 const m=Object.fromEntries('cardboard linen oxide cream green paper metal dark red trim wood'.split(' ').map(key=>[key,new T.MeshStandardMaterial({vertexColors:key==='linen'})]));
 const origin=new T.Vector3(20,0,-9),axis=new T.Vector3(0,1,0);
 for(const [kind,size] of Object.entries(BELONGINGS_SIZE)){
  if(!['evacuation','laundry','records','supper'].includes(kind))continue;
  for(const [yaw,variant] of [[0,0],[1.18,1]]){
   const batches=new Map(),bounds=new T.Box3();
   function queue(g,material){
    assert(material);
    const position=g.attributes.position,point=new T.Vector3();
    for(let i=0;i<position.count;i++)bounds.expandByPoint(point.fromBufferAttribute(position,i).sub(origin).applyAxisAngle(axis,-yaw));
    if(!batches.has(material))batches.set(material,[]);
    batches.get(material).push(g);
   }
   const box=(x,y,z,w,h,d,material,angle)=>queue(new T.BoxGeometry(w,h,d).rotateY(angle).translate(x,y,z),material);
   buildBelongings(kind,{box,queue,m},{x:origin.x,z:origin.z,yaw,variant});
   assert(Math.abs(bounds.min.y)<.009,`${kind} must sit on the floor`);
   assert(bounds.max.y<=size.height+.003&&bounds.min.x>=-size.w/2-.003&&bounds.max.x<=size.w/2+.003&&bounds.min.z>=-size.d/2-.003&&bounds.max.z<=size.d/2+.003,`${kind} must fit its layout reservation`);
   let triangles=0;
   for(const parts of batches.values()){
    const merged=mergeGeometries(parts);assert(merged,`${kind} did not batch`);
    triangles+=merged.index.count/3;merged.dispose();for(const g of parts)g.dispose();
   }
   assert(triangles>0&&triangles<2200);
  }
 }
 for(const material of Object.values(m))material.dispose();
});
