export const SHAFT_SLIDE_SECONDS=.5;

export function shaftSlideProgress(slide,state,time){
 const started=state?.gunmuSlides?.[slide.id];
 if(started===undefined)return 0;
 return Math.max(0,Math.min(1,(time-started)/SHAFT_SLIDE_SECONDS+1e-10));
}

export function shaftSlideOffset(slide,state,time){
 const t=shaftSlideProgress(slide,state,time);
 return slide.offset*(1-t*t*(3-2*t));
}

// Pipe centres and total lengths are shared by rendering and movement.
export function listShaftPipes(finale){
 const pipes=[];let ordinal=0;
 for(const [index,p] of finale.platforms.entries()){
  if(p.kind!=='pipe')continue;
  const axis=p.axis??'x',length=axis==='x'?p.w:p.d,radius=(axis==='x'?p.d:p.w)/2;
  const main={id:`shaft-main-${index}`,platformIndex:index,role:'main',x:p.x+p.w/2,y:p.y-radius,z:p.z+p.d/2,length,radius,axis,slip:!!p.slip};
  if(p.slide)main.slide=p.slide;
  pipes.push(main);
  // A few lower parallel pipes offer a recoverable misstep, without becoming a second full route.
  if(ordinal++%4!==0||length<2.4)continue;
  const side=ordinal%2?1:-1,recoveryRadius=.23,cross=radius+recoveryRadius+.16;
  const recovery={...main,id:`shaft-recovery-${index}`,role:'recovery',radius:recoveryRadius,length:Math.min(3.3,length-.6),y:p.y-.42-recoveryRadius,slip:false};
  if(axis==='x')recovery.z+=side*cross;else recovery.x+=side*cross;
  const halfX=axis==='x'?recovery.length/2:recoveryRadius,halfZ=axis==='z'?recovery.length/2:recoveryRadius;
  const s=finale.shaft;
  if(recovery.x-halfX>s.x+.2&&recovery.x+halfX<s.x+s.w-.2&&recovery.z-halfZ>s.z+.2&&recovery.z+halfZ<s.z+s.d-.2)pipes.push(recovery);
 }
 return pipes;
}

// Solids use minimum X/Z/Y plus width/depth/height. Platform volumes are defined by platforms themselves.
export function listShaftSolids(finale){
 const {shaft,platforms}=finale,x=Math.max(shaft.x,finale.groundEdge??shaft.x),end=shaft.x+shaft.w;
 const bottom=(finale.voidY??-12)-5.5,ceiling=Math.max(5.28,...platforms.map(p=>p.y+4.3)),solids=[];
 const add=(id,x,y,z,w,height,d)=>{if(w>.001&&height>.001&&d>.001)solids.push({id,kind:'shell',x,y,z,w,height,d});};
 add('shaft-floor',x,bottom-.12,shaft.z,end-x,.24,shaft.d);
 add('shaft-roof',x,ceiling-.12,shaft.z,end-x,.24,shaft.d);
 for(const [id,z]of [['north',shaft.z-.11],['south',shaft.z+shaft.d-.11]])add(`shaft-${id}-wall`,x,bottom,z,end-x,ceiling-bottom,.22);
 for(const [id,edge,deck]of [['entry',x,platforms[0]],['exit',end,platforms.at(-1)]]){
  add(`shaft-${id}-left`,edge-.095,bottom,shaft.z,.19,ceiling-bottom,deck.z-shaft.z);
  add(`shaft-${id}-right`,edge-.095,bottom,deck.z+deck.d,.19,ceiling-bottom,shaft.z+shaft.d-deck.z-deck.d);
  add(`shaft-${id}-below`,edge-.095,bottom,deck.z,.19,deck.y-bottom,deck.d);
  add(`shaft-${id}-above`,edge-.095,deck.y+3.025,deck.z,.19,ceiling-deck.y-3.025,deck.d);
 }
 return solids;
}
