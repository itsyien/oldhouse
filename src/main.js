import * as T from 'three';
import {assetUrl} from './asset-url.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GameAudio} from './audio.js';
import {createCampaignWorld,patrolCircuitPower,visitorLightBlend} from './campaign-world.js';
import {createActor,createCutoutActor,scareKey,scareFrame,SCARE_DURATION} from './actors.js';
import {createSweeperScare} from './sweeper-scare.js';
import {createCharacterActor,updateCharacterActor} from './character-models.js';
import {createFalseDoorEffect} from './false-door-effect.js';
import {RISE} from './building.js';
import {createCampaignBuilding} from './campaign-layout.js';
import {CampaignGame as Game,RULES,ITEM_NAMES} from './campaign.js';
import {clearSight} from './logic.js';
import {sweepTiming} from './sweep-timing.js';
import {gunmuBearing} from './gunmu-finale.js';
import {shaftSlideProgress} from './gunmu-shaft-geometry.js';
import {chaseHazards,chaseHazardAge} from './chase-hazard-geometry.js';
import {installTouchControls,landscapeViewport} from './mobile-controls.js';
import {createInteractionGlints} from './interaction-glints.js';
import './style.css';
import {tr,setLanguage,getLanguage,staticLocalization} from './i18n.js';
try{setLanguage(JSON.parse(localStorage.getItem('extra-floor-settings')||'{}').language);}catch{}
const localizeBody=staticLocalization(document.body);
function localizeStatic(){localizeBody();document.title=tr('旧宅');}
localizeStatic();

const parameters=new URLSearchParams(location.search),debugEnabled=parameters.has('debug')&&!parameters.has('qa'),debugSettings={calm:true,xray:true};let debugTools;
const $=id=>document.getElementById(id),canvas=$('game'),shell=$('game-shell');
const mobile=matchMedia('(pointer: coarse)').matches||
 (navigator.maxTouchPoints>0&&/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));
document.body.classList.toggle('mobile-game',mobile);
let renderer;
try{renderer=new T.WebGLRenderer({canvas,antialias:!mobile,powerPreference:'high-performance'});}catch(error){
 $('load-status').textContent=tr('无法启动 WebGL。请在 Chrome 或 Edge 中开启硬件加速。');
 $('start').disabled=false;$('start').textContent=tr('重新加载');$('start').onclick=()=>location.reload();throw error;
}
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
const scene=new T.Scene();scene.background=new T.Color(0x080e0b);scene.fog=new T.FogExp2(0x080e0b,.032);
const interactionGlints=createInteractionGlints(scene);
const keypadMarker=$('keypad-marker');
const ambient=new T.HemisphereLight(0xb9c7af,0x26372f,.14);scene.add(ambient);
const camera=new T.PerspectiveCamera(72,1,.055,140);camera.rotation.order='YXZ';scene.add(camera);
const falseDoorEffect=createFalseDoorEffect(scene);
const falseDoorBlack=document.createElement('div');falseDoorBlack.id='false-door-black';falseDoorBlack.setAttribute('aria-hidden','true');shell.append(falseDoorBlack);
let heardFalseDoor=null;
// The backdrop isolates the close portrait after the first glimpse of the room.
const scareBackdrop=new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({
 transparent:true,depthTest:false,depthWrite:false,uniforms:{uKun:{value:false}},
 vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
 fragmentShader:`uniform bool uKun;varying vec2 vUv;
  void main(){
   float spill=1.-smoothstep(.1,.68,length((vUv-vec2(.47,.53))*vec2(1.12,.87)));
   vec3 red=mix(vec3(.027,.006,.009),vec3(.24,.039,.047),spill);
   gl_FragColor=vec4(uKun?red:vec3(.004,.006,.005),1.);
  }`
}));
scareBackdrop.frustumCulled=false;scareBackdrop.renderOrder=19;scareBackdrop.visible=false;scene.add(scareBackdrop);
const beamTint=0xe3e5ce,visitorBeamTint=new T.Color(0xe7f1ff);
const flashlight=new T.SpotLight(beamTint,4,14,.64,.78,1.7);flashlight.position.set(.12,-.12,0);flashlight.target.position.set(0,-.12,-6);camera.add(flashlight,flashlight.target);
const visitorCopies=[],visitorModels=[],assets={},models={},actors={},characterActors={},scareActors={},scareDefinitions={},keys=new Set(),frameTimes=[];
const aimRay=new T.Raycaster(),crosshairCenter=new T.Vector2(),aimHits=[];
aimRay.far=4.8;
let building,game,world,mode='loading',floorShown=0,yaw=-Math.PI/2,pitch=0,last=0,visualTime=0,walkTime=0,sprintSway=0;
const worlds=new Map();let worldStates;
let target=null,dragging=false,hadLock=false,subtitleTime=0,chapterTime=0,scareAge=0,resumeGrace=0;
let scareHit=false,scareCue=false,scareKind=null,scareVisual=scareFrame(0);
const sweeperScares={};
const gameAudio=new GameAudio();
const chasePressure=document.createElement('div');chasePressure.id='chase-pressure';chasePressure.setAttribute('aria-hidden','true');shell.append(chasePressure);
let chasePressureLevel=0;
const reducedPreference=matchMedia('(prefers-reduced-motion: reduce)').matches;
const defaultQuality='high';
const settings={quality:defaultQuality,volume:35,background:true,sensitivity:65,sprintSensitivity:50,bob:false,reduced:reducedPreference,language:getLanguage()};
try{Object.assign(settings,JSON.parse(localStorage.getItem('extra-floor-settings')||'{}'));}catch{}
if(!['low','medium','high'].includes(settings.quality))settings.quality=defaultQuality;
for(const id of ['volume','sensitivity'])settings[id]=Math.max(id==='volume'?0:20,Math.min(id==='volume'?100:150,Number(settings[id])||0));
settings.language=setLanguage(settings.language);
settings.sprintSensitivity=T.MathUtils.clamp(Number.isFinite(settings.sprintSensitivity)?settings.sprintSensitivity:50,15,200);
const save=()=>{try{localStorage.setItem('extra-floor-settings',JSON.stringify(settings));}catch{}};
let viewport;
const touch=mobile?installTouchControls({canvas,find:$,layout:()=>viewport,
 active:()=>mode==='playing'&&!game.keypadOpen,
 look:(x,y)=>{
  if(rearGlance())return;
  const sensitivity=settings.sensitivity*.00007;
  yaw-=x*sensitivity;pitch=T.MathUtils.clamp(pitch-y*sensitivity,-1.15,1.15);
 },
 sprintThreshold:()=>settings.sprintSensitivity/100,
 interact:()=>interact(true)}):null;
