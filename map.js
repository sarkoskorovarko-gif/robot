// Карта квартиры прямо в приложении: задняя камера (ARCore/WebXR) + пульт поверх.
// Кнопка «Карта» в служебной панели. Связь с роботом — та же, что у лица (window.robot).
(function(){
const r=window.robot;
const css=`#mapov{position:fixed;inset:0;z-index:20;display:none;background:#0b1620;color:#eee;font-family:sans-serif}
#mapov.on{display:flex}#mapov canvas{flex:1;min-width:0;width:0;height:100%;touch-action:none}
#mapside{width:210px;padding:8px;display:flex;flex-direction:column;gap:6px;background:#1b1b1b}
#mapside button{font-size:15px;padding:9px;border:0;border-radius:10px;background:#ff7a00;color:#fff;touch-action:none}
#mapside button.s{background:#555}#mapside .pad{display:grid;grid-template-columns:repeat(3,56px);gap:4px;justify-content:center}
#mapside .pad button{height:52px;font-size:22px;background:#2b6cb0}#mapinfo{font-size:12px;line-height:1.35;white-space:pre}`;
document.head.insertAdjacentHTML('beforeend','<style>'+css+'</style>');
document.body.insertAdjacentHTML('beforeend',`<div id="mapov"><canvas id="mapcv"></canvas><div id="mapside">
<button id="mapar">Старт (камера сзади)</button>
<div class="pad"><span></span><button data-md="f">▲</button><span></span><button data-md="l">◀</button><button data-md="b">▼</button><button data-md="r">▶</button></div>
<button class="s" id="mapclr">Очистить карту</button><button class="s" id="mapsave">Сохранить файл</button><button class="s" id="mapclose">Закрыть карту</button>
<div id="mapinfo">нажмите «Старт»</div></div></div>`);
const ov=document.getElementById('mapov'),info=document.getElementById('mapinfo'),arBtn=document.getElementById('mapar');
['pointerdown','pointerup','click'].forEach(ev=>ov.addEventListener(ev,e=>e.stopPropagation())); // не будить пульт лица

// --- езда с пульта: через связь лица ---
const DR={f:[1,1],b:[-1,-1],l:[-1,1],r:[1,-1]};
ov.querySelectorAll('[data-md]').forEach(b=>{
 b.onpointerdown=e=>{e.preventDefault();if(!r||!r.ch){info.textContent='Робот не подключён:\nподключите в пульте лица';return}
  const[l,rr]=DR[b.dataset.md],v=Math.min(70,r.speed);r.m.fill(128);r.m[r.LEFT]=128+r.LEFT_FWD*l*v;r.m[r.RIGHT]=128+r.RIGHT_FWD*rr*v;r.run()};
 b.onpointerup=b.onpointerleave=b.onpointercancel=()=>r&&r.stop()});

// --- карта: сетка 5 см ---
const CELL=.05,grid=new Map();let path=[],pose=null,heading=0;
const cell=(x,z)=>{const k=Math.round(x/CELL)+','+Math.round(z/CELL);let c=grid.get(k);if(!c){c={f:0,o:0};grid.set(k,c)}return c};
function load(){try{const s=JSON.parse(localStorage.getItem('robotMap')||'null');if(s){path=s.path||[];for(const[k,v]of s.grid||[])grid.set(k,v)}}catch(e){}}
function persist(){try{localStorage.setItem('robotMap',JSON.stringify({path:path.slice(-5000),grid:[...grid]}))}catch(e){}}
load();
document.getElementById('mapclr').onclick=()=>{grid.clear();path=[];persist();draw()};
document.getElementById('mapsave').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([localStorage.getItem('robotMap')||'{}'],{type:'application/json'}));a.download='robot-map.json';a.click()};
const cv=document.getElementById('mapcv'),g=cv.getContext('2d'),view={s:120,cx:0,cz:0};
function draw(){
 const W=cv.width=cv.clientWidth,H=cv.height=cv.clientHeight;if(!W)return;g.fillStyle='#0b1620';g.fillRect(0,0,W,H);
 if(pose){view.cx+=(pose.x-view.cx)*.1;view.cz+=(pose.z-view.cz)*.1}
 const X=x=>W/2+(x-view.cx)*view.s,Z=z=>H/2+(z-view.cz)*view.s,cs=CELL*view.s+1;
 g.strokeStyle='#18303f';g.lineWidth=1;for(let i=-20;i<=20;i++){const a=X(Math.round(view.cx)+i),b=Z(Math.round(view.cz)+i);g.beginPath();g.moveTo(a,0);g.lineTo(a,H);g.moveTo(0,b);g.lineTo(W,b);g.stroke()}
 for(const[k,c]of grid){const[i,j]=k.split(',').map(Number),px=X(i*CELL)-cs/2,pz=Z(j*CELL)-cs/2;
  if(c.o>2){g.fillStyle='#e05050';g.fillRect(px,pz,cs,cs)}else if(c.f>0){g.fillStyle='#2a5d4a';g.fillRect(px,pz,cs,cs)}}
 g.strokeStyle='#4fd1ff';g.lineWidth=3;g.beginPath();path.forEach(([x,z],i)=>i?g.lineTo(X(x),Z(z)):g.moveTo(X(x),Z(z)));g.stroke();
 if(pose){g.save();g.translate(X(pose.x),Z(pose.z));g.rotate(-heading);g.fillStyle='#ff7a00';g.beginPath();g.moveTo(0,-14);g.lineTo(9,10);g.lineTo(-9,10);g.fill();g.restore()}
 g.fillStyle='#8aa';g.font='12px sans-serif';g.fillText('клетка = 1 м · зелёное — пол · красное — препятствие',8,H-8)}
