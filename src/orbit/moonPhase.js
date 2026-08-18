import { earthMoonSun } from './eclipse.js'
import { MOON_PHASES, SYNODIC_DAYS } from '../data/moonPhases.js'

/**
 * Which phase the Moon is actually in, at a given moment.
 *
 * Not a lookup and not a countdown from a remembered new Moon. The app already
 * solves the Earth's orbit and Meeus' lunar theory every frame in order to draw
 * eclipses; the phase is those same two vectors and an angle between them, so
 * it costs nothing and it cannot disagree with the Moon on screen.
 *
 * That is the whole reason this is worth doing properly. A phase strip built
 * from a fixed epoch plus 29.53 days would drift against the drawn Moon — the
 * synodic month varies by up to half a day either side of its mean — and the
 * app would be showing a crescent while claiming a gibbous.
 */

const DEGREES = 180 / Math.PI

/**
 * The **elongation**: the angle Sun-Earth-Moon, 0 at new and 180 at full.
 *
 * This is the quantity the phase is defined by, and the lit fraction follows
 * from it directly rather than being a separate measurement.
 */
function elongation(sun, moon) {
  const dot = sun.x * moon.x + sun.y * moon.y + sun.z * moon.z
  const lengths = Math.hypot(sun.x, sun.y, sun.z) * Math.hypot(moon.x, moon.y, moon.z)
  return Math.acos(Math.max(-1, Math.min(1, dot / lengths)))
}

/**
 * Whether the Moon is filling or emptying.
 *
 * The elongation alone cannot say: it runs 0 to 180 and back, so a half-lit
 * Moon is 90 degrees whether it is on its way up or down. The sign of the
 * Moon's ecliptic longitude *relative to the Sun's* settles it — ahead of the
 * Sun is waxing, behind it is waning — and that is a cross product's z
 * component, which is one line.
 *
 * Getting this wrong is the classic phase bug and it is invisible half the
 * time: first quarter and last quarter are the same shape mirrored, and half
 * the world does not notice which way round a half Moon faces.
 */
function waxing(sun, moon) {
  return sun.x * moon.y - sun.y * moon.x > 0
}

/**
 * The Moon's state at a Julian date: how lit it is, which way it is going, and
 * which of the eight named phases it is nearest.
 *
 * `earthElements` is passed in rather than imported for the reason
 * `earthMoonSun` takes it — this file has no business deciding which orbit the
 * Earth is on.
 */
export function moonPhaseAt(jd, earthElements) {
  const { sun, moon } = earthMoonSun(jd, earthElements)
  const angle = elongation(sun, moon)

  /*
   * The lit fraction of the disc as we see it, which is not the fraction of
   * the sphere that is lit — half of that is always lit. It is the projected
   * area, and it comes out as a cosine.
   */
  const illumination = (1 - Math.cos(angle)) / 2

  /*
   * Age in days, from the elongation rather than from a clock. Waxing runs 0 to
   * half a month; waning carries on from there, which is why it is subtracted
   * from a whole month rather than measured forward.
   */
  const fraction = angle / (2 * Math.PI)
  const age = (waxing(sun, moon) ? fraction : 1 - fraction) * SYNODIC_DAYS

  /*
   * The nearest named phase, by age around the cycle. Wrapped, so a Moon two
   * hours before new is "New Moon" rather than "Waning Crescent" — the cycle
   * has no end to fall off.
   */
  let nearest = MOON_PHASES[0]
  let best = Infinity
  for (const phase of MOON_PHASES) {
    const gap = Math.abs(((age - phase.age + SYNODIC_DAYS * 1.5) % SYNODIC_DAYS) - SYNODIC_DAYS / 2)
    if (gap < best) {
      best = gap
      nearest = phase
    }
  }

  return {
    illumination,
    age,
    waxing: waxing(sun, moon),
    elongationDegrees: angle * DEGREES,
    phase: nearest,
  }
}

/**
 * The **phase angle**: the Moon's ecliptic longitude minus the Sun's, 0 to 360.
 *
 * This, and not the elongation above, is what defines the *instant* of a phase.
 * New Moon is the moment the two longitudes are equal, and the elongation
 * cannot express that: the Moon's orbit is inclined 5.1°, so the 3D angle
 * between them bottoms out at whatever the ecliptic latitude happens to be —
 * 3.4° at the January 2026 new Moon — and only reaches zero when there is a
 * solar eclipse. Searching for a root of the elongation would find new Moons
 * only in eclipse seasons and nothing at all in between.
 *
 * Longitude difference passes cleanly through zero every month, which is why
 * every almanac defines the phases with it.
 */
export function phaseAngleAt(jd, earthElements) {
  const { sun, moon } = earthMoonSun(jd, earthElements)
  const difference = Math.atan2(moon.y, moon.x) - Math.atan2(sun.y, sun.x)
  return ((difference * DEGREES) % 360 + 360) % 360
}

/** Signed difference between two angles, in (-180, 180]. */
const wrap180 = (degrees) => ((((degrees + 180) % 360) + 360) % 360) - 180

/**
 * When the phase angle next reaches `target` degrees, after `jd`.
 *
 * A first guess from the mean rate, then secant refinement. The mean rate is
 * good to a few hours over a month — the Moon runs fast at perigee and slow at
 * apogee — so the guess alone would be wrong by long enough to print the
 * wrong day, and a couple of iterations bring it to well under a minute.
 *
 * Iterating on `wrap180` rather than on the raw angle is what keeps the search
 * from falling apart at the 360-to-0 seam, which is exactly where new Moon is.
 */
export function nextPhaseAfter(jd, target, earthElements) {
  const RATE = 360 / SYNODIC_DAYS

  // Step off the current instant so that asking at a phase finds the *next*
  // one rather than returning where we already are.
  let t = jd + 0.05
  t += (((target - phaseAngleAt(t, earthElements)) % 360) + 360) % 360 / RATE

  let previous = t - 0.5
  let fPrevious = wrap180(phaseAngleAt(previous, earthElements) - target)
  for (let i = 0; i < 8; i++) {
    const f = wrap180(phaseAngleAt(t, earthElements) - target)
    if (Math.abs(f) < 1e-6) break
    const slope = (f - fPrevious) / (t - previous)
    if (!Number.isFinite(slope) || slope === 0) break
    previous = t
    fPrevious = f
    t -= f / slope
  }
  return t
}

/** The next occurrence of each of the eight principal phases, after `jd`. */
export function upcomingPhases(jd, earthElements) {
  return MOON_PHASES.map((phase, index) => ({
    id: phase.id,
    jd: nextPhaseAfter(jd, index * 45, earthElements),
  }))
}