function resize(){
 const next=landscapeViewport(innerWidth,innerHeight,mobile);
 if(viewport?.portrait!==next.portrait)touch?.reset();
 viewport=next;
 document.body.classList.toggle('mobile-portrait',viewport.portrait);
 const cap={low:.68,medium:1,high:1.5}[settings.quality];
 const pixelBudget={low:800000,medium:1500000,high:2100000}[settings.quality];
 renderer.setPixelRatio(Math.min(devicePixelRatio,cap,Math.sqrt(pixelBudget/(viewport.width*viewport.height))));
 renderer.setSize(viewport.width,viewport.height,false);
 camera.aspect=viewport.width/viewport.height;camera.updateProjectionMatrix();
}
addEventListener('resize',resize);resize();
let rulesReturn='menu',notesOpen=false,padActive=false;
const padHeldKeys=new Set();
let subtitleMessage='';
function say(text,duration=4){if(mode==='scare')return;subtitleMessage=text;$('subtitle').textContent=tr(text);$('subtitle').classList.add('shown');subtitleTime=duration;}
function floorLabel(f){return '0'+f.id+' / '+(getLanguage()==='en'&&f.titleEn?f.titleEn:tr(f.title));}
const floorIntroductions=[
 "",
 "最后的出口藏在一排旧管道后面。",
 "末班饭已经凉了。灯还给谁留着？",
 "检修门的另一边，有金属擦过地面。",
 "帘子拉着。玻璃上映出一张空床。",
 "货架一直排到暗处。这里听得见纸落地。",
 "教室里没开灯，黑板倒是刚擦过。",
 "水停了，晾衣间的地面却还是湿的。",
 "新手层 · 无异常。搜抽屉找密码。本层无法跳跃。"
];
function chapter(f){
 const card=$('chapter');
 card.querySelector('span').textContent=(getLanguage()==='en'?'FLOOR ':'楼层 ')+String(f.id).padStart(2,'0');
 card.querySelector('strong').textContent=getLanguage()==='en'&&f.titleEn?f.titleEn:tr(f.title);
 card.querySelector('p').textContent=tr(floorIntroductions[f.id]);
 card.classList.add('shown');chapterTime=4.2;
}
function sound(id='click'){if(settings.volume)gameAudio.play(id);}
const captureRequired=()=>!mobile&&(!debugEnabled||debugTools?.expanded===false);
function captureFailed(){
 if(mode!=='playing'||!captureRequired()||document.pointerLockElement===canvas)return;
 pause();$('capture-hint').hidden=false;
}
function lock(){
 if(!captureRequired()||document.pointerLockElement===canvas)return;
 try{canvas.requestPointerLock()?.catch(captureFailed);}catch{queueMicrotask(captureFailed);}
}
function unlock(){hadLock=false;if(document.pointerLockElement)document.exitPointerLock();}
const panelPointer=$('panel-pointer');
let pointerX=0,pointerY=0,pointedButton=null;
function capturedPanel(){
 if(document.pointerLockElement!==canvas)return null;
 if(mode==='playing'&&game.keypadOpen)return $('keypad');
 if(mode==='rules')return $('rules').querySelector('.rules-card');
 return null;
}
function resetPanelPointer(panel){
 pointedButton?.classList.remove('pointer-hover');pointedButton=null;panelPointer.hidden=true;
 if(panel){const bounds=panel.getBoundingClientRect();pointerX=bounds.left+bounds.width/2;pointerY=bounds.top+bounds.height/2;}
}
function movePanelPointer(panel,dx,dy){
 const bounds=panel.getBoundingClientRect();
 pointerX=T.MathUtils.clamp(pointerX+dx,bounds.left+1,bounds.right-1);
 pointerY=T.MathUtils.clamp(pointerY+dy,bounds.top+1,bounds.bottom-1);
 panelPointer.style.transform=`translate(${pointerX}px,${pointerY}px)`;panelPointer.hidden=false;
 const button=document.elementFromPoint(pointerX,pointerY)?.closest('button');
 pointedButton?.classList.remove('pointer-hover');pointedButton=button&&panel.contains(button)?button:null;
 pointedButton?.classList.add('pointer-hover');
}
function hud(show){$('hud').hidden=!show;$('inventory').hidden=!show||!game?.itemsAvailable;$('crosshair').hidden=!show;if(!show){itemPointer=null;touch?.reset();$('touch-controls').hidden=true;$('inspector-pressure').classList.remove('active');$('interact').hidden=true;$('threat').hidden=true;$('code-notes').hidden=true;$('keypad').hidden=true;}}
async function preferLandscape(){
 if(!mobile||!document.documentElement.requestFullscreen)return;
 try{
  if(!document.fullscreenElement)await document.documentElement.requestFullscreen();
  await screen.orientation?.lock?.('landscape');
 }catch{}
}
let guideChaseState=null,guideChaseStage=null,guideChangeUntil=0;
function updateGuide(){
 const el=$('guide'),chase=game?.floor.id===3&&game.floor.mode==='chase';
 const falling=chase&&chaseHazards(game.floor).some(hazard=>{
  const age=chaseHazardAge(game.floor,game.state,hazard,game.time);
  return age>=0&&age<hazard.warning+hazard.fallDuration+.6;
 });
 if(chase){
  const stage=game.chaseStage;
  if(guideChaseState!==game.state){guideChaseState=game.state;guideChaseStage=stage;guideChangeUntil=0;}
  else if(guideChaseStage!==stage){guideChaseStage=stage;guideChangeUntil=visualTime+2.4;}
 }
 el.classList.toggle('chase-change',chase&&(falling||visualTime<guideChangeUntil));
 el.hidden=mode!=='playing'||!!(game.threat||game.auxiliary)&&!chase||!!game.hiding||notesOpen||game.keypadOpen||!!game.floor.keypad||$('subtitle').classList.contains('shown')&&!falling;
 if(!el.hidden){
  const text=falling?'前面要塌了，走旁路。':game.objective;
  displayText('guide-copy',tr(text));
  displayText('guide-controls',tr(game.floor.gunmuFinale?'E 操作 · 按住 Tab 回头 · H 规则':'E 操作 · Tab 笔记 · H 规则'));
 }
 updateCampaignHud();
}
function updateCampaignHud(){
 if(!game)return;
 const active=mode==='playing',ordinary=!!game.floor.keypad,scene=game.currentScene;
 const depot=game.floor.listenerDepot;
 if(game.threat&&!depot)notesOpen=false;
 const label=$('scene-label'),title=scene?(getLanguage()==='en'?scene.titleEn:scene.title):'';
 label.hidden=!active||!title;
 if(label.textContent!==title){
  label.textContent=title;
  if(title&&!settings.reduced)label.animate([{opacity:.35},{opacity:1}],{duration:360});
 }
 $('notes-button').hidden=!ordinary;
 $('notes-button').setAttribute('aria-expanded',String(notesOpen));
 $('code-notes').hidden=!active||!notesOpen||!ordinary;
 $('floor-goal').hidden=!active||!ordinary||game.keypadOpen||!!game.threat&&!depot||notesOpen;
 if(active&&ordinary){
  let goal=game.state.approved?'通往楼下的门已开。':game.knownCode?'去楼梯门。':game.floor.id===8?(mobile?'搜画框和抽屉。':'按 E 搜画框和抽屉。'):'找密码。';
  if(depot){
   if(game.state.approved)goal='沿黄线跑向楼梯。';
   else if(game.state.depotExitAt!=null)goal='门已关。回控制台重开。';
   else if(game.knownCode)goal='去移交区控制台。';
   else goal=`彩签密码纸 ${game.depotCollected} / 5`;
  }
  const text=tr(goal);
  if($('floor-goal').textContent!==text)$('floor-goal').textContent=text;
 }
 $('inventory').hidden=!active||!game.itemsAvailable||game.keypadOpen;
 if(!active)return;
 syncKeypad();
 if(notesOpen||game.keypadOpen)updateNotes();
 syncInventory();
 const t=game.threat,pressure=active&&t?.kind==='inspector'&&t.phase!=='leaving';
 $('inspector-pressure').classList.toggle('active',pressure);$('inspector-pressure').classList.toggle('reduced',settings.reduced);$('inspector-pressure').classList.toggle('locked',!!t?.movementLocked);
 $('stamina').hidden=!active;const stamina=Math.max(0,Math.min(1,game.stamina/game.maxStamina));
 const unlimited=!!game.floor.gunmuFinale;
 displayText('stamina-value',tr(unlimited?'体力不限':game.exhausted?'体力耗尽 · 慢走恢复':`体力 ${Math.ceil(game.stamina)} / ${game.maxStamina}`));
 if(unlimited)$('stamina').setAttribute('aria-valuetext',tr('体力不限'));else $('stamina').removeAttribute('aria-valuetext');
 $('stamina').setAttribute('aria-valuenow',String(Math.round(game.stamina)));$('stamina-fill').style.transform=`scaleX(${stamina})`;
 $('stamina').classList.toggle('draining',!!game.sprinting);$('stamina').classList.toggle('exhausted',!!game.exhausted);
}
const itemButtons=[...$('inventory').querySelectorAll('[data-slot]')];
const itemIcons={glowstick:'item-stick',mint:'item-mint',ward:'item-ward',energy:'item-energy'};
const itemHelp={glowstick:'照亮落点十二秒',mint:'恢复全部理智',ward:'向前掷出，命中奶娃或孙笑川可驱除',energy:'提供 10 秒无限体力'};
let itemNoticeUntil=0,selectedItemSlot=0,itemContents='',itemGame=null,itemPointer=null,itemLockVersion=0,lastItemWheel=-Infinity;
let inventorySlotShown=-1,inventoryLanguageShown;
function itemsInputAllowed(){return mode==='playing'&&game.itemsAvailable&&!game.keypadOpen&&!game.falseDoorAttack;}
function syncInventory(){
 const contents=game.inventory.join('|'),itemsChanged=itemGame!==game||itemContents!==contents;
 if(itemsChanged){
  if(itemGame!==game){selectedItemSlot=0;itemNoticeUntil=0;itemPointer=null;}
  itemGame=game;itemContents=contents;
  if(!game.inventory[selectedItemSlot]){const full=game.inventory.findIndex(Boolean);if(full>=0)selectedItemSlot=full;}
 }
 if(itemsChanged||inventorySlotShown!==selectedItemSlot||inventoryLanguageShown!==getLanguage()){
  inventorySlotShown=selectedItemSlot;inventoryLanguageShown=getLanguage();
  for(const button of itemButtons){
   const slot=Number(button.dataset.slot),kind=game.inventory[slot],ready=String(!!kind);
   if(button.dataset.full!==ready)button.dataset.full=ready;
   const selected=String(slot===selectedItemSlot);if(button.getAttribute('aria-pressed')!==selected)button.setAttribute('aria-pressed',selected);
   const label=tr(ITEM_NAMES[kind]||'空位'),text=button.querySelector('span'),icon=button.querySelector('i');
   if(text.textContent!==label)text.textContent=label;
   if(icon.className!==(itemIcons[kind]||''))icon.className=itemIcons[kind]||'';
   const title=tr(itemHelp[kind]||'空位');if(button.title!==title)button.title=title;
   const description=label+(kind?' · '+title:'');if(button.getAttribute('aria-label')!==description)button.setAttribute('aria-label',description);
  }
  displayText('inventory-controls',tr(mobile?'点选道具 · 再点使用':'1 / 2 或滚轮切换 · 左键使用'));
 }
 const energy=game.itemsAvailable?Math.ceil(game.energySecondsLeft||0):0;
 $('energy-status').hidden=!energy;if(energy)displayText('energy-status',tr(`能量 · ${energy} 秒`));
 $('inventory-feedback').hidden=performance.now()>=itemNoticeUntil;
}
function selectItem(slot){if(!itemsInputAllowed())return;syncInventory();selectedItemSlot=(slot+itemButtons.length)%itemButtons.length;syncInventory();sound();}
function toggleNotes(){
 if(mode!=='playing'||game.falseDoorAttack||game.keypadOpen||!game.floor.keypad)return;
 notesOpen=!notesOpen;$('chapter').classList.remove('shown');updateCampaignHud();
}
function displayText(id,text){
 const element=$(id);if(element.textContent!==text)element.textContent=text;
}
function updateNotes(){
 const parts=game.state.codeParts,depot=game.floor.listenerDepot;
 const known=depot?game.state.depotDigits.map(digit=>digit??'·').join(' '):parts.whole||((parts.front||'··')+'  '+(parts.back||'··'));
 const floor=floorLabel(game.floor);
 if(notesOpen){
  displayText('notes-floor',floor);displayText('notes-digits',known);
  displayText('notes-hint',tr(depot?(game.knownCode?'去移交区控制台。':'九处藏点，任取五张。'):game.state.approved?'通往楼下的门已开。':game.knownCode?'去楼梯门。':game.floor.id<=5?'前两位 / 后两位':'纸条自动记录。'));
 }
 if(game.keypadOpen){
  const typed=game.state.keypadInput;
  displayText('keypad-title',tr(depot?'楼梯门控制台':'楼梯门锁'));
  displayText('keypad-floor',floor);displayText('keypad-note',known);
  displayText('keypad-display',typed.padEnd(game.codeLength,'·'));$('keypad').dataset.error=String(game.state.keypadError>0);
  const hint=game.codeHint,place=hint?.scene?(getLanguage()==='en'?hint.scene.titleEn:hint.scene.title):'';
  const feedback=game.state.keypadError>0?tr(game.knownCode?'不对':'需要密码。'):
   depot?tr(game.knownCode?`确认后有 ${game.depotExitDuration} 秒跑到楼梯。`:'九处藏点，任取五张。'):
   game.knownCode?tr('输入四位密码。'):place?tr(hint.group==='front'?'前两位':hint.group==='back'?'后两位':'纸条')+' · '+place:tr('还缺纸条。');
  displayText('keypad-feedback',feedback);
 }
}
function syncKeypad(){
 const opened=mode==='playing'&&game.keypadOpen;
 $('keypad').hidden=!opened;$('crosshair').hidden=mode!=='playing'||opened;
 if(opened===padActive)return;
 padActive=opened;keys.clear();touch?.reset();dragging=false;
 if(opened){
  notesOpen=false;$('code-notes').hidden=true;
  updateNotes();
  resetPanelPointer(capturedPanel());
  $('keypad').focus({preventScroll:true});
 }else{
  if($('keypad').contains(document.activeElement))document.activeElement.blur();
  resetPanelPointer(null);
 }
}
function pressPad(key){
 if(mode!=='playing'||!game.keypadOpen)return;
 game.keypadKey(key);syncKeypad();
 if(game.keypadOpen){updateNotes();$('keypad').focus({preventScroll:true});}
}
function consumeItem(slot=selectedItemSlot){
 if(!itemsInputAllowed())return;
 const kind=game.inventory[slot];
 if(!kind)return;
 const used=game.useItem(slot,yaw,pitch);
 if(!used){displayText('inventory-feedback',tr(kind==='mint'&&game.sanity>=100?'理智已满，无需使用。':'现在无法使用。'));itemNoticeUntil=performance.now()+1500;syncInventory();return;}
 sound(kind==='mint'||kind==='energy'?'pickup':'click');
 const message={ward:'清怪符已掷出。',glowstick:'荧光棒已掷出。',mint:'薄荷糖已使用。',energy:'能量饮料已使用。'}[kind];
 displayText('inventory-feedback',tr(message));itemNoticeUntil=performance.now()+1800;syncInventory();
}
function guideTab(actors){
 $('basic-guide').hidden=actors;$('actor-guide').hidden=!actors;
 $('rules-basics').setAttribute('aria-pressed',String(!actors));$('rules-actors').setAttribute('aria-pressed',String(actors));
 $('rules').querySelector('.rules-card').scrollTop=0;
}
$('rules-basics').onclick=()=>guideTab(false);$('rules-actors').onclick=()=>guideTab(true);
function openRules(){if(mode==='loading'||mode==='scare'||game.keypadOpen)return;guideTab(false);rulesReturn=mode;keys.clear();gameAudio.stop();mode='rules';$('rules').hidden=false;$('rules-continue').focus();hud(false);resetPanelPointer(capturedPanel());}
function closeRules(){if(mode!=='rules')return;$('rules').hidden=true;resetPanelPointer(null);mode=rulesReturn;if(mode==='playing'){playFrameAt=performance.now();hud(true);resumeGrace=.35;lock();}else if(mode==='paused')$('resume').focus();}

