/**
 * Finding the moments worth looking at.
 *
 * An eclipse, an opposition, a ring-plane crossing: each one is a *date* at
 * which the solar system does something, and none of them is stored anywhere.
 * They are consequences of the same orbits and orientations the app already
 * solves, so they are searched for rather than looked up — which means they
 * cannot disagree with what the scene draws. Jump the clock to an eclipse found
 * here and the eclipse is on screen, because the same geometry decided both.
 *
 * ## Everything here is a search, and searches have a resolution
 *
 * Each event is a root or an extremum of some continuous quantity — the
 * separation of two bodies, the elevation of the Earth above a plane, the
 * difference of two longitudes. The pattern is always: scan coarsely for the
 * bracket, then refine inside it. The coarse step is the only parameter that
 * can silently lose events, so each search sets it from the physics rather than
 * taking a default: a step must be short compared with the thing it is looking
 * for, or two roots fall inside one interval and cancel.
 *
 * ## Baked, not computed at load
 *
 * `scripts/bake-events.mjs` runs these once over the app's whole window and
 * writes `src/data/events.js`. Two centuries of eclipses is a few seconds of
 * searching, which is fine in a build step and not fine in a page load. The
 * exception is Jupiter's shadow transits: there are eight hundred a year, so
 * they are found live in a short window around whatever date is on screen.
 */

import { centuriesSinceJ2000, positionAt } from './kepler.js'
import {
  EARTH_RADIUS_KM,
  MOON_RADIUS_KM,
  SUN_RADIUS_KM,
  earthMoonSun,
  lunarEclipseAt,
  solarEclipseAt,
  surfacePoint,
  toWorld,
} from './eclipse.js'

const DEGREES = Math.PI / 180
const TWO_PI = Math.PI * 2

/** Wrap to (-π, π]. Used everywhere a longitude difference is a root. */
const wrap = (radians) => {
  const r = radians % TWO_PI
  return r > Math.PI ? r - TWO_PI : r <= -Math.PI ? r + TWO_PI : r
}

/**
 * Every sign change of `f`, refined by bisection.
 *
 * `step` has to be shorter than the closest two roots ever come, or a pair
 * cancels inside one interval and both vanish — which is the failure mode of
 * every search in this file and never announces itself.
 */
export function findZeros(f, from, to, step, maxStep = Math.PI) {
  const found = []
  let prev = f(from)

  for (let jd = from + step; jd <= to; jd += step) {
    const here = f(jd)
    /*
     * A wrapped angle changes sign twice per turn and only one of them is a
     * root: the other is the seam at ±180°, where the value leaps the whole
     * range. Rejecting brackets that jump by more than `maxStep` tells them
     * apart, and without it every opposition was also reported as a
     * conjunction — Jupiter and Saturn came back "in conjunction" at a
     * separation of 179.8°.
     */
    const jumped = Math.abs(here - prev) > maxStep
    if (!jumped && prev !== 0 && here !== 0 && prev < 0 !== here < 0) {
      let lo = jd - step
      let hi = jd
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2
        if (f(mid) < 0 === prev < 0) lo = mid
        else hi = mid
      }
      found.push((lo + hi) / 2)
    }
    prev = here
  }

  return found
}

/**
 * Every local minimum of `f`, refined by golden-section search.
 *
 * Bisection is no use here: a minimum is not a sign change, and the derivative
 * is not available. The bracket is any three consecutive samples with the
 * middle lowest.
 */
export function findMinima(f, from, to, step) {
  const found = []
  let a = f(from)
  let b = f(from + step)

  for (let jd = from + 2 * step; jd <= to; jd += step) {
    const c = f(jd)
    if (b < a && b < c) found.push(refineMinimum(f, jd - 2 * step, jd))
    a = b
    b = c
  }

  return found
}

const PHI = (Math.sqrt(5) - 1) / 2

function refineMinimum(f, lo, hi) {
  let x1 = hi - PHI * (hi - lo)
  let x2 = lo + PHI * (hi - lo)
  let f1 = f(x1)
  let f2 = f(x2)

  // Sixty iterations takes a two-day bracket to well under a second.
  for (let i = 0; i < 60; i++) {
    if (f1 < f2) {
      hi = x2
      x2 = x1
      f2 = f1
      x1 = hi - PHI * (hi - lo)
      f1 = f(x1)
    } else {
      lo = x1
      x1 = x2
      f1 = f2
      x2 = lo + PHI * (hi - lo)
      f2 = f(x2)
    }
  }

  return (lo + hi) / 2
}

