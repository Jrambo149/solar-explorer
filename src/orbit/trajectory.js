/**
 * Sampled spacecraft trajectories, alongside `kepler.js`.
 *
 * Pure module with no React and no three, following the `kepler.js` and
 * `followMath.js` precedent, so every claim here can be driven headlessly in
 * Node and checked against Horizons rather than eyeballed on screen.
 *
 * ## Why spacecraft need this at all
 *
 * Every other body in this app is six numbers and a solve: `positionAt` takes
 * Keplerian elements and returns a position for any instant, exactly, forever.
 * A spacecraft has no such description. It launches, coasts, burns, swings past
 * a planet and is captured, and the whole point of a gravity assist is that the
 * orbit *afterwards* is not the orbit before. No ellipse covers a trajectory,
 * so there is nothing to solve — the positions have to be looked up.
 *
 * So they are sampled from JPL Horizons at build time and baked. This is the
 * app's only body class whose positions are stored rather than computed, and
 * the cost is real: 75 craft come to a few hundred kilobytes where 465 other
 * bodies come to a few kilobytes. It buys the only thing that would be honest —
 * Voyager 2 actually turning at Jupiter, Saturn, Uranus and Neptune, rather
 * than a smooth curve drawn near them.
 *
 * ## Segments and frames
 *
 * A trajectory is a list of segments, each in its own **reference frame**, taken
 * from Eyes' own `parents` list. Voyager 1 is held by Earth at launch, the Sun
 * in cruise, Jupiter through the 1979 encounter, the Sun again, Saturn through
 * 1980, then the Sun for good.
 *
 * This matters for precision, not just for tidiness. Juno's orbit around
 * Jupiter is about 0.05 AU across at its tightest while Jupiter is 5 AU from
 * the Sun — storing that heliocentrically would spend the whole of a double's
 * precision on the 5 AU and leave the orbit itself in the noise. Held in
 * Jupiter's frame, the numbers are small and the orbit is exact. `Body.jsx`
 * already composes a satellite's position as parent plus offset, so a
 * spacecraft in a planet's frame is the same arrangement a moon already uses.
 *
 * ## Uniform steps, and why there is no binary search
 *
 * Each segment carries `t0`, `step` and a flat run of samples, so the index for
 * a given time is one subtraction and a divide. The obvious alternative —
 * storing a time per sample and binary searching — costs a `log n` per body per
 * frame and, more to the point, doubles the baked size by storing a number that
 * is already implied. Adaptive spacing is what would justify it, and
 * `fetch-spacecraft.mjs` deliberately does not adapt *within* a segment; it
 * chooses one step per segment appropriate to that segment's frame.
 *
 * ## Interpolation
 *
 * Catmull-Rom rather than linear. A trajectory sampled every few days is a
 * curve, and linear interpolation between those points shows as visible corners
 * wherever the path bends hardest — which is exactly at the encounters, the
 * part worth looking at. Catmull-Rom passes through every sample (so the baked
 * Horizons positions are reproduced exactly at the sample instants) and is
 * C1-continuous between them.
 *
 * At a segment's ends there is no fourth point to reach for, so the end sample
 * is duplicated. That is the standard clamped form and it makes the tangent at
 * the boundary one-sided, which is correct here: the next segment is in a
 * *different frame*, so there is no meaningful curve to be continuous with.
 */

import { J2000 } from './kepler.js'
import { elementPeriodDays, elementsCover, elementsFor } from './spacecraftElements.js'

/** Seconds in a day. Horizons and SPICE both count ET seconds past J2000. */
export const SECONDS_PER_DAY = 86400

/** ET seconds past J2000 -> Julian Date. */
export const jdFromEt = (et) => J2000 + et / SECONDS_PER_DAY

/** Julian Date -> ET seconds past J2000. */
export const etFromJd = (jd) => (jd - J2000) * SECONDS_PER_DAY

/**
 * The window a craft exists in, as Julian Dates.
 *
 * Before launch and after the end of the mission a spacecraft is not drawn at
 * all. The alternative — clamping to the first or last sample — would park
 * Cassini next to Saturn forever, and it has not been there since 2017.
 */
export function trajectoryWindow(craft) {
  const segments = craft.segments
  if (!segments.length) return null
  return { start: segments[0].t0, end: segments[segments.length - 1].t1 }
}

/** Whether the craft exists at this instant. */
export function isFlying(craft, jd) {
  const window = trajectoryWindow(craft)
  return window !== null && jd >= window.start && jd <= window.end
}

/**
 * The segment covering `jd`, or null outside the mission.
 *
 * Linear scan. The longest `parents` list in the roster is Lucy's twenty, most
 * are two to four, and a scan over four entries beats a binary search's
 * overhead comfortably — this runs once per craft per frame.
 */
export function segmentAt(craft, jd) {
  const segments = craft.segments
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (jd >= segment.t0 && jd <= segment.t1) return segment
  }
  return null
}

/**
 * Catmull-Rom through p1 and p2, with p0 and p3 as the surrounding tangent
 * points. `t` runs 0..1 from p1 to p2.
 */
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  )
}

