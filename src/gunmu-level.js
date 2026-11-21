import * as T from 'three';
import {getLanguage} from './i18n.js';
import {listShaftPipes,listShaftSolids} from './gunmu-shaft-geometry.js';

export function dressGunmuFinale(f,{root,box,queue,mat,mats,flatPaints,print,batchSection}){
 const {shaft,platforms,sections,groundEdge}=f.gunmuFinale;
 const slidingPipes=[];
 const end=shaft.x+shaft.w;
 const duct=mat(0x596764,mats.floor.map,.81),tread=mat(0x545d53,mats.floor.map);
 const rust=mat(0x795c4b,null,.68),steel=mat(0x576966,null,.51);
 const enamel=mat(0xc79b52),depth=mat(0x283234),rim=mat(0xddd0ae);
 const landingPaint=mat(0xcacbb3,null,.84);
 const wet=mat(0x697674,null,.29),weathered=mat(0x765744,null,.38);
 const copper=mat(0x90705a,null,.70),patina=mat(0x55716d,null,.73);
 const insulation=mat(0x747b75,mats.floor.map,.91);
 const pipeBank=mat(0xffffff,null,.79);pipeBank.vertexColors=true;
 const blue=mat(0x4e91bf),sky=mat(0x2c4c63);
 for(const paint of [enamel,depth,rim,blue])flatPaints.add(paint);
 sky.emissive.setHex(0x24486b);sky.emissiveIntensity=.44;

 function pipe(x,y,z,len,r,material,axis='x',segments=10,openEnded=false,emit=queue){
  const mesh=new T.CylinderGeometry(r,r,len,segments,1,openEnded);
  if(axis==='x')mesh.rotateZ(Math.PI/2);
  if(axis==='z')mesh.rotateX(Math.PI/2);
  mesh.translate(x,y,z);emit(mesh,material);
 }
 function routedPipe(points,r,material,emit=queue){
  const nodes=points.map(p=>new T.Vector3(...p));
  const path=new T.CurvePath();
  let start=nodes[0];
  for(let i=1;i<nodes.length-1;i++){
   const previous=nodes[i-1],corner=nodes[i],next=nodes[i+1];
   const bend=Math.min(r*2.35,corner.distanceTo(previous)*.36,corner.distanceTo(next)*.36);
   const before=corner.clone().addScaledVector(previous.clone().sub(corner).normalize(),bend);
   const after=corner.clone().addScaledVector(next.clone().sub(corner).normalize(),bend);
   path.add(new T.LineCurve3(start,before));
   path.add(new T.QuadraticBezierCurve3(before,corner,after));
   start=after;
  }
  path.add(new T.LineCurve3(start,nodes.at(-1)));
  for(const curve of path.curves)emit(new T.TubeGeometry(curve,curve.isLineCurve3?1:5,r,8,false),material);
 }
 function brace(a,b,w,material){
  const start=new T.Vector3(...a),end=new T.Vector3(...b),vector=end.clone().sub(start);
  const mesh=new T.BoxGeometry(w,vector.length(),w);
  mesh.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),vector.normalize()));
  mesh.translate(...start.lerp(end,.5));queue(mesh,material);
 }
 function sign(parent,x,y,z,w,height,zh,en,yaw=-Math.PI/2,options={}){
  const label=print(parent,x,y,z,w,height,()=>getLanguage()==='en'?en:zh,yaw,
   {bg:'#302d25',color:'#ddc89e',width:512,height:128,...options});
  return label;
 }

 sign(root,27.81,2.82,24,2.55,.24,['维修间 · 隔离闸'],['REPAIR BAY / ISOLATION']);
 sign(root,25.06,2.12,16.107,2.48,.43,['管道井','黄线通向检修入口'],['PIPE SHAFT','FOLLOW THE YELLOW LINE'],0);
 sign(root,29.27,2.09,14.706,2.48,.39,['管道井','检修通道'],['PIPE SHAFT','MAINTENANCE ACCESS'],0);
 sign(root,39.22,2.16,14.706,2.22,.39,['管道井','携带手电'],['PIPE SHAFT','LIGHT REQUIRED'],0);
 sign(root,41.985,2.83,18,2.28,.23,['管道井 · 检修入口'],['PIPE SHAFT / ACCESS']);
 for(const offset of [-.105,.105]){
  box(26.46+offset,.004,21.18,.064,.008,10.12,enamel);
  box(33.49,.004,16.12+offset,14.02,.008,.064,enamel);
  box(40.49+offset,.004,17.06,.064,.008,1.88,enamel);
  box(41.27,.004,18+offset,1.56,.008,.064,enamel);
 }
 for(const [index,boiler] of f.furniture.filter(piece=>piece.name==='boiler').entries()){
  const x=boiler.x+boiler.w*.56,z=boiler.z+boiler.d*.53;
  pipe(x,boiler.height+(3-boiler.height)/2,z,3-boiler.height,.16,steel,'y');
  pipe(x,boiler.height+.08,z,.16,.22,rust,'y');
  if(index!==0)continue;
  const front=boiler.x+boiler.w/2-Math.min(boiler.w,boiler.d)*.43,gaugeZ=boiler.z+boiler.d/2;
  pipe(front,1.86,gaugeZ,.1,.17,depth);
  pipe(front-.061,1.86,gaugeZ,.022,.133,mats.cream);
  box(front-.078,1.891,gaugeZ+.023,.025,.081,.023,mats.red);
  pipe(front,1.1,gaugeZ,.2,.12,steel);
  const wheel=new T.TorusGeometry(.23,.029,6,12);
  wheel.rotateY(Math.PI/2);wheel.translate(front-.12,1.1,gaugeZ);queue(wheel,mats.red);
  box(front-.12,1.1,gaugeZ,.039,.042,.445,mats.red);
  box(front-.12,1.1,gaugeZ,.039,.445,.042,mats.red);
 }

 const lastDeck=platforms.at(-1);
 const pipes=listShaftPipes(f.gunmuFinale),solids=listShaftSolids(f.gunmuFinale);
 const footing=solids.find(s=>s.id==='shaft-floor'),roof=solids.find(s=>s.id==='shaft-roof').y+.03;
 const ground=footing.y+footing.height-.02;
 root.userData.shaftGeometry={pipes,solids};
 batchSection('shell',()=>{
  for(const s of solids)box(s.x+s.w/2,s.y+s.height/2,s.z+s.d/2,s.w,s.height,s.d,depth);
 });

 const frame=p=>({axis:p.axis??'x',length:(p.axis??'x')==='x'?p.w:p.d,width:(p.axis??'x')==='x'?p.d:p.w,x:p.x+p.w/2,z:p.z+p.d/2});
 function lanePoint(p,u,y,v=0){
  const {axis,x,z}=frame(p);
  return axis==='x'?[x+u,y,z+v]:[x+v,y,z+u];
 }
 function deckBox(p,u,y,v,length,height,width,material){
  const a=frame(p);
  if(a.axis==='x')box(a.x+u,y,a.z+v,length,height,width,material);
  else box(a.x+v,y,a.z+u,width,height,length,material);
 }
 function dressDeck(p,index){
  const a=frame(p),thickness=p.thickness??(p.kind==='duct'?.96:.15);
  if(p.kind==='pipe')return;
  const clip=index===0?Math.max(0,groundEdge-p.x):0,length=a.length-clip,offset=clip/2;
  if(p.kind==='grate'){
   for(const side of [-1,1])deckBox(p,offset,p.y-thickness/2,side*(a.width/2-.045),length,thickness,.09,steel);
   deckBox(p,offset,p.y-thickness/2,0,length,thickness,.075,steel);
   for(let u=-a.length/2+clip+.05;u<a.length/2;u+=.23)deckBox(p,u,p.y-.026,0,.055,.052,a.width,steel);
  }else if(p.kind==='beam'){
   deckBox(p,0,p.y-.018,0,length,.036,a.width,steel);
   deckBox(p,0,p.y-thickness+.018,0,length,.036,a.width,rust);
   deckBox(p,0,p.y-thickness/2,0,length,Math.max(.02,thickness-.072),.07,steel);
  }else{
   deckBox(p,offset,p.y-thickness/2,0,length,thickness,a.width,p.kind==='duct'?duct:tread);
   for(let u=-a.length/2+clip+.42;u<a.length/2-.2;u+=p.kind==='duct'?.76:.58)
    deckBox(p,u,p.y+.002,0,.035,.004,a.width-.06,p.kind==='duct'?steel:depth);
  }
  // Paint marks the actual landing edge and reflects the player's light; it is never emissive.
  for(const u of [-a.length/2+clip+.055,a.length/2-.055]){
   deckBox(p,u,p.y+.005,0,.09,.01,a.width-.07,p.turn?steel:enamel);
   for(const side of [-1,1])deckBox(p,u,p.y+.012,side*(a.width/2-.14),.13,.012,.20,p.turn?enamel:rim);
  }
  if(p.turn){
   const incoming=(p.axis??'x'),out=p.turn.axis;
   if(out!==incoming){
    const side=p.turn.direction;
    // A broad receiving landing and its open end stay visible before the direction changes.
    if(out==='z')box(a.x,p.y+.006,a.z+side*(p.d/2-.13),p.w-.18,.012,.22,landingPaint);
    else box(a.x+side*(p.w/2-.13),p.y+.006,a.z,.22,.012,p.d-.18,landingPaint);
   }
  }
 }
 function bearers(p,index){
  const a=frame(p);
  const underside=p.y-(p.kind==='pipe'?a.width*.86:p.thickness??(p.kind==='duct'?.96:.15));
  const rows=a.length>6.5?[-.29,.29]:[0];
  for(const row of rows){
   const u=rows.length===1&&index===0?.72:row*a.length;
   deckBox(p,u,underside-.07,0,.21,.20,a.width*.90,steel);
   for(const v of [-a.width*.34,a.width*.34]){
    deckBox(p,u,(ground+underside)/2,v,.135,underside-ground,.15,depth);
    deckBox(p,u,underside-.26,v,.29,.29,.28,steel);
   }
   brace(lanePoint(p,u,underside-.19,-a.width*.34),lanePoint(p,u,underside-1.28,a.width*.34),.095,steel);
  }
 }
 function slideRails(p){
  const a=frame(p),shift=p.slide.offset,length=Math.abs(shift)+a.width*.78,y=p.y-a.width-.19;
  for(const side of [-.28,.28]){
   const z=a.z+side*a.length;
   box(a.x+shift/2,y,z,length,.18,.23,steel);
   box(a.x+shift/2,y+.11,z,length,.05,.09,depth);
   for(const x of [a.x,a.x+shift]){
    box(x,(ground+y)/2,z,.16,y-ground,.18,depth);
    brace([x,y-.12,z],[x+Math.sign(shift)*.82,y-1.4,z],.10,steel);
   }
  }
 }
 // Feeders remain well beneath the jump. The visible yellow edge still marks a real break.
 function joinPipeDecks(a,b){
  if(a.kind!=='pipe'&&b.kind!=='pipe')return;
  const end=(p,axis,direction)=>{
   const {x,z,width}=frame(p),y=p.y-(p.kind==='pipe'?width*.79:.105);
   return [x+(axis==='x'?direction*(p.w/2-.48):0),y,z+(axis==='z'?direction*(p.d/2-.48):0)];
  };
  const exit=a.turn??a,from=end(a,exit.axis,exit.direction),to=end(b,b.axis,-b.direction);
  for(const [offset,r,material] of [[-.14,.091,patina],[.13,.073,copper]]){
   const low=Math.min(a.y,b.y)-1.65+offset;
   const first=[from[0],low,from[2]+offset],last=[to[0],low,to[2]+offset];
   routedPipe([[from[0],from[1],first[2]],first,last,[to[0],to[1],last[2]]],r,material);
  }
 }
 const backgrounds={
  ducts:[44.2,94.6,13.7,-3.35,1],
  manifold:[97.2,132.6,14.1,-4.95,-1],
  pressure:[65.8,120.45,23.98,-5.05,-1],
  risers:[54.1,74.8,32.27,3.65,1],
  exhaust:[75.3,132.28,41.65,.72,1]
 };
 function dressPipeBank(id){
  const [left,right,z,y,side]=backgrounds[id];
  const betweenLanes=id==='pressure';
  const draw=(mesh,material)=>{
   const n=mesh.attributes.position.count,colors=new Uint8Array(n*3),{r,g,b}=material.color;
   for(let i=0;i<colors.length;i+=3){colors[i]=Math.round(r*255);colors[i+1]=Math.round(g*255);colors[i+2]=Math.round(b*255);}
   mesh.setAttribute('color',new T.BufferAttribute(colors,3,true));
   queue(mesh,pipeBank);
  };
  for(const [k,[height,lateral,r,material]] of [
   [-2.46,1.10,.246,depth],[-1.72,-.36,.142,patina],[-1.08,.42,.218,weathered],
   [-.39,-.04,.105,copper],[.38,.64,.177,steel],[1.16,-.56,.261,insulation],[2.24,.72,.13,patina]
  ].entries()){
   const x1=left+.32*k,x2=right-.48*k,level=y+height,cross=z+side*lateral;
   const inlet=betweenLanes||k%3===0?ground:roof,outlet=!betweenLanes&&k%2===0?roof:ground;
   const step=Math.min(4.8,(x2-x1)/4),mid=(x1+x2)/2+.71*k;
   const nextLevel=level+.49*(k%2?1:-1);
   routedPipe([[x1,inlet,cross],[x1,level,cross],[mid-step,level,cross],
    [mid,nextLevel,cross],[x2,nextLevel,cross],[x2,outlet,cross]],r,material,draw);
   for(let x=x1+2.1;x<x2-1;x+=6.7){
    if(x>mid-step-.65&&x<mid+.65)continue;
    pipe(x,x<mid?level:nextLevel,cross,.18,r+.037,depth,'x',8,false,draw);
   }
  }
  // The banks share floor-mounted frames, with a horizontal cradle at each bank.
  for(let x=left+5.9;x<right-2;x+=8.6){
   const frameTop=y+2.71;
   for(const v of [-.83,1.40])box(x,(ground+frameTop)/2,z+v*side,.16,frameTop-ground,.14,depth);
   for(const v of [-2.72,-1.33,.13,1.78,2.57])box(x,y+v,z+.28*side,.22,.12,2.31,steel);
  }
 }
 function tieRecoveryPipe(p,deck){
  const {axis,x,z,width}=frame(deck),lateral=axis==='x'?p.z-z:p.x-x;
  const stem=Math.sign(lateral)*(width*.34),base=p.y-p.radius*.68;
  const along=axis==='x'?p.x-x:p.z-z;
  for(const v of [-.32,.32]) {
   const u=along+v*p.length;
   const joint=lanePoint(deck,u,base,lateral);
   brace(joint,lanePoint(deck,u,base-.70,stem),.108,steel);
   deckBox(deck,u,(ground+base-.7)/2,stem,.11,base-.7-ground,.115,depth);
  }
  const tail=along+(deck.direction??1)*(p.length/2-.19);
  const feed=lanePoint(deck,tail,p.y-p.radius*.53,lateral),tray=p.y-.80;
  routedPipe([feed,lanePoint(deck,tail,tray,lateral),lanePoint(deck,tail,tray,0),
   lanePoint(deck,tail,deck.y-width*.78)],.089,patina);
 }
 const names={ducts:['01 送风主道','01 / SUPPLY DUCTS'],manifold:['02 回水管线','02 / RETURN LINE'],
  pressure:['03 泄压管线','03 / PRESSURE LINE'],risers:['04 立管联廊','04 / RISER LINK'],exhaust:['05 排风出口','05 / EXHAUST']};
 for(const {id,first,last} of sections)batchSection(id,chunk=>{
  for(let i=first;i<=last;i++){
   const p=platforms[i],next=platforms[i+1];
   dressDeck(p,i);
   if(p.slide)slideRails(p);else bearers(p,i);
   if(next&&!p.slide&&!next.slide)joinPipeDecks(p,next);
  }
  const renderPipe=p=>{
   const material=p.role==='recovery'?steel:p.slip?wet:id==='exhaust'?weathered:rust;
   if(p.role==='main'&&(p.axis==='z'||id==='pressure')){
    const sections=p.axis==='z'?3:Math.ceil(p.length/2.45),length=p.length/sections;
    for(let i=0;i<sections;i++){
     const u=-p.length/2+(i+.5)*length;
     pipe(p.x+(p.axis==='x'?u:0),p.y,p.z+(p.axis==='z'?u:0),length,p.radius,
      i%3===0?insulation:i%3===1?patina:material,p.axis,16,i>0&&i<sections-1);
     if(i>0){
      const seam=u-length/2;
      pipe(p.x+(p.axis==='x'?seam:0),p.y,p.z+(p.axis==='z'?seam:0),
       .21,p.radius+.010,steel,p.axis,16,true);
     }
    }
    // Separate the twin-feed machinery from the crowned run by dropping it below the landing.
    const deck=platforms[p.platformIndex],a=frame(deck);
    for(const v of [-1,1]){
     const lateral=v*(a.width/2+.27),length=a.length/2-.26,y=p.y-.61;
     routedPipe([lanePoint(deck,-length,p.y-.20),lanePoint(deck,-length,y,lateral),
      lanePoint(deck,length,y,lateral),lanePoint(deck,length,p.y-.20)],v<0?.141:.103,v<0?copper:patina);
    }
   }else pipe(p.x,p.y,p.z,p.length,p.radius,material,p.axis,16);
   if(p.role==='recovery')tieRecoveryPipe(p,platforms[p.platformIndex]);
   // Millimetre-thin paint bands preserve the shared cylindrical support radius.
   for(const sign of [-1,1]){
    const u=sign*(p.length/2-.075),x=p.x+(p.axis==='x'?u:0),z=p.z+(p.axis==='z'?u:0);
    pipe(x,p.y,z,p.axis==='z'?.16:.075,p.radius+.003,p.role==='recovery'||p.axis==='z'?landingPaint:enamel,p.axis,16,true);
   }
   if(p.axis==='z'||p.role==='recovery'){
    // This curved paint follows the same sixteen-sided crown; light must strike it to reveal the landing.
    const theta=p.axis==='x'?3*Math.PI/8:7*Math.PI/8;
    const crown=new T.CylinderGeometry(p.radius+.004,p.radius+.004,p.length-.05,2,1,true,theta,Math.PI/4);
    if(p.axis==='x')crown.rotateZ(Math.PI/2);else crown.rotateX(Math.PI/2);
    crown.translate(p.x,p.y,p.z);queue(crown,landingPaint);
   }
   if(p.slide){
    const deck=platforms[p.platformIndex],a=frame(deck);
    for(const side of [-.28,.28]){
     deckBox(deck,side*a.length,deck.y-a.width-.075,0,.31,.17,a.width*.71,weathered);
    }
   }
  };
  for(const p of pipes.filter(p=>p.platformIndex>=first&&p.platformIndex<=last)){
   if(p.slide)batchSection(p.slide.id,group=>{
    group.position.x=p.slide.offset;slidingPipes.push({slide:p.slide,group});renderPipe(p);
   });
   else renderPipe(p);
  }
  const p=platforms[first],a=frame(p),direction=p.direction??1,[zh,en]=names[id]??[id,id.toUpperCase()];
  // The label sits above the route, outside the player's jump envelope.
  const yaw=a.axis==='x'?-direction*Math.PI/2:direction===1?Math.PI:0;
  sign(chunk,a.x-(a.axis==='x'?direction*(a.length/2-.12):0),p.y+3.18,
   a.z-(a.axis==='z'?direction*(a.length/2-.12):0),2.1,.25,[zh],[en],yaw);
 });
 for(const {id} of sections)batchSection(`pipes-${id}`,()=>dressPipeBank(id));

 const z=lastDeck.z+lastDeck.d/2,gate=f.doorSpecs.find(d=>d.id===f.exitGateId);
 batchSection('exterior',chunk=>{
  box(end+7.2,lastDeck.y+2.1,z,.19,6.4,16,sky);
  box(end+2.1,lastDeck.y-.075,z,4.25,.15,lastDeck.d,duct);
  for(const side of [-1,1]){
   box(gate.x+.14,lastDeck.y+1.38,z+side*(lastDeck.d/2+.11),.17,2.76,.13,blue);
   box(end+3,lastDeck.y+1.08,z+side*(lastDeck.d/2+.04),3.5,.07,.06,steel);
   for(let x=end+.29;x<end+4.3;x+=.58)box(x,lastDeck.y+.54,z+side*(lastDeck.d/2+.04),.05,1.08,.055,depth);
  }
  box(gate.x+.14,lastDeck.y+2.79,z,.17,.13,lastDeck.d+.35,blue);
  sign(chunk,gate.x-.21,lastDeck.y+2.95,z,1.48,.21,['室外 / 出口'],['OUTSIDE / EXIT'],-Math.PI/2,{bg:'#203b57',color:'#d6e4ed'});
 });
 return slidingPipes;
}
