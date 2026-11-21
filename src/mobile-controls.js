export function touchAxes(x,y,portrait){
 return portrait?{x:y,y:-x}:{x,y};
}

export function landscapeViewport(width,height,mobile){
 const portrait=mobile&&width<height;
 return {width:portrait?height:width,height:portrait?width:height,portrait};
}

export function installTouchControls({canvas,find,layout,active,look,interact,sprintThreshold}){
 const stick=find('touch-stick'),interactButton=find('touch-interact'),jump=find('touch-jump');
 const glance=find('touch-glance');
 const state={forward:0,right:0,sprint:false,jump:false,interact:false,glance:false};
 const cancel=[];

 function capture(element,start,move=()=>{},end=()=>{}){
  let pointer=null;
  function clear(){
   if(pointer===null)return;
   const id=pointer;pointer=null;end();
   if(element.hasPointerCapture(id))element.releasePointerCapture(id);
  }
  element.addEventListener('pointerdown',e=>{
   if(e.pointerType!=='touch'||pointer!==null||!active()||start(e)===false)return;
   pointer=e.pointerId;
   // An interaction can open the keypad during pointerdown and hide these controls.
   if(!active()){clear();return;}
   e.preventDefault();element.setPointerCapture(pointer);
  });
  element.addEventListener('pointermove',e=>{if(e.pointerId===pointer)move(e);});
  for(const type of ['pointerup','pointercancel','lostpointercapture']){
   element.addEventListener(type,e=>{if(e.pointerId===pointer)clear();});
  }
  cancel.push(clear);
 }

 function moveStick(e){
  const rect=stick.getBoundingClientRect(),radius=Math.min(rect.width,rect.height)*.30;
  const v=touchAxes(e.clientX-rect.left-rect.width/2,e.clientY-rect.top-rect.height/2,layout().portrait);
  const gap=Math.hypot(v.x,v.y),moving=gap>radius*.13;
  state.right=moving?v.x/gap:0;
  state.forward=moving?-v.y/gap:0;
  const trigger=sprintThreshold(),reach=Math.min(Math.max(1,trigger),gap/radius);
  const threshold=Math.max(0,trigger-(state.sprint ? .05 : 0));
  state.sprint=reach>=threshold&&state.forward>0&&state.forward>=Math.abs(state.right)*.8;
  stick.classList.toggle('sprinting',state.sprint);
  stick.style.setProperty('--stick-x',(gap?v.x/gap*reach*radius:0)+'px');
  stick.style.setProperty('--stick-y',(gap?v.y/gap*reach*radius:0)+'px');
 }
 function stopStick(){
  state.right=state.forward=0;
  state.sprint=false;stick.classList.remove('sprinting');
  stick.style.removeProperty('--stick-x');stick.style.removeProperty('--stick-y');
 }
 capture(stick,moveStick,moveStick,stopStick);

 let lastX=0,lastY=0;
 capture(canvas,e=>{
  const {width,portrait}=layout();
  if((portrait?e.clientY:e.clientX)<width*.46)return false;
  lastX=e.clientX;lastY=e.clientY;
 },e=>{
  const delta=touchAxes(e.clientX-lastX,e.clientY-lastY,layout().portrait);
  lastX=e.clientX;lastY=e.clientY;look(delta.x,delta.y);
 });
 capture(interactButton,()=>{
  if(interactButton.getAttribute('aria-disabled')==='true')return false;
  state.interact=interact()!==false;interactButton.classList.add('held');
 },undefined,()=>{state.interact=false;interactButton.classList.remove('held');});
 capture(glance,()=>{state.glance=true;glance.classList.add('held');},undefined,()=>{
  state.glance=false;glance.classList.remove('held');
 });

 capture(jump,()=>{state.jump=true;});
 jump.addEventListener('click',e=>{if(e.detail===0&&active())state.jump=true;});
 interactButton.addEventListener('click',e=>{
  if(e.detail===0&&active()&&interactButton.getAttribute('aria-disabled')!=='true')interact();
 });

 return {state,reset(){
  for(const clear of cancel)clear();
  state.jump=false;
 }};
}
