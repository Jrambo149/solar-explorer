#!/usr/bin/env node
/**
 * Bakes everything the app knows about the minor moons.
 *
 * Run with `npm run fetch:minor-moons`. Writes two committed files —
 * `src/data/minorMoonElements.js` and `src/data/minorMoonData.js` — because the
 * app makes no network requests of its own.
 *
 * Which moons, and which generic mesh each wears, comes from
 * `minor-moon-roster.mjs`. Everything else is fetched.
 *
 * ## Four sources, each for the one thing it is best at
 *
 *   JPL *Planetary Satellite Mean Elements* (`/sats/elem/`)
 *       The reference frame each moon's orbit belongs in, the elements
 *       themselves for the inner moons, and the precession periods for all of
 *       them.
 *
 *   JPL Horizons
 *       The osculating ellipse the irregulars are anchored to, the direction
 *       each precession runs, and the along-track calibration. See below.
 *
 *   JPL *Planetary Satellite Physical Parameters* (`/sats/phys_par/`)
 *       Mean radius where anyone has measured one. Only 59 satellites have,
 *       which is why there is a fallback.
 *
 *   JPL *Planetary Satellite Discovery Circumstances* (`/sats/discovery.html`)
 *       Year, discoverers, provisional designation, IAU numeral.
 *
 * ## Why the frame differs from moon to moon, and why that is not a detail
 *
 * The existing major moons are all fetched in `REF_PLANE=B`, the parent's
 * body-equator frame, because a close-in moon is held near its planet's
 * equatorial plane by that planet's oblateness. That is right for the *inner*
 * minor moons and wrong for the outer ones, and the JPL table says so out loud:
 * it publishes Neptune's inner seven in a Laplace frame whose pole is Neptune's
 * own (RA 299.7°, Dec 42.7°, tilted 0.4° from the equator) and its irregulars in
 * the **ecliptic**.
 *
 * The physics behind the switch is that far enough out, the Sun rather than the
 * planet's bulge controls the orbit. Getting it wrong is not subtle. Nereid
 * fetched in Neptune's equator frame comes back at i = 28.4°; in the ecliptic it
 * is 5.1°, which is the number JPL publishes. The first is not a worse estimate
 * of the same thing, it is a different angle measured from a different plane, and
 * drawn it would put Nereid's orbit 23° out of place.
 *
 * So each moon takes the frame JPL expresses it in — `'equator'` for Laplace
 * frames within 2° of the parent's pole, `'ecliptic'` otherwise — and the
 * renderer already understands both, since the Moon has always been the second
 * case.
 *
 * ## Where each element actually comes from
 *
 * Not one rule, and the split is the substance of this script.
 *
 * **Inner moons** are built from JPL's published mean elements. Their orbits are
 * circular, equatorial and stable, so an average is strictly better than a
 * snapshot, and the published values match Horizons to a fraction of a percent.
 *
 * **Irregulars** are built from Horizons' osculating ellipse at J2000, because
 * for them the table's averages are not usable: Halimede is tabulated at
 * e = 0.521 where its real orbit sits near 0.26 across the whole window, Sao at
 * 0.296 against 0.14. (Nereid, as a control, agrees to four decimals — the
 * table is not wrong, its irregular rows are a different kind of average from
 * the one this app needs.)
 *
 * **Precession rates** come from the table's published node and apsis periods,
 * with the *direction* — which the table does not give — taken from the sign of
 * the drift in a long Horizons series. Both are gated: a node means nothing for
 * an orbit lying in its own reference plane, and a periapsis means nothing for a
 * circle, and Horizons will happily report a number for either.
 *
 * **Phase and mean motion** are then calibrated against Horizons directly, in
 * widening rounds. This is what absorbs the discrepancy that JPL's tables cannot
 * state: a published period is a *mean anomaly* period, `kepler.js` propagates
 * mean *longitude*, and the two differ by the apsidal rate. Left uncorrected
 * that put Naiad 1.717° per day out of place — a full orbit every three weeks.
 *
 * ## What is still approximate, and where it shows
 *
 * Measured against Horizons at today's date, as a fraction of each orbit's own
 * size: every inner moon lands under 2%, and most of the irregulars under 7%.
 *
 * Three do not, and no element set would fix them. Psamathe (21%), S/2021 N 1
 * (31%) and Neso (35%) are the most distant moons known — Neso's orbit is 50
 * million km across — and far enough out that the Sun, not Neptune, shapes them.
 * Neso's osculating eccentricity runs 0.47 → 0.77 → 0.62 → 0.85 across 150 years
 * and its inclination 123° → 142°. Its orbit is not an ellipse that precesses;
 * it is an ellipse that changes shape, and a two-body model has nothing to say
 * about that.
 *
 * These orbits are here to show the reach and spread of a captured family, and
 * that they carry exactly. They are not an ephemeris and nothing should be
 * predicted from them.
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ALL_MINOR_MOONS, MINOR_MOON_ROSTER } from './minor-moon-roster.mjs'
import { positionAt } from '../src/orbit/kepler.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ELEMENTS_OUT = join(ROOT, 'src/data/minorMoonElements.js')
const DATA_OUT = join(ROOT, 'src/data/minorMoonData.js')

const KM_PER_AU = 149597870.7
const J2000 = 2451545.0
const DAYS_PER_CENTURY = 36525

/** Horizons centre code and IAU pole for each parent, for the frame decision. */
/**
 * Horizons centre code per parent, and whether that parent spins backwards.
 *
 * The spin flag exists for one word in the output. An equator-frame moon's
 * inclination is measured from its planet's IAU north pole, and for Uranus that
 * pole is chosen so the planet's own rotation counts as retrograde — so its
 * inner moons come back at i ≈ 178° while physically orbiting *with* the
 * planet, the same way our Moon goes round with Earth. Reporting them as
 * retrograde would be true of the coordinate system and false about the sky.
 */
const PARENTS = {
  neptune: { centre: '500@899', retrogradeSpin: false, name: 'Neptune', moonsUrl: 'https://science.nasa.gov/neptune/moons/' },
  uranus: { centre: '500@799', retrogradeSpin: true, name: 'Uranus', moonsUrl: 'https://science.nasa.gov/uranus/moons/' },
  jupiter: { centre: '500@599', retrogradeSpin: false, name: 'Jupiter', moonsUrl: 'https://science.nasa.gov/jupiter/moons/' },
  saturn: { centre: '500@699', retrogradeSpin: false, name: 'Saturn', moonsUrl: 'https://science.nasa.gov/saturn/moons/' },
}

/**
 * How far a Laplace plane may lie from the parent's equator and still count as
 * being it.
 *
 * Measured to the nearest *plane*, not the nearest pole, which is why the check
 * below folds 180° onto 0°. JPL tabulates Uranus's inner moons against a Laplace
 * pole of RA 77.3°, Dec 15.2° and reports the tilt as **180.0°** — that is
 * Uranus's equator, listed from the other end. Treating 180 as "nowhere near
 * equatorial" is what sent all thirteen down the irregular path on the first
 * run, and they came back at i = 97°, which is not their inclination but
 * Uranus's obliquity showing through.
 */
