#!/usr/bin/env node
/**
 * Bakes satellite orbital elements from JPL Horizons.
 *
 * Run with `npm run fetch:moons`. Writes `src/data/moonElements.js`, which is
 * committed — the app makes no network requests of its own.
 *
 * ## The frame question, which is the whole design
 *
 * A moon does not orbit in the ecliptic. It orbits close to its parent's
 * equatorial plane, held there by the planet's oblateness, and that is *why*
 * Titan runs flat through Saturn's rings and why Uranus's satellite system
 * hangs vertically. Elements expressed in the ecliptic would capture the tilt
 * at one instant and then lose it: the ecliptic-referenced node of a close
 * satellite precesses in years, so a frozen ecliptic ellipse propagated across
 * the app's 1800–2050 window would slowly swing the orbit out of the plane the
 * moon is physically pinned to.
 *
 * So these are fetched with `REF_PLANE=B` — Horizons' body-equator frame,
 * X-Y in the parent's IAU equator. The resulting offset is then rotated by the
 * parent's `axialTilt`, the very same angle that orients the planet's surface
 * and its rings. Titan and Saturn's rings therefore stay coplanar by
 * construction rather than by coincidence, and no separate IAU pole model is
 * needed.
 *
 * ## The Moon is the exception, and has to be
 *
 * Luna's orbit is inclined 5.15° to the **ecliptic**, not to Earth's equator.
 * Its inclination to the equator swings between about 18° and 28° across the
 * 18.6-year nodal cycle, so a body-equator ellipse frozen at J2000 would be
 * wrong almost immediately. Luna is written below from Meeus' mean arguments
 * in the ecliptic frame, complete with the real nodal regression and apsidal
 * advance, and is flagged `plane: 'ecliptic'` so the renderer skips the tilt
 * rotation for it.
 *
 * ## Why this fits a series instead of taking a snapshot
 *
 * The first version asked Horizons for osculating elements at J2000 and used
 * them directly, taking the mean motion from the `N` it reports. Every moon in
 * the app was then in the right place on 1 January 2000 and in a **random**
 * place on any other date: measured against Horizons, Io was 95° round its
 * orbit after one year, and Europa and Ganymede were effectively anywhere by
 * 2020.
 *
 * The cause is specific and worth stating, because it is not the slow drift
 * that osculating elements are usually blamed for. Horizons' `N` is the
 * *two-body* mean motion implied by the osculating semi-major axis — the rate
 * the moon would have if its planet were a point mass. It is not. Jupiter's
 * oblateness is enormous, and at 5.9 Jupiter radii Io's mean longitude really
 * advances about 0.13% faster than a point-mass Jupiter would drive it. That is
 * 9,476°/century, or **94.8° of error per year**, which is why the error
 * appeared immediately rather than accumulating over decades.
 *
 * So `LDot` cannot be read off a snapshot at all; it has to be *measured*, by
 * watching the moon go round. Same for the node and apse rates, which the old
 * version simply set to zero — Phobos's periapsis advances a full turn every
 * 1.1 years.
 *
 * ## How
 *
 * Two passes, because the two things needed are in tension. A rate is measured
 * from closely-spaced samples; a *secular* rate is measured over a long
 * baseline; and a long baseline of closely-spaced samples is millions of rows.
 *
 *   1. **Bootstrap.** 60 orbits at six samples each, so the sampling is dense
 *      relative to the period whatever the period is. Angles unwrap trivially
 *      here, and the resulting rates are good to well under a degree
 *      extrapolated across the whole window.
 *   2. **Fit.** Samples every 30 days across 1800–2050. The step is set by the
 *      *node*, not the orbit: mean longitude is unwrapped against a predicted
 *      rate and does not care how sparse the sampling is, but the node and apse
 *      have to be unwrapped on their own evidence, and Phobos's periapsis goes
 *      round in 1.1 years. At yearly steps those alias — Mimas's node rate came
 *      back as almost exactly -360°/year, the signature of sampling something
 *      once per turn and concluding it never moves.
 *
 * A straight line is a very good description of what comes back: the bootstrap
 * fits Io's mean longitude with a residual of 0.003°.
 *
 * ## How well it works
 *
 * Measured against Horizons state vectors at seven dates from 1850 to 2049, as
 * an angle seen from the planet. The median moon is out by **0.39°** and
 * nineteen of the twenty-four are under a degree, against a former state where
 * most of them were simply somewhere else. Io went from 95° to 0.04°.
 *
 * Two are genuinely beyond a linear model, and they are worth naming because
 * the fit reports them honestly rather than hiding them:
 *
 *  - **Mimas, 46°.** It is locked in a 4:2 resonance with Tethys, and its
 *    longitude *librates* — it swings about the uniform motion instead of
 *    tracking it, so no straight line can follow it and a better-fitted line
 *    would not help. Tethys is the other half of the same resonance and shows
 *    the same effect at 2.3°, being much the heavier of the two.
 *  - **Phobos, 13°.** Deep inside Mars's tidal bulge, spiralling in, so its
 *    mean motion genuinely *accelerates* — a quadratic term this model has no
 *    slot for — while its apse and node go round in 1.1 and 2.3 years, fast
 *    enough that a small rate error compounds into a wrapped, near-random
 *    offset.
 *
 * The four small Pluto moons sit at 2.4–3.7°, and that is their floor rather
 * than a fitting failure: it is the wobble of Pluto's own centre about the
 * Pluto–Charon barycentre, which is 2.7° of angle at Styx's distance and is a
 * property of the frame these elements are expressed in. See `MEAN_ELEMENTS`.
 *
 * Everything else — including Triton and Iapetus, whose planes really do
 * precess in ways a line describes only loosely — comes in under half a degree
 * across the whole window.
 *
 * Not every moon has ephemeris across the whole window — Triton's runs out
 * before 1800 — so the window is clamped per body to what Horizons will serve,
 * and each generated row records the span it was actually fitted over.
 */

