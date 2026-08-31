const fs = require("fs");
const path = require("path");

const RATE = 22050;
const OUTPUT_DIR = path.resolve(__dirname, "../assets/sounds");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeWav(notes, totalSeconds, amplitude = 0.42) {
  const sampleCount = Math.ceil(totalSeconds * RATE);
  const samples = new Float64Array(sampleCount);

  for (const note of notes) {
    const start = Math.floor(note.start * RATE);
    const end = Math.min(sampleCount, Math.ceil((note.start + note.duration) * RATE));
    const attack = Math.min(0.025, note.duration * 0.2);
    const release = Math.min(0.12, note.duration * 0.35);

    for (let index = start; index < end; index += 1) {
      const t = index / RATE - note.start;
      let envelope = 1;
      if (attack > 0 && t < attack) envelope = t / attack;
      if (release > 0 && note.duration - t < release) {
        envelope = Math.min(envelope, Math.max(0, (note.duration - t) / release));
      }
      const phaseTime = t + (note.vibrato ? 0.002 * Math.sin(2 * Math.PI * 5 * t) : 0);
      const fundamental = Math.sin(2 * Math.PI * note.frequency * phaseTime);
      const harmonic = 0.22 * Math.sin(4 * Math.PI * note.frequency * phaseTime);
      samples[index] += amplitude * note.volume * envelope * (fundamental + harmonic) * 0.82;
    }
  }

  let peak = 1;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const scale = peak > 0.95 ? 0.95 / peak : 1;
  const dataLength = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(RATE, 24);
  buffer.writeUInt32LE(RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const pcm = Math.round(clamp(samples[index] * scale, -1, 1) * 32767);
    buffer.writeInt16LE(pcm, 44 + index * 2);
  }
  return buffer;
}

const sounds = {
  "letsgoride_notification.wav": {
    total: 0.72,
    notes: [
      { start: 0.00, duration: 0.24, frequency: 659.25, volume: 0.82 },
      { start: 0.20, duration: 0.34, frequency: 987.77, volume: 0.72 },
    ],
  },
  "letsgoride_ride_request.wav": {
    total: 1.78,
    notes: [
      { start: 0.00, duration: 0.25, frequency: 523.25, volume: 0.85 },
      { start: 0.22, duration: 0.27, frequency: 659.25, volume: 0.92 },
      { start: 0.46, duration: 0.40, frequency: 783.99, volume: 1.00, vibrato: true },
      { start: 1.00, duration: 0.22, frequency: 659.25, volume: 0.72 },
      { start: 1.20, duration: 0.42, frequency: 987.77, volume: 0.92, vibrato: true },
    ],
  },
  "letsgoride_courier_request.wav": {
    total: 1.78,
    notes: [
      { start: 0.00, duration: 0.22, frequency: 440.00, volume: 0.85 },
      { start: 0.18, duration: 0.25, frequency: 659.25, volume: 0.92 },
      { start: 0.40, duration: 0.32, frequency: 554.37, volume: 0.90, vibrato: true },
      { start: 0.84, duration: 0.22, frequency: 440.00, volume: 0.75 },
      { start: 1.02, duration: 0.26, frequency: 739.99, volume: 0.95 },
      { start: 1.25, duration: 0.38, frequency: 659.25, volume: 0.90, vibrato: true },
    ],
  },
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
for (const [filename, definition] of Object.entries(sounds)) {
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), makeWav(definition.notes, definition.total));
}

module.exports = { makeWav, sounds };
