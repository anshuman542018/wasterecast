import test from 'node:test';
import assert from 'node:assert/strict';
import {RecastLiveSession} from '../spark/live-session.js';
function setup(overrides={}){
  const log={phases:[],actions:[],responses:[],tracks:0,closed:0,connects:0};let callback;
  class Context{constructor(){this.audioWorklet={addModule:async()=>{}};}resume=async()=>{};close=async()=>{log.closed++;};createMediaStreamSource(){return{connect(){},disconnect(){}};}}
  const stream={getTracks:()=>[{stop(){log.tracks++;}}],getAudioTracks:()=>[{addEventListener(){},enabled:true}]};
  const socket={sendClientContent(){},sendRealtimeInput(){},sendToolResponse(value){log.responses.push(value);},close(){}};
  const deps={AudioContext:Context,AudioWorkletNode:class{constructor(){this.port={};}connect(){}disconnect(){}},mediaDevices:{getUserMedia:async()=>stream},connect:async args=>{log.connects++;callback=args.callbacks;return socket;},...overrides};
  const session=new RecastLiveSession({getSession:async()=>({token:'one-use',model:'test',config:{}}),onPhase:value=>log.phases.push(value),onTranscript(){},onError:value=>{log.error=value;},getContext:()=>({visible_leads:[]}),onAction:async value=>{log.actions.push(value);return'Completed';}},deps);
  return {session,log,stream,callback:()=>callback};
}
test('live session streams without browser SpeechRecognition and releases resources',async()=>{
  const {session,log}=setup();await session.start();assert.equal(session.active,true);assert.equal(log.connects,1);assert.equal(log.phases.at(-1),'listening');session.pause();assert.equal(log.tracks,1);assert.equal(log.closed,1);
});
test('cancelling pending microphone permission drops the late stream and never opens Gemini',async()=>{
  let resolve;const pending=new Promise(r=>{resolve=r;});const {session,log,stream}=setup({mediaDevices:{getUserMedia:()=>pending}});
  const started=session.start();await Promise.resolve();session.pause();resolve(stream);await started;assert.equal(log.tracks,1);assert.equal(log.connects,0);
});
test('duplicate and cancelled live tools never execute twice or after stop',async()=>{
  const {session,log,callback}=setup();await session.start({microphone:false});
  const call={id:'one',name:'app_action',args:{action:'set_theme',theme:'light'}};callback().onmessage({toolCall:{functionCalls:[call,call]}});
  await session.toolQueue;assert.equal(log.actions.length,1);assert.equal(log.responses.length,1);
  callback().onmessage({toolCallCancellation:{ids:['two']}});callback().onmessage({toolCall:{functionCalls:[{...call,id:'two'}]}});await session.toolQueue;assert.equal(log.actions.length,1);
  callback().onmessage({toolCall:{functionCalls:[{...call,id:'three'}]}});session.pause();await session.toolQueue;assert.equal(log.actions.length,1);
});
