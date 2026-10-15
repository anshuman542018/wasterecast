// Consumes a one-use session in stdin; never log the token or provider diagnostics.
import {GoogleGenAI} from '@google/genai';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const data=JSON.parse(raw);let session,timer,audio=0,text='',tool=false;
try{
  await new Promise(async(resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('Timed out')),20000);
    try{
      session=await new GoogleGenAI({apiKey:data.token,httpOptions:{apiVersion:'v1beta'}}).live.connect({model:data.model,config:data.config,callbacks:{onmessage:message=>{
        for(const part of message.serverContent?.modelTurn?.parts || [])if(part.inlineData?.data)audio+=part.inlineData.data.length;
        text+=message.serverContent?.outputTranscription?.text || '';
        for(const call of message.toolCall?.functionCalls || []){tool ||= call.name==='app_action'&&call.args?.action==='set_theme';session.sendToolResponse({functionResponses:[{id:call.id,name:call.name,response:{result:'Diagnostic action received; no UI state changed.'}}]});}
        if(message.serverContent?.turnComplete&&audio>0)resolve();
      },onerror:()=>reject(Error('Socket error')),onclose:e=>{if(e.code!==1000)reject(Error('Provider close '+e.code));}}});
      session.sendClientContent({turns:[{role:'user',parts:[{text:'Switch to dark mode and briefly acknowledge.'}]}],turnComplete:true});
    }catch{reject(Error('Could not connect to the public voice session'));}
  });
  console.log(JSON.stringify({stage:'public_live_audio_and_tool',passed:audio>0&&tool,audioBase64Bytes:audio,transcript:text}));
  if(!tool)process.exitCode=1;
}catch(error){console.log(JSON.stringify({passed:false,error:error.message}));process.exitCode=1;}
finally{clearTimeout(timer);session?.close();}