const EQUATOR_TILT_LIMIT = 2

/**
 * Samples per window. Odd on purpose: with the window centred on J2000, an odd
 * count puts a sample exactly *on* J2000, which is the epoch the irregulars are
 * anchored to and the epoch `kepler.js` measures every rate from.
 */
const FIT_SAMPLES = 25

/** Longest fit baseline, years. The app's own validity window is 1800–2050. */
const MAX_FIT_YEARS = 200

/**
 * How many of its own orbits a body must take to precess once before the
 * published period is believed. See `rateFrom`.
 */
const MIN_PRECESSION_ORBITS = 50

/** Julian date of the moment this ran — the date the app opens on. */
const nowJd = Date.now() / 86400000 + 2440587.5

const wrap360 = (deg) => ((deg % 360) + 360) % 360
const stripTags = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;?/g, ' ').replace(/\s+/g, ' ').trim()

async function getText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120000) })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.text()
}

/**
 * `'2020-01-01.0'` → Julian date.
 *
 * JPL writes the epoch as a calendar date with a fractional day, so the two
 * epochs in play — `2000-01-01.5` for the inner moons and `2020-01-01.0` for the
 * irregulars — differ by half a day as well as by twenty years. The half day is
 * not worth ignoring: Naiad covers 600° of its orbit in one.
 *
 * Uses the standard Gregorian conversion rather than `Date`, which would pull in
 * a timezone and a leap-second policy for something that is pure arithmetic.
 */
function epochToJd(text) {
  const m = text.match(/(\d{4})-(\d{2})-(\d{2}(?:\.\d+)?)/)
  if (!m) throw new Error(`cannot read epoch "${text}"`)

  let year = Number(m[1])
  let month = Number(m[2])
  const day = Number(m[3])

  if (month <= 2) {
    year -= 1
    month += 12
  }
  const A = Math.floor(year / 100)
  const B = 2 - A + Math.floor(A / 4)

  return (
    Math.floor(365.25 * (year + 4716)) +
    Math.floor(30.6001 * (month + 1)) +
    day +
    B -
    1524.5
  )
}

/** Rows of an HTML table, each as an array of cell texts. */
function tableRows(html) {
  return (html.match(/<tr>[\s\S]*?<\/tr>/g) ?? []).map((row) =>
    (row.match(/<t[dh][^>]*>[\s\S]*?(?=<t[dh]|<\/tr>)/g) ?? []).map(stripTags),
  )
}

/* ---------------------------------------------------------------- *
 * JPL reference tables
 * ---------------------------------------------------------------- */

/**
 * The mean-element table, keyed by Horizons code.
 *
 * Only four columns are actually used — the frame, the pole it is referred to,
 * and the two precession periods — but the published `a`, `e` and `i` are kept
 * so the fitted values can be checked against them.
 */
async function fetchMeanElements() {
  const html = await getText('https://ssd.jpl.nasa.gov/sats/elem/')
  const out = {}

  for (const c of tableRows(html)) {
    if (c.length < 19 || !/^\d+$/.test(c[0])) continue
    const num = (v) => (v && v !== '-' && v !== 'n/a' ? Number(v) : null)
    out[c[3]] = {
      planet: c[1],
      name: c[2],
      frame: c[5],
      epoch: c[6],
      epochJd: epochToJd(c[6]),
      a: num(c[7]),
      e: num(c[8]),
      w: num(c[9]),
      M: num(c[10]),
      i: num(c[11]),
      node: num(c[12]),
      periodDays: num(c[13]),
      apsisYears: num(c[14]),
      nodeYears: num(c[15]),
      poleRa: num(c[16]),
      poleDec: num(c[17]),
      tilt: num(c[18]),
    }
  }
  return out
}

/** Mean radius in km, keyed by Horizons code. Only the measured ones. */
async function fetchPhysical() {
  const html = await getText('https://ssd.jpl.nasa.gov/sats/phys_par/')
  const out = {}

  for (const c of tableRows(html)) {
    if (c.length < 10 || !/^\d+$/.test(c[2])) continue
    const radius = Number(c[6])
    if (Number.isFinite(radius)) out[c[2]] = { radiusKm: radius, name: c[1] }
  }
  return out
}

/**
 * Discovery circumstances, keyed by lowercased name *and* by provisional
 * designation with the spaces removed — the tables disagree about whether
 * `S/2002 N 5` has a space before the digit, so both forms are indexed.
 */
async function fetchDiscovery() {
  const html = await getText('https://ssd.jpl.nasa.gov/sats/discovery.html')
  const out = {}

  for (const c of tableRows(html)) {
    if (c.length < 5) continue
    const [numeral, name, provisional, year, discoverers] = c
    if (!/^\d{4}$/.test(year)) continue
    const row = {
      numeral: numeral || null,
      name: name || null,
      provisional: provisional || null,
      year: Number(year),
      discoverers: discoverers || null,
    }
    const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (name) out[key(name)] = row
    if (provisional) out[key(provisional)] = row
  }
  return out
}

/* ---------------------------------------------------------------- *
 * Horizons
 * ---------------------------------------------------------------- */

/**
 * One request, many epochs. Returns a record per time, in time order.
 *
 * Horizons separates element records by a line beginning with the Julian date,
 * which is what the split below keys on.
 */
/**
 * The dates Horizons will actually answer for, read out of its refusal.
 *
 * A satellite ephemeris covers the span it was fitted over and no more, and
 * Horizons declines rather than extrapolating — `No ephemeris for target "Pan"
 * prior to A.D. 1949-DEC-27`. The dates differ per body and are not published
 * anywhere this script can look them up ahead of time, so they are learned from
 * the error and the window is moved inside them.
 *
 * Returns `null` when the failure is something else, which must not be retried.
 */
const MONTHS = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
}

function parseHorizonsLimits(text) {
  // The two phrasings are not symmetrical — Horizons writes "prior **to** A.D."
  // but "after A.D.", with no "to". Building one pattern from a shared template
  // produced `after to A\\.D\\.`, which never matches, so the upper bound was
  // never learned and every body with a bounded ephemeris failed on the far end
  // no matter how many times it retried.
  const read = (pattern) => {
    const m = text.match(new RegExp(`${pattern} (\\d{4})-([A-Z]{3})-(\\d{2})`, 'i'))
    if (!m) return null
    return epochToJd(`${m[1]}-${String(MONTHS[m[2].toUpperCase()]).padStart(2, '0')}-${m[3]}`)
  }
  const earliest = read('prior to A\\.D\\.')
  const latest = read('after A\\.D\\.')
  return earliest === null && latest === null ? null : { after: earliest, before: latest }
}