import { writeFileSync } from 'node:fs'
import { positionAt } from '../src/orbit/kepler.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src/data/moonElements.js')

const KM_PER_AU = 149597870.7
const J2000 = 2451545.0

/**
 * Horizons body id → parent, for every equator-frame satellite.
 *
 * In orbital order within each system, because the generated file is read as
 * much as it is imported and "inner to outer" is the order that makes a moon
 * system legible.
 *
 * `500@999` for the Pluto system is Pluto's own centre, not `500@9`, which is
 * the Pluto–Charon *barycentre*. The difference is not academic: Charon is
 * massive enough that the barycentre lies outside Pluto's surface, so elements
 * about the wrong one would draw Charon orbiting a point in empty space — and
 * Pluto orbiting it too.
 */
const SATELLITES = [
  { id: 'phobos', name: 'Phobos', command: '401', centre: '500@499', parent: 'mars' },
  { id: 'deimos', name: 'Deimos', command: '402', centre: '500@499', parent: 'mars' },

  { id: 'io', name: 'Io', command: '501', centre: '500@599', parent: 'jupiter' },
  { id: 'europa', name: 'Europa', command: '502', centre: '500@599', parent: 'jupiter' },
  { id: 'ganymede', name: 'Ganymede', command: '503', centre: '500@599', parent: 'jupiter' },
  { id: 'callisto', name: 'Callisto', command: '504', centre: '500@599', parent: 'jupiter' },

  { id: 'mimas', name: 'Mimas', command: '601', centre: '500@699', parent: 'saturn' },
  { id: 'enceladus', name: 'Enceladus', command: '602', centre: '500@699', parent: 'saturn' },
  { id: 'tethys', name: 'Tethys', command: '603', centre: '500@699', parent: 'saturn' },
  { id: 'dione', name: 'Dione', command: '604', centre: '500@699', parent: 'saturn' },
  { id: 'rhea', name: 'Rhea', command: '605', centre: '500@699', parent: 'saturn' },
  { id: 'titan', name: 'Titan', command: '606', centre: '500@699', parent: 'saturn' },
  { id: 'iapetus', name: 'Iapetus', command: '608', centre: '500@699', parent: 'saturn' },

  { id: 'miranda', name: 'Miranda', command: '705', centre: '500@799', parent: 'uranus' },
  { id: 'ariel', name: 'Ariel', command: '701', centre: '500@799', parent: 'uranus' },
  { id: 'umbriel', name: 'Umbriel', command: '702', centre: '500@799', parent: 'uranus' },
  { id: 'titania', name: 'Titania', command: '703', centre: '500@799', parent: 'uranus' },
  { id: 'oberon', name: 'Oberon', command: '704', centre: '500@799', parent: 'uranus' },

  { id: 'triton', name: 'Triton', command: '801', centre: '500@899', parent: 'neptune' },

  { id: 'charon', name: 'Charon', command: '901', centre: '500@999', parent: 'pluto' },
  { id: 'styx', name: 'Styx', command: '905', centre: '500@999', parent: 'pluto' },
  { id: 'nix', name: 'Nix', command: '902', centre: '500@999', parent: 'pluto' },
  { id: 'kerberos', name: 'Kerberos', command: '904', centre: '500@999', parent: 'pluto' },
  { id: 'hydra', name: 'Hydra', command: '903', centre: '500@999', parent: 'pluto' },
]

