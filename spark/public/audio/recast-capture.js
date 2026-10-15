import {PCM16Encoder} from './pcm-encoder.js';
// No recording is persisted. Emit mono PCM16 at 16kHz in ~32ms chunks.
class RecastCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.encoder=new PCM16Encoder(sampleRate,chunk=>this.port.postMessage(chunk,[chunk.pcm]));
  }
  process(inputs, outputs) {
    // Keep the graph alive without playing microphone sound into the speaker.
    for (const output of outputs) for (const channel of output) channel.fill(0);
    this.encoder.push(inputs[0]);
    return true;
  }
}
registerProcessor("recast-capture", RecastCapture);
