// Shared by the AudioWorklet and the compatibility capture path.
// Channels are mixed to mono before resampling; do not silently drop channel 2.
export class PCM16Encoder{
  constructor(inputRate,onChunk){this.inputRate=inputRate;this.onChunk=onChunk;this.sum=0;this.count=0;this.position=0;this.samples=[];}
  push(channels){
    if(!channels?.length||!channels[0]?.length)return;
    for(let i=0;i<channels[0].length;i++){
      let value=0;for(const channel of channels)value+=channel[i] || 0;value/=channels.length;
      this.sum+=value;this.count++;this.position+=16000;
      if(this.position>=this.inputRate){
        const sample=Math.max(-1,Math.min(1,this.sum/this.count));
        this.samples.push(Math.round(sample*(sample<0?32768:32767)));this.sum=0;this.count=0;this.position-=this.inputRate;
        if(this.samples.length===512){
          const pcm=new ArrayBuffer(1024),view=new DataView(pcm);let energy=0,peak=0;
          this.samples.forEach((sample,index)=>{view.setInt16(index*2,sample,true);energy+=(sample/32768)**2;peak=Math.max(peak,Math.abs(sample)/32768);});
          this.samples=[];this.onChunk({pcm,rms:Math.sqrt(energy/512),peak});
        }
      }
    }
  }
}
