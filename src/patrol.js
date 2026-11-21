import {within} from './building.js';
export function sealedShelter(game){
 if(game.travel)return false;
 if(game.hiding)return !!game.floor.interactions.find(i=>i.id===game.hiding.id&&i.type==='wardrobe'&&i.wardPortrait);
 return game.floor.shelters?.find(r=>within(game.player,r)&&r.doors.every(id=>{const d=game.state.doors.find(d=>d.id===id);return d?.wardPortrait&&!d.open&&!d.broken&&d.amount<.05;}));
}
export function planPatrol(game){
 const f=game.floor;
 // Closed refuge doors can be opened on the way in; broken doors cannot seal a room.
 const candidates=(f.shelters||[]).filter(r=>r.doors.every(id=>{const d=game.state.doors.find(d=>d.id===id);return d?.wardPortrait&&!d.broken;})).map(r=>{
  const refuge={floor:f.id,x:r.x+r.w/2,z:r.z+r.d/2},path=game.nav.path(game.player,refuge,game.doors.filter(d=>!r.doors.includes(d.id)));
  return{refuge,refugeDistance:path.distance??Infinity,sameFloor:path.every(p=>p.floor===f.id),doors:r.doors};
 }).filter(r=>r.sameFloor&&r.refugeDistance/3.65+r.doors.length*.7+1.2<=7).sort((a,b)=>a.refugeDistance-b.refugeDistance);
 if(!candidates.length)for(const w of f.interactions.filter(i=>i.type==='wardrobe'&&i.wardPortrait)){
  const refuge={floor:f.id,...w.entry},path=game.nav.path(game.player,refuge,game.doors);
  if(path.length&&path.every(p=>p.floor===f.id)&&path.distance/3.65+1.2<=7)candidates.push({refuge,refugeDistance:path.distance,doors:[],wardrobe:w.id});
 }
 if(!candidates.length)return null;
 return{floor:f.id,route:f.mainRoute.map(([x,z])=>({floor:f.id,x,z})),...candidates[0],warning:7};
}
export function updatePatrol(game,t,dt){
 if(t.phase==='warning'){
  game.state.blackout=true;game.state.restoredSwitches=[];t.phase='sweeping';
  game.emit('灯灭了。留在蒋介石画像标记的门内或衣柜里。',3);
 }
 if(t.phase==='leaving'){t.retreat+=dt;if(t.retreat>=1.3)game.resolveThreat();return;}
 t.sealed=!!sealedShelter(game);t.visible=!t.sealed;t.exposure=t.sealed?0:1;
 // The sweep covers the entire floor instantly; distance and line of sight offer no protection.
 if(!t.sealed)game.fail('patrol');
 if(t.age>=t.warning+3){t.phase='leaving';t.retreat=0;}
}
