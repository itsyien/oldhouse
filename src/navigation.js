import {floorPassable} from './building.js';
import {blocked,clearSight} from './logic.js';
const travelSamples=(a,b,passable)=>{
 const dx=b.x-a.x,dz=b.z-a.z,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.085));
 for(let i=1;i<=steps;i++)if(!passable(a.x+dx*i/steps,a.z+dz*i/steps))return false;
 return true;
};
export function crossesDoor(a,b,door,margin=.26){
 if(a.floor!==door.floor||b.floor!==door.floor)return false;
 const axis=door.axis,cross=axis==='x'?'z':'x',plane=door[axis];
 if((a[axis]<plane)===(b[axis]<plane))return false;
 const crossing=a[cross]+(b[cross]-a[cross])*(plane-a[axis])/(b[axis]-a[axis]);
 return Math.abs(crossing-door[cross])<=(door.width??1.9)/2+margin;
}
export const clearActorTravel=(floor,a,b,blocks,radius=.26,options={})=>
 travelSamples(a,b,(x,z)=>floorPassable(floor,{x,z},radius,blocks,options));
class Heap{
 constructor(){this.a=[];}push(v){let i=this.a.length;this.a.push(v);while(i){const p=(i-1)>>1;if(this.a[p][0]<=v[0])break;this.a[i]=this.a[p];i=p;}this.a[i]=v;}
 pop(){const r=this.a[0],v=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let c=i*2+1;if(c+1<this.a.length&&this.a[c+1][0]<this.a[c][0])c++;if(this.a[c][0]>=v[0])break;this.a[i]=this.a[c];i=c;}this.a[i]=v;}return r;}
}
export class Navigator{
 constructor(building){
  this.building=building;this.nodes=[];this.byFloor={};this.cells=new Map();this.cache=new Map();
  for(const f of building.floors){
   // The finer grid and offset put nodes in both narrow gaps beside the repair bay stack.
   const step=f.gunmuFinale ? .25 : .5,offset=f.gunmuFinale ? .1875 : step;
   const radius=f.gunmuFinale ? .26 : .27;
   const nodes=this.byFloor[f.id]=[];
   for(let z=f.bounds.minZ+offset;z<f.bounds.maxZ;z+=step)for(let x=f.bounds.minX+offset;x<f.bounds.maxX;x+=step)if(floorPassable(f,{x,z},radius)){
    const n={x,z,floor:f.id,id:this.nodes.length,edges:[]};
    if(f.listenerDepot)n.listenerTight=blocked(x,z,f.obstacles,.64);
    this.nodes.push(n);nodes.push(n);this.cells.set(`${f.id},${x},${z}`,n);
   }
   const offsets=[[step,0],[-step,0],[0,step],[0,-step],[step,step],[step,-step],[-step,step],[-step,-step]];
   for(const n of nodes)for(const [dx,dz] of offsets){
    const b=this.cells.get(`${n.floor},${n.x+dx},${n.z+dz}`);if(!b)continue;
    // A diagonal across two joined corridors can clip the inside corner between grid samples.
    if((f.scenes||f.mode==='chase'||f.gunmuFinale)&&dx&&dz&&(!this.cells.has(`${n.floor},${n.x+dx},${n.z}`)||!this.cells.has(`${n.floor},${n.x},${n.z+dz}`)))continue;
    if(floorPassable(f,{x:n.x+dx/2,z:n.z+dz/2},radius))n.edges.push({to:b.id,cost:Math.hypot(dx,dz)});
   }
  }
  for(const link of building.links){const core=link.from[1],z=core==='A'?8:24,a=this.closest({floor:link.from[0],x:8.8,z}),b=this.closest({floor:link.to[0],x:8.8,z});
   a.edges.push({to:b.id,cost:13,core});b.edges.push({to:a.id,cost:13,core});}
  for(const f of building.floors)for(const t of f.traversals||[]){
   const a=this.closest({floor:f.id,...t.a}),b=this.closest({floor:f.id,...t.b});if(!a||!b)continue;
   const points=[a,...(t.via||[]),b],cost=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.z-points[i].z),0);
   a.edges.push({to:b.id,cost,traversal:t});b.edges.push({to:a.id,cost,traversal:t,reverse:true});
  }
 }
 closest(p,blocks=[],connect){let best=null,d=Infinity;for(const n of this.byFloor[p.floor]||[]){const v=(n.x-p.x)**2+(n.z-p.z)**2;if(v<d&&!blocked(n.x,n.z,blocks,.27)&&(!connect||connect(n,v))){best=n;d=v;}}return best;}
 path(a,b,doors=[],architectural=false,options={}){
  const agent=options.agent||'player',traversals=options.traversals||{},speed=options.speed>0?options.speed:agent==='kun'?5:3.65;
  const duration=(e,a,b)=>(e.traversal&&!traversals[e.traversal.id]?(agent==='kun'?e.traversal.enemyDuration:e.traversal.playerDuration):e.cost/speed)+
   (options.doorOpeningCosts?.reduce((wait,door)=>wait+(crossesDoor(a,b,door)?door.wait:0),0)??0);
  const fastest=architectural?1:Math.max(speed,...this.building.floors.flatMap(f=>(f.traversals||[]).filter(t=>agent!=='kun'||t.enemyDuration!=null).map(t=>{
   const points=[t.a,...(t.via||[]),t.b],length=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.z-points[i].z),0);return length/(agent==='kun'?t.enemyDuration:t.playerDuration);
  })));
  const floorBlocks=new Map(),blockers=f=>{if(!floorBlocks.has(f))floorBlocks.set(f,architectural?[]:doors.filter(d=>d.floor===f).map(d=>d.block));return floorBlocks.get(f);};
  const bodyRoute=!architectural&&(agent==='kun'||agent==='naiwa'||agent==='doubao');
  const connection=(point,goal)=>bodyRoute?(node,squared)=>{
   if(squared>1.1**2)return false;
   const floor=this.building.byId[point.floor],blocks=goal?blockers(point.floor):startBlocks;
   return goal?clearActorTravel(floor,node,point,blocks,.24,options):clearActorTravel(floor,point,node,blocks,.26,options);
  }:undefined;
  const startBlocks=options.startBlocks??blockers(a.floor);
  const start=this.closest(a,startBlocks,connection(a,false)),end=this.closest(b,blockers(b.floor),connection(b,true));if(!start||!end)return[];
  const cacheKey=`${start.id}:${end.id}:${agent}:${speed}:${Object.keys(traversals).filter(id=>traversals[id]).sort().join(',')}`;if(architectural&&this.cache.has(cacheKey))return this.cache.get(cacheKey);
  const open=new Heap(),dist=new Map([[start.id,0]]),prev=new Map();open.push([0,start.id]);
  while(open.a.length){const [,id]=open.pop(),n=this.nodes[id];if(id===end.id)break;
   const currentCost=dist.get(id);
   for(const e of n.edges){const v=this.nodes[e.to];
    if(e.traversal&&agent==='kun'&&e.traversal.enemyDuration==null)continue;
    // Most neighbours already have a shorter route. Only test collisions for improvements.
    const shelfClearance=agent==='liang'&&v.listenerTight ? .36 : 0;
    const cost=currentCost+(architectural?e.cost:duration(e,n,v)+shelfClearance);
    if(cost>=(dist.get(v.id)??Infinity))continue;
    if(e.core&&!architectural&&doors.some(d=>(d.floor===n.floor||d.floor===v.floor)&&d.id===`${d.floor}-${e.core}`&&d.amount<.85))continue;
    const blocks=blockers(v.floor);
    const minX=Math.min(n.x,v.x)-.27,maxX=Math.max(n.x,v.x)+.27;
    const minZ=Math.min(n.z,v.z)-.27,maxZ=Math.max(n.z,v.z)+.27;
    if(blocks.some(b=>b.minX<=maxX&&b.maxX>=minX&&b.minZ<=maxZ&&b.maxZ>=minZ)){
     if(blocked(v.x,v.z,blocks,.27)||(!e.core&&!e.traversal&&!clearSight(n,v,blocks)))continue;
     if(bodyRoute&&!e.core&&!e.traversal&&!travelSamples(n,v,(x,z)=>!blocked(x,z,blocks,.27)))continue;
     if(agent==='liang'&&!e.core&&!e.traversal&&n.x!==v.x&&n.z!==v.z&&
        (blocked(n.x,v.z,blocks,.27)||blocked(v.x,n.z,blocks,.27)))continue;
    }
    dist.set(v.id,cost);prev.set(v.id,{id,edge:e});const h=(v.floor===end.floor?Math.hypot(v.x-end.x,v.z-end.z):Math.abs(v.floor-end.floor)*3)/fastest;open.push([cost+h,v.id]);
   }
  }
  if(!dist.has(end.id))return[];const result=[];let id=end.id,totalDistance=0,totalDuration=0;
  while(id!==start.id){const n=this.nodes[id],p=prev.get(id),t=p.edge.traversal,from=this.nodes[p.id];totalDistance+=p.edge.cost;totalDuration+=duration(p.edge,from,n);result.unshift({x:n.x,z:n.z,floor:n.floor,core:p.edge.core,cost:p.edge.cost,...(t?{traversalId:t.id,kind:t.kind,from:{x:from.x,z:from.z,floor:from.floor},via:p.edge.reverse?[...(t.via||[])].reverse():t.via||[],duration:traversals[t.id]?0:agent==='kun'?t.enemyDuration:t.playerDuration,collapsed:!!traversals[t.id]}:{})});id=p.id;}
  result.unshift({x:start.x,z:start.z,floor:start.floor,cost:0});result.distance=totalDistance;result.duration=totalDuration;
  if(architectural){if(this.cache.size>250)this.cache.clear();this.cache.set(cacheKey,result);}return result;
 }
 distance(a,b){return this.path(a,b,[],true).distance??Infinity;}
}
