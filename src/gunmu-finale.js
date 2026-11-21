import {within} from './building.js';
import {blocked} from './logic.js';
import {listShaftPipes,listShaftSolids,shaftSlideOffset} from './gunmu-shaft-geometry.js';

const jumpSpeed=6.4,gravity=16,jumpBuffer=.13,coyoteTime=.095;
const bodyRadius=.24,bodyHeight=1.74,contact=.005;
const shaftShapes=new WeakMap();
// The 253.94 m route to the blue door takes about 39 s.
export const gunmuCrawlSpeed=6.512;

export function gunmuBearing(player,actor,viewYaw){
 const x=actor.x-player.x,y=actor.y-player.y,z=actor.z-player.z;
 const sin=Math.sin(viewYaw),cos=Math.cos(viewYaw);
 return {distance:Math.hypot(x,y,z),elevation:y,angle:Math.atan2(x*cos-z*sin,-x*sin-z*cos)};
}

export function gunmuVisibleAcrossTurn(finale,index,crawler){
 const landing=finale?.sections?.[1]?.last;
 return crawler?.phase==='crawling'&&index>=landing&&index<=landing+3&&crawler.pipeIndex<landing;
}

function shapesFor(finale,state,time){
 if(!shaftShapes.has(finale)){
  const boxes=finale.platforms.flatMap((deck,platformIndex)=>{
   if(deck.kind==='pipe')return [];
   const height=deck.thickness??(deck.kind==='duct'?.96:.15);
   return [{...deck,axis:null,y:deck.y-height,height,platformIndex}];
  });
  shaftShapes.set(finale,[...boxes,...listShaftPipes(finale),...listShaftSolids(finale)]);
 }
 const shapes=shaftShapes.get(finale);
 return state?shapes.map(shape=>{
  const shift=shape.slide&&shaftSlideOffset(shape.slide,state,time);
  return shift?{...shape,x:shape.x+shift}:shape;
 }):shapes;
}

// A horizontal tube's contact height depends on its cross-section, not the width of its bounding box.
function verticalSpan(shape,x,z,padding=0){
 const {axis,y,radius,length}=shape;
 if(!axis)return within({x,z},shape,padding)?{bottom:y,top:y+shape.height}:null;
 const dx=x-shape.x,dz=z-shape.z;
 if(axis==='y')return Math.hypot(dx,dz)<=radius+padding?{bottom:y-length/2,top:y+length/2}:null;
 const along=axis==='x'?dx:dz,across=axis==='x'?dz:dx;
 if(Math.abs(along)>length/2+padding||Math.abs(across)>radius+padding)return null;
 const cap=Math.sqrt(Math.max(0,radius*radius-Math.max(0,Math.abs(across)-padding)**2));
 return {bottom:y-cap,top:y+cap};
}

function supportAt(shapes,player,upper,lower=-Infinity){
 let support=null;
 for(const shape of shapes){
  const span=verticalSpan(shape,player.x,player.z);
  if(span&&span.top<=upper&&span.top>=lower&&(!support||span.top>support.y))support={shape,y:span.top};
 }
 return support;
}

function lateralClearance(shape,x,z){
 if(!shape.axis)return Math.hypot(Math.max(0,shape.x-x,x-shape.x-shape.w),Math.max(0,shape.z-z,z-shape.z-shape.d));
 const dx=Math.abs(x-shape.x),dz=Math.abs(z-shape.z);
 if(shape.axis==='y')return Math.hypot(dx,dz)-shape.radius;
 const along=shape.axis==='x'?dx:dz,across=shape.axis==='x'?dz:dx;
 return Math.max(along-shape.length/2,across-shape.radius);
}

function obstructsMove(shape,player,x,z){
 const span=verticalSpan(shape,x,z,bodyRadius);
 if(!span||player.y>=span.top-contact||player.y+bodyHeight<=span.bottom+contact)return false;
 const before=verticalSpan(shape,player.x,player.z,bodyRadius);
 return !before||player.y>=before.top-contact||player.y+bodyHeight<=before.bottom+contact||
  lateralClearance(shape,x,z)<lateralClearance(shape,player.x,player.z)-contact;
}

function hitCeiling(shapes,player,nextY){
 let ceiling=Infinity;
 for(const shape of shapes){
  const span=verticalSpan(shape,player.x,player.z,bodyRadius);
  if(span&&span.bottom>=player.y+bodyHeight-contact&&span.bottom<=nextY+bodyHeight)ceiling=Math.min(span.bottom,ceiling);
 }
 return ceiling-bodyHeight;
}