/**
 * Position at `jd`, in AU, in the frame of the segment that covers it.
 *
 * Returns null outside the mission window. The frame is on the returned
 * object rather than implied, because the caller has to add the frame body's
 * own position and cannot know which body that is without being told.
 *
 * Writes into `out` to stay allocation-free — this runs once per craft per
 * frame, like `positionAt`.
 */
export function trajectoryAt(craft, jd, out = { x: 0, y: 0, z: 0, frame: null }) {
  const segment = segmentAt(craft, jd)
  if (!segment) {
    out.frame = null
    return null
  }
  return sampleSegment(segment, jd, out)
}

/**
 * Position at `jd` within a segment already known to cover it.
 *
 * Split out of `trajectoryAt` for the trail, which walks hundreds of instants
 * along one segment and would otherwise re-scan the segment list for every one
 * of them. Does not bounds-check `jd` against the segment: the index is clamped
 * either way, so a time slightly outside returns the nearest end rather than
 * reading past the array.
 */
export function sampleSegment(segment, jd, out = { x: 0, y: 0, z: 0, frame: null }) {
  const { samples, t0, step } = segment
  const count = samples.length / 3
  // Guard the degenerate single-sample segment: a few of Eyes' handoffs are
  // minutes apart (Juno's Io flybys are under four hours) and round to one
  // point at any sane step.
  if (count === 1) {
    out.x = samples[0]
    out.y = samples[1]
    out.z = samples[2]
    out.frame = segment.frame
    return out
  }

  const exact = (jd - t0) / step
  // Clamped rather than assumed in range: `segmentAt` bounds this to [t0, t1],
  // but t1 is stored to the nearest sample and floating point can put `exact` a
  // hair past the last index.
  const i1 = Math.min(Math.max(Math.floor(exact), 0), count - 2)
  const t = Math.min(Math.max(exact - i1, 0), 1)

  const i0 = Math.max(i1 - 1, 0)
  const i2 = i1 + 1
  const i3 = Math.min(i1 + 2, count - 1)

  out.x = catmullRom(samples[i0 * 3], samples[i1 * 3], samples[i2 * 3], samples[i3 * 3], t)
  out.y = catmullRom(
    samples[i0 * 3 + 1],
    samples[i1 * 3 + 1],
    samples[i2 * 3 + 1],
    samples[i3 * 3 + 1],
    t,
  )
  out.z = catmullRom(
    samples[i0 * 3 + 2],
    samples[i1 * 3 + 2],
    samples[i2 * 3 + 2],
    samples[i3 * 3 + 2],
    t,
  )
  out.frame = segment.frame
  return out
}

/**
 * The trajectory as a run of positions for drawing a path, newest last.
 *
 * Unlike `sampleOrbit`, this cannot return one closed loop: a trajectory is
 * open by definition, and it changes frame partway along. So it returns one
 * run **per segment**, each tagged with its frame, and `BodyPath` warps and
 * draws each against its own parent.
 *
 * `upTo` trims to the current instant, so a trail shows where a craft has been
 * rather than where it will go — the same reading as every other trail in the
 * app, and the one Eyes uses.
 */
export function sampleTrajectory(craft, upTo = Infinity, maxPerSegment = 512) {
  const runs = []
  for (const segment of craft.segments) {
    if (segment.t0 > upTo) break
    const { samples, t0, step } = segment
    const count = samples.length / 3
    const last =
      upTo >= segment.t1 ? count - 1 : Math.min(Math.max(Math.floor((upTo - t0) / step), 0), count - 1)
    if (last < 1) continue

    // Decimate rather than draw every sample: a segment can hold thousands of
    // points and a path a few hundred pixels long has no use for them.
    const stride = Math.max(1, Math.ceil((last + 1) / maxPerSegment))
    const points = []
    for (let i = 0; i <= last; i += stride) {
      points.push({ x: samples[i * 3], y: samples[i * 3 + 1], z: samples[i * 3 + 2] })
    }
    // Always finish on the live position so the path's head meets the model —
    // the same head-snap the Keplerian paths needed, and for the same reason.
    const tail = trajectoryAt(craft, Math.min(upTo, segment.t1))
    if (tail) points.push({ x: tail.x, y: tail.y, z: tail.z })

    if (points.length > 1) runs.push({ frame: segment.frame, points })
  }
  return runs
}

/**
 * Eyes' automatic trail length, in days.
 *
 * A third of the fleet leaves `trail.length` undefined, which means "derive it".
 * `TrailComponent._getAutoLength` takes the state vector and returns
 *
 *     2 * PI * |r x v| / |v|^2
 *
 * which is the period of a circular orbit with the craft's current angular
 * momentum and speed. For anything actually circular it is exactly the period —
 * radius r and speed v give `2 * PI * r * v / v^2`, or `2 * PI * r / v`. For a
 * cruising spacecraft it is not a period at all, because there is no orbit to
 * have one; it is a length that scales with how tightly the path is curving, so
 * a craft whipping around a planet gets a short trail and one coasting between
 * them gets a long one. That is the property worth having, and it is why this is
 * transcribed rather than replaced with something more principled.
 *
 * Eyes has a second branch for bodies carrying real orbital elements, using the
 * eccentricity and gravitational parameter from the ephemeris header. No
 * spacecraft here has those — they are sampled trajectories — so only the state
 * vector branch is implemented.
 *
 * Velocity comes from a central difference over the segment's own step. The
 * samples are all there is; differencing them is the only source of velocity in
 * a baked trajectory.
 */
