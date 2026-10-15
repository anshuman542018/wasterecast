import {localAssistantCommand,validateAssistantCommand} from './assistant-core.js';
import {t,getLanguage,languages} from './preferences.js';
import {MicrophoneRecorder,preferredVoice,microphoneError,AUDIO_TYPES,audioType} from './voice.js';

export function initAssistant({request,execute}){
  const $=selector=>document.querySelector(selector);
  const dialog=$('#assistant-dialog'),input=$('#assistant-input'),status=$('#assistant-status');
  const mic=$('#voice-mic'),send=$('#assistant-send'),voiceSelect=$('#voice-select'),voiceStatus=$('#voice-status');
  const synth=window.speechSynthesis;
  const Recognition=window.SpeechRecognition || window.webkitSpeechRecognition;
  const canRecord=Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  let recognition=null,recorder=null,listening=false,running=false,transcribing=false,permission=false;
  let generation=0,clock=null,startedAt=0,voices=[];
  let preferredURI='';
  try{preferredURI=localStorage.getItem('wr-voice') || '';$('#voice-read').checked=localStorage.getItem('wr-voice-read')!=='off';}catch{$('#voice-read').checked=true;}
  function updateControls(){
    const busy=running||transcribing;
    send.disabled=busy||permission||listening;
    mic.disabled=busy||permission;
    mic.textContent=t(listening?'stop':'mic');mic.setAttribute('aria-pressed',String(listening));
    $('#voice-browser').disabled=busy||permission||listening||!Recognition;
    $('#voice-preview').disabled=!synth || voices.length===0;
  }
  function loadVoices(){
    voices=synth?.getVoices() || [];
    voiceSelect.replaceChildren(new Option(t('voiceAuto'),''));
    for(const voice of voices)voiceSelect.add(new Option(`${voice.name} (${voice.lang})`,voice.voiceURI));
    if(preferredURI && voices.some(voice=>voice.voiceURI===preferredURI))voiceSelect.value=preferredURI;
    const selected=preferredVoice(voices,languages[getLanguage()].speech,voiceSelect.value);
    voiceStatus.textContent=selected?`${t('voiceSelected')}: ${selected.name} · ${selected.lang}`:t('voiceMissing');
    updateControls();
  }
  function speak(text,preview=false){
    if((!$('#voice-read').checked && !preview)||!synth)return;
    synth.cancel();synth.resume?.();
    const voice=preferredVoice(synth.getVoices(),languages[getLanguage()].speech,voiceSelect.value);
    if(!voice){voiceStatus.textContent=t('voiceMissing');return;}
    const utterance=new SpeechSynthesisUtterance(text.slice(0,5000));
    utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=0.9;utterance.pitch=1.04;utterance.volume=0.85;
    utterance.onerror=event=>{if(!['canceled','interrupted'].includes(event.error))voiceStatus.textContent=`${t('voicePlaybackError')} (${event.error})`;};
    synth.speak(utterance);
  }
  function message(text){status.textContent=text;speak(text);}
  async function run(text){
    if(running||!text.trim()||!dialog.open)return;
    running=true;updateControls();status.textContent=t('waiting');
    const token=generation;
    try{
      const parsed=localAssistantCommand(text) || (await request('/api/assistant',{method:'POST',body:JSON.stringify({text})})).command;
      const command=validateAssistantCommand(parsed);
      if(!dialog.open||token!==generation)return;
      $('#assistant-plan').textContent=[command.description,command.city,command.state,command.country,command.quantity!=null?command.quantity+' tonnes/month':null].filter(Boolean).join(' · ');
      const answer=await execute(command);
      if(token===generation)message(answer || t('voiceHelp'));
    }catch(error){if(token===generation)message(error.message);}
    finally{if(token===generation){running=false;updateControls();}}
  }
  function recordingState(state){
    permission=state==='permission';listening=state==='recording';clearInterval(clock);
    if(permission)status.textContent=t('voicePermission');
    if(listening){startedAt=Date.now();const tick=()=>{status.textContent=`${t('voiceRecording')} · ${Math.floor((Date.now()-startedAt)/1000)}s / 30s`;};tick();clock=setInterval(tick,1000);}
    updateControls();
  }
  async function transcribe(blob){
    if(!dialog.open)return;
    const token=generation;
    if(!AUDIO_TYPES.includes(audioType(blob.type))){message(t('voiceFormat'));return;}
    transcribing=true;updateControls();status.textContent=t('voiceTranscribing');
    try{
      const data=await new Promise((resolve,reject)=>{
        const reader=new FileReader();reader.onerror=()=>reject(new Error('Could not read the audio recording.'));
        reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(blob);
      });
      if(token!==generation || !dialog.open)return;
      const result=await request('/api/transcribe',{method:'POST',body:JSON.stringify({data,mimeType:audioType(blob.type)})});
      if(token!==generation || !dialog.open)return;
      if(!result.transcript?.trim()){message(t('voiceNoSpeech'));return;}
      input.value=result.transcript;await run(result.transcript);
    }catch(error){if(token===generation)message(`${t('voiceTranscribeError')} ${error.message}`);}
    finally{if(token===generation){transcribing=false;updateControls();}}
  }
  if(canRecord)recorder=new MicrophoneRecorder({mediaDevices:navigator.mediaDevices,Recorder:window.MediaRecorder,onAudio:transcribe,
    onError:error=>message(microphoneError(error)),onState:recordingState});
  function startBrowserRecognition(){
    if(!Recognition){message(t('voiceUnavailable'));return;}
    synth?.cancel();const token=generation;let finalText='',failed=false;
    recognition=new Recognition();recognition.lang=languages[getLanguage()].speech;recognition.continuous=false;recognition.interimResults=true;
    permission=true;updateControls();status.textContent=t('voicePermission');
    recognition.onstart=()=>{if(token!==generation){recognition.abort();return;}permission=false;listening=true;updateControls();status.textContent=t('listening');};
    recognition.onresult=event=>{finalText=Array.from(event.results).filter(item=>item.isFinal).map(item=>item[0].transcript).join(' ');input.value=Array.from(event.results).map(item=>item[0].transcript).join(' ');};
    recognition.onerror=event=>{failed=true;if(token===generation && dialog.open && event.error!=='aborted')message(microphoneError(event));};
    recognition.onend=()=>{if(token!==generation)return;permission=false;listening=false;updateControls();if(finalText&&!failed&&dialog.open)run(finalText);else if(!failed)message(t('voiceNoSpeech'));};
    try{recognition.start();}catch(error){permission=false;updateControls();message(microphoneError(error));}
  }
  $('#assistant-open').addEventListener('click',()=>{
    dialog.showModal();loadVoices();status.textContent=canRecord?t('voiceReady'):Recognition?t('voiceBrowserReady'):t('voiceUnavailable');
    if(!canRecord&&!Recognition)input.focus();
  });
  $('#assistant-form').addEventListener('submit',event=>{event.preventDefault();if(listening||permission)return;synth?.cancel();run(input.value);});
  mic.addEventListener('click',()=>{
    if(running||transcribing||permission)return;
    if(listening){recorder?.active?recorder.stop():recognition?.stop();return;}
    synth?.cancel();if(recorder)recorder.start();else startBrowserRecognition();
  });
  $('#voice-browser').addEventListener('click',startBrowserRecognition);
  $('#voice-preview').addEventListener('click',()=>speak(t('voiceGreeting'),true));
  voiceSelect.addEventListener('change',()=>{preferredURI=voiceSelect.value;try{localStorage.setItem('wr-voice',preferredURI);}catch{}loadVoices();speak(t('voiceGreeting'),true);});
  $('#voice-read').addEventListener('change',()=>{try{localStorage.setItem('wr-voice-read',$('#voice-read').checked?'on':'off');}catch{}if(!$('#voice-read').checked)synth?.cancel();});
  synth?.addEventListener('voiceschanged',loadVoices);
  document.addEventListener('wr-language',()=>{loadVoices();updateControls();});
  dialog.addEventListener('close',()=>{++generation;clearInterval(clock);recorder?.cancel();recognition?.abort();synth?.cancel();listening=false;permission=false;running=false;transcribing=false;updateControls();});
  loadVoices();
}
