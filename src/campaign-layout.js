import {RISE,rectBounds,within,stairSurrounds,stairWalls,stairLandings,stairGuard} from './building.js';
import {apartmentBelongings,guideStones} from './apartment-placements.js';
import {addFalseDoorRecess} from './false-door.js';

const rect=(x,z,w,d)=>({x,z,w,d});
const position=(x,z)=>({x,z});
const item=(id,type,x,z,yaw=0,extra={})=>({id,type,label:type,name:type,x,z,yaw,zone:0,target:{x,y:1.5,z},...extra});
const door=(f,id,x,z,axis='x',open=true,locked=false,extra={})=>{
 const d={id:`${f.id}-${id}`,x,z,axis,angle:axis==='x'?Math.PI/2:0,swing:1,kind:'fire',title:id,width:1.9,open,locked,...extra};f.doorSpecs.push(d);return d.id;
};
function roomDoor(f,id,x,z,axis,span,{title,titleEn},swing=1){
 const gap=.96,alongX=axis==='x',jamb=span/2-gap;
 for(const side of [-1,1]){
  const start=side<0?-span/2:gap;
  f.partitions.push(alongX?rect(x-.09,z+start,.18,jamb):rect(x+start,z-.09,jamb,.18));
 }
 return door(f,id,x,z,axis,true,false,{kind:'wood',roomDoor:true,sweepThreshold:f.id!==8,title,titleEn,swing});
}
function sweepVestibule(f,x,span,bay,sign){
 f.walkableRects.push(bay);
 const cx=bay.x+bay.w/2,south=bay.z>f.spawn.z,yaw=south?Math.PI:0,z=south?bay.z+bay.d-.38:bay.z+.38;
 const entry={x:cx,z:z+Math.cos(yaw)*1.1};
 f.interactions.push(item(`f${f.id}-sweep-wardrobe`,'wardrobe',cx,z,yaw,{label:'衣柜',depth:.6,entry,target:{x:cx,y:1.4,z},sweepWardrobe:true}));
 f.obstacles.push({...rectBounds(rect(cx-.65,z-.30,1.30,.60)),wardrobe:true,height:2.35});
 f.lamps.push({...entry,steady:true});
 roomDoor(f,'vestibule',x,f.spawn.z,'x',span,sign);
}
function base(id,mode){
 const arrival=id%2===0?'A':'B',departure=arrival==='A'?'B':'A';
 return {id,campaign:true,totalFloors:8,mode,name:`${id}F`,title:mode==='inspection'?'住户楼层':mode==='chase'?'维修通道':'出口大厅',tag:mode==='inspection'?'寻找门禁密码':mode==='chase'?'不要回头':'最后三道关',base:(id-1)*RISE,arrival,departure,spawn:position(8.8,arrival==='A'?8:24),destination:position(8.8,departure==='A'?8:24),walkableRects:[],partitions:[],obstacles:[],doorSpecs:[],interactions:[],rooms:[],traversals:[],props:[],furniture:[],zones:[],lamps:[],mainRoute:[],stairCores:id===1?['B']:['A','B']};
}
const routeThemes = {
 mail: ['邮件大厅','Mail Hall','mailboxes',1.8], laundry: ['水洗车间','Wash House','washer-bank',1.25],
 archive: ['档案库','Archive Stacks','stacks',2.05], clinic: ['医务站','Infirmary','hospital-bed',.78],
 canteen: ['工人食堂','Canteen','counter',1.08], boiler: ['锅炉房','Boiler Room','boiler',2.15],
 gallery: ['肖像回廊','Portrait Gallery','display-case',1.35], waiting: ['候车厅','Waiting Hall','bench',.92],
 projection: ['放映室','Screening Room','projector',1.5], classroom: ['夜校教室','Night Classroom','school-desk',.83]
};
// Widths, crossing depth and staggered door positions give each wing a distinct plan.
const routes = {
 8: {title:'值班室',en:'Caretaker’s Office'},
 7: {title:'停水洗衣部',en:'Dry Laundry',themes:['mail','laundry','boiler','clinic'],widths:[22,28,11],turn:30,offsets:[2,-4],loop:'second'},
 6: {title:'旧街夜校',en:'Night School',themes:['classroom','projection','gallery','waiting'],widths:[25,19,15],turn:28,offsets:[-4,-3],loop:'last'},
 5: {title:'市政档案分拣站',en:'Municipal Records Depot'},
 4: {title:'留观病区',en:'Observation Ward',themes:['clinic','waiting','laundry','clinic'],widths:[28,23,10],turn:32,offsets:[-4,3],loop:'first'},
 2: {title:'末班食堂',en:'Last Sitting',themes:['canteen','boiler','archive','canteen'],widths:[22,30,15],turn:34,offsets:[3,-4],loop:'last'}
};
function inspection(id){
 const f=base(id,'inspection'),plan=routes[id],sign=f.arrival==='A'?1:-1;
 const wz=v=>f.spawn.z+v*sign;
 const p=(x,v)=>position(x,wz(v));
 const yaw=angle=>sign===1?angle:Math.PI-angle;
 const area=(x,v,w,d)=>rect(x,Math.min(wz(v),wz(v+d)),w,d);
 const walk=(x,v,w,d)=>f.walkableRects.push(area(x,v,w,d));
 const partition=(x,v,w,d)=>f.partitions.push(area(x,v,w,d));
 const lamp=(x,v,steady=false)=>f.lamps.push({...p(x,v),steady});
 Object.assign(f,{title:plan.title,titleEn:plan.en,spawnYaw:-Math.PI/2,scenes:[],scenePassages:[]});
 function scene(theme,x,v,w,d,override=null){
  const [title,titleEn]=override||routeThemes[theme],s={id:'f'+id+'-scene-'+f.scenes.length,title,titleEn,theme,bounds:area(x,v,w,d)};
  f.scenes.push(s);return s;
 }
 function fixture(theme,x,v,w,d){
  const [,,name,height]=routeThemes[theme];f.furniture.push({...area(x,v,w,d),name,height});lamp(x+w/2,v+d/2+.6);
 }
 function site(type,form,x,v,direction,clueGroup,s,asset){
  const angle=yaw(direction),nx=Math.round(Math.sin(angle)),nz=Math.round(Math.cos(angle)),wall=p(x,v);
  const bulky=form==='drawer'||form==='cupboard',depth=bulky?.5:.14;
  const world=position(wall.x+nx*(depth+.03),wall.z+nz*(depth+.03));
  const elevation=form==='drawer'?.81:form==='cupboard'?1.28:type==='keypad'?1.48:1.64;
  const target={...world,y:elevation},approach={x:world.x+1.15*nx,z:world.z+1.15*nz,yaw:angle};
  const i=item('f'+id+'-'+type+'-'+f.interactions.length,type,world.x,world.z,angle,{form,clueGroup,sceneId:s.id,asset,target,approach,
   label:type==='keypad'?'输入密码':form==='painting'?'查看画框':form==='drawer'?'打开抽屉':'打开储物柜'});
  f.interactions.push(i);
  if(bulky){
   const center=position(world.x-nx*.27,world.z-nz*.27),w=nx?.49:1.15,d=nz?.49:1.15;
   f.obstacles.push({...rectBounds(rect(center.x-w/2,center.z-d/2,w,d)),height:form==='drawer'?1.02:1.68});
  }
  f.lamps.push({x:world.x+nx*1.05,z:world.z+nz*1.05,steady:!!clueGroup||type==='keypad'});
  return i;
 }
 const search=(form,x,v,direction,clueGroup,s,asset)=>site(form==='painting'?'portrait':'search',form,x,v,direction,clueGroup,s,asset);
 function closet(x,v,direction){
  const world=p(x,v),angle=yaw(direction),side=Math.abs(Math.sin(angle))>.5;
  const entry=position(world.x+Math.sin(angle)*1.1,world.z+Math.cos(angle)*1.1);
  f.interactions.push(item('f'+id+'-wardrobe-'+f.interactions.length,'wardrobe',world.x,world.z,angle,{label:'衣柜',depth:.6,entry,target:{...world,y:1.4}}));
  f.obstacles.push({...rectBounds(rect(world.x-(side?.3:.65),world.z-(side?.65:.3),side?.6:1.3,side?1.3:.6)),wardrobe:true,height:2.35});
 }
 function passage(x,v,width,s){
  const r=area(x,v-1.6,width,3.2);f.scenePassages.push(r);f.walkableRects.push(r);
  if(!s)return;
  const gate=x+width*.5;partition(gate-.1,v-1.6,.2,.65);partition(gate-.1,v+.95,.2,.65);
  door(f,'through-door',gate,wz(v),'x',false,false,{kind:'passage',title:s.title,titleEn:s.titleEn,routeDoor:true,sweepThreshold:true,swing:-1});
 }
 function route(...points){for(const [x,v]of points)f.mainRoute.push([x,wz(v)]);}
 walk(8,-1.6,3,3.2);lamp(10.3,0,true);
 if(id===8){
  const office=scene('mail',11,-3.4,10,6.8,['邮件值班室','Mail Office']),landing=scene('waiting',8,6.3,15,12.5,['夜班楼梯厅','Night Landing']);
  walk(11,-3.4,10,6.8);walk(17.8,3.4,3.2,11.1);walk(8,14.45,14.5,3.1);
  walk(16,8.2,7.6,4.4);walk(14,13.4,3.8,5.4);
  f.scenePassages.push({...area(17.8,3.4,3.2,2.8),axis:'z'});
  search('drawer',13.6,-3.4,0,'whole',office).ajar=true;
  search('painting',20.98,-1.45,-Math.PI/2,'whole',office,'inspector').crooked=true;
  search('cupboard',16,9.6,Math.PI/2,null,landing);
  fixture('mail',12.2,2.55,2.55,.6);fixture('waiting',21.6,8.55,1.65,.66);
  f.furniture.push({...area(16.55,-.7,.7,2.5),name:'mailboxes',height:1.94});
  closet(16.55,18.31,Math.PI);lamp(17.7,2.4,true);lamp(19.3,7,true);lamp(19.3,14.2,true);lamp(14.4,16,true);
  f.quietSite={...p(22.45,11.4),yaw:yaw(-Math.PI/2)};
  roomDoor(f,'office',10.7,wz(0),'x',3.2,office);
  roomDoor(f,'night-landing',19.4,wz(4.65),'z',3.2,landing);
  route([8.8,0],[14.9,-1.55],[18.55,-1.55],[19.3,0],[19.3,10.3],[19.3,16],[12,16],[8.8,16]);
 }else if(id===5){
  f.listenerDepot=true;
  const receiving=scene('waiting',15,-4,14,9.75,['收件台','Intake']);
  const stacks=scene('archive',29,-4,27,12,['底册库','Registry']);
  const sorting=scene('archive',15,5.75,16,13.25,['清点区','Sorting']);
  const dispatch=scene('mail',31,8,25,11,['移交区','Dispatch']);
  walk(8,-1.6,7,3.2);passage(11.4,0,3.2,receiving);
  walk(15,-4,41,23);
  walk(8,14.45,7,3.1);

  // The racks break sightlines at different angles. Every row has a crossover at both ends.
  for(const [name,x,v,w,d,height] of [
   ['record-rack',18,-2.18,.9,4.14,2.28],
   ['record-rack',24.2,-.9,8,.87,2.12],
   ['record-rack',36.2,.5,7.5,1.02,2.12],
   ['record-rack',46.95,1.9,5.5,1.15,2.12],
   ['sorting-bench',21.6,5.1,6.4,1.15,1.18],
   ['record-rack',32.0,4.5,10.1,1.12,2.25],
   ['record-rack',46.2,7,6.8,1.15,2.25],
   ['sorting-bench',17.95,10.65,5.5,1.2,1.18],
   ['record-rack',26.2,11.65,7.15,1.04,2.25],
   ['record-rack',39.65,10.0,6.03,1.3,2.25],
   ['record-rack',31.6,15.95,5.5,.93,2.18],
   ['dispatch-scale',48.6,13.3,4.8,1.6,1.37],
   ['receiving-chute',19.50,-3.9,1.59,.93,1.50]
  ])f.furniture.push({...area(x,v,w,d),name,height});

  search('drawer',31.55,-4,0,null,stacks).ajar=true;
  search('painting',39.4,-4,0,null,stacks,'inspector');
  search('cupboard',48.85,-4,0,null,stacks);
  search('drawer',34.45,19,Math.PI,null,dispatch);
  search('painting',43.85,19,Math.PI,null,dispatch,'wangjingwei').crooked=true;
  search('cupboard',51.55,19,Math.PI,null,dispatch);
  search('painting',15,8.8,Math.PI/2,null,sorting,'liang');
  search('painting',56,5.2,-Math.PI/2,null,stacks,'yujie');
  search('drawer',56,14.3,-Math.PI/2,null,dispatch);
  function depotPoint(type,index,x,v,angle,y,details){
   const world=p(x,v),facing=yaw(angle);
   const approach={x:x+Math.sin(facing)*1.2,z:world.z+Math.cos(facing)*1.2,yaw:facing};
   f.interactions.push(item(`f5-${type}-${index+1}`,type,world.x,world.z,facing,{
    target:{...world,y},approach,...details
   }));
   f.lamps.push({x:approach.x,z:approach.z,steady:true});
  }
  for(const [slot,[x,v,angle,y,color,slide]] of [
   [18.93,.67,Math.PI/2,1.52,'#b67a56'],
   [29.35,-.94,Math.PI,1.49,'#6e9d9e'],
   [52.48,2.47,Math.PI/2,1.50,'#afa055'],
   [28.65,12.72,0,1.51,'#86976a'],
   [45.71,10.82,Math.PI/2,1.51,'#967898'],
   [36.55,5.66,0,1.49,'#bb9565'],
   [39.3,.46,Math.PI,1.31,'#cc8658',.61],
   [48.1,8.19,0,1.31,'#b48d61',-.61],
   [34.1,15.91,Math.PI,1.31,'#a58b53',.61]
  ].entries())depotPoint('depot-slip',slot,x,v,angle,y,{slot,color,label:'号码纸',
   ...(slide?{crate:{slide,duration:1.2,noise:15}}:{})});
  for(const [index,[x,v,angle]] of [[24.72,6.28,0],[20.78,10.62,Math.PI],[51,14.93,0]].entries())
   depotPoint('depot-alarm',index,x,v,angle,1.16,{label:'闹钟'});
  depotPoint('depot-lure',0,20.15,-2.93,0,1.13,{
   mechanism:'chute',label:'放下滑槽托盘',delay:2,duration:2.4,pulseInterval:.5,
   noise:p(20.57,-3.43),noiseApproach:p(21.05,-1.95)
  });
  depotPoint('depot-lure',1,37.65,18.86,Math.PI,1.42,{
   mechanism:'intercom',label:'试响远端广播',delay:1.4,duration:2.8,pulseInterval:.7,
   noise:p(52.6,-3.86),noiseApproach:p(52.6,-2.38)
  });
  f.keypad=site('keypad',null,41.45,19,Math.PI,null,dispatch);
  for(const [x,v,angle] of [[15.45,5.15,Math.PI/2],[15.45,11.9,Math.PI/2],[23.05,-3.55,0],[45.3,-3.55,0],
   [55.5,-.75,-Math.PI/2],[55.5,9.75,-Math.PI/2],[21.7,18.55,Math.PI],[47,18.55,Math.PI],[36.55,8.15,Math.PI]])closet(x,v,angle);
  for(const [x,v,steady] of [[13.1,0,true],[17.1,3.3,true],[22.4,2.1],[33.9,-2.45,true],[35.35,2.6],[45.5,4.33,true],
   [53.8,4.8],[29.15,8.55,true],[36.65,11.75],[47.05,11.25],[54.6,17.2,true],[41.4,16.4],[29.5,16.15],
   [24.65,14.45],[33,17.4,true],[23.7,17,true],[16.65,16,true],[10.8,16,true]])lamp(x,v,steady);
  f.depotSigns=[
   {...p(20.8,2.85),yaw:Math.PI/2,sector:'A',scene:receiving},
   {...p(34.25,2.5),yaw:Math.PI/2,sector:'B',scene:stacks},
   {...p(25.2,8.8),yaw:0,sector:'C',scene:sorting},
   {...p(45.4,15.75),yaw:0,sector:'D',scene:dispatch}
  ];
  f.depotStripes=[
   {...p(20.75,3.78),length:5.8,yaw:0},
   {...p(31.5,9.18),length:10.8,yaw:0},
   // The painted dispatch lane stays clear of parked carts and leads back to the stair door.
   {x:35.15,z:6.45,length:13.8,yaw:0,escape:true},
   {x:20.65,z:7.05,length:15.4,yaw:-.078,escape:true},
   {x:11.95,z:7.65,length:2.05,yaw:0,escape:true}
  ];
  // The covered intake window gives a short silhouette reveal without a separate encounter room.
  walk(15.75,-5.55,1.8,1.55);
  f.quietSite={...p(16.65,-5.07),yaw:yaw(0),frame:{...p(16.65,-4),yaw:yaw(0),width:1.77}};
  f.obstacles.push({...rectBounds(area(15.765,-4.09,1.77,.18)),height:.86,quietSill:true});
  f.listenerRoute=[
   [22.6,2.55],[33.85,2.55],[44.85,3.75],[53.55,4.15],[53.8,11.75],
   [54.35,16.55],[46.85,16.45],[39.1,15.15],[25.3,15.05],[23.9,8.75],[19.2,8.6]
  ].map(([x,v])=>p(x,v));
  sweepVestibule(f,9.9,3.2,rect(8.01,19.95,1.89,2.45),receiving);
  f.sweepRoute=[[8.55,24],[10.7,24],[12.6,24]];
  route([8.8,0],[16.45,0],[16.45,3.2],[21.4,3.25],[30.2,2.55],[34.35,2.55],[44.7,3.5],[53.75,4.4],
   [53.75,11.3],[54.35,16.55],[42.6,16.55],[38.6,15.15],[29.8,15.15],[23.7,15.15],[16.7,16],[8.8,16]);
 }else{
  const [w1,w2,crossWidth]=plan.widths;
  const F=11+Math.round(w1*.85),A=plan.offsets[0],S=F+6.6,E=S+Math.round(w2*.83),C=E+5;
  const T=A+plan.offsets[1]*.48,V=plan.turn,mid=(T+V)*.5,G=Math.max(7.2,crossWidth*.66),Fmid=(14+E)*.5;
  const first=scene(plan.themes[0],11,-4.1,F-11,8.2);
  const second=scene(plan.themes[1],S,A-4.3,E-S,8.6);
  const crossing=scene(plan.themes[2],C,T-2.8,G,V-T+5.6);
  const finalName=id===4?['空床留观室','Empty Ward']:id===2?['夜班餐厅','Night Dining Room']:null;
  const last=scene(plan.themes[3],14,V-3.6,E-14,7.2,finalName);
  const g1=id===4||id===6?1.0:G-3.0,g2=g1===1?G-3:0,passV=id%2===0?V+1.7:V-1.7;
  walk(11,-4.1,F-11,8.2);
  walk(F,-1.6,3.1,3.2);walk(F+.65,Math.min(0,A)-1.6,2.45,Math.abs(A)+3.2);passage(F+3.1,A,3.5,second);
  walk(S,A-4.3,E-S,8.6);
  passage(E,T,5,null);
  // Each pair of offset service corridors joins in a small lit equipment bay.
  walk(C,T-2.8,G,7.6);walk(C+g1,T+4.4,2.75,mid-T-4.4+.7);
  walk(C,mid-.2,G,4.3);walk(C+g2,mid+3.85,2.85,V-mid-5.6);
  walk(C,V-2.4,G,5.2);passage(E,V,5,null);
  walk(14,V-3.6,Fmid-2.5-14,7.2);walk(Fmid-2.5,passV-1.45,5.5,2.9);walk(Fmid+3,V-3.6,E-Fmid-3,7.2);
  walk(9,V-1.6,5,3.2);walk(9,14.45,3,V-14.45+1.6);walk(8,14.45,4,3.1);
  const host=plan.loop==='first'?first:plan.loop==='last'?last:second;
  const bv=host===first?-4.1:host===last?V+3.6:A-4.3,side=host===last?1:-1;
  const lx=host===first?12:host===last?Fmid+4:S+1.3,rx=host===first?F-3.8:host===last?E-3.2:E-3.5;
  walk(lx,Math.min(bv,bv+side*3.7),2.4,3.7);walk(rx,Math.min(bv,bv+side*3.7),2.4,3.7);
  walk(lx,side>0?bv+3.7:bv-5.9,rx-lx+2.4,2.2);
  f.loopPorts=[p(lx+1.2,bv-.35*side),p(rx+1.2,bv-.35*side)];f.loopMid=p((lx+rx+2.4)/2,bv+side*4.8);
  lamp((lx+rx+2.4)/2,bv+side*4.8);lamp(F+1.8,A,true);lamp(E+2,T,true);lamp(E+2,V,true);lamp(Fmid,passV,true);
  const firstGroup=id===2||id===4?'front':null,secondGroup=id>=6?'whole':null,back=id>=6?null:'back';
  const prints={7:['liang','naiwa','wangjingwei','inspector'],6:['wangjingwei','inspector','liang','yujie'],4:['yujie','liang','inspector','naiwa'],2:['naiwa','yujie','liang','wangjingwei']}[id];
  search('drawer',15.1,4.1,Math.PI,firstGroup,first);
  search('painting',F-5.4,-4.1,0,firstGroup,first,prints[0]);
  if(firstGroup)search('cupboard',F-9,4.1,Math.PI,firstGroup,first);
  search('cupboard',S+4.7,A+4.3,Math.PI,secondGroup,second);
  search('drawer',E-5.2,A-4.3,0,secondGroup,second);
  if(secondGroup)search('painting',E-3.8,A+4.3,Math.PI,secondGroup,second,prints[1]);
  search('painting',C+G,mid+1.75,-Math.PI/2,null,crossing,prints[2]);
  search('cupboard',E-4.25,V-3.6,0,back,last);
  search('drawer',17.2,V+3.6,Math.PI,back,last);
  search('painting',22,V-3.6,0,back,last,prints[3]);
  fixture(plan.themes[0],F-6.3,-1,2.15,1.75);
  // Two paths around the first blind corner: the drawer side and the side leading towards the next door.
  const dividerX=11+(F-11)*.43;
  if(id===7)f.furniture.push({...area(dividerX,-2.35,.75,3.4),name:'mailboxes',height:2.08});
  else partition(dividerX,-2.35,.34,3.4);
  partition(Fmid-7.8,V-1.1,.38,2.2);
  fixture(plan.themes[1],S+(E-S)*.45,A-.65,3.4,1.3);
  fixture(plan.themes[2],C+.5,T-2.3,2.1,1);
  fixture(plan.themes[3],host===last?lx+3.5:Fmid+4.75,V+2.6,2.9,.66);
  if(id===6)fixture('waiting',S+3,A-3.65,2.8,.6);
  if(id===4)fixture('clinic',13.1,-3.35,2.8,.8);
  if(id===2)fixture('canteen',S+(E-S)*.60,A+2.8,3,.7);
  closet(12,-3.6,0);closet(F-1.65,3.57,Math.PI);
  closet(S+1.3,A+3.78,Math.PI);closet(E-1.1,A+3.76,Math.PI);
  closet(C+G-.55,T+2.1,-Math.PI/2);closet(C+.52,mid+1.8,Math.PI/2);
  closet(C+G-.55,V+.8,-Math.PI/2);closet(Fmid+4,V-3.05,0);closet(Fmid-4.6,V+3.05,Math.PI);
  closet(host===last?rx-1.8:E-2,V+3.05,Math.PI);
  closet(14.65,V-3.08,0);closet(11.44,17.35,-Math.PI/2);
  if(E-S>21)closet((S+E)*.5,A+3.75,Math.PI);
  if(id===2)closet(C+g1+.48,(mid+T+4.4)*.5,Math.PI/2);
  closet((lx+rx+2.4)/2,bv+side*5.4,side>0?Math.PI:0);
  const laneA=C+g1+1.38,laneB=C+g2+1.42;
  lamp(laneA,T+4.95,true);lamp(laneB,mid+4.5,true);lamp(C+G*.55,mid+1.6);lamp(C+G*.45,V);
  // A shallow maintenance recess catches peripheral vision before the first interior door.
  walk(F-6.65,4.1,1.7,1.65);
  f.quietSite={...p(F-5.8,5.15),yaw:yaw(Math.PI),frame:{...p(F-5.8,4.1),yaw:yaw(Math.PI),width:1.67}};
  f.obstacles.push({...rectBounds(area(F-6.635,4.01,1.67,.18)),height:.86,quietSill:true});
  lamp(F-5.8,3.4);
  roomDoor(f,'front-room',10.7,wz(0),'x',3.2,first);
  roomDoor(f,'service-room',E+2.45,wz(T),'x',3.2,crossing);
  roomDoor(f,'rear-room',E+2.45,wz(V),'x',3.2,last,-1);
  roomDoor(f,'loop-door',lx+1.2,wz(bv+side*1.38),'z',2.4,{title:'侧面服务通道',titleEn:'Service passage'},-sign*side);
  route([8.8,0],[13,0],[13,1.8],[F-1.15,1.8],[F-1.15,0],[F+1.85,0],[F+1.85,A],[S+1.5,A],[S+1.5,A-2.6],[E-1.4,A-2.6],[E-1.4,T],[laneA,T],[laneA,mid+1.85],[laneB,mid+1.85],[laneB,V],[E-1.25,V],[E-1.25,passV],[Fmid-9,passV],[Fmid-9,V],[10.5,V],[10.5,16],[8.8,16]);
 }
 // The depot's stair release is in Dispatch. Other keypads are beside the real stair door.
 f.keypad??=site('keypad',null,9.45,14.45,0,null,f.scenes.at(-1));
 f.exitGateId=door(f,f.departure,8.2,f.destination.z,'x',false,true,{title:'下层楼梯',keypadLock:true,swing:1});
 f.keypad.gateId=f.exitGateId;
 door(f,f.arrival,8.2,f.spawn.z,'x',id<8,id===8,{title:'上层楼梯'});
 for(const v of [14.45,16.95])partition(8.1,v,.2,.6);
 return f;
}
function chase(){
 const f=base(3,'chase');
 f.walkableRects=[
  rect(8,22.5,31.5,3),rect(16,18,11,4.5),
  rect(23,25.45,2.6,5.05),rect(23,28.1,12.7,2.5),rect(33.1,25.45,2.6,5.15),
  rect(36.65,6.5,2.85,19),rect(38.8,21.5,8.5,2.5),rect(44.5,17.7,2.8,6.3),
  rect(41.4,17.7,5.9,2.4),rect(41.4,10,2.5,10.1),rect(41.4,10,5.9,2.4),
  rect(44.8,6.6,2.5,5.8),rect(38.5,6.6,8.8,2.5),rect(39.1,14.6,4.65,2.4),
  rect(15.7,6.5,18.2,4),rect(14,10.5,19,7.5),
  rect(36.65,-8.9,2.85,17.4),rect(31,-17.9,2.9,26.4),
  // A folded service maze follows the motor door. Each cross-corridor has a longer, open bypass.
  rect(36.65,-8.9,15.25,2.8),rect(49.1,-17.9,2.8,11.8),rect(31,-17.9,20.9,2.8),
  rect(39.2,-14,2.6,7.9),rect(39.2,-14,8.1,2.6),rect(44.7,-14,2.6,7.9),
  rect(45.2,-22.3,2.6,7.2),rect(38.2,-22.3,9.6,2.6),rect(38.2,-22.3,2.6,7.2),
  rect(39,3.55,5.9,2.45),rect(42.5,-4.05,2.4,10.05),rect(39,-4.05,5.9,2.45),
  rect(27.7,-4.2,3.8,2.45),rect(27.7,-4.2,2.45,9.65),rect(27.7,3,3.8,2.45),
  rect(9.4,14.4,5.7,1.2),rect(9.4,8.4,1.2,7.2),rect(8,6.4,4,3.6)
 ];
 const meshWindow=(x,z,w)=>({...rect(x,z,w,.16),material:'wire-window',sill:.79,lintel:2.58});
 f.partitions.push(meshWindow(16,22.42,7.1),rect(25.3,22.42,1.7,.16),
  meshWindow(16,17.92,1.2),rect(17.2,17.92,.16,1.75),meshWindow(17.2,19.51,9.8),rect(26.84,17.92,.16,1.75),
  rect(19.3,17.5,4.6,.16),rect(19.65,9.05,3.30,.16),
  rect(28.9,22.5,.2,.55),rect(28.9,24.95,.2,.55),
  rect(15.7,10.42,.6,.16),meshWindow(18.9,10.42,8.5),rect(30.25,10.42,2.75,.16));
 f.chaseIsland={...rect(19.6,12.55,4.7,3.35),height:2.16};f.obstacles.push({...rectBounds(f.chaseIsland),height:f.chaseIsland.height});
 f.chaseMetal=rect(36.65,10.52,2.85,10.85);
 f.chaseCloth=[{...rect(41.4,17.05,2.5,.7),side:-1},{...rect(41.4,12.4,2.5,.7),side:1},
  {...rect(44.7,-11.35,2.6,1.7),side:1},{...rect(45.2,-19.7,2.6,1.7),side:-1}];
 for(const c of f.chaseCloth)f.partitions.push({...rect(c.x+(c.side===1?1.28:0),c.z+.29,1.22,.12),height:2.42,material:'hanging-cloth'});
 f.chaseStart=rect(19.4,22.5,2.5,3);
 f.chaseSpawn={x:19.5,z:20.15,yaw:Math.PI};
 f.chaseEntryDoorId=door(f,'maintenance',19.4,24,'x',false,false,{title:'检修门',titleEn:'MAINTENANCE ACCESS',routeDoor:true,swing:-1,chasePush:true,pushDuration:.6});
 f.partitions.push(rect(19.3,22.5,.20,.55),rect(19.3,24.95,.20,.55));
 f.chaseDoorId=door(f,'receiving',29,24,'x',false,false,{title:'收发口',swing:-1,chasePush:true});
 f.chaseGateId=door(f,'motor-gate',38.08,.7,'z',false,false,{title:'机房捷径',titleEn:'MOTOR ROOM',chasePush:true});
 f.partitions.push(rect(36.65,.61,.48,.18),rect(39.03,.61,.47,.18));
 f.chaseLure={x:43.68,z:2.35};
 f.chaseEscapeArea=rect(15.7,6.5,18.2,11.5);
 // The first approach selects the guarded lane. Each divider has a short bypass.
 f.chaseGuards=[
  {position:position(22.95,16.66),trigger:rect(24.5,15.92,5.1,2.08),reach:rect(22.1,15.9,1.7,1.6)},
  {position:position(21.75,7.95),trigger:rect(23.4,6.5,4.2,3.9),reach:rect(20.9,6.5,1.7,2.55)}
 ];
 // Warn on both receiving approaches, early enough that sprinting cannot outrun the landing rack.
 f.chaseCollapse={id:'f3-collapse-bridge',kind:'pipe',trigger:rect(30.5,22.5,5.7,8.1),footprint:rect(36.65,18.9,2.85,.55),cue:position(35,24),cueYaw:Math.PI/2,yaw:0,warning:1.1,fallDuration:.30,hold:4.5,settle:.32};
 f.chaseHazards=[f.chaseCollapse,
  {id:'f3-collapse-outbound',kind:'panel',trigger:rect(36.65,-6.3,2.85,3),footprint:rect(43.6,-8.9,.55,2.8),cue:position(38.08,-6.2),yaw:Math.PI/2,warning:1.1,fallDuration:.45,hold:6.8,settle:.32},
  {id:'f3-collapse-return',kind:'duct',trigger:rect(49.1,-13.5,2.8,3.3),footprint:rect(42.8,-17.9,.55,2.8),cue:position(50.5,-14.8),yaw:Math.PI/2,warning:1.1,fallDuration:.45,hold:6.8,settle:.32}
 ];
 f.interactions.push(item('f3-bell','chase-bell',39.34,2.85,-Math.PI/2,{label:'试响检修铃',target:{x:39.34,y:1.26,z:2.85}}));
 f.chaseSearchPoints=[[25,24],[34.5,24],[38,19.5],[45.8,22.7],[42.65,15.7],[38,8.3],[43.65,1.5],[38,-5.4],[43,-12.7],[50.5,-11.6],[43,-21],[34.5,-16.5],[32.5,-7.3],[28.9,.4],[32.55,5.9],[28.9,9.1],[17.6,8.5],[17.3,16.9],[26.5,13]].map(([x,z])=>position(x,z));
 for(const [index,x,z,direction] of [[1,34.9,24,1],[2,27.5,16.55,-1]]){
  const width=2.80,barrier=rectBounds(rect(x-.10,z-width/2,.20,width));
  f.interactions.push(item(`f3-board-${index}`,'chase-board',x,z,direction*Math.PI/2,{
   label:'放下维修隔板',direction,width,barrier,target:{x,y:1.1,z}
  }));
 }
 f.chaseRoute=[[8.8,24],[14,24],[24.3,24],[29,24],[38,24],[38,8.5],[38,-7.5],[50.5,-7.5],[50.5,-16.5],[32.5,-16.5],[32.5,8.5],[28.9,8.5],[28.9,16.8],[16.6,16.8],[14.8,15]];
 const vaultId='f3-vault-1',cabinet={...rect(13.75,22.5,.5,3),id:'f3-vault-barrier',height:.95,traversalId:vaultId};
 f.traversals.push({id:vaultId,kind:'vault',a:position(12.5,24),b:position(15.5,24),width:3,playerDuration:.55,enemyDuration:3.2,obstacleId:cabinet.id,obstacle:cabinet});
 f.obstacles.push({...rectBounds(cabinet),id:cabinet.id,height:.95,traversalId:vaultId});f.interactions.push(item(vaultId,'vault',14,24,Math.PI/2,{label:'翻越倒柜',traversalId:vaultId,target:{x:14,y:.8,z:24}}));
 const cartId='f3-vault-cart',cart={...rect(31,.1,2.9,.55),id:'f3-cart-barrier',height:.85,traversalId:cartId};
 f.traversals.push({id:cartId,kind:'vault',a:position(32.5,-1.25),b:position(32.5,1.95),width:2.9,playerDuration:.58,enemyDuration:2.85,obstacleId:cart.id,obstacle:cart});
 f.obstacles.push({...rectBounds(cart),id:cart.id,height:cart.height,traversalId:cartId});
 f.interactions.push(item(cartId,'vault',32.5,.38,0,{label:'翻越推车',traversalId:cartId,target:{x:32.5,y:.78,z:.38}}));
 const id='f3-vent',obstacle={...rect(13.95,14.4,.3,1.2),id:'f3-vent-mouth',height:3,traversalId:id};
 f.traversals.push({id,kind:'vent',a:position(14.8,15),b:position(10,8.85),via:[position(10,15)],width:1.2,playerDuration:3.7,enemyDuration:null,obstacleId:obstacle.id,obstacle});
 f.obstacles.push({...rectBounds(obstacle),id:obstacle.id,height:3,sightMinHeight:.95,traversalId:id});f.interactions.push(item(id,'vent',14.8,15,Math.PI/2,{label:'钻入通风管',traversalId:id,target:{x:14.3,y:.55,z:15}}));
 f.ventSafe=rect(9.4,8.15,1.2,1.6);f.ventElbow=position(10,15);f.mainRoute=f.chaseRoute;
 f.lamps=[[12,24],[19.5,20],[25,24],[29.2,29.35],[35,24],[38,17],[40.4,22.7],[45.8,22.4],[42.8,14],[45.9,8.1],[38,4.6],[38,-2.15],[43.6,2.45],[43.6,-2.5],[38,-7.3],[43,-12.7],[48.4,-7.5],[50.5,-13.3],[45.8,-16.5],[43,-21],[35.5,-16.5],[32.5,-10],[32.5,-4.15],[32.5,2.15],[28.9,.45],[32.5,8.45],[23.3,9.2],[15.7,14.8],[24.5,18.6],[29.2,16.5],[10,8]].map(([x,z])=>position(x,z));
 sweepVestibule(f,10.9,3,rect(11.2,19.9,2.35,2.6),{title:f.title,titleEn:'Maintenance corridor'});
 f.sweepRoute=[[8.6,24],[11.8,24],[13.4,24]];
 door(f,'B',8.2,24,'x',true,false,{title:'上层楼梯'});door(f,'A',8.2,8,'x',true,false,{title:'下层楼梯'});
 return f;
}
function pipeCourse(){
 const platforms=[],sections=[];
 function run(axis,direction,edge,rows){
  // Length, width, across-coordinate, elevation, gap, surface, wet shoulder, exit turn.
  for(const [length,width,across,y,gap,kind,slip=false,turn] of rows){
   const lead=Math.round((edge+direction*gap)*1000)/1000;
   const start=lead-(direction===-1?length:0),side=across-width/2;
   const deck=axis==='x'?rect(start,side,length,width):rect(side,start,width,length);
   platforms.push({...deck,y,kind,slip,axis,direction,...(turn?{turn}:{})});
   edge=lead+direction*length;
  }
  return edge;
 }
 function finish(id){
  sections.push({id,first:(sections.at(-1)?.last??-1)+1,last:platforms.length-1});
 }
 function crossToNextLane(crossingY,landingY,direction,slip){
  const corner=platforms.at(-1),x=corner.x+corner.w/2;
  run('z',1,corner.z+corner.d,[
   [2.68,slip?1.62:1.86,x,crossingY,1.30,'pipe',slip],
   [4.82,3.96,x,landingY,1.31,'catwalk',false,{axis:'x',direction}]
  ]);
  const landing=platforms.at(-1);
  return direction>0?landing.x+landing.w:landing.x;
 }
 const elbows={axis:'z',direction:1};
 const ductEnd=run('x',1,43,[
  [5.8,3.1,18,0,0,'catwalk'],[5,2.7,18.2,-.30,1.15,'duct'],[5.4,2.9,17.4,-.84,1.35,'duct'],
  [5.8,1.9,18.85,-1.41,1.32,'duct'],[8.9,3.25,17.88,-2.02,1.36,'duct'],
  [8.5,2.22,17.15,-2.66,1.24,'duct'],[4.8,2.76,18.03,-3.25,1.29,'grate']
 ]);
 finish('ducts');

 run('x',1,ductEnd,[
  [5.3,2.17,18.9,-3.86,1.30,'grate'],[5.1,1.64,19.7,-4.37,1.18,'pipe'],
  [5.25,1.2,19.1,-3.86,1.30,'pipe'],[5.7,1.82,17.95,-3.28,1.36,'duct'],
  [3.85,4.2,18.2,-2.65,1.26,'catwalk',false,elbows]
 ]);
 const westStart=crossToNextLane(-2.02,-1.45,-1,false);
 finish('manifold');

 const pressureEnd=run('x',-1,westStart,[
  [8.35,2.18,27.90,-.89,1.22,'catwalk'],[9.65,1.14,28.28,-.26,1.27,'pipe',true],
  [9.1,1.01,28.65,.37,1.35,'pipe',true],[10.85,.94,28.05,1.01,1.44,'beam'],
  [5.44,1.04,27.45,1.61,1.40,'pipe',true],[3.75,2.52,28.05,2.27,1.29,'grate']
 ]);
 finish('pressure');

 run('x',-1,pressureEnd,[
  [4.35,2.6,28.6,2.94,1.35,'duct'],[4.5,1.76,28.1,3.62,1.34,'grate'],
  [3.97,4.15,28.18,4.28,1.28,'catwalk',false,elbows]
 ]);
 const eastStart=crossToNextLane(4.89,5.53,1,true);
 const riserEnd=run('x',1,eastStart,[
  [5.25,2.45,38.3,5.95,1.24,'duct'],[5.65,2.18,38.9,5.34,1.35,'grate'],
  [4.85,2.75,37.95,4.69,1.24,'catwalk']
 ]);
 finish('risers');

 const end=run('x',1,riserEnd,[
  [8.95,1.48,37.45,4.02,1.27,'pipe',true],[5.75,1.07,36.81,3.34,1.41,'pipe',true],
  [6.1,1.36,37.43,2.65,1.36,'pipe',true],[7.35,1.05,38.23,1.97,1.43,'pipe',true],
  [6.2,1.31,38.86,1.32,1.47,'pipe',true],[4.96,1.72,38.40,.62,1.34,'grate'],
  [10.6,2.73,37.81,0,1.4,'catwalk']
 ]);
 finish('exhaust');
 return {platforms,sections,end};
}

