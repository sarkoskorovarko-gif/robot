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
try{Object.assign(CFG,JSON.parse(localStorage.getItem('robotFetchCfg')||'{}'))}catch(e){}
const saveCfg=()=>{try{localStorage.setItem('robotFetchCfg',JSON.stringify(CFG))}catch(e){}};
// Настройка: положи предмет прямо перед раскрытой клешнёй и скажи «запомни расстояние».
async function calibrate(item='мячик'){
 const o=await vision.find(norm(item));
 if(!o){window.say&&say('Не вижу предмет, поставь его передо мной.','sad');return null}
 // низ предмета в кадре зависит только от расстояния по полу → общий для всех предметов;
 // размер — свой у каждого предмета
 const it=norm(item);CFG.items=CFG.items||{};CFG.items[it]=+(o.w*.95).toFixed(2);
 CFG.grabBottom=+Math.min(.98,o.y+o.h-.03).toFixed(2);saveCfg();
 window.say&&say('Запомнил! Отсюда буду хватать.','happy');return {...CFG}}
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
   const sz=CFG.items&&CFG.items[item];
   if((sz&&o.w>=sz)||o.y+o.h>=CFG.grabBottom)break;
   r.drive(1,1,o.w>.2?200:380);await wait(o.w>.2?350:550);
  }
  if(!running)return;
  // 2. взять
  r.face('think');
  r.claw('open',800);await wait(900);
  r.arm('down',CFG.armDownMs);await wait(CFG.armDownMs+150);
  r.drive(.6,.6,CFG.nudgeMs);await wait(CFG.nudgeMs+150);
  r.claw('close',1200);await wait(1300);
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
// «Найди мяч»: покрутиться, найти глазами, повернуться к нему (без захвата)
async function look(item){
 if(running)return;item=norm(item);
 if(!window.vision||!vision.enabled){window.say&&say('Включи мне камеру, и я поищу!','sad');return}
 running=true;window.robotTask='look';
 try{
  await sayW(`Ищу ${item}!`,'think');
  const canMove=r&&r.ch&&localStorage.getItem('robot.autonomy.enabled')==='1';
  let o=canMove?await findItem(item,12):await vision.find(item);
  if(!o){await sayW(`Не вижу ${item}. Может, он спрятался?`,'sad');return}
  if(canMove)for(let i=0;i<6&&running&&Math.abs(o.x)>CFG.centerTol;i++){turnTo(o.x);await wait(450);o=await vision.find(item)||o}
  r.face('surprise',700);
  await sayW(`Нашёл ${item}! ${o.x<-.25?'Вон там, слева!':o.x>.25?'Вон там, справа!':'Вот он, прямо передо мной!'}`,'happy');
 }finally{r&&r.stop();running=false;window.robotTask=null}
}
window.robotFetch={go,look,calibrate,stop(){running=false;r&&r.stop()},CFG,norm,save:saveCfg,reset(){localStorage.removeItem('robotFetchCfg')}};
// ладонь = стоп и для этого задания
window.addEventListener('robot-gesture',e=>{if(e.detail?.name==='Open_Palm'&&running){running=false;r.stop()}});
})();