async function fetchSeries({ code, centre, refPlane, times, name }) {
  const params = new URLSearchParams({
    format: 'text',
    COMMAND: code,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'ELEMENTS',
    CENTER: centre,
    REF_PLANE: refPlane,
    TLIST: times.map((t) => t.toFixed(6)).join(','),
    OUT_UNITS: 'KM-S',
  })

  const text = await getText(`https://ssd.jpl.nasa.gov/api/horizons.api?${params}`)
  const block = text.split('$$SOE')[1]?.split('$$EOE')[0]
  if (!block) {
    const error = new Error(`no ephemeris for ${name} (code ${code}): ${text.slice(-400).trim()}`)
    error.limits = parseHorizonsLimits(text)
    throw error
  }

  const records = block.trim().split(/\n(?=\s*\d{7}\.\d)/)
  return records.map((record) => {
    const read = (key) => {
      const match = record.match(new RegExp(`\\b${key}\\s*=\\s*(-?[\\d.]+E?[+-]?\\d*)`))
      if (!match) throw new Error(`missing ${key} for ${name}`)
      return Number(match[1])
    }
    return {
      jd: Number(record.trim().slice(0, 17)),
      a: read('A'),
      e: read('EC'),
      i: read('IN'),
      Omega: read('OM'),
      w: read('W'),
      M: read('MA'),
      nPerDay: read('N') * 86400,
    }
  })
}

/* ---------------------------------------------------------------- *
 * Fitting
 * ---------------------------------------------------------------- */

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

/**
 * Unwraps a sequence of angles in degrees so it runs continuously.
 *
 * Without this a node sitting near 0° flips between 359 and 1 and the fitted
 * slope comes out enormous and meaningless.
 */
function unwrap(degrees) {
  const out = [degrees[0]]
  for (let i = 1; i < degrees.length; i++) {
    let d = degrees[i] - degrees[i - 1]
    while (d > 180) d -= 360
    while (d < -180) d += 360
    out.push(out[i - 1] + d)
  }
  return out
}

/**
 * Least-squares line through `(x, y)`, returning value at x = 0 and slope.
 *
 * `x` is centuries from J2000, so the intercept is the element at J2000 and the
 * slope is degrees per century — exactly the pair the element schema wants.
 */
function fitLine(x, y) {
  const n = x.length
  const mx = mean(x)
  const my = mean(y)
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my)
    den += (x[i] - mx) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  return { at0: my - slope * mx, slope }
}

/**
 * Below these, a node or a periapsis is not a direction — it is arithmetic on
 * noise.
 *
 * The longitude of the ascending node is where the orbit crosses its reference
 * plane going north. For an orbit *in* that plane there is no such crossing, and
 * Horizons still reports a number: whatever the rounding happened to favour.
 * Same for the longitude of periapsis of a circle. Despina is i = 0.06°,
 * e = 0.0002, and its osculating node swings through hundreds of degrees while
 * the orbit itself does nothing at all.
 *
 * So both angles are gated. Below the threshold the rate is set to zero — not
 * because the orbit does not precess, but because nothing observable depends on
 * which way a circle in the reference plane is "pointing", and a fitted rate
 * there is a large number attached to no motion.
 */
const NODE_MATTERS_DEG = 1.0
const APSIS_MATTERS_E = 0.01

/**
 * The fit baseline for one body, in days.
 *
 * Half the shortest published precession period is the most that can be fitted
 * before the angle wraps and the slope stops being identifiable. Where JPL
 * publishes no period — it leaves the apsis blank for orbits too circular for
 * one to be meaningful — that term simply does not constrain the window.
 */
function fitSpanDays(row) {
  const periods = [row.nodeYears, row.apsisYears].filter((p) => p && p > 0)
  const years = Math.min(MAX_FIT_YEARS, ...periods.map((p) => p / 2))
  // A body with no published periods and a very short orbit still needs enough
  // baseline to see a trend at all; a few hundred orbits is plenty.
  return Math.max(years, 1) * 365.25
}

/**
 * Which way an angle is going, from a Horizons series. Magnitude discarded.
 *
 * This is the one thing JPL's mean-element table does not publish. It gives the
 * *period* of the node and apsis cycles and no sign, and the sign is half the
 * information: a node that regresses and one that advances at the same rate put
 * the orbit on opposite sides of where it started.
 *
 * Only the direction is taken because only the direction is reliable here. The
 * magnitude from a short osculating series carries the wobble described above;
 * JPL's published period is a proper average and is used for that instead.
 *
 * Returns 0 — meaning "do not apply a rate" — when the samples disagree with
 * their own trend badly enough that the direction is not established. The test
 * is that the total swing must exceed the largest step-to-step reversal, which
 * a genuine precession clears easily and a noisy near-zero angle does not.
 */
function precessionSign(angles) {
  const series = unwrap(angles)
  const swing = series[series.length - 1] - series[0]

  let worstReversal = 0
  for (let i = 1; i < series.length; i++) {
    const step = series[i] - series[i - 1]
    if (Math.sign(step) !== Math.sign(swing)) worstReversal = Math.max(worstReversal, Math.abs(step))
  }

  return Math.abs(swing) > worstReversal ? Math.sign(swing) : 0
}

/**
 * Builds one committed element row.
 *
 * ## Why JPL's table is the source and Horizons is only the witness
 *
 * The first version of this fitted everything from a Horizons time series, and
 * it was wrong in two ways that are worth recording because both look like
 * working code.
 *
 * **Mean longitude cannot be fitted.** Naiad orbits in 7 hours. Any sample
 * spacing wide enough to span its 7-month node cycle steps over fifteen whole
 * orbits at a time, so the unwrapped longitude is unrecoverable and the fitted
 * period came out as −279 days. Proteus came out as −55,906. The mean motion is
 * the one element nobody needs to fit: JPL publishes the mean period, and
 * `LDot` follows from it exactly.
 *
 * **Osculating means are not mean elements.** Averaging Horizons' eccentricity
 * over a window gives the average of the wobble in that window, not the mean
 * element. For the irregulars the two are far apart — the Sun pumps their
 * eccentricity on century timescales — and Neso came out at e = 0.667 against a
 * published 0.455, Sao at 0.132 against 0.296. Those are different orbits.
 *
 * So `a`, `e`, `i`, the phase and both precession periods are read from JPL's
 * mean-element table, which is exactly the properly-averaged quantity wanted.
 * Horizons is asked one question the table cannot answer — which *direction*
 * each precession runs — and is otherwise used only to check the result.
 *
 * ## The epoch shift
 *
 * The table publishes the inner moons at J2000 and the irregulars at 2020-01-01.
 * The app solves from J2000, so every angle is walked back to J2000 at its own
 * rate. For Neso that is 20 years of a 1,116-year node cycle: 6.5°, small but
 * not nothing, and free to get right.
 */