/**
 * How far the Moon's shadow axis passes from the Earth's centre, km.
 *
 * Separate from `solarEclipseAt`, which returns nothing at all when the axis
 * misses — right for "where did the shadow land", useless for a search, which
 * has to see the quantity go through its minimum rather than fall off a cliff.
 */
export function shadowAxisMiss(jd, earthElements) {
  const { sun, moon } = earthMoonSun(jd, earthElements)

  const ax = moon.x - sun.x
  const ay = moon.y - sun.y
  const az = moon.z - sun.z
  const len = Math.hypot(ax, ay, az)
  const dot = (moon.x * ax + moon.y * ay + moon.z * az) / len

  return Math.hypot(
    moon.x - (dot * ax) / len,
    moon.y - (dot * ay) / len,
    moon.z - (dot * az) / len,
  )
}

/**
 * Is the Moon between the Earth and the Sun?
 *
 * The distance above is a distance from a *line*, and a line has no ends: the
 * Sun–Moon axis passes just as close to the Earth at full moon as at new,
 * because it is the same line with the Earth on the other side of it. So the
 * miss distance has a minimum every fortnight, and searching it alone found
 * every lunar eclipse and reported it as a solar one — with the correct date
 * and time, which is what made the list look plausible at a glance.
 *
 * The Earth has to lie *beyond* the Moon along the axis, which is this dot
 * product being negative.
 */
function moonIsSunward(jd, earthElements) {
  const { sun, moon } = earthMoonSun(jd, earthElements)
  const ax = moon.x - sun.x
  const ay = moon.y - sun.y
  const az = moon.z - sun.z
  return moon.x * ax + moon.y * ay + moon.z * az < 0
}

/**
 * Solar eclipses between two dates.
 *
 * Searched as minima of the shadow axis's miss distance. The step is six hours
 * — the Moon takes 29.5 days between new moons and the miss distance has one
 * minimum per lunation, so this is oversampled by two orders of magnitude and
 * cannot skip one.
 *
 * A minimum is an eclipse when the *penumbra* reaches the Earth, not when the
 * axis strikes it: most solar eclipses are partial somewhere, seen from ground
 * the axis misses entirely, and a search that required a central hit would drop
 * about a third of them.
 */
export function solarEclipses(from, to, earthElements, basisFor) {
  const miss = (jd) => shadowAxisMiss(jd, earthElements)

  return findMinima(miss, from, to, 0.25)
    .map((jd) => {
      if (!moonIsSunward(jd, earthElements)) return null

      const { sun, moon } = earthMoonSun(jd, earthElements)
      const moonDist = Math.hypot(moon.x, moon.y, moon.z)
      const sunDist = Math.hypot(sun.x, sun.y, sun.z)

      /*
       * The penumbra's radius where the Moon is, projected on to the Earth.
       *
       * The penumbra is the diverging cone from the far edge of the Sun past
       * the near edge of the Moon, so its half-angle is (R☉ + R☾) over their
       * separation, and it has already opened to this by the time it arrives.
       */
      const spread = (SUN_RADIUS_KM + MOON_RADIUS_KM) / (sunDist - moonDist)
      const penumbra = MOON_RADIUS_KM + spread * moonDist
      if (miss(jd) > penumbra + EARTH_RADIUS_KM) return null

      const central = solarEclipseAt(jd, earthElements)
      const at =
        central && basisFor
          ? surfacePoint(central.point, basisFor.basis, basisFor.meridian(jd))
          : null

      return {
        kind: 'solar-eclipse',
        jd,
        type: central ? (central.total ? 'total' : 'annular') : 'partial',
        latitude: at?.latitude ?? null,
        longitude: at?.longitude ?? null,
      }
    })
    .filter(Boolean)
}

/**
 * Lunar eclipses between two dates.
 *
 * The same shape of search on the other geometry: minima of the Moon's distance
 * from the shadow axis, which `lunarEclipseAt` reports whether or not anything
 * is happening. Penumbral ones are included — they are what the published
 * catalogues count, and leaving them out would make any comparison against one
 * look like missing events.
 */
export function lunarEclipses(from, to, earthElements) {
  const separation = (jd) => lunarEclipseAt(jd, earthElements).separationKm

  return findMinima(separation, from, to, 0.25)
    .map((jd) => {
      const at = lunarEclipseAt(jd, earthElements)
      if (at.phase === 'none') return null
      return {
        kind: 'lunar-eclipse',
        jd,
        type: at.phase,
        umbralMagnitude: at.umbralMagnitude,
      }
    })
    .filter(Boolean)
}