function atmosphere(){
 const calm=debugEnabled&&debugSettings.calm;
 scene.fog.color.setHex(calm?0x85948b:0x080e0b);scene.background.copy(scene.fog.color);scene.fog.density=calm?.006:.032;
 renderer.toneMappingExposure=calm?1.4:1.18;ambient.intensity=calm?2:.14;flashlight.intensity=calm?3:4;
 flashlight.color.setHex(beamTint);
 document.body.classList.toggle('debug-calm',calm);
}
function showFloor(){
 game.debugMode=debugEnabled;game.debugCalm=debugEnabled&&debugSettings.calm;
 if(worldStates!==game.states){for(const w of worlds.values())w.dispose();worlds.clear();worldStates=game.states;}
 const visible=game.renderFloors();
 for(const id of visible)if(!worlds.has(id))worlds.set(id,createCampaignWorld(scene,assets,building.byId[id],game.states[id],models));
 for(const [id,w]of worlds)if(!visible.includes(id)){w.dispose();worlds.delete(id);}
 for(const [id,w]of worlds){for(const s of w.stairGroups)s.group.visible=id===s.from||!worlds.has(s.from);for(const l of w.lights)l.visible=id===game.player.floor;}
 world=worlds.get(game.player.floor);if(floorShown===game.player.floor)return;
 floorShown=game.player.floor;notesOpen=false;const f=game.floor;
 atmosphere();
 $('floor-label').textContent=floorLabel(f);
 if(mode==='playing')chapter(f);
}
function rearGlance(){return mode==='playing'&&(keys.has('Tab')||touch?.state.glance)&&game.floor.gunmuFinale&&!game.travel;}
function pose(){camera.position.set(game.player.x,game.player.y+1.65,game.player.z);camera.rotation.set(pitch,yaw+(rearGlance()?Math.PI:0),0);}
let playFrameAt=0;
function start(retry=false,selectedFloor=null){
 lock();
 clearScare();
 walkTime=sprintSway=0;
 touch?.reset();
 if(retry)game.retry();
 else{
  game=new Game(building,crypto.getRandomValues(new Uint32Array(1))[0],game?.nav);
  if(building.byId[selectedFloor]){
   game.run.selectedFloor=selectedFloor;
   game.jumpFloor(selectedFloor);
  }
 }
 playFrameAt=performance.now();
 mode='playing';floorShown=0;padActive=false;keys.clear();yaw=game.floor.spawnYaw??-Math.PI/2;pitch=0;showFloor();pose();
 $('menu').hidden=true;$('pause').hidden=true;$('rules').hidden=true;$('ending').hidden=true;notesOpen=false;$('fade').classList.remove('active');$('scare').classList.remove('shown');hud(true);
 gameAudio.stop();gameAudio.unlock().catch(e=>console.warn('Audio unlock failed',e.message));resumeGrace=.35;frameTimes.length=0;
 if(mobile&&!retry)say('上推摇杆疾跑 · 右侧拖动观察',4);
}
function pause(){if(mode==='rules'&&rulesReturn==='playing'){$('rules').hidden=true;mode='playing';}if(mode!=='playing')return;if(game.keypadOpen)game.keypadKey('Escape');padActive=false;resetPanelPointer(null);gameAudio.stop();mode='paused';$('pause-floor').textContent=floorLabel(game.floor);$('settings').open=false;keys.clear();dragging=false;unlock();$('capture-hint').hidden=true;$('pause').hidden=false;hud(false);$('resume').focus();}
function resume(){if(mode!=='paused')return;mode='playing';playFrameAt=performance.now();$('pause').hidden=true;hud(true);resumeGrace=.5;lock();}
function menu(){
 $('floor-entry').open=false;
 clearScare();gameAudio.stop();mode='menu';padActive=false;keys.clear();unlock();
 $('menu').hidden=false;$('pause').hidden=true;$('ending').hidden=true;$('fade').classList.remove('active');$('scare').classList.remove('shown');$('subtitle').classList.remove('shown');$('chapter').classList.remove('shown');hud(false);
 game=new Game(building,8,game?.nav);floorShown=0;showFloor();yaw=-1.26;pitch=-.03;
 camera.position.set(10.9,game.floor.base+1.52,9.05);camera.rotation.set(pitch,yaw,0);
 flashlight.intensity=1.9;
}
const deathNames={inspector:'孙笑川 · 查房者',naiwa:'奶娃 · 偷步者',kun:'坤坤 · 借路者',liang:'良子',patrol:'汪精卫 · 巡楼者',rush:'天皇 · 折返客',yujie:'东北雨姐',doubao:'棍母',fall:'坠入管道井'};
function finish(won){
 clearScare();scareBackdrop.visible=!won;
 gameAudio.stop();mode=won?'won':'lost';keys.clear();unlock();hud(false);$('ending').hidden=false;$('code-notes').hidden=true;$('scare').classList.remove('shown');$('vignette').classList.remove('danger');$('subtitle').classList.remove('shown');$('chapter').classList.remove('shown');
 $('end-en').textContent=tr(won?'室外 / 01':'同一夜晚');$('end-title').textContent=tr(won?'你出来了。':'它还在这一层。');
 const {selectedFloor,deaths,seconds}=game.run;
 $('end-copy').hidden=won;
 $('end-copy').textContent=won?'':tr(game.failure);
 $('practice-result').hidden=!won||!(selectedFloor||debugEnabled);
 $('practice-result').textContent=selectedFloor?(getLanguage()==='en'?`Floor ${selectedFloor} start · Practice clear only`:`从 ${selectedFloor} 楼进入 · 练习通关，不计为正常通关`):tr('调试模式 · 本次不计为正常通关。');
 $('run-totals').hidden=!won;
 const total=Math.floor(seconds),hours=Math.floor(total/3600),pad=n=>String(n).padStart(2,'0');
 $('run-time').textContent=(hours?hours+':':'')+pad(Math.floor(total/60)%60)+':'+pad(total%60);
 $('run-deaths').textContent=deaths.length;
 $('death-history').hidden=!won||!deaths.length;
 $('death-history').open=won&&deaths.length>0&&deaths.length<=3;
 $('death-list').replaceChildren();
 if(won)for(const {kind,floor} of deaths){
  const row=document.createElement('li'),level=document.createElement('span');
  level.textContent=getLanguage()==='en'?`Floor ${floor}`:`${floor} 楼`;
  row.append(level,document.createTextNode(tr(deathNames[kind]??RULES[kind]?.title??kind)));$('death-list').append(row);
 }
 const stats=[tr(`发现画像 ${game.discoveredPortraits.length} / ${game.portraitTotal} · 得分 ${game.score}`)];
 $('end-stats').textContent=stats.join('\n');
 $('restart').innerHTML=tr(won?(selectedFloor?'再练一次':'再走一次'):`从 ${game.checkpoint.floor} 楼继续`)+' <span>↗</span>';$('new-run').hidden=won&&!selectedFloor;
 $('end-title').focus({preventScroll:true});
}
function caughtThreat(){const kind=game.lastCatch||game.debugLastCatch?.kind;return [game.threat,game.auxiliary].find(t=>t?.kind===kind)||game.threat;}
function clearScare(){
 sweeperScares[scareKind]?.clear();
 scareBackdrop.visible=false;scareBackdrop.material.uniforms.uKun.value=false;scareKind=null;document.body.classList.remove('is-scaring');$('scare').classList.remove('shown');
 for(const a of [...Object.values(scareActors),...Object.values(actors),...Object.values(characterActors),...visitorCopies,...visitorModels])a.visible=false;
}
function scare(){
 const caught=caughtThreat();scareKind=caught?scareKey(caught):null;
 sweeperScares[scareKind]?.begin();
 scareBackdrop.material.uniforms.uKun.value=scareKind==='kun';
 mode='scare';scareAge=0;scareHit=false;scareCue=false;scareVisual=scareFrame(0,settings.reduced,scareKind);gameAudio.stop();keys.clear();dragging=false;resetPanelPointer(null);hud(false);
 $('peek').hidden=true;$('chapter').classList.remove('shown');$('subtitle').classList.remove('shown');$('vignette').classList.remove('danger');$('scare').classList.add('shown');document.body.classList.add('is-scaring');
}
const prompt=$('interact'),promptKey=prompt.querySelector('kbd'),promptText=prompt.querySelector('span');
function showPrompt(text,keyText='',blocked=false){
 const label=tr(text);
 if(promptText.textContent!==label)promptText.textContent=label;
 if(keyText&&promptKey.textContent!==keyText)promptKey.textContent=keyText;
 if(promptKey.hidden!==!keyText)promptKey.hidden=!keyText;
 if(prompt.dataset.blocked!==String(blocked))prompt.dataset.blocked=String(blocked);
}
function aim(){
 const crate=game.depotCrateAction,action=crate||game.chaseAction||game.searching;
 const hideSeconds=game.wardrobeSecondsLeft;
 $('search-progress').hidden=!action&&!hideSeconds;
 if(game.falseDoorAttack||game.keypadOpen||game.travel||game.traversal){target=null;prompt.hidden=true;return;}
 if(action){
  target=null;prompt.hidden=mode!=='playing';
  showPrompt(crate?'推箱中… 松开可撤离':action.kind==='push'?'推门中…':'搜索中…');
  $('search-progress').firstElementChild.style.transform='scaleX('+Math.min(1,action.elapsed/action.duration)+')';return;
 }
 if(game.hiding){
  target=game.floor.interactions.find(i=>i.id===game.hiding.id);
  $('interact').hidden=mode!=='playing';
  showPrompt(hideSeconds?`离开衣柜 · ${Math.ceil(hideSeconds)} 秒后弹出`:'离开衣柜','E');
  if(hideSeconds)$('search-progress').firstElementChild.style.transform='scaleX('+hideSeconds/5+')';
  return;
 }
 target=game.nearestTraversal();camera.updateMatrixWorld();
 aimHits.length=0;
 if(!target){aimRay.setFromCamera(crosshairCenter,camera);aimRay.intersectObjects(world.interactables,false,aimHits);}
 for(const hit of aimHits){
  const id=hit.object.userData.target;
  const d=game.state.doors.find(d=>d.id===id),item=game.floor.interactions.find(i=>i.id===id);
  if(d?.vanished||!d&&!item)continue;
  let visible=true;for(let o=hit.object;o;o=o.parent)if(!o.visible){visible=false;break;}
  if(!visible)continue;
  if(item?.type==='flashlight'&&game.state.flashlight||item?.type==='keypad'&&!game.keypadAvailable||
     item?.traversalId&&(game.state.traversals[item.traversalId]||item.type==='vent'&&game.state.chaseEscaped))continue;
  const walls=game.obstacles(floorShown,true).filter(w=>w!==d?.block&&!(hit.point.x>=w.minX-.08&&hit.point.x<=w.maxX+.08&&hit.point.z>=w.minZ-.08&&hit.point.z<=w.maxZ+.08));
  if(clearSight(game.player,{x:hit.point.x,z:hit.point.z},walls)){target=d||item;break;}
 }
 $('interact').hidden=!target||mode!=='playing';
 if(target){let text,keyHidden=false;
  if(game.floor.listenerDepot&&target.id===game.floor.exitGateId){
   keyHidden=true;
   text=target.locked?'由移交区控制台开启':'冲向楼梯。';
  }
  else if(target.kind==='isolation-gate'){
   keyHidden=true;
   text=target.id===game.floor.gunmuFinale.pipeGateId?'用维修间拉闸开启管道房。':'隔离闸';
   if(target.open||target.broken)$('interact').hidden=true;
  }
  else if(target.kind){
   keyHidden=!!(target.locked||target.broken);
   text=target.locked?(target.serviceSeal?'检修封闭':target.id===`${game.floor.id}-${game.floor.arrival}`?'上层楼梯已封闭':'需要密码。'):target.broken?'木门已损坏':target.held?'门扇受阻':target.open?'关闭门':'打开门';
  }
  else if(target.type==='keypad')text=game.state.approved?'门锁已打开':'输入密码';
  else if(target.type==='guide-stone'){
   const playing=game.state.stonePlayback?.site===target;
   keyHidden=!playing&&!!game.state.stoneSpent;
   text=playing?'停止播放':game.state.stoneSpent?'讲解石已失声':game.floor.listenerDepot?'播放讲解 · 仅一次':'播放讲解';
  }
  else if(target.type==='depot-slip'){
   const found=game.state.depotFinds?.[target.id],complete=!!game.knownCode;
   keyHidden=!!found||complete;
   text=found?`已记下第 ${found.slot+1} 位`:complete?'密码已集齐':target.crate&&!game.state.depotCrates[target.id]?'按住推箱 · 会发出声音':'拿密码纸';
  }
  else if(target.type==='depot-alarm'){
   const alarm=game.state.depotAlarms[target.id];
   keyHidden=!!alarm;
   text=!alarm?'设闹钟 · 4 秒后响':game.time<alarm.ringAt?`闹钟 · ${Math.ceil(alarm.ringAt-game.time)} 秒后响`:game.time<alarm.ringEnd?'闹钟正在响':'闹钟已响过';
  }
  else if(target.type==='depot-lure'){
   const lure=game.state.depotAlarms[target.id],intercom=target.mechanism==='intercom';
   keyHidden=!!lure;
   text=!lure?target.label:game.time<lure.ringAt?(intercom?'广播即将响起':'托盘正在下滑'):
    game.time<lure.ringEnd?(intercom?'远端广播正在响':'托盘撞击集料箱'):'已经用过了';
  }
  else if(target.type==='search'||target.type==='portrait'){
   const found=game.state.searched[target.id],loot=found&&game.state.loot[target.id];
   const equipped=ITEM_NAMES[loot]&&!game.inventory.includes(null)?game.inventory[selectedItemSlot]:null;
   keyHidden=!!found&&(!loot||equipped===loot);
   text=found?(equipped?(equipped===loot?'已选中同类道具。':`拿${ITEM_NAMES[loot]} · 留下${ITEM_NAMES[equipped]}`):ITEM_NAMES[loot]?'拿'+ITEM_NAMES[loot]:loot?'拿密码纸':'空的'):target.form==='painting'?'翻看画像':target.form==='drawer'?'拉开抽屉':'搜柜子';
  }
  else if(target.type==='vault')text='翻越障碍';
  else if(target.type==='chase-board'){
   const available=game.canDropChaseBoard(target);
   keyHidden=!available;
   text=available?'放下维修隔板':game.state.chaseBoards[target.id]?'维修隔板已用':'从隔板另一侧操作';
  }
  else if(target.type==='maintenance-lever'){
   const ready=game.canTrapGunmu();
   keyHidden=!ready;
   text=ready?'拉下隔离闸':game.state.gunmuStage==='lure'?'等她完全进维修间。':'隔离闸已启动';
  }
  else if(target.type==='shaft-switch'){
   const progress=shaftSlideProgress(target,game.state,game.time);
   keyHidden=game.state.gunmuSlides[target.id]!==undefined;
   text=!keyHidden?target.label:progress===1?'水管已就位。':'水管正在移入。';
  }
  else if(target.type==='vent')text='钻进通风口';
  else if(target.type==='wardrobe'){
   const cooldown=game.wardrobeCooldown;
   keyHidden=!!cooldown;
   text=cooldown?`衣柜冷却 · ${Math.ceil(cooldown)} 秒`:game.floor.listenerDepot?'躲入衣柜 · 最多 5 秒':'躲入衣柜';
  }
  else if(target.type==='flashlight')text='拾取强光手电筒';
  else if(target.type==='chase-bell'){
   const used=game.state.interactions[target.id];
   keyHidden=!!used;
   text=used?'检修铃已响过':target.label;
  }
  else text=target.label;
  if(target.chasePush&&!target.open&&!target.locked)text='按住推门';
  const reach=!keyHidden&&game.interactionReach(target);
  if(reach)showPrompt(reach==='near'?'走近一点。':reach==='front'?'到正面操作。':'被挡住了。','',true);
  else{
   const keyText=target.chasePush||['vault','vent','chase-board'].includes(target.type)?tr('E / 空格'):'E';
   showPrompt(text,keyHidden?'':keyText);
  }
 }
}
function canUseTouchItem(){
 return itemsInputAllowed()&&!!game.inventory[selectedItemSlot]&&!game.hiding&&!game.peek&&!game.travel&&!game.traversal&&!game.searching&&!game.chaseAction&&!game.depotCrateAction;
}
function interact(useItemIfIdle=false){
 if(mode!=='playing'||game.falseDoorAttack||game.keypadOpen||game.searching)return;
 aim();
 if(game.peek){game.interact(game.peek);return;}
 if(prompt.hidden||promptKey.hidden){
  if(useItemIfIdle&&canUseTouchItem())consumeItem();
  return false;
 }
 if(target?.type==='wardrobe'){if(game.interact(target.id)){if(game.hiding){yaw=game.hiding.yaw+Math.PI;pitch=0;}pose();sound('switch');}return;}
 const pickingUp=target&&(game.state.searched[target.id]&&game.state.loot[target.id]||['flashlight','depot-slip'].includes(target.type));
 if(target&&game.interact(target.id,selectedItemSlot)){sound(game.depotCrateAction?'switch':pickingUp?'pickup':target.kind||target.type==='shaft-switch'?'switch':'click');syncKeypad();}
}
function listenerCue(t){
 if(t.phase==='investigating'&&t.noiseFromAlarm){
  if(t.noiseMechanism==='stone')return '它追向了讲解石。';
  if(t.noiseMechanism==='impact')return '它追向了落点。';
  return t.noiseMechanism==='intercom'?'它追向广播。':t.noiseMechanism==='chute'?'它追向滑槽。':'它追向闹钟。';
 }
 if(t.phase==='investigating'&&!t.running&&t.sprintPursuitUntil>game.time)return '它还在追！';
 if(t.phase==='investigating')return t.age-t.heardAt<1?'它听见了！':'轻步离开。';
 return t.phase==='listening'?'别出声。':'轻步。';
}
function threatHud(){
 const t=game.threat||game.auxiliary,el=$('threat');
 const seconds=game.depotExitSeconds;
 el.hidden=!t||t.kind==='kun'&&t.phase!=='stunned'||mode!=='playing'||game.floor.listenerDepot&&t.kind==='liang'&&t.phase==='patrolling';
 $('vignette').classList.toggle('danger',!!t&&t.kind!=='patrol'&&t.kind!=='liang'&&mode==='playing'&&t.age>t.warning&&(t.kind!=='kun'||t.sightLocked&&t.distance<4)&&(t.kind!=='yujie'||game.sanityExposed));
 updateSanity();
 if(seconds>0&&mode==='playing'){
  el.hidden=false;el.dataset.kind='depot-exit';
  $('threat-name').hidden=false;
  displayText('threat-name',tr('楼梯门正在关闭'));
  displayText('threat-action',tr(`跑！ · ${Math.ceil(seconds)} 秒`));
  const progress=$('threat-progress');progress.parentElement.hidden=false;
  progress.style.transform=`scaleX(${seconds/game.depotExitDuration})`;
  return;
 }
 if(t){
  let action=RULES[t.kind].action,detail='',progress=0;
  const hideWarning=t.kind==='patrol'||t.kind==='rush';
  if(hideWarning){
   if(t.phase==='return-warning')action=game.hiding?'折返了。别出来！':'折返了。躲好！';
   else if(t.kind==='rush'&&t.phase==='between')action='还有第二遍。';
   else if(t.phase==='leaving')action='等它离开。';
   else action=game.hiding?'别动。':'躲好！';
  }else if(t.kind==='kun'){
   action='隔板击晕了它！';
  }else if(t.kind==='inspector'){
   action=t.phase==='leaving'?'等它离开。':'别动！';detail=t.phase==='checking'?String(Math.min(2,(t.checks||0)+1))+' / 2':'';
   progress=t.moveDeadline!=null?Math.max(0,(t.moveDeadline-t.age)/.5):(t.checks||0)/2;
  }else if(t.kind==='yujie'){
   action=t.phase==='leaving'?'再等一下。':'低头！';progress=game.sanity/100;
  }else if(t.kind==='liang'){
   action=listenerCue(t);
  }else if(t.kind==='naiwa'){
   action=t.observed?'慢慢后退。':'看着它！';
  }else if(t.kind==='doubao'){
   action=game.objective;
   const {gunmuStage,gunmuBreachAt}=game.state;
   if(gunmuStage==='trapped')detail=Math.max(0,Math.ceil(gunmuBreachAt-game.time))+'s';
   if(gunmuStage==='pipes'){
    if(gunmuBreachAt!==null&&game.time>=gunmuBreachAt&&game.time<gunmuBreachAt+1.8)action='棍母破开了闸门。快跑！';
    else if(t.phase==='crawling'&&Math.hypot(t.distance,t.y-game.player.y)<7)action='她追上来了！';
   }
  }
  const name=tr(RULES[t.kind].title);
  $('threat-name').hidden=hideWarning;
  $('threat-progress').parentElement.hidden=hideWarning||['liang','kun','doubao'].includes(t.kind);
  displayText('threat-name',detail?name+' · '+detail:name);displayText('threat-action',tr(action));
  $('threat-progress').style.transform='scaleX('+Math.max(.025,Math.min(1,progress))+')';el.dataset.kind=t.kind;
 }
 displayText('checkpoint',tr(`继续点 · ${game.checkpoint.floor} 楼`));
}
function updateSanity(){
 const value=Math.ceil(game.sanity);
 $('sanity').hidden=false;$('sanity').setAttribute('aria-valuenow',String(value));
 displayText('sanity-value',tr(`理智 ${value} / 100`));
 $('sanity-fill').style.transform=`scaleX(${game.sanity/100})`;
 $('sanity').classList.toggle('draining',game.sanityExposed||!!game.falseDoorAttack);
}