function buildElements(series, meanRow, useMeanElements, atJ2000, anchorJd = J2000) {
  /**
   * Which set of `a`, `e`, `i` to build on, and why it is not one rule.
   *
   * For the **inner** moons, JPL's mean elements are exactly right: the orbits
   * are circular, equatorial and stable, the published values match Horizons to
   * a fraction of a percent, and averaging is all upside.
   *
   * For the **irregulars** they are not usable, and two separate things go
   * wrong. Halimede is tabulated at e = 0.521 while its actual orbit sits near
   * e = 0.26 across the whole window — those are different ellipses, not two
   * estimates of one. Sao is tabulated at 0.296 against an actual 0.14. (Nereid,
   * checked as a control, agrees to four decimals, so the table is not simply
   * wrong; its irregular rows are a different kind of average from the one this
   * app needs.)
   *
   * And underneath that is something no element set can fix. Neso's osculating
   * eccentricity runs 0.47 → 0.77 → 0.62 → 0.85 across 150 years and its
   * inclination 123° → 142°, because the Sun pumps both on a century cycle. Its
   * orbit is not an ellipse that precesses; it is an ellipse that changes shape.
   *
   * So the irregulars are anchored to the osculating ellipse at J2000 — which
   * matches the truth exactly at that instant and degrades away from it — rather
   * than to an average that matches it nowhere. This is also what every existing
   * major moon does, so it is one rule less rather than one more.
   */
  const useOsculating = !useMeanElements

  const aKm = useOsculating ? atJ2000.a : meanRow.a
  const e = useOsculating ? atJ2000.e : meanRow.e
  const i = useOsculating ? atJ2000.i : meanRow.i

  const nodeMatters = i > NODE_MATTERS_DEG && i < 180 - NODE_MATTERS_DEG
  const apsisMatters = e > APSIS_MATTERS_E

  /**
   * °/century from a period in years, carrying the direction Horizons showed.
   *
   * A published period is ignored when it is not slow compared with the orbit
   * itself. Precession is a small perturbation on top of an orbit; a node that
   * came round in a handful of orbits would not be precession, it would be a
   * different orbit. JPL's table lists Setebos at a node *and* apsis period of
   * 48 years against an orbital period of 6.07 — eight orbits — where its
   * immediate neighbours Sycorax and Prospero are at 1,863 and 1,369 years.
   * Applied, it swung Setebos's orbit 7.5° a year and put the moon 105% of its
   * own orbit out of place. Every other body in the set clears this bar by more
   * than an order of magnitude, so it rejects the bad row and nothing else.
   */
  const orbitYears = meanRow.periodDays / 365.25
  const rateFrom = (years, sign) =>
    years && years > MIN_PRECESSION_ORBITS * orbitYears && sign ? (sign * 36000) / years : 0

  const OmegaDot = nodeMatters
    ? rateFrom(meanRow.nodeYears, precessionSign(series.map((r) => r.Omega)))
    : 0
  const varpiDot = apsisMatters
    ? rateFrom(meanRow.apsisYears, precessionSign(series.map((r) => wrap360(r.w + r.Omega))))
    : 0

  /**
   * The mean-motion source follows the same split.
   *
   * `LDot` here is only a starting value: `calibrateAlongTrack` measures the
   * residual rate against Horizons and corrects it, which is what absorbs the
   * mean-anomaly-versus-mean-longitude difference that JPL's published period
   * does not state.
   */
  const periodDays = useOsculating ? 360 / atJ2000.nPerDay : meanRow.periodDays
  const LDot = (360 / periodDays) * DAYS_PER_CENTURY

  // Phase, from whichever set this body is anchored to, at that set's epoch.
  const [OmegaAt, varpiAt, LAt, epochJd] = useOsculating
    ? [
        atJ2000.Omega,
        atJ2000.w + atJ2000.Omega,
        atJ2000.M + atJ2000.w + atJ2000.Omega,
        anchorJd,
      ]
    : [
        meanRow.node,
        meanRow.node + meanRow.w,
        meanRow.node + meanRow.w + meanRow.M,
        meanRow.epochJd,
      ]

  // …walked to J2000, each angle at its own rate. A no-op for the osculating
  // branch, which is already there.
  const dT = (J2000 - epochJd) / DAYS_PER_CENTURY

  return {
    periodDays,
    elements: {
      a: aKm / KM_PER_AU,
      aDot: 0,
      e,
      eDot: 0,
      i,
      iDot: 0,
      L: wrap360(LAt + LDot * dT),
      LDot,
      varpi: wrap360(varpiAt + varpiDot * dT),
      varpiDot,
      Omega: wrap360(OmegaAt + OmegaDot * dT),
      OmegaDot,
    },
    nodeMatters,
    apsisMatters,
    aKm,
  }
}

/**
 * Fetches a window, moving it inside the ephemeris if Horizons says to.
 *
 * The bounds are learned once per body and then shared by every later request
 * for it, so a moon whose ephemeris starts in 1949 costs exactly one wasted
 * round trip rather than one per window.
 *
 * Moving rather than merely shrinking matters. Pan's ephemeris runs from 1949,
 * so a 200-year window centred on J2000 is half outside it; recentring on the
 * available span keeps the full baseline the precession fit needs instead of
 * throwing away half of it. Only if the body's whole ephemeris is shorter than
 * the window does the span itself get cut.
 */
async function fetchWindow(request, spanDays, centreJd, bounds) {
  const build = () => {
    let span = spanDays
    let centre = centreJd

    if (bounds.after !== null || bounds.before !== null) {
      const lo = bounds.after ?? -Infinity
      const hi = bounds.before ?? Infinity
      // A day of margin: the limits Horizons reports are inclusive-ish and a
      // sample landing exactly on the boundary is refused.
      span = Math.min(span, hi - lo - 2)
      centre = Math.min(Math.max(centre, lo + span / 2 + 1), hi - span / 2 - 1)
    }

    const step = span / (FIT_SAMPLES - 1)
    return Array.from({ length: FIT_SAMPLES }, (_, k) => centre - span / 2 + k * step)
  }

  // Both ends have to be learned, and Horizons only reports the one you hit
  // first: asked before Pan's ephemeris starts it names the start date, and the
  // corrected window then runs off the far end and it names the finish. Three
  // attempts covers learning each end once and succeeding.
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchSeries({ ...request, times: build() })
    } catch (error) {
      if (!error.limits || attempt >= 2) throw error
      if (error.limits.after !== null) {
        bounds.after = Math.max(bounds.after ?? -Infinity, error.limits.after)
      }
      if (error.limits.before !== null) {
        bounds.before = Math.min(bounds.before ?? Infinity, error.limits.before)
      }
    }
  }
}

/* ---------------------------------------------------------------- *
 * Along-track calibration
 * ---------------------------------------------------------------- */

/**
 * Signed angle from `b` to `a` about the axis `n`, in degrees.
 *
 * Used to measure how far *along its orbit* the model has drifted from the
 * truth, as opposed to how far away in space — which is the distinction that
 * matters, because along-track is the error that grows without bound and
 * everything else oscillates.
 */
function signedAngleAbout(a, b, n) {
  const dot = (p, q) => p.x * q.x + p.y * q.y + p.z * q.z
  const cross = (p, q) => ({
    x: p.y * q.z - p.z * q.y,
    y: p.z * q.x - p.x * q.z,
    z: p.x * q.y - p.y * q.x,
  })
  const c = cross(b, a)
  return (Math.atan2(dot(c, n), dot(a, b)) * 180) / Math.PI
}

