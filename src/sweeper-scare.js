import * as T from 'three';
import {createCutoutActor} from './actors.js';

export function createSweeperScare(stareTexture,portraitTexture,definition,kind,alternateTexture){
 const nightVision=kind==='rush';
 const stage=new T.Scene();stage.background=new T.Color(nightVision?0x010602:0x010202);
 const camera=new T.PerspectiveCamera(53,1,.05,20);
 const {width,height}=portraitTexture.image;
 const fullPortrait={bounds:[0,0,width,height]};
 const portrait=createCutoutActor(portraitTexture,fullPortrait);
 const primary={texture:portraitTexture,geometry:portrait.geometry,eyes:[.451,nightVision?.260:.293]};
 const alternate=alternateTexture&&{...definition.alternateImpact,texture:alternateTexture,
  geometry:new T.PlaneGeometry(2.65*alternateTexture.image.width/alternateTexture.image.height,2.65)};
 const fallback=nightVision?createCutoutActor(portraitTexture,fullPortrait):createCutoutActor(stareTexture,definition);
 for(const picture of [portrait,fallback]){
  picture.material.uniforms.uScareStyle.value=1;
  picture.visible=false;stage.add(picture);
 }
 if(!nightVision)portrait.material.uniforms.uScareStyle.value=3;
 const fill=new T.HemisphereLight(nightVision?0x94d7a4:0xbcc8c8,nightVision?0x132719:0x18201e,0);
 const key=new T.DirectionalLight(nightVision?0x70e690:0xd3dedb,0);
 key.position.set(nightVision?1.2:-1.45,nightVision?.7:1.1,nightVision?1.25:.6);
 const rim=new T.DirectionalLight(nightVision?0x46dc72:0xa8b8b5,0);rim.position.set(nightVision?-.85:.85,.65,-3.9);
 stage.add(fill,key,rim);

 let action,mixer,useModel=false,impact=primary;
 const shot={scene:stage,camera,portrait,model:null,
  setModel(gltf){
   const clipName=definition.model?.clip??'WangClawLunge';
   const clip=gltf.animations.find(clip=>clip.name===clipName);
   if(!clip)throw new Error('Missing '+clipName+' animation');
   const box=new T.Box3().setFromObject(gltf.scene,true),center=box.getCenter(new T.Vector3());
   const size=box.getSize(new T.Vector3()),scale=1.85/size.y;
   if(!Number.isFinite(scale)||scale<=0)throw new Error('Invalid sweeper model bounds');
   const actor=new T.Group(),fit=new T.Group();
   fit.add(gltf.scene);fit.scale.setScalar(scale);fit.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);
   actor.add(fit);stage.add(actor);actor.visible=false;
   mixer=new T.AnimationMixer(gltf.scene);
   action=mixer.clipAction(clip).setLoop(T.LoopOnce,1);
   action.clampWhenFinished=true;action.play();
   shot.model=actor;
  },
  begin(){
   useModel=!!shot.model;
   impact=alternate&&Math.random()<.5?alternate:primary;
   portrait.geometry=impact.geometry;
   portrait.material.uniforms.uMap.value=impact.texture;
   portrait.material.uniforms.uScareChroma.value=impact===alternate;
  },
  clear(){if(shot.model)shot.model.visible=false;portrait.visible=false;fallback.visible=false;},
  update(frame,aspect){
   if(camera.aspect!==aspect){camera.aspect=aspect;camera.updateProjectionMatrix();}
   const figure=frame.figure;
   if(shot.model)shot.model.visible=!!(useModel&&figure&&figure.reveal>.001);
   portrait.visible=frame.visible;
   fallback.visible=!!(!useModel&&figure&&figure.reveal>.001);
   if(shot.model?.visible){
    shot.model.position.set(figure.x,-1.54,-figure.distance);
    shot.model.rotation.z=(nightVision?1:-1)*(.07*figure.closeness-.046*figure.reach);
    const reveal=figure.reveal;
    fill.intensity=(.055+(nightVision?.055*figure.reach:0))*reveal;
    key.intensity=((nightVision?.23:.19)+.13*figure.closeness+.10*figure.reach)*reveal;
    rim.intensity=((nightVision?.29:.24)+.24*figure.reach)*reveal;
    action.time=Math.min(figure.poseTime,action.getClip().duration);mixer.update(0);
   }
   if(fallback.visible){
    fallback.position.set(figure.x*.4,0,-figure.distance*.8);
    fallback.scale.setScalar(.8);fallback.material.uniforms.uLight.value=.24*figure.reveal+.15*figure.reach;
   }
   if(portrait.visible){
    const distance=1.1,viewHeight=2*distance*Math.tan(T.MathUtils.degToRad(camera.fov/2));
    const photoHeight=viewHeight*Math.min(2.17*frame.zoom,3.45*aspect)*(impact.scale??1);
    portrait.scale.setScalar(photoHeight/2.65);
    const [eyeX,eyeY]=impact.eyes,source=impact.texture.image;
    // Anchor each portrait to its eye line, keeping its original aspect.
    portrait.position.set(photoHeight*source.width/source.height*(.5-eyeX)+frame.x,photoHeight*(eyeY-.5)+.055,-distance);
    portrait.rotation.z=frame.roll;
    const uniforms=portrait.material.uniforms;
    uniforms.uLight.value=frame.light;
    if(!nightVision){uniforms.uTime.value=frame.impactAge;uniforms.uScareWarp.value=frame.distortion;}
   }
  }
 };
 return shot;
}
