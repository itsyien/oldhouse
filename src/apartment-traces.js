import * as T from 'three';

function texture(data,w,h){
 const map=new T.DataTexture(data,w,h);
 map.colorSpace=T.SRGBColorSpace;map.magFilter=T.LinearFilter;map.minFilter=T.LinearMipmapLinearFilter;
 map.generateMipmaps=true;map.needsUpdate=true;return map;
}

// Brown paper has compressed ridges and veins; the enamel on the bed rails has patches of exposed iron.
export function wornSurface(iron){
 const n=128,bytes=new Uint8Array(n*n*4);let seed=157;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const grain=seed/4294967296,angle=x/n*Math.PI*2,row=y/n*Math.PI*2;
  const islands=Math.sin(3*angle+Math.cos(2*row))+Math.cos(5*row+Math.sin(3*angle))+Math.sin(11*angle+row)*.43;
  const pit=T.MathUtils.smoothstep(islands+grain*.35,.58,1.39);
  const ridge=Math.cos(24*angle+Math.sin(row*3)*.25);
  const v=iron?156+grain*18+islands*4:185+ridge*6+grain*14+islands*4;
  const i=(y*n+x)*4;
  bytes[i]=v+(iron?pit*16:7);bytes[i+1]=v-(iron?pit*64:30);bytes[i+2]=v-(iron?pit*88:65);bytes[i+3]=255;
 }
 const map=texture(bytes,n,n);map.wrapS=map.wrapT=T.RepeatWrapping;return map;
}

// A few dusty sole impressions resolve into tread only when the player comes closer.
export function heelMarks(){
 const w=160,h=256,bytes=new Uint8Array(w*h*4);
 const steps=[[-.32,-.71,.15,1],[.13,-.31,-.18,.87],[-.17,.16,.16,.68],[.32,.60,-.24,.45]];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=(x+.5)/w*2-1,v=(y+.5)/h*2-1,i=(y*w+x)*4;
  const speck=Math.sin(x*91.43+y*34.81)*43758.5,grain=speck-Math.floor(speck);
  for(const [cx,cz,a,power] of steps){
   const dx=(u-cx)*.64,dz=(v-cz)*1.18,lx=dx*Math.cos(a)-dz*Math.sin(a),lz=dx*Math.sin(a)+dz*Math.cos(a);
   const toe=Math.hypot((lx-.008)/.073,(lz-.047)/.118),heel=Math.hypot((lx+.009)/.054,(lz+.109)/.047);
   const outline=Math.min(toe,heel);if(outline>=1)continue;
   const tread=Math.sin((lz+Math.abs(lx)*.55)*215)>.15?.32:1;
   bytes[i]=69;bytes[i+1]=62;bytes[i+2]=46;
   bytes[i+3]=Math.max(bytes[i+3],(1-T.MathUtils.smoothstep(outline,.73,1))*power*tread*grain*175);
  }
 }
 return texture(bytes,w,h);
}

export function stillLifeDust(){
 const n=96,bytes=new Uint8Array(n*n*4);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const u=(x+.5)/n*2-1,v=(y+.5)/n*2-1,i=(y*n+x)*4;
  const noise=Math.sin(x*123.7+y*64.3)*6783.21,grit=noise-Math.floor(noise);
  const edge=(Math.abs(u+.035*Math.sin(v*8))/.87)**3+(Math.abs(v-.05*Math.sin(u*7))/.72)**3;
  const stain=(1-T.MathUtils.smoothstep(edge,.49,1.5))*(.65+.35*grit);
  const rim=Math.exp(-(((edge-1.05)*4)**2))*grit;
  bytes[i]=40+38*rim;bytes[i+1]=36+29*rim;bytes[i+2]=25+21*rim;bytes[i+3]=Math.min(146,stain*132+rim*32);
 }
 return texture(bytes,n,n);
}