/** Unit orbit normal for a set of elements, in the same frame `positionAt` works in. */
function orbitNormal(elements, T) {
  const p0 = positionAt(elements, T)
  const p1 = positionAt(elements, T + 1e-9)
  const n = {
    x: p0.y * p1.z - p0.z * p1.y,
    y: p0.z * p1.x - p0.x * p1.z,
    z: p0.x * p1.y - p0.y * p1.x,
  }
  const len = Math.hypot(n.x, n.y, n.z) || 1
  return { x: n.x / len, y: n.y / len, z: n.z / len }
}

/**
 * Corrects `L` and `LDot` so the moon is in the right *place* on its orbit.
 *
 * ## Why this is needed at all
 *
 * JPL publishes a period, and there is more than one thing a period can mean.
 * Its tables give the mean-anomaly period; this app's `kepler.js` propagates
 * mean *longitude* and derives `M = L - varpi`. The two differ by the apsidal
 * rate, and for these moons that is not a rounding error — Naiad's orbit
 * precesses so hard that taking one for the other left it drifting 1.717° per
 * day, which is a full orbit every three weeks and half the sky within a month.
 *
 * That number is worth keeping: 1.717°/day is exactly Naiad's node rate. The
 * relation behind it (an oblate planet advances the periapsis at twice the rate
 * it regresses the node) is real, standard, and visible in JPL's own table,
 * where Larissa's apsis period of 1.257 years is precisely half its node period
 * of 2.514. It would have been defensible to hard-code it.
 *
 * This measures it instead. The relation is a small-inclination,
 * small-eccentricity approximation, and the moons it would be applied to are
 * exactly the ones where the underlying angles are least well defined. Fitting
 * the residual against Horizons costs one more request and is correct whatever
 * the convention turns out to be — including for the distant irregulars, where
 * the oblateness relation does not hold at all because the Sun, not the bulge,
 * is doing the perturbing.
 *
 * ## How
 *
 * The residual is the signed angle *around the orbit* between the model and
 * Horizons at each epoch. A constant offset means the phase at J2000 is out; a
 * linear trend means the rate is. Both are read off one straight line and
 * subtracted.
 *
 * The window is deliberately short — fifty orbits, not the precession baseline —
 * so the residual cannot wrap past 180° and alias into a wrong slope. Fifty
 * orbits is enough to see a rate error of one part in a thousand.
 */
function calibrateAlongTrack(elements, series) {
  const x = []
  const residual = []

  for (const record of series) {
    const T = (record.jd - J2000) / DAYS_PER_CENTURY
    const ours = positionAt(elements, T)
    const theirs = positionAt(
      {
        a: record.a / KM_PER_AU, aDot: 0,
        e: record.e, eDot: 0,
        i: record.i, iDot: 0,
        L: wrap360(record.M + record.w + record.Omega), LDot: 0,
        varpi: wrap360(record.w + record.Omega), varpiDot: 0,
        Omega: wrap360(record.Omega), OmegaDot: 0,
      },
      0,
    )
    x.push(T)
    residual.push(signedAngleAbout(ours, theirs, orbitNormal(elements, T)))
  }

  const line = fitLine(x, unwrap(residual))
  return {
    ...elements,
    L: wrap360(elements.L - line.at0),
    LDot: elements.LDot - line.slope,
  }
}

/* ---------------------------------------------------------------- *
 * Verification
 * ---------------------------------------------------------------- */

/**
 * Worst distance, in km, between where the committed elements put the moon and
 * where Horizons says it is — across every sampled epoch.
 *
 * Deliberately run through **the app's own `positionAt`**, not a second solver
 * written for the test. A check that reimplements the thing it is checking only
 * proves the two agree with each other; this one fails if `kepler.js` is wrong,
 * if the epoch shift is wrong, or if the elements are.
 *
 * Horizons gives the state as classical elements rather than a vector, so its
 * position is reconstructed from its own osculating set at that instant — an
 * exact operation, since an osculating ellipse matches the true position by
 * definition.
 *
 * The error this reports is real physics, not a bug: a mean ellipse is not
 * meant to land on an osculating position. It is the size of everything this
 * model leaves out, which is exactly the number worth printing.
 */
/** The nearest date inside a body's ephemeris. See `fetchWindow`. */
function clampToBounds(jd, bounds) {
  if (bounds.after !== null && jd < bounds.after + 1) return bounds.after + 1
  if (bounds.before !== null && jd > bounds.before - 1) return bounds.before - 1
  return jd
}

async function positionErrorAt(elements, request, jd) {
  const [record] = await fetchSeries({ ...request, times: [jd] })
  return checkAgainstSeries(elements, [record])
}

function checkAgainstSeries(elements, series) {
  let worst = 0

  for (const record of series) {
    const T = (record.jd - J2000) / DAYS_PER_CENTURY

    const ours = positionAt(elements, T)

    // Horizons' own osculating elements, solved the same way, at the same instant.
    const theirs = positionAt(
      {
        a: record.a / KM_PER_AU,
        aDot: 0,
        e: record.e,
        eDot: 0,
        i: record.i,
        iDot: 0,
        L: wrap360(record.M + record.w + record.Omega),
        LDot: 0,
        varpi: wrap360(record.w + record.Omega),
        varpiDot: 0,
        Omega: wrap360(record.Omega),
        OmegaDot: 0,
      },
      0,
    )

    const km = Math.hypot(ours.x - theirs.x, ours.y - theirs.y, ours.z - theirs.z) * KM_PER_AU
    worst = Math.max(worst, km)
  }

  return worst
}


/* ---------------------------------------------------------------- *
 * Prose, composed from measurements
 * ---------------------------------------------------------------- */

/**
 * The dossier text for a minor moon, assembled from what is measured.
 *
 * A major moon's write-up in `moonData.js` is written by hand because there is
 * something to say. Here there is not: no spacecraft has resolved any of these,
 * so the only true sentences available are the ones the numbers support. Writing
 * them by hand for four hundred bodies would produce four hundred paraphrases of
 * the same three facts, and the temptation at that scale is to reach for
 * something more interesting than the evidence.
 *
 * So it is generated, from the orbit and the discovery record and nothing else.
 * Every clause below traces to a fetched value. Where a value is missing the
 * clause is dropped rather than softened, which is why the shortest entries are
 * two sentences and the longest four.
 */