/**
 * Luna, from Meeus, *Astronomical Algorithms*, ch. 47 — the mean arguments of
 * the ELP-2000/82 lunar theory, in the ecliptic frame of date.
 *
 * The three rates are the real ones and they are large: the node regresses a
 * full turn in 18.6 years and the apse advances one in 8.85. Over the app's
 * 250-year window they are worth thousands of degrees each, which is why they
 * are carried rather than zeroed like the satellites above.
 *
 * `LDot` here is 481,267.88 °/century — the classic value, and a useful check
 * that the units line up: 360 × 36525 / 27.321582 lands on the same number.
 */
const LUNA = {
  id: 'luna',
  name: 'Moon',
  parent: 'earth',
  plane: 'ecliptic',
  source: 'Meeus, Astronomical Algorithms, ch. 47 (ELP-2000/82 mean arguments)',
  elements: {
    a: 384400 / KM_PER_AU,
    aDot: 0,
    e: 0.0549,
    eDot: 0,
    i: 5.145,
    iDot: 0,
    L: 218.3164477,
    LDot: 481267.88123421,
    varpi: 83.3532465,
    varpiDot: 4069.0137287,
    Omega: 125.0445479,
    OmegaDot: -1934.1362891,
  },
  periodDays: 27.321582,
}

/** The app's own window; the fit has no reason to be valid anywhere else. */
const WINDOW_START = '1800-01-01'
const WINDOW_STOP = '2050-01-01'

/**
 * Sampling across that window, set by the *node*, not by the orbit.
 *
 * Yearly would do for the mean longitude, which is unwrapped against a
 * predicted rate anyway and does not care. It will not do for the node and the
 * apse: Phobos's periapsis goes round in 1.1 years and Mimas's node in about
 * one, so at yearly steps they are at or past the aliasing limit — Mimas's node
 * rate came back as almost exactly -360°/year, which is the signature of
 * sampling something once per turn and concluding it never moves.
 *
 * Thirty days keeps the fastest of them near 30° per step, comfortably inside
 * half a turn, at about 3,000 samples per body.
 */
const WINDOW_STEP = "'30 d'"

const DAYS_PER_CENTURY = 36525

/** Raised when Horizons has no ephemeris across the whole window asked for. */
class Coverage extends Error {
  constructor(before, after) {
    super(`coverage ${before ?? '…'} to ${after ?? '…'}`)
    this.before = before
    this.after = after
  }
}

/**
 * One Horizons ELEMENTS request, parsed into rows.
 *
 * `range` is either `{tlist}` for a single instant or `{start, stop, step}`.
 * A body whose ephemeris does not span the request throws `Coverage` carrying
 * the bounds Horizons named, so the caller can clamp and ask again rather than
 * guessing at each moon's coverage up front.
 */
