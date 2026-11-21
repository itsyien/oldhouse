export const RADIUS = .24;
const boxPoint=(p,w)=>w.angle==null?p:{x:(p.x-w.cx)*Math.cos(w.angle)-(p.z-w.cz)*Math.sin(w.angle),z:(p.x-w.cx)*Math.sin(w.angle)+(p.z-w.cz)*Math.cos(w.angle),y:p.y};
export function blocked(x,z,walls,radius=RADIUS){
 return walls.some(w=>{
  if(x<w.minX-radius||x>w.maxX+radius||z<w.minZ-radius||z>w.maxZ+radius)return false;
  const p=boxPoint({x,z},w),rotated=w.angle!=null;
  const dx=p.x-Math.max(rotated?-.95:w.minX,Math.min(p.x,rotated?.95:w.maxX));
  const dz=p.z-Math.max(rotated?-.055:w.minZ,Math.min(p.z,rotated?.055:w.maxZ));
  return dx*dx+dz*dz<radius*radius;
 });
}
export function move(p,dx,dz,walls,radius=RADIUS){
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
 let {x,z}=p;
 for(let i=0;i<steps;i++){
  if(!blocked(x+dx/steps,z,walls,radius))x+=dx/steps;
  if(!blocked(x,z+dz/steps,walls,radius))z+=dz/steps;
 }
 return {x,z};
}
export function clearSight(a,b,walls){
 const minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minZ=Math.min(a.z,b.z),maxZ=Math.max(a.z,b.z);
 return !walls.some(w=>{
  // Most walls are nowhere near this segment. Test their world bounds before clipping the ray in door space.
  if(w.maxX<minX||w.minX>maxX||w.maxZ<minZ||w.minZ>maxZ)return false;
  let lo=0,hi=1;const p=boxPoint(a,w),q=boxPoint(b,w),rotated=w.angle!=null;
  const axes=[[p.x,q.x-p.x,rotated?-.95:w.minX,rotated?.95:w.maxX],[p.z,q.z-p.z,rotated?-.055:w.minZ,rotated?.055:w.maxZ]];
  if(w.minY!=null&&a.y!=null&&b.y!=null)axes.push([a.y,b.y-a.y,w.minY,w.maxY]);
  for(const [v,d,min,max] of axes){
   if(Math.abs(d)<1e-9){if(v<min||v>max)return false;continue;}
   const t1=(min-v)/d,t2=(max-v)/d;
   lo=Math.max(lo,Math.min(t1,t2)); hi=Math.min(hi,Math.max(t1,t2));
   if(lo>hi)return false;
  }
  return hi>0.001&&lo<.999;
 });
}
export function doorBounds(x,z,angle,amount){
 const a=angle+amount*Math.PI/2;
 const cx=x-Math.cos(angle)*.95+Math.cos(a)*.95;
 const cz=z+Math.sin(angle)*.95-Math.sin(a)*.95;
 const hx=Math.abs(Math.cos(a))*.95+Math.abs(Math.sin(a))*.055;
 const hz=Math.abs(Math.sin(a))*.95+Math.abs(Math.cos(a))*.055;
 return {minX:cx-hx,maxX:cx+hx,minZ:cz-hz,maxZ:cz+hz,cx,cz,angle:a};
}
