import {GoogleGenAI} from '@google/genai';
import {LIVE_SESSION_MS} from './live-config.js';
import {microphoneError} from './voice.js';
import {PCM16Encoder} from './public/audio/pcm-encoder.js';

// Lumi's full-duplex PCM capture, streaming playback, interruption and tool queue.
export class RecastLiveSession{
  constructor(options,dependencies={}){
    this.options=options;this.deps=dependencies;this.running=false;this.generation=0;
    this.sources=new Set();this.nextAudio=0;this.muted=false;this.inputMuted=false;
    this.toolQueue=Promise.resolve();this.toolIds=new Set();this.cancelledTools=new Set();
  }
  get active(){return this.running;}
  async start({microphone=true,initialText,deviceId=''}={}){
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
        const stream=await devices.getUserMedia(this.constraints(deviceId));
        if(!current()){stream.getTracks().forEach(track=>track.stop());return;}
        this.stream=stream;
        this.watchTrack(stream,current);
      }
      this.options.onPhase('connecting');
      const [data]=await Promise.all([
        this.options.getSession(this.abort.signal),
        microphone?context.audioWorklet?.addModule('/audio/recast-capture.js?v=input-2').then(()=>true).catch(()=>false):Promise.resolve()
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
        await context.resume();
        if(!current())return;
        this.captureStarted=Date.now();this.lastPacket=0;this.lastSound=0;this.packets=0;this.compatibility=false;
        try{
          const Worklet=this.deps.AudioWorkletNode || globalThis.AudioWorkletNode;
          this.capture=new Worklet(context,'recast-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit'});
          this.capture.port.onmessage=event=>this.captureChunk(event.data,current);
          this.capture.onprocessorerror=()=>{if(current())this.useCompatibilityCapture(current);};
          this.connectInput();
        }catch{this.useCompatibilityCapture(current);}
        this.options.onMicrophone?.(this.stream);
        this.inputWatch=setInterval(()=>{
          if(!current()||this.inputMuted)return;
          const now=Date.now();
          if(context.state==='suspended'){this.options.onInput?.({state:'suspended',level:0});return;}
          if(!this.compatibility&&now-(this.lastPacket||this.captureStarted)>3500){this.useCompatibilityCapture(current);return;}
          if(this.compatibility&&now-(this.lastPacket||this.captureStarted)>7000){this.fail('No microphone audio is reaching the browser. Check the Windows input device and microphone access, then try another input.');return;}
          this.options.onInput?.({state:!this.lastPacket?'waiting':now-(this.lastSound||this.captureStarted)>7000?'silent':'ready',level:0,packets:this.packets});
        },1000);
      }
      clearTimeout(this.startup);this.options.onPhase('listening');
      this.timer=setTimeout(()=>{if(current())this.fail('Your five-minute voice session is complete. Start voice for another conversation.');},LIVE_SESSION_MS);
      socket.sendClientContent({turns:[{role:'user',parts:[{text:initialText || 'Greet me in one short sentence and ask which material I want to recover.'}]}],turnComplete:true});
    }catch(error){if(current())this.fail(['NotAllowedError','NotFoundError','NotReadableError','AbortError'].includes(error.name)?microphoneError(error):error.message || 'Could not start live voice.');}
  }
  constraints(deviceId){return {audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true,...(deviceId?{deviceId:{exact:deviceId}}:{})},video:false};}
  watchTrack(stream,current){stream.getAudioTracks()[0]?.addEventListener('ended',()=>{if(current()&&this.stream===stream)this.fail('Your microphone disconnected. Choose another input and start voice again.');});}
  connectInput(){this.inputSource=this.context.createMediaStreamSource(this.stream);this.inputSource.connect(this.capture);this.capture.connect(this.context.destination);}
  captureChunk(chunk,current){
    if(!current()||this.inputMuted)return;
    const pcm=chunk.pcm || chunk;
    if(!(pcm instanceof ArrayBuffer)||!pcm.byteLength)return;
    this.lastPacket=Date.now();this.packets++;const level=Number(chunk.rms)||0;if(level>.004)this.lastSound=this.lastPacket;
    if(this.packets%4===0)this.options.onInput?.({state:level>.004?'hearing':this.lastPacket-(this.lastSound||this.captureStarted)>7000?'silent':'ready',level,packets:this.packets});
    let raw='';for(const byte of new Uint8Array(pcm))raw+=String.fromCharCode(byte);
    try{this.socket.sendRealtimeInput({audio:{data:btoa(raw),mimeType:'audio/pcm;rate=16000'}});}catch{if(current())this.fail('Audio could not be sent. Start voice again.');}
  }
  useCompatibilityCapture(current){
    if(!current()||this.compatibility)return;
    this.compatibility=true;this.inputSource?.disconnect();this.capture?.disconnect();
    if(this.capture?.port)this.capture.port.onmessage=null;
    try{
      const encoder=new PCM16Encoder(this.context.sampleRate,chunk=>this.captureChunk(chunk,current));
      this.capture=this.context.createScriptProcessor(2048,1,1);
      this.capture.onaudioprocess=event=>{
        if(!current())return;
        for(let ch=0;ch<event.outputBuffer.numberOfChannels;ch++)event.outputBuffer.getChannelData(ch).fill(0);
        const channels=[];for(let ch=0;ch<event.inputBuffer.numberOfChannels;ch++)channels.push(event.inputBuffer.getChannelData(ch));encoder.push(channels);
      };
      this.connectInput();this.captureStarted=Date.now();this.options.onInput?.({state:'waiting',level:0});
    }catch{this.fail('This browser could not capture microphone audio. Choose your microphone and reopen WasteRecast in Chrome or Edge.');}
  }
  async changeMicrophone(deviceId){
    if(!this.running||!this.stream)return;
    const generation=this.generation,devices=this.deps.mediaDevices||navigator.mediaDevices;
    const stream=await devices.getUserMedia(this.constraints(deviceId));
    if(!this.running||this.generation!==generation){stream.getTracks().forEach(t=>t.stop());return;}
    this.inputSource?.disconnect();const old=this.stream;this.stream=stream;old?.getTracks().forEach(t=>t.stop());
    this.watchTrack(stream,()=>this.running&&this.generation===generation);
    this.inputSource=this.context.createMediaStreamSource(stream);this.inputSource.connect(this.capture);
    stream.getAudioTracks().forEach(t=>{t.enabled=!this.inputMuted;});this.lastSound=0;this.captureStarted=Date.now();this.options.onMicrophone?.(stream);
  }
  async resumeAudio(){await this.context?.resume();}
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
    this.running=false;++this.generation;this.abort?.abort();clearTimeout(this.startup);clearTimeout(this.timer);clearInterval(this.inputWatch);this.interrupt();
    this.inputSource?.disconnect();this.inputSource=null;
    this.capture?.disconnect();if(this.capture?.port)this.capture.port.onmessage=null;if(this.capture){this.capture.onaudioprocess=null;this.capture.onprocessorerror=null;}this.capture=null;
    this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
    this.socket?.close();this.socket=null;void this.context?.close().catch(()=>{});this.context=null;
  }
}
