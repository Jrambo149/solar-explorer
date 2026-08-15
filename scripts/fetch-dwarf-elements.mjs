#!/usr/bin/env node
/**
 * Bakes dwarf-planet orbital elements by fitting JPL Horizons.
 *
 * Run with `npm run fetch:dwarfs`. Writes `src/data/dwarfElements.js`, which is
 * committed — the app itself never talks to the network, and this script exists
 * so that the numbers in that file can be traced to a source and refreshed
 * rather than being folklore typed in from memory.
 *
 * ## Why these bodies are not in the planet table
 *
 * `orbitalElements.js` carries JPL's *Approximate Positions of the Major
 * Planets*: six elements plus six linear rates fitted across 1800–2050. That
 * table covers the eight planets and Pluto, and nothing else. Ceres, Eris,
 * Haumea and Makemake have no such fit published.
 *
 * ## So this makes one
 *
 * The first version of this script took a single set of osculating elements
 * from the Small-Body Database and propagated them as two-body motion. That
 * was wrong by 11 degrees for Ceres in 1850 — not a subtle error, a body
 * visibly in the wrong part of its orbit. Osculating elements describe the
 * ellipse the body is on *at one instant*; Jupiter is steadily changing
 * Ceres's, and a frozen ellipse accumulates the whole two centuries of that
 * change as phase error.
 *
 * The fix is the same one JPL used for the planets. Horizons is asked for
 * osculating elements once a year across the whole 1800–2050 window, and each
 * element is least-squares fitted to a straight line in time. The oscillations
 * average out and what remains is the secular drift — which is exactly what a
 * `varpiDot` or an `OmegaDot` in the planet table is. Same model, same shape,
 * same window, so `kepler.js` needs no special case.
 *
 * The one subtlety is the angles: mean longitude runs through many turns
 * across 250 years, so it has to be unwrapped before fitting or every wrap
 * would drag the line flat.
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src/data/dwarfElements.js')
const OUT_ASTEROIDS = join(ROOT, 'src/data/asteroidBodyElements.js')

const J2000 = 2451545.0
const DAYS_PER_CENTURY = 36525

/**
 * The trailing `;` marks a small-body designation. Without it Horizons reads
 * `1` as Mercury barycentre, which would silently produce elements for
 * entirely the wrong object.
 */
const BODIES = [
  { id: 'ceres', command: '1;', name: 'Ceres', group: 'dwarf' },
  { id: 'eris', command: '136199;', name: 'Eris', group: 'dwarf' },
  { id: 'haumea', command: '136108;', name: 'Haumea', group: 'dwarf' },
  { id: 'makemake', command: '136472;', name: 'Makemake', group: 'dwarf' },

  /*
   * And the asteroids big enough to be places rather than population.
   *
   * They are here rather than in `asteroids.js` because that file is a
   * *population* — three and a half thousand osculating ellipses, right about
   * the belt's shape and approximate about any one rock's phase. These five are
   * bodies someone looks at, and a body someone looks at needs the same fit
   * Ceres gets. Ceres is the precedent in both directions: it is in the belt
   * data as a rock and here as a world.
   *
   * Vesta, Pallas and Hygiea are the three largest after Ceres. Juno is here
   * for history — with Ceres, Pallas and Vesta it was one of the original four,
   * each counted as a planet for half a century. Psyche is here because a
   * spacecraft of the same name is already in this app's roster and arrives in
   * 2029.
   */
  { id: 'vesta', command: '4;', name: 'Vesta', group: 'asteroid' },
  { id: 'pallas', command: '2;', name: 'Pallas', group: 'asteroid' },
  { id: 'hygiea', command: '10;', name: 'Hygiea', group: 'asteroid' },
  { id: 'juno', command: '3;', name: 'Juno', group: 'asteroid' },
  { id: 'psyche', command: '16;', name: 'Psyche', group: 'asteroid' },

  /*
   * And the one whose orbit does not survive the window.
   *
   * Apophis passes 31,000 km above the Earth's surface on 13 April 2029 —
   * inside the ring of geostationary satellites — and comes out on a different
   * orbit. Not slightly different: its semi-major axis goes from 0.922 AU to
   * 1.103, its inclination is bent from 3.34° to 2.22°, and its year runs from
   * 324 days to 423. It stops being an Aten, an asteroid whose orbit lies
   * mostly inside Earth's, and becomes an Apollo, which crosses from outside.
   * The encounter changes what kind of object it is.
   *
   * So it is fitted **twice**, either side of the encounter, and carries both
   * sets. A single straight line through that step would be wrong before 2029,
   * wrong after it, and plausible-looking throughout — which is the worst of
   * the three outcomes.
   */
  {
    id: 'apophis',
    command: '99942;',
    name: 'Apophis',
    group: 'asteroid',
    /*
     * Sampled monthly rather than yearly, and fitted over 2000–2050 rather
     * than 1800–2050.
     *
     * Both for the same reason: this is a near-Earth asteroid with a 324-day
     * year, so a yearly sample walks its mean longitude by 405° a step — more
     * than a full turn — and the unwrapping that keeps the fit honest needs
     * consecutive samples less than half a turn apart. At yearly spacing the
     * fitted mean motion is not merely inaccurate, it is aliased: the fit sees
     * the 45° remainder and misses the whole revolution.
     *
     * The short window is a matter of what can be claimed. Apophis was found in
     * 2004 and its orbit is chaotic — it passes close to the Earth repeatedly —
     * so an integration back to 1800 is a far weaker statement than the same
     * integration back to 2000, and nothing in this app looks at a near-Earth
     * asteroid in the nineteenth century.
     */
    step: '30d',
    from: '2000-01-01',
    to: '2050-01-01',
    /*
     * Split at the encounter, and again every five years.
     *
     * The encounter is the split that *must* exist — it is a discontinuity, and
     * no continuous function can cross it. The others are there because a
     * straight line is a poor model of this orbit even within an era: fitted as
     * two eras only, the position came out 58 arcminutes from Horizons in 2015,
     * which for a body that laps its orbit in 324 days is nearly a day of
     * timing error — and the whole point of having Apophis in the app is a date
     * in April 2029.
     *
     * Five-year pieces cost nine extra element sets, about a kilobyte, and are
     * the difference between an approach found to the day and one found to the
     * week. `scripts/verify-events.mjs` measures what it actually buys.
     */
    split: [
      '2005-01-01', '2010-01-01', '2015-01-01', '2020-01-01', '2025-01-01',
      '2029-04-13',
      '2035-01-01', '2040-01-01', '2045-01-01',
    ],
  },
]

