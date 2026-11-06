// Разговор: уши (распознавание речи) → Claude Haiku → голос + эмоция + действие.
// Ключ API вводит взрослый в служебном пульте; хранится только на этом телефоне (localStorage).
(function(){
const MODEL='claude-haiku-5-5';
const SYSTEM=`Ты — робот-друг для ребёнка 5 лет. Живёшь дома, ездишь на гусеницах, у тебя клешня и рука, лицо на экране телефона.
Говори по-русски, очень коротко (1–2 простых предложения), тепло, весело, с любопытством. Задавай встречные вопросы.
Никаких страшных, опасных, взрослых тем, никаких советов про огонь, розетки, лекарства, улицу, незнакомцев — мягко предложи спросить маму или папу.
Не притворяйся человеком; ты робот. Не обещай того, чего не можешь.
Отвечай ТОЛЬКО JSON без пояснений: {"say":"фраза","mood":"normal|happy|sad|surprise|angry|sly|think|love|sleep","action":"none|come|dance|wave|nod|spin|back|sleep"}`;
const KEY='robotApiKey';
let hist=[],busy=false,rec=null,listening=false;
const getKey=()=>{try{return localStorage.getItem(KEY)||''}catch(e){return ''}};

async function ask(text){
 const key=getKey(); if(!key){window.say&&say('Меня ещё не подключили к думалке.','sad');return}
 hist.push({role:'user',content:text}); hist=hist.slice(-12);
 window.face&&face('think');
 let raw;
 if(key.startsWith('sk-or-')){ // OpenRouter (формат OpenAI)
  const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{
    'content-type':'application/json','authorization':'Bearer '+key,'X-Title':'Robot'},
   body:JSON.stringify({model:'anthropic/claude-haiku-5.5',max_tokens:200,messages:[{role:'system',content:SYSTEM},...hist]})});
  if(!r.ok){const t=await r.text();throw new Error(r.status+' '+t.slice(0,120))}
  const j=await r.json(); raw=j.choices?.[0]?.message?.content||'';
 } else { // напрямую Anthropic
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{
    'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
   body:JSON.stringify({model:MODEL,max_tokens:200,system:SYSTEM,messages:hist})});
  if(!r.ok){const t=await r.text();throw new Error(r.status+' '+t.slice(0,120))}
  const j=await r.json(); raw=(j.content||[]).map(c=>c.text||'').join('');
 }
 hist.push({role:'assistant',content:raw});
 let o; try{o=JSON.parse(raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1))}catch(e){o={say:raw,mood:'happy',action:'none'}}
 window.dispatchEvent(new CustomEvent('robot-action',{detail:o.action||'none'}));
 if(window.say) say(o.say||'Хм!',o.mood||'happy'); else window.face&&face(o.mood||'happy',2000);
 return o;
}

function listen(){
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR) return false;
 if(listening) return true;
 rec=new SR(); rec.lang='ru-RU'; rec.interimResults=false; rec.continuous=false;
 rec.onresult=async e=>{const t=e.results[0][0].transcript.trim(); if(!t||busy) return; busy=true;
  try{await ask(t)}catch(err){console.warn(err);window.say&&say('Ой, я задумался и запутался.','sad')} finally{busy=false}};
 rec.onend=()=>{listening=false; if(window.robotChat.auto && !speechSynthesis.speaking) setTimeout(listen,400); else if(window.robotChat.auto) setTimeout(listen,1200)};
 rec.onerror=()=>{listening=false};
 try{rec.start(); listening=true; window.face&&face('surprise',400)}catch(e){listening=false}
 return true;
}

window.robotChat={ask,listen,auto:false,
 setKey(k){try{localStorage.setItem(KEY,k.trim())}catch(e){}},
 hasKey(){return !!getKey()},
 stop(){this.auto=false;try{rec&&rec.abort()}catch(e){}}
};
})();
