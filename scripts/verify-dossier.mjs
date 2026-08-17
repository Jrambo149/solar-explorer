#!/usr/bin/env node
/**
 * Checks the dossier's derived numbers against published ones.
 *
 * Run with:
 *     npm run verify:dossier
 *
 * `planetFacts.js` works everything out from three inputs the app already
 * carries — a mass, a radius and an orbit — so the numbers cannot drift out of
 * step with the scene. What that does *not* prove is that they are right: a
 * sign error in the synodic period or a factor of two in escape velocity would
 * be perfectly consistent with the data and perfectly wrong.
 *
 * So the table below is NASA's planetary fact sheet, typed in here and nowhere
 * else. Nothing in `src/` has ever seen these values, and every one of them was
 * computed independently by the app from its own data. Agreement means the
 * derivation is sound; a mismatch means one of the two is wrong and both are
 * worth looking at.
 *
 * Tolerances are 1.5% except where noted, and each exception names the physics
 * it is leaving out rather than being slack for its own sake.
 *
 * This check has already earned its keep once. Surface gravity came out 4.6%
 * high for Jupiter and 7.2% high for Saturn, and the cause was a genuine
 * conflation: the app stores *volumetric mean* radii, which is right for
 * drawing a sphere and right for density, while every reference quotes surface
 * gravity and escape velocity at the **equator**. For Saturn those differ by
 * 2,036 km. Nothing in the app was inconsistent — it was consistently
 * answering a slightly different question than the one the labels implied.
 */

import { PLANETS } from '../src/data/planetData.js'
import { PLANET_IMAGES } from '../src/data/planetImages.js'
import {
  density,
  derivedFacts,
  escapeVelocity,
  lightDelaySeconds,
  moonOrbitShape,
  orbitShape,
  surfaceGravity,
  synodicDays,
  weightFraction,
} from '../src/ui/planetFacts.js'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}
const section = (title) => console.log(`\n${title}\n${'-'.repeat(title.length)}`)

const near = (got, want, tolerance = 0.015) => Math.abs(got - want) / Math.abs(want) <= tolerance

/**
 * NASA planetary fact sheet, nasa.gov/planetary/factsheet.
 * gravity m/s² · escape km/s · density kg/m³ · orbital speed km/s · synodic days
 */
const PUBLISHED = {
  mercury: { gravity: 3.7, escape: 4.3, density: 5429, speed: 47.36, synodic: 115.88 },
  venus: { gravity: 8.87, escape: 10.36, density: 5243, speed: 35.02, synodic: 583.92 },
  earth: { gravity: 9.807, escape: 11.186, density: 5514, speed: 29.78, synodic: null },
  mars: { gravity: 3.71, escape: 5.03, density: 3934, speed: 24.07, synodic: 779.94 },
  jupiter: { gravity: 24.79, escape: 59.5, density: 1326, speed: 13.06, synodic: 398.88 },
  saturn: { gravity: 10.44, escape: 35.5, density: 687, speed: 9.68, synodic: 378.09 },
  uranus: { gravity: 8.87, escape: 21.3, density: 1270, speed: 6.8, synodic: 369.66 },
  neptune: { gravity: 11.15, escape: 23.5, density: 1638, speed: 5.43, synodic: 367.49 },
}

const planet = (id) => PLANETS.find((p) => p.id === id)

section('Surface gravity, against the fact sheet')
for (const [id, want] of Object.entries(PUBLISHED)) {
  const p = planet(id)
  const got = surfaceGravity(p.massKg, p.equatorialRadiusKm)
  /*
   * 2.5%, which is what is left once the right radius is used. The remainder is
   * the centrifugal term: the fact sheet's equatorial gravity is reduced by the
   * body's own spin, which this Newtonian expression does not model. It matters
   * for exactly one planet — Saturn, whose equator moves at 9.87 km/s.
   */
  check(`${p.name}: ${got.toFixed(2)} m/s²`, near(got, want.gravity, 0.025), `published ${want.gravity}`)
}

section('Escape velocity')
for (const [id, want] of Object.entries(PUBLISHED)) {
  const p = planet(id)
  const got = escapeVelocity(p.massKg, p.equatorialRadiusKm)
  check(`${p.name}: ${got.toFixed(2)} km/s`, near(got, want.escape, 0.02), `published ${want.escape}`)
}