async function fetchRows({ command, centre, name }, range) {
  const params = new URLSearchParams({
    format: 'text',
    COMMAND: command,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'ELEMENTS',
    CENTER: centre,
    // Body-equator frame of the central body. See the header.
    REF_PLANE: 'B',
    OUT_UNITS: 'KM-S',
    ...(range.tlist
      ? { TLIST: String(range.tlist) }
      : { START_TIME: range.start, STOP_TIME: range.stop, STEP_SIZE: range.step }),
  })

  const res = await fetch(`https://ssd.jpl.nasa.gov/api/horizons.api?${params}`)
  if (!res.ok) throw new Error(`Horizons HTTP ${res.status} for ${name}`)

  const text = await res.text()
  const block = text.split('$$SOE')[1]?.split('$$EOE')[0]
  if (!block) {
    // Horizons words the two bounds differently — "prior to" one way and
    // "after" the other — and matching only one of them leaves half the
    // clamping silently unimplemented.
    const before = text.match(/No ephemeris for target [^\n]*?(?:prior to|before) A\.D\. (\S+)/)?.[1]
    const after = text.match(/No ephemeris for target [^\n]*?after A\.D\. (\S+)/)?.[1]
    if (before || after) throw new Coverage(before, after)
    throw new Error(`no ephemeris block for ${name}:\n${text.slice(-600)}`)
  }

  // Each sample is a JD header line then several lines of `KEY= value`. `W` and
  // `N` carry a space before the `=`, hence the optional whitespace.
  const rows = []
  for (const chunk of block.split(/\n(?=\d{7})/)) {
    const trimmed = chunk.trim()
    if (!trimmed) continue
    const jd = Number(trimmed.split(' ')[0])
    if (!Number.isFinite(jd)) continue

    const read = (key) => {
      const m = trimmed.match(new RegExp(`\\b${key}\\s*=\\s*(-?[\\d.]+E?[+-]?\\d*)`))
      return m ? Number(m[1]) : NaN
    }

    const row = {
      T: (jd - J2000) / DAYS_PER_CENTURY,
      a: read('A'),
      e: read('EC'),
      i: read('IN'),
      Omega: read('OM'),
      w: read('W'),
      M: read('MA'),
      TA: read('TA'),
      // Horizons reports mean motion per second under OUT_UNITS=KM-S.
      nPerDay: read('N') * 86400,
    }
    if (Object.values(row).every(Number.isFinite)) rows.push(row)
  }

  if (rows.length === 0) throw new Error(`no usable samples for ${name}`)
  return rows
}

/** Ordinary least squares: y = intercept + slope·x. */
function fitLine(xs, ys) {
  const n = xs.length
  const meanX = xs.reduce((s, v) => s + v, 0) / n
  const meanY = ys.reduce((s, v) => s + v, 0) / n

  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY)
    den += (xs[i] - meanX) ** 2
  }
  const slope = num / den
  return { intercept: meanY - slope * meanX, slope }
}

/**
 * Remove 360° jumps from densely-sampled angles.
 *
 * Only sound when consecutive samples are less than half a turn apart, which is
 * what the bootstrap pass guarantees by sampling six times per orbit.
 */
function unwrapDense(values) {
  const out = [values[0]]
  let offset = 0
  for (let i = 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1]
    if (delta < -180) offset += 360
    else if (delta > 180) offset -= 360
    out.push(values[i] + offset)
  }
  return out
}

/**
 * Unwrap sparse angles against the model being fitted, one sample at a time.
 *
 * Yearly samples of a moon are hopeless on their own — Io turns 206 times
 * between two of them, so "the nearest turn to the previous sample" is
 * meaningless. What *is* known is roughly how fast the angle runs, from the
 * bootstrap pass, so each sample can be placed on the turn nearest to what the
 * model predicts for its date.
 *
 * Each prediction is made from the *previous accepted sample* plus a rate,
 * rather than from a line through the whole window. The difference matters: a
 * whole-window line has to survive 250 years of extrapolation without ever
 * drifting half a turn from the truth, while stepping from the last known point
 * only has to survive thirty days. Genuine long-period wander is then followed
 * rather than accumulated.
 *
 * The rate starts at the seed and is refined once there are enough points to
 * beat it. Refining it *earlier* is a trap worth naming, because it was the
 * bug: refitting after three samples replaces a rate measured over sixty dense
 * orbits with one measured over sixty days, and extrapolating that across two
 * centuries lands half the Uranian system on the wrong revolution. Ariel came
 * back with a 103° residual and no other complaint.
 */