function boss(){
 const f=base(1,'boss'),leverId='f1-isolation-lever';
 Object.assign(f,{title:'地下维修通道',titleEn:'Service Basement',tag:'最后一道门',spawnYaw:-Math.PI/2});
 f.walkableRects=[rect(8,22,6.2,4),rect(14,16,14,16),rect(28,18,10,12),
  rect(26.5,14.6,11.8,3.4),rect(38,14.6,6,5.4)];
 // Only the wide shutter connects the repair bay to the main hall.
 f.partitions.push(rect(27.91,18,.18,3.6),rect(27.91,26.4,.18,3.6),
  rect(28,17.91,10,.18),rect(37.91,18,.18,2),
  rect(42.11,14.6,.18,2.05),rect(42.11,19.35,.18,.65));
 for(const [name,x,z,w,d,height] of [
  ['boiler',17.1,22.15,3.2,3.72,2.39],
  ['stacks',22.55,17.45,2.25,3.85,2.43],
  ['boiler',22.55,26.62,2.25,1.75,2.28],
  ['stacks',30.1,22.93,4.2,2.14,2.48],
  ['boiler',36.4,18.4,.94,2.48,2.23],
  ['stacks',36.58,26.7,.82,2.62,2.48]
 ])f.furniture.push({...rect(x,z,w,d),name,height});
 const lever=position(27.78,26.68);
 f.interactions.push(item(leverId,'maintenance-lever',lever.x,lever.z,-Math.PI/2,{
  label:'拉下隔离闸',target:{...lever,y:1.3},approach:{x:26.58,z:lever.z,yaw:-Math.PI/2}
 }));
 const gateId=door(f,'isolation',28,24,'x',true,false,{kind:'isolation-gate',title:'隔离闸',width:4.8});
 const pipeGateId=door(f,'pipe-entry',42.2,18,'x',false,true,{kind:'isolation-gate',title:'管井',width:2.7});
 const {platforms,sections,end}=pipeCourse(),shaft=rect(43,11.8,end-43,31.7);
 for(const [slot,[index,offset]] of [[12,7.9],[23,-7.6]].entries()){
  const corner=platforms[index-1],id=`f1-pipe-switch-${slot+1}`;
  platforms[index].slide={id,offset};
  const side=Math.sign(offset),x=corner.x+corner.w/2+side*.98,z=corner.z+corner.d-1.07;
  f.interactions.push(item(id,'shaft-switch',x,z,side*-2.48,{
   label:'移入水管',standing:index-1,platformY:corner.y,slot:slot+1,
   target:{x,y:corner.y+1.02,z},approach:{x:x-side*.8,z:z-.62}
  }));
 }
 const route=platforms.map(({x,z,w,d,y})=>({x:x+w/2,z:z+d/2,y}));
 route[0]={x:43.25,z:18,y:0};
 const last=platforms.at(-1),endZ=last.z+last.d/2;
 f.exit=rect(end-1.9,last.z,1.9,last.d);
 f.exitGateId=door(f,'exit',end-2.7,endZ,'x',false,true,{kind:'isolation-gate',title:'室外 / 出口',width:last.d});
 f.destination=position(end-.95,endZ);
 f.gunmuFinale={
  trap:{bounds:rect(28.2,18.16,9.52,11.68),gateId,leverId},
  spawn:position(23.3,29.55),trigger:rect(14.4,16,13.65,16),
  pipeEntry:route[0],pipeGateId,platforms,sections,route,shaft,groundEdge:44,voidY:-12
 };
 f.lamps=[[11,24],[15.8,24],[18.2,19.15],[18.8,28.9],[25.9,23.2],[26.82,27.14],
  [31.7,20.65],[31.4,27.15],[36.3,24],[28.1,16],[34.2,16.05],[39.7,17.6]]
  .map(([x,z],index)=>({x,z,steady:index!==3}));
 sweepVestibule(f,10.32,4,rect(10.64,26,2.31,2.8),f);
 f.sweepRoute=[[8.6,24],[11.7,24],[13.9,24]];
 f.mainRoute=[[8.8,24],[14.6,24],[15.8,20.75],[20.7,20.75],[21.45,22.2],[26.7,24],[28.9,24],
  [29.15,21.4],[34.96,21.4],[35.45,26.05],[29.05,26.05],[29.05,24],[26.6,24],[26.58,lever.z],
  [26.45,17.2],[31.6,16.23],[39.4,16.3],...route.map(({x,z})=>[x,z]),[f.destination.x,f.destination.z]];
 door(f,'B',8.2,24,'x',true,false,{title:'上层楼梯'});
 return f;
}
function prepare(f){
 // Integer bounds anchor the navigator's half-metre grid to exactly representable coordinates.
 f.bounds={minX:Math.floor(Math.min(...f.walkableRects.map(r=>r.x))),minZ:Math.floor(Math.min(...f.walkableRects.map(r=>r.z))),maxX:Math.ceil(Math.max(...f.walkableRects.map(r=>r.x+r.w))),maxZ:Math.ceil(Math.max(...f.walkableRects.map(r=>r.z+r.d)))};
 const shaftMouth=f.gunmuFinale?.platforms[0];
 const inside=(x,z)=>f.walkableRects.some(r=>within({x,z},r)),xs=[...new Set(f.walkableRects.flatMap(r=>[r.x,r.x+r.w]))].sort((a,b)=>a-b),zs=[...new Set([...f.walkableRects.flatMap(r=>[r.z,r.z+r.d]),...(shaftMouth?[shaftMouth.z,shaftMouth.z+shaftMouth.d]:[]),6.95,9.05,22.95,25.05])].filter(z=>z>=f.bounds.minZ&&z<=f.bounds.maxZ).sort((a,b)=>a-b);
 // Join adjacent floor strips before they become ceiling meshes and line-of-sight boxes.
 f.surfaceRects=[];let previous=new Map();
 for(let j=0;j<zs.length-1;j++){
  const current=new Map(),midZ=(zs[j]+zs[j+1])/2;
  for(let i=0;i<xs.length-1;i++){
   if(!inside((xs[i]+xs[i+1])/2,midZ))continue;
   const start=xs[i];while(i+2<xs.length&&inside((xs[i+1]+xs[i+2])/2,midZ))i++;
   const end=xs[i+1],key=start+':'+end;let strip=previous.get(key);
   if(strip)strip.d=zs[j+1]-strip.z;
   else{strip=rect(start,zs[j],end-start,zs[j+1]-zs[j]);f.surfaceRects.push(strip);}
   current.set(key,strip);
  }
  previous=current;
 }
 f.boundaries=[];const used=new Set();
 for(const r of f.walkableRects)for(const vertical of [false,true])for(const end of [false,true]){
  const constant=vertical?r.x+(end?r.w:0):r.z+(end?r.d:0),lo=vertical?r.z:r.x,hi=lo+(vertical?r.d:r.w),steps=(vertical?zs:xs).filter(v=>v>=lo&&v<=hi);
  for(let i=0;i<steps.length-1;i++){
   const a=steps[i],b=steps[i+1],mid=(a+b)/2,sign=end?1:-1;if(inside(vertical?constant+sign*.02:mid,vertical?mid:constant+sign*.02))continue;
   if(vertical&&constant===8&&f.stairCores.some(core=>Math.abs(mid-(core==='A'?8:24))<1.1))continue;
   if(shaftMouth&&vertical&&constant===f.gunmuFinale.groundEdge&&mid>shaftMouth.z&&mid<shaftMouth.z+shaftMouth.d)continue;
   const key=`${vertical}:${constant}:${a}:${b}`;if(used.has(key))continue;used.add(key);f.boundaries.push(rectBounds(vertical?rect(constant-.09,a,.18,b-a):rect(a,constant-.09,b-a,.18)));
  }
 }
 f.obstacles.push(...f.partitions.map(p=>({...rectBounds(p),height:p.height,window:p.material==='wire-window'?p:null})),...f.furniture.map(p=>({...rectBounds(p),height:p.height??1.3})));
 f.belongings=apartmentBelongings(f.id);
 const stone=guideStones[f.id];
 if(stone){
  const {x,y,z}=stone,id=`guide-stone-${f.id}`;
  f.props.push({...stone,id});
  f.interactions.push({id,type:'guide-stone',label:'讲解石',x,z,target:{x,y:y+.5,z},
   approach:f.listenerDepot?{x,z:z+1.35}:{x:x-1.35,z}});
 }
 f.obstacles.push(...f.belongings.map(p=>p.bounds));
 f.sightObstacles=[...f.obstacles,...f.boundaries].flatMap(w=>w.window?[
  {...w,minY:f.base,maxY:f.base+w.window.sill},{...w,minY:f.base+w.window.lintel,maxY:f.base+3}
 ]:[{...w,minY:f.base+(w.sightMinHeight??0),maxY:f.base+(w.height??3)}]);
 for(const r of f.surfaceRects){const bounds=rectBounds(r);f.sightObstacles.push({...bounds,minY:f.base-.16,maxY:f.base},{...bounds,minY:f.base+3,maxY:f.base+3.16});}
 for(const core of f.stairCores)f.sightObstacles.push(...stairSurrounds(f.id,core,core===f.departure));
 if(f.id>1)f.sightObstacles.push(...stairWalls(f.id,f.departure),...stairLandings(f.id,f.departure),stairGuard(f.id,f.departure));
 if(f.id<8)f.sightObstacles.push(...stairWalls(f.id+1,f.arrival),...stairLandings(f.id+1,f.arrival),stairGuard(f.id+1,f.arrival));
 return f;
}
export function createCampaignBuilding(){
 const floors=[8,7,6,5,4,3,2,1].map(id=>prepare(addFalseDoorRecess(id===3?chase():id===1?boss():inspection(id)))),byId=Object.fromEntries(floors.map(f=>[f.id,f]));
 return{campaign:true,totalFloors:8,floorRise:RISE,floors,byId,links:floors.filter(f=>f.id>1).map(f=>({from:[f.id,f.departure],to:[f.id-1,f.departure]}))};
}