section('Mean density')
for (const [id, want] of Object.entries(PUBLISHED)) {
  const p = planet(id)
  const got = density(p.massKg, p.radiusKm)
  // The volumetric mean radius is exactly what density is defined against.
  check(`${p.name}: ${got.toFixed(0)} kg/m³`, near(got, want.density, 0.01), `published ${want.density}`)
}

section('Mean orbital speed')
for (const [id, want] of Object.entries(PUBLISHED)) {
  const got = orbitShape(id).meanSpeedKms
  check(`${planet(id).name}: ${got.toFixed(2)} km/s`, near(got, want.speed), `published ${want.speed}`)
}

section('Synodic period with Earth')
for (const [id, want] of Object.entries(PUBLISHED)) {
  const got = synodicDays(id)
  if (want.synodic === null) {
    check(`${planet(id).name} has none, and says so`, got === null)
    continue
  }
  check(`${planet(id).name}: ${got.toFixed(1)} days`, near(got, want.synodic), `published ${want.synodic}`)
}

section('Sunlight, and the two facts everyone knows')
check(
  'light reaches Earth in about 8 minutes 19 seconds',
  near(lightDelaySeconds(1), 499, 0.01),
  `${lightDelaySeconds(orbitShape('earth').semiMajorAu).toFixed(1)} s at Earth’s own semi-major axis`,
)
check(
  'a person weighs 38% of their Earth weight on Mars',
  near(weightFraction(planet('mars').massKg, planet('mars').equatorialRadiusKm), 0.378, 0.02),
)
check(
  'Saturn is less dense than water',
  density(planet('saturn').massKg, planet('saturn').radiusKm) < 1000,
  `${density(planet('saturn').massKg, planet('saturn').radiusKm).toFixed(0)} kg/m³`,
)
check(
  'Neptune gets about a thousandth of Earth’s sunlight',
  near(1 / orbitShape('neptune').semiMajorAu ** 2, 0.00111, 0.05),
)

section('Every planet gets a full set')
for (const p of PLANETS) {
  const rows = derivedFacts(p)
  const complete = rows && rows.every((r) => r.value && !/NaN|undefined|Infinity/.test(r.value))
  check(`${p.name}: ${rows?.length ?? 0} rows, all readable`, complete)
}

/*
 * And the bodies that have no business with this table say so.
 *
 * `derivedFacts` returns null without a mass, a radius and an orbit, which is
 * every moon, comet and spacecraft in the app. The dossier then draws the page
 * it always drew rather than a section full of blanks — so this is checking a
 * *refusal*, which is the half that would fail silently.
 */
const { BODIES } = await import('../src/data/bodies.js')
const wrongly = BODIES.filter(
  (b) => b.kind !== 'planet' && b.kind !== 'moon' && derivedFacts(b) !== null,
)
check(
  'nothing but a planet or a moon gets a “By the numbers” table',
  wrongly.length === 0,
  wrongly.length ? wrongly.map((b) => b.name).join(', ') : `${BODIES.length} bodies checked`,
)

/*
 * The prose and the facts must not repeat each other.
 *
 * Adding a "story" beside a list of facts written years earlier produced
 * twenty-six restatements and one outright contradiction: a fact claimed the
 * Great Red Spot had been observed "for over 350 years" while the paragraph
 * under it said "at least 190 years and possibly since the 1660s". Both are
 * defensible readings of the same disputed history, and having both on one page
 * is indefensible.
 *
 * Word overlap will not catch a contradiction — only a person reading can — but
 * it catches the restatements, and it was the restatements that hid the
 * contradiction in the noise.
 */
section('The writing does not repeat itself')

const words = (text) =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3),
  )

for (const p of PLANETS) {
  const pieces = [...p.facts, ...(p.story ?? [])]
  const clashes = []
  for (let i = 0; i < p.facts.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = words(p.facts[i])
      const b = words(pieces[j])
      const shared = [...b].filter((w) => a.has(w)).length
      if (shared / Math.min(a.size, b.size) > 0.55) clashes.push(p.facts[i].slice(0, 44))
    }
  }
  check(`${p.name}: ${p.facts.length} facts, ${p.story?.length ?? 0} paragraphs, none restated`,
    clashes.length === 0, clashes.length ? clashes.join(' / ') : undefined)
}

section('The moons, against published values')

/*
 * A second table nothing in src/ has seen. Orbital periods and distances are
 * the ones every reference quotes; gravity and escape velocity are computed
 * from the mean radius, which for bodies this small and this slow is the only
 * radius there is.
 */
