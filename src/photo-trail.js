import * as T from 'three';
import {floorPassable,doorBlock} from './building.js';

export function photoTrail(f,nav,seed){
 let value=(seed^Math.imul(f.id,2654435761))>>>0;
 const random=()=>((value=(Math.imul(value,1664525)+1013904223)>>>0)/4294967296);
 const route=[];
 for(let i=1;i<f.mainRoute.length;i++){
  const a=f.mainRoute[i-1],b=f.mainRoute[i],path=nav.path({floor:f.id,x:a[0],z:a[1]},{floor:f.id,x:b[0],z:b[1]},[],true);
  for(const p of path)if(p.floor===f.id&&(!route.length||Math.hypot(p.x-route.at(-1).x,p.z-route.at(-1).z)>.01))route.push({...p});
  if(route.length)route.at(-1).turn=true;
 }
 const blocks=f.doorSpecs.flatMap(d=>[0,.25,.5,.75,1].map(amount=>doorBlock({...d,amount})));
 const result=[];let distance=0,next=.7;
 for(let i=1;i<route.length;i++){
  const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
  if(b.turn&&next>distance+length&&distance+length-(result.at(-1)?.distance??0)>1.3)next=distance+length;
  for(;next<=distance+length;next+=.45+random()*1.9){
   const t=(next-distance)/length,cx=a.x+dx*t,cz=a.z+dz*t;
   for(const offset of [(random()-.5)*2.2,(random()-.5)*1.6,-.55,.55,0]){
    const x=cx-dz/length*offset,z=cz+dx/length*offset;
    if(!floorPassable(f,{x,z},.37,blocks)||result.some(p=>Math.hypot(p.x-x,p.z-z)<.49))continue;
    const width=(.18+random()*.08)*1.15;result.push({x,z,y:.018,width,height:width*1.18,yaw:random()*Math.PI*2,tint:.76+random()*.20,distance:next});break;
   }
  }
  distance+=length;
 }
 return result.map(p=>({...p,variant:Math.floor(random()*4)}));
}

export function scatterFloorPhotos(f,seed){
 let value=(seed^Math.imul(f.id,2654435761))>>>0;
 const random=()=>((value=(Math.imul(value,1664525)+1013904223)>>>0)/4294967296);
 const blocks=f.doorSpecs.flatMap(d=>[0,.5,1].map(amount=>doorBlock({...d,amount})));
 const result=[];
 for(let attempt=0;attempt<160&&result.length<16;attempt++){
  const r=f.walkableRects[Math.floor(random()*f.walkableRects.length)];
  const x=r.x+random()*r.w,z=r.z+random()*r.d;
  if(!floorPassable(f,{x,z},.33,blocks)||x<8.6||result.some(p=>Math.hypot(p.x-x,p.z-z)<.7))continue;
  const width=.21+random()*.065;
  result.push({x,z,y:.018,width,height:width*1.18,yaw:random()*Math.PI*2,tint:.82+random()*.16,variant:Math.floor(random()*4)});
 }
 return result;
}

export function createPhotoTrail(texture,placements,grayscale=true){
 const material=new T.MeshStandardMaterial({map:texture,color:0xd5c9a8,roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 material.onBeforeCompile=shader=>{shader.uniforms.uPhotoAspect={value:texture.image.width/texture.image.height*1.18};shader.uniforms.uMonochrome={value:grayscale};shader.fragmentShader='uniform float uPhotoAspect; uniform bool uMonochrome;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
  vec2 uv=vMapUv;
  vec2 photoUV=(uv-vec2(.035))/vec2(.93);
  photoUV=(photoUV-.5)*vec2(min(1.,1./uPhotoAspect),min(1.,uPhotoAspect))+.5;
  vec4 photo=texture2D(map,clamp(photoUV,0.,1.));
  float mask=step(.035,uv.x)*step(uv.x,.965)*step(.035,uv.y)*step(uv.y,.965);
  float grey=dot(photo.rgb,vec3(.2126,.7152,.0722));
  // Work in perceptual grayscale so stronger contrast retains dark photographic detail.
  grey=clamp((pow(grey,1./2.2)-.5)*1.25+.5,0.,1.);
  float grain=fract(sin(dot(floor(uv*280.),vec2(12.9898,78.233)))*43758.5453);
  float edge=min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y));
  float nick=fract(sin(dot(floor(uv*95.),vec2(41.37,17.23)))*15731.71);
  if(edge<.003+nick*.005)discard;
  float stain=1.-.28*exp(-length((uv-vec2(.13,.22))*vec2(7.,5.)))-.22*(1.-smoothstep(0.,.12,edge));
  float crease=1.-.10*exp(-abs(uv.y-.32-uv.x*.24)*180.);
  vec3 paper=vec3(.73,.67,.55);
  vec3 printColor=vec3(pow(.07+grey*.83,2.2))*vec3(1.04,1.,.89);
  if(!uMonochrome)printColor=photo.rgb*.87;
  diffuseColor.rgb*=mix(paper,printColor,photo.a*mask*.98)*stain*crease*(.92+grain*.08);
 `);};
 const geometry=new T.PlaneGeometry(1,1);geometry.rotateX(-Math.PI/2);
 const mesh=new T.InstancedMesh(geometry,material,placements.length),dummy=new T.Object3D();mesh.name='discarded-photo-trail';
 placements.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.yaw,0);dummy.scale.set(p.width,1,p.height);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new T.Color().setScalar(p.tint));});
 mesh.computeBoundingSphere();return mesh;
}