function updateGunmuTracker(){
 const tracker=$('gunmu-tracker'),actor=game.threat;
 tracker.hidden=mode!=='playing'||actor?.kind!=='doubao'||actor.floor!==game.player.floor||!game.floor.gunmuFinale;
 if(tracker.hidden)return;
 const {distance,elevation,angle}=gunmuBearing(game.player,actor,camera.rotation.y);
 $('gunmu-needle').style.transform=`rotate(${angle}rad)`;
 displayText('gunmu-range',`${distance.toFixed(1)} m`);
 const height=$('gunmu-elevation');
 height.hidden=Math.abs(elevation)<1.2;
 if(!height.hidden)displayText('gunmu-elevation',tr(elevation>0?'在上方':'在下方'));
 tracker.classList.toggle('near',distance<7);
 tracker.classList.toggle('looking-back',!!rearGlance());
}

function showKeypadMarker(marker){
 keypadMarker.hidden=!marker;
 if(!marker)return;
 const {anchor,metres}=marker;
 const x=T.MathUtils.clamp((anchor.x*.5+.5)*100,12,88),y=T.MathUtils.clamp((.5-anchor.y*.5)*100,15,91);
 keypadMarker.style.left=x+'%';keypadMarker.style.top=y+'%';
 const label=game.floor.listenerDepot?'楼梯门控制台':'楼梯门锁';
 displayText('keypad-marker',tr(label)+' · '+metres+' m');
}

