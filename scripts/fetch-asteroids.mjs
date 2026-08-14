#!/usr/bin/env node
/**
 * The asteroids, from JPL's Small-Body Database.
 *
 * Run with `npm run fetch:asteroids`. Writes `src/data/asteroids.js`; the app
 * makes no network requests, this does.
 *
 * This replaces a procedural cloud — 1,200 rocks scattered by a seeded random
 * between two hand-set radii. It looked like a belt and was not one: it had no
 * Kirkwood gaps, no families, no Trojans, and every rock was somewhere nothing
 * has ever been. It was also the last piece of invented geometry in the scene,
 * and the one thing the surface view had to switch off outright, because a
 * cloud sized to read from across the solar system puts boulder-sized specks
 * across the whole Martian sky.
 *
 * ## Who is here
 *
 * Everything brighter than absolute magnitude 12.2 with a semi-major axis
 * inside 6 AU: about 3,400 objects, which is roughly everything bigger than
 * twenty kilometres. The cut is by *brightness* rather than by diameter because
 * most asteroids have never had their size measured and almost all of them have
 * a magnitude — filtering on diameter would silently drop the ones nobody has
 * pointed a radar at.
 *
 * Beyond 6 AU is a different subject. The Centaurs and the Kuiper belt are
 * populations of their own, an order of magnitude further out, and drawing them
 * here would mean either a scene that reaches 50 AU by default or a belt whose
 * rocks are sub-pixel. They are a separate job.
 *
 * ## The elements, and what they can and cannot support
 *
 * These are **osculating** elements — the ellipse each body is on at one
 * instant — and this app propagates them as two-body motion. That is known to
 * be wrong over long spans: a single osculating set put Ceres 11° from its true
 * place in 1850, which is why the planets and the dwarf planets in this repo
 * use least-squares fits to a Horizons time series instead
 * (`fetch-dwarf-elements.mjs`).
 *
 * Fitting 3,400 bodies that way would be 3,400 Horizons queries, and it would
 * be answering a question nobody asked. **What this population is for is
 * structure**, and structure lives in `a`, `e` and `i`, which are secularly
 * stable — that is precisely why the Kirkwood gaps stay where they are for
 * millions of years. What drifts is *phase*, and the phase of an anonymous rock
 * is not something anyone can be wrong about.
 *
 * So: the belt's shape is right at every date, and any individual rock in it is
 * approximate away from the epoch. The big named asteroids are not in this file
 * at all — Vesta, Pallas and Hygiea are real bodies with fitted elements, for
 * the same reason Ceres is.
 *
 * ## Except the resonant families, which need their period taken from Jupiter
 *
 * A Trojan is a Trojan *because* it is locked 1:1 with Jupiter, sixty degrees
 * ahead or behind. Its osculating semi-major axis is a snapshot of a libration
 * about that resonance, and it differs from Jupiter's by up to 3% — which as a
 * two-body period is a 1.5% error per orbit, and over the app's 250-year window
 * carries a rock more than a hundred degrees out of its camp. The camps would
 * dissolve within a lifetime of the epoch and reassemble as a smear.
 *
 * The resonance is the physical fact and the osculating axis is the snapshot,
 * so the resonance wins: a Trojan's mean motion is set to Jupiter's, and a
 * Hilda's — locked 3:2 — to one and a half times it. Each keeps the offset from
 * Jupiter it actually has today, and keeps it forever. What is given up is the
 * libration itself, which is a slow wander of a few degrees inside a camp
 * sixty degrees wide.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ORBITAL_ELEMENTS } from '../src/data/orbitalElements.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src/data/asteroids.js')
const CACHE = join(ROOT, 'node_modules/.cache/sbdb')

const API = 'https://ssd-api.jpl.nasa.gov/sbdb_query.api'

/** Absolute magnitude cut: about 20 km across, and about 3,400 objects. */
const MAX_MAGNITUDE = 12.2

/** And the outer edge, in AU. Past Jupiter's Trojans is another population. */
const MAX_SEMI_MAJOR_AU = 6

/**
 * The ones drawn as worlds instead, and therefore kept out of the population.
 *
 * These six have a globe, a size, a rotation, a page and elements fitted to a
 * Horizons time series — see `asteroidBodyData.js`, and `dwarfPlanetData.js`
 * for Ceres. Leaving them in here as well would draw each of them twice, a few
 * degrees apart, since the two sets of elements disagree by exactly the amount
 * a fit improves on a snapshot. The rock would be beside the world, and the
 * rock would be the wrong one.
 */
