// «Принеси/отвези X»: найти предмет камерой → подъехать → взять клешнёй → найти человека → отдать.
// Числа ниже подбираются на месте (завтра на роботе).
(function(){
const CFG={
 centerTol:.18,     // насколько предмет может быть не по центру (-1..1)
 grabSize:.33,      // ширина предмета в кадре, когда пора хватать
 grabBottom:.9,     // или низ предмета почти у края кадра
 personSize:.28,    // лицо такого размера = человек рядом
 armDownMs:900, armUpMs:800, nudgeMs:350
};
const r=window.robot,wait=ms=>new Promise(x=>setTimeout(x,ms));
let running=false;
const sayW=async(t,m)=>{window.say&&say(t,m);await wait(300);while((typeof speaking!=='undefined'&&speaking)||speechSynthesis.speaking)await wait(200)};
function norm(w){w=(w||'').toLowerCase().replace(/[^а-яё a-z]/g,'').trim();
 const acc={мишку:'мишка',машинку:'машинка',кружку:'кружка',бутылку:'бутылка',книгу:'книга',кошку:'кошка',игрушку:'игрушка'};
 return acc[w]||(/[^аеиоуыэюя]у$/.test(w)?w.slice(0,-1)+'а':w)}
const turnTo=x=>r.drive(x>0?.45:-.45,x>0?-.45:.45,Math.min(260,120+Math.abs(x)*200));

async function findItem(item,tries=12){
 for(let i=0;i<tries&&running;i++){const o=await vision.find(item);if(o)return o;r.drive(.4,-.4,350);await wait(550)}
 return null}

async function go(item){
 if(running)return;
 if(!r||!r.ch){window.say&&say('Я не подключён к колёсикам.','sad');return}
 if(!window.vision||!vision.enabled){window.say&&say('Включи мне камеру, пожалуйста!','sad');return}
 if(localStorage.getItem('robot.autonomy.enabled')!=='1'){window.say&&say('Сначала включи мне автономию.','sad');return}
 running=true;window.robotTask='fetch';item=norm(item);
 try{
  await sayW(`Сейчас найду ${item}!`,'think');
  // 1. найти и подъехать
  let o=await findItem(item),lost=0;
  if(!o){await sayW(`Не вижу ${item}. Покажи, где он?`,'sad');return}
  r.face('surprise',600);
  for(let step=0;step<40&&running;step++){
   o=await vision.find(item);
   if(!o){if(++lost>3){o=await findItem(item,6);if(!o){await sayW('Ой, потерял!','sad');return}lost=0}continue}
   lost=0;
   if(Math.abs(o.x)>CFG.centerTol){turnTo(o.x);await wait(400);continue}
   if(o.w>=CFG.grabSize||o.y+o.h>=CFG.grabBottom)break;
   r.drive(1,1,o.w>.2?200:380);await wait(o.w>.2?350:550);
  }
  if(!running)return;
  // 2. взять
  r.face('think');
  r.claw('open');await wait(450);
  r.arm('down',CFG.armDownMs);await wait(CFG.armDownMs+150);
  r.drive(.6,.6,CFG.nudgeMs);await wait(CFG.nudgeMs+150);
  r.claw('close');await wait(750);r.claw('close');await wait(750);
  r.arm('up',CFG.armUpMs);await wait(CFG.armUpMs+150);
  await sayW('Взял! Везу!','happy');
  // 3. найти человека и подъехать
  let seenTry=0;
  for(let step=0;step<60&&running;step++){
   const f=window.faceInfo||{};
   if(!f.seen){if(++seenTry>16){await sayW('Где ты? Позови меня!','sad');return}r.drive(.4,-.4,350);await wait(600);continue}
   seenTry=0;
   if(Math.abs(f.x)>.2){turnTo(f.x);await wait(400);continue}
   if(f.size>=CFG.personSize)break;
   r.drive(1,1,400);await wait(600);
  }
  if(!running)return;
  // 4. отдать
  r.arm('down',CFG.armDownMs*.6);await wait(CFG.armDownMs*.6+150);
  r.claw('open');await wait(500);
  await sayW('Держи!','love');
  r.drive(-1,-1,400);await wait(550);r.claw('close');await wait(400);r.arm('up',500);
 }finally{r.stop();running=false;window.robotTask=null}
}
window.robotFetch={go,stop(){running=false;r&&r.stop()},CFG,norm};
// ладонь = стоп и для этого задания
window.addEventListener('robot-gesture',e=>{if(e.detail?.name==='Open_Palm'&&running){running=false;r.stop()}});
})();