function updateChasePressure(dt){
 const actor=game?.threat;
 const active=mode==='playing'&&game.floor.id===3&&actor?.kind==='kun'&&actor.floor===3&&actor.age>actor.warning&&!game.debugCalm&&!game.state.chaseEscaped;
 if(!active){chasePressureLevel=0;chasePressure.style.opacity='0';return;}
 const distance=Math.hypot(actor.x-game.player.x,actor.z-game.player.z);
 const proximity=T.MathUtils.clamp((12-distance)/9,0,1);
 const target=proximity*(actor.phase==='stunned'?.18:1);
 chasePressureLevel+=(target-chasePressureLevel)*(1-Math.exp(-dt*3.4));
 const breath=settings.reduced?1:.93+.07*Math.sin(visualTime*3.1);
 chasePressure.style.opacity=String(chasePressureLevel*.62*breath);
}

function lightActor(actor,t,dt,appearing){
 const u=actor.material.uniforms;
 if(u.uVisitor.value)return;
 if(game.debugCalm||mode==='scare'){if(game.debugCalm)u.uLight.value=.85;u.uSide.value=0;return;}
 // Use the same small set of practical lights as the room. A face is briefly readable as it crosses a pool.
 let key=0,side=0;
 for(const lamp of world.lights){
  if(!lamp.visible||!lamp.parent||lamp.intensity<=0)continue;
  const dx=lamp.position.x-t.x,dz=lamp.position.z-t.z,distance=Math.hypot(dx,dz);
  const power=Math.min(1,lamp.intensity/16)*(1-T.MathUtils.smoothstep(distance,1.5,lamp.distance));
  if(power>key){key=power;side=power*(Math.cos(actor.rotation.y)*dx-Math.sin(actor.rotation.y)*dz)/Math.max(.1,distance);}
 }
 const fill=t.kind==='patrol'?.22:t.kind==='liang'?.28:.38;
 let target=t.kind==='doubao'&&t.illuminated?1.1:fill+.42*key;
 if(t.kind==='kun'&&Number.isFinite(t.heading)){
  // The original cutout turns in profile while he searches. His face catches light again when he looks back.
  const bearing=Math.atan2(camera.position.x-t.x,camera.position.z-t.z);
  const turn=t.heading+Math.PI-bearing;
  actor.rotation.y=bearing+.64*Math.sin(turn);
  target*=.60+.40*T.MathUtils.smoothstep(Math.cos(turn),-.6,.8);
 }
 u.uLight.value=appearing?target:T.MathUtils.damp(u.uLight.value,target,8,dt);
 u.uSide.value=appearing?side:T.MathUtils.damp(u.uSide.value,side,8,dt);
}
function actorOpacity(t){
 if(t.phase!=='leaving')return 1;
 return ['inspector','patrol','rush','yujie','doubao'].includes(t.kind)?Math.max(0,1-(t.retreat||0)/1.3):1;
}
// Hidden rigs would otherwise update every bone's world matrix on each render.
function showCharacter(model,visible){
 model.visible=visible;
 if(visible&&!model.parent)scene.add(model);
 else if(!visible&&model.parent)model.removeFromParent();
}
function updateActors(dt){
 const effects={game,camera,dt:mode==='playing'?dt:0,time:visualTime,reduced:settings.reduced};
 const active=mode==='scare'?[caughtThreat()]:[game.threat,game.auxiliary,game.standbyKun];
 for(const [kind,a]of Object.entries(actors)){
  const t=active.find(t=>t?.kind===kind),appearing=!a.visible,model=characterActors[kind];
  const sweeping=!t||!['patrol','rush'].includes(kind)||sweepTiming(t).phase==='sweeping'||t.phase==='leaving';
  const visible=!!t&&(mode==='scare'?scareVisual.visible&&!scareActors[scareKey(t)]:['playing','paused'].includes(mode)&&worlds.has(t.floor)&&sweeping&&!(kind==='yujie'&&t.age<t.warning));
  if(model){
   showCharacter(model,visible&&mode!=='scare');
   if(model.visible)updateCharacterActor(model,t,{...effects,opacity:actorOpacity(t),auxiliary:t===game.auxiliary});
  }
  a.visible=visible&&!model?.visible;
  if(!a.visible)continue;
  const y=(t.y??(t.floor-1)*RISE)+1.325*(t===game.auxiliary?.86:1);a.position.set(t.x,y,t.z);a.rotation.y=Math.atan2(camera.position.x-t.x,camera.position.z-t.z);
  const u=a.material.uniforms;u.uHeat.value=0;u.uGround.value=-1000;u.uTime.value=visualTime;u.uOpacity.value=actorOpacity(t);u.uSilhouette.value=kind==='kun'&&mode!=='scare';
  lightActor(a,t,dt,appearing);
  a.scale.setScalar(t.kind==='inspector'?1.05:t===game.auxiliary?.86:1);
  if(kind==='liang'&&mode!=='scare'){
   const leaning=t.phase==='listening'?-.085:t.phase==='investigating'?.055:0;
   a.rotation.z=settings.reduced?0:T.MathUtils.damp(a.rotation.z,leaning,10,dt);
  }
  a.material.depthTest=mode!=='scare';a.renderOrder=mode==='scare'?20:0;
  if(mode==='scare'){
   const offset={inspector:[0,-.65],kun:[-.25,-1.28],naiwa:[.08,-1.18],liang:[0,-.5]}[kind];placeScareActor(a,offset,kind==='naiwa'?1.15:1.3);
  }
 }
 const t=game.threat;
 visitorCopies.forEach((a,i)=>{
  const p=t?.kind==='yujie'?t.copies?.[i+1]:null,appearing=!a.visible,model=visitorModels[i];
  if(model){
   showCharacter(model,!!p&&characterActors.yujie.visible&&worlds.has(p.floor));
   if(model.visible)updateCharacterActor(model,p,{...effects,opacity:actorOpacity(t)});
  }
  a.visible=!!p&&actors.yujie.visible&&mode!=='scare';if(!a.visible)return;
  a.position.set(p.x,(p.floor-1)*RISE+1.325,p.z);a.rotation.y=Math.atan2(camera.position.x-p.x,camera.position.z-p.z);
  a.material.uniforms.uOpacity.value=actors.yujie.material.uniforms.uOpacity.value;lightActor(a,p,dt,appearing);
 });
}
async function prepareCharacterModels(definitions){
 const loader=new GLTFLoader(),entries=Object.entries(definitions||{});
 for(let i=0;i<entries.length;i+=2){
  await Promise.all(entries.slice(i,i+2).map(async([kind,definition])=>{
   try{
    const gltf=await loader.loadAsync(assetUrl(definition.url));
    const model=createCharacterActor(gltf,kind,definition);
    if(kind==='yujie'){
     for(let j=0;j<2;j++)visitorModels.push(createCharacterActor(gltf,kind,definition));
    }
    characterActors[kind]=model;
    // The initial compile warms the inspector (and the debug listener) before its first appearance.
    if(mode==='loading')scene.add(model);
   }catch(error){
    if(kind==='inspector')throw error;
    console.warn('Cannot load character model:',kind,error);
   }
  }));
 }
}
function updateScareActors(){
 for(const [key,a]of Object.entries(scareActors)){
  if(sweeperScares[key])continue;
  const caught=caughtThreat();a.visible=mode==='scare'&&scareVisual.visible&&!!caught&&key===scareKey(caught);if(!a.visible)continue;
  const def=scareDefinitions[key];
  if(def.impactAsset)a.material.uniforms.uMap.value=assets[scareVisual.impactPhoto?def.impactAsset:def.asset];
  placeScareActor(a,def.offset,def.scale);
 }
}
function placeScareActor(a,offset,scale){
 const s=scareVisual,p=new T.Vector3(offset[0]+s.x,offset[1]+s.y,-s.distance).applyQuaternion(camera.quaternion);
 a.position.copy(camera.position).add(p);a.quaternion.copy(camera.quaternion);a.rotateZ(s.roll);a.scale.setScalar(scale);a.material.uniforms.uLight.value=s.light;a.material.uniforms.uOpacity.value=1;
}
function step(dt){
 if(captureRequired()&&document.pointerLockElement!==canvas)return;
 if(game.hiding){const facing=game.hiding.yaw+Math.PI;yaw=facing+T.MathUtils.clamp(Math.atan2(Math.sin(yaw-facing),Math.cos(yaw-facing)),-.35,.35);pitch=T.MathUtils.clamp(pitch,-.18,.18);}
 if(!rearGlance()){
  if(keys.has('ArrowLeft'))yaw+=dt*1.5;if(keys.has('ArrowRight'))yaw-=dt*1.5;
  if(keys.has('ArrowUp'))pitch+=dt;if(keys.has('ArrowDown'))pitch-=dt;
  pitch=T.MathUtils.clamp(pitch,-1.15,1.15);
 }
 const finger=touch?.state;
 const input={yaw,pitch,verticalFov:camera.fov*Math.PI/180,aspect:camera.aspect,
  forward:+keys.has('KeyW')-+keys.has('KeyS')+(finger?.forward??0),
  right:+keys.has('KeyD')-+keys.has('KeyA')+(finger?.right??0),
  sprint:keys.has('ShiftLeft')||keys.has('ShiftRight')||!!finger?.sprint,
  jump:keys.has('Space')||!!finger?.jump,
  interactHeld:keys.has('KeyE')||!!finger?.interact||!game.depotCrateAction&&keys.has('Space')};
 game.lastInput=input;
 const hiding=game.hiding,crate=game.depotCrateAction;
 if(resumeGrace>0)resumeGrace-=dt;else{game.tick(dt,input);if(finger)finger.jump=false;}
 if(crate&&!game.depotCrateAction&&game.state.depotCrates?.[crate.id])sound('switch');
 if(hiding&&!game.hiding&&game.wardrobeCooldown)sound('switch');
 showFloor();pose();
 const circuit=patrolCircuitPower(game.threat,game.state.blackout,settings.reduced);
 const pipeEscape=game.state.gunmuStage==='pipes';
 const gunmuFloor=!!game.floor.gunmuFinale,beamBoost=gunmuFloor?1.25:1;
 const pale=!game.debugCalm&&game.threat?.floor===game.player.floor?visitorLightBlend(game.threat,settings.reduced):0;
 flashlight.color.setHex(beamTint).lerp(visitorBeamTint,pale);
 flashlight.intensity=game.hiding?0:beamBoost*(game.debugCalm?3:pipeEscape?25:T.MathUtils.lerp(.48,4,circuit));
 flashlight.distance=(pipeEscape?17:14)*beamBoost;
 ambient.intensity=game.debugCalm?2:pipeEscape?0:T.MathUtils.lerp(.035,.14,circuit)*(1-.38*pale);
 const canSway=!settings.reduced&&!game.hiding&&!game.travel&&!game.traversal&&!game.keypadOpen&&!game.peek&&!game.falseDoorAttack;
 const running=canSway&&input.sprint&&game.sprinting;
 const grounded=!pipeEscape||game.time-game.state.gunmuGroundedAt<.04;
 const stride=running?(grounded?1:.22):0;
 sprintSway=canSway?T.MathUtils.damp(sprintSway,stride,grounded?12:18,dt):0;
 if(sprintSway>.002){
  walkTime=(walkTime+dt*2.8)%2;
  const beat=walkTime*Math.PI*2;
  camera.position.y+=Math.cos(beat)*.025*sprintSway;
  camera.rotation.x+=Math.sin(beat)*.006*sprintSway;
  camera.rotation.z=Math.sin(beat*.5)*.007*sprintSway;
 }else if(canSway&&settings.bob&&(input.forward||input.right)){
  walkTime=(walkTime+dt*2.7)%2;camera.position.y+=Math.sin(walkTime*Math.PI*2)*.015;
 }
 const peek=game.peek&&game.floor.interactions.find(i=>i.id===game.peek);$('peek').hidden=!peek;
 const targetFov=game.hiding?60:peek?43:game.sprinting&&!settings.reduced?76:72;
 if(camera.fov!==targetFov){
  camera.fov=T.MathUtils.damp(camera.fov,targetFov,5,dt);
  if(Math.abs(camera.fov-targetFov)<.0001)camera.fov=targetFov;
  camera.updateProjectionMatrix();
 }
 if(peek){const side=Math.sign((game.player.x-peek.target.x)*Math.sin(peek.yaw)+(game.player.z-peek.target.z)*Math.cos(peek.yaw))||1;camera.position.x=T.MathUtils.lerp(camera.position.x,peek.target.x+Math.sin(peek.yaw)*.25*side,.92);camera.position.z=T.MathUtils.lerp(camera.position.z,peek.target.z+Math.cos(peek.yaw)*.25*side,.92);}
 aim();threatHud();
 if(touch){
  $('touch-controls').hidden=game.keypadOpen;
  $('jump-unlock').hidden=pipeEscape;
  $('touch-glance').hidden=!game.floor.gunmuFinale||!!game.travel;
  const available=game.peek||!prompt.hidden&&!promptKey.hidden,item=!available&&canUseTouchItem();
  displayText('touch-interact',tr(item?'使用道具':'操作'));
  $('touch-interact').setAttribute('aria-disabled',String(!available&&!item&&!finger.interact));
 }
 if(game.messages.length){
  const message=game.messages.pop();game.messages=[];
  if(!game.threat&&!game.keypadOpen&&message.text!==game.objective)say(message.text,message.duration);
 }
 if(game.threat)$('subtitle').classList.remove('shown');
 if(game.debugPendingScare){game.debugPendingScare=false;scare();}else if(game.mode==='lost'){if(game.lastCatch==='fall')finish(false);else scare();}else if(game.mode==='won')finish(true);
}
function frame(t){
 requestAnimationFrame(frame);const raw=last?(t-last)/1000:0;last=t;const dt=Math.min(raw,.08);
 if(mode==='playing'){
  if(playFrameAt)game.run.seconds+=Math.max(0,(t-playFrameAt)/1000);
  playFrameAt=t;step(dt);frameTimes.push(raw*1000);if(frameTimes.length>600)frameTimes.shift();
 }else playFrameAt=0;
 if(mode==='playing'||mode==='menu'||mode==='scare')visualTime+=dt;
 if(mode==='scare'){
  scareAge+=dt;scareVisual=scareFrame(scareAge,settings.reduced,scareKind);scareBackdrop.visible=!scareVisual.world;
  if(scareKind==='patrol'||scareKind==='rush')flashlight.intensity=0;
  $('scare').style.setProperty('--scare-black',scareVisual.black);$('scare').style.setProperty('--scare-grain',scareVisual.grain);
  if(scareAge>=(scareVisual.duration??SCARE_DURATION)){if(debugEnabled){clearScare();gameAudio.stop();mode='playing';hud(true);resumeGrace=.35;if(captureRequired()&&document.pointerLockElement!==canvas)pause();}else finish(false);}
 }
 const shot=mode==='scare'&&sweeperScares[scareKind];
 if(world&&!shot){if(mode==='menu')camera.rotation.set(pitch,yaw+(settings.reduced?0:Math.sin(t*.00023)*.028),0);if(mode!=='paused')for(const w of worlds.values())w.update(dt,camera,visualTime,game,settings.reduced);updateActors(dt);updateScareActors();}
 if(mode==='playing'){if((subtitleTime-=dt)<=0)$('subtitle').classList.remove('shown');if((chapterTime-=dt)<=0)$('chapter').classList.remove('shown');}
 const falseAttack=mode==='playing'?game.falseDoorAttack:null;
 if(falseAttack&&falseAttack!==heardFalseDoor){heardFalseDoor=falseAttack;sound('power-off');}
 falseDoorBlack.style.opacity=String(falseDoorEffect.update(falseAttack,camera,settings.reduced));
 updateGuide();
 updateGunmuTracker();
 updateChasePressure(dt);
 gameAudio.update(game,mode,settings.volume,camera.rotation.y,document.hidden,mode==='scare'?1-scareVisual.fade:1,settings.background);
 if(mode==='scare'){
  if(scareKind==='naiwa'&&!scareCue&&scareAge>=.10){scareCue=true;gameAudio.play('switch',.29);}
  const audioAt=scareKind==='patrol'||scareKind==='rush'?0:scareVisual.impact;
  if(!scareHit&&scareAge>=audioAt){
   scareHit=true;
   gameAudio.playScare(scareKind);
  }
 }
 if(mode==='playing')showKeypadMarker(interactionGlints.update(world,camera,game,target?.id));
 else{interactionGlints.hide();showKeypadMarker(null);}
 debugTools?.update(dt);
 if(shot){
  shot.update(scareVisual,camera.aspect);renderer.render(shot.scene,shot.camera);
 }else renderer.render(scene,camera);
 if(diagnostics&&Math.floor(t/500)!==Math.floor((t-raw*1000)/500))diagnostics.textContent=JSON.stringify({state:window.__game.state,stats:window.__game.stats});
}
addEventListener('keydown',e=>{
 if(debugTools&&e.code==='F3'){e.preventDefault();if(!e.repeat)debugTools.toggle();return;}
 if(mode==='playing'&&game.keypadOpen){
  if(e.code==='Tab'){
   e.preventDefault();const buttons=[...$('keypad').querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
   buttons[(index+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();return;
  }
  e.preventDefault();padHeldKeys.add(e.code);if(e.repeat)return;
  if(/^(Digit|Numpad)\d$/.test(e.code))pressPad(e.code.slice(-1));
  else if(e.key==='Enter'&&document.activeElement.matches('#keypad button'))document.activeElement.click();
  else if(e.code==='KeyE')pressPad('Escape');
  else if(['Enter','Backspace','Escape'].includes(e.key))pressPad(e.key);
  return;
 }
 if(padHeldKeys.has(e.code))return;
 if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)&&mode==='playing')e.preventDefault();
 if(e.code==='Escape'){if(mode==='rules'&&rulesReturn!=='playing')closeRules();else pause();return;}
 if(e.code==='KeyH'&&mode==='rules'){e.preventDefault();if(!e.repeat)closeRules();return;}
 if(e.code==='Tab'&&mode==='rules'){e.preventDefault();const buttons=[...$('rules').querySelectorAll('button')].filter(b=>!b.hidden),index=buttons.indexOf(document.activeElement);buttons[(index+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();return;}
 if(e.code==='Tab'&&mode==='playing'){
  e.preventDefault();
  if(game.floor.gunmuFinale&&!game.travel){if(!e.repeat)keys.add(e.code);}
  else if(!e.repeat)toggleNotes();
  return;
 }
 if(notesOpen&&['PageUp','PageDown'].includes(e.code)){e.preventDefault();$('code-notes').scrollBy(0,e.code==='PageDown'?180:-180);return;}
 if(e.code==='KeyH'&&!e.repeat&&['playing','paused'].includes(mode)){e.preventDefault();openRules();return;}
 if(itemsInputAllowed()&&/^(Digit|Numpad)[12]$/.test(e.code)){e.preventDefault();if(!e.repeat)selectItem(Number(e.code.slice(-1))-1);return;}
 if(!['playing','scare'].includes(mode))return;if(mode==='playing'){keys.add(e.code);if(e.code==='KeyE'&&!e.repeat)interact();if(e.code==='Space'&&!e.repeat){if(game.nearestTraversal()||target?.chasePush)interact();else if(game.state.gunmuStage!=='pipes')say('跳跃在一楼管道区开放。',2.5);}}if(e.code==='KeyM'&&!e.repeat){settings.volume=settings.volume?0:35;$('volume').value=settings.volume;save();if(mode==='playing')say(settings.volume?'声音已开启':'声音已关闭',2);}
});
addEventListener('keyup',e=>{keys.delete(e.code);padHeldKeys.delete(e.code);});addEventListener('blur',()=>{padHeldKeys.clear();pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){gameAudio.stop();pause();}});
document.addEventListener('pointerlockchange',()=>{
 itemLockVersion++;itemPointer=null;
 if(document.pointerLockElement===canvas){if(!captureRequired()||!['playing','rules','scare'].includes(mode))unlock();else hadLock=true;}
 else if(hadLock){hadLock=false;pause();}
});
document.addEventListener('pointerlockerror',captureFailed);
canvas.addEventListener('wheel',e=>{
 if(mode==='rules'&&capturedPanel()){e.preventDefault();capturedPanel().scrollTop+=e.deltaY;return;}
 if(notesOpen&&document.pointerLockElement===canvas){e.preventDefault();$('code-notes').scrollTop+=e.deltaY;return;}
 if(!itemsInputAllowed()||Math.abs(e.deltaY)<1)return;
 e.preventDefault();const now=performance.now();if(now-lastItemWheel<140)return;
 lastItemWheel=now;selectItem(selectedItemSlot+Math.sign(e.deltaY));
},{passive:false});
canvas.addEventListener('pointerdown',e=>{
 if(capturedPanel()){if(e.button===0)pointedButton?.click();return;}
 if(e.pointerType==='touch'||mode!=='playing'||game.keypadOpen)return;
 if(document.pointerLockElement===canvas){if(e.button===0)consumeItem();return;}
 if(captureRequired()){lock();return;}
 dragging=true;canvas.setPointerCapture(e.pointerId);
 itemPointer=e.button===0&&itemsInputAllowed()?{id:e.pointerId,x:e.clientX,y:e.clientY,at:performance.now(),lock:itemLockVersion,moved:0}:null;
});
canvas.addEventListener('pointermove',e=>{
 if(itemPointer?.id===e.pointerId)itemPointer.moved=Math.max(itemPointer.moved,Math.hypot(e.clientX-itemPointer.x,e.clientY-itemPointer.y));
});
addEventListener('pointerup',e=>{
 dragging=false;const click=itemPointer;itemPointer=null;
 if(click?.id===e.pointerId&&e.button===0&&click.lock===itemLockVersion&&!document.pointerLockElement&&click.moved<=6&&Math.hypot(e.clientX-click.x,e.clientY-click.y)<=6&&performance.now()-click.at<450)consumeItem();
});
addEventListener('pointercancel',()=>{dragging=false;itemPointer=null;});
addEventListener('mousemove',e=>{const panel=capturedPanel();if(panel){movePanelPointer(panel,e.movementX,e.movementY);return;}if(mode!=='playing'||game.keypadOpen||rearGlance()||(!document.pointerLockElement&&!dragging))return;const s=settings.sensitivity*.00003;yaw-=e.movementX*s;pitch=T.MathUtils.clamp(pitch-e.movementY*s,-1.15,1.15);});
for(const button of itemButtons)button.onclick=()=>{const slot=Number(button.dataset.slot);if(slot===selectedItemSlot)consumeItem(slot);else selectItem(slot);};
for(const button of $('keypad-keys').querySelectorAll('button'))button.onclick=()=>pressPad(button.dataset.pad);
$('keypad-close').onclick=()=>pressPad('Escape');
function localizeFloorEntry(){
 if(!building)return;
 const select=$('entry-floor'),selected=select.value;
 select.replaceChildren(...building.floors.slice().sort((a,b)=>b.id-a.id).map(f=>new Option(floorLabel(f),f.id)));
 select.value=selected||'8';
}
$('enter-practice').onclick=()=>{start(false,Number($('entry-floor').value));if(mobile)void preferLandscape();};
$('start').onclick=()=>{start();if(mobile)void preferLandscape();};$('help-button').onclick=openRules;$('pause-help').onclick=openRules;$('notes-button').onclick=toggleNotes;$('rules-continue').onclick=closeRules;$('resume').onclick=resume;$('pause-button').onclick=pause;$('quit').onclick=menu;$('end-menu').onclick=menu;$('restart').onclick=()=>start(game.mode==='lost',game.run.selectedFloor);$('new-run').onclick=()=>start();
$('sprint-setting').hidden=!mobile;
function syncSprintDistance(){
 $('sprint-value').value=settings.sprintSensitivity+'%';
 $('touch-stick').style.setProperty('--sprint-ring',(settings.sprintSensitivity*.6)+'%');
}
syncSprintDistance();
for(const id of ['quality','volume','background','sensitivity','sprintSensitivity','bob','reduced']){const el=$(id),checkbox=el.type==='checkbox';if(checkbox)el.checked=!!settings[id];else el.value=settings[id];el.oninput=()=>{settings[id]=checkbox?el.checked:id==='quality'?el.value:Number(el.value);save();if(id==='sprintSensitivity')syncSprintDistance();if(id==='quality')resize();};}
function changeLanguage(value){
 settings.language=setLanguage(value);save();localizeStatic();if(game)$('pause-floor').textContent=floorLabel(game.floor);debugTools?.localize();
 localizeFloorEntry();
 for(const id of ['language','pause-language'])$(id).value=settings.language;
 $('subtitle').textContent=tr(subtitleMessage);
 if($('load-status').hidden)$('start').innerHTML=tr('开始游戏')+' <span aria-hidden="true">↗</span>';
 if(game){for(const w of worlds.values())w.localize();$('floor-label').textContent=floorLabel(game.floor);chapter(game.floor);threatHud();if(mode!=='playing')$('chapter').classList.remove('shown');aim();}
}
for(const id of ['language','pause-language']){$(id).value=settings.language;$(id).onchange=e=>changeLanguage(e.target.value);}
const diagnostics=parameters.has('debug')&&!debugEnabled?shell.appendChild(document.createElement('pre')):null;
if(diagnostics)diagnostics.id='diagnostics';
window.__game={get state(){return{mode,language:getLanguage(),floor:game?.player.floor,position:game?{...game.player}:null,yaw,elapsed:game?.time,sanity:game?.sanity,stamina:game?.stamina,sprinting:game?.sprinting,exhausted:game?.exhausted,seed:game?.seed,threat:game?.threat?{kind:game.threat.kind,phase:game.threat.phase,checks:game.threat.checks,searched:game.threat.searched,position:[game.threat.x,game.threat.z],observed:game.threat.observed,age:game.threat.age,warning:game.threat.warning,copies:game.threat.copies}:null,checkpoint:game?.checkpoint.floor,pendingCheckpoint:game?.pendingCheckpoint,target:target?.id,travel:game?.travel,hiding:game?.hiding,interactions:game?.state.interactions,scene:game?.currentScene?.id??null,sceneIndex:game?.state.sceneIndex,approved:game?.state.approved,keypad:game?.keypadOpen,input:game?.state.keypadInput,inventory:game?.inventory,notes:game?.state.codeParts,searching:game?.searching,gunmuStage:game?.state.gunmuStage,auxiliary:game?.auxiliary?.kind};},get stats(){const s=[...frameTimes].sort((a,b)=>a-b);return{samples:s.length,medianMs:s[Math.floor(s.length*.5)]||0,p95Ms:s[Math.floor(s.length*.95)]||0,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries,resolution:renderer.getDrawingBufferSize(new T.Vector2()).toArray()};}};
function jumpDebug(floor){
 if(mode==='rules')closeRules();if(mode==='paused')resume();else if(mode!=='playing')start();
 game.jumpFloor(floor);target=null;keys.clear();touch?.reset();floorShown=0;showFloor();yaw=game.floor.spawnYaw??-Math.PI/2;pitch=0;pose();$('subtitle').classList.remove('shown');
}
function stageDebug(stage){
 const floor={keypad:6,inspector:6,naiwa:4,liang:5,chase:3,patrol:2,rush:2,yujie:4,'false-door':7}[stage]??1;
 jumpDebug(floor);game.states={...game.states,[floor]:game.initialFloor(game.floor)};
 game.falseDoorAttack=null;game.lastDebugScare=-Infinity;game.sanity=100;game.restoreStamina();
 if(stage==='inspector'||stage==='liang'){
  const inspector=stage==='inspector';
  const source=inspector?{floor,x:16,z:8}:{floor,x:33.85,z:21.45};
  Object.assign(game.player,inspector?{x:9,z:8}:{x:24.5,z:21.5});
  yaw=Math.atan2(game.player.x-source.x,game.player.z-source.z);
  game.beginEncounter(stage,source);
  if(!inspector)game.hearNoise(game.player);
 }
 else if(['naiwa','yujie','patrol','rush'].includes(stage)){
  if(game.beginEncounter(stage)&&(stage==='naiwa'||stage==='yujie')){
   const {x,z}=game.threat;
   yaw=Math.atan2(game.player.x-x,game.player.z-z);
  }
 }
 else if(stage==='false-door'){
  const door=game.state.doors.find(d=>d.falseDoor);
  door.vanished=false;
  Object.assign(game.player,{x:door.x,z:door.z-door.inward*1.05});
  yaw=door.inward>0?Math.PI:0;
 }
 else if(stage==='keypad'){const approach=game.floor.keypad.approach;Object.assign(game.player,{x:approach.x,z:approach.z,y:game.floor.base});yaw=approach.yaw;}
 else if(stage==='chase'){const r=game.floor.chaseStart;Object.assign(game.player,{x:r.x+.2,z:r.z+r.d/2});game.beginEncounter('kun');}
 else yaw=game.stageGunmuDebug(stage);
 pose();showFloor();updateCampaignHud();
}
async function boot(){
 try{
  building=createCampaignBuilding();
  const assetResponse=await fetch(assetUrl('/assets/apartment/runtime-manifest.json'));if(!assetResponse.ok)throw new Error('Asset manifest unavailable');const manifest=await assetResponse.json();
  for(const f of building.floors)for(const i of f.interactions)if(i.type==='portrait')i.asset=manifest.portraitInteractions[i.id]||i.asset;
  const total=Object.keys(manifest.textures).length+Object.keys(manifest.models).length;let loaded=0;await Promise.all(Object.entries(manifest.textures).map(async([key,item])=>{const tex=await new T.TextureLoader().loadAsync(assetUrl(item.url));tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());assets[key]=tex;$('load-status').textContent=tr(`准备照片与装置 ${++loaded} / ${total}`);}));
  await Promise.all(Object.entries(manifest.models).map(async([key,url])=>{models[key]=(await new GLTFLoader().loadAsync(assetUrl(url))).scene;$('load-status').textContent=tr(`准备照片与装置 ${++loaded} / ${total}`);}));
  assets.floorPhotos=manifest.floorPhotos.map(key=>assets[key]);
  for(const kind of ['inspector','naiwa','kun','liang','patrol','rush','yujie','doubao']){actors[kind]=manifest.billboards?.[kind]?createCutoutActor(assets[manifest.billboards[kind].asset||kind],manifest.billboards[kind]):createActor(assets[kind],kind);actors[kind].visible=false;scene.add(actors[kind]);}
  for(let i=0;i<2;i++){
   const copy=actors.yujie.clone();copy.material=actors.yujie.material.clone();
   copy.material.uniforms.uMap.value=actors.yujie.material.uniforms.uMap.value;
   copy.visible=false;visitorCopies.push(copy);scene.add(copy);
  }
  Object.assign(scareDefinitions,manifest.scares);for(const [key,def]of Object.entries(scareDefinitions)){
   if(def.model&&def.impactAsset){
    const alternate=assets[def.alternateImpact?.asset];
    const shot=createSweeperScare(assets[def.asset],assets[def.impactAsset],def,key,alternate);
    sweeperScares[key]=shot;scareActors[key]=shot.portrait;renderer.initTexture(assets[def.impactAsset]);
    if(alternate)renderer.initTexture(alternate);
    continue;
   }
   const a=createCutoutActor(assets[def.asset],def);
   a.material.uniforms.uScareStyle.value=def.impactAsset?1:key==='naiwa'?2:key==='yujie'?4:0;
   if(def.impactAsset)renderer.initTexture(assets[def.impactAsset]);
   a.material.depthTest=false;a.renderOrder=20;a.visible=false;scene.add(a);scareActors[key]=a;
  }
  const {inspector,...otherCharacters}=manifest.characterModels;
  await prepareCharacterModels(debugEnabled?{inspector,liang:otherCharacters.liang}:{inspector});
  if(debugEnabled)delete otherCharacters.liang;
  localizeFloorEntry();
  menu();await renderer.compileAsync(scene,camera);$('load-status').hidden=true;$('start').disabled=false;$('start').innerHTML=tr('开始游戏')+' <span aria-hidden="true">↗</span>';
  // The development-only rehearsal is served from work/ and excluded from production builds.
  $('floor-entry').hidden=false;
  if(import.meta.env.DEV&&(parameters.has('qa')||parameters.has('safeqa'))){const url='/work/eight-floor/rehearsal.js?revision=1';const {install}=await import(/* @vite-ignore */url);install({audio:gameAudio,stats:()=>window.__game.stats,game:()=>game,start,scene,camera,actors,characterActors,visitorModels,scareActors,sweeperScares,wangScare:sweeperScares.patrol,world:()=>world,worlds,showFloor,setView:(y,p=0)=>{yaw=y;pitch=p;pose();},mode:()=>mode,pause,resume,settings});}
  if(debugEnabled){const {installDebug}=await import('./debug.js');debugTools=installDebug({scene,camera,shell,viewport:()=>viewport,mobile,game:()=>game,stats:()=>window.__game.stats,mode:()=>mode,settings:debugSettings,calm:()=>{game.debugCalm=debugSettings.calm;atmosphere();},jump:jumpDebug,stage:stageDebug,panelChanged:expanded=>{if(expanded){resetPanelPointer(null);unlock();}else if(mode==='playing')lock();}});}
  requestAnimationFrame(frame);
  const scareLoader=new GLTFLoader();
  for(const [key,shot] of Object.entries(sweeperScares))void scareLoader.loadAsync(assetUrl(manifest.scares[key].model.url)).then(gltf=>{
   shot.setModel(gltf);return renderer.compileAsync(shot.scene,shot.camera);
  }).catch(error=>console.warn('Cannot load scare model:',key,error));
  void prepareCharacterModels(otherCharacters);
 }catch(error){console.error(error);$('load-status').hidden=false;$('load-status').textContent=tr('场景加载失败，请重新加载。');$('start').disabled=false;$('start').textContent=tr('重新加载');$('start').onclick=()=>location.reload();}
}
boot();