const DRAWN_AS_BODIES = new Set(['1 Ceres', '2 Pallas', '3 Juno', '4 Vesta', '10 Hygiea', '16 Psyche'])

const J2000 = 2451545.0
const DAYS_PER_CENTURY = 36525

/**
 * Gauss's constant as degrees per day: the mean motion of a body at 1 AU.
 *
 * `n = k / a^1.5`, which is Kepler's third law with the Sun's mass folded in.
 * This is what turns a semi-major axis into a rate, and it is exact — the only
 * thing approximate about the phases below is that the axis itself drifts.
 */
const GAUSS_DEG_PER_DAY = 0.9856076686

const meanMotion = (a) => GAUSS_DEG_PER_DAY / a ** 1.5

/**
 * Which resonance a body is locked into, if any.
 *
 * Ratios of the body's period to Jupiter's. Selected on semi-major axis, which
 * is what a resonance actually constrains — the Trojans sit at Jupiter's own
 * axis and the Hildas at the 3:2, which is 0.7631 of it.
 *
 * The windows are deliberately tight. A rock at 4.5 AU is in neither family and
 * must be left alone; forcing its period would be inventing a resonance.
 */
function resonance(a) {
  const jupiter = ORBITAL_ELEMENTS.jupiter.a
  // 1:1 — the Trojans, in their two camps.
  if (Math.abs(a - jupiter) < 0.28) return 1
  // 3:2 — the Hildas, whose three-cornered figure is the other thing in the
  // belt that is a shape rather than a band.
  if (Math.abs(a - jupiter * (2 / 3) ** (2 / 3)) < 0.12) return 3 / 2
  return null
}

async function download() {
  mkdirSync(CACHE, { recursive: true })
  const file = join(CACHE, `belt-${MAX_MAGNITUDE}-${MAX_SEMI_MAJOR_AU}.json`)
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))

  const constraints = {
    AND: [`H|LT|${MAX_MAGNITUDE}`, `a|LT|${MAX_SEMI_MAJOR_AU}`],
  }
  const url =
    `${API}?fields=full_name,a,e,i,om,w,ma,epoch,H,diameter,class` +
    `&sb-kind=a&full-prec=true&sb-cdata=${encodeURIComponent(JSON.stringify(constraints))}`

  const response = await fetch(url)
  if (!response.ok) throw new Error(`SBDB: ${response.status}`)
  const json = await response.json()
  writeFileSync(file, JSON.stringify(json))
  return json
}

/** "     4 Vesta (A807 FA)" → "4 Vesta". */
function tidyName(full) {
  const trimmed = full.trim().replace(/\s*\([^)]*\)\s*$/, '')
  return trimmed
}

const round = (n, places) => +n.toFixed(places)

