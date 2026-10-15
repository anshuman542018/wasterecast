// Explicit diagnostic: generated or typed examples only, no keys/tokens logged.
import {GoogleGenAI} from '@google/genai';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {PCM16Encoder} from '../spark/public/audio/pcm-encoder.js';
import {liveConfig,LIVE_MODEL,LIVE_SESSION_MS} from '../spark/live-config.js';
const client=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY,httpOptions:{apiVersion:'v1beta',timeout:20000}});
const config=liveConfig('en');
let session,audio=0,toolCalls=[],output='',timer;
const audioPath=process.argv.includes('--audio')?process.argv[process.argv.indexOf('--audio')+1]:null;
try{
  const token=await client.authTokens.create({config:{uses:1,expireTime:new Date(Date.now()+LIVE_SESSION_MS).toISOString(),newSessionExpireTime:new Date(Date.now()+60000).toISOString(),liveConnectConstraints:{model:LIVE_MODEL,config}}});
  console.log(JSON.stringify({stage:'one_use_token',passed:Boolean(token.name),model:LIVE_MODEL}));
  await new Promise(async(resolve,reject)=>{
    timer=setTimeout(()=>reject(new Error('Timed out')),25000);
    try{
      session=await new GoogleGenAI({apiKey:token.name,httpOptions:{apiVersion:'v1beta'}}).live.connect({model:LIVE_MODEL,config,callbacks:{
        onmessage:message=>{
          for(const part of message.serverContent?.modelTurn?.parts||[])if(part.inlineData?.data)audio+=part.inlineData.data.length;
          output+=message.serverContent?.outputTranscription?.text || '';
          for(const call of message.toolCall?.functionCalls || []){
            toolCalls.push({name:call.name,args:call.args});
            session.sendToolResponse({functionResponses:[{id:call.id,name:call.name,response:{result:call.name==='app_context'?{brief:{description:'',city:'Pune',country:'IN'},visible_leads:[]}:'Diagnostic only: the UI action was received. No real app state changed.'}}]});
          }
          if(message.serverContent?.turnComplete&&audio>0)resolve();
        },onerror:()=>reject(new Error('Socket error')),onclose:event=>{if(event.code!==1000)reject(new Error('Provider closed: '+event.code));}
      }});
      console.log(JSON.stringify({stage:'live_connection',passed:true}));
      if(audioPath){
        const wav=await readFile(audioPath);let sampleRate=0,channels=0,bits=0,pcm;
        for(let pos=12;pos+8<=wav.length;){const tag=wav.toString('ascii',pos,pos+4),length=wav.readUInt32LE(pos+4);if(tag==='fmt '){channels=wav.readUInt16LE(pos+10);sampleRate=wav.readUInt32LE(pos+12);bits=wav.readUInt16LE(pos+22);}if(tag==='data')pcm=wav.subarray(pos+8,pos+8+length);pos+=8+length+(length%2);}
        if(!pcm||bits!==16||channels!==1||!sampleRate||pcm.length>2_000_000)throw Error('Use a short mono PCM16 WAV fixture');
        // Exercise the actual deployed processor, with speech on channel 2 only.
        let Processor;const captured=[];
        const script=(await readFile(new URL('../spark/public/audio/recast-capture.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'');
        vm.runInNewContext(script,{PCM16Encoder,sampleRate,AudioWorkletProcessor:class{constructor(){this.port={postMessage:chunk=>captured.push(chunk)};}},registerProcessor:(_name,clazz)=>{Processor=clazz;}});
        const processor=new Processor();
        for(let offset=0;offset<pcm.length/2;offset+=128){const count=Math.min(128,pcm.length/2-offset),speech=new Float32Array(count);for(let i=0;i<count;i++)speech[i]=pcm.readInt16LE((offset+i)*2)/32768;processor.process([[new Float32Array(count),speech]],[[new Float32Array(count)]]);}
        console.log(JSON.stringify({stage:'actual_worklet',chunks:captured.length,audibleChunks:captured.filter(c=>c.rms>.004).length}));
        for(const chunk of captured){session.sendRealtimeInput({audio:{data:Buffer.from(chunk.pcm).toString('base64'),mimeType:'audio/pcm;rate=16000'}});await new Promise(r=>setTimeout(r,32));}
        session.sendRealtimeInput({audioStreamEnd:true});
      }else session.sendClientContent({turns:[{role:'user',parts:[{text:'Switch the app to light mode, then tell me briefly what you did.'}]}],turnComplete:true});
    }catch(error){reject(error);}
  });
  const passed=audio>0&&toolCalls.some(c=>c.name==='app_action'&&c.args?.action===(audioPath?'search':'set_theme'));
  console.log(JSON.stringify({stage:audioPath?'generated_speech_to_live_tool':'live_audio_and_tool',passed,audioBase64Bytes:audio,toolCalls,transcript:output}));if(!passed)process.exitCode=1;
}catch(error){console.log(JSON.stringify({passed:false,status:error.status || null,error:String(error.message).replaceAll(process.env.GEMINI_API_KEY || 'NEVER_MATCH','[redacted]').slice(0,350)}));process.exitCode=1;}
finally{clearTimeout(timer);session?.close();}
