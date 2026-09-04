// Original, deterministic sound design. No samples, third-party music or voices.
// Run with Node.js: node scripts/make-soundtrack.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rate = 48000,
  duration = 15,
  count = rate * duration;
const left = new Float64Array(count),
  right = new Float64Array(count);
const tau = Math.PI * 2;
let seed = 2903;
const noise = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};
function add(start, length, fn, pan = 0) {
  const offset = Math.round(start * rate),
    n = Math.round(length * rate);
  for (let j = 0; j < n && offset + j < count; j++) {
    if (offset + j < 0) continue;
    const v = fn(j / rate, j / n);
    left[offset + j] += v * Math.sqrt((1 - pan) / 2);
    right[offset + j] += v * Math.sqrt((1 + pan) / 2);
  }
}
function key(start, hz, amp, pan = 0, length = 2.3) {
  add(
    start,
    length,
    (t, p) => {
      const attack = Math.min(1, t / 0.018),
        release = Math.min(1, (1 - p) * 9);
      const tone =
        Math.sin(tau * hz * t) +
        0.23 * Math.sin(tau * hz * 2.002 * t) +
        0.065 * Math.sin(tau * hz * 3 * t);
      return tone * amp * attack * release * Math.exp(-t * 2.2);
    },
    pan,
  );
}
// A minimal 120 BPM motif, with a quieter final brand hold.
const chords = [
  [220, 261.6256, 329.6276],
  [174.6141, 220, 261.6256],
  [130.8128, 164.8138, 195.9977],
  [195.9977, 246.9417, 293.6648],
];
for (let beat = 0; beat < 28; beat++) {
  const start = beat * 0.5,
    chord = chords[Math.floor(beat / 7) % 4];
  const level = start >= 11 ? 0.7 : 1;
  if (beat % 2 === 0) {
    add(
      start,
      0.24,
      (t) =>
        Math.sin(tau * (49 * t + (12 * (1 - Math.exp(-t * 32))) / 32)) *
        Math.exp(-t * 20) *
        0.23 *
        level,
    );
    key(start, chord[0] / 2, 0.14 * level, 0, 0.4);
  }
  key(start + 0.02, chord[beat % 3] * 2, 0.105 * level, beat % 2 ? -0.3 : 0.3);
  if (beat % 2)
    add(start, 0.1, (t) => noise() * Math.exp(-t * 70) * 0.043 * level, 0.18);
  if (beat % 4 === 0)
    chord.forEach((n, i) =>
      key(start + 0.02 * i, n, 0.064 * level, (i - 1) * 0.45, 2.8),
    );
}
for (const transition of [3, 7, 11]) {
  let filtered = 0;
  add(
    transition - 0.24,
    0.55,
    (t, p) => {
      filtered = filtered * 0.94 + noise() * 0.06;
      return filtered * Math.pow(Math.sin(Math.PI * p), 2) * 0.29;
    },
    -0.15,
  );
  key(transition + 0.02, 659.255, 0.038, 0.3, 0.75);
}
[220, 261.6256, 329.6276, 440].forEach((n, i) =>
  key(14, n, 0.045, (i - 1.5) * 0.2, 1),
);
let peak = 0;
for (let i = 0; i < count; i++)
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
const gain = 0.67 / Math.max(peak, 0.001);
const out = Buffer.alloc(44 + count * 4);
out.write("RIFF", 0);
out.writeUInt32LE(out.length - 8, 4);
out.write("WAVEfmt ", 8);
out.writeUInt32LE(16, 16);
out.writeUInt16LE(1, 20);
out.writeUInt16LE(2, 22);
out.writeUInt32LE(rate, 24);
out.writeUInt32LE(rate * 4, 28);
out.writeUInt16LE(4, 32);
out.writeUInt16LE(16, 34);
out.write("data", 36);
out.writeUInt32LE(count * 4, 40);
for (let i = 0; i < count; i++) {
  const time = i / rate,
    fade = Math.min(1, time / 0.03, (duration - time) / 0.6);
  out.writeInt16LE(Math.round(left[i] * gain * fade * 32767), 44 + i * 4);
  out.writeInt16LE(Math.round(right[i] * gain * fade * 32767), 46 + i * 4);
}
const path = fileURLToPath(
  new URL("../public/launch-soundtrack.wav", import.meta.url),
);
mkdirSync(fileURLToPath(new URL("../public/", import.meta.url)), {
  recursive: true,
});
writeFileSync(path, out);
console.log("Created 15-second original stereo soundtrack.");
