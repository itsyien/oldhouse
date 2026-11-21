const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};

export const chaseHazards=floor=>floor.chaseHazards?.length?floor.chaseHazards:floor.chaseCollapse?[floor.chaseCollapse]:[];

export function chaseHazardAge(floor,state,hazard,time){
 const first=chaseHazards(floor)[0];
 const start=hazard===first||hazard.id!=null&&hazard.id===first?.id?state.chaseCollapseAt:state.chaseHazardAt?.[hazard.id];
 return Number.isFinite(start)?time-start:-Infinity;
}

// A vertical drop keeps its physical footprint fixed. Crumpled rubble becomes a low step only when visibly clear.
export function chaseHazardPose(hazard,age){
 const landed=hazard.warning+hazard.fallDuration,clear=landed+hazard.hold+hazard.settle;
 const fall=smooth((age-hazard.warning)/hazard.fallDuration),settle=smooth((age-landed-hazard.hold)/hazard.settle);
 const bottom=2.13-2.07*fall,height=1.2-1.04*settle,top=bottom+height;
 const phase=age<0?'idle':age<hazard.warning?'warning':age<landed?'falling':age<landed+hazard.hold?'blocking':age<clear?'settling':'settled';
 return {phase,bottom,top,height,centerY:bottom+height/2,angle:0,scaleY:height/1.2,solid:age>=0&&bottom<=1.65&&top>.24};
}