function describe(body, elements, parent) {
  const aKm = elements.a * KM_PER_AU
  const years = body.periodDays / 365.25
  const sentences = []

  const size = body.radiusSource === 'measured'
    ? `about ${Math.round(body.radiusKm * 2).toLocaleString('en-GB')} km across`
    : `roughly ${Math.round(body.radiusKm * 2).toLocaleString('en-GB')} km across, judged from its brightness`

  const orbit = years >= 1
    ? `once every ${years.toFixed(1)} years`
    : `once every ${body.periodDays.toFixed(1)} days`

  sentences.push(
    `A small ${body.family === 'inner' ? 'inner' : 'irregular'} moon of ` +
      `${parent.name}, ${size}. It goes round ${orbit}, ` +
      `${formatDistance(aKm)} out.`,
  )

  if (body.family === 'irregular') {
    sentences.push(
      `That is far enough that the Sun, rather than ${parent.name}, controls its orbit — ` +
        `the signature of a body that formed elsewhere and was captured` +
        (body.retrograde ? `, and it travels backwards, which is the strongest evidence of all.` : `.`),
    )
  }

  if (elements.e > 0.3) {
    sentences.push(
      `Its orbit is markedly lopsided: it swings between ` +
        `${formatDistance(aKm * (1 - elements.e))} and ${formatDistance(aKm * (1 + elements.e))}.`,
    )
  }

  if (body.discoveredYear && body.discoveredBy) {
    sentences.push(`Found in ${body.discoveredYear} by ${body.discoveredBy}.`)
  }

  return sentences.join(' ')
}

/** `12178044` → `'12.2 million km'`; smaller values in plain kilometres. */
function formatDistance(km) {
  if (km >= 1e6) return `${(km / 1e6).toFixed(1)} million km`
  return `${Math.round(km).toLocaleString('en-GB')} km`
}

/**
 * Three checkable statements, each one a number the panel does not already show.
 *
 * No fourth is offered where a body has only three worth making. A padded list
 * would read as though every one of these rocks were equally interesting, and
 * the whole point of separating them from the major moons is that they are not.
 */
function buildFacts(body, elements, parent) {
  const facts = []
  const aKm = elements.a * KM_PER_AU

  if (elements.e > 0.05) {
    facts.push(
      `Its distance from ${parent.name} varies by a factor of ` +
        `${((1 + elements.e) / (1 - elements.e)).toFixed(1)} over one orbit.`,
    )
  }

  if (body.family === 'irregular') {
    facts.push(
      `Its orbit is tilted ${elements.i.toFixed(0)}° to the ecliptic` +
        (body.retrograde
          ? ` — past 90°, which means it orbits backwards relative to ${parent.name}'s motion around the Sun.`
          : `, one of the few here that still travels the same way the planets do.`),
    )
  } else {
    facts.push(
      `It orbits within ${elements.i < 1 ? 'a degree' : `${elements.i.toFixed(0)}°`} of ` +
        `${parent.name}'s equator, held there by the planet's own bulge.`,
    )
  }

  if (body.designation) {
    facts.push(
      `Catalogued as ${body.designation}` +
        (body.numeral ? ` and numbered ${parent.name} ${body.numeral}.` : '.'),
    )
  }

  facts.push(
    body.radiusSource === 'measured'
      ? `Its size has actually been measured; most moons this small have not.`
      : `Nobody has measured its size. The figure here is worked out from how bright it is, ` +
        `assuming a surface as dark as its neighbours — if that assumption is wrong it could be ` +
        `half or twice as wide.`,
  )

  return facts
}

/* ---------------------------------------------------------------- *
 * Rendering
 * ---------------------------------------------------------------- */

const fmt = (n, digits = 8) => n.toFixed(digits)

function renderElementRow(body) {
  const e = body.elements
  return `  ${body.id}: {
    // ${body.name} — ${body.source}
    parent: '${body.parent}',
    plane: '${body.plane}',
    /** Sidereal period in days: ${body.periodDays.toFixed(6)}. */
    a: ${e.a.toExponential(9)}, aDot: 0,
    e: ${fmt(e.e)}, eDot: 0,
    i: ${fmt(e.i)}, iDot: 0,
    L: ${fmt(e.L)}, LDot: ${fmt(e.LDot)},
    varpi: ${fmt(e.varpi)}, varpiDot: ${fmt(e.varpiDot)},
    Omega: ${fmt(e.Omega)}, OmegaDot: ${fmt(e.OmegaDot)},
  },`
}

function renderElements(bodies) {
  return `/**
 * Minor-moon orbital elements.
 *
 * GENERATED by \`scripts/fetch-minor-moons.mjs\` — do not hand-edit; rerun
 * \`npm run fetch:minor-moons\` instead. Generated ${new Date().toISOString().slice(0, 10)}.
 *
 * Unlike \`moonElements.js\`, every row here carries **real precession rates**,
 * fitted from a Horizons time series rather than left at zero. These orbits
 * precess fast enough that freezing them would be visibly wrong: Naiad's node
 * turns once every seven months.
 *
 * \`plane\` is per body and matters more here than for the major moons:
 *
 *   'equator'   the parent's equatorial plane, for the inner moons its
 *               oblateness controls.
 *   'ecliptic'  about the parent but referred to the ecliptic, for the distant
 *               irregulars the Sun controls. Fetching one of these in the
 *               equator frame does not give a worse answer, it gives a
 *               different angle — Nereid reads 28.4° there against a true 5.1°.
 *
 * See the generating script for how the fit is sized and what it still misses.
 */

/** @type {Record<string, import('./orbitalElements').Elements & {parent: string, plane: 'equator'|'ecliptic'}>} */
export const MINOR_MOON_ELEMENTS = {
${bodies.map(renderElementRow).join('\n\n')}
}
`
}

const quote = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "\\'")}'`)

function renderDataRow(body) {
  const e = body.elements
  const parent = PARENTS[body.parent]
  const aKm = e.a * KM_PER_AU
  const years = body.periodDays / 365.25

  const facts = buildFacts(body, e, parent)

  return `  {
    id: '${body.id}',
    name: ${quote(body.name)},
    parent: '${body.parent}',
    family: '${body.family}',
    group: ${quote(body.group ?? null)},
    radiusKm: ${body.radiusKm},
    radiusSource: ${quote(body.radiusSource)},
    model: ${body.model === null ? 'null' : body.model},
    designation: ${quote(body.designation)},
    numeral: ${quote(body.numeral)},
    discoveredYear: ${body.discoveredYear ?? 'null'},
    discoveredBy: ${quote(body.discoveredBy)},
    retrograde: ${body.retrograde},

    diameter: ${quote(
      body.radiusSource === 'measured'
        ? `${Math.round(body.radiusKm * 2).toLocaleString('en-GB')} km`
        : `~${Math.round(body.radiusKm * 2).toLocaleString('en-GB')} km (estimated)`,
    )},
    distance: ${quote(`${formatDistance(aKm)} from ${parent.name}`)},
    yearLength: ${quote(
      years >= 1
        ? `${years.toFixed(1)} years per orbit`
        : `${body.periodDays.toFixed(2)} days per orbit`,
    )},
    atmosphere: 'None — far too small to hold one.',
    description: ${quote(describe(body, e, parent))},
    facts: [
${facts.map((f) => `      ${quote(f)},`).join('\n')}
    ],
    nasaLinks: [
      { label: ${quote(`NASA — ${parent.name}'s moons`)}, url: ${quote(parent.moonsUrl)} },
      { label: 'JPL — satellite mean elements', url: 'https://ssd.jpl.nasa.gov/sats/elem/' },
    ],
  },`
}

function renderData(bodies) {
  const byParent = {}
  for (const b of bodies) (byParent[b.parent] ??= []).push(b)

  const sections = Object.entries(byParent)
    .map(([parent, list]) => `  /* ---- ${parent} — ${list.length} ---- */\n${list.map(renderDataRow).join('\n')}`)
    .join('\n\n')

  return `/**
 * Minor moons.
 *
 * GENERATED by \`scripts/fetch-minor-moons.mjs\` — do not hand-edit; rerun
 * \`npm run fetch:minor-moons\` instead. Generated ${new Date().toISOString().slice(0, 10)}.
 *
 * The counterpart to \`moonData.js\`, and deliberately a much thinner file. A
 * major moon gets a written dossier because there is something to say about it;
 * these are mostly a few kilometres of unresolved rock, and the honest entry is
 * the measurements plus who found them and when. Anything more would be
 * invention dressed as description, which is the one thing a body nobody has
 * photographed cannot afford.
 *
 * \`radiusSource\` says where the size came from, because it varies in kind:
 * \`'measured'\` is JPL's published mean radius, \`'estimated'\` is derived from
 * brightness under an assumed albedo and could be out by a factor of two if the
 * assumption is wrong.
 *
 * \`model\` is which of the three generic asteroid meshes the body is drawn with,
 * or \`null\` where a real shape model exists. See \`minor-moon-roster.mjs\` — the
 * number is arbitrary and says nothing about the body.
 *
 * \`retrograde\` is derived from the fitted inclination rather than stated: an
 * orbit past 90° is one travelled backwards.
 */

