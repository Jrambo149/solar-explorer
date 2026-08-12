/**
 * Keplerian orbital mechanics.
 *
 * Deliberately free of React and three.js. Everything here is plain numbers in
 * and plain numbers out, which means it can be driven from a Node script and
 * checked against JPL Horizons without a browser — the same approach that
 * proved `src/scene/followMath.js`. Given that the entire point of this module
 * is that the planets are where they really are, being able to test it in
 * isolation is not optional.
 *
 * Units throughout: distances in AU, angles in radians (the element tables are
 * in degrees and are converted on the way in), time as a Julian Date.
 */

/** Julian Date of the J2000.0 epoch: 2000 January 1, 12:00 TT. */
export const J2000 = 2451545.0

/** A Julian century. Element rates in the JPL table are per century. */
export const DAYS_PER_CENTURY = 36525

/** Julian Date of the Unix epoch, 1970 January 1, 00:00. */
const JD_UNIX_EPOCH = 2440587.5

const MS_PER_DAY = 86400000
const DEG = Math.PI / 180
const TWO_PI = Math.PI * 2

/**
 * Where an open trajectory is cut off for drawing, in AU.
 *
 * Just past Neptune's 30. See the note in `sampleOrbit` — a hyperbola has no
 * natural extent, so this is a framing decision and not a property of the orbit.
 */
export const OPEN_ORBIT_MAX_AU = 36

/**
 * ΔT, the gap between the clock on the wall and the clock the sky keeps, in
 * seconds.
 *
 * Universal Time is tied to the Earth's rotation, which is not a good clock —
 * it wanders with the tides, the core and the mass of the ice caps. Terrestrial
 * Time is uniform, and every ephemeris and rotation model is written in it. The
 * two were together around 1900 and have drifted about 70 seconds apart since.
 *
 * Nothing here needed it until the prime meridians landed. Positions do not
 * care: the Earth moves 0.0008° along its orbit in 70 seconds. *Rotation* cares
 * a great deal — 70 seconds is 0.29° of Earth turning, 32 km of ground at the
 * equator, and 0.70° of Jupiter. Feeding UTC to the IAU rotation model left
 * exactly that much error, and it showed up as a residual against Horizons
 * whose size, per body, was precisely that body's rotation in 70 seconds.
 *
 * These are the Espenak–Meeus polynomials, the standard fit, in the segments
 * that cover this app's 1800–2050 window. The last segment is an extrapolation
 * rather than a measurement — the Earth's spin cannot be predicted — and it
 * currently runs a few seconds long against the observed value, which is 0.03°
 * of Earth rotation and below anything drawn here.
 */
export function deltaTSeconds(jd) {
  // Calendar year, near enough: these fits are quoted against a decimal year
  // and are smooth on the scale of a day.
  const y = 2000 + (jd - J2000) / 365.25

  if (y < 1860) {
    const t = (y - 1800) / 100
    return (
      13.72 -
      33.2447 * t +
      68.612 * t ** 2 +
      4111.6 * t ** 3 -
      37436 * t ** 4 +
      121272 * t ** 5 -
      169900 * t ** 6 +
      87500 * t ** 7
    )
  }
  if (y < 1900) {
    const t = y - 1860
    return (
      7.62 +
      0.5737 * t -
      0.251754 * t ** 2 +
      0.01680668 * t ** 3 -
      0.0004473624 * t ** 4 +
      t ** 5 / 233174
    )
  }
  if (y < 1920) {
    const t = y - 1900
    return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4
  }
  if (y < 1941) {
    const t = y - 1920
    return 21.2 + 0.84493 * t - 0.0761 * t ** 2 + 0.0020936 * t ** 3
  }
  if (y < 1961) {
    const t = y - 1950
    return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547
  }
  if (y < 1986) {
    const t = y - 1975
    return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718
  }
  if (y < 2005) {
    const t = y - 2000
    return (
      63.86 +
      0.3345 * t -
      0.060374 * t ** 2 +
      0.0017275 * t ** 3 +
      0.000651814 * t ** 4 +
      0.00002373599 * t ** 5
    )
  }
  const t = y - 2000
  return 62.92 + 0.32217 * t + 0.005589 * t ** 2
}

