import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {painted,lampPower} from './world.js';
import {tr,getLanguage} from './i18n.js';
import {RISE,within,worldStair,stairWalls,stairLandings,stairSurrounds,stairGuard} from './building.js';
import {clearSight} from './logic.js';
import {buildBelongings} from './apartment-belongings.js';
import {heelMarks,stillLifeDust,wornSurface,mountTenantTrace,blisteredPlaster,hangPorterCoat} from './apartment-traces.js';
import {tenantWalls} from './apartment-placements.js';
import {buildHospitalBed} from './apartment-bed.js';
import {scatterFloorPhotos,createPhotoTrail} from './photo-trail.js';
import {dressGunmuFinale} from './gunmu-level.js';
import {shaftSlideOffset,shaftSlideProgress} from './gunmu-shaft-geometry.js';
import {gunmuVisibleAcrossTurn} from './gunmu-finale.js';
import {sweepTiming} from './sweep-timing.js';
import {CHASE_BOARD_DROP,ITEM_NAMES} from './campaign.js';
import {chaseHazards,chaseHazardAge,chaseHazardPose} from './chase-hazard-geometry.js';

// Like painted(), these fixed surface textures belong to the apartment and survive floor changes.
const surfaceMaps={};

// Printed photographs retain the supplied source; only this disposable display copy is monochrome.
function monochrome(source){
 const canvas=document.createElement('canvas'),image=source.image;
 canvas.width=Math.min(768,image.width);canvas.height=Math.max(1,Math.round(canvas.width*image.height/image.width));
 const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),data=pixels.data;
 for(let i=0;i<data.length;i+=4){const value=Math.round(data[i]*.299+data[i+1]*.587+data[i+2]*.114);data[i]=data[i+1]=data[i+2]=value;}
 ctx.putImageData(pixels,0,0);const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.userData.grayscale=true;texture.userData.campaignPrint=true;return texture;
}

// Each installation is built inside the same physical footprint used by movement and sight.
function buildInstallation(p,room,box,queue,m){
 const cx=p.x+p.w/2,cz=p.z+p.d/2,turned=p.d>p.w,length=Math.max(p.w,p.d),depth=Math.min(p.w,p.d),h=p.height??.78;
 const yaw=turned?Math.PI/2:0;
 const xyz=(x,y,z)=>[cx+(turned?z:x),y,cz+(turned?-x:z)];
 function slab(x,y,z,w,height,d,material){box(...xyz(x,y,z),w,height,d,material,yaw);}
 function drum(x,y,z,radius,width,material,upright=false){
  const g=new T.CylinderGeometry(radius,radius,width,16);
  if(!upright)g.rotateX(Math.PI/2);
  g.rotateY(yaw);g.translate(...xyz(x,y,z));queue(g,material);
 }
 const lengthHalf=length/2,depthHalf=depth/2;
 // Freestanding machinery presents its controls toward the middle of the gallery.
 const towardsMiddle=room ? (turned?room.x+room.w/2-cx:room.z+room.d/2-cz) : 1;
 const front=p.name==='mailboxes'&&turned&&h>1.9?-1:towardsMiddle>=0?1:-1;
 function panel(x,y,inset,w,height,thickness,material){slab(x,y,front*(depthHalf-inset-thickness/2),w,height,thickness,material);}
 function legs(level){
  for(const side of [-1,1])for(const end of [-1,1])slab(end*(lengthHalf-.1),level/2,side*(depthHalf-.1),.09,level,.09,m.metal);
 }
 switch(p.name){
 case 'washer-bank':{
  const n=Math.max(1,Math.min(5,Math.round(length/1.15))),span=length/n;
  for(let i=0;i<n;i++){
   const x=-lengthHalf+span*(i+.5),r=Math.min(span*.34,h*.32);
   slab(x,h*.49,0,span-.025,h*.96,depth-.12,m.cream);
   drum(x,h*.45,front*(depthHalf-.066),r,.076,m.metal);
   drum(x,h*.45,front*(depthHalf-.022),r*.81,.028,m.dark);
   drum(x,h*.45,front*(depthHalf-.005),r*.53,.009,m.trim);
   panel(x-span*.23,h*.85,.025,span*.34,.075,.04,m.metal);
   panel(x+span*.29,h*.85,.02,.1,.085,.045,m.trim);
  }break;
 }
 case 'mailboxes':{
  slab(0,h/2,0,length-.08,h,depth-.11,m.trim);
  slab(0,h-.026,front*(depthHalf-.04),length-.024,.046,.075,m.metal);
  const cols=Math.max(2,Math.min(9,Math.round(length/.49))),rows=Math.max(2,Math.round(h/.32)),w=length/cols,rh=(h-.16)/rows;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
   const x=-lengthHalf+(c+.5)*w,y=.08+(r+.5)*rh;
   if(r===rows-2&&c===Math.min(1,cols-1)){
    panel(x,y,.03,w-.025,rh-.024,.06,m.dark);
    slab(x,y-rh*.40,front*(depthHalf-.018),w-.035,.03,.14,m.metal);
    slab(x-w*.06,y-rh*.30,front*(depthHalf+.022),w*.68,.055,.12,m.paper);
    slab(x+w*.15,y-rh*.13,front*(depthHalf-.026),w*.45,.04,.095,m.wood);continue;
   }
   panel(x,y,.019,w-.025,rh-.024,.045,(r+c)%6===1?m.green:m.metal);
   panel(x,y+rh*.14,.008,w*.57,.034,.015,m.dark);
   if((r+2*c)%3===0)panel(x-w*.22,y-rh*.17,0,w*.19,.034,.015,m.paper);
  }
  // The incoming hall faces the ends of this freestanding island.
  for(const end of [-1,1]){
   const wide=Math.max(2,Math.round(depth/.52)),cw=(depth-.13)/wide;
   for(let r=0;r<rows;r++)for(let c=0;c<wide;c++){
    const z=(c+.5-wide/2)*cw,y=.08+(r+.5)*rh;
    slab(end*(lengthHalf-.014),y,z,.036,rh-.025,cw-.025,m.metal);
    slab(end*(lengthHalf+.007),y+rh*.12,z,.008,.035,cw*.6,m.dark);
    if((r+c)%3===0)slab(end*(lengthHalf+.007),y-rh*.17,z+cw*.19,.008,.035,cw*.19,m.paper);
   }
  }break;
 }
 case 'stacks':{
  const shelves=Math.max(2,Math.min(5,Math.round(h/.47))),bay=(h-.12)/shelves;
  for(const side of [-1,1])for(const end of [-1,1])slab(end*(lengthHalf-.035),h/2,side*(depthHalf-.03),.07,h,.06,m.trim);
  for(let r=0;r<=shelves;r++)slab(0,.05+r*bay,0,length,.055,depth,m.metal);
  const cols=Math.max(2,Math.min(10,Math.round(length/.35))),w=(length-.16)/cols;
  for(let r=0;r<shelves;r++)for(let c=0;c<cols;c++){
   if((r*5+c)%9===2)continue;
   const x=(c+.5-cols/2)*w,bh=bay*(.62+.08*((r+c)%3));
   slab(x,.08+r*bay+bh/2,0,w-.026,bh,depth*.85,(2*r+c)%4?m.wood:m.green);
   for(const side of [-1,1])slab(x,.08+r*bay+bh*.61,side*(depth*.425+.007),w*.48,.045,.012,m.paper);
  }break;
 }
 case 'record-rack':{
  const rows=4,columns=Math.max(2,Math.round(length/.73)),span=(length-.14)/columns,step=(h-.15)/rows;
  slab(0,h*.5,0,length-.09,h-.1,.075,m.dark);
  for(let c=0;c<=columns;c++){
   const x=-lengthHalf+.07+c*span;
   if(c%3&&c!==columns)continue;
   for(const side of [-1,1])slab(x,h/2,side*(depthHalf-.038),.065,h,.063,m.oxide);
  }
  for(let r=0;r<=rows;r++)slab(0,.104+r*step,0,length,.052,depth,m.metal);
  for(const side of [-1,1])for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){
   const kind=(r*11+c*7+side+Math.round(cx+2*cz)+2)%11;
   if(kind===1)continue;
   const x=-lengthHalf+.07+(c+.5)*span,y=.132+r*step;
   const height=step*(kind<3?.31:.54+.07*(kind%5)),thickness=depth*(kind<3?.3:.37);
   const width=span*(.72+.04*(kind%4)),z=side*(.052+thickness/2);
   slab(x,y+height/2,z,width,height,thickness,kind===5?m.green:m.cardboard);
   slab(x,y+height*.92,z,width+.026,.033,thickness+.023,m.wood);
   if(kind!==6)slab(x-span*.13,y+height*.49,z+side*(thickness/2+.005),span*(kind===8?.18:.31),.049,.012,m.paper);
  }
  break;
 }
 case 'receiving-chute':{
  legs(.97);
  slab(0,.44,0,length-.13,.058,depth-.13,m.oxide);
  slab(0,.94,0,length,.085,depth,m.metal);
  slab(0,1.065,front*(depthHalf-.038),length-.09,.17,.073,m.green);
  for(const end of [-1,1])slab(end*(lengthHalf-.106),.70,-front*(depthHalf-.12),.17,.51,.12,m.trim);
  break;
 }
 case 'sorting-bench':
 case 'dispatch-scale':{
  const level=.89;
  legs(level);slab(0,.54,0,length-.14,.075,depth*.6,m.oxide);
  slab(0,level,0,length,.098,depth,m.wood);
  slab(0,level-.11,front*(depthHalf-.047),length-.07,.15,.082,m.green);
  for(const [n,offset] of [-.34,-.11,.24].entries()){
   const x=length*offset;
   slab(x,.63,0,.57,.13,depth*.5,m.oxide);
   if(p.name==='dispatch-scale'&&n===1){
    slab(x,.99,0,.83,.105,depth*.7,m.trim);
    slab(x,1.065,front*depth*.10,.88,.038,depth*.55,m.oxide);
    slab(x,1.185,-front*depth*.21,.3,.28,.14,m.green);
    const face=-front*depth*.21+.081;
    drum(x,1.205,face,.108,.041,m.trim);
    drum(x,1.205,face+.024,.087,.012,m.cream);
    slab(x+.016,1.227,face+.032,.019,.065,.008,m.red);
   }else{
    slab(x,.965,-front*depth*.13,.52,.041,depth*.52,m.cardboard);
    slab(x+.045,1.001,-front*depth*.09,.42,.025,depth*.45,m.paper);
    slab(x+.01,1.023+n*.004,-front*depth*.07,.34,.019,depth*.43,m.cream);
    slab(x-.09,1.04+n*.006,-front*depth*.035,.19,.018,depth*.33,m.paper);
   }
  }
  slab(length*.387,1.058,front*depth*.18,.36,.238,depth*.48,m.cardboard);
  slab(length*.387,1.10,front*depth*.42,.12,.068,.013,m.paper);
  break;
 }
 case 'hospital-bed':{
  buildHospitalBed(p,front>0?yaw:yaw+Math.PI,queue,m);break;
 }
 case 'counter':{
  slab(0,h*.31,0,length,h*.62,depth-.07,m.green);slab(0,h*.64,0,length,h*.055,depth,m.cream);
  for(const end of [-1,1])slab(end*(lengthHalf-.045),h*.80,-front*depth*.33,.075,h*.4,.075,m.metal);
  slab(0,h*.92,-front*depth*.33,length,h*.15,depth*.37,m.metal);
  const n=Math.max(2,Math.min(6,Math.floor(length/.6)));for(let i=0;i<n;i++)slab((i+.5-n/2)*length/n,h*.684,front*depth*.18,length/n*.7,.024,depth*.36,m.trim);
  // An enamel thermos left uncapped on the serving hatch.
  drum(-length*.31,h*.69+.20,front*depth*.17,.13,.39,m.cream,true);
  drum(-length*.31,h*.69+.41,front*depth*.17,.084,.035,m.metal,true);
  drum(-length*.18,h*.69+.045,front*depth*.26,.093,.085,m.green,true);
  break;
 }
 case 'boiler':{
  const n=Math.max(1,Math.min(4,Math.round(length/depth))),span=length/n,r=Math.min(span,depth)*.43;
  for(let i=0;i<n;i++){const x=(i+.5-n/2)*span;
   drum(x,h*.50,0,r,h*.85,m.green,true);for(const y of [.13,.64,.9])drum(x,h*y,0,r*1.035,.07,m.metal,true);
   drum(x,h*.78,front*r,.14,.065,m.cream);slab(x,h*.79,front*(r+.04),.025,.13,.014,m.dark);
   drum(x,h*.96,0,r*.25,h*.08,m.trim,true);
  }break;
 }
 case 'display-case':{
  slab(0,h*.29,0,length,h*.58,depth,m.wood);slab(0,h*.605,0,length,.055,depth,m.cream);
  for(const end of [-1,1])for(const side of [-1,1])slab(end*(lengthHalf-.035),h*.8,side*(depthHalf-.035),.06,h*.4,.06,m.metal);
  slab(0,h*.975,0,length,h*.05,depth,m.wood);
  for(let i=-1;i<=1;i++){slab(i*length*.28,h*.64,0,length*.14,.035,depth*.56,m.red);slab(i*length*.28,h*.655,0,length*.13,.025,depth*.50,m.paper);}break;
 }
 case 'bench':{
  const seats=Math.max(2,Math.min(7,Math.round(length/.66))),w=length/seats;
  slab(0,h*.30,0,length*.94,.1,.12,m.metal);legs(h*.38);
  for(let i=0;i<seats;i++){const x=(i+.5-seats/2)*w;
   slab(x,h*.43,0,w-.055,h*.13,depth*.91,m.green);
   if(i===seats-1&&seats>2){
    for(const end of [-1,1])slab(x+end*w*.31,h*.62,-front*(depthHalf-.085),.05,h*.55,.05,m.metal);
    slab(x,h*.52,0,w*.32,.045,depth*.94,m.wood);
    slab(x,h*.31,front*(depthHalf-.024),w*.30,h*.41,.034,m.wood);
    for(const end of [-1,1])slab(x+end*w*.093,h*.095,front*(depthHalf-.024),.035,h*.12,.033,m.wood);
   }else slab(x,h*.74,-front*(depthHalf-.085),w-.055,h*.51,.11,m.green);
  }for(const end of [-1,1])slab(end*(lengthHalf-.042),h*.64,0,.07,.06,depth*.79,m.metal);break;
 }
 case 'projector':{
  legs(h*.45);slab(0,h*.46,0,length,.085,depth,m.wood);
  slab(0,h*.63,0,length*.48,h*.28,depth*.5,m.trim);
  const r=Math.min(length*.125,h*.14);for(const end of [-1,1]){drum(end*length*.13,h*.84,0,r,.106,m.metal);drum(end*length*.13,h*.84,front*.06,r*.36,.02,m.dark);}
  drum(0,h*.66,front*depth*.29,Math.min(depth*.12,.13),depth*.16,m.metal);break;
 }
 case 'school-desk':{
  const n=Math.max(1,Math.min(6,Math.round(length/1.05))),w=length/n;
  for(let i=0;i<n;i++){const x=(i+.5-n/2)*w;
   for(const end of [-1,1])for(const side of [-1,1])slab(x+end*w*.39,h*.45,side*depth*.35,.07,h*.9,.07,m.metal);
   slab(x,h*.82,0,w*.88,h*.17,depth*.7,m.trim);slab(x,h*.96,0,w-.035,h*.08,depth,m.wood);
  }break;
 }
 default:return false;
 }
 return true;
}

