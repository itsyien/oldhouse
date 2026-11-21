import * as T from 'three';

// Bed coordinates run from the head (-X) to the foot (+X). The damaged rail faces the aisle (+Z).
export function buildHospitalBed(p, yaw, queue, m) {
 const width = Math.min(1.02, Math.min(p.w,p.d)-.035);
 const slotLength = Math.max(p.w,p.d);
 const length = Math.min(slotLength-.06, 2.12);
 const wardBed = Math.min(p.w,p.d) > 1.15;
 const stripped = Math.min(p.w,p.d)<.7 && p.z>0;
 const cx=p.x+p.w/2, cz=p.z+p.d/2;
 const half=length/2, side=width/2, head=-half+.06, foot=half-.06;
 const deck=.48, top=.65;
 function put(g,material) {
  g.rotateY(yaw);g.translate(cx,0,cz);queue(g,material);
 }
 function slab(x,y,z,w,h,d,material,roll=0) {
  const g=new T.BoxGeometry(w,h,d);
  if(roll)g.rotateZ(roll);
  g.translate(x,y,z);put(g,material);
 }
 function tube(points,r,material) {
  const pts=points.map(([x,y,z])=>new T.Vector3(x,y,z));
  const curve=pts.length===2?new T.LineCurve3(...pts):new T.CatmullRomCurve3(pts);
  put(new T.TubeGeometry(curve,pts.length===2?1:pts.length*3,r,7,false),material);
 }
 function wheel(x,y,z,r,d,material) {
  const g=new T.CylinderGeometry(r,r,d,12);g.rotateX(Math.PI/2);g.translate(x,y,z);put(g,material);
 }
 // Sheet, ticking, and foam edge share the wall-curtain batch. Pigment follows seams and folds.
 function cloth(g,position) {
  const pos=g.attributes.position,colors=[];
  for(let i=0;i<pos.count;i++) {
   const [x,y,z,r,green,b]=position(pos.getX(i),pos.getY(i),pos.getZ(i));
   pos.setXYZ(i,x,y,z);colors.push(r,green,b);
  }
  g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();put(g,m.linen);
 }

 for(const end of [head,foot])for(const rail of [-1,1]) {
  const z=rail*(side-.055),damaged=end===foot&&rail===1;
  const x=end+(end===head?.095:-.095);
  if(damaged&&wardBed){
   // The missing caster was wedged with a scrap of timber. Its rubber wheel lies flat beside it.
   slab(x,.039,z-.012,.15,.078,.098,m.wood);
   tube([[x,.44,z],[x-.025,.21,z-.018],[x-.045,.078,z]],.026,m.oxide);
   const wheelX=x+.09,wheelZ=z-.125;
   const rubber=new T.CylinderGeometry(.08,.082,.037,14);rubber.translate(wheelX,.019,wheelZ);put(rubber,m.dark);
   const hub=new T.CylinderGeometry(.033,.038,.013,12);hub.translate(wheelX,.042,wheelZ);put(hub,m.metal);
   continue;
  }
  slab(x,.355,z,.053,.275,.055,m.metal,damaged?-.16:0);
  const wx=x+(damaged?.11:.018),wy=.084;
  for(const flange of [-1,1])slab(wx-.017,.143,z+flange*.037,.042,.13,.013,m.oxide,damaged?-.41:-.12);
  wheel(wx,wy,z,.084,.064,m.dark);wheel(wx,wy,z+rail*.035,.040,.008,m.metal);
 }
 for(const z of [-side+.045,side-.045])slab(0,deck-.03,z,length-.08,.06,.06,m.oxide);
 for(let j=0;j<11;j++){
  const x=head+(foot-head)*j/10;
  slab(x,deck-.012,0,.074,.028,width-.10,j%3===0?m.wood:m.metal);
 }

 for(const [x,rise] of [[head,1.13],[foot,.91]]){
  const z=side-.052;
  const sag=wardBed&&x===head?.145:0;
  tube([[x,deck,-z],[x,rise-.12,-z],[x,rise,-z+.075],[x,rise+.012,0],[x+.035,rise-sag,z-.075],[x+.025,rise-.12-sag,z],[x,deck,z]],.028,m.cream);
  tube([[x,.69,-z],[x,.69,z]],.019,m.metal);
  for(const fraction of [-.54,0,.54])tube([[x,.69,z*fraction],[x,rise-Math.max(0,fraction)*sag,z*fraction]],.013,m.metal);
  tube([[x,.54,-z],[x,.62,-z]],.0285,m.oxide);
 }
 const railStart=head+.13,railEnd=foot-.13,railZ=side-.028;
 tube([[railStart,deck,-railZ],[railStart,.78,-railZ],[railStart+.08,.85,-railZ],[railEnd-.08,.85,-railZ],[railEnd,.78,-railZ],[railEnd,deck,-railZ]],.021,m.metal);
 // One pivot sheared away. The hanging bar stops short of the loose caster.
 tube([[railStart+.11,deck,railZ],[railStart+.11,.66,railZ],[railStart+.20,.70,railZ],[.03,.56,railZ+.006],[railEnd-.07,.315,railZ-.014]],.025,m.cream);
 tube([[railStart+.40,.50,railZ],[railStart+.40,.675,railZ]],.017,m.oxide);
 tube([[railEnd-.20,deck,railZ],[railEnd-.15,.38,railZ],[railEnd-.07,.315,railZ-.014]],.017,m.metal);

 // The jagged end of the mattress exposes real slats. The compressions also shape its side seam.
 const endX=half-(stripped?.66:wardBed?.45:.31);
 cloth(new T.BoxGeometry(1,1,1,16,1,10),(bx,by,bz)=>{
  const u=bx+.5,v=bz+.5;
  const tear=.10*Math.abs(Math.sin(v*11))+.10*Math.max(0,Math.sin(v*23+.7));
  const x=T.MathUtils.lerp(head+.04,endX-tear,u),z=bz*(width-.125);
  const trough=.047*Math.exp(-(((x+.14)/.44)**2+(z/.30)**2));
  const rim=.027*(Math.abs(bx*2)**8+Math.abs(bz*2)**8);
  const y=by>0?top-trough-rim:deck+.012;
  const thread=u>.94?.61+.09*Math.sin(43*v):.86+.035*Math.cos(v*15.5);
  return [x,y,z,thread,thread*(u>.94?.80:.93),thread*(u>.94?.55:.76)];
 });

 if(!stripped){
  // Wrinkled pillow with a concave hollow in its stuffing where a head rested.
  cloth(new T.SphereGeometry(1,18,12),(a,b,c)=>{
   const ax=Math.sign(a)*Math.pow(Math.abs(a),.76),az=Math.sign(c)*Math.pow(Math.abs(c),.72);
   const hollow=.080*Math.exp(-((ax/.48)**2+(az/.48)**2))*Math.max(0,b);
   const y=top+.038+b*.09-hollow;
   const edge=.05*Math.sin(az*17+ax*4)*Math.abs(ax)**2;
   const shade=.88-.14*Math.exp(-((ax/.42)**2+(az/.42)**2))+.04*Math.sin(az*21)*Math.abs(ax);
   return [head+.33+ax*.27+edge,y,az*width*.36+.025,shade,shade*.98,shade*.85];
  });
 }
 const clothEnd=stripped?-.19:endX-.14,clothStart=stripped?head+.07:head+.53;
 cloth(new T.PlaneGeometry(1,1,27,22),(px,py)=>{
  const u=px+.5,v=.5-py;
  const notch=.22*Math.max(0,1-Math.abs(v-.44)/.075)+.09*Math.max(0,1-Math.abs(v-.77)/.06);
  const x=T.MathUtils.lerp(clothStart+.17*Math.sin(v*4+.3),clothEnd-notch-.11*v,u);
  const edge=.74+.12*Math.cos(u*4.7),over=Math.max(0,(v-edge)/(1-edge));
  const z=T.MathUtils.lerp(-side+.095+.08*u,side-.046,Math.min(v/edge,1))+.035*over*Math.sin(u*13);
  // Two creases fan from the trapped corner; the rest of the sheet sinks between them.
  const creaseA=Math.exp(-(((u-.18-v*.46)/(.045+.045*v))**2));
  const creaseB=Math.exp(-(((u-.68+v*.21)/.056)**2));
  const dip=Math.exp(-(((u-.42)/.23)**2+((v-.40)/.3)**2));
  const ripple=.044*creaseA+.026*creaseB-.024*dip+.008*Math.sin(27*u+15*v)*v;
  const hem=.085+.30*Math.exp(-(((u-.27)/.23)**2))+.09*u;
  const y=top+.039+ripple-hem*over;
  const ragged=.13*Math.sin(17*v+9*u)+.14*Math.sin(19*u-7*v);
  const water=Math.max(0,1-(((u-.68)/.44)**2+((v-.55)/.42+ragged)**2));
  const val=.70+ripple*1.9-.16*over;
  return [x,y,z,val*(.89-.25*water),val*(.96-.47*water),val*(.83-.51*water)];
 });
 // A yellowed bed ticket tied to the footboard; its ruling reads as ink without UI or lettering.
 const tagZ=-side*.32;
 tube([[foot+.012,.908,tagZ],[foot+.032,.852,tagZ+.018]],.006,m.dark);
 slab(foot+.036,.795,tagZ,.008,.115,.126,m.paper);
 for(let i=0;i<3;i++)slab(foot+.041,.812-i*.021,tagZ-.015,.003,.003,.058+i*.008,m.wood);

 if(wardBed){
  // The interrupted pair of wheel tracks leads back to the bed from the entrance.
  for(const rail of [-1,1]){
   const rubs=rail===1?[[.04,.61],[.71,.93],[1.13,1.72],[1.83,1.94]]:[[.01,.36],[.46,1.26],[1.48,1.87]];
   for(const [start,end] of rubs){
    cloth(new T.PlaneGeometry(1,1,9,1),(px,py)=>{
     const u=px+.5,d=start+(end-start)*u;
     const taper=Math.max(.03,Math.sin(Math.PI*u)),jag=.62+.38*Math.sin(43*d+rail);
     const x=head+.10-d,z=rail*(side-.055)+.075*d*d+.044*Math.sin(3*d)+py*taper*jag*(rail===1?.058:.037);
     const v=.17+.13*(1-taper)+.07*jag;
     return [x,.005,z,v*.90,v*.86,v*.77];
    });
   }
  }
  // An empty infusion stand, still caught on the far side of the head frame.
  const x=head+.18,z=-side-.22;
  tube([[x,.13,z],[x,1.63,z]],.018,m.metal);
  tube([[x-.13,1.59,z],[x-.12,1.68,z],[x,1.70,z],[x+.13,1.67,z],[x+.13,1.61,z]],.013,m.cream);
  for(let i=0;i<4;i++){
   const ax=x+Math.cos(i*Math.PI/2)*.16,az=z+Math.sin(i*Math.PI/2)*.13;
   tube([[x,.15,z],[ax,.045,az]],.014,m.metal);wheel(ax,.034,az,.034,.032,m.dark);
  }
 }else if(slotLength-length>.5){
  // A shallow enamel kidney tray and its tilted cup occupy the unused end of the stretcher bay.
  const x=half+(slotLength-length)*.23,z=-side*.18;
  const basin=new T.SphereGeometry(1,18,6,0,Math.PI*2,Math.PI/2,Math.PI/2);
  basin.scale(.14,.047,.092);basin.translate(x,.056,z);put(basin,m.cream);
  const lip=new T.TorusGeometry(1,.045,5,24);lip.rotateX(Math.PI/2);lip.scale(.14,.035,.092);lip.translate(x,.056,z);put(lip,m.metal);
  const cup=new T.CylinderGeometry(.047,.04,.098,12,1,true);cup.rotateZ(.94);cup.translate(x+.09,.066,z+.12);put(cup,m.oxide);
 }
}