// A low patch of blown plaster below a leaking sill. The warm broken edge separates the paint from its grey backing.
export function blisteredPlaster(){
 const w=256,h=112,bytes=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=x/(w-1),v=y/(h-1),i=(y*w+x)*4;
  const hash=Math.sin(x*51.7+y*91.3)*8161.51,grit=hash-Math.floor(hash);
  const grain=.035*Math.sin(37*u+16*v)+.023*Math.sin(113*u+21*v)+.014*(grit-.5);
  const a=Math.hypot((u-.42)/.29,(v-.42)/.32),b=Math.hypot((u-.71)/.12,(v-.34)/.22);
  const edge=1-Math.min(a,b)+grain+.067*Math.sin(29*u-11*v);
  if(edge<-.12)continue;
  const exposed=T.MathUtils.smoothstep(edge,.015,.07),rim=Math.exp(-Math.abs(edge-.025)*32);
  const rough=grit*24+Math.sin(80*u+5*v)*3,brick=Math.floor(v*9);
  const line=v>.35&&((v*9)%1<.035||((u*10+brick*.5)%1<.021))?8:0;
  bytes[i]=115+rough+rim*53-line;bytes[i+1]=109+rough+rim*39-line;bytes[i+2]=88+rough+rim*23-line;
  bytes[i+3]=Math.min(232,T.MathUtils.smoothstep(edge,-.12,.01)*(50+exposed*155+grit*22));
 }
 return texture(bytes,w,h);
}

const tenantPaper={
 heights:['搬迁存根','REMOVAL SLIP','一只皮箱','one case','一只纸箱','one carton'],
 class:['家长签领','NIGHT SCHOOL','外套 · 未领取','coat unclaimed','代 存','held for collection'],
 storage:['住户寄存','LEFT PROPERTY','封条已拆','seal broken','无人签收','no signature'],
 meal:['住户饭票','MEAL BOOK','晚 餐','evening meal','两 份','two portions']
};

export function mountTenantTrace(site,{box,queue,mat,mats,textures}){
 const {kind,yaw}=site,canvas=document.createElement('canvas');canvas.width=512;canvas.height=448;
 const a=canvas.getContext('2d'),[title,en,line1,sub1,line2,sub2]=tenantPaper[kind];
 let seed=841;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 function rect(x,y,w,h,color){a.fillStyle=color;a.fillRect(x,y,w,h);}
 function stroke(x,y,x2,y2,color,width=1){
  a.strokeStyle=color;a.lineWidth=width;a.beginPath();a.moveTo(x,y);a.lineTo(x2,y2);a.stroke();
 }
 function text(s,x,y,size,ink,serif=false){a.font=size+'px '+(serif?'Georgia,SimSun,serif':'Arial,Microsoft YaHei,sans-serif');a.fillStyle=ink;a.fillText(s,x,y);}
 // The unfaded plaster and two nail holes are all that remains of a family photograph.
 if(kind==='heights'||kind==='class'){
  rect(40,36,184,145,'rgba(169,158,122,.39)');
  rect(39,180,187,4,'rgba(65,53,39,.54)');rect(39,36,3,145,'rgba(65,53,39,.33)');
  for(const x of [58,207]){rect(x,48,3,5,'#4d4434');rect(x-1,53,4,8,'rgba(102,77,48,.36)');}
  for(const [y,n]of [[324,'91'],[298,'93'],[266,'95'],[227,'98']]){
   stroke(105,y,139,y-2,'rgba(55,46,35,.85)',2);text('19'+n,147,y+2,12,'#534835',true);
  }
 }else{
  for(let i=0;i<3;i++)rect(78+i*37,224+i%2*6,22,7,'rgba(173,140,77,.53)');
 }
 // A torn, numbered carbon copy. Both languages are printed into the physical paper.
 const px=274,py=99,w=188,h=232;
 a.fillStyle='#b9ad88';a.beginPath();a.moveTo(px,py);a.lineTo(px+w-4,py-3);a.lineTo(px+w,py+h-17);
 for(let i=0;i<=15;i++)a.lineTo(px+w-w*i/15,py+h+(random()-.5)*7-(i<3?10-i*3:0));a.lineTo(px,py);a.fill();
 for(let i=0;i<870;i++){const y=random()*214;rect(px+3+random()*180,py+y,random()*4+.5,1,'rgba(81,65,43,.13)');}
 rect(px+9,py+8,w-20,4,'#696450');text(title,px+13,py+46,28,'#393b31',true);
 text(en,px+14,py+63,12,'#555443');stroke(px+12,py+72,px+w-13,py+72,'#79715e');
 text('804 室',px+15,py+104,24,'#514d3b',true);text('APT.',px+122,py+102,12,'#67604d');
 text(line1,px+15,py+135,18,'#514c3c');text(sub1,px+17,py+149,11,'#6a6554');
 text(line2,px+15,py+177,18,'#514c3c');text(sub2,px+17,py+191,11,'#6a6554');
 a.strokeStyle='#875c48';a.lineWidth=2;a.strokeRect(px+119,py+196,50,18);text('留 存',px+126,py+210,13,'#855b49');
 stroke(px+3,py+116,px+w-3,py+111,'rgba(83,76,61,.25)');stroke(px+3,py+117,px+w-3,py+112,'rgba(229,218,185,.3)');
 for(const [x,y]of [[px+14,py-4],[px+w-39,py-2]])rect(x,y,25,10,'rgba(153,125,77,.80)');
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;textures.push(map);
 const material=mat(0xffffff,map);material.transparent=true;material.depthWrite=false;
 const c=Math.cos(yaw),s=Math.sin(yaw);
 const x=site.x+s*.116,z=site.z+c*.116,g=new T.PlaneGeometry(1.75,1.53);
 g.rotateY(yaw);g.translate(x,1.76,z);queue(g,material);
 // A pair of empty picture hooks stand just proud of the plaster and catch the player's light.
 if(kind==='heights'||kind==='class')for(const u of [-.678,-.169])
  box(x+c*u+s*.011,2.35,z-s*u+c*.011,.026,.038,.026,mats.oxide,yaw);
}