const VELOCITY = { a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 } }

export function autoTrailDays(segment, jd) {
  const half = segment.step
  const before = sampleSegment(segment, Math.max(jd - half, segment.t0), VELOCITY.a)
  const after = sampleSegment(segment, Math.min(jd + half, segment.t1), VELOCITY.b)
  const span = Math.min(jd + half, segment.t1) - Math.max(jd - half, segment.t0)
  if (span <= 0) return null

  const vx = (after.x - before.x) / span
  const vy = (after.y - before.y) / span
  const vz = (after.z - before.z) / span
  const speedSq = vx * vx + vy * vy + vz * vz
  if (speedSq <= 0) return null

  const r = sampleSegment(segment, jd, VELOCITY.a)
  const hx = r.y * vz - r.z * vy
  const hy = r.z * vx - r.x * vz
  const hz = r.x * vy - r.y * vx
  const h = Math.sqrt(hx * hx + hy * hy + hz * hz)

  return (2 * Math.PI * h) / speedSq
}

/**
 * How far back the trail reaches from `jd`, in days, or null to draw all of it.
 *
 * The `coverages` are searched last-first because Eyes wires each one as a
 * `CoverageController` that sets the length on entry and restores the default on
 * exit — with overlapping windows, the one entered most recently wins, and the
 * list is authored in that order. Voyager 1's five entries overlap exactly this
 * way: a default of thirty years, fifty days across each of the two encounters,
 * and five years before them.
 */
/**
 * The element set to draw a craft from at `jd`, or null to use its samples.
 *
 * **One rule, in one place, because three call sites have to agree.** The craft
 * itself, its trail, and the trail's *length* each used to decide this
 * separately, and two of the three disagreed the moment a fit ran out: the
 * trail went on extrapolating the last known orbit while the craft dropped back
 * to the sampled path, and they were drawn 0.4 world units apart — a trail
 * hanging in space with no craft on the end of it.
 *
 * The rule:
 *
 * - **Inside the fit**, use it. That is what it is for.
 * - **Outside the fit but still in the frame it was made in**, use it anyway.
 *   `elementsAtEpoch` clamps to the nearest row and propagates it by its own
 *   stored mean motion, so this is the last measured orbit carried forward —
 *   which for a lunar orbiter a few days past the end of its table is far
 *   better than the sampled path, whose 110-hour step aliases a one-day orbit
 *   into nonsense.
 * - **In a different frame**, do not. A craft that has left lunar orbit for a
 *   heliocentric cruise is not doing anything its old lunar elements describe,
 *   and this is the guard that keeps the rule above from being nonsense rather
 *   than merely convenient.
 */
export function orbitAt(craft, jd) {
  const entry = elementsFor(craft.id)
  if (!entry) return null
  if (elementsCover(entry, jd)) return entry
  const segment = segmentAt(craft, jd)
  return segment && segment.frame === entry.frame ? entry : null
}

export function trailDays(craft, jd, config) {
  if (!config) return null

  for (let i = config.coverages.length - 1; i >= 0; i--) {
    const [days, from, to] = config.coverages[i]
    if (jd >= from && jd <= to) return days
  }
  if (config.days !== null) return config.days

  /*
   * An orbiter's automatic length is its period, and it must not be derived
   * from the samples.
   *
   * `autoTrailDays` differentiates the sampled path, which is exactly the thing
   * that is aliased for these craft — so it returned 41 days for Danuri's
   * two-hour orbit and 73 days for ARTEMIS P1's one-day orbit, and the trails
   * came out as hundreds of overlapping ellipses where Eyes draws one. The
   * elements carry the real period, so where they exist they answer this.
   *
   * Eyes' own formula is a stand-in for the period anyway — `2*PI*|r x v|/|v|^2`
   * is the period of the circular orbit matching the current state — so using
   * the actual period is what it was reaching for.
   */
  /*
   * The element tables are fetched with an end date, and that end arrives.
   *
   * ARTEMIS P1 and P2 were fitted to 2026-08-15, and on 2026-08-15 they fell
   * out of coverage and into `autoTrailDays` — which the note above says
   * plainly is wrong for exactly these craft, returning 73 days for a one-day
   * orbit. The trails went from one clean ellipse to seventy overlaid, with a
   * 107° corner where the aliasing folded the path back on itself. Nothing
   * about the spacecraft changed that morning, so neither should the trail:
   * `orbitAt` carries the last measured orbit forward while the craft is still
   * in the frame it was measured in.
   */
  const orbit = orbitAt(craft, jd)
  if (orbit) return elementPeriodDays(orbit, jd)

  const segment = segmentAt(craft, jd)
  return segment ? autoTrailDays(segment, jd) : null
}
