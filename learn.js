// Учёба-игра: буквы → слоги → слова (чтение), счёт, цвета.
// Робот показывает задание крупно на экране, говорит, слушает ответ, хвалит, подсказывает.
// Прогресс хранится в телефоне и сам усложняет задания.
(function(){
const P='robotLearn';
const st=()=>{try{return JSON.parse(localStorage.getItem(P)||'{}')}catch(e){return {}}};
const save=s=>{try{localStorage.setItem(P,JSON.stringify(s))}catch(e){}};

// ---- программа чтения (порядок как в букварях: сначала гласные и «лёгкие» согласные) ----
const LETTERS='А О У Ы И Э М С Х Ш Л Н Р К П Т З Й Г В Д Б Ж Е Я Ю Ё Ь Ч Ф Ц Щ Ъ'.split(' ');
const VOW='АОУЫИЭЕЯЮЁ';
const SOUND={А:'а',О:'о',У:'у',Ы:'ы',И:'и',Э:'э',М:'мэ',С:'сэ',Х:'хэ',Ш:'шэ',Л:'лэ',Н:'нэ',Р:'рэ',К:'кэ',П:'пэ',Т:'тэ',З:'зэ',Й:'й',Г:'гэ',В:'вэ',Д:'дэ',Б:'бэ',Ж:'жэ',Е:'е',Я:'я',Ю:'ю',Ё:'ё',Ь:'мягкий знак',Ч:'чэ',Ф:'фэ',Ц:'цэ',Щ:'щэ',Ъ:'твёрдый знак'};
// уже читает короткие слова → начинаем с двух-трёхсложных, потом фразы
const WORDS=['РЫБА','ЛУНА','МУХА','КОЗА','ЛИСА','ЗИМА','РОБОТ','МАШИНА','СОБАКА','КОРОВА','ЛОПАТА','ПАНАМА','МОЛОКО','ГОЛОВА','БАНАНЫ','ЖИРАФ','ТИГР','СЛОН','СТОЛ','ВОЛК','ЗАЙКА','ПТИЦА','КОНФЕТА','РАКЕТА','ЧЕРЕПАХА','САМОЛЁТ','КУКУРУЗА','ВЕЛОСИПЕД'];
const PHRASES=['МАМА МЫЛА РАМУ','КОТ СПИТ','У ЛИСЫ ХВОСТ','РОБОТ ЕДЕТ','ЛУНА СВЕТИТ','ПАПА ДОМА','СОБАКА ЛАЕТ','МЫ ИГРАЕМ','ЗИМОЙ СНЕГ','РЫБА ПЛАВАЕТ'];
const COLORS=[['красный','#e53935'],['синий','#1e63d0'],['жёлтый','#fdd835'],['зелёный','#43a047'],['оранжевый','#fb8c00'],['фиолетовый','#8e24aa'],['белый','#ffffff'],['чёрный','#111111']];

function known(){const s=st();return s.letters||4} // сколько букв уже «открыто»
function task(subject){
 const s=st();
 if(subject==='letters'){const n=Math.min(LETTERS.length,known());const L=LETTERS[Math.floor(Math.random()*n)];
  return {show:L,ask:`Какая это буква?`,ok:[L.toLowerCase(),SOUND[L]],hint:`Это буква ${SOUND[L]}!`,type:'letters'}}
 if(subject==='syllables'){const n=Math.max(6,Math.min(LETTERS.length,known()));const cons=LETTERS.slice(0,n).filter(c=>!VOW.includes(c)&&!'ЬЪЙ'.includes(c));
  const c=cons[Math.floor(Math.random()*cons.length)]||'М',v='АОУЫИ'[Math.floor(Math.random()*5)],syl=c+v;
  return {show:syl,ask:'Прочитай слог!',ok:[syl.toLowerCase()],hint:`Читаем: ${syl.toLowerCase()}`,type:'syllables'}}
 if(subject==='words'){const lvl=s.words||0;const pool=WORDS.slice(0,Math.min(WORDS.length,6+lvl*2));const w=pool[Math.floor(Math.random()*pool.length)];
  return {show:w.split('').join(''),ask:'Прочитай слово!',ok:[w.toLowerCase()],hint:`Это слово ${w.toLowerCase()}!`,type:'words'}}
 if(subject==='phrases'){const p=PHRASES[Math.floor(Math.random()*PHRASES.length)];const last=p.split(' ').pop().toLowerCase();
  return {show:p,ask:'Прочитай, что тут написано!',ok:[last.slice(0,-1)],hint:`Тут написано: ${p.toLowerCase()}!`,type:'phrases'}}
 if(subject==='count'){const max=Math.min(10,3+(s.count||0));const n=1+Math.floor(Math.random()*max);
  return {show:'⭐'.repeat(n),ask:'Сколько звёздочек?',ok:[String(n),NUM[n]],hint:`Их ${NUM[n]}!`,type:'count'}}
 if(subject==='colors'){const [name,hex]=COLORS[Math.floor(Math.random()*COLORS.length)];
  return {show:'',bg:hex,ask:'Какой это цвет?',ok:[name,name.replace('ё','е')],hint:`Это ${name} цвет!`,type:'colors'}}
}
const NUM=['ноль','один','два','три','четыре','пять','шесть','семь','восемь','девять','десять'];

// ---- экран задания поверх лица ----
let box=null;
function show(t){
 if(!box){box=document.createElement('div');box.style.cssText='position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:4;pointer-events:none;font:900 34vh/1 system-ui,sans-serif;color:#fff;text-shadow:0 0 30px #4fd1ff;letter-spacing:.05em';document.body.appendChild(box)}
 box.style.background=t.bg?t.bg:'rgba(0,0,0,.82)';box.style.fontSize=t.type==='count'?'14vh':t.show.length>10?'11vh':t.show.length>6?'16vh':t.show.length>4?'22vh':'34vh';box.style.textAlign='center';box.style.padding='0 4vw';
 box.textContent=t.show;box.style.display='flex';
}
function hide(){if(box)box.style.display='none'}

// ---- слушать ответ ----
function hear(ms=7000){return new Promise(res=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return res('');
 const r=new SR();r.lang='ru-RU';r.maxAlternatives=5;let done=false;const fin=v=>{if(!done){done=true;try{r.abort()}catch(e){}res(v)}};
 r.onresult=e=>fin([...e.results[0]].map(a=>a.transcript.toLowerCase()).join(' | '));r.onerror=()=>fin('');r.onend=()=>fin('');
 try{r.start()}catch(e){fin('')}setTimeout(()=>fin(''),ms)})}
const waitSpeech=()=>new Promise(r=>{const f=()=>((typeof speaking!=='undefined'&&speaking)||speechSynthesis.speaking)?setTimeout(f,200):r();setTimeout(f,300)});
async function speak(t,m){window.say&&say(t,m);await waitSpeech()}

const PRAISE=['Молодец!','Ура, правильно!','Супер!','Ты умница!','Точно!'];
let running=false;
async function lesson(subject='auto',rounds=5){
 if(running)return;running=true;const chatWasOn=window.robotChat&&robotChat.auto;if(chatWasOn)robotChat.stop();
 const s=st();if(subject==='auto')subject=(s.words||0)<4?'words':'phrases';
 let good=0;
 try{
  await speak({letters:'Давай учить буквы!',syllables:'Давай читать слоги!',words:'Давай читать слова!',phrases:'Давай читать фразы!',count:'Давай считать!',colors:'Давай угадывать цвета!'}[subject]||'Играем!','happy');
  for(let i=0;i<rounds&&running;i++){
   const t=task(subject);show(t);await speak(t.ask,'think');
   let ans=await hear();let right=t.ok.some(o=>ans.includes(o));
   if(!right&&running){await speak('Попробуй ещё раз!','sly');ans=await hear();right=t.ok.some(o=>ans.includes(o))}
   if(right){good++;await speak(PRAISE[Math.floor(Math.random()*PRAISE.length)],'happy');window.dispatchEvent(new CustomEvent('robot-action',{detail:'nod'}))}
   else{await speak(t.hint,'love')}
  }
  // прогресс: хорошо справился — открываем новое
  const n=st();
  if(subject==='letters'&&good>=4)n.letters=Math.min(LETTERS.length,(n.letters||4)+2);
  if(subject==='syllables')n.syll=(n.syll||0)+good;
  if(subject==='words'&&good>=4)n.words=(n.words||0)+1;
  if(subject==='count'&&good>=4)n.count=(n.count||0)+1;
  n.last=new Date().toISOString().slice(0,10);n.total=(n.total||0)+good;save(n);
  hide();await speak(good>=4?`Ты отлично справился! ${good} из ${rounds}!`:`Хорошо позанимались! Завтра ещё поиграем.`,good>=4?'love':'happy');
  if(good>=4)window.dispatchEvent(new CustomEvent('robot-action',{detail:'dance'}));
 }finally{hide();running=false;if(chatWasOn){robotChat.auto=true;robotChat.listen()}}
}
window.robotLearn={lesson,stop(){running=false;hide()},progress:st,reset(){save({})}};
})();
