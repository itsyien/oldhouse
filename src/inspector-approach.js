import { floorPassable } from './building.js';

const STOP_DISTANCE=1.5, SPEED=1.12;
const offsets=[1.25,-1.25,.85,-.85,.45,-.45,0];

function routeToPlayer(game,t,player,blocks){
 const dx=player.x-t.x,dz=player.z-t.z,distance=Math.hypot(dx,dz);
 if(distance<=STOP_DISTANCE)return [];
 const vx=dx/distance,vz=dz/distance;
 for(const reach of [1,.8,.6,.4,.2]){
  const length=(distance-STOP_DISTANCE)*reach,count=Math.max(8,Math.ceil(length/.1));
  for(const width of offsets){
   const path=[];
   for(let i=1;i<=count;i++){
    const u=i/count,sway=Math.sin(u*2*Math.PI)*width*reach;
    const p={x:t.x+vx*length*u-vz*sway,z:t.z+vz*length*u+vx*sway};
    if(!floorPassable(game.floor,p,.32,blocks))break;
    path.push(p);
   }
   if(path.length===count)return path;
  }
 }
 return [];
}

export function approachInspector(game,t,dt,moved){
 if(moved>0){t.inspectionPath=null;return;}
 if(t.floor!==game.player.floor||t.phase!=='checking'||game.hiding||game.travel)return;
 const player=game.player,blocks=game.floorBlocks();
 if(!t.inspectionPath)t.inspectionPath=routeToPlayer(game,t,player,blocks);
 let remaining=SPEED*dt;
 while(remaining>1e-6&&t.inspectionPath.length){
  const next=t.inspectionPath[0];
  const dx=next.x-t.x,dz=next.z-t.z,distance=Math.hypot(dx,dz);
  if(distance<1e-6){t.inspectionPath.shift();continue;}
  const step=Math.min(distance,remaining);
  const point={x:t.x+dx*step/distance,z:t.z+dz*step/distance};
  if(Math.hypot(point.x-player.x,point.z-player.z)<STOP_DISTANCE-1e-5)return;
  if(!floorPassable(game.floor,point,.32,blocks)){t.inspectionPath=[];return;}
  t.x=point.x;t.z=point.z;remaining-=step;
  if(step===distance)t.inspectionPath.shift();
 }
}
