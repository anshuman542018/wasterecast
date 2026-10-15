export const AUDIO_TYPES=['audio/webm','audio/mp4','audio/ogg','audio/wav','audio/mpeg'];
export const transcriptionSchema={type:'object',properties:{transcript:{type:'string'}},required:['transcript']};
export function audioType(value){return String(value || '').split(';')[0].trim().toLowerCase();}
export function preferredVoice(voices,language,preferredURI=''){
  const exact=voices.find(voice=>voice.voiceURI===preferredURI);if(exact)return exact;
  const primary=language.split('-')[0].toLowerCase();
  const matching=voices.filter(voice=>voice.lang?.toLowerCase().split('-')[0]===primary);
  const pool=matching.length?matching:voices;
  const feminine=/female|heera|zira|aria|jenny|sonia|samantha|karen|moira|veena|joanna|aditi|swara|elvira|sabina|helena|paulina|dalia|mónica|monica|susan|hazel|sara|susan|tessa/i;
  const masculine=/\bmale\b|david|mark|ravi|guy|george|daniel|james|roger|alex\b/i;
  const score=voice=>(feminine.test(voice.name)?200:0)-(masculine.test(voice.name)?200:0)+(voice.lang?.toLowerCase()===language.toLowerCase()?30:0)+(voice.localService?5:0);
  return [...pool].sort((a,b)=>score(b)-score(a))[0] || null;
}
export function microphoneError(error){
  const key=error?.name || error?.error;
  if(['NotAllowedError','PermissionDeniedError','not-allowed'].includes(key))return 'Microphone permission is blocked. Open this site’s permissions, allow Microphone, then press Record again.';
  if(['NotFoundError','DevicesNotFoundError','audio-capture'].includes(key))return 'No microphone was found. Connect one or choose another input in your browser settings.';
  if(['NotReadableError','TrackStartError'].includes(key))return 'The microphone is busy or unavailable. Close other recording apps and try again.';
  if(key==='no-speech')return 'No speech was heard. Press Record, say your material and city, then press Stop.';
  if(['network','service-not-allowed'].includes(key))return 'Browser speech recognition is unavailable. Use Record with Gemini instead.';
  return error?.message || 'Could not start voice capture. Use Chrome or Edge with microphone permission, or type your request.';
}

// A recording owns its media tracks and releases them on stop, cancellation and errors.
export class MicrophoneRecorder {
  constructor({mediaDevices,Recorder,onAudio,onError,onState,maxDuration=30000,maxBytes=4000000}){
    Object.assign(this,{mediaDevices,Recorder,onAudio,onError,onState,maxDuration,maxBytes});this.active=false;this.pending=false;this.generation=0;
  }
  async start(){
    if(this.active||this.pending)return;
    const generation=++this.generation;this.pending=true;this.cancelled=false;this.onState('permission');
    try{
      const stream=await this.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      if(generation!==this.generation){stream.getTracks().forEach(track=>track.stop());return;}
      this.stream=stream;
      const mimeType=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(type=>this.Recorder.isTypeSupported?.(type));
      const recorder=new this.Recorder(stream,mimeType?{mimeType}:{});this.recorder=recorder;
      const chunks=[];let size=0,failed=false,timer;
      recorder.ondataavailable=event=>{
        if(event.data?.size){size+=event.data.size;if(size>this.maxBytes){failed=true;if(generation===this.generation)this.onError(new Error('Recording is too large. Keep it under 30 seconds.'));if(recorder.state==='recording')recorder.stop();}else chunks.push(event.data);}
      };
      recorder.onerror=event=>{failed=true;if(generation===this.generation){this.onError(event.error || new Error('Audio recording failed.'));this.cancel();}else stream.getTracks().forEach(track=>track.stop());};
      recorder.onstop=()=>{
        const blob=new Blob(chunks,{type:audioType(recorder.mimeType || chunks[0]?.type)});chunks.length=0;
        const deliver=!this.cancelled&&!failed&&generation===this.generation;
        clearTimeout(timer);stream.getTracks().forEach(track=>track.stop());
        if(this.recorder===recorder){this.release();this.recorder=null;this.onState('idle');}
        if(deliver){if(!blob.size)this.onError(new Error('The microphone captured no audio. Please try again.'));else this.onAudio(blob);}
      };
      recorder.start(250);this.pending=false;this.active=true;this.onState('recording');
      timer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},this.maxDuration);this.timer=timer;
    }catch(error){if(generation===this.generation){this.release();this.onState('idle');this.onError(error);}}
  }
  stop(){if(this.recorder?.state==='recording')this.recorder.stop();else this.release();}
  release(){clearTimeout(this.timer);this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;this.active=false;this.pending=false;}
  cancel(){this.cancelled=true;++this.generation;this.stop();this.release();}
}