/** The same instant in Terrestrial Time, which is what the sky is written in. */
export const terrestrialTime = (jd) => jd + deltaTSeconds(jd) / 86400

/** @param {Date|number} date a Date, or milliseconds since the Unix epoch. */
export function julianDate(date) {
  const ms = typeof date === 'number' ? date : date.getTime()
  return JD_UNIX_EPOCH + ms / MS_PER_DAY
}

/** Inverse of {@link julianDate}. */
export function dateFromJulian(jd) {
  return new Date((jd - JD_UNIX_EPOCH) * MS_PER_DAY)
}

/** Julian centuries between J2000 and `jd`. This is the `T` the tables want. */
export function centuriesSinceJ2000(jd) {
  return (jd - J2000) / DAYS_PER_CENTURY
}

/** Wrap an angle in radians to [-π, π]. */
export function wrapAngle(radians) {
  const wrapped = radians % TWO_PI
  if (wrapped > Math.PI) return wrapped - TWO_PI
  if (wrapped < -Math.PI) return wrapped + TWO_PI
  return wrapped
}

/**
 * Solves Kepler's equation `E - e·sin(E) = M` for the eccentric anomaly.
 *
 * Newton–Raphson. It converges quadratically and, for the near-circular orbits
 * of the planets, is essentially exact after three iterations — but the loop is
 * written to run until it actually converges rather than a fixed count, because
 * highly eccentric orbits are the whole reason this project moved to real
 * elements. A comet at e = 0.97 near perihelion needs far more work than Venus
 * at e = 0.007, and silently under-iterating there would put it in the wrong
 * place with no error to notice.
 *
 * @param {number} M mean anomaly, radians
 * @param {number} e eccentricity, 0 <= e < 1
 */
/**
 * Hyperbolic Kepler: `M = e·sinh H − H`, solved for H.
 *
 * The comets need this and nothing else does. Four of the thirteen are on open
 * trajectories — Elenin, ISON and Siding Spring at e just over 1, and 3I/ATLAS
 * at e = 6.14, which arrived from outside the solar system and is leaving again.
 *
 * Two starting guesses, because one does not cover the range. `asinh(M/e)` is
 * the textbook choice and is excellent once the orbit is decisively hyperbolic,
 * but it is poor near perihelion when e is barely above 1 — where the equation
 * is nearly the parabolic cubic and `sinh H − H` has lost its linear term to
 * cancellation. Three of these four sit exactly there: ISON's e − 1 is 5.1e-6.
 * So for that corner the cubic `H³/6 + (e−1)H = M` is solved outright by
 * Cardano and handed to Newton, which then converges in a couple of steps.
 *
 * No `wrapAngle`: a hyperbolic mean anomaly is not periodic. It runs from minus
 * infinity to plus infinity, once, and wrapping it would fold the outbound leg
 * back onto the inbound one.
 */
function solveHyperbolic(M, e) {
  if (M === 0) return 0

  let H
  if (e < 1.01 && Math.abs(M) < 1) {
    // H³ + pH + q = 0, from H³/6 + (e−1)H − M = 0.
    const p = 6 * (e - 1)
    const q = -6 * M
    const disc = Math.sqrt((q * q) / 4 + (p * p * p) / 27)
    H = Math.cbrt(-q / 2 + disc) + Math.cbrt(-q / 2 - disc)
  } else {
    H = Math.asinh(M / e)
  }

  for (let i = 0; i < 60; i++) {
    const dH = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1)
    H -= dH
    if (Math.abs(dH) < 1e-12) break
  }
  return H
}

/** True when the orbit does not close — `a` is negative and the body leaves. */
export const isOpenOrbit = (el) => el.e >= 1

