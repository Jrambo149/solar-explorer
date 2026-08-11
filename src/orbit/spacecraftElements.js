/**
 * Orbiters solved from elements rather than sampled.
 *
 * ## Why these thirteen are different
 *
 * Every other spacecraft in this app is a run of baked positions. That works
 * because a cruise between planets is smooth over days, so a few hundred samples
 * describe it. An orbit is the opposite case, and it defeats sampling in two
 * different ways.
 *
 * The first is speed. LRO goes round the Moon in about two hours against an
 * eighteen-year mission, and sampling that finely would take 3.4 million points
 * for one craft. Baked at a step of days instead, two things broke: Eyes draws
 * these craft with a trail of exactly one revolution, and one revolution fell
 * entirely between two stored samples, so nothing was drawn at all. Worse, the
 * *position* was wrong by 11,000-15,000 km, because interpolating a 2-hour orbit
 * across a 6-day step is not interpolation, it is aliasing, and the craft was
 * not on its own orbit.
 *
 * The second is eccentricity, and it hides better. Juno's orbit about Jupiter
 * takes 33 days against a 1.4-day step — twenty-three samples a revolution,
 * which sounds generous — but at e = 0.98 almost every one of them falls in the
 * slow apojove arc and the craft crosses the rest of the orbit between two of
 * them. The sampled path turned 114 degrees in a single step. Parker is the same
 * failure about the Sun at 116.
 *
 * Elements invert the problem. The orbit's *shape* — size, eccentricity,
 * inclination, node, argument of periapsis — drifts over weeks, so a weekly
 * epoch describes it to well inside a pixel. Only the phase moves quickly, and
 * a mean motion handles phase exactly. Six thousand numbers replace twenty-one
 * million.
 *
 * ## Mean anomaly is the one thing never interpolated
 *
 * At a weekly cadence M is aliased exactly as badly as position was — LRO turns
 * about eighty-four times between epochs, so the stored values are effectively
 * random points on a circle and lerping two of them is meaningless. Instead each
 * epoch's M is *propagated* forward by its own mean motion, which is what a mean
 * motion is for and is exact.
 *
 * Propagating from one epoch and coasting to the next is not good enough on its
 * own. The stored mean motion is right to a fraction of a percent, but a
 * fraction of a percent across ninety revolutions is tens of degrees of phase —
 * measured, it put MRO 1,621 km along its own orbit, because these craft do
 * real orbit maintenance and their mean motion is not actually constant.
 *
 * So the phase is **pinned at both ends**. The stored `M` at each epoch is the
 * truth; the stored `n` is used only to work out how many whole revolutions fall
 * between them, which is the one thing the two `M` values cannot tell you. From
 * that, a mean motion that lands exactly on both is solved and used across the
 * interval. Each interval then begins on its own epoch's value, so there is no
 * seam at the handover either, and what is left is only the orbit's departure
 * from uniform motion *within* one interval.
 *
 * ## And a gravity assist is not an interval at all
 *
 * Everything above assumes an interval is one orbit slowly becoming another.
 * Across a flyby it is two different orbits with an impulse between them, and
 * interpolating produces one the craft was never on. That case is detected and
 * taken whole from a single epoch — see `SHAPE_JUMP`.
 */

import { positionAt } from './kepler.js'
import { SPACECRAFT_ELEMENTS } from '../data/spacecraftElements.js'

/** Whether this craft is solved from elements rather than sampled positions. */
export const hasElements = (id) => SPACECRAFT_ELEMENTS[id] !== undefined

/** Its element set, or null. */
export const elementsFor = (id) => SPACECRAFT_ELEMENTS[id] ?? null

/** Whether `jd` is inside the epochs we hold. */
export function elementsCover(entry, jd) {
  const rows = entry.rows
  return jd >= rows[0][0] && jd <= rows[rows.length - 1][0]
}

/**
 * The change in semi-major axis, as a fraction, that marks an interval as a
 * discontinuity rather than a drift.
 *
 * Two percent. The median interval across all thirteen craft moves `a` by
 * between a ten-thousandth and a half of one percent, and the flybys move it by
 * ten to eighty, so for the heliocentric craft this is drawn across three orders
 * of magnitude of empty space.
 *
 * It is not a clean gap for the close orbiters: about 150 of their 20,000
 * intervals cross it, most of them MRO's and TGO's. Those are aerobraking passes
 * and station-keeping burns, and they are genuine steps too — an interval that
 * really did change orbit is one this branch should take. What it costs there is
 * the phase pinning, which is worth having: over half an interval MRO turns
 * twenty-two times, and a stored mean motion good to a few hundredths of a
 * percent carries that to about a degree and a half, or a hundred kilometres
 * along a 3,700 km orbit. Small, and only on the intervals where the alternative
 * is interpolating across a burn.
 */
const SHAPE_JUMP = 0.02