function unwrapSparse(T, values, seed) {
  const place = (value, predicted) => value + Math.round((predicted - value) / 360) * 360

  const out = [place(values[0], seed.intercept + seed.slope * T[0])]
  let slope = seed.slope

  for (let i = 1; i < values.length; i++) {
    out.push(place(values[i], out[i - 1] + slope * (T[i] - T[i - 1])))
    if (out.length >= 200) slope = fitLine(T.slice(0, out.length), out).slope
  }

  return out
}

const SAMPLES_PER_ORBIT = 6

/**
 * A step Horizons will accept.
 *
 * It wants a whole number and a unit, and rejects the obvious `'0.0532 d'` with
 * "print-out interval <= zero" — it truncates to the integer part first. So the
 * unit is chosen to keep the count comfortably above 1: these periods run from
 * Phobos's 7.7 hours to Iapetus's 79 days, which is a factor of 250.
 */
function stepFor(days) {
  const minutes = days * 1440
  if (minutes < 1440) return `'${Math.max(1, Math.round(minutes))} m'`
  if (minutes < 1440 * 60) return `'${Math.round(minutes / 60)} h'`
  return `'${Math.round(days)} d'`
}

/**
 * Measures each angle's rate from a short, densely-sampled arc.
 *
 * Sixty orbits at six samples each, so the sampling is set by the body rather
 * than by the calendar: dense enough to unwrap whatever the period, and long
 * enough that the rate is good to a fraction of a degree extrapolated across
 * the whole 250-year window. It is only ever a seed — the rates that ship come
 * from the long fit.
 */
async function bootstrap(body, periodDays) {
  const span = 60 * periodDays
  const rows = await fetchRows(body, {
    start: `'JD${J2000}'`,
    stop: `'JD${J2000 + span}'`,
    step: stepFor(periodDays / SAMPLES_PER_ORBIT),
  })

  const T = rows.map((r) => r.T)
  const angle = (pick) => fitLine(T, unwrapDense(rows.map(pick)))

  return {
    L: angle((r) => wrap360(r.M + r.w + r.Omega)),
    varpi: angle((r) => wrap360(r.w + r.Omega)),
    Omega: angle((r) => wrap360(r.Omega)),
    samples: rows.length,
  }
}

/**
 * The full fit: six elements at J2000 and six rates per Julian century.
 *
 * Clamps to whatever Horizons will actually serve for this body, and reports
 * the span used so the generated file can say what it is describing.
 */
