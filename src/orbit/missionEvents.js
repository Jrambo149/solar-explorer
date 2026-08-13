/**
 * What happened on a mission, found in the trajectory rather than typed in.
 *
 * The same principle as `events.js`: nothing here is transcribed from a mission
 * timeline. A flyby is a minimum of the distance to a body, an orbit is a run
 * of them, and the end of a mission is where the ephemeris stops. So the dates
 * cannot drift away from the scene — click "closest approach to Jupiter" and
 * the craft is at Jupiter, because one set of numbers produced both.
 *
 * ## The frames already say where the craft was
 *
 * A trajectory is a list of segments, each held in the frame of whatever body
 * dominates it — Eyes' own `parents` list. That list *is* the mission:
 *
 *     Voyager 1   earth → sun → jupiter → sun → saturn → sun
 *     Cassini     earth → sun → venus → sun → venus → sun → earth → sun → saturn
 *     Juno        earth → sun → earth → sun → jupiter → ganymede → jupiter → …
 *
 * Every encounter anyone would name is already a frame change, because a frame
 * change is what an encounter *is*: the moment another body takes over the
 * motion. So there is no need to sweep the planets looking for close passes
 * during the cruise — the cruise is the heliocentric segments, and by
 * construction nothing happens in them. That is worth stating because the
 * obvious implementation is the sweep, and it would be both slower and less
 * accurate than reading the structure that is already there.
 *
 * ## What is deliberately not claimed
 *
 * **Launch.** The first sample is a day or two after the real launch for every
 * craft measured, because that is where JPL's published ephemeris begins. So
 * this says "mission begins" and means it — the first position anyone has for
 * the craft — rather than printing a launch time that is out by thirty hours.
 *
 * **The end.** An ephemeris that stops in the past is a mission that ended:
 * Cassini's last sample is 15 September 2017, which is the Grand Finale to the
 * day. One that stops in the *future* is a horizon, not an ending — Juno's runs
 * out in 2028 and Juno is still flying. Only the first kind is reported, which
 * is why `now` is a parameter rather than a call to the clock: the answer
 * changes over time and the caller should be the one to say when "now" is.
 */

import { BODIES_BY_ID } from '../data/bodies.js'
import { LANDED_CRAFT } from '../data/landedCraft.js'
import { sampleSegment, trajectoryWindow } from './trajectory.js'

const KM_PER_AU = 149597870.7

/** Distance from the frame body's centre, in km, at `jd` within `segment`. */
const _at = { x: 0, y: 0, z: 0, frame: null }
function distanceKm(segment, jd) {
  sampleSegment(segment, jd, _at)
  return Math.hypot(_at.x, _at.y, _at.z) * KM_PER_AU
}

/**
 * Refine a bracketed minimum of the distance, to about a second.
 *
 * Golden-section rather than bisection, because there is no sign change to
 * bisect — a minimum is not a root. Forty iterations takes a bracket of a few
 * days down below a second, and the underlying curve is a Catmull-Rom through
 * the samples, so this is finding the minimum of what the app actually draws.
 */
function refineMinimum(segment, lo, hi) {
  const phi = (Math.sqrt(5) - 1) / 2
  let a = lo
  let b = hi
  let c = b - phi * (b - a)
  let d = a + phi * (b - a)
  for (let i = 0; i < 40; i++) {
    if (distanceKm(segment, c) < distanceKm(segment, d)) {
      b = d
      d = c
      c = b - phi * (b - a)
    } else {
      a = c
      c = d
      d = a + phi * (b - a)
    }
  }
  return (a + b) / 2
}

/**
 * Every local minimum of the distance to the frame body, in a segment.
 *
 * Walks the *samples* rather than a fixed time step: they are where the data
 * is, they are already spaced for the curvature of this segment, and a stride
 * chosen independently could step over the whole encounter — Juno's Io passes
 * last under four hours.
 */
function periapses(segment) {
  const count = segment.samples.length / 3
  if (count < 3) return []

  const found = []
  let previous = distanceKm(segment, segment.t0)
  let current = distanceKm(segment, segment.t0 + segment.step)

  for (let i = 2; i < count; i++) {
    const jd = segment.t0 + i * segment.step
    const next = distanceKm(segment, jd)
    if (current < previous && current <= next) {
      const at = refineMinimum(segment, jd - 2 * segment.step, jd)
      found.push({ jd: at, km: distanceKm(segment, at) })
    }
    previous = current
    current = next
  }
  return found
}

/**
 * How finely a segment has to be sampled before its periapsis means anything.
 *
 * Not a taste threshold — it sits in a gap that is actually in the data. Of the
 * 128 body-framed segments in the roster, 98 are encounters and every one of
 * them is stepped at 11.15 hours or finer; the other 30 are long stays and
 * every one is stepped at 19 hours or coarser. Nothing lands between.
 *
 * The distinction matters because a coarse segment's minimum is an artefact of
 * where the samples fell. Measured against published insertions: Mars Express's
 * first sampled periapsis is 43.7 days after the real one, Mars Odyssey's 30.2,
 * MAVEN's 13.6 — the capture orbit turns in a day or two and the samples are
 * six days apart, so what comes back is noise with a date on it.
 */
const RESOLVED_STEP_HOURS = 12

