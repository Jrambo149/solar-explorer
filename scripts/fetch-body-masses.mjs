/**
 * Masses and equatorial radii for the dwarf planets and the named asteroids.
 *
 * Run with `npm run fetch:masses`. Writes `src/data/bodyMasses.js`.
 *
 * ## Why this is fetched rather than typed
 *
 * The dossier's "By the numbers" table is derived — surface gravity, escape
 * velocity, density — and the whole value of deriving it is that the numbers
 * cannot drift from the data. That argument collapses if the mass underneath
 * was transcribed from memory, which is exactly how a plausible wrong figure
 * gets in and stays: nothing about 9.4 × 10²⁰ kg looks wrong.
 *
 * So the masses come from JPL wherever JPL has one — the Small-Body Database
 * for the belt, Horizons for Pluto — and each carries the reference JPL cites,
 * which is written into the generated file and shown by the checks.
 *
 * ## Where JPL has nothing
 *
 * Three bodies here are measured but not by JPL: their masses come from the
 * orbits of their own moons, published in papers the SBDB does not carry a `GM`
 * for. Those are in `LITERATURE` below with a full citation each, and they are
 * the only hand-entered numbers in this file.
 *
 * And three are genuinely unmeasured — **Makemake**, whose moon S/2015 (136472)
 * 1 has never had its orbit solved; **Juno**, whose mass comes only from how it
 * perturbs other asteroids and is quoted with error bars of tens of percent;
 * and **Apophis**, which is 370 m of rock nobody has flown past. They are left
 * out on purpose. The dossier drops the rows that need a mass and keeps the
 * ones that need only an orbit — see `derivedFacts` — which is a better answer
 * than a number with a shrug attached.
 *
 * ## The referee
 *
 * A mass is only right in company: paired with the wrong radius it produces a
 * confident, wrong density and nothing complains. So where JPL publishes a
 * density independently, this script recomputes it from the mass and the radius
 * **the app actually draws** and refuses to write a file that disagrees by more
 * than 5%. That check is what caught Hygiea, where the SBDB still carries a
 * `GM` from a 1987 perturbation study that is 26% above the modern occultation
 * value and implies a density of 2.5 g/cm³ against a published 1.94.
 */

import { writeFileSync } from 'node:fs'
import { DWARF_PLANETS_RAW } from '../src/data/dwarfPlanetData.js'
import { ASTEROID_BODIES_RAW } from '../src/data/asteroidBodyData.js'

const OUT = new URL('../src/data/bodyMasses.js', import.meta.url)
const G = 6.6743e-11

/** SBDB lookups, by the designation the API answers to. */
const SBDB = {
  ceres: 'Ceres',
  vesta: 'Vesta',
  pallas: 'Pallas',
  psyche: 'Psyche',
}

/**
 * Measured, but not by JPL — every one of these comes from the orbit of a moon.
 *
 * The only hand-entered numbers in this file, and each one names the paper it
 * is from so it can be checked without trusting this comment.
 */
const LITERATURE = {
  eris: {
    massKg: 1.6466e22,
    equatorialRadiusKm: 1163,
    /* Sicardy's, because it is the density published *with* this radius — the
       occultation measured the size and the moon gave the mass, and quoting a
       density from a different pairing would make this check meaningless. */
    densityGcm3: 2.52,
    ref: 'Brown & Schaller (2007), Science 316, 1585 (mass, from Dysnomia’s orbit); Sicardy et al. (2011), Nature 478, 493 (size)',
  },
  haumea: {
    massKg: 4.006e21,
    /*
     * Not a rounded sphere by any stretch: 2,322 × 1,704 × 1,026 km, so the
     * equatorial semi-axis is more than twice the polar one and surface gravity
     * at the equator is a genuinely different number from the one a mean radius
     * gives. It is the equator that is nearly shedding material.
     *
     * These three axes are the ones consistent with the mass and density below:
     * a mean radius of 798 km falls out of them, which is what the app draws.
     */
    equatorialRadiusKm: 1161,
    densityGcm3: 1.885,
    ref: 'Ragozzine & Brown (2009), AJ 137, 4766; shape from Ortiz et al. (2017), Nature 550, 219',
  },
  hygiea: {
    massKg: 8.32e19,
    equatorialRadiusKm: 217,
    densityGcm3: 1.94,
    ref: 'Vernazza et al. (2020), Nature Astronomy 4, 136 — SPHERE imaging, replacing a 1987 SBDB value 26% higher',
  },
}

const RAW = [...DWARF_PLANETS_RAW, ...ASTEROID_BODIES_RAW]
const radiusOf = (id) => RAW.find((b) => b.id === id)?.radiusKm