const MOONS = {
  luna: { gravity: 1.62, escape: 2.38, density: 3344, days: 27.322, km: 384400 },
  io: { gravity: 1.796, escape: 2.558, density: 3528, days: 1.769, km: 421800 },
  europa: { gravity: 1.314, escape: 2.025, density: 3013, days: 3.551, km: 671100 },
  ganymede: { gravity: 1.428, escape: 2.741, density: 1936, days: 7.155, km: 1070400 },
  callisto: { gravity: 1.235, escape: 2.44, density: 1834, days: 16.689, km: 1882700 },
  titan: { gravity: 1.352, escape: 2.639, density: 1881, days: 15.945, km: 1221870 },
  enceladus: { gravity: 0.113, escape: 0.239, density: 1609, days: 1.370, km: 238040 },
  mimas: { gravity: 0.064, escape: 0.159, density: 1150, days: 0.942, km: 185540 },
  triton: { gravity: 0.779, escape: 1.455, density: 2059, days: 5.877, km: 354759 },
  phobos: { gravity: 0.0057, escape: 0.0114, density: 1876, days: 0.319, km: 9376 },
  charon: { gravity: 0.288, escape: 0.58, density: 1702, days: 6.387, km: 19591 },
}

const { BODIES: ALL } = await import('../src/data/bodies.js')
const moon = (id) => ALL.find((b) => b.id === id)

for (const [id, want] of Object.entries(MOONS)) {
  const m = moon(id)
  const shape = moonOrbitShape(id)
  const g = surfaceGravity(m.massKg, m.radiusKm)
  const v = escapeVelocity(m.massKg, m.radiusKm)
  const rho = density(m.massKg, m.radiusKm)
  const ok =
    near(g, want.gravity, 0.03) &&
    near(v, want.escape, 0.03) &&
    near(rho, want.density, 0.06) &&
    near(shape.periodDays, want.days, 0.01) &&
    near(shape.radiusKm, want.km, 0.01)
  check(
    `${m.name}: ${g.toFixed(3)} m/s², ${v.toFixed(3)} km/s, ${shape.periodDays.toFixed(3)} d, ` +
      `${Math.round(shape.radiusKm).toLocaleString('en-US')} km`,
    ok,
    `published ${want.gravity} / ${want.escape} / ${want.days} / ${want.km.toLocaleString('en-US')}`,
  )
}

/*
 * And Pluto's four small moons get nothing, deliberately.
 *
 * Their masses are inferred from assumed densities and a size measured from a
 * handful of pixels — known to within a factor of a few, not weighed. A table
 * quoting their surface gravity to three decimals would read as a measurement.
 */
for (const id of ['styx', 'nix', 'kerberos', 'hydra']) {
  check(`${moon(id).name} has no table, because nobody has weighed it`, derivedFacts(moon(id)) === null)
}

section('The photographs')
let shots = 0
for (const p of PLANETS) {
  const gallery = PLANET_IMAGES[p.id] ?? []
  shots += gallery.length
  const onDisk = gallery.every((s) => existsSync(join(ROOT, 'public', 'images', 'planets', s.file)))
  const credited = gallery.every((s) => s.credit && /NASA/i.test(s.credit) && s.title && s.why)
  /*
   * Every picture links to its own source, and no caption carries a bare URL.
   *
   * NASA's descriptions routinely end with a photojournal link, which read as a
   * wall of raw URL in the middle of a paragraph — redundant, since the picture
   * is already a link to exactly that.
   */
  const linked = gallery.every(
    (s) => /^https:\/\/images\.nasa\.gov\/details\//.test(s.source ?? '') &&
      !/https?:\/\//.test(s.description ?? ''),
  )
  check(`${p.name}: every picture links to its source, no URLs in the prose`, linked)
  check(`${p.name}: ${gallery.length} images, all present and credited`, gallery.length >= 3 && onDisk && credited)
}
check(`${shots} photographs in total`, shots === PLANETS.length * 3)

/*
 * Nothing in the shipped app may reach for them over the network.
 *
 * The whole reason these are baked. A stray absolute URL in the generated file
 * would work perfectly in development and leave the gallery blank for anyone
 * offline, which is exactly the failure this project's no-runtime-fetch rule
 * exists to prevent.
 */
const remote = Object.values(PLANET_IMAGES)
  .flat()
  .filter((s) => /^https?:/i.test(s.file))
check('no image is loaded from the network', remote.length === 0)

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