/** Geocentric ecliptic longitude of a body, radians. */
function geocentricLongitude(elements, earthElements, jd) {
  const T = centuriesSinceJ2000(jd)
  const p = positionAt(elements, T)
  const e = positionAt(earthElements, T)
  return Math.atan2(p.y - e.y, p.x - e.x)
}

/** Geocentric ecliptic longitude of the Sun, radians. */
function sunLongitude(earthElements, jd) {
  const e = positionAt(earthElements, centuriesSinceJ2000(jd))
  return Math.atan2(-e.y, -e.x)
}

/**
 * Oppositions: the outer planet opposite the Sun, so it rises as the Sun sets.
 *
 * The moment the geocentric longitudes differ by exactly 180°, which is the
 * definition every almanac uses. It is also when the planet is nearest and
 * biggest, which is why it is the date anyone points a telescope on.
 *
 * Meaningless for Mercury and Venus, which are never opposite the Sun — they
 * are inside the Earth's orbit — and the caller is expected to know that rather
 * than this returning a confident empty list.
 */
export function oppositions(elements, earthElements, from, to) {
  const offset = (jd) =>
    wrap(geocentricLongitude(elements, earthElements, jd) - sunLongitude(earthElements, jd) - Math.PI)

  // Two days. The fastest of these is Mars at about half a degree a day
  // relative to the Sun, so a root is never close to another.
  return findZeros(offset, from, to, 2).map((jd) => ({ kind: 'opposition', jd }))
}

/**
 * Greatest elongations: Mercury and Venus at their furthest from the Sun.
 *
 * The only dates either is worth looking for, and the reason they are events at
 * all: an inner planet never leaves the Sun's neighbourhood, so it is visible
 * only in the twilight around the two turning points of its swing. East is the
 * evening star, west the morning one.
 *
 * Found as maxima of the elongation angle rather than roots of anything, so the
 * step has to be short compared with the swing — Mercury's whole apparition is
 * about six weeks.
 */
export function greatestElongations(elements, earthElements, from, to) {
  const elongation = (jd) => {
    const T = centuriesSinceJ2000(jd)
    const p = positionAt(elements, T)
    const e = positionAt(earthElements, T)

    const px = p.x - e.x
    const py = p.y - e.y
    const pz = p.z - e.z
    const sx = -e.x
    const sy = -e.y
    const sz = -e.z

    const dot = px * sx + py * sy + pz * sz
    const mag = Math.hypot(px, py, pz) * Math.hypot(sx, sy, sz)
    return Math.acos(Math.max(-1, Math.min(1, dot / mag)))
  }

  // Minima of the negated angle, so one primitive serves both directions.
  return findMinima((jd) => -elongation(jd), from, to, 1).map((jd) => {
    const separation = elongation(jd) / DEGREES
    const east = wrap(
      geocentricLongitude(elements, earthElements, jd) - sunLongitude(earthElements, jd),
    ) > 0

    return {
      kind: 'greatest-elongation',
      jd,
      degrees: separation,
      side: east ? 'east' : 'west',
    }
  })
}

/**
 * Conjunctions of two planets, as seen from the Earth.
 *
 * Geocentric longitude equality — the pair at their closest in the sky rather
 * than in space, since the event is something you look at. Jupiter and Saturn
 * do this every twenty years and the 2020 one closed to a sixth of a degree,
 * which is the sort of thing the list exists to find.
 */
export function conjunctions(a, b, earthElements, from, to) {
  const offset = (jd) =>
    wrap(geocentricLongitude(a, earthElements, jd) - geocentricLongitude(b, earthElements, jd))

  return findZeros(offset, from, to, 2).map((jd) => {
    const T = centuriesSinceJ2000(jd)
    const pa = positionAt(a, T)
    const pb = positionAt(b, T)
    const e = positionAt(earthElements, T)

    const va = { x: pa.x - e.x, y: pa.y - e.y, z: pa.z - e.z }
    const vb = { x: pb.x - e.x, y: pb.y - e.y, z: pb.z - e.z }
    const dot = va.x * vb.x + va.y * vb.y + va.z * vb.z
    const mag = Math.hypot(va.x, va.y, va.z) * Math.hypot(vb.x, vb.y, vb.z)

    return {
      kind: 'conjunction',
      jd,
      degrees: Math.acos(Math.max(-1, Math.min(1, dot / mag))) / DEGREES,
    }
  })
}

