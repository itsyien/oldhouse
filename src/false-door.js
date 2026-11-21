import {doorBlock} from './building.js';

export const FALSE_DOOR_IMPACT=.29, FALSE_DOOR_HOLD=.54, FALSE_DOOR_DURATION=.78;
const recesses={7:19.9,6:19.4,4:20.7,2:18.8};

export function addFalseDoorRecess(floor){
 const x=recesses[floor.id],hall=floor.scenes?.[0]?.bounds;
 if(x===undefined||!hall)return floor;
 const inward=floor.arrival==='A'||floor.id===7?1:-1,z=inward>0?hall.z+hall.d:hall.z;
 floor.walkableRects.push({x:x-1.03,z:Math.min(z,z+inward*2.65),w:2.06,d:2.65});
 floor.doorSpecs.push({id:`${floor.id}-side-door`,kind:'wood',falseDoor:true,inward,x,z,axis:'z',angle:0,swing:-inward,width:1.9,open:false,locked:false,title:`${floor.id}03`});
 return floor;
}

export function falseDoorStartsSealed(id,seed){
 // One candidate before the archives and one after. Their sites stay fixed when retrying.
 return id===7?!!(seed&1):id===6?!(seed&1):id===4?!!(seed&2):id===2?!(seed&2):true;
}

export function sealFalseDoor(door){
 door.vanished=true;
 door.open=false;
 door.amount=0;
 door.held=false;
 door.block=doorBlock(door);
}

export function springFalseDoor(game,before){
 if(game.travel||game.traversal||!before||before.floor!==game.player.floor)return false;
 const player=game.player;
 const door=game.state.doors.find(d=>d.falseDoor&&!d.vanished&&d.amount>.01&&
  Math.abs(player.x-d.x)<.9&&(before.z-d.z)*d.inward<.13&&(player.z-d.z)*d.inward>=.13);
 if(!door)return false;
 game.sanity=Math.max(0,game.sanity-50);
 game.falseDoorAttack={doorId:door.id,age:0,x:door.x,y:player.y+1.41,z:door.z+door.inward*1.55};
 game.searching=null;
 game.sprinting=false;
 return true;
}

export function updateFalseDoorAttack(game,dt){
 const attack=game.falseDoorAttack;
 attack.age+=dt;
 if(!attack.sealed&&attack.age>=FALSE_DOOR_IMPACT){
  const door=game.state.doors.find(d=>d.id===attack.doorId);
  if(door){
   game.falseDoorsSpent.add(door.id);
   sealFalseDoor(door);
   Object.assign(game.player,{x:door.x,z:door.z-door.inward*1.05,y:game.floor.base});
  }
  attack.sealed=true;
 }
 if(attack.age>=FALSE_DOOR_DURATION){
  game.falseDoorAttack=null;
  game.immunity=Math.max(game.immunity,.36);
 }
}