/** Shortest signed difference between two angles, in degrees. */
function shortWay(degrees) {
  let d = degrees % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

/*
 * Reused across every call.
 *
 * `positionAt` wants the JPL table's shape — six elements and six per-century
 * rates — so the rates are zero and `T` is zero, which makes `elementsAt` an
 * identity and leaves the solver and the three rotations doing exactly what they
 * do for every other body. Reusing it rather than writing a second Kepler
 * solve is deliberate: that one is checked against Horizons for twenty bodies,
 * and a second copy would be a second thing to get subtly wrong.
 */
const SCRATCH = {
  a: 0, aDot: 0,
  e: 0, eDot: 0,
  i: 0, iDot: 0,
  L: 0, LDot: 0,
  varpi: 0, varpiDot: 0,
  Omega: 0, OmegaDot: 0,
}

/**
 * The osculating elements at `jd`, in the JPL table's shape.
 *
 * Returns the shared scratch object; copy anything you need to keep.
 */
export function elementsAtEpoch(entry, jd) {
  const rows = entry.rows
  const last = rows.length - 1
  const step = (rows[last][0] - rows[0][0]) / last

  const exact = (jd - rows[0][0]) / step
  const k = Math.min(Math.max(Math.floor(exact), 0), last - 1)
  const u = Math.min(Math.max(exact - k, 0), 1)

  const A = rows[k]
  const B = rows[k + 1]

  /*
   * A gravity assist is not an interval to interpolate across.
   *
   * Everything below assumes the two epochs describe one orbit slowly becoming
   * another, which is true of nearly every interval in the file — the median
   * step moves the semi-major axis by about a thousandth of a percent.
   *
   * A flyby is not that. OSIRIS-REx passes the Earth and its heliocentric
   * semi-major axis goes from 0.762 AU to 1.067 between two consecutive epochs;
   * Parker does the same thing at Venus seven times. Blended, the craft spends
   * three and a half days on an orbit of an intermediate size it was never on,
   * and against Horizons it averages **13.6 million kilometres** out across the
   * interval, peaking at 22 million.
   *
   * So an interval that jumps is not blended at all. Both ends of it are real
   * orbits; the nearer one is taken whole — shape and phase together,
   * propagated by its own stored mean motion — and the craft flies its true
   * pre-flyby orbit up to the halfway point and its true post-flyby orbit
   * after. Measured over the same interval that is 31,000 km mean, better than
   * four hundred fold, and the residue is concentrated in the hours around
   * closest approach where the craft is inside the Earth's well and no
   * heliocentric ellipse describes it anyway.
   *
   * Taking it *whole* is the part that matters, and half-measures are worse
   * than doing nothing. Snapping only the shape while leaving the phase pinned
   * to both stored epochs puts one orbit's geometry with another's timing, and
   * that measured 41 million kilometres — three times worse than the blend it
   * was meant to fix.
   */
  if (Math.abs(B[1] - A[1]) > A[1] * SHAPE_JUMP) {
    const R = u < 0.5 ? A : B
    SCRATCH.a = R[1]
    SCRATCH.e = R[2]
    SCRATCH.i = R[3]
    SCRATCH.Omega = R[4]
    SCRATCH.varpi = R[4] + R[5]
    SCRATCH.L = SCRATCH.varpi + R[6] + R[7] * (jd - R[0])
    return SCRATCH
  }

  // Shape: linear between epochs. These move by fractions of a degree and
  // fractions of a kilometre in a week.
  SCRATCH.a = A[1] + (B[1] - A[1]) * u
  SCRATCH.e = A[2] + (B[2] - A[2]) * u
  SCRATCH.i = A[3] + (B[3] - A[3]) * u
  const node = A[4] + shortWay(B[4] - A[4]) * u
  const argp = A[5] + shortWay(B[5] - A[5]) * u

  /*
   * Phase: a mean motion that hits both stored epochs exactly.
   *
   * The two `M` values fix where the craft is at each end but say nothing about
   * how many whole turns it made in between — `shortWay` deliberately throws
   * that away. The stored mean motion supplies only that integer, which is the
   * one thing it is reliable enough for: it has to be right to within half a
   * revolution out of the ninety in an interval, a tolerance of half a percent,
   * and it is good to a few hundredths of that.
   */
  const h = B[0] - A[0]
  const drift = shortWay(B[6] - A[6])
  const revolutions = Math.round((A[7] * h - drift) / 360)
  const meanMotion = (drift + revolutions * 360) / h
  const M = A[6] + meanMotion * (jd - A[0])

  SCRATCH.Omega = node
  // The solver takes longitude of periapsis and mean longitude, both measured
  // from the equinox rather than from the node.
  SCRATCH.varpi = node + argp
  SCRATCH.L = SCRATCH.varpi + M
  return SCRATCH
}

/** Position at `jd`, in AU, in the element set's own frame. */
export function elementPositionAt(entry, jd, out = { x: 0, y: 0, z: 0 }) {
  return positionAt(elementsAtEpoch(entry, jd), 0, out)
}

/** The orbital period at `jd`, in days. */
export function elementPeriodDays(entry, jd) {
  const rows = entry.rows
  const last = rows.length - 1
  const step = (rows[last][0] - rows[0][0]) / last
  const k = Math.min(Math.max(Math.round((jd - rows[0][0]) / step), 0), last)
  const n = rows[k][7]
  return n > 0 ? 360 / n : 0
}
