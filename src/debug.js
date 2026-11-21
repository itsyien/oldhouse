import * as T from 'three';
import {RISE} from './building.js';
import {RULES,ITEM_NAMES} from './campaign.js';
import {tr,getLanguage} from './i18n.js';

export function installDebug(ctx){
 const copy=(zh,en)=>getLanguage()==='zh'?zh:en;
 const shell=ctx.shell??document.body;
 const panel=document.createElement('aside');panel.id='debug-panel';panel.setAttribute('aria-label','Campaign debug tools');
 const label=(zh,en)=>'<span data-zh="'+zh+'" data-en="'+en+'">'+copy(zh,en)+'</span>';
 panel.innerHTML=`<header><strong>DEBUG / 08 → 01</strong><button id="debug-collapse" aria-expanded="true">${copy('收起','Collapse')}</button></header>
 <div id="debug-body"><p class="debug-safe">${ctx.mobile?label('免死 · 预警保留','Safe mode · Warnings stay active'):label('免死 · F3 收起面板并锁定鼠标，再按展开','Safe mode · F3 closes the panel and captures the mouse. Press again to reopen.')}</p>
 <div class="debug-floors" aria-label="Floor">${[8,7,6,5,4,3,2,1].map(f=>`<button data-floor="${f}">${f}F</button>`).join('')}</div>
 <label><input id="debug-calm" type="checkbox" checked> ${label('明亮环境 / 停止灯闪','Bright environment / No flicker')}</label>
 <label><input id="debug-xray" type="checkbox" checked> ${label('角色透视标记','Actor markers through walls')}</label>
 <button id="debug-clear">${label('清除当前遭遇','Clear encounter')}</button>
 <fieldset class="debug-encounters"><legend>${label('遭遇测试','Encounter tests')}</legend>
 <div>${[['inspector','孙笑川','Inspector'],['naiwa','奶娃','Naiwa'],['liang','良子','Liang'],['chase','坤坤','Kun'],['patrol','汪精卫','Wang Jingwei'],['rush','天皇','Tenno'],['yujie','东北雨姐','Yujie'],['boss1','棍母','Gunmu'],['false-door','假门','False door']].map(([id,zh,en])=>`<button data-stage="${id}">${label(zh,en)}</button>`).join('')}</div></fieldset>
 <div class="debug-state-actions">${[['keypad','楼梯键盘','Stair keypad'],['boss2','隔离闸','Isolation lever'],['boss3','断管追逐','Pipe chase'],['exit','出口','Exit']].map(([id,zh,en])=>`<button data-stage="${id}">${label(zh,en)}</button>`).join('')}</div>
 <pre id="debug-info" aria-label="Live state"></pre><small>${label('仅调试链接免死；正式模式保留完整判定。','Safe mode applies only to this debug link.')}</small></div>`;
 shell.append(panel);const body=panel.querySelector('#debug-body'),info=panel.querySelector('#debug-info'),collapse=panel.querySelector('#debug-collapse');
 body.hidden=!!ctx.mobile;
 collapse.setAttribute('aria-expanded',String(!body.hidden));
 function toggle(){body.hidden=!body.hidden;localize();collapse.setAttribute('aria-expanded',String(!body.hidden));ctx.panelChanged(!body.hidden);}
 collapse.onclick=toggle;
 for(const b of panel.querySelectorAll('[data-floor]'))b.onclick=()=>ctx.jump(Number(b.dataset.floor));
 for(const b of panel.querySelectorAll('[data-stage]'))b.onclick=()=>ctx.stage(b.dataset.stage);
 panel.querySelector('#debug-calm').onchange=e=>{ctx.settings.calm=e.target.checked;ctx.calm();};
 panel.querySelector('#debug-xray').onchange=e=>{ctx.settings.xray=e.target.checked;};
 panel.querySelector('#debug-clear').onclick=()=>{ctx.game().resolveThreat();ctx.game().auxiliary=null;};
 const shape=new T.BoxGeometry(1.25,2.65,.6),lines=new T.EdgesGeometry(shape);shape.dispose();
 const markers=[];for(let i=0;i<4;i++){const marker=new T.LineSegments(lines,new T.LineBasicMaterial({color:0x44e6b1,depthTest:false,transparent:true,opacity:.95}));marker.renderOrder=25;ctx.scene.add(marker);const tag=document.createElement('div');tag.className='debug-target';shell.append(tag);markers.push({marker,tag});}
 const projected=new T.Vector3();let elapsed=1;
 function localize(){
  for(const node of panel.querySelectorAll('[data-zh]'))node.textContent=copy(node.dataset.zh,node.dataset.en);
  collapse.textContent=(body.hidden?copy('展开','Expand'):copy('收起','Collapse'))+(ctx.mobile?'':' · F3');
 }
 function update(dt){
  const g=ctx.game(),floor=g.player.floor,playing=ctx.mode()==='playing';
  const t=g.threat?.floor===floor?g.threat:null,aux=g.auxiliary?.floor===floor?g.auxiliary:null;
  const points=[...(t?(t.copies||[t]):[]),...(aux?[aux]:[])].filter(p=>p.floor===floor);
  markers.forEach(({marker,tag},i)=>{const p=points[i];marker.visible=!!p&&playing;tag.hidden=!marker.visible;
   if(marker.visible){marker.position.set(p.x,(p.y??(p.floor-1)*RISE)+1.325,p.z);marker.material.depthTest=!ctx.settings.xray;projected.copy(marker.position);projected.y+=1.5;projected.project(ctx.camera);tag.hidden=projected.z< -1||projected.z>1||Math.abs(projected.x)>1||Math.abs(projected.y)>1||!ctx.settings.xray;if(!tag.hidden){tag.style.left=`${(projected.x*.5+.5)*100}%`;tag.style.top=`${(-projected.y*.5+.5)*100}%`;tag.textContent=`${tr(RULES[p.kind||t.kind].title)} · ${Math.hypot(p.x-g.player.x,p.z-g.player.z).toFixed(1)} m`;}}
  });
  elapsed+=dt;if(elapsed<.2)return;elapsed=0;
  for(const b of panel.querySelectorAll('[data-floor]'))b.setAttribute('aria-pressed',String(Number(b.dataset.floor)===g.player.floor));
  const s=ctx.stats(),p=g.player,st=g.state;
  const actorName=kind=>`${tr(RULES[kind]?.title||kind)} [${kind}]`;
  const activeKinds=[t,aux].filter(Boolean).map(a=>a.kind);
  const roster=[...new Set([...g.floorRoster,...activeKinds])].map(actorName),active=activeKinds.map(actorName);
  const pace=t?'active':g.floor.id===8?'tutorial':st.approved?'unlocked':st.omen?'approach':!st.events?'arrival':g.cooldown>0?'relief':'exploring';
  const pacing=g.floor.keypad?[copy('节奏','Pacing')+' '+pace,copy('待触发','Pending')+' '+(st.pendingEncounter||'—'),copy('喘息','Relief')+' '+(pace==='relief'?g.cooldown:0).toFixed(1)+'s',copy('遭遇','Starts')+' '+st.events].join(' · '):'';
  const chase=t?.kind==='kun'?[copy('追踪依据','Evidence')+' '+(t.evidence||'—'),copy('视线锁定','Sight lock')+' '+!!t.sightLocked,copy('距离','Distance')+' '+Math.hypot(p.x-t.x,p.z-t.z).toFixed(1)+' m'].join(' · '):'';
  const listener=t?.kind==='liang'?t:aux?.kind==='liang'?aux:null;
  const heard=listener?.lastNoise;
  const listenerInfo=listener?copy('听声者','Listener')+' · '+listener.phase+' · '+copy('最后声源','Last sound')+' '+(heard?heard.x.toFixed(1)+', '+heard.z.toFixed(1):'—'):'';
  const traps=st.doors.filter(d=>d.falseDoor&&!d.vanished).length;
  info.textContent=[`${copy('状态','State')} ${ctx.mode()} · ${p.floor}F · seed ${g.seed}`,`X ${p.x.toFixed(2)}  Y ${p.y.toFixed(2)}  Z ${p.z.toFixed(2)}`,`${copy('模式','Mode')} ${g.floor.keypad?copy('搜索密码','Code search'):g.floor.mode} · ${copy('继续点','Checkpoint')} ${g.checkpoint.floor}F`,`${copy('本层可能出现','This floor’s roster')}\n${roster.length?roster.join('\n'):copy('无 · 入门层','None · Starter floor')}`,`${copy('当前遭遇','Active now')} ${active.length?active.join(' + '):copy('无','None')}`,copy('场景','Scene')+' '+(g.currentScene?.id||'—'),g.floor.keypad?copy('找到的密码','Known code')+' '+(st.codeParts?.whole||((st.codeParts?.front||'··')+' '+(st.codeParts?.back||'··')))+' · '+copy('已开锁','Unlocked')+' '+!!st.approved:'',copy('道具','Items')+' · '+g.inventory.map((kind,i)=>(i+1)+' '+tr(ITEM_NAMES[kind]||'空位')).join(' / '),t?`${copy('角色','Actor')} ${t.kind} / ${t.phase}\n${t.age.toFixed(1)}s · ${copy('预警','Warning')} ${t.warning.toFixed(1)}s`:`${copy('角色','Actor')} —`,listenerInfo,pacing,chase,`${copy('剩余假门','Remaining false doors')} ${traps}`,`${copy('体力','Stamina')} ${(g.stamina??100).toFixed(1)}/${g.maxStamina??100} · ${copy('冲刺','Sprint')} ${!!g.sprinting} · ${copy('耗尽','Exhausted')} ${!!g.exhausted}`,`${copy('理智','Sanity')} ${g.sanity.toFixed(1)}/100`,p.floor===1?`${copy('棍母阶段','Gunmu phase')} ${st.gunmuStage} · ${copy('破门','Breach')} ${st.gunmuBreachAt===null?'—':Math.max(0,st.gunmuBreachAt-g.time).toFixed(1)+'s'}`:'',`FPS ${s.medianMs?Math.round(1000/s.medianMs):'—'} · p95 ${s.p95Ms.toFixed(1)}ms`,`${copy('绘制','Draws')} ${s.drawCalls} · ${copy('三角形','Triangles')} ${s.triangles.toLocaleString()}`,`${s.resolution.join(' × ')}`].filter(Boolean).join('\n');
 }
 localize();update(0);return{update,localize,toggle,get expanded(){return !body.hidden;}};
}
