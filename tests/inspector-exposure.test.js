import test from 'node:test';
import assert from 'node:assert/strict';
import {createInspectorExposure} from '../src/inspector-exposure.js';

test('Inspector exposure keeps its eased flicker inside an increasingly blue range',()=>{
 const picks=[0,0,1,1],exposure=createInspectorExposure(()=>picks.shift());
 const update=(dt,age=0,reduced=false)=>{exposure.update(dt,reduced,age,1.6);return exposure.amount.value;};
 const close=(actual,expected)=>assert(Math.abs(actual-expected)<1e-10);
 close(update(.12),.115);
 close(update(0),.115);
 close(update(.12),.07);
 close(update(.44),.07);
 close(update(.02),.07);
 close(update(.12),.16);
 close(update(.12),.25);
 close(update(.7),.25);
 close(update(0,12.6),1);
 close(update(0,12.6),1);
 exposure.reset();
 close(update(0),.16);
});

test('late dips stay blue and reduced effects ramp without flicker',()=>{
 const exposure=createInspectorExposure(()=>0);
 const update=(age,reduced=false)=>{exposure.update(.25,reduced,age,1.6);return exposure.amount.value;};
 const opening=update(0),close=update(12.6);
 assert(opening<.1);
 assert(close>.7&&close<.8);
 const quietStart=update(1,true),quietMid=update(7,true),quietEnd=update(12.6,true);
 assert(quietStart<quietMid&&quietMid<quietEnd);
 assert.equal(quietEnd,update(12.6,true));
});