async function main() {
  const json = await download()
  const index = Object.fromEntries(json.fields.map((f, i) => [f, i]))
  const jupiterN = ORBITAL_ELEMENTS.jupiter.LDot / DAYS_PER_CENTURY

  const rows = []
  const report = { mba: 0, trojan: 0, hilda: 0, other: 0, dropped: 0, promoted: 0 }

  for (const row of json.data) {
    const a = Number(row[index.a])
    const e = Number(row[index.e])
    const i = Number(row[index.i])
    const Omega = Number(row[index.om])
    const omega = Number(row[index.w])
    const M = Number(row[index.ma])
    const epoch = Number(row[index.epoch])
    const H = Number(row[index.H])

    if (![a, e, i, Omega, omega, M, epoch].every(Number.isFinite) || a <= 0 || e >= 1) {
      report.dropped++
      continue
    }

    if (DRAWN_AS_BODIES.has(tidyName(row[index.full_name]))) {
      report.promoted++
      continue
    }

    /*
     * Longitude of perihelion and mean longitude, which is the form this app's
     * Kepler solver takes — the same form the planet table is published in.
     * `varpi = Omega + omega` and `L = varpi + M`, and both are angles in the
     * ecliptic rather than in the orbit plane.
     */
    const varpi = Omega + omega
    const L = varpi + M

    /*
     * The mean motion, and the one place a family gets special treatment.
     *
     * For most of the belt this is Kepler's third law from the body's own axis.
     * For a Trojan or a Hilda it is Jupiter's, scaled by the resonance — see
     * the note at the top of this file. Either way `L` at the epoch is left
     * exactly as observed, so the rock is where it is today and only its future
     * and past are being modelled.
     */
    const locked = resonance(a)
    const n = locked === null ? meanMotion(a) : jupiterN * locked

    // Wind the mean longitude back from the SBDB epoch to J2000, which is where
    // this app's element tables are anchored.
    const atJ2000 = L + n * (J2000 - epoch)

    const family = locked === 1 ? 'trojan' : locked !== null ? 'hilda' : 'belt'
    if (family === 'trojan') report.trojan++
    else if (family === 'hilda') report.hilda++
    else report.mba++

    rows.push({
      name: tidyName(row[index.full_name]),
      a: round(a, 6),
      e: round(e, 6),
      i: round(i, 4),
      L: round(((atJ2000 % 360) + 360) % 360, 4),
      varpi: round(((varpi % 360) + 360) % 360, 4),
      Omega: round(((Omega % 360) + 360) % 360, 4),
      LDot: round(n * DAYS_PER_CENTURY, 4),
      H: round(H, 2),
      family,
    })
  }

  // Brightest first, so the drawing can take a prefix and get the big ones.
  rows.sort((p, q) => p.H - q.H)

  /*
   * Packed as one flat array of numbers rather than a list of objects.
   *
   * 3,400 objects with eight fields each is 27,000 values; as JSON objects with
   * their keys repeated that is around 900 KB before compression, and it all
   * has to be parsed at boot. Flat, it is a third of that, and the drawing
   * reads it with a stride — which is the form an instanced mesh wants anyway.
   *
   * Names are kept separately and are the only strings, so nothing is paid for
   * them until something needs one.
   */
  const STRIDE = 8
  const packed = []
  for (const r of rows) packed.push(r.a, r.e, r.i, r.L, r.varpi, r.Omega, r.LDot, r.H)

  const families = rows.map((r) => (r.family === 'trojan' ? 1 : r.family === 'hilda' ? 2 : 0))

  writeFileSync(
    OUT,
    `/**
 * The asteroids — generated by \`scripts/fetch-asteroids.mjs\`.
 *
 * Do not edit by hand. Every element is JPL's, from the Small-Body Database:
 * everything brighter than absolute magnitude ${MAX_MAGNITUDE} inside ${MAX_SEMI_MAJOR_AU} AU, which is
 * ${rows.length} objects — ${report.mba} in the main belt, ${report.trojan} Jupiter Trojans and ${report.hilda} Hildas.
 *
 * **These are osculating elements propagated as two-body motion.** The belt's
 * *shape* is right at any date — the gaps, the families and the camps live in
 * \`a\`, \`e\` and \`i\`, which barely drift — while any individual rock's phase is
 * approximate away from the 2026 epoch. The big named asteroids are deliberately
 * not in here; they are real bodies with elements fitted to a Horizons series,
 * as Ceres is.
 *
 * The Trojans and Hildas carry Jupiter's mean motion rather than their own,
 * because that is what being in resonance means. See the fetch script.
 *
 * Packed flat, ${STRIDE} numbers per body:
 *
 *     a, e, i, L, varpi, Omega, LDot, H
 *
 * Angles in degrees, \`a\` in AU, \`L\` at J2000 and \`LDot\` per Julian century —
 * the same form as \`orbitalElements.js\`, minus the rates that are zero.
 */

/** How many numbers each body occupies in \`ASTEROIDS\`. */
export const ASTEROID_STRIDE = ${STRIDE}

/** ${rows.length} bodies, brightest first. */
export const ASTEROID_COUNT = ${rows.length}

/** 0 = main belt, 1 = Jupiter Trojan, 2 = Hilda. */
export const ASTEROID_FAMILY = new Uint8Array([${families.join(',')}])

/** @type {Float64Array} */
export const ASTEROIDS = new Float64Array([
${packed.join(',')}
])

/** Their names, in the same order. */
export const ASTEROID_NAMES = ${JSON.stringify(rows.map((r) => r.name))}

/** The elements of body \`index\`, in the form \`kepler.js\` takes. */
export function asteroidElements(index, out = {}) {
  const at = index * ASTEROID_STRIDE
  out.a = ASTEROIDS[at]
  out.aDot = 0
  out.e = ASTEROIDS[at + 1]
  out.eDot = 0
  out.i = ASTEROIDS[at + 2]
  out.iDot = 0
  out.L = ASTEROIDS[at + 3]
  out.LDot = ASTEROIDS[at + 6]
  out.varpi = ASTEROIDS[at + 4]
  out.varpiDot = 0
  out.Omega = ASTEROIDS[at + 5]
  out.OmegaDot = 0
  return out
}
`,
  )

  console.log(
    `[asteroids] ${rows.length} kept (${report.mba} belt, ${report.trojan} Trojan, ${report.hilda} Hilda), ` +
      `${report.promoted} drawn as bodies instead, ${report.dropped} dropped`,
  )
  console.log(`[asteroids] wrote ${OUT}`)
}

main()