export const MINOR_MOONS_RAW = [
${sections}
]
`
}

/* ---------------------------------------------------------------- *
 * Entry point
 * ---------------------------------------------------------------- */

async function main() {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const roster = wanted.length
    ? ALL_MINOR_MOONS.filter((m) => wanted.includes(m.parent) || wanted.includes(m.id))
    : ALL_MINOR_MOONS

  if (!roster.length) {
    throw new Error(`nothing matched ${wanted.join(', ')}; known parents: ${Object.keys(MINOR_MOON_ROSTER).join(', ')}`)
  }

  console.log('[minor] fetching JPL reference tables…')
  const [meanElements, physical, discovery] = await Promise.all([
    fetchMeanElements(),
    fetchPhysical(),
    fetchDiscovery(),
  ])
  console.log(
    `[minor]   ${Object.keys(meanElements).length} mean-element rows, ` +
      `${Object.keys(physical).length} measured radii, ` +
      `${Object.keys(discovery).length} discovery records`,
  )

  const elementRows = []
  const dataRows = []
  const warnings = []

  for (const moon of roster) {
    const parent = PARENTS[moon.parent]

    /**
     * A body whose orbit is stated in the roster rather than fetched.
     *
     * The escape hatch for something real that no ephemeris service carries.
     * Exactly one body uses it — S/2009 S 1, which has never been directly seen
     * — and the roster entry records where its numbers come from and which one
     * of them is reasoned rather than transcribed.
     *
     * Nothing is calibrated or cross-checked here, because there is nothing to
     * check against; that is the whole reason the hatch exists. The row is
     * emitted as given, with its provenance carried into the generated file so
     * it cannot be mistaken for a fetched one.
     */
    if (moon.elements) {
      const el = moon.elements
      const e = {
        a: el.aKm / KM_PER_AU, aDot: 0,
        e: el.e, eDot: 0,
        i: el.i, iDot: 0,
        L: el.L, LDot: el.LDot,
        varpi: 0, varpiDot: 0,
        Omega: 0, OmegaDot: 0,
      }
      console.log(
        `[minor] ${moon.name.padEnd(12)} ${'equator'.padEnd(8)} ` +
          `a=${el.aKm.toFixed(0).padStart(9)}km e=${el.e.toFixed(3)} i=${el.i.toFixed(1).padStart(6)}° ` +
          `P=${el.periodDays.toFixed(3).padStart(10)}d  [stated, not fetched]`,
      )

      elementRows.push({
        ...moon,
        plane: 'equator',
        periodDays: el.periodDays,
        elements: e,
        source: moon.source,
      })
      dataRows.push({
        ...moon,
        radiusSource: 'estimated',
        retrograde: false,
        elements: e,
        periodDays: el.periodDays,
        designation: moon.name,
        numeral: null,
        discoveredYear: 2009,
        discoveredBy: 'Cassini Imaging Team',
      })
      continue
    }

    const meanRow = meanElements[moon.code]
    if (!meanRow) {
      throw new Error(`${moon.name}: Horizons code ${moon.code} is not in JPL's mean-element table`)
    }

    /**
     * The frame decision, from physics rather than from JPL's presentation.
     *
     * An inner moon is held in its planet's equatorial plane by that planet's
     * oblateness; a distant irregular is held near the ecliptic by the Sun. That
     * is the whole rule, and the roster already records which each moon is.
     *
     * Driving it off the *table's* frame instead was the first attempt and it
     * does not work, because JPL presents the same physical situation three
     * different ways: Neptune's inner moons in a Laplace frame at 0.4°, Uranus's
     * in a Laplace frame at 180.0°, and Uranus's majors as plainly
     * `equatorial`. All three are the same statement about the sky.
     */
    const equatorial = moon.family === 'inner'
    const plane = equatorial ? 'equator' : 'ecliptic'
    const refPlane = equatorial ? 'B' : 'ECLIPTIC'

    /**
     * Whether the table's own angles can be used, or only its periods.
     *
     * They can be used when the table expresses this moon in the frame the app
     * is about to draw it in — a Laplace plane sitting on the parent's equator.
     * Where it does not, the angles would need rotating between frames, and
     * fetching them from Horizons in the right frame to begin with is both
     * simpler and exactly what every existing major moon does.
     *
     * Uranus's inner thirteen land here: their Laplace plane *is* the equator,
     * but described from the far pole, so the node and inclination are measured
     * from the other side and cannot be read across.
     */
    const tiltToPlane =
      meanRow.tilt === null ? null : Math.min(Math.abs(meanRow.tilt), Math.abs(180 - meanRow.tilt))
    const useMeanElements =
      equatorial &&
      meanRow.frame === 'Laplace' &&
      tiltToPlane !== null &&
      tiltToPlane <= EQUATOR_TILT_LIMIT &&
      Math.abs(meanRow.tilt) <= EQUATOR_TILT_LIMIT

    /**
     * Two windows, because they are asked two different questions.
     *
     * The **precession** window is long — half a node or apsis cycle — because
     * a slow turn is only visible over a long baseline. The **calibration**
     * window is short, fifty orbits, because the along-track residual it fits
     * must not wrap past 180° and alias into a plausible wrong slope. Naiad's
     * fifty orbits are a fortnight; Nereid's are forty-nine years.
     *
     * Both are centred on J2000 with an odd sample count, so both contain a
     * sample exactly on it — and that sample is the osculating anchor the
     * irregulars are built from.
     */
    const spanDays = fitSpanDays(meanRow)
    /** Learned lazily from Horizons' own refusals; shared by every request below. */
    const bounds = { after: null, before: null }

    process.stdout.write(`[minor] ${moon.name.padEnd(12)} ${plane.padEnd(8)} `)
    const request = { ...moon, centre: parent.centre, refPlane }
    const series = await fetchWindow(request, spanDays, J2000, bounds)


    /**
     * Calibration, widening.
     *
     * One window cannot do this job. It has to be short enough that the
     * along-track residual never wraps past 180° — otherwise the fitted slope
     * is off by whole orbits and looks fine — and long enough that the rate it
     * pins still holds decades later. For Naiad those are contradictory: fifty
     * of its orbits are a fortnight, and extrapolating a fortnight's fit to
     * today left it 55% of an orbit out of place.
     *
     * So it is done in rounds. The first window is short and its answer is
     * unambiguous; each later window is ten times longer, and by then the
     * residual it has to fit is small enough not to wrap. Three rounds take
     * Naiad from a fortnight to four years and its present-day error from 55%
     * to a fraction of a percent.
     *
     * The last window is capped at the app's own range rather than the
     * precession baseline, because matching reality *inside* the dates a user
     * can select is the whole objective.
     */
    const calSpans = [50, 500, 5000]
      .map((orbits) => Math.min(orbits * meanRow.periodDays, MAX_FIT_YEARS * 365.25))
      .filter((span, k, all) => k === 0 || span > all[k - 1] * 1.5)

    /**
     * Where to anchor, when Horizons cannot answer at J2000.
     *
     * A moon discovered last year has an ephemeris fitted to last year's arc,
     * and JPL does not extrapolate it back a quarter century — it returns a
     * *hyperbolic* orbit rather than an error. S/2025 U 1 came back at
     * a = −12,061 km, e = 169,907, which is not a near miss, it is nonsense that
     * would have propagated silently into the committed file.
     *
     * So the anchor falls back to the epoch JPL fitted the thing at, and the
     * phase is walked to J2000 afterwards exactly as the mean-element branch
     * already does. Automatic rather than a per-body exception, because every
     * newly discovered moon will arrive with this same problem.
     */
    let anchorJd = J2000
    let firstSeries = await fetchWindow(request, calSpans[0], anchorJd, bounds)
    let atJ2000 = firstSeries[(FIT_SAMPLES - 1) / 2]

    if (!(atJ2000.e < 1) || !(atJ2000.a > 0)) {
      anchorJd = meanRow.epochJd
      warnings.push(
        `${moon.name}: no usable orbit at J2000 (e=${atJ2000.e.toExponential(2)}, ` +
          `a=${atJ2000.a.toFixed(0)} km) — anchored at ${meanRow.epoch} instead`,
      )
      firstSeries = await fetchWindow(request, calSpans[0], anchorJd, bounds)
      atJ2000 = firstSeries[(FIT_SAMPLES - 1) / 2]
    }

    let e = buildElements(series, meanRow, useMeanElements, atJ2000, anchorJd).elements
    let calSeries = firstSeries
    for (const [round, span] of calSpans.entries()) {
      if (round > 0) calSeries = await fetchWindow(request, span, anchorJd, bounds)
      e = calibrateAlongTrack(e, calSeries)
    }
    const built = buildElements(series, meanRow, useMeanElements, atJ2000, anchorJd)
    /**
     * Backwards compared with what?
     *
     * For an equator-frame moon the useful question is whether it goes round
     * against its planet's spin, so the frame's own handedness is divided out.
     * For an irregular, referred to the ecliptic, `i > 90°` is the standard and
     * the one every catalogue uses — which is how Margaret comes out as the
     * lone prograde Uranian irregular among ten retrograde ones.
     */
    const retrograde = plane === 'equator' ? e.i > 90 !== parent.retrogradeSpin : e.i > 90
    // JPL's measured radius wins; the roster's brightness-derived estimate is
    // the fallback, and the two can never silently disagree because the measured
    // one is never overridden.
    const measured = physical[moon.code]
    const radiusKm = measured?.radiusKm ?? moon.radiusKm ?? null

    if (radiusKm === null) {
      warnings.push(
        `${moon.name}: no measured radius from JPL and no roster fallback — add a radiusKm`,
      )
    }

    /**
     * Does the committed ellipse put the moon where Horizons says it is?
     *
     * Two numbers, because they answer different questions. `worst` is across
     * the whole calibration window and is the pessimistic bound. `today` is at
     * the date the app actually opens on, which is what anybody will ever look
     * at — and for a body anchored to its J2000 osculating ellipse the two can
     * be far apart, because the error grows with distance from the anchor.
     */
    const worstKm = checkAgainstSeries(e, calSeries, meanRow)
    const worstPercent = (worstKm / built.aKm) * 100

    const todayKm = await positionErrorAt(e, request, clampToBounds(nowJd, bounds))
    const todayPercent = (todayKm / built.aKm) * 100

    if (todayPercent > 12) {
      warnings.push(
        `${moon.name}: ${todayKm.toFixed(0)} km out of position today, ` +
          `${todayPercent.toFixed(1)}% of its orbit`,
      )
    }

  const rate = (dot, years, what) =>
      dot === 0 ? '' : ` ${what}${dot < 0 ? '−' : '+'}${(years ?? 0).toFixed(0)}yr`

    console.log(
      `a=${built.aKm.toFixed(0).padStart(9)}km e=${e.e.toFixed(3)} i=${e.i.toFixed(1).padStart(6)}° ` +
        `P=${built.periodDays.toFixed(3).padStart(10)}d ` +
        `now=${todayPercent.toFixed(1).padStart(5)}% worst=${worstPercent.toFixed(1).padStart(5)}%` +
        rate(e.OmegaDot, meanRow.nodeYears, 'node') +
        rate(e.varpiDot, meanRow.apsisYears, 'apsis'),
    )

    elementRows.push({
      ...moon,
      plane,
      periodDays: built.periodDays,
      elements: e,
      source:
        `JPL mean elements at ${meanRow.epoch} (${meanRow.frame} frame), shifted to J2000; ` +
        `precession direction from Horizons REF_PLANE=${refPlane} about ${parent.centre}`,
    })

    const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const found = discovery[key(moon.name)] ?? {}
    dataRows.push({
      ...moon,
      radiusKm,
      radiusSource: measured ? 'measured' : 'estimated',
      retrograde,
      elements: e,
      periodDays: built.periodDays,
      designation: found.provisional ?? null,
      numeral: found.numeral ?? null,
      discoveredYear: found.year ?? null,
      discoveredBy: found.discoverers ?? null,
    })
  }

  writeFileSync(ELEMENTS_OUT, renderElements(elementRows))
  writeFileSync(DATA_OUT, renderData(dataRows))
  console.log(`\n[minor] wrote ${ELEMENTS_OUT}`)
  console.log(`[minor] wrote ${DATA_OUT}`)

  if (warnings.length) {
    console.log(`\n[minor] ${warnings.length} warnings:`)
    for (const w of warnings) console.log(`[minor]   ${w}`)
  }
}

main().catch((error) => {
  console.error(`\n[minor] ${error.message}`)
  process.exitCode = 1
})
