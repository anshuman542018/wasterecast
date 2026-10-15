import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {PCM16Encoder} from '../spark/public/audio/pcm-encoder.js';

test('real worklet downmixes a right-channel microphone and emits audible PCM16 at 16 kHz',async()=>{
  const script=(await readFile(new URL('../spark/public/audio/recast-capture.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'');
  for(const rate of [44100,48000]){
    let Processor;const chunks=[];
    vm.runInNewContext(script,{PCM16Encoder,sampleRate:rate,AudioWorkletProcessor:class{constructor(){this.port={postMessage:chunk=>chunks.push(chunk)};}},registerProcessor:(_name,clazz)=>{Processor=clazz;}});
    const processor=new Processor();
    for(let i=0;i<rate;i+=128){const len=Math.min(128,rate-i),left=new Float32Array(len),right=new Float32Array(len).fill(.6),out=new Float32Array(len).fill(1);processor.process([[left,right]],[[out]]);assert.equal(out.every(x=>x===0),true);}
    assert.equal(chunks.length,31);assert.ok(chunks[0].rms>.29&&chunks[0].rms<.31);
    assert.ok(new DataView(chunks[0].pcm).getInt16(0,true)>9700);assert.equal(chunks[0].pcm.byteLength,1024);
  }
});
test('capture preserves quiet speech energy, clips safely and reports silence honestly',()=>{
  const chunks=[],encoder=new PCM16Encoder(48000,chunk=>chunks.push(chunk));
  encoder.push([new Float32Array(1536).fill(.01)]);encoder.push([new Float32Array(1536)]);encoder.push([new Float32Array(1536).fill(4)]);
  assert.ok(chunks[0].rms>.009);assert.equal(chunks[1].rms,0);assert.ok(chunks[2].peak<=1);assert.equal(new DataView(chunks[2].pcm).getInt16(0,true),32767);
});
