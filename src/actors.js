import * as T from 'three';
import {stairHeight,RISE} from './building.js';
export function createActor(texture,name){
 // Outline geometry keeps the supplied photographs unchanged and removes their rectangular backdrops.
 const silhouettes={
  kun:{w:2.95,top:.075,bottom:1,p:[[.49,.13],[.51,.10],[.55,.085],[.59,.09],[.62,.12],[.61,.18],[.59,.22],[.65,.25],[.68,.29],[.68,.32],[.72,.34],[.74,.36],[.80,.365],[.845,.38],[.855,.41],[.855,.49],[.83,.52],[.79,.53],[.75,.52],[.73,.49],[.72,.45],[.735,.41],[.68,.39],[.63,.37],[.61,.41],[.56,.46],[.57,.50],[.61,.57],[.66,.68],[.66,.73],[.635,.83],[.61,.91],[.62,.95],[.655,.975],[.66,1],[.54,.98],[.54,.96],[.56,.91],[.575,.78],[.58,.73],[.55,.68],[.49,.60],[.47,.59],[.46,.67],[.475,.70],[.46,.74],[.45,.87],[.44,.92],[.45,.965],[.44,1],[.39,1],[.385,.985],[.40,.94],[.405,.90],[.39,.86],[.39,.76],[.38,.68],[.37,.61],[.375,.52],[.38,.465],[.365,.46],[.38,.40],[.40,.37],[.36,.39],[.31,.43],[.28,.46],[.25,.50],[.235,.52],[.23,.55],[.22,.56],[.205,.55],[.20,.53],[.21,.51],[.22,.50],[.23,.46],[.26,.42],[.30,.38],[.35,.33],[.38,.29],[.41,.265],[.41,.245],[.46,.23],[.46,.22],[.51,.20]]},
  liang:{w:2.55,top:.175,bottom:.66,p:[[.26,.31],[.27,.26],[.31,.22],[.37,.195],[.44,.18],[.51,.18],[.58,.195],[.62,.23],[.64,.28],[.64,.32],[.66,.33],[.66,.37],[.64,.40],[.65,.44],[.80,.46],[1,.495],[1,.66],[0,.66],[0,.49],[.15,.46],[.27,.44],[.27,.40],[.25,.37],[.245,.34]]},
  naiwa:{w:1.85,top:.245,bottom:.955,p:[[.35,.285],[.40,.26],[.46,.25],[.52,.25],[.56,.27],[.59,.31],[.62,.35],[.66,.39],[.69,.44],[.71,.49],[.75,.55],[.765,.61],[.76,.66],[.74,.70],[.68,.73],[.67,.80],[.65,.86],[.65,.89],[.68,.91],[.67,.935],[.62,.95],[.55,.95],[.51,.94],[.505,.92],[.53,.90],[.60,.885],[.55,.83],[.51,.76],[.50,.755],[.48,.82],[.47,.86],[.48,.87],[.50,.89],[.49,.902],[.43,.91],[.30,.91],[.285,.90],[.29,.89],[.32,.88],[.43,.865],[.38,.82],[.35,.77],[.335,.72],[.30,.70],[.27,.66],[.25,.61],[.235,.605],[.225,.59],[.225,.55],[.24,.52],[.28,.50],[.31,.47],[.35,.44],[.37,.41],[.385,.38],[.38,.35],[.35,.335],[.345,.325]]}
 };
 if(name === "inspector") return makePhotoActor(texture); const s=silhouettes[name],shape=new T.Shape();
 s.p.forEach(([x,y],i)=>shape[i?'lineTo':'moveTo']((x-.5)*s.w,(.5-(y-s.top)/(s.bottom-s.top))*2.65));shape.closePath();
 const geometry=new T.ShapeGeometry(shape),positions=geometry.attributes.position,uvs=geometry.attributes.uv;
 for(let i=0;i<positions.count;i++)uvs.setXY(i,positions.getX(i)/s.w+.5,1-(s.top+(.5-positions.getY(i)/2.65)*(s.bottom-s.top)));
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,
  uniforms:{uHeat:{value:0},uSide:{value:0},uGround:{value:-1000},uMap:{value:texture},uTime:{value:0},uOpacity:{value:1},uLight:{value:.68},uSilhouette:{value:false},uVisitor:{value:false},uScareStyle:{value:0},uScareWarp:{value:0},uScareChroma:{value:false},uKind:{value:{naiwa:0,sun:1,kun:2,liang:3}[name]}},
  vertexShader:`varying vec2 vUv; varying float vDistance; varying float vWorldY; void main(){vWorldY=(modelMatrix*vec4(position,1.)).y;vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.);vDistance=-p.z;gl_Position=projectionMatrix*p;}`,
  fragmentShader:`uniform float uHeat;uniform float uSide;uniform float uGround;varying float vWorldY;uniform sampler2D uMap;uniform float uTime;uniform float uOpacity;uniform float uLight;uniform bool uSilhouette;uniform bool uVisitor;uniform int uScareStyle;uniform float uScareWarp;uniform bool uScareChroma;uniform int uKind;varying vec2 vUv;varying float vDistance;
   float scareHash(vec2 cell){return fract(sin(dot(cell,vec2(12.9898,78.233)))*43758.5453);}
   void main(){if(vWorldY<uGround)discard;vec2 uv=vUv;
   if(uScareStyle==3&&uScareWarp>0.){
    float row=floor(uv.y*54.);
    float dropout=scareHash(vec2(row,floor(uTime*23.)));
    uv.x+=uScareWarp*(.028*sin(uv.y*27.-uTime*24.)+.12*(dropout-.78)*step(.78,dropout)*sin(row+uTime*35.));
    uv.y+=uScareWarp*.01*sin(uv.x*23.-uTime*19.);
    if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))discard;
   }
   vec4 c=texture2D(uMap,uv);float edge=uKind==3?smoothstep(.34,.48,uv.y):uKind==1?smoothstep(0.,.12,uv.y):1.;
   if(uKind==3)edge*=smoothstep(0.,.10,min(uv.x,1.-uv.x));
   float mask=1.;float lum=dot(c.rgb,vec3(.2126,.7152,.0722));
   
   if(uScareStyle==1||uScareStyle==3)edge*=smoothstep(0.,.13,min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y)));
   if(uScareStyle==2)edge*=smoothstep(.441,.577,uv.y)*(1.-smoothstep(.687,.750,uv.x));
   if(uScareStyle==4)edge*=smoothstep(.515,.561,uv.y);
   float alpha=c.a*mask*edge*uOpacity;if(alpha<.02)discard;
   vec3 col=mix(vec3(lum),c.rgb,uKind==4?.65:uKind==0?.35:.05)*uLight;
   if(uVisitor){
    float topKey=mix(.33, .88, smoothstep(.18,.94,uv.y));
    float slant=mix(.67,1.,smoothstep(.18,.79,uv.x));
    col=mix(vec3(lum),c.rgb,.48)*vec3(.65,.84,1.15)*topKey*slant;
   }
   if(uSilhouette)col=vec3(.04,.065,.052)*uLight;
   if(uScareStyle==1){
    col=c.rgb*uLight;
   }else if(uScareStyle==3){
    float vignette=1.-.8*smoothstep(.07,.52,length((uv-vec2(.41,.72))*vec2(.95,1.12)));
    float shade=1.-.45*smoothstep(.43,.80,uv.x);
    float grit=uScareWarp>0.?scareHash(floor(gl_FragCoord.xy*.74)+floor(uTime*31.))-.5:0.;
    float scan=sin(gl_FragCoord.y*1.59-uTime*38.);
    vec3 tone=uScareChroma?min(c.rgb/max(lum,.012),vec3(1.55)):vec3(.77,.92,.86);
    col=tone*uLight*vignette*shade*max(0.,lum*(1.+uScareWarp*(.36*grit+.13*scan))+.021*grit*uScareWarp);
   }else if(uScareStyle==2){
    float eyeLeft=length((uv-vec2(.187,.715))/vec2(.046,.054));
    float eyeRight=length((uv-vec2(.478,.804))/vec2(.065,.066));
    float eye=1.-smoothstep(.69,1.,min(eyeLeft,eyeRight));
    col=mix(col*.66,vec3(.62,.74,.72)*(.4+.54*sqrt(lum)),eye*.96);
   }else if(uScareStyle==4){
    vec2 pixel=vec2(uv.x,1.-uv.y)*vec2(1187.,1325.);
    vec2 eyeL=(pixel-vec2(508.,361.))/vec2(26.,10.);
    vec2 eyeR=(pixel-vec2(623.,349.4))/vec2(26.,10.2);
    eyeL.y+=.24*eyeL.x;
    eyeR.y+=.49*eyeR.x;
    float eyes=1.-smoothstep(.69,1.10,min(dot(eyeL,eyeL),dot(eyeR,eyeR)));
    float sideKey=mix(.38,1.,1.-smoothstep(.44,.61,uv.x));
    col=mix(c.rgb,vec3(lum)*vec3(.70,.86,1.05),.74)*uLight*sideKey*(1.-eyes);
   }
   col*=1.-.48*abs(uSide)*smoothstep(-.24,.24,-sign(uSide)*(uv.x-.5));
   col=mix(col,vec3(.006,.010,.008),smoothstep(8.,32.,vDistance)*(uVisitor?.48:1.));
   col=mix(col,col*vec3(1.5,.65,.15)+vec3(.65,.16,.015),uHeat*.8);gl_FragColor=vec4(col,alpha);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`});
 return new T.Mesh(geometry,material);
}

