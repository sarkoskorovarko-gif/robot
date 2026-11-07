// «Уши»: сами слышим, когда человек говорит (по громкости), записываем фразу целиком
// и отдаём на распознавание нейросети (Gemini через OpenRouter) — точнее встроенного Google.
// Если не вышло — остаётся встроенное распознавание из chat.js.
(function(){
const chat=window.robotChat;if(!chat)return;
const fallbackListen=chat.listen.bind(chat),fallbackStop=chat.stop.bind(chat);
const MODEL='google/gemini-2.5-flash';
const PROMPT='Это запись с микрофона робота дома. Говорит ребёнок 5 лет или взрослый, по-русски. Напиши дословно, что сказал человек, обычным текстом, без кавычек и пояснений. Если речи нет, только шум, музыка, телевизор или неразборчиво — ответь ровно: ПУСТО';
let ctx=null,src=null,proc=null,stream=null,on=false,busy=false;
let chunks=[],speech=false,speechMs=0,silentMs=0,floor=.01,pre=[];
const robotTalking=()=>(typeof speaking!=='undefined'&&speaking)||speechSynthesis.speaking||performance.now()<(window.voiceBusyUntil||0);

function wav16k(bufs,rate){ // склеить, уменьшить до 16 кГц, PCM16 WAV → base64
 let len=0;for(const b of bufs)len+=b.length;const all=new Float32Array(len);let o=0;for(const b of bufs){all.set(b,o);o+=b.length}
 const ratio=rate/16000,n=Math.floor(all.length/ratio),pcm=new Int16Array(n);
 for(let i=0;i<n;i++){const v=all[Math.floor(i*ratio)];pcm[i]=Math.max(-1,Math.min(1,v))*32767}
 const b=new ArrayBuffer(44+n*2),d=new DataView(b),W=(p,s)=>{for(let i=0;i<s.length;i++)d.setUint8(p+i,s.charCodeAt(i))};
 W(0,'RIFF');d.setUint32(4,36+n*2,true);W(8,'WAVEfmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);
 d.setUint32(24,16000,true);d.setUint32(28,32000,true);d.setUint16(32,2,true);d.setUint16(34,16,true);W(36,'data');d.setUint32(40,n*2,true);
 new Int16Array(b,44).set(pcm);const u=new Uint8Array(b);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)}

async function transcribe(b64){
 const key=localStorage.getItem('robotApiKey');if(!key)throw new Error('нет ключа');
 const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+key,'X-Title':'Robot'},
  body:JSON.stringify({model:MODEL,temperature:0,max_tokens:120,messages:[{role:'user',content:[{type:'text',text:PROMPT},{type:'input_audio',input_audio:{data:b64,format:'wav'}}]}]})});
 if(!r.ok)throw new Error(r.status+' '+(await r.text()).slice(0,100));
 const t=((await r.json()).choices?.[0]?.message?.content||'').trim().replace(/^["«]|["»]$/g,'');
 return /^ПУСТО\.?$/i.test(t)?'':t}

async function phraseDone(){
 const bufs=chunks;chunks=[];speech=false;speechMs=silentMs=0;
 if(busy)return;busy=true;window.robotChat.onHear&&window.robotChat.onHear('…');
 try{const text=await transcribe(wav16k(bufs,ctx.sampleRate));
  if(text&&text.length>1){window.robotChat.onHear&&window.robotChat.onHear(text);await chat.ask(text)}}
 catch(e){console.warn('уши:',e);window.robotChat.onHear&&window.robotChat.onHear('(не расслышал)')}
 finally{busy=false}}

async function start(){
 if(on)return true;
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  ctx=new (window.AudioContext||window.webkitAudioContext)();src=ctx.createMediaStreamSource(stream);
  proc=ctx.createScriptProcessor(4096,1,1);src.connect(proc);proc.connect(ctx.destination);
  const blockMs=4096/ctx.sampleRate*1000;
  proc.onaudioprocess=e=>{
   const x=e.inputBuffer.getChannelData(0);e.outputBuffer.getChannelData(0).fill(0);
   if(busy||robotTalking()){chunks=[];speech=false;pre=[];return}  // свой голос и время ответа — не слушаем
   let s=0;for(let i=0;i<x.length;i++)s+=x[i]*x[i];const rms=Math.sqrt(s/x.length),copy=new Float32Array(x);
   const loud=rms>Math.max(.012,floor*3);
   if(!speech){floor=floor*.97+rms*.03;pre.push(copy);if(pre.length>3)pre.shift(); // немного звука до начала фразы
    if(loud){speechMs+=blockMs;chunks.push(copy);if(speechMs>=180){speech=true;chunks=[...pre,...chunks];pre=[]}}else{speechMs=0;chunks=[]}}
   else{chunks.push(copy);speechMs+=blockMs;
    if(loud)silentMs=0;else silentMs+=blockMs;
    if(silentMs>1500||speechMs>15000)phraseDone()}};       // пауза 1,5 с или 15 с речи — фраза закончилась
  on=true;return true}
 catch(e){console.warn('уши: нет микрофона',e);return fallbackListen()}}
function stopEars(){on=false;try{proc&&proc.disconnect();src&&src.disconnect();stream&&stream.getTracks().forEach(t=>t.stop());ctx&&ctx.close()}catch(e){}proc=src=stream=ctx=null;chunks=[];speech=false}

chat.listen=()=>{if(localStorage.getItem('robotEars')==='builtin')return fallbackListen();start();return true};
chat.stop=function(){this.auto=false;stopEars();fallbackStop.call(this);this.auto=false};
window.robotEars={start,stop:stopEars,get on(){return on},transcribe};
})();
