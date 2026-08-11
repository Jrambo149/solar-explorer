import { useEffect } from 'react'

/**
 * A small synthesized ambient drone — a few detuned sine partials through a
 * slow filter sweep. Generated with WebAudio rather than shipped as a file so
 * the app stays fully self-contained and adds no download weight.
 *
 * The AudioContext is created lazily when the user enables sound, which also
 * satisfies browser autoplay policies (it is always a response to a gesture).
 */
export function useAmbientAudio(enabled) {
  useEffect(() => {
    if (!enabled) return

    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return

    const ctx = new Ctx()
    const master = ctx.createGain()
    master.gain.value = 0.0001
    master.connect(ctx.destination)

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 520
    filter.Q.value = 0.8
    filter.connect(master)

    // A low root plus a fifth and an octave, each slightly detuned so the
    // partials beat against one another and the pad never sits still.
    const partials = [
      { freq: 55, gain: 0.5, detune: 0 },
      { freq: 82.5, gain: 0.28, detune: 6 },
      { freq: 110, gain: 0.22, detune: -5 },
      { freq: 164.8, gain: 0.1, detune: 9 },
    ]

    const oscillators = partials.map(({ freq, gain, detune }) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.detune.value = detune
      const g = ctx.createGain()
      g.gain.value = gain
      osc.connect(g).connect(filter)
      osc.start()
      return osc
    })

    // Slow filter sweep gives the drone a sense of drift.
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.045
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 260
    lfo.connect(lfoGain).connect(filter.frequency)
    lfo.start()

    master.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 2.2)

    return () => {
      // Fade out before tearing anything down, otherwise stopping the
      // oscillators mid-cycle produces an audible click.
      const now = ctx.currentTime
      master.gain.cancelScheduledValues(now)
      master.gain.setValueAtTime(master.gain.value, now)
      master.gain.linearRampToValueAtTime(0.0001, now + 0.6)

      setTimeout(() => {
        oscillators.forEach((osc) => osc.stop())
        lfo.stop()
        ctx.close()
      }, 700)
    }
  }, [enabled])
}

/**
 * A short, soft blip played when a planet is selected.
 *
 * Shares one lazily-created AudioContext — browsers cap how many can exist at
 * once, so spawning a fresh one per click eventually throws.
 */
let blipCtx = null

export function playSelectSound() {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return
  if (!blipCtx) blipCtx = new Ctx()
  const ctx = blipCtx
  // Safari suspends the context when it loses focus.
  if (ctx.state === 'suspended') ctx.resume()

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(660, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(1180, ctx.currentTime + 0.12)

  gain.gain.setValueAtTime(0.0001, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.055, ctx.currentTime + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.24)

  osc.connect(gain).connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 0.26)
}
