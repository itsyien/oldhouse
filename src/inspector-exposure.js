const blendTime=.24;

export function createInspectorExposure(random=Math.random){
 const amount={value:.16};
 let elapsed=0,end=0,from=.5,to=.5,flicker=.5;
 function resetFlicker(){
  elapsed=end=0;
  from=to=flicker=.5;
 }
 return {
  amount,
  reset(){
   resetFlicker();
   amount.value=.16;
  },
  update(dt,reduced,age,warning){
   if(reduced)resetFlicker();
   else if(dt>0){
    if(elapsed>=end){
     from=flicker;
     const next=random();
     to=next<.09?0:next>.91?1:next;
     elapsed=0;
     end=blendTime+.45+.70*random();
    }
    elapsed+=dt;
    const t=Math.min(1,elapsed/blendTime);
    flicker=from+(to-from)*t*t*(3-2*t);
   }
   // Raise the whole flicker range over the two checks so late dips still stay blue.
   const t=Math.max(0,Math.min(1,age/(warning+11))),pressure=t*t*(3-2*t);
   amount.value=.07+.67*pressure+(.18+.08*pressure)*flicker;
  }
 };
}

export function bindInspectorExposure(material,exposure){
 if(!material.isMeshStandardMaterial||!material.map||!material.emissiveMap)throw Error('Inspector is missing its original and blue textures');
 material.emissiveIntensity=0;
 material.onBeforeCompile=shader=>{
  shader.uniforms.inspectorExposure=exposure.amount;
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>','#include <common>\nuniform float inspectorExposure;')
   .replace('#include <emissivemap_fragment>','vec3 blueGrade=texture2D(emissiveMap,vEmissiveMapUv).rgb;')
   .replace('#include <opaque_fragment>','outgoingLight=mix(outgoingLight,blueGrade,inspectorExposure);\n#include <opaque_fragment>');
 };
}
