import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {buildHospitalBed} from '../src/apartment-bed.js';
import {createCampaignBuilding} from '../src/campaign-layout.js';

test('broken beds stay inside their physical bays, leave slats exposed, and share render batches',()=>{
 const mats=Object.fromEntries(['metal','oxide','dark','wood','cream','linen','paper','trim'].map(key=>[key,new T.MeshStandardMaterial({side:T.DoubleSide})]));
 const placements=createCampaignBuilding().floors.flatMap(f=>f.furniture.filter(p=>p.name==='hospital-bed'));
 assert(placements.length>=4);
 try{
  for(const p of placements){
   const batches=new Map(),yaw=Math.PI;
   buildHospitalBed(p,yaw,(g,m)=>{
    assert(m);
    g.computeBoundingBox();const {min,max}=g.boundingBox;
    assert(min.y>=-.0001);
    if(max.y>.015){
     assert(min.x>=p.x-.035&&max.x<=p.x+p.w+.035&&min.z>=p.z-.035&&max.z<=p.z+p.d+.035,'solid pieces lie in the collision bay');
    }
    if(!batches.has(m))batches.set(m,[]);
    batches.get(m).push(g);
   },mats);
   const linen=batches.get(mats.linen);
   const fabrics=linen.map(g=>new T.Mesh(g,mats.linen));
   const ray=new T.Raycaster();
   const sample=(localX,localZ)=>{
    ray.set(new T.Vector3(p.x+p.w/2-localX,2,p.z+p.d/2-localZ),new T.Vector3(0,-1,0));
    return ray.intersectObjects(fabrics,false).at(0)?.point.y??0;
   };
   assert(sample(0,0)>.5);assert.equal(sample(.86,0),0,'torn ticking exposes the deck');
   for(const entries of batches.values()){
    const batch=mergeGeometries(entries);assert(batch?.index);batch.dispose();
    for(const g of entries)g.dispose();
   }
  }
 }finally{for(const m of Object.values(mats))m.dispose();}
});