const json = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} from ${url}`)
  return response.json()
}

/** GM in km³/s², the triaxial extent, and the density, from the SBDB. */
async function fromSbdb(id, designation) {
  const data = await json(
    `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(designation)}&phys-par=1`,
  )
  const par = Object.fromEntries((data.phys_par ?? []).map((p) => [p.name, p]))
  if (!par.GM) throw new Error(`${id}: the SBDB has no GM`)

  /* "569.24 x 554.48 x 452.66 km" — the longest axis is the equatorial one,
     and it is a full diameter, so halve it. */
  const axes = par.extent?.value?.split(/\s*x\s*/).map(Number).filter(Number.isFinite)
  return {
    massKg: (Number(par.GM.value) * 1e9) / G,
    equatorialRadiusKm: axes?.length === 3 ? axes[0] / 2 : radiusOf(id),
    densityGcm3: par.density ? Number(par.density.value) : null,
    ref: par.GM.ref,
  }
}

/** Pluto is a planet as far as Horizons is concerned, and prints a mass. */
async function plutoFromHorizons() {
  const url =
    "https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='999'" +
    "&OBJ_DATA='YES'&MAKE_EPHEM='NO'"
  const text = await (await fetch(url)).text()
  const mass = text.match(/Mass x10\^22 \(kg\)\s*=\s*([\d.]+)/)
  const density = text.match(/Density \(R=\d+ km\)\s*=\s*([\d.]+)/)
  if (!mass) throw new Error('pluto: Horizons printed no mass')
  return {
    massKg: Number(mass[1]) * 1e22,
    /* No measurable oblateness — New Horizons found none, which for a body
       turning once in 6.4 days is exactly what you would expect. */
    equatorialRadiusKm: radiusOf('pluto'),
    densityGcm3: density ? Number(density[1]) : null,
    ref: 'JPL Horizons, physical data updated 2021-06-07 (post-New Horizons)',
  }
}

async function main() {
  const out = {}
  const problems = []

  for (const [id, designation] of Object.entries(SBDB)) {
    out[id] = await fromSbdb(id, designation)
    console.log(`[masses] ${id}: SBDB`)
  }
  out.pluto = await plutoFromHorizons()
  console.log('[masses] pluto: Horizons')
  for (const [id, entry] of Object.entries(LITERATURE)) {
    out[id] = { ...entry }
    console.log(`[masses] ${id}: literature`)
  }

  /* The referee. A mass paired with the wrong radius makes a wrong density and
     says nothing about it, so anywhere a density is published independently,
     recompute it from the mass and the radius this app draws. */
  console.log('\n[masses] density check — computed against published')
  for (const [id, entry] of Object.entries(out)) {
    const meanKm = radiusOf(id)
    entry.radiusKm = meanKm
    const computed = entry.massKg / ((4 / 3) * Math.PI * (meanKm * 1000) ** 3) / 1000
    entry.computedDensityGcm3 = computed
    if (!entry.densityGcm3) {
      console.log(`  ${id.padEnd(8)} ${computed.toFixed(3)} g/cm³   (nothing published to check it)`)
      continue
    }
    const off = Math.abs(computed - entry.densityGcm3) / entry.densityGcm3
    console.log(
      `  ${id.padEnd(8)} ${computed.toFixed(3)} vs ${entry.densityGcm3.toFixed(3)} g/cm³` +
        `   ${(off * 100).toFixed(1)}% ${off > 0.05 ? '  ← TOO FAR' : ''}`,
    )
    if (off > 0.05) problems.push(`${id} is ${(off * 100).toFixed(1)}% off its published density`)
  }

  if (problems.length) throw new Error(`refusing to write:\n  ${problems.join('\n  ')}`)

  const rows = Object.entries(out)
    .map(
      ([id, e]) =>
        `  ${id}: {\n` +
        `    massKg: ${e.massKg.toPrecision(6)},\n` +
        `    equatorialRadiusKm: ${e.equatorialRadiusKm},\n` +
        `    density: ${e.computedDensityGcm3.toFixed(3)},\n` +
        `    source: ${JSON.stringify(e.ref)},\n` +
        `  },`,
    )
    .join('\n')

  writeFileSync(
    OUT,
    `/**\n` +
      ` * Masses and equatorial radii, generated by \`scripts/fetch-body-masses.mjs\`.\n` +
      ` * Do not edit by hand — run \`npm run fetch:masses\`. Generated ${new Date().toISOString().slice(0, 10)}.\n` +
      ` *\n` +
      ` * \`source\` is where the mass is from, and it is not decoration: four of these\n` +
      ` * are JPL's, three are from papers, and the difference is the reader's to see.\n` +
      ` * \`density\` is computed here from the mass and the mean radius the app draws,\n` +
      ` * and the script refuses to write this file if it disagrees with a published\n` +
      ` * density by more than 5%.\n` +
      ` *\n` +
      ` * Makemake, Juno and Apophis are absent on purpose: nobody has measured them.\n` +
      ` * See the script's header.\n` +
      ` */\n\nexport const BODY_MASSES = {\n${rows}\n}\n`,
  )
  console.log(`\n[masses] wrote ${OUT.pathname} — ${Object.keys(out).length} bodies`)
}

main().catch((error) => {
  console.error(`[masses] ${error.message}`)
  process.exitCode = 1
})