/**
 * The events of one craft, in time order.
 *
 * `now` decides whether a trajectory that stops is an ending or a horizon; see
 * the note at the top of the file.
 */
export function missionEventsFor(craft, now) {
  const window = trajectoryWindow(craft)
  if (!window) return []

  const events = [{ kind: 'mission-begins', craft: craft.id, jd: window.start }]

  const site = LANDED_CRAFT[craft.id]
  /** Bodies the craft is already at, so a stay is not announced twice. */
  const arrived = new Set()

  for (const [i, segment] of craft.segments.entries()) {
    if (segment.frame === 'sun') continue
    /*
     * The first segment is where the craft starts, not somewhere it arrives.
     * Every craft in the roster opens in Earth's frame for a day or two after
     * launch, and reporting that as "arrives at Earth" got the direction of
     * the whole mission backwards on its first line.
     */
    if (i === 0) continue
    const body = BODIES_BY_ID[segment.frame]
    if (!body) continue

    const resolved = segment.step * 24 <= RESOLVED_STEP_HOURS
    const found = resolved ? periapses(segment) : []

    /*
     * A resolved single encounter: the craft came, passed and left, and the
     * samples are close enough together to say when and how close. These are
     * good to the minute — New Horizons at Pluto comes out 11:49 UTC on 14
     * July 2015, and Juno's Europa pass at 354 km above the ice against a
     * published 352.
     */
    /*
     * And a pass close to a body it is already at is not a flyby, it is an
     * orbit. Eyes splits Juno's time at Jupiter into a segment per moon
     * encounter, and the Jupiter-framed slivers between them are single
     * perijoves — one came out as "flies past Jupiter, 21,336 km *below* the
     * cloud tops", which is both not an event and not a place.
     */
    if (resolved && found.length === 1 && !arrived.has(segment.frame)) {
      /*
       * How far the craft moves between samples, at the encounter — the
       * resolution of the answer, carried alongside it.
       *
       * The dates are excellent: New Horizons reaches Pluto at 11:49 UTC on 14
       * July 2015, to the minute, and all four of Voyager 2's grand-tour
       * encounters land on the published day. The *distances* are only as good
       * as the sampling, and the sampling varies by two orders of magnitude
       * across these encounters.
       *
       * Where the path is nearly straight the interpolation is superb — Juno's
       * Europa pass comes out 354 km above the ice against a published 352.
       * Where it bends hard it is not: an Earth gravity assist turns through a
       * perigee at 300 km altitude while the samples are twenty minutes and
       * twelve thousand kilometres apart, and the spline can dip below the
       * lowest real sample. Two of the forty-four come out *inside* the Earth.
       *
       * There is no predictor that separates the two — Juno's Europa pass and
       * Lucy's Earth pass have almost the same samples-per-periapsis and one is
       * exact while the other is 6,600 km wrong — so nothing is filtered on
       * this. It is published so the text can be honest about what it knows.
       */
      const half = segment.step / 2
      sampleSegment(segment, found[0].jd - half, _at)
      const ax = _at.x
      const ay = _at.y
      const az = _at.z
      sampleSegment(segment, found[0].jd + half, _at)
      const resolutionKm =
        Math.hypot(ax - _at.x, ay - _at.y, az - _at.z) * KM_PER_AU

      events.push({
        kind: 'flyby',
        craft: craft.id,
        body: segment.frame,
        jd: found[0].jd,
        km: found[0].km,
        // How far above the surface, which is how a flyby is usually quoted.
        altitudeKm: found[0].km - body.radiusKm,
        resolutionKm,
      })
      continue
    }

    /*
     * Otherwise it is a stay, and the honest event is the *handoff* — the
     * instant this body takes over the motion — rather than a periapsis the
     * samples cannot see. That is the arrival at the body's gravitational
     * sphere, and for nine of the twelve orbiters with a published insertion
     * date it lands within a day of it. It is deliberately not called an orbit
     * insertion: that is a burn, this app does not model burns, and for the
     * giant planets the two are weeks apart — Cassini crossed into Saturn's
     * sphere on 30 May 2004 and fired the engine on 1 July.
     *
     * Reported without a time of day for the same reason.
     */
    if (arrived.has(segment.frame)) continue
    // A craft that lands is announced by its landing, not by its arrival.
    if (site && site.body === segment.frame) continue
    arrived.add(segment.frame)
    events.push({
      kind: 'arrival',
      craft: craft.id,
      body: segment.frame,
      jd: segment.t0,
      // Whether it stayed, which is what tells an orbiter from a long approach.
      stayDays: segment.t1 - segment.t0,
    })
  }

  if (site) {
    events.push({
      kind: 'landing',
      craft: craft.id,
      body: site.body,
      jd: site.landed,
      lat: site.lat,
      lon: site.lon,
    })
    if (site.ended !== null) {
      events.push({ kind: 'mission-ends', craft: craft.id, jd: site.ended })
    }
  }

  // An ephemeris that stops in the past is an ending; one that stops in the
  // future is a horizon. A landed craft has already answered this above.
  if (!site && window.end < now) {
    events.push({ kind: 'mission-ends', craft: craft.id, jd: window.end })
  }

  return events.sort((a, b) => a.jd - b.jd)
}
