import * as T from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

export function buildBelongings(kind, {box, queue, m}, {x,z,yaw=0,variant=0}) {
 const c=Math.cos(yaw), s=Math.sin(yaw);
 function slab(lx,y,lz,w,h,d,mat,turn=0) {
  box(x+c*lx+s*lz,y,z-s*lx+c*lz,w,h,d,mat,yaw+turn);
 }
 function place(g,lx,y,lz,mat,turn=0,pitch=0,roll=0) {
  if(mat.vertexColors && !g.hasAttribute('color')) {
   const p=g.attributes.position, colors=[];
   for(let i=0;i<p.count;i++){
    const pigment=.85+.065*Math.cos(p.getX(i)*21+p.getY(i)*5);
    colors.push(pigment,pigment,pigment*.96);
   }
   g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  }
  g.rotateZ(roll);g.rotateX(pitch);g.rotateY(turn);g.translate(lx,y,lz);
  g.rotateY(yaw);g.translate(x,0,z);queue(g,mat);
 }
 function board(lx,y,lz,w,h,d,mat,pitch=0,roll=0,turn=0) {
  place(new T.BoxGeometry(w,h,d),lx,y,lz,mat,turn,pitch,roll);
 }
 function spindle(lx,y,lz,rTop,rBase,h,mat,pitch=0,roll=0) {
  place(new T.CylinderGeometry(rTop,rBase,h,12),lx,y,lz,mat,0,pitch,roll);
 }
 function bentWire(points,r,mat) {
  for(let j=1;j<points.length;j++){
   const a=new T.Vector3(...points[j-1]), b=new T.Vector3(...points[j]), delta=b.clone().sub(a);
   const g=new T.CylinderGeometry(r,r,delta.length(),7);
   g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize()));
   const middle=a.lerp(b,.5);place(g,middle.x,middle.y,middle.z,mat);
  }
 }
 function label(lx,y,lz,w,h) {
  slab(lx,y,lz,w,h,.004,m.paper);
  for(const [u,v,sw] of [[-.12,.17,.45],[-.08,-.01,.53],[-.19,-.24,.31]])
   slab(lx+u*w,y+v*h,lz+.003,sw*w,.007,.002,m.wood);
 }
 function tapeRoll(lx,y,lz) {
  const profile=[[.048,.035],[.048,-.035],[.087,-.035],[.087,.035],[.048,.035]];
  place(new T.LatheGeometry(profile.map(([u,v])=>new T.Vector2(u,v)),16),lx,y+.035,lz,m.wood);
  slab(lx+.106,y+.003,lz-.04,.08,.005,.043,m.paper,.25);
 }
 function cutBoard(outline,thickness){
  const shape=new T.Shape(outline.map(([u,v])=>new T.Vector2(u,v)));
  // Match the indexed static batches while retaining two faces and a visible torn edge.
  const cut=new T.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,steps:1});
  const joined=mergeVertices(cut);cut.dispose();return joined;
 }
 if(kind==='evacuation'){
  // Two open containers. The ordinary belongings below the lid reward a closer look.
  const bx=-.41,bz=-.02,bw=.65,bd=.47,h=.42;
  slab(bx,.02,bz,bw,.04,bd,m.cardboard);
  for(const side of [-1,1]){
   slab(bx+side*(bw/2-.01),h/2,bz,.02,h,bd,m.cardboard);
   slab(bx,h/2,bz+side*(bd/2-.01),bw-.04,h,.02,m.cardboard);
   board(bx+side*(bw/2+.058),h+.095,bz,.226,.012,bd-.025,m.cardboard,0,side*1.00);
  }
  const ripped=[[-.306,0],[.303,0],[.303,.094],[.271,.109],[.262,.098],[.241,.14],
   [.223,.128],[.195,.189],[.179,.185],[.164,.214],[-.219,.212],[-.255,.193],[-.29,.206],[-.307,.18]];
  place(cutBoard(ripped,.009),bx,h+.006,bz+bd/2,m.cardboard,0,Math.PI/2+.54);
  board(bx-.218,h-.070,bz+bd/2+.147,.094,.008,.09,m.cardboard,.84,-.10);
  board(bx,h+.068,bz-bd/2-.084,bw-.025,.015,.22,m.cardboard,.68);
  board(bx+.10,h-.046,bz+bd/2+.092,.049,.009,.208,m.wood,.54);
  const wet=[[-.305,0],[.304,0],[.304,.098],[.273,.104],[.242,.074],[.191,.078],
   [.149,.047],[.074,.045],[.012,.025],[-.085,.039],[-.161,.081],[-.213,.067],[-.246,.116],[-.305,.127]];
  const tide=new T.ShapeGeometry(new T.Shape(wet.map(([u,v])=>new T.Vector2(u,v))));
  place(tide,bx,.002,bz+bd/2+.0015,m.oxide);
  board(bx+.243,.127,bz+bd/2+.002,.042,.115,.007,m.wood,0,-.16);
  label(bx-.095,.226,bz+bd/2+.002,.18,.103);
  slab(bx-.05,.23,bz,.43,.25,.20,m.green,-.08);
  board(bx+.07,.32,bz+.019,.35,.079,.18,m.linen,-.22,-.13,.14);
  const sx=.40,sz=-.015,lw=.73,ld=.43,hingeZ=sz-ld/2,tilt=1.18;
  slab(sx,.106,sz,lw,.20,ld,m.wood);
  slab(sx,.199,sz,lw-.018,.023,ld-.01,m.oxide);
  slab(sx,.215,sz,lw-.058,.019,ld-.056,m.trim);
  board(sx+.056,.246,sz-.012,.41,.05,.25,m.linen,0,.03,-.07);
  for(const offset of [-.238,.238]){
   slab(sx+offset,.132,sz+.219,.069,.149,.014,m.dark);
   slab(sx+offset,.18,sz+.230,.073,.047,.016,m.metal);
  }
  const lidY=.211+ld/2*Math.sin(tilt),lidZ=hingeZ-ld/2*Math.cos(tilt);
  board(sx,lidY,lidZ,lw,.06,ld,m.wood,tilt);
  board(sx,lidY+.033*Math.cos(tilt),lidZ+.033*Math.sin(tilt),lw-.065,.012,ld-.06,m.green,tilt);
  board(sx-.17,lidY+.018,lidZ+.046,.137,.008,.098,m.paper,tilt,-.09);
  board(sx-.17,lidY-.002,lidZ+.061,.108,.009,.052,m.wood,tilt,-.09);
  board(sx,lidY-.047,lidZ+.069,lw-.082,.012,.027,m.dark,tilt);
  const front=sz+ld/2;
  bentWire([[sx-.112,.104,front],[sx-.098,.09,front+.066],[sx+.097,.09,front+.066],[sx+.11,.104,front]],.014,m.dark);
  // The abandoned derby has a hollow heel, raised counter and three crossed laces.
  const shoeX=variant%2?.23:.15,shoeZ=.376,turn=-.29;
  const sole=[[-.16,-.035],[-.143,-.057],[-.08,-.06],[-.011,-.055],[.06,-.071],
   [.125,-.062],[.17,-.035],[.177,.012],[.15,.049],[.086,.068],[.027,.06],[-.063,.049],[-.141,.052],[-.16,.03]];
  place(cutBoard(sole.map(([u,v])=>[u,-v]),.023),shoeX,.004,shoeZ,m.dark,turn,-Math.PI/2);
  const shoePoint=(u,v,t)=>[shoeX+u*Math.cos(turn)+t*Math.sin(turn),v,shoeZ-u*Math.sin(turn)+t*Math.cos(turn)];
  const positions=[],index=[],uv=[];
  const rings=[[1,1,0,.026,0],[.99,.98,0,.067,-.10],[.39,.57,-.068,.118,-.06],[.31,.45,-.071,.113,-.07],[.30,.43,-.071,.047,0]];
  for(let j=0;j<rings.length;j++)for(let i=0;i<sole.length;i++){
   const [a,b,off,y,slope]=rings[j],[u,v]=sole[i];
   positions.push(u*a+off,y+u*slope,v*b);uv.push(i/sole.length,j/4);
   if(!j)continue;
   const prev=(j-1)*sole.length+i,next=(j-1)*sole.length+(i+1)%sole.length;
   index.push(prev,prev+sole.length,next+sole.length,prev,next+sole.length,next);
  }
  const upper=new T.BufferGeometry();upper.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  upper.setAttribute('uv',new T.Float32BufferAttribute(uv,2));upper.setIndex(index);upper.computeVertexNormals();
  place(upper,shoeX,0,shoeZ,m.wood,turn);
  const lining=new T.CylinderGeometry(1,1,.006,14);lining.scale(.058,1,.030);place(lining,...shoePoint(-.071,.049,0),m.dark,turn);
  for(let n=0;n<3;n++){
   const u=-.004+n*.021,v=.112-n*.008;
   bentWire([shoePoint(u,v,-.031),shoePoint(u+.016,v+.005,0),shoePoint(u+.027,v-.007,.031)],.0037,m.paper);
   bentWire([shoePoint(u+.004,v,.031),shoePoint(u+.022,v+.002,-.004),shoePoint(u+.030,v-.007,-.031)],.0034,m.paper);
  }
  const slip=[[-.159,-.078],[.159,-.078],[.159,.039],[.114,.081],[-.159,.081]];
  place(cutBoard(slip,.004),-.194,.006,.29,m.paper,-.20,-Math.PI/2);
  board(-.09,.020,.25,.063,.006,.04,m.paper,.58,.07,-.19);
  for(let line=0;line<3;line++)slab(-.188,.012,.289+line*.018,.14-line*.017,.003,.005,m.wood,-.20);
 }else if(kind==='records'){
  function parcel(px,py,pz,w,h,d,turn){
   const pc=Math.cos(turn),ps=Math.sin(turn);
   function part(u,v,t,width,height,depth,mat){
    slab(px+pc*u+ps*t,py+v,pz-ps*u+pc*t,width,height,depth,mat,turn);
   }
   part(0,h/2,0,w,h,d,m.cardboard);
   for(const u of [-.27,.23]){
    part(u*w,h+.001,0,.018,.004,d+.006,m.paper);
    part(u*w,h/2,d/2+.002,.018,h,.004,m.paper);
   }
   part(0,h+.004,0,w-.016,.006,.043,m.wood);
   part(w*.09,h*.52,d/2+.006,w*.29,h*.37,.006,m.paper);
   part(w*.08,h*.55,d/2+.011,w*.16,.006,.002,m.wood);
   part(w*.06,h*.46,d/2+.011,w*.12,.008,.002,m.wood);
  }
  parcel(-.21,0,-.095,.83,.32,.57,-.025);
  parcel(-.26,.328,-.10,.71,.29,.50,.145);
  parcel(-.197,.625,-.14,.58,.24,.43,-.16);
  // Bent folder covers and loose sheets left at the foot of the leaning stack.
  board(-.20,.884,-.13,.55,.028,.40,m.green,0,-.041,.055);
  for(let n=0;n<3;n++)
   board(.21,.07+n*.008,.22+n*.012,.20,.013,.22,m.paper,.56-n*.065,0,-.28);
  for(let n=0;n<4;n++)
   board(.04+n*.055,.014+n*.009,.286+n*.011,.31,.012,.21,m.paper,.018,0,.04+n*.065);
  for(let n=0;n<3;n++)
   board(.13+n*.055,.016+n*.009,.291+n*.011,.11,.004,.012,m.wood,0,0,.04+n*.065);
  parcel(.488,0,-.13,.42,.30,.38,.11);
  tapeRoll(.51,.001,.301);
 }else if(kind==='laundry'){
  const rail=.955;
  for(const side of [-1,1])for(const end of [-1,1]){
   const cx=end*.527,cz=side*.285;
   spindle(cx,.102,cz,.102,.102,.061,m.dark,Math.PI/2);
   spindle(cx,.102,cz+side*.033,.042,.042,.013,m.oxide,Math.PI/2);
   slab(cx,.225,cz,.052,.20,.07,m.metal);
  }
  slab(0,.305,0,1.27,.075,.74,m.oxide);
  for(const end of [-1,1]){
   for(const side of [-1,1])slab(end*.60,.636,side*.324,.043,.67,.043,m.metal);
   slab(end*.60,rail,0,.046,.045,.70,m.metal);
  }
  for(const side of [-1,1])slab(0,rail,side*.325,1.23,.043,.045,m.metal);
  bentWire([[-.6,.79,-.28],[-.692,1.025,-.28],[-.692,1.025,.28],[-.6,.79,.28]],.021,m.oxide);
  const profile=[[.28,.50,.25],[.36,.60,.314],[.64,.629,.354],[.935,.586,.323],
   [.99,.59,.31],[1.04,.476,.26],[1.11,.353,.201],[1.24,.245,.163],[1.37,.19,.145],[1.48,.11,.08],[1.50,.018,.013]];
  const positions=[],uv=[],colors=[],indices=[],slices=24;
  for(let j=0;j<profile.length;j++){
   const [height,rx,rz]=profile[j],over=Math.max(0,(height-.94)/.56);
   for(let i=0;i<=slices;i++){
    const a=i/slices*2*Math.PI,fold=Math.sin(a*9+height*(j<5?1:3))*.034;
    const px=Math.cos(a)*(rx+fold*(1-over))+.25*over;
    const pz=Math.sin(a)*(rz+fold*.6*(1-over))-.083*over;
    const py=height+(j===4?.035*Math.sin(3*a+.4):0);
    positions.push(px,py,pz);uv.push(i/slices,height);
    const tone=.78+.1*Math.sin(a*9+height)+.04*Math.cos(a*4);
    colors.push(tone,tone*.975,tone*.90);
    if(j && i){
     const v=j*(slices+1)+i;
     indices.push(v-slices-2,v-1,v,v-slices-2,v,v-slices-1);
    }
   }
  }
  const sack=new T.BufferGeometry();
  sack.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  sack.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  if(m.linen.vertexColors)sack.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  sack.setIndex(indices);sack.computeVertexNormals();place(sack,0,0,0,m.linen);
  // A wet hem has crept over the basket lip, puckering where it caught on the corner.
  const towel=new T.PlaneGeometry(.46,.44,8,5),tp=towel.attributes.position;
  for(let i=0;i<tp.count;i++){
   const u=tp.getX(i),v=tp.getY(i)+.22;
   const edge=v/.44,crease=Math.cos(u*41+v*3)*.013;
   tp.setXYZ(i,u+.16,.50+v+(1-edge)*(.14*u+Math.sin(u*14)*.022),.348+.036*Math.sin(Math.PI*edge)+crease);
  }
  towel.computeVertexNormals();place(towel,0,0,0,m.linen);
  // One loose strap slips outside the rail. The top of the linen falls off centre.
  board(-.33,.766,.362,.064,.38,.016,m.wood,-.095,.07);
  board(-.325,.565,.345,.067,.046,.018,m.metal);
 }else if(kind==='supper'){
  const top=.74,tx=.11;
  slab(tx,top-.035,-.018,1.11,.07,.68,m.wood);
  for(const side of [-1,1])for(const end of [-1,1])
   slab(tx+end*.47,.349,-.018+side*.265,.045,.698,.045,m.green);
  for(const side of [-1,1])slab(tx,.63,-.018+side*.27,1.0,.107,.038,m.green);
  slab(tx-.34,top+.002,.305,.19,.005,.013,m.paper,.045);
  // A chair dragged away at an angle. Only one place at the table still has a seat.
  const chairX=-.623,chairZ=.072,chairTurn=-1.31;
  function chair(lx,y,lz,w,h,d,mat) {
   slab(chairX+Math.cos(chairTurn)*lx+Math.sin(chairTurn)*lz,y,
    chairZ-Math.sin(chairTurn)*lx+Math.cos(chairTurn)*lz,w,h,d,mat,chairTurn);
  }
  for(const end of [-1,1])for(const side of [-1,1]){
   const tall=side===1?.80:.39;chair(end*.145,tall/2,side*.14,.04,tall,.04,m.wood);
  }
  chair(0,.415,0,.37,.055,.35,m.wood);chair(0,.72,.14,.35,.11,.045,m.green);
  function enamel(px,pz,inverted){
   const profile=[[.001,0],[.070,0],[.086,.014],[.149,.073],[.159,.10],[.156,.108],[.146,.102],[.133,.079],[.081,.027],[.002,.027]];
   const dish=new T.LatheGeometry(profile.map(([u,v])=>new T.Vector2(u,v)),20);
   place(dish,px,top+(inverted?.109:.003),pz,m.cream,0,inverted?Math.PI:0);
   place(new T.TorusGeometry(.153,.005,5,20),px,top+(inverted?.005:.108),pz,m.trim,0,Math.PI/2);
  }
  enamel(-.155,-.046,false);enamel(.43,.035,true);
  spindle(-.155,top+.034,-.046,.083,.077,.006,m.wood);
  for(const offset of [-.016,.016])slab(-.163+offset,top+.114,.001,.014,.012,.344,m.wood,-1.08);
  spindle(.26,top+.084,-.234,.067,.054,.165,m.green);
  spindle(.26,top+.166,-.234,.056,.056,.004,m.dark);
  board(.55,top+.007,-.19,.145,.008,.115,m.linen,0,0,-.24);
  board(.35,top+.009,.256,.21,.012,.135,m.linen,0,0,.10);
  board(.355,top-.043,.313,.214,.119,.010,m.linen,.08,.09,.07);
 }
}