export function moveGunmuPlatforms(game,dt,input){
 const {player:p,state:s}=game,finale=game.floor.gunmuFinale,shapes=shapesFor(finale,s,game.time),doors=game.floorBlocks();
 const yaw=input.yaw??0,f=input.forward??0,r=input.right??0,n=Math.max(1,Math.hypot(f,r)),speed=input.sprint?5:2.4;
 const dx=(-Math.sin(yaw)*f+Math.cos(yaw)*r)*speed/n,dz=(-Math.cos(yaw)*f-Math.sin(yaw)*r)*speed/n;
 const x=p.x,z=p.z;
 if(input.jump&&!s.gunmuJumpDown)s.gunmuJumpUntil=game.time+jumpBuffer;
 s.gunmuJumpDown=!!input.jump;
 const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
 const canMove=(x,z,support)=>within({x,z},finale.shaft,-.2)&&!blocked(x,z,doors,bodyRadius)&&
  !shapes.some(shape=>shape!==support&&obstructsMove(shape,p,x,z));
 function land(support,time){
  p.y=support.y;s.gunmuVelocity=0;s.gunmuGroundedAt=time;
  if(support.shape.platformIndex!==undefined)s.gunmuPipeIndex=support.shape.platformIndex;
 }
 for(let step=0;step<steps;step++){
  const time=game.time-dt+(step+1)*h;
  const support=s.gunmuVelocity<=0&&supportAt(shapes,p,p.y+contact,p.y-contact);
  if(support)s.gunmuGroundedAt=time;
  const jumping=s.gunmuJumpUntil>=time&&time-s.gunmuGroundedAt<=coyoteTime;
  if(jumping){s.gunmuVelocity=jumpSpeed;s.gunmuJumpUntil=-Infinity;s.gunmuGroundedAt=-Infinity;}
  const shape=support?.shape;
  let driftX=0,driftZ=0;
  if(shape?.slip&&!jumping){
   const side=(shape.axis==='x'?p.z-shape.z:p.x-shape.x)/shape.radius;
   const drift=Math.sign(side)*Math.max(0,Math.abs(side)-.43)*3.6;
   if(shape.axis==='x')driftZ=drift;else driftX=drift;
  }
  const nextX=p.x+(dx+driftX)*h,nextZ=p.z+(dz+driftZ)*h;
  if(nextX!==p.x&&canMove(nextX,p.z,shape))p.x=nextX;
  if(nextZ!==p.z&&canMove(p.x,nextZ,shape))p.z=nextZ;
  const stillOn=shape&&!jumping&&verticalSpan(shape,p.x,p.z);
  if(stillOn){land(supportAt(shapes,p,Math.max(p.y,stillOn.top)+contact),time);continue;}
  const nextY=p.y+s.gunmuVelocity*h-.5*gravity*h*h;
  s.gunmuVelocity-=gravity*h;
  if(nextY>p.y){
   const ceiling=hitCeiling(shapes,p,nextY);
   p.y=Math.min(nextY,ceiling);
   if(ceiling<=nextY)s.gunmuVelocity=0;
  }else{
   const landing=supportAt(shapes,p,p.y+contact,nextY-contact);
   if(landing)land(landing,time);else p.y=nextY;
  }
 }
 const moved=Math.hypot(p.x-x,p.z-z);
 game.sprinting=!!input.sprint&&moved>.001;
 if(p.y<(finale.voidY??-6))game.fallInGunmuShaft();
 return moved;
}

export function crawlGunmu(t,finale,player,index,dt,state,time){
 const {route,platforms}=finale;
 let distanceLeft=gunmuCrawlSpeed*dt;
 const deck=platforms[t.pipeIndex];
 const shapes=shapesFor(finale,state,time),supports=shapes.filter(shape=>shape.platformIndex===t.pipeIndex);
 const playerSupport=index===t.pipeIndex&&supportAt(supports,player,player.y+contact,player.y-.95);
 if(playerSupport&&(within(t,deck,.45)||supportAt(supports,t,t.y+contact,t.y-.45))){
  const target={...player,y:playerSupport.y};
  moveCrawler(t,target,distanceLeft);
  t.pipeNext=null;
 }else while(distanceLeft>0){
  t.pipeNext??=Math.max(0,Math.min(route.length-1,t.pipeIndex+(index<t.pipeIndex?-1:1)));
  const target=route[t.pipeNext],slide=platforms[t.pipeNext]?.slide;
  const shift=state&&slide&&shaftSlideOffset(slide,state,time);
  const used=moveCrawler(t,shift?{...target,x:target.x+shift}:target,distanceLeft);
  if(used>=distanceLeft)break;
  const previous=t.pipeIndex;
  t.pipeIndex=t.pipeNext;t.pipeNext=null;
  if(previous===t.pipeIndex&&used===0&&t.pipeIndex===route.length-1)break;
  distanceLeft-=used;
 }
 // Keep the actual feet above solid surfaces while retaining the authored centreline's travel time.
 const under=t.pipeNext===null&&deck===platforms[t.pipeIndex]?supports:
  shapes.filter(shape=>shape.platformIndex===t.pipeIndex||shape.platformIndex===t.pipeNext);
 t.y=Math.max(t.pipeRouteY,supportAt(under,t,Infinity)?.y??-Infinity);
}

function moveCrawler(actor,target,budget){
 const currentY=actor.pipeRouteY??actor.y;
 const x=target.x-actor.x,y=target.y-currentY,z=target.z-actor.z,gap=Math.hypot(x,y,z);
 if(gap<=budget){actor.x=target.x;actor.pipeRouteY=target.y;actor.z=target.z;return gap;}
 const t=budget/gap;actor.x+=x*t;actor.pipeRouteY=currentY+y*t;actor.z+=z*t;return budget;
}

export function caughtInGunmuShaft(actor,player,finale,index,state,time){
 if(Math.abs(actor.pipeIndex-index)>1||Math.abs(player.y-actor.y)>=.95||Math.hypot(player.x-actor.x,player.z-actor.z)>=.82)return false;
 const shapes=shapesFor(finale,state,time);
 for(const t of [.2,.4,.6,.8]){
  const x=actor.x+(player.x-actor.x)*t,z=actor.z+(player.z-actor.z)*t,y=actor.y+.45+(player.y-actor.y+.2)*t;
  if(shapes.some(shape=>{const span=verticalSpan(shape,x,z);return span&&span.bottom<y&&span.top>y;}))return false;
 }
 return true;
}
