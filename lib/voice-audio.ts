export const VOICE_SECONDS=60;
export const VOICE_FILE_BYTES=10*1024*1024;
export const VOICE_SAMPLE_RATE=24000;

/** PCM encoding only. Browser audio decoding/resampling happens before this boundary. */
export function encodeVoiceWav(samples:Float32Array,sampleRate=VOICE_SAMPLE_RATE):Uint8Array<ArrayBuffer>{
 if(!(samples instanceof Float32Array)||![16000,24000].includes(sampleRate)||samples.length<sampleRate/10||samples.length>sampleRate*VOICE_SECONDS)throw Error('Choose a recording between 0.1 and 60 seconds.');
 const bytes=new Uint8Array(44+samples.length*2),view=new DataView(bytes.buffer);
 const word=(at:number,value:string)=>{for(let i=0;i<value.length;i++)bytes[at+i]=value.charCodeAt(i);};
 word(0,'RIFF');view.setUint32(4,bytes.length-8,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){if(!Number.isFinite(samples[i]))throw Error('This recording contains unreadable audio.');const v=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,Math.round(v<0?v*32768:v*32767),true);}
 return bytes;
}

function recordingDuration(blob:Blob,signal:AbortSignal):Promise<number>{
 return new Promise((resolve,reject)=>{
  let settled=false;const url=URL.createObjectURL(blob),audio=new Audio(),timer=setTimeout(()=>done(Error('The recording duration could not be read. Try another audio file.')),10000);
  function done(value:number|Error){if(settled)return;settled=true;audio.onloadedmetadata=null;audio.onerror=null;clearTimeout(timer);signal.removeEventListener('abort',cancel);audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);typeof value==='number'?resolve(value):reject(value);}
  const cancel=()=>done(Error('Audio preparation cancelled.'));
  audio.preload='metadata';audio.onloadedmetadata=()=>done(Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:Error('This file does not report its duration. Try an MP3, M4A or WAV file.'));audio.onerror=()=>done(Error('This browser cannot read that audio file.'));signal.addEventListener('abort',cancel,{once:true});if(signal.aborted){cancel();return;}audio.src=url;
 });
}

function abortable<T>(operation:Promise<T>,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{
  const cancel=()=>{signal.removeEventListener('abort',cancel);reject(Error('Audio preparation cancelled.'));};
  signal.addEventListener('abort',cancel,{once:true});
  if(signal.aborted)cancel();
  operation.then(value=>{if(signal.aborted)cancel();else resolve(value);},reject).finally(()=>signal.removeEventListener('abort',cancel));
 });
}

/** Audio stays in this browser until the user explicitly requests transcription. */
export async function prepareVoiceAudio(blob:Blob,signal:AbortSignal,recordedSeconds?:number):Promise<Blob>{
 if(!blob.size||blob.size>VOICE_FILE_BYTES)throw Error('Choose an audio file smaller than 10 MB.');
 const duration=recordedSeconds??await recordingDuration(blob,signal);
 if(!Number.isFinite(duration)||duration<.1||duration>VOICE_SECONDS+.25)throw Error('Choose a recording between 0.1 and 60 seconds.');
 if(signal.aborted)throw Error('Audio preparation cancelled.');
 const context=new AudioContext();
 const cancel=()=>{void context.close().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
 try{
  const bytes=await abortable(blob.arrayBuffer(),signal);
  const decoded=await abortable(context.decodeAudioData(bytes),signal);
  if(signal.aborted)throw Error('Audio preparation cancelled.');
  if(decoded.duration<.1||decoded.duration>VOICE_SECONDS+.25||decoded.numberOfChannels>8)throw Error('Choose a recording between 0.1 and 60 seconds.');
  const frames=Math.min(VOICE_SECONDS*VOICE_SAMPLE_RATE,Math.ceil(decoded.duration*VOICE_SAMPLE_RATE));
  const offline=new OfflineAudioContext(1,frames,VOICE_SAMPLE_RATE),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
  const rendered=await abortable(offline.startRendering(),signal);if(signal.aborted)throw Error('Audio preparation cancelled.');
  return new Blob([encodeVoiceWav(rendered.getChannelData(0))],{type:'audio/wav'});
 }finally{signal.removeEventListener('abort',cancel);await context.close().catch(()=>{});}
}
