import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tr,setLanguage} from '../src/i18n.js';
import {RULES} from '../src/campaign.js';
import {createCampaignBuilding} from '../src/campaign-layout.js';
import {gunmuBearing} from '../src/gunmu-finale.js';
import {landscapeViewport,touchAxes} from '../src/mobile-controls.js';

const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('phone portrait coordinates map into the landscape play area',()=>{
 assert.deepEqual(landscapeViewport(390,844,true),{width:844,height:390,portrait:true});
 assert.deepEqual(touchAxes(20,60,true),{x:60,y:-20});
 assert.deepEqual(landscapeViewport(844,390,true),{width:844,height:390,portrait:false});
 assert.deepEqual(touchAxes(20,60,false),{x:20,y:60});
 assert.deepEqual(landscapeViewport(640,900,false),{width:640,height:900,portrait:false});
});
test('Gunmu tracker uses the current view bearing and true height-aware distance',()=>{
 const player={x:5,y:1,z:8},behind={x:5,y:4,z:12};
 const forward=gunmuBearing(player,behind,0),back=gunmuBearing(player,behind,Math.PI);
 assert.equal(forward.distance,5);
 assert.equal(forward.elevation,3);
 assert.equal(forward.angle,Math.PI);
 assert(Math.abs(back.angle)<1e-10);
 assert.equal(gunmuBearing(player,{x:9,y:-2,z:8},0).angle,Math.PI/2);
});
test('entry screen keeps one primary start and puts practice behind the floor link',()=>{
 const html=source('../index.html'),menu=html.match(/<section id="menu"[\s\S]*?<\/section>/)?.[0];
 assert(menu);
 assert.equal((menu.match(/<h1\b/g)||[]).length,1);
 const practice=menu.match(/<details id="floor-entry" hidden>[\s\S]*?<\/details>/)?.[0];
 assert(practice&&practice.includes('id="enter-practice"')&&practice.includes('id="practice-note"'));
 assert.equal((menu.replace(practice,'').match(/<button\b/g)||[]).length,1);
 assert.match(menu,/id="language"/);
 assert.doesNotMatch(menu,/id="settings"/);
 assert.match(html,/<section id="pause"[\s\S]*?<details id="settings">/);
});
test('ordinary rooms expose a separate notebook and two usable slots',()=>{
 const main=source('../src/main.js'),html=source('../index.html'),debug=source('../src/debug.js');
 assert.match(main,/\$\('start'\)\.onclick=\(\)=>\{start\(\)/);
 assert.match(main,/scene=game\.currentScene/);
 assert.match(main,/e\.code==='Tab'[^]*?toggleNotes\(\)/);
 assert.doesNotMatch(html,/两条通道|异常参照|统计单|judgment-warning/);
 for(const id of ['rules','help-button','code-notes','inventory','keypad','keypad-display','keypad-note'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.equal((html.match(/data-slot="[01]"/g)||[]).length,2);
 const inventory=html.match(/<div id="inventory"[^]*?<\/div><\/div>/)?.[0];
 assert(inventory);assert.doesNotMatch(inventory,/<kbd>|aria-disabled=/);
 assert.equal((inventory.match(/aria-pressed=/g)||[]).length,2);
 assert.match(inventory,/id="inventory-controls"/);assert.match(inventory,/id="energy-status"/);
 assert.match(debug,/\[8,7,6,5,4,3,2,1\]/);assert.match(debug,/Stair keypad/);
});
test('notebook and keypad prioritize code digits over item selection',()=>{
 const main=source('../src/main.js'),html=source('../index.html');
 assert.match(main,/game\.state\.codeParts/);assert.match(main,/parts\.back/);assert.doesNotMatch(main,/game\.state\.code\b/);
 for(let i=0;i<10;i++)assert.match(html,new RegExp('data-pad="'+i+'"'));
 assert.match(main,/padHeldKeys\.add\(e\.code\)/);assert.match(main,/padHeldKeys\.delete\(e\.code\)/);
 assert.match(main,/game\.keypadKey\(key\)/);assert.match(main,/game\.useItem\(slot,yaw,pitch\)/);
 assert.doesNotMatch(main,/consumeItem\(e\.code/);
 assert(main.indexOf("if(mode==='playing'&&game.keypadOpen){")<main.indexOf('selectItem(Number(e.code.slice(-1))-1)'));
 const keypadSync=main.slice(main.indexOf('function syncKeypad()'),main.indexOf('function pressPad('));
 assert.doesNotMatch(keypadSync,/\bunlock\(/);
});
test('inventory selection, throw feedback and energy duration have bilingual copy',()=>{
 const html=source('../index.html');
 const instructions=html.match(/<p class="rules-note">([^]*?)<\/p>/)[1];
 const texts=[...instructions.matchAll(/<span[^>]*>([^<]+)<\/span>/g)].map(match=>match[1]);
 texts.push('清怪符','拿清怪符','能量饮料','拿能量饮料','向前掷出，命中奶娃或孙笑川可驱除','恢复全部理智','提供 10 秒无限体力','清怪符已掷出。','荧光棒已掷出。','薄荷糖已使用。','能量饮料已使用。','1 / 2 或滚轮切换 · 左键使用','点选道具 · 再点使用','能量 · 10 秒','拿薄荷糖 · 留下能量饮料','已选中同类道具。');
 for(const text of texts){setLanguage('en');assert.doesNotMatch(tr(text),/[\u3400-\u9fff]/,text);setLanguage('zh');assert.equal(tr(text),text);}
 setLanguage('en');assert.equal(tr('清怪符已掷出。'),'Charm thrown.');assert.equal(tr('能量 · 7 秒'),'ENERGY · 7s');
 assert.equal(tr('拿薄荷糖 · 留下能量饮料'),'Take mint · Leave energy drink');
});
test('campaign prompts, controls and rules have English and Chinese copy',()=>{
 setLanguage('en');const floors=createCampaignBuilding().floors;
 const activeText=[...Object.values(RULES).flatMap(Object.values),...floors.flatMap(f=>[f.titleEn||f.title,f.tag,...(f.scenes||[]).map(s=>s.titleEn)]),'躲好！','空的','找密码。','不对','拿薄荷糖','拿荧光棒','密码笔记','关闭键盘','还缺纸条。','体力 77 / 100'];
 for(const value of activeText){setLanguage('en');assert.doesNotMatch(tr(value),/[\u3400-\u9fff]/,value);setLanguage('zh');assert.equal(tr(value),value);}
 setLanguage('en');
 for(const slip of ['03––','––24','0318'])assert.equal(tr('纸条 · '+slip),'Note · '+slip);
 for(const text of ['翻过倒柜，按住 E 推开检修门。','穿过分岔走廊，绕到风机房。','绕过障碍找到通风口，按 E 钻入。','前面要塌了，走旁路。','追逐结束。前往楼梯离开本层。'])assert.doesNotMatch(tr(text),/[\u3400-\u9fff]/);
});
test('nearby traversal input and stamina feedback use authoritative campaign state',()=>{
 const main=source('../src/main.js'),html=source('../index.html');
 assert.match(main,/target=game\.nearestTraversal\(\)/);
 assert.match(main,/e\.code==='Space'[^\n]*interact\(\)/);
 assert.match(main,/game\.stamina\/game\.maxStamina/);
 assert.match(main,/game\.sprinting/);
 for(const id of ['stamina','stamina-value','stamina-fill'])assert.match(html,new RegExp(`id="${id}"`));
});
test('returning sweep and stamina instructions are fully localized',()=>{
 setLanguage('en');
 for(const value of ['体力 64 / 100','体力耗尽 · 慢走恢复','E / 空格','折返客','躲好！','别动。','灯反复熄亮时，七秒内进高衣柜。柜外会停电，等「走」再出来。','走路时恢复体力。按住 Shift 冲刺，留些体力给下一次危险。','轻步。','它听见了！','别出声。','轻步离开。'])assert.doesNotMatch(tr(value),/[\u3400-\u9fff]/,value);
});
test('depot rules, alarm states, and escape countdown are available in English',()=>{
 setLanguage('en');
 assert.match(tr('躲入衣柜 · 最多 5 秒'),/5s max/);
 assert.equal(tr('离开衣柜 · 2 秒后弹出'),'Leave wardrobe · Forced out in 2s');
 assert.equal(tr('衣柜冷却 · 15 秒'),'Wardrobe cooldown · 15s');
 const [,rule]=source('../index.html').match(/<b>良子<\/b><span>([^<]+)/);
 assert.match(tr(rule),/speaker.+footsteps/);
 assert.doesNotMatch(rule,/秒|米/);
 assert.equal(tr('彩签密码纸 4 / 5'),'Coloured slips 4 / 5');
 assert.equal(tr('拿第 5 张密码纸'),'Take code slip 5');
 assert.equal(tr('闹钟 · 3 秒后响'),'Alarm · Rings in 3s');
 assert.equal(tr('跑！ · 8 秒'),'RUN · 8s');
 assert.equal(tr('确认后有 12 秒跑到楼梯。'),'Confirm to start your 12s run to the stairs.');
 assert.equal(tr('它追向闹钟。'),"He's following the alarm.");
 assert.equal(tr('它还在追！'),"He's still chasing!");
 assert.equal(tr('试响远端广播'),'Test remote loudspeaker');
 assert.equal(tr('放下滑槽托盘'),'Release chute tray');
});
test('chase distinguishes hold and tap prompts and keeps sensory tracking in the debug panel',()=>{
 setLanguage('en');
 for(const value of ['按住推门','钻进通风口','推门中…','风机后面通向楼梯。'])assert.doesNotMatch(tr(value),/[\u3400-\u9fff]/,value);
 const debug=source('../src/debug.js'),main=source('../src/main.js');
 assert.match(debug,/g\.floorRoster/);assert.match(debug,/t\.evidence/);assert.match(debug,/pendingEncounter/);assert.match(main,/interactHeld/);assert.doesNotMatch(main,/game\.chaseAlert/);
});