// Sample only solid lengths of the outside wall: frames never cover doors, portraits or return passages.
function dressSceneWalls(f,wing,box,m,queue){
 const {bounds:r,theme}=wing;
 const upright=r.d>r.w,length=upright?r.d:r.w,depth=upright?r.w:r.d;
 const midX=r.x+r.w/2,midZ=r.z+r.d/2;
 const face=(u,v)=>({x:midX+(upright?v:u),z:midZ+(upright?u:v)});
 const remoteSpeakers=(f.interactions||[]).filter(i=>i.mechanism==='intercom').map(i=>i.noise);
 const protectedPoints=[...(f.interactions||[]),...(f.doorSpecs||[]),...remoteSpeakers,f.quietSite,tenantWalls[f.id]].filter(Boolean);
 const count=Math.max(1,Math.floor(length/6.3)),span=Math.min(4.8,length/count-1.4);let draped=false,chipped=false;
 for(const side of [-1,1])for(let i=0;i<count;i++){
  const start=(i+.5-count/2)*length/count,normal=side*depth/2,center=face(start,normal);
  if(protectedPoints.some(p=>Math.abs(upright?p.x-center.x:p.z-center.z)<1.1&&Math.abs(upright?p.z-center.z:p.x-center.x)<span/2+.8))continue;
  let solid=true;
  for(let u=-span/2;u<=span/2+.01;u+=span/8){
   const outside=face(start+u,normal+side*.2);
   if(f.walkableRects.some(rect=>within(outside,rect))){solid=false;break;}
  }
  if(!solid)continue;
  let observationBay=false;
  if(!chipped&&m.plasterLoss&&(i+f.id)%2===0){
   const a=face(start,normal-side*.113),g=new T.PlaneGeometry(Math.min(3.75,span),1.17);
   g.rotateY((upright?Math.PI/2:0)+(side>0?Math.PI:0));g.translate(a.x,.72,a.z);queue(g,m.plasterLoss);
   chipped=true;
  }
  const panel=(u,y,v,w,h,d,material)=>{const a=face(start+u,normal-side*v);box(a.x,y,a.z,upright?d:w,h,upright?w:d,material);};
  const frame=(y,height,fill)=>{
   panel(0,y,.114,span,height,.044,m.trim);panel(0,y,.141,span-.12,height-.12,.032,fill);
  };
  if((i+f.id+(side>0?1:0))%3===0){
   const s=face(start+side*span*.19,normal-side*.107),g=new T.PlaneGeometry(span*.72,2.62),yaw=(upright?Math.PI/2:0)+(side>0?Math.PI:0);
   g.rotateY(yaw);g.translate(s.x,1.63,s.z);queue(g,m.watermark);
  }
  if(['boiler','laundry'].includes(theme)){
   for(const y of [2.37,2.60])panel(0,y,.16,span,.083,.098,m.metal);
   for(const end of [-1,1]){panel(end*span*.40,2.49,.18,.08,.44,.12,m.trim);panel(end*span*.40,2.49,.253,.12,.33,.04,m.metal);}
   if(theme==='laundry'){frame(1.50,.82,m.tile);for(let j=-2;j<=2;j++)panel(j*span*.175,1.50,.17,.022,.7,.02,m.metal);}
  }else if(['mail','clinic','waiting'].includes(theme)){
   frame(2.16,1.12,m.glass);
   if(wing===f.scenes.find(sc=>['clinic','waiting','mail'].includes(sc.theme))&&side===-1&&!m.wiredWindow.userData.placed){
    const a=face(start,normal-side*.164),g=new T.PlaneGeometry(span-.12,1);
    g.rotateY(upright?Math.PI/2:0);g.translate(a.x,2.16,a.z);queue(g,m.wiredWindow);m.wiredWindow.userData.placed=true;
    if(f.id===4){
     observationBay=true;
     m.wiredWindow.userData.face=face(start+(upright?-1:1)*.092*(span-.12),normal-side*.25);
    }
   }
   for(let j=-2;j<=2;j++)panel(j*span*.18,2.16,.184,.047,.99,.033,m.metal);
   panel(0,1.95,.179,span-.1,.045,.045,m.metal);panel(0,1.57,.18,span+.07,.055,.18,m.cream);
   if(theme==='clinic'){panel(0,1.39,.13,span,.10,.048,m.cream);for(let j=-1;j<=1;j++)panel(j*span*.36,1.39,.163,.17,.062,.022,m.metal);}
  }else if(theme==='canteen'){
   frame(1.7,1.58,m.metal);for(let j=0;j<10;j++)panel(0,1.04+.15*j,.165,span-.14,.027,.04,m.trim);
   panel(0,.88,.18,span+.1,.09,.22,m.cream);
  }else if(theme==='classroom'||theme==='projection'){
   frame(1.81,1.62,theme==='projection'?m.screen:m.chalk);panel(0,1.00,.18,span,.05,.18,m.wood);
   if(theme==='classroom')for(let j=0;j<4;j++)panel(-span*.28+j*.075,1.041,.204,.05,.024,.04,m.paper);
   else{panel(0,2.66,.168,span+.18,.13,.16,m.metal);panel(span*.49,1.82,.16,.02,1.57,.02,m.trim);}
  }else if(theme==='gallery'){
   for(const end of [-1,1]){panel(end*span*.44,1.48,.12,.26,2.94,.055,m.wall);panel(end*span*.44,2.74,.15,.39,.13,.065,m.cream);}
   panel(0,2.83,.126,span,.075,.05,m.cream);
  }else{
   frame(2,.84,m.trim);for(let j=0;j<6;j++)panel(0,1.67+j*.13,.17,span-.15,.065,.042,m.metal);
  }
  // A missing curtain ring leaves the sheet sagging against the old washroom wall.
  if(!draped&&!observationBay&&(theme==='clinic'||theme==='laundry')){
   const w=Math.min(2.4,span*.67),height=theme==='clinic'?1.68:1.26,g=new T.PlaneGeometry(w,height,36,18),p=g.attributes.position;
   const colors=new Float32Array(p.count*3),rings=[0,.14,.50,.67,.84,1];
   for(let n=0;n<p.count;n++){
    const u=T.MathUtils.clamp(p.getX(n)/w+.5,0,1),v=T.MathUtils.clamp(p.getY(n)/height+.5,0,1),fold=Math.cos(u*Math.PI*13+.56*v+Math.sin(u*17));
    const hi=rings.find(r=>r>u)??1,lo=rings[Math.max(0,rings.indexOf(hi)-1)],sag=(hi-lo)*.86*Math.sin(Math.PI*(u-lo)/(hi-lo));
    const a=face(start+(u-.42)*w,normal-side*(.256+(.032+.014*(1-v))*fold));
    p.setXYZ(n,a.x,2.55-(1-v)*height-sag*(.52+.48*v)+.065*fold*(1-v),a.z);
    const stripe=v>.105&&v<.12||v>.212&&v<.23,soil=(1-v)**3*(.5+.5*Math.sin(u*17+.5*Math.cos(v*13)));
    const value=stripe?.48:.90+.05*fold-soil*.39;
    colors.set([value,value*(1-soil*.12),value*(1-soil*.25)],n*3);
   }
   g.setAttribute('color',new T.BufferAttribute(colors,3));g.computeVertexNormals();queue(g,m.linen);panel(w*.08,2.62,.275,w+.29,.046,.045,m.metal);
   for(const u of rings)panel((u-.42)*w,2.58,.272,.024,.11,.04,m.metal);
   draped=true;
  }
 }
}

// A small top-down lightmap supplies indirect light from steady fixtures throughout the wing.
// The five real lights handle nearby direct light, moving shadows of doorways and warnings.
function bakeHallLight(f,fixtures,root,materials){
 if(!f.scenes?.length)return null;
 const {minX,minZ,maxX,maxZ}=f.bounds,step=1,width=Math.ceil((maxX-minX)/step)+1,height=Math.ceil((maxZ-minZ)/step)+1;
 const texels=new Uint8Array(width*height*4);
 const walls=[...(f.boundaries||[]),...(f.partitions||[]).filter(p=>(p.height??3)>1).map(p=>({minX:p.x,maxX:p.x+p.w,minZ:p.z,maxZ:p.z+p.d}))];
 const fixed=fixtures.filter(l=>!l.faulty);
 for(const lamp of fixed){
  const ix=lamp.x-minX,iz=lamp.z-minZ,radius=lamp.guide?7.4:5.8,nearby=f.scenes.find(sc=>within(lamp,sc.bounds));
  for(let j=Math.max(0,Math.floor(iz-radius));j<=Math.min(height-1,iz+radius);j++)for(let i=Math.max(0,Math.floor(ix-radius));i<=Math.min(width-1,ix+radius);i++){
   const dist=Math.hypot(i-ix,j-iz);if(dist>=radius)continue;
   const sample={x:minX+i,z:minZ+j};
   if(!clearSight(lamp,sample,walls))continue;
   const edge=nearby?.bounds;
   const beyond=edge?Math.hypot(Math.max(edge.x-sample.x,sample.x-edge.x-edge.w,0),Math.max(edge.z-sample.z,sample.z-edge.z-edge.d,0)):0;
   const spill=1-T.MathUtils.smoothstep(beyond,1.5,3.5);
   const power=Math.round((1-dist/radius)**1.3*spill*lamp.output*235),k=(j*width+i)*4;
   texels[k]=Math.max(texels[k],power);texels[k+1]=Math.max(texels[k+1],Math.round(power*.96));texels[k+2]=Math.max(texels[k+2],Math.round(power*.80));texels[k+3]=255;
  }
 }
 const texture=new T.DataTexture(texels,width,height);texture.channel=1;texture.minFilter=texture.magFilter=T.LinearFilter;texture.needsUpdate=true;
 const baked=new Set(materials.filter(m=>m.isMeshStandardMaterial)),point=new T.Vector3();root.updateMatrixWorld(true);
 root.traverse(object=>{
  if(!object.isMesh||!baked.has(object.material))return;
  for(let parent=object;parent;parent=parent.parent)if(parent.userData.sharedModel)return;
  const geometry=object.geometry,vertices=geometry.attributes.position,uv=new Float32Array(vertices.count*2);
  for(let n=0;n<vertices.count;n++){point.fromBufferAttribute(vertices,n).applyMatrix4(object.matrixWorld);uv[2*n]=(point.x-minX+.5)/width;uv[2*n+1]=(point.z-minZ+.5)/height;}
  geometry.setAttribute('uv1',new T.BufferAttribute(uv,2));
  object.material.lightMap=texture;
 });
 return texture;
}

// A slot is never moved while it is emitting. Hysteresis keeps nearly tied lamps from trading places.
function updateLightSlots(slots,fixtures,dt,circuit){
 const candidates=fixtures.filter(f=>f.score>.0001).sort((a,b)=>b.score*(b.bound?1.2:1)-a.score*(a.bound?1.2:1));
 const preferred=new Set(candidates.slice(0,slots.length)),waiting=candidates.slice(0,slots.length).filter(l=>!l.bound);
 for(const slot of slots){
  const {light}=slot;let l=slot.owner;
  if(l&&!preferred.has(l)){
   slot.lostFor+=dt;
   if(slot.lostFor>=.12||l.visibility<.03)slot.gain=Math.max(0,slot.gain-dt/.18);
   if(slot.gain<=0){light.intensity=0;l.bound=false;slot.owner=null;continue;}
  }else{slot.lostFor=0;slot.gain=Math.min(1,slot.gain+dt/.18);}
  if(!l){
   l=waiting.shift();if(!l){light.intensity=0;continue;}
   slot.owner=l;l.bound=true;slot.gain=Math.min(1,dt/.18);slot.lostFor=0;
   light.position.set(l.x,l.y-.3,l.z);light.distance=l.distance??(l.room?7:8.5);
  }
  if(l.dynamic)light.position.set(l.x,l.y-.3,l.z);
  light.color.setHex(l.tint);light.intensity=l.power*(l.independent?1:circuit)*slot.gain*l.visibility*l.range*(l.intensity??(l.guide?22:19));
 }
}

function floorLightRay(x,z,dx,dz,length,b){
 let near=0,far=length;
 if(Math.abs(dx)<1e-8){if(x<b.minX||x>b.maxX)return length;}
 else{const a=(b.minX-x)/dx,c=(b.maxX-x)/dx;near=Math.max(near,Math.min(a,c));far=Math.min(far,Math.max(a,c));}
 if(Math.abs(dz)<1e-8){if(z<b.minZ||z>b.maxZ)return length;}
 else{const a=(b.minZ-z)/dz,c=(b.maxZ-z)/dz;near=Math.max(near,Math.min(a,c));far=Math.min(far,Math.max(a,c));}
 return far>=near?Math.max(0,near-.035):length;
}

export function patrolCircuitPower(threat,blackout,reduced){
 if(!['patrol','rush'].includes(threat?.kind))return blackout?0:1;
 const {phase,elapsed,duration}=sweepTiming(threat);
 if(phase==='sweeping')return 0;
 if(phase==='leaving')return T.MathUtils.smoothstep(elapsed,0,duration);
 if(phase==='between')return .18;
 if(reduced)return (phase==='return-warning'?.65:1)*(1-T.MathUtils.smoothstep(elapsed,0,duration));
 const contact=Math.floor(elapsed*3)%2?.19:1;
 return contact*(1-T.MathUtils.smoothstep(elapsed,duration-.28,duration));
}

export function visitorLightBlend(threat,reduced){
 if(threat?.kind!=='yujie')return 0;
 const reveal=T.MathUtils.smoothstep(threat.age,threat.warning-(reduced?.85:.48),threat.warning+(reduced?.42:.18));
 return reveal*(1-T.MathUtils.smoothstep(threat.retreat??0,0,1.3));
}

// A diffuse impression behind wired glass. The pane is lit and loses its figure when the power cuts.
function serviceWindow(vacant=false){
 const w=256,h=96,bytes=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=x/w,v=y/h,dx=(u-.592)*3.8,head=Math.hypot((dx-.022)/.112,(v-.56)/.133);
  const shoulders=Math.hypot((dx+.068)/.285,(v-.13)/.33),shadow=1-T.MathUtils.smoothstep(Math.min(head,shoulders),.76,1.22);
  const wire=(n)=>Math.min(n%12,12-n%12)<1.1;
  const grain=Math.sin(x*91.43+y*34.81)*7+Math.sin(x*.13+Math.sin(y*.035))*(2+4*(1-v));
  let fog=0;
  if(vacant){
   // Greasy contact marks stay on the player's side of the mesh once the figure is gone.
   const palm=Math.hypot((dx-.014)/.112,(v-.37)/.109);
   fog=(1-T.MathUtils.smoothstep(palm,.58,1.12))*16;
   for(let i=0;i<4;i++){
    const finger=Math.hypot((dx+.060-i*.048)/.020,(v-.49-Math.sin(i)*.027)/.083);
    fog+=11*(1-T.MathUtils.smoothstep(finger,.60,1.08));
   }
  }
  const light=Math.max(0,92+v*43+12*Math.cos((u-.16)*4.6)-(vacant?fog:shadow*76)+grain-(wire(x)||wire(y)?18:0)),k=(y*w+x)*4;
  bytes[k]=light*.83;bytes[k+1]=light;bytes[k+2]=light*.96;bytes[k+3]=255;
 }
 const texture=new T.DataTexture(bytes,w,h);texture.colorSpace=T.SRGBColorSpace;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}

function dampPlaster(){
 const w=128,h=192,bytes=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=x/w,v=y/h,grain=Math.sin(91.43*x+34.81*y)*.5+.5;
  const edge=Math.max(0,1-Math.abs(u*2-1)**2),seam=.87-.19*Math.sin(7*u)**2-.11*Math.sin(19*u+.6)**4;
  const runoff=(.17+Math.sin(u*44+.04*Math.sin(v*7))**16*.46)*edge;
  const wet=T.MathUtils.smoothstep(v,seam-runoff,seam+.03)*(1-T.MathUtils.smoothstep(v,.92,1));
  const contour=(v-seam+runoff*.73)*34,tide=Math.exp(-contour*contour)*.44;
  const k=(y*w+x)*4;bytes[k]=87+grain*12;bytes[k+1]=78+grain*11;bytes[k+2]=60+grain*10;bytes[k+3]=(wet*.57+tide)*edge*(.56+grain*.44)*235;
 }
 const texture=new T.DataTexture(bytes,w,h);texture.colorSpace=T.SRGBColorSpace;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}

// Steel feet gouged the lino as the sorting island turned. Dust builds up along the outside edges.
function cabinetScrapes(){
 const w=384,h=192,bytes=new Uint8Array(w*h*4),smooth=T.MathUtils.smoothstep;
 for(let x=0;x<w;x++){
  const u=x/(w-1),bend=.22*(1-u)**2+.062*Math.sin(u*Math.PI*1.4);
  for(let y=0;y<h;y++){
   const v=y/(h-1),k=(y*w+x)*4,grain=.5+.5*Math.sin(x*91.43+y*34.81);
   for(const side of [-1,1]){
    const center=.50+side*(.16+.13*u)+bend+.0019*Math.sin(u*62+side);
    const d=(v-center)*3.1,width=.055+.018*Math.sin(u*24+side),offset=Math.abs(d);
    if(offset>width+.040)continue;
    const edge=1-smooth(Math.abs(d-side*width),.004,.028),cut=1-smooth(offset,width*.25,width+.012);
    const rim=edge*(.19+.81*smooth(Math.sin(u*39+side)+.6*Math.sin(u*67),-.4,.75));
    const fade=smooth(u,side<0?.08:.01,side<0?.20:.075)*(.025+.975*smooth(Math.sin(u*43+side)+Math.cos(u*24+side*.9),-.68,.42));
    bytes[k]=43+rim*117+grain*14;bytes[k+1]=39+rim*106+grain*13;bytes[k+2]=31+rim*88+grain*10;
    bytes[k+3]=Math.max(rim*.85,cut*.89)*fade*(.55+grain*.45)*255;
   }
  }
 }
 const texture=new T.DataTexture(bytes,w,h);texture.colorSpace=T.SRGBColorSpace;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;return texture;
}

