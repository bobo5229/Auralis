// Original instrumental fixture: mellow chords and a sparse melody, no sampled audio or vocals.
import { writeFile } from 'node:fs/promises'
const rate = 22050
const duration = 32
const pcm = new Float32Array(rate * duration)
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12)
function note(start, length, midi, amplitude, pad = false) {
  const frequency = hz(midi)
  const from = Math.round(start * rate)
  const count = Math.round(length * rate)
  for (let i = 0; i < count && from + i < pcm.length; i++) {
    const t = i / rate
    const attack = Math.min(1, t / (pad ? 0.6 : 0.018))
    const release = Math.min(1, (length - t) / (pad ? 1.2 : 0.3))
    const envelope = pad ? attack * release * 0.55 : attack * release * Math.exp(-t * 1.6)
    const signal =
      Math.sin(2 * Math.PI * frequency * t) +
      0.18 * Math.sin(4 * Math.PI * frequency * t) +
      0.05 * Math.sin(6 * Math.PI * frequency * t)
    pcm[from + i] += amplitude * envelope * signal
  }
}
const chords = [
  [48, 55, 60, 64],
  [45, 52, 57, 60],
  [41, 48, 53, 57],
  [43, 50, 55, 59],
]
for (let bar = 0; bar < 8; bar++) {
  const chord = chords[bar % chords.length]
  chord.forEach((midi) => note(bar * 4, 4.8, midi, 0.035, true))
  for (let beat = 0; beat < 8; beat++) note(bar * 4 + beat * 0.5, 1.7, chord[beat % 4] + 12, 0.07)
}
const melody = [
  [2, 0.5, 72],
  [2.5, 0.7, 74],
  [3.2, 0.9, 76],
  [4.1, 1.9, 79],
  [7, 0.7, 76],
  [7.7, 1, 74],
  [8.7, 0.7, 72],
  [9.4, 1.6, 71],
  [12, 0.5, 69],
  [12.5, 0.8, 72],
  [13.3, 0.8, 76],
  [14.1, 2.3, 74],
  [18, 0.5, 72],
  [18.5, 1.5, 76],
  [20, 0.7, 79],
  [20.7, 2.7, 76],
  [25, 0.8, 74],
  [25.8, 0.9, 72],
  [26.7, 0.8, 71],
  [27.5, 1.5, 72],
]
for (const [start, length, midi] of melody) note(start, length + 0.35, midi, 0.085)
const bytes = Buffer.alloc(44 + pcm.length * 2)
bytes.write('RIFF', 0)
bytes.writeUInt32LE(bytes.length - 8, 4)
bytes.write('WAVEfmt ', 8)
bytes.writeUInt32LE(16, 16)
bytes.writeUInt16LE(1, 20)
bytes.writeUInt16LE(1, 22)
bytes.writeUInt32LE(rate, 24)
bytes.writeUInt32LE(rate * 2, 28)
bytes.writeUInt16LE(2, 32)
bytes.writeUInt16LE(16, 34)
bytes.write('data', 36)
bytes.writeUInt32LE(pcm.length * 2, 40)
for (let i = 0; i < pcm.length; i++) {
  const fade = Math.min(1, i / rate, (pcm.length - i) / (rate * 2))
  bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i] * fade)) * 32760), 44 + i * 2)
}
await writeFile(new URL('./demo.wav', import.meta.url), bytes)
console.log('Generated original 32-second instrumental fixture (mono PCM, 22050 Hz).')
