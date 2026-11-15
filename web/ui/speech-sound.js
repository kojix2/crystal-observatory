import { visitation, visitorAction } from '../core/visitation.js';
import { visitorSpeech } from './visitor-speech.js';

// A bubble can linger after its event. Only the event that starts it gets a cue.
export function currentSpeechCue(model, visible) {
  if (!visible) return undefined;
  const visit = visitation(model);
  const action = visitorAction(model, visit);
  if (action?.event.index !== model.index) return undefined;
  return { text: visitorSpeech(model, visit) };
}

export class SpeechSound {
  constructor() {
    this.voices = new Set();
    this.lastPlayTime = -Infinity;
  }

  // Call from the Play button or sound checkbox so browser audio is unlocked
  // by a user gesture before the playback timer fires.
  activate() {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch {
      // Audio is optional; playback continues when the device has no output.
    }
  }

  play({ text }) {
    const context = this.context;
    if (!context || !text || context.state !== 'running') return;
    const now = context.currentTime;
    if (now - this.lastPlayTime < 0.12) return;
    this.stop();
    this.lastPlayTime = now;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 523.25;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => {
      this.voices.delete(gain);
      oscillator.disconnect();
      gain.disconnect();
    };
    this.voices.add(gain);
    oscillator.start(now);
    oscillator.stop(now + 0.17);
  }

  stop() {
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const gain of this.voices) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, 0.008);
    }
  }
}
