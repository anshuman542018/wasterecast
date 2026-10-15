import {localAssistantCommand,validateAssistantCommand} from './assistant-core.js';
import {getLanguage} from './preferences.js';
import {RecastLiveSession} from './live-session.js';

export function initAssistant({request,execute,getContext}){
  const $=selector=>document.querySelector(selector),dialog=$('#assistant-dialog');
  const status=$('#assistant-status'),input=$('#assistant-input'),transcripts=$('#live-transcript');
  let session=null,phase='idle',running=false,minimising=false,generation=0;
  const unfinished={};
  const labels={idle:'Ready when you are',starting:'Starting audio…',permission:'Allow microphone access in your browser',connecting:'Connecting to Gemini Live…',listening:'Listening — speak naturally',thinking:'Working in your workspace…',speaking:'Recast is speaking',error:'Connection needs attention'};
  function setPhase(value){
    phase=value;dialog.dataset.phase=value;$('#live-phase').textContent=value==='listening'&&!session?.stream?'Type to continue — microphone off':labels[value] || value;
    const active=Boolean(session?.active),starting=['starting','permission','connecting'].includes(value);
    $('#voice-mic').textContent=active&&(session?.stream||starting)?'End conversation':'Start voice';$('#voice-mic').setAttribute('aria-pressed',String(active));
    $('#voice-mic').disabled=false;$('#assistant-send').disabled=running||starting;
    $('#voice-mute').disabled=!active||!session?.stream;
    $('#voice-mute').textContent=session?.inputMuted?'Resume microphone':'Mute microphone';
    $('#voice-mute').setAttribute('aria-pressed',String(Boolean(session?.inputMuted)));
    $('#voice-preview').disabled=active;
    $('#assistant-open').classList.toggle('is-live',active);
    $('#assistant-open').setAttribute('aria-label',active?'Open assistant — live voice session active':'Open recovery assistant');
    $('#voice-dock').hidden=!active||dialog.open;
    $('#voice-dock-status').textContent=$('#live-phase').textContent;
  }
  function transcript(speaker,text,finished){
    let row=unfinished[speaker];
    if(!row){row=document.createElement('div');row.className=`live-line from-${speaker}`;const label=document.createElement('strong');label.textContent=speaker==='you'?'You':'Recast';const content=document.createElement('p');row.append(label,content);transcripts.append(row);unfinished[speaker]=row;}
    row.querySelector('p').textContent=text;row.dataset.finished=String(finished);
    if(finished)delete unfinished[speaker];
    while(transcripts.children.length>40)transcripts.firstElementChild.remove();
    $('#live-empty').hidden=true;transcripts.scrollTop=transcripts.scrollHeight;
  }
  async function action(raw){
    try{
      const command=validateAssistantCommand(raw);
      $('#assistant-plan').textContent=[command.action.replaceAll('_',' '),command.description,command.city,command.country].filter(Boolean).join(' · ');
      status.textContent='';
      const result=await execute(command);return result || 'Completed.';
    }catch(error){status.textContent=error.message;throw error;}
  }
  function stop(){++generation;session?.pause();session=null;running=false;setPhase('idle');status.textContent='Conversation ended. Microphone is off.';}
  async function startVoice({microphone=true,initialText}={}){
    stop();status.textContent='';
    session=new RecastLiveSession({
      getSession:signal=>request('/api/live-session',{method:'POST',signal,body:JSON.stringify({consent:true,language:getLanguage()})}),
      getContext,onAction:action,onPhase:setPhase,onTranscript:transcript,
      onError:message=>{status.textContent=message;setPhase('error');}
    });
    session.muted=!$('#voice-read').checked;
    await session.start({microphone,initialText});setPhase(phase);
  }
  function open(){if(!dialog.open)dialog.showModal();setPhase(phase);}
  function minimise(){if(!dialog.open)return;minimising=true;dialog.close();setPhase(phase);}
  $('#assistant-open').addEventListener('click',open);
  $('#voice-mic').addEventListener('click',()=>session?.active&&(session.stream||['starting','permission','connecting'].includes(phase))?stop():startVoice());
  $('#voice-preview').addEventListener('click',()=>startVoice({microphone:false,initialText:'Say only: Hi, I am Recast. Tell me which material you have and where it is, and we will find the next step together.'}));
  $('#voice-mute').addEventListener('click',()=>{session?.muteInput(!session.inputMuted);setPhase(phase);});
  $('#voice-interrupt').addEventListener('click',()=>{session?.stopSpeaking();if(session?.active)setPhase('listening');});
  $('#voice-read').addEventListener('change',()=>session?.muteOutput(!$('#voice-read').checked));
  $('#voice-minimise').addEventListener('click',minimise);
  $('#voice-dock-open').addEventListener('click',open);$('#voice-dock-stop').addEventListener('click',stop);
  document.addEventListener('wr-assistant-minimise',minimise);
  $('#assistant-form').addEventListener('submit',async event=>{
    event.preventDefault();const text=input.value.trim();if(!text||running)return;input.value='';
    if(session?.active){transcript('you',text,true);session.sendText(text);return;}
    const token=generation;running=true;setPhase('thinking');transcript('you',text,true);status.textContent='';
    try{
      const local=localAssistantCommand(text);
      if(local){const result=await action(local);if(token===generation){transcript('recast',result,true);status.textContent='';}}
      else {running=false;await startVoice({microphone:false,initialText:text});}
    }catch(error){if(token===generation)status.textContent=error.message;}
    finally{if(token===generation){running=false;if(!session?.active)setPhase('idle');}}
  });
  dialog.addEventListener('close',()=>{if(!minimising)stop();minimising=false;});
  window.addEventListener('pagehide',stop);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&session?.active)stop();});
  document.addEventListener('wr-language',()=>{if(session?.active)session.sendText('Please continue in '+getLanguage()+'.');});
  setPhase('idle');
}
