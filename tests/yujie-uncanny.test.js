import test from 'node:test';
import assert from 'node:assert/strict';
import {scareFrame} from '../src/actors.js';

test('Yujie holds the same stare before the hit and fades only after the close-up',()=>{
 const frame=age=>scareFrame(age,false,'yujie');
 const opening=frame(.12),stare=frame(.46),intake=frame(.80),hit=frame(.96),hold=frame(1.5);
 assert(!opening.world&&!opening.visible);
 assert(stare.visible&&stare.distance===intake.distance&&stare.x===intake.x);
 assert(intake.light<stare.light*.4&&intake.roll===0);
 assert(hit.impact>.8&&hit.distance<stare.distance-.9);
 assert(hold.visible&&hold.fade===0&&hold.light>stare.light);
 assert(!frame(hit.duration).visible&&frame(hit.duration).fade===1);
});

test('Yujie reduced effects softens the close-up without dimming or shaking the held stare',()=>{
 const frame=age=>scareFrame(age,true,'yujie');
 const early=frame(.46),late=frame(.80),arrival=frame(.96);
 assert.equal(early.light,late.light);
 assert(arrival.distance>scareFrame(.96,false,'yujie').distance);
 assert.equal(arrival.impact,scareFrame(.96,false,'yujie').impact);
 for(let age=0;age<arrival.duration;age+=.025){
  const s=frame(age);
  assert.equal(s.roll,0);
  assert.equal(s.grain,0);
  assert.equal(s.x,early.x);
 }
});