async function fitBody(body) {
  /*
   * The period, only so the bootstrap can size its own sampling.
   *
   * Horizons' osculating `N` is enough for that — being a few parts in a
   * thousand out does not matter for choosing a step — *except* for the four
   * small Pluto moons, where it is not a little wrong but wholly wrong. Fitted
   * about Pluto's centre, Kerberos's osculating period comes back as 119.7 days
   * against a true 32.2 (see `MEAN_ELEMENTS`), so the bootstrap sampled a
   * 32-day orbit every 20 days and returned an aliased rate. Nothing downstream
   * could recover from that: the fitted period came out as **-357 days**, a
   * moon going backwards round Pluto once a year.
   */
  const [at2000] = await fetchRows(body, { tlist: J2000 })
  const periodDays = MEAN_ELEMENTS[body.id]?.periodDays ?? 360 / at2000.nPerDay

  const seeds = await bootstrap(body, periodDays)

  let start = `'${WINDOW_START}'`
  let stop = `'${WINDOW_STOP}'`
  let rows
  try {
    rows = await fetchRows(body, { start, stop, step: WINDOW_STEP })
  } catch (error) {
    if (!(error instanceof Coverage)) throw error
    // Midday on the named day rather than the day itself: the bound Horizons
    // reports *is* the first instant it has, and asking for exactly it comes
    // back as the same refusal.
    if (error.before) start = `'${error.before} 12:00'`
    if (error.after) stop = `'${error.after} 00:00'`
    rows = await fetchRows(body, { start, stop, step: WINDOW_STEP })
  }

  const T = rows.map((r) => r.T)
  const scalar = (pick) => fitLine(T, rows.map(pick))

  const a = scalar((r) => r.a)
  const e = scalar((r) => r.e)
  const i = scalar((r) => r.i)

  /*
   * Mean longitude is the only angle that needs the seed.
   *
   * It is the one that is hopelessly aliased at this step — Io turns 17 times
   * between consecutive samples — so it has to be placed against a predicted
   * rate. The node and apse are not: the step above is chosen so that even the
   * fastest of them stays well under half a turn apart, which is exactly what
   * lets them be unwrapped on their own evidence.
   *
   * That distinction is the fix for a real failure. Seeding them from the
   * bootstrap instead put Phobos's node rate at 0.17°/century when the truth is
   * about -15,800: sixty orbits is ample to measure a mean motion, which
   * advances tens of thousands of degrees in that time, and useless for a node,
   * which creeps a few degrees and is buried in its own short-period wobble. A
   * bad seed does not merely fail to help — `unwrapSparse` drags every sample
   * onto the turn nearest its prediction, so the fit comes back agreeing with
   * whatever it was told.
   */
  const L = fitLine(T, unwrapSparse(T, rows.map((r) => wrap360(r.M + r.w + r.Omega)), seeds.L))
  const varpi = fitLine(T, unwrapDense(rows.map((r) => wrap360(r.w + r.Omega))))
  const Omega = fitLine(T, unwrapDense(rows.map((r) => wrap360(r.Omega))))

  const elements = {
    a: a.intercept / KM_PER_AU,
    aDot: a.slope / KM_PER_AU,
    e: e.intercept,
    eDot: e.slope,
    i: i.intercept,
    iDot: i.slope,
    // Only the epoch values are wrapped. The *rates* must keep their full
    // magnitude — Io's LDot is 7.4 million °/century and wrapping it would
    // stop the moon moving.
    L: wrap360(L.intercept),
    LDot: L.slope,
    varpi: wrap360(varpi.intercept),
    varpiDot: varpi.slope,
    Omega: wrap360(Omega.intercept),
    OmegaDot: Omega.slope,
  }

  return {
    plane: 'equator',
    residualDegrees: positionResidual(rows, elements),
    source:
      `JPL Horizons, REF_PLANE=B about ${body.centre}; least-squares fit to ` +
      `${rows.length} samples, ${start.replaceAll("'", '')} to ${stop.replaceAll("'", '')}`,
    periodDays: 360 / (L.slope / DAYS_PER_CENTURY),
    samples: rows.length,
    elements,
  }
}

/**
 * How far the fitted elements put the moon from where Horizons had it.
 *
 * The obvious diagnostic is the scatter of mean longitude about its fitted
 * line, and it is the wrong one. Mean longitude is not observable on its own:
 * for a near-planar orbit the node is barely defined and jitters by degrees
 * between samples, so `L` and `varpi` both jitter — *together*, in a way that
 * cancels when the position is computed from `M = L - varpi`. Ariel scored a
 * 101° longitude residual while its actual positions were good to 0.2°.
 *
 * So this compares the only thing that means anything: the position the fitted
 * elements give against the position the sample's own elements give, as an
 * angle seen from the planet. Every element and its rate is exercised at once,
 * and a moon whose motion a straight line cannot describe says so plainly.
 */
function positionResidual(rows, fitted) {
  let worst = 0

  for (const r of rows) {
    const here = positionAt(
      {
        a: r.a / KM_PER_AU, aDot: 0,
        e: r.e, eDot: 0,
        i: r.i, iDot: 0,
        L: wrap360(r.M + r.w + r.Omega), LDot: 0,
        varpi: wrap360(r.w + r.Omega), varpiDot: 0,
        Omega: wrap360(r.Omega), OmegaDot: 0,
      },
      0,
    )
    const there = positionAt(fitted, r.T)

    const dot = here.x * there.x + here.y * there.y + here.z * there.z
    const mag = Math.hypot(here.x, here.y, here.z) * Math.hypot(there.x, there.y, there.z)
    const angle = (Math.acos(Math.min(1, Math.max(-1, dot / mag))) * 180) / Math.PI
    if (angle > worst) worst = angle
  }

  return worst
}

