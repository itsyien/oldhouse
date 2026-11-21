import * as T from 'three';
import {FALSE_DOOR_IMPACT,FALSE_DOOR_HOLD,FALSE_DOOR_DURATION} from './false-door.js';

export function createFalseDoorEffect(scene){
 const figure=new T.Group();
 figure.name='False door pursuer';figure.visible=false;scene.add(figure);
 const cloth=new T.MeshStandardMaterial({color:0x29342e,roughness:.99,emissive:0x111713,emissiveIntensity:.23});
 const fold=new T.MeshStandardMaterial({color:0x445549,roughness:.96,emissive:0x1d2c23,emissiveIntensity:.22});
 const wax=new T.MeshStandardMaterial({color:0x777b63,roughness:.91,emissive:0x565b47,emissiveIntensity:.34});
 const slit=new T.MeshBasicMaterial({color:0x131512});
 const orb=new T.IcosahedronGeometry(1,2);
 const finger=new T.CylinderGeometry(.05,.026,1,6);
 const up=new T.Vector3(0,1,0),tip=new T.Vector3(),tail=new T.Vector3();
 function body(parent,material,x,y,z,w,h,d){
  const mesh=new T.Mesh(orb,material);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);parent.add(mesh);return mesh;
 }
 function limb(parent,from,to,scale,material){
  tip.fromArray(to);tail.fromArray(from);
  const mesh=new T.Mesh(finger,material);mesh.position.copy(tip).add(tail).multiplyScalar(.5);
  tip.sub(tail);const length=tip.length();
  mesh.quaternion.setFromUnitVectors(up,tip.multiplyScalar(1/length));mesh.scale.set(scale,length,scale);parent.add(mesh);
 }
 body(figure,cloth,0,-.64,-.13,.41,.7,.26).rotation.z=-.17;
 body(figure,fold,-.07,-.24,-.045,.24,.31,.23).rotation.z=.16;
 const head=new T.Group();figure.add(head);
 body(head,cloth,-.03,.035,-.10,.30,.47,.31).rotation.z=.12;
 body(head,fold,-.104,.16,.078,.175,.315,.095).rotation.z=.33;
 body(head,wax,.018,-.02,.139,.146,.295,.108).rotation.z=-.19;
 body(head,slit,-.013,-.039,.243,.018,.166,.015).rotation.z=-.26;
 for(const side of [-1,1]){
  const arm=new T.Group();arm.position.set(.29*side,-.45,-.06);figure.add(arm);
  const elbow=[.25*side,-.20,.20],wrist=[.36*side,.14,.46];
  limb(arm,[0,0,0],elbow,2.4,cloth);limb(arm,elbow,wrist,1.7,fold);
  body(arm,wax,...wrist,.095,.106,.05);
  for(let n=0;n<3;n++){
   const x=wrist[0]+side*(n-1)*.051,y=wrist[1]+.055,z=wrist[2];
   const joint=[x+side*.035,y+.155-.035*Math.abs(n-1),z+.095];
   limb(arm,[x,y,z],joint,.56,wax);
   limb(arm,joint,[joint[0]-side*.035,joint[1]-.039,joint[2]+.080],.44,wax);
  }
 }
 const start=new T.Vector3(),approach=new T.Vector3();
 return{update(attack,camera,reduced){
  const age=attack?.age??0;
  const p=T.MathUtils.smoothstep(age,0,FALSE_DOOR_IMPACT);
  figure.visible=!!attack&&age<FALSE_DOOR_IMPACT;
  if(figure.visible){
   start.set(attack.x,attack.y,attack.z);
   approach.copy(camera.position).sub(start).normalize();
   figure.position.copy(camera.position).addScaledVector(approach,-(reduced?.76:.45)).lerp(start,1-p*p*p);
   figure.lookAt(camera.position);
   head.rotation.z=reduced?-.07:.24-.46*p;
   head.rotation.x=-.18*p;
   figure.children.at(-1).rotation.y=-.53*p;
   figure.children.at(-2).rotation.y=.53*p;
  }
  if(!attack)return 0;
  return T.MathUtils.smoothstep(age,FALSE_DOOR_IMPACT-(reduced?.14:.043),FALSE_DOOR_IMPACT)*
   (1-T.MathUtils.smoothstep(age,FALSE_DOOR_HOLD,FALSE_DOOR_DURATION));
 }};
}
