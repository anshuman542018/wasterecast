import test from 'node:test';
import assert from 'node:assert/strict';
import {MicrophoneRecorder,preferredVoice,microphoneError,audioType} from '../spark/voice.js';

function fixture(overrides={}){
  const tracks=[];const results=[];const errors=[];const states=[];const instances=[];
  const stream=()=>{const track={stops:0,stop(){this.stops++;}};tracks.push(track);return {getTracks:()=>[track]};};
  class Recorder {
    static isTypeSupported(type){return type.startsWith('audio/webm');}
    constructor(s,options){this.mimeType=options.mimeType;this.state='inactive';instances.push(this);}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['audio'],{type:this.mimeType})});this.onstop();}
  }
  const capture=new MicrophoneRecorder({mediaDevices:{getUserMedia:async()=>stream()},Recorder,onAudio:blob=>results.push(blob),onError:error=>errors.push(error),onState:s=>states.push(s),...overrides});
  return {capture,tracks,results,errors,states,instances,stream,Recorder};
}
test('recording works without SpeechRecognition and releases the microphone on stop',async()=>{
  const f=fixture();await f.capture.start();assert.equal(f.capture.active,true);f.capture.stop();
  assert.equal(f.results.length,1);assert.equal(f.results[0].type,'audio/webm');assert.ok(f.tracks[0].stops>0);assert.equal(f.capture.active,false);
  assert.deepEqual(f.states,['permission','recording','idle']);
});
test('cancel while waiting for permission discards a late stream without sending audio',async()=>{
  let resolve;const f=fixture({mediaDevices:{getUserMedia:()=>new Promise(r=>{resolve=r;})}});
  const pending=f.capture.start();f.capture.cancel();resolve(f.stream());await pending;
  assert.equal(f.results.length,0);assert.equal(f.instances.length,0);assert.ok(f.tracks[0].stops>0);
});
test('cancelled recording cannot submit a command',async()=>{
  const f=fixture();await f.capture.start();f.capture.cancel();assert.equal(f.results.length,0);assert.ok(f.tracks[0].stops>0);
});
test('late stop from an old recording cannot close the next microphone session',async()=>{
  const f=fixture();
  class DelayedRecorder extends f.Recorder {stop(){this.state='inactive';}}
  const capture=new MicrophoneRecorder({mediaDevices:{getUserMedia:async()=>f.stream()},Recorder:DelayedRecorder,onAudio:blob=>f.results.push(blob),onError:()=>{},onState:()=>{}});
  await capture.start();const old=capture.recorder;capture.cancel();await capture.start();
  old.onstop();assert.equal(capture.active,true);assert.equal(f.tracks[1].stops,0);capture.cancel();
});
test('oversized recordings are rejected rather than sent to Gemini',async()=>{
  const f=fixture({maxBytes:2});await f.capture.start();f.capture.stop();assert.equal(f.results.length,0);assert.match(f.errors[0].message,/too large/);assert.ok(f.tracks[0].stops>0);
});
test('preferred voice selects a feminine option in the current language and respects an explicit choice',()=>{
  const voices=[{name:'Microsoft Ravi',lang:'en-IN',voiceURI:'ravi'},{name:'Microsoft Zira',lang:'en-US',voiceURI:'zira'},{name:'Microsoft Heera',lang:'en-IN',voiceURI:'heera'},{name:'Microsoft Swara',lang:'hi-IN',voiceURI:'swara'}];
  assert.equal(preferredVoice(voices,'en-IN').voiceURI,'heera');assert.equal(preferredVoice(voices,'hi-IN').voiceURI,'swara');
  assert.equal(preferredVoice(voices,'en-IN','zira').voiceURI,'zira');assert.equal(preferredVoice([],'en-IN'),null);
  assert.match(microphoneError({name:'NotAllowedError'}),/permission is blocked/);assert.equal(audioType('audio/webm;codecs=opus'),'audio/webm');
});