/**
 * Published mean elements for the four small Pluto moons, and why they are here.
 *
 * These are the one set Horizons cannot be asked for directly, and the failure
 * is quiet enough to be worth spelling out. Osculating elements are fitted from
 * a state vector measured *relative to the centre requested* — and Pluto's own
 * centre is not an inertial point: it circles the Pluto–Charon barycentre at
 * about 24 m/s, because Charon is a tenth of Pluto's mass rather than a
 * rounding error. Styx through Hydra orbit at only 120–150 m/s, so elements
 * taken about Pluto's centre carry a ~20% velocity error, and the two-body fit
 * absorbs it as eccentricity. Fetched that way Kerberos comes back as
 * `a = 133,084 km, e = 0.556, P = 119.7 d` against a true
 * `a = 57,783 km, e = 0.003, P = 32.2 d` — not a small error, an orbit that is
 * not Kerberos's.
 *
 * Charon is immune and does not appear below: Pluto's wobble *is* Charon's orbit
 * mirrored, so measured from Pluto's centre Charon traces a clean ellipse. It
 * comes back within 5 km of the published semi-major axis, so it is fetched like
 * any other moon.
 *
 * The barycentre is not the way out either. `CENTER=@9` is the right point
 * physically, but Horizons answers `Body frame output not available for this
 * center` — a barycentre has no equator, so it cannot serve `REF_PLANE=B`, and
 * the body-equator frame is the whole basis of how this app places moons.
 *
 * So the two halves are taken from where each is sound:
 *
 *   plane (i, Omega)   from Horizons. The orbital plane is the direction of
 *                      r x v, which the wobble does not tilt — it lies in the
 *                      same plane, since all five moons are coplanar to within
 *                      a degree. Exact.
 *   position           from Horizons' argument of latitude, `w + TA`. Also pure
 *                      geometry of the state vector, so also exact.
 *   size and period    from the published mean elements below, which is what the
 *                      corrupted fit gets wrong.
 *
 * The one thing given up is the direction of periapsis, which is set to the node
 * (`varpi = Omega`). At e = 0.002–0.006 that displaces the moon along its orbit
 * by under half a degree, and there is nothing to see in it.
 *
 * Source: JPL Solar System Dynamics, *Planetary Satellite Mean Orbital
 * Parameters*, from Brozović et al. (2015), the New Horizons-era fit.
 */
const MEAN_ELEMENTS = {
  styx: { aKm: 42656, e: 0.0058, periodDays: 20.16155 },
  nix: { aKm: 48694, e: 0.0020, periodDays: 24.85463 },
  kerberos: { aKm: 57783, e: 0.0033, periodDays: 32.16756 },
  hydra: { aKm: 64738, e: 0.0059, periodDays: 38.20177 },
}

/**
 * Rebuilds a row from published size, keeping everything Horizons gets right.
 *
 * The split is by what the barycentre wobble does and does not corrupt. It
 * ruins the fitted *ellipse* — `a` and `e` absorb a 20% velocity error — so
 * those come from the published mean elements. It does not touch how fast the
 * moon goes round: the wobble is a periodic displacement with Charon's 6.4-day
 * period, worth 2.7° of angle at Styx's distance, and a least-squares line
 * through 3,000 samples averages it away. So the mean longitude and its rate
 * are kept from the fit.
 *
 * That is a change from taking the rate from the published period, and it is
 * worth what it costs: the published-period version drifted, reaching 48° on
 * Styx by 2049 because a period quoted to five decimals is not the same as a
 * rate measured across the window it will be used over.
 *
 * Periapsis stays pinned to the node, and so must its rate — giving it one of
 * its own would let the two drift apart and reintroduce the phase error the
 * pinning avoids. At e = 0.002–0.006 the cost of not knowing where periapsis
 * points is well under a degree.
 */