/**
 * Ring-plane crossings: the moment Earth passes through Saturn's ring plane.
 *
 * The rings vanish, because they are twenty metres thick and edge-on. It
 * happens twice in Saturn's 29-year year, and sometimes three times when the
 * geometry is near-tangent and Earth's own motion carries it back and forth
 * across the plane — which is why the search is a plain sign change and the
 * result can come in threes.
 *
 * `pole` is the planet's rotation axis in the world frame, so this reads the
 * same orientation the rings are drawn with and cannot disagree with them.
 */
export function ringPlaneCrossings(elements, earthElements, pole, from, to) {
  const opening = (jd) => {
    const T = centuriesSinceJ2000(jd)
    const s = positionAt(elements, T)
    const e = positionAt(earthElements, T)
    const v = toWorld({ x: e.x - s.x, y: e.y - s.y, z: e.z - s.z })
    const mag = Math.hypot(v.x, v.y, v.z)
    return Math.asin((v.x * pole.x + v.y * pole.y + v.z * pole.z) / mag)
  }

  return findZeros(opening, from, to, 1).map((jd) => ({ kind: 'ring-plane-crossing', jd }))
}

/**
 * The AU-to-kilometre conversion, for reporting an approach in units a person
 * uses. An astronomical unit is a defined constant, not a measurement.
 */
const KM_PER_AU = 149597870.7

/**
 * Close approaches: when a small body passes near a planet.
 *
 * The only event kind here whose subject is a *pair of moving things* rather
 * than an alignment seen from the Earth. An opposition is a matter of angle and
 * happens on a schedule; an approach is a matter of distance and happens when
 * two independent orbits happen to bring their occupants near each other.
 *
 * ## The search is two-pass, and has to be
 *
 * A close approach is a very narrow minimum. Apophis crosses the Earth's
 * neighbourhood at about 7 km/s relative, so it covers half a million
 * kilometres in a day — a single-pass search at any step coarse enough to run
 * over two and a half centuries would step straight over the bottom of the
 * well, or worse, find a spurious one on the shoulder.
 *
 * So: a coarse sweep finds every local minimum of the distance, which at a
 * two-day step reliably brackets each *encounter* even when it badly misplaces
 * the moment within it; then each candidate under a generous cut is refined by
 * golden section over that bracket, which converges on the true minimum. Only
 * then is the distance tested against the real threshold.
 *
 * ## What this can and cannot claim
 *
 * The **date** is the app's own geometry, found the same way every other event
 * here is found, and is worth stating. The **distance** is not: the elements
 * behind it are piecewise-linear fits good to a few arcminutes, which at the
 * Earth's distance is hundreds of thousands of kilometres — larger than the
 * approach distance itself for the close ones. So the distance is returned for
 * ranking and for the checks to measure, and a caller that wants to *print* a
 * separation should print a published one.
 */
export function closeApproaches(elements, planetElements, from, to, options = {}) {
  const { coarse = 2, bracket = 0.25, within = 0.05 } = options

  const separation = (jd) => {
    const T = centuriesSinceJ2000(jd)
    const a = positionAt(elements, T)
    const b = positionAt(planetElements, T)
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
  }

  const found = []
  for (const candidate of findMinima(separation, from, to, coarse)) {
    /*
     * Refined again over a tighter bracket around the coarse answer.
     *
     * `findMinima` already golden-sections its two-day window, and for a slow
     * approach that is the end of it. For a fast one the coarse sampling can
     * leave the true minimum outside the bracket it chose, so the second pass
     * re-brackets around the result and looks again with a quarter-day step.
     * Cheap — it runs only for the handful that pass the coarse cut.
     */
    if (separation(candidate) > within * 4) continue

    let best = candidate
    let bestDistance = separation(candidate)
    for (let jd = candidate - coarse; jd <= candidate + coarse; jd += bracket) {
      const d = separation(jd)
      if (d < bestDistance) {
        bestDistance = d
        best = jd
      }
    }

    const refined = findMinima(separation, best - bracket, best + bracket, bracket / 8)
    for (const jd of refined.length ? refined : [best]) {
      const distance = separation(jd)
      if (distance <= within) found.push({ kind: 'close-approach', jd, au: distance })
    }
  }

  /*
   * One entry per encounter. The two passes can each land on the same minimum
   * from different sides, and a refinement that converges to within minutes of
   * an earlier one is the same event twice, not two passes a few minutes apart.
   */
  const unique = []
  for (const event of found.sort((a, b) => a.jd - b.jd)) {
    const last = unique[unique.length - 1]
    if (last && event.jd - last.jd < 1) {
      if (event.au < last.au) unique[unique.length - 1] = event
      continue
    }
    unique.push(event)
  }

  return unique.map((e) => ({ ...e, km: e.au * KM_PER_AU }))
}