// The night attendant hung a work coat on the sorting rack. The open hem, sleeves and collar read at different distances.
export function hangPorterCoat(rack,{box,queue,m}){
 const x=rack.x-.025,z=rack.z+rack.d*.70,y=rack.height-.10;
 box(x-.018,y+.06,z,.086,.09,.055,m.oxide);
 function cloth(columns,rows,pose){
  const g=new T.PlaneGeometry(1,1,columns,rows),p=g.attributes.position,colors=[];
  for(let n=0;n<p.count;n++){
   const u=p.getX(n)+.5,v=.5-p.getY(n);
   const [across,drop,out,light]=pose(u,v);
   p.setXYZ(n,x-out,y-drop,z+across);
   colors.push(.32*light,.38*light,.39*light);
  }
  g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();queue(g,m.linen);
 }
 // An open, almost cylindrical body gathers sharply at the hook and falls in a heavier fold on one side.
 cloth(26,12,(u,v)=>{
  const a=.33+u*(Math.PI*2-.69),fold=Math.cos(7*a+v*.75),shoulder=Math.min(1,.47+v*3.6);
  const span=(.235+.025*Math.sin(v*Math.PI*1.5))*shoulder;
  return [Math.sin(a)*span+.025*v*v, v*.99+.044*Math.cos(a)+.087*v*Math.max(0,Math.sin(a)),
   .115+.080*Math.cos(a)+.024*fold*(.35+.65*v),.57+.26*(1+fold)+.12*v];
 });
 for(const side of [-1,1])cloth(14,9,(u,v)=>{
  const a=u*Math.PI*2,wide=.084-.037*v;
  return [side*(.15+.142*v-.062*v*v)+wide*Math.cos(a),.07+v*(side<0?.63:.73)-.035*Math.cos(a),
   .115+.048*Math.sin(a)+.035*v+.015*Math.cos(v*5),.64+.21*Math.cos(a+side)+.09*Math.sin(v*13)];
 });
 cloth(12,3,(u,v)=>{
  const a=(u-.5)*3.6;
  return [.138*Math.sin(a)*(1-.18*v),-.014+v*.087+.08*Math.abs(Math.sin(a)),.123+.062*Math.cos(a)+v*.035,1.06+.18*v];
 });
}