function makePhotoActor(texture){const a=createActor(texture,'liang');a.geometry.dispose();a.geometry=new T.PlaneGeometry(2.4,2.4);a.material.uniforms.uKind.value=1;return a;}
export function scareKey(threat){return threat.kind;}
export const SCARE_IMPACT=.16,SCARE_DURATION=1.55;
export function scareFrame(age,reduced=false,kind){
 if(kind==='patrol'||kind==='rush'){
  const nightVision=kind==='rush',impact=nightVision?2.51:3.2,hit=Math.max(0,age-impact);
  const fadeStart=impact+1.95,duration=impact+2.7;
  const poseAge=nightVision?age:age*2.35/impact;
  const fade=T.MathUtils.smoothstep(age,fadeStart,duration);
  const reveal=T.MathUtils.smoothstep(poseAge,nightVision?.16:.12,nightVision?.62:.58);
  const slide=T.MathUtils.smoothstep(poseAge,nightVision?.3:.24,nightVision?1.94:1.78);
  const reach=T.MathUtils.smoothstep(poseAge,nightVision?(reduced?1.62:1.96):(reduced?1.48:1.8),nightVision?impact:2.35);
  const shake=reduced?0:Math.sin(hit*48)*Math.exp(-hit*21)*Math.min(1,hit/.038);
  return {impact,duration,fade,world:false,visible:age>=impact&&age<duration,impactPhoto:age>=impact,
   black:fade,x:shake*.038,y:0,roll:shake*.035,
   grain:reduced?0:.12*Math.abs(shake)+(nightVision?0:.075*reveal*(1-fade)),
   light:nightVision?.72+.11*T.MathUtils.smoothstep(hit,0,.15):.27+.14*Math.exp(-hit*12),
   zoom:reduced?1:.91+.12*T.MathUtils.smoothstep(hit,0,.075)+.045*T.MathUtils.smoothstep(age,impact+.14,fadeStart),
   ...(!nightVision&&{impactAge:hit,distortion:reduced?0:(.43+.57*Math.exp(-hit*13))*(1-fade)}),
   figure:age<impact?{poseTime:reduced?Math.min(poseAge,nightVision?1.78:1.62)+.63*reach:poseAge,reveal,
    x:reduced?0:nightVision?-.72+.95*slide-.12*reach:.67-.87*slide+.09*reach,
    distance:5.15-2.42*slide-(reduced?.54:nightVision?1.56:1.48)*reach,closeness:slide,reach}:null};
 }
 if(kind==='yujie'){
  const impact=.86,duration=2.18,hit=Math.max(0,age-impact);
  const fade=T.MathUtils.smoothstep(age,1.58,duration);
  const key=T.MathUtils.smoothstep(age,.19,.45);
  const intake=reduced?0:T.MathUtils.smoothstep(age,.68,.78)*(1-T.MathUtils.smoothstep(hit,0,.10));
  const close=T.MathUtils.smoothstep(hit,0,reduced?.32:.095);
  const recoil=reduced?0:Math.sin(hit*38)*Math.exp(-hit*20)*close;
  return{impact,duration,fade,world:false,visible:age>=.19&&age<duration,black:fade,
   distance:2.64-(reduced?.86:1.17)*close,x:.035+recoil*.032,y:-.095+.04*close,roll:recoil*.018,
   light:(.48*key+.32*close)*(1-.72*intake),grain:reduced?0:.025*close*(1-fade)};
 }
 const fade=T.MathUtils.smoothstep(age,1.13,SCARE_DURATION);
 if(kind==='naiwa'){
  const impact=.315,hit=Math.max(0,age-impact),settle=Math.exp(-hit*13);
  const rush=T.MathUtils.smoothstep(age,impact,impact+(reduced?.38:.084));
  const intake=.74*(1-T.MathUtils.smoothstep(age,.105,.27));
  return {impact,fade,world:age<.12,visible:age>=.095&&age<SCARE_DURATION,
   black:Math.max(intake,fade),distance:2.52-.135*T.MathUtils.smoothstep(age,.11,.28)-1.37*rush,
   x:reduced?0:.32+.075*Math.sin(hit*59)*settle*rush,
   y:reduced?0:-.135*(1-rush)+.028*Math.sin(hit*52)*settle*rush,
   roll:reduced?0:-.068*rush+.09*Math.sin(hit*39)*settle*rush,
   light:.26+.65*rush,grain:reduced?0:.08*rush*settle*(1-fade)};
 }
 const t=Math.max(0,age-SCARE_IMPACT),reveal=T.MathUtils.smoothstep(t,0,reduced?.28:.055);
 const rush=1-Math.exp(-t*(reduced?6:28)),settle=reduced?0:Math.exp(-t*8);
 return{impact:SCARE_IMPACT,world:age<.1,visible:age>=SCARE_IMPACT&&age<SCARE_DURATION,black:age<.1?.55+.45*T.MathUtils.smoothstep(age,0,.1):1-reveal*(1-fade),fade,
  distance:1.65-.59*rush-.10*T.MathUtils.smoothstep(t,.3,1),
  x:reduced?0:Math.sin(t*61)*.035*settle,y:reduced?0:Math.sin(t*47)*.022*settle,
  roll:reduced?0:Math.sin(t*38)*.045*settle,light:.88+settle*.16,grain:reduced?0:.10*(1-fade)};
}
export function createCutoutActor(texture,frame){
 const [left,top,right,bottom]=frame.bounds,{width,height}=texture.image,a=createActor(texture,'liang');a.geometry.dispose();a.geometry=new T.PlaneGeometry(2.65*(right-left)/(bottom-top),2.65);
 const uv=a.geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(left+uv.getX(i)*(right-left))/width,1-(bottom-uv.getY(i)*(bottom-top))/height);
 a.material.uniforms.uKind.value=4;a.material.uniforms.uVisitor.value=frame.asset==='yujie';return a;
}
