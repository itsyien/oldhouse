import test from 'node:test';
import assert from 'node:assert/strict';
import {CampaignGame} from '../src/campaign.js';
import {createCampaignBuilding} from '../src/campaign-layout.js';
import {Navigator} from '../src/navigation.js';
const building=createCampaignBuilding(),nav=new Navigator(building);
function game(){const g=new CampaignGame(building,17,nav);g.jumpFloor(3);g.threat={kind:'kun',floor:3,age:5,warning:2};Object.assign(g.player,{x:25,z:24});return g;}
function turn(g,angles,dt=.05){for(const yaw of angles)g.movePlayer(dt,{yaw});}
test('quick natural turn briefly slows movement without locking controls; a normal corner is unpenalized',()=>{
 const g=game();turn(g,[-Math.PI/2,0]);const ordinary=g.movePlayer(.1,{yaw:-Math.PI/2,sprint:true,forward:1});assert(ordinary>.49);
 turn(g,[-Math.PI/2,-Math.PI/4,0,Math.PI/4,Math.PI/2]);const slowed=g.movePlayer(.1,{yaw:Math.PI/2,sprint:true,forward:1});assert(slowed>.3&&slowed<.44,'still moving, at reduced speed');
 for(let n=0;n<7;n++)g.movePlayer(.1,{yaw:Math.PI/2});assert(g.movePlayer(.1,{yaw:Math.PI/2,sprint:true,forward:1})>.49);
});
test('slow look-around, wrapped yaw and another floor do not incur Kun turn cost',()=>{
 const slow=game();turn(slow,[-Math.PI/2,-Math.PI/4,0,Math.PI/4,Math.PI/2],.22);assert(slow.movePlayer(.1,{yaw:Math.PI/2,sprint:true,forward:1})>.49);
 const wrap=game();turn(wrap,[Math.PI-.1,-Math.PI+.1]);assert(wrap.movePlayer(.1,{yaw:Math.PI/2,sprint:true,forward:1})>.49);
 const other=game();other.jumpFloor(7);other.threat={kind:'kun',floor:7,age:5,warning:2};turn(other,[-Math.PI/2,Math.PI/2]);assert(other.movePlayer(.1,{yaw:Math.PI/2,sprint:true,forward:1})>.49);
});
test('a new encounter cannot inherit a previous turn penalty',()=>{
 const g=game();turn(g,[-Math.PI/2,Math.PI/2]);assert(g.movePlayer(.05,{yaw:Math.PI/2,sprint:true,forward:1})<.2);
 g.threat={kind:'kun',floor:3,age:0,warning:2};assert(g.movePlayer(.1,{yaw:Math.PI/2,sprint:true,forward:1})>.49);
 g.threat.age=5;assert(g.movePlayer(.1,{yaw:Math.PI/2,sprint:true,forward:1})>.49);
});
