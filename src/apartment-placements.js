// Dimensions include the open lids, hanging fabric and tipped chair. The same envelopes go to navigation.
export const BELONGINGS_SIZE={
 evacuation:{w:1.74,d:1.04,height:.64},
 laundry:{w:1.46,d:.82,height:1.52},
 records:{w:1.43,d:.94,height:.93},
 supper:{w:1.72,d:.76,height:.93}
};

// Centres and facings follow the actual rooms. Leave the empty side of each composition open to approach.
const arrangements={
 8:[['evacuation',13.6,9.52,-1.48],['records',21.63,18.17,-.06]],
 7:[['records',15.7,27.36,2.99],['laundry',45.2,18.65,.16],['evacuation',51.7,-3.32,2.96]],
 6:[['evacuation',16.6,4.78,-.12],['records',48.4,7.41,3.05]],
 5:[['evacuation',16.2,26.65,-1.26],['records',38.2,17.12,.08],['records',45.28,5.86,3.10]],
 4:[['laundry',26.9,4.80,-.14],['evacuation',53.8,7.48,3.08]],
 3:[['laundry',17.5,20.85,-.16]],
 2:[['supper',16.7,5.12,-.58],['records',53.7,7.60,-.12],['supper',28.4,44.71,3.13]],
 1:[['evacuation',11.36,22.80,-.10]]
};

// One piece of the residents' paper trail in each of these rooms, mounted on existing solid plaster.
export const tenantWalls={
 8:{x:15.56,z:11.4,yaw:Math.PI,kind:'heights'},
 6:{x:16.8,z:3.9,yaw:0,kind:'class'},
 5:{x:27.65,z:28,yaw:Math.PI,kind:'storage'},
 2:{x:17.25,z:3.9,yaw:0,kind:'meal'}
};

// Set on the landing bench, a classroom desk and the depot sorting bench.
export const guideStones={
 8:{model:'jiangjieshi',x:22.01,y:.4554,z:16.91,yaw:-1.24,scale:.67},
 6:{model:'jiangjieshi',x:26.24,y:.83,z:7.83,yaw:-1.3,scale:.71},
 5:{model:'jiangjieshi',x:25.25,y:.939,z:18.325,yaw:.28,scale:.63}
};

export function apartmentBelongings(id){
 return (arrangements[id]||[]).map(([kind,x,z,yaw],i)=>{
  const {w,d,height}=BELONGINGS_SIZE[kind],c=Math.abs(Math.cos(yaw)),s=Math.abs(Math.sin(yaw));
  const halfX=(w*c+d*s)/2,halfZ=(w*s+d*c)/2;
  return {kind,x,z,yaw,variant:id+i,bounds:{minX:x-halfX,maxX:x+halfX,minZ:z-halfZ,maxZ:z+halfZ,height}};
 });
}