let pinch=null;cv.addEventListener('touchmove',e=>{if(e.touches.length===2){const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);if(pinch)view.s=Math.max(20,Math.min(600,view.s*d/pinch));pinch=d}},{passive:true});
cv.addEventListener('touchend',()=>pinch=null);

// --- WebXR ---
let session=null,refSpace=null,hitSrc=null,lastPathAt=0,lastSave=0,depthOk=false;
arBtn.onclick=async()=>{
 if(session){session.end();return}
 if(!navigator.xr||!await navigator.xr.isSessionSupported('immersive-ar')){info.textContent='AR не поддерживается.\nНужны «Сервисы Google Play\nдля AR» (Play Маркет)';return}
 try{session=await navigator.xr.requestSession('immersive-ar',{requiredFeatures:['local-floor'],optionalFeatures:['dom-overlay','hit-test','depth-sensing'],
  domOverlay:{root:ov},depthSensing:{usagePreference:['cpu-optimized'],dataFormatPreference:['luminance-alpha','float32']}})}
 catch(e){info.textContent='Не запустилось:\n'+e.message;session=null;return}
 const gl=document.createElement('canvas').getContext('webgl',{xrCompatible:true});
 session.updateRenderState({baseLayer:new XRWebGLLayer(session,gl)});
 refSpace=await session.requestReferenceSpace('local-floor');
 try{hitSrc=await session.requestHitTestSource({space:await session.requestReferenceSpace('viewer')})}catch(e){}
 depthOk=!!session.depthUsage;arBtn.textContent='Стоп';window.robotTask='map';
 session.addEventListener('end',()=>{session=null;arBtn.textContent='Старт (камера сзади)';window.robotTask=null;r&&r.stop();persist()});
 session.requestAnimationFrame(onXR)};
function onXR(t,frame){
 const s=frame.session;s.requestAnimationFrame(onXR);
 const gl=s.renderState.baseLayer.context;gl.bindFramebuffer(gl.FRAMEBUFFER,s.renderState.baseLayer.framebuffer);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
 const vp=frame.getViewerPose(refSpace);
 if(!vp){info.textContent='ищу опору…\nмедленно поверните робота\n(нужны предметы в кадре)';return}
 const p=vp.transform.position,o=vp.transform.orientation;
 const fx=-2*(o.x*o.z+o.w*o.y),fz=-(1-2*(o.x*o.x+o.y*o.y));heading=Math.atan2(fx,-fz);pose={x:p.x,z:p.z};
 if(t-lastPathAt>150){const l=path[path.length-1];if(!l||Math.hypot(l[0]-p.x,l[1]-p.z)>.03)path.push([p.x,p.z]);lastPathAt=t;cell(p.x,p.z).f++}
 if(hitSrc){const h=frame.getHitTestResults(hitSrc)[0];if(h){const hp=h.getPose(refSpace).transform.position;if(Math.abs(hp.y)<.15)cell(hp.x,hp.z).f++}}
 if(depthOk){let d=null;try{d=frame.getDepthInformation(vp.views[0])}catch(e){}
  if(d)for(let u=.1;u<=.9;u+=.1){const dist=d.getDepthInMeters(u,.5);if(dist>.15&&dist<1.5){const a=(u-.5);
   cell(p.x+(fx*Math.cos(a)-fz*Math.sin(a))*dist,p.z+(fz*Math.cos(a)+fx*Math.sin(a))*dist).o++}}}
 if(t-lastSave>3000){persist();lastSave=t}
 draw();info.textContent=`позиция: ${p.x.toFixed(2)}, ${p.z.toFixed(2)} м\nкурс: ${(heading*180/Math.PI).toFixed(0)}°\nпуть: ${path.length} точек\nглубина: ${depthOk?'есть':'нет'}`}

function open(){ov.classList.add('on');document.getElementById('ui')?.classList.remove('on');draw()}
function close(){if(session)session.end();ov.classList.remove('on');r&&r.stop()}
document.getElementById('mapclose').onclick=close;
const bs=document.getElementById('brainStatus');if(bs){const b=document.createElement('button');b.type='button';b.textContent='Карта';b.onclick=e=>{e.stopPropagation();open()};bs.appendChild(b)}
window.robotMap={open,close,get data(){return {path,grid}}};
})();