/**
 * Yearly sampling, across the same window the planet table is fitted for.
 *
 * A year is set by the fastest body: Ceres covers 78° of its orbit in one, and
 * the unwrapping below needs consecutive samples under half a turn apart. It
 * gives 251 points per body, which is far more than a straight line needs but
 * costs one request.
 */
const START = '1800-01-01'
const STOP = '2050-01-01'
const STEP = '1 y'

async function fetchSeries({ command, name, from = START, to = STOP, step = STEP }) {
  const params = new URLSearchParams({
    format: 'text',
    COMMAND: command,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'ELEMENTS',
    CENTER: '500@10',
    REF_PLANE: 'ECLIPTIC',
    OUT_UNITS: 'AU-D',
    START_TIME: `'${from}'`,
    STOP_TIME: `'${to}'`,
    STEP_SIZE: `'${step}'`,
  })

  const res = await fetch(`https://ssd.jpl.nasa.gov/api/horizons.api?${params}`)
  if (!res.ok) throw new Error(`Horizons HTTP ${res.status} for ${name}`)

  const text = await res.text()
  const block = text.split('$$SOE')[1]?.split('$$EOE')[0]
  if (!block) throw new Error(`no ephemeris block for ${name}:\n${text.slice(-600)}`)

  // Each sample is four lines: a JD header then three lines of KEY= value.
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
      jd,
      T: (jd - J2000) / DAYS_PER_CENTURY,
      a: read('A'),
      e: read('EC'),
      i: read('IN'),
      Omega: read('OM'),
      w: read('W'),
      M: read('MA'),
    }
    if (Object.values(row).every(Number.isFinite)) rows.push(row)
  }

  if (rows.length < 50) throw new Error(`only ${rows.length} samples for ${name}`)
  // The julian date is kept alongside `T` so a series can be split at a date.
  return rows
}

/**
 * Remove 360° jumps from a sequence of angles.
 *
 * Fitting a line through wrapped angles is meaningless: mean longitude climbs
 * through thousands of degrees over the window, and leaving it folded into
 * [0, 360) would produce a sawtooth whose best-fit line is roughly horizontal.
 */
