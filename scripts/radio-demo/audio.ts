// Self-generated preview tone; no library files or upstream music are accessed.
export class DemoAudio {
  private context?: AudioContext
  private gain?: GainNode
  private filter?: BiquadFilterNode
  private voices: OscillatorNode[] = []
  private analyzer?: AnalyserNode
  private revision = 0
  private pauseTimer?: number
  private disposed = false

  async update(on: boolean, volume: number, bass: number, channel: number): Promise<void> {
    if (this.disposed) return
    const revision = ++this.revision
    clearTimeout(this.pauseTimer)
    if (!this.context && !on) return
    if (!this.context) {
      this.context = new AudioContext()
      this.gain = this.context.createGain()
      this.gain.gain.value = 0
      this.filter = this.context.createBiquadFilter()
      this.filter.type = 'lowshelf'
      this.filter.frequency.value = 240
      this.analyzer = this.context.createAnalyser()
      this.analyzer.fftSize = 256
      this.filter.connect(this.gain).connect(this.analyzer).connect(this.context.destination)
      for (const frequency of [130.81, 164.81, 196]) {
        const voice = this.context.createOscillator()
        voice.type = 'sine'
        voice.frequency.value = frequency
        voice.connect(this.filter)
        voice.start()
        this.voices.push(voice)
      }
    }
    if (on) await this.context.resume()
    if (revision !== this.revision) return
    const now = this.context.currentTime
    this.gain!.gain.setTargetAtTime(on ? volume * 0.025 : 0, now, 0.03)
    this.filter!.gain.setTargetAtTime((bass - 0.5) * 12, now, 0.03)
    this.voices.forEach((voice, index) => {
      voice.frequency.setTargetAtTime(
        [130.81, 164.81, 196][index] * 2 ** ((channel - 88) / 48),
        now,
        0.04,
      )
    })
    if (!on)
      this.pauseTimer = window.setTimeout(() => {
        if (revision === this.revision) void this.context?.suspend()
      }, 120)
  }

  snapshot() {
    const samples = new Float32Array(256)
    this.analyzer?.getFloatTimeDomainData(samples)
    return {
      contextState: this.context?.state ?? 'not-created',
      rms: Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length),
      gain: this.gain?.gain.value ?? 0,
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.revision++
    clearTimeout(this.pauseTimer)
    this.voices.forEach((voice) => voice.stop())
    void this.context?.close()
  }
}