/**
 * How far along an open trajectory to draw, as a hyperbolic anomaly.
 *
 * `OPEN_ORBIT_MAX_AU` sets the nominal extent, but it cannot be the whole
 * answer: **the path has to contain the body**. ʻOumuamua is 53.7 AU out and
 * receding, so a path cut at 36 stopped well short of it — the trail ended in
 * empty space with the nucleus nowhere near, which is not a cosmetic problem
 * but the drawn curve simply not covering where the object is.
 *
 * It is not only ʻOumuamua. Elenin and ISON are at 33.7 and 32.2 AU today and
 * still climbing, so both cross the cut within a few years of scrubbing. Any
 * fixed distance is wrong eventually for a body that never comes back.
 *
 * So the range is the nominal cut *or* the body's own station with a margin,
 * whichever is further. The margin leaves visible path ahead of the nucleus
 * rather than ending exactly on it, so the trail reads as something the body is
 * travelling along rather than as a line that happens to stop there.
 *
 * Shared by `sampleOrbit` and by `BodyPath`'s head station, which have to agree
 * about the range or the head lands at the wrong index.
 */
const OPEN_ORBIT_MARGIN = 1.15

export function openOrbitRange(el, T) {
  const { a, e, L, varpi } = elementsAt(el, T)
  const cut = Math.acosh((OPEN_ORBIT_MAX_AU / Math.abs(a) + 1) / e)
  const here = Math.abs(solveKepler(L - varpi, e))
  return Math.max(cut, here * OPEN_ORBIT_MARGIN)
}

export function solveKepler(M, e) {
  if (e >= 1) return solveHyperbolic(M, e)

  const m = wrapAngle(M)

  // For high eccentricity, starting at M can land Newton in a flat region where
  // the first step overshoots wildly. This starting guess is the standard one
  // and keeps the iteration inside the well.
  let E = e < 0.8 ? m : Math.PI * Math.sign(m || 1)

  for (let i = 0; i < 30; i++) {
    const dE = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E))
    E -= dE
    if (Math.abs(dE) < 1e-12) break
  }

  return E
}

/**
 * The six elements evaluated at time `T`, converted to radians.
 *
 * The JPL table gives each element at J2000 plus a linear rate per century,
 * which is what lets a six-number table stand in for an ephemeris across
 * 1800–2050: it is a straight-line fit to the slow precession of each orbit.
 */
export function elementsAt(el, T) {
  return {
    a: el.a + el.aDot * T,
    e: el.e + el.eDot * T,
    i: (el.i + el.iDot * T) * DEG,
    L: (el.L + el.LDot * T) * DEG,
    varpi: (el.varpi + el.varpiDot * T) * DEG,
    Omega: (el.Omega + el.OmegaDot * T) * DEG,
  }
}

/**
 * Heliocentric position in the J2000 ecliptic frame, in AU.
 *
 * Right-handed, with +X toward the vernal equinox and +Z toward the north
 * ecliptic pole. Writes into `out` to keep this allocation-free — it runs once
 * per body per frame.
 */
export function positionAt(el, T, out = { x: 0, y: 0, z: 0 }) {
  const { a, e, i, L, varpi, Omega } = elementsAt(el, T)

  // Mean anomaly is the mean longitude less the longitude of perihelion.
  const E = solveKepler(L - varpi, e)

  /*
   * Position in the orbital plane, with +x' toward perihelion.
   *
   * The hyperbolic case is the same construction with circular functions traded
   * for their hyperbolic counterparts, and it needs no sign special-casing
   * because `a` is already negative for an open orbit: at perihelion H = 0 and
   * `a(1 − e)` is `|a|(e − 1)`, which is q. The `−a` on y is what keeps the
   * body moving the same way round the focus as it does on a closed orbit.
   */
  let xOrb
  let yOrb
  if (e >= 1) {
    xOrb = a * (Math.cosh(E) - e)
    yOrb = -a * Math.sqrt(e * e - 1) * Math.sinh(E)
  } else {
    xOrb = a * (Math.cos(E) - e)
    yOrb = a * Math.sqrt(1 - e * e) * Math.sin(E)
  }

  // Argument of perihelion: perihelion measured from the ascending node rather
  // than from the equinox.
  const w = varpi - Omega

  const cosW = Math.cos(w)
  const sinW = Math.sin(w)
  const cosO = Math.cos(Omega)
  const sinO = Math.sin(Omega)
  const cosI = Math.cos(i)
  const sinI = Math.sin(i)

  // Three rotations composed by hand — by ω about the orbit normal, by i about
  // the node line, by Ω about the ecliptic pole.
  out.x = (cosW * cosO - sinW * sinO * cosI) * xOrb + (-sinW * cosO - cosW * sinO * cosI) * yOrb
  out.y = (cosW * sinO + sinW * cosO * cosI) * xOrb + (-sinW * sinO + cosW * cosO * cosI) * yOrb
  out.z = sinW * sinI * xOrb + cosW * sinI * yOrb

  return out
}

