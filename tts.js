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
async function elevenSay(text,mood='normal'){
 const key=get(KEY);
 if(!key)return builtinSay(text,mood);
 face(mood,Math.max(1400,text.length*90));
 try{
  let url;
  if(key.startsWith('AIza')){ // Google Cloud Text-to-Speech
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
  if(cur){cur.pause();URL.revokeObjectURL(cur.src)}
  cur=new Audio(url);
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
 hasKey(){return !!get(KEY)}
};
})();
