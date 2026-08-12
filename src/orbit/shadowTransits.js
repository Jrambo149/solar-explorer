/**
 * Jupiter's shadow transits, found on demand.
 *
 * The one class of event in this app that is *not* baked, and the reason is
 * arithmetic: there are about eight hundred contacts a year, so two and a half
 * centuries of them would be two hundred thousand rows in the bundle to save a
 * search that takes a few milliseconds over the week actually on screen. Every
 * other event is rare enough to be worth precomputing; these are common enough
 * to be worth finding.
 *
 * They are also the most *watchable* thing here — a hard black dot crossing the
 * cloud tops, visible in a small telescope, and the app draws it from the same
 * geometry that finds it. See `scene/realShadow.js`.
 */

import { BODIES_BY_ID } from '../data/bodies.js'
import { REAL_SHADOW_CASTERS, realShadowsOn } from '../scene/realShadow.js'
import { SUN_RADIUS_KM, shadowOnSphere } from './eclipse.js'

/** The Galileans, in the slot order `realShadowsOn` fills. */
const CASTERS = [...REAL_SHADOW_CASTERS.jupiter]

/**
 * Is this moon's shadow touching Jupiter's disc?
 *
 * The target sphere is inflated by the umbra's own radius, so this switches at
 * first and last contact of the shadow's *edge* — which is what an observer
 * sees and what published tables list. Tracking the axis instead runs a couple
 * of minutes late at ingress and early at egress.
 *
 * The umbra is narrower than the moon that casts it, because the Sun is not a
 * point and the cone converges over the four hundred thousand kilometres to
 * Jupiter. Using the moon's radius instead would be wrong by about a minute.
 */
function touching(jd, slot) {
  const R = BODIES_BY_ID.jupiter.radiusKm
  const shadows = realShadowsOn('jupiter', jd)
  const o = shadows.occulters[slot]

  const sun = { x: shadows.sun.x * R, y: shadows.sun.y * R, z: shadows.sun.z * R }
  const occulter = { x: o.x * R, y: o.y * R, z: o.z * R }

  const moonRadius = o.radius * R
  const toSun = Math.hypot(sun.x - occulter.x, sun.y - occulter.y, sun.z - occulter.z)
  const toJupiter = Math.hypot(occulter.x, occulter.y, occulter.z)
  const umbra = moonRadius - (toJupiter * (SUN_RADIUS_KM - moonRadius)) / toSun

  return !!shadowOnSphere({
    sun,
    occulter,
    occulterRadius: moonRadius,
    targetRadius: R + umbra,
  })
}

/** Refine a bracketed contact to about a second. */
function bisect(lo, hi, slot, wanted) {
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2
    if (touching(mid, slot) === wanted) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

/**
 * Shadow transits beginning in the `days` after `from`.
 *
 * The step is ten minutes, which is short against the shortest transit here —
 * Io's, at a bit over two hours — by a factor of thirteen. It could not be much
 * coarser: a step longer than a transit steps straight over one, and the
 * failure is silent, since what comes back is still a list of real transits on
 * correct dates.
 */
export function nextShadowTransits(from, days = 6) {
  const step = 10 / 1440
  const found = []

  for (let slot = 0; slot < CASTERS.length; slot++) {
    let was = touching(from, slot)
    let ingress = was ? from : null

    for (let jd = from + step; jd <= from + days; jd += step) {
      const now = touching(jd, slot)
      if (now === was) continue

      if (now) ingress = bisect(jd - step, jd, slot, true)
      else if (ingress !== null) {
        const egress = bisect(jd - step, jd, slot, false)
        found.push({
          kind: 'shadow-transit',
          body: CASTERS[slot],
          jd: ingress,
          hours: (egress - ingress) * 24,
        })
        ingress = null
      }
      was = now
    }
  }

  return found.sort((a, b) => a.jd - b.jd)
}
