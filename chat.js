// Разговор: уши → Claude Haiku (+ глаза, память, контекст) → голос + эмоция + действие.
// Ключ API вводит взрослый в служебном пульте; хранится только на этом телефоне (localStorage).
(function(){
const MODEL='claude-haiku-5-5';
const KEY='robotApiKey',MEM='robotMemory';
const RULES=`Ты — робот-друг для ребёнка 5 лет. Живёшь дома, ездишь на гусеницах, у тебя клешня (умеет хватать) и рука (вверх-вниз), лицо на экране телефона, камера-глаза.
Говори по-русски, коротко (1–2 простых предложения), тепло, весело, с любопытством. Задавай встречные вопросы, предлагай играть: загадки, «угадай животное», считалки, «повтори движение», короткие сказки (до 5 предложений).
Если ребёнок что-то показывает или спрашивает «что это/какого цвета/сколько» и есть картинка с камеры — смотри на неё и отвечай по ней. Нет картинки — честно скажи, что не видишь, и попроси показать ближе.
Учись: если узнал важное и надолго (имя ребёнка, возраст, любимая игрушка/цвет/еда/мультик, имена родных и питомцев, чего боится) — верни это в поле "remember" одной короткой фразой. Не запоминай мелочи.
Безопасность: никаких страшных, опасных, взрослых тем; про огонь, розетки, лекарства, улицу, незнакомцев — мягко предложи спросить маму или папу. Ты робот, не человек; не обещай того, чего не можешь.
ГЛАВНОЕ: отвечай на ПОСЛЕДНЮЮ фразу ребёнка. Если он просит другое (найти, поиграть, спросил новое) — сразу бросай начатую историю и делай то, что просит. Историю продолжай, только если он сам просит «дальше/ещё». Если есть пометка [камера: …] — отвечай по ней.
action — только если ребёнок прямо просит двигаться (подъедь, потанцуй, помаши, покрутись); иначе "none". mood — по смыслу ответа, спокойно.
Отвечай ТОЛЬКО JSON: {"say":"фраза","mood":"normal|happy|sad|surprise|angry|sly|think|love|sleep","action":"none|come|dance|wave|nod|spin|back|sleep","remember":""}`;
let hist=[],busy=false,rec=null,listening=false;
const get=(k,d='')=>{try{return localStorage.getItem(k)??d}catch(e){return d}};
const memory=()=>{try{return JSON.parse(get(MEM,'[]'))}catch(e){return []}};
function remember(f){f=(f||'').trim();if(!f)return;const m=memory();if(m.some(x=>x.toLowerCase()===f.toLowerCase()))return;m.push(f);try{localStorage.setItem(MEM,JSON.stringify(m.slice(-40)))}catch(e){}}

function context(){
 const d=new Date(),h=d.getHours();
 const part=h<6?'ночь':h<12?'утро':h<17?'день':h<21?'вечер':'поздний вечер, пора спать';
 const fi=window.faceInfo||{};
 const mem=memory();
 return `${RULES}
Сейчас: ${d.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})}, ${String(h).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} (${part}).
Камера: ${fi.seen?(fi.size>.3?'ребёнок совсем рядом':'вижу лицо ребёнка'):'лица не вижу'}.
Что я помню о семье: ${mem.length?mem.join('; '):'пока ничего'}.`;
}

// кадр с камеры (если она включена) — маленький JPEG для «глаз» модели
function snapshot(){
 const v=[...document.querySelectorAll('video')].find(v=>v.videoWidth>0&&!v.paused);if(!v)return null;
 const c=document.createElement('canvas');c.width=320;c.height=Math.round(320*v.videoHeight/v.videoWidth);
 const g=c.getContext('2d');g.translate(c.width,0);g.scale(-1,1);g.drawImage(v,0,0,c.width,c.height); // зеркально, как видит ребёнок
 return c.toDataURL('image/jpeg',.7);
}
const LOOK=/(смотри|посмотри|что это|что у меня|какого цвета|какой цвет|сколько|угадай что|кто это|что я держу)/i;

async function ask(text){
 if(window.robotVoice&&/(смени|поменяй|другой)\s+голос/i.test(text)){robotVoice.next();return}
 if(window.robotFetch){ // «принеси мячик», «отвези маме мишку»
  if(/запомни расстояние/i.test(text)){const m=text.match(/расстояние\s+(?:до\s+)?([а-яё]+)/i);robotFetch.calibrate(m?m[1]:'мячик');return}
  const lk=text.match(/(?:найди|поищи|поищем|ищи|где)\s+(?:мой\s+|моя\s+|мою\s+)?([а-яё]+)/i);
  if(lk&&!/(принеси|отвези|подай|привези)/i.test(text)){robotFetch.look(lk[1]);return}
  const f=text.match(/(?:принеси|отвези|подай|привези|дай)\s+(?:(?:мне|маме|папе|ему|ей)\s+)?([а-яё]+)/i);
  if(f){robotFetch.go(f[1]);return}
  if(/^(стоп|хватит|стой)/i.test(text.trim()))robotFetch.stop();
 }
 if(window.robotLearn){ // голосовой запуск учёбы
  const m=/(почитаем|читать|учиться|учить|урок)/i.test(text)?'auto':/(считать|посчита|счёт|счет)/i.test(text)?'count':/цвет/i.test(text)&&/(игра|угад|учить)/i.test(text)?'colors':null;
  if(m){robotLearn.lesson(m);return}
 }
 const key=get(KEY);
 let cameraNote='';
 if(window.vision){
  if(/что ты видишь|что видишь|что вокруг/i.test(text)){
   const items=await window.vision.lookAround();cameraNote=items.length?' [камера: вижу '+items.slice(0,5).map(o=>o.ru||o.name).join(', ')+']':' [камера: пока ничего не распознала]';
  }else if(/найди|где|принеси|покажи где/i.test(text)){
   const classes=['sports ball','teddy bear','cup','bottle','book','chair','couch','bed','cat','dog','cell phone','apple','banana','orange','car','scissors','umbrella','backpack','clock','vase','potted plant','remote','laptop','bowl','toy'];
   const aliases={'sports ball':['мячик','мяч'],'teddy bear':['мишка','медведь'],'cup':['кружка'],'bottle':['бутылка'],'book':['книга'],'chair':['стул'],'couch':['диван'],'bed':['кровать'],'cat':['кот','кошка'],'dog':['собака','пёс'],'cell phone':['телефон'],'apple':['яблоко'],'banana':['банан'],'orange':['апельсин'],'car':['машинка','машина'],'scissors':['ножницы'],'umbrella':['зонт'],'backpack':['рюкзак'],'clock':['часы'],'vase':['ваза'],'potted plant':['растение','цветок'],'remote':['пульт'],'laptop':['ноутбук'],'bowl':['миска']};
   let wanted=null;for(const en of classes){const words=[en,...(aliases[en]||[])];if(words.some(w=>new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i').test(text))){wanted=(aliases[en]||[])[0]||en;break}}
   if(wanted){const o=await window.vision.find(wanted);cameraNote=o?' [камера: вижу '+o.ru+' '+(o.x<-.2?'слева':o.x>.2?'справа':'по центру')+']':' [камера: не нашёл]'}
  }
 }
 text+=cameraNote;
 if(!key){window.say&&say(cameraNote?'Я посмотрела камерой!':'Меня ещё не подключили к думалке.','sad');return}
 window.face&&face('think');
 const img=LOOK.test(text)?snapshot():null;
 hist.push({role:'user',content:text}); hist=hist.slice(-12);
 let raw;
 if(key.startsWith('sk-or-')){ // OpenRouter (формат OpenAI)
  const msgs=hist.map((m,i)=>i===hist.length-1&&img?{role:'user',content:[{type:'text',text:m.content},{type:'image_url',image_url:{url:img}}]}:m);
  const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{
    'content-type':'application/json','authorization':'Bearer '+key,'X-Title':'Robot'},
   body:JSON.stringify({model:'anthropic/claude-haiku-5.5',max_tokens:300,messages:[{role:'system',content:context()},...msgs]})});
  if(!r.ok){const t=await r.text();throw new Error(r.status+' '+t.slice(0,120))}
  const j=await r.json(); raw=j.choices?.[0]?.message?.content||'';
 } else { // напрямую Anthropic
  const msgs=hist.map((m,i)=>i===hist.length-1&&img?{role:'user',content:[{type:'image',source:{type:'base64',media_type:'image/jpeg',data:img.split(',')[1]}},{type:'text',text:m.content}]}:m);
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{
    'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
   body:JSON.stringify({model:MODEL,max_tokens:300,system:context(),messages:msgs})});
  if(!r.ok){const t=await r.text();throw new Error(r.status+' '+t.slice(0,120))}
  const j=await r.json(); raw=(j.content||[]).map(c=>c.text||'').join('');
 }
 let o; try{o=JSON.parse(raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1))}catch(e){o={say:raw,mood:'happy',action:'none'}}
 hist.push({role:'assistant',content:o.say||raw});
 remember(o.remember);
 window.dispatchEvent(new CustomEvent('robot-action',{detail:o.action||'none'}));
 if(window.say) say(o.say||'Хм!',o.mood||'happy'); else window.face&&face(o.mood||'happy',2000);
 return o;
}

const talking=()=>(typeof speaking!=='undefined'&&speaking)||speechSynthesis.speaking; // speaking — общая переменная из face.html
function relisten(){ if(!window.robotChat.auto) return; if(talking()||busy) return setTimeout(relisten,500); listen() }
function listen(){
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR) return false;
 if(listening) return true;
 rec=new SR(); rec.lang='ru-RU'; rec.interimResults=false; rec.continuous=false;
 rec.onresult=async e=>{const a=e.results[0][0],t=a.transcript.trim(); if(!t||busy||talking()) return;
  if(a.confidence>0&&a.confidence<.5) return;                              // неразборчиво/шум
  if(typeof lastBoundary!=='undefined'&&performance.now()-lastBoundary<1500) return; // эхо своего голоса busy=true;
  try{await ask(t)}catch(err){console.warn(err);window.say&&say('Ой, я задумался и запутался.','sad')} finally{busy=false}};
 rec.onend=()=>{listening=false; setTimeout(relisten,400)};
 rec.onerror=()=>{listening=false};
 try{rec.start(); listening=true}catch(e){listening=false}
 return true;
}

window.robotChat={ask,listen,auto:false,memory,
 forget(){try{localStorage.removeItem(MEM)}catch(e){}},
 setKey(k){try{localStorage.setItem(KEY,k.trim())}catch(e){}},
 hasKey(){return !!get(KEY)},
 stop(){this.auto=false;try{rec&&rec.abort()}catch(e){}}
};
})();
