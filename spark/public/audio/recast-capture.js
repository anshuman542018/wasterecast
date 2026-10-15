// No recording is persisted. Emit mono PCM16 at 16kHz in ~32ms chunks.
class RecastCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sum = 0;
    this.count = 0;
    this.position = 0;
    this.output = [];
  }
  process(inputs, outputs) {
    // Keep the graph alive without playing microphone sound into the speaker.
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const value of input) {
      this.sum += value;
      this.count++;
      this.position += 16000;
      if (this.position >= sampleRate) {
        const v = Math.max(-1, Math.min(1, this.sum / this.count));
        this.output.push(Math.round(v * (v < 0 ? 32768 : 32767)));
        this.sum = 0;
        this.count = 0;
        this.position -= sampleRate;
        if (this.output.length === 512) {
          const data = new ArrayBuffer(1024);
          const view = new DataView(data);
          this.output.forEach((sample, i) => view.setInt16(i * 2, sample, true));
          this.port.postMessage(data, [data]);
          this.output = [];
        }
      }
    }
    return true;
  }
}
registerProcessor("recast-capture", RecastCapture);
