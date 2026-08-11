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

const J2000 = 2451545.0
const DAYS_PER_CENTURY = 36525

/**
 * The trailing `;` marks a small-body designation. Without it Horizons reads
 * `1` as Mercury barycentre, which would silently produce elements for
 * entirely the wrong object.
 */
const BODIES = [
  { id: 'ceres', command: '1;', name: 'Ceres' },
  { id: 'eris', command: '136199;', name: 'Eris' },
  { id: 'haumea', command: '136108;', name: 'Haumea' },
  { id: 'makemake', command: '136472;', name: 'Makemake' },
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

async function fetchSeries({ command, name }) {
  const params = new URLSearchParams({
    format: 'text',
    COMMAND: command,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'ELEMENTS',
    CENTER: '500@10',
    REF_PLANE: 'ECLIPTIC',
    OUT_UNITS: 'AU-D',
    START_TIME: `'${START}'`,
    STOP_TIME: `'${STOP}'`,
    STEP_SIZE: `'${STEP}'`,
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

function render(results) {
  const rows = results
    .map(({ id, name, samples, elements: e }) => `  ${id}: {
    // ${name} — least-squares fit to ${samples} yearly Horizons samples, ${START} to ${STOP}
    a: ${fmt(e.a)}, aDot: ${fmt(e.aDot)},
    e: ${fmt(e.e)}, eDot: ${fmt(e.eDot)},
    i: ${fmt(e.i)}, iDot: ${fmt(e.iDot)},
    L: ${fmt(e.L)}, LDot: ${fmt(e.LDot)},
    varpi: ${fmt(e.varpi)}, varpiDot: ${fmt(e.varpiDot)},
    Omega: ${fmt(e.Omega)}, OmegaDot: ${fmt(e.OmegaDot)},
  },`)
    .join('\n\n')

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

async function main() {
  const results = []
  for (const body of BODIES) {
    process.stdout.write(`[dwarfs] fitting ${body.name}… `)
    const rows = await fetchSeries(body)
    const elements = fitElements(rows)
    results.push({ ...body, samples: rows.length, elements })
    console.log(
      `${rows.length} samples, a=${elements.a.toFixed(3)} AU, ` +
        `e=${elements.e.toFixed(4)}, i=${elements.i.toFixed(3)}°`,
    )
  }

  writeFileSync(OUT, render(results))
  console.log(`[dwarfs] wrote ${OUT}`)
}

main().catch((error) => {
  console.error(`[dwarfs] ${error.message}`)
  process.exitCode = 1
})
