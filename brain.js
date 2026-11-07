(() => {
  'use strict';
  const r = window.robot;
  if (!r) return;
  const toggle = document.getElementById('brainToggle');
  const stateText = document.getElementById('brainState');
  const KEY = 'robot.autonomy.enabled';
  let enabled = localStorage.getItem(KEY) === '1';
  let state = 'idle', timer = null, moveTimer = null, actionUntil = 0;
  let lastSeen = 0, idleSince = performance.now(), nextLook = performance.now() + rand(6000, 15000);
  let lastGreeting = 0, lastPlay = 0, searchSteps = 0, busy = false, pauseUntil = 0;
  let lastSeenFlag = false, asleep = false;
  const greetings = ['Привет, друг!', 'Я тебя вижу!', 'Ура, ты пришёл!'];
  function rand(a,b){ return a + Math.random()*(b-a); }
  function setState(s){ state=s; stateText.textContent=s; }
  function cancelMove(){ clearTimeout(moveTimer); moveTimer=null; }
  function stop(){ cancelMove(); actionUntil=0; try { r.stop(); } catch(e) {} }
  function drive(left,right,ms){
    stop(); if(!enabled || document.hidden || !r.ch) return;
    ms=Math.max(0,Math.min(1500,ms|0));
    const cap=Math.min(1, Math.max(0,+r.speed/127));
    r.m.fill(128);
    r.m[r.LEFT]=Math.max(1,Math.min(255,Math.round(128+left*cap*127*r.LEFT_FWD)));
    r.m[r.RIGHT]=Math.max(1,Math.min(255,Math.round(128+right*cap*127*r.RIGHT_FWD)));
    r.run(); actionUntil=performance.now()+ms;
    moveTimer=setTimeout(stop,ms);
  }
  function limb(index,dir,ms){
    stop(); if(!enabled || document.hidden || !r.ch) return;
    // мощность: клешня и рука сильнее (было 35 и 70 — не хватало)
    const pw=JSON.parse(localStorage.getItem('robotLimbPower')||'{"claw":127,"arm":127}');
    r.m.fill(128); r.m[index]=Math.round(128+dir*(index===r.CLAW?pw.claw:pw.arm));
    r.run(); moveTimer=setTimeout(stop,Math.max(1,Math.min(index===r.CLAW?1400:2000,ms)));
  }
  function claw(which,ms=650){ limb(r.CLAW,which==='open'?1:-1,ms); }
  function arm(which,ms=600){ limb(r.ARM,which==='up'?1:-1,Math.min(2000,ms)); }
  r.drive=drive; r.claw=claw; r.arm=arm;
  window.addEventListener('robot-gesture',e=>{
    const name=e.detail?.name;
    if(name==='Open_Palm'){stop();r.face('surprise');pauseUntil=performance.now()+5000;return;}
    if(!enabled)return;
    if(name==='Thumb_Up'){r.face('happy',1200);window.dispatchEvent(new CustomEvent('robot-action',{detail:'nod'}));}
    else if(name==='Victory')dance();
    else if(name==='Pointing_Up')arm('up',700);
    else if(name==='Closed_Fist')claw('close');
    else if(name==='Thumb_Down')r.face('sad',1200);
    else if(name==='ILoveYou')r.face('love',1400);
  });
  async function dance(){
    if(busy || !enabled || !r.ch) return;
    busy=true; setState('play'); r.face('happy');
    const end=performance.now()+rand(4000,6000);
    try {
      while(performance.now()<end && enabled && !document.hidden && r.ch){
        drive(1,-1,240); await wait(350); if(!enabled||document.hidden)break;
        drive(-1,1,240); await wait(350); if(!enabled||document.hidden)break;
        claw('open'); await wait(420); claw('close'); await wait(420);
        arm('up',450); await wait(470); arm('down',450); await wait(470);
      }
    } finally { stop(); busy=false; lastPlay=performance.now(); }
  }
  function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
  function setEnabled(v){
    enabled=!!v; localStorage.setItem(KEY,enabled?'1':'0');
    toggle.textContent='Автономия: '+(enabled?'вкл':'выкл');
    if(!enabled){stop();busy=false;setState('idle');}
    else {idleSince=performance.now();nextLook=idleSince+rand(6000,15000);}
  }
  toggle.addEventListener('click',()=>setEnabled(!enabled));
  setEnabled(enabled);
  document.addEventListener('visibilitychange',()=>{ if(document.hidden){stop();} else if(enabled) idleSince=performance.now(); });
  window.addEventListener('error',()=>stop());
  window.addEventListener('unhandledrejection',()=>stop());
  function tick(){
    if(window.robotTask) return; // идёт задание (принеси/учёба) — поведение молчит
    if(!enabled || document.hidden || busy){ if(document.hidden)stop(); return; }
    try {
      const now=performance.now(), info=window.faceInfo||{seen:false};
      if(now<pauseUntil)return;
      if(info.seen){lastSeen=now; asleep=false; idleSince=now;}
      const seen=!!info.seen, appeared=seen&&!lastSeenFlag; lastSeenFlag=seen;
      if(appeared){
        stop(); idleSince=now; r.face('surprise',600); setTimeout(()=>{if(enabled)r.face('happy');},600);
        if(now-lastGreeting>60000){r.say(greetings[Math.floor(Math.random()*greetings.length)],'happy');lastGreeting=now;}
        searchSteps=0;setState('noticed');return;
      }
      if(seen){
        if(state==='search'||state==='idle'||state==='sleep') setState('track');
        const centered=Math.abs(info.x||0)<=0.25;
        if((info.size||0)>0.30){stop();r.face('happy');setState('approach');return;}
        if(now-lastPlay>45000 && (info.size||0)>=0.18 && Math.random()<0.015){dance();return;}
        if(!centered){setState('track');const d=rand(150,250);drive(info.x>0?1:-1,info.x>0?-1:1,d);pauseUntil=now+d+300;return;}
        if((info.size||0)<0.18){setState('approach');drive(1,1,400);pauseUntil=now+850;return;}
        stop();setState('approach');return;
      }
      if(lastSeen && now-lastSeen>2000 && state!=='search'){stop();setState('search');searchSteps=0;}
      if(state==='search'){
        if(searchSteps>=8){setState('idle');idleSince=now;return;}
        if(now>=actionUntil+400){drive(0.35,-0.35,300);searchSteps++;}
        return;
      }
      if(state==='sleep'||now-idleSince>180000){stop();r.face('sleep');setState('sleep');asleep=true;return;}
      setState('idle');
      if(now>=nextLook){r.face('sad',700);const d=Math.random()<.5?-.3:.3;drive(d,-d,rand(300,600));nextLook=now+rand(6000,15000);}
    } catch(e){stop();setState('ошибка');}
  }
  // действия, которые выбрала «думалка» (chat.js)
  window.addEventListener('robot-action',async e=>{
    if(!enabled||busy) return; const a=e.detail;
    if(a==='dance') return dance();
    busy=true; try{
      if(a==='come'){ drive(1,1,700); await wait(800); }
      else if(a==='back'){ drive(-1,-1,500); await wait(600); }
      else if(a==='spin'){ drive(1,-1,1200); await wait(1300); }
      else if(a==='wave'){ arm('up',500); await wait(550); claw('open'); await wait(400); claw('close'); await wait(400); arm('down',500); await wait(550); }
      else if(a==='nod'){ arm('up',300); await wait(350); arm('down',300); await wait(350); }
      else if(a==='sleep'){ r.face('sleep'); setState('sleep'); asleep=true; }
    } finally { stop(); busy=false; }
  });
  timer=setInterval(tick,200);
  document.addEventListener('pointerdown',()=>{if(asleep){asleep=false;idleSince=performance.now();setState('idle');r.face('happy',700);}},true);
})();