function withMeanElements(body) {
  const mean = MEAN_ELEMENTS[body.id]
  if (!mean) return body

  const e = body.elements

  return {
    ...body,
    source:
      `JPL Horizons, REF_PLANE=B about ${body.centre}; plane and phase fitted ` +
      `across ${body.samples} samples; size from JPL mean elements ` +
      `(Brozović et al. 2015)`,
    periodDays: 360 / (e.LDot / DAYS_PER_CENTURY),
    elements: {
      ...e,
      a: mean.aKm / KM_PER_AU,
      // Published constants, so there is no fitted drift to carry — and the
      // fitted ones would be drift in the corrupted ellipse, not in the orbit.
      aDot: 0,
      e: mean.e,
      eDot: 0,
      varpi: e.Omega,
      varpiDot: e.OmegaDot,
    },
  }
}

const wrap360 = (deg) => ((deg % 360) + 360) % 360

const fmt = (n, digits = 8) => n.toFixed(digits)

function renderRow(body) {
  const e = body.elements
  return `  ${body.id}: {
    // ${body.name} — ${body.source}
    parent: '${body.parent}',
    plane: '${body.plane}',
    /** Sidereal period in days: ${body.periodDays.toFixed(6)}. */
    a: ${e.a.toExponential(9)}, aDot: ${e.aDot.toExponential(9)},
    e: ${fmt(e.e)}, eDot: ${fmt(e.eDot)},
    i: ${fmt(e.i)}, iDot: ${fmt(e.iDot)},
    L: ${fmt(e.L)}, LDot: ${fmt(e.LDot)},
    varpi: ${fmt(e.varpi)}, varpiDot: ${fmt(e.varpiDot)},
    Omega: ${fmt(e.Omega)}, OmegaDot: ${fmt(e.OmegaDot)},
  },`
}

function render(bodies) {
  return `/**
 * Satellite orbital elements.
 *
 * GENERATED by \`scripts/fetch-moon-elements.mjs\` — do not hand-edit; rerun
 * \`npm run fetch:moons\` instead. Generated ${new Date().toISOString().slice(0, 10)}.
 *
 * Every row carries a \`plane\`, and it decides which frame the renderer solves
 * the orbit in:
 *
 *   'equator'   the parent's equatorial plane. Elements come from Horizons in
 *               its body-equator frame, and the offset is rotated by the same
 *               \`axialTilt\` that orients the planet and its rings — so Titan
 *               and Saturn's rings are coplanar by construction.
 *   'ecliptic'  the ecliptic, unrotated. Only the Moon, whose orbit tracks the
 *               ecliptic rather than Earth's equator.
 *
 * Six elements at J2000 plus six linear rates per Julian century, the same form
 * as the planet table in \`orbitalElements.js\`. The rates are **measured**, by
 * least-squares fitting a yearly Horizons series across the app's window — they
 * cannot be read off a snapshot, because the mean motion Horizons reports is
 * the two-body one and a close satellite's real rate is faster. Taking it from
 * the snapshot put Io 95° round its orbit one year from the epoch.
 *
 * See the generating script for how, and for what is approximated.
 */

/** @type {Record<string, import('./orbitalElements').Elements & {parent: string, plane: 'equator'|'ecliptic'}>} */
export const MOON_ELEMENTS = {
${bodies.map(renderRow).join('\n\n')}
}
`
}

async function main() {
  const bodies = []
  for (const satellite of SATELLITES) {
    process.stdout.write(`[moons] fitting ${satellite.name}… `)
    const data = await fitBody(satellite)
    const body = withMeanElements({ ...satellite, ...data })
    bodies.push(body)
    console.log(
      `${String(data.samples).padStart(4)} samples, ` +
        `a=${(body.elements.a * KM_PER_AU).toFixed(0)} km, ` +
        `e=${body.elements.e.toFixed(4)}, i=${body.elements.i.toFixed(3)}°, ` +
        `P=${body.periodDays.toFixed(6)} d, ` +
        `worst ${data.residualDegrees.toFixed(2)}°` +
        (MEAN_ELEMENTS[body.id] ? '  [mean elements]' : ''),
    )
  }

  // Luna sorts to the front: it is the moon everyone knows, and the generated
  // file reads better opening with the exception it explains.
  writeFileSync(OUT, render([LUNA, ...bodies]))
  console.log(`[moons] wrote ${OUT}`)
}

main().catch((error) => {
  console.error(`[moons] ${error.message}`)
  process.exitCode = 1
})