/**
 * Ecliptic (Z toward the north pole) to three.js world space (Y up).
 *
 * Mapping Y to -Z rather than +Z is what keeps the frame right-handed. Get this
 * backwards and every planet still orbits at the right distance but the whole
 * system runs clockwise seen from the north, which is subtle enough on screen
 * to survive a casual look.
 */
export function eclipticToWorld(v, out = { x: 0, y: 0, z: 0 }) {
  out.x = v.x
  out.y = v.z
  out.z = -v.y
  return out
}

/**
 * Orbital period in days, from the mean-longitude rate.
 *
 * `LDot` is degrees per century, so this is just the time to accumulate a full
 * turn. Used for orbit sampling and for the info panel.
 */
export function periodDays(el) {
  return (360 / el.LDot) * DAYS_PER_CENTURY
}

/**
 * Samples one full orbit as a closed loop of ecliptic positions, in AU.
 *
 * Steps the *eccentric* anomaly rather than the true anomaly, which spaces the
 * samples evenly around the ellipse's geometry. Stepping mean anomaly instead
 * would cluster points at aphelion and thin them out exactly at perihelion,
 * where an eccentric orbit curves hardest and most needs them.
 *
 * The elements are frozen at `T`: the drawn ellipse is the orbit as it is
 * *now*, not a trace of where the body has actually been over many centuries of
 * precession.
 */
export function sampleOrbit(el, T, segments = 512) {
  const { a, e, i, varpi, Omega } = elementsAt(el, T)
  const w = varpi - Omega

  const cosW = Math.cos(w)
  const sinW = Math.sin(w)
  const cosO = Math.cos(Omega)
  const sinO = Math.sin(Omega)
  const cosI = Math.cos(i)
  const sinI = Math.sin(i)
  const open = e >= 1
  const b = open ? -a * Math.sqrt(e * e - 1) : a * Math.sqrt(1 - e * e)

  /*
   * How far along an open trajectory to draw.
   *
   * A closed orbit has an obvious extent — one revolution — and an open one has
   * none: a hyperbola runs to infinity in both directions, so the curve has to
   * be cut somewhere and the cut is a presentation choice rather than a fact.
   *
   * `OPEN_ORBIT_MAX_AU` is that cut, and it is set just past Neptune. The
   * interesting part of a comet's path is the part among the planets; drawing
   * 3I/ATLAS's asymptotes out to a thousand AU would put two nearly-straight
   * lines across the whole scene and add nothing. Distance rather than time,
   * because time is the thing that is not comparable between these bodies —
   * ISON crosses this radius in a few years and 3I/ATLAS in a few months.
   *
   * Sampled uniformly in the hyperbolic anomaly, which crowds points near
   * perihelion exactly where the curve bends hardest — the same property that
   * makes stepping the eccentric anomaly the right choice for an ellipse.
   */
  const hMax = open ? openOrbitRange(el, T) : 0

  const points = new Array(segments)

  for (let s = 0; s < segments; s++) {
    let xOrb
    let yOrb
    if (open) {
      // Symmetric about perihelion: the inbound leg, the turn, the outbound leg.
      const H = (2 * (s / (segments - 1)) - 1) * hMax
      xOrb = a * (Math.cosh(H) - e)
      yOrb = b * Math.sinh(H)
      points[s] = {
        x: (cosW * cosO - sinW * sinO * cosI) * xOrb + (-sinW * cosO - cosW * sinO * cosI) * yOrb,
        y: (cosW * sinO + sinW * cosO * cosI) * xOrb + (-sinW * sinO + cosW * cosO * cosI) * yOrb,
        z: sinW * sinI * xOrb + cosW * sinI * yOrb,
      }
      continue
    }
    const E = (s / segments) * TWO_PI
    xOrb = a * (Math.cos(E) - e)
    yOrb = b * Math.sin(E)

    points[s] = {
      x: (cosW * cosO - sinW * sinO * cosI) * xOrb + (-sinW * cosO - cosW * sinO * cosI) * yOrb,
      y: (cosW * sinO + sinW * cosO * cosI) * xOrb + (-sinW * sinO + cosW * cosO * cosI) * yOrb,
      z: sinW * sinI * xOrb + cosW * sinI * yOrb,
    }
  }

  return points
}

