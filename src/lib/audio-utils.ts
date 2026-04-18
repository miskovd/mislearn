/**
 * Utilities for raw PCM audio processing.
 * Gemini Live API expects 16-bit PCM at 16kHz.
 */

export function floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

export function base64ToBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export class AudioQueue {
  private context: AudioContext;
  private nextStartTime: number = 0;

  constructor(sampleRate: number = 24000) {
    this.context = new AudioContext({ sampleRate });
  }

  async addChunk(base64Data: string) {
    const buffer = base64ToBuffer(base64Data);
    const float32Data = new Float32Array(buffer.byteLength / 2);
    const view = new DataView(buffer);
    
    for (let i = 0; i < float32Data.length; i++) {
      float32Data[i] = view.getInt16(i * 2, true) / 32768;
    }

    const audioBuffer = this.context.createBuffer(1, float32Data.length, this.context.sampleRate);
    audioBuffer.getChannelData(0).set(float32Data);

    const source = this.context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.context.destination);

    const currentTime = this.context.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
  }

  stop() {
    this.context.close();
    this.context = new AudioContext({ sampleRate: 24000 });
    this.nextStartTime = 0;
  }
}