function unwrap(values) {
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

const wrap360 = (deg) => ((deg % 360) + 360) % 360

function fitElements(rows) {
  const T = rows.map((r) => r.T)

  const scalar = (key) => fitLine(T, rows.map((r) => r[key]))
  const angle = (values) => fitLine(T, unwrap(values))

  const a = scalar('a')
  const e = scalar('e')
  const i = scalar('i')
  const Omega = angle(rows.map((r) => r.Omega))
  const varpi = angle(rows.map((r) => r.Omega + r.w))
  const L = angle(rows.map((r) => r.M + r.w + r.Omega))

  return {
    a: a.intercept, aDot: a.slope,
    e: e.intercept, eDot: e.slope,
    i: i.intercept, iDot: i.slope,
    // Only the epoch values are wrapped. The *rates* must keep their full
    // magnitude — Ceres's LDot is 7,800°/century and wrapping it would stop
    // the body moving.
    L: wrap360(L.intercept), LDot: L.slope,
    varpi: wrap360(varpi.intercept), varpiDot: varpi.slope,
    Omega: wrap360(Omega.intercept), OmegaDot: Omega.slope,
  }
}

const fmt = (n, digits = 8) => n.toFixed(digits)

/** The six numbers and their rates, indented to `pad`. */
const renderElements = (e, pad) =>
  [
    `${pad}a: ${fmt(e.a)}, aDot: ${fmt(e.aDot)},`,
    `${pad}e: ${fmt(e.e)}, eDot: ${fmt(e.eDot)},`,
    `${pad}i: ${fmt(e.i)}, iDot: ${fmt(e.iDot)},`,
    `${pad}L: ${fmt(e.L)}, LDot: ${fmt(e.LDot)},`,
    `${pad}varpi: ${fmt(e.varpi)}, varpiDot: ${fmt(e.varpiDot)},`,
    `${pad}Omega: ${fmt(e.Omega)}, OmegaDot: ${fmt(e.OmegaDot)},`,
  ].join('\n')

function renderRows(results) {
  return results
    .map((result) => {
      const { id, name, samples, elements, segments, split, from = START, to = STOP } = result

      if (!segments) {
        return `  ${id}: {
    // ${name} — least-squares fit to ${samples} yearly Horizons samples, ${from} to ${to}
${renderElements(elements, '    ')}
  },`
      }

      /*
       * A body whose orbit is rewritten mid-window carries one element set per
       * era *and* the first era's values at the top level.
       *
       * The duplication is deliberate. `elementsFor` in `kepler.js` picks the
       * segment, and everything that goes through it is correct — but a dozen
       * places across the app and the checks read `body.elements.i` or
       * `.a` directly for questions where an era makes no difference
       * ("is this orbit retrograde?", "how wide is this system?"). Leaving the
       * top level empty would hand every one of them `undefined`, which is a
       * silent NaN rather than an error.
       */
      return `  ${id}: {
    // ${name} — ${segments.length} element sets, one per era, ${from} to ${to}.
    // The eras are cut at ${[].concat(split).join(', ')}.
    //
    // The top-level values are the *first* era's, for code that reads an
    // element directly rather than through \`elementsFor\`. Anything that cares
    // about the date gets the right set from \`segments\`.
    //
    // \`validFrom\`/\`validTo\` are the julian dates the fit was made over, and
    // they are not decoration: outside them these numbers are an extrapolation
    // of a chaotic orbit, and a search that ran past them invented five close
    // approaches in the nineteenth century that never happened.
    validFrom: ${julian(from).toFixed(1)}, validTo: ${julian(to).toFixed(1)},
${renderElements(elements, '    ')}

    segments: [
${segments
  .map(
    (segment, index) => `      {
        // ${segment.label} — ${segment.samples} samples
        until: ${segment.until === null ? 'null' : fmt(segment.until)},
${renderElements(segment.elements, '        ')}
      },`,
  )
  .join('\n')}
    ],
  },`
    })
    .join('\n\n')
}

function render(results) {
  const rows = renderRows(results)

  return `/**
 * Dwarf-planet orbital elements, fitted from JPL Horizons.
 *
 * GENERATED by \`scripts/fetch-dwarf-elements.mjs\` — do not hand-edit; rerun
 * \`npm run fetch:dwarfs\` instead. Generated ${new Date().toISOString().slice(0, 10)}.
 *
 * Same form as the planet table in \`orbitalElements.js\`: six elements at
 * J2000 plus six linear rates per Julian century, valid across 1800–2050.
 * JPL publishes no such fit for these four, so this one is built here — the
 * elements are sampled yearly from Horizons across the whole window and each
 * is least-squares fitted to a line. The perturbations average out; the
 * secular drift is what the rates carry.
 *
 * Accuracy is a few arcminutes, against the planet table's arcsecond. That is
 * the price of fitting rather than being given a fit, and it is far under a
 * pixel at these distances. It is emphatically not an ephemeris.
 *
 * Pluto is *not* in this file. It appears in the same JPL table as the
 * planets, with an official fit, so it lives in \`orbitalElements.js\` where
 * the better data is.
 */

/** @type {Record<string, import('./orbitalElements.js').Elements>} */
export const DWARF_ELEMENTS = {
${rows}
}
`
}

function renderAsteroids(results) {
  const rows = renderRows(results)

  return `/**
 * Orbital elements for the asteroids drawn as bodies, fitted from JPL Horizons.
 *
 * GENERATED by \`scripts/fetch-dwarf-elements.mjs\` — do not hand-edit; rerun
 * \`npm run fetch:dwarfs\` instead. Generated ${new Date().toISOString().slice(0, 10)}.
 *
 * The same treatment the dwarf planets get, and for the same reason: JPL
 * publishes a fitted table for the planets and Pluto and for nothing else, so
 * one is built here by sampling Horizons yearly across 1800–2050 and fitting
 * each element to a line.
 *
 * **These five are deliberately not the same data as \`asteroids.js\`.** That
 * file is a population of three and a half thousand osculating ellipses — right
 * about the belt's shape at any date, approximate about any one rock's phase.
 * A body with a name, a globe and a page about it cannot be approximate in that
 * way, so these are fitted. Ceres is the precedent and sits in both: a rock in
 * the belt data, a world in \`dwarfElements.js\`.
 */

/** @type {Record<string, import('./orbitalElements.js').Elements>} */
export const ASTEROID_BODY_ELEMENTS = {
${rows}
}
`
}

/** A calendar date to a julian day, for splitting a series. */
const julian = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86400000 + 2440587.5

async function main() {
  const results = []
  for (const body of BODIES) {
    process.stdout.write(`[dwarfs] fitting ${body.name}… `)
    const rows = await fetchSeries(body)

    if (!body.split) {
      const elements = fitElements(rows)
      results.push({ ...body, samples: rows.length, elements })
      console.log(
        `${rows.length} samples, a=${elements.a.toFixed(3)} AU, ` +
          `e=${elements.e.toFixed(4)}, i=${elements.i.toFixed(3)}°`,
      )
      continue
    }

    /*
     * One era per split, each fitted only to its own samples.
     *
     * A sample within a day of a split is dropped, which matters at the
     * encounter and is harmless at the others: during the flyby the osculating
     * elements are meaningless — they describe the instantaneous two-body orbit
     * *about the Sun* of an object that is at that moment being flung about by
     * the Earth — and including them would drag two fits toward a state that
     * lasted a few hours.
     *
     * The eras overlap by nothing and cover everything: each is valid `until`
     * the next begins, and the last has no end.
     */
    const cuts = (Array.isArray(body.split) ? body.split : [body.split]).map(julian)
    const bounds = [-Infinity, ...cuts, Infinity]

    const segments = []
    for (let n = 0; n + 1 < bounds.length; n++) {
      const from = bounds[n]
      const to = bounds[n + 1]
      const era = rows.filter(
        (r) => r.jd >= from + (n === 0 ? 0 : 1) && r.jd < to - (to === Infinity ? 0 : 1),
      )
      if (era.length < 12) {
        throw new Error(`${body.name}: only ${era.length} samples in era ${n + 1}`)
      }
      const day = (jd) => new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 10)
      segments.push({
        until: to === Infinity ? null : (to - J2000) / DAYS_PER_CENTURY,
        elements: fitElements(era),
        samples: era.length,
        label: `${n === 0 ? body.from ?? START : day(from)} to ${to === Infinity ? (body.to ?? STOP) : day(to)}`,
      })
    }

    results.push({ ...body, samples: rows.length, elements: segments[0].elements, segments })
    const encounter = cuts.indexOf(julian(Array.isArray(body.split) ? body.split.find((d) => d === '2029-04-13') ?? body.split[0] : body.split))
    console.log(
      `${rows.length} samples in ${segments.length} eras; across the encounter ` +
        `a ${segments[encounter].elements.a.toFixed(4)} → ${segments[encounter + 1].elements.a.toFixed(4)} AU, ` +
        `i ${segments[encounter].elements.i.toFixed(3)}° → ${segments[encounter + 1].elements.i.toFixed(3)}°`,
    )
  }

  const dwarfs = results.filter((r) => r.group === 'dwarf')
  const asteroids = results.filter((r) => r.group === 'asteroid')
  writeFileSync(OUT, render(dwarfs))
  writeFileSync(OUT_ASTEROIDS, renderAsteroids(asteroids))
  console.log(`[dwarfs] wrote ${OUT}`)
  console.log(`[dwarfs] wrote ${OUT_ASTEROIDS}`)
}

main().catch((error) => {
  console.error(`[dwarfs] ${error.message}`)
  process.exitCode = 1
})
