// Живой голос через ElevenLabs. Если ключа нет или нет интернета — остаётся встроенный голос.
// Рот двигается по громкости звука (переменные talk/speaking/lastBoundary/talkNoise из face.html).
(function(){
const KEY='robotElevenKey',VOICE='robotElevenVoice';
const get=k=>{try{return localStorage.getItem(k)||''}catch(e){return ''}};
const builtinSay=window.say;
let ctx=null,analyser=null,buf=null,cur=null;

function mouthLoop(){
 if(!cur||cur.paused||cur.ended){speaking=false;talk=0;return}
 analyser.getByteTimeDomainData(buf);let s=0;for(const v of buf){const d=(v-128)/128;s+=d*d}
 const amp=Math.min(1,Math.sqrt(s/buf.length)*4);
 if(amp>.08){lastBoundary=performance.now();talkNoise=amp}
 talk=Math.max(talk*.6,amp);requestAnimationFrame(mouthLoop);
}
async function voiceId(key){
 let v=get(VOICE);if(v)return v;
 const r=await fetch('https://api.elevenlabs.io/v1/voices',{headers:{'xi-api-key':key}});
 const j=await r.json();v=(j.voices||[])[0]?.voice_id;if(v)try{localStorage.setItem(VOICE,v)}catch(e){}
 return v;
}
// дневной лимит облачного голоса (секунд новой озвучки), повторы из памяти не считаются
const LIMIT_SEC=20*60;
function today(){return new Date().toISOString().slice(0,10)}
function usage(){try{const u=JSON.parse(localStorage.getItem('robotVoiceUse')||'{}');return u.d===today()?u:{d:today(),s:0}}catch(e){return{d:today(),s:0}}}
function addUsed(sec){const u=usage();u.s+=sec;try{localStorage.setItem('robotVoiceUse',JSON.stringify(u))}catch(e){}}
function overLimit(){return usage().s>=LIMIT_SEC}
async function elevenSay(text,mood='normal'){
 const key=get(KEY)||get('robotApiKey'); // нет отдельного ключа голоса → тот же ключ OpenRouter
 if(!key)return builtinSay(text,mood);
 face(mood,Math.max(1400,text.length*90));
 try{
  let url,fresh=false;
  const voiceName=get(VOICE)||'default',ck='https://robot.cache/tts/'+encodeURIComponent(voiceName+'|'+text.trim().toLowerCase());
  let cache=null;try{cache=await caches.open('robot-voice')}catch(e){}
  const hit=cache&&await cache.match(ck);
  if(hit){url=URL.createObjectURL(await hit.blob())}            // уже говорил эту фразу — бесплатно
  else if(overLimit()){return builtinSay(text,mood)}            // дневной лимит облачного голоса исчерпан
  else{fresh=true;
  if(key.startsWith('sk-or-')){ // OpenRouter: озвучка моделью gpt-audio-mini
   const voice=/^[a-z]+$/.test(get(VOICE))?get(VOICE):'coral'; // только имена голосов OpenAI
   const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',
    headers:{'content-type':'application/json','authorization':'Bearer '+key,'X-Title':'Robot'},
    body:JSON.stringify({model:'openai/gpt-audio-mini',modalities:['text','audio'],audio:{voice,format:'pcm16'},stream:true,
     messages:[{role:'system',content:'Ты голос весёлого доброго маленького робота-друга для ребёнка. Произнеси текст пользователя дословно по-русски, живо, тепло, с улыбкой. Ничего не добавляй.'},{role:'user',content:text}]})});
   if(!r.ok)throw new Error(r.status+' '+(await r.text()).slice(0,150));
   // поток SSE: кусочки PCM16 24 кГц в base64 → WAV
   const rd=r.body.getReader(),dec=new TextDecoder();let rest='',parts=[];
   for(;;){const{done,value}=await rd.read();if(done)break;rest+=dec.decode(value,{stream:true});
    const lines=rest.split('\n');rest=lines.pop();
    for(const l of lines){if(!l.startsWith('data: ')||l.includes('[DONE]'))continue;
     try{const d=JSON.parse(l.slice(6)).choices?.[0]?.delta?.audio?.data;if(d)parts.push(d)}catch(e){}}}
   const pcm=parts.map(b=>{const s=atob(b),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u});
   const len=pcm.reduce((a,u)=>a+u.length,0);if(!len)throw new Error('нет звука');
   const wav=new Uint8Array(44+len),dv=new DataView(wav.buffer);const W=(o,str)=>{for(let i=0;i<str.length;i++)wav[o+i]=str.charCodeAt(i)};
   W(0,'RIFF');dv.setUint32(4,36+len,true);W(8,'WAVEfmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);
   dv.setUint32(24,24000,true);dv.setUint32(28,48000,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);W(36,'data');dv.setUint32(40,len,true);
   let o=44;for(const u of pcm){wav.set(u,o);o+=u.length}
   url=URL.createObjectURL(new Blob([wav],{type:'audio/wav'}));
  } else if(key.startsWith('AIza')){ // Google Cloud Text-to-Speech
   const name=get(VOICE)||'ru-RU-Chirp3-HD-Leda';
   const r=await fetch('https://texttospeech.googleapis.com/v1/text:synthesize',{method:'POST',
    headers:{'content-type':'application/json','X-Goog-Api-Key':key},
    body:JSON.stringify({input:{text},voice:{languageCode:'ru-RU',name},audioConfig:{audioEncoding:'MP3',speakingRate:1.05}})});
   if(!r.ok)throw new Error(r.status+' '+(await r.text()).slice(0,150));
   const j=await r.json();const bin=atob(j.audioContent);const u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
   url=URL.createObjectURL(new Blob([u8],{type:'audio/mpeg'}));
  } else { // ElevenLabs
   const vid=await voiceId(key);
   const r=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}?optimize_streaming_latency=3&output_format=mp3_44100_64`,{
    method:'POST',headers:{'xi-api-key':key,'content-type':'application/json',accept:'audio/mpeg'},
    body:JSON.stringify({text,model_id:'eleven_flash_v2_5',voice_settings:{stability:.4,similarity_boost:.8,style:.5}})});
   if(!r.ok)throw new Error(r.status);
   url=URL.createObjectURL(await r.blob());
  }
  // запомнить фразу (короткие — до 120 символов, чтобы не забивать память длинными ответами)
  if(cache&&text.length<=120){try{await cache.put(ck,new Response(await (await fetch(url)).blob()))}catch(e){}}
  }
  if(cur){cur.pause();URL.revokeObjectURL(cur.src)}
  cur=new Audio(url);
  if(fresh)cur.addEventListener('loadedmetadata',()=>addUsed(cur.duration||text.length/12));
  if(!ctx){ctx=new (window.AudioContext||window.webkitAudioContext)();analyser=ctx.createAnalyser();analyser.fftSize=512;buf=new Uint8Array(analyser.fftSize);analyser.connect(ctx.destination)}
  if(ctx.state==='suspended')await ctx.resume();
  ctx.createMediaElementSource(cur).connect(analyser);
  speechSynthesis.cancel();speaking=true;
  cur.onended=()=>{speaking=false;talk=0};
  await cur.play();mouthLoop();
 }catch(e){console.warn('ElevenLabs:',e);builtinSay(text,mood)}
}
window.say=elevenSay;
if(window.robot)try{window.robot.say=elevenSay}catch(e){}
window.robotVoice={
 setKey(k){try{localStorage.setItem(KEY,k.trim());localStorage.removeItem(VOICE)}catch(e){}},
 setVoice(v){try{localStorage.setItem(VOICE,v.trim())}catch(e){}},
 hasKey(){return !!(get(KEY)||get('robotApiKey'))},
 // голоса OpenRouter gpt-audio-mini: по кругу, с образцом
 list:['coral','shimmer','nova','sage','fable','alloy','ballad','verse','echo','ash'],
 name(){return get(VOICE)||'coral'},
 next(){const l=this.list,i=l.indexOf(this.name());const v=l[(i+1)%l.length];this.setVoice(v);elevenSay('Привет! Так я говорю теперь. Нравится?','happy');return v}
};
})();