export function createCampaignWorld(scene,assets,f,state,models={}){
 const root=new T.Group();root.name=`campaign-${f.id}`;root.position.y=f.base;scene.add(root);
 const materials=[],textures=[],labels=[],doors=[],interactables=[],fixtures=[],stairGroups=[],records=[],vaults=[],curtains=[];
 const grayscale=new Map();let batches=new Map(),container=root;
 const mat=(color,map=null,roughness=.95)=>{const m=new T.MeshStandardMaterial({color,map,roughness,metalness:0});materials.push(m);return m;};
 const mats={wall:mat(0xaaa694,painted('wall')),lower:mat(0x556255,painted('wall')),floor:mat(0x838879,painted('floor')),ceiling:mat(0x687166,painted('wall')),wood:mat(0x75644e,painted('wood')),metal:mat(0x606b64,null,.65),trim:mat(0x263b31),dark:mat(0x111a17),paper:mat(0xd0c6a4),cream:mat(0xc4c1ae),red:mat(0x793e32),green:mat(0x63705b)};
 Object.assign(mats,{tile:mat(0xa1b4b1,painted('floor')),glass:mat(0x849b8a,painted('wall'),.53),chalk:mat(0x384c45),screen:mat(0xb3ad99,painted('wall'))});
 mats.glass.emissive.setHex(0x0c1413);
 if(f.scenes?.length){
  mats.watermark=mat(0xffffff,surfaceMaps.damp??=dampPlaster());mats.watermark.transparent=true;mats.watermark.depthWrite=false;
  mats.plasterLoss=mat(0xffffff,surfaceMaps.plasterLoss??=blisteredPlaster());mats.plasterLoss.transparent=true;mats.plasterLoss.depthWrite=false;
 }
 mats.linen=mat(0xa3a59a);mats.linen.side=T.DoubleSide;mats.linen.vertexColors=true;
 if(f.belongings?.length||f.furniture?.some(p=>p.name==='hospital-bed')){
  mats.cardboard=mat(0xbbad96,surfaceMaps.pulp??=wornSurface(false));
  mats.oxide=mat(0xa49981,surfaceMaps.iron??=wornSurface(true),.80);
 }
 if(f.scenes?.some(s=>['clinic','waiting','mail'].includes(s.theme)))mats.wiredWindow=mat(0xb3c0b8,f.id===8?(surfaceMaps.emptyPane??=serviceWindow(true)):(surfaceMaps.occupiedPane??=serviceWindow()),.71);
 const basic=(color,extra={})=>{const m=new T.MeshBasicMaterial({color,...extra});materials.push(m);return m;};
 const flatPaints=new Set([mats.trim,mats.dark,mats.paper,mats.cream,mats.red,mats.green,mats.chalk]);
 const paintedBatch=mat(0xffffff);paintedBatch.vertexColors=true;
 function queue(g,m){
  if(flatPaints.has(m)){
   const colors=new Float32Array(g.attributes.position.count*3);
   for(let i=0;i<colors.length;i+=3)m.color.toArray(colors,i);
   g.setAttribute('color',new T.BufferAttribute(colors,3));m=paintedBatch;
  }else if(m.vertexColors&&!g.hasAttribute('color'))g.setAttribute('color',new T.BufferAttribute(new Float32Array(g.attributes.position.count*3).fill(1),3));
  if(!batches.has(m))batches.set(m,[]);batches.get(m).push(g);
 }
 function alignSurfaceUV(g,m){
  if(!m.map)return;
  const p=g.attributes.position,n=g.attributes.normal,u=g.attributes.uv;
  for(let i=0;i<p.count;i++)u.setXY(i,(Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i))*.6,(Math.abs(n.getY(i))>.5?p.getZ(i):p.getY(i))*.6);
 }
 function box(x,y,z,w,h,d,m=mats.wall,rotation=0){const g=new T.BoxGeometry(w,h,d);g.rotateY(rotation);g.translate(x,y,z);alignSurfaceUV(g,m);queue(g,m);}
 function flush(){for(const [m,parts]of batches){const merged=mergeGeometries(parts);parts.forEach(g=>g.dispose());if(merged)container.add(new T.Mesh(merged,m));}batches.clear();}
 function wall(x,z,w,d,height=3){if(height<2){box(x,height/2,z,w,height,d,mats.lower);return;}box(x,.67,z,w,1.34,d,mats.lower);box(x,(height+1.34)/2,z,w,height-1.34,d,mats.wall);box(x,.07,z,w+.012,.14,d+.012,mats.trim);box(x,1.36,z,w+.016,.035,d+.016,mats.wood);}
 function label(lines,{bg='#24362c',color='#ddd7bf',width=512,height=192,blur=0}={}){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.userData.campaignPrint=true;
  texture.userData.redraw=()=>{const value=typeof lines==='function'?lines():lines;ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';if(blur)ctx.filter=`blur(${blur}px)`;value.forEach((s,n)=>{const size=value.length===1?height*.5:n?height*.19:height*.36;ctx.font=`${size}px "Arial", "Microsoft YaHei", sans-serif`;ctx.fillText(tr(String(s)),width/2,height*(value.length===1?.52:n?.78:.36),width*.9);});if(blur)ctx.filter='none';texture.needsUpdate=true;};texture.userData.redraw();textures.push(texture);labels.push(texture);return texture;
 }
 function print(parent,x,y,z,w,h,lines,yaw=0,options){const texture=label(lines,options),material=mat(0xffffff,texture);const mesh=new T.Mesh(new T.PlaneGeometry(w,h),material);mesh.position.set(x,y,z);mesh.rotation.y=yaw;parent.add(mesh);return mesh;}
 function mesh(parent,geometry,material,x,y,z,target){const o=new T.Mesh(geometry,material);o.position.set(x,y,z);parent.add(o);if(target){o.userData.target=target;interactables.push(o);}return o;}
 function placedBox(group,x,y,z,w,h,d,m){const yaw=group.rotation.y,c=Math.cos(yaw),s=Math.sin(yaw);box(group.position.x+c*x+s*z,y,group.position.z-s*x+c*z,w,h,d,m,yaw);}
 function tag(o,id){o.userData.target=id;interactables.push(o);return o;}
 function blockBounds(b,m=mats.floor){box((b.minX+b.maxX)/2,(b.minY+b.maxY)/2-f.base,(b.minZ+b.maxZ)/2,b.maxX-b.minX,b.maxY-b.minY,b.maxZ-b.minZ,m);}

 // A union of layout rectangles gives each floor and ceiling exactly one face at every point.
 const surfaces=f.surfaceRects||f.walkableRects;
 const photoPool=[assets.laodaPortrait,assets.floorCixi,assets.floorSun,assets.floorThunder];
 if(f.doorSpecs&&f.walkableRects&&photoPool.every(Boolean)){
  const photos=scatterFloorPhotos(f,state.photoSeed);
  photoPool.forEach((texture,n)=>{
   const batch=photos.filter(p=>p.variant===n);if(!batch.length)return;
   const prints=createPhotoTrail(texture,batch,n>=2);
   root.add(prints);materials.push(prints.material);
  });
 }
 for(const r of surfaces){
  const x=r.x+r.w/2,z=r.z+r.d/2;
  box(x,-.08,z,r.w,.16,r.d,mats.floor);box(x,3.08,z,r.w,.16,r.d,mats.ceiling);
 }
 const sortingIsland=f.id===8&&f.furniture?.find(p=>p.name==='mailboxes'&&p.d>p.w);
 if(sortingIsland){
  if(mats.oxide)hangPorterCoat(sortingIsland,{box,queue,m:mats});
  const rubbed=mat(0xffffff,surfaceMaps.scrapes??=cabinetScrapes());
  rubbed.transparent=true;rubbed.depthWrite=false;rubbed.polygonOffset=true;rubbed.polygonOffsetFactor=-1;rubbed.polygonOffsetUnits=-1;
  const length=5.6,panel=new T.PlaneGeometry(length,3.1);panel.rotateX(-Math.PI/2);
  const trace=mesh(root,panel,rubbed,sortingIsland.x+.06-length/2,.003,sortingIsland.z+sortingIsland.d/2);
  trace.name='mailbox-drag-marks';
 }
 const wallRuns=new Map(),shadowSurfaces=[];
 function wallRun(x,z,w,d,height=3){const vertical=d>w,constant=vertical?x+w/2:z+d/2,thickness=vertical?w:d,start=vertical?z:x,end=start+(vertical?d:w),key=[Number(vertical),constant,thickness,height].map(n=>n.toFixed(5)).join(':');if(!wallRuns.has(key))wallRuns.set(key,{vertical,constant,thickness,height,spans:[]});wallRuns.get(key).spans.push([start,end]);}
 for(const b of f.boundaries||[])wallRun(b.minX,b.minZ,b.maxX-b.minX,b.maxZ-b.minZ,b.height??3);
 for(const p of f.partitions||[]){
  if(p.material==='wire-window'){
   const x=p.x+p.w/2,z=p.z+p.d/2,h=p.lintel-p.sill;
   wallRun(p.x,p.z,p.w,p.d,p.sill);box(x,(3+p.lintel)/2,z,p.w,3-p.lintel,p.d,mats.wall);
   for(const y of [p.sill,p.lintel])box(x,y,z,p.w+.02,.08,p.d+.06,mats.metal);
   const posts=Math.ceil(p.w/2.2);
   for(let j=0;j<=posts;j++)box(p.x+.035+(p.w-.07)*j/posts,p.sill+h/2,z,.064,h,p.d+.025,mats.trim);
   // Short pieces of welded wire share the hardware batch. Air between the wires is visible from either side.
   for(let y=p.sill+.23;y<p.lintel;y+=.235)box(x,y,z,p.w,.014,.016,mats.metal);
   for(let u=.22;u<p.w;u+=.285)box(p.x+u,p.sill+h/2,z,.014,h,.016,mats.metal);
  }else if(p.material!=='hanging-cloth')wallRun(p.x,p.z,p.w,p.d,p.height??3);
 }
 // Shared room partitions and subdivided perimeter segments are one physical wall.
 for(const run of wallRuns.values()){
  const spans=run.spans.sort((a,b)=>a[0]-b[0]);let start=spans[0][0],end=spans[0][1];
  const draw=()=>{
   const x=run.vertical?run.constant:(start+end)/2,z=run.vertical?(start+end)/2:run.constant;
   const w=run.vertical?run.thickness:end-start,d=run.vertical?end-start:run.thickness;
   wall(x,z,w,d,run.height);
   if(f.scenes?.length&&run.height>=2.4&&end-start>=1.55)shadowSurfaces.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2});
  };
  for(let i=1;i<spans.length;i++){if(spans[i][0]<=end+.00001)end=Math.max(end,spans[i][1]);else{draw();[start,end]=spans[i];}}draw();
 }

 // Worn ceramic corner guards catch the light at the open ends of aisle dividers.
 for(const p of f.partitions||[]){
  if(!f.scenes?.length||Math.max(p.w,p.d)<3)continue;
  const alongX=p.w>p.d,half=(alongX?p.w:p.d)/2;
  for(const side of [-1,1]){
   const x=p.x+p.w/2+(alongX?side*(half-.06):0),z=p.z+p.d/2+(alongX?0:side*(half-.06));
   const wing=f.scenes.find(sc=>within({x,z},sc.bounds));if(!wing)continue;
   const r=wing.bounds;if(x-r.x<.4||r.x+r.w-x<.4||z-r.z<.4||r.z+r.d-z<.4)continue;
   box(x,.86,z,alongX?.13:p.w+.026,1.64,alongX?p.d+.026:.13,mats.metal);
   box(x,1.32,z,alongX?.145:p.w+.038,.34,alongX?p.d+.038:.145,mats.cream);
  }
 }
 // Ceiling bays mark the transition between halls, clear of every door and anomaly.
 for(const scene of f.scenes||[]){
  const r=scene.bounds;dressSceneWalls(f,scene,box,mats,queue);
  if(['boiler','archive','laundry','projection'].includes(scene.theme)){
   for(const offset of [.25,.75])box(r.x+r.w*offset,2.91,r.z+r.d/2,.24,.18,r.d-.3,mats.metal);
  }else if(['waiting','gallery','clinic'].includes(scene.theme)){
   for(const side of [-1,1])box(r.x+r.w/2,2.88,r.z+r.d/2+side*r.d*.34,r.w-.3,.24,.24,mats.ceiling);
  }
 }
 // Recessed service lights give the next opening a silhouette even outside the five moving light pools.
 const portalLight=basic(0xd7ce99),spill=basic(0xffffff,{vertexColors:true,transparent:true,blending:T.AdditiveBlending,depthWrite:false});
 const glowPositions=[],glowColors=[],glowIndices=[];
 for(const passage of f.scenePassages||[]){
  const alongZ=passage.axis==='z';
  const length=alongZ?passage.d:passage.w,width=alongZ?passage.w:passage.d;
  const originX=passage.x+passage.w/2,originZ=passage.z+passage.d/2;
  const xyz=(u,y,v)=>alongZ?[originX-v,y,originZ+u]:[originX+u,y,originZ+v];
  const frameBox=(u,y,v,w,h,d,m)=>box(...xyz(u,y,v),alongZ?d:w,h,alongZ?w:d,m);
  for(const side of [-1,1]){
   const u0=side*length/2;
   frameBox(u0,2.83,0,.31,.34,width,mats.metal);frameBox(u0+side*.16,2.79,0,.028,.068,width*.74,portalLight);
   for(const edge of [-1,1]){frameBox(u0,1.42,edge*(width/2-.035),.27,2.84,.07,mats.metal);frameBox(u0+side*.15,1.31,edge*(width/2-.035),.025,.22,.08,mats.cream);}
   const nx=10,nz=10,base=glowPositions.length/3;
   for(let xi=0;xi<=nx;xi++)for(let zi=0;zi<=nz;zi++){
    const u=xi/nx,v=zi/nz*2-1,intensity=.115*(1-u)**2*(1-v*v)**2;
    glowPositions.push(...xyz(u0+side*(.02+u*3.5),.009,v*width*(.5+u*.45)));
    glowColors.push(intensity,intensity*.81,intensity*.46);
    if(xi<nx&&zi<nz){const a=base+xi*(nz+1)+zi,b=a+nz+1;if(side>0)glowIndices.push(a,a+1,b,b,a+1,b+1);else glowIndices.push(a,b,a+1,b,b+1,a+1);}
   }
  }
 }
 if(glowPositions.length){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(glowPositions,3));g.setAttribute('color',new T.Float32BufferAttribute(glowColors,3));g.setIndex(glowIndices);const pools=mesh(root,g,spill,0,0,0);pools.userData.thresholdLighting=true;}

 for(const d of state.doors||[]){
  if(d.kind==='isolation-gate'){
   const frame=new T.Group(),panel=new T.Group(),w=d.width;
   frame.position.set(d.x,0,d.z);frame.rotation.y=d.angle;root.add(frame);frame.add(panel);
   const dm=mat(d.id===f.exitGateId?0x284963:0x536254,null,.78);
   const leaf=part(panel,dm,[[0,1.29,0,w-.025,2.58,.14]],d.id);
   part(panel,mats.metal,Array.from({length:15},(_,i)=>[0,.13+i*.165,0,w-.054,.026,.17]),d.id);
   part(frame,mats.trim,[[0,2.73,0,w+.21,.28,.32],[-w/2,1.34,0,.14,2.68,.32],[w/2,1.34,0,.14,2.68,.32]]);
   let torn;
   if(d.id===f.gunmuFinale.trap.gateId){
    torn=new T.Group();torn.visible=false;frame.add(torn);
    for(const side of [-1,1]){
     const fold=part(torn,dm,[[0,0,0,.66,.28,.11],[.03,-.18,.08,.46,.094,.14]]);
     fold.position.set(side*(w/2-.24),2.52,-.11);fold.rotation.set(-.25,side*.47,side*.33);
    }
   }
   panel.position.y=(d.amount??Number(d.open))*2.78;
   doors.push({...d,frame,pivot:panel,mesh:leaf,handle:leaf,dm,data:d,shutter:true,torn});
   continue;
  }
  const frame=new T.Group();frame.position.set(d.x,0,d.z);frame.rotation.y=d.angle??(d.axis==='x'?Math.PI/2:0);root.add(frame);const pivot=new T.Group();pivot.position.x=-.95;frame.add(pivot);
  const dm=mat(d.kind==='wood'?0x756149:0x46574c,d.kind==='wood'?painted('wood'):null,.92),leaf=mesh(pivot,new T.BoxGeometry(1.9,2.6,.11),dm,.95,1.3,0,d.id);
  const leverParts=[];
  for(const side of [-1,1])leverParts.push([0,0,side*.084,.075,.073,.064],[-.127,0,side*.128,.285,.049,.054]);
  const handle=part(leaf,mats.metal,leverParts,d.id);handle.position.set(.77,-.08,0);
  if(d.falseDoor){
   const side=-d.inward;
   tag(print(leaf,.02,.57,side*.063,.54,.23,[d.title],side<0?Math.PI:0,{bg:'#243129',color:'#d6c49b',blur:15}),d.id);
   part(frame,mats.trim,[[0,2.78,0,2.14,.36,.24],[-1.01,1.3,0,.12,2.6,.24],[1.01,1.3,0,.12,2.6,.24]]);
   const seal=new T.Group();root.add(seal);
   function panel(y,height,depth,material){
    const geometry=new T.BoxGeometry(2.079,height,depth).translate(d.x,y,d.z);
    alignSurfaceUV(geometry,material);return mesh(seal,geometry,material,0,0,0);
   }
   panel(.67,1.34,.18,mats.lower);
   panel(2.17,1.66,.18,mats.wall);
   panel(1.36,.034,.197,mats.wood);
   panel(.07,.14,.192,mats.trim);
   frame.visible=!d.vanished;seal.visible=!!d.vanished;
   doors.push({...d,frame,seal,pivot,mesh:leaf,handle,dm,data:d});
   continue;
  }
  if(d.chasePush){
   for(const side of [-1,1]){
    tag(print(leaf,0,.56,side*.061,1.21,.27,()=>[getLanguage()==='en'?(d.titleEn||'RECEIVING'):d.title],side<0?Math.PI:0),d.id);
    part(leaf,mats.metal,[[0,-.18,side*.094,1.49,.19,.075]],d.id);
    part(leaf,mats.paper,[[-.48,-.18,side*.135,.35,.09,.009]],d.id);
   }
  }else if(d.roomDoor){
   const title=()=>[(getLanguage()==='en'&&d.titleEn)||d.title];
   for(const side of [-1,1])tag(print(leaf,0,.56,side*.061,1.36,.28,title,side<0?Math.PI:0),d.id);
  }else if(d.routeDoor){
   const title=()=>[(getLanguage()==='en'&&d.titleEn)||d.title];
   tag(print(leaf,0,.56,-.061,1.3,.34,title,Math.PI),d.id);
  }
  else{tag(print(leaf,0,.56,.061,1.3,.34,[d.title||'FIRE DOOR']),d.id);const lock=mesh(leaf,new T.BoxGeometry(.11,.16,.09),mats.metal,.67,-.3,.1);lock.userData.lock=true;}
  doors.push({...d,pivot,mesh:leaf,handle,dm,data:d});
  const axis=d.axis==='x';box(d.x,2.78,d.z,axis?.24:2.14,.36,axis?2.14:.24,mats.trim);for(const side of [-1,1])box(d.x+(axis?0:side*1.02),1.3,d.z+(axis?side*1.02:0),axis?.24:.12,2.6,axis?.12:.24,mats.trim);
  if(d.kind==='wood'){box(d.x,2.63,d.z,axis?.38:2.12,.055,axis?2.12:.38,mats.dark);box(d.x,.012,d.z,axis?.42:1.88,.018,axis?1.88:.42,mats.trim);}
 }

 function part(group,material,shapes,id){
  const pieces=shapes.map(([x,y,z,w,h,d])=>{const piece=new T.BoxGeometry(w,h,d);piece.translate(x,y,z);return piece;});
  const merged=mergeGeometries(pieces);for(const g of pieces)g.dispose();return mesh(group,merged,material,0,0,0,id);
 }
 const mint=mat(0xa4c8b3),energyPaint=mat(0xa16f38),phosphor=basic(0xa4d8b9);
 const cupboardPick=basic(0,{visible:false});
 const wardrobeBulb=f.interactions?.some(i=>i.type==='wardrobe')?mat(0x493225):null,wardrobeWashParts=[];
 if(wardrobeBulb){wardrobeBulb.emissive.setHex(0xffb565);wardrobeBulb.emissiveIntensity=0;}
 function stockPocket(record,kind){
  const pocket=record.pocket;
  // Cache each shape when it first occupies this pocket, so swapping back adds no geometry.
  const variants=record.supplyVariants??=new Map();
  if(variants.has(record.pocketItem))for(const object of variants.get(record.pocketItem))object.visible=false;
  record.pocketItem=kind;
  const existing=variants.get(kind);
  if(existing){for(const object of existing)object.visible=true;return;}
  const start=pocket.children.length;
  if(kind==='mint'){
   part(pocket,mint,[[0,.035,0,.26,.07,.17]],record.i.id);
   part(pocket,mats.paper,[[0,.073,0,.23,.007,.06]],record.i.id);
  }else if(kind==='glowstick'){
   part(pocket,phosphor,[[0,.032,0,.29,.055,.054]],record.i.id);
   part(pocket,mats.metal,[[.158,.032,0,.035,.06,.062]],record.i.id);
  }else if(kind==='energy'){
   const can=mesh(pocket,new T.CylinderGeometry(.063,.063,.23,12),energyPaint,0,.13,0,record.i.id);
   can.name='energy-can';
   for(const y of [.012,.248]){
    mesh(pocket,new T.CylinderGeometry(.065,.065,.012,12),mats.metal,0,y,0,record.i.id);
   }
   mesh(pocket,new T.CylinderGeometry(.064,.064,.075,12),mats.paper,0,.13,0,record.i.id);
   part(pocket,mats.trim,[[0,.258,.008,.023,.008,.036],[0,.129,.064,.022,.045,.008]]);
  }else if(kind==='ward'){
   part(pocket,mats.paper,[[0,.015,0,.17,.025,.29]],record.i.id);
   part(pocket,mats.red,[[0,.031,0,.026,.008,.22],[0,.032,.022,.112,.008,.031]],record.i.id);
  }
  variants.set(kind,pocket.children.slice(start));
 }
 function fitPocket(group,record,kind,y){
  const pocket=new T.Group();group.add(pocket);record.pocket=pocket;pocket.visible=false;
  const painting=kind==='painting';pocket.position.set(painting?.16:0,y,painting?.05:kind==='drawer'?-.14:-.18);
  if(painting)pocket.rotation.x=Math.PI/2;
  const initial=state.loot?.[record.i.id];if(!initial)return;
  if(ITEM_NAMES[initial])stockPocket(record,initial);
  else{
   if(kind==='drawer'){
    // The receipt is clipped high against a sloping divider, visible above the open front lip.
    pocket.position.set(0,1.005,-.18);pocket.rotation.x=.85;
    part(group,mats.trim,[[0,.883,-.265,.33,.213,.045]],record.i.id);
   }
   const digits=String(state.code??'').padStart(4,'_'),w=.38;
   const face=initial==='front'?digits.slice(0,2)+'__':initial==='back'?'__'+digits.slice(2):digits;
   part(pocket,mats.paper,[[0,.008,0,w,.016,.18]],record.i.id);
   record.slip=tag(print(pocket,0,.019,0,w-.018,.16,[face],0,{bg:'#d9cfad',color:'#18221d',width:256,height:112}),record.i.id);
   record.slip.rotation.x=-Math.PI/2;record.slip.userData.printedCode=face;
  }
 }
 let alarmDial=null;
 for(const i of f.interactions||[]){
  const group=new T.Group(),position=i.target||i;
  group.position.set(position.x,0,position.z);group.rotation.y=i.yaw??0;root.add(group);
  const record={i,data:i,group};records.push(record);const add=(geometry,material,x,y,z)=>mesh(group,geometry,material,x,y,z,i.id);
  if(i.type==='guide-stone'){
   const mount=f.props.find(p=>p.id===i.id);
   group.rotation.y=mount.yaw;
   record.stoneBase=add(new T.BoxGeometry(.89*mount.scale,.022,.72*mount.scale),mats.metal,0,mount.y+.011,0);
  }else if(i.type==='portrait'){
   const source=assets[i.asset]||assets.naiwa;if(!source)continue;
   if(!grayscale.has(source)){const texture=monochrome(source);grayscale.set(source,texture);textures.push(texture);}
   const aspect=source.image.width/source.image.height,h=Math.min(.94,1.2/aspect),w=h*aspect,y=i.target?.y??1.65;
   const hinge=new T.Group();group.add(hinge);hinge.position.set(-w/2,y,0);
   part(hinge,mats.wood,[[w/2,0,0,w+.14,h+.14,.06]],i.id);
   part(hinge,mats.paper,[[w/2,0,.034,w+.055,h+.055,.01]],i.id);
   record.photo=mesh(hinge,new T.PlaneGeometry(w,h),mat(0xf2eddb,grayscale.get(source)),w/2,0,.041,i.id);
   record.photo.material.alphaTest=.05;record.photo.userData.portrait=true;
   if(i.form==='painting'){
    record.motion=hinge;placedBox(group,0,y,-.066,w+.13,h+.13,.06,mats.trim);
    fitPocket(group,record,'painting',y);
   }
  }else if(i.type==='search'){
   const drawer=i.form==='drawer',w=1.10,top=drawer?1.06:1.49;
   for(const side of [-1,1])placedBox(group,side*(w/2-.035),top/2,-.25,.07,top,.48,mats.wood);
   placedBox(group,0,top-.03,-.25,w,.06,.49,mats.wood);placedBox(group,0,top/2,-.465,w,top,.055,mats.trim);
   placedBox(group,0,.115,-.24,w,.20,.46,mats.wood);
   const moving=new T.Group();group.add(moving);record.motion=moving;
   if(drawer){
    for(const y of [.35,.60]){placedBox(group,0,y,-.034,w-.13,.225,.06,mats.wood);placedBox(group,0,y+.02,.002,.22,.025,.035,mats.metal);}
    part(moving,mats.wood,[[0,.873,-.035,w-.13,.238,.065],[0,.756,-.235,w-.17,.035,.40],[-.46,.81,-.23,.04,.11,.40],[.46,.81,-.23,.04,.11,.40]],i.id);
    part(moving,mats.metal,[[0,.875,.022,.23,.035,.055]],i.id);fitPocket(moving,record,'drawer',.783);
   }else{
    placedBox(group,0,.78,-.23,w-.1,.055,.43,mats.cream);
    // Keep the interior clickable when the moving door leaves the player's aim.
    add(new T.PlaneGeometry(w-.08,top-.1),cupboardPick,0,top/2,-.437);
    moving.position.x=-w/2+.058;
    part(moving,mats.green,[[.496,.83,-.039,.98,1.23,.055]],i.id);
    part(moving,mats.metal,[[.85,.86,.009,.045,.16,.055]],i.id);fitPocket(group,record,'cupboard',.815);
   }
  }else if(i.type==='depot-slip'){
   const {y}=i.target,w=.255,h=i.crate?.26:.325,paperY=y+(i.crate?.04:0),found=state.depotFinds?.[i.id];
   let holder=group;
   if(i.crate){
    const tray=new T.Group(),lid=new T.Group();
    group.add(tray);tray.add(lid);holder=tray;
    lid.position.set(0,y+.20,.046);
    record.depotCrate={tray,lid,progress:0};
    part(group,mats.metal,[[i.crate.slide/2,y-.257,-.075,1.47,.068,.35],[i.crate.slide/2,y-.214,.076,1.43,.033,.044]],i.id);
    part(tray,mats.wood,[[0,y-.201,-.008,.73,.085,.29],[0,y-.111,.123,.73,.163,.045],
     [-.345,y+.002,-.019,.041,.37,.29],[.345,y+.002,-.019,.041,.37,.29],[0,y+.002,-.139,.71,.37,.042]],i.id);
    part(lid,mats.wood,[[0,0,.075,.75,.054,.171],[0,-.124,.144,.75,.248,.042]],i.id);
    part(lid,mats.metal,[[-.26,-.1,.17,.052,.203,.021],[.26,-.1,.17,.052,.203,.021]],i.id);
    part(lid,mats.red,[[0,-.145,.174,.108,.048,.018]],i.id);
    tag(print(lid,0,-.064,.169,.295,.081,()=>[getLanguage()==='en'?'PUSH':'推箱'],0,{bg:'#564031',color:'#e4bf83',width:256,height:80}),i.id);
   }
   // The backplate is mounted to the rack, or to the inside of the crate.
   part(holder,mats.metal,[[0,paperY,-.031,w+.024,h+.017,.053],[0,paperY+h/2,.025,.087,.05,.027]],i.id);
   record.depotDigit=found?.digit??null;
   record.depotOrdinal=found?found.slot+1:null;
   const paperStock=new T.Color(i.color).lerp(new T.Color(0xefe3c7),.35);
   const paper=tag(print(holder,0,paperY,.017,w,h,()=>[record.depotDigit??'?',record.depotOrdinal?`Nº ${record.depotOrdinal}`:getLanguage()==='en'?'CODE SLIP':'号码纸'],0,
    {bg:'#'+paperStock.getHexString(),color:'#282821',width:192,height:256}),i.id);
   record.depotPaper=paper;
   paper.visible=!i.crate||!!found;
   part(holder,mats.trim,[[0,paperY+h/2-.009,.04,.073,.026,.013]],i.id);
  }else if(i.type==='depot-alarm'){
   const y=i.target.y,body=new T.Group();
   body.position.y=y;group.add(body);record.alarmBody=body;
   function face(radius,depth,z,material){
    const g=new T.CylinderGeometry(radius,radius,depth,20);
    g.rotateX(Math.PI/2);
    return mesh(body,g,material,0,-.018,z,i.id);
   }
   face(.126,.13,-.132,mats.oxide);face(.119,.022,-.058,mats.dark);
   if(!alarmDial){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const ink=canvas.getContext('2d');ink.fillStyle='#ccc4a9';ink.fillRect(0,0,128,128);
    ink.fillStyle='#463d32';ink.textAlign='center';ink.textBaseline='middle';ink.font='bold 17px Arial';
    for(let hour=1;hour<=12;hour++){
     const a=hour*Math.PI/6;ink.fillText(hour,64+Math.sin(a)*45,64-Math.cos(a)*45);
    }
    const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;textures.push(map);alarmDial=mat(0xffffff,map);
   }
   mesh(body,new T.CircleGeometry(.106,24),alarmDial,0,-.018,-.044,i.id);
   for(const side of [-1,1]){
    const bell=new T.SphereGeometry(.052,10,6,0,Math.PI*2,0,Math.PI*.64);bell.rotateZ(-side*.34);
    mesh(body,bell,mats.oxide,side*.079,.083,-.122,i.id);
   }
   part(body,mats.dark,[[0,.097,-.135,.077,.023,.026],[.072,-.177,-.121,.034,.084,.041],[-.072,-.177,-.121,.034,.084,.041]],i.id);
   const hand=new T.Group();hand.position.set(0,-.018,-.039);body.add(hand);record.alarmHand=hand;
   part(hand,mats.red,[[0,.034,0,.013,.065,.006],[0,0,.004,.022,.018,.007]],i.id);
  }else if(i.type==='depot-lure'){
   const y=i.target.y,chute=i.mechanism==='chute',lamp=mat(0xc2aa72);
   lamp.emissive.setHex(0xffb96f);lamp.emissiveIntensity=.04;record.lureLamp=lamp;
   if(chute){
    // The tray travels across the top of a fixed steel receiving bench.
    const incline=new T.Group();incline.position.set(-.10,1.16,-.50);incline.rotation.z=.25;group.add(incline);
    part(incline,mats.metal,[[0,0,0,1.36,.035,.47],[0,.05,-.231,1.36,.10,.041],[0,.05,.231,1.36,.10,.041]],i.id);
    part(incline,mats.oxide,[[.39,.055,.256,.17,.092,.013],[-.62,.057,.257,.12,.09,.014]],i.id);
    part(group,mats.dark,[[-.66,1.02,-.5,.13,.12,.19],[.43,1.03,-.5,.12,.27,.2],[-.68,1.108,-.50,.06,.15,.51]],i.id);
    const tray=new T.Group();group.add(tray);record.chuteTray=tray;tray.position.set(.40,1.331,-.50);
    part(tray,mats.metal,[[0,0,0,.31,.035,.36],[.138,.062,0,.028,.102,.36],[-.138,.062,0,.028,.102,.36],
     [0,.062,-.169,.28,.102,.022],[0,.058,.169,.28,.092,.022]],i.id);
    part(tray,mats.oxide,[[0,.06,0,.13,.08,.22]],i.id);
    part(group,mats.trim,[[0,y,-.018,.35,.163,.088]],i.id);
    const lever=new T.Group();lever.position.set(-.063,y-.038,.053);lever.rotation.x=-.28;
    group.add(lever);record.chuteLever=lever;
    part(lever,mats.metal,[[0,.029,.012,.027,.102,.031]],i.id);
    part(lever,mats.wood,[[0,.081,.015,.116,.033,.049]],i.id);
    add(new T.BoxGeometry(.039,.029,.011),lamp,.101,y,.034);
    print(group,.04,1.68,-.951,.75,.208,()=>getLanguage()==='en'?['SORTING CHUTE','INTAKE']:['收件滑槽','收件台'],
     0,{bg:'#463b29',color:'#ddccaa'});
    placedBox(group,.04,1.68,-.993,.83,.267,.08,mats.trim);
   }else{
    placedBox(group,0,y,-.033,.48,.52,.122,mats.oxide);
    placedBox(group,-.14,2.19,-.052,.034,1.20,.046,mats.metal);
    part(group,mats.trim,[[0,y+.08,.037,.392,.29,.045],[0,y-.121,.046,.385,.108,.035]],i.id);
    const vents=Array.from({length:5},(_,n)=>[0,y+.042+n*.032,.065,.302,.01,.017]);
    part(group,mats.dark,vents,i.id);
    add(new T.BoxGeometry(.167,.068,.038),mats.red,-.061,y-.121,.07);
    add(new T.BoxGeometry(.043,.031,.012),lamp,.108,y-.12,.083);
    print(group,0,1.84,.026,.53,.24,()=>getLanguage()==='en'?['INTERCOM','REGISTRY SPEAKER']:['对讲机','底册库广播'],
     0,{bg:'#3d372b',color:'#dfcba2'});
    placedBox(group,0,1.84,-.046,.59,.29,.128,mats.trim);
    const speaker=new T.Group();speaker.position.set(i.noise.x,0,i.noise.z);speaker.rotation.y=Math.PI;root.add(speaker);
    placedBox(speaker,0,2.20,-.022,.57,.392,.19,mats.oxide);
    placedBox(speaker,0,2.20,.081,.509,.32,.042,mats.trim);
    const speakerVents=Array.from({length:7},(_,n)=>[0,2.089+n*.037,.106,.453,.016,.019]);
    part(speaker,mats.dark,speakerVents);
    const signal=mat(0xbd7664);signal.emissive.setHex(0xfa7f5a);signal.emissiveIntensity=.02;record.speakerLamp=signal;
    mesh(speaker,new T.BoxGeometry(.052,.025,.023),signal,.191,2.052,.109).name='depot-speaker-light';
    placedBox(speaker,-.192,2.682,-.042,.035,.586,.032,mats.metal);
   }
  }else if(i.type==='keypad'){
   const y=i.target?.y??1.45;
   add(new T.BoxGeometry(.28,.42,.06),mats.trim,0,y,-.005);
   add(new T.BoxGeometry(.217,.095,.015),mats.dark,0,y+.125,.03);
   record.indicator=add(new T.BoxGeometry(.045,.025,.015),basic(0xba8b4b),-.063,y+.128,.041);
   const keys=[],canvas=document.createElement('canvas');canvas.width=192;canvas.height=256;
   const ink=canvas.getContext('2d');ink.font='bold 36px Arial';ink.fillStyle='#202824';ink.textAlign='center';ink.textBaseline='middle';
   for(let row=0;row<4;row++)for(let col=0;col<3;col++){
    keys.push([(col-1)*.069,y+.043-row*.054,.039,.055,.041,.02]);
    ink.fillText('123456789*0#'[row*3+col],(col+.5)*64,(row+.5)*64);
   }
   part(group,mats.paper,keys,i.id);const glyphs=new T.CanvasTexture(canvas);glyphs.colorSpace=T.SRGBColorSpace;textures.push(glyphs);
   const keyInk=mat(0xffffff,glyphs);keyInk.transparent=true;keyInk.depthWrite=false;
   add(new T.PlaneGeometry(.207,.216),keyInk,0,y-.038,.051);
   if(f.listenerDepot){
    placedBox(group,0,y,-.093,.31,.45,.154,mats.metal);
    placedBox(group,0,2.07,-.063,1.19,.345,.162,mats.trim);
    print(group,0,2.07,.032,1.12,.289,()=>getLanguage()==='en'?['STAIR RELEASE','YELLOW LINE TO STAIRS']:['楼梯门解锁','沿黄线回楼梯'],
     0,{bg:'#3d372b',color:'#dfcba2'});
   }
  }else if(i.type==='wardrobe'){
   const depth=i.depth||.6;
   for(const side of [-1,1])placedBox(group,side*.62,1.16,0,.065,2.32,depth,mats.wood);
   placedBox(group,0,1.16,-depth/2+.03,1.3,2.32,.06,mats.wood);placedBox(group,0,2.32,0,1.3,.1,depth,mats.wood);
   const enclosureHit=basic(0,{visible:false});
   const back=add(new T.BoxGeometry(1.3,2.32,.06),enclosureHit,0,1.16,-depth/2+.03);
   back.userData.wardrobeSurface='back';
   for(const side of [-1,1]){
    const flank=add(new T.BoxGeometry(.065,2.32,depth),enclosureHit,side*.62,1.16,0);
    flank.userData.wardrobeSurface='side';
   }
   placedBox(group,0,2.315,depth/2+.008,.24,.054,.016,mats.cream);
   placedBox(group,-.061,2.315,depth/2+.018,.054,.014,.007,mats.metal);
   placedBox(group,.51,2.306,depth/2+.028,.178,.094,.086,mats.trim);
   placedBox(group,.51,2.294,depth/2+.069,.127,.050,.032,wardrobeBulb);
   const litFaces=[[0,.76,depth/2+.024,1.215,1.435],[0,2.085,depth/2+.024,1.215,.389],
    ...[1.50,1.615,1.73,1.845].flatMap(y=>[-.315,.315].map(x=>[x,y,depth/2+.04,.502,.043])),
    [.035,.016,depth/2+.69,1.3,1.33,true]];
   for(const [x,y,z,w,h,flat] of litFaces){
    const g=new T.PlaneGeometry(w,h);
    if(flat)g.rotateX(-Math.PI/2);
    g.translate(x,y,z);
    const uv=g.attributes.uv,p=g.attributes.position;
    for(let j=0;j<uv.count;j++)uv.setXY(j,flat?uv.getX(j):.5+p.getX(j)/1.22,
     flat?.49*uv.getY(j):.51+.48*(p.getY(j)-.04)/2.24);
    g.rotateY(i.yaw||0).translate(i.x,0,i.z);wardrobeWashParts.push(g);
   }
   const hit=basic(0,{visible:false});add(new T.BoxGeometry(1.24,2.25,.025),hit,0,1.14,depth/2);
   record.wardrobe=[];
   for(const side of [-1,1]){
    const hinge=new T.Group();hinge.position.set(side*.62,0,depth/2);group.add(hinge);const center=-side*.305;
    const boards=[[center,.76,0,.61,1.44,.045],[center,2.085,0,.61,.39,.045],[-side*.027,1.685,0,.054,.41,.045],[-side*.585,1.685,0,.05,.41,.045],[-side*.53,1.2,.05,.035,.16,.065]];
    for(const y of [1.50,1.615,1.73,1.845])boards.push([center,y,.008,.505,.045,.061]);
    const leaf=part(hinge,mats.wood,boards,i.id);
    leaf.userData.interactionBorders=[[center,1.16,.0225,.61,2.24],[-side*.53,1.2,.0825,.035,.16]];
    record.wardrobe.push({hinge,side});
   }
  }else if(i.type==='shaft-switch'){
   const y=i.target.y,pilot=basic(0xffb667);
   part(group,mats.metal,[[0,(i.platformY+y)/2,0,.094,y-i.platformY,.09],[0,i.platformY+.05,0,.36,.10,.35]],i.id);
   part(group,mats.trim,[[0,y,0,.41,.32,.16]],i.id);
   const button=add(new T.BoxGeometry(.12,.105,.035),mats.red,-.075,y,.098);
   add(new T.BoxGeometry(.057,.058,.023),pilot,.086,y,.088);
   tag(print(group,0,y+.235,.048,.52,.14,()=>[getLanguage()==='en'?`ALIGN PIPE 0${i.slot}`:`移管 0${i.slot}`]),i.id);
   record.shaftSwitch={button,pilot};
  }else if(i.type==='maintenance-lever'){
   const y=i.target.y,lever=new T.Group(),pilot=mat(0xd2ad75);
   pilot.emissive.setHex(0xf2ad56);pilot.emissiveIntensity=.27;
   placedBox(group,0,y,-.035,.43,.48,.128,mats.oxide||mats.metal);
   part(group,mats.trim,[[0,y,.028,.38,.42,.042]],i.id);
   lever.position.set(-.032,y-.078,.073);lever.rotation.x=-.63;group.add(lever);
   part(lever,mats.metal,[[0,.103,.011,.055,.21,.045]],i.id);
   part(lever,mats.red,[[0,.209,.014,.145,.055,.062]],i.id);
   add(new T.BoxGeometry(.06,.038,.018),pilot,.113,y+.1,.06);
   print(group,0,y+.332,.052,.50,.13,()=>getLanguage()==='en'?['ISOLATION']:['隔离闸']);
   record.isolationLever={lever,pilot};
  }else if(i.type==='flashlight'){
   add(new T.BoxGeometry(.5,.88,.5),mats.wood,0,.44,0);const torch=new T.Group();group.add(torch);record.torch=torch;
   const shaft=mesh(torch,new T.CylinderGeometry(.055,.055,.32,10),mats.metal,0,.97,0,i.id);shaft.rotation.x=Math.PI/2;
   const head=mesh(torch,new T.CylinderGeometry(.09,.07,.12,10),mats.metal,0,.97,.2,i.id);head.rotation.x=Math.PI/2;mesh(torch,new T.CircleGeometry(.075,12),basic(0xe4ecc9),0,.97,.264,i.id);
   print(group,0,.68,.257,.37,.15,['强光手电'],0,{bg:'#c9c4ad',color:'#263b31'});
  }else if(i.type==='chase-bell'){
   add(new T.BoxGeometry(.32,.38,.10),mats.metal,0,1.26,0);
   const lever=add(new T.BoxGeometry(.06,.16,.08),mats.red,0,1.26,.086);
   lever.rotation.x=-.55;record.bellLever=lever;
   add(new T.BoxGeometry(.045,.61,.04),mats.trim,0,1.75,-.015);
   tag(print(group,0,1.62,.061,.55,.17,()=>[getLanguage()==='en'?'SIDE AISLE BELL':'侧廊检修铃'],0,{bg:'#d3ca9a',color:'#28352e'}),i.id);
  }else if(i.type==='chase-board'){
   const w=i.width,post=w/2;
   part(group,mats.metal,[[post, .63,0,.10,1.26,.13],[post,1.27,0,.16,.07,.16]],i.id);
   for(const offset of [-3.5,.65]){
    part(group,mats.paper,Array.from({length:5},(_,n)=>[(n-2)*.48,.008,offset,.27,.014,.13]));
   }
   const hinge=new T.Group(),panel=new T.Group();
   hinge.position.set(post,.05,0);hinge.rotation.y=-Math.PI/2;hinge.add(panel);group.add(hinge);
   part(panel,mats.wood,[[ -w/2,.66,0,w-.03,1.13,.095]],i.id);
   part(panel,mats.metal,[[-w/2,.14,0,w,.11,.12],[-w/2,1.18,0,w,.085,.12],[-.22,.65,.085,.07,.28,.10]],i.id);
   part(panel,mats.paper,[[-w*.50,1.16,.066,w*.77,.035,.014]],i.id);
   record.chaseBoard={hinge,panel};
  }else if(i.type==='vault'){
   const traversal=(f.traversals||[]).find(t=>t.id===i.traversalId);if(traversal){const marker=tag(print(group,0,.53,0,.42,.12,['E · 翻越'],0,{bg:'#d4c9a5',color:'#2f3c30'}),i.id);record.marker=marker;record.traversalId=traversal.id;}
  }else if(i.type==='vent'){
   add(new T.BoxGeometry(.95,.72,.025),basic(0,{visible:false}),0,.4,.005);
   for(const side of [-1,1])add(new T.BoxGeometry(.07,.83,.11),mats.metal,side*.51,.42,0);add(new T.BoxGeometry(1.1,.08,.11),mats.metal,0,.84,0);
   const hinge=new T.Group();hinge.name='vent-grate';hinge.position.set(0,.83,.066);hinge.rotation.x=state.ventSealed?0:-1.46;group.add(hinge);
   const bars=[[-.46,-.39,0,.055,.79,.055],[.46,-.39,0,.055,.79,.055],[0,-.76,0,.96,.055,.055]];
   for(let n=0;n<7;n++)bars.push([0,-.07-n*.102,0,.89,.036,.048]);
   part(hinge,mats.metal,bars,i.id);part(hinge,mats.paper,[[0,-.666,.04,.28,.045,.024]],i.id);record.grate=hinge;
   tag(print(group,0,.99,.01,.8,.18,['维修通风口'],0,{bg:'#aab5a2',color:'#263b31'}),i.id);
  }
  i.renderTarget={x:position.x,y:i.target?.y??1.5,z:position.z};
 }
 root.userData.interactions=records;

 if(f.belongings?.length){
  const grime=mat(0xffffff,surfaceMaps.dust??=stillLifeDust());grime.transparent=true;grime.depthWrite=false;
  grime.polygonOffset=true;grime.polygonOffsetFactor=-1;grime.polygonOffsetUnits=-1;
  function dustUnder(x,z,yaw,width,depth){
   const g=new T.PlaneGeometry(width,depth);g.rotateX(-Math.PI/2);g.rotateY(yaw);
   g.translate(x,.002,z);queue(g,grime);
  }
  for(const cluster of f.belongings){
   buildBelongings(cluster.kind,{box,queue,m:mats},cluster);
   dustUnder(cluster.x,cluster.z,cluster.yaw,2.28,1.48);
  }
  for(const p of f.furniture.filter(p=>p.name==='hospital-bed'))
   dustUnder(p.x+p.w/2,p.z+p.d/2,p.d>p.w?Math.PI/2:0,2.62,Math.min(p.w,p.d,1.06)+.49);
  if(tenantWalls[f.id])mountTenantTrace(tenantWalls[f.id],{box,queue,mat,mats,textures});
 }
 for(const sign of f.depotSigns||[]){
  const {x,z,yaw,sector,scene}=sign,w=1.52,y=2.58,c=Math.cos(yaw),s=Math.sin(yaw);
  box(x,y,z,w,.37,.072,mats.trim,yaw);
  for(const end of [-1,1])box(x+c*w*.36*end,2.86,z-s*w*.36*end,.041,.26,.026,mats.oxide,yaw);
  for(const face of [-1,1])print(root,x+s*.039*face,y,z+c*.039*face,w-.07,.31,
   ()=>[getLanguage()==='en'?scene.titleEn:scene.title,sector],yaw+(face<0?Math.PI:0),{bg:'#463d2e',color:'#d1bd94'});
 }
 if(f.depotStripes?.length){
  const map=surfaceMaps.iron??=wornSurface(true);
  const paint=mat(0x92805b,map),escapePaint=mat(0xb4a04b,map);
  for(const {x,z,length,yaw,escape} of f.depotStripes)for(let n=0;n<Math.floor(length/.52);n++){
   if(n%7===4)continue;
   const offset=(n+.5)*.52-length/2;
   const g=new T.PlaneGeometry(n%5===3?.23:.48,(escape?.09:.055)+(n%3)*.012);
   g.rotateX(-Math.PI/2);g.rotateY(yaw);
   g.translate(x+offset*Math.cos(yaw),.003,z-offset*Math.sin(yaw));queue(g,escape?escapePaint:paint);
  }
 }
 if(f.listenerDepot){
  const group=new T.Group();group.position.set(15.19,0,f.destination.z);group.rotation.y=Math.PI/2;root.add(group);
  placedBox(group,0,2.63,0,1.78,.30,.074,mats.trim);
  print(group,0,2.63,.041,1.70,.24,()=>[getLanguage()==='en'?'STAIR DOOR':'下层楼梯'],0,
   {bg:'#3d372b',color:'#dfcba2'});
 }
 const footsteps={8:[14.85,8.72,1.34],4:[15.8,6.07,.82],2:[17.75,6.32,-.87]}[f.id];
 if(footsteps&&f.belongings?.length){
  const [x,z,yaw]=footsteps;
  const dirt=mat(0xffffff,surfaceMaps.footprints??=heelMarks());dirt.transparent=true;dirt.depthWrite=false;
  dirt.polygonOffset=true;dirt.polygonOffsetFactor=-1;dirt.polygonOffsetUnits=-2;
  const g=new T.PlaneGeometry(1.28,2.36);g.rotateX(-Math.PI/2);g.rotateY(yaw);
  mesh(root,g,dirt,x,.004,z).name='dusty-shoeprints';
 }
 for(const p of f.furniture||[]){const x=p.x+p.w/2,z=p.z+p.d/2,height=p.height??.78;
  if(p.traversalId)continue;
  const room=f.scenes?.find(scene=>within({x,z},scene.bounds))?.bounds;
  if(buildInstallation(p,room,box,queue,mats))continue;
  if(/bed|床/i.test(p.name||'')){const room=(f.rooms||[]).find(r=>within({x,z},r.bounds)),head=room&&z>room.bounds.z+room.bounds.d/2?1:-1;box(x,.27,z,p.w,.4,p.d,mats.wood);box(x,.54,z,p.w-.08,.18,p.d-.08,mats.cream);box(x,.72,z+head*(p.d/2-.055),p.w,1.12,.11,mats.wood);box(x,.69,z+head*p.d*.32,p.w*.72,.14,.48,mats.paper);box(x,.65,z-head*p.d*.12,p.w-.17,.04,p.d*.59,mats.green);box(x,.68,z-head*p.d*.31,p.w-.15,.035,.18,mats.cream);box(x+p.w*.27,.7,z-head*p.d*.29,.28,.035,.35,mats.red,.11);box(x+p.w*.27,.724,z-head*p.d*.29,.26,.013,.33,mats.paper,.11);}
  else if(/table|desk|桌|台/i.test(p.name||'')){box(x,height,z,p.w,.12,p.d,mats.wood);for(const sx of [-1,1])for(const sz of [-1,1])box(x+sx*(p.w/2-.08),height/2,z+sz*(p.d/2-.08),.08,height,.08,mats.trim);}
  else{box(x,height/2,z,p.w,height,p.d,mats.wood);box(x,height*.7,z+p.d/2+.015,p.w*.8,.025,.02,mats.trim);}
 }
 for(const traversal of f.traversals||[]){
  const o=traversal.obstacle||(f.obstacles||[]).find(p=>p.traversalId===traversal.id||p.id===traversal.obstacleId);if(!o)continue;
  const x=o.x??o.minX,z=o.z??o.minZ,w=o.w??o.maxX-o.minX,d=o.d??o.maxZ-o.minZ,h=o.height??.85;
  if(traversal.kind==='vent'){
   box(x+w/2,1.97,z+d/2,w,2.06,d,mats.metal);
   const points=[{x:x+w/2,z:z+d/2},...(traversal.via||[]),traversal.b],roofRects=[];
   for(let n=1;n<points.length;n++){const a=points[n-1],b=points[n],width=traversal.width||1.2;roofRects.push({x:Math.min(a.x,b.x)-(a.x===b.x?width/2:0),z:Math.min(a.z,b.z)-(a.z===b.z?width/2:0),w:Math.abs(b.x-a.x)||(width),d:Math.abs(b.z-a.z)||(width)});}
   const rx=[...new Set(roofRects.flatMap(r=>[r.x,r.x+r.w]))].sort((a,b)=>a-b),rz=[...new Set(roofRects.flatMap(r=>[r.z,r.z+r.d]))].sort((a,b)=>a-b);
   for(let a=1;a<rx.length;a++)for(let b=1;b<rz.length;b++){const px=(rx[a]+rx[a-1])/2,pz=(rz[b]+rz[b-1])/2;if(roofRects.some(r=>within({x:px,z:pz},r)))box(px,.99,pz,rx[a]-rx[a-1],.1,rz[b]-rz[b-1],mats.metal);}
   continue;
  }
  if(traversal.kind!=='vault')continue;
  const group=new T.Group();group.position.set(x+w/2,0,z+d/2);root.add(group);
  const wide=w>d,cart=o.id==='f3-cart-barrier';
  if(cart){
   const rack=[[0,h*.55,0,w-.04,h*.45,d-.06],[0,.13,0,w-.02,.085,d],[0,h-.04,0,w-.03,.11,d]];
   for(const offset of [-.41,-.2,.2,.41]){
    rack.push([w*offset,h*.5,0,.07,h-.12,d-.036],[w*offset,.065,0,.13,.13,.25]);
   }
   part(group,mats.metal,rack);part(group,mats.paper,[[0,h*.61,-d/2-.008,1.05,.065,.018],[0,h*.61,d/2+.008,1.05,.065,.018]]);
  }else{
   mesh(group,new T.BoxGeometry(w,h,d),mats.wood,0,h/2,0);
   for(let k=-1;k<=1;k++)mesh(group,new T.BoxGeometry(wide?w*.27:w+.02,.045,wide?d+.02:d*.27),mats.dark,wide?k*w*.31:0,h*.72,wide?0:k*d*.31);
  }
  const fallen=new T.Group();fallen.position.copy(group.position);root.add(fallen);
  for(let k=-1;k<=1;k++){const panel=mesh(fallen,new T.BoxGeometry(wide?w*.3:w,.065,wide?d:d*.3),cart?mats.metal:mats.wood,wide?k*w*.31:0,.06+Math.abs(k)*.025,wide?0:k*d*.31);panel.rotation.y=k*.19;}
  fallen.visible=!!state.traversals?.[traversal.id];group.visible=!fallen.visible;vaults.push({id:traversal.id,group,fallen});
 }

 let fan=null,fanBacklight=null,bridge=null,bellLens=null;
 const hazardRecords=[];root.userData.chaseHazards=hazardRecords;
 if(f.chaseIsland){
  const r=f.chaseIsland,x=r.x+r.w/2,z=r.z+r.d/2;
  box(x,.13,z,r.w,.26,r.d,mats.trim);box(x,r.height/2+.10,z,r.w-.13,r.height-.20,r.d-.12,mats.green);
  for(const side of [-1,1])for(const u of [-1,0,1]){
   box(x+u*1.47,1.12,z+side*(r.d/2-.025),1.34,1.79,.06,mats.metal);
   for(let j=0;j<5;j++)box(x+u*1.47,.92+j*.14,z+side*(r.d/2+.009),1.08,.045,.028,mats.trim);
  }
  const vent=f.traversals.find(t=>t.kind==='vent'),wx=vent.obstacle.x+vent.obstacle.w+.03,wz=vent.a.z;
  // A running extractor is visible through the receiving cage and the sight window long before its grille is reachable.
  box(wx,1.99,wz,.13,1.62,1.83,mats.trim);
  const fanFrame=new T.Group();fanFrame.position.set(wx+.09,1.99,wz);fanFrame.rotation.y=Math.PI/2;root.add(fanFrame);
  fanBacklight=mat(0x657668);fanBacklight.emissive.setHex(0x48594e);
  mesh(fanFrame,new T.CircleGeometry(.72,28),fanBacklight,0,0,0);
  mesh(fanFrame,new T.RingGeometry(.67,.735,32),mats.metal,0,0,.009);
  fan=new T.Group();fan.name='exhaust-fan';fanFrame.add(fan);
  const blades=[];
  for(let j=0;j<5;j++){
   const p=new T.Shape();p.moveTo(.07,.025);p.quadraticCurveTo(.21,.27,.58,.28);p.quadraticCurveTo(.68,.14,.63,-.032);p.quadraticCurveTo(.34,.12,.07,-.02);
   const g=new T.ShapeGeometry(p,5);g.rotateZ(j*Math.PI*2/5);blades.push(g);
  }
  const rotor=mergeGeometries(blades);blades.forEach(g=>g.dispose());mesh(fan,rotor,mats.trim,0,0,.029);
  mesh(fanFrame,new T.CircleGeometry(.12,12),mats.metal,0,0,.047);
  const safetyWire=[];for(let j=-2;j<=2;j++){const v=j*.20,length=2*Math.sqrt(.67**2-v*v);safetyWire.push([0,v,.057,length,.021,.018],[v,0,.059,.021,length,.018]);}
  part(fanFrame,mats.metal,safetyWire);
  const m=f.chaseMetal,bx=m.x+m.w/2,bz=m.z+m.d/2;
  bridge=new T.Group();bridge.name='iron-bridge';bridge.position.set(bx,.048,bz);root.add(bridge);
  box(bx,.016,bz,m.w-.08,.028,m.d,mats.dark);
  const iron=[];
  for(let k=.08;k<m.d;k+=.18)iron.push([0,0,k-m.d/2,m.w-.13,.038,.065]);
  for(let k=-3;k<=3;k++)iron.push([k*.37,-.016,0,.052,.04,m.d]);
  part(bridge,mats.metal,iron);
  for(const edge of [-1,1]){
   const cx=bx+edge*(m.w/2-.09);
   for(const [start,end] of [[10.62,14.45],[17.12,21.28]]){
    for(const cz of [start,end])box(cx,.46,cz,.055,.92,.055,mats.metal);
    box(cx,.91,(start+end)/2,.068,.06,end-start,mats.metal);box(cx,.50,(start+end)/2,.036,.036,end-start,mats.trim);
   }
  }
  for(const [index,hazard] of chaseHazards(f).entries()){
   const r=hazard.footprint,cx=r.x+r.w/2,cz=r.z+r.d/2,wide=r.w>=r.d;
   const width=Math.max(r.w,r.d)-.02,depth=Math.min(r.w,r.d)-.02,yaw=wide?0:Math.PI/2,kind=hazard.kind||'rack';
   const body=new T.Group();body.name=index?'chase-fall-'+hazard.id:'bridge-pipe-collapse';body.position.set(cx,2.73,cz);body.rotation.y=yaw;
   body.userData.footprint={...r};body.userData.kind=kind;root.add(body);
   // Every moving piece stays in the same fixed envelope as the simulation, even during its fall.
   if(kind==='panel'){
    part(body,mats.wall,[[0,0,0,width,1.12,depth*.68]]);
    part(body,mats.trim,[[-width/2+.045,0,0,.09,1.2,depth],[width/2-.045,0,0,.09,1.2,depth],[0,-.56,0,width,.08,depth],[0,.56,0,width,.08,depth]]);
    const seams=[],chips=[];
    for(const face of [-1,1]){
     seams.push([-width*.22,0,face*depth*.40,.055,1.1,depth*.18],[width*.22,0,face*depth*.40,.055,1.1,depth*.18],[0,-.26,face*depth*.40,width-.14,.035,depth*.18]);
     chips.push([-width*.30,.49,face*depth*.49,.38,.07,.012],[width*.27,-.50,face*depth*.49,.31,.09,.012]);
    }
    part(body,mats.metal,seams);part(body,mats.paper,chips);
   }else if(kind==='duct'){
    part(body,mats.metal,[[0,0,0,width,1.2,depth*.85]]);
    const ribs=[];for(let x=-width/2+.09;x<width/2;x+=.38)ribs.push([x,0,0,.055,1.2,depth]);
    part(body,mats.trim,ribs);part(body,mats.dark,[[0,0,depth*.435,width*.75,.78,.018]]);
    part(body,mats.metal,[-.27,0,.27].map(y=>[0,y,depth*.46,width*.80,.045,.024]));
   }else{
    part(body,mats.metal,[[-width/2+.065,0,0,.13,1.2,depth],[width/2-.065,0,0,.13,1.2,depth],
     [0,-.49,0,width-.12,.11,depth],[0,0,0,width-.12,.17,depth],[0,.49,0,width-.12,.11,depth]]);
    part(body,mats.paper,[[-width*.29,.49,depth/2+.001,.27,.11,.012],[width*.23,0,depth/2+.001,.27,.17,.012]]);
   }
   const warningMaterial=mat(0x8e6335);warningMaterial.emissive.setHex(0xd78939);warningMaterial.emissiveIntensity=.02;
   const signal=new T.Group();signal.name=index?'chase-fall-warning-'+hazard.id:'bridge-collapse-warning';signal.userData.material=warningMaterial;
   signal.position.set(hazard.cue.x,0,hazard.cue.z);signal.rotation.y=hazard.cueYaw??hazard.cue.yaw??yaw;root.add(signal);
   const edge=Math.min(width/2-.12,1.22);
   // Painted edges identify the hazardous opening; the middle remains visibly clear for movement.
   part(signal,warningMaterial,[[-edge,.013,-.60,.085,.013,1.3],[edge,.013,-.60,.085,.013,1.3],[0,.013,.05,edge*2,.013,.085]]);
   const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(18),3));
   const dust=new T.Points(geometry,new T.PointsMaterial({color:0xa9a28b,size:.10,transparent:true,opacity:0,depthWrite:false}));
   dust.name=index?'chase-fall-dust-'+hazard.id:'bridge-collapse-dust';dust.position.set(cx,0,cz);dust.rotation.y=yaw;dust.visible=false;root.add(dust);
   hazardRecords.push({hazard,body,signal,dust,width,lit:false,pulse:0,age:-Infinity});
  }
  const fabric=mat(0x9a9586);fabric.vertexColors=true;fabric.side=T.DoubleSide;
  for(const [index,c] of f.chaseCloth.entries()){
   const p=f.partitions.filter(p=>p.material==='hanging-cloth')[index],group=new T.Group();group.name='laundry-sheet-'+index;
   group.position.set(p.x+p.w/2,2.43,p.z+p.d/2);root.add(group);
   const g=new T.PlaneGeometry(p.w,2.34,18,8),vertex=g.attributes.position,col=[];
   for(let k=0;k<vertex.count;k++){
    const u=vertex.getX(k)/p.w+.5,v=vertex.getY(k)/2.34+.5;
    const fold=Math.cos(u*23+v*.65),shade=.88+.10*fold-.26*(1-v)**2;
    vertex.setXYZ(k,vertex.getX(k),vertex.getY(k)-1.17-.045*(1-v)*Math.sin(u*5),.052*fold+.045*(1-v)*Math.sin(u*9));
    col.push(shade,shade*.98,shade*.91);
   }
   g.setAttribute('color',new T.Float32BufferAttribute(col,3));g.computeVertexNormals();mesh(group,g,fabric,0,0,0);
   curtains.push(group);box(c.x+c.w/2,2.47,group.position.z,c.w,.045,.05,mats.metal);
   for(let n=0;n<4;n++)box(p.x+.07+n*(p.w-.14)/3,2.44,group.position.z,.024,.10,.033,mats.metal);
  }
  // Linen already hanging along the outer wall identifies the blind loop at the fork.
  for(let j=0;j<5;j++){
   const height=1.23+.17*(j%3);box(42.35+j*.71,2.45-height/2,23.90,.66,height,.06,j%2?mats.paper:mats.cream);
  }
  box(43.8,2.51,23.9,3.96,.05,.05,mats.metal);
  const w=.97,h=1.54,linen=new T.PlaneGeometry(w,h,16,6),pos=linen.attributes.position,col=[];
  for(let n=0;n<pos.count;n++){
   const u=pos.getX(n)/w+.5,v=pos.getY(n)/h+.5,fold=Math.cos(u*21+.42*v);
   const light=v>.16&&v<.21?.42:.89+.09*fold;
   col.push(light,light*.96,light*.88);
   pos.setXYZ(n,pos.getX(n),pos.getY(n)-.16*u*u-.055*(1-v)*fold,.046*fold+.04*(1-v));
  }
  linen.setAttribute('color',new T.Float32BufferAttribute(col,3));linen.computeVertexNormals();
  mesh(root,linen,fabric,40.06,1.69,21.66);box(40.06,2.48,21.67,1.22,.052,.07,mats.metal);
  for(const x of [39.64,40.30])box(x,2.47,21.61,.047,.07,.17,mats.metal);
  // The yellow cart rails turn into the open detour before the push bar.
  const stripe=mat(0xac9974);
  for(const [cx,cz,w,d] of [[24.45,27,.085,3.7],[29.45,29.15,10.08,.085],[34.45,27,.085,4.25]])
   box(cx,.008,cz,w,.009,d,stripe);
  print(root,36.75,2.09,20.55,1.24,.27,()=>[getLanguage()==='en'?'WALKWAY':'铁栈桥'],Math.PI/2);
  box(28.9,2.57,10.5,1.22,.30,.065,mats.trim);
  for(const x of [28.42,29.38])box(x,2.85,10.5,.024,.30,.024,mats.metal);
  print(root,28.9,2.57,10.46,1.15,.25,()=>[getLanguage()==='en'?'EXHAUST':'风机房'],Math.PI);
  const marked=(x,y,z,yaw,zh,en,width=1.05)=>print(root,x,y,z,width,.24,()=>[getLanguage()==='en'?en:zh],yaw,{bg:'#394a40',color:'#ded5aa'});
  marked(38.06,2.45,-.61,0,'机房捷径','MOTOR ROOM',1.35);
  marked(41.15,2.46,3.65,0,'侧廊绕行','SIDE AISLE',1.28);
  marked(32.45,2.5,.38,Math.PI,'可翻越','VAULT',.92);
  marked(30.10,2.35,-1.83,Math.PI/2,'备用通道','SERVICE AISLE',1.34);
  const bellColor=mat(0x514b3a);bellColor.emissive.setHex(0xc78f4c);bellColor.emissiveIntensity=.07;
  const bell=f.chaseLure;
  const fixture=new T.Group();fixture.position.set(44.77,2.14,bell.z);fixture.rotation.y=-Math.PI/2;root.add(fixture);
  part(fixture,mats.trim,[[0,0,0,.52,.36,.12],[0,.45,-.03,.044,.68,.04]]);
  mesh(fixture,new T.CircleGeometry(.13,14),bellColor,0,0,.071);
  part(fixture,mats.metal,[[0,-.13,.079,.28,.047,.022]]);
  bellLens=bellColor;
  for(const x of [37.06,37.36])part(root,mats.metal,[[x,2.73,-3.67,.092,.092,3.2],[x,2.73,3.65,.092,.092,5.6]]);
  for(const [x,z,length]of [[43.68,-3.15,2],[43.68,4.9,1.85],[28.92,4.38,1.68]])box(x,.009,z,.105,.01,length,stripe);
 }

 let portraitFlakes=null;
 const flakePose=new T.Object3D();
 for(const p of f.props||[]){
  const template=models[p.model];if(!template)continue;
  const object=template.clone(true);object.userData.sharedModel=true;object.name=p.model;
  object.position.set(p.x,p.y||0,p.z);object.rotation.y=p.yaw||0;object.scale.setScalar(p.scale??1);root.add(object);
  if(p.model==='jiangjieshi'&&p.id){
   object.traverse(o=>{if(o.isMesh)tag(o,p.id);});
   if(assets.chiangkaishekPortrait&&!portraitFlakes){
    const ink=mat(0xe0d9bb,assets.chiangkaishekPortrait);ink.side=T.DoubleSide;
    ink.emissive.setHex(0x37352e);ink.emissiveMap=ink.map;
    portraitFlakes=new T.InstancedMesh(new T.PlaneGeometry(.13,.17),ink,12);
    portraitFlakes.name='guide-stone-portraits';portraitFlakes.visible=false;
    portraitFlakes.boundingSphere=new T.Sphere(new T.Vector3(0,.65,0),1.4);
    portraitFlakes.instanceMatrix.setUsage(T.DynamicDrawUsage);root.add(portraitFlakes);
   }
  }
 }
 const quietRoot=new T.Group();quietRoot.name='quiet-figure';quietRoot.visible=false;root.add(quietRoot);
 const quietSites=f.quietSites||[f.quietSite].filter(Boolean),shutters=[];
 if(quietSites.length){
  const mannequin=models['suspender-mannequin'];
  if(mannequin){
   const figure=mannequin.clone(true);figure.userData.sharedModel=true;figure.userData.quietFigure=true;
   figure.scale.setScalar(.88);figure.rotation.set(-.035,0,.055);
   const cloth=mat(0x42433b),plaster=mat(0x5c6053);cloth.vertexColors=plaster.vertexColors=true;
   figure.traverse(o=>{if(o.isMesh)o.material=o.name.includes('cloth')?cloth:plaster;});quietRoot.add(figure);
  }else if(assets.inspector){
   const image=assets.inspector,face=mat(0x34372f,image);face.alphaTest=.4;face.side=T.DoubleSide;
   const figure=mesh(quietRoot,new T.PlaneGeometry(1.08*image.image.width/image.image.height,1.08),face,0,1.34,0);figure.userData.quietFigure=true;
  }
 }
 for(const site of quietSites){
  if(!site.frame)continue;
  const {x,z,yaw,width:w}=site.frame,group=new T.Group();group.position.set(x,0,z);group.rotation.y=yaw;root.add(group);
  placedBox(group,0,.43,0,w,.86,.18,mats.lower);placedBox(group,0,.85,0,w,.037,.19,mats.metal);
  const top=2.47,bottom=.90,mid=(top+bottom)/2;
  placedBox(group,0,top+.065,0,w+.08,.13,.16,mats.wood);
  for(const side of [-1,1]){
   placedBox(group,side*(w-.07)/2,mid,0,.07,top-bottom,.15,mats.wood);
   const hinge=new T.Group();hinge.position.set(side*(w/2-.06),0,-.07);group.add(hinge);
   const leaf=w/2-.062,c=-side*leaf/2;
   part(hinge,mats.green,[[c,mid,0,leaf,top-bottom,.048]]);
   part(hinge,mats.wood,[[c,bottom+.09,.031,leaf-.045,.072,.019],[c,mid,.031,leaf-.045,.062,.019],[c,top-.09,.031,leaf-.045,.072,.019]]);
   part(hinge,mats.metal,[[c-side*leaf*.32,mid-.06,.047,.035,.12,.034]]);
   shutters.push({hinge,side,site});hinge.rotation.y=-side*1.48;
  }
 }
 const glow=new T.Group();glow.name='tossed-glowstick';glow.visible=false;root.add(glow);
 const glowShell=basic(0xafebc6,{transparent:true}),glowBody=new T.Group();glow.add(glowBody);
 part(glowBody,glowShell,[[0,0,0,.23,.034,.04]]);part(glowBody,mats.trim,[[.127,0,0,.038,.046,.048]]);
 // A soft contact patch complements the chemical light borrowed from the fixed five-slot pool.
 const glowFalloff=new Uint8Array(32*32*4);
 for(let y=0;y<32;y++)for(let x=0;x<32;x++){const k=(y*32+x)*4,dist=Math.hypot((x-15.5)/15.5,(y-15.5)/15.5);glowFalloff.set([145,222,182,Math.round(255*Math.max(0,1-dist)**2)],k);}
 const glowMap=new T.DataTexture(glowFalloff,32,32);glowMap.needsUpdate=true;glowMap.magFilter=glowMap.minFilter=T.LinearFilter;textures.push(glowMap);
 const patch=mesh(glow,new T.PlaneGeometry(4.6,4.6),basic(0xc5f6d6,{map:glowMap,transparent:true,blending:T.AdditiveBlending,depthWrite:false}),0,.012,0);patch.rotation.x=-Math.PI/2;
 const ward=new T.Group();ward.name='thrown-ward';ward.visible=false;root.add(ward);
 const wardBody=new T.Group();wardBody.name='ward-paper';ward.add(wardBody);
 const wardPaper=basic(0xd5c9aa,{transparent:true}),wardInk=basic(0xb77437,{transparent:true});
 part(wardBody,wardPaper,[[0,0,0,.17,.27,.008]]);
 part(wardBody,wardInk,[-1,1].flatMap(side=>[[0,.016,side*.006,.023,.21,.006],[0,.040,side*.008,.105,.023,.006],[-.029,-.056,side*.008,.018,.061,.006],[.029,-.056,side*.008,.018,.061,.006]]));
 const wardBurst=new T.InstancedMesh(new T.PlaneGeometry(.044,.085),basic(0xffffff,{side:T.DoubleSide,transparent:true,depthWrite:false}),12);
 wardBurst.name='ward-dispersal';wardBurst.frustumCulled=false;wardBurst.visible=false;ward.add(wardBurst);
 for(let i=0;i<12;i++)wardBurst.setColorAt(i,new T.Color(i%3?0xd7c9ae:0xc98346));
 const wardPose=new T.Matrix4(),wardPosition=new T.Vector3(),wardScale=new T.Vector3(),wardRotation=new T.Quaternion(),wardTwist=new T.Quaternion(),wardAxis=new T.Vector3(0,0,1);
 const kunFanRays=25,kunFanGeometry=new T.BufferGeometry(),fanPositions=new Float32Array((kunFanRays+1)*3),fanIndices=[];
 for(let i=0;i<kunFanRays;i++){
  if(i<kunFanRays-1)fanIndices.push(0,i+2,i+1);
 }
 kunFanGeometry.setAttribute('position',new T.BufferAttribute(fanPositions,3));kunFanGeometry.setIndex(fanIndices);
 const kunFanMaterial=new T.ShaderMaterial({transparent:true,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false,side:T.DoubleSide,
  uniforms:{uOrigin:{value:new T.Vector2()},uForward:{value:new T.Vector2()},uColor:{value:new T.Color(0x58e979)},uOpacity:{value:0}},
  vertexShader:'varying vec2 vFloor;void main(){vFloor=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`varying vec2 vFloor;uniform vec2 uOrigin,uForward;uniform vec3 uColor;uniform float uOpacity;
   void main(){vec2 d=vFloor-uOrigin;float ahead=dot(d,uForward),side=abs(dot(d,vec2(uForward.y,-uForward.x)));
    float feather=1.-smoothstep(.60,1.,side/max(.015,ahead*.684));
    float falloff=pow(max(0.,1.-length(d)/5.1),1.35);
    gl_FragColor=vec4(uColor,uOpacity*feather*falloff);
    #include <colorspace_fragment>
   }`});materials.push(kunFanMaterial);
 const kunFan=mesh(root,kunFanGeometry,kunFanMaterial,0,.075,0);
 kunFan.name='kun-directional-glow';kunFan.visible=false;kunFan.frustumCulled=false;
 let wardrobeWash;
 if(wardrobeWashParts.length){
  const pixels=new Uint8Array(40*128*4);
  // One texture carries the downward spill on the door and the softer reflection at its feet.
  for(let y=0;y<128;y++)for(let x=0;x<40;x++){
   const u=x/39,v=(y%64)/63;
   const width=.07+(1-v)*.48,axis=.91-(1-v)*.43;
   const cone=(1-T.MathUtils.smoothstep(Math.abs(u-axis),0,width))*Math.pow(v,.62);
   const floor=Math.max(0,1-Math.hypot((u-.58)*2.2,(v-.55)*2))**2;
   pixels.set([255,166,86,Math.round(255*(y>=64?cone*.82:floor*.42))],(y*40+x)*4);
  }
  const map=new T.DataTexture(pixels,40,128);map.colorSpace=T.SRGBColorSpace;map.needsUpdate=true;
  map.magFilter=map.minFilter=T.LinearFilter;textures.push(map);
  wardrobeWash=mesh(root,mergeGeometries(wardrobeWashParts),
   basic(0xffffff,{map,transparent:true,blending:T.AdditiveBlending,depthWrite:false,opacity:0}),0,0,0);
  for(const geometry of wardrobeWashParts)geometry.dispose();
  wardrobeWash.visible=false;wardrobeWash.name='wardrobe-warning-wash';
 }

 const entry=f.spawn||f.destination;
 if(entry){box(entry.x,2.45,entry.z-.05,1.22,.5,.09,mats.trim);for(const side of [-1,1])box(entry.x+side*.48,2.85,entry.z-.05,.025,.3,.025,mats.metal);print(root,entry.x,2.45,entry.z+.001,1.13,.41,()=>[`${String(f.id).padStart(2,'0')} / 08`,(getLanguage()==='en'&&f.titleEn)||f.title||'公寓']);}
 const shaftSlides=f.gunmuFinale?dressGunmuFinale(f,{root,box,queue,mat,mats,flatPaints,print,batchSection(id,draw){
  const parent=container,parentBatches=batches,section=new T.Group();section.name=`shaft-${id}`;
  parent.add(section);container=section;batches=new Map();draw(section);flush();
  container=parent;batches=parentBatches;
 }}):[];
 flush();

 if(f.stairSurfaces){for(const b of f.stairSurfaces)blockBounds(b,b.ceiling?mats.ceiling:mats.floor);}
 else if(f.campaign)for(const core of f.stairCores||['A','B'])for(const b of stairSurrounds(f.id,core,core===f.departure))blockBounds(b,b.ceiling?mats.ceiling:mats.floor);
 flush();
 const stairs=[];if(f.campaign&&f.id>1)stairs.push({from:f.id,core:f.departure});if(f.campaign&&f.id<(f.totalFloors||8))stairs.push({from:f.id+1,core:f.arrival});
 const stairEdge=Math.min(...surfaces.map(r=>r.x));
 const stairLamps=[];
 mats.stairPaint=mat(0x456078,painted('wall'));
 const stairLens=basic(0xc5d7de);
 for(const s of stairs){container=new T.Group();root.add(container);stairGroups.push({...s,group:container});const offset=(s.from-f.id)*RISE;
  const sb=(x,y,z,w,h,d,m)=>{const q=worldStair(x,z,s.core);if((m===mats.floor||m===mats.ceiling)&&q.x+w/2>stairEdge){const left=q.x-w/2;w=stairEdge-left;q.x=left+w/2;}box(q.x,y+offset,q.z,w,h,d,m);};
  for(let k=0;k<9;k++){sb(1.625,-(k+1)*.18-.09,5-(k+.5)*.28,1.25,.18,.28,mats.floor);sb(3.125,-1.62-(k+1)*.18-.09,2.48+(k+.5)*.28,1.25,.18,.28,mats.floor);}
  for(const b of stairLandings(s.from,s.core))blockBounds({...b,maxX:Math.min(stairEdge,b.maxX)});for(const b of stairWalls(s.from,s.core))blockBounds(b,mats.stairPaint);blockBounds(stairGuard(s.from,s.core),mats.stairPaint);
  sb(3.675,3.08,4.105,5.35,.16,6.15,mats.ceiling);sb(3.675,-3.4,4.105,5.35,.16,6.15,mats.floor);
  for(const [x,y,z,side] of [[3.91,2.35,7.06,-1],[2.375,.63,1.17,1],[3.91,2.35-RISE,7.06,-1]]){
   sb(x,y,z,.65,.16,.115,mats.trim);
   sb(x,y-.017,z+side*.065,.56,.083,.039,stairLens);
   stairLamps.push({...worldStair(x,z+side*.65,s.core),y:y+offset+.3,distance:6.3,tint:0xc6daeb,intensity:36,power:1,independent:true});
  }
  const p=worldStair(2.35,1.22,s.core);print(container,p.x,offset-.42,p.z,1.05,.4,[`${String(s.from-1).padStart(2,'0')} F`],s.core==='A'?0:Math.PI);flush();
 }
 container=root;

 let locations=f.lamps||f.lights;
 if(!locations?.length){locations=[];for(let i=1;i<(f.mainRoute||[]).length;i++){const a=f.mainRoute[i-1],b=f.mainRoute[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(length/5));for(let k=0;k<n;k++)locations.push({x:a[0]+(b[0]-a[0])*(k+.5)/n,z:a[1]+(b[1]-a[1])*(k+.5)/n});}}
 const bulbColor=new T.Color(),paleLight=new T.Color(0xe2efff),bulbPose=new T.Matrix4();
 const tubes=new T.InstancedMesh(new T.BoxGeometry(.98,.025,.14),basic(0xffffff),locations.length);
 const hallTints={mail:0xd4c9a8,waiting:0xbfc9bc,laundry:0xc0cdd2,boiler:0xcdaf87,clinic:0xc3d6d3,projection:0xd2c2ab,classroom:0xd5c9ac,archive:0xb7c5ac,canteen:0xd1c1a3};
 for(const [index,p] of locations.entries()){
  const x=p.x??p[0],z=p.z??p[1],y=p.y??2.9,room=(f.rooms||[]).find(r=>within({x,z},r.bounds)),theme=f.scenes?.find(r=>within({x,z},r.bounds))?.theme;
  box(x,y+.055,z,1.15,.09,.25,mats.trim);tubes.setMatrixAt(index,bulbPose.makeTranslation(x,y,z));
  const guide=index%6===0||!!f.keypad&&(f.interactions||[]).some(i=>(i.form||i.type==='keypad'||i.type==='depot-slip')&&Math.hypot(x-i.x,z-i.z)<3.3);
  const output=f.keypad&&!guide?(index%3===1?.32:.68):room?.82:1;
  const tint=hallTints[theme]??(guide?0xe2d3ab:0xc5d1b9);
  const route=f.mainRoute||[];
  let nearest=0,routeGap=Infinity;
  for(const [i,[rx,rz]]of route.entries()){
   const gap=(rx-x)**2+(rz-z)**2;
   if(gap<routeGap){routeGap=gap;nearest=i;}
  }
  tubes.setColorAt(index,bulbColor.setHex(tint));fixtures.push({x,y,z,index,power:1,faulty:!p.steady&&index%9===5,guide,room:room?.id,output,normalTint:tint,routeFraction:nearest/Math.max(1,route.length-1)});
 }
 root.add(tubes);
 const visitorPools=new T.InstancedMesh(new T.PlaneGeometry(2.45,2.45).rotateX(-Math.PI/2),
  basic(0xd2e5fa,{map:glowMap,transparent:true,blending:T.AdditiveBlending,depthWrite:false,fog:false,opacity:.34}),3);
 visitorPools.name='visitor-light-pools';visitorPools.frustumCulled=false;visitorPools.visible=false;root.add(visitorPools);
 const visitorPose=new T.Matrix4();
 flush();
 const lights=Array.from({length:5},()=>new T.PointLight(0xc5d1b9,0,8.5,2)),slots=lights.map(light=>({light,owner:null,gain:0,lostFor:0}));
 const glowFixture={x:0,y:.5,z:0,dynamic:true,independent:true,distance:5.8,intensity:28,tint:0xc5f6d6,power:0,visibility:0,range:0,score:0};
 const lightCandidates=[...fixtures,...stairLamps,glowFixture];
 const naiwaSpot=new T.SpotLight(0xe5edf2,0,4.5,.38,.8,2);
 naiwaSpot.name='NaiWa encounter spotlight';naiwaSpot.visible=false;
 root.add(naiwaSpot,naiwaSpot.target);
 let spotDonor=null,spotIntensity=0;
 const focus=new T.Vector3(),eye=new T.Vector3(),direction=new T.Vector3(),projection=new T.Vector3();
 let approachShadow=null;
 if(f.scenes?.length&&f.id!==8){
  const pixels=new Uint8Array(48*72*4);
  for(let j=0;j<72;j++)for(let i=0;i<48;i++){
   const u=i/47,v=j/71,head=Math.hypot((u-.55)/.13,(v-.74)/.115);
   const shoulders=Math.hypot((u-.49)/.27,(v-.48)/.17),body=Math.hypot((u-.46)/.20,(v-.23)/.37);
   const edge=Math.min(head,shoulders,body),alpha=1-T.MathUtils.smoothstep(edge,.73,1.4);
   pixels.set([12,14,12,Math.round(215*alpha*T.MathUtils.smoothstep(v,0,.15))],(j*48+i)*4);
  }
  const map=new T.DataTexture(pixels,48,72);map.needsUpdate=true;map.minFilter=map.magFilter=T.LinearFilter;textures.push(map);
  approachShadow=mesh(root,new T.PlaneGeometry(1.18,2.06),basic(0xffffff,{map,transparent:true,depthWrite:false}),0,1.19,0);
  approachShadow.name='passing-shadow';approachShadow.visible=false;
 }
 const bake=bakeHallLight(f,fixtures,root,materials),bakedMaterials=bake?materials.filter(m=>m.lightMap===bake):[];
 if(bake)textures.push(bake);let previousCircuit=-1;
 const roomOccluders=(f.sightObstacles||[]).filter(b=>b.maxY>f.base&&b.minY<f.base+3);
 const wardWindow=mats.wiredWindow?.userData.face;
 const emptyPane=wardWindow?(surfaceMaps.emptyPane??=serviceWindow(true)):null,occupiedPane=mats.wiredWindow?.map;
 const wardFigure=wardWindow?new T.Sphere(new T.Vector3(wardWindow.x,f.base+2.12,wardWindow.z),.48):null;
 const wardFrustum=wardWindow?new T.Frustum():null,wardMatrix=wardWindow?new T.Matrix4():null;
 function update(dt,camera,time,game,reduced){
  const s=game.states[f.id],threat=!game.debugCalm&&game.threat?.floor===f.id?game.threat:null;
  const shaftTime=game.time??time;
  if(portraitFlakes){
   const play=s.stonePlayback;
   portraitFlakes.visible=!!play;
   if(play){
    const age=shaftTime-play.startedAt,period=2.2;
    portraitFlakes.position.set(play.site.x,play.site.target.y,play.site.z);
    portraitFlakes.count=Math.min(12,1+Math.floor(age/period*12));
    for(let i=0;i<portraitFlakes.count;i++){
     const t=((age/period-i/12)%1+1)%1,angle=i*2.4+t*1.2,r=.06+t*.62;
     flakePose.position.set(Math.cos(angle)*r,t*(1.4-t*.24),Math.sin(angle)*r);
     flakePose.rotation.set(Math.sin(angle)*.32,angle+t*2,Math.sin(t*5+i)*.45);
     flakePose.scale.setScalar(Math.min(1,t*12,(1-t)*5));
     flakePose.updateMatrix();portraitFlakes.setMatrixAt(i,flakePose.matrix);
    }
    portraitFlakes.instanceMatrix.needsUpdate=true;
   }
  }
  for(const {slide,group} of shaftSlides)group.position.x=shaftSlideOffset(slide,s,shaftTime);
  const returner=threat?.kind==='rush';
  const sweep=['patrol','rush'].includes(threat?.kind)?sweepTiming(threat):null;
  const warning=sweep?.phase==='warning'||sweep?.phase==='return-warning';
  const warningFront=warning?(sweep.wave===2?1-sweep.elapsed/sweep.duration:sweep.elapsed/sweep.duration):null;
  const pitchDark=f.gunmuFinale&&s.gunmuStage==='pipes';
  const circuit=game.debugCalm?1:pitchDark?0:patrolCircuitPower(threat,s.blackout,reduced);
  const pale=visitorLightBlend(threat,reduced);
  const indirect=returner?circuit*.33:circuit*(1-.67*pale);
  if(indirect!==previousCircuit){for(const m of bakedMaterials)m.lightMapIntensity=.72*indirect;previousCircuit=indirect;}
  portalLight.color.setHex(0xd7ce99).lerp(paleLight,pale).multiplyScalar(indirect);spill.opacity=indirect;
  const listener=game.threat?.kind==='liang'?game.threat:game.auxiliary?.kind==='liang'?game.auxiliary:null;
  for(const d of doors){
   if(d.falseDoor){d.frame.visible=!d.data.vanished;d.seal.visible=!!d.data.vanished;if(d.data.vanished)continue;}
   let amount=d.data.amount||0;
   if(d.shutter){
    const underPressure=d.torn&&game.threat?.phase==='breaching'&&!reduced;
    d.pivot.position.y=amount*2.78;
    d.pivot.position.z=underPressure?.021*Math.sin(time*26)*Math.max(0,Math.sin(time*4))**6:0;
    if(d.torn){
     d.torn.visible=!!d.data.broken;
     d.pivot.rotation.x=d.data.broken?amount*.16:0;
     d.pivot.rotation.z=d.data.broken?amount*.057:0;
    }
    continue;
   }
   if(d.chasePush){
    const a=game.chaseAction,pressed=a?.kind==='push'&&a.id===d.id?T.MathUtils.smoothstep(a.elapsed/a.duration,0,1):0;
    const flex=d.data.open?0:pressed*.16;
    d.flex=T.MathUtils.damp(d.flex||0,flex,18,dt);
    amount=Math.max(amount,.065+d.flex);
   }
   d.pivot.rotation.y=amount*Math.PI/2*(d.data.swing||1);d.dm.color.setHex(d.kind==='wood'?0x756149:d.data.locked?0x485046:0x46574c);
   if(listener?.floor===f.id&&listener.waitingDoor===d.id){
    const t=.7-(listener.openAfter-listener.age),ease=T.MathUtils.smoothstep;
    d.handle.rotation.z=.76*(ease(t,0,.14)-.52*ease(t,.21,.35)+.52*ease(t,.40,.58));
   }else if(d.handle.rotation.z>0)d.handle.rotation.z=Math.max(0,d.handle.rotation.z-dt*5);
  }
  for(const r of records){
   if(r.shaftSwitch){
    const progress=shaftSlideProgress(r.i,s,shaftTime);
    r.shaftSwitch.button.position.z=.098-.018*Math.sin(progress*Math.PI*.5);
    r.shaftSwitch.pilot.color.setHex(progress===1?0xb7dec0:progress>0?0xf8cd71:0xffb667);
   }
   if(r.isolationLever){
    const {lever,pilot}=r.isolationLever,monster=game.threat;
    const used=!!s.gunmuStage&&s.gunmuStage!=='lure';
    const ready=!used&&monster?.kind==='doubao'&&monster.floor===f.id&&within(monster,f.gunmuFinale.trap.bounds,-.34);
    lever.rotation.x=T.MathUtils.damp(lever.rotation.x,used?.65:-.63,12,dt);
    pilot.emissive.setHex(used?0xb95032:ready?0xc9dc93:0xf2ad56);
    pilot.emissiveIntensity=ready?.92:.27;
   }
   if(r.motion){
    const open=!!s.searched?.[r.i.id],search=game.searching;
    const progress=open?1:search?.id===r.i.id?T.MathUtils.clamp(search.elapsed/(search.duration||.5),0,1):0;
    const eased=T.MathUtils.smoothstep(progress,0,1);
    if(r.i.crooked)r.motion.rotation.z=-.052*(1-eased);
    if(r.i.form==='drawer')r.motion.position.z=(r.i.ajar?.055:0)+.31*eased;else r.motion.rotation.y=-(r.i.form==='painting'?.95:1.23)*eased;
    if(r.pocket){
     const kind=s.loot?.[r.i.id];
     if(ITEM_NAMES[kind]&&r.pocketItem!==kind)stockPocket(r,kind);
     r.pocket.visible=progress>.12&&!!kind;
    }
   }
   if(r.indicator)r.indicator.material.color.setHex(s.doors?.find(d=>d.id===f.exitGateId)?.locked===false?0x98c9ac:0xb29661);
   if(r.depotPaper){
    const found=s.depotFinds?.[r.i.id],digit=found?.digit??null,ordinal=found?found.slot+1:null;
    if(r.depotDigit!==digit||r.depotOrdinal!==ordinal){
     r.depotDigit=digit;r.depotOrdinal=ordinal;r.depotPaper.material.map.userData.redraw();
    }
    if(r.depotCrate){
     const c=r.depotCrate,action=game.depotCrateAction,open=!!(found||s.depotCrates?.[r.i.id]);
     c.progress=open?1:action?.id===r.i.id?action.elapsed/action.duration:T.MathUtils.damp(c.progress,0,17,dt);
     c.tray.position.x=r.i.crate.slide*T.MathUtils.smoothstep(c.progress,.05,.87);
     c.lid.rotation.x=-1.35*T.MathUtils.smoothstep(c.progress,.57,1);
     r.depotPaper.visible=c.progress>.74;
    }
   }
   if(r.alarmHand){
    const alarm=s.depotAlarms?.[r.i.id],clock=game.time??time;
    const ringing=!!alarm&&clock>=alarm.ringAt&&clock<alarm.ringEnd;
    const remaining=alarm?Math.max(0,alarm.ringAt-clock):0;
    r.alarmHand.rotation.z=ringing?Math.sin(clock*22)*.36:-remaining*Math.PI*.48;
    r.alarmBody.rotation.z=ringing?Math.sin(clock*(reduced?12:29))*(reduced?.04:.17):0;
   }
   if(r.lureLamp){
    const clock=game.time??time,lure=s.depotAlarms?.[r.i.id];
    const elapsed=lure?clock-lure.ringAt:-Infinity;
    const ringing=elapsed>=0&&clock<lure.ringEnd,armed=!!lure&&elapsed<0;
    const pulse=reduced?.72:.73+.25*Math.cos(clock*7);
    r.lureLamp.emissiveIntensity=armed?.38:ringing?pulse:.04;
    if(r.speakerLamp)r.speakerLamp.emissiveIntensity=ringing?pulse:0;
    if(r.chuteTray){
     const travel=T.MathUtils.smoothstep(elapsed,-.39,.05);
     const bounce=ringing&&!reduced?Math.max(0,1-elapsed/.9)*Math.sin(elapsed*35):0;
     r.chuteLever.rotation.x=T.MathUtils.damp(r.chuteLever.rotation.x,lure?.78:-.28,14,dt);
     r.chuteTray.position.x=.40-.82*travel;
     r.chuteTray.position.y=1.331-.204*travel+.024*bounce;
     r.chuteTray.rotation.z=.25*(1-travel)+.063*bounce;
    }
   }
   if(r.torch)r.torch.visible=!s.flashlight;
   if(r.bellLever)r.bellLever.rotation.x=s.interactions?.[r.i.id]?.6:-.55;
   if(r.chaseBoard){
    const board=s.chaseBoards?.[r.i.id],clock=game.time??time;
    const swing=board?T.MathUtils.smoothstep(clock-board.startedAt,0,CHASE_BOARD_DROP):0;
    const folding=board?T.MathUtils.smoothstep(clock-board.blockUntil,0,.24):0;
    r.chaseBoard.hinge.rotation.y=(swing-1)*Math.PI/2;
    r.chaseBoard.panel.rotation.x=-folding*Math.PI/2;
   }
   if(r.marker)r.marker.visible=!s.traversals?.[r.traversalId];
   if(r.grate){
    r.grate.rotation.x=T.MathUtils.damp(r.grate.rotation.x,s.ventSealed?0:-1.46,20,dt);
   }
   if(r.wardrobe){const hidden=!!s.interactions?.[r.data.id];if(r.wasHidden!==hidden){if(r.wasHidden!==undefined)r.pulse=.45;r.wasHidden=hidden;}r.pulse=Math.max(0,(r.pulse||0)-dt);for(const door of r.wardrobe)door.hinge.rotation.y=T.MathUtils.damp(door.hinge.rotation.y,r.pulse?door.side*.65:0,12,dt);}
  }
  for(const v of vaults){v.group.visible=!s.traversals?.[v.id];v.fallen.visible=!v.group.visible;}
  for(const record of hazardRecords){
   const {hazard,body,signal,dust,width}=record,age=chaseHazardAge(f,s,hazard,game.time??time),pose=chaseHazardPose(hazard,age);
   record.age=age;record.lit=age>=0&&pose.phase!=='settled';
   record.pulse=record.lit?(reduced||game.debugCalm?.65:.65+.35*Math.sin(age*17)):0;
   body.position.y=pose.centerY;body.scale.y=pose.scaleY;
   body.userData.phase=pose.phase;body.userData.pose=pose;signal.userData.phase=pose.phase;
   signal.userData.material.emissiveIntensity=record.lit?.30+record.pulse*.95:.02;
   signal.userData.material.color.setHex(record.lit?0xe9a052:0x675c48);
   const dustAge=age-hazard.warning;
   dust.visible=dustAge>=0&&dustAge<1.7;
   if(dust.visible){
    const positions=dust.geometry.attributes.position;
    for(let n=0;n<6;n++)positions.setXYZ(n,(n-2.5)*width/6+Math.sin(n*4)*dustAge*.09,Math.max(.07,2.55-dustAge*1.6-dustAge**2*(.32+n*.045)),Math.sin(n*7)*dustAge*.22);
    positions.needsUpdate=true;dust.material.opacity=.52*(1-dustAge/1.7);
   }
  }
  if(bellLens)bellLens.emissiveIntensity=.07+1.35*Math.max(0,1-((game.time??time)-(s.bellAt??-Infinity))/.8);
  if(fan){
   fanBacklight.emissiveIntensity=circuit;
   const clock=game.time??time;fan.rotation.z=clock*(reduced?.86:2.1);
   const age=clock-(s.clothAt??-Infinity);
   for(const [index,curtain] of curtains.entries()){
    const sway=index===s.clothIndex&&age>=0&&age<1.8?Math.sin(age*8)*Math.exp(-age*2.2):0;
    curtain.rotation.x=sway*(reduced?.10:.24);
   }
   const strike=clock-(s.metalAt??-Infinity);
   bridge.rotation.z=strike>=0&&strike<.4&&!reduced?Math.sin(strike*29)*Math.exp(-strike*9)*.006:0;
  }
  const active=game.player.floor===f.id;for(const light of lights){if(active&&light.parent!==root)root.add(light);else if(!active&&light.parent)light.removeFromParent();}
  if(wardrobeWash){
   const power=active&&threat?.kind==='patrol'?(sweep.phase==='warning'?1:
    sweep.phase==='sweeping'?1-T.MathUtils.smoothstep(sweep.elapsed,0,.55):0):0;
   wardrobeBulb.emissiveIntensity=1.1*power;
   wardrobeWash.visible=power>.015;wardrobeWash.material.opacity=.78*power;
  }
  const blockers=roomOccluders.concat((s.doors||[]).filter(d=>d.block).map(d=>({...d.block,minY:f.base,maxY:f.base+2.6}))),view=camera.position;
  const hunter=game.threat;
  kunFan.visible=active&&hunter?.kind==='kun'&&hunter.floor===f.id&&!['dormant','leaving'].includes(hunter.phase)&&!s.chaseEscaped&&(game.mode??'playing')==='playing';
  if(kunFan.visible){
   const heading=hunter.heading??0,length=5.1,halfAngle=.60;
   fanPositions.set([hunter.x,0,hunter.z]);kunFan.userData.heading=heading;
   kunFanMaterial.uniforms.uOrigin.value.set(hunter.x,hunter.z);kunFanMaterial.uniforms.uForward.value.set(-Math.sin(heading),-Math.cos(heading));
   for(let i=0;i<kunFanRays;i++){
    const angle=heading-halfAngle+i/(kunFanRays-1)*halfAngle*2,dx=-Math.sin(angle),dz=-Math.cos(angle);
    let distance=length;
    for(const b of blockers){
     if(b.minY>f.base+.25||b.maxY<f.base+.024)continue;
     distance=floorLightRay(hunter.x,hunter.z,dx,dz,distance,b);
    }
    fanPositions.set([hunter.x+dx*distance,0,hunter.z+dz*distance],(i+1)*3);
   }
   kunFanGeometry.attributes.position.needsUpdate=true;
   const proximity=1-T.MathUtils.smoothstep(Math.hypot(view.x-hunter.x,view.z-hunter.z),3,12);
   kunFan.material.opacity=.30+proximity*.25+(hunter.fastPursuit?.07:0);
   kunFanMaterial.uniforms.uOpacity.value=kunFan.material.opacity;
  }
  if(wardWindow&&active){
   const memory=s.wardWindow??={noticed:0,away:0,gone:false};
   if(!memory.gone&&!game.debugCalm&&!threat&&!s.blackout&&dt>0){
    focus.set(wardWindow.x,f.base+2.14,wardWindow.z);
    projection.copy(focus).project(camera);
    const visible=projection.z>=-1&&projection.z<=1&&Math.abs(projection.x)<1&&Math.abs(projection.y)<1;
    if(visible&&view.distanceToSquared(focus)<49&&clearSight(view,focus,blockers)){memory.noticed+=dt;memory.away=0;}
    if(memory.noticed>=.38){
     wardFrustum.setFromProjectionMatrix(wardMatrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
     memory.away=wardFrustum.intersectsSphere(wardFigure)?0:memory.away+dt;
     if(memory.away>=.65)memory.gone=true;
    }
   }
   mats.wiredWindow.map=memory.gone?emptyPane:occupiedPane;
  }
  const omen=s.omen,clock=game.time??time;
  if(approachShadow)approachShadow.visible=false;
  if(active&&omen&&dt>0){
   if(omen.kind==='handle'){
    const d=doors.find(d=>d.id===f.exitGateId);
    if(d&&!d.data.open){
     if(omen.seenAt==null){
      // The player approaches the downstairs leaf from +X. Sample just in front of its real lever.
      d.handle.getWorldPosition(focus);focus.x+=.20;projection.copy(focus).project(camera);
      if(view.distanceTo(focus)<7&&Math.abs(projection.x)<.83&&Math.abs(projection.y)<.83&&projection.z>0&&projection.z<1&&clearSight(view,focus,blockers))omen.seenAt=clock;
     }
     if(omen.seenAt!=null){
      const t=clock-omen.seenAt;
      d.handle.rotation.z=.98*(T.MathUtils.smoothstep(t,0,.24)-T.MathUtils.smoothstep(t,.71,1.22));
     }
    }
   }else if(omen.kind==='approach'&&approachShadow){
    if(omen.seenAt==null){
     camera.getWorldDirection(direction);
     const horizontal=Math.hypot(direction.x,direction.z);
     if(horizontal>.4){
      const dx=direction.x/horizontal,dz=direction.z/horizontal;
      let nearest=15,hit;
      for(const w of shadowSurfaces){
       const alongX=w.maxX-w.minX>w.maxZ-w.minZ,component=alongX?dz:dx;if(Math.abs(component)<.04)continue;
       const normal=-Math.sign(component),face=alongX?(normal>0?w.maxZ:w.minZ):(normal>0?w.maxX:w.minX);
       const distance=(face-(alongX?view.z:view.x))/component;if(distance<1.15||distance>=nearest)continue;
       const across=alongX?view.x+dx*distance:view.z+dz*distance,min=alongX?w.minX:w.minZ,max=alongX?w.maxX:w.maxZ;
       if(max-min<1.55||across<min||across>max)continue;
       const center=T.MathUtils.clamp(across,min+.75,max-.75),mark={x:alongX?center:face+normal*.023,z:alongX?face+normal*.023:center,y:f.base+1.3};
       if(clearSight(view,mark,blockers)){nearest=distance;hit={x:mark.x,z:mark.z,yaw:alongX?(normal>0?0:Math.PI):normal*Math.PI/2};}
      }
      if(hit){omen.mark=hit;omen.seenAt=clock;}
     }
    }
    if(omen.mark){
     const t=(clock-omen.seenAt)/1.8,mark=omen.mark;
     if(t>=0&&t<1){
      const drift=(T.MathUtils.smoothstep(t,0,1)-.5)*.52;
      approachShadow.visible=true;approachShadow.position.set(mark.x+Math.cos(mark.yaw)*drift,1.16,mark.z-Math.sin(mark.yaw)*drift);approachShadow.rotation.y=mark.yaw;
      approachShadow.material.opacity=.70*(T.MathUtils.smoothstep(t,0,.23)-T.MathUtils.smoothstep(t,.62,1));
     }
    }
   }
  }
  const stick=s.glowstick;
  glow.visible=active&&!!stick&&stick.age<stick.life;
  glowFixture.score=0;glowFixture.power=0;
  if(glow.visible){
   const flight=Math.min(1,stick.age/(stick.flight??.35)),fall=T.MathUtils.lerp(1.22,.034,flight)+Math.sin(Math.PI*flight)*.44;
   glow.position.set(T.MathUtils.lerp(stick.fromX,stick.x,flight),0,T.MathUtils.lerp(stick.fromZ,stick.z,flight));
   glowBody.position.y=fall;glowBody.rotation.set(0,(game.seed||0)%6.28,reduced?.12:.12+Math.PI*2*flight);glowShell.opacity=Math.min(1,(stick.life-stick.age)/1.2);
   patch.material.opacity=.62*glowShell.opacity*(1-Math.min(1,fall/1.8));patch.scale.setScalar(1+fall*.17);
   glowFixture.x=glow.position.x;glowFixture.z=glow.position.z;glowFixture.y=fall+1;glowFixture.power=glowShell.opacity;
   const distance=Math.hypot(glowFixture.x-view.x,glowFixture.z-view.z);
   focus.set(glowFixture.x,f.base+fall+.18,glowFixture.z);
   glowFixture.visibility=clearSight(view,focus,blockers)?1:0;
   glowFixture.range=1-T.MathUtils.smoothstep(distance,5.8,8);
   glowFixture.score=glowFixture.visibility*glowFixture.range*2.1/(1+distance*.15);
  }
  for(const lamp of fixtures){
   let power=game.debugCalm?1:lampPower(lamp,time,reduced)*lamp.output;
   if(threat?.kind==='inspector')power*=threat.phase==='checking'?.52:.78;
   power*=1+.48*pale;
   const emergency=hazardRecords.find(r=>r.lit&&Math.hypot(lamp.x-r.hazard.cue.x,lamp.z-r.hazard.cue.z)<5.3);
   if(emergency&&!game.debugCalm)power*=reduced?.62+.15*Math.cos(emergency.age*2):.24+.52*emergency.pulse;
   const distance=Math.hypot(lamp.x-view.x,lamp.z-view.z);
   if(warning)power=lamp.output*(.35+.65*T.MathUtils.smoothstep(Math.abs(lamp.routeFraction-warningFront),0,.24));
   lamp.power=power;lamp.range=1-T.MathUtils.smoothstep(distance,6.5,9);
   lamp.tint=emergency?0xe8ad69:returner?0xc8ddff:pale?bulbColor.setHex(lamp.normalTint).lerp(paleLight,pale).getHex():lamp.normalTint;
   tubes.setColorAt(lamp.index,bulbColor.setHex(lamp.tint).multiplyScalar(power*circuit));
   let visible=0;
   if(active&&lamp.range>0){
    if(game.debugCalm)visible=1;
    else for(const offset of [-.28,0,.28]){focus.set(lamp.x+offset,f.base+lamp.y-.3,lamp.z);if(clearSight(view,focus,blockers))visible+=1/3;}
   }
   lamp.visibility=lamp.visibility===undefined?visible:T.MathUtils.damp(lamp.visibility,visible,visible>lamp.visibility?15:22,dt);
   lamp.score=active?lamp.visibility*lamp.range/(1+distance*.20):0;
  }
  if(tubes.instanceColor)tubes.instanceColor.needsUpdate=true;
  const stairBlend=1-T.MathUtils.smoothstep(view.x,7.45,8.7);
  for(const lamp of stairLamps){
   focus.set(lamp.x,f.base+lamp.y-.3,lamp.z);
   const distance=focus.distanceTo(view);
   lamp.range=stairBlend*(1-T.MathUtils.smoothstep(distance,3.2,6.3));
   const visible=lamp.range>0&&clearSight(view,focus,blockers)?1:0;
   lamp.visibility=T.MathUtils.damp(lamp.visibility??visible,visible,12,dt);
   lamp.score=lamp.visibility*lamp.range*1.6/(1+distance*.20);
  }
  updateLightSlots(slots,lightCandidates,dt,circuit);
  const creeper=threat?.kind==='naiwa'?threat:game.auxiliary?.kind==='naiwa'?game.auxiliary:null;
 const crawler=pitchDark&&hunter?.kind==='doubao'&&hunter.phase==='crawling'?hunter:null;
 const subject=crawler||creeper;
  const acrossShaft=gunmuVisibleAcrossTurn(f.gunmuFinale,s.gunmuPipeIndex,crawler);
  let spotPower=0;
 if(active&&subject?.floor===f.id&&(crawler||subject.age>=subject.warning-.35)){
  const y=(subject.y??f.base)-f.base,dx=view.x-subject.x,dz=view.z-subject.z,groundDistance=Math.hypot(dx,dz);
  focus.set(subject.x,f.base+y+(crawler?.52:1.15),subject.z);
   const distance=crawler?focus.distanceTo(view):groundDistance,range=acrossShaft?70:crawler?20:15;
  if(distance<range&&clearSight(view,focus,blockers)){
   const front=.62/Math.max(.62,groundDistance),side=crawler?.46/Math.max(.62,groundDistance):0;
   naiwaSpot.color.setHex(acrossShaft?0xa9cbf2:crawler?0xcbdce8:0xe5edf2);
   naiwaSpot.distance=acrossShaft?6.6:crawler?3.45:4.5;
   naiwaSpot.angle=acrossShaft?.65:crawler?.47:.38;
   naiwaSpot.position.set(subject.x+dx*front-dz*side,y+(acrossShaft?3.35:crawler?1.92:2.75),subject.z+dz*front+dx*side);
   naiwaSpot.target.position.set(subject.x,y+(crawler?.48:.82),subject.z);
   // The shaft's main circuit is off. Light the crawler from the side independently of it.
   spotPower=(acrossShaft?82:crawler?11.5:13*circuit)*(1-T.MathUtils.smoothstep(distance,acrossShaft?56:crawler?12:8,range));
  }
  }
  spotIntensity=active?T.MathUtils.damp(spotIntensity,spotPower,spotPower>0?9:16,dt):0;
  const spotLit=spotIntensity>.015;
  naiwaSpot.intensity=spotLit?spotIntensity:0;
  // Keep the shaft shader ready so revealing the crawler around a turn doesn't recompile the scenery.
  naiwaSpot.visible=spotLit||!!(active&&pitchDark&&!game.debugCalm);
  if(spotLit&&!spotDonor)spotDonor=lights.reduce((dim,light)=>light.intensity<dim.intensity?light:dim);
  if(!spotLit)spotDonor=null;
  // In the dark pipe shaft, five zero-intensity bulbs still run five lighting calculations per pixel.
  const useBulbs=active&&(!pitchDark||game.debugCalm||lights.some(light=>light.intensity>0));
  for(const light of lights)light.visible=useBulbs&&light!==spotDonor;
  visitorPools.count=0;
  if(threat?.kind==='yujie'&&threat.age>=threat.warning&&(game.mode??'playing')==='playing'){
   const opacity=threat.phase==='leaving'?Math.max(0,1-(threat.retreat||0)/1.3):1;
   visitorPools.material.opacity=.34*opacity;
   for(const p of (threat.copies?.length?threat.copies:[threat])){
    if(visitorPools.count===3)break;
    if(p.floor!==f.id)continue;
    const y=p.y??f.base;
    focus.set(p.x,y+.68,p.z);
    if(!clearSight(view,focus,blockers))continue;
    const index=visitorPools.count++;
    visitorPools.setMatrixAt(index,visitorPose.makeTranslation(p.x,y-f.base+.017,p.z));
   }
  }
  visitorPools.visible=visitorPools.count>0&&visitorPools.material.opacity>.015;
  if(visitorPools.visible)visitorPools.instanceMatrix.needsUpdate=true;
  const thrown=s.wardThrow;
  ward.visible=active&&!!thrown&&thrown.age<thrown.life;
  if(ward.visible){
   const flight=thrown.flight??.55,t=Math.min(1,thrown.age/flight),burst=Math.max(0,(thrown.age-flight)/Math.max(.1,thrown.life-flight));
   ward.position.set(T.MathUtils.lerp(thrown.fromX,thrown.x,t),0,T.MathUtils.lerp(thrown.fromZ,thrown.z,t));
   wardBody.visible=t<1;
   wardBody.position.y=T.MathUtils.lerp(1.15,.08,t)+Math.sin(Math.PI*t)*1.30;
   wardBody.rotation.set(reduced?0:-.20+t*3.1,Math.atan2(thrown.x-thrown.fromX,thrown.z-thrown.fromZ),reduced?.06:Math.sin(t*7)*.18);
   wardBurst.visible=t>=1;wardBurst.material.opacity=(thrown.hit?.82:.60)*(1-T.MathUtils.smoothstep(burst,.12,1));
   if(wardBurst.visible){
    for(let i=0;i<12;i++){
     const angle=i*Math.PI*2/12,radius=.08+burst*(.65+(i%3)*.14);
     wardPosition.set(Math.cos(angle)*radius,.12+Math.sin(burst*Math.PI)*(.27+(i%4)*.07),Math.sin(angle)*radius);
     wardRotation.copy(camera.quaternion);
     if(!reduced)wardRotation.multiply(wardTwist.setFromAxisAngle(wardAxis,angle+burst*2.4));
     wardScale.setScalar(.85+(i%3)*.15);wardPose.compose(wardPosition,wardRotation,wardScale);wardBurst.setMatrixAt(i,wardPose);
    }
    wardBurst.instanceMatrix.needsUpdate=true;
   }
  }
  if(quietSites.length&&active&&s.quietEnabled!==false){
   const seed=((game.seed||0)^Math.imul(f.id,0x45d9f3b))>>>0,site=quietSites[seed%quietSites.length];
   quietRoot.position.set(site.x,0,site.z);quietRoot.rotation.y=(site.yaw||0)+((seed%7)-3)*.024;
   const quiet=s.quietEvent??={seen:0,hidden:0,gone:false};
   quietRoot.visible=!quiet.gone;
   if(!quiet.gone&&dt>0&&(game.time??1)>0){
    eye.copy(view);camera.getWorldDirection(direction);focus.set(site.x,f.base+1.14,site.z);
    projection.copy(focus).sub(eye);
    const inFrame=direction.dot(projection)>0&&Math.abs(projection.copy(focus).project(camera).x)<.96&&Math.abs(projection.y)<.96;
    const blockedSite=[.5,1.15,1.68].every(y=>!clearSight(eye,{x:site.x,y:f.base+y,z:site.z},blockers));
    if(!threat&&inFrame&&!blockedSite&&eye.distanceTo(focus)<25)quiet.seen+=dt;
    if(quiet.seen>=.18){quiet.hidden=blockedSite?quiet.hidden+dt:0;if(quiet.hidden>.26){quiet.gone=true;quietRoot.visible=false;}}
   }
   for(const shutter of shutters)if(shutter.site===site)shutter.hinge.rotation.y=T.MathUtils.damp(shutter.hinge.rotation.y,quiet.gone?0:-shutter.side*1.48,7,dt);
  }else {quietRoot.visible=false;if(s.quietEnabled===false)for(const shutter of shutters)shutter.hinge.rotation.y=0;}

 }
 return{root,doors,interactables,fixtures,lights,stairGroups,materials:mats,update,localize(){for(const texture of labels)texture.userData.redraw();},dispose(){scene.remove(root);root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(!o.isMesh&&!o.isPoints)return;for(let p=o;p;p=p.parent)if(p.userData.sharedModel)return;o.geometry.dispose();});materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
