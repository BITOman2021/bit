// Scans public/audio/voice/<lineId>.wav (16-bit PCM WAV) and writes
// src/audio/voice-manifest.json with each recording's duration and a per-frame
// loudness envelope (drives Loli's speech motion and the music ducking).
// Line ids come from src/data/storyboard.json (e.g. s1_l1 ... s6_l2).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const board = JSON.parse(fs.readFileSync(path.join(root, 'src/data/storyboard.json'), 'utf8'));
const voiceDir = path.join(root, 'public/audio/voice');
const fps = board.fps;

function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let off = 12;
  let fmt;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') {
      fmt = {format: b.readUInt16LE(body), channels: b.readUInt16LE(body + 2), rate: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14)};
    } else if (id === 'data') {
      if (!fmt || fmt.format !== 1 || fmt.bits !== 16) throw new Error('expected 16-bit PCM WAV');
      const n = Math.floor(size / 2 / fmt.channels);
      const mono = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let c = 0; c < fmt.channels; c++) s += b.readInt16LE(body + (i * fmt.channels + c) * 2);
        mono[i] = s / fmt.channels / 32768;
      }
      return {rate: fmt.rate, samples: mono};
    }
    off = body + size + (size % 2);
  }
  throw new Error('no data chunk');
}

const lines = {};
const ids = board.scenes.flatMap((s) => s.dialogue.map((l) => ({...l, scene: s.id})));
for (const l of ids) {
  const file = path.join(voiceDir, `${l.id}.wav`);
  if (!fs.existsSync(file)) continue;
  const {rate, samples} = readWav(file);
  const duration = samples.length / rate;
  const per = rate / fps;
  const env = [];
  for (let f = 0; f * per < samples.length; f++) {
    let acc = 0;
    const a = Math.floor(f * per);
    const z = Math.min(samples.length, Math.floor((f + 1) * per));
    for (let i = a; i < z; i++) acc += samples[i] * samples[i];
    env.push(Math.sqrt(acc / Math.max(1, z - a)));
  }
  const peak = Math.max(1e-6, ...env);
  const slot = l.to - l.from;
  if (duration > slot + 0.3) console.warn(`! ${l.id}: recording ${duration.toFixed(2)}s exceeds its ${slot.toFixed(2)}s slot`);
  lines[l.id] = {file: `audio/voice/${l.id}.wav`, duration: +duration.toFixed(3), env: env.map((v) => +Math.min(1, v / peak).toFixed(3))};
  console.log(`voice ${l.id}: ${duration.toFixed(2)}s`);
}
fs.writeFileSync(path.join(root, 'src/audio/voice-manifest.json'), JSON.stringify({generatedBy: 'scripts/scan-voice.mjs', lines}, null, 1) + '\n');
console.log(`${Object.keys(lines).length}/${ids.length} voice lines found in public/audio/voice/`);
