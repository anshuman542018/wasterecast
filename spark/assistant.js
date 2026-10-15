import {localAssistantCommand,validateAssistantCommand} from './assistant-core.js';
import {t,getLanguage,languages} from './preferences.js';

export function initAssistant({request,execute}){
  const dialog=document.querySelector('#assistant-dialog');
  const input=document.querySelector('#assistant-input');
  const status=document.querySelector('#assistant-status');
  const mic=document.querySelector('#voice-mic');
  const send=document.querySelector('#assistant-send');
  const Recognition=window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition=null, listening=false, running=false;
  function speak(text){
    if(!document.querySelector('#voice-read').checked || !window.speechSynthesis)return;
    window.speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(text);utterance.lang=languages[getLanguage()].speech;
    window.speechSynthesis.speak(utterance);
  }
  function message(text){status.textContent=text;speak(text);}
  async function run(text){
    if(running || !text.trim())return;
    running=true;send.disabled=true;mic.disabled=true;status.textContent=t('waiting');
    try{
      const parsed=localAssistantCommand(text) || (await request('/api/assistant',{method:'POST',body:JSON.stringify({text})})).command;
      const command=validateAssistantCommand(parsed);
      if(!dialog.open)return;
      const plan=document.querySelector('#assistant-plan');
      plan.textContent=[command.description,command.city,command.state,command.country,command.quantity!=null?command.quantity+' tonnes/month':null].filter(Boolean).join(' · ');
      const answer=await execute(command);
      message(answer || t('voiceHelp'));
    }catch(error){message(error.message);}
    finally{running=false;send.disabled=false;mic.disabled=!Recognition;}
  }
  document.querySelector('#assistant-open').addEventListener('click',()=>{
    dialog.showModal();if(!Recognition)status.textContent=t('voiceUnavailable');input.focus();
  });
  document.querySelector('#assistant-form').addEventListener('submit',event=>{event.preventDefault();if(listening)recognition?.stop();run(input.value);});
  mic.disabled=!Recognition;
  if(Recognition){
    mic.addEventListener('click',()=>{
      if(listening){recognition.stop();return;}
      window.speechSynthesis?.cancel();
      recognition=new Recognition();recognition.lang=languages[getLanguage()].speech;
      recognition.continuous=false;recognition.interimResults=false;
      let transcript='';
      recognition.onstart=()=>{listening=true;mic.textContent=t('stop');status.textContent=t('listening');};
      recognition.onresult=event=>{transcript=Array.from(event.results).map(item=>item[0].transcript).join(' ');input.value=transcript;};
      recognition.onerror=event=>{transcript='';status.textContent=`${event.error}: ${t('voiceUnavailable')}`;};
      recognition.onend=()=>{listening=false;mic.textContent=t('mic');if(transcript && dialog.open)run(transcript);};
      try{recognition.start();}catch{status.textContent=t('voiceUnavailable');}
    });
  }
  dialog.addEventListener('close',()=>{recognition?.abort();window.speechSynthesis?.cancel();});
}
