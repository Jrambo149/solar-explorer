import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as framePriority from './framePriority'
import { EPOCH_RANGE } from '../data/orbitalElements'
import { simClock, useStore, viewScroll } from '../store/useStore'

/** How often the date readout is refreshed, in seconds. */
const DISPLAY_INTERVAL = 0.25

/**
 * Advances the simulation clock — once per frame, for the whole scene.
 *
 * Every body reads `simClock.jd` in its own `useFrame` and computes its
 * position from it. That only works if the clock moves exactly once per frame,
 * before anything reads it: if each body advanced its own copy, they would
 * accumulate different amounts of time and slowly spread out. R3F runs
 * `useFrame` callbacks in mount order, and this component is mounted first in
 * `Scene`, so the ordering holds.
 *
 * The clock lives outside React (see `useStore.js`) because it changes 60 times
 * a second and drives nothing that React renders. The one thing React does want
 * — the date on screen — is copied across four times a second, which is often
 * enough to look live and rare enough to cost nothing.
 */
export default function SimulationClock() {
  const sinceDisplay = useRef(0)

  useFrame((_, delta) => {
    const { paused, timeRate, setDisplayJD } = useStore.getState()

    // Clamp so a backgrounded tab doesn't jump the clock by however long it was
    // hidden the moment it comes back.
    const dt = Math.min(delta, 0.1)

    /*
     * Time eases to a stop as the dossier arrives.
     *
     * The split view is a *portrait* of one body, and a portrait with the rest
     * of the solar system wheeling about behind it reads as a mistake — most of
     * all at the high rates, where the background is visibly swirling while you
     * try to read. Whatever the clock was doing is not what that screen is for.
     *
     * Scaling the rate rather than latching a pause is what keeps it from
     * lurching: time slows over the same scroll the shot moves on and comes
     * back the same way, and because the clock is only ever advanced (never
     * assigned a target) nothing has to be restored when you scroll up. The
     * date on the timeline is simply where you left it.
     *
     * The body you came to see is not frozen with it — `Body.jsx` gives the
     * selected one a turntable spin over the same range, so the thing that
     * stops moving is the background and the thing that starts is the subject.
     */
    if (!paused) {
      const next = simClock.jd + timeRate * dt * (1 - viewScroll.p)
      // Hitting the edge of the element table's validity window stops the clock
      // rather than letting it run on into positions that would be quietly
      // wrong. See EPOCH_RANGE.
      simClock.jd = Math.min(EPOCH_RANGE.maxJD, Math.max(EPOCH_RANGE.minJD, next))
    }

    sinceDisplay.current += delta
    if (sinceDisplay.current >= DISPLAY_INTERVAL) {
      sinceDisplay.current = 0
      setDisplayJD(simClock.jd)
    }
  }, framePriority.CLOCK)

  return null
}
