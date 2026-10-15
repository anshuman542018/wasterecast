import {GoogleGenAI} from '@google/genai';
import {LIVE_SESSION_MS} from './live-config.js';
import {microphoneError} from './voice.js';

// Lumi's full-duplex PCM capture, streaming playback, interruption and tool queue.
export class RecastLiveSession{
  constructor(options,dependencies={}){
    this.options=options;this.deps=dependencies;this.running=false;this.generation=0;
    this.sources=new Set();this.nextAudio=0;this.muted=false;this.inputMuted=false;
    this.toolQueue=Promise.resolve();this.toolIds=new Set();this.cancelledTools=new Set();
  }
  get active(){return this.running;}
  async start({microphone=true,initialText}={}){
    if(this.running)return;
    this.running=true;const generation=++this.generation;const current=()=>this.running&&generation===this.generation;
    this.abort=new AbortController();this.heard='';this.reply='';this.toolIds.clear();this.cancelledTools.clear();
    this.options.onPhase('starting');
    this.startup=setTimeout(()=>{if(current())this.fail('Voice did not connect in time. Check microphone permission and your connection, then try again.');},25000);
    try{
      const Context=this.deps.AudioContext || globalThis.AudioContext;
      if(!Context)throw new Error('Live audio is unavailable. Open WasteRecast directly in Chrome, Edge or Safari.');
      const context=this.context=new Context();await context.resume();
      if(!current())return;
      if(microphone){
        this.options.onPhase('permission');
        const devices=this.deps.mediaDevices || navigator.mediaDevices;
        if(!devices?.getUserMedia)throw new Error('No microphone access in this browser. Open WasteRecast directly in Chrome, Edge or Safari.');
        const stream=await devices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
        if(!current()){stream.getTracks().forEach(track=>track.stop());return;}
        this.stream=stream;
        stream.getAudioTracks()[0]?.addEventListener('ended',()=>{if(current())this.fail('Your microphone stopped. Start voice again to reconnect.');});
      }
      this.options.onPhase('connecting');
      const [data]=await Promise.all([
        this.options.getSession(this.abort.signal),
        microphone?context.audioWorklet.addModule('/audio/recast-capture.js'):Promise.resolve()
      ]);
      if(!current())return;
      const connect=this.deps.connect || (args=>new GoogleGenAI({apiKey:data.token,httpOptions:{apiVersion:'v1beta'}}).live.connect(args));
      const socket=await connect({model:data.model,config:data.config,callbacks:{
        onmessage:message=>{if(current())this.handle(message);},
        onerror:()=>{if(current())this.fail('The live connection was interrupted. Start voice again to reconnect.');},
        onclose:event=>{if(current())this.fail(event.reason?.includes('quota')?'Gemini free voice quota is busy. Try later.':'Your voice session ended. Start voice again to reconnect.');}
      }});
      if(!current()){socket.close();return;}
      this.socket=socket;
      if(microphone){
        const Worklet=this.deps.AudioWorkletNode || globalThis.AudioWorkletNode;
        this.capture=new Worklet(context,'recast-capture');
        this.capture.port.onmessage=event=>{
          if(!current()||this.inputMuted)return;
          let raw='';for(const byte of new Uint8Array(event.data))raw+=String.fromCharCode(byte);
          try{socket.sendRealtimeInput({audio:{data:btoa(raw),mimeType:'audio/pcm;rate=16000'}});}catch{if(current())this.fail('Audio could not be sent. Start voice again.');}
        };
        this.inputSource=context.createMediaStreamSource(this.stream);this.inputSource.connect(this.capture);this.capture.connect(context.destination);
      }
      clearTimeout(this.startup);this.options.onPhase('listening');
      this.timer=setTimeout(()=>{if(current())this.fail('Your five-minute voice session is complete. Start voice for another conversation.');},LIVE_SESSION_MS);
      socket.sendClientContent({turns:[{role:'user',parts:[{text:initialText || 'Greet me in one short sentence and ask which material I want to recover.'}]}],turnComplete:true});
    }catch(error){if(current())this.fail(['NotAllowedError','NotFoundError','NotReadableError','AbortError'].includes(error.name)?microphoneError(error):error.message || 'Could not start live voice.');}
  }
  handle(message){
    const generation=this.generation;const current=()=>this.running&&this.generation===generation;
    if(!current())return;
    for(const id of message.toolCallCancellation?.ids || [])this.cancelledTools.add(id);
    const content=message.serverContent;
    if(content?.interrupted){this.interrupt();this.dropAudio=false;if(this.reply)this.options.onTranscript('recast',this.reply,true);this.reply='';this.options.onPhase('listening');}
    if(content?.inputTranscription?.text){this.heard=(this.heard+content.inputTranscription.text).slice(-6000);this.options.onTranscript('you',this.heard,false);}
    if(content?.outputTranscription?.text){this.reply=(this.reply+content.outputTranscription.text).slice(-8000);this.options.onTranscript('recast',this.reply,false);}
    for(const part of content?.modelTurn?.parts || [])if(!this.muted&&!this.dropAudio&&part.inlineData?.data&&part.inlineData.mimeType?.startsWith('audio/pcm'))this.play(part.inlineData.data);
    if(content?.turnComplete){
      if(this.heard)this.options.onTranscript('you',this.heard,true);
      if(this.reply)this.options.onTranscript('recast',this.reply,true);
      this.heard='';this.reply='';this.dropAudio=false;if(!this.sources.size)this.options.onPhase('listening');
    }
    for(const call of message.toolCall?.functionCalls || []){
      if(!call.id || this.toolIds.has(call.id))continue;this.toolIds.add(call.id);
      this.toolQueue=this.toolQueue.then(async()=>{
        if(!current()||this.cancelledTools.has(call.id))return;
        this.options.onPhase('thinking');let result;
        try{
          if(call.name==='app_context')result=this.options.getContext();
          else if(call.name==='app_action')result=await this.options.onAction(call.args);
          else result={error:'Unsupported action. No action taken.'};
        }catch(error){result={error:error.message || 'The app action failed. No success was confirmed.'};}
        if(current()&&!this.cancelledTools.has(call.id))this.socket?.sendToolResponse({functionResponses:[{id:call.id,name:call.name,response:{result}}]});
      }).catch(()=>{if(current())this.fail('The app request could not finish. Please reconnect.');});
    }
  }
  play(base64){
    if(!this.running||!this.context)return;
    const raw=atob(base64);const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));const view=new DataView(bytes.buffer);
    const context=this.context,buffer=context.createBuffer(1,Math.floor(bytes.length/2),24000),samples=buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(i*2,true)/32768;
    const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);this.sources.add(source);
    this.options.onPhase('speaking');source.onended=()=>{this.sources.delete(source);source.disconnect();if(this.running&&!this.sources.size)this.options.onPhase('listening');};
    const start=Math.max(context.currentTime,this.nextAudio);source.start(start);this.nextAudio=start+buffer.duration;
  }
  interrupt(){for(const source of this.sources){source.onended=null;try{source.stop();}catch{}source.disconnect();}this.sources.clear();this.nextAudio=0;}
  stopSpeaking(){this.dropAudio=true;this.interrupt();}
  sendText(text){if(!this.running||!this.socket||!text.trim())return;this.interrupt();this.socket.sendRealtimeInput({text:text.trim().slice(0,6000)});}
  muteInput(value){this.inputMuted=value;this.stream?.getAudioTracks().forEach(track=>{track.enabled=!value;});if(value)this.socket?.sendRealtimeInput({audioStreamEnd:true});}
  muteOutput(value){this.muted=value;if(value)this.interrupt();}
  fail(text){this.pause();this.options.onPhase('error');this.options.onError(text);}
  pause(){
    this.running=false;++this.generation;this.abort?.abort();clearTimeout(this.startup);clearTimeout(this.timer);this.interrupt();
    this.inputSource?.disconnect();this.inputSource=null;
    this.capture?.disconnect();if(this.capture)this.capture.port.onmessage=null;this.capture=null;
    this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
    this.socket?.close();this.socket=null;void this.context?.close().catch(()=>{});this.context=null;
  }
}
