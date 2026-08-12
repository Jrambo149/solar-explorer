#!/usr/bin/env node
/**
 * Bakes Horizons state vectors for every moon, as a fixture to check against.
 *
 * Run with `npm run fetch:moon-reference`. Writes
 * `scripts/fixtures/moon-reference.js`, which is committed so that
 * `verify-bodies` can hold the fitted elements to a real ephemeris **offline** —
 * the check runs on every `npm run verify`, and none of them may touch the
 * network.
 *
 * ## Why this fixture in particular
 *
 * `moonElements.js` is a least-squares fit, and the way a fit fails is not by
 * throwing: it produces a row of plausible-looking numbers that put the moon
 * somewhere else. Every failure found while building it looked exactly like a
 * success from the inside — an osculating mean motion that was quietly the
 * two-body one, a node sampled once per turn and pronounced stationary, a
 * bootstrap rate extrapolated onto the wrong revolution. None of those can be
 * caught by inspecting the generated file; all of them are obvious the moment
 * the position is compared with an ephemeris.
 *
 * Vectors rather than elements, deliberately. Elements can differ from JPL's by
 * convention — which pole, which node, which reference plane — and still
 * describe the same orbit; a position cannot. Comparing positions also
 * exercises the whole chain the app actually uses, including the body-equator
 * basis from `pole.js`, rather than only the numbers in the table.
 *
 * Seven dates spread across the app's window, because the errors that matter
 * here grow with distance from the epoch: a snapshot fit is perfect at J2000
 * and useless in 1850, which is precisely the failure this is here to catch.
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { MOON_ELEMENTS } from '../src/data/moonElements.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'scripts/fixtures/moon-reference.js')

/** Horizons ids, and the centre each moon's position is measured from. */
const TARGETS = {
  phobos: ['401', '500@499'],
  deimos: ['402', '500@499'],
  io: ['501', '500@599'],
  europa: ['502', '500@599'],
  ganymede: ['503', '500@599'],
  callisto: ['504', '500@599'],
  mimas: ['601', '500@699'],
  enceladus: ['602', '500@699'],
  tethys: ['603', '500@699'],
  dione: ['604', '500@699'],
  rhea: ['605', '500@699'],
  titan: ['606', '500@699'],
  iapetus: ['608', '500@699'],
  miranda: ['705', '500@799'],
  ariel: ['701', '500@799'],
  umbriel: ['702', '500@799'],
  titania: ['703', '500@799'],
  oberon: ['704', '500@799'],
  triton: ['801', '500@899'],
  charon: ['901', '500@999'],
  styx: ['905', '500@999'],
  nix: ['902', '500@999'],
  kerberos: ['904', '500@999'],
  hydra: ['903', '500@999'],
}

const DATES = [
  ['1850-01-01', 2396758.5],
  ['1900-01-01', 2415020.5],
  ['1970-01-01', 2440587.5],
  ['2000-01-01', 2451544.5],
  ['2010-01-01', 2455197.5],
  ['2026-01-01', 2461041.5],
  ['2049-01-01', 2469441.5],
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The ecliptic frame, not the body-equator one the elements are fitted in.
 *
 * Asking for the same frame the elements live in would let a wrong pole cancel
 * itself out on both sides. In the ecliptic the app has to apply its own body
 * basis to get here, so the comparison covers that too.
 */
async function vector(command, centre, jd) {
  const params = new URLSearchParams({
    format: 'text',
    COMMAND: command,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'VECTORS',
    CENTER: centre,
    VEC_TABLE: '1',
    REF_PLANE: 'ECLIPTIC',
    REF_SYSTEM: 'ICRF',
    OUT_UNITS: 'KM-S',
    TLIST: String(jd),
  })

  const res = await fetch(`https://ssd.jpl.nasa.gov/api/horizons.api?${params}`)
  if (!res.ok) throw new Error(`Horizons HTTP ${res.status}`)

  const text = await res.text()
  const block = text.split('$$SOE')[1]?.split('$$EOE')[0]
  if (!block) return null

  const m = block.match(
    /X\s*=\s*(-?[\d.E+-]+)\s*Y\s*=\s*(-?[\d.E+-]+)\s*Z\s*=\s*(-?[\d.E+-]+)/,
  )
  return m ? { x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) } : null
}

async function main() {
  const rows = []

  for (const id of Object.keys(MOON_ELEMENTS)) {
    const target = TARGETS[id]
    // Luna is not fetched here: it is not a fitted row at all, and it has its
    // own far sharper check against Horizons in `verify-bodies`.
    if (!target) continue

    process.stdout.write(`[moon-ref] ${id}… `)
    let got = 0
    for (const [date, jd] of DATES) {
      const v = await vector(target[0], target[1], jd)
      await sleep(120)
      // A moon whose ephemeris does not reach the date is simply skipped —
      // Triton's runs out before 1800 — rather than faked or defaulted.
      if (!v) continue
      rows.push({ body: id, date, jd, ...v })
      got++
    }
    console.log(`${got}/${DATES.length} dates`)
  }

  const body = rows
    .map(
      (r) =>
        `  { body: '${r.body}', date: '${r.date}', jd: ${r.jd}, ` +
        `x: ${r.x}, y: ${r.y}, z: ${r.z} },`,
    )
    .join('\n')

  writeFileSync(
    OUT,
    `/**
 * JPL Horizons state vectors for every moon, relative to its planet, in km.
 *
 * GENERATED by \`scripts/fetch-moon-reference.mjs\` — rerun
 * \`npm run fetch:moon-reference\` rather than editing. Generated ${new Date().toISOString().slice(0, 10)}.
 *
 * REF_PLANE='ECLIPTIC', REF_SYSTEM='ICRF', measured from each parent's body
 * centre (\`500@599\` for Jupiter, and so on) — never a barycentre. The Pluto
 * system is measured from Pluto itself, \`500@999\`.
 *
 * The ecliptic frame is deliberate: the elements are fitted in each planet's
 * *equatorial* frame, so checking them here forces the app's own body basis
 * through the comparison instead of letting a wrong pole cancel on both sides.
 */
export const MOON_REFERENCE = [
${body}
]
`,
  )

  console.log(`[moon-ref] wrote ${rows.length} rows to ${OUT}`)
}

main().catch((error) => {
  console.error(`[moon-ref] ${error.message}`)
  process.exitCode = 1
})