/**
 * Rotation angle about the spin axis at a given Julian Date, in radians.
 *
 * Derived from absolute time rather than accumulated per frame. The old scene
 * did `rotation.y += rotationSpeed * dt`, which was fine when there was no
 * clock — but with a date to answer to, an accumulator drifts out of agreement
 * with it the moment the time rate changes or a frame is dropped. Computing
 * from the date means the spin is always the spin for that instant.
 *
 * @param {number} rotationHours sidereal rotation period; negative is retrograde
 */
/**
 * Turns per real second past which a spin stops reading as rotation.
 *
 * A body drawn faster than this strobes: the eye gets a sequence of unrelated
 * orientations rather than a turning object, and at high enough rates it is
 * literally aliased — past half a turn between frames the apparent direction is
 * arbitrary, so the motion carries no information at all.
 *
 * The value is set by Earth at the default `1 day/s`, which has to stay
 * untouched: the correspondence between the rate control and the globe is a
 * real feature of the default view. That is **not** one turn per second, and
 * assuming it was is a mistake worth recording — `rotationHours` is the
 * *sidereal* day of 23.934 hours, so a solar day per second is 1.0028 turns,
 * and a cap of exactly 1 would have caught the one case it was chosen to
 * protect and jumped its phase.
 *
 * 1.1 clears it with room to spare and still catches everything the cap is for.
 * An assumed 11-hour minor moon at `1 day/s` turns 2.2 times a second and
 * Jupiter 2.4; by `1 mo/s` a minor moon is past 66 turns a second, which is
 * aliased several times over and carries no information at all.
 */
export const MAX_SPIN_TURNS_PER_SEC = 1.1

/**
 * The body's rotation for a date, as an absolute angle.
 *
 * `daysPerSecond` is the clock's current rate, and it is optional: left out,
 * the spin is the true one for the date and nothing is capped. Given, the
 * elapsed time is scaled so the drawn rate never exceeds
 * `MAX_SPIN_TURNS_PER_SEC`.
 *
 * Scaling *elapsed time* rather than accumulating a capped rate is what keeps
 * this a pure function of the date: no frame history, so scrubbing, reversing
 * and jumping all still land on one definite orientation, which was the reason
 * the spin was moved off an accumulator in the first place.
 *
 * The cost is a one-off jump in phase when the cap engages or changes strength,
 * because the scale factor multiplies twenty-odd thousand years of elapsed
 * time. That only happens on a deliberate rate change, it cannot happen at all
 * below the cap — so never while paused, and never for Earth at the default
 * rate — and for the bodies it mostly affects, which wear a featureless generic
 * asteroid, there is no visible surface detail for a phase jump to show up in.
 */
export function spinAt(jd, rotationHours, daysPerSecond = 0) {
  const factor = spinClampFactor(daysPerSecond, 360 / (rotationHours / 24))
  const turns = ((jd - J2000) * factor) / (rotationHours / 24)
  return (turns % 1) * TWO_PI
}

/**
 * How much to slow a rotation so it does not alias, given the clock's rate.
 *
 * Split out of `spinAt` so the prime-meridian path in `scene/pole.js` scales
 * elapsed time by exactly the same factor. Two copies of this would let a body
 * with a real meridian and a body without drift apart under the same rate
 * change, which is the sort of difference that only shows up as "the moons look
 * wrong at high speed".
 *
 * @param daysPerSecond the clock's rate; 0 means "no cap, give the true angle"
 * @param degreesPerDay the body's rotation rate, signed
 */
export function spinClampFactor(daysPerSecond, degreesPerDay) {
  const turnsPerSecond = (Math.abs(daysPerSecond) * Math.abs(degreesPerDay)) / 360
  return turnsPerSecond > MAX_SPIN_TURNS_PER_SEC ? MAX_SPIN_TURNS_PER_SEC / turnsPerSecond : 1
}
